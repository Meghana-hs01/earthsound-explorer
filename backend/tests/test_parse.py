import math

import pytest

from services import parse


def test_power_fill_value_is_invalid():
    assert not parse.is_valid(-999.0)
    assert not parse.is_valid(float("nan"))
    assert not parse.is_valid(None)
    assert not parse.is_valid(True)
    assert parse.is_valid(0.0)  # zero is a real value, not missing
    assert parse.is_valid(-12.5)


def test_latest_valid_skips_fill_values():
    series = {"2026110108": 10.0, "2026110109": -999.0, "2026110110": 12.5, "2026110111": -999.0}
    assert parse.latest_valid(series) == ("2026110110", 12.5)


def test_latest_valid_returns_none_when_all_missing():
    assert parse.latest_valid({"2026110108": -999.0}) is None


def test_hourly_key_to_utc():
    assert parse.hourly_key_to_utc("2026110112") == "2026-11-01T12:00Z"


def test_daily_key_to_date():
    assert parse.daily_key_to_date("20261101") == "2026-11-01"


def test_annual_means_require_full_years_and_skip_fill():
    series = {}
    for m in range(1, 13):
        series[f"2020{m:02d}"] = 10.0
    for m in range(1, 12):  # 2021 has only 11 valid months
        series[f"2021{m:02d}"] = 20.0
    series["ANN"] = 99.0  # not a YYYYMM key, must be ignored
    means = parse.annual_means(series)
    assert means == {2020: 10.0}


def test_annual_means_ignore_fill_months():
    series = {f"2020{m:02d}": (-999.0 if m == 12 else 5.0) for m in range(1, 13)}
    assert parse.annual_means(series, min_months=12) == {}
    assert parse.annual_means(series, min_months=11) == {2020: 5.0}


def test_climate_summary_precipitation_is_mm_per_day_times_365():
    params = {}
    for code, val in (("T2M", 20.0), ("T2M_MAX", 26.0), ("T2M_MIN", 14.0), ("RH2M", 40.0), ("PRECTOTCORR", 1.0)):
        params[code] = {f"{y}{m:02d}": val for y in (2020, 2021) for m in range(1, 13)}
    out = parse.climate_summary(params)
    assert out["years_used"] == 2
    assert out["temp_mean_c"] == 20.0
    assert out["diurnal_range_c"] == 12.0
    assert out["rh_mean_pct"] == 40.0
    assert out["precip_mm_yr"] == 365.0


def test_climate_summary_handles_empty_input():
    out = parse.climate_summary({})
    assert out["years_used"] == 0
    assert out["temp_mean_c"] is None
    assert out["precip_mm_yr"] is None


def test_parse_hourly_latest_marks_missing_variables():
    params = {
        "T2M": {"2026110108": 15.0, "2026110109": 16.0},
        "RH2M": {"2026110109": -999.0},
        "QV2M": {"2026110109": 8.5},
        "WS2M": {"2026110109": -999.0},
    }
    out = parse.parse_hourly_latest(params)
    assert out["temperature_c"] == {"value": 16.0, "observed_at_utc": "2026-11-01T09:00Z", "status": "ok"}
    assert out["relative_humidity_pct"]["value"] is None
    assert out["relative_humidity_pct"]["status"] == "no_valid_data"
    assert out["specific_humidity_gkg"]["value"] == 8.5
    assert out["wind_speed_ms"]["status"] == "no_valid_data"


def test_daily_series_keeps_missing_days_as_none():
    params = {
        "T2M": {"20261101": 10.0, "20261102": -999.0},
        "RH2M": {"20261101": 50.0, "20261102": 55.0},
        "QV2M": {"20261101": 6.0, "20261102": 6.5},
        "WS2M": {"20261101": -999.0, "20261102": 3.0},
    }
    rows = parse.daily_series(params)
    assert rows[0] == {"date": "2026-11-01", "temperature_c": 10.0, "relative_humidity_pct": 50.0,
                       "specific_humidity_gkg": 6.0, "wind_speed_ms": None}
    assert rows[1]["temperature_c"] is None


GISTEMP_SAMPLE = """Land-Ocean Temperature Index
Year,No_Smoothing,Lowess(5),J-D,D-N,DJF
1880,-17,-10,-16,-18,-20
1881,-5,-12,***,-15,-16
1882,-8,-8,-9,-10,-11
2024,120,110,122,118,115
"""


def test_gistemp_parses_hundredths_and_skips_missing():
    rows = parse.parse_gistemp_csv(GISTEMP_SAMPLE)
    assert rows[0] == {"year": 1880, "anomaly_c": -0.16}
    assert [r["year"] for r in rows] == [1880, 1882, 2024]
    assert rows[-1]["anomaly_c"] == 1.22


def test_gistemp_bad_format_raises():
    with pytest.raises(ValueError):
        parse.parse_gistemp_csv("nothing useful here")


def test_gistemp_missing_jd_column_raises():
    with pytest.raises(ValueError):
        parse.parse_gistemp_csv("Year,Jan,Feb\n1880,1,2\n")


def test_parse_current_appends_utc_suffix():
    out = parse.parse_current({"current": {"time": "2026-11-08T14:00", "temperature_2m": 22.1,
                                           "relative_humidity_2m": 40, "wind_speed_10m": 2.5}})
    assert out["observed_at_utc"] == "2026-11-08T14:00:00Z"
    assert out["temperature_c"] == 22.1


def test_grid_points_count_and_cap():
    pts = parse.grid_points([0.0, 2.0, 0.0, 2.0], 1.0, cap=100)
    assert len(pts) == 9
    capped = parse.grid_points([0.0, 10.0, 0.0, 10.0], 1.0, cap=20)
    assert len(capped) <= 20
    assert capped == parse.grid_points([0.0, 10.0, 0.0, 10.0], 1.0, cap=20)  # deterministic


def _flat_z(value=100.0):
    return {k: value for k in parse.NEIGHBOUR_KEYS}


def test_flat_terrain_has_zero_slope_and_roughness():
    out = parse.slope_roughness(_flat_z(), lat=20.0, step_deg=0.05)
    assert out == {"slope_deg": 0.0, "roughness_m": 0.0}


def test_tilted_plane_slope_matches_gradient():
    lat, step = 0.0, 0.05
    dx = step * 111320.0 * math.cos(0)
    rise_per_step = dx * 0.1  # gradient of 0.1 m per m east
    z = {(di, dj): dj * rise_per_step for di, dj in parse.NEIGHBOUR_KEYS}
    out = parse.slope_roughness(z, lat, step)
    assert out["slope_deg"] == pytest.approx(math.degrees(math.atan(0.1)), abs=0.01)


def test_slope_returns_none_when_neighbour_missing():
    z = _flat_z()
    z[(1, 1)] = None
    assert parse.slope_roughness(z, 10.0, 0.05) is None
