export const BAND_LABEL = {
  high: 'High',
  moderate: 'Moderate',
  low: 'Low',
  insufficient_evidence: 'Insufficient evidence',
};

export const BAND_COLOUR = {
  high: '#34d399',
  moderate: '#fbbf24',
  low: '#f87171',
  insufficient_evidence: '#64748b',
};

export function BandBadge({ band }) {
  return <span className={`badge ${band || 'insufficient_evidence'}`}>{BAND_LABEL[band] || 'Insufficient evidence'}</span>;
}

export function ScoreText({ row }) {
  if (row.score_pct == null) return <span className="muted">not scored</span>;
  return <span>{row.score_pct.toFixed(1)}%</span>;
}

export function Notice({ kind = 'info', children }) {
  return <div className={`notice ${kind}`}>{children}</div>;
}

export function Loading({ children = 'Loading…' }) {
  return <p className="muted">{children}</p>;
}

export function ErrorBox({ error }) {
  if (!error) return null;
  return <Notice kind="error">{error}</Notice>;
}

// Same five limitations the backend returns (backend/services/explain.py).
export const LIMITATIONS = [
  'Earth cannot reproduce lunar gravity, lunar vacuum, Martian atmospheric pressure, planetary radiation, or exact regolith composition.',
  'Earth analogs are useful for testing equipment, procedures and specific geological processes. They are not exact substitutes for the Moon or Mars.',
  'Earth climate values come from NASA POWER reanalysis (grid-cell averages, not station measurements).',
  'Terrain metrics are derived from a 90 m DEM sampled on a 3x3 grid about 5 km wide, so they are proxies.',
  'Planetary reference values are shown only where a citation is recorded. Missing values are excluded from scoring.',
];

export function LimitationsBox() {
  return (
    <div className="card">
      <h2>Limitations</h2>
      <ul className="clean">
        {LIMITATIONS.map((l) => <li key={l}>{l}</li>)}
      </ul>
    </div>
  );
}

export const fmt = (v, digits = 2) => (v == null ? <span className="muted">no valid data</span> : Number(v).toFixed(digits));
