/**
 * map.js - Apocalyptic Zombie Defense Map Renderer
 * Recreates the ruined apocalyptic city matching the reference screenshot:
 * - Dark cracked stone paved winding road (with Entry A & Entry B)
 * - Ruined buildings, concrete rubble, debris, crates, barrels, sandbag barricades
 * - Green destroyed military tank wrecks
 * - Bomb craters in dirt and stone pavement
 * - Fortified wooden survivor house with barbed wire fence, sandbags, and skull flag
 * - Dedicated reinforced platform for "LAST STAND TOWER" gatling gun
 * - Overhead archways for Entry A and Entry B (rendered as foreground so zombies walk under)
 */

class GameMap {
  constructor(canvasWidth = 1280, canvasHeight = 720) {
    this.width = canvasWidth;
    this.height = canvasHeight;

    // Base Survivor HP
    this.maxBaseHp = 100;
    this.baseHp = 100;

    // Animation state
    this.animTime = 0;
    this.flagWaveOffset = 0;

    // Last Stand Tower Gatling state
    this.lastStandAngle = -Math.PI * 0.75; // Aiming towards road
    this.lastStandRecoil = 0;
    this.lastStandBarrelSpin = 0;
    this.lastStandHeat = 0;
    this.isLastStandFiring = false;

    // Dedicated platform location for Last Stand Tower matching screenshot
    this.lastStandPlatform = {
      x: 1160,
      y: 460,
      radius: 46
    };

    // Survivor Base Compound bounding box
    this.survivorBaseBounds = {
      x: 960,
      y: 30,
      width: 320,
      height: 440,
      gateX: 1040,
      gateY: 445
    };

    // Entry Waypoints & Archways matching screenshot
    this.entryA = { x: 0, y: 165, archX: 190, archY: 165 };
    this.entryB = { x: 0, y: 495, archX: 175, archY: 495 };

    // Common Serpentine Path
    this.waypointsCommon = [
      { x: 360, y: 350 },
      { x: 410, y: 260 },
      { x: 445, y: 195 },
      { x: 505, y: 195 },
      { x: 550, y: 250 },
      { x: 560, y: 380 },
      { x: 560, y: 470 },
      { x: 620, y: 525 },
      { x: 690, y: 510 },
      { x: 715, y: 400 },
      { x: 730, y: 280 },
      { x: 775, y: 215 },
      { x: 840, y: 215 },
      { x: 885, y: 265 },
      { x: 915, y: 375 },
      { x: 945, y: 445 },
      { x: 1040, y: 445 } // Survivor Base Gate
    ];

    // Complete Path A
    this.pathA = [
      { x: -30, y: 165 },
      { x: 70, y: 165 },
      { x: 190, y: 165 },
      { x: 275, y: 200 },
      { x: 285, y: 310 },
      { x: 300, y: 380 },
      ...this.waypointsCommon
    ];

    // Complete Path B
    this.pathB = [
      { x: -30, y: 495 },
      { x: 70, y: 495 },
      { x: 175, y: 495 },
      { x: 255, y: 460 },
      { x: 300, y: 380 },
      ...this.waypointsCommon
    ];

    // Canonical Tower Build Spots
    this.buildSpots = [
      { id: 'spot_1', x: 360, y: 340, radius: 26, name: 'Gunner Post 1', occupied: false },
      { id: 'spot_2', x: 475, y: 215, radius: 26, name: 'Gunner Post 2', occupied: false },
      { id: 'spot_3', x: 475, y: 475, radius: 26, name: 'Gunner Post 3', occupied: false },
      { id: 'spot_4', x: 605, y: 140, radius: 26, name: 'Sandbag Ridge Nest', occupied: false },
      { id: 'spot_5', x: 605, y: 440, radius: 28, name: 'Mortar Emplacement 1', occupied: false },
      { id: 'spot_6', x: 605, y: 610, radius: 26, name: 'Tesla Coil Pedestal', occupied: false },
      { id: 'spot_7', x: 800, y: 605, radius: 28, name: 'Mortar Emplacement 2', occupied: false },
      { id: 'spot_8', x: 630, y: 350, radius: 26, name: 'Center Bunker', occupied: false },
      { id: 'spot_9', x: 805, y: 350, radius: 26, name: 'Hairpin Bunker', occupied: false },
      { id: 'spot_10', x: 990, y: 200, radius: 26, name: 'Compound Outer Wall', occupied: false }
    ];

    // Pre-calculate path lengths
    this.pathALength = this._calculatePathLength(this.pathA);
    this.pathBLength = this._calculatePathLength(this.pathB);

    // Caching background & foreground canvases (works in browser & node environment)
    this._initCanvases();
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

  _initCanvases() {
    this.bgCanvas = this._createCanvas(this.width, this.height);
    this.fgCanvas = this._createCanvas(this.width, this.height);

    if (this.bgCanvas) {
      this.bgCtx = this.bgCanvas.getContext('2d');
      this._renderStaticBackground();
    }
    if (this.fgCanvas) {
      this.fgCtx = this.fgCanvas.getContext('2d');
      this._renderStaticForeground();
    }
  }

  // --- Path Geometry Utilities ---
  _calculatePathLength(points) {
    let total = 0;
    for (let i = 0; i < points.length - 1; i++) {
      const dx = points[i + 1].x - points[i].x;
      const dy = points[i + 1].y - points[i].y;
      total += Math.hypot(dx, dy);
    }
    return total;
  }

  getPointAlongPath(path, progress) {
    const clampedProgress = Math.max(0, Math.min(1, progress));
    const totalLen = this._calculatePathLength(path);
    let targetDist = clampedProgress * totalLen;

    let accumulated = 0;
    for (let i = 0; i < path.length - 1; i++) {
      const p1 = path[i];
      const p2 = path[i + 1];
      const segmentDist = Math.hypot(p2.x - p1.x, p2.y - p1.y);

      if (accumulated + segmentDist >= targetDist) {
        const segT = (targetDist - accumulated) / (segmentDist || 1);
        return {
          x: p1.x + (p2.x - p1.x) * segT,
          y: p1.y + (p2.y - p1.y) * segT,
          angle: Math.atan2(p2.y - p1.y, p2.x - p1.x)
        };
      }
      accumulated += segmentDist;
    }
    const last = path[path.length - 1];
    return { x: last.x, y: last.y, angle: 0 };
  }

  getPathA() { return this.pathA; }
  getPathB() { return this.pathB; }
  getBuildSpots() { return this.buildSpots; }
  getLastStandPlatform() { return this.lastStandPlatform; }

  // --- Static Rendering Engine (Offscreen Baked Layer) ---
  _renderStaticBackground() {
    if (!this.bgCtx) return;
    const ctx = this.bgCtx;
    ctx.imageSmoothingEnabled = false;

    // 1. Apocalyptic Distant Sky & Horizon
    this._drawSkyAndDistantRuins(ctx);

    // 2. Wasteland Dirt Ground with cracks, gravel, blast marks
    this._drawWastelandTerrain(ctx);

    // 3. Bomb craters in the dirt
    this._drawCraters(ctx);

    // 4. Stone Paved Winding Road (Dark cracked cobblestones)
    this._drawPavedRoad(ctx);

    // 5. Roadside Bomb Craters & Paver Fractures
    this._drawRoadDamage(ctx);

    // 6. Ruined Buildings & Concrete Rubble
    this._drawRuinedBuildings(ctx);

    // 7. Green Destroyed Military Tank Wrecks
    this._drawTankWrecks(ctx);

    // 8. Sandbag Barricades, Barrels, Crates & Debris
    this._drawDefensiveBarricades(ctx);

    // 9. Survivor Base: Perimeter Wall, Barbed Wire, Yard, Base House
    this._drawSurvivorCompound(ctx);

    // 10. Dedicated Last Stand Tower Platform Base
    this._drawLastStandPlatform(ctx);

    // 11. Entry Archway Bases & Concrete Pillars
    this._drawArchwayBases(ctx);
  }

  _renderStaticForeground() {
    if (!this.fgCtx) return;
    const ctx = this.fgCtx;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, this.width, this.height);

    // Overhead portions of Entry A and Entry B Archways (over which zombies walk under)
    this._drawArchwayOverheads(ctx);
  }

