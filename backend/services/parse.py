"""Pure parsing and maths helpers. No network calls, so these are unit-tested directly."""
from __future__ import annotations

import math
import re
from datetime import datetime
from statistics import pstdev

POWER_FILL = -999.0
_MONTH_KEY = re.compile(r"^\d{6}$")


def is_valid(value) -> bool:
    """True for a real number. NASA POWER uses -999 for missing values."""
    return (
        isinstance(value, (int, float))
        and not isinstance(value, bool)
        and not math.isnan(value)
        and value > -900
    )


def clean(value, digits: int = 2):
    return round(float(value), digits) if is_valid(value) else None


def latest_valid(series: dict):
    """Return (key, value) of the latest valid entry, or None when none is valid."""
    best = None
    for key in sorted(series):
        if is_valid(series[key]):
            best = (key, series[key])
    return best


def hourly_key_to_utc(key: str) -> str:
    """'2026110112' -> '2026-11-01T12:00Z'."""
    return datetime.strptime(key, "%Y%m%d%H").strftime("%Y-%m-%dT%H:00Z")


def daily_key_to_date(key: str) -> str:
    """'20261101' -> '2026-11-01'."""
    return datetime.strptime(key, "%Y%m%d").strftime("%Y-%m-%d")


def annual_means(series: dict, min_months: int = 12) -> dict:
    """Average YYYYMM monthly values per year. Years with fewer than min_months valid months are dropped."""
    by_year: dict[int, list[float]] = {}
    for key, value in series.items():
        if _MONTH_KEY.match(key) and is_valid(value):
            by_year.setdefault(int(key[:4]), []).append(float(value))
    return {year: sum(vals) / len(vals) for year, vals in by_year.items() if len(vals) >= min_months}


def _average(by_year: dict):
    return sum(by_year.values()) / len(by_year) if by_year else None


def climate_summary(params: dict) -> dict:
    """Summarise NASA POWER monthly parameters into the values used for scoring."""
    t = annual_means(params.get("T2M", {}))
    tmax = annual_means(params.get("T2M_MAX", {}))
    tmin = annual_means(params.get("T2M_MIN", {}))
    rh = annual_means(params.get("RH2M", {}))
    pr = annual_means(params.get("PRECTOTCORR", {}))

    diurnal = {y: tmax[y] - tmin[y] for y in tmax if y in tmin}
    precip_mm_per_day = _average(pr)
    years = sorted(t)
    return {
        "years_used": len(t),
        "years": [years[0], years[-1]] if years else None,
        "temp_mean_c": clean(_average(t)),
        "diurnal_range_c": clean(_average(diurnal)),
        "rh_mean_pct": clean(_average(rh)),
        "precip_mm_yr": clean(precip_mm_per_day * 365.0, 1) if precip_mm_per_day is not None else None,
    }


def parse_hourly_latest(params: dict) -> dict:
    """Latest valid hour per variable from a POWER hourly response."""
    spec = {
        "temperature_c": "T2M",
        "relative_humidity_pct": "RH2M",
        "specific_humidity_gkg": "QV2M",
        "wind_speed_ms": "WS2M",
    }
    out = {}
    for name, code in spec.items():
        found = latest_valid(params.get(code, {}))
        if found:
            out[name] = {"value": clean(found[1]), "observed_at_utc": hourly_key_to_utc(found[0]), "status": "ok"}
        else:
            out[name] = {"value": None, "observed_at_utc": None, "status": "no_valid_data"}
    return out


def daily_series(params: dict) -> list[dict]:
    """Daily rows from a POWER daily response. Missing values become None."""
    t = params.get("T2M", {})
    rh = params.get("RH2M", {})
    qv = params.get("QV2M", {})
    ws = params.get("WS2M", {})
    rows = []
    for key in sorted(t):
        rows.append({
            "date": daily_key_to_date(key),
            "temperature_c": clean(t[key]),
            "relative_humidity_pct": clean(rh.get(key)),
            "specific_humidity_gkg": clean(qv.get(key)),
            "wind_speed_ms": clean(ws.get(key)),
        })
    return rows


def parse_current(data: dict) -> dict:
    """Open-Meteo current block (timezone=UTC) into a dict with UTC time."""
    cur = data.get("current") or {}
    t = cur.get("time")
    observed = (t + ":00Z") if t and len(t) == 16 else t
    return {
        "observed_at_utc": observed,
        "temperature_c": cur.get("temperature_2m"),
        "relative_humidity_pct": cur.get("relative_humidity_2m"),
        "wind_speed_ms": cur.get("wind_speed_10m"),
    }


def parse_gistemp_csv(text: str) -> list[dict]:
    """Parse NASA GISTEMP v4 table: annual J-D column. '***' is missing. Integer entries are hundredths of a degree; entries with a decimal point are already degrees."""
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    header_idx = next((i for i, line in enumerate(lines) if line.lower().startswith("year,")), None)
    if header_idx is None:
        raise ValueError("GISTEMP header row starting with 'Year,' not found")
    header = [h.strip() for h in lines[header_idx].split(",")]
    if "J-D" not in header:
        raise ValueError("GISTEMP column 'J-D' not found")
    jd = header.index("J-D")

    rows = []
    for line in lines[header_idx + 1:]:
        parts = [p.strip() for p in line.split(",")]
        if len(parts) <= jd or not parts[0].isdigit():
            continue
        raw = parts[jd]
        if raw in ("***", ""):
            continue
        try:
            value = float(raw)
        except ValueError:
            continue
        if "." not in raw:
            value = value / 100.0  # integer entries are stored in hundredths of a degree
        rows.append({"year": int(parts[0]), "anomaly_c": round(value, 3)})
    if not rows:
        raise ValueError("no valid GISTEMP rows found")
    return rows


def grid_points(bbox, spacing: float, cap: int) -> list[tuple[float, float]]:
    """Regular grid over [lat_min, lat_max, lon_min, lon_max]. Capped by even stride, so it stays deterministic."""
    lat_min, lat_max, lon_min, lon_max = bbox
    n_lat = int(round((lat_max - lat_min) / spacing))
    n_lon = int(round((lon_max - lon_min) / spacing))
    points = []
    for i in range(n_lat + 1):
        for j in range(n_lon + 1):
            points.append((round(lat_min + i * spacing, 4), round(lon_min + j * spacing, 4)))
    if len(points) > cap:
        step = math.ceil(len(points) / cap)
        points = points[::step][:cap]
    return points


NEIGHBOUR_KEYS = [(di, dj) for di in (-1, 0, 1) for dj in (-1, 0, 1)]


def slope_roughness(z: dict, lat: float, step_deg: float):
    """
    z maps (di, dj) -> elevation in metres, where di is north steps and dj is east steps.
    Slope = arctan(|gradient|) from central differences. Roughness = population std dev of the 9 values.
    Returns None if any of the 9 values is missing.
    """
    if any(z.get(k) is None for k in NEIGHBOUR_KEYS):
        return None
    dy = step_deg * 110574.0
    dx = step_deg * 111320.0 * math.cos(math.radians(lat))
    dzdx = (z[(0, 1)] - z[(0, -1)]) / (2 * dx)
    dzdy = (z[(1, 0)] - z[(-1, 0)]) / (2 * dy)
    slope = math.degrees(math.atan(math.hypot(dzdx, dzdy)))
    rough = pstdev([z[k] for k in NEIGHBOUR_KEYS])
    return {"slope_deg": round(slope, 2), "roughness_m": round(rough, 2)}
