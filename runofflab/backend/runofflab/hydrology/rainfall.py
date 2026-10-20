"""Synthetic design-storm hyetographs.

RunoffLab does not ship observed rainfall records or official return-period
depths. Users choose a total depth and one of three documented temporal
patterns; the depth for a given return period must come from local
intensity-duration-frequency data (e.g. NOAA Atlas 14 in the US).
"""

from __future__ import annotations

from bisect import bisect_right
from enum import Enum


class StormPattern(str, Enum):
    SCS_TYPE_II = "scs_type_ii"  # fixed 24 h duration
    TRIANGULAR = "triangular"
    UNIFORM = "uniform"


# NRCS (SCS) Type II 24-hour cumulative rainfall distribution, as tabulated in
# USDA-SCS (1986) Technical Release 55, "Urban Hydrology for Small Watersheds".
# Pairs of (hour, cumulative fraction of total depth). Intermediate values are
# linearly interpolated.
SCS_TYPE_II_TABLE: list[tuple[float, float]] = [
    (0.0, 0.000), (2.0, 0.022), (4.0, 0.048), (6.0, 0.080), (7.0, 0.098),
    (8.0, 0.120), (8.5, 0.133), (9.0, 0.147), (9.5, 0.163), (9.75, 0.172),
    (10.0, 0.181), (10.5, 0.204), (11.0, 0.235), (11.5, 0.283), (11.75, 0.357),
    (12.0, 0.663), (12.5, 0.735), (13.0, 0.772), (13.5, 0.799), (14.0, 0.820),
    (16.0, 0.880), (20.0, 0.952), (24.0, 1.000),
]

RAINFALL_REFERENCES = {
    StormPattern.SCS_TYPE_II: (
        "USDA Soil Conservation Service (1986). Urban Hydrology for Small "
        "Watersheds, Technical Release 55 (TR-55), Type II distribution."
    ),
    StormPattern.TRIANGULAR: (
        "Yen, B.C. & Chow, V.T. (1980). Design hyetographs for small drainage "
        "structures. J. Hydraulics Division 106(6), 1055-1076."
    ),
    StormPattern.UNIFORM: "Constant-intensity block storm (P / duration).",
}


def _cumulative_fraction(pattern: StormPattern, t_hr: float, duration_hr: float,
                         peak_position: float) -> float:
    """Fraction of the storm depth that has fallen by time t."""
    if t_hr <= 0:
        return 0.0
    if t_hr >= duration_hr:
        return 1.0
    if pattern is StormPattern.SCS_TYPE_II:
        hours = [h for h, _ in SCS_TYPE_II_TABLE]
        i = bisect_right(hours, t_hr) - 1
        (h0, f0), (h1, f1) = SCS_TYPE_II_TABLE[i], SCS_TYPE_II_TABLE[i + 1]
        return f0 + (f1 - f0) * (t_hr - h0) / (h1 - h0)
    if pattern is StormPattern.UNIFORM:
        return t_hr / duration_hr
    # Triangle with unit area peaking at tp = r * T.
    tp = peak_position * duration_hr
    if t_hr <= tp:
        return (t_hr ** 2) / (tp * duration_hr) if tp > 0 else 0.0
    return 1.0 - ((duration_hr - t_hr) ** 2) / ((duration_hr - tp) * duration_hr)


def hyetograph(pattern: StormPattern, depth_mm: float, duration_hr: float,
               step_min: int = 5, peak_position: float = 0.375) -> list[float]:
    """Rainfall intensities (mm/hr), one per `step_min` interval.

    Intensities are derived from differences of the cumulative curve, so the
    hyetograph's total equals `depth_mm` exactly (up to float rounding).
    """
    if pattern is StormPattern.SCS_TYPE_II:
        duration_hr = 24.0
    n = round(duration_hr * 60 / step_min)
    dt_hr = step_min / 60
    out = []
    for k in range(n):
        f0 = _cumulative_fraction(pattern, k * dt_hr, duration_hr, peak_position)
        f1 = _cumulative_fraction(pattern, (k + 1) * dt_hr, duration_hr, peak_position)
        out.append(depth_mm * (f1 - f0) / dt_hr)
    return out
