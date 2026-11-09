const BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000';

async function readBody(res) {
  let body = {};
  try {
    body = await res.json();
  } catch {
    body = {};
  }
  if (!res.ok) {
    const d = body.detail;
    const message = typeof d === 'string'
      ? d
      : Array.isArray(d)
        ? d.map((x) => x.msg).join('; ')
        : `Backend returned HTTP ${res.status}`;
    throw new Error(message);
  }
  return body;
}

async function get(path) {
  let res;
  try {
    res = await fetch(BASE + path);
  } catch {
    throw new Error(`Cannot reach the backend at ${BASE}. Is FastAPI running?`);
  }
  return readBody(res);
}

async function post(path, data) {
  let res;
  try {
    res = await fetch(BASE + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  } catch {
    throw new Error(`Cannot reach the backend at ${BASE}. Is FastAPI running?`);
  }
  return readBody(res);
}

export const api = {
  health: () => get('/api/health'),
  status: () => get('/api/status'),
  targets: () => get('/api/targets'),
  reference: (id) => get(`/api/reference/${encodeURIComponent(id)}`),
  sources: () => get('/api/sources'),
  scoringConfig: () => get('/api/scoring/config'),
  analyze: (opts) => post('/api/analyze', opts),
  candidates: (target, region, minCoverage = 0) =>
    get(`/api/candidates?target=${target}&region=${encodeURIComponent(region)}&min_coverage=${minCoverage}`),
  candidate: (id) => get(`/api/candidate/${encodeURIComponent(id)}`),
  score: (body) => post('/api/score', body),
  compare: (body) => post('/api/compare', body),
  explain: (body) => post('/api/explain', body),
  reportUrl: (id, target, region) =>
    `${BASE}/api/report/${encodeURIComponent(id)}?target=${target}&region=${encodeURIComponent(region)}&format=csv`,
  environment: (lat, lon) => get(`/api/environment?lat=${lat}&lon=${lon}`),
  current: (lat, lon) => get(`/api/current?lat=${lat}&lon=${lon}`),
  series: (lat, lon, days = 14) => get(`/api/series?lat=${lat}&lon=${lon}&days=${days}`),
  historicalGlobal: () => get('/api/historical/global'),
  historicalPoint: (lat, lon, startYear, endYear) =>
    get(`/api/historical/point?lat=${lat}&lon=${lon}&start_year=${startYear}&end_year=${endYear}`),
};

export const gibsUrl = (date, layer = 'modis') => {
  if (layer === 'humidity') {
    return `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/AIRS_L3_Surface_Relative_Humidity_Daily_Day/default/${date}/GoogleMapsCompatible_Level6/{z}/{y}/{x}.png`;
  }
  return `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/${date}/GoogleMapsCompatible_Level6/{z}/{y}/{x}.jpg`;
};
