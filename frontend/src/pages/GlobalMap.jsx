import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet';
import { api } from '../api.js';
import { BandBadge, BAND_COLOUR, ErrorBox, Loading, ScoreText } from '../components/ui.jsx';

export default function GlobalMap({ target, regionId, candidateId, targets, setTarget, setRegionId, setCandidateId }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!regionId) return;
    setLoading(true);
    setError('');
    api.candidates(target, regionId, 0)
      .then(setData)
      .catch((e) => { setData(null); setError(e.message); })
      .finally(() => setLoading(false));
  }, [target, regionId]);

  const regions = targets?.[target] || [];
  const selected = data?.ranked.find((r) => r.candidate_id === candidateId);
  const refRegion = regions.find((r) => r.id === regionId);

  return (
    <>
      <h1 className="page-title">Global Discovery Map</h1>
      <p className="page-sub">Earth grid points coloured by similarity band. Click a marker for its details. Blue-grey markers have no score yet.</p>
      <ErrorBox error={error} />

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="row">
          <button className={`btn ${target === 'moon' ? '' : 'secondary'}`} onClick={() => setTarget('moon')}>Moon</button>
          <button className={`btn ${target === 'mars' ? '' : 'secondary'}`} onClick={() => setTarget('mars')}>Mars</button>
          <select value={regionId || ''} onChange={(e) => { setRegionId(e.target.value); setCandidateId(null); }}>
            {regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <div className="legend">
            <span><span className="dot" style={{ background: BAND_COLOUR.high }} />High</span>
            <span><span className="dot" style={{ background: BAND_COLOUR.moderate }} />Moderate</span>
            <span><span className="dot" style={{ background: BAND_COLOUR.low }} />Low</span>
            <span><span className="dot" style={{ background: BAND_COLOUR.insufficient_evidence }} />Insufficient evidence</span>
          </div>
        </div>
      </div>

      <div className="grid split">
        <div>
          {loading && <Loading>Loading candidates…</Loading>}
          <div className="map-box">
            <MapContainer center={[20, 0]} zoom={2} minZoom={2} style={{ height: '100%', width: '100%' }}>
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' />
              {data?.ranked.map((r) => (
                <CircleMarker key={r.candidate_id} center={[r.lat, r.lon]} radius={r.candidate_id === candidateId ? 10 : 6}
                  pathOptions={{ color: BAND_COLOUR[r.band], fillColor: BAND_COLOUR[r.band], fillOpacity: 0.7 }}
                  eventHandlers={{ click: () => setCandidateId(r.candidate_id) }}>
                  <Popup>{r.name}<br />{r.score_pct == null ? 'not scored' : `${r.score_pct}%`}</Popup>
                </CircleMarker>
              ))}
              {refRegion && (
                <CircleMarker center={[refRegion.lat, refRegion.lon]} radius={9}
                  pathOptions={{ color: '#a78bfa', fillColor: '#a78bfa', fillOpacity: 0.9 }}>
                  <Popup>Reference region: {refRegion.name}</Popup>
                </CircleMarker>
              )}
            </MapContainer>
          </div>
        </div>

        <div className="card">
          <h2>Location details</h2>
          {!selected && <p className="muted">Select a marker. The purple marker is the reference region.</p>}
          {selected && (
            <>
              <p style={{ margin: '0 0 6px' }}><strong>{selected.name}</strong></p>
              <ul className="clean">
                <li>Latitude, longitude: <span className="mono">{selected.lat}, {selected.lon}</span></li>
                <li>Category: {target === 'moon' ? 'Moon' : 'Mars'} analog candidate</li>
                <li>Similarity: <ScoreText row={selected} /> <BandBadge band={selected.band} /></li>
                <li>Coverage: {selected.coverage_pct}% · confidence {selected.confidence}</li>
                <li>Status: {selected.status}</li>
                <li>Data availability: {selected.included.length} criteria scored, {selected.excluded.length} excluded</li>
              </ul>
              <p className="muted">Excluded: {selected.excluded.map((e) => e.label).join(', ') || 'none'}</p>
              <p className="muted">
                Scientific note: a high score means similar measured or modelled values for the criteria listed. It does not prove a geological analog.
              </p>
            </>
          )}
        </div>
      </div>
    </>
  );
}
