import { useEffect, useState } from 'react';
import { api } from './api.js';
import { ErrorBox, Loading } from './components/ui.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Explorer from './pages/Explorer.jsx';
import ReferencePage from './pages/ReferencePage.jsx';
import GlobalMap from './pages/GlobalMap.jsx';
import Compare from './pages/Compare.jsx';
import DataCenter from './pages/DataCenter.jsx';
import AIExplain from './pages/AIExplain.jsx';
import Sound from './pages/Sound.jsx';
import Reports from './pages/Reports.jsx';
import About from './pages/About.jsx';

const PAGES = [
  ['dashboard', 'Dashboard'],
  ['explorer', 'Earth Analog Explorer'],
  ['moon', 'Moon Analog Analysis'],
  ['mars', 'Mars Analog Analysis'],
  ['map', 'Global Discovery Map'],
  ['compare', 'Site Comparison'],
  ['data', 'Scientific Data Center'],
  ['ai', 'AI Earth Intelligence'],
  ['sound', 'Environmental Sound'],
  ['reports', 'Reports and Documentation'],
  ['about', 'About EarthExplorer'],
];

export default function App() {
  const [page, setPage] = useState('dashboard');
  const [targets, setTargets] = useState(null);
  const [error, setError] = useState('');
  const [target, setTargetState] = useState('mars');
  const [regionId, setRegionId] = useState(null);
  const [candidateId, setCandidateId] = useState(null);

  useEffect(() => {
    api.targets()
      .then((t) => {
        setTargets(t);
        setRegionId(t.mars[0]?.id ?? null);
      })
      .catch((e) => setError(e.message));
  }, []);

  // Switching body resets the region to the first region of that body.
  const setTarget = (t) => {
    setTargetState(t);
    setRegionId(targets?.[t][0]?.id ?? null);
    setCandidateId(null);
  };

  const ctx = { targets, target, regionId, candidateId, setTarget, setRegionId, setCandidateId, goto: setPage };

  const views = {
    dashboard: Dashboard,
    explorer: Explorer,
    moon: ReferencePage,
    mars: ReferencePage,
    map: GlobalMap,
    compare: Compare,
    data: DataCenter,
    ai: AIExplain,
    sound: Sound,
    reports: Reports,
    about: About,
  };
  const View = views[page];

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">EarthExplorer</div>
        <div className="brand-sub">Terrestrial analog discovery for the Moon and Mars</div>
        <nav className="nav">
          {PAGES.map(([key, label]) => (
            <button key={key} className={page === key ? 'active' : ''} onClick={() => setPage(key)}>
              {label}
            </button>
          ))}
        </nav>
      </aside>
      <main className="main">
        <ErrorBox error={error} />
        {!targets && !error && <Loading>Connecting to the backend…</Loading>}
        {targets && <View key={page} {...ctx} bodyMode={page === 'moon' ? 'moon' : page === 'mars' ? 'mars' : null} />}
      </main>
    </div>
  );
}
