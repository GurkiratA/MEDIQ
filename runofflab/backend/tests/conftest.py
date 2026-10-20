import pytest

from runofflab.models.project import Project
from runofflab.sample import load_sample_project


@pytest.fixture
def project() -> Project:
    return load_sample_project()


@pytest.fixture
def design(project):
    return project.designs[0]


def with_items(design, *items):
    """Copy of `design` with its interventions replaced."""
    return design.model_copy(update={"interventions": list(items)})