  // --- 1. Sky & Horizon ---
  _drawSkyAndDistantRuins(ctx) {
    const skyGrad = ctx.createLinearGradient(0, 0, 0, 160);
    skyGrad.addColorStop(0, '#383b40');
    skyGrad.addColorStop(0.5, '#555960');
    skyGrad.addColorStop(0.85, '#6e7278');
    skyGrad.addColorStop(1, '#5f6369');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, this.width, 160);

    ctx.fillStyle = 'rgba(35, 37, 40, 0.45)';
    const clouds = [
      { x: 120, y: 40, r: 50 }, { x: 180, y: 35, r: 65 }, { x: 240, y: 45, r: 45 },
      { x: 500, y: 30, r: 60 }, { x: 560, y: 25, r: 75 }, { x: 630, y: 35, r: 55 },
      { x: 880, y: 40, r: 55 }, { x: 940, y: 30, r: 70 }, { x: 1010, y: 45, r: 50 }
    ];
    clouds.forEach(c => {
      ctx.beginPath();
      ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.fillStyle = '#26282b';
    const buildings = [
      { x: 0, w: 45, h: 95 },
      { x: 40, w: 35, h: 115, broken: true },
      { x: 70, w: 55, h: 80 },
      { x: 130, w: 40, h: 130, spire: true },
      { x: 175, w: 50, h: 90 },
      { x: 230, w: 35, h: 105, broken: true },
      { x: 270, w: 60, h: 75 },
      { x: 420, w: 45, h: 100 },
      { x: 470, w: 55, h: 120, broken: true },
      { x: 530, w: 40, h: 85 },
      { x: 580, w: 50, h: 110, spire: true },
      { x: 640, w: 45, h: 80 },
      { x: 700, w: 60, h: 95 },
      { x: 770, w: 40, h: 115, broken: true },
      { x: 820, w: 50, h: 90 }
    ];

    buildings.forEach(b => {
      const topY = 150 - b.h;
      ctx.fillRect(b.x, topY, b.w, b.h);
      if (b.broken) {
        ctx.fillStyle = '#383b40';
        ctx.beginPath();
        ctx.moveTo(b.x, topY);
        ctx.lineTo(b.x + b.w * 0.4, topY + 18);
        ctx.lineTo(b.x + b.w * 0.7, topY + 6);
        ctx.lineTo(b.x + b.w, topY + 24);
        ctx.lineTo(b.x + b.w, topY);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#26282b';
      }
      if (b.spire) {
        ctx.fillRect(b.x + b.w / 2 - 2, topY - 18, 4, 18);
      }
      ctx.fillStyle = '#16181a';
      for (let wy = topY + 14; wy < 140; wy += 14) {
        for (let wx = b.x + 6; wx < b.x + b.w - 8; wx += 10) {
          if ((wx + wy) % 3 !== 0) {
            ctx.fillRect(wx, wy, 4, 7);
          }
        }
      }
      ctx.fillStyle = '#26282b';
    });

    ctx.fillStyle = '#35332f';
    ctx.beginPath();
    ctx.moveTo(0, 155);
    ctx.bezierCurveTo(250, 130, 500, 160, 750, 135);
    ctx.bezierCurveTo(900, 125, 1100, 150, 1280, 140);
    ctx.lineTo(1280, 165);
    ctx.lineTo(0, 165);
    ctx.closePath();
    ctx.fill();
  }

  // --- 2. Wasteland Dirt Ground ---
  _drawWastelandTerrain(ctx) {
    ctx.fillStyle = '#423d34';
    ctx.fillRect(0, 150, this.width, this.height - 150);

    const dirtPatches = [
      { x: 0, y: 150, w: 400, h: 570, color: '#3d372e' },
      { x: 380, y: 150, w: 450, h: 570, color: '#474136' },
      { x: 800, y: 150, w: 480, h: 570, color: '#3b352c' }
    ];
    dirtPatches.forEach(dp => {
      ctx.fillStyle = dp.color;
      ctx.fillRect(dp.x, dp.y, dp.w, dp.h);
    });

    ctx.fillStyle = '#544c3f';
    for (let i = 0; i < 900; i++) {
      const rx = (i * 137.5) % this.width;
      const ry = 150 + ((i * 73.1) % (this.height - 150));
      const size = (i % 3) + 1;
      ctx.fillRect(rx, ry, size, size);
    }

    ctx.fillStyle = '#2b261f';
    for (let i = 0; i < 700; i++) {
      const rx = (i * 197.3) % this.width;
      const ry = 150 + ((i * 111.7) % (this.height - 150));
      const size = (i % 2) + 1;
      ctx.fillRect(rx, ry, size, size);
    }
  }

  // --- 3. Bomb Craters in the Dirt ---
  _drawCraters(ctx) {
    const craters = [
      { x: 505, y: 375, rx: 32, ry: 20 },
      { x: 805, y: 555, rx: 42, ry: 26 },
      { x: 275, y: 145, rx: 25, ry: 16 },
      { x: 920, y: 145, rx: 28, ry: 18 },
      { x: 670, y: 640, rx: 36, ry: 22 }
    ];

    craters.forEach(cr => {
      ctx.fillStyle = '#1e1a16';
      ctx.beginPath();
      ctx.ellipse(cr.x, cr.y, cr.rx, cr.ry, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#110f0d';
      ctx.beginPath();
      ctx.ellipse(cr.x, cr.y + 2, cr.rx * 0.65, cr.ry * 0.65, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#524a3d';
      ctx.lineWidth = 3;
      ctx.stroke();

      ctx.strokeStyle = '#241f1a';
      ctx.lineWidth = 2;
      for (let a = 0; a < Math.PI * 2; a += 0.8) {
        ctx.beginPath();
        const startX = cr.x + Math.cos(a) * cr.rx;
        const startY = cr.y + Math.sin(a) * cr.ry;
        const endX = startX + Math.cos(a) * (10 + (Math.sin(a * 4) * 8));
        const endY = startY + Math.sin(a) * (6 + (Math.cos(a * 3) * 5));
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
        ctx.stroke();
      }
    });
  }

  // --- 4. Stone Paved Winding Road ---
  _drawPavedRoad(ctx) {
    const roadWidth = 68;

    const drawPathStrokes = (path) => {
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      ctx.strokeStyle = '#221e18';
      ctx.lineWidth = roadWidth + 14;
      ctx.beginPath();
      path.forEach((p, idx) => {
        if (idx === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.stroke();

      ctx.strokeStyle = '#47443f';
      ctx.lineWidth = roadWidth + 6;
      ctx.stroke();

      ctx.strokeStyle = '#323234';
      ctx.lineWidth = roadWidth;
      ctx.stroke();
    };

    drawPathStrokes(this.pathA);
    drawPathStrokes(this.pathB);

    const renderPaversOnPath = (path) => {
      const len = this._calculatePathLength(path);
      const step = 14;

      for (let d = 0; d < len; d += step) {
        const pt = this.getPointAlongPath(path, d / len);
        const normAngle = pt.angle + Math.PI / 2;

        for (let offset = -roadWidth / 2 + 8; offset <= roadWidth / 2 - 8; offset += 15) {
          const stoneX = pt.x + Math.cos(normAngle) * offset;
          const stoneY = pt.y + Math.sin(normAngle) * offset;

          const hash = Math.sin(stoneX * 12.9898 + stoneY * 78.233) * 43758.5453;
          const val = hash - Math.floor(hash);

          let stoneColor = '#353638';
          if (val > 0.7) stoneColor = '#414245';
          else if (val > 0.4) stoneColor = '#2b2c2e';
          else if (val > 0.2) stoneColor = '#4b4d51';

          ctx.fillStyle = stoneColor;
          ctx.beginPath();
          if (ctx.roundRect) ctx.roundRect(stoneX - 6, stoneY - 5, 12, 10, 2);
          else ctx.rect(stoneX - 6, stoneY - 5, 12, 10);
          ctx.fill();

          ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
          ctx.fillRect(stoneX - 5, stoneY - 5, 10, 2);

          ctx.fillStyle = '#1c1d1f';
          ctx.fillRect(stoneX - 5, stoneY + 3, 11, 2);
          ctx.fillRect(stoneX + 4, stoneY - 4, 2, 8);
        }
      }
    };

    renderPaversOnPath(this.pathA);
    renderPaversOnPath(this.pathB);

    const renderCurbsOnPath = (path) => {
      const len = this._calculatePathLength(path);
      for (let d = 0; d < len; d += 16) {
        const pt = this.getPointAlongPath(path, d / len);
        const normAngle = pt.angle + Math.PI / 2;

        [-roadWidth / 2, roadWidth / 2].forEach(side => {
          const cx = pt.x + Math.cos(normAngle) * side;
          const cy = pt.y + Math.sin(normAngle) * side;

          ctx.fillStyle = '#4c4a45';
          ctx.fillRect(cx - 3, cy - 3, 6, 6);
          ctx.fillStyle = '#22211e';
          ctx.fillRect(cx - 2, cy + 2, 5, 2);
        });
      }
    };

    renderCurbsOnPath(this.pathA);
    renderCurbsOnPath(this.pathB);
  }

  // --- 5. Road Damage & Bomb Fractures ---
  _drawRoadDamage(ctx) {
    const roadCracks = [
      { x: 360, y: 350 },
      { x: 560, y: 380 },
      { x: 715, y: 400 },
      { x: 885, y: 265 }
    ];

    roadCracks.forEach(pt => {
      ctx.fillStyle = 'rgba(15, 15, 17, 0.7)';
      ctx.beginPath();
      ctx.ellipse(pt.x, pt.y, 22, 14, 0.4, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#101011';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(pt.x - 14, pt.y - 8);
      ctx.lineTo(pt.x - 4, pt.y - 1);
      ctx.lineTo(pt.x + 3, pt.y - 5);
      ctx.lineTo(pt.x + 12, pt.y + 6);
      ctx.stroke();
    });
  }

  // --- 6. Ruined Buildings & Concrete Rubble ---
  _drawRuinedBuildings(ctx) {
    const drawRuinedBlock = (x, y, w, h, brickColor, concreteColor) => {
      ctx.fillStyle = brickColor;
      ctx.fillRect(x, y, w, h);

      ctx.fillStyle = concreteColor;
      ctx.fillRect(x - 4, y, w + 8, 12);

      ctx.fillStyle = '#35332f';
      for (let bx = x; bx < x + w; bx += 18) {
        const notchH = 8 + ((bx * 7) % 18);
        ctx.fillRect(bx, y, 10, notchH);
      }

      ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
      for (let r = y + 18; r < y + h; r += 10) {
        ctx.fillRect(x, r, w, 2);
        for (let c = x + ((r % 20) ? 0 : 8); c < x + w; c += 16) {
          ctx.fillRect(c, r, 2, 10);
        }
      }

      for (let wy = y + 26; wy < y + h - 18; wy += 32) {
        for (let wx = x + 12; wx < x + w - 20; wx += 28) {
          ctx.fillStyle = '#0f1011';
          ctx.fillRect(wx, wy, 16, 22);

          ctx.fillStyle = '#61462a';
          ctx.fillRect(wx - 2, wy + 8, 20, 4);
          ctx.fillStyle = '#4a351e';
          ctx.fillRect(wx, wy + 14, 17, 3);

          ctx.fillStyle = concreteColor;
          ctx.fillRect(wx - 2, wy - 3, 20, 3);
        }
      }

      ctx.strokeStyle = '#57493c';
      ctx.lineWidth = 2;
      [x + 10, x + 35, x + w - 15].forEach(rx => {
        ctx.beginPath();
        ctx.moveTo(rx, y + 2);
        ctx.lineTo(rx + 4, y - 10);
        ctx.lineTo(rx + 8, y - 16);
        ctx.stroke();
      });

      ctx.fillStyle = '#635e58';
      for (let i = 0; i < 16; i++) {
        const chunkX = x + (i * 11) % w;
        const chunkY = y + h - 6 + ((i * 5) % 16);
        ctx.fillRect(chunkX, chunkY, 10, 8);
        ctx.fillStyle = '#403c37';
        ctx.fillRect(chunkX + 1, chunkY + 6, 8, 2);
        ctx.fillStyle = '#7d776f';
        ctx.fillRect(chunkX + 1, chunkY, 8, 2);
      }
    };

    drawRuinedBlock(0, 75, 120, 85, '#52342b', '#706b64');
    drawRuinedBlock(180, 50, 160, 110, '#42322c', '#615c56');
    drawRuinedBlock(1150, 560, 130, 130, '#50392e', '#666159');
  }

  // --- 7. Green Destroyed Military Tank Wrecks ---
  _drawTankWrecks(ctx) {
    const drawTank = (x, y, angle, flipped = false) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      if (flipped) ctx.scale(1, -1);

      ctx.fillStyle = 'rgba(15, 14, 12, 0.6)';
      if (ctx.roundRect) ctx.beginPath(), ctx.roundRect(-42, -26, 84, 52, 6), ctx.fill();
      else ctx.fillRect(-42, -26, 84, 52);

      const drawTrack = (ty) => {
        ctx.fillStyle = '#1e1f20';
        if (ctx.roundRect) ctx.beginPath(), ctx.roundRect(-40, ty, 80, 14, 3), ctx.fill();
        else ctx.fillRect(-40, ty, 80, 14);

        for (let wx = -30; wx <= 30; wx += 15) {
          ctx.fillStyle = '#343638';
          ctx.beginPath();
          ctx.arc(wx, ty + 7, 5, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#141516';
          ctx.beginPath();
          ctx.arc(wx, ty + 7, 2, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.fillStyle = '#3d3f41';
        for (let tx = -38; tx <= 38; tx += 6) {
          ctx.fillRect(tx, ty, 2, 14);
        }
      };

      drawTrack(-25);
      drawTrack(11);

      ctx.fillStyle = '#374427';
      if (ctx.roundRect) ctx.beginPath(), ctx.roundRect(-34, -15, 68, 30, 4), ctx.fill();
      else ctx.fillRect(-34, -15, 68, 30);

      ctx.fillStyle = '#455531';
      ctx.fillRect(-32, -14, 64, 4);
      ctx.fillStyle = '#26301b';
      ctx.fillRect(-32, 11, 64, 3);

      ctx.fillStyle = '#2e3b21';
      ctx.beginPath();
      ctx.moveTo(-34, -15);
      ctx.lineTo(-44, -10);
      ctx.lineTo(-44, 10);
      ctx.lineTo(-34, 15);
      ctx.closePath();
      ctx.fill();

      ctx.save();
      ctx.translate(5, 0);
      ctx.rotate(-0.35);

      ctx.fillStyle = '#3b4a29';
      ctx.beginPath();
      ctx.ellipse(0, 0, 18, 14, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#222b17';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = '#1c2313';
      ctx.beginPath();
      ctx.arc(-4, -3, 5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#26301b';
      ctx.fillRect(-22, -4, 8, 8);

      ctx.fillStyle = '#374427';
      ctx.fillRect(-48, -3, 26, 6);
      ctx.fillStyle = '#1c2313';
      ctx.fillRect(-52, -4, 5, 8);

      ctx.fillStyle = 'rgba(15, 14, 12, 0.7)';
      ctx.beginPath();
      ctx.arc(6, 4, 10, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#5e381b';
      ctx.fillRect(-8, 5, 12, 3);
      ctx.fillRect(8, -8, 6, 2);

      ctx.restore();
      ctx.restore();
    };

    drawTank(275, 340, 0.28, false);
    drawTank(220, 560, -0.22, true);
  }

  // --- 8. Defensive Barricades, Sandbags, Crates, Barrels ---
  _drawDefensiveBarricades(ctx) {
    const drawSandbagWall = (startX, startY, count, angleStep, baseAngle) => {
      let curX = startX;
      let curY = startY;
      let curAngle = baseAngle;

      for (let i = 0; i < count; i++) {
        this._drawSingleSandbag(ctx, curX, curY, curAngle);
        this._drawSingleSandbag(ctx, curX + 2, curY - 5, curAngle);

        curX += Math.cos(curAngle) * 14;
        curY += Math.sin(curAngle) * 14;
        curAngle += angleStep;
      }
    };

    drawSandbagWall(630, 170, 9, 0.12, 0.1);
    drawSandbagWall(830, 440, 11, 0.18, 0.3);
    drawSandbagWall(210, 200, 4, 0, 0.1);
    drawSandbagWall(195, 530, 4, 0, -0.1);

    const drawCrate = (cx, cy, size = 20) => {
      ctx.fillStyle = 'rgba(15, 14, 12, 0.5)';
      ctx.fillRect(cx + 2, cy + 2, size, size);

      ctx.fillStyle = '#6e5130';
      ctx.fillRect(cx, cy, size, size);

      ctx.fillStyle = '#523a20';
      ctx.fillRect(cx, cy, size, 3);
      ctx.fillRect(cx, cy + size - 3, size, 3);
      ctx.fillRect(cx, cy, 3, size);
      ctx.fillRect(cx + size - 3, cy, 3, size);

      ctx.strokeStyle = '#523a20';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx + 2, cy + 2);
      ctx.lineTo(cx + size - 2, cy + size - 2);
      ctx.stroke();

      ctx.fillStyle = '#85623b';
      ctx.fillRect(cx + 3, cy + 3, size - 6, 2);
    };

    const drawBarrel = (bx, by, isRed = false) => {
      const mainCol = isRed ? '#7c2721' : '#354229';
      const darkCol = isRed ? '#4e1612' : '#222b1a';
      const lightCol = isRed ? '#9c342e' : '#455535';

      ctx.fillStyle = 'rgba(15, 14, 12, 0.5)';
      ctx.beginPath();
      ctx.ellipse(bx + 1, by + 12, 9, 4, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = mainCol;
      if (ctx.roundRect) ctx.beginPath(), ctx.roundRect(bx - 7, by - 6, 14, 18, 2), ctx.fill();
      else ctx.fillRect(bx - 7, by - 6, 14, 18);

      ctx.fillStyle = darkCol;
      ctx.fillRect(bx - 7, by - 2, 14, 2);
      ctx.fillRect(bx - 7, by + 5, 14, 2);

      ctx.fillStyle = lightCol;
      ctx.beginPath();
      ctx.ellipse(bx, by - 6, 7, 3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = darkCol;
      ctx.beginPath();
      ctx.arc(bx + 2, by - 6, 1.5, 0, Math.PI * 2);
      ctx.fill();
    };

    drawCrate(440, 165, 22);
    drawCrate(465, 165, 20);
    drawCrate(452, 145, 19);

    drawBarrel(500, 170, false);
    drawBarrel(512, 168, true);

    drawCrate(760, 250, 20);
    drawCrate(778, 255, 18);

    drawBarrel(762, 275, true);
    drawBarrel(775, 278, false);

    // Mortar Gun in Bomb Crater (805, 555)
    ctx.save();
    ctx.translate(805, 555);
    ctx.fillStyle = '#1e1f21';
    ctx.beginPath();
    ctx.ellipse(0, 4, 14, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.rotate(-0.85);
    ctx.fillStyle = '#343d27';
    ctx.fillRect(-5, -24, 10, 26);
    ctx.fillStyle = '#181e13';
    ctx.beginPath();
    ctx.arc(0, -24, 5, Math.PI, 0);
    ctx.fill();
    ctx.strokeStyle = '#1e1f21';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-4, -10);
    ctx.lineTo(-12, 8);
    ctx.moveTo(4, -10);
    ctx.lineTo(12, 8);
    ctx.stroke();
    ctx.restore();
  }

  _drawSingleSandbag(ctx, x, y, angle) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    ctx.fillStyle = 'rgba(15, 14, 12, 0.4)';
    if (ctx.roundRect) ctx.beginPath(), ctx.roundRect(-8, 1, 16, 8, 3), ctx.fill();
    else ctx.fillRect(-8, 1, 16, 8);

    ctx.fillStyle = '#8f7c5b';
    if (ctx.roundRect) ctx.beginPath(), ctx.roundRect(-8, -3, 16, 7, 3), ctx.fill();
    else ctx.fillRect(-8, -3, 16, 7);

    ctx.fillStyle = '#a69270';
    ctx.fillRect(-7, -3, 14, 2);

    ctx.fillStyle = '#6b5b40';
    ctx.fillRect(-8, 2, 16, 2);

    ctx.fillStyle = '#50432e';
    ctx.fillRect(7, -1, 2, 3);

    ctx.restore();
  }

  // --- 9. Survivor Base Compound (Top-Right) ---
  _drawSurvivorCompound(ctx) {
    const base = this.survivorBaseBounds;

    ctx.fillStyle = '#353028';
    ctx.fillRect(base.x, base.y, base.width, base.height);

    ctx.fillStyle = 'rgba(10, 10, 10, 0.5)';
    ctx.fillRect(base.x - 6, base.y, 8, base.height);

    const drawFenceSegment = (x1, y1, x2, y2) => {
      ctx.strokeStyle = '#504c46';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      const dist = Math.hypot(x2 - x1, y2 - y1);
      const posts = Math.floor(dist / 24);
      for (let p = 0; p <= posts; p++) {
        const t = p / (posts || 1);
        const px = x1 + (x2 - x1) * t;
        const py = y1 + (y2 - y1) * t;

        ctx.fillStyle = '#6b543a';
        ctx.fillRect(px - 2, py - 24, 5, 26);
        ctx.fillStyle = '#40301f';
        ctx.fillRect(px - 2, py - 24, 2, 26);

        ctx.strokeStyle = '#8d9197';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(px, py - 26, 6, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.strokeStyle = '#65696e';
      ctx.lineWidth = 1;
      for (let h = -22; h <= -6; h += 7) {
        ctx.beginPath();
        ctx.moveTo(x1, y1 + h);
        ctx.lineTo(x2, y2 + h);
        ctx.stroke();
      }
    };

    drawFenceSegment(base.x + 10, base.y, base.x + 10, base.gateY - 40);
    drawFenceSegment(base.x + 10, base.gateY + 40, base.x + 10, base.y + base.height);

    ctx.fillStyle = '#292f35';
    ctx.fillRect(base.x + 6, base.gateY - 38, 8, 76);
    for (let sy = base.gateY - 36; sy < base.gateY + 36; sy += 12) {
      ctx.fillStyle = '#d4ac0d';
      ctx.fillRect(base.x + 6, sy, 8, 6);
    }

    // Survivor Garden (Post-apocalyptic vegetable patch)
    const gx = base.x + 40;
    const gy = base.y + 160;
    const gw = 120;
    const gh = 90;
    
    // Soil
    ctx.fillStyle = '#2a1e12';
    ctx.fillRect(gx, gy, gw, gh);
    ctx.fillStyle = '#3a2818';
    for(let r=0; r<4; r++) {
      ctx.fillRect(gx + 5, gy + 10 + r*20, gw - 10, 10);
    }
    
    // Crops (Cabbages / Pumpkins)
    for(let r=0; r<4; r++) {
      for(let c=0; c<6; c++) {
        if (Math.random() < 0.2) continue; // missing crops
        const cx = gx + 15 + c*16 + (Math.random()*4-2);
        const cy = gy + 15 + r*20 + (Math.random()*4-2);
        
        const isPumpkin = Math.random() < 0.3;
        if (isPumpkin) {
          ctx.fillStyle = '#e65100'; // pumpkin orange
          ctx.beginPath(); ctx.arc(cx, cy, 4, 0, Math.PI*2); ctx.fill();
          ctx.fillStyle = '#2e7d32'; // stem
          ctx.fillRect(cx-1, cy-5, 2, 3);
        } else {
          ctx.fillStyle = '#43a047'; // cabbage green
          ctx.beginPath(); ctx.arc(cx, cy, 3.5, 0, Math.PI*2); ctx.fill();
          ctx.fillStyle = '#81c784'; // leaf highlights
          ctx.beginPath(); ctx.arc(cx-1, cy-1, 1.5, 0, Math.PI*2); ctx.fill();
        }
      }
    }
    
    // Tiny wooden fence around garden
    ctx.strokeStyle = '#594734';
    ctx.lineWidth = 2;
    ctx.strokeRect(gx, gy, gw, gh);

    const hx = 1060;
    const hy = 60;
    const hw = 190;
    const hh = 160;

    // Drop Shadow
    ctx.fillStyle = 'rgba(10, 10, 10, 0.6)';
    ctx.fillRect(hx + 15, hy + 25, hw, hh + 20);

    // Main Building (Concrete Base Layer)
    ctx.fillStyle = '#6e7780';
    ctx.fillRect(hx, hy + 80, hw, hh - 80);
    // Concrete texture lines
    ctx.fillStyle = '#555d66';
    for (let i = 0; i < 5; i++) {
      ctx.fillRect(hx, hy + 90 + i * 15, hw, 2);
    }

    // Upper Floor (Wooden Fortress)
    ctx.fillStyle = '#594734';
    ctx.fillRect(hx - 10, hy + 40, hw + 20, 50);
    ctx.fillStyle = '#423324';
    for (let py = hy + 44; py < hy + 90; py += 6) {
      ctx.fillRect(hx - 10, py, hw + 20, 1.5); // Wood planks
    }
    // Wooden Support Beams
    ctx.fillStyle = '#302419';
    ctx.fillRect(hx - 10, hy + 86, hw + 20, 6); // Bottom rim
    ctx.fillRect(hx - 10, hy + 40, hw + 20, 6); // Top rim
    ctx.fillRect(hx - 5, hy + 40, 8, 50);       // Left pillar
    ctx.fillRect(hx + hw + -3, hy + 40, 8, 50); // Right pillar
    ctx.fillRect(hx + hw/2 - 4, hy + 40, 8, 50);// Center pillar

    // Steel Roof
    ctx.fillStyle = '#2e3034';
    ctx.beginPath();
    ctx.moveTo(hx - 20, hy + 40);
    ctx.lineTo(hx + hw / 2, hy);
    ctx.lineTo(hx + hw + 20, hy + 40);
    ctx.closePath();
    ctx.fill();
    // Roof ridges
    ctx.strokeStyle = '#1a1b1d';
    ctx.lineWidth = 3;
    for (let rx = hx - 10; rx < hx + hw + 10; rx += 15) {
      ctx.beginPath();
      ctx.moveTo(rx, hy + 40);
      const topX = hx + hw / 2;
      const t = Math.abs(rx - topX) / (hw/2 + 20);
      ctx.lineTo(rx + (topX - rx) * 0.9, hy + t*40);
      ctx.stroke();
    }
    ctx.fillStyle = '#1e1f21';
    ctx.fillRect(hx - 22, hy + 38, hw + 44, 6); // Roof edge

    // Chimney
    ctx.fillStyle = '#502c22';
    ctx.fillRect(hx + hw - 40, hy - 20, 24, 46);
    ctx.fillStyle = '#351b14';
    ctx.fillRect(hx + hw - 42, hy - 22, 28, 6);

    // Glowing Windows on Upper Floor
    const houseWindows = [
      { x: hx + 15, y: hy + 50 },
      { x: hx + 55, y: hy + 50 },
      { x: hx + 115, y: hy + 50 },
      { x: hx + 155, y: hy + 50 }
    ];

    houseWindows.forEach(w => {
      ctx.fillStyle = '#161718'; // Frame
      ctx.fillRect(w.x, w.y, 20, 24);
      // Glow
      ctx.fillStyle = '#ffb74d';
      ctx.fillRect(w.x + 2, w.y + 2, 16, 20);
      // Glass
      ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.beginPath(); ctx.moveTo(w.x+4, w.y+4); ctx.lineTo(w.x+12, w.y+4); ctx.lineTo(w.x+4, w.y+12); ctx.fill();
      
      // Iron Bars over windows
      ctx.fillStyle = '#222';
      ctx.fillRect(w.x + 8, w.y, 4, 24);
      ctx.fillRect(w.x, w.y + 10, 20, 4);
    });

    // Reinforced Steel Gate (Ground Floor)
    const gx = hx + hw/2 - 25;
    const gy = hy + 90;
    ctx.fillStyle = '#2d333b';
    ctx.fillRect(gx, gy, 50, 70);
    ctx.fillStyle = '#444c56';
    ctx.fillRect(gx - 4, gy + 20, 58, 10);
    ctx.fillRect(gx - 4, gy + 40, 58, 10);
    
    // Warning Sign above Gate
    ctx.fillStyle = '#d32f2f';
    ctx.fillRect(gx - 10, gy - 12, 70, 16);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 10px monospace';
    ctx.fillText("KEEP OUT", gx - 3, gy - 1);

    // Radio Antenna on Roof
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(hx + 30, hy + 10); ctx.lineTo(hx + 30, hy - 50); ctx.stroke();
    ctx.fillStyle = '#ff3d00'; // Blinking red light
    ctx.beginPath(); ctx.arc(hx + 30, hy - 50, 4, 0, Math.PI * 2); ctx.fill();
    // Antenna dish
    ctx.strokeStyle = '#444';
    ctx.beginPath(); ctx.arc(hx + 30, hy - 35, 12, Math.PI, Math.PI * 2); ctx.stroke();

    // Skull Flag
    ctx.fillStyle = '#111';
    ctx.fillRect(hx + hw - 60, hy - 40, 45, 30);
    ctx.fillStyle = '#eee';
    ctx.beginPath();
    ctx.arc(hx + hw - 37, hy - 25, 7, 0, Math.PI*2); // skull head
    ctx.fillRect(hx + hw - 41, hy - 20, 8, 5); // skull teeth
    ctx.fill();

    // Sandbag Barricade Perimeter (Curved around the front)
    for (let sbx = hx - 20; sbx < hx + hw + 20; sbx += 16) {
      // Offset Y based on X to make a slight curve
      let curve = Math.abs(sbx - (hx + hw/2)) * 0.1;
      this._drawSingleSandbag(ctx, sbx, hy + hh - 4 + curve, 0);
      this._drawSingleSandbag(ctx, sbx + 4, hy + hh - 12 + curve, 0);
      this._drawSingleSandbag(ctx, sbx - 4, hy + hh - 20 + curve, 0);
    }
  }

  // --- 10. Dedicated Reinforced Platform for "LAST STAND TOWER" ---
  _drawLastStandPlatform(ctx) {
    const plat = this.lastStandPlatform;

    ctx.fillStyle = 'rgba(15, 14, 12, 0.65)';
    ctx.beginPath();
    ctx.ellipse(plat.x + 4, plat.y + 8, plat.radius + 6, (plat.radius + 6) * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#484a4e';
    ctx.beginPath();
    ctx.ellipse(plat.x, plat.y, plat.radius, plat.radius * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#595c62';
    ctx.beginPath();
    ctx.ellipse(plat.x, plat.y - 4, plat.radius - 6, (plat.radius - 6) * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#262729';
    ctx.lineWidth = 3;
    ctx.stroke();

    for (let r = 0; r < Math.PI * 2; r += 0.45) {
      const rx = plat.x + Math.cos(r) * (plat.radius - 8);
      const ry = plat.y - 4 + Math.sin(r) * ((plat.radius - 8) * 0.7);
      ctx.fillStyle = '#1e1f21';
      ctx.beginPath();
      ctx.arc(rx, ry, 2, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.strokeStyle = '#c5a00c';
    ctx.lineWidth = 2;
    if (ctx.setLineDash) ctx.setLineDash([6, 6]);
    ctx.stroke();
    if (ctx.setLineDash) ctx.setLineDash([]);

    ctx.fillStyle = '#242629';
    ctx.beginPath();
    ctx.arc(plat.x, plat.y - 4, 18, 0, Math.PI * 2);
    ctx.fill();
  }

  // --- 11. Entry Archways (Ground Bases) ---
  _drawArchwayBases(ctx) {
    const drawPillars = (archX, archY, width, height) => {
      ctx.fillStyle = '#3d4044';
      ctx.fillRect(archX - width / 2 - 14, archY - height / 2, 16, height);
      ctx.fillStyle = '#25282b';
      ctx.fillRect(archX - width / 2 - 14, archY + height / 2 - 6, 16, 6);

      ctx.fillStyle = '#3d4044';
      ctx.fillRect(archX + width / 2 - 2, archY - height / 2, 16, height);
      ctx.fillStyle = '#25282b';
      ctx.fillRect(archX + width / 2 - 2, archY + height / 2 - 6, 16, 6);
    };

    drawPillars(this.entryA.archX, this.entryA.archY, 52, 90);
    drawPillars(this.entryB.archX, this.entryB.archY, 52, 90);
  }

  // --- Overhead Archways (Rendered above walking zombies) ---
  _drawArchwayOverheads(ctx) {
    const drawArchHeader = (archX, archY, titleText, colorText = '#ffcc00') => {
      const archW = 84;
      const topY = archY - 70;

      ctx.fillStyle = '#2b2e32';
      ctx.fillRect(archX - archW / 2, topY, archW, 26);

      ctx.strokeStyle = '#181a1c';
      ctx.lineWidth = 2;
      ctx.strokeRect(archX - archW / 2, topY, archW, 26);

      const signW = 74;
      const signH = 20;
      ctx.fillStyle = '#16181a';
      ctx.fillRect(archX - signW / 2, topY + 3, signW, signH);
      ctx.strokeStyle = '#575b61';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(archX - signW / 2, topY + 3, signW, signH);

      ctx.fillStyle = '#c5a00c';
      ctx.fillRect(archX - signW / 2 + 2, topY + 5, 8, signH - 4);
      ctx.fillRect(archX + signW / 2 - 10, topY + 5, 8, signH - 4);

      ctx.font = 'bold 11px "Courier New", monospace';
      ctx.fillStyle = colorText;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(titleText, archX, topY + signH / 2 + 3);

      [-28, 28].forEach(sx => {
        ctx.fillStyle = '#484c52';
        ctx.fillRect(archX + sx - 3, topY + 24, 6, 6);
        ctx.fillStyle = '#ffea00';
        ctx.beginPath();
        ctx.arc(archX + sx, topY + 28, 3, 0, Math.PI * 2);
        ctx.fill();
      });

      ctx.strokeStyle = '#7c8086';
      ctx.lineWidth = 1.5;
      for (let rx = archX - archW / 2 + 6; rx <= archX + archW / 2 - 6; rx += 10) {
        ctx.beginPath();
        ctx.arc(rx, topY - 3, 5, 0, Math.PI * 2);
        ctx.stroke();
      }
    };

    drawArchHeader(this.entryA.archX, this.entryA.archY, 'ENTRY A', '#ffd13b');
    drawArchHeader(this.entryB.archX, this.entryB.archY, 'ENTRY B', '#ffd13b');
  }

  // --- Dynamic Elements: Skull Flag, Gatling Turret, HUD Labels ---

  _drawSkullFlag(ctx) {
    const poleX = 1072;
    const poleY = 40;
    const flagW = 42;
    const flagH = 26;

    ctx.strokeStyle = '#9499a0';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(poleX, poleY + 50);
    ctx.lineTo(poleX, poleY - 26);
    ctx.stroke();

    ctx.fillStyle = '#f1c40f';
    ctx.beginPath();
    ctx.arc(poleX, poleY - 26, 3.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(poleX, poleY - 24);

    const wave1 = Math.sin(this.flagWaveOffset) * 3;
    const wave2 = Math.cos(this.flagWaveOffset * 1.3) * 4;

    ctx.fillStyle = '#111214';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(flagW * 0.4, wave1, flagW * 0.7, -wave2, flagW, wave1 * 0.8);
    ctx.lineTo(flagW, flagH + wave1 * 0.8);
    ctx.bezierCurveTo(flagW * 0.7, flagH - wave2, flagW * 0.4, flagH + wave1, 0, flagH);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#7a7e84';
    ctx.fillRect(0, 2, 2, 3);
    ctx.fillRect(0, flagH - 5, 2, 3);

    const skullX = flagW * 0.45 + wave1 * 0.4;
    const skullY = flagH * 0.48;

    ctx.fillStyle = '#edf0f4';
    ctx.beginPath();
    ctx.arc(skullX, skullY - 3, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(skullX - 3, skullY + 1, 6, 4);

    ctx.fillStyle = '#111214';
    ctx.fillRect(skullX - 3, skullY - 4, 2, 2);
    ctx.fillRect(skullX + 1, skullY - 4, 2, 2);

    ctx.strokeStyle = '#edf0f4';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(skullX - 8, skullY + 5);
    ctx.lineTo(skullX + 8, skullY - 5);
    ctx.moveTo(skullX - 8, skullY - 5);
    ctx.lineTo(skullX + 8, skullY + 5);
    ctx.stroke();

    ctx.restore();
  }

  _drawSurvivorBaseHud(ctx) {
    const hudX = 1175;
    const hudY = 560;

    ctx.save();
    ctx.textAlign = 'center';

    ctx.font = 'bold 15px "Courier New", monospace';
    ctx.fillStyle = '#0a0a0a';
    ctx.fillText('SURVIVOR BASE', hudX + 1, hudY - 21);
    ctx.fillText('SURVIVOR BASE', hudX, hudY - 21);
    ctx.fillStyle = '#e8ecf0';
    ctx.fillText('SURVIVOR BASE', hudX, hudY - 22);

    const badgeW = 195;
    const badgeH = 24;
    const bx = hudX - badgeW / 2;
    const by = hudY - 14;

    ctx.fillStyle = '#151719';
    ctx.fillRect(bx, by, badgeW, badgeH);
    ctx.strokeStyle = '#292d31';
    ctx.lineWidth = 2;
    ctx.strokeRect(bx, by, badgeW, badgeH);

    const hpRatio = Math.max(0, Math.min(1, this.baseHp / this.maxBaseHp));
    const innerW = badgeW - 8;
    const innerH = badgeH - 8;

    ctx.fillStyle = '#1e0a0a';
    ctx.fillRect(bx + 4, by + 4, innerW, innerH);

    let hpColor = '#2ecc71';
    if (hpRatio < 0.3) hpColor = '#e74c3c';
    else if (hpRatio < 0.6) hpColor = '#f39c12';

    ctx.fillStyle = hpColor;
    ctx.fillRect(bx + 4, by + 4, innerW * hpRatio, innerH);

    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    for (let sy = by + 5; sy < by + 4 + innerH; sy += 2) {
      ctx.fillRect(bx + 4, sy, innerW * hpRatio, 1);
    }

    ctx.strokeStyle = '#39ff14';
    ctx.lineWidth = 1;
    ctx.strokeRect(bx + 2, by + 2, badgeW - 4, badgeH - 4);

    ctx.font = 'bold 11px "Courier New", monospace';
    ctx.fillStyle = '#000000';
    ctx.fillText(`HOME DEFENSE - HP: ${Math.ceil(this.baseHp)}/${this.maxBaseHp}`, hudX + 1, by + badgeH / 2 + 4);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`HOME DEFENSE - HP: ${Math.ceil(this.baseHp)}/${this.maxBaseHp}`, hudX, by + badgeH / 2 + 3);

    ctx.restore();
  }

  _drawLastStandTower(ctx) {
    const plat = this.lastStandPlatform;

    ctx.save();
    ctx.translate(plat.x, plat.y - 4);

    ctx.font = 'bold 12px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#0e0f11';
    ctx.fillText('LAST STAND TOWER', 0, -42);
    ctx.fillStyle = '#edf1f5';
    ctx.fillText('LAST STAND TOWER', 0, -43);

    ctx.rotate(this.lastStandAngle);

    const recoilDist = this.lastStandRecoil;

    ctx.fillStyle = '#35393f';
    if (ctx.roundRect) ctx.beginPath(), ctx.roundRect(-24 + recoilDist, -18, 28, 36, 4), ctx.fill();
    else ctx.fillRect(-24 + recoilDist, -18, 28, 36);

    ctx.strokeStyle = '#1b1d1f';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#242629';
    ctx.beginPath();
    ctx.ellipse(-8 + recoilDist, 20, 10, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#43464c';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = '#c5a00c';
    for (let b = 8; b <= 18; b += 4) {
      ctx.fillRect(-10 + recoilDist, b, 6, 2.5);
    }

    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(-2 + recoilDist, -18, 12, 5);
    ctx.fillStyle = '#e74c3c';
    ctx.beginPath();
    ctx.arc(10 + recoilDist, -15.5, 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#1e1f22';
    ctx.beginPath();
    ctx.arc(8 + recoilDist, 0, 11, 0, Math.PI * 2);
    ctx.fill();

    const barrelLen = 38;
    const barrelRadius = 8;
    const numBarrels = 6;

    for (let b = 0; b < numBarrels; b++) {
      const bAngle = (b / numBarrels) * Math.PI * 2 + this.lastStandBarrelSpin;
      const byOffset = Math.sin(bAngle) * barrelRadius;

      let barrelCol = '#4f535a';
      if (this.lastStandHeat > 0.3) {
        barrelCol = `rgb(${Math.floor(90 + this.lastStandHeat * 150)}, 60, 50)`;
      }

      ctx.fillStyle = barrelCol;
      ctx.fillRect(8 + recoilDist, byOffset - 2, barrelLen, 4);

      ctx.fillStyle = '#1f2022';
      ctx.fillRect(8 + recoilDist + 16, byOffset - 2.5, 3, 5);
      ctx.fillRect(8 + recoilDist + barrelLen - 4, byOffset - 2.5, 4, 5);
    }

    if (this.isLastStandFiring) {
      ctx.fillStyle = '#fff4a3';
      ctx.beginPath();
      ctx.arc(8 + barrelLen + 4, 0, 10 + Math.random() * 6, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ff7b00';
      ctx.beginPath();
      ctx.arc(8 + barrelLen + 2, 0, 6, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  // --- Main Render Cycle ---
  update(dt) {
    this.animTime += dt;
    this.flagWaveOffset += dt * 5;

    if (this.lastStandRecoil > 0) {
      this.lastStandRecoil = Math.max(0, this.lastStandRecoil - dt * 25);
    }
    if (this.lastStandHeat > 0) {
      this.lastStandHeat = Math.max(0, this.lastStandHeat - dt * 0.4);
    }
    if (this.isLastStandFiring) {
      this.lastStandBarrelSpin += dt * 35;
      this.lastStandRecoil = 3.5;
      this.lastStandHeat = Math.min(1.0, this.lastStandHeat + dt * 0.8);
    } else {
      this.lastStandBarrelSpin += dt * 1.5;
    }
  }

  setLastStandState(angle, isFiring) {
    if (angle !== undefined && angle !== null) {
      this.lastStandAngle = angle;
    }
    this.isLastStandFiring = !!isFiring;
  }

  damageBase(amount) {
    this.baseHp = Math.max(0, this.baseHp - amount);
    return this.baseHp <= 0;
  }

  repairBase(amount) {
    this.baseHp = Math.min(this.maxBaseHp, this.baseHp + amount);
  }

  renderBackground(ctx) {
    if (this.bgCanvas) {
      ctx.drawImage(this.bgCanvas, 0, 0);
    } else {
      this._renderStaticBackground();
    }

    this._drawSkullFlag(ctx);
    this._drawLastStandTower(ctx);
    this._drawSurvivorBaseHud(ctx);
  }

  renderForeground(ctx) {
    if (this.fgCanvas) {
      ctx.drawImage(this.fgCanvas, 0, 0);
    } else {
      this._renderStaticForeground();
    }
  }

  renderBuildSpots(ctx, hoveredSpotId = null) {
    ctx.save();
    this.buildSpots.forEach(spot => {
      const isHovered = (spot.id === hoveredSpotId);

      ctx.beginPath();
      ctx.arc(spot.x, spot.y, spot.radius + (isHovered ? 4 : 0), 0, Math.PI * 2);

      if (spot.occupied) {
        ctx.fillStyle = 'rgba(180, 40, 40, 0.25)';
        ctx.strokeStyle = 'rgba(220, 50, 50, 0.8)';
      } else if (isHovered) {
        ctx.fillStyle = 'rgba(46, 204, 113, 0.4)';
        ctx.strokeStyle = '#2ecc71';
      } else {
        ctx.fillStyle = 'rgba(241, 196, 15, 0.2)';
        ctx.strokeStyle = 'rgba(241, 196, 15, 0.75)';
      }

      ctx.lineWidth = isHovered ? 3 : 2;
      if (ctx.setLineDash) ctx.setLineDash([4, 4]);
      ctx.fill();
      ctx.stroke();
      if (ctx.setLineDash) ctx.setLineDash([]);

      ctx.strokeStyle = spot.occupied ? '#e74c3c' : (isHovered ? '#2ecc71' : '#f1c40f');
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(spot.x - 8, spot.y);
      ctx.lineTo(spot.x + 8, spot.y);
      ctx.moveTo(spot.x - 8, spot.y - 8);
      ctx.lineTo(spot.x, spot.y + 8);
      ctx.stroke();
    });
    ctx.restore();
  }

  renderMiniMap(ctx, x, y, width, height, enemies = [], towers = []) {
    ctx.save();
    ctx.fillStyle = '#151719';
    ctx.fillRect(x, y, width, height);
    ctx.strokeStyle = '#3e4248';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, width, height);

    const scaleX = width / this.width;
    const scaleY = height / this.height;

    const drawRadarPath = (path) => {
      ctx.strokeStyle = '#4a4d52';
      ctx.lineWidth = 5;
      ctx.beginPath();
      path.forEach((p, idx) => {
        const mx = x + p.x * scaleX;
        const my = y + p.y * scaleY;
        if (idx === 0) ctx.moveTo(mx, my);
        else ctx.lineTo(mx, my);
      });
      ctx.stroke();
    };

    drawRadarPath(this.pathA);
    drawRadarPath(this.pathB);

    ctx.fillStyle = '#2ecc71';
    ctx.fillRect(x + 1060 * scaleX, y + 80 * scaleY, 20 * scaleX, 20 * scaleY);

    towers.forEach(t => {
      ctx.fillStyle = '#00f0ff';
      ctx.beginPath();
      ctx.arc(x + t.x * scaleX, y + t.y * scaleY, 3, 0, Math.PI * 2);
      ctx.fill();
    });

    enemies.forEach(e => {
      ctx.fillStyle = '#ff3333';
      ctx.beginPath();
      ctx.arc(x + e.x * scaleX, y + e.y * scaleY, 2, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.restore();
  }
}

if (typeof window !== 'undefined') {
  window.GameMap = GameMap;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { GameMap };
}
