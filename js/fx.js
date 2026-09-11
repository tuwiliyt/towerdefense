/**
 * fx.js - Visual FX, Persistent Gore Canvas, Retro Damage Text & Particle Systems
 * 
 * Systems included:
 * 1. Persistent Gore Canvas: Blood splatters, pools, dismemberment gibs and scorch marks
 *    baked into an offscreen canvas for 60fps performance with unlimited carnage!
 * 2. Floating Combat Text: Retro pixel damage numbers in vibrant red, orange, green, yellow,
 *    floating upward with gravity, scale-popping, and smooth fading.
 * 3. Particle FX System: Explosive fireballs, expanding shockwaves, billowing smoke,
 *    muzzle flashes, flying brass bullet casings, procedural jagged Tesla electric arcs,
 *    and streaming Flametrost flame cones.
 */

class FXSystem {
  constructor(width = 1280, height = 720) {
    this.width = width;
    this.height = height;

    // 1. Persistent Gore Canvas (Draws once, stays forever without overhead)
    this.goreCanvas = this._createCanvas(this.width, this.height);
    this.goreCtx = null;
    if (this.goreCanvas) {
      this.goreCtx = this.goreCanvas.getContext('2d');
      this.goreCtx.imageSmoothingEnabled = false;
    }

    // Active Particles & Systems
    this.particles = [];
    this.floatingTexts = [];
    this.teslaArcs = [];
    this.flyingGibs = [];
    this.bulletCasings = [];
    this.shockwaves = [];
    this.muzzleFlashes = [];

    // Global wind / drift
    this.windX = 8.0;
  }

  _createCanvas(w, h) {
    if (typeof document !== 'undefined' && document.createElement) {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      return c;
    }
    try {
      const { createCanvas } = require('canvas');
      return createCanvas(w, h);
    } catch (e) {
      return null;
    }
  }

  // =========================================================================
  // 1. PERSISTENT GORE SYSTEM (Blood & Decals)
  // =========================================================================

  /**
   * Adds blood splatter to the persistent gore layer.
   */
  addBloodSplatter(x, y, options = {}) {
    if (!this.goreCtx) return;
    const ctx = this.goreCtx;

    const count = options.count || 14;
    const dir = options.dir !== undefined ? options.dir : null;
    const spread = options.spread !== undefined ? options.spread : Math.PI * 0.75;
    const minSize = options.minSize || 2;
    const maxSize = options.maxSize || 6;

    const bloodPalette = [
      '#5c0505',
      '#800606',
      '#a80f0f',
      '#3d0404'
    ];

    ctx.save();

    for (let i = 0; i < count; i++) {
      let angle = (dir !== null)
        ? dir + (Math.random() - 0.5) * spread
        : Math.random() * Math.PI * 2;

      const distance = Math.pow(Math.random(), 0.7) * (options.radius || 35);
      const px = x + Math.cos(angle) * distance;
      const py = y + Math.sin(angle) * distance;

      const size = minSize + Math.random() * (maxSize - minSize);
      const color = bloodPalette[Math.floor(Math.random() * bloodPalette.length)];

      ctx.fillStyle = color;

      ctx.beginPath();
      const stretch = 1 + (distance / 30);
      ctx.ellipse(px, py, size * stretch, size, angle, 0, Math.PI * 2);
      ctx.fill();

      if (Math.random() > 0.6) {
        const satDist = distance + 6 + Math.random() * 12;
        const sx = x + Math.cos(angle) * satDist;
        const sy = y + Math.sin(angle) * satDist;
        ctx.fillRect(sx - 1, sy - 1, 2, 2);
      }
    }

    ctx.restore();
  }

  // Alias for backward-compatibility with main.js
  addBloodDecal(x, y) {
    this.addBloodSplatter(x, y, { count: 8, radius: 18 });
  }

