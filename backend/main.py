"""EarthExplorer API. Run from the backend folder: uvicorn main:app --port 8000"""
from __future__ import annotations

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, PlainTextResponse

from models import AnalyzeRequest, CompareRequest, ExplainRequest, ScoreRequest
from services import explain as explain_svc
from services import jukebox, pipeline, ranking, reference, reports, scoring
from services.netcache import UpstreamError

app = FastAPI(title="EarthExplorer API", version="2.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.exception_handler(UpstreamError)
async def upstream_handler(_: Request, exc: UpstreamError):
    return JSONResponse(status_code=502, content={"detail": str(exc)})


@app.exception_handler(ValueError)
async def value_handler(_: Request, exc: ValueError):
    return JSONResponse(status_code=422, content={"detail": str(exc)})


def _require_candidates() -> dict:
    cache = reference.load_candidate_cache()
    if cache is None:
        raise HTTPException(409, "No Earth candidates yet. Run candidate discovery first (Explorer page, or POST /api/analyze).")
    return cache


def _check_lat_lon(lat: float, lon: float) -> None:
    if not -90 <= lat <= 90:
        raise HTTPException(422, "lat must be between -90 and 90")
    if not -180 <= lon <= 180:
        raise HTTPException(422, "lon must be between -180 and 180")


def _region_or_404(region_id: str) -> dict:
    try:
        return reference.get_region(region_id)
    except KeyError:
        raise HTTPException(404, f"unknown region '{region_id}'")


# ---------- status and reference ----------

@app.get("/api/health")
async def health():
    return {"status": "ok"}


@app.get("/api/status")
async def status():
    cache = reference.load_candidate_cache()
    return {
        "candidates_cached": bool(cache),
        "generated_utc": cache["generated_utc"] if cache else None,
        "attempted": cache["attempted"] if cache else None,
        "kept": cache["kept"] if cache else None,
        "dropped": cache["dropped"] if cache else None,
        "method": cache["method"] if cache else None,
        "datasets_used": sum(1 for d in reference.sources() if d["status"].startswith("used")),
    }


@app.get("/api/targets")
async def targets():
    out = {"moon": [], "mars": []}
    for region in reference.reference_regions():
        out[region["body"]].append({
            "id": region["id"], "name": region["name"], "lat": region["lat"], "lon": region["lon"],
            "coordinate_verified": region["coordinate_verified"], "description": region["description"],
        })
    return out


@app.get("/api/reference/{region_id}")
async def reference_profile(region_id: str):
    region = _region_or_404(region_id)
    params = region["parameters"]
    missing = [k for k, p in params.items() if p["value"] is None]
    return {**region, "missing_values": missing,
            "warning": "Values are null until a citation is recorded. Null values are excluded from scoring."}


@app.get("/api/sources")
async def sources():
    return {"datasets": reference.sources()}


@app.get("/api/scoring/config")
async def scoring_config():
    return reference.scoring_config()


# ---------- Earth candidates and scoring ----------

@app.post("/api/analyze")
async def analyze(body: AnalyzeRequest):
    summary = await pipeline.build_candidates(max_per_region=body.max_per_region, spacing=body.spacing_deg)
    return summary


@app.get("/api/candidates")
async def candidates(
    target: str = Query(..., pattern="^(moon|mars)$"),
    region: str = Query(...),
    min_coverage: float = Query(0.0, ge=0.0, le=1.0),
):
    _region_or_404(region)
    cache = _require_candidates()
    return ranking.rank_candidates(cache["candidates"], target, region, min_coverage=min_coverage)


@app.get("/api/candidate/{candidate_id}")
async def candidate_detail(candidate_id: str):
    cache = _require_candidates()
    cand = next((c for c in cache["candidates"] if c["id"] == candidate_id), None)
    if not cand:
        raise HTTPException(404, f"unknown candidate '{candidate_id}'")
    return {**cand, "limitations": explain_svc.LIMITATIONS, "method": cache["method"]}


@app.post("/api/score")
async def score(body: ScoreRequest):
    region = _region_or_404(body.region)
    if region["body"] != body.target:
        raise HTTPException(422, f"region '{body.region}' is a {region['body']} region")
    cache = _require_candidates()
    cand = next((c for c in cache["candidates"] if c["id"] == body.candidate_id), None)
    if not cand:
        raise HTTPException(404, f"unknown candidate '{body.candidate_id}'")
    result = scoring.score_candidate(cand["values"], region["parameters"], reference.scoring_config(), body.weights)
    return {"candidate_id": cand["id"], "target": body.target, "region": body.region, **result,
            "limitations": explain_svc.LIMITATIONS}


@app.post("/api/compare")
async def compare(body: CompareRequest):
    moon = _region_or_404(body.moon_region)
    mars = _region_or_404(body.mars_region)
    if moon["body"] != "moon" or mars["body"] != "mars":
        raise HTTPException(422, "moon_region must be a Moon region and mars_region a Mars region")
    cache = _require_candidates()
    cand = next((c for c in cache["candidates"] if c["id"] == body.earth_id), None)
    if not cand:
        raise HTTPException(404, f"unknown candidate '{body.earth_id}'")

    rows = []
    for key in ["elevation_m", "slope_deg", "roughness_m", "temp_mean_c", "diurnal_range_c",
                "rh_mean_pct", "precip_mm_yr", "ndvi", "geology_class"]:
        m = moon["parameters"].get(key, {})
        r = mars["parameters"].get(key, {})
        rows.append({
            "parameter": key,
            "earth": cand["values"].get(key),
            "moon": m.get("value"), "moon_status": m.get("status", "not in reference data") if m.get("value") is None else "ok",
            "mars": r.get("value"), "mars_status": r.get("status", "not in reference data") if r.get("value") is None else "ok",
            "unit": m.get("unit") or r.get("unit") or "",
        })
    return {"earth": {"id": cand["id"], "name": cand["name"], "status": cand["status"]},
            "moon_region": moon["name"], "mars_region": mars["name"], "rows": rows,
            "limitations": explain_svc.LIMITATIONS}


@app.post("/api/explain")
async def explain(body: ExplainRequest):
    catalogue = reference.analog_catalogue()
    context: dict = {}
    cache = reference.load_candidate_cache()

    if body.candidate_id and cache:
        cand = next((c for c in cache["candidates"] if c["id"] == body.candidate_id), None)
        if cand:
            context["candidate"] = cand
            if body.target and body.region:
                region = _region_or_404(body.region)
                context["region"] = region
                context["score"] = scoring.score_candidate(cand["values"], region["parameters"],
                                                           reference.scoring_config(), body.weights)
    if cache and "moon" in body.question.lower():
        context["ranked_moon"] = ranking.rank_candidates(cache["candidates"], "moon", "shackleton")["ranked"]
    return explain_svc.explain(body.question, catalogue, context)


@app.get("/api/report/{candidate_id}")
async def report(candidate_id: str,
                 target: str = Query(..., pattern="^(moon|mars)$"),
                 region: str = Query(...),
                 format: str = Query("csv", pattern="^(csv|pdf)$")):
    if format == "pdf":
        raise HTTPException(422, "PDF reports are not part of this version. Use format=csv.")
    region_rec = _region_or_404(region)
    if region_rec["body"] != target:
        raise HTTPException(422, f"region '{region}' is a {region_rec['body']} region")
    cache = _require_candidates()
    cand = next((c for c in cache["candidates"] if c["id"] == candidate_id), None)
    if not cand:
        raise HTTPException(404, f"unknown candidate '{candidate_id}'")
    row = scoring.score_candidate(cand["values"], region_rec["parameters"], reference.scoring_config())
    row = {**row}
    text = reports.build_csv(target, region_rec, row, cand)
    filename = f"earthexplorer_{candidate_id}_{target}_{region}.csv"
    return PlainTextResponse(text, media_type="text/csv",
                             headers={"Content-Disposition": f'attachment; filename="{filename}"'})


# ---------- Environmental Sound (Jukebox) ----------

@app.get("/api/environment")
async def environment(lat: float, lon: float):
    _check_lat_lon(lat, lon)
    return await jukebox.environment(lat, lon)


@app.get("/api/current")
async def current(lat: float, lon: float):
    _check_lat_lon(lat, lon)
    return await jukebox.current(lat, lon)


@app.get("/api/series")
async def series(lat: float, lon: float, days: int = Query(14, ge=1, le=31)):
    _check_lat_lon(lat, lon)
    return await jukebox.series(lat, lon, days)


@app.get("/api/historical/global")
async def historical_global():
    return await jukebox.historical_global()


@app.get("/api/historical/point")
async def historical_point(lat: float, lon: float, start_year: int = Query(..., ge=1981),
                           end_year: int = Query(...)):
    _check_lat_lon(lat, lon)
    from datetime import datetime, timezone
    this_year = datetime.now(timezone.utc).year
    if end_year < start_year:
        raise HTTPException(422, "end_year must be at or after start_year")
    if end_year > this_year - 1:
        raise HTTPException(422, f"end_year must not be after {this_year - 1} (last full year)")
    if end_year - start_year + 1 > 50:
        raise HTTPException(422, "span must be at most 50 years")
    return await jukebox.historical_point(lat, lon, start_year, end_year)


# ---------- Serve Frontend UI (Single App Mode) ----------
from pathlib import Path
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

DIST_DIR = Path(__file__).resolve().parent.parent / "frontend" / "dist"
if DIST_DIR.exists() and (DIST_DIR / "assets").exists():
    app.mount("/assets", StaticFiles(directory=DIST_DIR / "assets"), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        if full_path.startswith("api"):
            raise HTTPException(404, f"API route not found: /{full_path}")
        file_path = DIST_DIR / full_path
        if file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(DIST_DIR / "index.html")

