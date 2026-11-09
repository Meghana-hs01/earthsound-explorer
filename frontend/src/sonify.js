// Transparent mappings from measured values to audio parameters.
// Every function here is shown to the user in the formula inspector.

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Temperature (°C) -> lead pitch. -20 °C = 220 Hz, +50 °C = 1760 Hz (three octaves, exponential).
export function temperatureToFrequency(tC) {
  return 220 * Math.pow(2, 3 * clamp((tC + 20) / 70, 0, 1));
}

// Specific humidity (g/kg) -> sub-bass level, 0 to 0.5. 22 g/kg is the top of the scale.
export function humidityToSubGain(qGkg) {
  return clamp(qGkg / 22, 0, 1) * 0.5;
}

// Wind speed (m/s) -> bandpass centre frequency (Hz). Centre = 300 + 60 × wind.
export function windToBandCentre(wMs) {
  return 300 + 60 * wMs;
}

// Wind speed (m/s) -> tremolo rate (Hz). Rate = 0.2 + 0.15 × wind.
export function windTremoloRate(wMs) {
  return 0.2 + 0.15 * wMs;
}

// PM2.5 (µg/m³) -> harmonic tension, detune in cents, capped at 25 cents at 100 µg/m³.
export function pm25ToDetuneCents(pm) {
  return clamp(pm, 0, 100) * 0.25;
}

export const TRACKS = [
  { key: 'temp', label: 'Temperature → Lead pitch' },
  { key: 'humidity', label: 'Humidity → Sub-bass' },
  { key: 'wind', label: 'Wind speed → Bandpass' },
  { key: 'pm25', label: 'PM2.5 → Harmonic tension' },
];

export class EarthSynth {
  constructor() {
    this.ctx = null;
    this.nodes = null;
    this.readings = {}; // { temp, qv, wind, pm25 }, null when unavailable
    this.enabled = { temp: true, humidity: true, wind: true, pm25: true };
  }

  ensure() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = new AC();
    const master = ctx.createGain();
    master.gain.value = 0.3;
    master.connect(ctx.createDynamicsCompressor()).connect(ctx.destination);

    // Track 1: lead
    const lead = ctx.createOscillator();
    lead.type = 'triangle';
    const leadGain = ctx.createGain();
    leadGain.gain.value = 0;
    lead.connect(leadGain).connect(master);
    lead.start();

    // Track 2: sub-bass
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.value = 110; // 55 Hz is too low for laptop speakers
    const subFilter = ctx.createBiquadFilter();
    subFilter.type = 'lowpass';
    subFilter.frequency.value = 200;
    const subGain = ctx.createGain();
    subGain.gain.value = 0;
    sub.connect(subFilter).connect(subGain).connect(master);
    sub.start();

    // Track 3: filtered noise with slow tremolo
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    noise.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 400;
    band.Q.value = 4;
    const windGain = ctx.createGain();
    windGain.gain.value = 0;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.5;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 0;
    lfo.connect(lfoDepth).connect(windGain.gain);
    noise.connect(band).connect(windGain).connect(master);
    noise.start();
    lfo.start();

    // Track 4: detuned voice against the lead, so beating = tension
    const tension = ctx.createOscillator();
    tension.type = 'sawtooth';
    tension.frequency.value = 330;
    const tensionGain = ctx.createGain();
    tensionGain.gain.value = 0;
    tension.connect(tensionGain).connect(master);
    tension.start();

    this.ctx = ctx;
    this.nodes = { lead, leadGain, sub, subGain, band, windGain, lfo, lfoDepth, tension, tensionGain };
    this.applyAll();
  }

  async start() {
    this.ensure();
    if (this.ctx.state !== 'running') await this.ctx.resume();
  }

  async stop() {
    if (this.ctx && this.ctx.state === 'running') await this.ctx.suspend();
  }

  get playing() {
    return !!this.ctx && this.ctx.state === 'running';
  }

  update(readings) {
    this.readings = readings;
    this.applyAll();
  }

  setEnabled(key, on) {
    this.enabled[key] = on;
    this.applyAll();
  }

  applyAll() {
    if (!this.ctx) return;
    const n = this.nodes;
    const t = this.ctx.currentTime;
    const tc = 0.2; // smoothing time constant (s), avoids clicks
    const r = this.readings;

    // Track 1: temperature -> lead pitch. Muted when there is no value.
    const tOn = this.enabled.temp && r.temp != null;
    if (r.temp != null) n.lead.frequency.setTargetAtTime(temperatureToFrequency(r.temp), t, tc);
    n.leadGain.gain.setTargetAtTime(tOn ? 0.25 : 0, t, tc);

    // Track 2: specific humidity -> sub-bass
    const hOn = this.enabled.humidity && r.qv != null;
    n.subGain.gain.setTargetAtTime(hOn ? humidityToSubGain(r.qv) : 0, t, tc);

    // Track 3: wind -> bandpass swoosh
    const wOn = this.enabled.wind && r.wind != null;
    if (r.wind != null) {
      n.band.frequency.setTargetAtTime(windToBandCentre(r.wind), t, tc);
      n.lfo.frequency.setTargetAtTime(windTremoloRate(r.wind), t, tc);
    }
    const windBase = wOn ? 0.6 : 0;
    n.windGain.gain.setTargetAtTime(windBase, t, tc);
    n.lfoDepth.gain.setTargetAtTime(windBase * 0.5, t, tc);

    // Track 4: PM2.5 -> detuned tension voice
    const pOn = this.enabled.pm25 && r.pm25 != null;
    if (r.pm25 != null) {
      const f = r.temp != null ? temperatureToFrequency(r.temp) : 330;
      n.tension.frequency.setTargetAtTime(f, t, tc);
      n.tension.detune.setTargetAtTime(pm25ToDetuneCents(r.pm25), t, tc);
    }
    n.tensionGain.gain.setTargetAtTime(pOn ? 0.12 : 0, t, tc);
  }
}
