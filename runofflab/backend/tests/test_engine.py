"""Tests that actually execute EPA SWMM."""

import pytest

from runofflab.engine.inp_builder import build_inp
from runofflab.engine.runner import SimulationError, run_inp
from runofflab.engine.simulate import InvalidDesignError, simulate
from runofflab.hydrology.rainfall import StormPattern
from runofflab.models.project import Inlet, Outfall, Pipe, Rect, Scenario, Site, Surface

from conftest import with_items


def single_roof_site() -> Site:
    return Site(
        id="t", name="Test roof", width_m=100, height_m=100, soil="loam",
        surfaces=[Surface(id="R", name="Roof", kind="roof", rect=Rect(x=0, y=0, width=100, height=100),
                          drains_to="J")],
        inlets=[Inlet(id="J", name="J", x=50, y=50, rim_elev_m=12, invert_elev_m=10)],
        outfall=Outfall(id="O", x=100, y=100, invert_elev_m=9),
        pipes=[Pipe(id="C", from_node="J", to_node="O", length_m=100, diameter_m=1.0)],
    )


def test_engine_matches_hand_calculation_for_impervious_roof():
    """1 ha roof, 30 mm uniform storm. Runoff = rain − depression storage.

    Depression storage is 1.5 mm on the 75 % of impervious area that has any
    (SWMM's PctZero = 25 %), so the expected loss is 1.125 mm.
    """
    scenario = Scenario(pattern=StormPattern.UNIFORM, depth_mm=30, duration_hr=2, drain_hours=4)
    inp, plan = build_inp(single_roof_site(), None, scenario)
    r = run_inp(inp, plan, "baseline")
    assert r.balance.rainfall_mm == pytest.approx(30, rel=1e-4)
    assert r.balance.runoff_mm == pytest.approx(30 - 1.125, abs=0.05)
    assert r.balance.runoff_m3 == pytest.approx((30 - 1.125) * 10, abs=0.5)  # 1 ha: 1 mm = 10 m³
    assert r.outfall_volume_m3 == pytest.approx(r.balance.runoff_m3, rel=0.01)
    # Steady 15 mm/h on 1 ha → 0.0417 m³/s at equilibrium.
    assert r.peak_outfall_m3s == pytest.approx(15 / 1000 / 3600 * 10_000, rel=0.03)


def test_sample_baseline_vs_design(project, design):
    base = simulate(project)
    prop = simulate(project, design)
    for r in (base, prop):
        b = r.balance
        assert abs(b.continuity_error_pct) < 1 and abs(r.routing_continuity_error_pct) < 1
        assert b.rainfall_mm == pytest.approx(50, rel=1e-3)
        closure = b.infiltration_mm + b.runoff_mm + b.evaporation_mm + b.storage_change_mm
        assert closure == pytest.approx(b.rainfall_mm, rel=0.01)
        n = len(r.series.minutes)
        assert n == 36 * 12 and r.series.minutes[0] == 5
        assert all(len(v) == n for v in r.series.pipe_flow_m3s.values())
        # Report-step rainfall integrates back to the storm depth.
        assert sum(r.series.rainfall_mm_hr) * 5 / 60 == pytest.approx(50, rel=0.01)
        assert r.engine.swmm_version.startswith("5.2")
    assert base.lids == [] and {l.intervention_id for l in prop.lids} == {"RG1", "PP1"}
    assert prop.balance.runoff_m3 < base.balance.runoff_m3
    assert prop.balance.infiltration_m3 > base.balance.infiltration_m3
    assert prop.peak_outfall_m3s < base.peak_outfall_m3s


def test_slower_infiltration_increases_runoff(project):
    normal = simulate(project)
    slow = simulate(project, scenario=project.scenario.model_copy(update={"infiltration_factor": 0.25}))
    assert slow.balance.runoff_m3 > normal.balance.runoff_m3


def test_heavy_storm_overflows_the_drainage_network(project):
    heavy = simulate(project, scenario=project.scenario.model_copy(update={"depth_mm": 120}))
    assert heavy.flooding_volume_m3 > 0
    assert any(n.flooding_m3 > 0 for n in heavy.nodes)


def test_invalid_design_is_never_simulated(project, design):
    project.constraints.budget = 1000
    with pytest.raises(InvalidDesignError) as exc:
        simulate(project, design)
    assert any(i.code == "over_budget" for i in exc.value.issues)


def test_engine_failure_is_reported_not_hidden(project):
    inp, plan = build_inp(project.site, None, project.scenario)
    broken = inp.replace("[JUNCTIONS]\n", "[JUNCTIONS]\nBAD  not-a-number  1  0  0  0\n")
    with pytest.raises(SimulationError) as exc:
        run_inp(broken, plan, "baseline")
    assert "ERROR" in str(exc.value)
