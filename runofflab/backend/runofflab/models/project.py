"""Pydantic models describing a RunoffLab project.

All lengths are metres, depths millimetres, areas square metres, and money is
in the project's currency. Geometry uses an SVG-style coordinate system: the
origin is the site's top-left corner and y increases downwards.
"""

from __future__ import annotations

from typing import Annotated, Literal, Union

from pydantic import BaseModel, ConfigDict, Field, model_validator

from runofflab.hydrology.rainfall import StormPattern
from runofflab.hydrology.soils import SoilTexture
from runofflab.hydrology.surfaces import SurfaceKind

Id = Annotated[str, Field(min_length=1, max_length=40, pattern=r"^[A-Za-z][A-Za-z0-9_-]*$")]


class Model(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Rect(Model):
    x: float = Field(ge=0)
    y: float = Field(ge=0)
    width: float = Field(gt=0)
    height: float = Field(gt=0)

    @property
    def area(self) -> float:
        return self.width * self.height

    @property
    def x2(self) -> float:
        return self.x + self.width

    @property
    def y2(self) -> float:
        return self.y + self.height


# ── Site ────────────────────────────────────────────────────────────────────

class Surface(Model):
    id: Id
    name: str = Field(min_length=1, max_length=80)
    kind: SurfaceKind
    rect: Rect
    slope_pct: float = Field(default=2.0, gt=0, le=30)
    drains_to: Id  # inlet id

    @property
    def area_m2(self) -> float:
        return self.rect.area


class Inlet(Model):
    """A catch basin / manhole: a SWMM junction."""
    id: Id
    name: str = Field(min_length=1, max_length=80)
    x: float
    y: float
    rim_elev_m: float
    invert_elev_m: float

    @model_validator(mode="after")
    def _rim_above_invert(self) -> "Inlet":
        if self.rim_elev_m <= self.invert_elev_m:
            raise ValueError(f"inlet {self.id}: rim must be above invert")
        return self


class Outfall(Model):
    id: Id
    name: str = "Outfall"
    x: float
    y: float
    invert_elev_m: float


class Pipe(Model):
    id: Id
    from_node: Id
    to_node: Id
    length_m: float = Field(gt=0)
    diameter_m: float = Field(gt=0.05, le=3)
    roughness_n: float = Field(default=0.013, gt=0, le=0.05)


class Site(Model):
    id: Id
    name: str = Field(min_length=1, max_length=120)
    description: str = ""
    width_m: float = Field(gt=0, le=5000)
    height_m: float = Field(gt=0, le=5000)
    soil: SoilTexture
    surfaces: list[Surface] = Field(min_length=1)
    inlets: list[Inlet] = Field(min_length=1)
    outfall: Outfall
    pipes: list[Pipe] = Field(default_factory=list)

    @property
    def total_area_m2(self) -> float:
        return sum(s.area_m2 for s in self.surfaces)

    def surface(self, surface_id: str) -> Surface | None:
        return next((s for s in self.surfaces if s.id == surface_id), None)


# ── Green infrastructure ────────────────────────────────────────────────────

class RainGarden(Model):
    """Vegetated depression with engineered soil (SWMM 'RG' LID).

    Built inside a lawn or planted bed; receives runoff from part of an
    adjacent impervious surface.
    """
    kind: Literal["rain_garden"] = "rain_garden"
    id: Id
    rect: Rect
    contributing_surface_id: Id
    captured_area_m2: float = Field(ge=0)  # impervious area routed into it
    ponding_depth_mm: float = Field(default=150, ge=50, le=450)
    soil_depth_mm: float = Field(default=600, ge=300, le=1200)
    gravel_depth_mm: float = Field(default=300, ge=0, le=900)


class PermeablePavement(Model):
    """Pervious pavers / porous asphalt over a stone reservoir (SWMM 'PP' LID).

    Replaces part of a parking or plaza surface; can optionally accept run-on
    from the rest of that surface.
    """
    kind: Literal["permeable_pavement"] = "permeable_pavement"
    id: Id
    rect: Rect
    runon_area_m2: float = Field(default=0, ge=0)  # extra impervious area routed onto it
    pavement_thickness_mm: float = Field(default=100, ge=50, le=300)
    storage_depth_mm: float = Field(default=300, ge=100, le=900)


Intervention = Annotated[Union[RainGarden, PermeablePavement], Field(discriminator="kind")]


class Design(Model):
    id: Id
    name: str = Field(min_length=1, max_length=80)
    interventions: list[Intervention] = Field(default_factory=list)


# ── Assumptions & scenario ──────────────────────────────────────────────────

class CostAssumptions(Model):
    """Installed unit costs. Defaults are illustrative placeholders, not quotes."""
    currency: str = "USD"
    rain_garden_per_m2: float = Field(default=250, ge=0)
    permeable_pavement_per_m2: float = Field(default=150, ge=0)


class Constraints(Model):
    budget: float = Field(default=200_000, ge=0)
    max_intervention_area_m2: float | None = Field(default=None, ge=0)
    # Contributing (captured) area : rain-garden area. Design manuals commonly
    # cap this somewhere between ~5:1 and ~20:1; RunoffLab makes it explicit.
    max_rain_garden_loading_ratio: float = Field(default=15, gt=0)
    # Run-on area : permeable-pavement area.
    max_pavement_runon_ratio: float = Field(default=2, ge=0)
    # How close a contributing surface must be to a rain garden's host surface.
    max_contributing_gap_m: float = Field(default=5, ge=0)


class Scenario(Model):
    id: Id = "design-storm"
    name: str = "Design storm"
    pattern: StormPattern = StormPattern.SCS_TYPE_II
    depth_mm: float = Field(default=50, gt=0, le=500)
    duration_hr: float = Field(default=24, gt=0, le=72)  # ignored for SCS Type II
    peak_position: float = Field(default=0.375, gt=0, lt=1)  # triangular only
    # Multiplier on native-soil Ksat and LID seepage: <1 models compaction/clogging.
    infiltration_factor: float = Field(default=1.0, gt=0, le=5)
    # Hours simulated after rainfall stops so stored water can drain.
    drain_hours: float = Field(default=12, ge=1, le=72)

    @property
    def storm_hours(self) -> float:
        return 24.0 if self.pattern is StormPattern.SCS_TYPE_II else self.duration_hr


class Project(Model):
    id: Id
    name: str = Field(min_length=1, max_length=120)
    site: Site
    costs: CostAssumptions = CostAssumptions()
    constraints: Constraints = Constraints()
    scenario: Scenario = Scenario()
    designs: list[Design] = Field(default_factory=list)
