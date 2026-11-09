"""
Deterministic, retrieval-grounded explanations. No language model is called.
Every answer is built only from the catalogue, reference data, and computed scores passed in.
"""
from __future__ import annotations

LIMITATIONS = [
    "Earth cannot reproduce lunar gravity, lunar vacuum, Martian atmospheric pressure, planetary radiation, or exact regolith composition.",
    "Earth analogs are useful for testing equipment, procedures and specific geological processes. They are not exact substitutes for the Moon or Mars.",
    "Earth climate values come from NASA POWER reanalysis (grid-cell averages, not station measurements).",
    "Terrain metrics are derived from a 90 m DEM sampled on a 3x3 grid about 5 km wide, so they are proxies.",
    "Planetary reference values are shown only where a citation is recorded. Missing values are excluded from scoring.",
]

SUPPORTED = [
    "Why is the Atacama Desert considered a Mars analog?",
    "Which Earth locations resemble lunar polar terrain?",
    "What makes Haughton Crater useful for planetary exploration research?",
    "Why does this location get a high score?",
    "What are the main differences between this Earth site and Mars?",
    "Which characteristics make a location useful for rover testing?",
]


def _site(catalogue, site_id):
    return next((s for s in catalogue if s["id"] == site_id), None)


def _site_answer(site, topic_words):
    verified = [
        {"text": f"{site['name']}: centre about {site['lat']}, {site['lon']} (coordinates not yet verified against a gazetteer).",
         "source": site["citation"]},
        {"text": site["description"], "source": site["citation"]},
    ]
    interpretation = [
        f"This answer explains what the catalogue records about {topic_words}. "
        "The catalogue does not contain the research claims themselves, so read the cited source for the scientific argument.",
    ]
    missing = [
        "Planetary numeric values for the reference region are not entered yet, so no numeric similarity to Mars or the Moon is shown here.",
    ]
    return verified, interpretation, missing


def _score_breakdown(score):
    verified, interpretation, missing = [], [], []
    if not score:
        return verified, ["Select a candidate and a reference region to see its score breakdown."], missing
    if score.get("score_pct") is None:
        interpretation.append("No score can be calculated because too few criteria have both an Earth value and a reference value.")
    else:
        interpretation.append(
            f"Score {score['score_pct']}% ({score['band']}) with {score['coverage_pct']}% of criteria weight covered. "
            f"Confidence: {score['confidence']}."
        )
    for item in score.get("included", []):
        verified.append({
            "text": f"{item['label']}: Earth {item['earth_value']} {item['unit']} vs reference {item['reference_value']} {item['unit']}, similarity {item['similarity']}.",
            "source": item["dataset"],
        })
    for item in score.get("excluded", []):
        missing.append(f"{item['label']} excluded: {item['reason']}.")
    return verified, interpretation, missing


def _differences(candidate, region):
    verified, interpretation, missing = [], [], []
    if not candidate or not region:
        return verified, ["Select a candidate and a reference region to compare."], missing
    for key, param in region["parameters"].items():
        earth_value = candidate["values"].get(key)
        if param["value"] is not None and earth_value is not None:
            verified.append({"text": f"{key}: Earth {earth_value} vs {region['name']} {param['value']} {param['unit']}.",
                             "source": param.get("source") or region["citation"]})
        else:
            missing.append(f"{key}: {param['status']}.")
    if not verified:
        interpretation.append("No numeric difference can be stated, because the reference region has no cited numeric values yet.")
    return verified, interpretation, missing


def _rover_answer(candidate):
    verified, interpretation, missing = [], [], []
    if not candidate:
        return verified, ["Select a candidate to assess rover-testing relevance."], missing
    v = candidate["values"]
    for key, label in (("slope_deg", "terrain slope (deg)"), ("roughness_m", "surface roughness (m)"),
                       ("elevation_m", "elevation (m)")):
        if v.get(key) is not None:
            verified.append({"text": f"{label}: {v[key]}.", "source": "Open-Meteo elevation API, derived terrain metrics"})
    interpretation.append(
        "Lower slope and roughness usually mean easier traverse for wheeled test rovers. "
        "This is a general engineering statement, not a NASA finding."
    )
    missing.append("Surface hazard and rock-size data are not integrated in this version.")
    return verified, interpretation, missing


def explain(question: str, catalogue: list[dict], context: dict) -> dict:
    q = question.lower()
    verified, interpretation, missing = [], [], []

    if "atacama" in q:
        site = _site(catalogue, "atacama")
        verified, interpretation, missing = _site_answer(site, "the Atacama Desert as a dry analog site") if site else ([], ["Atacama is not in the catalogue."], [])
    elif "haughton" in q:
        site = _site(catalogue, "haughton")
        verified, interpretation, missing = _site_answer(site, "Haughton crater as a planetary-analog site") if site else ([], ["Haughton is not in the catalogue."], [])
    elif "lunar" in q or "moon" in q and "resemble" in q:
        ranked = context.get("ranked_moon") or []
        if not ranked:
            interpretation.append("No ranking is available. Run candidate discovery, then choose a Moon reference region.")
        for row in ranked[:5]:
            verified.append({"text": f"{row['name']}: score {row['score_pct']}%, coverage {row['coverage_pct']}%.",
                             "source": "Earth candidate cache, scoring engine"})
        missing.append("Lunar numeric reference values are not entered, so scores may show insufficient evidence.")
    elif "high score" in q or "why" in q and "score" in q:
        verified, interpretation, missing = _score_breakdown(context.get("score"))
    elif "differ" in q:
        verified, interpretation, missing = _differences(context.get("candidate"), context.get("region"))
    elif "rover" in q:
        verified, interpretation, missing = _rover_answer(context.get("candidate"))
    else:
        interpretation.append("This question is not one of the supported questions. Try one of the examples listed below.")

    return {
        "mode": "deterministic_template (no language model used)",
        "question": question,
        "verified_data": verified,
        "interpretation": interpretation,
        "missing_information": missing,
        "limitations": LIMITATIONS,
        "supported_questions": SUPPORTED,
    }
