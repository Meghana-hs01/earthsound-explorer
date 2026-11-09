"""Builds the Earth candidate list from live NASA POWER and Open-Meteo data. Needs network access."""
from __future__ import annotations

import asyncio
import datetime as dt

from . import netcache, parse, reference
from .netcache import UpstreamError

POWER_MONTHLY = "https://power.larc.nasa.gov/api/temporal/monthly/point"
ELEVATION = "https://api.open-meteo.com/v1/elevation"
CLIMATE_PARAMS = "T2M,T2M_MAX,T2M_MIN,RH2M,PRECTOTCORR"
NEIGHBOUR_STEP_DEG = 0.05
KNOWN_ANALOG_RADIUS_DEG = 1.5
MIN_CLIMATE_YEARS = 8


def climate_window() -> tuple[int, int]:
    last_full = dt.datetime.now(dt.timezone.utc).year - 1
    return last_full - 9, last_full


def match_known_analog(lat: float, lon: float) -> str | None:
    for site in reference.analog_catalogue():
        if abs(lat - site["lat"]) <= KNOWN_ANALOG_RADIUS_DEG and abs(lon - site["lon"]) <= KNOWN_ANALOG_RADIUS_DEG:
            return site["id"]
    return None


async def _fetch_elevations(points: list[tuple[float, float]]) -> list:
    data = await netcache.fetch_json(
        "Open-Meteo elevation",
        ELEVATION,
        {"latitude": ",".join(str(p[0]) for p in points), "longitude": ",".join(str(p[1]) for p in points)},
        ttl=86400,
    )
    elevations = data.get("elevation")
    if not isinstance(elevations, list) or len(elevations) != len(points):
        raise UpstreamError("Open-Meteo elevation", "unexpected response shape")
    return elevations


async def _fetch_climate(lat: float, lon: float) -> dict:
    start, end = climate_window()
    data = await netcache.fetch_json(
        "NASA POWER",
        POWER_MONTHLY,
        {"parameters": CLIMATE_PARAMS, "community": "ag", "latitude": lat, "longitude": lon,
         "start": start, "end": end, "format": "JSON"},
        ttl=86400,
    )
    try:
        params = data["properties"]["parameter"]
    except (KeyError, TypeError) as e:
        raise UpstreamError("NASA POWER", "unexpected response shape") from e
    return parse.climate_summary(params)


async def build_candidates(max_per_region: int = 40, spacing: float = 1.0) -> dict:
    sem = asyncio.Semaphore(3)  # be gentle with public APIs
    dropped = {"upstream_unavailable": 0, "insufficient_terrain_data": 0, "insufficient_climate_years": 0}
    errors: list[str] = []
    jobs = []
    for region in reference.search_regions():
        for lat, lon in parse.grid_points(region["bbox"], spacing, max_per_region):
            jobs.append((region, lat, lon))

    async def one(region, lat, lon):
        async with sem:
            keys = parse.NEIGHBOUR_KEYS
            pts = [(round(lat + di * NEIGHBOUR_STEP_DEG, 5), round(lon + dj * NEIGHBOUR_STEP_DEG, 5)) for di, dj in keys]
            try:
                elevations = await _fetch_elevations(pts)
                climate = await _fetch_climate(lat, lon)
            except UpstreamError as e:
                dropped["upstream_unavailable"] += 1
                if len(errors) < 10:
                    errors.append(str(e))
                return None

        z = {k: (float(v) if isinstance(v, (int, float)) else None) for k, v in zip(keys, elevations)}
        terrain = parse.slope_roughness(z, lat, NEIGHBOUR_STEP_DEG)
        if terrain is None:
            dropped["insufficient_terrain_data"] += 1
            return None
        if climate["years_used"] < MIN_CLIMATE_YEARS:
            dropped["insufficient_climate_years"] += 1
            return None

        known = match_known_analog(lat, lon)
        return {
            "id": f"{region['id']}_{lat:.2f}_{lon:.2f}",
            "name": f"{region['name']} ({lat:.2f}, {lon:.2f})",
            "region_id": region["id"],
            "region_name": region["name"],
            "lat": lat,
            "lon": lon,
            "geology_class": region["geology_class"],
            "known_analog": known,
            "status": f"known analog: {known}" if known else "candidate, not confirmed analog",
            "values": {
                "elevation_m": z[(0, 0)],
                "slope_deg": terrain["slope_deg"],
                "roughness_m": terrain["roughness_m"],
                "temp_mean_c": climate["temp_mean_c"],
                "diurnal_range_c": climate["diurnal_range_c"],
                "rh_mean_pct": climate["rh_mean_pct"],
                "precip_mm_yr": climate["precip_mm_yr"],
                "ndvi": None,
                "geology_class": region["geology_class"],
            },
            "climate_years": climate["years"],
            "years_used": climate["years_used"],
        }

    results = await asyncio.gather(*(one(*job) for job in jobs))
    candidates = [c for c in results if c is not None]
    start, end = climate_window()

    data = {
        "generated_utc": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "method": {
            "grid_spacing_deg": spacing,
            "max_points_per_region": max_per_region,
            "terrain": f"3x3 neighbours at {NEIGHBOUR_STEP_DEG} deg spacing; slope and roughness derived",
            "climate": f"NASA POWER monthly, {start}-{end}, full years only",
            "geology": "assigned from the search region, not measured",
            "ndvi": "not integrated; criterion excluded",
        },
        "attempted": len(jobs),
        "kept": len(candidates),
        "dropped": dropped,
        "errors": errors,
        "candidates": candidates,
    }
    reference.save_candidate_cache(data)
    return {k: data[k] for k in ("generated_utc", "attempted", "kept", "dropped", "errors", "method")}
