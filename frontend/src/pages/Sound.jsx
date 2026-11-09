import { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, useMapEvents } from 'react-leaflet';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api, gibsUrl } from '../api.js';
import {
  EarthSynth, TRACKS, temperatureToFrequency, humidityToSubGain, windToBandCentre,
  windTremoloRate, pm25ToDetuneCents,
} from '../sonify.js';
import { ErrorBox, Loading, Notice } from '../components/ui.jsx';

const FRAME_MS = 1500;
const LAST_FULL_YEAR = new Date().getUTCFullYear() - 1;
const NO_READINGS = { temp: null, qv: null, wind: null, pm25: null };

function ClickToSelect({ onSelect }) {
  useMapEvents({ click: (e) => onSelect(e.latlng.lat, e.latlng.lng) });
  return null;
}

const MODES = [
  ['live', 'Mode 1 · Location readings'],
  ['history', 'Mode 2 · Historical time machine'],
  ['frames', 'Mode 3 · Frame scanner'],
];

export default function Sound() {
  const synthRef = useRef(null);
  if (!synthRef.current) synthRef.current = new EarthSynth();
  const synth = synthRef.current;

  const [mode, setMode] = useState('live');
  const [point, setPoint] = useState(null);
  const [env, setEnv] = useState(null);
  const [current, setCurrent] = useState(null);
  const [series, setSeries] = useState(null);
  const [pointHistory, setPointHistory] = useState(null);
  const [global, setGlobal] = useState(null);
  const [gibsLayer, setGibsLayer] = useState('modis');
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [enabled, setEnabled] = useState({ temp: true, humidity: true, wind: true, pm25: true });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  const frames = useMemo(() => (series?.series ?? []).filter((f) => f.temperature_c != null), [series]);
  const frame = mode === 'frames' ? frames[idx] : null;

  // Values that feed the sound, for the current mode only.
  const readings = useMemo(() => {
    if (mode === 'live' && env) {
      const v = env.variables;
      return {
        temp: v.temperature_c.value,
        qv: v.specific_humidity_gkg.value,
        wind: v.wind_speed_ms.value,
        pm25: env.pm25?.value ?? null,
      };
    }
    if (mode === 'frames' && frame) {
      return { temp: frame.temperature_c, qv: frame.specific_humidity_gkg, wind: frame.wind_speed_ms, pm25: null };
    }
    return NO_READINGS;
  }, [mode, env, frame]);

  useEffect(() => { synth.update(readings); }, [readings, synth]);
  useEffect(() => { TRACKS.forEach((t) => synth.setEnabled(t.key, enabled[t.key])); }, [enabled, synth]);
  useEffect(() => () => { synth.stop(); }, [synth]); // silence when leaving the page

  useEffect(() => {
    api.historicalGlobal().then(setGlobal).catch((e) => setErrors((x) => ({ ...x, global: e.message })));
  }, []);

  useEffect(() => {
    if (!playing || frames.length < 2 || mode !== 'frames') return undefined;
    const t = setInterval(() => setIdx((i) => (i + 1) % frames.length), FRAME_MS);
    return () => clearInterval(t);
  }, [playing, frames.length, mode]);

  const changeMode = (m) => {
    synth.stop();
    setPlaying(false);
    setMode(m);
  };

  const onSelect = async (lat, lon) => {
    synth.stop();
    setPlaying(false);
    setPoint({ lat, lon });
    setBusy(true);
    const [e, c, s, h] = await Promise.allSettled([
      api.environment(lat, lon),
      api.current(lat, lon),
      api.series(lat, lon, 14),
      api.historicalPoint(lat, lon, 1981, LAST_FULL_YEAR),
    ]);
    const next = {};
    if (e.status === 'fulfilled') setEnv(e.value); else { setEnv(null); next.env = e.reason.message; }
    if (c.status === 'fulfilled') setCurrent(c.value); else { setCurrent(null); next.current = c.reason.message; }
    if (s.status === 'fulfilled') { setSeries(s.value); setIdx(0); } else { setSeries(null); next.series = s.reason.message; }
    if (h.status === 'fulfilled') setPointHistory(h.value); else { setPointHistory(null); next.history = h.reason.message; }
    setErrors(next);
    setBusy(false);
  };

  const togglePlay = async () => {
    if (playing) {
      await synth.stop();
      setPlaying(false);
      return;
    }
    if (mode === 'frames' && frames.length === 0) return;
    try {
      await synth.start();
      setPlaying(true);
    } catch (err) {
      setErrors((x) => ({ ...x, audio: `Audio could not start: ${err.message}` }));
    }
  };

  const step = (delta) => {
    synth.stop();
    setPlaying(false);
    if (frames.length) setIdx((i) => (i + delta + frames.length) % frames.length);
  };

  const trackValue = {
    temp: readings.temp == null ? null : `${readings.temp} °C`,
    humidity: readings.qv == null ? null : `${readings.qv} g/kg`,
    wind: readings.wind == null ? null : `${readings.wind} m/s`,
    pm25: readings.pm25 == null ? null : `${readings.pm25} µg/m³ (model)`,
  };

  const fTemp = readings.temp == null ? null : temperatureToFrequency(readings.temp);
  const subGain = readings.qv == null ? null : humidityToSubGain(readings.qv);
  const bandCentre = readings.wind == null ? null : windToBandCentre(readings.wind);
  const tremolo = readings.wind == null ? null : windTremoloRate(readings.wind);
  const detune = readings.pm25 == null ? null : pm25ToDetuneCents(readings.pm25);

  const historyChart = global?.series ?? [];
  const pointChart = pointHistory?.series ?? [];

  return (
    <>
      <h1 className="page-title">Environmental Sound</h1>
      <p className="page-sub">
        Real measured values turned into sound. Each value shows its source and time. Nothing here is random or simulated.
      </p>
      <ErrorBox error={errors.audio} />

      <div className="row" style={{ marginBottom: 16 }}>
        {MODES.map(([key, label]) => (
          <button key={key} className={`btn ${mode === key ? '' : 'secondary'}`} onClick={() => changeMode(key)}>{label}</button>
        ))}
      </div>

      <div className="grid split">
        <div className="card">
          <h2>Click the map to choose a place</h2>
          <div className="map-box">
            <MapContainer center={[20, 0]} zoom={2} minZoom={2} style={{ height: '100%', width: '100%' }}>
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' />
              {mode === 'frames' && frame && (
                <TileLayer key={`${frame.date}_${gibsLayer}`} url={gibsUrl(frame.date, gibsLayer)} opacity={0.85}
                  attribution='Imagery: <a href="https://nasa.gov/gibs">NASA GIBS</a>' />
              )}
              <ClickToSelect onSelect={onSelect} />
              {point && <CircleMarker center={[point.lat, point.lon]} radius={8}
                pathOptions={{ color: '#22d3ee', fillColor: '#22d3ee', fillOpacity: 0.6 }} />}
            </MapContainer>
          </div>
          <p className="muted">{point ? `Selected: ${point.lat.toFixed(3)}°, ${point.lon.toFixed(3)}°` : 'No place selected yet.'}</p>
          {busy && <Loading>Loading NASA and model values…</Loading>}
        </div>

        <div className="grid" style={{ gap: 16 }}>
          {mode === 'live' && (
            <>
              <div className="card">
                <h2>NASA POWER hourly (lagged reanalysis)</h2>
                <ErrorBox error={errors.env} />
                {!env && !errors.env && <p className="muted">Select a place. NASA POWER lags real time by about two days.</p>}
                {env && (
                  <ul className="clean">
                    {[['Temperature', env.variables.temperature_c, '°C'], ['Relative humidity', env.variables.relative_humidity_pct, '%'],
                      ['Specific humidity', env.variables.specific_humidity_gkg, 'g/kg'], ['Wind speed', env.variables.wind_speed_ms, 'm/s']].map(([label, v, unit]) => (
                      <li key={label}>
                        {label}: {v.value == null ? <span className="muted">no valid data</span> : <strong>{v.value} {unit}</strong>}
                        <div className="muted mono">{v.observed_at_utc ? `observed ${v.observed_at_utc}` : 'no observation time'} · NASA POWER hourly, lagged</div>
                      </li>
                    ))}
                    <li>
                      PM2.5: {env.pm25?.value == null ? <span className="muted">{env.pm25?.status}</span> : <strong>{env.pm25.value} µg/m³</strong>}
                      <div className="muted mono">{env.pm25?.source}</div>
                    </li>
                  </ul>
                )}
              </div>
              <div className="card">
                <h2>Current conditions (model, not a NASA observation)</h2>
                <ErrorBox error={errors.current} />
                {current && (
                  <>
                    <Notice kind="warn">Live forecast-model output from Open-Meteo. Observed (UTC): {current.observed_at_utc}</Notice>
                    <ul className="clean">
                      <li>Temperature: {current.variables.temperature_c} °C</li>
                      <li>Relative humidity: {current.variables.relative_humidity_pct} %</li>
                      <li>Wind speed: {current.variables.wind_speed_ms} m/s</li>
                    </ul>
                  </>
                )}
              </div>
            </>
          )}

          {mode === 'history' && (
            <>
              <div className="card">
                <h2>Global temperature anomaly since 1880</h2>
                <ErrorBox error={errors.global} />
                {!global && !errors.global && <Loading />}
                {global && (
                  <>
                    <p className="muted">{global.source}. Baseline {global.baseline}. Historical, not live.</p>
                    <div style={{ width: '100%', height: 240 }}>
                      <ResponsiveContainer>
                        <LineChart data={historyChart}>
                          <CartesianGrid stroke="#1d2b48" />
                          <XAxis dataKey="year" stroke="#8ea0bf" fontSize={11} />
                          <YAxis stroke="#8ea0bf" fontSize={11} />
                          <Tooltip contentStyle={{ background: '#0b1426', border: '1px solid #1d2b48' }} />
                          <Line type="monotone" dataKey="anomaly_c" stroke="#22d3ee" dot={false} strokeWidth={1.5} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </>
                )}
              </div>
              <div className="card">
                <h2>Selected place: annual mean temperature</h2>
                <ErrorBox error={errors.history} />
                {!point && <p className="muted">Click a place on the map to load its history (NASA POWER monthly, 1981 to {LAST_FULL_YEAR}).</p>}
                {pointHistory && (
                  <>
                    <p className="muted">{pointHistory.source}</p>
                    <div style={{ width: '100%', height: 220 }}>
                      <ResponsiveContainer>
                        <LineChart data={pointChart}>
                          <CartesianGrid stroke="#1d2b48" />
                          <XAxis dataKey="year" stroke="#8ea0bf" fontSize={11} />
                          <YAxis stroke="#8ea0bf" fontSize={11} domain={['auto', 'auto']} />
                          <Tooltip contentStyle={{ background: '#0b1426', border: '1px solid #1d2b48' }} />
                          <Line type="monotone" dataKey="mean_temperature_c" stroke="#a78bfa" dot={false} strokeWidth={1.5} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </>
                )}
              </div>
            </>
          )}

          {mode === 'frames' && (
            <div className="card">
              <h2>Frame scanner</h2>
              <ErrorBox error={errors.series} />
              {!series && !errors.series && <p className="muted">Select a place. Frames are the last 14 days of NASA POWER daily values.</p>}
              {series && frames.length === 0 && <Notice kind="warn">NASA returned no valid days for this place. Try another location.</Notice>}
              {frame && (
                <>
                  <div className="mono" style={{ fontSize: 16, marginBottom: 8 }}>{frame.date} <span className="muted">(UTC day)</span></div>
                  <input type="range" min={0} max={frames.length - 1} value={idx} style={{ width: '100%' }}
                    onChange={(e) => { synth.stop(); setPlaying(false); setIdx(Number(e.target.value)); }} />
                  <div className="row" style={{ marginTop: 10 }}>
                    <button className="btn secondary" onClick={() => step(-1)}>Prev</button>
                    <button className="btn" onClick={togglePlay}>{playing ? 'Pause' : 'Play'}</button>
                    <button className="btn secondary" onClick={() => step(1)}>Next</button>
                  </div>
                  <div className="row" style={{ marginTop: 10, marginBottom: 6 }}>
                    <label style={{ fontSize: 13 }}>GIBS Map Layer:
                      <select value={gibsLayer} onChange={(e) => setGibsLayer(e.target.value)} style={{ marginLeft: 6 }}>
                        <option value="modis">MODIS Terra True Color (Visual reference)</option>
                        <option value="humidity">AIRS Surface Relative Humidity (Daily PNG, verified)</option>
                      </select>
                    </label>
                  </div>
                  <ul className="clean" style={{ marginTop: 10 }}>
                    <li>Temperature: {frame.temperature_c} °C</li>
                    <li>Specific humidity: {frame.specific_humidity_gkg ?? 'no valid data'} g/kg</li>
                    <li>Wind speed: {frame.wind_speed_ms ?? 'no valid data'} m/s</li>
                  </ul>
                  <p className="muted">
                    Sound source: NASA POWER daily point API, lagged reanalysis, not live.
                    Picture source: {gibsLayer === 'humidity'
                      ? 'NASA GIBS AIRS Surface Relative Humidity Daily Day layer (verified WMTS GetCapabilities).'
                      : 'NASA GIBS MODIS Terra true colour for that day. It is a visual reference, not a humidity map.'}
                  </p>
                </>
              )}
            </div>
          )}

          <div className="card">
            <h2>Earth Quartet</h2>
            <p className="muted">Browsers need a click before sound can play. Use Play/Pause, and switch tracks on or off.</p>
            {mode !== 'history' && (
              <>
                <div className="row" style={{ marginBottom: 10 }}>
                  <button className="btn" onClick={togglePlay} disabled={mode === 'frames' && frames.length === 0}>
                    {playing ? 'Pause' : 'Play'}
                  </button>
                </div>
                <ul className="clean">
                  {TRACKS.map((t) => {
                    const has = trackValue[t.key] != null;
                    return (
                      <li key={t.key} className="row" style={{ justifyContent: 'space-between' }}>
                        <span>
                          {t.label}
                          <div className="muted mono">{has ? trackValue[t.key] : 'no value: muted'}</div>
                        </span>
                        <button className={`btn ${enabled[t.key] ? '' : 'secondary'}`} disabled={!has}
                          onClick={() => setEnabled({ ...enabled, [t.key]: !enabled[t.key] })}>
                          {enabled[t.key] ? 'ON' : 'OFF'}
                        </button>
                      </li>
                    );
                  })}
                </ul>
                <h2 style={{ marginTop: 14 }}>Formula inspector</h2>
                <ul className="clean mono">
                  <li>Lead: f = 220 × 2^(3 × clamp((T+20)/70, 0, 1)) = {fTemp == null ? '—' : `${fTemp.toFixed(1)} Hz`}</li>
                  <li>Sub-bass: gain = clamp(q/22, 0, 1) × 0.5 = {subGain == null ? '—' : subGain.toFixed(3)}, 110 Hz, lowpass 200 Hz</li>
                  <li>Wind: centre = 300 + 60 × w = {bandCentre == null ? '—' : `${bandCentre.toFixed(0)} Hz`}, tremolo = 0.2 + 0.15 × w = {tremolo == null ? '—' : `${tremolo.toFixed(2)} Hz`}</li>
                  <li>Tension: detune = clamp(PM2.5, 0, 100) × 0.25 = {detune == null ? '—' : `${detune.toFixed(2)} cents`}</li>
                </ul>
              </>
            )}
            {mode === 'history' && <p className="muted">Mode 2 shows history only. Switch to Mode 1 or Mode 3 to hear the Earth Quartet.</p>}
          </div>
        </div>
      </div>
    </>
  );
}
