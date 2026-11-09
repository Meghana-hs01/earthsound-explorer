import pytest

from services import scoring

CONFIG = {
    "criteria": {
        "elevation": {"label": "Elevation", "weight": 0.5, "type": "numeric", "scale": 1000, "unit": "m",
                      "earth_key": "elev", "ref_key": "elev", "dataset": "test"},
        "geology": {"label": "Geology", "weight": 0.5, "type": "categorical", "unit": "class",
                    "earth_key": "geo", "ref_key": "geo", "related": [["volcanic", "impact"]], "dataset": "test"},
    }
}


def _ref(elev=None, geo=None):
    return {
        "elev": {"value": elev, "status": "ok" if elev is not None else "not in reference data"},
        "geo": {"value": geo, "status": "ok" if geo is not None else "not in reference data"},
    }


def test_identical_values_score_100():
    out = scoring.score_candidate({"elev": 500, "geo": "arid"}, _ref(500, "arid"), CONFIG)
    assert out["score_pct"] == 100.0
    assert out["coverage_pct"] == 100.0
    assert out["band"] == "high"
    assert out["confidence"] == "ok"


def test_numeric_similarity_is_linear_and_capped():
    out = scoring.score_candidate({"elev": 0, "geo": "arid"}, _ref(500, "arid"), CONFIG)
    # elevation similarity = 1 - 500/1000 = 0.5, geology = 1.0, equal weights
    assert out["score_pct"] == 75.0
    far = scoring.score_candidate({"elev": 0, "geo": "x"}, _ref(5000, "y"), CONFIG)
    assert far["included"][0]["similarity"] == 0.0


def test_related_categories_score_half():
    out = scoring.score_candidate({"elev": 500, "geo": "volcanic"}, _ref(500, "impact"), CONFIG)
    geo = next(i for i in out["included"] if i["criterion"] == "geology")
    assert geo["similarity"] == 0.5


def test_missing_reference_is_excluded_and_weights_renormalised():
    out = scoring.score_candidate({"elev": 500, "geo": "arid"}, _ref(500, None), CONFIG)
    assert out["coverage_pct"] == 50.0
    assert out["confidence"] == "ok"  # exactly 0.5 is not below the 0.5 threshold
    assert out["score_pct"] == 100.0  # only elevation scored, and it matches
    assert [e["criterion"] for e in out["excluded"]] == ["geology"]
    assert out["excluded"][0]["reason"] == "not in reference data"
    assert out["included"][0]["renormalised_weight"] == 1.0


def test_missing_earth_value_is_excluded_not_zero():
    out = scoring.score_candidate({"elev": None, "geo": "arid"}, _ref(500, "arid"), CONFIG)
    assert out["score_pct"] == 100.0
    assert out["excluded"][0]["reason"] == "Earth value unavailable"


def test_nothing_comparable_gives_insufficient_evidence():
    out = scoring.score_candidate({"elev": None, "geo": None}, _ref(None, None), CONFIG)
    assert out["score_pct"] is None
    assert out["band"] == "insufficient_evidence"
    assert out["coverage_pct"] == 0.0


def test_user_weights_are_normalised():
    w = scoring.normalised_weights(CONFIG, {"elevation": 3, "geology": 1})
    assert w["elevation"] == pytest.approx(0.75)
    assert w["geology"] == pytest.approx(0.25)


def test_bad_weights_raise():
    with pytest.raises(ValueError):
        scoring.normalised_weights(CONFIG, {"nonexistent": 1})
    with pytest.raises(ValueError):
        scoring.normalised_weights(CONFIG, {"elevation": -1})
    with pytest.raises(ValueError):
        scoring.normalised_weights(CONFIG, {"elevation": 0, "geology": 0})


def test_low_confidence_below_half_coverage():
    cfg = {"criteria": {**CONFIG["criteria"], "elevation": {**CONFIG["criteria"]["elevation"], "weight": 0.2},
                        "geology": {**CONFIG["criteria"]["geology"], "weight": 0.8}}}
    out = scoring.score_candidate({"elev": 500, "geo": "arid"}, _ref(500, None), cfg)
    assert out["coverage_pct"] == 20.0
    assert out["confidence"] == "low"


def test_scores_are_reproducible():
    a = scoring.score_candidate({"elev": 320, "geo": "impact"}, _ref(500, "volcanic"), CONFIG)
    b = scoring.score_candidate({"elev": 320, "geo": "impact"}, _ref(500, "volcanic"), CONFIG)
    assert a == b


def test_score_band_thresholds():
    assert scoring.score_band(75) == "high"
    assert scoring.score_band(50) == "moderate"
    assert scoring.score_band(49.9) == "low"
    assert scoring.score_band(None) == "insufficient_evidence"
