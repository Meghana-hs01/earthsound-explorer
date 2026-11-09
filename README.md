# EarthExplorer

Terrestrial analog discovery for the Moon and Mars, with the Earth Information Jukebox as one module.
Built for NASA Space Apps Challenge 2026, Challenge 10: *Identify Earth Locations that Analog the Permanent Moon Base Locations and Mars.*

Pages: Dashboard · Earth Analog Explorer · Moon Analog Analysis · Mars Analog Analysis · Global Discovery Map · Site Comparison · Scientific Data Center · AI Earth Intelligence · Environmental Sound · Reports and Documentation · About.

## Run on Windows (Command Prompt)

Put the project in a folder such as `C:\Users\Meghana\OneDrive\PROJECTS\earthexplorer`. Then:

**Window 1: backend**

```
cd /d "C:\Users\Meghana\OneDrive\PROJECTS\earthexplorer\backend"
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
pytest -q
uvicorn main:app --reload --port 8000
```

**Window 2: frontend**

```
cd /d "C:\Users\Meghana\OneDrive\PROJECTS\earthexplorer\frontend"
npm install
npm run dev
```

Open http://localhost:5173 and press Ctrl+F5 after changes. Backend check: http://127.0.0.1:8000/api/health should show `{"status":"ok"}`.

**Port 8000 already in use**

```
netstat -ano | findstr :8000
taskkill /PID <number from that output> /F
```

Use the number from your own output. Leave both windows open while you use the app.

## First use

1. Open **Earth Analog Explorer** and press **Run candidate discovery**. This calls NASA POWER and Open-Meteo for each grid point (up to about 150 points, a few minutes). Results are saved to `backend/cache/earth_candidates.json`.
2. Choose a Moon or Mars reference region to rank the candidates.
3. Open a row to see its score breakdown, its values with sources, and its limitations.

## Data sources

| Dataset | Used for | Latency |
|---|---|---|
| NASA POWER monthly (T2M, T2M_MAX, T2M_MIN, RH2M, PRECTOTCORR) | Earth climate normals, 2016–2025 | Reanalysis |
| NASA POWER hourly and daily | Jukebox readings and frames | Lags about 2 days |
| Open-Meteo elevation (Copernicus DEM) | Elevation, slope and roughness | Static |
| Open-Meteo forecast and air quality (CAMS) | Jukebox live model values and PM2.5 | Model output |
| NASA GIBS | Map imagery | Daily visual |
| NASA GISTEMP v4 | Global anomaly since 1880 | Historical |
| Planetary reference values | Moon and Mars profiles | Only where cited |

Full table with processing and limitations: **Scientific Data Center** page, or `backend/data/sources.json`.

## How the score works

For each criterion *i* with both an Earth value and a reference value:

- numeric: similarity = 1 − min(1, |x − r| / scale)
- categorical: 1 if the same class, 0.5 if listed as related, otherwise 0

**Score** = Σ(wᵢ × sᵢ) / Σ(wᵢ) over criteria with both values.
**Coverage** = Σ(wᵢ) over those criteria / Σ(wᵢ) over all criteria.
Coverage under 50% is marked low confidence. Missing values are excluded, never treated as zero.

Weights and scales are in `backend/data/scoring_config.json`. Weights are normalised to sum to 1.

## Adding cited Moon and Mars values

Planetary numbers are not invented. Each one must have a citation. To add one, edit `backend/data/reference_regions.json`:

```json
"slope_deg": {"value": 12.5, "unit": "deg", "source": "Author, Year, Journal, DOI or URL", "year": 2020, "status": "cited"}
```

Scores appear once a region has at least one comparable criterion. Restart the backend after editing.

Region coordinates and catalogue coordinates are marked `coordinate_warning`. Check them against the IAU Gazetteer (https://planetarynames.wr.usgs.gov/) before presenting, then set `coordinate_verified` to `true`.

## Limits

- Earth cannot reproduce lunar gravity, lunar vacuum, Martian pressure, planetary radiation or exact regolith.
- NASA POWER is grid-cell reanalysis, not a station measurement. It lags real time by about two days.
- PM2.5 is a CAMS model value, not a ground station.
- Terrain metrics come from a 90 m DEM sampled on a 3×3 grid about 5 km wide. They are proxies.
- Vegetation (NDVI) is not integrated, so it is excluded from scoring.
- The planetary PDS datasets (LOLA, Diviner, MOLA, CTX, HiRISE, CRISM) are not integrated.
- The explanation module is template-based and calls no language model.
- PDF reports are not included. CSV reports are.
- A high score means similar values on the listed criteria. It does not prove a geological analog.

## Tests

`pytest -q` in `backend/` runs the scoring, parsing, reference-data and ranking tests without network access, and the API tests when FastAPI is installed. No test calls NASA or Open-Meteo.
