// Bayu Heat — every sound is synthesized with WebAudio: engine hum, POLRES
// sirens that swell as cruisers close in, gunshots, crashes, mission jingles

import { RADIO } from './config.js';

export class GameAudio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.radioOn = false;
    this.trackIdx = 0;
    this.radioTimer = null;
    this.bar = 0;
    this.nextNoteAt = 0;
  }

  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    this.master.connect(ctx.destination);
    const len = ctx.sampleRate;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.engGain = ctx.createGain(); this.engGain.gain.value = 0;
    const engFilter = ctx.createBiquadFilter(); engFilter.type = 'lowpass'; engFilter.frequency.value = 700;
    this.engOsc1 = ctx.createOscillator(); this.engOsc1.type = 'sawtooth'; this.engOsc1.frequency.value = 55;
    this.engOsc2 = ctx.createOscillator(); this.engOsc2.type = 'square'; this.engOsc2.frequency.value = 28;
    const g2 = ctx.createGain(); g2.gain.value = 0.5;
    this.engOsc1.connect(engFilter); this.engOsc2.connect(g2); g2.connect(engFilter);
    engFilter.connect(this.engGain); this.engGain.connect(this.master);
    this.engOsc1.start(); this.engOsc2.start();
    this.sirGain = ctx.createGain(); this.sirGain.gain.value = 0;
    this.sirOsc = ctx.createOscillator(); this.sirOsc.type = 'triangle'; this.sirOsc.frequency.value = 800;
    const lfo = ctx.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 0.55;
    const lfoGain = ctx.createGain(); lfoGain.gain.value = 130;
    lfo.connect(lfoGain); lfoGain.connect(this.sirOsc.frequency);
    this.sirOsc.connect(this.sirGain); this.sirGain.connect(this.master);
    this.sirOsc.start(); lfo.start();
    this.radioGain = ctx.createGain(); this.radioGain.gain.value = 0;
    this.radioGain.connect(this.master);
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.9;
  }

  engine(on, ratio, bike) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const target = on ? 0.05 + ratio * 0.05 : 0;
    this.engGain.gain.setTargetAtTime(target, t, 0.09);
    const base = bike ? 70 : 48;
    const f = base + ratio * (bike ? 210 : 150);
    this.engOsc1.frequency.setTargetAtTime(f, t, 0.06);
    this.engOsc2.frequency.setTargetAtTime(f * 0.5 + 1, t, 0.06);
  }

  siren(dist, active) {
    if (!this.ctx) return;
    const target = active && dist < 110 ? Math.max(0, 0.085 * (1 - dist / 110)) : 0;
    this.sirGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.15);
  }

  blip(freq = 760, dur = 0.045, vol = 0.12) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'square'; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  }

  shot() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.setValueAtTime(2600, t);
    bp.frequency.exponentialRampToValueAtTime(300, t + 0.11);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    src.connect(bp); bp.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + 0.16);
  }

  punch() { this.thud(0.25, 300, 0.12); }
  crash(i = 1) { this.thud(0.3 + i * 0.3, 240, 0.3); }

  thud(vol, freq, dur) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = freq;
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(lp); lp.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + dur + 0.05);
    const o = ctx.createOscillator(), og = ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(45, t + dur);
    og.gain.setValueAtTime(vol * 0.8, t); og.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(og); og.connect(this.master); o.start(t); o.stop(t + dur + 0.05);
  }

  tone(freq, at, dur, vol, type = 'triangle') {
    const ctx = this.ctx, t = ctx.currentTime + at;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.05);
  }

  jingle(kind) {
    if (!this.ctx) return;
    if (kind === 'mission') { [0, 4, 7, 12, 16].forEach((s, i) => this.tone(523 * Math.pow(2, s / 12), i * 0.09, 0.34, 0.16)); this.thud(0.2, 200, 0.2); }
    else if (kind === 'fail') { [7, 4, 0, -5].forEach((s, i) => this.tone(392 * Math.pow(2, s / 12), i * 0.13, 0.3, 0.14, 'sawtooth')); }
    else if (kind === 'pickup') { this.tone(880, 0, 0.12, 0.14); this.tone(1318, 0.07, 0.2, 0.14); }
    else if (kind === 'levelup') { [0, 7, 12, 19, 24].forEach((s, i) => this.tone(440 * Math.pow(2, s / 12), i * 0.07, 0.3, 0.13)); }
    else if (kind === 'summit') { [0, 4, 7, 12, 7, 12, 16, 19, 24].forEach((s, i) => this.tone(523 * Math.pow(2, s / 12), i * 0.11, 0.4, 0.15)); }
    else if (kind === 'busted') { [0, -2, -4].forEach((s, i) => this.tone(220 * Math.pow(2, s / 12), i * 0.16, 0.34, 0.15, 'square')); }
  }

  radioStart() {
    if (!this.ctx || this.radioOn) return;
    this.radioOn = true;
    this.bar = 0;
    this.nextNoteAt = this.ctx.currentTime + 0.1;
    this.radioGain.gain.setTargetAtTime(0.5, this.ctx.currentTime, 0.4);
    this.radioTimer = setInterval(() => this.scheduleRadio(), 200);
  }
  radioStop() {
    if (!this.radioOn) return;
    this.radioOn = false;
    if (this.radioTimer) clearInterval(this.radioTimer);
    if (this.ctx) this.radioGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.15);
  }
  nextTrack() {
    this.trackIdx = (this.trackIdx + 1) % RADIO.tracks.length;
    this.bar = 0;
    if (this.ctx) this.nextNoteAt = this.ctx.currentTime + 0.05;
    return RADIO.tracks[this.trackIdx];
  }
  currentTrack() { return RADIO.tracks[this.trackIdx]; }

  scheduleRadio() {
    if (!this.ctx || !this.radioOn) return;
    const track = RADIO.tracks[this.trackIdx];
    const beat = 60 / track.bpm, barLen = beat * 4;
    while (this.nextNoteAt < this.ctx.currentTime + 0.35) {
      this.playBar(track, this.nextNoteAt, barLen, this.bar);
      this.nextNoteAt += barLen;
      this.bar++;
      if (this.bar >= 16) { this.bar = 0; this.trackIdx = (this.trackIdx + 1) % RADIO.tracks.length; }
    }
  }

  radioTone(freq, t, dur, vol, type, dest) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.04);
    g.gain.setTargetAtTime(0.0001, t + dur * 0.55, dur * 0.22);
    o.connect(g); g.connect(dest || this.radioGain);
    o.start(t); o.stop(t + dur + 0.15);
  }

  playBar(track, t, barLen, barIdx) {
    const prog = [0, 8, 3, 10];                       // chord roots, semitones from track root
    const chord = prog[barIdx % 4];
    const root = track.root * Math.pow(2, chord / 12);
    const mode = track.mode;
    [0, 2, 4].forEach((deg) => {
      const f = root * Math.pow(2, mode[deg % mode.length] / 12) * (deg >= mode.length ? 2 : 1);
      this.radioTone(f, t, barLen * 1.05, 0.05, 'triangle');
    });
    const beat = barLen / 4;
    this.radioTone(root / 2, t, beat * 0.9, 0.16, 'sine');
    this.radioTone(root / 2, t + beat * 2.5, beat * 0.7, 0.13, 'sine');
    for (let s = 0; s < 8; s++) {
      if ((s * 7 + barIdx * 3) % 5 === 4) continue;
      const deg = mode[(s + barIdx) % mode.length];
      const f = root * 2 * Math.pow(2, deg / 12);
      this.radioTone(f, t + s * beat / 2, beat * 0.42, 0.045, 'square');
    }
    const src = this.ctx.createBufferSource(); src.buffer = this.noiseBuf;
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.1, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    src.connect(lp); lp.connect(g); g.connect(this.radioGain);
    src.start(t); src.stop(t + 0.12);
  }
}
