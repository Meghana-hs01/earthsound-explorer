import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { ErrorBox, Loading, Notice } from '../components/ui.jsx';

// Shows a Moon or Mars reference profile. Every value shows its source; missing values are labelled, never zero.
export default function ReferencePage({ bodyMode, targets }) {
  const body = bodyMode || 'mars';
  const regions = targets?.[body] || [];
  const [regionId, setRegionId] = useState(regions[0]?.id || null);
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!regionId) return;
    setProfile(null);
    api.reference(regionId).then(setProfile).catch((e) => setError(e.message));
  }, [regionId]);

  const title = body === 'moon' ? 'Moon Analog Analysis' : 'Mars Analog Analysis';
  const intro = body === 'moon'
    ? 'Lunar reference regions for polar and illumination comparisons. Lunar values are added only with citations.'
    : 'Martian reference regions for terrain, climate and geology comparisons. Martian values are added only with citations.';

  const params = profile ? Object.entries(profile.parameters) : [];
  const withValues = params.filter(([, p]) => p.value != null).length;

  return (
    <>
      <h1 className="page-title">{title}</h1>
      <p className="page-sub">{intro}</p>
      <ErrorBox error={error} />

      <div className="card" style={{ marginBottom: 16 }}>
        <label>Reference region
          <select value={regionId || ''} onChange={(e) => setRegionId(e.target.value)}>
            {regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </label>
      </div>

      {!profile && !error && <Loading />}
      {profile && (
        <>
          <div className="grid grid-2" style={{ marginBottom: 16 }}>
            <div className="card">
              <h2>{profile.name}</h2>
              <p className="muted">{profile.description}</p>
              <ul className="clean">
                <li>Centre: {profile.lat}, {profile.lon} ({profile.coordinate_verified ? 'verified' : 'not yet verified against a gazetteer'})</li>
                <li>Citation: <a href={profile.citation} target="_blank" rel="noreferrer" style={{ color: 'var(--cyan)' }}>{profile.citation}</a></li>
              </ul>
            </div>
            <div className="card">
              <h2>Reference coverage</h2>
              <div className="stat-value">{withValues} / {params.length}</div>
              <div className="muted">parameters have a cited value</div>
            </div>
          </div>

          {withValues === 0 && (
            <Notice kind="warn">
              No numeric values are recorded for this region, so no similarity score can be calculated against it yet.
              To add one, record the value, unit, source, and year in backend/data/reference_regions.json.
            </Notice>
          )}

          <div className="card">
            <h2>Reference parameters</h2>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Parameter</th><th>Value</th><th>Unit</th><th>Source</th><th>Year</th><th>Status</th></tr></thead>
                <tbody>
                  {params.map(([key, p]) => (
                    <tr key={key}>
                      <td className="mono">{key}</td>
                      <td>{p.value == null ? <span className="muted">null</span> : p.value}</td>
                      <td>{p.unit}</td>
                      <td>{p.source || <span className="muted">none</span>}</td>
                      <td>{p.year || '—'}</td>
                      <td className="muted">{p.value == null ? p.status : 'cited'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  );
}
