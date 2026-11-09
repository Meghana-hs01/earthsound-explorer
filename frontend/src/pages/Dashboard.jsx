import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { BandBadge, ErrorBox, Loading, ScoreText } from '../components/ui.jsx';

export default function Dashboard({ target, regionId, targets, goto, setCandidateId }) {
  const [status, setStatus] = useState(null);
  const [ranked, setRanked] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.status().then(setStatus).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!regionId || !status?.candidates_cached) return;
    api.candidates(target, regionId, 0)
      .then((r) => setRanked(r))
      .catch((e) => setError(e.message));
  }, [target, regionId, status]);

  const regionName = targets?.[target]?.find((r) => r.id === regionId)?.name;

  return (
    <>
      <h1 className="page-title">Dashboard</h1>
      <p className="page-sub">Live status of the analysis. Numbers come from the backend and its cached results.</p>
      <ErrorBox error={error} />

      {!status && !error && <Loading />}
      {status && (
        <div className="grid grid-4" style={{ marginBottom: 16 }}>
          <div className="card">
            <div className="stat-label">Candidates analysed</div>
            <div className="stat-value">{status.kept ?? '—'}</div>
            <div className="muted">{status.attempted != null ? `of ${status.attempted} grid points tried` : 'Run discovery first'}</div>
          </div>
          <div className="card">
            <div className="stat-label">Moon reference regions</div>
            <div className="stat-value">{targets?.moon?.length ?? '—'}</div>
            <div className="muted">Values are added only with citations</div>
          </div>
          <div className="card">
            <div className="stat-label">Mars reference regions</div>
            <div className="stat-value">{targets?.mars?.length ?? '—'}</div>
            <div className="muted">Values are added only with citations</div>
          </div>
          <div className="card">
            <div className="stat-label">Datasets in use</div>
            <div className="stat-value">{status.datasets_used}</div>
            <div className="muted">See Scientific Data Center</div>
          </div>
        </div>
      )}

      {status && !status.candidates_cached && (
        <div className="notice warn">
          No Earth candidates have been analysed yet. Open <button className="btn secondary" onClick={() => goto('explorer')}>Earth Analog Explorer</button> and press “Run candidate discovery”. This calls NASA POWER and Open-Meteo and can take a few minutes.
        </div>
      )}

      {status?.candidates_cached && (
        <div className="grid grid-2">
          <div className="card">
            <h2>Top-ranked Earth candidates for {target === 'moon' ? 'the Moon' : 'Mars'}: {regionName || '…'}</h2>
            {!ranked && <Loading />}
            {ranked && ranked.ranked.length === 0 && <p className="muted">No candidates.</p>}
            {ranked && ranked.ranked.length > 0 && (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>#</th><th>Candidate</th><th>Score</th><th>Band</th><th>Coverage</th></tr></thead>
                  <tbody>
                    {ranked.ranked.slice(0, 8).map((r) => (
                      <tr key={r.candidate_id} className="clickable"
                        onClick={() => { setCandidateId(r.candidate_id); goto('explorer'); }}>
                        <td>{r.rank ?? '—'}</td>
                        <td>{r.name}</td>
                        <td><ScoreText row={r} /></td>
                        <td><BandBadge band={r.band} /></td>
                        <td>{r.coverage_pct}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="muted" style={{ marginTop: 8 }}>
              {ranked && ranked.ranked.every((r) => r.score_pct == null)
                ? 'No score can be calculated yet: the planetary reference region has no cited numeric values. Add citations in backend/data/reference_regions.json.'
                : 'Scores with coverage under 50% are marked low confidence.'}
            </p>
          </div>

          <div className="card">
            <h2>Latest analysis</h2>
            {status.generated_utc ? (
              <ul className="clean">
                <li>Generated (UTC): <span className="mono">{status.generated_utc}</span></li>
                <li>Grid points tried: {status.attempted}</li>
                <li>Kept: {status.kept}</li>
                <li>Dropped, upstream unavailable: {status.dropped?.upstream_unavailable}</li>
                <li>Dropped, insufficient terrain data: {status.dropped?.insufficient_terrain_data}</li>
                <li>Dropped, insufficient climate years: {status.dropped?.insufficient_climate_years}</li>
                <li>Grid spacing: {status.method?.grid_spacing_deg}°</li>
              </ul>
            ) : (
              <p className="muted">No analysis has been saved yet.</p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
