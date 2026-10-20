from fastapi.testclient import TestClient

from runofflab.api.app import app

client = TestClient(app)


def test_health_reports_engine_versions():
    body = client.get("/api/health").json()
    assert body["swmm_version"].startswith("5.2") and body["pyswmm_version"]


def test_sample_validate_and_simulate_round_trip():
    project = client.get("/api/sample").json()
    design = project["designs"][0]
    v = client.post("/api/validate", json={"project": project, "design": design}).json()
    assert v["feasible"] and v["cost"] == 240_000
    r = client.post("/api/simulate", json={"project": project, "design": design})
    assert r.status_code == 200
    assert r.json()["label"] == "D1" and r.json()["balance"]["runoff_m3"] > 0


def test_infeasible_design_returns_issues_not_results():
    project = client.get("/api/sample").json()
    project["constraints"]["budget"] = 10
    r = client.post("/api/simulate", json={"project": project, "design": project["designs"][0]})
    assert r.status_code == 422
    assert r.json()["detail"]["kind"] == "invalid_design"


def test_malformed_project_rejected_by_schema():
    project = client.get("/api/sample").json()
    project["site"]["surfaces"][0]["rect"]["width"] = -5
    assert client.post("/api/simulate", json={"project": project}).status_code == 422


def test_reference_lists_assumptions_with_sources():
    ref = client.get("/api/reference").json()
    assert "Rawls" in ref["soil_reference"]
    assert ref["soils"]["silt_loam"]["ksat_mm_per_hr"] == 6.6
    assert "TR-55" in ref["rainfall_references"]["scs_type_ii"]
