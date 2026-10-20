"""Run SWMM through PySWMM and collect results.

The SWMM engine keeps global state, so only one simulation can run per
process at a time; `_ENGINE_LOCK` serialises runs inside this process.
Parallel evaluation (used by the optimizer) uses separate worker processes.
"""

from __future__ import annotations

import hashlib
import re
import tempfile
import threading
import time
from pathlib import Path

import pyswmm
from pyswmm import LidGroups, Links, Nodes, Output, Simulation, Subcatchments, SystemStats
from swmm.toolkit.shared_enum import LinkAttribute, NodeAttribute, SubcatchAttribute, SystemAttribute

from runofflab import __version__
from runofflab.engine.inp_builder import REPORT_STEP_MIN, SIM_START, ModelPlan
from runofflab.models.results import (
    EngineInfo,
    LidResult,
    NodeResult,
    SimulationResult,
    SurfaceResult,
    TimeSeries,
    WaterBalance,
)

_ENGINE_LOCK = threading.Lock()
_SWMM_VERSION: str | None = None


class SimulationError(RuntimeError):
    """SWMM could not run the model. `details` holds the engine's own messages."""

    def __init__(self, message: str, details: list[str] | None = None):
        super().__init__(message)
        self.details = details or []


def engine_info() -> EngineInfo:
    global _SWMM_VERSION
    if _SWMM_VERSION is None:
        from swmm.toolkit import solver
        v = str(solver.swmm_get_version())  # e.g. 52004 -> 5.2.4
        _SWMM_VERSION = f"{v[0]}.{v[1]}.{int(v[2:])}" if len(v) == 5 else v
    return EngineInfo(swmm_version=_SWMM_VERSION, pyswmm_version=pyswmm.__version__,
                      runofflab_version=__version__)


def _report_lines(rpt: Path, kind: str) -> list[str]:
    if not rpt.exists():
        return []
    text = rpt.read_text(errors="replace")
    return [ln.strip() for ln in text.splitlines() if re.match(rf"\s*{kind}\b", ln)]


def _r(v: float, nd: int = 6) -> float:
    return round(float(v), nd)


def run_inp(inp_text: str, plan: ModelPlan, label: str) -> SimulationResult:
    """Execute an INP model and return parsed results, or raise SimulationError."""
    sha = hashlib.sha256(inp_text.encode()).hexdigest()
    with _ENGINE_LOCK, tempfile.TemporaryDirectory(prefix="runofflab-") as tmp:
        inp, rpt, out = Path(tmp, "model.inp"), Path(tmp, "model.rpt"), Path(tmp, "model.out")
        inp.write_text(inp_text)
        t0 = time.perf_counter()
        try:
            with Simulation(str(inp), str(rpt), str(out)) as sim:
                for _ in sim:
                    pass
                stats = _collect_stats(sim, plan)
                sim.report()
        except Exception as exc:  # pyswmm raises several exception types
            errors = _report_lines(rpt, "ERROR")
            raise SimulationError(f"SWMM failed: {errors[0] if errors else exc}", errors) from exc
        elapsed = time.perf_counter() - t0
        errors = _report_lines(rpt, "ERROR")
        if errors:
            raise SimulationError(f"SWMM reported an error: {errors[0]}", errors)
        series = _collect_series(out, plan, stats["node_ids"], stats["pipe_ids"])
        warnings = _report_lines(rpt, "WARNING")

    return SimulationResult(
        label=label, engine=engine_info(), inp_sha256=sha, elapsed_s=round(elapsed, 3),
        series=series, warnings=warnings,
        **{k: v for k, v in stats.items() if k not in ("node_ids", "pipe_ids")},
    )


