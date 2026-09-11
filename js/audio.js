/**
 * audio.js - Procedural Web Audio API Sound Generator
 * 
 * 100% Self-contained - zero external audio assets required.
 * Synthesizes all retro military and apocalyptic zombie defense sounds in real time:
 * - Gunfire: Pistol/Rifle, Shotgun blast with pump, Heavy sniper rifle, Gatling minigun
 * - Rocket launch whoosh & Heavy explosive detonation
 * - High-voltage Tesla electric crackle/zap (FM synthesis)
 * - Flamethrower whoosh hiss & roaring fire
 * - Formant-synthesized guttural zombie groans & squishy death splatters
 * - Wave start ominous air raid horn, button clicks, coin/gold chimes, base alarm, upgrade fanfare
 */

class SoundFX {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.sfxGain = null;

    // Volume settings
    this.masterVolume = 0.8;
    this.sfxVolume = 0.9;
    this.isMuted = false;

    // Cached pre-generated noise buffers for performance & zero garbage collection
    this.whiteNoiseBuffer = null;
    this.pinkNoiseBuffer = null;

    // Voice throttling to prevent clipping during massive zombie swarms
    this.lastSoundTimes = {};
    this._userGestureReceived = false;

    // Auto-init on first user interaction to comply with modern browser autoplay policies
    this._setupAutoUnlock();
  }

  init() {
    if (this._userGestureReceived) {
      this._initContext();
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
    }
  }

  _initContext() {
    if (this.ctx) return;

    try {
      const AudioContextClass = (typeof window !== 'undefined') ? (window.AudioContext || window.webkitAudioContext) : null;
      if (!AudioContextClass) {
        return;
      }
      this.ctx = new AudioContextClass();

      // Master Gain Node
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : this.masterVolume, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);

      // SFX Gain Node
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.setValueAtTime(this.sfxVolume, this.ctx.currentTime);
      this.sfxGain.connect(this.masterGain);

      // Pre-render noise buffers
      this._generateNoiseBuffers();
    } catch (err) {
      // Audio context may be restricted until user gesture
    }
  }

  _setupAutoUnlock() {
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;

    const unlock = () => {
      this._userGestureReceived = true;
      this._initContext();
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
    };

    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock, { passive: true });
    window.addEventListener('click', unlock, { passive: true });
    window.addEventListener('touchstart', unlock, { passive: true });
  }

  ensureContext() {
    if (!this._userGestureReceived) return false;
    this._initContext();
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return Boolean(this.ctx && this.ctx.state === 'running');
  }

  _generateNoiseBuffers() {
    if (!this.ctx) return;
    const sampleRate = this.ctx.sampleRate;
    const bufferSize = sampleRate * 2;

    // White noise
    this.whiteNoiseBuffer = this.ctx.createBuffer(1, bufferSize, sampleRate);
    const whiteData = this.whiteNoiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      whiteData[i] = Math.random() * 2 - 1;
    }

    // Pink noise
    this.pinkNoiseBuffer = this.ctx.createBuffer(1, bufferSize, sampleRate);
    const pinkData = this.pinkNoiseBuffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      pinkData[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
      b6 = white * 0.115926;
    }
  }

  _throttle(soundId, minIntervalMs) {
    const now = performance.now ? performance.now() : Date.now();
    const last = this.lastSoundTimes[soundId] || 0;
    if (now - last < minIntervalMs) {
      return false;
    }
    this.lastSoundTimes[soundId] = now;
    return true;
  }

  _makeDistortionCurve(amount = 20) {
    const n_samples = 256;
    const curve = new Float32Array(n_samples);
    const deg = Math.PI / 180;
    for (let i = 0; i < n_samples; ++i) {
      const x = (i * 2) / n_samples - 1;
      curve[i] = ((3 + amount) * x * 20 * deg) / (Math.PI + amount * Math.abs(x));
    }
    return curve;
  }

  // =========================================================================
  // CORE SOUND GENERATORS
  // =========================================================================

  playGunshot(type = 'pistol') {
    this.ensureContext();
    if (!this.ctx || this.isMuted) return;

    const t0 = this.ctx.currentTime;

    if (type === 'shotgun') {
      if (!this._throttle('shotgun', 120)) return;

      const osc = this.ctx.createOscillator();
      const oscGain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(160, t0);
      osc.frequency.exponentialRampToValueAtTime(32, t0 + 0.18);
      oscGain.gain.setValueAtTime(0.8, t0);
      oscGain.gain.exponentialRampToValueAtTime(0.01, t0 + 0.18);
      osc.connect(oscGain);
      oscGain.connect(this.sfxGain);
      osc.start(t0);
      osc.stop(t0 + 0.18);

      const noise = this.ctx.createBufferSource();
      noise.buffer = this.whiteNoiseBuffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1400, t0);
      filter.frequency.exponentialRampToValueAtTime(200, t0 + 0.25);
      const noiseGain = this.ctx.createGain();
      noiseGain.gain.setValueAtTime(1.0, t0);
      noiseGain.gain.exponentialRampToValueAtTime(0.01, t0 + 0.28);
      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(this.sfxGain);
      noise.start(t0);
      noise.stop(t0 + 0.28);

      setTimeout(() => {
        if (!this.ctx) return;
        const tp = this.ctx.currentTime;
        const pOsc = this.ctx.createOscillator();
        const pGain = this.ctx.createGain();
        pOsc.type = 'square';
        pOsc.frequency.setValueAtTime(600, tp);
        pOsc.frequency.exponentialRampToValueAtTime(200, tp + 0.04);
        pGain.gain.setValueAtTime(0.2, tp);
        pGain.gain.exponentialRampToValueAtTime(0.01, tp + 0.04);
        pOsc.connect(pGain);
        pGain.connect(this.sfxGain);
        pOsc.start(tp);
        pOsc.stop(tp + 0.04);
      }, 160);

    } else if (type === 'sniper') {
      if (!this._throttle('sniper', 150)) return;

      const osc = this.ctx.createOscillator();
      const oscGain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(260, t0);
      osc.frequency.exponentialRampToValueAtTime(25, t0 + 0.45);
      oscGain.gain.setValueAtTime(0.9, t0);
      oscGain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.45);
      osc.connect(oscGain);
      oscGain.connect(this.sfxGain);
      osc.start(t0);
      osc.stop(t0 + 0.45);

      const noise = this.ctx.createBufferSource();
      noise.buffer = this.whiteNoiseBuffer;
      const hpf = this.ctx.createBiquadFilter();
      hpf.type = 'highpass';
      hpf.frequency.setValueAtTime(1800, t0);
      const nGain = this.ctx.createGain();
      nGain.gain.setValueAtTime(0.8, t0);
      nGain.gain.exponentialRampToValueAtTime(0.01, t0 + 0.12);
      noise.connect(hpf);
      hpf.connect(nGain);
      nGain.connect(this.sfxGain);
      noise.start(t0);
      noise.stop(t0 + 0.12);

    } else if (type === 'gatling') {
      if (!this._throttle('gatling', 40)) return;

      const osc = this.ctx.createOscillator();
      const oscGain = this.ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(220, t0);
      osc.frequency.exponentialRampToValueAtTime(50, t0 + 0.05);
      oscGain.gain.setValueAtTime(0.55, t0);
      oscGain.gain.exponentialRampToValueAtTime(0.01, t0 + 0.05);
      osc.connect(oscGain);
      oscGain.connect(this.sfxGain);
      osc.start(t0);
      osc.stop(t0 + 0.05);

      const noise = this.ctx.createBufferSource();
      noise.buffer = this.whiteNoiseBuffer;
      const bpf = this.ctx.createBiquadFilter();
      bpf.type = 'bandpass';
      bpf.frequency.setValueAtTime(2400, t0);
      bpf.Q.setValueAtTime(2.0, t0);
      const nGain = this.ctx.createGain();
      nGain.gain.setValueAtTime(0.4, t0);
      nGain.gain.exponentialRampToValueAtTime(0.01, t0 + 0.035);
      noise.connect(bpf);
      bpf.connect(nGain);
      nGain.connect(this.sfxGain);
      noise.start(t0);
      noise.stop(t0 + 0.035);

    } else {
      if (!this._throttle('gunshot', 50)) return;

      const osc = this.ctx.createOscillator();
      const oscGain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(200, t0);
      osc.frequency.exponentialRampToValueAtTime(45, t0 + 0.08);
      oscGain.gain.setValueAtTime(0.6, t0);
      oscGain.gain.exponentialRampToValueAtTime(0.01, t0 + 0.08);
      osc.connect(oscGain);
      oscGain.connect(this.sfxGain);
      osc.start(t0);
      osc.stop(t0 + 0.08);

      const noise = this.ctx.createBufferSource();
      noise.buffer = this.whiteNoiseBuffer;
      const bpf = this.ctx.createBiquadFilter();
      bpf.type = 'bandpass';
      bpf.frequency.setValueAtTime(1800, t0);
      const nGain = this.ctx.createGain();
      nGain.gain.setValueAtTime(0.65, t0);
      nGain.gain.exponentialRampToValueAtTime(0.01, t0 + 0.09);
      noise.connect(bpf);
      bpf.connect(nGain);
      nGain.connect(this.sfxGain);
      noise.start(t0);
      noise.stop(t0 + 0.09);
    }
  }

  playRocketLaunch() {
    this.ensureContext();
    if (!this.ctx || this.isMuted) return;
    if (!this._throttle('rocket_launch', 150)) return;

    const t0 = this.ctx.currentTime;
    const dur = 0.38;

    const noise = this.ctx.createBufferSource();
    noise.buffer = this.pinkNoiseBuffer || this.whiteNoiseBuffer;

    const bpf = this.ctx.createBiquadFilter();
    bpf.type = 'bandpass';
    bpf.Q.setValueAtTime(2.5, t0);
    bpf.frequency.setValueAtTime(220, t0);
    bpf.frequency.exponentialRampToValueAtTime(1900, t0 + 0.28);
    bpf.frequency.exponentialRampToValueAtTime(450, t0 + dur);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.1, t0);
    gain.gain.linearRampToValueAtTime(0.7, t0 + 0.12);
    gain.gain.exponentialRampToValueAtTime(0.01, t0 + dur);

    noise.connect(bpf);
    bpf.connect(gain);
    gain.connect(this.sfxGain);

    noise.start(t0);
    noise.stop(t0 + dur);
  }

  playExplosion(intensity = 1.0) {
    this.ensureContext();
    if (!this.ctx || this.isMuted) return;
    if (!this._throttle('explosion', 90)) return;

    const t0 = this.ctx.currentTime;
    const dur = 0.85 * Math.min(1.5, Math.max(0.6, intensity));

    const subOsc = this.ctx.createOscillator();
    const subGain = this.ctx.createGain();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(140, t0);
    subOsc.frequency.exponentialRampToValueAtTime(25, t0 + dur);
    subGain.gain.setValueAtTime(0.9 * intensity, t0);
    subGain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    subOsc.connect(subGain);
    subGain.connect(this.sfxGain);
    subOsc.start(t0);
    subOsc.stop(t0 + dur);

    const noise = this.ctx.createBufferSource();
    noise.buffer = this.whiteNoiseBuffer;

    const lpf = this.ctx.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.frequency.setValueAtTime(800, t0);
    lpf.frequency.exponentialRampToValueAtTime(80, t0 + dur * 0.7);

    const dist = this.ctx.createWaveShaper();
    dist.curve = this._makeDistortionCurve(30);

    const nGain = this.ctx.createGain();
    nGain.gain.setValueAtTime(0.85 * intensity, t0);
    nGain.gain.exponentialRampToValueAtTime(0.01, t0 + dur * 0.75);

    noise.connect(lpf);
    lpf.connect(dist);
    dist.connect(nGain);
    nGain.connect(this.sfxGain);

    noise.start(t0);
    noise.stop(t0 + dur);
  }

  playTeslaZap() {
    this.ensureContext();
    if (!this.ctx || this.isMuted) return;
    if (!this._throttle('tesla_zap', 100)) return;

    const t0 = this.ctx.currentTime;
    const dur = 0.22;

    const carrier = this.ctx.createOscillator();
    carrier.type = 'sawtooth';
    carrier.frequency.setValueAtTime(950, t0);
    carrier.frequency.exponentialRampToValueAtTime(320, t0 + dur);

    const mod = this.ctx.createOscillator();
    mod.type = 'square';
    mod.frequency.setValueAtTime(110, t0);
    mod.frequency.linearRampToValueAtTime(45, t0 + dur);

    const modGain = this.ctx.createGain();
    modGain.gain.setValueAtTime(650, t0);
    modGain.gain.exponentialRampToValueAtTime(80, t0 + dur);

    mod.connect(carrier.frequency);

    const hpf = this.ctx.createBiquadFilter();
    hpf.type = 'highpass';
    hpf.frequency.setValueAtTime(600, t0);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.6, t0);
    gain.gain.setValueAtTime(0.7, t0 + 0.04);
    gain.gain.setValueAtTime(0.3, t0 + 0.08);
    gain.gain.setValueAtTime(0.65, t0 + 0.12);
    gain.gain.exponentialRampToValueAtTime(0.01, t0 + dur);

    carrier.connect(hpf);
    hpf.connect(gain);
    gain.connect(this.sfxGain);

    carrier.start(t0);
    mod.start(t0);
    carrier.stop(t0 + dur);
    mod.stop(t0 + dur);
  }

  playFlamethrower() {
    this.ensureContext();
    if (!this.ctx || this.isMuted) return;
    if (!this._throttle('flamethrower', 110)) return;

    const t0 = this.ctx.currentTime;
    const dur = 0.26;

    const noise = this.ctx.createBufferSource();
    noise.buffer = this.pinkNoiseBuffer || this.whiteNoiseBuffer;

    const bpf = this.ctx.createBiquadFilter();
    bpf.type = 'bandpass';
    bpf.frequency.setValueAtTime(750, t0);
    bpf.Q.setValueAtTime(1.2, t0);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.1, t0);
    gain.gain.linearRampToValueAtTime(0.55, t0 + 0.06);
    gain.gain.exponentialRampToValueAtTime(0.01, t0 + dur);

    noise.connect(bpf);
    bpf.connect(gain);
    gain.connect(this.sfxGain);

    noise.start(t0);
    noise.stop(t0 + dur);
  }

  playZombieGroan(variant = null) {
    this.ensureContext();
    if (!this.ctx || this.isMuted) return;
    if (!this._throttle('zombie_groan', 600)) return;

    const t0 = this.ctx.currentTime;
    const dur = 0.55 + Math.random() * 0.3;

    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    const basePitch = 68 + Math.random() * 26;
    osc.frequency.setValueAtTime(basePitch, t0);
    osc.frequency.linearRampToValueAtTime(basePitch * 0.82, t0 + dur);

    const f1 = this.ctx.createBiquadFilter();
    f1.type = 'bandpass';
    f1.frequency.setValueAtTime(360, t0);
    f1.Q.setValueAtTime(4.0, t0);

    const f2 = this.ctx.createBiquadFilter();
    f2.type = 'bandpass';
    f2.frequency.setValueAtTime(920, t0);
    f2.Q.setValueAtTime(3.5, t0);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.01, t0);
    gain.gain.linearRampToValueAtTime(0.45, t0 + 0.12);
    gain.gain.exponentialRampToValueAtTime(0.01, t0 + dur);

    osc.connect(f1);
    osc.connect(f2);
    f1.connect(gain);
    f2.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(t0);
    osc.stop(t0 + dur);
  }

  playZombieSplatter() {
    this.ensureContext();
    if (!this.ctx || this.isMuted) return;
    if (!this._throttle('zombie_splatter', 50)) return;

    const t0 = this.ctx.currentTime;
    const dur = 0.14;

    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(580, t0);
    osc.frequency.exponentialRampToValueAtTime(120, t0 + dur);

    const noise = this.ctx.createBufferSource();
    noise.buffer = this.whiteNoiseBuffer;

    const lpf = this.ctx.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.frequency.setValueAtTime(1600, t0);
    lpf.frequency.exponentialRampToValueAtTime(300, t0 + dur);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.5, t0);
    gain.gain.exponentialRampToValueAtTime(0.01, t0 + dur);

    osc.connect(gain);
    noise.connect(lpf);
    lpf.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(t0);
    noise.start(t0);
    osc.stop(t0 + dur);
    noise.stop(t0 + dur);
  }

  playWaveStartHorn() {
    this.ensureContext();
    if (!this.ctx || this.isMuted) return;

    const t0 = this.ctx.currentTime;
    const dur = 1.35;

    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    osc1.type = 'sawtooth';
    osc2.type = 'sawtooth';

    osc1.frequency.setValueAtTime(95, t0);
    osc1.frequency.exponentialRampToValueAtTime(110, t0 + 0.35);
    osc2.frequency.setValueAtTime(142, t0);
    osc2.frequency.exponentialRampToValueAtTime(165, t0 + 0.35);

    const lpf = this.ctx.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.frequency.setValueAtTime(450, t0);
    lpf.frequency.linearRampToValueAtTime(1400, t0 + 0.4);
    lpf.frequency.linearRampToValueAtTime(600, t0 + dur);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.01, t0);
    gain.gain.linearRampToValueAtTime(0.65, t0 + 0.25);
    gain.gain.setValueAtTime(0.6, t0 + dur - 0.35);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);

    osc1.connect(lpf);
    osc2.connect(lpf);
    lpf.connect(gain);
    gain.connect(this.sfxGain);

    osc1.start(t0);
    osc2.start(t0);
    osc1.stop(t0 + dur);
    osc2.stop(t0 + dur);
  }

  playBaseAlarm() {
    this.ensureContext();
    if (!this.ctx || this.isMuted) return;
    if (!this._throttle('base_alarm', 400)) return;

    const t0 = this.ctx.currentTime;
    const dur = 0.45;

    const osc = this.ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(650, t0);
    osc.frequency.setValueAtTime(880, t0 + 0.15);
    osc.frequency.setValueAtTime(650, t0 + 0.30);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.4, t0);
    gain.gain.exponentialRampToValueAtTime(0.01, t0 + dur);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(t0);
    osc.stop(t0 + dur);
  }

  playButtonClick() {
    this.ensureContext();
    if (!this.ctx || this.isMuted) return;

    const t0 = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(1200, t0);
    osc.frequency.exponentialRampToValueAtTime(400, t0 + 0.025);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.3, t0);
    gain.gain.exponentialRampToValueAtTime(0.01, t0 + 0.025);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(t0);
    osc.stop(t0 + 0.025);
  }

  playCoin() {
    this.ensureContext();
    if (!this.ctx || this.isMuted) return;
    if (!this._throttle('coin', 60)) return;

    const t0 = this.ctx.currentTime;

    const osc1 = this.ctx.createOscillator();
    const gain1 = this.ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(987.77, t0);
    gain1.gain.setValueAtTime(0.35, t0);
    gain1.gain.exponentialRampToValueAtTime(0.01, t0 + 0.08);
    osc1.connect(gain1);
    gain1.connect(this.sfxGain);
    osc1.start(t0);
    osc1.stop(t0 + 0.08);

    const osc2 = this.ctx.createOscillator();
    const gain2 = this.ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1318.51, t0 + 0.06);
    gain2.gain.setValueAtTime(0.0, t0);
    gain2.gain.setValueAtTime(0.4, t0 + 0.06);
    gain2.gain.exponentialRampToValueAtTime(0.001, t0 + 0.28);
    osc2.connect(gain2);
    gain2.connect(this.sfxGain);
    osc2.start(t0 + 0.06);
    osc2.stop(t0 + 0.28);
  }

  playUpgrade() {
    this.ensureContext();
    if (!this.ctx || this.isMuted) return;

    const t0 = this.ctx.currentTime;
    const notes = [523.25, 659.25, 783.99];

    notes.forEach((freq, idx) => {
      const noteTime = t0 + idx * 0.08;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, noteTime);

      gain.gain.setValueAtTime(0.0, t0);
      gain.gain.setValueAtTime(0.35, noteTime);
      gain.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.25);

      osc.connect(gain);
      gain.connect(this.sfxGain);

      osc.start(noteTime);
      osc.stop(noteTime + 0.25);
    });
  }

  playVictory() {
    this.ensureContext();
    if (!this.ctx || this.isMuted) return;

    const t0 = this.ctx.currentTime;
    const melody = [
      { f: 523.25, d: 0.12 },
      { f: 659.25, d: 0.12 },
      { f: 783.99, d: 0.12 },
      { f: 1046.50, d: 0.40 }
    ];

    let curTime = t0;
    melody.forEach(m => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(m.f, curTime);
      gain.gain.setValueAtTime(0.4, curTime);
      gain.gain.exponentialRampToValueAtTime(0.001, curTime + m.d);
      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(curTime);
      osc.stop(curTime + m.d);
      curTime += m.d;
    });
  }

  playDefeat() {
    this.ensureContext();
    if (!this.ctx || this.isMuted) return;

    const t0 = this.ctx.currentTime;
    const melody = [
      { f: 440.00, d: 0.22 },
      { f: 415.30, d: 0.22 },
      { f: 392.00, d: 0.22 },
      { f: 349.23, d: 0.55 }
    ];

    let curTime = t0;
    melody.forEach(m => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(m.f, curTime);
      gain.gain.setValueAtTime(0.3, curTime);
      gain.gain.exponentialRampToValueAtTime(0.001, curTime + m.d);
      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(curTime);
      osc.stop(curTime + m.d);
      curTime += m.d;
    });
  }

  // =========================================================================
  // INTEROPERABILITY ALIASES FOR UI & MAIN GAME ENGINE
  // =========================================================================

  playClick() {
    this.playButtonClick();
  }

  playSelect() {
    this.playCoin();
  }

  playPlace() {
    this.ensureContext();
    if (!this.ctx || this.isMuted) return;
    this.playTone(160, 'sawtooth', 0.12, 60);
    setTimeout(() => this.playTone(450, 'square', 0.08, 900), 50);
  }

  playSell() {
    this.playCoin();
  }

  playNextWave() {
    this.playWaveStartHorn();
  }

  playOvercharge() {
    this.playExplosion(1.6);
    this.playTeslaZap();
  }

  playError() {
    this.playTone(180, 'square', 0.15, 140);
  }

  playShoot(towerType) {
    switch (towerType) {
      case 'gunner':
        this.playGunshot('pistol');
        break;
      case 'archer':
        this.playGunshot('sniper');
        break;
      case 'rocket':
        this.playRocketLaunch();
        break;
      case 'flame':
        this.playFlamethrower();
        break;
      case 'tesla':
        this.playTeslaZap();
        break;
      case 'mortar':
        this.playExplosion(1.4);
        break;
      case 'gatling':
        this.playGunshot('gatling');
        break;
      default:
        this.playGunshot('pistol');
    }
  }

  playZombieHit() {
    if (Math.random() < 0.3) {
      this.playZombieSplatter();
    } else if (Math.random() < 0.1) {
      this.playZombieGroan();
    }
  }

  playTone(freq, type, duration, endFreq = null) {
    if (this.isMuted) return;
    this.ensureContext();
    if (!this.ctx) return;

    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      const now = this.ctx.currentTime;
      osc.frequency.setValueAtTime(freq, now);
      if (endFreq) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(10, endFreq), now + duration);
      }
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.linearRampToValueAtTime(0.01, now + duration);
      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(now);
      osc.stop(now + duration);
    } catch (err) {}
  }

  // =========================================================================
  // VOLUME & MUTE CONTROLS
  // =========================================================================

  setMasterVolume(vol) {
    this.masterVolume = Math.max(0, Math.min(1, vol));
    if (this.masterGain && this.ctx && !this.isMuted) {
      this.masterGain.gain.setValueAtTime(this.masterVolume, this.ctx.currentTime);
    }
  }

  setSfxVolume(vol) {
    this.sfxVolume = Math.max(0, Math.min(1, vol));
    if (this.sfxGain && this.ctx) {
      this.sfxGain.gain.setValueAtTime(this.sfxVolume, this.ctx.currentTime);
    }
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : this.masterVolume, this.ctx.currentTime);
    }
    return this.isMuted;
  }
}

if (typeof window !== 'undefined') {
  window.SoundFX = SoundFX;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SoundFX };
}
