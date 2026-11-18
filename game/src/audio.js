// Coral Bay Heat — all sound is procedural WebAudio: no audio files, nothing to load.
// An engine hum that follows the car's revs, a police siren that swells as the nearest
// cruiser closes in, one-shot effects for guns, fists, crashes and cash, and a slow
// synthwave pad loop for the sunset. The context is created on the first user gesture,
// as browsers require; every call is safe before that (it simply stays silent).

export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.noiseBuffer = null;
    this.engineNodes = null;
    this.sirenNodes = null;
    this.musicTimer = null;
    this.nextNoteTime = 0;
    this.beat = 0;
  }

  /** Create the context (call from a click or key press) and start the music loop. */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.9;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 0.5;
      this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this.startMusic();
    } catch {
      this.ctx = null;
    }
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(muted ? 0 : 0.9, this.ctx.currentTime, 0.03);
    }
  }

  /** A short filtered noise burst — the basis of shots, hits and crashes. */
  burst({ dur = 0.12, freq = 1200, q = 0.8, gain = 0.25, type = 'bandpass', slideTo = null } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(freq, t);
    if (slideTo) filter.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    filter.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  /** A plain oscillator blip with an envelope. */
  tone({ freq = 440, dur = 0.15, type = 'sine', gain = 0.15, slideTo = null, delay = 0 } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  shot() {
    this.burst({ dur: 0.16, freq: 2600, q: 0.4, gain: 0.5, slideTo: 300 });
    this.tone({ freq: 160, dur: 0.09, type: 'square', gain: 0.18, slideTo: 60 });
  }

  punch() {
    this.burst({ dur: 0.08, freq: 300, q: 1, gain: 0.4, type: 'lowpass' });
  }

  thud() {
    this.burst({ dur: 0.14, freq: 180, q: 1, gain: 0.45, type: 'lowpass' });
    this.tone({ freq: 70, dur: 0.12, type: 'sine', gain: 0.3, slideTo: 40 });
  }

  crash(intensity = 1) {
    this.burst({ dur: 0.28, freq: 900, q: 0.5, gain: 0.35 * intensity, slideTo: 120 });
    this.burst({ dur: 0.1, freq: 3400, q: 2, gain: 0.16 * intensity });
  }

  skid() {
    this.burst({ dur: 0.2, freq: 1900, q: 6, gain: 0.06 });
  }

  honk() {
    this.tone({ freq: 370, dur: 0.16, type: 'square', gain: 0.07 });
    this.tone({ freq: 466, dur: 0.16, type: 'square', gain: 0.07 });
  }

  pickup() {
    this.tone({ freq: 660, dur: 0.09, type: 'sine', gain: 0.16 });
    this.tone({ freq: 990, dur: 0.14, type: 'sine', gain: 0.16, delay: 0.07 });
  }

  cash() {
    this.tone({ freq: 880, dur: 0.08, type: 'triangle', gain: 0.2 });
    this.tone({ freq: 1174, dur: 0.1, type: 'triangle', gain: 0.2, delay: 0.06 });
    this.tone({ freq: 1568, dur: 0.2, type: 'triangle', gain: 0.2, delay: 0.12 });
  }

  missionStart() {
    this.tone({ freq: 523, dur: 0.12, type: 'triangle', gain: 0.18 });
    this.tone({ freq: 784, dur: 0.2, type: 'triangle', gain: 0.18, delay: 0.1 });
  }

  missionComplete() {
    const notes = [523, 659, 784, 1046];
    notes.forEach((f, i) => this.tone({ freq: f, dur: 0.22, type: 'triangle', gain: 0.2, delay: i * 0.09 }));
  }

  busted() {
    this.tone({ freq: 392, dur: 0.25, type: 'sawtooth', gain: 0.12, slideTo: 196 });
    this.tone({ freq: 311, dur: 0.4, type: 'sawtooth', gain: 0.12, slideTo: 155, delay: 0.2 });
  }

  /** Start or stop the car's engine voice; call every frame while driving with 0..1 revs. */
  engine(running, revs) {
    if (!this.ctx) return;
    if (!running) {
      if (this.engineNodes) {
        const t = this.ctx.currentTime;
        this.engineNodes.gain.gain.setTargetAtTime(0, t, 0.06);
        const nodes = this.engineNodes;
        window.setTimeout(() => { try { nodes.osc.stop(); nodes.sub.stop(); } catch { /* already stopped */ } }, 250);
        this.engineNodes = null;
      }
      return;
    }
    if (!this.engineNodes) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      const sub = this.ctx.createOscillator();
      sub.type = 'square';
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      const gain = this.ctx.createGain();
      gain.gain.value = 0;
      osc.connect(filter);
      sub.connect(filter);
      filter.connect(gain).connect(this.master);
      osc.start();
      sub.start();
      this.engineNodes = { osc, sub, filter, gain };
    }
    const t = this.ctx.currentTime;
    const n = this.engineNodes;
    const freq = 55 + revs * 165;
    n.osc.frequency.setTargetAtTime(freq, t, 0.05);
    n.sub.frequency.setTargetAtTime(freq / 2, t, 0.05);
    n.filter.frequency.setTargetAtTime(320 + revs * 1500, t, 0.05);
    n.gain.gain.setTargetAtTime(0.045 + revs * 0.05, t, 0.05);
  }

  /** The shared police siren: louder and faster as the nearest cruiser closes in. */
  siren(nearestCopDistance) {
    if (!this.ctx) return;
    const audible = nearestCopDistance < 900;
    if (!audible) {
      if (this.sirenNodes) {
        this.sirenNodes.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
        const nodes = this.sirenNodes;
        window.setTimeout(() => { try { nodes.osc.stop(); nodes.lfo.stop(); } catch { /* already stopped */ } }, 400);
        this.sirenNodes = null;
      }
      return;
    }
    if (!this.sirenNodes) {
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = 950;
      const lfo = this.ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 0.55;
      const lfoGain = this.ctx.createGain();
      lfoGain.gain.value = 330;
      lfo.connect(lfoGain).connect(osc.frequency);
      const gain = this.ctx.createGain();
      gain.gain.value = 0;
      osc.connect(gain).connect(this.master);
      osc.start();
      lfo.start();
      this.sirenNodes = { osc, lfo, gain };
    }
    const closeness = 1 - Math.max(0, nearestCopDistance) / 900;
    this.sirenNodes.gain.gain.setTargetAtTime(0.012 + closeness * 0.05, this.ctx.currentTime, 0.1);
    this.sirenNodes.lfo.frequency.setTargetAtTime(0.45 + closeness * 0.5, this.ctx.currentTime, 0.2);
  }

  /** A slow synthwave loop: Am – F – C – G pads with a soft bass pulse, scheduled ahead. */
  startMusic() {
    if (!this.ctx || this.musicTimer) return;
    const chords = [
      [110.0, 220.0, 261.63, 329.63], // Am
      [87.31, 174.61, 220.0, 261.63], // F
      [130.81, 196.0, 261.63, 329.63], // C
      [98.0, 196.0, 246.94, 293.66], // G
    ];
    const beatLen = 60 / 92 / 2; // 92 bpm, eighth-note steps
    this.nextNoteTime = this.ctx.currentTime + 0.1;
    this.beat = 0;
    this.musicTimer = window.setInterval(() => {
      if (!this.ctx) return;
      while (this.nextNoteTime < this.ctx.currentTime + 0.18) {
        const step = this.beat;
        const bar = Math.floor(step / 8) % 4;
        const chord = chords[bar];
        const at = this.nextNoteTime;
        if (step % 8 === 0) {
          // Pad: the whole chord, slow attack, one bar long.
          for (const f of chord.slice(1)) {
            const osc = this.ctx.createOscillator();
            osc.type = 'sawtooth';
            osc.frequency.value = f;
            const filter = this.ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.value = 640;
            const g = this.ctx.createGain();
            g.gain.setValueAtTime(0, at);
            g.gain.linearRampToValueAtTime(0.016, at + 0.6);
            g.gain.linearRampToValueAtTime(0.0001, at + beatLen * 8);
            osc.connect(filter).connect(g).connect(this.master);
            osc.start(at);
            osc.stop(at + beatLen * 8 + 0.05);
          }
        }
        if (step % 2 === 0) {
          // Bass pulse on the chord root.
          const osc = this.ctx.createOscillator();
          osc.type = 'triangle';
          osc.frequency.value = chord[0];
          const g = this.ctx.createGain();
          g.gain.setValueAtTime(0.055, at);
          g.gain.exponentialRampToValueAtTime(0.001, at + beatLen * 1.8);
          osc.connect(g).connect(this.master);
          osc.start(at);
          osc.stop(at + beatLen * 2);
        }
        this.nextNoteTime += beatLen;
        this.beat++;
      }
    }, 40);
  }
}
