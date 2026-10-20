"""The bundled sample project, so the app is explorable on first launch."""

from __future__ import annotations

from importlib import resources

from runofflab.models.project import Project


def load_sample_project() -> Project:
    text = resources.files("runofflab.data").joinpath("sample_campus.json").read_text()
    return Project.model_validate_json(text)