def _collect_stats(sim: Simulation, plan: ModelPlan) -> dict:
    system = SystemStats(sim)
    ro, routing = system.runoff_stats, system.routing_stats
    total_area = sum(plan.subcatchment_area_m2.values())
    to_m3 = total_area / 1000.0  # mm over the site -> m³

    balance = WaterBalance(
        rainfall_mm=_r(ro["rainfall"], 3), infiltration_mm=_r(ro["infiltration"], 3),
        evaporation_mm=_r(ro["evaporation"], 3), runoff_mm=_r(ro["runoff"], 3),
        storage_change_mm=_r(ro["final_storage"] - ro["init_storage"], 3),
        continuity_error_pct=_r(ro["routing_error"], 4),
        rainfall_m3=_r(ro["rainfall"] * to_m3, 2), infiltration_m3=_r(ro["infiltration"] * to_m3, 2),
        runoff_m3=_r(ro["runoff"] * to_m3, 2),
    )

    surfaces = []
    for s in Subcatchments(sim):
        st = s.statistics
        surfaces.append(SurfaceResult(
            surface_id=s.subcatchmentid, modelled_area_m2=_r(s.area * 10_000, 2),
            runoff_m3=_r(st["runoff"], 3), infiltration_m3=_r(st["infiltration"], 3),
            peak_runoff_m3s=_r(st["peak_runoff_rate"])))

    lids = []
    groups = LidGroups(sim)
    for placement in plan.lids:
        unit = next(u for u in groups[placement.subcatchment] if u.lid_control == placement.control)
        wb = unit.water_balance
        k = placement.area_m2 / 1000.0
        lids.append(LidResult(
            intervention_id=placement.intervention_id, area_m2=_r(placement.area_m2, 2),
            inflow_mm=_r(wb.inflow, 3), infiltration_mm=_r(wb.infiltration, 3),
            surface_outflow_mm=_r(wb.surface_flow, 3), final_storage_mm=_r(wb.final_volume, 3),
            inflow_m3=_r(wb.inflow * k, 3), infiltration_m3=_r(wb.infiltration * k, 3),
            surface_outflow_m3=_r(wb.surface_flow * k, 3)))

    nodes, node_ids, peak_outfall = [], [], 0.0
    for n in Nodes(sim):
        node_ids.append(n.nodeid)
        if n.is_outfall():
            peak_outfall = n.outfall_statistics["peak_flowrate"]
            continue
        st = n.statistics
        nodes.append(NodeResult(
            node_id=n.nodeid, peak_inflow_m3s=_r(st["peak_total_inflow"]),
            max_depth_m=_r(st["max_depth"], 4), flooding_m3=_r(st["flooding_volume"], 3),
            flooding_hours=_r(st["flooding_duration"], 3),
            surcharge_hours=_r(st["surcharge_duration"], 3)))

    pipe_ids = [link.linkid for link in Links(sim)]

    return dict(
        balance=balance, surfaces=surfaces, lids=lids, nodes=nodes,
        peak_outfall_m3s=_r(peak_outfall), outfall_volume_m3=_r(routing["outflow"], 3),
        flooding_volume_m3=_r(routing["flooding"], 3),
        routing_continuity_error_pct=_r(routing["routing_error"], 4),
        node_ids=node_ids, pipe_ids=pipe_ids,
    )


def _values(series: dict) -> list[float]:
    return [_r(v, 6) for v in series.values()]


def _collect_series(out_path: Path, plan: ModelPlan, node_ids: list[str],
                    pipe_ids: list[str]) -> TimeSeries:
    with Output(str(out_path)) as out:
        rain = out.system_series(SystemAttribute.RAINFALL)
        minutes = [round((t - SIM_START).total_seconds() / 60) for t in rain]
        return TimeSeries(
            step_minutes=REPORT_STEP_MIN, minutes=minutes,
            rainfall_mm_hr=_values(rain),
            runoff_m3s=_values(out.system_series(SystemAttribute.RUNOFF_FLOW)),
            outfall_m3s=_values(out.system_series(SystemAttribute.OUTFALL_FLOWS)),
            flooding_m3s=_values(out.system_series(SystemAttribute.FLOOD_LOSSES)),
            surface_runoff_m3s={s: _values(out.subcatch_series(s, SubcatchAttribute.RUNOFF_RATE))
                                for s in plan.subcatchment_area_m2},
            node_flooding_m3s={n: _values(out.node_series(n, NodeAttribute.FLOODING_LOSSES))
                               for n in node_ids},
            node_depth_m={n: _values(out.node_series(n, NodeAttribute.INVERT_DEPTH))
                          for n in node_ids},
            pipe_flow_m3s={p: _values(out.link_series(p, LinkAttribute.FLOW_RATE)) for p in pipe_ids},
            pipe_capacity={p: _values(out.link_series(p, LinkAttribute.CAPACITY)) for p in pipe_ids},
        )
