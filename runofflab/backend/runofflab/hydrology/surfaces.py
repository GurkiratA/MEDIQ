"""Hydrologic defaults for each land-surface type.

Manning's n and depression-storage values are typical values from the SWMM 5
User's Manual (Appendix A.6 "Manning's n — Overland Flow" and A.5 "Depression
Storage"). They are defaults, not measurements of the sample site.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


class SurfaceKind(str, Enum):
    ROOF = "roof"
    PARKING = "parking"
    ROAD = "road"
    SIDEWALK = "sidewalk"
    LAWN = "lawn"
    LANDSCAPE = "landscape"


@dataclass(frozen=True)
class SurfaceDefaults:
    label: str
    impervious_pct: float
    n_overland: float  # Manning's n for sheet flow
    depression_storage_mm: float


SURFACE_DEFAULTS: dict[SurfaceKind, SurfaceDefaults] = {
    # Smooth asphalt/concrete n ≈ 0.011-0.012; impervious storage 1.3-2.5 mm.
    SurfaceKind.ROOF: SurfaceDefaults("Roof", 100, 0.012, 1.5),
    SurfaceKind.PARKING: SurfaceDefaults("Parking", 100, 0.011, 1.5),
    SurfaceKind.ROAD: SurfaceDefaults("Road", 100, 0.011, 1.5),
    SurfaceKind.SIDEWALK: SurfaceDefaults("Sidewalk / plaza", 100, 0.012, 1.5),
    # Short grass n ≈ 0.15; lawn depression storage 2.5-5 mm.
    SurfaceKind.LAWN: SurfaceDefaults("Lawn", 0, 0.15, 5.0),
    SurfaceKind.LANDSCAPE: SurfaceDefaults("Planted bed", 0, 0.24, 5.0),
}

IMPERVIOUS_KINDS = frozenset(k for k, d in SURFACE_DEFAULTS.items() if d.impervious_pct > 0)
PERVIOUS_KINDS = frozenset(SURFACE_DEFAULTS) - IMPERVIOUS_KINDS

# Where each intervention may be built.
RAIN_GARDEN_HOSTS = frozenset({SurfaceKind.LAWN, SurfaceKind.LANDSCAPE})
PERMEABLE_PAVEMENT_HOSTS = frozenset({SurfaceKind.PARKING, SurfaceKind.SIDEWALK})

# Fraction of pervious area with no depression storage (SWMM default).
PCT_ZERO_STORAGE = 25.0
