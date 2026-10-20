"""FastAPI application exposing validation, simulation and reference data.

Run locally with:  uvicorn runofflab.api.app:app --reload
"""

from __future__ import annotations

from dataclasses import asdict

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from runofflab.engine import lid_params
from runofflab.engine.runner import SimulationError, engine_info
from runofflab.engine.simulate import InvalidDesignError, simulate
from runofflab.hydrology.rainfall import RAINFALL_REFERENCES
from runofflab.hydrology.soils import SOIL_REFERENCE, SOILS
from runofflab.hydrology.surfaces import SURFACE_DEFAULTS
from runofflab.models.project import Design, Project, Scenario
from runofflab.models.results import EngineInfo, SimulationResult
from runofflab.sample import load_sample_project
from runofflab.validation import Issue, check_design, validate_site

app = FastAPI(title="RunoffLab API", version=engine_info().runofflab_version)
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_methods=["*"],
    allow_headers=["*"],
)


class ValidateRequest(BaseModel):
    project: Project
    design: Design | None = None


class ValidateResponse(BaseModel):
    feasible: bool
    issues: list[Issue]
    cost: float
    rain_garden_area_m2: float
    permeable_pavement_area_m2: float


class SimulateRequest(BaseModel):
    project: Project
    design: Design | None = None  # None = baseline
    scenario: Scenario | None = None  # None = project.scenario


@app.get("/api/health", response_model=EngineInfo)
def health() -> EngineInfo:
    return engine_info()


@app.get("/api/sample", response_model=Project)
def sample() -> Project:
    return load_sample_project()


@app.get("/api/reference")
def reference() -> dict:
    """Every built-in assumption, with sources, for the UI's assumptions panel."""
    return {
        "soils": {k.value: {**asdict(v), "initial_moisture_deficit": v.initial_moisture_deficit}
                  for k, v in SOILS.items()},
        "soil_reference": SOIL_REFERENCE,
        "surfaces": {k.value: asdict(v) for k, v in SURFACE_DEFAULTS.items()},
        "rainfall_references": {k.value: v for k, v in RAINFALL_REFERENCES.items()},
        "lid_parameters": {k: v for k, v in vars(lid_params).items() if k.isupper()},
    }


@app.post("/api/validate", response_model=ValidateResponse)
def validate(req: ValidateRequest) -> ValidateResponse:
    issues = validate_site(req.project.site)
    design = req.design or Design(id="baseline", name="Baseline")
    check = check_design(req.project.site, design, req.project.costs, req.project.constraints)
    issues += check.issues
    return ValidateResponse(
        feasible=not any(i.severity == "error" for i in issues), issues=issues,
        cost=round(check.cost, 2), rain_garden_area_m2=round(check.rain_garden_area_m2, 2),
        permeable_pavement_area_m2=round(check.permeable_pavement_area_m2, 2))


@app.post("/api/simulate", response_model=SimulationResult)
def run_simulation(req: SimulateRequest) -> SimulationResult:
    try:
        return simulate(req.project, req.design, req.scenario)
    except InvalidDesignError as exc:
        raise HTTPException(422, {"kind": "invalid_design",
                                  "issues": [i.model_dump() for i in exc.issues]})
    except SimulationError as exc:
        raise HTTPException(500, {"kind": "engine_error", "message": str(exc),
                                  "details": exc.details})
