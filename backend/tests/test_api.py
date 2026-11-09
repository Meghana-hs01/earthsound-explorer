"""API tests. Need FastAPI installed (pip install -r requirements.txt). Upstream calls are never made."""
import pytest

pytest.importorskip("fastapi")
from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
from services import reference  # noqa: E402
from services.netcache import UpstreamError  # noqa: E402


@pytest.fixture
def client(tmp_path, monkeypatch):
    # Point the candidate cache at an empty temp folder so tests never touch real results.
    monkeypatch.setattr(reference, "CACHE_DIR", tmp_path)
    monkeypatch.setattr(reference, "CANDIDATE_CACHE", tmp_path / "earth_candidates.json")
    return TestClient(main.app)


def test_health(client):
    assert client.get("/api/health").json() == {"status": "ok"}


def test_targets_lists_moon_and_mars(client):
    body = client.get("/api/targets").json()
    assert body["moon"] and body["mars"]


def test_reference_profile_lists_missing_values(client):
    body = client.get("/api/reference/jezero").json()
    assert "roughness_m" in body["missing_values"]


def test_unknown_reference_is_404(client):
    assert client.get("/api/reference/nope").status_code == 404


def test_candidates_before_analysis_is_409(client):
    r = client.get("/api/candidates", params={"target": "mars", "region": "jezero"})
    assert r.status_code == 409


def test_bad_target_is_422(client):
    r = client.get("/api/candidates", params={"target": "venus", "region": "jezero"})
    assert r.status_code == 422


def test_pdf_report_is_refused_honestly(client):
    r = client.get("/api/report/x", params={"target": "mars", "region": "jezero", "format": "pdf"})
    assert r.status_code == 422


def test_latitude_out_of_range_is_422(client):
    assert client.get("/api/environment", params={"lat": 95, "lon": 0}).status_code == 422


def test_historical_point_rejects_future_end_year(client):
    r = client.get("/api/historical/point", params={"lat": 0, "lon": 0, "start_year": 1990, "end_year": 2999})
    assert r.status_code == 422


def test_upstream_failure_returns_502(client, monkeypatch):
    async def boom(*_a, **_k):
        raise UpstreamError("NASA POWER hourly", "simulated outage for test")

    monkeypatch.setattr(main.jukebox, "environment", boom)
    r = client.get("/api/environment", params={"lat": 22.7, "lon": 75.9})
    assert r.status_code == 502
    assert "simulated outage" in r.json()["detail"]


def test_explain_works_without_candidates(client):
    r = client.post("/api/explain", json={"question": "Why is the Atacama Desert considered a Mars analog?"})
    assert r.status_code == 200
    body = r.json()
    assert body["verified_data"]
    assert body["limitations"]


def test_explain_unsupported_question_returns_help(client):
    body = client.post("/api/explain", json={"question": "What is the weather on Venus today?"}).json()
    assert body["supported_questions"]
