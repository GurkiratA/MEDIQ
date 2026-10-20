"""Translate a RunoffLab site + design + scenario into a SWMM 5.2 input file.

Modelling approach (see docs/METHODOLOGY.md for the full write-up):

* Each site surface becomes one SWMM subcatchment draining to its inlet.
* Permeable pavement is an LID unit inside the subcatchment it replaces.
* A rain garden is an LID unit placed in the subcatchment of the impervious
  surface it captures from (SWMM's recommended way to route runoff from
  impervious area into an LID). Its footprint area is moved from the lawn it
  physically occupies into that subcatchment, so total site area is conserved.
* Each intervention gets its own LID control so its geometry and water balance
  are tracked individually.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime

from runofflab.engine import lid_params as P
from runofflab.hydrology.rainfall import hyetograph
from runofflab.hydrology.soils import SOILS
from runofflab.hydrology.surfaces import PCT_ZERO_STORAGE, SURFACE_DEFAULTS
from runofflab.models.project import (
    Design,
    PermeablePavement,
    RainGarden,
    Scenario,
    Site,
)

RAIN_STEP_MIN = 5
REPORT_STEP_MIN = 5
GAGE = "GAGE1"
SIM_START = datetime(2024, 1, 1)  # arbitrary; storms are synthetic


@dataclass
class LidPlacement:
    intervention_id: str
    control: str
    subcatchment: str
    area_m2: float


@dataclass
class ModelPlan:
    """Book-keeping that lets the result parser map SWMM back to the site."""
    subcatchment_area_m2: dict[str, float] = field(default_factory=dict)
    lids: list[LidPlacement] = field(default_factory=list)


def _hhmm(minutes: int) -> str:
    return f"{minutes // 60}:{minutes % 60:02d}"


def _fmt(v: float) -> str:
    return f"{v:.6g}"


def build_inp(site: Site, design: Design | None, scenario: Scenario,
              host_surface: dict[str, str] | None = None) -> tuple[str, ModelPlan]:
    """Return (inp_text, plan). `host_surface` comes from validation.check_design."""
    design = design or Design(id="baseline", name="Baseline")
    host_surface = host_surface or {}
    soil = SOILS[site.soil]
    ksat = soil.ksat_mm_per_hr * scenario.infiltration_factor
    plan = ModelPlan()

    area = {s.id: s.area_m2 for s in site.surfaces}
    lid_area_in: dict[str, float] = {s.id: 0.0 for s in site.surfaces}
    paved_in: dict[str, float] = {s.id: 0.0 for s in site.surfaces}
    controls: list[str] = []
    usages: list[tuple[str, str, float, float, float]] = []  # sub, ctrl, area, width, captured

    for item in design.interventions:
        ctrl = f"LID_{item.id}"
        a = item.rect.area
        width = max(item.rect.width, item.rect.height)
        if isinstance(item, RainGarden):
            host = host_surface[item.id]
            sub = item.contributing_surface_id
            area[host] -= a
            area[sub] += a
            captured = item.captured_area_m2
            controls += [
                f"{ctrl}  RG",
                f"{ctrl}  SURFACE  {_fmt(item.ponding_depth_mm)}  {P.RG_VEGETATION_FRACTION}  "
                f"{P.RG_SURFACE_ROUGHNESS}  {P.RG_SURFACE_SLOPE_PCT}  5",
                f"{ctrl}  SOIL  {_fmt(item.soil_depth_mm)}  {P.RG_SOIL_POROSITY}  "
                f"{P.RG_SOIL_FIELD_CAPACITY}  {P.RG_SOIL_WILTING_POINT}  "
                f"{_fmt(P.RG_SOIL_KSAT_MM_HR)}  {P.RG_SOIL_CONDUCTIVITY_SLOPE}  {P.RG_SOIL_SUCTION_MM}",
                f"{ctrl}  STORAGE  {_fmt(item.gravel_depth_mm)}  {P.RG_GRAVEL_VOID_RATIO}  "
                f"{_fmt(ksat)}  0",
            ]
        else:
            assert isinstance(item, PermeablePavement)
            sub = host_surface[item.id]
            paved_in[sub] += a
            captured = item.runon_area_m2
            slope = site.surface(sub).slope_pct
            controls += [
                f"{ctrl}  PP",
                f"{ctrl}  SURFACE  0  0  {P.PP_SURFACE_ROUGHNESS}  {_fmt(slope)}  0",
                f"{ctrl}  PAVEMENT  {_fmt(item.pavement_thickness_mm)}  {P.PP_PAVEMENT_VOID_RATIO}  "
                f"0  {_fmt(P.PP_PAVEMENT_PERMEABILITY_MM_HR)}  0",
                f"{ctrl}  STORAGE  {_fmt(item.storage_depth_mm)}  {P.PP_STORAGE_VOID_RATIO}  "
                f"{_fmt(ksat)}  0",
                f"{ctrl}  DRAIN  0  0.5  0  6",
            ]
        lid_area_in[sub] += a
        usages.append((sub, ctrl, a, width, captured))
        plan.lids.append(LidPlacement(item.id, ctrl, sub, a))

    lines: list[str] = []
    add = lines.append
    storm_min = round(scenario.storm_hours * 60)
    end_min = storm_min + round(scenario.drain_hours * 60)

    add("[TITLE]")
    add(f"RunoffLab | {site.name} | {design.name} | {scenario.name}")
    add("")
    add("[OPTIONS]")
    for k, v in [
        ("FLOW_UNITS", "CMS"), ("INFILTRATION", "GREEN_AMPT"), ("FLOW_ROUTING", "DYNWAVE"),
        ("LINK_OFFSETS", "DEPTH"), ("ALLOW_PONDING", "NO"),
        ("START_DATE", "01/01/2024"), ("START_TIME", "00:00:00"),
        ("REPORT_START_DATE", "01/01/2024"), ("REPORT_START_TIME", "00:00:00"),
        ("END_DATE", f"01/{1 + end_min // 1440:02d}/2024"),
        ("END_TIME", f"{(end_min % 1440) // 60:02d}:{end_min % 60:02d}:00"),
        ("WET_STEP", "00:01:00"), ("DRY_STEP", "00:05:00"),
        ("ROUTING_STEP", "5"), ("VARIABLE_STEP", "0.75"),
        ("REPORT_STEP", f"00:{REPORT_STEP_MIN:02d}:00"),
    ]:
        add(f"{k:<20} {v}")
    add("")
    add("[RAINGAGES]")
    add(f"{GAGE}  INTENSITY  {_hhmm(RAIN_STEP_MIN)}  1.0  TIMESERIES  STORM")
    add("")

    add("[SUBCATCHMENTS]")
    infil, subareas = [], []
    for s in site.surfaces:
        a = area[s.id]
        if a < 1.0:  # footprint fully consumed by rain gardens
            continue
        d = SURFACE_DEFAULTS[s.kind]
        # Sheet-flow width: area divided by flow length, taking the shorter
        # side of the rectangle as the overland flow length.
        flow_len = min(s.rect.width, s.rect.height)
        add(f"{s.id}  {GAGE}  {s.drains_to}  {_fmt(a / 10_000)}  {_fmt(d.impervious_pct)}  "
            f"{_fmt(a / flow_len)}  {_fmt(s.slope_pct)}  0")
        plan.subcatchment_area_m2[s.id] = a
        subareas.append(f"{s.id}  {d.n_overland}  {d.n_overland}  {d.depression_storage_mm}  "
                        f"{d.depression_storage_mm}  {PCT_ZERO_STORAGE}  OUTLET")
        infil.append(f"{s.id}  {soil.suction_head_mm}  {_fmt(ksat)}  {soil.initial_moisture_deficit}")
    add("")
    add("[SUBAREAS]")
    lines += subareas
    add("")
    add("[INFILTRATION]")
    lines += infil
    add("")

    if controls:
        add("[LID_CONTROLS]")
        lines += controls
        add("")
        add("[LID_USAGE]")
        for sub, ctrl, a, width, captured in usages:
            # Impervious area in `sub` not itself covered by LIDs (all host
            # surfaces for routing are 100 % impervious).
            imperv = area[sub] - lid_area_in[sub]
            from_imp = 0.0 if imperv <= 0 else min(100.0, 100.0 * captured / imperv)
            add(f"{sub}  {ctrl}  1  {_fmt(a)}  {_fmt(width)}  {P.INITIAL_SATURATION_PCT}  "
                f"{_fmt(from_imp)}  0")
        add("")

    add("[JUNCTIONS]")
    for i in site.inlets:
        add(f"{i.id}  {_fmt(i.invert_elev_m)}  {_fmt(i.rim_elev_m - i.invert_elev_m)}  0  0  0")
    add("")
    add("[OUTFALLS]")
    add(f"{site.outfall.id}  {_fmt(site.outfall.invert_elev_m)}  FREE  NO")
    add("")
    add("[CONDUITS]")
    for p in site.pipes:
        add(f"{p.id}  {p.from_node}  {p.to_node}  {_fmt(p.length_m)}  {p.roughness_n}  0  0  0  0")
    add("")
    add("[XSECTIONS]")
    for p in site.pipes:
        add(f"{p.id}  CIRCULAR  {_fmt(p.diameter_m)}  0  0  0  1")
    add("")

    add("[TIMESERIES]")
    rain = hyetograph(scenario.pattern, scenario.depth_mm, scenario.storm_hours,
                      RAIN_STEP_MIN, scenario.peak_position)
    for k, v in enumerate(rain):
        add(f"STORM  {_hhmm(k * RAIN_STEP_MIN)}  {v:.5f}")
    add(f"STORM  {_hhmm(len(rain) * RAIN_STEP_MIN)}  0")
    add("")
    add("[REPORT]")
    add("SUBCATCHMENTS ALL")
    add("NODES ALL")
    add("LINKS ALL")
    add("")
    add("[COORDINATES]")
    for i in site.inlets:
        add(f"{i.id}  {_fmt(i.x)}  {_fmt(-i.y)}")
    add(f"{site.outfall.id}  {_fmt(site.outfall.x)}  {_fmt(-site.outfall.y)}")
    add("")
    return "\n".join(lines), plan
