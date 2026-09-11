/**
 * ZOMBIE TOWER DEFENSE - Zombie Horde and AI Systems
 * File: /content/zombie_tower_defense/js/zombies.js
 * 
 * Features:
 * 1. Diverse Zombie Classes:
 *    - Walker: Standard green pixel zombie, balanced HP and speed
 *    - Sprinter: Fast agile red-shirted runner zombie
 *    - Armored Zombie: Wearing riot armor / helmet, 50% physical resistance
 *    - Bloater: Swollen toxic zombie that explodes into acidic gore upon death
 *    - Crawler: Severed torso crawling rapidly along pavement, low profile
 *    - Mutant Tank: Massive apocalyptic behemoth boss with colossal HP bar
 * 
 * 2. Dual-Entry Spawner:
 *    - Spawns waves dynamically from 'Entry A' (top gate) and 'Entry B' (bottom gate)
 *    - 40 progressive wave definitions with scalable HP and rewards
 *    - Wave 24 preset matching the screenshot ("WAVE 24/40, ZOMBIES: 450")
 * 
 * 3. Swarming Mechanics:
 *    - Path following with lateral offset distribution and organic swarming
 *    - Procedural pixel-art animated walk cycles with directional flipping
 *    - Status effects: Burning (DoT + embers), Shocked (slow + blue arcs), Slowed (frost/goo)
 *    - Health bar rendering & floating combat damage numbers
 *    - Death handling: Gold & Energy bounty awards, score increase, FX triggers
 */

