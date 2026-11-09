"""Ranks cached Earth candidates against one planetary reference region. Pure, no network."""
from __future__ import annotations

from . import reference, scoring


def rank_candidates(candidates: list[dict], target: str, region_id: str,
                    overrides: dict | None = None, min_coverage: float = 0.0) -> dict:
    region = reference.get_region(region_id)  # KeyError -> 404 in the API
    if region["body"] != target:
        raise ValueError(f"region '{region_id}' is a {region['body']} region, not {target}")

    config = reference.scoring_config()
    rows = []
    for cand in candidates:
        result = scoring.score_candidate(cand["values"], region["parameters"], config, overrides)
        if result["coverage_pct"] < min_coverage * 100:
            continue
        rows.append({
            "candidate_id": cand["id"],
            "name": cand["name"],
            "lat": cand["lat"],
            "lon": cand["lon"],
            "region_id": cand["region_id"],
            "status": cand["status"],
            "known_analog": cand.get("known_analog"),
            **result,
        })

    rows.sort(key=lambda r: (r["score_pct"] is None, -(r["score_pct"] or 0), r["candidate_id"]))
    for rank, row in enumerate(rows, start=1):
        row["rank"] = rank if row["score_pct"] is not None else None

    return {
        "target": target,
        "reference_region": {"id": region["id"], "name": region["name"], "coordinate_verified": region["coordinate_verified"]},
        "count": len(rows),
        "ranked": rows,
    }
