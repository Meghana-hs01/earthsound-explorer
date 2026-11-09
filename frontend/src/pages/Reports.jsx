import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { ErrorBox, Loading, LimitationsBox, Notice } from '../components/ui.jsx';

export default function Reports({ target, regionId, candidateId, targets, setCandidateId }) {
  const [candidates, setCandidates] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!regionId) return;
    api.candidates(target, regionId, 0)
      .then((r) => setCandidates(r.ranked))
      .catch((e) => setError(e.message));
  }, [target, regionId]);

  const region = targets?.[target]?.find((r) => r.id === regionId);
  const chosen = candidates?.find((c) => c.candidate_id === candidateId);

  return (
    <>
      <h1 className="page-title">Reports and Documentation</h1>
      <p className="page-sub">Download a CSV analog assessment. Every report includes sources, method and limitations.</p>
      <ErrorBox error={error} />

      <div className="card" style={{ marginBottom: 16 }}>
        <h2>Assessment report (CSV)</h2>
        {!candidates && !error && <Loading />}
        {candidates && candidates.length === 0 && (
          <Notice kind="warn">No candidates yet. Run candidate discovery in the Explorer first.</Notice>
        )}
        {candidates && candidates.length > 0 && (
          <div className="row">
            <label>Earth candidate
              <select value={candidateId || ''} onChange={(e) => setCandidateId(e.target.value)}>
                <option value="" disabled>Choose a candidate</option>
                {candidates.map((c) => <option key={c.candidate_id} value={c.candidate_id}>{c.name}</option>)}
              </select>
            </label>
            <a className={`btn ${chosen ? '' : 'secondary'}`}
              style={{ pointerEvents: chosen ? 'auto' : 'none', textDecoration: 'none' }}
              href={chosen ? api.reportUrl(chosen.candidate_id, target, regionId) : '#'}>
              Download CSV
            </a>
            <button
              className={`btn ${chosen ? '' : 'secondary'}`}
              disabled={!chosen}
              onClick={() => window.print()}
              title="Print or Save as PDF via browser print dialogue">
              Print / Save as PDF
            </button>
          </div>
        )}
        {chosen && region && (
          <div style={{ marginTop: 14 }}>
            <p className="muted">
              Report: <strong>{chosen.name}</strong> against <strong>{region.name}</strong> ({target.toUpperCase()}).
              Score: <strong>{chosen.score_pct == null ? 'insufficient evidence' : `${chosen.score_pct}%`}</strong> ({chosen.band}),
              Coverage: <strong>{chosen.coverage_pct}%</strong> ({chosen.confidence}).
            </p>
            <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10 }}>
              <div style={{ padding: 10, background: 'rgba(255,255,255,0.03)', borderRadius: 6 }}>
                <span className="muted">Target Region:</span> {region.name}
              </div>
              <div style={{ padding: 10, background: 'rgba(255,255,255,0.03)', borderRadius: 6 }}>
                <span className="muted">Coordinates:</span> {chosen.lat.toFixed(2)}°, {chosen.lon.toFixed(2)}°
              </div>
              <div style={{ padding: 10, background: 'rgba(255,255,255,0.03)', borderRadius: 6 }}>
                <span className="muted">Status:</span> {chosen.status}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h2>Method</h2>
        <ul className="clean">
          <li>Earth values: NASA POWER monthly climate normals (2016 to 2025), Open-Meteo elevation, derived slope and roughness.</li>
          <li>Similarity: per-criterion score, weighted and renormalised over criteria with both values. Missing values are excluded, not zeroed.</li>
          <li>Coverage and confidence are reported separately. Coverage under 50% is low confidence.</li>
          <li>Candidate labels: a site is "known analog" only if within 1.5° of a catalogue site. Otherwise "candidate, not confirmed analog".</li>
        </ul>
      </div>

      <LimitationsBox />
    </>
  );
}
