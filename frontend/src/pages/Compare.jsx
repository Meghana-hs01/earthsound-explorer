import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts';
import { api } from '../api.js';
import { ErrorBox, Loading, LimitationsBox, Notice } from '../components/ui.jsx';

export default function Compare({ target, regionId, targets, candidateId, setCandidateId }) {
  const [candidates, setCandidates] = useState(null);
  const [moonId, setMoonId] = useState(targets?.moon[0]?.id || null);
  const [marsId, setMarsId] = useState(targets?.mars[0]?.id || null);
  const [earthId, setEarthId] = useState(candidateId || null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Earth candidates come from the region currently chosen in the Explorer.
  useEffect(() => {
    if (!regionId) return;
    api.candidates(target, regionId, 0)
      .then((r) => { setCandidates(r.ranked); if (!earthId && r.ranked[0]) setEarthId(r.ranked[0].candidate_id); })
      .catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, regionId]);

  useEffect(() => { if (candidateId) setEarthId(candidateId); }, [candidateId]);

  const run = () => {
    if (!earthId || !moonId || !marsId) return;
    setBusy(true);
    setError('');
    api.compare({ earth_id: earthId, moon_region: moonId, mars_region: marsId })
      .then(setResult)
      .catch((e) => { setResult(null); setError(e.message); })
      .finally(() => setBusy(false));
  };

  useEffect(() => { if (earthId) run(); /* eslint-disable-next-line */ }, [earthId, moonId, marsId]);

  const chartData = result
    ? result.rows.filter((r) => typeof r.earth === 'number' || typeof r.moon === 'number' || typeof r.mars === 'number')
        .map((r) => ({ name: r.parameter, Earth: r.earth, Moon: r.moon, Mars: r.mars }))
    : [];

  return (
    <>
      <h1 className="page-title">Site Comparison</h1>
      <p className="page-sub">One Earth site against one lunar and one Martian reference. Empty bars mean no value exists, not zero.</p>
      <ErrorBox error={error} />

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="row">
          <label>Earth site
            <select value={earthId || ''} onChange={(e) => { setEarthId(e.target.value); setCandidateId(e.target.value); }}>
              {(candidates || []).map((c) => <option key={c.candidate_id} value={c.candidate_id}>{c.name}</option>)}
            </select>
          </label>
          <label>Lunar reference
            <select value={moonId || ''} onChange={(e) => setMoonId(e.target.value)}>
              {targets.moon.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </label>
          <label>Martian reference
            <select value={marsId || ''} onChange={(e) => setMarsId(e.target.value)}>
              {targets.mars.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </label>
        </div>
        {!candidates && <Loading>Loading Earth sites…</Loading>}
        {candidates && candidates.length === 0 && (
          <Notice kind="warn">No Earth sites yet. Run candidate discovery in the Explorer first.</Notice>
        )}
      </div>

      {busy && <Loading />}
      {result && (
        <>
          <div className="grid grid-2" style={{ marginBottom: 16 }}>
            <div className="card">
              <h2>Comparison chart</h2>
              {chartData.length === 0 ? (
                <Notice kind="warn">No numeric values exist for this comparison yet. Reference values are missing; Earth values are shown in the table.</Notice>
              ) : (
                <div style={{ width: '100%', height: 320 }}>
                  <ResponsiveContainer>
                    <BarChart data={chartData}>
                      <CartesianGrid stroke="#1d2b48" />
                      <XAxis dataKey="name" stroke="#8ea0bf" fontSize={11} />
                      <YAxis stroke="#8ea0bf" fontSize={11} />
                      <Tooltip contentStyle={{ background: '#0b1426', border: '1px solid #1d2b48' }} />
                      <Legend />
                      <Bar dataKey="Earth" fill="#22d3ee" />
                      <Bar dataKey="Moon" fill="#a78bfa" />
                      <Bar dataKey="Mars" fill="#f97316" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
            <div className="card">
              <h2>Earth site</h2>
              <p><strong>{result.earth.name}</strong></p>
              <p className="muted">{result.earth.status}</p>
              <p className="muted">Lunar reference: {result.moon_region}</p>
              <p className="muted">Martian reference: {result.mars_region}</p>
            </div>
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <h2>Parameters</h2>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Parameter</th><th>Earth</th><th>Moon</th><th>Mars</th><th>Unit</th></tr></thead>
                <tbody>
                  {result.rows.map((r) => (
                    <tr key={r.parameter}>
                      <td className="mono">{r.parameter}</td>
                      <td>{r.earth == null ? <span className="muted">no valid data</span> : String(r.earth)}</td>
                      <td>{r.moon == null ? <span className="muted">{r.moon_status}</span> : String(r.moon)}</td>
                      <td>{r.mars == null ? <span className="muted">{r.mars_status}</span> : String(r.mars)}</td>
                      <td>{r.unit}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <LimitationsBox />
        </>
      )}
    </>
  );
}
