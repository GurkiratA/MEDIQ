import pytest

from runofflab.hydrology.rainfall import StormPattern, hyetograph


@pytest.mark.parametrize("pattern", list(StormPattern))
def test_hyetograph_conserves_depth(pattern):
    rain = hyetograph(pattern, depth_mm=42.0, duration_hr=6, step_min=5)
    assert sum(rain) * 5 / 60 == pytest.approx(42.0, rel=1e-9)
    assert all(v >= 0 for v in rain)


def test_scs_type_ii_is_always_24_hours_and_peaks_near_noon():
    rain = hyetograph(StormPattern.SCS_TYPE_II, 50, duration_hr=3, step_min=5)
    assert len(rain) == 24 * 12
    peak_hour = rain.index(max(rain)) * 5 / 60
    assert 11.75 <= peak_hour < 12.0
    # TR-55 Type II: 30.6 % of the depth falls between 11.75 h and 12 h.
    assert sum(rain[141:144]) * 5 / 60 == pytest.approx(0.306 * 50, rel=1e-6)


def test_triangular_peak_position():
    rain = hyetograph(StormPattern.TRIANGULAR, 30, duration_hr=2, step_min=5, peak_position=0.25)
    assert rain.index(max(rain)) in (5, 6)  # peak at 30 min
