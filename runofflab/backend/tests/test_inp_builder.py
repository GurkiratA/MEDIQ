import re

import pytest

from runofflab.engine.inp_builder import build_inp
from runofflab.hydrology.soils import SOILS
from runofflab.validation import check_design


def section(inp: str, name: str) -> list[list[str]]:
    body = inp.split(f"[{name}]\n", 1)[1].split("\n\n", 1)[0]
    return [ln.split() for ln in body.splitlines() if ln.strip()]


def build(project, design):
    check = check_design(project.site, design, project.costs, project.constraints)
    return build_inp(project.site, design, project.scenario, check.host_surface)


def test_area_is_conserved_when_rain_gardens_move_area(project, design):
    inp, plan = build(project, design)
    subs = {row[0]: float(row[3]) * 10_000 for row in section(inp, "SUBCATCHMENTS")}
    assert sum(subs.values()) == pytest.approx(project.site.total_area_m2)
    # The 360 m² garden moves from the median (L2) to Lot A (P1).
    assert subs["L2"] == pytest.approx(1040 - 360)
    assert subs["P1"] == pytest.approx(5850 + 360)
    assert plan.subcatchment_area_m2 == pytest.approx(subs)


def test_lid_usage_routes_the_captured_fraction(project, design):
    inp, _ = build(project, design)
    usage = {row[1]: row for row in section(inp, "LID_USAGE")}
    # RG1 captures 3600 m² of Lot A's 5850 m² impervious area.
    assert usage["LID_RG1"][0] == "P1"
    assert float(usage["LID_RG1"][3]) == pytest.approx(360)
    assert float(usage["LID_RG1"][6]) == pytest.approx(100 * 3600 / 5850, rel=1e-5)
    # PP1 sits in Lot B and takes run-on from 1000 of the remaining 3810 m².
    assert usage["LID_PP1"][0] == "P2"
    assert float(usage["LID_PP1"][6]) == pytest.approx(100 * 1000 / (4810 - 1000), rel=1e-5)


def test_infiltration_factor_scales_soil_and_lid_seepage(project, design):
    ksat = SOILS[project.site.soil].ksat_mm_per_hr
    project.scenario.infiltration_factor = 0.5
    inp, _ = build(project, design)
    assert all(float(r[2]) == pytest.approx(ksat * 0.5) for r in section(inp, "INFILTRATION"))
    storage = [r for r in section(inp, "LID_CONTROLS") if r[1] == "STORAGE"]
    assert all(float(r[4]) == pytest.approx(ksat * 0.5) for r in storage)


def test_baseline_has_no_lids_and_simulation_window_covers_drain_time(project):
    inp, plan = build_inp(project.site, None, project.scenario)
    assert "[LID_CONTROLS]" not in inp and plan.lids == []
    # 24 h storm + 12 h drain time → ends at 12:00 on day 2.
    assert re.search(r"END_DATE\s+01/02/2024", inp) and re.search(r"END_TIME\s+12:00:00", inp)