  /**
   * Adds an irregular pooling blood stain on the ground.
   */
  addBloodPool(x, y, radius = 18, color = '#6b0000') {
    if (!this.goreCtx) return;
    const ctx = this.goreCtx;

    ctx.save();
    ctx.fillStyle = color;

    ctx.beginPath();
    const lobes = 6 + Math.floor(Math.random() * 4);
    for (let i = 0; i < lobes; i++) {
      const angle = (i / lobes) * Math.PI * 2;
      const r = radius * (0.65 + Math.random() * 0.7);
      const lx = x + Math.cos(angle) * r;
      const ly = y + Math.sin(angle) * r * 0.75;
      if (i === 0) ctx.moveTo(lx, ly);
      else ctx.lineTo(lx, ly);
    }
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#420202';
    ctx.beginPath();
    ctx.ellipse(x, y, radius * 0.45, radius * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  /**
   * Stamps a charred blast scorch mark onto the stone/dirt pavement.
   */
  addScorchMark(x, y, radius = 26) {
    if (!this.goreCtx) return;
    const ctx = this.goreCtx;

    ctx.save();
    const grad = ctx.createRadialGradient(x, y, radius * 0.1, x, y, radius);
    grad.addColorStop(0, 'rgba(15, 14, 13, 0.85)');
    grad.addColorStop(0.6, 'rgba(30, 27, 24, 0.6)');
    grad.addColorStop(1, 'rgba(40, 35, 30, 0)');
    ctx.fillStyle = grad;

    ctx.beginPath();
    ctx.ellipse(x, y, radius, radius * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#141312';
    ctx.beginPath();
    ctx.ellipse(x, y, radius * 0.45, radius * 0.3, 0.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  /**
   * Stamps a severed zombie limb or meat chunk directly onto the persistent canvas.
   */
  addGibDecal(x, y, type = 'flesh', angle = 0) {
    if (!this.goreCtx) return;
    const ctx = this.goreCtx;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    ctx.fillStyle = '#5c0505';
    ctx.beginPath();
    ctx.ellipse(0, 0, 10, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    if (type === 'head') {
      ctx.fillStyle = '#52694b';
      ctx.beginPath();
      ctx.arc(0, 0, 7, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#111';
      ctx.fillRect(-4, -2, 2, 2);
      ctx.fillRect(1, -2, 2, 2);

      ctx.fillStyle = '#9e0d0d';
      ctx.fillRect(-3, 4, 6, 3);
    } else if (type === 'arm' || type === 'leg') {
      ctx.fillStyle = '#475e41';
      ctx.fillRect(-3, -8, 6, 16);

      ctx.fillStyle = '#eae7dd';
      ctx.fillRect(-1.5, -11, 3, 4);

      ctx.fillStyle = '#9e0d0d';
      ctx.fillRect(-2.5, -8, 5, 2);
    } else if (type === 'ribs') {
      ctx.strokeStyle = '#e6e2d3';
      ctx.lineWidth = 2;
      ctx.strokeRect(-5, -4, 10, 8);
      ctx.fillStyle = '#800606';
      ctx.fillRect(-3, -2, 6, 4);
    } else {
      ctx.fillStyle = '#800c0c';
      if (ctx.roundRect) ctx.beginPath(), ctx.roundRect(-4, -3, 8, 6, 2), ctx.fill();
      else ctx.fillRect(-4, -3, 8, 6);
    }

    ctx.restore();
  }

  clearGore() {
    if (this.goreCtx) {
      this.goreCtx.clearRect(0, 0, this.width, this.height);
    }
  }

  clearBlood() {
    this.clearGore();
    this.groundDecals = [];
  }

  // =========================================================================
  // 2. FLOATING COMBAT TEXT SYSTEM (Retro Damage Numbers)
  // =========================================================================

  spawnDamageText(x, y, amount, type = 'physical', isCrit = false) {
    let color = '#ffeb3b';
    let fontSize = 14;
    let text = `${amount}`;

    switch (type) {
      case 'crit':
      case 'heavy':
        color = '#ff2b2b';
        fontSize = 18;
        isCrit = true;
        break;
      case 'fire':
      case 'burn':
        color = '#ff8800';
        fontSize = 15;
        break;
      case 'toxic':
      case 'acid':
      case 'poison':
        color = '#39ff14';
        fontSize = 15;
        break;
      case 'electric':
      case 'tesla':
        color = '#00f0ff';
        fontSize = 15;
        break;
      case 'gold':
      case 'resource':
        color = '#ffd700';
        fontSize = 15;
        text = `+${amount}G`;
        break;
      case 'physical':
      default:
        color = '#fff275';
        fontSize = 13;
        break;
    }

    if (isCrit) {
      color = '#ff1e1e';
      fontSize = Math.max(fontSize, 18);
    }

    this.floatingTexts.push({
      x: x + (Math.random() - 0.5) * 12,
      y: y - 10,
      text: text,
      color: color,
      fontSize: fontSize,
      scale: isCrit ? 1.6 : 1.3,
      targetScale: 1.0,
      vx: (Math.random() - 0.5) * 24,
      vy: isCrit ? -110 : -85,
      gravity: 75,
      alpha: 1.0,
      life: 0.85,
      maxLife: 0.85
    });
  }

  addCombatFloater(x, y, text, color = '#ffffff') {
    this.floatingTexts.push({
      x: x,
      y: y,
      text: `${text}`,
      color: color,
      fontSize: 15,
      scale: 1.3,
      targetScale: 1.0,
      vx: (Math.random() - 0.5) * 20,
      vy: -85,
      gravity: 70,
      alpha: 1.0,
      life: 0.85,
      maxLife: 0.85
    });
  }

  spawnText(x, y, text, color = '#ffffff', fontSize = 14, duration = 1.0) {
    this.floatingTexts.push({
      x: x,
      y: y,
      text: text,
      color: color,
      fontSize: fontSize,
      scale: 1.2,
      targetScale: 1.0,
      vx: 0,
      vy: -60,
      gravity: 40,
      alpha: 1.0,
      life: duration,
      maxLife: duration
    });
  }

  // =========================================================================
  // 3. PARTICLE SYSTEMS (Explosions, Smoke, Flash, Lightning, Flame)
  // =========================================================================

  createExplosion(x, y, radius = 45, options = {}) {
    this.addScorchMark(x, y, radius * 0.7);

    if (options.hasGore) {
      this.addBloodSplatter(x, y, { count: 18, radius: radius * 1.2 });
    }

    this.createShockwave(x, y, radius * 1.5, 0.35, '#fffae6');

    const particleCount = options.count || 24;
    for (let i = 0; i < particleCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 25 + Math.random() * (radius * 2.5);

      this.particles.push({
        type: 'fire',
        x: x,
        y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 15,
        size: 10 + Math.random() * (radius * 0.4),
        maxSize: 18 + Math.random() * (radius * 0.5),
        growth: 20,
        life: 0.45 + Math.random() * 0.3,
        maxLife: 0.75,
        alpha: 1.0
      });
    }

    for (let i = 0; i < 14; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 60 + Math.random() * 120;
      this.particles.push({
        type: 'spark',
        x: x,
        y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 35,
        gravity: 120,
        size: 2 + Math.random() * 2,
        color: '#ffdd33',
        life: 0.5 + Math.random() * 0.4,
        maxLife: 0.9,
        alpha: 1.0
      });
    }

    for (let i = 0; i < 8; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.random() * (radius * 0.5);
      this.createSmokePuff(
        x + Math.cos(angle) * dist,
        y + Math.sin(angle) * dist,
        (Math.random() - 0.5) * 15 + this.windX,
        -25 - Math.random() * 20,
        14 + Math.random() * 10,
        'rgba(50, 52, 55, 0.7)'
      );
    }
  }

  createShockwave(x, y, maxRadius = 60, duration = 0.35, color = '#ffffff') {
    this.shockwaves.push({
      x: x,
      y: y,
      radius: 4,
      maxRadius: maxRadius,
      color: color,
      lineWidth: 4,
      life: duration,
      maxLife: duration
    });
  }

  createSmokePuff(x, y, vx = 0, vy = -20, size = 12, color = 'rgba(65, 68, 72, 0.6)') {
    this.particles.push({
      type: 'smoke',
      x: x,
      y: y,
      vx: vx,
      vy: vy,
      size: size,
      maxSize: size * 2.2,
      color: color,
      life: 0.7 + Math.random() * 0.5,
      maxLife: 1.2,
      alpha: 0.85
    });
  }

  createMuzzleFlash(x, y, angle, size = 16, type = 'yellow') {
    this.muzzleFlashes.push({
      x: x,
      y: y,
      angle: angle,
      size: size,
      type: type,
      life: 0.06,
      maxLife: 0.06
    });
  }

  createBulletCasing(x, y, angle, casingType = 'brass') {
    const ejectAngle = angle + Math.PI * 0.5 + (Math.random() - 0.5) * 0.4;
    const speed = 50 + Math.random() * 40;

    this.bulletCasings.push({
      x: x,
      y: y,
      vx: Math.cos(ejectAngle) * speed,
      vy: Math.sin(ejectAngle) * speed - 40,
      gravity: 300,
      rot: Math.random() * Math.PI * 2,
      spinSpeed: 15 + Math.random() * 20,
      bounces: 0,
      maxBounces: 2,
      color: casingType === 'heavy' ? '#d4ac0d' : '#f39c12',
      length: casingType === 'heavy' ? 6 : 4,
      width: 2,
      groundY: y + 15 + Math.random() * 10,
      life: 3.5,
      maxLife: 3.5
    });
  }

  createTeslaArc(x1, y1, x2, y2, options = {}) {
    const branches = options.branches !== undefined ? options.branches : 2;
    const duration = options.duration || 0.18;

    const generateJaggedPath = (sx, sy, ex, ey, displacement) => {
      const points = [{ x: sx, y: sy }];
      const subdivide = (p1, p2, disp, depth) => {
        if (depth <= 0) return;
        const midX = (p1.x + p2.x) / 2;
        const midY = (p1.y + p2.y) / 2;
        const normalX = -(p2.y - p1.y);
        const normalY = (p2.x - p1.x);
        const len = Math.hypot(normalX, normalY) || 1;

        const offset = (Math.random() - 0.5) * disp;
        const newPt = {
          x: midX + (normalX / len) * offset,
          y: midY + (normalY / len) * offset
        };

        subdivide(p1, newPt, disp * 0.6, depth - 1);
        points.push(newPt);
        subdivide(newPt, p2, disp * 0.6, depth - 1);
      };

      subdivide({ x: sx, y: sy }, { x: ex, y: ey }, displacement, 3);
      points.push({ x: ex, y: ey });
      return points;
    };

    const mainPoints = generateJaggedPath(x1, y1, x2, y2, 28);
    const subBranches = [];

    for (let b = 0; b < branches; b++) {
      const idx = 1 + Math.floor(Math.random() * (mainPoints.length - 2));
      const startPt = mainPoints[idx];
      const branchAngle = Math.atan2(y2 - y1, x2 - x1) + (Math.random() - 0.5) * 1.2;
      const branchDist = 18 + Math.random() * 25;
      const endPt = {
        x: startPt.x + Math.cos(branchAngle) * branchDist,
        y: startPt.y + Math.sin(branchAngle) * branchDist
      };
      subBranches.push(generateJaggedPath(startPt.x, startPt.y, endPt.x, endPt.y, 10));
    }

    this.teslaArcs.push({
      mainPoints: mainPoints,
      subBranches: subBranches,
      colorCore: '#ffffff',
      colorGlow: '#00f0ff',
      colorOuter: '#2277ff',
      life: duration,
      maxLife: duration
    });

    for (let i = 0; i < 5; i++) {
      const a = Math.random() * Math.PI * 2;
      const spd = 40 + Math.random() * 60;
      this.particles.push({
        type: 'spark',
        x: x2,
        y: y2,
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd,
        size: 2,
        color: '#00f0ff',
        life: 0.25,
        maxLife: 0.25,
        alpha: 1.0
      });
    }
  }

  createFlameCone(x, y, angle, range = 180, spread = 0.35, count = 4) {
    for (let i = 0; i < count; i++) {
      const pAngle = angle + (Math.random() - 0.5) * spread;
      const speed = 140 + Math.random() * (range * 0.9);

      this.particles.push({
        type: 'flame',
        x: x,
        y: y,
        vx: Math.cos(pAngle) * speed,
        vy: Math.sin(pAngle) * speed,
        size: 4 + Math.random() * 3,
        maxSize: 16 + Math.random() * 8,
        growth: 28,
        life: 0.45 + Math.random() * 0.2,
        maxLife: 0.65,
        alpha: 1.0
      });
    }
  }

  createZombieDismemberment(x, y, count = 6) {
    const gibTypes = ['head', 'arm', 'leg', 'ribs', 'flesh', 'flesh'];

    this.addBloodSplatter(x, y, { count: 16, radius: 45 });
    this.addBloodPool(x, y, 16);

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 40 + Math.random() * 110;
      const type = gibTypes[Math.floor(Math.random() * gibTypes.length)];

      this.flyingGibs.push({
        type: type,
        x: x,
        y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 50,
        gravity: 280,
        rotation: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 18,
        groundY: y + (Math.random() - 0.5) * 35,
        bloodTrailTimer: 0,
        life: 1.2
      });
    }
  }

  // =========================================================================
  // UPDATE CYCLE
  // =========================================================================

  update(dt) {
    // 1. Floating Combat Text
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i];
      ft.life -= dt;
      if (ft.life <= 0) {
        this.floatingTexts.splice(i, 1);
        continue;
      }

      ft.x += ft.vx * dt;
      ft.y += ft.vy * dt;
      ft.vy += ft.gravity * dt;

      ft.scale += (ft.targetScale - ft.scale) * Math.min(1.0, dt * 14);

      const progress = ft.life / ft.maxLife;
      ft.alpha = progress < 0.4 ? (progress / 0.4) : 1.0;
    }

    // 2. Flying Zombie Gibs
    for (let i = this.flyingGibs.length - 1; i >= 0; i--) {
      const gib = this.flyingGibs[i];
      gib.x += gib.vx * dt;
      gib.y += gib.vy * dt;
      gib.vy += gib.gravity * dt;
      gib.rotation += gib.rotSpeed * dt;

      gib.bloodTrailTimer += dt;
      if (gib.bloodTrailTimer >= 0.05) {
        gib.bloodTrailTimer = 0;
        this.addBloodSplatter(gib.x, gib.y, { count: 2, radius: 4, minSize: 1, maxSize: 3 });
      }

      if (gib.y >= gib.groundY && gib.vy > 0) {
        this.addGibDecal(gib.x, gib.y, gib.type, gib.rotation);
        this.addBloodSplatter(gib.x, gib.y, { count: 6, radius: 14 });
        this.flyingGibs.splice(i, 1);
      }
    }

    // 3. Bullet Casings
    for (let i = this.bulletCasings.length - 1; i >= 0; i--) {
      const bc = this.bulletCasings[i];
      bc.life -= dt;
      if (bc.life <= 0) {
        this.bulletCasings.splice(i, 1);
        continue;
      }

      if (bc.bounces < bc.maxBounces) {
        bc.x += bc.vx * dt;
        bc.y += bc.vy * dt;
        bc.vy += bc.gravity * dt;
        bc.rot += bc.spinSpeed * dt;

        if (bc.y >= bc.groundY && bc.vy > 0) {
          bc.bounces++;
          bc.vy = -bc.vy * 0.45;
          bc.vx *= 0.6;
          bc.spinSpeed *= 0.5;
        }
      }
    }

    // 4. Shockwaves
    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const sw = this.shockwaves[i];
      sw.life -= dt;
      if (sw.life <= 0) {
        this.shockwaves.splice(i, 1);
        continue;
      }
      const t = 1 - (sw.life / sw.maxLife);
      sw.radius = sw.maxRadius * Math.sin(t * Math.PI * 0.5);
    }

    // 5. Muzzle Flashes
    for (let i = this.muzzleFlashes.length - 1; i >= 0; i--) {
      const mf = this.muzzleFlashes[i];
      mf.life -= dt;
      if (mf.life <= 0) {
        this.muzzleFlashes.splice(i, 1);
      }
    }

    // 6. Tesla Lightning Arcs
    for (let i = this.teslaArcs.length - 1; i >= 0; i--) {
      const arc = this.teslaArcs[i];
      arc.life -= dt;
      if (arc.life <= 0) {
        this.teslaArcs.splice(i, 1);
      }
    }

    // 7. General Particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }

      p.x += p.vx * dt;
      p.y += p.vy * dt;

      if (p.gravity) {
        p.vy += p.gravity * dt;
      }

      const progress = p.life / p.maxLife;

      if (p.type === 'smoke') {
        p.size = Math.min(p.maxSize, p.size + dt * 14);
        p.alpha = progress * 0.7;
      } else if (p.type === 'fire') {
        p.size = Math.min(p.maxSize, p.size + dt * p.growth);
        p.alpha = Math.min(1.0, progress * 1.5);
      } else if (p.type === 'flame') {
        p.size = Math.min(p.maxSize, p.size + dt * p.growth);
        p.alpha = Math.min(1.0, progress * 1.8);
      } else if (p.type === 'spark') {
        p.alpha = progress;
      }
    }
  }

  // =========================================================================
  // RENDERING PIPELINE
  // =========================================================================

  renderGore(ctx) {
    if (this.goreCanvas) {
      ctx.drawImage(this.goreCanvas, 0, 0);
    }
  }

  renderGroundDecals(ctx) {
    ctx.save();
    for (let i = 0; i < this.bulletCasings.length; i++) {
      const bc = this.bulletCasings[i];
      ctx.save();
      ctx.translate(bc.x, bc.y);
      ctx.rotate(bc.rot);

      ctx.fillStyle = bc.color;
      ctx.fillRect(-bc.length / 2, -bc.width / 2, bc.length, bc.width);

      ctx.fillStyle = '#1e1e1e';
      ctx.fillRect(-bc.length / 2, -bc.width / 2, 1, bc.width);

      ctx.restore();
    }
    ctx.restore();
  }

  renderParticles(ctx) {
    ctx.save();

    // 1. Shockwaves
    for (let i = 0; i < this.shockwaves.length; i++) {
      const sw = this.shockwaves[i];
      const alpha = (sw.life / sw.maxLife);
      ctx.strokeStyle = sw.color;
      ctx.lineWidth = sw.lineWidth * alpha;
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(sw.x, sw.y, sw.radius, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1.0;

    // 2. Flying Zombie Gibs
    for (let i = 0; i < this.flyingGibs.length; i++) {
      const gib = this.flyingGibs[i];
      ctx.save();
      ctx.translate(gib.x, gib.y);
      ctx.rotate(gib.rotation);

      if (gib.type === 'head') {
        ctx.fillStyle = '#52694b';
        ctx.beginPath();
        ctx.arc(0, 0, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#8a0a0a';
        ctx.fillRect(-3, 3, 6, 3);
      } else if (gib.type === 'arm' || gib.type === 'leg') {
        ctx.fillStyle = '#475e41';
        ctx.fillRect(-3, -7, 6, 14);
        ctx.fillStyle = '#eae7dd';
        ctx.fillRect(-1.5, -9, 3, 3);
      } else {
        ctx.fillStyle = '#8a0a0a';
        ctx.fillRect(-4, -3, 8, 6);
      }

      ctx.restore();
    }

    // 3. Smoke Particles
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      if (p.type !== 'smoke') continue;

      ctx.fillStyle = p.color;
      ctx.globalAlpha = p.alpha;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }

    // 4. Fire & Flame Particles
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      if (p.type !== 'fire' && p.type !== 'flame') continue;

      ctx.globalAlpha = p.alpha;
      const progress = p.life / p.maxLife;

      let col = '#fffae6';
      if (progress < 0.25) col = '#661100';
      else if (progress < 0.5) col = '#cc3300';
      else if (progress < 0.75) col = '#ff7700';
      else if (progress < 0.9) col = '#ffdd00';

      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }

    // 5. Sparks
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      if (p.type !== 'spark') continue;

      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1.0;

    // 6. Tesla Lightning Arcs
    for (let i = 0; i < this.teslaArcs.length; i++) {
      const arc = this.teslaArcs[i];
      const alpha = arc.life / arc.maxLife;

      const drawPath = (pts, width, col) => {
        ctx.strokeStyle = col;
        ctx.lineWidth = width;
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        pts.forEach((pt, idx) => {
          if (idx === 0) ctx.moveTo(pt.x, pt.y);
          else ctx.lineTo(pt.x, pt.y);
        });
        ctx.stroke();
      };

      drawPath(arc.mainPoints, 6, arc.colorOuter);
      drawPath(arc.mainPoints, 3, arc.colorGlow);
      drawPath(arc.mainPoints, 1.5, arc.colorCore);

      arc.subBranches.forEach(branch => {
        drawPath(branch, 2, arc.colorGlow);
        drawPath(branch, 1, arc.colorCore);
      });
    }
    ctx.globalAlpha = 1.0;

    // 7. Muzzle Flashes
    for (let i = 0; i < this.muzzleFlashes.length; i++) {
      const mf = this.muzzleFlashes[i];
      ctx.save();
      ctx.translate(mf.x, mf.y);
      ctx.rotate(mf.angle);

      ctx.fillStyle = '#fffae6';
      ctx.beginPath();
      ctx.ellipse(mf.size * 0.4, 0, mf.size, mf.size * 0.45, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ff7b00';
      ctx.beginPath();
      ctx.moveTo(mf.size * 0.3, 0);
      ctx.lineTo(mf.size * 0.8, -mf.size * 0.6);
      ctx.lineTo(mf.size * 0.5, 0);
      ctx.lineTo(mf.size * 0.8, mf.size * 0.6);
      ctx.closePath();
      ctx.fill();

      ctx.restore();
    }

    ctx.restore();
  }

  renderText(ctx) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let i = 0; i < this.floatingTexts.length; i++) {
      const ft = this.floatingTexts[i];
      ctx.globalAlpha = ft.alpha;

      const currentSize = Math.round(ft.fontSize * ft.scale);
      ctx.font = `bold ${currentSize}px "Courier New", monospace`;

      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 3;
      ctx.strokeText(ft.text, ft.x, ft.y);

      ctx.fillStyle = ft.color;
      ctx.fillText(ft.text, ft.x, ft.y);
    }

    ctx.restore();
  }

  render(ctx) {
    this.renderGore(ctx);
    this.renderGroundDecals(ctx);
    this.renderParticles(ctx);
    this.renderText(ctx);
  }
}

if (typeof window !== 'undefined') {
  window.FXSystem = FXSystem;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { FXSystem };
}
