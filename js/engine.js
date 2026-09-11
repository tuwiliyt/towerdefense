/**
 * ============================================================================
 * POST-APOCALYPTIC ZOMBIE TOWER DEFENSE - CORE GAME ENGINE
 * Architecture: Kingdom Rush Style Real-Time Tower Defense
 * Canvas Resolution: 1280 x 720 (16:9 Standard)
 * ============================================================================
 */

(function (global) {
  'use strict';

  // Environment detection
  const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';
  const perf = typeof performance !== 'undefined' && performance.now ? performance : Date;

  /**
   * CONSTANTS & DEFAULT CONFIGURATION
   */
  const ENGINE_CONFIG = {
    CANVAS_WIDTH: 1280,
    CANVAS_HEIGHT: 720,
    FIXED_TIMESTEP: 1 / 60, // 60 FPS deterministic physics/logic
    MAX_ACCUMULATOR: 0.25,   // Guard against spiral-of-death on tab lag
    SPEEDS: [1, 2, 4],
    ROAD_WIDTH: 44,          // Road clearance buffer
    DEFAULT_STATE: {
      gold: 2450,
      energy: 120,
      maxEnergy: 120,
      score: 78500,
      wave: 24,
      maxWaves: 40,
      baseHp: 100,
      maxBaseHp: 100,
      speed: 1,
      isPaused: false,
    },
  };

  /**
   * DEFAULT DUAL-PATH WAYPOINTS
   * High fidelity coordinates matching the post-apocalyptic cobblestone road layout.
   * Path A: Starts at Entry A (120, 220), curves through upper ruined street, meets junction at (425, 375),
   *         winds north through barricades, south past the Tesla sector, through the stone redoubt to Base (1100, 180).
   * Path B: Starts at Entry B (110, 550), curves through lower industrial street, merges at junction (425, 375),
   *         sharing the downstream winding corridor to Base (1100, 180).
   */
  const SHARED_BASE_APPROACH = [
    { x: 425, y: 375 },  // Central Junction / Meeting Point
    { x: 450, y: 310 },  // Heading north past ruined walls
    { x: 495, y: 230 },  // Upper curve bend
    { x: 555, y: 195 },  // North ridge road (sandbag barrier)
    { x: 625, y: 210 },  // Crest turn heading south
    { x: 665, y: 280 },  // Downhill straight
    { x: 665, y: 370 },  // Mid street corridor
    { x: 650, y: 460 },  // Approach to Tesla platform
    { x: 630, y: 530 },  // West curve of Tesla platform
    { x: 670, y: 595 },  // South loop under Tesla, above mortar trench
    { x: 745, y: 600 },  // Bottom hairpin bend
    { x: 815, y: 560 },  // North-east climb
    { x: 865, y: 470 },  // Approach to stone courtyard
    { x: 910, y: 385 },  // Through stone ring redoubt
    { x: 970, y: 305 },  // Hillside incline to survivor base
    { x: 1035, y: 235 }, // Base perimeter gate
    { x: 1100, y: 180 }, // Survivor Base Porch / Entry Door
  ];

  const DEFAULT_CONTROL_POINTS = {
    A: [
      { x: 120, y: 220 },  // Entry A Gate (Top-Left)
      { x: 230, y: 225 },  // Upper ruined street
      { x: 325, y: 240 },  // Past upper derelict tank
      { x: 385, y: 290 },  // Downward curve to junction
      ...SHARED_BASE_APPROACH,
    ],
    B: [
      { x: 110, y: 550 },  // Entry B Gate (Bottom-Left)
      { x: 215, y: 555 },  // Lower barricaded street
      { x: 310, y: 550 },  // Past lower derelict tank
      { x: 370, y: 505 },  // Incline curve toward junction
      { x: 405, y: 435 },  // Merging approach
      ...SHARED_BASE_APPROACH,
    ],
  };

  /**
   * STRATEGIC TOWER SLOTS (Predefined Kingdom Rush Style Defense Platforms)
   */
  const STRATEGIC_TOWER_SLOTS = [
    { id: 'slot_a1', x: 220, y: 150, radius: 24, name: 'Entry A Watchpost', tags: ['sniper', 'gunner'] },
    { id: 'slot_a2', x: 320, y: 310, radius: 24, name: 'Entry A Tank Bunker', tags: ['gunner', 'flamefrost'] },
    { id: 'slot_b1', x: 210, y: 625, radius: 24, name: 'Entry B Barricade Post', tags: ['gunner', 'rocket'] },
    { id: 'slot_b2', x: 375, y: 620, radius: 24, name: 'Entry B Gate Defense', tags: ['rocket', 'mortar'] },
    { id: 'slot_j1', x: 365, y: 420, radius: 24, name: 'Junction Chokepoint', tags: ['flamefrost', 'tesla'] },
    { id: 'slot_c1', x: 480, y: 240, radius: 24, name: 'North Street Nest', tags: ['gunner', 'archer'] },
    { id: 'slot_c2', x: 550, y: 120, radius: 24, name: 'North Ridge Overlook', tags: ['mortar', 'archer'] },
    { id: 'slot_c3', x: 535, y: 360, radius: 24, name: 'Central Core Post', tags: ['gunner', 'flamefrost'] },
    { id: 'slot_c4', x: 535, y: 490, radius: 24, name: 'Central Lower Post', tags: ['rocket', 'gunner'] },
    { id: 'slot_e1', x: 710, y: 140, radius: 24, name: 'North Artillery Ridge', tags: ['mortar', 'rocket'] },
    { id: 'slot_e2', x: 765, y: 270, radius: 24, name: 'East Trench Post', tags: ['gunner', 'archer'] },
    { id: 'slot_t1', x: 755, y: 490, radius: 26, name: 'Tesla Coil Platform', tags: ['tesla', 'flamefrost'] },
    { id: 'slot_m1', x: 730, y: 640, radius: 26, name: 'Trench Mortar Pit', tags: ['mortar', 'rocket'] },
    { id: 'slot_k1', x: 865, y: 410, radius: 24, name: 'Courtyard Sandbag Post', tags: ['gunner', 'tesla'] },
    { id: 'slot_k2', x: 940, y: 220, radius: 24, name: 'Base Outer Perimeter', tags: ['archer', 'gunner'] },
    { id: 'slot_ls', x: 1120, y: 370, radius: 32, name: 'Last Stand Heavy Platform', tags: ['heavy', 'gatling'] },
    { id: 'slot_bg', x: 1060, y: 140, radius: 24, name: 'Survivor Base Door Guard', tags: ['gunner', 'archer'] },
  ];

  /**
   * ============================================================================
   * 1. EVENT BUS
   * Robust pub/sub event emitter supporting aliases and wildcards.
   * ============================================================================
   */
  class EventBus {
    constructor() {
      this._handlers = new Map();
    }

    _normalize(eventName) {
      if (typeof eventName !== 'string') return '';
      return eventName.trim().toLowerCase();
    }

    _getAliases(eventName) {
      const norm = this._normalize(eventName);
      const aliases = new Set([norm]);
      if (norm.includes(':')) {
        aliases.add(norm.replace(/:/g, '_'));
        aliases.add(norm.replace(/:/g, '-'));
      } else if (norm.includes('_')) {
        aliases.add(norm.replace(/_/g, ':'));
        aliases.add(norm.replace(/_/g, '-'));
      }
      return aliases;
    }

    on(eventName, handler) {
      if (typeof handler !== 'function') return this;
      const norm = this._normalize(eventName);
      if (!this._handlers.has(norm)) {
        this._handlers.set(norm, new Set());
      }
      this._handlers.get(norm).add(handler);
      return this;
    }

    once(eventName, handler) {
      if (typeof handler !== 'function') return this;
      const norm = this._normalize(eventName);
      const onceWrapper = (data) => {
        this.off(norm, onceWrapper);
        handler(data);
      };
      onceWrapper._original = handler;
      return this.on(norm, onceWrapper);
    }

    off(eventName, handler) {
      const norm = this._normalize(eventName);
      if (!this._handlers.has(norm)) return this;
      const set = this._handlers.get(norm);
      if (!handler) {
        set.clear();
        return this;
      }
      for (const h of set) {
        if (h === handler || h._original === handler) {
          set.delete(h);
        }
      }
      if (set.size === 0) {
        this._handlers.delete(norm);
      }
      return this;
    }

    emit(eventName, data) {
      const aliases = this._getAliases(eventName);
      const invoked = new Set();

      for (const alias of aliases) {
        const handlers = this._handlers.get(alias);
        if (handlers) {
          // Snapshot to prevent mutation during iteration
          const snapshot = Array.from(handlers);
          for (const h of snapshot) {
            if (!invoked.has(h)) {
              invoked.add(h);
              try {
                h(data, eventName);
              } catch (err) {
                console.error(`[EventBus] Error in handler for '${eventName}':`, err);
              }
            }
          }
        }
      }

      // Wildcard listeners
      const wildcards = this._handlers.get('*');
      if (wildcards) {
        const snapshot = Array.from(wildcards);
        for (const h of snapshot) {
          if (!invoked.has(h)) {
            invoked.add(h);
            try {
              h(eventName, data);
            } catch (err) {
              console.error(`[EventBus] Error in wildcard handler for '${eventName}':`, err);
            }
          }
        }
      }

      return this;
    }

    clear() {
      this._handlers.clear();
      return this;
    }
  }

  /**
   * ============================================================================
   * 2. SPLINE & DUAL-PATH COORDINATE SYSTEM
   * Centripetal Catmull-Rom spline with Arc-Length Parameterization.
   * Ensures constant linear pixel speed for zombies regardless of curvature.
   * ============================================================================
   */
  class SplinePath {
    constructor(id, controlPoints, samplesPerSegment = 40) {
      this.id = id;
      this.controlPoints = controlPoints.map(p => ({ x: p.x, y: p.y }));
      this.samplesPerSegment = samplesPerSegment;
      this.samples = [];
      this.cumulativeLengths = [];
      this.totalLength = 0;
      this.build();
    }

    static centripetalCatmullRom(p0, p1, p2, p3, t, alpha = 0.5) {
      const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
      const t0 = 0.0;
      const t1 = t0 + Math.pow(Math.max(0.0001, dist(p0, p1)), alpha);
      const t2 = t1 + Math.pow(Math.max(0.0001, dist(p1, p2)), alpha);
      const t3 = t2 + Math.pow(Math.max(0.0001, dist(p2, p3)), alpha);

      const curT = t1 + t * (t2 - t1);

      const lerp = (a, b, ta, tb, targetT) => {
        const denom = tb - ta;
        if (Math.abs(denom) < 1e-6) return { x: a.x, y: a.y };
        const f = (targetT - ta) / denom;
        return {
          x: a.x + f * (b.x - a.x),
          y: a.y + f * (b.y - a.y),
        };
      };

      const a1 = lerp(p0, p1, t0, t1, curT);
      const a2 = lerp(p1, p2, t1, t2, curT);
      const a3 = lerp(p2, p3, t2, t3, curT);

      const b1 = lerp(a1, a2, t0, t2, curT);
      const b2 = lerp(a2, a3, t1, t3, curT);

      return lerp(b1, b2, t1, t2, curT);
    }

    build() {
      const pts = this.controlPoints;
      if (pts.length < 2) {
        this.samples = pts.slice();
        this.cumulativeLengths = [0];
        this.totalLength = 0;
        return;
      }

      // Extend endpoints for natural clamped curve ends
      const extended = [pts[0], ...pts, pts[pts.length - 1]];
      const rawSamples = [];

      for (let i = 0; i < pts.length - 1; i++) {
        const p0 = extended[i];
        const p1 = extended[i + 1];
        const p2 = extended[i + 2];
        const p3 = extended[i + 3];

        for (let s = 0; s < this.samplesPerSegment; s++) {
          const t = s / this.samplesPerSegment;
          rawSamples.push(SplinePath.centripetalCatmullRom(p0, p1, p2, p3, t));
        }
      }
      rawSamples.push(pts[pts.length - 1]);

      // Calculate arc-length parameterization table
      this.samples = rawSamples;
      this.cumulativeLengths = [0];
      let runningDist = 0;

      for (let i = 1; i < rawSamples.length; i++) {
        const dx = rawSamples[i].x - rawSamples[i - 1].x;
        const dy = rawSamples[i].y - rawSamples[i - 1].y;
        const segDist = Math.hypot(dx, dy);
        runningDist += segDist;
        this.cumulativeLengths.push(runningDist);
      }

      this.totalLength = runningDist;
    }

    /**
     * Get position, rotation angle, progress, and normal vector at a given distance along path.
     * @param {number} distance - Pixels traveled from start
     * @returns {Object} { x, y, angle, angleDeg, progress, remaining, normal, getOffsetPoint }
     */
    getPositionAtDistance(distance) {
      const dist = Math.max(0, Math.min(distance, this.totalLength));
      const n = this.cumulativeLengths.length;

      if (n <= 1 || this.totalLength <= 0) {
        const p = this.samples[0] || { x: 0, y: 0 };
        return {
          x: p.x,
          y: p.y,
          angle: 0,
          angleDeg: 0,
          progress: 0,
          remaining: 0,
          normal: { x: 0, y: -1 },
          getOffsetPoint: () => ({ x: p.x, y: p.y }),
        };
      }

      // Binary search along cumulative lengths
      let low = 0;
      let high = n - 1;
      while (low <= high) {
        const mid = (low + high) >> 1;
        if (this.cumulativeLengths[mid] < dist) {
          low = mid + 1;
        } else {
          high = mid - 1;
        }
      }

      const idx = Math.max(0, Math.min(low - 1, n - 2));
      const d0 = this.cumulativeLengths[idx];
      const d1 = this.cumulativeLengths[idx + 1];
      const span = Math.max(0.0001, d1 - d0);
      const frac = Math.max(0, Math.min(1, (dist - d0) / span));

      const p0 = this.samples[idx];
      const p1 = this.samples[idx + 1];

      const x = p0.x + frac * (p1.x - p0.x);
      const y = p0.y + frac * (p1.y - p0.y);

      // Tangent vector
      const dx = p1.x - p0.x;
      const dy = p1.y - p0.y;
      const angle = Math.atan2(dy, dx);
      const angleDeg = (angle * 180) / Math.PI;

      // Normal perpendicular vector (for lane offset swarming)
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;

      const progress = dist / this.totalLength;
      const remaining = this.totalLength - dist;

      return {
        x,
        y,
        angle,
        angleDeg,
        progress,
        distance: dist,
        remaining,
        normal: { x: nx, y: ny },
        getOffsetPoint: (offset) => ({
          x: x + nx * offset,
          y: y + ny * offset,
        }),
      };
    }

    /**
     * Get position at normalized progress (0.0 to 1.0)
     */
    getPositionAtProgress(progress) {
      const clamped = Math.max(0, Math.min(1, progress));
      return this.getPositionAtDistance(clamped * this.totalLength);
    }

    /**
     * Finds the closest point on the path to an arbitrary point (x, y).
     */
    getClosestPoint(x, y) {
      let minDistSq = Infinity;
      let closestIdx = 0;

      for (let i = 0; i < this.samples.length; i++) {
        const s = this.samples[i];
        const distSq = (s.x - x) * (s.x - x) + (s.y - y) * (s.y - y);
        if (distSq < minDistSq) {
          minDistSq = distSq;
          closestIdx = i;
        }
      }

      const dist = this.cumulativeLengths[closestIdx];
      const pt = this.samples[closestIdx];
      return {
        point: pt,
        distanceOnPath: dist,
        progress: dist / (this.totalLength || 1),
        distanceToPath: Math.sqrt(minDistSq),
      };
    }

    /**
     * Checks if a point is within roadRadius of this path.
     */
    isPointOnRoad(x, y, roadRadius = ENGINE_CONFIG.ROAD_WIDTH / 2) {
      const res = this.getClosestPoint(x, y);
      return res.distanceToPath <= roadRadius;
    }
  }

  /**
   * Path System Coordinator: Manages Dual Paths (Path A and Path B)
   */
  class PathSystem {
    constructor(customPaths = {}) {
      this.paths = new Map();
      this.initPaths(customPaths);
    }

    initPaths(customPaths = {}) {
      const pathAData = customPaths.A || DEFAULT_CONTROL_POINTS.A;
      const pathBData = customPaths.B || DEFAULT_CONTROL_POINTS.B;

      this.paths.set('A', new SplinePath('A', pathAData));
      this.paths.set('B', new SplinePath('B', pathBData));
    }

    getPath(pathId) {
      const key = (pathId || 'A').toUpperCase();
      return this.paths.get(key) || this.paths.get('A');
    }

    getPositionAtDistance(pathId, distance) {
      return this.getPath(pathId).getPositionAtDistance(distance);
    }

    getPositionAtProgress(pathId, progress) {
      return this.getPath(pathId).getPositionAtProgress(progress);
    }

    getTotalLength(pathId) {
      return this.getPath(pathId).totalLength;
    }

    getControlPoints(pathId) {
      return this.getPath(pathId).controlPoints;
    }

    setControlPoints(pathId, points) {
      const key = (pathId || 'A').toUpperCase();
      this.paths.set(key, new SplinePath(key, points));
    }

    isPointOnRoad(x, y, roadRadius = ENGINE_CONFIG.ROAD_WIDTH / 2) {
      for (const [, spline] of this.paths) {
        if (spline.isPointOnRoad(x, y, roadRadius)) {
          return true;
        }
      }
      return false;
    }

    getClosestPointOnAnyPath(x, y) {
      let closest = null;
      let minDistance = Infinity;

      for (const [id, spline] of this.paths) {
        const query = spline.getClosestPoint(x, y);
        if (query.distanceToPath < minDistance) {
          minDistance = query.distanceToPath;
          closest = { pathId: id, ...query };
        }
      }
      return closest;
    }

    renderDebug(ctx) {
      if (!ctx) return;
      ctx.save();

      // Render Path A (Red)
      this._renderSplineDebug(ctx, this.getPath('A'), '#ff3344', 'Path A (Entry A)');
      // Render Path B (Cyan)
      this._renderSplineDebug(ctx, this.getPath('B'), '#00d0ff', 'Path B (Entry B)');

      // Render Survivor Base Marker
      const basePos = SHARED_BASE_APPROACH[SHARED_BASE_APPROACH.length - 1];
      ctx.beginPath();
      ctx.arc(basePos.x, basePos.y, 22, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0, 255, 120, 0.3)';
      ctx.fill();
      ctx.strokeStyle = '#00ff80';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 11px sans-serif';
      ctx.fillText('SURVIVOR BASE', basePos.x - 45, basePos.y - 28);

      ctx.restore();
    }

    _renderSplineDebug(ctx, spline, color, label) {
      const samples = spline.samples;
      if (samples.length < 2) return;

      // Road boundary corridor
      ctx.beginPath();
      ctx.moveTo(samples[0].x, samples[0].y);
      for (let i = 1; i < samples.length; i++) {
        ctx.lineTo(samples[i].x, samples[i].y);
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = ENGINE_CONFIG.ROAD_WIDTH;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.globalAlpha = 0.18;
      ctx.stroke();

      // Centerline
      ctx.beginPath();
      ctx.moveTo(samples[0].x, samples[0].y);
      for (let i = 1; i < samples.length; i++) {
        ctx.lineTo(samples[i].x, samples[i].y);
      }
      ctx.lineWidth = 2.5;
      ctx.globalAlpha = 0.85;
      ctx.stroke();

      // Directional chevrons along path
      ctx.globalAlpha = 0.7;
      const stepDist = 80;
      const total = spline.totalLength;
      for (let d = 40; d < total; d += stepDist) {
        const info = spline.getPositionAtDistance(d);
        ctx.save();
        ctx.translate(info.x, info.y);
        ctx.rotate(info.angle);
        ctx.beginPath();
        ctx.moveTo(-6, -5);
        ctx.lineTo(5, 0);
        ctx.lineTo(-6, 5);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
      }

      // Control points
      ctx.globalAlpha = 1.0;
      for (let i = 0; i < spline.controlPoints.length; i++) {
        const cp = spline.controlPoints[i];
        ctx.beginPath();
        ctx.arc(cp.x, cp.y, 4.5, 0, Math.PI * 2);
        ctx.fillStyle = i === 0 ? '#ffea00' : color;
        ctx.fill();
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // Label at start
      const start = spline.controlPoints[0];
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 11px sans-serif';
      ctx.fillText(label, start.x - 20, start.y - 12);
    }
  }

  /**
   * ============================================================================
   * 3. GAME STATE MANAGEMENT
   * Resources: Gold (2450 G), Energy (120 E), Score (78500), Wave (24/40), Base HP (100/100).
   * Multipliers: 1x, 2x, 4x, Pause.
   * Emits state events for full UI synchronization.
   * ============================================================================
   */
  class GameState {
    constructor(eventBus, initialConfig = {}) {
      this.events = eventBus || new EventBus();
      this.reset(initialConfig);
    }

    reset(customConfig = {}) {
      const def = ENGINE_CONFIG.DEFAULT_STATE;
      const cfg = { ...def, ...customConfig };

      this.gold = Number(cfg.gold ?? def.gold);
      this.energy = Number(cfg.energy ?? def.energy);
      this.maxEnergy = Number(cfg.maxEnergy ?? def.maxEnergy);
      this.score = Number(cfg.score ?? def.score);
      this.wave = Math.max(1, Math.min(cfg.wave ?? def.wave, cfg.maxWaves ?? def.maxWaves));
      this.maxWaves = Number(cfg.maxWaves ?? def.maxWaves);
      this.baseHp = Math.max(0, Math.min(cfg.baseHp ?? def.baseHp, cfg.maxBaseHp ?? def.maxBaseHp));
      this.maxBaseHp = Number(cfg.maxBaseHp ?? def.maxBaseHp);
      this.speed = ENGINE_CONFIG.SPEEDS.includes(cfg.speed) ? cfg.speed : 1;
      this.isPaused = Boolean(cfg.isPaused);
      this.status = 'ready'; // 'ready' | 'running' | 'paused' | 'gameover' | 'victory'

      // Detailed combat & performance analytics
      this.stats = {
        zombiesKilled: 0,
        damageDealt: 0,
        damageTaken: 0,
        goldEarned: 0,
        goldSpent: 0,
        energySpent: 0,
        towersBuilt: 0,
        towersUpgraded: 0,
        towersSold: 0,
        wavesCleared: 0,
        abilitiesUsed: 0,
        gameDuration: 0,
      };

      this._notifyStateChange('reset');
      return this;
    }

    _notifyStateChange(reason) {
      const snapshot = this.getSnapshot();
      this.events.emit('state:changed', { ...snapshot, reason });
      this.events.emit('state_changed', { ...snapshot, reason });
    }

    getSnapshot() {
      return {
        gold: this.gold,
        energy: this.energy,
        maxEnergy: this.maxEnergy,
        score: this.score,
        wave: this.wave,
        maxWaves: this.maxWaves,
        baseHp: this.baseHp,
        maxBaseHp: this.maxBaseHp,
        speed: this.speed,
        isPaused: this.isPaused,
        status: this.status,
        stats: { ...this.stats },
      };
    }

    /**
     * Gold economy
     */
    addGold(amount) {
      const val = Math.max(0, Math.floor(amount || 0));
      if (val === 0) return this.gold;
      this.gold += val;
      this.stats.goldEarned += val;
      this.events.emit('gold:changed', { gold: this.gold, delta: val });
      this._notifyStateChange('gold_added');
      return this.gold;
    }

    canAfford(cost) {
      return this.gold >= cost;
    }

    spendGold(amount) {
      const val = Math.max(0, Math.floor(amount || 0));
      if (this.gold < val) return false;
      this.gold -= val;
      this.stats.goldSpent += val;
      this.events.emit('gold:changed', { gold: this.gold, delta: -val });
      this._notifyStateChange('gold_spent');
      return true;
    }

    /**
     * Energy economy
     */
    addEnergy(amount) {
      const val = Math.max(0, Math.floor(amount || 0));
      if (val === 0) return this.energy;
      this.energy = Math.min(this.maxEnergy, this.energy + val);
      this.events.emit('energy:changed', { energy: this.energy, delta: val });
      this._notifyStateChange('energy_added');
      return this.energy;
    }

    canAffordEnergy(cost) {
      return this.energy >= cost;
    }

    spendEnergy(amount) {
      const val = Math.max(0, Math.floor(amount || 0));
      if (this.energy < val) return false;
      this.energy -= val;
      this.stats.energySpent += val;
      this.events.emit('energy:changed', { energy: this.energy, delta: -val });
      this._notifyStateChange('energy_spent');
      return true;
    }

    /**
     * Score tracking
     */
    addScore(amount) {
      const val = Math.max(0, Math.floor(amount || 0));
      if (val === 0) return this.score;
      this.score += val;
      this.events.emit('score:changed', { score: this.score, delta: val });
      this._notifyStateChange('score_added');
      return this.score;
    }

    /**
     * Base Health & Damage
     */
    damageBase(amount) {
      const val = Math.max(0, Math.floor(amount || 0));
      if (val === 0 || this.status === 'gameover') return this.baseHp;

      this.baseHp = Math.max(0, this.baseHp - val);
      this.stats.damageTaken += val;

      this.events.emit('base:damaged', {
        hp: this.baseHp,
        maxHp: this.maxBaseHp,
        damage: val,
      });

      this._notifyStateChange('base_damaged');

      if (this.baseHp <= 0) {
        this.status = 'gameover';
        this.events.emit('game:over', {
          reason: 'base_destroyed',
          wave: this.wave,
          score: this.score,
          stats: { ...this.stats },
        });
        this.events.emit('game_over', {
          reason: 'base_destroyed',
          wave: this.wave,
          score: this.score,
          stats: { ...this.stats },
        });
      }

      return this.baseHp;
    }

    repairBase(amount) {
      const val = Math.max(0, Math.floor(amount || 0));
      if (val === 0 || this.baseHp >= this.maxBaseHp) return this.baseHp;

      this.baseHp = Math.min(this.maxBaseHp, this.baseHp + val);
      this.events.emit('base:repaired', {
        hp: this.baseHp,
        maxHp: this.maxBaseHp,
        repaired: val,
      });
      this._notifyStateChange('base_repaired');
      return this.baseHp;
    }

    /**
     * Wave Progression (1 - 40)
     */
    setWave(waveNum) {
      const w = Math.max(1, Math.min(Math.floor(waveNum || 1), this.maxWaves));
      if (w === this.wave) return this.wave;
      this.wave = w;
      this.events.emit('wave:changed', { wave: this.wave, maxWaves: this.maxWaves });
      this._notifyStateChange('wave_changed');
      return this.wave;
    }

    startWave(customWave) {
      if (customWave !== undefined) {
        this.setWave(customWave);
      }
      if (this.status === 'ready' || this.status === 'paused') {
        this.status = 'running';
      }
      this.events.emit('wave:started', { wave: this.wave, maxWaves: this.maxWaves });
      this.events.emit('wave_started', { wave: this.wave, maxWaves: this.maxWaves });
      this._notifyStateChange('wave_started');
      return this.wave;
    }

    clearWave() {
      this.stats.wavesCleared++;
      this.events.emit('wave:cleared', { wave: this.wave, maxWaves: this.maxWaves });
      this.events.emit('wave_cleared', { wave: this.wave, maxWaves: this.maxWaves });

      if (this.wave >= this.maxWaves) {
        this.status = 'victory';
        this.events.emit('game:victory', {
          score: this.score,
          stats: { ...this.stats },
        });
        this.events.emit('game_victory', {
          score: this.score,
          stats: { ...this.stats },
        });
      } else {
        this.wave++;
        this._notifyStateChange('wave_incremented');
      }
      return this.wave;
    }

    /**
     * Clock & Speed Management
     */
    setSpeed(speedMultiplier) {
      if (!ENGINE_CONFIG.SPEEDS.includes(speedMultiplier)) return this.speed;
      this.speed = speedMultiplier;
      this.events.emit('speed:changed', { speed: this.speed });
      this._notifyStateChange('speed_changed');
      return this.speed;
    }

    toggleSpeed() {
      const idx = ENGINE_CONFIG.SPEEDS.indexOf(this.speed);
      const nextIdx = (idx + 1) % ENGINE_CONFIG.SPEEDS.length;
      return this.setSpeed(ENGINE_CONFIG.SPEEDS[nextIdx]);
    }

    pause() {
      if (this.isPaused) return;
      this.isPaused = true;
      if (this.status === 'running') this.status = 'paused';
      this.events.emit('game:paused', { isPaused: true });
      this._notifyStateChange('paused');
    }

    resume() {
      if (!this.isPaused) return;
      this.isPaused = false;
      if (this.status === 'paused') this.status = 'running';
      this.events.emit('game:resumed', { isPaused: false });
      this._notifyStateChange('resumed');
    }

    togglePause() {
      if (this.isPaused) {
        this.resume();
      } else {
        this.pause();
      }
      return this.isPaused;
    }
  }

  /**
   * ============================================================================
   * 4. ENTITY MANAGER (Towers, Zombies, Projectiles, Particles, Floating Text)
   * Spatial queries, priority targeting, life-cycle tracking.
   * ============================================================================
   */
  class EntityManager {
    constructor(engine) {
      this.engine = engine;
      this.events = engine.events;
      this.state = engine.state;
      this.paths = engine.paths;

      // Entity Collections
      this.towers = new Map();
      this.zombies = new Map();
      this.projectiles = new Set();
      this.particles = [];
      this.floatingTexts = [];

      // Strategic Tower Slots
      this.slots = STRATEGIC_TOWER_SLOTS.map(s => ({
        ...s,
        occupiedBy: null, // Tower ID if built
      }));

      this._nextId = 1;
    }

    generateId(prefix = 'ent') {
      return `${prefix}_${this._nextId++}`;
    }

    clear() {
      this.towers.clear();
      this.zombies.clear();
      this.projectiles.clear();
      this.particles.length = 0;
      this.floatingTexts.length = 0;
      for (const slot of this.slots) {
        slot.occupiedBy = null;
      }
    }

    /**
     * --- TOWER MANAGEMENT ---
     */
    getSlots() {
      return this.slots;
    }

    getSlot(slotId) {
      return this.slots.find(s => s.id === slotId) || null;
    }

    getClosestSlot(x, y, maxDistance = 36) {
      let closest = null;
      let minD = maxDistance;
      for (const s of this.slots) {
        const d = Math.hypot(s.x - x, s.y - y);
        if (d < minD) {
          minD = d;
          closest = s;
        }
      }
      return closest;
    }

    isValidPlacement(x, y, radius = 24) {
      // 1. Boundary check (leaving room for HUD / margins)
      if (x < 60 || x > 1220 || y < 80 || y > 670) return false;

      // 2. Road clearance check
      if (this.paths.isPointOnRoad(x, y, radius + 12)) return false;

      // 3. Tower-to-Tower distance check
      for (const [, tower] of this.towers) {
        const dist = Math.hypot(tower.x - x, tower.y - y);
        const minDist = (tower.radius || 24) + radius;
        if (dist < minDist) return false;
      }

      return true;
    }

    addTower(towerConfig) {
      const id = towerConfig.id || this.generateId('tower');
      const x = Number(towerConfig.x);
      const y = Number(towerConfig.y);
      const cost = Number(towerConfig.cost || 0);

      // Verify gold
      if (cost > 0 && !this.state.canAfford(cost)) {
        return null;
      }

      // Check slot association if placed on predefined pad
      let slot = null;
      if (towerConfig.slotId) {
        slot = this.getSlot(towerConfig.slotId);
      } else {
        slot = this.getClosestSlot(x, y, 28);
      }

      if (slot) {
        if (slot.occupiedBy) return null; // Slot already taken
        slot.occupiedBy = id;
      } else {
        // Free placement validation
        if (!this.isValidPlacement(x, y, towerConfig.radius || 24)) {
          return null;
        }
      }

      if (cost > 0) {
        this.state.spendGold(cost);
      }

      const tower = {
        id,
        slotId: slot ? slot.id : null,
        type: towerConfig.type || 'gunner',
        name: towerConfig.name || 'Gunner Post',
        level: towerConfig.level || 1,
        x: slot ? slot.x : x,
        y: slot ? slot.y : y,
        range: towerConfig.range || 140,
        damage: towerConfig.damage || 25,
        fireRate: towerConfig.fireRate || 1.2, // attacks per second
        cooldown: 0,
        kills: 0,
        totalDamage: 0,
        targetStrategy: towerConfig.targetStrategy || 'first', // 'first' | 'last' | 'strongest' | 'weakest' | 'closest'
        currentTarget: null,
        cost,
        upgradeCost: towerConfig.upgradeCost || Math.floor(cost * 1.6),
        sellRefund: towerConfig.sellRefund || Math.floor(cost * 0.7),
        ...towerConfig,
      };

      this.towers.set(id, tower);
      this.state.stats.towersBuilt++;

      this.events.emit('tower:placed', tower);
      this.events.emit('tower_placed', tower);
      return tower;
    }

    upgradeTower(towerId, upgradeData = {}) {
      const tower = this.towers.get(towerId);
      if (!tower) return null;

      const cost = upgradeData.cost !== undefined ? upgradeData.cost : tower.upgradeCost;
      if (cost > 0 && !this.state.spendGold(cost)) {
        return null;
      }

      tower.level += 1;
      tower.damage = Math.round(tower.damage * (upgradeData.damageMultiplier || 1.35));
      tower.range = Math.round(tower.range * (upgradeData.rangeMultiplier || 1.1));
      tower.fireRate = Number((tower.fireRate * (upgradeData.fireRateMultiplier || 1.15)).toFixed(2));
      tower.upgradeCost = Math.round(tower.upgradeCost * 1.7);
      tower.sellRefund = Math.round((tower.sellRefund || 0) + cost * 0.65);

      if (upgradeData.name) tower.name = upgradeData.name;
      Object.assign(tower, upgradeData.properties || {});

      this.state.stats.towersUpgraded++;
      this.events.emit('tower:upgraded', tower);
      this.events.emit('tower_upgraded', tower);
      return tower;
    }

    removeTower(towerId, refund = true) {
      const tower = this.towers.get(towerId);
      if (!tower) return false;

      if (refund && tower.sellRefund > 0) {
        this.state.addGold(tower.sellRefund);
      }

      if (tower.slotId) {
        const slot = this.getSlot(tower.slotId);
        if (slot) slot.occupiedBy = null;
      }

      this.towers.delete(towerId);
      this.state.stats.towersSold++;

      this.events.emit('tower:sold', { towerId, refund: refund ? tower.sellRefund : 0 });
      this.events.emit('tower_sold', { towerId, refund: refund ? tower.sellRefund : 0 });
      return true;
    }

    getTower(towerId) {
      return this.towers.get(towerId) || null;
    }

    getTowers() {
      return Array.from(this.towers.values());
    }

    getTowerAt(x, y, radius = 24) {
      for (const [, tower] of this.towers) {
        const d = Math.hypot(tower.x - x, tower.y - y);
        if (d <= (tower.radius || radius)) {
          return tower;
        }
      }
      return null;
    }

    /**
     * --- ZOMBIE MANAGEMENT ---
     */
    addZombie(zombieConfig) {
      const id = zombieConfig.id || this.generateId('zombie');
      const pathId = (zombieConfig.pathId || 'A').toUpperCase();
      const path = this.paths.getPath(pathId);
      const laneOffset = Number(zombieConfig.laneOffset !== undefined ? zombieConfig.laneOffset : (Math.random() - 0.5) * 16);

      const spawnPos = path.getPositionAtDistance(0);
      const actualPos = spawnPos.getOffsetPoint(laneOffset);

      const zombie = {
        id,
        pathId,
        type: zombieConfig.type || 'walker',
        name: zombieConfig.name || 'Infected Walker',
        hp: zombieConfig.hp || 100,
        maxHp: zombieConfig.hp || 100,
        armor: zombieConfig.armor || 0, // % damage reduction 0 to 1
        speed: zombieConfig.speed || 60, // pixels per second
        damage: zombieConfig.damage || 1, // base damage when reaching end
        goldBounty: zombieConfig.goldBounty !== undefined ? zombieConfig.goldBounty : 15,
        scoreValue: zombieConfig.scoreValue !== undefined ? zombieConfig.scoreValue : 80,
        distanceTraveled: 0,
        totalPathLength: path.totalLength,
        laneOffset,
        x: actualPos.x,
        y: actualPos.y,
        angle: spawnPos.angle,
        angleDeg: spawnPos.angleDeg,
        progress: 0,
        statusEffects: [], // slow, freeze, burn, poison
        isDead: false,
        hasReachedBase: false,
        radius: zombieConfig.radius || 14,
        ...zombieConfig,
      };

      this.zombies.set(id, zombie);
      this.events.emit('zombie:spawned', zombie);
      this.events.emit('zombie_spawned', zombie);
      return zombie;
    }

    damageZombie(zombieId, rawDamage, damageType = 'physical', sourceTower = null) {
      const zombie = this.zombies.get(zombieId);
      if (!zombie || zombie.isDead) return null;

      // Armor calculation for physical
      let finalDamage = rawDamage;
      if (damageType === 'physical' && zombie.armor > 0) {
        finalDamage = rawDamage * (1 - Math.min(0.85, zombie.armor));
      }
      finalDamage = Math.max(1, Math.round(finalDamage));

      zombie.hp -= finalDamage;
      this.state.stats.damageDealt += finalDamage;
      if (sourceTower) {
        sourceTower.totalDamage = (sourceTower.totalDamage || 0) + finalDamage;
      }

      this.events.emit('zombie:damaged', {
        zombie,
        damage: finalDamage,
        damageType,
        sourceTower,
      });
      this.events.emit('zombie_damaged', {
        zombie,
        damage: finalDamage,
        damageType,
        sourceTower,
      });

      // Floating damage combat text
      this.addFloatingText(`-${finalDamage}`, zombie.x, zombie.y - 12, {
        color: damageType === 'crit' ? '#ff3344' : '#ffffff',
        size: damageType === 'crit' ? 14 : 11,
        duration: 0.65,
      });

      if (zombie.hp <= 0) {
        this.killZombie(zombieId, sourceTower);
      }

      return finalDamage;
    }

    killZombie(zombieId, killerTower = null) {
      const zombie = this.zombies.get(zombieId);
      if (!zombie || zombie.isDead) return;

      zombie.isDead = true;
      zombie.hp = 0;
      this.state.stats.zombiesKilled++;

      if (killerTower) {
        killerTower.kills = (killerTower.kills || 0) + 1;
      }

      if (zombie.goldBounty > 0) {
        this.state.addGold(zombie.goldBounty);
        this.addFloatingText(`+${zombie.goldBounty} G`, zombie.x, zombie.y - 24, {
          color: '#ffd700',
          size: 12,
          duration: 0.8,
        });
      }

      if (zombie.scoreValue > 0) {
        this.state.addScore(zombie.scoreValue);
      }

      // Spawn blood and gore particles
      this.spawnBloodSplatter(zombie.x, zombie.y, 8);

      this.events.emit('zombie:killed', { zombie, killerTower });
      this.events.emit('zombie_killed', { zombie, killerTower });

      this.zombies.delete(zombieId);
    }

    zombieReachBase(zombieId) {
      const zombie = this.zombies.get(zombieId);
      if (!zombie || zombie.isDead || zombie.hasReachedBase) return;

      zombie.hasReachedBase = true;
      const damage = zombie.damage || 1;
      this.state.damageBase(damage);

      this.events.emit('zombie:reached_base', { zombie, damage });
      this.events.emit('zombie_reached_base', { zombie, damage });

      this.zombies.delete(zombieId);
    }

    getZombies() {
      return Array.from(this.zombies.values());
    }

    getZombie(id) {
      return this.zombies.get(id) || null;
    }

    getZombiesInRange(x, y, range) {
      const inRange = [];
      const rangeSq = range * range;
      for (const [, z] of this.zombies) {
        if (z.isDead || z.hasReachedBase) continue;
        const dSq = (z.x - x) * (z.x - x) + (z.y - y) * (z.y - y);
        if (dSq <= rangeSq) {
          inRange.push(z);
        }
      }
      return inRange;
    }

    /**
     * Targeting heuristic for towers
     * Supported strategies: 'first' | 'last' | 'strongest' | 'weakest' | 'closest'
     */
    getPriorityTarget(x, y, range, strategy = 'first') {
      const targets = this.getZombiesInRange(x, y, range);
      if (targets.length === 0) return null;

      switch (strategy) {
        case 'first':
          // Highest progress toward base
          return targets.reduce((best, z) => (z.distanceTraveled > best.distanceTraveled ? z : best), targets[0]);
        case 'last':
          // Lowest progress
          return targets.reduce((best, z) => (z.distanceTraveled < best.distanceTraveled ? z : best), targets[0]);
        case 'strongest':
          // Highest current HP
          return targets.reduce((best, z) => (z.hp > best.hp ? z : best), targets[0]);
        case 'weakest':
          // Lowest current HP
          return targets.reduce((best, z) => (z.hp < best.hp ? z : best), targets[0]);
        case 'closest':
          // Smallest Euclidean distance to tower
          return targets.reduce((best, z) => {
            const dZ = (z.x - x) * (z.x - x) + (z.y - y) * (z.y - y);
            const dBest = (best.x - x) * (best.x - x) + (best.y - y) * (best.y - y);
            return dZ < dBest ? z : best;
          }, targets[0]);
        default:
          return targets[0];
      }
    }

    /**
     * --- PROJECTILES ---
     */
    addProjectile(projConfig) {
      const proj = {
        id: projConfig.id || this.generateId('proj'),
        x: projConfig.x,
        y: projConfig.y,
        targetId: projConfig.targetId,
        targetX: projConfig.targetX,
        targetY: projConfig.targetY,
        speed: projConfig.speed || 450,
        damage: projConfig.damage || 20,
        damageType: projConfig.damageType || 'physical',
        splashRadius: projConfig.splashRadius || 0,
        sourceTower: projConfig.sourceTower || null,
        lifeTime: 0,
        maxLife: projConfig.maxLife || 3.0,
        color: projConfig.color || '#ffcc00',
        ...projConfig,
      };
      this.projectiles.add(proj);
      return proj;
    }

    removeProjectile(proj) {
      this.projectiles.delete(proj);
    }

    getProjectiles() {
      return Array.from(this.projectiles);
    }

    /**
     * --- PARTICLES & COMBAT TEXT FX ---
     */
    addParticle(particle) {
      this.particles.push({
        x: particle.x,
        y: particle.y,
        vx: particle.vx || (Math.random() - 0.5) * 80,
        vy: particle.vy || (Math.random() - 0.5) * 80,
        life: 0,
        maxLife: particle.maxLife || 0.5,
        radius: particle.radius || 3,
        color: particle.color || '#ff2222',
        decay: particle.decay || true,
        ...particle,
      });
    }

    spawnBloodSplatter(x, y, count = 10) {
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const spd = 30 + Math.random() * 90;
        this.addParticle({
          x,
          y,
          vx: Math.cos(angle) * spd,
          vy: Math.sin(angle) * spd,
          radius: 2 + Math.random() * 3,
          maxLife: 0.35 + Math.random() * 0.4,
          color: Math.random() > 0.3 ? '#880000' : '#bb1111',
        });
      }
    }

    spawnExplosion(x, y, radius = 30) {
      for (let i = 0; i < 18; i++) {
        const angle = Math.random() * Math.PI * 2;
        const spd = 40 + Math.random() * 120;
        this.addParticle({
          x,
          y,
          vx: Math.cos(angle) * spd,
          vy: Math.sin(angle) * spd,
          radius: 3 + Math.random() * 5,
          maxLife: 0.4 + Math.random() * 0.3,
          color: ['#ffdd00', '#ff6600', '#ff2200', '#555555'][Math.floor(Math.random() * 4)],
        });
      }
    }

    addFloatingText(text, x, y, options = {}) {
      this.floatingTexts.push({
        text: String(text),
        x,
        y,
        vy: options.vy || -35,
        life: 0,
        maxLife: options.duration || 0.7,
        color: options.color || '#ffffff',
        size: options.size || 12,
        font: options.font || 'bold 12px monospace',
      });
    }

    /**
     * ENTITY SIMULATION TICK
     */
    update(dt) {
      // 1. Update Zombies
      for (const [id, z] of this.zombies) {
        if (z.isDead) continue;

        // Apply status effects (e.g. slow)
        let speedMult = 1.0;
        for (let i = z.statusEffects.length - 1; i >= 0; i--) {
          const fx = z.statusEffects[i];
          fx.duration -= dt;
          if (fx.type === 'slow') speedMult = Math.min(speedMult, fx.amount || 0.5);
          if (fx.duration <= 0) z.statusEffects.splice(i, 1);
        }

        z.distanceTraveled += z.speed * speedMult * dt;

        if (z.distanceTraveled >= z.totalPathLength) {
          this.zombieReachBase(id);
        } else {
          const pathInfo = this.paths.getPositionAtDistance(z.pathId, z.distanceTraveled);
          const offsetPt = pathInfo.getOffsetPoint(z.laneOffset || 0);
          z.x = offsetPt.x;
          z.y = offsetPt.y;
          z.angle = pathInfo.angle;
          z.angleDeg = pathInfo.angleDeg;
          z.progress = pathInfo.progress;
        }
      }

      // 2. Update Projectiles
      for (const p of this.projectiles) {
        p.lifeTime += dt;
        if (p.lifeTime >= p.maxLife) {
          this.projectiles.delete(p);
          continue;
        }

        let targetPos = { x: p.targetX, y: p.targetY };
        if (p.targetId) {
          const z = this.zombies.get(p.targetId);
          if (z && !z.isDead) {
            targetPos = { x: z.x, y: z.y };
          }
        }

        const dx = targetPos.x - p.x;
        const dy = targetPos.y - p.y;
        const dist = Math.hypot(dx, dy);
        const moveDist = p.speed * dt;

        if (dist <= moveDist || dist < 8) {
          // Projectile Hit
          this.projectiles.delete(p);
          if (p.splashRadius > 0) {
            this.spawnExplosion(p.x, p.y, p.splashRadius);
            const splashTargets = this.getZombiesInRange(p.x, p.y, p.splashRadius);
            for (const sp of splashTargets) {
              this.damageZombie(sp.id, p.damage, p.damageType, p.sourceTower);
            }
          } else if (p.targetId) {
            this.damageZombie(p.targetId, p.damage, p.damageType, p.sourceTower);
          }
        } else {
          p.x += (dx / dist) * moveDist;
          p.y += (dy / dist) * moveDist;
        }
      }

      // 3. Update Particles
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const pt = this.particles[i];
        pt.life += dt;
        if (pt.life >= pt.maxLife) {
          this.particles.splice(i, 1);
        } else {
          pt.x += pt.vx * dt;
          pt.y += pt.vy * dt;
          pt.vy += 80 * dt; // slight gravity
        }
      }

      // 4. Update Floating Texts
      for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
        const ft = this.floatingTexts[i];
        ft.life += dt;
        if (ft.life >= ft.maxLife) {
          this.floatingTexts.splice(i, 1);
        } else {
          ft.y += ft.vy * dt;
        }
      }
    }

    /**
     * Default Entity Renderer (used if custom renderer layers are not supplied)
     */
    render(ctx) {
      if (!ctx) return;

      // 1. Render Tactical Tower Slots
      for (const slot of this.slots) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(slot.x, slot.y, slot.radius || 24, 0, Math.PI * 2);
        if (slot.occupiedBy) {
          ctx.fillStyle = 'rgba(70, 70, 70, 0.4)';
          ctx.strokeStyle = '#555555';
        } else {
          ctx.fillStyle = 'rgba(255, 215, 0, 0.18)';
          ctx.strokeStyle = '#ffd700';
        }
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }

      // 2. Render Towers
      for (const [, t] of this.towers) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(t.x, t.y, t.radius || 24, 0, Math.PI * 2);
        ctx.fillStyle = '#2b3a42';
        ctx.fill();
        ctx.strokeStyle = '#4f6d7a';
        ctx.lineWidth = 3;
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(t.name.slice(0, 8), t.x, t.y + 3);
        ctx.restore();
      }

      // 3. Render Zombies
      for (const [, z] of this.zombies) {
        if (z.isDead) continue;
        ctx.save();
        ctx.beginPath();
        ctx.arc(z.x, z.y, z.radius || 12, 0, Math.PI * 2);
        ctx.fillStyle = '#557a46';
        ctx.fill();
        ctx.strokeStyle = '#283618';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Directional eye indicator
        const eyeX = z.x + Math.cos(z.angle) * 6;
        const eyeY = z.y + Math.sin(z.angle) * 6;
        ctx.beginPath();
        ctx.arc(eyeX, eyeY, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = '#ff2222';
        ctx.fill();

        // Health Bar
        const barW = 22;
        const barH = 3.5;
        const barX = z.x - barW / 2;
        const barY = z.y - (z.radius || 12) - 8;
        const hpPct = Math.max(0, Math.min(1, z.hp / z.maxHp));

        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);
        ctx.fillStyle = hpPct > 0.5 ? '#2ecc71' : hpPct > 0.25 ? '#f39c12' : '#e74c3c';
        ctx.fillRect(barX, barY, barW * hpPct, barH);
        ctx.restore();
      }

      // 4. Render Projectiles
      for (const p of this.projectiles) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = p.color || '#ffea00';
        ctx.fill();
        ctx.restore();
      }

      // 5. Render Particles
      for (const pt of this.particles) {
        ctx.save();
        const alpha = Math.max(0, 1 - pt.life / pt.maxLife);
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.radius || 2.5, 0, Math.PI * 2);
        ctx.fillStyle = pt.color;
        ctx.fill();
        ctx.restore();
      }

      // 6. Render Floating Texts
      for (const ft of this.floatingTexts) {
        ctx.save();
        const alpha = Math.max(0, 1 - ft.life / ft.maxLife);
        ctx.globalAlpha = alpha;
        ctx.font = ft.font;
        ctx.textAlign = 'center';
        ctx.fillStyle = ft.color;
        ctx.shadowColor = '#000000';
        ctx.shadowBlur = 3;
        ctx.fillText(ft.text, ft.x, ft.y);
        ctx.restore();
      }
    }
  }

  /**
   * ============================================================================
   * 5. GAME CLOCK & TIMESTEP ACCUMULATOR
   * requestAnimationFrame loop with deterministic fixed-timestep updates (dt).
   * Supports 1x, 2x, 4x speed and smooth rendering interpolation.
   * ============================================================================
   */
  class GameClock {
    constructor(engine) {
      this.engine = engine;
      this.fixedDt = ENGINE_CONFIG.FIXED_TIMESTEP;
      this.maxAccumulator = ENGINE_CONFIG.MAX_ACCUMULATOR;

      this.accumulator = 0;
      this.lastTimestamp = 0;
      this.rafId = null;
      this.isRunning = false;

      // Telemetry
      this.fps = 60;
      this.frameCount = 0;
      this.gameTime = 0;
      this.realTime = 0;
      this._fpsFrameCounter = 0;
      this._fpsLastCalcTime = 0;
    }

    start() {
      if (this.isRunning) return;
      this.isRunning = true;
      this.lastTimestamp = perf.now();
      this._fpsLastCalcTime = this.lastTimestamp;
      this.accumulator = 0;

      const loop = (timestamp) => {
        if (!this.isRunning) return;
        this.stepFrame(timestamp);
        if (isBrowser && window.requestAnimationFrame) {
          this.rafId = window.requestAnimationFrame(loop);
        }
      };

      if (isBrowser && window.requestAnimationFrame) {
        this.rafId = window.requestAnimationFrame(loop);
      }
    }

    stop() {
      this.isRunning = false;
      if (this.rafId && isBrowser && window.cancelAnimationFrame) {
        window.cancelAnimationFrame(this.rafId);
        this.rafId = null;
      }
    }

    stepFrame(timestamp) {
      const now = timestamp || perf.now();
      let frameRealTime = (now - this.lastTimestamp) / 1000;
      this.lastTimestamp = now;

      // Avoid spiral of death when browser tab is backgrounded
      if (frameRealTime > this.maxAccumulator) {
        frameRealTime = this.maxAccumulator;
      }

      this.realTime += frameRealTime;
      this.frameCount++;
      this._fpsFrameCounter++;

      // FPS Calculation (updated every 500ms)
      if (now - this._fpsLastCalcTime >= 500) {
        this.fps = Math.round((this._fpsFrameCounter * 1000) / (now - this._fpsLastCalcTime));
        this._fpsFrameCounter = 0;
        this._fpsLastCalcTime = now;
      }

      if (!this.lastTimestamp) {
        this.lastTimestamp = now;
        return;
      }

      const state = this.engine.state;
      const isPaused = state.isPaused || state.status === 'paused';

      if (!isPaused && (state.status === 'running' || state.status === 'ready')) {
        // Scaled timestep logic
        const scaledDelta = frameRealTime * state.speed;
        this.accumulator += scaledDelta;

        while (this.accumulator >= this.fixedDt) {
          this.engine.update(this.fixedDt);
          this.accumulator -= this.fixedDt;
          this.gameTime += this.fixedDt;
          state.stats.gameDuration += this.fixedDt;
        }
      }

      // Smooth render interpolation factor (0.0 <= alpha <= 1.0)
      const alpha = isPaused ? 1.0 : this.accumulator / this.fixedDt;
      this.engine.render(alpha);
    }

    /**
     * Single-step logic for developer debugging while paused
     */
    stepSingle(dt = this.fixedDt) {
      this.engine.update(dt);
      this.gameTime += dt;
      this.engine.render(1.0);
    }
  }

  /**
   * ============================================================================
   * 6. CORE GAME ENGINE (WINDOW.GAMEENGINE)
   * Main engine orchestrator integrating State, Paths, Entities, Clock, Events.
   * ============================================================================
   */
  class GameEngine {
    constructor(options = {}) {
      this.options = options;
      this.width = ENGINE_CONFIG.CANVAS_WIDTH;
      this.height = ENGINE_CONFIG.CANVAS_HEIGHT;

      // Core Subsystems
      this.events = new EventBus();
      this.paths = new PathSystem(options.paths);
      this.state = new GameState(this.events, options.state);
      this.entities = new EntityManager(this);
      this.clock = new GameClock(this);

      // Rendering Pipeline & Modular Systems
      this.canvas = null;
      this.ctx = null;
      this.dpr = 1;
      this.debugMode = Boolean(options.debug);

      // External systems map and custom layer callbacks
      this.systems = new Map();
      this.updateHooks = new Set();
      this.renderLayers = {
        background: [],
        paths: [],
        slots: [],
        towers: [],
        zombies: [],
        projectiles: [],
        particles: [],
        floatingText: [],
        ui: [],
        debug: [],
      };

      // Expose config for external systems
      this.CONFIG = ENGINE_CONFIG;
    }

    /**
     * Bind canvas and initialize coordinate system
     */
    init(canvasOrId, options = {}) {
      if (isBrowser) {
        if (typeof canvasOrId === 'string') {
          this.canvas = document.getElementById(canvasOrId);
        } else if (canvasOrId instanceof HTMLCanvasElement) {
          this.canvas = canvasOrId;
        }

        if (this.canvas) {
          this.ctx = this.canvas.getContext('2d');
          this.setupCanvasDPR(options.useDPR !== false);
        }
      }

      if (options.state) {
        this.state.reset(options.state);
      }

      this.events.emit('engine:initialized', { engine: this });
      return this;
    }

    setupCanvasDPR(enableDPR = true) {
      if (!this.canvas || !this.ctx) return;
      this.dpr = enableDPR && window.devicePixelRatio ? window.devicePixelRatio : 1;

      this.canvas.width = this.width * this.dpr;
      this.canvas.height = this.height * this.dpr;
      this.canvas.style.aspectRatio = '16 / 9';

      this.ctx.scale(this.dpr, this.dpr);
    }

    /**
     * Screen (Mouse / Touch) to Game Coordinates (1280x720)
     */
    screenToGame(clientX, clientY) {
      if (!this.canvas) return { x: clientX, y: clientY };
      const rect = this.canvas.getBoundingClientRect();
      const scaleX = this.width / rect.width;
      const scaleY = this.height / rect.height;
      return {
        x: (clientX - rect.left) * scaleX,
        y: (clientY - rect.top) * scaleY,
      };
    }

    /**
     * Modular System Hooks
     */
    registerSystem(name, system) {
      if (!system) return this;
      this.systems.set(name, system);
      if (typeof system.init === 'function') {
        system.init(this);
      }
      return this;
    }

    getSystem(name) {
      return this.systems.get(name);
    }

    onUpdate(callback) {
      if (typeof callback === 'function') {
        this.updateHooks.add(callback);
      }
      return this;
    }

    offUpdate(callback) {
      this.updateHooks.delete(callback);
      return this;
    }

    onRender(layerName, callback) {
      if (this.renderLayers[layerName] && typeof callback === 'function') {
        this.renderLayers[layerName].push(callback);
      }
      return this;
    }

    /**
     * Shortcuts for Event System
     */
    on(event, handler) {
      this.events.on(event, handler);
      return this;
    }

    once(event, handler) {
      this.events.once(event, handler);
      return this;
    }

    off(event, handler) {
      this.events.off(event, handler);
      return this;
    }

    emit(event, data) {
      this.events.emit(event, data);
      return this;
    }

    /**
     * Clock Controls
     */
    start() {
      this.state.status = 'running';
      this.clock.start();
      this.events.emit('game:started');
      return this;
    }

    pause() {
      this.state.pause();
      return this;
    }

    resume() {
      this.state.resume();
      return this;
    }

    togglePause() {
      return this.state.togglePause();
    }

    setSpeed(speed) {
      return this.state.setSpeed(speed);
    }

    toggleSpeed() {
      return this.state.toggleSpeed();
    }

    step(dt) {
      this.clock.stepSingle(dt);
      return this;
    }

    toggleDebug() {
      this.debugMode = !this.debugMode;
      return this.debugMode;
    }

    reset(initialState = {}) {
      this.entities.clear();
      this.state.reset(initialState);
      for (const [, sys] of this.systems) {
        if (typeof sys.reset === 'function') sys.reset();
      }
      this.events.emit('game:reset');
      return this;
    }

    /**
     * Main Logic Update (Fixed Timestep dt = 1/60s)
     */
    update(dt) {
      // 1. Core Entity updates
      this.entities.update(dt);

      // 2. Registered System updates
      for (const [, system] of this.systems) {
        if (typeof system.update === 'function') {
          system.update(dt, this);
        }
      }

      // 3. Custom update hooks
      for (const hook of this.updateHooks) {
        try {
          hook(dt, this);
        } catch (e) {
          console.error('[GameEngine] Error in update hook:', e);
        }
      }

      this.events.emit('tick', { dt, gameTime: this.clock.gameTime });
    }

    /**
     * Main Render Loop (Interpolation factor alpha)
     */
    render(alpha) {
      const ctx = this.ctx;
      if (!ctx) return;

      // Clear viewport
      ctx.clearRect(0, 0, this.width, this.height);

      // Render Pipeline Layers
      this._runLayerCallbacks('background', ctx, alpha);

      // Paths layer
      if (this.renderLayers.paths.length > 0) {
        this._runLayerCallbacks('paths', ctx, alpha);
      } else if (this.debugMode) {
        this.paths.renderDebug(ctx);
      }

      // Slots layer
      this._runLayerCallbacks('slots', ctx, alpha);

      // Towers layer
      if (this.renderLayers.towers.length > 0) {
        this._runLayerCallbacks('towers', ctx, alpha);
      }

      // Zombies layer
      if (this.renderLayers.zombies.length > 0) {
        this._runLayerCallbacks('zombies', ctx, alpha);
      }

      // Projectiles layer
      if (this.renderLayers.projectiles.length > 0) {
        this._runLayerCallbacks('projectiles', ctx, alpha);
      }

      // Particles layer
      if (this.renderLayers.particles.length > 0) {
        this._runLayerCallbacks('particles', ctx, alpha);
      }

      // Floating text layer
      if (this.renderLayers.floatingText.length > 0) {
        this._runLayerCallbacks('floatingText', ctx, alpha);
      }

      // If no custom entity renderers were attached, run default fallback entity render
      if (
        this.renderLayers.towers.length === 0 &&
        this.renderLayers.zombies.length === 0 &&
        this.renderLayers.projectiles.length === 0
      ) {
        this.entities.render(ctx);
      }

      // Registered external system renders
      for (const [, system] of this.systems) {
        if (typeof system.render === 'function') {
          system.render(ctx, alpha, this);
        }
      }

      // UI Layer
      this._runLayerCallbacks('ui', ctx, alpha);

      // Debug Overlays
      if (this.debugMode) {
        this.paths.renderDebug(ctx);
        this._renderDebugOverlay(ctx);
        this._runLayerCallbacks('debug', ctx, alpha);
      }
    }

    _runLayerCallbacks(layerName, ctx, alpha) {
      const list = this.renderLayers[layerName];
      if (!list || list.length === 0) return;
      for (let i = 0; i < list.length; i++) {
        try {
          list[i](ctx, alpha, this);
        } catch (e) {
          console.error(`[GameEngine] Error in layer '${layerName}':`, e);
        }
      }
    }

    _renderDebugOverlay(ctx) {
      ctx.save();
      ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
      ctx.fillRect(10, 10, 260, 120);

      ctx.fillStyle = '#00ffcc';
      ctx.font = '12px monospace';
      ctx.fillText(`FPS: ${this.clock.fps} | Speed: ${this.state.speed}x`, 18, 30);
      ctx.fillText(`Gold: ${this.state.gold} | Energy: ${this.state.energy}/${this.state.maxEnergy}`, 18, 48);
      ctx.fillText(`Score: ${this.state.score} | Wave: ${this.state.wave}/${this.state.maxWaves}`, 18, 66);
      ctx.fillText(`Base HP: ${this.state.baseHp}/${this.state.maxBaseHp} | Status: ${this.state.status}`, 18, 84);
      ctx.fillText(`Towers: ${this.entities.towers.size} | Zombies: ${this.entities.zombies.size}`, 18, 102);
      ctx.fillText(`Projectiles: ${this.entities.projectiles.size} | FX: ${this.entities.particles.length}`, 18, 120);
      ctx.restore();
    }
  }

  // Create default singleton instance
  const defaultEngine = new GameEngine();

  // Export to Global Browser Scope
  if (isBrowser) {
    global.GameEngine = defaultEngine;
    global.Engine = GameEngine;
    global.GameState = GameState;
    global.PathSystem = PathSystem;
    global.SplinePath = SplinePath;
    global.EntityManager = EntityManager;
    global.EventBus = EventBus;
    global.STRATEGIC_TOWER_SLOTS = STRATEGIC_TOWER_SLOTS;
    global.DEFAULT_CONTROL_POINTS = DEFAULT_CONTROL_POINTS;
  }

  // Export for Node.js / CommonJS
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      GameEngine: defaultEngine,
      Engine: GameEngine,
      GameState,
      PathSystem,
      SplinePath,
      EntityManager,
      GameClock,
      EventBus,
      STRATEGIC_TOWER_SLOTS,
      DEFAULT_CONTROL_POINTS,
      ENGINE_CONFIG,
    };
  }

})(typeof window !== 'undefined' ? window : globalThis);
