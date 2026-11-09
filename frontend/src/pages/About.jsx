import { LimitationsBox } from '../components/ui.jsx';

export default function About() {
  return (
    <>
      <h1 className="page-title">About EarthExplorer</h1>
      <p className="page-sub">Terrestrial analog discovery for NASA Space Apps Challenge 2026, Challenge 10, with the Earth Information Jukebox as one module.</p>

      <div className="grid grid-2" style={{ marginBottom: 16 }}>
        <div className="card">
          <h2>Problem</h2>
          <p>
            Missions to the Moon and Mars need places on Earth where equipment, rovers and procedures can be tested.
            Finding a place that resembles a planetary site means comparing many datasets at once, and the reasoning is often hard to check.
          </p>
        </div>
        <div className="card">
          <h2>Solution</h2>
          <p>
            EarthExplorer ranks Earth grid points against a Moon or Mars reference region. Each score shows its criteria, the values behind them,
            the data sources, and how much of the evidence was available. The scoring is deterministic and can be reproduced.
          </p>
        </div>
      </div>

      <div className="grid grid-2" style={{ marginBottom: 16 }}>
        <div className="card">
          <h2>Methodology</h2>
          <ul className="clean">
            <li>Earth candidates: a documented grid over search regions (deserts, polar terrain, volcanic fields).</li>
            <li>Terrain: elevation from Open-Meteo, slope and roughness from a 3x3 grid.</li>
            <li>Climate: NASA POWER monthly normals, 2016 to 2025.</li>
            <li>Score: weighted per-criterion similarity, renormalised over criteria with both values. Coverage is reported beside it.</li>
            <li>Validation: known analog sites can be scored and their ranks reported. Validation is not claimed complete until it has been run.</li>
          </ul>
        </div>
        <div className="card">
          <h2>Honest status</h2>
          <ul className="clean">
            <li>Earth data and scoring are implemented end to end.</li>
            <li>Moon and Mars numeric reference values are not yet entered. Scores show insufficient evidence until citations are added.</li>
            <li>Planetary PDS datasets (LOLA, Diviner, MOLA, CTX, HiRISE, CRISM) are listed but not integrated.</li>
            <li>The explanation module is deterministic. No language model is called.</li>
            <li>PDF reports are not included; CSV reports are.</li>
          </ul>
        </div>
      </div>

      <LimitationsBox />
    </>
  );
}
