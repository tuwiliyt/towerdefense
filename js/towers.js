/**
 * ============================================================================
 * ZOMBIE TOWER DEFENSE - TOWERS & COMBAT SYSTEM (js/towers.js)
 * ============================================================================
 * Implements:
 *  1. Seven distinct towers:
 *     - Gunner Nest (280 G): Rapid machine gun fire, muzzle flashes, survivor gunner.
 *     - Archer Tower (350 G): High range piercing arrows, survivor archer.
 *     - Rocket Launcher (550 G): Tracking rockets, AOE splash radius.
 *     - Flametrost (1250 G): Continuous cone fire, damage over time (burn status).
 *     - Tesla Coil (650 G): Emits blue electricity chain lightning arcing between up to 4 zombies.
 *     - Mortar (2150 G): High-arc ballistic shells, blast craters, heavy AOE.
 *     - Last Stand Tower: Base rotary gatling gun with devastating fire rate & Energy (E) Overcharge.
 *  2. Tower Upgrade Tiers: LVL 1, LVL 2, LVL 3 (damage, fire rate, range, visual badges).
 *  3. Targeting Modes: First along path, Closest, Strongest, Weakest.
 *  4. Projectile Physics & Collision Detection against zombies.
 *  5. Audio & FX Integration (built-in procedural Web Audio synthesizer + particle/crater systems).
 *  6. Build Slots & Free Placement Logic along road borders.
 * ============================================================================
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.TowerSystem = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ============================================================================
  // 1. PROCEDURAL AUDIO SYNTHESIZER (Fallback & Native Sound FX)
  // ============================================================================
  class SoundSynth {
    constructor() {
      this.ctx = null;
      this.enabled = true;
      this.volume = 0.28;
      this.userGestureReceived = false;
      this._setupAutoUnlock();
    }

    _setupAutoUnlock() {
      if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
      const unlock = () => {
        this.userGestureReceived = true;
        this.init();
        if (this.ctx && this.ctx.state === 'suspended') {
          this.ctx.resume().catch(() => {});
        }
      };
      window.addEventListener('pointerdown', unlock, { passive: true });
      window.addEventListener('keydown', unlock, { passive: true });
      window.addEventListener('click', unlock, { passive: true });
      window.addEventListener('touchstart', unlock, { passive: true });
    }

    init() {
      if (this.ctx) return;
      try {
        const AudioCtx =
          typeof window !== 'undefined'
            ? window.AudioContext || window.webkitAudioContext
            : null;
        if (AudioCtx) {
          this.ctx = new AudioCtx();
        }
      } catch (e) {
        // Restricted until user gesture
      }
    }

    ensureContext() {
      if (!this.userGestureReceived) return false;
      this.init();
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return Boolean(this.ctx && this.ctx.state === 'running');
    }

    play(soundType, options = {}) {
      if (!this.enabled) return;
      if (!this.ensureContext()) return;
      if (!this.ctx || this.ctx.state !== 'running') return;

      const now = this.ctx.currentTime;
      try {
        switch (soundType) {
          case 'gunner_fire': {
            // Crisp machine gun snap with short noise
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(280 + Math.random() * 40, now);
            osc.frequency.exponentialRampToValueAtTime(40, now + 0.06);

            gain.gain.setValueAtTime(this.volume * 0.45, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(now);
            osc.stop(now + 0.06);
            break;
          }

          case 'archer_fire': {
            // Bowstring twang + whoosh
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(420, now);
            osc.frequency.exponentialRampToValueAtTime(140, now + 0.12);

            gain.gain.setValueAtTime(this.volume * 0.4, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(now);
            osc.stop(now + 0.12);
            break;
          }

          case 'rocket_launch': {
            // Rocket whoosh pitch ramp
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(110, now);
            osc.frequency.exponentialRampToValueAtTime(360, now + 0.22);

            gain.gain.setValueAtTime(this.volume * 0.5, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(now);
            osc.stop(now + 0.22);
            break;
          }

          case 'explosion': {
            // Low rumbling noise explosion
            const duration = options.duration || 0.4;
            const bufferSize = this.ctx.sampleRate * duration;
            const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
              data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.25));
            }
            const noise = this.ctx.createBufferSource();
            noise.buffer = buffer;

            const filter = this.ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(320, now);
            filter.frequency.linearRampToValueAtTime(80, now + duration);

            const gain = this.ctx.createGain();
            gain.gain.setValueAtTime(this.volume * (options.power || 0.7), now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

            noise.connect(filter);
            filter.connect(gain);
            gain.connect(this.ctx.destination);
            noise.start(now);
            break;
          }

          case 'flame_loop': {
            // Hissing flame burst
            const duration = 0.12;
            const bufferSize = this.ctx.sampleRate * duration;
            const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
              data[i] = Math.random() * 2 - 1;
            }
            const noise = this.ctx.createBufferSource();
            noise.buffer = buffer;

            const filter = this.ctx.createBiquadFilter();
            filter.type = 'bandpass';
            filter.frequency.setValueAtTime(650, now);
            filter.Q.value = 1.2;

            const gain = this.ctx.createGain();
            gain.gain.setValueAtTime(this.volume * 0.28, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

            noise.connect(filter);
            filter.connect(gain);
            gain.connect(this.ctx.destination);
            noise.start(now);
            break;
          }

          case 'tesla_zap': {
            // High voltage electric discharge crackle
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(880, now);
            osc.frequency.setValueAtTime(440, now + 0.03);
            osc.frequency.setValueAtTime(660, now + 0.07);
            osc.frequency.exponentialRampToValueAtTime(110, now + 0.16);

            gain.gain.setValueAtTime(this.volume * 0.55, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(now);
            osc.stop(now + 0.16);
            break;
          }

          case 'mortar_fire': {
            // Deep thud artillery launch
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(140, now);
            osc.frequency.exponentialRampToValueAtTime(32, now + 0.28);

            gain.gain.setValueAtTime(this.volume * 0.85, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(now);
            osc.stop(now + 0.28);
            break;
          }

          case 'gatling_fire': {
            // Heavy rapid rotary shot
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'square';
            osc.frequency.setValueAtTime(210 + Math.random() * 30, now);
            osc.frequency.exponentialRampToValueAtTime(60, now + 0.05);

            gain.gain.setValueAtTime(this.volume * (options.overcharged ? 0.65 : 0.45), now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(now);
            osc.stop(now + 0.05);
            break;
          }

          case 'overcharge_activate': {
            // Rising turbine power-up whine
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(180, now);
            osc.frequency.exponentialRampToValueAtTime(980, now + 0.5);

            gain.gain.setValueAtTime(this.volume * 0.7, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.55);

            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(now);
            osc.stop(now + 0.55);
            break;
          }

          case 'upgrade': {
            // Two-tone triumphant chime
            const osc1 = this.ctx.createOscillator();
            const osc2 = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            osc1.frequency.setValueAtTime(440, now);
            osc1.frequency.setValueAtTime(659.25, now + 0.12);
            osc2.frequency.setValueAtTime(554.37, now);
            osc2.frequency.setValueAtTime(880, now + 0.12);

            gain.gain.setValueAtTime(this.volume * 0.5, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

            osc1.connect(gain);
            osc2.connect(gain);
            gain.connect(this.ctx.destination);

            osc1.start(now);
            osc2.start(now);
            osc1.stop(now + 0.35);
            osc2.stop(now + 0.35);
            break;
          }

          case 'sell': {
            // Cash coin rattle
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(880, now);
            osc.frequency.setValueAtTime(1174, now + 0.08);

            gain.gain.setValueAtTime(this.volume * 0.45, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(now);
            osc.stop(now + 0.22);
            break;
          }

          case 'build_place': {
            // Mechanical clunk placement
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(220, now);
            osc.frequency.exponentialRampToValueAtTime(70, now + 0.14);

            gain.gain.setValueAtTime(this.volume * 0.6, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(now);
            osc.stop(now + 0.14);
            break;
          }
        }
      } catch (err) {
        // Silently swallow audio context glitches
      }
    }
  }

  const audioSynth = new SoundSynth();

  // Helper to trigger audio through external system or internal synth
  function playSound(name, opts = {}) {
    if (typeof window !== 'undefined') {
      if (window.audioManager && typeof window.audioManager.play === 'function') {
        window.audioManager.play(name, opts);
        return;
      } else if (window.AudioSys && typeof window.AudioSys.play === 'function') {
        window.AudioSys.play(name, opts);
        return;
      }
    }
    audioSynth.play(name, opts);
  }

  // Cross-browser safe rounded rectangle path helper
  function drawRoundRect(ctx, x, y, w, h, r = 4) {
    if (typeof ctx.roundRect === 'function') {
      ctx.roundRect(x, y, w, h, r);
    } else {
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }
  }

  // ============================================================================
  // 2. TOWER DEFINITIONS AND CONSTANTS
  // ============================================================================
  const TARGETING_MODES = ['first', 'closest', 'strongest', 'weakest'];

  const TOWER_TYPES = {
    GUNNER: {
      id: 'gunner',
      name: 'Gunner Nest',
      shortName: 'GUNNER',
      cost: 280,
      description: 'Survivor gunner behind sandbags firing rapid machine gun bursts.',
      color: '#e69c24',
      badgeColor: '#458234',
      width: 44,
      height: 44,
      radius: 22,
      levels: [
        {
          level: 1,
          name: 'Gunner Nest Mk I',
          upgradeCost: 0,
          damage: 18,
          fireRate: 6.5, // 6.5 rounds/sec
          range: 145,
          projectileSpeed: 950,
          accuracy: 0.96,
          special: 'Rapid fire machine gun'
        },
        {
          level: 2,
          name: 'Gunner Nest Mk II (Twin Mag)',
          upgradeCost: 220,
          damage: 28,
          fireRate: 8.5,
          range: 165,
          projectileSpeed: 1050,
          accuracy: 0.97,
          special: 'Assault rifle & fortified sandbags'
        },
        {
          level: 3,
          name: 'Gunner Nest Mk III (Heavy M2)',
          upgradeCost: 360,
          damage: 46,
          fireRate: 11.0,
          range: 190,
          projectileSpeed: 1200,
          accuracy: 0.98,
          critChance: 0.2,
          critMultiplier: 1.8,
          special: 'Heavy .50 cal Browning with armor pierce'
        }
      ]
    },

    ARCHER: {
      id: 'archer',
      name: 'Archer Tower',
      shortName: 'ARCHER',
      cost: 350,
      description: 'Survivor archer atop wooden post firing long-range piercing arrows.',
      color: '#4caf50',
      badgeColor: '#2e7d32',
      width: 42,
      height: 42,
      radius: 20,
      levels: [
        {
          level: 1,
          name: 'Archer Post Mk I',
          upgradeCost: 0,
          damage: 48,
          fireRate: 1.3,
          range: 225,
          pierce: 2, // pierces up to 2 zombies
          projectileSpeed: 580,
          special: 'Pierces 2 zombies'
        },
        {
          level: 2,
          name: 'Archer Post Mk II (Recurve)',
          upgradeCost: 260,
          damage: 82,
          fireRate: 1.6,
          range: 265,
          pierce: 3,
          projectileSpeed: 660,
          special: 'Pierces 3 zombies, higher speed'
        },
        {
          level: 3,
          name: 'Archer Post Mk III (Ballista Bow)',
          upgradeCost: 440,
          damage: 145,
          fireRate: 2.0,
          range: 310,
          pierce: 5,
          projectileSpeed: 750,
          bleedDps: 18,
          bleedDuration: 2.5,
          special: 'Barbed arrows pierce 5 zombies & bleed'
        }
      ]
    },

    ROCKET: {
      id: 'rocket',
      name: 'Rocket Launcher',
      shortName: 'ROCKET',
      cost: 550,
      description: 'Heavy missile turret firing homing rockets with massive explosive AOE.',
      color: '#e53935',
      badgeColor: '#c62828',
      width: 48,
      height: 48,
      radius: 24,
      levels: [
        {
          level: 1,
          name: 'Rocket Launcher Mk I',
          upgradeCost: 0,
          damage: 110,
          fireRate: 0.75, // 1 rocket every ~1.33s
          range: 195,
          splashRadius: 52,
          projectileSpeed: 420,
          trackingForce: 5.5,
          special: '52px explosive splash'
        },
        {
          level: 2,
          name: 'Rocket Launcher Mk II (Dual Pod)',
          upgradeCost: 380,
          damage: 190,
          fireRate: 0.95,
          range: 225,
          splashRadius: 68,
          projectileSpeed: 480,
          trackingForce: 7.0,
          special: '68px blast radius & dual launchers'
        },
        {
          level: 3,
          name: 'Rocket Launcher Mk III (Thermobaric)',
          upgradeCost: 590,
          damage: 310,
          fireRate: 1.25,
          range: 255,
          splashRadius: 85,
          projectileSpeed: 540,
          trackingForce: 8.5,
          shredArmor: 0.25,
          special: '85px thermobaric shockwave & armor shred'
        }
      ]
    },

    FLAMETROST: {
      id: 'flametrost',
      name: 'Flametrost',
      shortName: 'FLAME',
      cost: 1250,
      description: 'Pressurized flame projector spewing continuous burning cones with DOT.',
      color: '#ff7043',
      badgeColor: '#d84315',
      width: 46,
      height: 46,
      radius: 22,
      levels: [
        {
          level: 1,
          name: 'Flametrost Mk I',
          upgradeCost: 0,
          damage: 20, // tick damage every 0.12s
          fireRate: 8.0, // stream ticks per sec
          range: 135,
          coneAngle: 36 * (Math.PI / 180),
          burnDps: 22,
          burnDuration: 2.2,
          special: 'Cone spray inflicts burn'
        },
        {
          level: 2,
          name: 'Flametrost Mk II (Napalm)',
          upgradeCost: 750,
          damage: 36,
          fireRate: 9.0,
          range: 160,
          coneAngle: 42 * (Math.PI / 180),
          burnDps: 42,
          burnDuration: 3.2,
          slowFactor: 0.2, // slows burning zombies by 20%
          special: 'Napalm: wider cone, slow + heavy burn'
        },
        {
          level: 3,
          name: 'Flametrost Mk III (Hellfire Projector)',
          upgradeCost: 1150,
          damage: 64,
          fireRate: 10.0,
          range: 185,
          coneAngle: 48 * (Math.PI / 180),
          burnDps: 75,
          burnDuration: 4.0,
          slowFactor: 0.35,
          special: 'Blue-core Hellfire: 35% slow, melts groups'
        }
      ]
    },

    TESLA: {
      id: 'tesla',
      name: 'Tesla Coil',
      shortName: 'TESLA',
      cost: 650,
      description: 'Emits crackling blue chain lightning that jumps between multiple zombies.',
      color: '#29b6f6',
      badgeColor: '#0288d1',
      width: 44,
      height: 44,
      radius: 22,
      levels: [
        {
          level: 1,
          name: 'Tesla Coil Mk I',
          upgradeCost: 0,
          damage: 85,
          fireRate: 0.95,
          range: 160,
          chainCount: 3, // primary + 2 jumps = 3 zombies total
          chainRadius: 85,
          chainFalloff: 0.78,
          stunDuration: 0.15,
          special: 'Arcs across 3 zombies'
        },
        {
          level: 2,
          name: 'Tesla Coil Mk II (Overcharged Arc)',
          upgradeCost: 460,
          damage: 145,
          fireRate: 1.15,
          range: 185,
          chainCount: 4, // 4 zombies total
          chainRadius: 100,
          chainFalloff: 0.82,
          stunDuration: 0.25,
          special: 'Arcs across 4 zombies with 0.25s stun'
        },
        {
          level: 3,
          name: 'Tesla Coil Mk III (Superconductor)',
          upgradeCost: 720,
          damage: 235,
          fireRate: 1.35,
          range: 215,
          chainCount: 5, // 5 zombies total
          chainRadius: 120,
          chainFalloff: 0.88,
          stunDuration: 0.4,
          special: 'Arcs across 5 zombies, EMP blast stun'
        }
      ]
    },

    MORTAR: {
      id: 'mortar',
      name: 'Mortar Cannon',
      shortName: 'MORTAR',
      cost: 2150,
      description: 'Heavy artillery in sandbag pit lobbing high-arc shells that leave blast craters.',
      color: '#8d6e63',
      badgeColor: '#5d4037',
      width: 52,
      height: 52,
      radius: 26,
      levels: [
        {
          level: 1,
          name: '120mm Field Mortar',
          upgradeCost: 0,
          damage: 320,
          fireRate: 0.35, // 1 shell every ~2.85s
          minRange: 100, // Blind spot inner deadzone
          range: 330,
          splashRadius: 78,
          shellFlightTime: 1.5,
          special: 'Leaves blast crater, blind at close range'
        },
        {
          level: 2,
          name: '155mm Heavy Howitzer',
          upgradeCost: 1350,
          damage: 540,
          fireRate: 0.42,
          minRange: 90,
          range: 380,
          splashRadius: 95,
          shellFlightTime: 1.6,
          special: '95px blast, burns impact crater'
        },
        {
          level: 3,
          name: '240mm Siege Devastator',
          upgradeCost: 1950,
          damage: 880,
          fireRate: 0.5,
          minRange: 80,
          range: 430,
          splashRadius: 120,
          shellFlightTime: 1.7,
          craterDamageDps: 30, // Lingering crater fire
          craterDuration: 8.0,
          special: '120px cataclysm blast & flaming crater'
        }
      ]
    },

    LAST_STAND: {
      id: 'last_stand',
      name: 'Last Stand Tower',
      shortName: 'LAST STAND',
      cost: 0, // Pre-positioned beside Survivor Base
      energyCost: 25, // Overcharge costs 25 Energy
      description: 'Heavy multi-barrel rotary gatling gun guarding the Survivor Base. Devastating firepower and Energy Overcharge.',
      color: '#ffd54f',
      badgeColor: '#f57f17',
      width: 64,
      height: 64,
      radius: 32,
      levels: [
        {
          level: 1,
          name: 'Base Gatling Sentry Mk I',
          upgradeCost: 450,
          damage: 32,
          fireRate: 14.0, // 14 shots per second!
          range: 260,
          projectileSpeed: 1100,
          overchargeDuration: 8.0,
          overchargeFireRateMult: 2.5, // 35 shots/sec in overcharge!
          overchargeDamageMult: 1.4,
          special: 'Rotary minigun, 25 E Overcharge'
        },
        {
          level: 2,
          name: 'Base Gatling Sentry Mk II (Dual Drum)',
          upgradeCost: 850,
          damage: 48,
          fireRate: 17.0,
          range: 290,
          projectileSpeed: 1250,
          overchargeDuration: 9.5,
          overchargeFireRateMult: 2.5,
          overchargeDamageMult: 1.5,
          special: 'Dual ammo drum, extended overcharge'
        },
        {
          level: 3,
          name: 'Base Gatling Sentry Mk III (Vulcan Phalanx)',
          upgradeCost: 1400,
          damage: 70,
          fireRate: 20.0,
          range: 320,
          projectileSpeed: 1400,
          overchargeDuration: 11.0,
          overchargeFireRateMult: 2.6,
          overchargeDamageMult: 1.65,
          special: 'Vulcan cannon, thermite explosive rounds'
        }
      ]
    }
  };

  // ============================================================================
  // 3. PROJECTILE & EFFECT CLASSES
  // ============================================================================

  /**
   * Floating damage numbers (White = normal, Red = crit, Orange = fire, Blue = shock)
   */
  class FloatingText {
    constructor(x, y, text, color = '#ffffff', size = 13, isCrit = false) {
      this.x = x + (Math.random() * 12 - 6);
      this.y = y - 6;
      this.vx = (Math.random() * 2 - 1) * 18;
      this.vy = -(45 + Math.random() * 25);
      this.text = text;
      this.color = color;
      this.size = size;
      this.isCrit = isCrit;
      this.alpha = 1.0;
      this.scale = isCrit ? 1.4 : 1.0;
      this.life = 0.85;
      this.maxLife = 0.85;
    }

    update(dt) {
      this.life -= dt;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.vy += 35 * dt; // slight downward deceleration
      this.alpha = Math.max(0, this.life / this.maxLife);
      if (this.isCrit && this.life > this.maxLife * 0.7) {
        this.scale = 1.4 + 0.3 * Math.sin((1 - this.life / this.maxLife) * Math.PI);
      }
      return this.life > 0;
    }

    draw(ctx) {
      ctx.save();
      ctx.globalAlpha = this.alpha;
      ctx.font = `bold ${Math.round(this.size * this.scale)}px "Segoe UI", Arial, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Drop shadow / outline for readability
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 3;
      ctx.strokeText(this.text, this.x, this.y);

      ctx.fillStyle = this.color;
      ctx.fillText(this.text, this.x, this.y);
      ctx.restore();
    }
  }

  /**
   * Persistent Scorch / Blast Crater on ground from Mortar shells and heavy rockets
   */
  class CraterDecal {
    constructor(x, y, radius = 26, duration = 25, isFiery = false, damageDps = 0) {
      this.x = x;
      this.y = y;
      this.radius = radius;
      this.duration = duration;
      this.maxDuration = duration;
      this.isFiery = isFiery;
      this.damageDps = damageDps;
      this.cracks = [];
      const numCracks = 6 + Math.floor(Math.random() * 5);
      for (let i = 0; i < numCracks; i++) {
        const angle = (i / numCracks) * Math.PI * 2 + (Math.random() * 0.4 - 0.2);
        const len = radius * (0.6 + Math.random() * 0.6);
        this.cracks.push({
          x: Math.cos(angle) * len,
          y: Math.sin(angle) * len * 0.7, // perspective flattening
          midX: Math.cos(angle + 0.15) * len * 0.5,
          midY: Math.sin(angle + 0.15) * len * 0.35
        });
      }
      this.fireTimer = 0;
    }

    update(dt, zombies) {
      this.duration -= dt;

      if (this.isFiery && this.damageDps > 0) {
        this.fireTimer += dt;
        if (this.fireTimer >= 0.25) {
          this.fireTimer = 0;
          // Apply lingering burn damage to zombies inside crater
          for (let i = 0; i < zombies.length; i++) {
            const z = zombies[i];
            if (!z || z.dead || z.hp <= 0) continue;
            const d = Math.hypot(z.x - this.x, z.y - this.y);
            if (d <= this.radius * 0.95) {
              const dmg = Math.round(this.damageDps * 0.25);
              if (typeof z.takeDamage === 'function') {
                z.takeDamage(dmg, 'fire');
              } else {
                z.hp -= dmg;
              }
            }
          }
        }
      }

      return this.duration > 0;
    }

    draw(ctx) {
      const alpha = Math.min(1.0, this.duration / (this.maxDuration * 0.25));
      ctx.save();
      ctx.globalAlpha = alpha * 0.75;

      // Dark charred earth oval (isometric perspective)
      ctx.beginPath();
      ctx.ellipse(this.x, this.y, this.radius, this.radius * 0.65, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#1c1712';
      ctx.fill();

      // Outer scorched rim
      ctx.beginPath();
      ctx.ellipse(this.x, this.y, this.radius * 0.75, this.radius * 0.48, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#120f0c';
      ctx.fill();

      // Fractured earth cracks
      ctx.strokeStyle = '#0a0806';
      ctx.lineWidth = 1.8;
      for (let i = 0; i < this.cracks.length; i++) {
        const c = this.cracks[i];
        ctx.beginPath();
        ctx.moveTo(this.x, this.y);
        ctx.quadraticCurveTo(this.x + c.midX, this.y + c.midY, this.x + c.x, this.y + c.y);
        ctx.stroke();
      }

      // Fiery lingering embers
      if (this.isFiery && this.duration > 2.0) {
        const flicker = 0.5 + Math.random() * 0.5;
        ctx.fillStyle = `rgba(255, 100, 20, ${0.4 * flicker})`;
        ctx.beginPath();
        ctx.ellipse(this.x, this.y, this.radius * 0.4, this.radius * 0.25, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }
  }

  /**
   * Base Projectile class
   */
  class Projectile {
    constructor(x, y, target, tower) {
      this.x = x;
      this.y = y;
      this.target = target;
      this.tower = tower;
      this.dead = false;
      this.life = 5.0; // Max lifetime in seconds
    }

    update(dt, zombies, projectileManager) {
      this.life -= dt;
      if (this.life <= 0) this.dead = true;
    }

    draw(ctx) {}
  }

  /**
   * Fast Bullet projectile (Gunner & Last Stand)
   */
  class BulletProjectile extends Projectile {
    constructor(x, y, target, tower, opts = {}) {
      super(x, y, target, tower);
      this.speed = opts.speed || 950;
      this.damage = opts.damage || 20;
      this.isOvercharged = !!opts.isOvercharged;
      this.isCrit = !!opts.isCrit;
      this.critMult = opts.critMultiplier || 1.5;

      const targetX = target ? target.x + (target.vx ? target.vx * 0.04 : 0) : x + 100;
      const targetY = target ? target.y + (target.vy ? target.vy * 0.04 : 0) : y;
      const angle = Math.atan2(targetY - y, targetX - x);
      this.vx = Math.cos(angle) * this.speed;
      this.vy = Math.sin(angle) * this.speed;
      this.prevX = x;
      this.prevY = y;
      this.length = opts.length || 14;
      this.color = opts.color || (this.isOvercharged ? '#ff3d00' : '#ffe082');
    }

    update(dt, zombies, projectileManager) {
      super.update(dt, zombies, projectileManager);
      if (this.dead) return;

      this.prevX = this.x;
      this.prevY = this.y;
      this.x += this.vx * dt;
      this.y += this.vy * dt;

      // Hit check against all living zombies
      for (let i = 0; i < zombies.length; i++) {
        const z = zombies[i];
        if (!z || z.dead || z.hp <= 0) continue;

        const hitRadius = (z.radius || 16) + 4;
        const d = Math.hypot(z.x - this.x, z.y - this.y);

        if (d <= hitRadius) {
          let dmg = this.damage;
          if (this.isCrit) dmg = Math.round(dmg * this.critMult);

          if (typeof z.takeDamage === 'function') {
            z.takeDamage(dmg, 'bullet', this.tower);
          } else {
            z.hp -= dmg;
          }

          // Damage number
          projectileManager.spawnDamageText(
            z.x,
            z.y - 10,
            dmg,
            this.isCrit ? '#ff1744' : '#fff9c4',
            this.isCrit ? 15 : 12,
            this.isCrit
          );

          // Overcharged incendiary micro-blast
          if (this.isOvercharged) {
            projectileManager.spawnExplosion(this.x, this.y, 22, 18, {
              isIncendiary: true,
              color: '#ff5722',
              tower: this.tower
            }, zombies);
            if (typeof z.applyBurn === 'function') {
              z.applyBurn(20, 2.0);
            }
          }

          // Small spark particle
          projectileManager.spawnSparks(this.x, this.y, 4, this.color);
          this.dead = true;
          break;
        }
      }

      // Check boundary
      if (this.x < -50 || this.x > 1800 || this.y < -50 || this.y > 1200) {
        this.dead = true;
      }
    }

    draw(ctx) {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(this.prevX, this.prevY);
      ctx.lineTo(this.x, this.y);
      ctx.strokeStyle = this.color;
      ctx.lineWidth = this.isOvercharged ? 3.5 : 2.0;
      ctx.lineCap = 'round';
      ctx.stroke();

      // Bullet tracer head
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.isOvercharged ? 2.5 : 1.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  /**
   * Piercing Arrow projectile (Archer Tower)
   */
  class ArrowProjectile extends Projectile {
    constructor(x, y, target, tower, opts = {}) {
      super(x, y, target, tower);
      this.speed = opts.speed || 600;
      this.damage = opts.damage || 50;
      this.maxPierce = opts.pierce || 2;
      this.pierceLeft = this.maxPierce;
      this.bleedDps = opts.bleedDps || 0;
      this.bleedDuration = opts.bleedDuration || 0;
      this.hitZombies = new Set();

      const targetX = target ? target.x + (target.vx ? target.vx * 0.08 : 0) : x + 100;
      const targetY = target ? target.y + (target.vy ? target.vy * 0.08 : 0) : y;
      this.angle = Math.atan2(targetY - y, targetX - x);
      this.vx = Math.cos(this.angle) * this.speed;
      this.vy = Math.sin(this.angle) * this.speed;
      this.life = 2.0;
    }

    update(dt, zombies, projectileManager) {
      super.update(dt, zombies, projectileManager);
      if (this.dead) return;

      this.x += this.vx * dt;
      this.y += this.vy * dt;

      // Hit check
      for (let i = 0; i < zombies.length; i++) {
        const z = zombies[i];
        if (!z || z.dead || z.hp <= 0) continue;
        if (this.hitZombies.has(z)) continue;

        const hitRadius = (z.radius || 16) + 4;
        const d = Math.hypot(z.x - this.x, z.y - this.y);

        if (d <= hitRadius) {
          this.hitZombies.add(z);
          this.pierceLeft--;

          const dmg = this.damage;
          if (typeof z.takeDamage === 'function') {
            z.takeDamage(dmg, 'arrow', this.tower);
          } else {
            z.hp -= dmg;
          }

          projectileManager.spawnDamageText(z.x, z.y - 12, dmg, '#b9f6ca', 13);

          if (this.bleedDps > 0 && typeof z.applyBleed === 'function') {
            z.applyBleed(this.bleedDps, this.bleedDuration);
          }

          projectileManager.spawnSparks(this.x, this.y, 3, '#a5d6a7');

          if (this.pierceLeft <= 0) {
            this.dead = true;
            break;
          }
        }
      }

      if (this.x < -50 || this.x > 1800 || this.y < -50 || this.y > 1200) {
        this.dead = true;
      }
    }

    draw(ctx) {
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.angle);

      // Wooden shaft
      ctx.strokeStyle = '#8d6e63';
      ctx.lineWidth = 2.0;
      ctx.beginPath();
      ctx.moveTo(-16, 0);
      ctx.lineTo(8, 0);
      ctx.stroke();

      // Steel arrowhead
      ctx.fillStyle = '#cfd8dc';
      ctx.beginPath();
      ctx.moveTo(11, 0);
      ctx.lineTo(5, -3.5);
      ctx.lineTo(5, 3.5);
      ctx.closePath();
      ctx.fill();

      // Feathers / fletching
      ctx.fillStyle = '#43a047';
      ctx.beginPath();
      ctx.moveTo(-16, 0);
      ctx.lineTo(-12, -3);
      ctx.lineTo(-8, 0);
      ctx.lineTo(-12, 3);
      ctx.closePath();
      ctx.fill();

      ctx.restore();
    }
  }

  /**
   * Tracking Homing Rocket (Rocket Launcher)
   */
  class RocketProjectile extends Projectile {
    constructor(x, y, target, tower, opts = {}) {
      super(x, y, target, tower);
      this.speed = opts.speed || 440;
      this.damage = opts.damage || 130;
      this.splashRadius = opts.splashRadius || 60;
      this.trackingForce = opts.trackingForce || 6.5;
      this.shredArmor = opts.shredArmor || 0;

      const targetX = target ? target.x : x + 80;
      const targetY = target ? target.y : y;
      this.angle = Math.atan2(targetY - y, targetX - x);
      this.vx = Math.cos(this.angle) * (this.speed * 0.4); // starts slower, accelerates
      this.vy = Math.sin(this.angle) * (this.speed * 0.4);
      this.smokeTimer = 0;
      this.life = 3.5;
    }

    update(dt, zombies, projectileManager) {
      super.update(dt, zombies, projectileManager);
      if (this.dead) return;

      // Homing guidance towards target if alive
      let targetPos = null;
      if (this.target && !this.target.dead && this.target.hp > 0) {
        targetPos = { x: this.target.x, y: this.target.y };
      } else {
        // Retarget nearest living zombie
        let nearest = null;
        let minDist = 350;
        for (let i = 0; i < zombies.length; i++) {
          const z = zombies[i];
          if (!z || z.dead || z.hp <= 0) continue;
          const d = Math.hypot(z.x - this.x, z.y - this.y);
          if (d < minDist) {
            minDist = d;
            nearest = z;
          }
        }
        if (nearest) {
          this.target = nearest;
          targetPos = { x: nearest.x, y: nearest.y };
        }
      }

      if (targetPos) {
        const desiredAngle = Math.atan2(targetPos.y - this.y, targetPos.x - this.x);
        let diff = desiredAngle - this.angle;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;
        this.angle += diff * Math.min(1.0, this.trackingForce * dt);
      }

      // Accelerate towards full speed
      const curSpeed = Math.hypot(this.vx, this.vy);
      const newSpeed = Math.min(this.speed, curSpeed + 350 * dt);
      this.vx = Math.cos(this.angle) * newSpeed;
      this.vy = Math.sin(this.angle) * newSpeed;

      this.x += this.vx * dt;
      this.y += this.vy * dt;

      // Spawn smoke trail particles
      this.smokeTimer += dt;
      if (this.smokeTimer >= 0.035) {
        this.smokeTimer = 0;
        const backX = this.x - Math.cos(this.angle) * 14;
        const backY = this.y - Math.sin(this.angle) * 14;
        projectileManager.spawnSmokePuff(backX, backY, 4, '#e0e0e0');
      }

      // Check collision against target or any zombie
      let hit = false;
      for (let i = 0; i < zombies.length; i++) {
        const z = zombies[i];
        if (!z || z.dead || z.hp <= 0) continue;
        const hitRadius = (z.radius || 16) + 6;
        if (Math.hypot(z.x - this.x, z.y - this.y) <= hitRadius) {
          hit = true;
          break;
        }
      }

      if (hit || (targetPos && Math.hypot(targetPos.x - this.x, targetPos.y - this.y) < 14)) {
        this.detonate(zombies, projectileManager);
      }
    }

    detonate(zombies, projectileManager) {
      if (this.dead) return;
      this.dead = true;

      // Sound
      playSound('explosion', { power: 0.65, duration: 0.35 });

      // AOE Explosion
      projectileManager.spawnExplosion(this.x, this.y, this.splashRadius, this.damage, {
        shredArmor: this.shredArmor,
        color: '#ff9800',
        tower: this.tower
      }, zombies);

      // Ground scorch
      projectileManager.spawnCrater(this.x, this.y, this.splashRadius * 0.45, 16);

      // Screen shake
      if (typeof window !== 'undefined' && typeof window.addScreenShake === 'function') {
        window.addScreenShake(3.5, 0.2);
      }
    }

    draw(ctx) {
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.angle);

      // Exhaust flame plume
      ctx.fillStyle = '#ff7043';
      ctx.beginPath();
      ctx.moveTo(-10, -3);
      ctx.lineTo(-18 - Math.random() * 6, 0);
      ctx.lineTo(-10, 3);
      ctx.closePath();
      ctx.fill();

      // Rocket fuselage
      ctx.fillStyle = '#556b2f'; // Olive drab
      ctx.fillRect(-10, -3.5, 16, 7);

      // Nose cone
      ctx.fillStyle = '#d32f2f'; // Red warhead tip
      ctx.beginPath();
      ctx.moveTo(6, -3.5);
      ctx.lineTo(12, 0);
      ctx.lineTo(6, 3.5);
      ctx.closePath();
      ctx.fill();

      // Stabilizer fins
      ctx.fillStyle = '#37474f';
      ctx.fillRect(-10, -6, 4, 3);
      ctx.fillRect(-10, 3, 4, 3);

      ctx.restore();
    }
  }

  /**
   * Mortar Shell - High-arc Ballistic artillery projectile
   */
  class MortarShellProjectile extends Projectile {
    constructor(x, y, targetX, targetY, tower, opts = {}) {
      super(x, y, null, tower);
      this.startX = x;
      this.startY = y;
      this.targetX = targetX + (Math.random() * 24 - 12); // artillery dispersion
      this.targetY = targetY + (Math.random() * 24 - 12);
      this.damage = opts.damage || 350;
      this.splashRadius = opts.splashRadius || 80;
      this.flightDuration = opts.flightTime || 1.5;
      this.craterDamageDps = opts.craterDamageDps || 0;
      this.craterDuration = opts.craterDuration || 0;
      this.elapsed = 0;
      this.maxHeight = 120 + Math.hypot(this.targetX - x, this.targetY - y) * 0.25;
    }

    update(dt, zombies, projectileManager) {
      this.elapsed += dt;
      const t = Math.min(1.0, this.elapsed / this.flightDuration);

      // Current ground shadow position
      this.x = this.startX + (this.targetX - this.startX) * t;
      this.y = this.startY + (this.targetY - this.startY) * t;

      // Parabolic altitude z
      this.altitude = 4 * this.maxHeight * t * (1 - t);

      if (t >= 1.0) {
        this.detonate(zombies, projectileManager);
      }
    }

    detonate(zombies, projectileManager) {
      if (this.dead) return;
      this.dead = true;

      // Sound
      playSound('explosion', { power: 1.0, duration: 0.65 });

      // Cataclysmic AOE Explosion
      projectileManager.spawnExplosion(this.targetX, this.targetY, this.splashRadius, this.damage, {
        power: 1.2,
        isMortar: true,
        color: '#ff5722',
        tower: this.tower
      }, zombies);

      // Ground Scorch Crater (persistent)
      const isFiery = this.craterDamageDps > 0;
      projectileManager.spawnCrater(
        this.targetX,
        this.targetY,
        this.splashRadius * 0.55,
        28,
        isFiery,
        this.craterDamageDps
      );

      // Heavy Screen Shake
      if (typeof window !== 'undefined' && typeof window.addScreenShake === 'function') {
        window.addScreenShake(8.0, 0.45);
      }
    }

    draw(ctx) {
      // 1. Draw ground shadow tracking
      ctx.save();
      const shadowAlpha = 0.35 + (1 - this.altitude / this.maxHeight) * 0.35;
      const shadowSize = Math.max(4, 10 * (1 - (this.altitude / this.maxHeight) * 0.6));
      ctx.fillStyle = `rgba(15, 12, 10, ${shadowAlpha})`;
      ctx.beginPath();
      ctx.ellipse(this.x, this.y, shadowSize, shadowSize * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();

      // 2. Draw shell high in the air
      const shellY = this.y - this.altitude;
      const progress = this.elapsed / this.flightDuration;
      // Angle tilts from upward arc to downward plunge
      const pitchAngle = Math.atan2(this.targetY - this.startY, this.targetX - this.startX);
      const verticalAngle = (progress - 0.5) * 1.6;

      ctx.translate(this.x, shellY);
      ctx.rotate(pitchAngle + verticalAngle);

      // Heavy Artillery Shell body
      ctx.fillStyle = '#2e3a24'; // Military olive
      ctx.beginPath();
      ctx.ellipse(0, 0, 7, 4, 0, 0, Math.PI * 2);
      ctx.fill();

      // Brass driving band
      ctx.fillStyle = '#ffd54f';
      ctx.fillRect(-3, -3.5, 2, 7);

      ctx.restore();
    }
  }

  /**
   * Flame Stream Particle (Flametrost)
   */
  class FlameParticle {
    constructor(x, y, angle, speed, spread, range) {
      this.x = Number.isFinite(x) ? x : 0;
      this.y = Number.isFinite(y) ? y : 0;
      const validSpeed = (Number.isFinite(speed) && speed > 0) ? speed : 150;
      const validSpread = Number.isFinite(spread) ? spread : 0.3;
      const validRange = (Number.isFinite(range) && range > 0) ? range : 100;
      const finalAngle = (Number.isFinite(angle) ? angle : 0) + (Math.random() * validSpread - validSpread * 0.5);
      this.vx = Math.cos(finalAngle) * validSpeed;
      this.vy = Math.sin(finalAngle) * validSpeed;
      this.life = Math.max(0.1, validRange / validSpeed);
      this.maxLife = this.life;
      this.size = 6 + Math.random() * 5;
      this.maxSize = 22 + Math.random() * 10;
      this.currentSize = this.size;
    }

    update(dt) {
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.life -= dt;
      const progress = Math.max(0, Math.min(1, 1 - (this.life / (this.maxLife || 1))));
      this.currentSize = this.size + (this.maxSize - this.size) * progress;
      return this.life > 0;
    }

    draw(ctx, isHellfire = false) {
      if (!Number.isFinite(this.x) || !Number.isFinite(this.y)) return;
      const progress = Math.max(0, Math.min(1, 1 - (this.life / (this.maxLife || 1))));
      const alpha = Math.max(0, Math.min(1, Math.sin(progress * Math.PI) * 0.75));
      const radius = Math.max(0.5, Number.isFinite(this.currentSize) ? this.currentSize : this.size);

      ctx.save();
      ctx.globalAlpha = alpha;

      let grad = ctx.createRadialGradient(
        this.x,
        this.y,
        0,
        this.x,
        this.y,
        radius
      );

      if (isHellfire) {
        // Supercharged Blue/White Hellfire core
        grad.addColorStop(0, '#ffffff');
        grad.addColorStop(0.3, '#00e5ff');
        grad.addColorStop(0.7, '#2979ff');
        grad.addColorStop(1, 'rgba(13, 71, 161, 0)');
      } else {
        // Intense Napalm flame
        grad.addColorStop(0, '#ffff8d');
        grad.addColorStop(0.35, '#ff9100');
        grad.addColorStop(0.75, '#ff3d00');
        grad.addColorStop(1, 'rgba(62, 39, 35, 0)');
      }

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(this.x, this.y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  /**
   * Tesla Chain Lightning Visual Arc
   */
  class TeslaArcEffect {
    constructor(points, duration = 0.16, color = '#40c4ff') {
      this.points = points; // Array of {x, y}
      this.duration = duration;
      this.maxDuration = duration;
      this.color = color;
      this.segments = [];
      this.generateBoltSegments();
    }

    generateBoltSegments() {
      this.segments = [];
      for (let i = 0; i < this.points.length - 1; i++) {
        const p1 = this.points[i];
        const p2 = this.points[i + 1];
        const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        const steps = Math.max(3, Math.floor(dist / 16));
        const bolt = [p1];

        for (let s = 1; s < steps; s++) {
          const t = s / steps;
          const nx = -(p2.y - p1.y) / dist;
          const ny = (p2.x - p1.x) / dist;
          const jitter = (Math.random() * 2 - 1) * 12;
          bolt.push({
            x: p1.x + (p2.x - p1.x) * t + nx * jitter,
            y: p1.y + (p2.y - p1.y) * t + ny * jitter
          });
        }
        bolt.push(p2);
        this.segments.push(bolt);
      }
    }

    update(dt) {
      this.duration -= dt;
      // Re-jitter for electrical flickering
      if (Math.random() < 0.4) {
        this.generateBoltSegments();
      }
      return this.duration > 0;
    }

    draw(ctx) {
      const alpha = Math.max(0, this.duration / this.maxDuration);
      ctx.save();
      ctx.globalAlpha = alpha;

      for (let b = 0; b < this.segments.length; b++) {
        const bolt = this.segments[b];
        if (bolt.length < 2) continue;

        // Outer blue glow
        ctx.beginPath();
        ctx.moveTo(bolt[0].x, bolt[0].y);
        for (let i = 1; i < bolt.length; i++) {
          ctx.lineTo(bolt[i].x, bolt[i].y);
        }
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 4.5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();

        // Inner white-hot core
        ctx.beginPath();
        ctx.moveTo(bolt[0].x, bolt[0].y);
        for (let i = 1; i < bolt.length; i++) {
          ctx.lineTo(bolt[i].x, bolt[i].y);
        }
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.8;
        ctx.stroke();
      }

      ctx.restore();
    }
  }

  // ============================================================================
  // 4. PROJECTILE & COMBAT MANAGER
  // ============================================================================
  class ProjectileManager {
    constructor() {
      this.projectiles = [];
      this.particles = [];
      this.craters = [];
      this.floatingTexts = [];
      this.teslaArcs = [];
    }

    clear() {
      this.projectiles = [];
      this.particles = [];
      this.craters = [];
      this.floatingTexts = [];
      this.teslaArcs = [];
    }

    addProjectile(p) {
      this.projectiles.push(p);
    }

    spawnDamageText(x, y, text, color = '#ffffff', size = 13, isCrit = false) {
      this.floatingTexts.push(new FloatingText(x, y, text, color, size, isCrit));
    }

    spawnCrater(x, y, radius, duration, isFiery = false, damageDps = 0) {
      this.craters.push(new CraterDecal(x, y, radius, duration, isFiery, damageDps));
    }

    spawnTeslaArc(points, color) {
      this.teslaArcs.push(new TeslaArcEffect(points, 0.18, color));
    }

    spawnSparks(x, y, count = 5, color = '#ffe082') {
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 40 + Math.random() * 80;
        this.particles.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 0.2 + Math.random() * 0.2,
          maxLife: 0.4,
          size: 1.5 + Math.random() * 1.5,
          color
        });
      }
    }

    spawnSmokePuff(x, y, radius = 5, color = '#bdbdbd') {
      this.particles.push({
        x,
        y,
        vx: (Math.random() * 2 - 1) * 12,
        vy: -(15 + Math.random() * 20),
        life: 0.45 + Math.random() * 0.35,
        maxLife: 0.8,
        size: radius,
        maxSize: radius * 2.6,
        color,
        isSmoke: true
      });
    }

    spawnExplosion(x, y, radius, damage, opts = {}, zombiesArray = null) {
      // 1. Spatially damage all zombies inside radius
      const targetZombies = zombiesArray || (opts.zombies) || (typeof window !== 'undefined' && window.zombieManager && window.zombieManager.zombies) || [];
      if (Array.isArray(targetZombies)) {
        this.applyExplosionDamage(x, y, radius, damage, targetZombies, opts);
      }

      // 2. Visual explosion shockwave particles
      const count = Math.min(32, Math.floor(radius * 0.35));
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2 + (Math.random() * 0.3 - 0.15);
        const speed = (radius / 0.35) * (0.4 + Math.random() * 0.6);
        this.particles.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 0.3 + Math.random() * 0.25,
          maxLife: 0.55,
          size: 3 + Math.random() * 4,
          maxSize: 10 + Math.random() * 8,
          color: opts.color || (Math.random() < 0.5 ? '#ff9800' : '#ff5722'),
          isFire: true
        });
      }

      // Outer smoke ring
      for (let i = 0; i < 8; i++) {
        const angle = Math.random() * Math.PI * 2;
        const dist = Math.random() * radius * 0.7;
        this.spawnSmokePuff(x + Math.cos(angle) * dist, y + Math.sin(angle) * dist, 7, '#757575');
      }
    }

    applyExplosionDamage(x, y, radius, maxDamage, zombies, opts = {}) {
      for (let i = 0; i < zombies.length; i++) {
        const z = zombies[i];
        if (!z || z.dead || z.hp <= 0) continue;

        const d = Math.hypot(z.x - x, z.y - y);
        if (d <= radius) {
          // Distance falloff: 100% at center, down to 40% at edge
          const falloff = 1.0 - (d / radius) * 0.6;
          const dmg = Math.round(maxDamage * falloff);

          if (typeof z.takeDamage === 'function') {
            z.takeDamage(dmg, 'explosion', opts.tower);
          } else {
            z.hp -= dmg;
          }

          this.spawnDamageText(z.x, z.y - 12, dmg, '#ffab00', 14, true);

          if (opts.isIncendiary && typeof z.applyBurn === 'function') {
            z.applyBurn(25, 2.5);
          }

          // Shrapnel pushback impulse
          if (typeof z.applyImpulse === 'function') {
            const pushAngle = Math.atan2(z.y - y, z.x - x);
            z.applyImpulse(Math.cos(pushAngle) * 60, Math.sin(pushAngle) * 60);
          }
        }
      }
    }

    update(dt, zombies) {
      // 1. Update Projectiles
      for (let i = this.projectiles.length - 1; i >= 0; i--) {
        const p = this.projectiles[i];
        p.update(dt, zombies, this);
        if (p.dead) {
          this.projectiles.splice(i, 1);
        }
      }

      // 2. Update Tesla Arcs
      for (let i = this.teslaArcs.length - 1; i >= 0; i--) {
        if (!this.teslaArcs[i].update(dt)) {
          this.teslaArcs.splice(i, 1);
        }
      }

      // 3. Update Crates / Craters
      for (let i = this.craters.length - 1; i >= 0; i--) {
        if (!this.craters[i].update(dt, zombies)) {
          this.craters.splice(i, 1);
        }
      }

      // 4. Update FX Particles
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const pt = this.particles[i];
        pt.life -= dt;
        pt.x += pt.vx * dt;
        pt.y += pt.vy * dt;
        if (pt.isSmoke) {
          pt.vx *= 0.94;
          pt.vy *= 0.94;
        }
        if (pt.life <= 0) {
          this.particles.splice(i, 1);
        }
      }

      // 5. Update Floating Damage Texts
      for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
        if (!this.floatingTexts[i].update(dt)) {
          this.floatingTexts.splice(i, 1);
        }
      }
    }

    draw(ctx) {
      // Draw ground craters first (under everything)
      for (let i = 0; i < this.craters.length; i++) {
        this.craters[i].draw(ctx);
      }

      // Draw projectiles
      for (let i = 0; i < this.projectiles.length; i++) {
        this.projectiles[i].draw(ctx);
      }

      // Draw Tesla Arcs
      for (let i = 0; i < this.teslaArcs.length; i++) {
        this.teslaArcs[i].draw(ctx);
      }

      // Draw particles (smoke, sparks, flames)
      for (let i = 0; i < this.particles.length; i++) {
        const pt = this.particles[i];
        const progress = 1 - Math.max(0, pt.life / (pt.maxLife || 0.5));
        const alpha = Math.max(0, pt.life / (pt.maxLife || 0.5));

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = pt.color;

        if (pt.isSmoke) {
          const sz = pt.size + (pt.maxSize - pt.size) * progress;
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, sz, 0, Math.PI * 2);
          ctx.fill();
        } else if (pt.isFire) {
          const sz = pt.size + (pt.maxSize - pt.size) * progress;
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, sz, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      // Draw floating damage numbers
      for (let i = 0; i < this.floatingTexts.length; i++) {
        this.floatingTexts[i].draw(ctx);
      }
    }
  }

  // ============================================================================
  // 5. TOWER CLASS
  // ============================================================================
  class Tower {
    constructor(typeKey, x, y, options = {}) {
      const typeDef = TOWER_TYPES[typeKey.toUpperCase()] || TOWER_TYPES.GUNNER;
      this.typeKey = typeDef.id.toUpperCase();
      this.typeDef = typeDef;
      this.id = 'tower_' + Math.random().toString(36).substr(2, 9);

      this.x = x;
      this.y = y;
      this.radius = typeDef.radius || 22;
      this.level = 1; // 1, 2, or 3
      this.targetingMode = 'first'; // 'first' | 'closest' | 'strongest' | 'weakest'

      this.totalInvestedGold = typeDef.cost;
      this.totalInvestedEnergy = 0;
      this.slotIndex = options.slotIndex !== undefined ? options.slotIndex : null;

      // Stats from level 1
      this.applyStats();

      // Combat state
      this.target = null;
      this.angle = options.initialAngle || -Math.PI / 2;
      this.targetAngle = this.angle;
      this.shootCooldown = 0;
      this.recoil = 0;
      this.muzzleFlashTimer = 0;
      this.barrelSpinAngle = 0; // For Gatling & Last Stand

      // Flametrost active spray state
      this.flameParticles = [];
      this.isFiringFlame = false;

      // Last Stand Tower Overcharge
      this.isOvercharged = false;
      this.overchargeTimer = 0;
      this.overchargeCooldown = 0;

      // Statistics
      this.kills = 0;
      this.xp = 0;
      this.totalDamageDealt = 0;

      // Visual / animation timers
      this.idleAnimTimer = Math.random() * 10;
    }

    applyStats() {
      const lvlData = this.typeDef.levels[this.level - 1];
      this.name = lvlData.name;
      this.damage = lvlData.damage;
      this.fireRate = lvlData.fireRate;
      this.range = lvlData.range;
      this.minRange = lvlData.minRange || 0;
      this.splashRadius = lvlData.splashRadius || 0;
      this.projectileSpeed = lvlData.projectileSpeed || 800;
      this.pierce = lvlData.pierce || 1;
      this.coneAngle = lvlData.coneAngle || 0;
      this.burnDps = lvlData.burnDps || 0;
      this.burnDuration = lvlData.burnDuration || 0;
      this.chainCount = lvlData.chainCount || 0;
      this.chainRadius = lvlData.chainRadius || 0;
      this.critChance = lvlData.critChance || 0;
      this.critMultiplier = lvlData.critMultiplier || 1.5;
      this.overchargeDuration = lvlData.overchargeDuration || 8.0;
    }

    addXP(amount) {
      if (this.level >= 3) return;
      this.xp += amount;
      this.kills++; // Increment kills here as well since it's called on zombie death
      const required = this.level === 1 ? 800 : 3500;
      if (this.xp >= required) {
        this.upgrade(true); // pass true for free auto upgrade
      }
    }

    canUpgrade(playerGold, playerEnergy = 0) {
      if (this.level >= 3) return false;
      const nextLvlData = this.typeDef.levels[this.level];
      if (!nextLvlData) return false;
      return playerGold >= nextLvlData.upgradeCost;
    }

    getUpgradeCost() {
      if (this.level >= 3) return 0;
      return this.typeDef.levels[this.level].upgradeCost;
    }

    upgrade() {
      if (this.level >= 3) return false;
      const nextCost = this.getUpgradeCost();
      this.level++;
      this.totalInvestedGold += nextCost;
      this.applyStats();

      playSound('upgrade');

      // Visual fanfare in fx
      if (
        typeof window !== 'undefined' &&
        window.towerManager &&
        window.towerManager.projectiles
      ) {
        window.towerManager.projectiles.spawnDamageText(
          this.x,
          this.y - 28,
          `LVL ${this.level} UPGRADE!`,
          '#ffd700',
          16,
          true
        );
        window.towerManager.projectiles.spawnSparks(this.x, this.y, 16, '#ffd700');
      }
      return true;
    }

    getSellValue() {
      // Refund 70% of all gold invested
      return Math.floor(this.totalInvestedGold * 0.7);
    }

    sell() {
      playSound('sell');
      const refund = this.getSellValue();
      if (
        typeof window !== 'undefined' &&
        window.towerManager &&
        window.towerManager.projectiles
      ) {
        window.towerManager.projectiles.spawnDamageText(
          this.x,
          this.y - 20,
          `+${refund} G`,
          '#ffd54f',
          15,
          true
        );
      }
      return refund;
    }

    cycleTargetingMode() {
      const idx = TARGETING_MODES.indexOf(this.targetingMode);
      this.targetingMode = TARGETING_MODES[(idx + 1) % TARGETING_MODES.length];
      playSound('build_place');
      return this.targetingMode;
    }

    canOvercharge(playerEnergy) {
      if (this.typeKey !== 'LAST_STAND') return false;
      const cost = this.typeDef.energyCost || 25;
      return !this.isOvercharged && playerEnergy >= cost;
    }

    activateOvercharge() {
      if (this.typeKey !== 'LAST_STAND') return false;
      this.isOvercharged = true;
      this.overchargeTimer = this.overchargeDuration;

      playSound('overcharge_activate');

      if (
        typeof window !== 'undefined' &&
        window.towerManager &&
        window.towerManager.projectiles
      ) {
        window.towerManager.projectiles.spawnDamageText(
          this.x,
          this.y - 36,
          'OVERCHARGE ACTIVATED!',
          '#ff3d00',
          16,
          true
        );
        window.towerManager.projectiles.spawnSparks(this.x, this.y, 24, '#ff3d00');
      }
      return true;
    }

    // ========================================================================
    // TARGET SELECTION LOGIC
    // ========================================================================
    findTarget(zombies) {
      if (!zombies || zombies.length === 0) return null;

      let bestTarget = null;
      let bestScore = -Infinity;

      for (let i = 0; i < zombies.length; i++) {
        const z = zombies[i];
        if (!z || z.dead || z.hp <= 0) continue;

        const dist = Math.hypot(z.x - this.x, z.y - this.y);

        // Range boundary check (including Mortar deadzone)
        if (dist > this.range) continue;
        if (this.minRange > 0 && dist < this.minRange) continue;

        let score = 0;
        switch (this.targetingMode) {
          case 'first':
            // Highest progress along the road path
            score = z.progress !== undefined ? z.progress : (z.distTravelled || (10000 - dist));
            break;

          case 'closest':
            // Closest to this tower
            score = -dist;
            break;

          case 'strongest':
            // Highest current HP
            score = z.hp;
            break;

          case 'weakest':
            // Lowest current HP
            score = -z.hp;
            break;
        }

        if (score > bestScore) {
          bestScore = score;
          bestTarget = z;
        }
      }

      return bestTarget;
    }

    // ========================================================================
    // UPDATE CYCLE
    // ========================================================================
    update(dt, zombies, projectileManager) {
      this.idleAnimTimer += dt;
      if (this.shootCooldown > 0) this.shootCooldown -= dt;
      if (this.recoil > 0) this.recoil = Math.max(0, this.recoil - 25 * dt);
      if (this.muzzleFlashTimer > 0) this.muzzleFlashTimer -= dt;

      // Handle Last Stand Overcharge timer
      if (this.isOvercharged) {
        this.overchargeTimer -= dt;
        if (this.overchargeTimer <= 0) {
          this.isOvercharged = false;
        }
      }

      // Update Flametrost cone particles
      if (this.typeKey === 'FLAMETROST') {
        for (let i = this.flameParticles.length - 1; i >= 0; i--) {
          if (!this.flameParticles[i].update(dt)) {
            this.flameParticles.splice(i, 1);
          }
        }
      }

      // Acquire target
      this.target = this.findTarget(zombies);

      // Smooth aim rotation towards target
      if (this.target) {
        const desiredAngle = Math.atan2(this.target.y - this.y, this.target.x - this.x);
        let diff = desiredAngle - this.angle;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;

        const turnSpeed = this.typeKey === 'MORTAR' ? 3.0 : 12.0;
        this.angle += diff * Math.min(1.0, turnSpeed * dt);

        // Check if ready to fire
        const currentFireRate =
          this.isOvercharged && this.typeKey === 'LAST_STAND'
            ? this.fireRate * 2.5
            : this.fireRate;

        const cooldownInterval = 1 / currentFireRate;

        if (this.shootCooldown <= 0) {
          this.fire(this.target, projectileManager, zombies);
          this.shootCooldown = cooldownInterval;
        }
      } else {
        this.isFiringFlame = false;
      }
    }

    // ========================================================================
    // FIRING MECHANICS PER TOWER TYPE
    // ========================================================================
    fire(target, projectileManager, zombies) {
      this.muzzleFlashTimer = 0.08;
      this.recoil = 6.0;

      switch (this.typeKey) {
        case 'GUNNER': {
          playSound('gunner_fire');

          const isCrit = Math.random() < this.critChance;
          const barrelTip = this.getMuzzlePos(20);

          projectileManager.addProjectile(
            new BulletProjectile(barrelTip.x, barrelTip.y, target, this, {
              speed: this.projectileSpeed,
              damage: this.damage,
              isCrit,
              critMultiplier: this.critMultiplier,
              color: '#ffe082'
            })
          );
          break;
        }

        case 'ARCHER': {
          playSound('archer_fire');
          const bowTip = this.getMuzzlePos(16);

          projectileManager.addProjectile(
            new ArrowProjectile(bowTip.x, bowTip.y, target, this, {
              speed: this.projectileSpeed,
              damage: this.damage,
              pierce: this.pierce,
              bleedDps: this.level === 3 ? 18 : 0,
              bleedDuration: this.level === 3 ? 2.5 : 0
            })
          );
          break;
        }

        case 'ROCKET': {
          playSound('rocket_launch');
          const tubeTip = this.getMuzzlePos(18);

          projectileManager.addProjectile(
            new RocketProjectile(tubeTip.x, tubeTip.y, target, this, {
              speed: this.projectileSpeed,
              damage: this.damage,
              splashRadius: this.splashRadius,
              shredArmor: this.level === 3 ? 0.25 : 0
            })
          );
          break;
        }

        case 'FLAMETROST': {
          this.isFiringFlame = true;
          playSound('flame_loop');

          const nozzle = this.getMuzzlePos(22);
          const isHellfire = this.level === 3;

          // Spawn stream of flame particles
          for (let p = 0; p < 3; p++) {
            this.flameParticles.push(
              new FlameParticle(
                nozzle.x,
                nozzle.y,
                this.angle,
                this.range * 1.8,
                this.coneAngle,
                this.range
              )
            );
          }

          // Damage & burn all zombies within the cone
          for (let i = 0; i < zombies.length; i++) {
            const z = zombies[i];
            if (!z || z.dead || z.hp <= 0) continue;

            const dist = Math.hypot(z.x - this.x, z.y - this.y);
            if (dist <= this.range) {
              const angleToZ = Math.atan2(z.y - this.y, z.x - this.x);
              let diff = Math.abs(angleToZ - this.angle);
              while (diff > Math.PI) diff = Math.abs(diff - Math.PI * 2);

              if (diff <= this.coneAngle * 0.65) {
                // Inside cone!
                if (typeof z.takeDamage === 'function') {
                  z.takeDamage(this.damage, 'fire', this);
                } else {
                  z.hp -= this.damage;
                }

                if (typeof z.applyBurn === 'function') {
                  z.applyBurn(this.burnDps, this.burnDuration);
                }

                if (this.level >= 2 && typeof z.applySlow === 'function') {
                  z.applySlow(this.level === 3 ? 0.35 : 0.2, 1.0);
                }
              }
            }
          }
          break;
        }

        case 'TESLA': {
          playSound('tesla_zap');

          // Find chain targets: primary + up to (chainCount - 1) neighbors
          const chainTargets = [target];
          const hitSet = new Set([target]);

          let current = target;
          while (chainTargets.length < this.chainCount) {
            let nextBest = null;
            let minDist = this.chainRadius;

            for (let i = 0; i < zombies.length; i++) {
              const candidate = zombies[i];
              if (!candidate || candidate.dead || candidate.hp <= 0 || hitSet.has(candidate)) {
                continue;
              }
              const d = Math.hypot(candidate.x - current.x, candidate.y - current.y);
              if (d < minDist) {
                minDist = d;
                nextBest = candidate;
              }
            }

            if (!nextBest) break;
            hitSet.add(nextBest);
            chainTargets.push(nextBest);
            current = nextBest;
          }

          // Build arc points
          const arcPoints = [{ x: this.x, y: this.y - 18 }];
          let currentDmg = this.damage;
          const falloff = this.typeDef.levels[this.level - 1].chainFalloff || 0.8;
          const stunDur = this.typeDef.levels[this.level - 1].stunDuration || 0.2;

          for (let i = 0; i < chainTargets.length; i++) {
            const z = chainTargets[i];
            arcPoints.push({ x: z.x, y: z.y });

            const dmg = Math.round(currentDmg);
            if (typeof z.takeDamage === 'function') {
              z.takeDamage(dmg, 'shock', this);
            } else {
              z.hp -= dmg;
            }

            if (typeof z.applyStun === 'function') {
              z.applyStun(stunDur);
            }

            projectileManager.spawnDamageText(z.x, z.y - 12, dmg, '#40c4ff', 13);
            projectileManager.spawnSparks(z.x, z.y, 6, '#80d8ff');

            currentDmg *= falloff;
          }

          projectileManager.spawnTeslaArc(
            arcPoints,
            this.level === 3 ? '#00e5ff' : '#40c4ff'
          );
          break;
        }

        case 'MORTAR': {
          playSound('mortar_fire');

          // Predict target position along velocity
          const leadTime = this.typeDef.levels[this.level - 1].shellFlightTime || 1.5;
          const targetX = target.x + (target.vx ? target.vx * leadTime * 0.7 : 0);
          const targetY = target.y + (target.vy ? target.vy * leadTime * 0.7 : 0);

          const muzzle = this.getMuzzlePos(22);

          // White blast smoke puff at muzzle
          projectileManager.spawnSmokePuff(muzzle.x, muzzle.y, 10, '#e0e0e0');

          projectileManager.addProjectile(
            new MortarShellProjectile(muzzle.x, muzzle.y, targetX, targetY, this, {
              damage: this.damage,
              splashRadius: this.splashRadius,
              flightTime: leadTime,
              craterDamageDps: this.level === 3 ? 35 : 0,
              craterDuration: this.level === 3 ? 8.0 : 0
            })
          );
          break;
        }

        case 'LAST_STAND': {
          playSound('gatling_fire', { overcharged: this.isOvercharged });
          this.barrelSpinAngle += 0.8;

          // Double barrels alternating
          const barrelTip1 = this.getMuzzlePos(28, 6);
          const barrelTip2 = this.getMuzzlePos(28, -6);
          const tip = Math.random() < 0.5 ? barrelTip1 : barrelTip2;

          let dmg = this.damage;
          if (this.isOvercharged) {
            dmg = Math.round(dmg * 1.5);
          }

          projectileManager.addProjectile(
            new BulletProjectile(tip.x, tip.y, target, this, {
              speed: this.projectileSpeed,
              damage: dmg,
              isOvercharged: this.isOvercharged,
              color: this.isOvercharged ? '#ff1744' : '#ffd54f'
            })
          );

          // Shell casing ejection
          const ejectPos = this.getMuzzlePos(5, -12);
          projectileManager.spawnSparks(ejectPos.x, ejectPos.y, 1, '#ffb300');
          break;
        }
      }
    }

    getMuzzlePos(forwardDist, lateralOffset = 0) {
      const cos = Math.cos(this.angle);
      const sin = Math.sin(this.angle);
      const normX = -sin;
      const normY = cos;
      return {
        x: this.x + cos * forwardDist + normX * lateralOffset,
        y: this.y + sin * forwardDist + normY * lateralOffset
      };
    }

    // ========================================================================
    // CANVAS RENDERING
    // ========================================================================
    draw(ctx, isSelected = false, showRange = false) {
      ctx.save();

      // Range indicator overlay if selected or hovering
      if (isSelected || showRange) {
        this.drawRangeIndicator(ctx);
      }

      // Draw specialized tower based on type
      switch (this.typeKey) {
        case 'GUNNER':
          this.drawGunnerNest(ctx);
          break;
        case 'ARCHER':
          this.drawArcherTower(ctx);
          break;
        case 'ROCKET':
          this.drawRocketLauncher(ctx);
          break;
        case 'FLAMETROST':
          this.drawFlametrost(ctx);
          break;
        case 'TESLA':
          this.drawTeslaCoil(ctx);
          break;
        case 'MORTAR':
          this.drawMortar(ctx);
          break;
        case 'LAST_STAND':
          this.drawLastStandTower(ctx);
          break;
      }

      // Selection ring
      if (isSelected) {
        ctx.strokeStyle = '#00e5ff';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius + 6, 0, Math.PI * 2);
        ctx.stroke();

        // Pulsing corners
        const p = (Math.sin(this.idleAnimTimer * 5) + 1) * 0.5;
        ctx.strokeStyle = `rgba(0, 229, 255, ${0.4 + p * 0.4})`;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(
          this.x - this.radius - 8,
          this.y - this.radius - 8,
          (this.radius + 8) * 2,
          (this.radius + 8) * 2
        );
      }

      // Draw Level Badge (LVL 1, LVL 2, LVL 3 banner)
      this.drawLevelBadge(ctx);

      // Draw Overcharge glow on Last Stand
      if (this.isOvercharged) {
        this.drawOverchargeFX(ctx);
      }

      ctx.restore();
    }

    drawRangeIndicator(ctx) {
      ctx.save();

      // Outer range circle
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.range, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(79, 195, 247, 0.12)';
      ctx.fill();

      ctx.strokeStyle = 'rgba(79, 195, 247, 0.65)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 5]);
      ctx.stroke();

      // Inner deadzone circle for Mortar
      if (this.minRange > 0) {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.minRange, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(239, 83, 80, 0.2)';
        ctx.fill();

        ctx.strokeStyle = 'rgba(239, 83, 80, 0.8)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // Line connecting to active target
      if (this.target && !this.target.dead) {
        ctx.beginPath();
        ctx.moveTo(this.x, this.y);
        ctx.lineTo(this.target.x, this.target.y);
        ctx.strokeStyle = 'rgba(255, 23, 68, 0.4)';
        ctx.lineWidth = 1.2;
        ctx.setLineDash([3, 3]);
        ctx.stroke();
      }

      ctx.restore();
    }

    drawLevelBadge(ctx) {
      ctx.save();
      const badgeY = this.y + this.radius + 7;

      // Dark background pill
      const width = 36;
      const height = 13;
      ctx.fillStyle = 'rgba(20, 24, 28, 0.88)';
      ctx.strokeStyle =
        this.level === 3 ? '#ffd700' : this.level === 2 ? '#b0bec5' : '#8d6e63';
      ctx.lineWidth = 1.2;

      ctx.beginPath();
      drawRoundRect(ctx, this.x - width / 2, badgeY - height / 2, width, height, 4);
      ctx.fill();
      ctx.stroke();

      // Text "LVL 1", "LVL 2", "LVL 3"
      ctx.font = 'bold 9px "Segoe UI", Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle =
        this.level === 3 ? '#ffd700' : this.level === 2 ? '#eceff1' : '#ffcc80';
      ctx.fillText(`LVL ${this.level}`, this.x, badgeY);

      // Gold star on LVL 3
      if (this.level === 3) {
        ctx.fillStyle = '#ffd700';
        ctx.fillText('★', this.x - width / 2 - 4, badgeY);
        ctx.fillText('★', this.x + width / 2 + 4, badgeY);
      } else {
        // Draw XP Bar
        const required = this.level === 1 ? 800 : 3500;
        const p = Math.max(0, Math.min(1, (this.xp || 0) / required));
        ctx.fillStyle = 'rgba(16, 13, 10, 0.8)';
        ctx.fillRect(this.x - width / 2, badgeY + height / 2 + 2, width, 3);
        ctx.fillStyle = '#00e5ff';
        ctx.fillRect(this.x - width / 2, badgeY + height / 2 + 2, width * p, 3);
      }

      ctx.restore();
    }

    drawOverchargeFX(ctx) {
      ctx.save();
      const pulse = 0.5 + Math.sin(this.idleAnimTimer * 12) * 0.5;
      ctx.strokeStyle = `rgba(255, 61, 0, ${0.4 + pulse * 0.5})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius + 8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // ========================================================================
    // TOWER 1: GUNNER NEST
    // ========================================================================
    drawGunnerNest(ctx) {
      // 1. Sandbag Emplacement Foundation
      ctx.save();
      ctx.fillStyle = '#8d7b68';
      ctx.beginPath();
      ctx.arc(this.x, this.y, 22, 0, Math.PI * 2);
      ctx.fill();

      // Sandbags border
      ctx.fillStyle = '#bcaaa4';
      ctx.strokeStyle = '#5d4037';
      ctx.lineWidth = 1.2;
      const bags = this.level === 3 ? 10 : 8;
      for (let i = 0; i < bags; i++) {
        const bagAngle = (i / bags) * Math.PI * 2;
        const bx = this.x + Math.cos(bagAngle) * 17;
        const by = this.y + Math.sin(bagAngle) * 17;
        ctx.beginPath();
        ctx.ellipse(bx, by, 7, 4.5, bagAngle, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      // Fortified metal shields on LVL 2 & 3
      if (this.level >= 2) {
        ctx.fillStyle = '#455a64';
        ctx.fillRect(this.x - 14, this.y - 18, 28, 4);
        ctx.fillRect(this.x - 14, this.y + 14, 28, 4);
      }

      // 2. Survivor Gunner inside nest (aiming)
      ctx.translate(this.x, this.y);
      ctx.rotate(this.angle);

      // Gunner Body (Green military fatigue)
      ctx.fillStyle = '#33691e';
      ctx.beginPath();
      ctx.arc(-2, 0, 7, 0, Math.PI * 2);
      ctx.fill();

      // Gunner Cap / Helmet
      ctx.fillStyle = this.level === 3 ? '#263238' : '#558b2f';
      ctx.beginPath();
      ctx.arc(-2, 0, 5.5, 0, Math.PI * 2);
      ctx.fill();

      // Gun & Barrels (with recoil kickback)
      const recoilOffset = -this.recoil * 0.4;
      ctx.fillStyle = '#212121';
      ctx.fillRect(2 + recoilOffset, -2.5, 16, 5);

      if (this.level >= 2) {
        // Twin barrel or ammo box
        ctx.fillStyle = '#37474f';
        ctx.fillRect(-2, 4, 6, 6); // Ammo box
        ctx.fillStyle = '#111';
        ctx.fillRect(4 + recoilOffset, -4, 14, 2.5); // Top twin barrel
      }

      // 3. Muzzle Flash
      if (this.muzzleFlashTimer > 0) {
        ctx.fillStyle = '#fff59d';
        ctx.beginPath();
        ctx.moveTo(18 + recoilOffset, -4);
        ctx.lineTo(27 + recoilOffset, 0);
        ctx.lineTo(18 + recoilOffset, 4);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#ff9800';
        ctx.beginPath();
        ctx.arc(20 + recoilOffset, 0, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }

    // ========================================================================
    // TOWER 2: ARCHER TOWER
    // ========================================================================
    drawArcherTower(ctx) {
      ctx.save();

      // 1. Wooden Crate / Observation Platform
      ctx.fillStyle = '#5d4037';
      ctx.fillRect(this.x - 16, this.y - 16, 32, 32);

      // Wood plank lines
      ctx.strokeStyle = '#3e2723';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(this.x - 16, this.y - 16, 32, 32);
      ctx.beginPath();
      ctx.moveTo(this.x - 16, this.y - 5);
      ctx.lineTo(this.x + 16, this.y - 5);
      ctx.moveTo(this.x - 16, this.y + 6);
      ctx.lineTo(this.x + 16, this.y + 6);
      ctx.stroke();

      // Corner iron brackets
      ctx.fillStyle = '#78909c';
      ctx.fillRect(this.x - 16, this.y - 16, 5, 5);
      ctx.fillRect(this.x + 11, this.y - 16, 5, 5);
      ctx.fillRect(this.x - 16, this.y + 11, 5, 5);
      ctx.fillRect(this.x + 11, this.y + 11, 5, 5);

      // 2. Survivor Archer atop platform
      ctx.translate(this.x, this.y);
      ctx.rotate(this.angle);

      // Archer Body (Brown hunter leather)
      ctx.fillStyle = '#6d4c41';
      ctx.beginPath();
      ctx.arc(-2, 0, 6, 0, Math.PI * 2);
      ctx.fill();

      // Hood / Hair
      ctx.fillStyle = '#2e7d32';
      ctx.beginPath();
      ctx.arc(-2, 0, 4.5, 0, Math.PI * 2);
      ctx.fill();

      // Quiver on back
      ctx.fillStyle = '#8d6e63';
      ctx.fillRect(-8, -4, 4, 8);

      // Curved Hunting Bow
      ctx.strokeStyle = '#4e342e';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(8, 0, 10, -Math.PI / 2.8, Math.PI / 2.8);
      ctx.stroke();

      // Bowstring
      ctx.strokeStyle = '#eceff1';
      ctx.lineWidth = 1.0;
      ctx.beginPath();
      ctx.moveTo(8 + Math.cos(-Math.PI / 2.8) * 10, Math.sin(-Math.PI / 2.8) * 10);
      ctx.lineTo(3, 0); // Pulled back bowstring
      ctx.lineTo(8 + Math.cos(Math.PI / 2.8) * 10, Math.sin(Math.PI / 2.8) * 10);
      ctx.stroke();

      // Nocked arrow
      ctx.fillStyle = '#cfd8dc';
      ctx.fillRect(2, -1, 12, 2);

      ctx.restore();
    }

    // ========================================================================
    // TOWER 3: ROCKET LAUNCHER
    // ========================================================================
    drawRocketLauncher(ctx) {
      ctx.save();

      // 1. Heavy Metal Tripod / Swivel Turret Base
      ctx.fillStyle = '#263238';
      ctx.beginPath();
      ctx.arc(this.x, this.y, 20, 0, Math.PI * 2);
      ctx.fill();

      // Yellow hazard caution ring
      ctx.strokeStyle = '#fbc02d';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(this.x, this.y, 16, 0, Math.PI * 2);
      ctx.stroke();

      // 2. Swiveling Missile Pod
      ctx.translate(this.x, this.y);
      ctx.rotate(this.angle);

      // Pod Housing
      const recoilOffset = -this.recoil * 0.5;
      ctx.fillStyle = '#37474f';
      ctx.fillRect(-12 + recoilOffset, -10, 22, 20);

      // Missile Tubes & Tips
      ctx.fillStyle = '#102027';
      if (this.level === 1) {
        // Single Heavy Tube
        ctx.fillRect(8 + recoilOffset, -5, 6, 10);
        ctx.fillStyle = '#d32f2f'; // Warhead
        ctx.fillRect(10 + recoilOffset, -3.5, 4, 7);
      } else if (this.level === 2) {
        // Dual Tubes
        ctx.fillRect(8 + recoilOffset, -8, 6, 6);
        ctx.fillRect(8 + recoilOffset, 2, 6, 6);
        ctx.fillStyle = '#d32f2f';
        ctx.fillRect(10 + recoilOffset, -6.5, 4, 3);
        ctx.fillRect(10 + recoilOffset, 3.5, 4, 3);
      } else {
        // Quad Thermobaric Tubes
        ctx.fillRect(8 + recoilOffset, -9, 6, 4);
        ctx.fillRect(8 + recoilOffset, -4, 6, 4);
        ctx.fillRect(8 + recoilOffset, 1, 6, 4);
        ctx.fillRect(8 + recoilOffset, 6, 6, 4);
        ctx.fillStyle = '#ff1744';
        ctx.fillRect(10 + recoilOffset, -8, 4, 2);
        ctx.fillRect(10 + recoilOffset, -3, 4, 2);
        ctx.fillRect(10 + recoilOffset, 2, 4, 2);
        ctx.fillRect(10 + recoilOffset, 7, 4, 2);
      }

      // Exhaust Port at back
      ctx.fillStyle = '#212121';
      ctx.fillRect(-14 + recoilOffset, -6, 4, 12);

      ctx.restore();
    }

    // ========================================================================
    // TOWER 4: FLAMETROST
    // ========================================================================
    drawFlametrost(ctx) {
      ctx.save();

      // 1. Draw Active Flame Particles first (in world space)
      const isHellfire = this.level === 3;
      for (let i = 0; i < this.flameParticles.length; i++) {
        this.flameParticles[i].draw(ctx, isHellfire);
      }

      // 2. Pressurized Fuel Tank Platform
      ctx.fillStyle = '#424242';
      ctx.beginPath();
      ctx.arc(this.x, this.y, 20, 0, Math.PI * 2);
      ctx.fill();

      // Red Fuel canister behind
      ctx.fillStyle = '#c62828';
      ctx.beginPath();
      ctx.ellipse(this.x - 6, this.y - 8, 7, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ff8a80';
      ctx.lineWidth = 1;
      ctx.stroke();

      // 3. Flame Projector Turret
      ctx.translate(this.x, this.y);
      ctx.rotate(this.angle);

      // Heavy Projector Body
      ctx.fillStyle = '#e65100';
      ctx.fillRect(-8, -6, 16, 12);

      // Pressure Gauge
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(-2, 0, 3, 0, Math.PI * 2);
      ctx.fill();

      // Dual Flame Nozzle with Heat Shroud
      ctx.fillStyle = '#212121';
      ctx.fillRect(8, -5, 12, 10);
      ctx.fillStyle = '#bf360c';
      ctx.fillRect(12, -7, 3, 14);

      // Pilot Light / Idle Flame flicker
      const pilotFlicker = 0.5 + Math.sin(this.idleAnimTimer * 15) * 0.5;
      ctx.fillStyle = isHellfire ? '#00e5ff' : '#ff9100';
      ctx.beginPath();
      ctx.arc(21, 0, 2.5 * pilotFlicker, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }

    // ========================================================================
    // TOWER 5: TESLA COIL
    // ========================================================================
    drawTeslaCoil(ctx) {
      ctx.save();

      // 1. Insulated Concrete / Ceramic Base
      ctx.fillStyle = '#37474f';
      ctx.beginPath();
      ctx.arc(this.x, this.y, 21, 0, Math.PI * 2);
      ctx.fill();

      // Concentric copper induction rings
      const rings = this.level === 3 ? 4 : 3;
      for (let i = 0; i < rings; i++) {
        const r = 16 - i * 3.5;
        ctx.fillStyle = i % 2 === 0 ? '#b87333' : '#d7ccc8'; // Copper & porcelain
        ctx.beginPath();
        ctx.ellipse(this.x, this.y - i * 5, r, r * 0.6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#4e342e';
        ctx.lineWidth = 1.0;
        ctx.stroke();
      }

      // 2. High-Voltage Plasma Sphere at top
      const topY = this.y - 20 - (this.level - 1) * 3;
      const sphereRadius = 6 + (this.level - 1) * 1.5;

      // Outer electric glow aura
      const pulse = 0.6 + Math.sin(this.idleAnimTimer * 8) * 0.4;
      const glowGrad = ctx.createRadialGradient(
        this.x,
        topY,
        2,
        this.x,
        topY,
        sphereRadius * 2.2
      );
      glowGrad.addColorStop(0, 'rgba(128, 216, 255, 0.85)');
      glowGrad.addColorStop(0.5, 'rgba(41, 182, 246, 0.45)');
      glowGrad.addColorStop(1, 'rgba(2, 136, 209, 0)');

      ctx.fillStyle = glowGrad;
      ctx.beginPath();
      ctx.arc(this.x, topY, sphereRadius * 2.2, 0, Math.PI * 2);
      ctx.fill();

      // Metal sphere core
      ctx.fillStyle = '#e1f5fe';
      ctx.beginPath();
      ctx.arc(this.x, topY, sphereRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#0288d1';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // Idle micro-arcs crackling around sphere
      if (Math.random() < 0.35) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.2;
        const sparkAngle = Math.random() * Math.PI * 2;
        const sx = this.x + Math.cos(sparkAngle) * (sphereRadius + 2);
        const sy = topY + Math.sin(sparkAngle) * (sphereRadius + 2);
        const ex = sx + (Math.random() * 8 - 4);
        const ey = sy + (Math.random() * 8 - 4);
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(ex, ey);
        ctx.stroke();
      }

      ctx.restore();
    }

    // ========================================================================
    // TOWER 6: MORTAR CANNON
    // ========================================================================
    drawMortar(ctx) {
      ctx.save();

      // 1. Sandbag Fortified Dug-Out Pit
      ctx.fillStyle = '#3e2723';
      ctx.beginPath();
      ctx.arc(this.x, this.y, 25, 0, Math.PI * 2);
      ctx.fill();

      // Inner dirt depression
      ctx.fillStyle = '#271c19';
      ctx.beginPath();
      ctx.ellipse(this.x, this.y + 2, 18, 12, 0, 0, Math.PI * 2);
      ctx.fill();

      // Circular sandbag perimeter
      ctx.fillStyle = '#bcaaa4';
      ctx.strokeStyle = '#4e342e';
      ctx.lineWidth = 1.2;
      const count = 10;
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2;
        const bx = this.x + Math.cos(a) * 21;
        const by = this.y + Math.sin(a) * 21;
        ctx.beginPath();
        ctx.ellipse(bx, by, 7, 4.5, a, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      // 2. Heavy Mortar Tube (with elevation & aiming)
      ctx.translate(this.x, this.y);
      ctx.rotate(this.angle);

      // Mortar Baseplate
      ctx.fillStyle = '#263238';
      ctx.fillRect(-8, -7, 8, 14);

      // Angled Tube with recoil
      const recoilOffset = -this.recoil * 0.6;
      ctx.fillStyle = '#33691e'; // Heavy military green
      ctx.fillRect(-4 + recoilOffset, -5, 20, 10);

      // Heavy muzzle band
      ctx.fillStyle = '#1b5e20';
      ctx.fillRect(12 + recoilOffset, -6.5, 4, 13);

      // Hollow bore opening
      ctx.fillStyle = '#0a100d';
      ctx.beginPath();
      ctx.ellipse(16 + recoilOffset, 0, 2.5, 5, 0, 0, Math.PI * 2);
      ctx.fill();

      // 3. Survivor Artillery Loader standing beside pit
      ctx.fillStyle = '#558b2f';
      ctx.beginPath();
      ctx.arc(-10, 11, 4.5, 0, Math.PI * 2); // Loader helmet
      ctx.fill();

      ctx.restore();
    }

    // ========================================================================
    // TOWER 7: LAST STAND TOWER (Base Rotary Gatling Gun)
    // ========================================================================
    drawLastStandTower(ctx) {
      ctx.save();

      // 1. Massive Armored Turret Bunker Platform
      ctx.fillStyle = '#37474f';
      ctx.beginPath();
      ctx.arc(this.x, this.y, 30, 0, Math.PI * 2);
      ctx.fill();

      // Steel Armor Ring with Rivets
      ctx.strokeStyle = '#78909c';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(this.x, this.y, 27, 0, Math.PI * 2);
      ctx.stroke();

      // Yellow & Black Hazard Stripes on base perimeter
      ctx.strokeStyle = '#fbc02d';
      ctx.lineWidth = 3;
      ctx.setLineDash([8, 8]);
      ctx.beginPath();
      ctx.arc(this.x, this.y, 24, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // 2. Rotating Turret Mantlet & Gatling Barrels
      ctx.translate(this.x, this.y);
      ctx.rotate(this.angle);

      // Hydraulic recoil slide
      const recoilOffset = -this.recoil * 0.45;

      // Heavy Ammo Belt feed on the side
      ctx.fillStyle = '#ffd54f'; // Brass ammo belt
      ctx.fillRect(-12, -18, 8, 12);
      ctx.fillStyle = '#bf360c';
      ctx.fillRect(-14, -20, 12, 4);

      // Armored Turret Housing
      ctx.fillStyle = this.isOvercharged ? '#bf360c' : '#263238';
      ctx.beginPath();
      drawRoundRect(ctx, -16 + recoilOffset, -14, 28, 28, 6);
      ctx.fill();
      ctx.strokeStyle = this.isOvercharged ? '#ff5722' : '#546e7a';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Central Rotary Barrel Assembly (6-Barrel Gatling)
      ctx.save();
      ctx.translate(12 + recoilOffset, 0);

      // Multi-barrel bundle
      const numBarrels = 6;
      for (let b = 0; b < numBarrels; b++) {
        const bAngle = (b / numBarrels) * Math.PI * 2 + this.barrelSpinAngle;
        const by = Math.sin(bAngle) * 5.5;
        const bHeight = 2.5;

        ctx.fillStyle = this.isOvercharged ? '#ff7043' : '#102027';
        ctx.fillRect(0, by - bHeight / 2, 22, bHeight);

        // Overheated barrel glow in Overcharge
        if (this.isOvercharged) {
          ctx.fillStyle = '#ffeb3b';
          ctx.fillRect(14, by - bHeight / 2, 8, bHeight);
        }
      }

      // Barrel clamp rings
      ctx.fillStyle = '#37474f';
      ctx.fillRect(6, -7, 3, 14);
      ctx.fillRect(17, -7, 3, 14);

      // Muzzle Flash
      if (this.muzzleFlashTimer > 0) {
        ctx.fillStyle = this.isOvercharged ? '#ff3d00' : '#fff59d';
        ctx.beginPath();
        ctx.moveTo(22, -8);
        ctx.lineTo(34 + Math.random() * 8, 0);
        ctx.lineTo(22, 8);
        ctx.closePath();
        ctx.fill();

        // Laser targeting beam in Overcharge
        if (this.isOvercharged) {
          ctx.strokeStyle = 'rgba(255, 23, 68, 0.7)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(22, 0);
          ctx.lineTo(260, 0);
          ctx.stroke();
        }
      }

      ctx.restore();
      ctx.restore();
    }
  }

  // ============================================================================
  // 6. BUILD SLOTS & PLACEMENT SYSTEM
  // ============================================================================

  /**
   * Tactical pre-defined build slot
   */
  class BuildSlot {
    constructor(x, y, type = 'standard', id = 0) {
      this.id = id;
      this.x = x;
      this.y = y;
      this.type = type; // 'standard' (wood crate/sandbag) or 'mortar_pit'
      this.radius = 24;
      this.tower = null;
      this.isHovered = false;
    }

    isOccupied() {
      return this.tower !== null;
    }

    containsPoint(px, py) {
      return Math.hypot(px - this.x, py - this.y) <= this.radius;
    }

    draw(ctx, isPlacing = false) {
      // If occupied, the tower renders itself
      if (this.isOccupied()) return;

      ctx.save();

      // Pre-placed foundation graphic
      if (this.type === 'mortar_pit') {
        // Pit circle
        ctx.fillStyle = 'rgba(46, 33, 27, 0.7)';
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#5d4037';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      } else {
        // Wooden build pad / sandbag border
        ctx.fillStyle = 'rgba(78, 52, 46, 0.45)';
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = 'rgba(141, 110, 99, 0.6)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 3]);
        ctx.stroke();
      }

      // When player is holding a tower to build, pulse the slot
      if (isPlacing) {
        ctx.strokeStyle = this.isHovered ? '#00e5ff' : '#ffd54f';
        ctx.lineWidth = this.isHovered ? 2.5 : 1.5;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius + 3, 0, Math.PI * 2);
        ctx.stroke();

        // Plus icon in center
        ctx.fillStyle = this.isHovered ? '#00e5ff' : 'rgba(255, 213, 79, 0.8)';
        ctx.font = 'bold 16px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('+', this.x, this.y);
      }

      ctx.restore();
    }
  }

  // ============================================================================
  // 7. TOWER MANAGER (Master Controller)
  // ============================================================================
  class TowerManager {
    constructor() {
      this.towers = [];
      this.buildSlots = [];
      this.projectiles = new ProjectileManager();
      this.selectedTower = null;
      this.lastStandTower = null;

      // Placement preview state
      this.placingType = null; // Key of tower being placed (e.g. 'GUNNER')
      this.mousePos = { x: 0, y: 0 };
    }

    initDefaultSlots(mapWidth = 1280, mapHeight = 720) {
      this.buildSlots = [];

      // Strategic positions matching the screenshot around the winding S-curve road
      const defaultPositions = [
        { x: 365, y: 380, type: 'standard' }, // Lower mid wooden post
        { x: 475, y: 470, type: 'standard' }, // S-curve corner 1
        { x: 470, y: 565, type: 'standard' }, // Lower bend outpost
        { x: 375, y: 730, type: 'standard' }, // Bottom bend nest (LVL 3 Gunner)
        { x: 575, y: 760, type: 'mortar_pit' }, // Lower mortar pit
        { x: 650, y: 740, type: 'mortar_pit' }, // Lower-mid mortar pit
        { x: 605, y: 580, type: 'standard' }, // Mid-lane Tesla station
        { x: 595, y: 460, type: 'mortar_pit' }, // Mid mortar pit
        { x: 605, y: 370, type: 'standard' }, // Upper loop corner
        { x: 605, y: 170, type: 'standard' }, // Top loop sniper post
        { x: 475, y: 240, type: 'standard' }, // Top left overlook
        { x: 780, y: 565, type: 'standard' }, // Base perimeter sandbag pad
        { x: 645, y: 240, type: 'standard' } // Outer curve nest
      ];

      for (let i = 0; i < defaultPositions.length; i++) {
        const p = defaultPositions[i];
        this.buildSlots.push(new BuildSlot(p.x, p.y, p.type, i));
      }

      // Initialize the Last Stand Tower beside the Survivor Base (around 1180, 490)
      this.setupLastStandTower(1180, 490);
    }

    setupLastStandTower(x, y) {
      // Remove any prior Last Stand instance
      this.towers = this.towers.filter((t) => t.typeKey !== 'LAST_STAND');
      this.lastStandTower = new Tower('LAST_STAND', x, y);
      this.towers.push(this.lastStandTower);
    }

    // ========================================================================
    // ROAD & PLACEMENT VALIDATION
    // ========================================================================
    distToSegment(px, py, x1, y1, x2, y2) {
      const l2 = (x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1);
      if (l2 === 0) return Math.hypot(px - x1, py - y1);
      let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
      t = Math.max(0, Math.min(1, t));
      return Math.hypot(px - (x1 + t * (x2 - x1)), py - (y1 + t * (y2 - y1)));
    }

    isValidBuildPosition(x, y, typeKey, roadSegments = [], playerGold = 9999) {
      const typeDef = TOWER_TYPES[typeKey.toUpperCase()];
      if (!typeDef) return { valid: false, reason: 'Invalid tower type' };

      // 1. Gold check
      if (playerGold < typeDef.cost) {
        return { valid: false, reason: 'Not enough Gold (Cost: ' + typeDef.cost + ' G)' };
      }

      // 2. Map boundary check
      const radius = typeDef.radius || 22;
      if (x < radius + 20 || x > 1280 - radius - 20 || y < radius + 60 || y > 720 - radius - 60) {
        return { valid: false, reason: 'Out of bounds' };
      }

      // 3. Survivor Base exclusion zone (right side compound)
      if (x > 980 && y > 80 && y < 650) {
        return { valid: false, reason: 'Too close to Survivor Base compound' };
      }

      // 4. Overlap with existing towers
      for (let i = 0; i < this.towers.length; i++) {
        const t = this.towers[i];
        const minDist = radius + t.radius + 6;
        if (Math.hypot(x - t.x, y - t.y) < minDist) {
          return { valid: false, reason: 'Too close to another tower' };
        }
      }

      // 5. Road collision check (must not place directly ON the road)
      // Standard road clearance = roadWidth/2 (~28px) + towerRadius (~22px) = ~50px
      const minRoadDist = 48;
      if (roadSegments && roadSegments.length > 0) {
        for (let i = 0; i < roadSegments.length; i++) {
          const seg = roadSegments[i];
          const d = this.distToSegment(x, y, seg.x1, seg.y1, seg.x2, seg.y2);
          if (d < minRoadDist) {
            return { valid: false, reason: 'Cannot place on the road!' };
          }
        }
      }

      return { valid: true };
    }

    // ========================================================================
    // BUILD / UPGRADE / SELL ACTIONS
    // ========================================================================
    buildTower(typeKey, x, y, roadSegments = [], playerGold = 9999) {
      const typeUpper = typeKey.toUpperCase();
      const typeDef = TOWER_TYPES[typeUpper];
      if (!typeDef) return null;

      // Check if clicking directly on a pre-defined tactical build slot
      let slotFound = null;
      for (let i = 0; i < this.buildSlots.length; i++) {
        const slot = this.buildSlots[i];
        if (!slot.isOccupied() && slot.containsPoint(x, y)) {
          slotFound = slot;
          x = slot.x;
          y = slot.y;
          break;
        }
      }

      // If not on slot, check free placement validity along road borders
      if (!slotFound) {
        const check = this.isValidBuildPosition(x, y, typeUpper, roadSegments, playerGold);
        if (!check.valid) {
          console.warn('Placement invalid:', check.reason);
          return null;
        }
      }

      // Create and register tower
      const tower = new Tower(typeUpper, x, y, {
        slotIndex: slotFound ? slotFound.id : null
      });

      if (slotFound) {
        slotFound.tower = tower;
      }

      this.towers.push(tower);
      this.selectedTower = tower;

      playSound('build_place');
      return tower;
    }

    upgradeTower(tower, playerGold = 9999) {
      if (!tower || !tower.canUpgrade(playerGold)) return false;
      return tower.upgrade();
    }

    sellTower(tower) {
      if (!tower || tower.typeKey === 'LAST_STAND') return 0; // Last Stand cannot be sold

      const refund = tower.sell();

      // Free tactical slot if applicable
      if (tower.slotIndex !== null && this.buildSlots[tower.slotIndex]) {
        this.buildSlots[tower.slotIndex].tower = null;
      }

      // Remove from towers array
      this.towers = this.towers.filter((t) => t !== tower);
      if (this.selectedTower === tower) {
        this.selectedTower = null;
      }

      return refund;
    }

    selectTowerAt(x, y) {
      for (let i = this.towers.length - 1; i >= 0; i--) {
        const t = this.towers[i];
        if (Math.hypot(x - t.x, y - t.y) <= t.radius + 6) {
          this.selectedTower = t;
          playSound('build_place');
          return t;
        }
      }
      this.selectedTower = null;
      return null;
    }

    // ========================================================================
    // MAIN UPDATE & DRAW CYCLES
    // ========================================================================
    update(dt, zombies) {
      // 1. Update all towers
      for (let i = 0; i < this.towers.length; i++) {
        this.towers[i].update(dt, zombies, this.projectiles);
      }

      // 2. Update all projectiles and effects
      this.projectiles.update(dt, zombies);
    }

    draw(ctx, options = {}) {
      const isPlacing = !!this.placingType;

      // 1. Draw build slot pads
      for (let i = 0; i < this.buildSlots.length; i++) {
        this.buildSlots[i].draw(ctx, isPlacing);
      }

      // 2. Draw ground craters and projectiles (rendered via projectile manager)
      this.projectiles.draw(ctx);

      // 3. Draw all towers (sorted by Y for proper isometric depth layering)
      const sortedTowers = [...this.towers].sort((a, b) => a.y - b.y);
      for (let i = 0; i < sortedTowers.length; i++) {
        const t = sortedTowers[i];
        const isSelected = this.selectedTower === t;
        t.draw(ctx, isSelected, false);
      }

      // 4. Draw placement preview ghost if player is placing a tower
      if (this.placingType && this.mousePos) {
        this.drawPlacementGhost(
          ctx,
          this.placingType,
          this.mousePos.x,
          this.mousePos.y,
          options.roadSegments,
          options.playerGold
        );
      }
    }

    drawPlacementGhost(ctx, typeKey, mx, my, roadSegments, playerGold) {
      const typeDef = TOWER_TYPES[typeKey.toUpperCase()];
      if (!typeDef) return;

      // Check slot snap
      let snapX = mx;
      let snapY = my;
      let onSlot = false;
      for (let i = 0; i < this.buildSlots.length; i++) {
        const slot = this.buildSlots[i];
        if (!slot.isOccupied() && slot.containsPoint(mx, my)) {
          snapX = slot.x;
          snapY = slot.y;
          onSlot = true;
          break;
        }
      }

      const check = onSlot
        ? { valid: playerGold >= typeDef.cost }
        : this.isValidBuildPosition(snapX, snapY, typeKey, roadSegments, playerGold);

      const isValid = check.valid;
      const radius = typeDef.radius || 22;
      const range = typeDef.levels[0].range || 150;

      ctx.save();

      // Range circle preview
      ctx.beginPath();
      ctx.arc(snapX, snapY, range, 0, Math.PI * 2);
      ctx.fillStyle = isValid ? 'rgba(76, 175, 80, 0.15)' : 'rgba(244, 67, 54, 0.15)';
      ctx.fill();
      ctx.strokeStyle = isValid ? 'rgba(76, 175, 80, 0.8)' : 'rgba(244, 67, 54, 0.8)';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 6]);
      ctx.stroke();

      // Footprint boundary
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(snapX, snapY, radius, 0, Math.PI * 2);
      ctx.fillStyle = isValid ? 'rgba(76, 175, 80, 0.45)' : 'rgba(244, 67, 54, 0.45)';
      ctx.fill();
      ctx.strokeStyle = isValid ? '#4caf50' : '#f44336';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // Tower name and cost tag
      ctx.font = 'bold 12px "Segoe UI", Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 3;
      const label = `${typeDef.name} (${typeDef.cost} G)`;
      ctx.strokeText(label, snapX, snapY - radius - 10);
      ctx.fillText(label, snapX, snapY - radius - 10);

      if (!isValid && check.reason) {
        ctx.font = 'bold 10px Arial';
        ctx.fillStyle = '#ff5252';
        ctx.strokeText(check.reason, snapX, snapY + radius + 16);
        ctx.fillText(check.reason, snapX, snapY + radius + 16);
      }

      ctx.restore();
    }
  }

  // ============================================================================
  // 8. GLOBAL EXPORTS
  // ============================================================================
  const TowerSystem = {
    TOWER_TYPES,
    TARGETING_MODES,
    Tower,
    BuildSlot,
    TowerManager,
    ProjectileManager,
    BulletProjectile,
    ArrowProjectile,
    RocketProjectile,
    MortarShellProjectile,
    FlameParticle,
    TeslaArcEffect,
    CraterDecal,
    FloatingText,
    SoundSynth,
    playSound
  };

  // Expose on window for direct access across other modules
  if (typeof window !== 'undefined') {
    window.TowerSystem = TowerSystem;
    window.TOWER_TYPES = TOWER_TYPES;
    window.Tower = Tower;
    window.TowerManager = TowerManager;
    window.towerManager = new TowerManager();
  }

  return TowerSystem;
});
