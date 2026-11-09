# EarthExplorer

Earth analog discovery for future Moon and Mars missions.

EarthExplorer is a web application for identifying Earth locations that best serve as analog environments for future Moon and Mars missions.

Built for NASA Space Apps Challenge 2026, Challenge 10: Identify Earth Locations that Analog the Permanent Moon Base Locations and Mars.

## Project Summary

EarthExplorer helps mission planners, researchers, and field teams find the most promising Earth-based analog environments for lunar and Martian exploration. By combining climate, terrain, and environmental data with planetary reference values, the platform ranks candidate Earth sites against Moon and Mars target conditions and highlights the strongest matches.

## Why It Matters

Selecting the right analog site is critical for testing equipment, procedures, habitat concepts, and exploration workflows before deployment in extreme extraterrestrial environments. EarthExplorer makes this process more transparent, faster, and evidence-driven by turning scattered datasets into a clear comparison and scoring workflow.

## Overview

Mission planning for lunar and Martian exploration requires testing environments that resemble extreme planetary conditions. Earth contains many candidate regions, but identifying the best analog sites manually is difficult and time-consuming.

EarthExplorer solves this by combining environmental and terrain data with planetary reference values to rank Earth locations against Moon and Mars target regions. The platform evaluates candidate sites using a transparent scoring model and explains why each place is a strong or weak analog.

## Features

- Earth candidate discovery
- Moon and Mars reference comparison
- weighted scientific scoring model
- confidence and coverage metrics
- explainable analog reasoning
- environmental data exploration
- CSV report export
- comparison dashboard

## Tech Stack

- Backend: Python, FastAPI
- Frontend: React, Vite
- Data sources: NASA POWER, Open-Meteo, planetary reference datasets
- Testing: pytest

## Project Structure

- backend/ — API, scoring logic, and reference data
- frontend/ — React user interface
- backend/data/ — scoring configuration and reference datasets
- backend/cache/ — cached candidate results
- backend/tests/ — automated tests

## How It Works

1. Candidate Earth locations are gathered from environmental datasets.
2. A Moon or Mars reference region is selected.
3. Earth candidates are ranked against the target region using a weighted similarity model.
4. Results include confidence, coverage, and explanation details.
5. Users can compare results and export reports for planning.

## Run on Windows (Command Prompt)

**Window 1: backend**

```bash
cd /d "C:\Users\Meghana\OneDrive\Desktop\PROJECTS\earthexplorer\backend"
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
pytest -q
uvicorn main:app --reload --port 8000
```

**Window 2: frontend**

```bash
cd /d "C:\Users\Meghana\OneDrive\Desktop\PROJECTS\earthexplorer\frontend"
npm install
npm run dev
```

Open http://localhost:5173 and press Ctrl+F5 after changes. Backend health check: http://127.0.0.1:8000/api/health should return {"status":"ok"}.

## Data Sources

| Dataset | Used for | Latency |
|---|---|---|
| NASA POWER monthly | Earth climate normals | Reanalysis |
| NASA POWER hourly and daily | Jukebox readings and frames | About 2 days |
| Open-Meteo elevation | Elevation, slope and roughness | Static |
| Open-Meteo forecast and air quality | Live model values and PM2.5 | Model output |
| NASA GIBS | Map imagery | Daily visual |
| NASA GISTEMP v4 | Global anomaly data | Historical |
| Planetary reference values | Moon and Mars profiles | Only where cited |

## How the Score Works

For each criterion with both an Earth value and a reference value:

- numeric: similarity = 1 − min(1, |x − r| / scale)
- categorical: 1 if the same class, 0.5 if listed as related, otherwise 0

The score is then weighted and normalized across the available comparable criteria.

## Limitations

- Earth cannot reproduce lunar gravity, lunar vacuum, Martian pressure, radiation, or exact regolith conditions.
- NASA POWER is a grid-cell reanalysis product, not a station measurement.
- PM2.5 values are model-based, not ground-station observations.
- Terrain metrics are proxies derived from DEM sampling.
- The explanation system is template-based and not a generative language model.
- PDF reports are not included; CSV exports are provided.

## Tests

`pytest -q` in the backend directory runs the scoring, parsing, reference-data, ranking, and API tests without making external network calls.

## Use Case

EarthExplorer is designed to support mission planning, analog site selection, and scientific comparison for lunar and Martian exploration. It helps researchers identify promising Earth environments for testing equipment, procedures, and concept validation before deployment in extreme extraterrestrial settings.
