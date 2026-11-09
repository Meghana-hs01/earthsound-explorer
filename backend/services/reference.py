"""Loads JSON reference data and the saved Earth candidate cache. Pure file I/O, no network."""
from __future__ import annotations

import json
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BACKEND_DIR / "data"
CACHE_DIR = BACKEND_DIR / "cache"
CANDIDATE_CACHE = CACHE_DIR / "earth_candidates.json"


def _load(name: str):
    return json.loads((DATA_DIR / name).read_text(encoding="utf-8"))


def reference_regions() -> list[dict]:
    return _load("reference_regions.json")["regions"]


def get_region(region_id: str) -> dict:
    for region in reference_regions():
        if region["id"] == region_id:
            return region
    raise KeyError(region_id)


def analog_catalogue() -> list[dict]:
    return _load("analog_catalogue.json")["sites"]


def search_regions() -> list[dict]:
    return _load("search_regions.json")["regions"]


def scoring_config() -> dict:
    return _load("scoring_config.json")


def sources() -> list[dict]:
    return _load("sources.json")["datasets"]


def load_candidate_cache() -> dict | None:
    if not CANDIDATE_CACHE.exists():
        return None
    return json.loads(CANDIDATE_CACHE.read_text(encoding="utf-8"))


def save_candidate_cache(data: dict) -> None:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    CANDIDATE_CACHE.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
