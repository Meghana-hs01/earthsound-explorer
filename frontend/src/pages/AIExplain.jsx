import { useState } from 'react';
import { api } from '../api.js';
import { ErrorBox, Loading } from '../components/ui.jsx';

const SUGGESTED = [
  'Why is the Atacama Desert considered a Mars analog?',
  'Which Earth locations resemble lunar polar terrain?',
  'What makes Haughton Crater useful for planetary exploration research?',
  'Why does this location get a high score?',
  'What are the main differences between this Earth site and Mars?',
  'Which characteristics make a location useful for rover testing?',
];

// Answers come from stored data and deterministic templates. No language model is used.
export default function AIExplain({ target, regionId, candidateId }) {
  const [question, setQuestion] = useState(SUGGESTED[0]);
  const [answer, setAnswer] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const ask = async (q) => {
    const text = (q ?? question).trim();
    if (text.length < 3) return;
    setBusy(true);
    setError('');
    try {
      const body = { question: text };
      if (candidateId) body.candidate_id = candidateId;
      if (regionId) { body.target = target; body.region = regionId; }
      setAnswer(await api.explain(body));
    } catch (e) {
      setError(e.message);
      setAnswer(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <h1 className="page-title">AI Earth Intelligence</h1>
      <p className="page-sub">Explanations separate verified data (with sources) from interpretation, and list what is missing.</p>
      <ErrorBox error={error} />

      <div className="card" style={{ marginBottom: 16 }}>
        <textarea value={question} onChange={(e) => setQuestion(e.target.value)} />
        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn" onClick={() => ask()} disabled={busy}>{busy ? 'Working…' : 'Ask'}</button>
          <span className="muted">
            Context: {candidateId ? 'selected Earth site' : 'no site selected'} · {regionId ? `reference ${regionId}` : 'no reference'}
          </span>
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          {SUGGESTED.map((s) => (
            <button key={s} className="btn secondary" style={{ fontSize: 12 }} onClick={() => { setQuestion(s); ask(s); }}>{s}</button>
          ))}
        </div>
      </div>

      {busy && <Loading />}
      {answer && (
        <div className="grid grid-2">
          <div className="card">
            <h2>Verified data</h2>
            {answer.verified_data.length === 0 && <p className="muted">No verified data for this question.</p>}
            <ul className="clean">
              {answer.verified_data.map((v, i) => (
                <li key={i}>
                  {v.text}
                  <div className="muted mono">Source: {v.source}</div>
                </li>
              ))}
            </ul>
          </div>
          <div className="card">
            <h2>Interpretation</h2>
            <ul className="clean">{answer.interpretation.map((t, i) => <li key={i}>{t}</li>)}</ul>
            <h2 style={{ marginTop: 16 }}>Missing information</h2>
            <ul className="clean">{answer.missing_information.map((t, i) => <li key={i}>{t}</li>)}</ul>
          </div>
          <div className="card" style={{ gridColumn: '1 / -1' }}>
            <h2>Limitations</h2>
            <ul className="clean">{answer.limitations.map((t, i) => <li key={i}>{t}</li>)}</ul>
            <p className="muted" style={{ marginTop: 10 }}>Mode: {answer.mode}</p>
          </div>
        </div>
      )}
    </>
  );
}
