import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { ErrorBox, Loading } from '../components/ui.jsx';

export default function DataCenter() {
  const [datasets, setDatasets] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.sources().then((r) => setDatasets(r.datasets)).catch((e) => setError(e.message));
  }, []);

  return (
    <>
      <h1 className="page-title">Scientific Data Center</h1>
      <p className="page-sub">Every dataset in the project: where it comes from, how it is processed, and what it cannot tell you.</p>
      <ErrorBox error={error} />
      {!datasets && !error && <Loading />}
      {datasets && (
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Dataset</th><th>Status</th><th>Provider</th><th>Used for</th><th>Resolution</th><th>Coverage</th><th>Units</th><th>Processing</th><th>Limitations</th></tr>
              </thead>
              <tbody>
                {datasets.map((d) => (
                  <tr key={d.name}>
                    <td>
                      <a href={d.url} target="_blank" rel="noreferrer" style={{ color: 'var(--cyan)' }}>{d.name}</a>
                    </td>
                    <td><span className={`badge ${d.status.startsWith('used') ? 'verified' : 'none'}`}>{d.status}</span></td>
                    <td>{d.provider}</td>
                    <td>{d.used_for}</td>
                    <td>{d.resolution}</td>
                    <td>{d.coverage}</td>
                    <td>{d.units}</td>
                    <td>{d.processing}</td>
                    <td>{d.limitations}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
