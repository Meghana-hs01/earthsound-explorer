"""Live and historical values for the Environmental Sound module. Needs network access."""
from __future__ import annotations

import datetime as dt

from . import netcache, parse

POWER_HOURLY = "https://power.larc.nasa.gov/api/temporal/hourly/point"
POWER_DAILY = "https://power.larc.nasa.gov/api/temporal/daily/point"
POWER_MONTHLY = "https://power.larc.nasa.gov/api/temporal/monthly/point"
OPEN_METEO_FORECAST = "https://api.open-meteo.com/v1/forecast"
OPEN_METEO_AQ = "https://air-quality-api.open-meteo.com/v1/air-quality"
GISTEMP_URL = "https://data.giss.nasa.gov/gistemp/tabledata_v4/GLB.Ts+dSST.csv"
LAG_DAYS = 2  # NASA POWER reanalysis lags real time by about two days


def _now() -> str:
    return dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _last_available_day() -> dt.date:
    return dt.datetime.now(dt.timezone.utc).date() - dt.timedelta(days=LAG_DAYS)


async def environment(lat: float, lon: float) -> dict:
    end = _last_available_day()
    start = end - dt.timedelta(days=3)
    data = await netcache.fetch_json(
        "NASA POWER hourly",
        POWER_HOURLY,
        {"parameters": "T2M,RH2M,QV2M,WS2M", "community": "ag", "latitude": lat, "longitude": lon,
         "start": start.strftime("%Y%m%d"), "end": end.strftime("%Y%m%d"), "format": "JSON"},
        ttl=900,
    )
    variables = parse.parse_hourly_latest(data["properties"]["parameter"])
    for meta in variables.values():
        meta["source"] = "NASA POWER hourly point API (community ag)"
        meta["latency_class"] = "lagged_reanalysis"

    pm25 = await _pm25(lat, lon)
    return {
        "location": {"lat": lat, "lon": lon},
        "latency_class": "lagged_reanalysis",
        "source": "NASA POWER hourly point API, community ag. Lags real time by about 2 days.",
        "fetched_at_utc": _now(),
        "variables": variables,
        "pm25": pm25,
    }


async def _pm25(lat: float, lon: float) -> dict:
    try:
        data = await netcache.fetch_json("Open-Meteo air quality", OPEN_METEO_AQ,
                                         {"latitude": lat, "longitude": lon, "current": "pm2_5"}, ttl=900)
        cur = data.get("current") or {}
        value = cur.get("pm2_5")
        t = cur.get("time")
        return {
            "value": parse.clean(value, 1) if parse.is_valid(value) else None,
            "unit": "µg/m³",
            "observed_at_utc": (t + ":00Z") if t and len(t) == 16 else t,
            "source": "Open-Meteo air-quality API, CAMS model output (not a ground station)",
            "latency_class": "model",
            "status": "ok" if parse.is_valid(value) else "no_valid_data",
        }
    except netcache.UpstreamError as e:
        return {"value": None, "unit": "µg/m³", "observed_at_utc": None,
                "source": "Open-Meteo air-quality API", "latency_class": "model",
                "status": f"unavailable: {e}"}


async def current(lat: float, lon: float) -> dict:
    data = await netcache.fetch_json(
        "Open-Meteo forecast",
        OPEN_METEO_FORECAST,
        {"latitude": lat, "longitude": lon, "current": "temperature_2m,relative_humidity_2m,wind_speed_10m",
         "wind_speed_unit": "ms", "timezone": "UTC"},
        ttl=900,
    )
    parsed = parse.parse_current(data)
    return {
        "location": {"lat": lat, "lon": lon},
        "latency_class": "live_model",
        "source": "Open-Meteo forecast API, current values. Weather model output, NOT a NASA observation.",
        "fetched_at_utc": _now(),
        "observed_at_utc": parsed["observed_at_utc"],
        "variables": {
            "temperature_c": parsed["temperature_c"],
            "relative_humidity_pct": parsed["relative_humidity_pct"],
            "wind_speed_ms": parsed["wind_speed_ms"],
        },
    }


async def series(lat: float, lon: float, days: int) -> dict:
    end = _last_available_day()
    start = end - dt.timedelta(days=days - 1)
    data = await netcache.fetch_json(
        "NASA POWER daily",
        POWER_DAILY,
        {"parameters": "T2M,RH2M,QV2M,WS2M", "community": "ag", "latitude": lat, "longitude": lon,
         "start": start.strftime("%Y%m%d"), "end": end.strftime("%Y%m%d"), "format": "JSON"},
        ttl=900,
    )
    return {
        "location": {"lat": lat, "lon": lon},
        "latency_class": "lagged_reanalysis",
        "source": "NASA POWER daily point API, community ag",
        "fetched_at_utc": _now(),
        "series": parse.daily_series(data["properties"]["parameter"]),
    }


async def historical_global() -> dict:
    text = await netcache.fetch_text("NASA GISTEMP", GISTEMP_URL)
    rows = parse.parse_gistemp_csv(text)
    return {
        "source": "NASA GISS GISTEMP v4, GLB.Ts+dSST.csv, J-D annual mean",
        "baseline": "1951-1980",
        "latency_class": "historical",
        "fetched_at_utc": _now(),
        "series": rows,
    }


async def historical_point(lat: float, lon: float, start_year: int, end_year: int) -> dict:
    data = await netcache.fetch_json(
        "NASA POWER monthly",
        POWER_MONTHLY,
        {"parameters": "T2M", "community": "ag", "latitude": lat, "longitude": lon,
         "start": start_year, "end": end_year, "format": "JSON"},
        ttl=86400,
    )
    annual = parse.annual_means(data["properties"]["parameter"]["T2M"])
    rows = [{"year": y, "mean_temperature_c": parse.clean(v), "months_used": 12}
            for y, v in sorted(annual.items())]
    return {
        "source": "NASA POWER monthly point API, T2M, community ag",
        "latency_class": "historical",
        "fetched_at_utc": _now(),
        "location": {"lat": lat, "lon": lon},
        "series": rows,
    }
