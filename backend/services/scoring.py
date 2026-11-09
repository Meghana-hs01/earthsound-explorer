"""
Transparent similarity scoring. Pure functions: the same inputs always give the same output.

Per criterion i:
  numeric:     s_i = 1 - min(1, |x - r| / scale)
  categorical: s_i = 1 if same class, 0.5 if listed as related, else 0
Score      = sum(w_i * s_i) / sum(w_i)   over INCLUDED criteria (weights renormalised)
Coverage   = sum(w_i over included) / sum(w_i over all criteria)
A criterion is EXCLUDED (not scored as zero) when either value is missing.
"""
from __future__ import annotations


def score_band(score_pct):
    if score_pct is None:
        return "insufficient_evidence"
    if score_pct >= 75:
        return "high"
    if score_pct >= 50:
        return "moderate"
    return "low"


def normalised_weights(config: dict, overrides: dict | None = None) -> dict:
    base = {k: float(c["weight"]) for k, c in config["criteria"].items()}
    if overrides:
        unknown = set(overrides) - set(base)
        if unknown:
            raise ValueError(f"unknown criteria in weights: {sorted(unknown)}")
        for key, value in overrides.items():
            if float(value) < 0:
                raise ValueError(f"weight for '{key}' must not be negative")  # weights are relative; they are normalised below
        base = {k: float(overrides.get(k, base[k])) for k in base}
    total = sum(base.values())
    if total <= 0:
        raise ValueError("weights must include a positive value")
    return {k: v / total for k, v in base.items()}


def _numeric_similarity(x: float, r: float, scale: float) -> float:
    return 1.0 - min(1.0, abs(x - r) / scale)


def _categorical_similarity(x, r, related) -> float:
    if x == r:
        return 1.0
    for a, b in related:
        if {x, r} == {a, b}:
            return 0.5
    return 0.0


def score_candidate(earth: dict, reference_params: dict, config: dict, overrides: dict | None = None) -> dict:
    """
    earth: {earth_key: value}, e.g. candidate["values"]
    reference_params: {ref_key: {"value": ..., "status": ...}}, e.g. region["parameters"]
    """
    weights = normalised_weights(config, overrides)
    included, excluded = [], []

    for key, cfg in config["criteria"].items():
        x = earth.get(cfg["earth_key"])
        ref = reference_params.get(cfg["ref_key"]) or {}
        r = ref.get("value")
        base = {
            "criterion": key,
            "label": cfg["label"],
            "unit": cfg.get("unit", ""),
            "dataset": cfg.get("dataset", ""),
            "weight": round(weights[key], 4),
            "earth_value": x,
            "reference_value": r,
        }
        if x is None:
            excluded.append({**base, "reason": "Earth value unavailable"})
            continue
        if r is None:
            excluded.append({**base, "reason": ref.get("status") or "reference value not in reference data"})
            continue
        if cfg["type"] == "numeric":
            s = _numeric_similarity(float(x), float(r), float(cfg["scale"]))
        else:
            s = _categorical_similarity(x, r, cfg.get("related", []))
        included.append({**base, "similarity": round(s, 4), "_key": key})

    included_w = sum(weights[i["_key"]] for i in included)
    for item in included:
        item.pop("_key")

    if not included:
        return {
            "score_pct": None,
            "band": "insufficient_evidence",
            "coverage_pct": 0.0,
            "confidence": "insufficient_evidence",
            "included": [],
            "excluded": excluded,
            "method": _method_text(),
        }

    score = sum(weights[i["criterion"]] * i["similarity"] for i in included) / included_w
    for item in included:
        item["renormalised_weight"] = round(weights[item["criterion"]] / included_w, 4)

    score_pct = round(score * 100, 1)
    coverage = round(included_w * 100, 1)
    return {
        "score_pct": score_pct,
        "band": score_band(score_pct),
        "coverage_pct": coverage,
        "confidence": "low" if included_w < 0.5 else "ok",
        "included": included,
        "excluded": excluded,
        "method": _method_text(),
    }


def _method_text() -> str:
    return (
        "score = sum(w_i x s_i) / sum(w_i) over included criteria. "
        "coverage = sum(w_i included) / sum(w_i all). "
        "Missing values are excluded, not scored as zero. Scores below 50% coverage are low confidence."
    )
