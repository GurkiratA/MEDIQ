from runofflab.models.project import PermeablePavement, RainGarden, Rect
from runofflab.validation import check_design, validate_site

from conftest import with_items


def codes(check):
    return {i.code for i in check.issues if i.severity == "error"}


def check(project, design):
    return check_design(project.site, design, project.costs, project.constraints)


def test_sample_site_and_design_are_valid(project, design):
    assert validate_site(project.site) == []
    result = check(project, design)
    assert result.feasible, result.issues
    assert result.host_surface == {"RG1": "L2", "PP1": "P2"}
    # 360 m² × $250 + 1000 m² × $150
    assert result.cost == 240_000
    assert result.total_area_m2 == 1360


def test_overlapping_interventions_rejected(project, design):
    rg, pp = design.interventions
    clash = PermeablePavement(id="PP2", rect=Rect(x=100, y=100, width=40, height=10))
    assert "intervention_overlap" in codes(check(project, with_items(design, rg, pp, clash)))


def test_intervention_straddling_surfaces_rejected(project, design):
    rg = RainGarden(id="RG9", rect=Rect(x=60, y=76, width=20, height=5),
                    contributing_surface_id="P1", captured_area_m2=100)
    assert "not_within_surface" in codes(check(project, with_items(design, rg)))


def test_wrong_host_kind_rejected(project, design):
    on_lawn = PermeablePavement(id="PP9", rect=Rect(x=10, y=70, width=10, height=10))
    in_lot = RainGarden(id="RG9", rect=Rect(x=80, y=40, width=10, height=10),
                        contributing_surface_id="P1", captured_area_m2=100)
    assert codes(check(project, with_items(design, on_lawn))) == {"wrong_host_surface"}
    assert codes(check(project, with_items(design, in_lot))) == {"wrong_host_surface"}


def test_budget_and_area_limits(project, design):
    project.constraints.budget = 100_000
    assert "over_budget" in codes(check(project, design))
    project.constraints.budget = 1e9
    project.constraints.max_intervention_area_m2 = 1000
    assert "over_area" in codes(check(project, design))


def test_loading_ratio_and_capture_limits(project, design):
    greedy = RainGarden(id="RG9", rect=Rect(x=85, y=76, width=10, height=6),
                        contributing_surface_id="P1", captured_area_m2=5000)
    assert "loading_ratio" in codes(check(project, with_items(design, greedy)))
    # Two gardens together asking for more of Lot A (5850 m²) than exists.
    a = RainGarden(id="RGa", rect=Rect(x=72, y=76, width=60, height=6),
                   contributing_surface_id="P1", captured_area_m2=3600)
    b = RainGarden(id="RGb", rect=Rect(x=135, y=76, width=60, height=6),
                   contributing_surface_id="P1", captured_area_m2=3600)
    assert codes(check(project, with_items(design, a, b))) == {"over_capture"}


def test_contributing_surface_must_be_nearby_and_impervious(project, design):
    far = RainGarden(id="RG9", rect=Rect(x=10, y=100, width=10, height=10),
                     contributing_surface_id="R1", captured_area_m2=500)
    lawn = RainGarden(id="RG8", rect=Rect(x=85, y=76, width=10, height=6),
                      contributing_surface_id="L1", captured_area_m2=50)
    assert "contributing_too_far" in codes(check(project, with_items(design, far)))
    assert "contributing_not_impervious" in codes(check(project, with_items(design, lawn)))


def test_site_overlap_and_disconnected_inlet_detected(project):
    site = project.site
    site.surfaces[0].rect.width = 80  # roof now overlaps the north lawn
    site.pipes = [p for p in site.pipes if p.id != "C2"]
    found = {i.code for i in validate_site(site)}
    assert {"surface_overlap", "inlet_not_connected"} <= found
