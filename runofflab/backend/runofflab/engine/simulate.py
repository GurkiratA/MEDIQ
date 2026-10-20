"""High-level entry point: validate, build, and run a project scenario."""

from __future__ import annotations

from runofflab.engine.inp_builder import build_inp
from runofflab.engine.runner import run_inp
from runofflab.models.project import Design, Project, Scenario
from runofflab.models.results import SimulationResult
from runofflab.validation import Issue, check_design, validate_site


class InvalidDesignError(ValueError):
    """The site or design breaks a constraint; nothing was simulated."""

    def __init__(self, issues: list[Issue]):
        super().__init__("; ".join(i.message for i in issues if i.severity == "error"))
        self.issues = issues


def simulate(project: Project, design: Design | None = None,
             scenario: Scenario | None = None) -> SimulationResult:
    """Simulate the baseline (design=None) or a proposed design.

    Raises InvalidDesignError before running SWMM if any constraint fails,
    and runner.SimulationError if the engine itself fails.
    """
    scenario = scenario or project.scenario
    site_issues = [i for i in validate_site(project.site) if i.severity == "error"]
    if site_issues:
        raise InvalidDesignError(site_issues)
    host_surface: dict[str, str] = {}
    if design is not None:
        check = check_design(project.site, design, project.costs, project.constraints)
        if not check.feasible:
            raise InvalidDesignError(check.issues)
        host_surface = check.host_surface
    inp, plan = build_inp(project.site, design, scenario, host_surface)
    return run_inp(inp, plan, label=design.id if design else "baseline")
