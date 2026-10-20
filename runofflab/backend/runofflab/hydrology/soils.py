"""Native-soil infiltration parameters for SWMM's Green-Ampt method.

Values are the soil-texture class averages of Rawls, Brakensiek & Miller (1983),
as tabulated in the EPA SWMM 5 User's Manual (Appendix A.2, "Soil
Characteristics"), converted from inches to millimetres. They describe typical
undisturbed soils of each texture, not any particular site; compacted urban
soils often infiltrate more slowly, which the what-if infiltration factor lets
users explore.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


class SoilTexture(str, Enum):
    SAND = "sand"
    LOAMY_SAND = "loamy_sand"
    SANDY_LOAM = "sandy_loam"
    LOAM = "loam"
    SILT_LOAM = "silt_loam"
    SANDY_CLAY_LOAM = "sandy_clay_loam"
    CLAY_LOAM = "clay_loam"
    SILTY_CLAY_LOAM = "silty_clay_loam"
    SANDY_CLAY = "sandy_clay"
    SILTY_CLAY = "silty_clay"
    CLAY = "clay"


@dataclass(frozen=True)
class SoilProperties:
    label: str
    ksat_mm_per_hr: float  # saturated hydraulic conductivity
    suction_head_mm: float  # wetting-front suction head
    porosity: float  # volume fraction
    field_capacity: float  # volume fraction
    wilting_point: float  # volume fraction

    @property
    def initial_moisture_deficit(self) -> float:
        """Porosity minus field capacity: soil starts at field capacity.

        This is a moderate antecedent condition (neither bone dry nor
        saturated) and is stated as an assumption in the methodology.
        """
        return round(self.porosity - self.field_capacity, 3)


SOILS: dict[SoilTexture, SoilProperties] = {
    SoilTexture.SAND: SoilProperties("Sand", 120.4, 49.0, 0.437, 0.062, 0.024),
    SoilTexture.LOAMY_SAND: SoilProperties("Loamy sand", 30.0, 61.3, 0.437, 0.105, 0.047),
    SoilTexture.SANDY_LOAM: SoilProperties("Sandy loam", 10.9, 110.1, 0.453, 0.190, 0.085),
    SoilTexture.LOAM: SoilProperties("Loam", 3.3, 88.9, 0.463, 0.232, 0.116),
    SoilTexture.SILT_LOAM: SoilProperties("Silt loam", 6.6, 166.8, 0.501, 0.284, 0.135),
    SoilTexture.SANDY_CLAY_LOAM: SoilProperties("Sandy clay loam", 1.5, 218.5, 0.398, 0.244, 0.136),
    SoilTexture.CLAY_LOAM: SoilProperties("Clay loam", 1.0, 208.8, 0.464, 0.310, 0.187),
    SoilTexture.SILTY_CLAY_LOAM: SoilProperties("Silty clay loam", 1.0, 273.0, 0.471, 0.342, 0.210),
    SoilTexture.SANDY_CLAY: SoilProperties("Sandy clay", 0.5, 239.0, 0.430, 0.321, 0.221),
    SoilTexture.SILTY_CLAY: SoilProperties("Silty clay", 0.5, 292.2, 0.479, 0.371, 0.251),
    SoilTexture.CLAY: SoilProperties("Clay", 0.25, 316.3, 0.475, 0.378, 0.265),
}

SOIL_REFERENCE = (
    "Rawls, W.J., Brakensiek, D.L. & Miller, N. (1983). Green-Ampt infiltration "
    "parameters from soils data. J. Hydraulic Engineering 109(1), 62-70; as "
    "tabulated in Rossman, L.A. (2015) Storm Water Management Model User's "
    "Manual Version 5.1, EPA/600/R-14/413b, Appendix A.2."
)