(function (root, factory) {
  const mod = factory();
  if (typeof define === 'function' && define.amd) {
    define([], () => mod);
  }
  if (typeof module === 'object' && module.exports) {
    module.exports = mod;
  }
  root.ZombiesModule = mod;
  root.ZombieManager = mod.ZombieManager;
  root.WaveManager = mod.WaveManager;
  if (typeof window !== 'undefined') {
    window.ZombiesModule = mod;
    window.ZombieManager = mod.ZombieManager;
    window.WaveManager = mod.WaveManager;
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ============================================================================
  // CONSTANTS & DEFAULT PATH WAYPOINTS (Matching Reference Screenshot)
  // ============================================================================

  // Default coordinate system reference: 1280 x 720 (scales dynamically with canvas)
  const REF_WIDTH = 1280;
  const REF_HEIGHT = 720;

  /**
   * Dual road waypoints based on the game map layout:
   * - Entry A (Top-left gate arch): curves east past ruins, joins central road
   * - Entry B (Bottom-left gate arch): curves east past abandoned tank, joins central road
   * - Central Merge: Winding S-curve through killzone toward Survivor Base (top right)
   */
  const DEFAULT_WAYPOINTS_ENTRY_A = [
    { x: 130, y: 170 }, // Entry A gate arch
    { x: 220, y: 175 },
    { x: 320, y: 195 },
    { x: 375, y: 240 },
    { x: 365, y: 340 },
    { x: 380, y: 435 },
    { x: 440, y: 490 }, // Junction merge
    { x: 460, y: 430 }, // Heading up central spine
    { x: 450, y: 310 },
    { x: 455, y: 215 },
    { x: 530, y: 165 }, // Top curve around upper bunker
    { x: 625, y: 175 },
    { x: 690, y: 235 }, // Downhill into Tesla/Mortar killzone
    { x: 710, y: 325 },
    { x: 720, y: 420 }, // Sandbag corner
    { x: 795, y: 455 },
    { x: 900, y: 425 }, // Approaching survivor fortress gate
    { x: 1010, y: 380 },
    { x: 1090, y: 360 }  // Breach Base Target
  ];

  const DEFAULT_WAYPOINTS_ENTRY_B = [
    { x: 125, y: 455 }, // Entry B gate arch
    { x: 205, y: 465 },
    { x: 275, y: 480 }, // Past abandoned tank
    { x: 345, y: 515 },
    { x: 420, y: 515 },
    { x: 440, y: 490 }, // Junction merge
    { x: 460, y: 430 },
    { x: 450, y: 310 },
    { x: 455, y: 215 },
    { x: 530, y: 165 },
    { x: 625, y: 175 },
    { x: 690, y: 235 },
    { x: 710, y: 325 },
    { x: 720, y: 420 },
    { x: 795, y: 455 },
    { x: 900, y: 425 },
    { x: 1010, y: 380 },
    { x: 1090, y: 360 }
  ];

  // Helper utility: Path pre-processing for O(1) parametric distance traversal
  function processPathWaypoints(waypoints) {
    const segments = [];
    let totalLength = 0;

    for (let i = 0; i < waypoints.length - 1; i++) {
      const p1 = waypoints[i];
      const p2 = waypoints[i + 1];
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const length = Math.hypot(dx, dy);

      // Normal vector perpendicular to the segment (for lateral swarming offset)
      const nx = length > 0.001 ? -dy / length : 0;
      const ny = length > 0.001 ? dx / length : 0;

      segments.push({
        p1,
        p2,
        dx,
        dy,
        nx,
        ny,
        length,
        startDistance: totalLength,
        endDistance: totalLength + length
      });
      totalLength += length;
    }

    return { waypoints, segments, totalLength };
  }

  // Pre-processed default paths
  let processedPathA = processPathWaypoints(DEFAULT_WAYPOINTS_ENTRY_A);
  let processedPathB = processPathWaypoints(DEFAULT_WAYPOINTS_ENTRY_B);

  // ============================================================================
  // FLOATING COMBAT TEXT & DAMAGE NUMBERS
  // Matches the screenshot: "336", "250", "43", "80", "182", "33", "472", "363"
  // ============================================================================

  class DamageNumber {
    constructor() {
      this.active = false;
      this.x = 0;
      this.y = 0;
      this.text = '';
      this.color = '#ffffff';
      this.strokeColor = '#000000';
      this.fontSize = 14;
      this.life = 0;
      this.maxLife = 0.75;
      this.vy = -35;
      this.vx = 0;
      this.isCrit = false;
    }

    init(x, y, amount, type = 'physical', isCrit = false) {
      this.active = true;
      this.x = x + (Math.random() - 0.5) * 16;
      this.y = y - 10 + (Math.random() - 0.5) * 8;
      this.text = typeof amount === 'number' ? Math.round(amount).toString() : String(amount);
      this.life = 0;
      this.maxLife = isCrit ? 0.95 : 0.70;
      this.vy = isCrit ? -55 : -40;
      this.vx = (Math.random() - 0.5) * 20;
      this.isCrit = isCrit;

      // Type-specific colors matching screenshot visual style
      if (isCrit) {
        this.color = '#ff1744';
        this.fontSize = 19;
      } else {
        switch (type) {
          case 'fire':
          case 'burn':
            this.color = '#ff6d00';
            this.fontSize = 14;
            break;
          case 'shock':
          case 'electric':
            this.color = '#00e5ff';
            this.fontSize = 15;
            break;
          case 'acid':
          case 'toxic':
            this.color = '#76ff03';
            this.fontSize = 14;
            break;
          case 'explosive':
            this.color = '#ffd600';
            this.fontSize = 16;
            break;
          case 'bullet':
          case 'physical':
          default:
            this.color = Math.random() > 0.4 ? '#ff5252' : '#ff9100';
            this.fontSize = 14;
            break;
        }
      }
    }

    update(dt) {
      if (!this.active) return;
      this.life += dt;
      if (this.life >= this.maxLife) {
        this.active = false;
        return;
      }
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.vy += 45 * dt; // slight downward drag
    }

    draw(ctx) {
      if (!this.active) return;
      const progress = this.life / this.maxLife;
      const alpha = progress < 0.2 ? progress / 0.2 : Math.max(0, 1 - (progress - 0.5) / 0.5);

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = `bold ${this.fontSize}px 'Courier New', monospace, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Outline
      ctx.strokeStyle = this.strokeColor;
      ctx.lineWidth = this.isCrit ? 4 : 3;
      ctx.strokeText(this.text, this.x, this.y);

      // Fill
      ctx.fillStyle = this.color;
      ctx.fillText(this.text, this.x, this.y);
      ctx.restore();
    }
  }

  // Fast object pool for damage numbers
  class DamageNumberPool {
    constructor(maxSize = 250) {
      this.pool = Array.from({ length: maxSize }, () => new DamageNumber());
      this.currentIndex = 0;
    }

    spawn(x, y, amount, type = 'physical', isCrit = false) {
      const item = this.pool[this.currentIndex];
      item.init(x, y, amount, type, isCrit);
      this.currentIndex = (this.currentIndex + 1) % this.pool.length;
      return item;
    }

    update(dt) {
      for (let i = 0; i < this.pool.length; i++) {
        if (this.pool[i].active) {
          this.pool[i].update(dt);
        }
      }
    }

    draw(ctx) {
      for (let i = 0; i < this.pool.length; i++) {
        if (this.pool[i].active) {
          this.pool[i].draw(ctx);
        }
      }
    }

    clear() {
      for (let i = 0; i < this.pool.length; i++) {
        this.pool[i].active = false;
      }
    }
  }

  // ============================================================================
  // PARTICLES SYSTEM (Blood Gore, Fire Embers, Shock Sparks, Toxic Acid Puddles)
  // ============================================================================

  class GoreParticle {
    constructor() {
      this.active = false;
      this.x = 0;
      this.y = 0;
      this.vx = 0;
      this.vy = 0;
      this.size = 2;
      this.color = '#8b0000';
      this.life = 0;
      this.maxLife = 0.5;
      this.gravity = 140;
      this.type = 'blood'; // blood, ember, spark, acid
    }

    init(x, y, vx, vy, size, color, maxLife, gravity = 140, type = 'blood') {
      this.active = true;
      this.x = x;
      this.y = y;
      this.vx = vx;
      this.vy = vy;
      this.size = size;
      this.color = color;
      this.life = 0;
      this.maxLife = maxLife;
      this.gravity = gravity;
      this.type = type;
    }

    update(dt) {
      if (!this.active) return;
      this.life += dt;
      if (this.life >= this.maxLife) {
        this.active = false;
        return;
      }
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.vy += this.gravity * dt;
    }

    draw(ctx) {
      if (!this.active) return;
      const progress = this.life / this.maxLife;
      const alpha = Math.max(0, 1 - progress);

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = this.color;

      if (this.type === 'spark') {
        // Sharp spark line
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(this.x, this.y);
        ctx.lineTo(this.x - this.vx * 0.04, this.y - this.vy * 0.04);
        ctx.stroke();
      } else {
        // Pixel rect
        ctx.fillRect(Math.floor(this.x - this.size / 2), Math.floor(this.y - this.size / 2), this.size, this.size);
      }
      ctx.restore();
    }
  }

  class ParticlePool {
    constructor(maxSize = 400) {
      this.pool = Array.from({ length: maxSize }, () => new GoreParticle());
      this.currentIndex = 0;
    }

    spawn(x, y, vx, vy, size, color, maxLife, gravity = 140, type = 'blood') {
      const p = this.pool[this.currentIndex];
      p.init(x, y, vx, vy, size, color, maxLife, gravity, type);
      this.currentIndex = (this.currentIndex + 1) % this.pool.length;
      return p;
    }

    spawnBloodBurst(x, y, count = 12, isHuge = false) {
      const colors = ['#8b0000', '#a10000', '#540000', '#b31b1b', '#3b0000'];
      const actualCount = isHuge ? count * 2.5 : count;
      for (let i = 0; i < actualCount; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 30 + Math.random() * (isHuge ? 160 : 90);
        const vx = Math.cos(angle) * speed;
        const vy = Math.sin(angle) * speed - (isHuge ? 60 : 30);
        const size = isHuge ? 3 + Math.floor(Math.random() * 4) : 2 + Math.floor(Math.random() * 3);
        const color = colors[Math.floor(Math.random() * colors.length)];
        const maxLife = 0.4 + Math.random() * 0.6;
        this.spawn(x, y, vx, vy, size, color, maxLife, 160, 'blood');
      }
    }

    spawnToxicExplosion(x, y, radius = 70) {
      // Bloater death toxic blast
      const colors = ['#76ff03', '#64dd17', '#aeea00', '#2e7d32', '#00e676', '#880e4f'];
      for (let i = 0; i < 40; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 40 + Math.random() * 150;
        const vx = Math.cos(angle) * speed;
        const vy = Math.sin(angle) * speed - 50;
        const size = 3 + Math.floor(Math.random() * 5);
        const color = colors[Math.floor(Math.random() * colors.length)];
        const maxLife = 0.6 + Math.random() * 0.8;
        this.spawn(x, y, vx, vy, size, color, maxLife, 120, 'acid');
      }
    }

    spawnEmbers(x, y, count = 3) {
      const colors = ['#ff3d00', '#ff9100', '#ffea00'];
      for (let i = 0; i < count; i++) {
        const vx = (Math.random() - 0.5) * 30;
        const vy = -30 - Math.random() * 40;
        const size = 2 + Math.random() * 2;
        const color = colors[Math.floor(Math.random() * colors.length)];
        this.spawn(x + (Math.random() - 0.5) * 14, y + (Math.random() - 0.5) * 10, vx, vy, size, color, 0.4 + Math.random() * 0.3, -20, 'ember');
      }
    }

    spawnSparks(x, y, count = 3) {
      const colors = ['#00e5ff', '#ffffff', '#80d8ff'];
      for (let i = 0; i < count; i++) {
        const vx = (Math.random() - 0.5) * 90;
        const vy = (Math.random() - 0.5) * 90;
        const color = colors[Math.floor(Math.random() * colors.length)];
        this.spawn(x + (Math.random() - 0.5) * 12, y + (Math.random() - 0.5) * 12, vx, vy, 2, color, 0.2 + Math.random() * 0.2, 0, 'spark');
      }
    }

    update(dt) {
      for (let i = 0; i < this.pool.length; i++) {
        if (this.pool[i].active) {
          this.pool[i].update(dt);
        }
      }
    }

    draw(ctx) {
      for (let i = 0; i < this.pool.length; i++) {
        if (this.pool[i].active) {
          this.pool[i].draw(ctx);
        }
      }
    }

    clear() {
      for (let i = 0; i < this.pool.length; i++) {
        this.pool[i].active = false;
      }
    }
  }

  // ============================================================================
  // BASE ZOMBIE CLASS
  // ============================================================================

  let nextZombieId = 1;

  class BaseZombie {
    constructor(config = {}) {
      this.id = nextZombieId++;
      this.type = config.type || 'walker';
      this.name = config.name || 'Zombie';

      // Entry path config: 'A' or 'B'
      this.entry = config.entry || 'A';
      this.pathData = this.entry === 'B' ? processedPathB : processedPathA;

      // Path navigation variables
      this.distanceTraveled = 0;
      this.currentSegmentIndex = 0;
      this.x = 0;
      this.y = 0;
      this.prevX = 0;
      this.prevY = 0;
      this.facingRight = true;
      this.reachedEnd = false;
      this.active = true;

      // Swarming mechanics: Perpendicular road lateral offset
      // Gives the impression of a dense surging crowd rather than single file
      const maxOffset = config.maxLaneOffset !== undefined ? config.maxLaneOffset : 22;
      this.laneOffset = (Math.random() * 2 - 1) * maxOffset;
      this.wobbleSpeed = 1.6 + Math.random() * 1.8;
      this.wobblePhase = Math.random() * Math.PI * 2;
      this.wobbleAmount = 2.5 + Math.random() * 2.5;

      // Base Attributes (will be overridden by subclasses)
      this.maxHp = config.maxHp || 100;
      this.hp = this.maxHp;
      this.baseSpeed = config.baseSpeed || 48;
      // Slight speed jitter (+- 8%) so zombies don't move in lockstep
      this.speed = this.baseSpeed * (0.92 + Math.random() * 0.16);
      this.currentSpeed = this.speed;

      this.hitboxRadius = config.hitboxRadius || 14;
      this.physicalDefense = config.physicalDefense || 0; // % physical damage reduction (0 to 1)
      this.dodgeChance = config.dodgeChance || 0; // % chance to evade projectiles

      // Economy bounties
      this.bountyGold = config.bountyGold || 10;
      this.bountyEnergy = config.bountyEnergy || 1;
      this.scoreValue = config.scoreValue || 50;

      // Boss / elite flag
      this.isBoss = !!config.isBoss;

      // Status Effects
      this.burnTimer = 0;
      this.burnDps = 0;
      this.shockTimer = 0;
      this.shockSlow = 0;
      this.slowTimer = 0;
      this.slowFactor = 0;

      // Visual / Animation states
      this.animTime = Math.random() * 10;
      this.stepFrequency = config.stepFrequency || 5.0;
      this.hitFlashTimer = 0;
      this.lastHitType = 'physical';
      this.defaultMaxHp = this.maxHp;
      this.maxLaneOffset = maxOffset;

      // Initialize position at path start
      this.updatePosition();
    }

    /**
     * Reinitialize entity state when retrieved from the ZombiePool
     */
    reset(config = {}) {
      this.entry = config.entry || 'A';
      this.pathData = this.entry === 'B' ? processedPathB : processedPathA;
      this.distanceTraveled = 0;
      this.currentSegmentIndex = 0;
      this.x = 0;
      this.y = 0;
      this.prevX = 0;
      this.prevY = 0;
      this.facingRight = true;
      this.reachedEnd = false;
      this.active = true;

      const maxOffset = config.maxLaneOffset !== undefined ? config.maxLaneOffset : (this.maxLaneOffset || 22);
      this.laneOffset = (Math.random() * 2 - 1) * maxOffset;
      this.wobbleSpeed = 1.6 + Math.random() * 1.8;
      this.wobblePhase = Math.random() * Math.PI * 2;
      this.wobbleAmount = 2.5 + Math.random() * 2.5;

      this.maxHp = config.maxHp || this.defaultMaxHp || 100;
      this.hp = this.maxHp;
      this.speed = this.baseSpeed * (0.92 + Math.random() * 0.16);
      this.currentSpeed = this.speed;

      this.burnTimer = 0;
      this.burnDps = 0;
      this.shockTimer = 0;
      this.shockSlow = 0;
      this.slowTimer = 0;
      this.slowFactor = 0;
      this.hitFlashTimer = 0;
      this.lastHitType = 'physical';
      this.animTime = Math.random() * 10;

      this.updatePosition();
      return this;
    }

    /**
     * Compute current world (x, y) along the polyline path with lateral swarm offset
     */
    updatePosition() {
      const segments = this.pathData.segments;
      const totalLen = this.pathData.totalLength;

      if (this.distanceTraveled >= totalLen) {
        this.reachedEnd = true;
        const lastPt = this.pathData.waypoints[this.pathData.waypoints.length - 1];
        this.x = lastPt.x;
        this.y = lastPt.y;
        return;
      }

      // Find active segment
      let seg = segments[this.currentSegmentIndex];
      while (seg && this.distanceTraveled > seg.endDistance && this.currentSegmentIndex < segments.length - 1) {
        this.currentSegmentIndex++;
        seg = segments[this.currentSegmentIndex];
      }

      if (!seg) {
        this.reachedEnd = true;
        return;
      }

      const segProgress = (this.distanceTraveled - seg.startDistance) / seg.length;
      const centerX = seg.p1.x + seg.dx * segProgress;
      const centerY = seg.p1.y + seg.dy * segProgress;

      // Dynamic organic wobble
      const dynamicOffset = this.laneOffset + Math.sin(this.wobblePhase + this.animTime * this.wobbleSpeed) * this.wobbleAmount;

      // Offset along perpendicular normal
      const newX = centerX + seg.nx * dynamicOffset;
      const newY = centerY + seg.ny * dynamicOffset;

      // Determine facing direction
      if (Math.abs(newX - this.x) > 0.1) {
        this.facingRight = newX >= this.x;
      }

      this.prevX = this.x;
      this.prevY = this.y;
      this.x = newX;
      this.y = newY;
    }

    /**
     * Apply Status Effects (Burning, Shocked, Slowed)
     */
    applyBurn(dps, duration) {
      this.burnDps = Math.max(this.burnDps, dps);
      this.burnTimer = Math.max(this.burnTimer, duration);
    }

    applyShock(slowFactor = 0.5, duration = 2.0) {
      // Bosses have 50% CC resistance
      const effectiveDuration = this.isBoss ? duration * 0.5 : duration;
      this.shockSlow = slowFactor;
      this.shockTimer = Math.max(this.shockTimer, effectiveDuration);
    }

    applySlow(factor = 0.4, duration = 3.0) {
      const effectiveDuration = this.isBoss ? duration * 0.5 : duration;
      this.slowFactor = Math.max(this.slowFactor, factor);
      this.slowTimer = Math.max(this.slowTimer, effectiveDuration);
    }

    /**
     * Apply damage with defense calculations and damage numbers
     */
    takeDamage(amount, type = 'physical', source = null) {
      if (!this.active || this.hp <= 0) return 0;

      // Check evasion (e.g. agile Crawlers)
      if (this.dodgeChance > 0 && Math.random() < this.dodgeChance && type === 'physical') {
        if (ZombieManager.damageNumbers) {
          ZombieManager.damageNumbers.spawn(this.x, this.y - 12, 'MISS', 'physical');
        }
        return 0;
      }

      let finalDamage = amount;

      // Armored physical defense reduction
      if ((type === 'physical' || type === 'bullet') && this.physicalDefense > 0) {
        finalDamage = amount * (1 - this.physicalDefense);
      }

      finalDamage = Math.max(1, finalDamage);
      this.hp -= finalDamage;
      this.hitFlashTimer = 0.08; // Flash white briefly
      this.lastHitType = type;

      // Spawn floating combat damage text
      if (ZombieManager.damageNumbers) {
        const isCrit = (type === 'explosive' || (type === 'physical' && Math.random() < 0.12));
        ZombieManager.damageNumbers.spawn(this.x, this.y - 14, finalDamage, type, isCrit);
      }

      // Spark particles for armored hit
      if (this.physicalDefense > 0.3 && (type === 'physical' || type === 'bullet')) {
        ZombieManager.particles.spawnSparks(this.x, this.y - 6, 4);
      } else {
        // Standard blood droplets
        ZombieManager.particles.spawn(
          this.x,
          this.y - 6,
          (Math.random() - 0.5) * 50,
          (Math.random() - 0.5) * 50 - 20,
          2,
          '#8b0000',
          0.3
        );
      }

      if (this.hp <= 0) {
        this.die(source);
      }

      return finalDamage;
    }

    /**
     * Handle death: awards, particle bursts, engine notifications
     */
    die(killer = null) {
      if (!this.active) return;
      this.active = false;
      this.hp = 0;

      // Reward player resources & score
      ZombieManager.onZombieKilled(this, killer);

      // Spawn gory death particles
      ZombieManager.particles.spawnBloodBurst(this.x, this.y - 10, 16, this.isBoss);

      // Subclasses can implement extra death triggers (e.g., Bloater explosion)
      this.onDeathEffect();
    }

    onDeathEffect() {
      // Base has no extra death trigger; overridden by Bloater
    }

    /**
     * Main update tick
     */
    update(dt) {
      if (!this.active) return;

      this.animTime += dt;

      // Flash timer countdown
      if (this.hitFlashTimer > 0) {
        this.hitFlashTimer -= dt;
      }

      // Process Burn DoT
      if (this.burnTimer > 0) {
        this.burnTimer -= dt;
        const burnDamage = this.burnDps * dt;
        this.hp -= burnDamage;
        // Spawn ember particles
        if (Math.random() < 0.35) {
          ZombieManager.particles.spawnEmbers(this.x, this.y - 8, 2);
        }
        if (this.hp <= 0) {
          this.die('burn');
          return;
        }
      }

      // Process Shock
      let speedMult = 1.0;
      if (this.shockTimer > 0) {
        this.shockTimer -= dt;
        speedMult *= (1 - this.shockSlow);
        // Electric blue spark particles
        if (Math.random() < 0.3) {
          ZombieManager.particles.spawnSparks(this.x, this.y - 8, 2);
        }
      }

      // Process Slow
      if (this.slowTimer > 0) {
        this.slowTimer -= dt;
        speedMult *= (1 - this.slowFactor);
      }

      this.currentSpeed = this.speed * Math.max(0.15, speedMult);

      // Advance along path
      this.distanceTraveled += this.currentSpeed * dt;
      this.updatePosition();

      if (this.reachedEnd) {
        this.active = false;
        ZombieManager.onZombieReachedEnd(this);
      }
    }

    /**
     * Draw Health Bar above the zombie
     */
    drawHealthBar(ctx) {
      if (this.hp >= this.maxHp && !this.isBoss) return; // Hide full health bars on trash mobs

      const barWidth = this.isBoss ? 50 : 26;
      const barHeight = this.isBoss ? 6 : 4;
      const x = Math.floor(this.x - barWidth / 2);
      const y = Math.floor(this.y - this.hitboxRadius - (this.isBoss ? 26 : 14));

      const pct = Math.max(0, Math.min(1, this.hp / this.maxHp));

      ctx.save();
      // Background & border
      ctx.fillStyle = 'rgba(10, 10, 10, 0.85)';
      ctx.fillRect(x - 1, y - 1, barWidth + 2, barHeight + 2);

      // Color gradient: Green -> Yellow -> Red
      let barColor = '#4caf50';
      if (pct < 0.3) {
        barColor = '#f44336';
      } else if (pct < 0.6) {
        barColor = '#ffeb3b';
      }

      ctx.fillStyle = barColor;
      ctx.fillRect(x, y, Math.floor(barWidth * pct), barHeight);

      // Boss ornate name and skull
      if (this.isBoss) {
        ctx.font = 'bold 9px monospace';
        ctx.fillStyle = '#ff5252';
        ctx.textAlign = 'center';
        ctx.fillText('MUTANT BOSS', this.x, y - 4);
      }

      ctx.restore();
    }

    /**
     * Draw status effect overlays (Burning flames, Shocked blue arcs, Slowed frost)
     */
    drawStatusEffects(ctx) {
      ctx.save();

      // Burning visual tint / flames
      if (this.burnTimer > 0) {
        ctx.fillStyle = 'rgba(255, 87, 34, 0.28)';
        ctx.beginPath();
        ctx.arc(this.x, this.y - 10, this.hitboxRadius + 4, 0, Math.PI * 2);
        ctx.fill();
      }

      // Shocked visual electrical arcs
      if (this.shockTimer > 0) {
        ctx.strokeStyle = '#00e5ff';
        ctx.lineWidth = 1.5;
        const ox = (Math.random() - 0.5) * 12;
        const oy = (Math.random() - 0.5) * 16;
        ctx.beginPath();
        ctx.moveTo(this.x - 6, this.y - 14);
        ctx.lineTo(this.x + ox, this.y - 8 + oy);
        ctx.lineTo(this.x + 6, this.y - 2);
        ctx.stroke();
      }

      // Slowed icy frost tint
      if (this.slowTimer > 0) {
        ctx.fillStyle = 'rgba(38, 198, 218, 0.25)';
        ctx.beginPath();
        ctx.arc(this.x, this.y - 8, this.hitboxRadius + 3, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }

    /**
     * Shadow beneath feet
     */
    drawShadow(ctx, rx = 10, ry = 4) {
      ctx.save();
      ctx.fillStyle = 'rgba(15, 15, 15, 0.38)';
      ctx.beginPath();
      ctx.ellipse(this.x, this.y, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    /**
     * Render entry point: draws shadow, zombie sprite, status effects, and health bar
     */
    draw(ctx) {
      if (!this.active) return;

      this.drawShadow(ctx);

      ctx.save();
      ctx.translate(Math.floor(this.x), Math.floor(this.y));

      // Flip sprite based on movement direction
      if (!this.facingRight) {
        ctx.scale(-1, 1);
      }

      // White flash when hit
      if (this.hitFlashTimer > 0) {
        ctx.filter = 'brightness(2.2) saturate(0.2)';
      }

      this.drawPixelSprite(ctx);

      ctx.restore();

      this.drawStatusEffects(ctx);
      this.drawHealthBar(ctx);
    }

    /**
     * To be implemented by subclasses: renders custom pixel art matching screenshot
     */
    drawPixelSprite(ctx) {
      // Abstract
    }
  }

  // ============================================================================
  // 1. WALKER ZOMBIE (Standard green infected pixel zombie)
  // ============================================================================

  class WalkerZombie extends BaseZombie {
    constructor(config = {}) {
      super({
        ...config,
        type: 'walker',
        name: 'Walker',
        maxHp: config.maxHp || 110,
        baseSpeed: config.baseSpeed || 48,
        bountyGold: 10,
        bountyEnergy: 1,
        scoreValue: 50,
        hitboxRadius: 13,
        stepFrequency: 5.5
      });
      // Variants
      this.shirtColor = ['#4c5861', '#37474f', '#546e7a', '#795548', '#3e2723'][Math.floor(Math.random() * 5)];
      this.pantsColor = ['#423932', '#1b2a33', '#2c3e50', '#212121'][Math.floor(Math.random() * 4)];
      this.hasHair = Math.random() > 0.5;
      this.hairColor = ['#000', '#3e2723', '#212121', '#ff9800'][Math.floor(Math.random() * 4)];
    }

    drawPixelSprite(ctx) {
      const step = Math.sin(this.animTime * this.stepFrequency);
      const bob = Math.abs(Math.cos(this.animTime * this.stepFrequency)) * 2;

      // Legs (tattered pants)
      ctx.fillStyle = this.pantsColor; // variant pants
      ctx.fillRect(-5 - step * 2, -6, 4, 7);
      ctx.fillRect(2 + step * 2, -6, 4, 7);

      // Torso
      ctx.fillStyle = this.shirtColor; // variant shirt
      ctx.fillRect(-6, -16 - bob, 12, 11);

      // Decayed ribs/flesh exposed
      ctx.fillStyle = '#8b0000';
      ctx.fillRect(-2, -13 - bob, 4, 3);

      // Arms reaching forward with walk sway
      ctx.fillStyle = '#527949'; // Zombie green flesh
      ctx.fillRect(3, -15 - bob + step, 9, 4); // Outstretched right arm
      ctx.fillRect(-2, -14 - bob - step, 6, 4); // Trailing left arm

      // Head
      ctx.fillStyle = '#527949';
      ctx.fillRect(-5, -25 - bob, 10, 10);
      
      // Hair variant
      if (this.hasHair) {
        ctx.fillStyle = this.hairColor;
        ctx.fillRect(-5, -26 - bob, 10, 3);
        ctx.fillRect(-5, -26 - bob, 3, 5); // sideburns
      }

      // Sunken eyes (red glowing pinprick)
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(1, -22 - bob, 3, 3);
      ctx.fillStyle = '#ff1744';
      ctx.fillRect(2, -21 - bob, 2, 2);

      // Snarling mouth
      ctx.fillStyle = '#2b1b17';
      ctx.fillRect(0, -18 - bob, 5, 2);
    }
  }

  // ============================================================================
  // 2. SPRINTER / RUNNER ZOMBIE (Fast, agile red-shirted runner)
  // ============================================================================

  class SprinterZombie extends BaseZombie {
    constructor(config = {}) {
      super({
        ...config,
        type: 'sprinter',
        name: 'Sprinter',
        maxHp: config.maxHp || 68,
        baseSpeed: config.baseSpeed || 112,
        bountyGold: 14,
        bountyEnergy: 1,
        scoreValue: 75,
        hitboxRadius: 11,
        stepFrequency: 11.0,
        maxLaneOffset: 16
      });
      // Variants
      this.shirtColor = ['#c0392b', '#d35400', '#e74c3c', '#900c3f'][Math.floor(Math.random() * 4)];
      this.stripeColor = ['#ecf0f1', '#f1c40f', '#000'][Math.floor(Math.random() * 3)];
    }

    drawPixelSprite(ctx) {
      const runCycle = this.animTime * this.stepFrequency;
      const legSpread = Math.sin(runCycle) * 7;
      const bodyLean = 0.28; // Lean forward aggressively
      const bob = Math.abs(Math.sin(runCycle)) * 3;

      ctx.rotate(bodyLean);

      // Pumping legs
      ctx.fillStyle = '#263238';
      ctx.fillRect(-5 - legSpread, -6, 3, 8);
      ctx.fillRect(2 + legSpread, -6, 3, 8);

      // Athletic jersey variant
      ctx.fillStyle = this.shirtColor;
      ctx.fillRect(-6, -17 - bob, 11, 12);

      // Jersey stripes variant
      ctx.fillStyle = this.stripeColor;
      ctx.fillRect(-2, -17 - bob, 3, 12);

      // Pumping clawed arms
      ctx.fillStyle = '#5a8251';
      ctx.fillRect(3, -15 - bob - legSpread * 0.7, 8, 3);
      ctx.fillRect(-8, -13 - bob + legSpread * 0.7, 7, 3);

      // Agile head
      ctx.fillStyle = '#5a8251';
      ctx.fillRect(-3, -25 - bob, 9, 9);

      // Eyes glowing hungry red
      ctx.fillStyle = '#ff0055';
      ctx.fillRect(2, -22 - bob, 2, 2);

      // Bloody chin
      ctx.fillStyle = '#900c3f';
      ctx.fillRect(1, -18 - bob, 4, 2);
    }
  }

  // ============================================================================
  // 3. ARMORED ZOMBIE (Riot armor, helmet, 50% physical resistance)
  // ============================================================================

  class ArmoredZombie extends BaseZombie {
    constructor(config = {}) {
      super({
        ...config,
        type: 'armored',
        name: 'Armored Zombie',
        maxHp: config.maxHp || 260,
        baseSpeed: config.baseSpeed || 38,
        physicalDefense: 0.50, // 50% damage reduction from ballistic/physical
        bountyGold: 24,
        bountyEnergy: 2,
        scoreValue: 120,
        hitboxRadius: 15,
        stepFrequency: 4.2
      });
    }

    drawPixelSprite(ctx) {
      const step = Math.sin(this.animTime * this.stepFrequency);
      const bob = Math.abs(Math.cos(this.animTime * this.stepFrequency)) * 1.5;

      // Heavy combat boots & leg armor
      ctx.fillStyle = '#263238';
      ctx.fillRect(-6 - step * 2, -6, 5, 7);
      ctx.fillRect(2 + step * 2, -6, 5, 7);
      ctx.fillStyle = '#546e7a';
      ctx.fillRect(-5 - step * 2, -4, 3, 3); // Metal knee guard
      ctx.fillRect(3 + step * 2, -4, 3, 3);

      // Heavy Kevlar / Riot body armor vest
      ctx.fillStyle = '#37474f';
      ctx.fillRect(-8, -18 - bob, 15, 13);
      // Steel chest plating & rivets
      ctx.fillStyle = '#78909c';
      ctx.fillRect(-5, -16 - bob, 10, 8);
      ctx.fillStyle = '#b0bec5';
      ctx.fillRect(-4, -15 - bob, 2, 2); // Rivet
      ctx.fillRect(3, -15 - bob, 2, 2);

      // Armored shoulders & arms
      ctx.fillStyle = '#455a64';
      ctx.fillRect(4, -17 - bob + step, 8, 5); // Arm guard
      ctx.fillRect(-9, -17 - bob - step, 6, 5);

      // Decayed green hands sticking out
      ctx.fillStyle = '#4e7047';
      ctx.fillRect(11, -16 - bob + step, 4, 3);

      // Riot Helmet
      ctx.fillStyle = '#263238';
      ctx.fillRect(-6, -27 - bob, 12, 11);
      ctx.fillStyle = '#37474f';
      ctx.fillRect(-7, -23 - bob, 14, 3); // Helmet rim

      // Visor slit with green-blue reflection
      ctx.fillStyle = '#00e5ff';
      ctx.fillRect(0, -23 - bob, 6, 2);
    }
  }

  // ============================================================================
  // 4. BLOATER ZOMBIE (Swollen, high HP, explodes into toxic gore)
  // ============================================================================

  class BloaterZombie extends BaseZombie {
    constructor(config = {}) {
      super({
        ...config,
        type: 'bloater',
        name: 'Bloater',
        maxHp: config.maxHp || 440,
        baseSpeed: config.baseSpeed || 30,
        bountyGold: 35,
        bountyEnergy: 3,
        scoreValue: 190,
        hitboxRadius: 21,
        stepFrequency: 3.2,
        maxLaneOffset: 18
      });
      this.explosionRadius = config.explosionRadius || 85;
      this.explosionDamage = config.explosionDamage || 45;
    }

    drawShadow(ctx) {
      super.drawShadow(ctx, 16, 6);
    }

    onDeathEffect() {
      // Bloater ruptures into massive toxic explosion
      ZombieManager.particles.spawnToxicExplosion(this.x, this.y - 12, this.explosionRadius);

      // Deal splash damage to nearby barricades or towers, or trigger engine event
      ZombieManager.triggerBloaterBlast(this.x, this.y, this.explosionRadius, this.explosionDamage);
    }

    drawPixelSprite(ctx) {
      const step = Math.sin(this.animTime * this.stepFrequency);
      const wobble = Math.sin(this.animTime * 6) * 1.5;
      const bob = Math.abs(Math.cos(this.animTime * this.stepFrequency)) * 2;

      // Heavy stubby legs
      ctx.fillStyle = '#333826';
      ctx.fillRect(-8 - step * 2, -6, 6, 7);
      ctx.fillRect(3 + step * 2, -6, 6, 7);

      // Enormous bulging toxic belly
      ctx.fillStyle = '#829140'; // Diseased olive yellow-green
      ctx.beginPath();
      ctx.ellipse(0, -16 - bob, 14 + wobble * 0.5, 13 - wobble * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();

      // Pulsing toxic boils and veins
      ctx.fillStyle = '#aeea00';
      ctx.beginPath();
      ctx.arc(3, -18 - bob, 4, 0, Math.PI * 2);
      ctx.arc(-4, -14 - bob, 3, 0, Math.PI * 2);
      ctx.arc(6, -11 - bob, 2.5, 0, Math.PI * 2);
      ctx.fill();

      // Sloshing belly seam/stretches
      ctx.fillStyle = '#4d5722';
      ctx.fillRect(-8, -13 - bob, 16, 2);

      // Bloated head sunken into shoulders
      ctx.fillStyle = '#738038';
      ctx.fillRect(-5, -27 - bob, 10, 9);

      // Swollen infected eyes & drooling maw
      ctx.fillStyle = '#c6ff00';
      ctx.fillRect(1, -24 - bob, 3, 3);
      ctx.fillStyle = '#33691e';
      ctx.fillRect(0, -20 - bob, 6, 3); // Acidic drool
    }
  }

  // ============================================================================
  // 5. CRAWLER ZOMBIE (Severed torso crawling rapidly, low profile, agile)
  // ============================================================================

  class CrawlerZombie extends BaseZombie {
    constructor(config = {}) {
      super({
        ...config,
        type: 'crawler',
        name: 'Crawler',
        maxHp: config.maxHp || 55,
        baseSpeed: config.baseSpeed || 72,
        dodgeChance: 0.20, // 20% evasion against normal attacks
        bountyGold: 12,
        bountyEnergy: 1,
        scoreValue: 60,
        hitboxRadius: 9,
        stepFrequency: 8.0,
        maxLaneOffset: 24
      });
    }

    drawShadow(ctx) {
      super.drawShadow(ctx, 12, 3);
    }

    drawPixelSprite(ctx) {
      const crawl = Math.sin(this.animTime * this.stepFrequency);
      const lunge = Math.max(0, crawl);

      // Dragging severed torso on the pavement
      ctx.fillStyle = '#4a0000'; // Blood streak
      ctx.fillRect(-12, -2, 8, 3);

      // Torn spine and jeans
      ctx.fillStyle = '#3e2723';
      ctx.fillRect(-8, -5, 7, 4);

      // Upper back & ribs
      ctx.fillStyle = '#4c5d46';
      ctx.fillRect(-3, -7, 9, 6);

      // Strong crawling arms reaching and pulling
      ctx.fillStyle = '#566e4e';
      // Front pulling arm
      ctx.fillRect(3 + lunge * 4, -4, 8, 3);
      ctx.fillRect(9 + lunge * 4, -2, 3, 4); // Hand dragging cobblestone

      // Trailing arm
      ctx.fillStyle = '#3f5239';
      ctx.fillRect(-5 - lunge * 2, -4, 6, 3);

      // Low head tilted up toward survivors
      ctx.fillStyle = '#566e4e';
      ctx.fillRect(3, -11, 7, 7);

      // Glaring eyes
      ctx.fillStyle = '#ff1744';
      ctx.fillRect(7, -9, 2, 2);
    }
  }

  // ============================================================================
  // 6. MUTANT TANK / BEHEMOTH (Massive boss encounter, gigantic HP bar)
  // ============================================================================

  class TankZombie extends BaseZombie {
    constructor(config = {}) {
      super({
        ...config,
        type: 'tank',
        name: 'Mutant Behemoth',
        maxHp: config.maxHp || 3600,
        baseSpeed: config.baseSpeed || 26,
        physicalDefense: 0.35, // 35% heavy armor resistance
        bountyGold: 180,
        bountyEnergy: 15,
        scoreValue: 1500,
        hitboxRadius: 28,
        stepFrequency: 2.6,
        isBoss: true,
        maxLaneOffset: 12
      });
    }

    drawShadow(ctx) {
      super.drawShadow(ctx, 28, 9);
    }

    drawPixelSprite(ctx) {
      const step = Math.sin(this.animTime * this.stepFrequency);
      const bob = Math.abs(Math.cos(this.animTime * this.stepFrequency)) * 3;

      // Colossal tree-trunk legs
      ctx.fillStyle = '#212121';
      ctx.fillRect(-14 - step * 4, -10, 11, 12);
      ctx.fillRect(4 + step * 4, -10, 11, 12);

      // Massive mutated torso (grey stone-like mutated hide)
      ctx.fillStyle = '#37474f';
      ctx.fillRect(-18, -36 - bob, 36, 28);

      // Mutated back bone spikes
      ctx.fillStyle = '#cfd8dc';
      ctx.fillRect(-16, -42 - bob, 6, 8);
      ctx.fillRect(-6, -45 - bob, 6, 11);
      ctx.fillRect(4, -40 - bob, 5, 6);

      // Heavy steel chains wrapped around chest
      ctx.fillStyle = '#90a4ae';
      ctx.fillRect(-18, -26 - bob, 36, 4);
      ctx.fillStyle = '#b0bec5';
      ctx.fillRect(-12, -28 - bob, 4, 8);
      ctx.fillRect(6, -28 - bob, 4, 8);

      // Giant mutated right fist/club arm
      ctx.fillStyle = '#455a64';
      ctx.fillRect(14, -34 - bob + step * 3, 14, 22);
      // Spikes on knuckles
      ctx.fillStyle = '#eceff1';
      ctx.fillRect(24, -14 - bob + step * 3, 4, 4);
      ctx.fillRect(24, -20 - bob + step * 3, 4, 4);

      // Left arm
      ctx.fillStyle = '#263238';
      ctx.fillRect(-24, -32 - bob - step * 3, 10, 18);

      // Mutated hulking head
      ctx.fillStyle = '#455a64';
      ctx.fillRect(-8, -48 - bob, 16, 14);

      // Glowing demonic red eyes
      ctx.fillStyle = '#ff1744';
      ctx.fillRect(-1, -44 - bob, 4, 3);
      ctx.fillRect(4, -44 - bob, 3, 3);

      // Exposed jaw & steel plating
      ctx.fillStyle = '#cfd8dc';
      ctx.fillRect(-3, -39 - bob, 10, 4);
    }
  }

  // ============================================================================
  // ZOMBIE FACTORY
  // ============================================================================

  const ZombieFactory = {
    create(type, config = {}) {
      switch (type.toLowerCase()) {
        case 'sprinter':
        case 'runner':
          return new SprinterZombie(config);
        case 'armored':
        case 'riot':
          return new ArmoredZombie(config);
        case 'bloater':
        case 'exploder':
          return new BloaterZombie(config);
        case 'crawler':
          return new CrawlerZombie(config);
        case 'tank':
        case 'behemoth':
        case 'mutant':
        case 'boss':
          return new TankZombie(config);
        case 'walker':
        default:
          return new WalkerZombie(config);
      }
    }
  };

  // ============================================================================
  // 40 PROGRESSIVE WAVE DEFINITIONS (Matching Screenshot: Wave 24 has 450 Zombies!)
  // ============================================================================

  /**
   * Generates the 40-wave progression table.
   * Wave 24 is specifically tuned to match the screenshot HUD:
   * "WAVE 24/40, ZOMBIES: 450"
   */
  function generate40Waves() {
    const waves = [];

    for (let w = 1; w <= 40; w++) {
      // HP scaling factor per wave
      const hpScale = 1.0 + (w - 1) * 0.12 + Math.pow(w / 10, 1.6) * 0.08;

      let waveDef = {
        waveNumber: w,
        hpScale: hpScale,
        totalZombies: 0,
        subWaves: []
      };

      if (w === 24) {
        // ====================================================================
        // WAVE 24 PRESET: EXACTLY 450 ZOMBIES (As featured in screenshot!)
        // Dual-entry massive siege with Walkers, Sprinters, Armored, Bloaters,
        // Crawlers, and Mutant Tanks charging down both roads simultaneously!
        // ====================================================================
        waveDef.totalZombies = 450;
        waveDef.description = "THE APOCALYPTIC SIEGE - 450 ZOMBIES";
        waveDef.subWaves = [
          // Phase 1: Rapid vanguard runners & crawlers burst from both gates (0s - 12s)
          { entry: 'A', type: 'sprinter', count: 35, interval: 0.35, delay: 0 },
          { entry: 'B', type: 'crawler', count: 30, interval: 0.35, delay: 0.5 },

          // Phase 2: Heavy main army from Entry A and Entry B (12s - 45s)
          { entry: 'A', type: 'walker', count: 90, interval: 0.35, delay: 6.0 },
          { entry: 'B', type: 'walker', count: 90, interval: 0.35, delay: 7.0 },
          { entry: 'A', type: 'armored', count: 35, interval: 0.70, delay: 12.0 },
          { entry: 'B', type: 'armored', count: 35, interval: 0.70, delay: 13.0 },

          // Phase 3: Bloater suicide squad & Second Runner Rush (40s - 75s)
          { entry: 'A', type: 'bloater', count: 22, interval: 1.10, delay: 24.0 },
          { entry: 'B', type: 'bloater', count: 23, interval: 1.10, delay: 26.0 },
          { entry: 'A', type: 'sprinter', count: 40, interval: 0.30, delay: 35.0 },
          { entry: 'B', type: 'sprinter', count: 35, interval: 0.30, delay: 36.0 },

          // Phase 4: Sneaky crawler flankers (50s)
          { entry: 'A', type: 'crawler', count: 10, interval: 0.40, delay: 45.0 },

          // Phase 5: Boss Assault - 5 Mutant Tanks with dense escort (60s - 95s)
          { entry: 'A', type: 'tank', count: 2, interval: 12.0, delay: 55.0 },
          { entry: 'B', type: 'tank', count: 3, interval: 10.0, delay: 58.0 },
          { entry: 'A', type: 'walker', count: 20, interval: 0.40, delay: 65.0 },
          { entry: 'B', type: 'walker', count: 20, interval: 0.40, delay: 68.0 }
        ];

        // Verify total sum: 35+30+90+90+35+35+22+23+40+35+10+2+3+20+20 = 450!
      } else if (w <= 5) {
        // Early introductory waves (15 - 50 zombies)
        const count = 15 + (w - 1) * 8;
        waveDef.totalZombies = count;
        waveDef.subWaves = [
          { entry: 'A', type: 'walker', count: Math.ceil(count * 0.7), interval: 1.2, delay: 0 },
          { entry: 'B', type: (w >= 3 ? 'sprinter' : 'crawler'), count: Math.floor(count * 0.3), interval: 1.5, delay: 4.0 }
        ];
      } else if (w <= 10) {
        // Introduction of Armored & Wave 10 Boss
        const count = 50 + (w - 5) * 12;
        waveDef.totalZombies = count;
        const sub = [
          { entry: 'A', type: 'walker', count: Math.floor(count * 0.45), interval: 0.8, delay: 0 },
          { entry: 'B', type: 'sprinter', count: Math.floor(count * 0.30), interval: 0.9, delay: 2.0 },
          { entry: 'A', type: 'armored', count: Math.floor(count * 0.20), interval: 1.4, delay: 8.0 }
        ];
        if (w === 10) {
          sub.push({ entry: 'B', type: 'tank', count: 1, interval: 1.0, delay: 18.0 });
        }
        waveDef.subWaves = sub;
      } else if (w <= 20) {
        // Bloaters introduced, dual-entry simultaneous pressure (120 - 320 zombies)
        const count = 110 + (w - 10) * 22;
        waveDef.totalZombies = count;
        waveDef.subWaves = [
          { entry: 'A', type: 'walker', count: Math.floor(count * 0.35), interval: 0.5, delay: 0 },
          { entry: 'B', type: 'sprinter', count: Math.floor(count * 0.25), interval: 0.6, delay: 2.0 },
          { entry: 'A', type: 'armored', count: Math.floor(count * 0.20), interval: 0.9, delay: 6.0 },
          { entry: 'B', type: 'bloater', count: Math.floor(count * 0.15), interval: 1.5, delay: 10.0 }
        ];
        if (w === 20) {
          waveDef.subWaves.push(
            { entry: 'A', type: 'tank', count: 1, interval: 1.0, delay: 20.0 },
            { entry: 'B', type: 'tank', count: 1, interval: 1.0, delay: 22.0 }
          );
        }
      } else if (w < 24) {
        // Escalation leading into Wave 24 (340 - 410 zombies)
        const count = 330 + (w - 20) * 28;
        waveDef.totalZombies = count;
        waveDef.subWaves = [
          { entry: 'A', type: 'walker', count: Math.floor(count * 0.35), interval: 0.40, delay: 0 },
          { entry: 'B', type: 'walker', count: Math.floor(count * 0.30), interval: 0.40, delay: 2 },
          { entry: 'A', type: 'sprinter', count: Math.floor(count * 0.15), interval: 0.35, delay: 8 },
          { entry: 'B', type: 'armored', count: Math.floor(count * 0.10), interval: 0.8, delay: 14 },
          { entry: 'A', type: 'bloater', count: Math.floor(count * 0.10), interval: 1.2, delay: 18 }
        ];
      } else if (w <= 30) {
        // Post-Wave 24 Veteran hordes (460 - 580 zombies)
        const count = 450 + (w - 24) * 22;
        waveDef.totalZombies = count;
        waveDef.subWaves = [
          { entry: 'A', type: 'armored', count: Math.floor(count * 0.25), interval: 0.45, delay: 0 },
          { entry: 'B', type: 'bloater', count: Math.floor(count * 0.20), interval: 0.7, delay: 4 },
          { entry: 'A', type: 'sprinter', count: Math.floor(count * 0.30), interval: 0.25, delay: 10 },
          { entry: 'B', type: 'crawler', count: Math.floor(count * 0.20), interval: 0.30, delay: 14 },
          { entry: (w % 2 === 0 ? 'A' : 'B'), type: 'tank', count: Math.floor(w / 6), interval: 8.0, delay: 25 }
        ];
      } else {
        // Wave 31 - 40: Apocalyptic End Game (600 - 850 zombies)
        const count = 580 + (w - 30) * 27;
        waveDef.totalZombies = count;
        waveDef.subWaves = [
          { entry: 'A', type: 'walker', count: Math.floor(count * 0.25), interval: 0.25, delay: 0 },
          { entry: 'B', type: 'walker', count: Math.floor(count * 0.25), interval: 0.25, delay: 1 },
          { entry: 'A', type: 'sprinter', count: Math.floor(count * 0.20), interval: 0.20, delay: 5 },
          { entry: 'B', type: 'armored', count: Math.floor(count * 0.15), interval: 0.40, delay: 10 },
          { entry: 'A', type: 'bloater', count: Math.floor(count * 0.10), interval: 0.80, delay: 15 },
          { entry: 'B', type: 'tank', count: (w === 40 ? 10 : 4), interval: 6.0, delay: 25 }
        ];
      }

      waves.push(waveDef);
    }

    return waves;
  }

  // ============================================================================
  // WAVE MANAGER & DUAL-ENTRY SPAWNER
  // ============================================================================

  class WaveManager {
    constructor() {
      this.waves = generate40Waves();
      this.currentWaveNumber = 1;
      this.currentWaveDef = null;
      this.activeSpawners = [];
      this.waveInProgress = false;
      this.waveCleared = false;
      this.autoStartNextWave = false;

      // Counters
      this.totalZombiesInCurrentWave = 0;
      this.zombiesSpawnedInWave = 0;
    }

    startWave(waveNumber = null) {
      if (waveNumber !== null) {
        this.currentWaveNumber = Math.max(1, Math.min(40, waveNumber));
      }

      const waveIndex = this.currentWaveNumber - 1;
      this.currentWaveDef = this.waves[waveIndex];
      this.waveInProgress = true;
      this.waveCleared = false;
      this.zombiesSpawnedInWave = 0;
      this.totalZombiesInCurrentWave = this.currentWaveDef.totalZombies;

      // Prepare active spawner queues
      this.activeSpawners = this.currentWaveDef.subWaves.map(sw => ({
        entry: sw.entry,
        type: sw.type,
        totalCount: sw.count,
        spawnedCount: 0,
        interval: sw.interval,
        delayTimer: sw.delay,
        spawnTimer: 0
      }));

      // Notify ZombieManager & callbacks
      ZombieManager.onWaveStarted(this.currentWaveNumber, this.totalZombiesInCurrentWave);
    }

    update(dt) {
      if (!this.waveInProgress) return;

      let allSpawnersDone = true;

      for (let i = 0; i < this.activeSpawners.length; i++) {
        const spawner = this.activeSpawners[i];

        if (spawner.spawnedCount >= spawner.totalCount) {
          continue;
        }

        allSpawnersDone = false;

        // Check initial delay
        if (spawner.delayTimer > 0) {
          spawner.delayTimer -= dt;
          continue;
        }

        // Countdown spawn interval
        spawner.spawnTimer -= dt;
        while (spawner.spawnTimer <= 0 && spawner.spawnedCount < spawner.totalCount) {
          spawner.spawnTimer += spawner.interval;
          spawner.spawnedCount++;
          this.zombiesSpawnedInWave++;

          // Spawn zombie into ZombieManager
          ZombieManager.spawnZombie(spawner.type, spawner.entry, this.currentWaveDef.hpScale);
        }
      }

      // If all spawners finished and all active zombies on field are dead
      if (allSpawnersDone && ZombieManager.zombies.length === 0) {
        this.waveInProgress = false;
        this.waveCleared = true;
        ZombieManager.onWaveCompleted(this.currentWaveNumber);

        if (this.autoStartNextWave && this.currentWaveNumber < 40) {
          this.currentWaveNumber++;
          this.startWave(this.currentWaveNumber);
        }
      }
    }

    getWaveInfo() {
      const remainingAlive = ZombieManager.zombies.length;
      const unspawned = Math.max(0, this.totalZombiesInCurrentWave - this.zombiesSpawnedInWave);
      const totalRemaining = remainingAlive + unspawned;

      return {
        currentWave: this.currentWaveNumber,
        totalWaves: 40,
        zombiesRemaining: this.waveInProgress ? totalRemaining : (this.currentWaveDef ? this.currentWaveDef.totalZombies : 0),
        zombiesAlive: remainingAlive,
        waveInProgress: this.waveInProgress,
        waveCleared: this.waveCleared
      };
    }
  }

  // ============================================================================
  // ZOMBIE ENTITY OBJECT POOL (High Throughput Zero-GC Entity Pooling)
  // ============================================================================

  class ZombiePool {
    constructor() {
      this.pools = new Map();
    }

    obtain(type, config = {}) {
      const t = (type || 'walker').toLowerCase();
      if (!this.pools.has(t)) {
        this.pools.set(t, []);
      }
      const pool = this.pools.get(t);
      if (pool.length > 0) {
        const zombie = pool.pop();
        zombie.reset(config);
        return zombie;
      }
      return ZombieFactory.create(t, config);
    }

    release(zombie) {
      if (!zombie) return;
      zombie.active = false;
      const t = (zombie.type || 'walker').toLowerCase();
      if (!this.pools.has(t)) {
        this.pools.set(t, []);
      }
      const pool = this.pools.get(t);
      if (pool.length < 350) {
        pool.push(zombie);
      }
    }

    clear() {
      for (const pool of this.pools.values()) {
        pool.length = 0;
      }
    }
  }

  // ============================================================================
  // ZOMBIE MANAGER (Master Horde Controller)
  // ============================================================================

  class ZombieManagerSingleton {
    constructor() {
      this.zombies = [];
      this.zombiePool = new ZombiePool();
      this.waveManager = new WaveManager();
      this.damageNumbers = new DamageNumberPool(250);
      this.particles = new ParticlePool(400);

      // Callbacks for game engine integration
      this.callbacks = {
        onZombieKilled: null,
        onZombieReachedEnd: null,
        onWaveStarted: null,
        onWaveCompleted: null,
        onAllWavesCompleted: null,
        onResourcesAwarded: null
      };

      // Game state references (gold, energy, score)
      this.gameState = {
        gold: 2450,
        energy: 120,
        score: 78500
      };
    }

    /**
     * Configure custom path waypoints from map.js if available
     */
    setCustomPaths(entryAWaypoints, entryBWaypoints) {
      if (entryAWaypoints && entryAWaypoints.length > 1) {
        processedPathA = processPathWaypoints(entryAWaypoints);
      }
      if (entryBWaypoints && entryBWaypoints.length > 1) {
        processedPathB = processPathWaypoints(entryBWaypoints);
      }
    }

    /**
     * Register listeners with the game engine
     */
    setCallback(name, fn) {
      if (typeof fn === 'function') {
        this.callbacks[name] = fn;
      }
    }

    /**
     * Spawn an individual zombie (recycled from ZombiePool if available)
     */
    spawnZombie(type, entry = 'A', hpMultiplier = 1.0) {
      const zombie = this.zombiePool.obtain(type, { entry });
      zombie.maxHp = Math.round(zombie.maxHp * hpMultiplier);
      zombie.hp = zombie.maxHp;
      this.zombies.push(zombie);
      return zombie;
    }

    spawn(type, entry = 'A', hpMultiplier = 1.0) {
      return this.spawnZombie(type, entry, hpMultiplier);
    }

    /**
     * Bloater toxic area explosion splash
     */
    triggerBloaterBlast(x, y, radius, damage) {
      // Find nearby targets (e.g. towers, barricades, or chained damage)
      if (this.callbacks.onBloaterExplosion) {
        this.callbacks.onBloaterExplosion(x, y, radius, damage);
      }
    }

    /**
     * Handle zombie killed
     */
    onZombieKilled(zombie, killer) {
      this.gameState.gold += zombie.bountyGold;
      this.gameState.energy += zombie.bountyEnergy;
      this.gameState.score += zombie.scoreValue;

      if (this.callbacks.onResourcesAwarded) {
        this.callbacks.onResourcesAwarded(zombie.bountyGold, zombie.bountyEnergy, zombie.scoreValue);
      }

      if (this.callbacks.onZombieKilled) {
        this.callbacks.onZombieKilled(zombie, killer);
      }
    }

    /**
     * Handle zombie reached base
     */
    onZombieReachedEnd(zombie) {
      const damageToBase = zombie.isBoss ? 20 : (zombie.type === 'bloater' ? 5 : 2);
      if (this.callbacks.onZombieReachedEnd) {
        this.callbacks.onZombieReachedEnd(zombie, damageToBase);
      }
    }

    onWaveStarted(waveNumber, totalZombies) {
      if (this.callbacks.onWaveStarted) {
        this.callbacks.onWaveStarted(waveNumber, totalZombies);
      }
    }

    onWaveCompleted(waveNumber) {
      if (this.callbacks.onWaveCompleted) {
        this.callbacks.onWaveCompleted(waveNumber);
      }
      if (waveNumber >= 40 && this.callbacks.onAllWavesCompleted) {
        this.callbacks.onAllWavesCompleted();
      }
    }

    /**
     * Start specific wave (e.g. Wave 24)
     */
    startWave(waveNumber = 1) {
      this.waveManager.startWave(waveNumber);
    }

    /**
     * Fast spatial queries for defense towers
     */
    getActiveZombies() {
      return this.zombies;
    }

    getZombiesInRange(x, y, radius) {
      const r2 = radius * radius;
      const results = [];
      for (let i = 0; i < this.zombies.length; i++) {
        const z = this.zombies[i];
        if (!z.active) continue;
        const dx = z.x - x;
        const dy = z.y - y;
        if (dx * dx + dy * dy <= r2) {
          results.push(z);
        }
      }
      return results;
    }

    /**
     * Common tower targeting strategies:
     * - 'first': furthest along the path
     * - 'last': nearest to entry
     * - 'strongest': highest current HP
     * - 'weakest': lowest current HP
     * - 'closest': closest distance to tower
     */
    getTarget(x, y, radius, strategy = 'first') {
      const inRange = this.getZombiesInRange(x, y, radius);
      if (inRange.length === 0) return null;

      switch (strategy) {
        case 'strongest':
          return inRange.reduce((prev, curr) => (curr.hp > prev.hp ? curr : prev), inRange[0]);
        case 'weakest':
          return inRange.reduce((prev, curr) => (curr.hp < prev.hp ? curr : prev), inRange[0]);
        case 'closest': {
          let best = null;
          let bestDistSq = Infinity;
          for (let i = 0; i < inRange.length; i++) {
            const z = inRange[i];
            const distSq = (z.x - x) * (z.x - x) + (z.y - y) * (z.y - y);
            if (distSq < bestDistSq) {
              bestDistSq = distSq;
              best = z;
            }
          }
          return best;
        }
        case 'last':
          return inRange.reduce((prev, curr) => (curr.distanceTraveled < prev.distanceTraveled ? curr : prev), inRange[0]);
        case 'first':
        default:
          return inRange.reduce((prev, curr) => (curr.distanceTraveled > prev.distanceTraveled ? curr : prev), inRange[0]);
      }
    }

    /**
     * Update loop
     */
    update(dt) {
      // Cap delta time to prevent physics explosions on frame spikes
      const clampedDt = Math.min(0.1, dt);

      // Update wave spawner
      this.waveManager.update(clampedDt);

      // Update active zombies
      for (let i = this.zombies.length - 1; i >= 0; i--) {
        const z = this.zombies[i];
        z.update(clampedDt);
        if (!z.active) {
          this.zombiePool.release(z);
          this.zombies.splice(i, 1);
        }
      }

      // Update particle effects and damage numbers
      this.particles.update(clampedDt);
      this.damageNumbers.update(clampedDt);
    }

    /**
     * Render loop with isometric Y-depth sorting
     */
    draw(ctx) {
      // 1. Sort zombies by Y-depth for realistic 2.5D perspective overlap
      this.zombies.sort((a, b) => (a.y + a.hitboxRadius) - (b.y + b.hitboxRadius));

      // 2. Draw all zombies
      for (let i = 0; i < this.zombies.length; i++) {
        this.zombies[i].draw(ctx);
      }

      // 3. Draw combat particles
      this.particles.draw(ctx);

      // 4. Draw floating damage numbers on top
      this.damageNumbers.draw(ctx);
    }

    /**
     * Clear all current active zombies and effects (e.g. for game restart)
     */
    reset() {
      for (let i = 0; i < this.zombies.length; i++) {
        this.zombiePool.release(this.zombies[i]);
      }
      this.zombies = [];
      this.particles.clear();
      this.damageNumbers.clear();
      this.waveManager = new WaveManager();
    }
  }

  // Master Singleton instance
  const ZombieManager = new ZombieManagerSingleton();

  // Export module API
  return {
    BaseZombie,
    WalkerZombie,
    SprinterZombie,
    ArmoredZombie,
    BloaterZombie,
    CrawlerZombie,
    TankZombie,
    ZombieFactory,
    ZombiePool,
    DamageNumber,
    DamageNumberPool,
    GoreParticle,
    ParticlePool,
    WaveManager,
    ZombieManager,
    DEFAULT_WAYPOINTS_ENTRY_A,
    DEFAULT_WAYPOINTS_ENTRY_B
  };
}));
