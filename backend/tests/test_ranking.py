import pytest

from services import ranking, reference


def _candidates():
    # Synthetic records for logic tests only. They are not real measurements.
    base = {"lat": 0.0, "lon": 0.0, "region_id": "test", "status": "candidate, not confirmed analog",
            "known_analog": None, "name": "test"}
    return [
        {**base, "id": "a", "values": {"elevation_m": 500, "slope_deg": 1, "roughness_m": 5,
                                       "temp_mean_c": 20, "precip_mm_yr": 100, "rh_mean_pct": 40,
                                       "ndvi": None, "geology_class": None}},
        {**base, "id": "b", "values": {"elevation_m": None, "slope_deg": None, "roughness_m": None,
                                       "temp_mean_c": None, "precip_mm_yr": None, "rh_mean_pct": None,
                                       "ndvi": None, "geology_class": None}},
    ]


def test_wrong_body_raises_value_error():
    with pytest.raises(ValueError):
        ranking.rank_candidates(_candidates(), "moon", "jezero")


def test_unknown_region_raises_key_error():
    with pytest.raises(KeyError):
        ranking.rank_candidates(_candidates(), "mars", "nowhere")


def test_candidates_without_scores_are_ranked_last_and_unranked():
    out = ranking.rank_candidates(_candidates(), "mars", "jezero")
    ids = [r["candidate_id"] for r in out["ranked"]]
    assert ids == ["a", "b"]
    assert out["ranked"][1]["score_pct"] is None
    assert out["ranked"][1]["rank"] is None


def test_min_coverage_filters_rows():
    out = ranking.rank_candidates(_candidates(), "mars", "jezero", min_coverage=0.5)
    assert out["count"] == 0  # no reference values are cited yet, so coverage is 0


def test_ranking_is_deterministic():
    a = ranking.rank_candidates(_candidates(), "mars", "gale")
    b = ranking.rank_candidates(_candidates(), "mars", "gale")
    assert a == b
