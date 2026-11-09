import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { BandBadge, ErrorBox, LimitationsBox, Loading, Notice, ScoreText } from '../components/ui.jsx';

export default function Explorer({ target, regionId, candidateId, targets, setTarget, setRegionId, setCandidateId }) {
  const [config, setConfig] = useState(null);
  const [weights, setWeights] = useState(null);
  const [minCoverage, setMinCoverage] = useState(0);
  const [search, setSearch] = useState('');
  const [data, setData] = useState(null);
  const [detail, setDetail] = useState(null);
  const [breakdown, setBreakdown] = useState(null);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [runMsg, setRunMsg] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api.scoringConfig().then((c) => {
      setConfig(c);
      setWeights(Object.fromEntries(Object.entries(c.criteria).map(([k, v]) => [k, v.weight])));
    }).catch((e) => setError(e.message));
  }, []);

  const loadRanking = () => {
    if (!regionId) return;
    setLoading(true);
    setError('');
    api.candidates(target, regionId, minCoverage)
      .then((r) => setData(r))
      .catch((e) => { setData(null); setError(e.message); })
      .finally(() => setLoading(false));
  };

  useEffect(loadRanking, [target, regionId, minCoverage]);

  // Load the detail and the score breakdown for the selected candidate.
  useEffect(() => {
    if (!candidateId) { setDetail(null); setBreakdown(null); return; }
    api.candidate(candidateId).then(setDetail).catch((e) => setError(e.message));
  }, [candidateId]);

  const runScore = () => {
    if (!candidateId || !regionId) return;
    api.score({ candidate_id: candidateId, target, region: regionId, weights })
      .then(setBreakdown)
      .catch((e) => setError(e.message));
  };

  useEffect(() => { if (candidateId && regionId) runScore(); /* eslint-disable-next-line */ }, [candidateId, regionId, target]);

  const runDiscovery = async () => {
    setRunning(true);
    setRunMsg('Fetching NASA POWER and Open-Meteo data for each grid point. This can take a few minutes…');
    setError('');
    try {
      const summary = await api.analyze({ max_per_region: 40, spacing_deg: 1.0 });
      setRunMsg(`Done: kept ${summary.kept} of ${summary.attempted} grid points. Generated ${summary.generated_utc}.`);
      loadRanking();
    } catch (e) {
      setError(e.message);
      setRunMsg('');
    } finally {
      setRunning(false);
    }
  };

  const regions = targets?.[target] || [];
  const rows = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    return q ? data.ranked.filter((r) => r.name.toLowerCase().includes(q)) : data.ranked;
  }, [data, search]);

  const weightSum = weights ? Object.values(weights).reduce((a, b) => a + Number(b || 0), 0) : 0;

  return (
    <>
      <h1 className="page-title">Earth Analog Explorer</h1>
      <p className="page-sub">Rank Earth grid points against a Moon or Mars reference region. Scores show coverage and confidence beside them.</p>
      <ErrorBox error={error} />

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <label>Target
            <div className="row">
              <button className={`btn ${target === 'moon' ? '' : 'secondary'}`} onClick={() => setTarget('moon')}>Moon</button>
              <button className={`btn ${target === 'mars' ? '' : 'secondary'}`} onClick={() => setTarget('mars')}>Mars</button>
            </div>
          </label>
          <label>Reference region
            <select value={regionId || ''} onChange={(e) => { setRegionId(e.target.value); setCandidateId(null); }}>
              {regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </label>
          <label>Minimum coverage
            <select value={minCoverage} onChange={(e) => setMinCoverage(Number(e.target.value))}>
              <option value={0}>Show all</option>
              <option value={0.5}>50% or more</option>
            </select>
          </label>
          <label>Search name
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="e.g. Atacama" />
          </label>
          <button className="btn" onClick={runDiscovery} disabled={running}>
            {running ? 'Running…' : 'Run candidate discovery'}
          </button>
        </div>
        {runMsg && <p className="muted" style={{ marginBottom: 0 }}>{runMsg}</p>}
      </div>

      <div className="grid split">
        <div className="card">
          <h2>Ranking {data && <span className="muted">({data.count} shown)</span>}</h2>
          {loading && <Loading />}
          {!loading && data && rows.length === 0 && (
            <Notice kind="warn">No candidates to show. Run candidate discovery, or lower the coverage filter.</Notice>
          )}
          {data && rows.length > 0 && (
            <div className="table-wrap">
              <table>
                <thead><tr><th>#</th><th>Candidate</th><th>Score</th><th>Band</th><th>Coverage</th><th>Known?</th></tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.candidate_id} className={`clickable ${r.candidate_id === candidateId ? 'selected' : ''}`}
                      onClick={() => setCandidateId(r.candidate_id)}>
                      <td>{r.rank ?? '—'}</td>
                      <td>{r.name}</td>
                      <td><ScoreText row={r} /></td>
                      <td><BandBadge band={r.band} /></td>
                      <td>{r.coverage_pct}%{r.confidence === 'low' && <span className="badge warn" style={{ marginLeft: 6 }}>low confidence</span>}</td>
                      <td>{r.known_analog ? <span className="badge verified">{r.known_analog}</span> : <span className="muted">no</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {data && data.ranked.every((r) => r.score_pct == null) && data.count > 0 && (
            <Notice kind="warn">
              No candidate can be scored against this region yet. The reference region has no cited numeric values, so the score is shown as insufficient evidence. Add citations in backend/data/reference_regions.json.
            </Notice>
          )}
        </div>

        <div className="grid" style={{ gap: 16 }}>
          <div className="card">
            <h2>Scoring weights</h2>
            <p className="muted">Weights are relative and normalised to 1 before scoring. Current sum: {weightSum.toFixed(2)}.</p>
            {weights && config && (
              <div className="grid grid-2" style={{ gap: 8 }}>
                {Object.entries(config.criteria).map(([k, c]) => (
                  <label key={k}>{c.label}
                    <input type="number" min="0" max="1" step="0.05" value={weights[k]}
                      onChange={(e) => setWeights({ ...weights, [k]: Number(e.target.value) })} />
                  </label>
                ))}
              </div>
            )}
            <div className="row" style={{ marginTop: 10 }}>
              <button className="btn secondary" onClick={runScore} disabled={!candidateId}>Re-score selected</button>
              <button className="btn secondary" onClick={() => setWeights(Object.fromEntries(Object.entries(config.criteria).map(([k, v]) => [k, v.weight])))}>Reset weights</button>
            </div>
          </div>

          <div className="card">
            <h2>Selected candidate</h2>
            {!candidateId && <p className="muted">Click a row in the ranking.</p>}
            {detail && (
              <>
                <p style={{ margin: '0 0 6px' }}><strong>{detail.name}</strong></p>
                <p className="muted mono" style={{ margin: 0 }}>{detail.lat}, {detail.lon}</p>
                <p className="muted">{detail.status}</p>
                <ul className="clean">
                  {Object.entries(detail.values).map(([k, v]) => (
                    <li key={k}><span className="mono">{k}</span>: {v == null ? <span className="muted">no valid data</span> : v}</li>
                  ))}
                </ul>
                <p className="muted">Retrieved (UTC): {detail.years_used ? `climate ${detail.climate_years?.[0]}–${detail.climate_years?.[1]}` : ''}</p>
              </>
            )}
          </div>

          {breakdown && (
            <div className="card">
              <h2>Score breakdown</h2>
              <p>
                <strong>{breakdown.score_pct == null ? 'Insufficient evidence' : `${breakdown.score_pct.toFixed(1)}%`}</strong>{' '}
                <BandBadge band={breakdown.band} /> · coverage {breakdown.coverage_pct}% · confidence {breakdown.confidence}
              </p>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Criterion</th><th>Earth</th><th>Reference</th><th>Similarity</th><th>Weight</th></tr></thead>
                  <tbody>
                    {breakdown.included.map((i) => (
                      <tr key={i.criterion}>
                        <td>{i.label}<div className="muted mono">{i.dataset}</div></td>
                        <td>{String(i.earth_value)} {i.unit}</td>
                        <td>{String(i.reference_value)} {i.unit}</td>
                        <td>{i.similarity}</td>
                        <td>{i.renormalised_weight}</td>
                      </tr>
                    ))}
                    {breakdown.excluded.map((i) => (
                      <tr key={i.criterion}>
                        <td>{i.label}</td>
                        <td colSpan={4} className="muted">excluded: {i.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="muted mono" style={{ marginTop: 8 }}>{breakdown.method}</p>
            </div>
          )}
          <LimitationsBox />
        </div>
      </div>
    </>
  );
}
