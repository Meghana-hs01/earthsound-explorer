"""CSV report builder. Pure, no network."""
from __future__ import annotations

import csv
import io

from .explain import LIMITATIONS


def build_csv(target: str, region: dict, row: dict, candidate: dict) -> str:
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["field", "value", "unit", "source_or_note"])

    writer.writerow(["target_body", target, "", ""])
    writer.writerow(["reference_region", region["name"], "", region["citation"]])
    writer.writerow(["reference_coordinate_verified", region["coordinate_verified"], "", ""])
    writer.writerow(["candidate_id", candidate["id"], "", ""])
    writer.writerow(["candidate_name", candidate["name"], "", candidate["status"]])
    writer.writerow(["latitude", candidate["lat"], "deg", "Search grid point"])
    writer.writerow(["longitude", candidate["lon"], "deg", "Search grid point"])
    writer.writerow(["similarity_score", "" if row["score_pct"] is None else row["score_pct"], "%", row["band"]])
    writer.writerow(["data_coverage", row["coverage_pct"], "%", "Share of criteria weight with both values"])
    writer.writerow(["confidence", row["confidence"], "", ""])
    writer.writerow(["method", row["method"], "", ""])

    for item in row["included"]:
        writer.writerow([f"criterion:{item['criterion']}:earth", item["earth_value"], item["unit"], item["dataset"]])
        writer.writerow([f"criterion:{item['criterion']}:reference", item["reference_value"], item["unit"], "reference profile"])
        writer.writerow([f"criterion:{item['criterion']}:similarity", item["similarity"], "0-1", f"weight {item['renormalised_weight']}"])
    for item in row["excluded"]:
        writer.writerow([f"excluded:{item['criterion']}", item["reason"], "", item["dataset"]])

    for line in LIMITATIONS:
        writer.writerow(["limitation", line, "", ""])
    return buf.getvalue()
