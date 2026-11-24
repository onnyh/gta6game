// audio.js — every sound in Bayu Heat is synthesized with WebAudio at
// runtime: the engine's growl, the two-tone police siren, harbour waves
// rolling under everything, and the little blips that mark pickups, paydays
// and arrests. No audio files exist anywhere in the entry.

export class GameAudio {
  constructor() {
    this.ctx = null;
    this.engineOn = false;
    this.sirenLevel = 0;
  }

  // Must be called from a user gesture (the MULAI button) at least once.
  ensure() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(ctx.destination);

    // -- Engine: two detuned saws through a lowpass, gain driven by use.
    this.engineOscA = ctx.createOscillator();
    this.engineOscA.type = "sawtooth";
    this.engineOscB = ctx.createOscillator();
    this.engineOscB.type = "square";
    const engineFilter = ctx.createBiquadFilter();
    engineFilter.type = "lowpass";
    engineFilter.frequency.value = 420;
    this.engineFilter = engineFilter;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOscA.connect(engineFilter);
    this.engineOscB.connect(engineFilter);
    engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOscA.start();
    this.engineOscB.start();

    // -- Siren: a square wave whose pitch a slow LFO swings two-tone.
    this.sirenOsc = ctx.createOscillator();
    this.sirenOsc.type = "triangle";
    this.sirenOsc.frequency.value = 840;
    const lfo = ctx.createOscillator();
    lfo.type = "square";
    lfo.frequency.value = 0.85;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 160;
    lfo.connect(lfoGain);
    lfoGain.connect(this.sirenOsc.frequency);
    this.sirenGain = ctx.createGain();
    this.sirenGain.gain.value = 0;
    this.sirenOsc.connect(this.sirenGain);
    this.sirenGain.connect(this.master);
    this.sirenOsc.start();
    lfo.start();

    // -- Waves: looped filtered noise breathing on a slow gain LFO.
    const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02; // brownish
      data[i] = last * 3.2;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuf;
    noise.loop = true;
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = "lowpass";
    noiseFilter.frequency.value = 480;
    this.waveGain = ctx.createGain();
    this.waveGain.gain.value = 0.05;
    const waveLfo = ctx.createOscillator();
    waveLfo.frequency.value = 0.09;
    const waveLfoGain = ctx.createGain();
    waveLfoGain.gain.value = 0.022;
    waveLfo.connect(waveLfoGain);
    waveLfoGain.connect(this.waveGain.gain);
    noise.connect(noiseFilter);
    noiseFilter.connect(this.waveGain);
    this.waveGain.connect(this.master);
    noise.start();
    waveLfo.start();
  }

  // rpm: 0..1 throttle/load blend; on=false parks the engine at silence.
  setEngine(on, rpm) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const target = on ? 0.05 + rpm * 0.075 : 0;
    this.engineGain.gain.setTargetAtTime(target, t, 0.09);
    const freq = 52 + rpm * 165;
    this.engineOscA.frequency.setTargetAtTime(freq, t, 0.06);
    this.engineOscB.frequency.setTargetAtTime(freq * 0.5 + 3, t, 0.06);
    this.engineFilter.frequency.setTargetAtTime(320 + rpm * 900, t, 0.1);
    this.engineOn = on;
  }

  // level: 0..1 loudness from the police system's distance estimate.
  setSiren(level) {
    if (!this.ctx) return;
    this.sirenLevel = level;
    this.sirenGain.gain.setTargetAtTime(level * 0.055, this.ctx.currentTime, 0.12);
  }

  blip(freq = 880, dur = 0.12, type = "sine", vol = 0.16, when = 0) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(vol, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  pickup() {
    this.blip(720, 0.1, "sine", 0.15);
    this.blip(1080, 0.14, "sine", 0.15, 0.07);
  }

  success() {
    this.blip(659, 0.13, "triangle", 0.2);
    this.blip(880, 0.16, "triangle", 0.2, 0.1);
    this.blip(1318, 0.26, "triangle", 0.2, 0.2);
  }

  fail() {
    this.blip(392, 0.18, "triangle", 0.18);
    this.blip(311, 0.3, "triangle", 0.18, 0.13);
  }

  busted() {
    this.blip(196, 0.5, "sawtooth", 0.16);
    this.blip(147, 0.7, "sawtooth", 0.16, 0.16);
  }

  // A ferry sounding its horn out in the bay — atmosphere, called rarely.
  horn() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime;
    for (const freq of [98, 147]) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(0.045, t0 + 0.35);
      gain.gain.setValueAtTime(0.045, t0 + 1.1);
      gain.gain.linearRampToValueAtTime(0, t0 + 1.7);
      osc.connect(gain);
      gain.connect(this.master);
      osc.start(t0);
      osc.stop(t0 + 1.8);
    }
  }

  setMuted(muted) {
    if (!this.ctx) return;
    this.master.gain.setTargetAtTime(muted ? 0 : 0.55, this.ctx.currentTime, 0.05);
  }

  crash() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const dur = 0.22;
    const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const gain = ctx.createGain();
    gain.gain.value = 0.3;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 900;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start();
  }
}
