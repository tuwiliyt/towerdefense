/**
 * ZOMBIE TOWER DEFENSE - MASTER GAME ENGINE (js/main.js)
 * Coordinates UI, Map, Towers, Zombies, Audio, FX, Minimap Radar, and Player Controls.
 */

// Road Waypoint Paths matching Screenshot (Entry A & Entry B)
const PATH_ENTRY_A = [
  { x: 70, y: 165 },
  { x: 190, y: 165 },
  { x: 275, y: 200 },
  { x: 285, y: 310 },
  { x: 300, y: 380 },
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
  { x: 1040, y: 445 }
];

const PATH_ENTRY_B = [
  { x: 70, y: 495 },
  { x: 175, y: 495 },
  { x: 255, y: 460 },
  { x: 300, y: 380 },
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
  { x: 1040, y: 445 }
];

function dist2D(x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}

// Ensure TOWER_DEFINITIONS is accessible
const getTowerDef = (key) => {
  const defs = (typeof window !== 'undefined' && window.TOWER_DEFINITIONS) ? window.TOWER_DEFINITIONS : {};
  return defs[key] || defs[key.toUpperCase()] || {
    name: key, cost: 300, damage: 25, range: 180, fireRate: 0.2, color: '#6d5c4b',
    upgradeMultiplier: { cost: 0.8, dmg: 1.75, range: 25, rate: 0.85 }
  };
};

// Fallback Tower representation if towers.js is not present
class BaseTower {
  constructor(typeKey, x, y) {
    this.typeKey = typeKey;
    this.def = getTowerDef(typeKey);
    this.name = this.def.name;
    this.x = x;
    this.y = y;
    this.level = 1;
    this.kills = 0;
    this.totalInvested = this.def.cost;
    this.damage = this.def.damage;
    this.range = this.def.range;
    this.fireRate = this.def.fireRate;
    this.cooldown = 0;
    this.target = null;
    this.angle = 0;
    this.targetMode = 'first';
    this.animMuzzle = 0;
  }

  getUpgradeCost() {
    if (this.level >= 3) return 0;
    return Math.round(this.def.cost * (this.level === 1 ? 0.8 : 1.35));
  }

  getSellValue() {
    return Math.round(this.totalInvested * 0.70);
  }

  upgrade() {
    if (this.level >= 3) return false;
    const cost = this.getUpgradeCost();
    this.totalInvested += cost;
    this.level++;
    const mult = this.def.upgradeMultiplier;
    this.damage = Math.round(this.damage * mult.dmg);
    this.range = Math.round(this.range + mult.range);
    this.fireRate = parseFloat((this.fireRate * mult.rate).toFixed(2));
    return true;
  }

  cycleTargetMode() {
    const modes = ['first', 'closest', 'strongest', 'weakest'];
    const idx = (modes.indexOf(this.targetMode) + 1) % modes.length;
    this.targetMode = modes[idx];
    return this.targetMode;
  }

  update(dt, enemies, game) {
    if (this.cooldown > 0) this.cooldown -= dt;
    if (this.animMuzzle > 0) this.animMuzzle -= dt * 8;

    // Acquire Target
    let best = null;
    let bestScore = -Infinity;
    for (let i = 0; i < enemies.length; i++) {
      const z = enemies[i];
      const isAlive = z.active !== undefined ? z.active : z.alive;
      if (!isAlive) continue;

      const d = dist2D(this.x, this.y, z.x, z.y);
      if (d > this.range) continue;
      if (this.def.minRange && d < this.def.minRange) continue;

      let score = 0;
      switch (this.targetMode) {
        case 'closest': score = 5000 - d; break;
        case 'strongest': score = z.hp; break;
        case 'weakest': score = 5000 - z.hp; break;
        case 'first': default: score = z.progress || z.distanceTraveled || 0; break;
      }

      if (score > bestScore) {
        bestScore = score;
        best = z;
      }
    }

    this.target = best;
    if (this.target) {
      this.angle = Math.atan2(this.target.y - this.y, this.target.x - this.x);
      if (this.cooldown <= 0) {
        this.fire(game, enemies);
        this.cooldown = this.fireRate;
        this.animMuzzle = 1;
      }
    }
  }

  fire(game, allEnemies) {
    game.ui.audio.playShoot(this.typeKey);

    if (this.typeKey === 'GUNNER') {
      game.projectiles.push({
        x: this.x, y: this.y, target: this.target, damage: this.damage, speed: 950, alive: true,
        update(dt) {
          if (!this.target || (this.target.active === false || this.target.alive === false)) {
            this.alive = false; return;
          }
          const d = dist2D(this.x, this.y, this.target.x, this.target.y);
          const step = this.speed * dt;
          if (d <= step) {
            if (typeof this.target.takeDamage === 'function') this.target.takeDamage(this.damage, 'bullet');
            this.alive = false;
            game.ui.audio.playZombieHit();
          } else {
            const a = Math.atan2(this.target.y - this.y, this.target.x - this.x);
            this.x += Math.cos(a) * step;
            this.y += Math.sin(a) * step;
          }
        },
        draw(ctx) {
          ctx.fillStyle = '#ffe570';
          ctx.fillRect(this.x - 2, this.y - 2, 4, 4);
        }
      });
    } else if (this.typeKey === 'ARCHER') {
      const isCrit = Math.random() < 0.3;
      const dmg = isCrit ? this.damage * 2 : this.damage;
      game.projectiles.push({
        x: this.x, y: this.y, target: this.target, damage: dmg, speed: 650, alive: true, isCrit,
        update(dt) {
          if (!this.target || (this.target.active === false || this.target.alive === false)) {
            this.alive = false; return;
          }
          const d = dist2D(this.x, this.y, this.target.x, this.target.y);
          const step = this.speed * dt;
          if (d <= step) {
            if (typeof this.target.takeDamage === 'function') this.target.takeDamage(this.damage, this.isCrit ? 'crit' : 'arrow');
            this.alive = false;
            game.ui.audio.playZombieHit();
          } else {
            const a = Math.atan2(this.target.y - this.y, this.target.x - this.x);
            this.x += Math.cos(a) * step;
            this.y += Math.sin(a) * step;
          }
        },
        draw(ctx) {
          ctx.fillStyle = this.isCrit ? '#ffea00' : '#d4a359';
          ctx.fillRect(this.x - 3, this.y - 1, 6, 2);
        }
      });
    } else if (this.typeKey === 'ROCKET') {
      const splash = this.def.splashRadius || 70;
      const dmg = this.damage;
      game.projectiles.push({
        x: this.x, y: this.y, target: this.target, damage: dmg, speed: 450, alive: true,
        update(dt) {
          if (!this.target || (this.target.active === false && this.target.alive === false)) {
            this.alive = false; return;
          }
          const d = dist2D(this.x, this.y, this.target.x, this.target.y);
          const step = this.speed * dt;
          if (d <= step + 10) {
            this.alive = false;
            game.addExplosion(this.x, this.y, splash);
            allEnemies.forEach((z) => {
              const isAlive = z.active !== undefined ? z.active : z.alive;
              if (!isAlive) return;
              const ed = dist2D(this.x, this.y, z.x, z.y);
              if (ed <= splash && typeof z.takeDamage === 'function') {
                z.takeDamage(dmg * (1 - (ed / splash) * 0.4), 'explosive');
              }
            });
          } else {
            const a = Math.atan2(this.target.y - this.y, this.target.x - this.x);
            this.x += Math.cos(a) * step;
            this.y += Math.sin(a) * step;
          }
        },
        draw(ctx) {
          ctx.fillStyle = '#ff3b30';
          ctx.fillRect(this.x - 4, this.y - 3, 8, 6);
        }
      });
    } else if (this.typeKey === 'FLAMETROST') {
      const range = this.range;
      const dmg = this.damage;
      const angle = this.angle;
      game.particles.push({
        x: this.x, y: this.y, angle, range, life: 0.18, alive: true,
        update(dt) {
          this.life -= dt;
          if (this.life <= 0) this.alive = false;
        },
        draw(ctx) {
          ctx.save();
          ctx.translate(this.x, this.y);
          ctx.rotate(this.angle);
          const grad = ctx.createRadialGradient(0, 0, 10, this.range, 0, this.range);
          grad.addColorStop(0, 'rgba(255, 220, 50, 0.8)');
          grad.addColorStop(0.6, 'rgba(255, 100, 20, 0.6)');
          grad.addColorStop(1, 'rgba(0, 217, 255, 0)');
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.arc(0, 0, this.range, -0.4, 0.4);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }
      });
      allEnemies.forEach((z) => {
        const isAlive = z.active !== undefined ? z.active : z.alive;
        if (!isAlive) return;
        const d = dist2D(this.x, this.y, z.x, z.y);
        if (d <= range && typeof z.takeDamage === 'function') {
          z.takeDamage(dmg, 'fire');
        }
      });
    } else if (this.typeKey === 'TESLA') {
      game.createChainLightning(this, this.target, allEnemies, this.damage, 4);
    } else if (this.typeKey === 'MORTAR') {
      const targetX = this.target.x;
      const targetY = this.target.y;
      const splash = this.def.splashRadius || 110;
      const dmg = this.damage;
      game.projectiles.push({
        startX: this.x, startY: this.y, targetX, targetY, time: 0, duration: 1.1, alive: true,
        update(dt) {
          this.time += dt;
          const prog = this.time / this.duration;
          if (prog >= 1) {
            this.alive = false;
            game.screenShake(10, 0.3);
            game.addExplosion(this.targetX, this.targetY, splash);
            allEnemies.forEach((z) => {
              const isAlive = z.active !== undefined ? z.active : z.alive;
              if (!isAlive) return;
              const ed = dist2D(this.targetX, this.targetY, z.x, z.y);
              if (ed <= splash && typeof z.takeDamage === 'function') {
                z.takeDamage(dmg * (1 - (ed / splash) * 0.4), 'mortar');
              }
            });
          } else {
            this.x = this.startX + (this.targetX - this.startX) * prog;
            this.y = this.startY + (this.targetY - this.startY) * prog;
            this.renderY = this.y - Math.sin(prog * Math.PI) * 140;
          }
        },
        draw(ctx) {
          ctx.fillStyle = '#26221d';
          ctx.beginPath();
          ctx.arc(this.x, this.renderY || this.y, 5, 0, Math.PI * 2);
          ctx.fill();
        }
      });
    }
  }

  draw(ctx, isHovered = false, isSelected = false) {
    ctx.save();
    ctx.translate(this.x, this.y);

    if (isSelected) {
      ctx.strokeStyle = '#ffbb00';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, 0, 24, 0, Math.PI * 2);
      ctx.stroke();
    } else if (isHovered) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, 22, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.fillStyle = '#26201b';
    ctx.beginPath();
    ctx.arc(0, 0, 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#473d33';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = this.def.color;
    ctx.fillRect(-12, -12, 24, 24);

    ctx.save();
    ctx.rotate(this.angle);
    ctx.fillStyle = '#1c1c1e';
    ctx.fillRect(0, -3, 16, 6);
    if (this.animMuzzle > 0.2) {
      ctx.fillStyle = '#ffe042';
      ctx.beginPath();
      ctx.arc(18, 0, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    if (this.level >= 2) {
      ctx.fillStyle = '#ffcc00';
      ctx.beginPath();
      ctx.arc(-8, 12, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    if (this.level >= 3) {
      ctx.fillStyle = '#ffcc00';
      ctx.beginPath();
      ctx.arc(8, 12, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
}

// Fallback Zombie representation if zombies.js is not present
class BaseZombie {
  constructor(type, path, mult = 1.8) {
    this.type = type;
    this.path = path;
    this.pathIndex = 0;
    this.x = path[0].x;
    this.y = path[0].y;
    this.alive = true;
    this.active = true;
    this.progress = 0;
    this.distanceTraveled = 0;
    this.hp = type === 'tank' ? Math.round(550 * mult) : (type === 'runner' ? Math.round(90 * mult) : Math.round(140 * mult));
    this.maxHp = this.hp;
    this.speed = type === 'tank' ? 38 : (type === 'runner' ? 95 : 55);
    this.gold = type === 'tank' ? 65 : (type === 'runner' ? 15 : 22);
    this.energy = type === 'tank' ? 8 : (type === 'runner' ? 2 : 3);
    this.score = type === 'tank' ? 450 : (type === 'runner' ? 120 : 160);
    this.radius = type === 'tank' ? 18 : 12;
    this.color = type === 'runner' ? '#c24b3a' : (type === 'tank' ? '#5a7350' : '#6e7e60');
  }

  takeDamage(amount, type) {
    if (!this.active && !this.alive) return;
    this.hp -= amount;
    if (this.hp <= 0) {
      this.active = false;
      this.alive = false;
      if (window.game) window.game.onZombieKilled(this);
    }
  }

  update(dt) {
    if (!this.active && !this.alive) return;
    if (this.pathIndex < this.path.length - 1) {
      const target = this.path[this.pathIndex + 1];
      const d = dist2D(this.x, this.y, target.x, target.y);
      const step = this.speed * dt;
      if (d <= step) {
        this.x = target.x;
        this.y = target.y;
        this.pathIndex++;
        this.progress += d;
        this.distanceTraveled += d;
        if (this.pathIndex >= this.path.length - 1) {
          this.active = false;
          this.alive = false;
          if (window.game) window.game.damageSurvivorBase(5);
        }
      } else {
        const a = Math.atan2(target.y - this.y, target.x - this.x);
        this.x += Math.cos(a) * step;
        this.y += Math.sin(a) * step;
        this.progress += step;
        this.distanceTraveled += step;
      }
    }
  }

  draw(ctx) {
    if (!this.active && !this.alive) return;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
    ctx.fill();

    // Red eyes
    ctx.fillStyle = '#ff2200';
    ctx.fillRect(1, -3, 2, 2);
    ctx.fillRect(4, -3, 2, 2);

    // HP Bar
    if (this.hp < this.maxHp) {
      ctx.fillStyle = '#100d0a';
      ctx.fillRect(-14, -this.radius - 8, 28, 3);
      ctx.fillStyle = '#44cc44';
      ctx.fillRect(-13, -this.radius - 7, 26 * Math.max(0, this.hp / this.maxHp), 1);
    }
    ctx.restore();
  }
}

// Master ZombieGame Class
class NPCSurvivor {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.state = 'idle'; // idle, walk, shoot
    this.timer = 0;
    this.color = ['#4caf50', '#ff9800', '#2196f3', '#e91e63', '#9c27b0', '#607d8b'][Math.floor(Math.random() * 6)];
    this.hatType = Math.floor(Math.random() * 3); // 0=helmet, 1=cap, 2=bandana
    this.hasBackpack = Math.random() > 0.5;
    this.angle = Math.random() * Math.PI * 2;
    this.fireCooldown = 0;
    this.animTime = Math.random() * 10;
  }

  update(dt, zombies, projectileManager, soundFX, fxSystem) {
    this.animTime += dt;
    this.fireCooldown -= dt;

    let target = null;
    let minDist = Infinity;
    for (let i = 0; i < zombies.length; i++) {
      const z = zombies[i];
      if (!z.active || z.hp <= 0) continue;
      const d = Math.hypot(z.x - this.x, z.y - this.y);
      if (d < 300) { // Range 300
        if (d < minDist) {
          minDist = d;
          target = z;
        }
      }
    }

    if (target) {
      this.state = 'shoot';
      this.angle = Math.atan2(target.y - this.y, target.x - this.x);
      
      if (this.fireCooldown <= 0) {
        this.fireCooldown = 0.6 + Math.random() * 0.4;
        
        if (projectileManager && projectileManager.addProjectile && window.TowerSystem && window.TowerSystem.BulletProjectile) {
          const bp = new window.TowerSystem.BulletProjectile(this.x, this.y, target, null, {
            speed: 800,
            damage: 6,
            color: '#ffff00',
            length: 8
          });
          projectileManager.addProjectile(bp);
        }
        
        if (soundFX && typeof soundFX.playGunshot === 'function') {
          soundFX.playGunshot({ volume: 0.15, pitch: 1.2 + Math.random() * 0.2 });
        }
      }
    } else {
      this.timer -= dt;
      if (this.timer <= 0) {
        if (this.state === 'idle') {
          this.state = 'walk';
          this.timer = 1.0 + Math.random() * 3.0;
          this.vx = (Math.random() - 0.5) * 20;
          this.vy = (Math.random() - 0.5) * 20;
          this.angle = Math.atan2(this.vy, this.vx);
        } else {
          this.state = 'idle';
          this.timer = 1.0 + Math.random() * 3.0;
          this.vx = 0;
          this.vy = 0;
        }
      }

      if (this.state === 'walk') {
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        // Clamp to compound bounds
        if (this.x < 980) { this.x = 980; this.vx *= -1; this.angle = Math.atan2(this.vy, this.vx); }
        if (this.x > 1250) { this.x = 1250; this.vx *= -1; this.angle = Math.atan2(this.vy, this.vx); }
        if (this.y < 50) { this.y = 50; this.vy *= -1; this.angle = Math.atan2(this.vy, this.vx); }
        if (this.y > 450) { this.y = 450; this.vy *= -1; this.angle = Math.atan2(this.vy, this.vx); }
      }
    }
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);

    // Walking animation (Legs)
    let legOffset = 0;
    if (this.state === 'walk') {
      legOffset = Math.sin(this.animTime * 12) * 4;
    }
    ctx.fillStyle = '#222'; // pants/boots
    ctx.fillRect(-2 + legOffset, -5, 4, 4); // left leg
    ctx.fillRect(-2 - legOffset, 1, 4, 4); // right leg

    // Backpack
    if (this.hasBackpack) {
      ctx.fillStyle = '#5d4037';
      ctx.fillRect(-7, -4, 4, 8);
    }

    // Body
    ctx.fillStyle = this.color;
    ctx.fillRect(-4, -5, 8, 10);

    // Head
    ctx.fillStyle = '#ffccaa';
    ctx.beginPath();
    ctx.arc(0, 0, 4.5, 0, Math.PI * 2);
    ctx.fill();

    // Headgear
    if (this.hatType === 0) { // Army Helmet
      ctx.fillStyle = '#33691e';
      ctx.beginPath(); ctx.arc(0, 0, 4.8, -Math.PI/2, Math.PI/2); ctx.fill();
    } else if (this.hatType === 1) { // Cap
      ctx.fillStyle = '#d84315';
      ctx.beginPath(); ctx.arc(0, 0, 4.5, -Math.PI/2, Math.PI/2); ctx.fill();
      ctx.fillRect(0, -2, 7, 4); // brim
    } else { // Bandana
      ctx.fillStyle = '#b71c1c';
      ctx.fillRect(0, -4, 3, 8);
      ctx.fillRect(-4, 0, 3, 2); // knot
    }

    // Gun barrel
    ctx.fillStyle = '#333';
    ctx.fillRect(3, 2, 14, 2.5); // long rifle
    ctx.fillStyle = '#795548'; // wooden stock
    ctx.fillRect(-1, 2, 6, 2.5);
    
    // Hands holding gun
    ctx.fillStyle = '#ffccaa';
    ctx.beginPath(); ctx.arc(3, 3, 2, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(10, 3, 2, 0, Math.PI*2); ctx.fill();

    ctx.restore();
  }
}

class ZombieGame {
  constructor() {
    this.canvas = document.getElementById('gameCanvas');
    this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
    const UIClass = (typeof window !== 'undefined' && window.UIController) ? window.UIController : UIController;
    this.ui = new UIClass();

    // Modular subsystem bindings
    this.hasExternalModules = !!(window.GameMap && window.TowerSystem && window.ZombiesModule);
    if (window.GameMap) {
      this.gameMap = new GameMap(1280, 720);
      this.paths = [this.gameMap.pathA, this.gameMap.pathB];
    } else {
      this.paths = [PATH_ENTRY_A, PATH_ENTRY_B];
    }

    if (window.SoundFX) {
      this.soundFX = new SoundFX();
      this.ui.audio.externalSound = this.soundFX;
    }

    if (window.FXSystem) {
      this.fxSystem = new FXSystem(1280, 720);
    }

    if (window.ZombieManager) {
      this.zombieManager = window.ZombieManager;
      window.zombieManager = this.zombieManager;
      this.zombieManager.callbacks = {
        onZombieKilled: (z, killer) => this.onZombieKilled(z, killer),
        onZombieReachedEnd: (z, dmg) => this.damageSurvivorBase(dmg),
        onBloaterExplosion: (x, y, radius, dmg) => this.screenShake(12, 0.4)
      };
    }

    if (window.towerManager) {
      this.towerManager = window.towerManager;
      this.towerManager.initDefaultSlots(1280, 720);
    }

    // Game Economy
    this.wave = 0;
    this.maxWaves = Infinity;
    this.score = 0;
    this.gold = 650;
    this.energy = 20;
    this.baseHp = 100;
    this.baseMaxHp = 100;
    this.totalKills = 0;
    this.waveActive = false;
    this.waveSpawnQueue = [];
    this.waveSpawnTimer = 0;
    this.gameSpeed = 1;
    this.isPaused = false;
    this.gameOver = false;
    this.timeOfDay = 8; // 8 AM

    // Entities & Effects
    this.towers = [];
    this.zombies = [];
    this.projectiles = [];
    this.particles = [];
    this.bloodDecals = [];
    this.npcs = []; // NPC Survivors

    // Screen Shake
    this.shakeIntensity = 0;
    this.shakeDuration = 0;

    // Placement / Cursor state
    this.mouseX = 0;
    this.mouseY = 0;
    this.mouseInCanvas = false;
    this.hoverValid = false;

    this.wireUIEvents();
    this.initCanvasInteractions();

    this.initNPCs();
    setTimeout(() => this.startNextWave(), 2000);

    // Game Loop
    this.lastTime = performance.now();
    requestAnimationFrame(this.gameLoop.bind(this));
  }

  wireUIEvents() {
    this.ui.onNextWaveRequested = () => {
      if (this.waveActive) {
        return { success: false, message: 'WAVE ALREADY IN PROGRESS!' };
      }
      this.startNextWave();
      return { success: true, wave: this.wave };
    };

    this.ui.onSpeedChanged = (speed) => {
      this.gameSpeed = speed;
    };

    this.ui.onPauseToggled = (paused) => {
      this.isPaused = paused;
    };

    this.ui.onOverchargeRequested = () => {
      if (this.energy >= 50) {
        this.energy -= 50;
        this.triggerApocalypseOvercharge();
        if (this.towerManager && this.towerManager.lastStandTower && typeof this.towerManager.lastStandTower.activateOvercharge === 'function') {
          this.towerManager.lastStandTower.activateOvercharge();
        }
        this.ui.updateHUD(this.getHUDState());
        return true;
      }
      return false;
    };

    this.ui.onTowerUpgraded = (tower) => {
      const cost = this.ui.getTowerUpgradeCost(tower);
      if (this.gold < cost) {
        return { success: false, message: `NEED ${cost} G TO UPGRADE!` };
      }
      this.gold -= cost;

      if (this.towerManager && typeof this.towerManager.upgradeTower === 'function') {
        const upgraded = this.towerManager.upgradeTower(tower, 99999);
        if (!upgraded) {
          this.gold += cost;
          return { success: false, message: 'MAX LEVEL REACHED!' };
        }
      } else if (typeof tower.upgrade === 'function') {
        const upgraded = tower.upgrade();
        if (!upgraded) {
          this.gold += cost;
          return { success: false, message: 'MAX LEVEL REACHED!' };
        }
      }

      this.ui.updateHUD(this.getHUDState());
      return { success: true };
    };

    this.ui.onTowerSold = (tower) => {
      const refund = this.ui.getTowerSellRefund(tower);
      this.gold += refund;

      if (this.towerManager && typeof this.towerManager.sellTower === 'function') {
        this.towerManager.sellTower(tower);
      } else {
        this.towers = this.towers.filter((t) => t !== tower);
      }

      this.ui.updateHUD(this.getHUDState());
    };

    this.ui.onRestartGame = () => {
      this.restartGame();
    };
  }

  initCanvasInteractions() {
    const unlockAudio = () => {
      if (this.soundFX) {
        this.soundFX._userGestureReceived = true;
        this.soundFX._initContext();
        if (this.soundFX.ctx && this.soundFX.ctx.state === 'suspended') {
          this.soundFX.ctx.resume().catch(() => {});
        }
      }
      if (window.towerManager && window.towerManager.soundSynth) {
        window.towerManager.soundSynth.userGestureReceived = true;
        window.towerManager.soundSynth.init();
        if (window.towerManager.soundSynth.ctx && window.towerManager.soundSynth.ctx.state === 'suspended') {
          window.towerManager.soundSynth.ctx.resume().catch(() => {});
        }
      }
    };
    window.addEventListener('pointerdown', unlockAudio, { passive: true });
    window.addEventListener('keydown', unlockAudio, { passive: true });

    this.canvas.addEventListener('mousemove', (e) => {
      const coords = this.ui.getCanvasCoordinates(e.clientX, e.clientY);
      this.mouseX = coords.x;
      this.mouseY = coords.y;
      this.mouseInCanvas = true;

      if (this.ui.selectedTowerType) {
        this.hoverValid = this.canPlaceTower(this.mouseX, this.mouseY, this.ui.selectedTowerType);
      }
    });

    this.canvas.addEventListener('mouseenter', () => {
      this.mouseInCanvas = true;
    });

    this.canvas.addEventListener('mouseleave', () => {
      this.mouseInCanvas = false;
    });

    this.canvas.addEventListener('click', (e) => {
      const coords = this.ui.getCanvasCoordinates(e.clientX, e.clientY);
      const cx = coords.x;
      const cy = coords.y;

      // 1. Placement Mode Active
      if (this.ui.selectedTowerType) {
        const typeKey = this.ui.selectedTowerType;
        const def = getTowerDef(typeKey);

        if (this.gold < def.cost) {
          this.ui.audio.playError();
          this.ui.showToast(`INSUFFICIENT GOLD (COST: ${def.cost} G)`);
          return;
        }

        if (this.canPlaceTower(cx, cy, typeKey)) {
          this.gold -= def.cost;

          if (this.towerManager && typeof this.towerManager.buildTower === 'function') {
            const placed = this.towerManager.buildTower(typeKey, cx, cy, [], this.gold + def.cost);
            if (placed) {
              this.towers.push(placed);
            } else {
              const fallback = new BaseTower(typeKey, cx, cy);
              this.towers.push(fallback);
            }
          } else {
            const newTower = new BaseTower(typeKey, cx, cy);
            this.towers.push(newTower);
          }

          this.ui.audio.playPlace();
          this.addPlacementDust(cx, cy);
          this.ui.showToast(`${def.name} CONSTRUCTED!`);

          if (!e.shiftKey) {
            this.ui.cancelPlacement();
          }
          if (this.towerManager) this.towerManager.selectedTower = null;
          this.ui.updateHUD(this.getHUDState());
        } else {
          this.ui.audio.playError();
          this.ui.showToast('CANNOT CONSTRUCT HERE (ROADWAY/OBSTACLE)');
        }
        return;
      }

      // 2. Click Existing Placed Tower
      let clickedTower = null;
      const allTowers = (this.towerManager && this.towerManager.towers) || this.towers;
      for (let i = allTowers.length - 1; i >= 0; i--) {
        const t = allTowers[i];
        if (dist2D(cx, cy, t.x, t.y) <= (t.radius || 24) + 6) {
          clickedTower = t;
          break;
        }
      }

      if (clickedTower) {
        this.ui.openTowerModal(clickedTower);
      } else {
        this.ui.closeTowerModal();
      }
    });

    this.canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.ui.cancelPlacement();
      this.ui.closeTowerModal();
    });
  }

  canPlaceTower(x, y, typeKey) {
    if (this.towerManager) {
      if (this.towerManager.buildSlots) {
        for (const slot of this.towerManager.buildSlots) {
          if (!slot.isOccupied() && typeof slot.containsPoint === 'function' && slot.containsPoint(x, y)) {
            return true;
          } else if (!slot.isOccupied() && dist2D(x, y, slot.x, slot.y) <= slot.radius) {
            return true;
          }
        }
      }
      if (typeof this.towerManager.isValidBuildPosition === 'function') {
        return this.towerManager.isValidBuildPosition(x, y, typeKey, [], 99999).valid;
      }
    }

    // Canvas bounds
    if (x < 60 || x > 1220 || y < 70 || y > 585) return false;

    // Base exclusion zone (top right survivor base)
    if (x > 980 && y > 340 && y < 580) return false;

    // Roadway clearance buffer
    const paths = (this.gameMap && [this.gameMap.pathA, this.gameMap.pathB]) || this.paths;
    for (const path of paths) {
      for (let i = 0; i < path.length - 1; i++) {
        const d = this.distToSegment({ x, y }, path[i], path[i + 1]);
        if (d < 38) return false;
      }
    }

    // Tower overlap buffer
    const allTowers = (this.towerManager && this.towerManager.towers) || this.towers;
    for (const t of allTowers) {
      if (dist2D(x, y, t.x, t.y) < 46) return false;
    }

    return true;
  }

  distToSegment(p, v, w) {
    const l2 = (w.x - v.x) ** 2 + (w.y - v.y) ** 2;
    if (l2 === 0) return dist2D(p.x, p.y, v.x, v.y);
    let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    return dist2D(p.x, p.y, v.x + t * (w.x - v.x), v.y + t * (w.y - v.y));
  }

  initScenarioMatchingScreenshot() {
    // Initial Towers matching screenshot
    const initialSpecs = [
      { key: 'GUNNER', x: 470, y: 160, lvl: 1 },
      { key: 'ARCHER', x: 420, y: 310, lvl: 1 },
      { key: 'GUNNER', x: 360, y: 290, lvl: 1 },
      { key: 'GUNNER', x: 470, y: 370, lvl: 1 },
      { key: 'ROCKET', x: 470, y: 480, lvl: 1 },
      { key: 'GUNNER', x: 370, y: 610, lvl: 3 }, // LVL 3 in screenshot
      { key: 'TESLA', x: 605, y: 515, lvl: 1 },
      { key: 'MORTAR', x: 590, y: 370, lvl: 2 },
      { key: 'MORTAR', x: 660, y: 620, lvl: 1 },
      { key: 'ARCHER', x: 580, y: 115, lvl: 1 },
      { key: 'GUNNER', x: 640, y: 120, lvl: 1 },
      { key: 'FLAMETROST', x: 550, y: 320, lvl: 2 }
    ];

    if (this.towerManager && typeof this.towerManager.buildTower === 'function') {
      initialSpecs.forEach((spec) => {
        const t = this.towerManager.buildTower(spec.key, spec.x, spec.y, [], 99999);
        if (t && spec.lvl > 1) {
          for (let l = 1; l < spec.lvl; l++) this.towerManager.upgradeTower(t, 99999);
        }
        if (t) this.towers.push(t);
      });
    } else {
      initialSpecs.forEach((spec) => {
        const t = new BaseTower(spec.key, spec.x, spec.y);
        if (spec.lvl > 1) {
          for (let l = 1; l < spec.lvl; l++) t.upgrade();
        }
        this.towers.push(t);
      });
    }

    // Initial Marching Zombies matching screenshot
    const pathA = (this.gameMap && this.gameMap.pathA) || PATH_ENTRY_A;
    const pathB = (this.gameMap && this.gameMap.pathB) || PATH_ENTRY_B;

    if (this.zombieManager && typeof this.zombieManager.spawn === 'function') {
      // Spawn via ZombieManager
      for (let i = 0; i < 6; i++) this.zombieManager.spawn('walker', 'A', 1.8);
      for (let i = 0; i < 4; i++) this.zombieManager.spawn('sprinter', 'A', 1.8);
      for (let i = 0; i < 6; i++) this.zombieManager.spawn('walker', 'B', 1.8);
      this.zombieManager.spawn('mutant_tank', 'A', 2.0);
      this.zombies = this.zombieManager.zombies;
    } else {
      // Spawn Fallback
      for (let i = 0; i < 6; i++) {
        const z = new BaseZombie('walker', pathA, 1.8);
        z.x = 100 + i * 22; z.y = 165; z.pathIndex = 1;
        this.zombies.push(z);
      }
      for (let i = 0; i < 4; i++) {
        const z = new BaseZombie('runner', pathA, 1.8);
        z.x = 280; z.y = 230 + i * 24; z.pathIndex = 3;
        this.zombies.push(z);
      }
      for (let i = 0; i < 8; i++) {
        const z = new BaseZombie(i % 2 === 0 ? 'walker' : 'tank', pathA, 2.0);
        z.x = 555; z.y = 300 + i * 20; z.pathIndex = 10;
        this.zombies.push(z);
      }
    }

    this.ui.updateHUD(this.getHUDState());
  }

  startNextWave() {
    this.wave++;
    this.waveActive = true;
    this.waveSpawnQueue = [];

    const mult = 1 + (this.wave - 1) * 0.05; 
    let walkerCount = 12 + this.wave * 2;
    let runnerCount = 0;
    let tankCount = 0;
    let bloaterCount = 0;
    let crawlerCount = 0;

    if (this.wave >= 3) runnerCount = 2 + (this.wave - 2) * 2;
    if (this.wave >= 6) tankCount = Math.floor(this.wave / 5);
    if (this.wave >= 8) bloaterCount = Math.floor(this.wave / 6);
    if (this.wave >= 10) crawlerCount = Math.floor(this.wave / 4);

    const types = [];
    for(let i=0; i<walkerCount; i++) types.push('walker');
    for(let i=0; i<runnerCount; i++) types.push('runner');
    for(let i=0; i<tankCount; i++) types.push('tank');
    for(let i=0; i<bloaterCount; i++) types.push('bloater');
    for(let i=0; i<crawlerCount; i++) types.push('crawler');

    // Shuffle
    types.sort(() => Math.random() - 0.5);

    types.forEach(type => {
      let delay = 1.0 + Math.random() * 0.5; // start with slow 1-1.5s spawn gaps
      if (this.wave >= 4) delay *= 0.8;
      if (this.wave >= 8) delay *= 0.7;
      if (this.wave >= 15) delay *= 0.6;
      this.waveSpawnQueue.push({ type, mult, delay });
    });
  }

  onZombieKilled(zombie, killer) {
    this.gold += zombie.bountyGold || zombie.gold || 20;
    this.energy += zombie.bountyEnergy || zombie.energy || 3;
    this.score += zombie.scoreValue || zombie.score || 150;
    this.totalKills++;

    if (killer && typeof killer.addXP === 'function') {
      killer.addXP(zombie.maxHp || 100);
    }

    if (this.fxSystem && typeof this.fxSystem.createZombieDismemberment === 'function') {
      this.fxSystem.createZombieDismemberment(zombie.x, zombie.y, 6);
    }
    if (this.soundFX && typeof this.soundFX.playZombieSplatter === 'function') {
      this.soundFX.playZombieSplatter();
    }

    this.addBloodDecal(zombie.x, zombie.y);
    this.ui.updateHUD(this.getHUDState());
  }

  damageSurvivorBase(amount) {
    this.baseHp = Math.max(0, this.baseHp - amount);
    if (this.gameMap && typeof this.gameMap.damageBase === 'function') {
      this.gameMap.damageBase(amount);
    }
    if (this.soundFX && typeof this.soundFX.playBaseAlarm === 'function') {
      this.soundFX.playBaseAlarm();
    }
    this.screenShake(14, 0.4);
    this.ui.audio.playTone(90, 'square', 0.3, 30);
    this.ui.showToast(`⚠️ HOME DEFENSE BREACHED! -${amount} HP!`);

    if (this.baseHp <= 0 && !this.gameOver) {
      this.gameOver = true;
      this.ui.showGameOver(false, this.wave, this.score, this.totalKills);
    }
  }

  triggerApocalypseOvercharge() {
    this.screenShake(25, 0.8);

    this.particles.push({
      x: 1040, y: 445, radius: 20, maxRadius: 1280,
      alpha: 1.0, alive: true,
      update(dt) {
        this.radius += dt * 1400;
        this.alpha -= dt * 0.9;
        if (this.alpha <= 0) this.alive = false;
      },
      draw(ctx) {
        ctx.strokeStyle = `rgba(0, 217, 255, ${Math.max(0, this.alpha)})`;
        ctx.lineWidth = 14;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.stroke();
      }
    });

    // Wipe or heavily damage all living zombies
    const allZombies = (this.zombieManager && this.zombieManager.zombies) || this.zombies;
    allZombies.forEach((z) => {
      const isAlive = z.active !== undefined ? z.active : z.alive;
      if (!isAlive) return;
      if (typeof z.takeDamage === 'function') z.takeDamage(600, 'elec');
    });
  }

  createChainLightning(tower, initialTarget, allEnemies, damage, maxChains) {
    let current = initialTarget;
    const hitList = [initialTarget];
    if (typeof initialTarget.takeDamage === 'function') initialTarget.takeDamage(damage, 'elec');

    for (let c = 1; c < maxChains; c++) {
      let nextTarget = null;
      let closestDist = 140;

      for (let i = 0; i < allEnemies.length; i++) {
        const candidate = allEnemies[i];
        const isAlive = candidate.active !== undefined ? candidate.active : candidate.alive;
        if (!isAlive || hitList.includes(candidate)) continue;
        const d = dist2D(current.x, current.y, candidate.x, candidate.y);
        if (d < closestDist) {
          closestDist = d;
          nextTarget = candidate;
        }
      }

      if (nextTarget) {
        this.particles.push({
          x1: current.x, y1: current.y, x2: nextTarget.x, y2: nextTarget.y,
          life: 0.12, alive: true,
          update(dt) {
            this.life -= dt;
            if (this.life <= 0) this.alive = false;
          },
          draw(ctx) {
            ctx.strokeStyle = '#00e5ff';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(this.x1, this.y1);
            ctx.lineTo((this.x1 + this.x2) / 2 + (Math.random() * 20 - 10), (this.y1 + this.y2) / 2 + (Math.random() * 20 - 10));
            ctx.lineTo(this.x2, this.y2);
            ctx.stroke();
          }
        });

        if (typeof nextTarget.takeDamage === 'function') nextTarget.takeDamage(damage * 0.8, 'elec');
        hitList.push(nextTarget);
        current = nextTarget;
      } else {
        break;
      }
    }
  }

  addExplosion(x, y, radius) {
    this.particles.push({
      x, y, radius: 5, maxRadius: radius, alpha: 1.0, alive: true,
      update(dt) {
        this.radius += dt * (this.maxRadius * 4);
        this.alpha -= dt * 2.5;
        if (this.alpha <= 0) this.alive = false;
      },
      draw(ctx) {
        const grad = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.radius);
        grad.addColorStop(0, `rgba(255, 240, 100, ${this.alpha})`);
        grad.addColorStop(0.4, `rgba(255, 100, 20, ${this.alpha})`);
        grad.addColorStop(1, `rgba(180, 20, 10, 0)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  }

  addPlacementDust(x, y) {
    for (let i = 0; i < 10; i++) {
      this.particles.push({
        x: x + (Math.random() * 16 - 8),
        y: y + (Math.random() * 16 - 8),
        radius: 3 + Math.random() * 3,
        alpha: 0.6, alive: true,
        update(dt) {
          this.alpha -= dt * 1.5;
          this.radius += dt * 4;
          if (this.alpha <= 0) this.alive = false;
        },
        draw(ctx) {
          ctx.fillStyle = `rgba(120, 110, 100, ${Math.max(0, this.alpha)})`;
          ctx.beginPath();
          ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
          ctx.fill();
        }
      });
    }
  }

  addBloodDecal(x, y) {
    if (this.fxSystem && typeof this.fxSystem.addBloodSplatter === 'function') {
      this.fxSystem.addBloodSplatter(x, y, { count: 10, radius: 22 });
    }
    if (this.bloodDecals.length > 80) this.bloodDecals.shift();
    this.bloodDecals.push({
      x: x + (Math.random() * 8 - 4),
      y: y + (Math.random() * 8 - 4),
      radius: 4 + Math.random() * 8,
      alpha: 0.75
    });
  }

  screenShake(intensity, duration) {
    this.shakeIntensity = intensity;
    this.shakeDuration = duration;
  }

  getHUDState() {
    const activeZombies = (this.zombieManager && this.zombieManager.zombies) || this.zombies;
    const livingCount = activeZombies.filter((z) => (z.active !== undefined ? z.active : z.alive)).length;

    return {
      wave: this.wave,
      maxWaves: this.maxWaves,
      score: this.score,
      zombiesRemaining: livingCount + this.waveSpawnQueue.length,
      gold: this.gold,
      energy: this.energy,
      baseHp: this.baseHp,
      baseMaxHp: this.baseMaxHp,
      waveActive: this.waveActive
    };
  }

  initNPCs() {
    this.npcs = [];
    for (let i = 0; i < 6; i++) {
      this.npcs.push(new NPCSurvivor(
        1040 + Math.random() * 100,
        130 + Math.random() * 80
      ));
    }
  }

  restartGame() {
    this.wave = 1;
    this.score = 0;
    this.gold = 650;
    this.energy = 20;
    this.baseHp = 100;
    this.totalKills = 0;
    this.gameOver = false;
    this.towers = [];
    this.zombies = [];
    this.projectiles = [];
    this.particles = [];
    this.bloodDecals = [];

    if (this.zombieManager && typeof this.zombieManager.reset === 'function') {
      this.zombieManager.reset();
    }

    this.ui.updateHUD(this.getHUDState());
  }

  // ===========================================================================
  // GAME LOOP
  // ===========================================================================
  gameLoop(time) {
    const rawDt = (time - this.lastTime) / 1000;
    this.lastTime = time;
    const dt = Math.min(rawDt, 0.1) * (this.isPaused ? 0 : this.gameSpeed);

    if (!this.isPaused && !this.gameOver) {
      this.update(dt);
    }

    this.render();
    this.ui.renderMinimap(this);

    requestAnimationFrame(this.gameLoop.bind(this));
  }

  update(dt) {
    if (this.shakeDuration > 0) {
      this.shakeDuration -= dt;
      if (this.shakeDuration <= 0) this.shakeIntensity = 0;
    }

    // Spawner queue
    if (this.waveActive && this.waveSpawnQueue.length > 0) {
      this.waveSpawnTimer -= dt;
      if (this.waveSpawnTimer <= 0) {
        const next = this.waveSpawnQueue.shift();
        const p = Math.random() < 0.5 ? this.paths[0] : this.paths[1];
        if (this.zombieManager && typeof this.zombieManager.spawn === 'function') {
          this.zombieManager.spawn(next.type, p === this.paths[0] ? 'A' : 'B', next.mult);
        } else {
          this.zombies.push(new BaseZombie(next.type, p, next.mult));
        }
        this.waveSpawnTimer = next.delay;
      }
    } else if (this.waveActive && this.waveSpawnQueue.length === 0) {
      const activeZombies = (this.zombieManager && this.zombieManager.zombies) || this.zombies;
      const living = activeZombies.filter((z) => (z.active !== undefined ? z.active : z.alive));
      if (living.length === 0) {
        this.waveActive = false;
        
        // Clean blood decals
        this.bloodDecals = [];
        if (this.fxSystem && typeof this.fxSystem.clearBlood === 'function') {
          this.fxSystem.clearBlood();
        }

        this.gold += 200 + this.wave * 25;
        this.energy += 20;
        this.ui.audio.playUpgrade();
        this.ui.showToast(`WAVE ${this.wave} SURVIVED! NEXT IN 5s`);
        
        if (this.wave >= this.maxWaves) {
          this.maxWaves += 10;
        }
        
        this.autoWaveTimer = 5.0;
      }
    } else if (!this.waveActive && this.autoWaveTimer > 0) {
      this.autoWaveTimer -= dt;
      if (this.autoWaveTimer <= 0) {
        this.startNextWave();
      }
    }

    // Update Zombies
    if (this.zombieManager && typeof this.zombieManager.update === 'function') {
      this.zombieManager.update(dt);
    } else {
      for (let i = this.zombies.length - 1; i >= 0; i--) {
        const z = this.zombies[i];
        z.update(dt);
        if (!z.alive && !z.active) this.zombies.splice(i, 1);
      }
    }

    // Update Towers
    const allZombies = (this.zombieManager && this.zombieManager.zombies) || this.zombies;
    if (this.towerManager && typeof this.towerManager.update === 'function') {
      this.towerManager.update(dt, allZombies);
    } else {
      this.towers.forEach((t) => t.update(dt, allZombies, this));
    }

    // Update Projectiles
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.update(dt);
      if (!p.alive) this.projectiles.splice(i, 1);
    }

    // Update Particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const part = this.particles[i];
      part.update(dt);
      if (!part.alive) this.particles.splice(i, 1);
    }

    if (this.gameMap && typeof this.gameMap.update === 'function') {
      this.gameMap.update(dt);
    }
    if (this.fxSystem && typeof this.fxSystem.update === 'function') {
      this.fxSystem.update(dt);
    }

    // Update NPCs
    const pManager = this.towerManager ? this.towerManager.projectiles : null;
    this.npcs.forEach(npc => {
      npc.update(dt, allZombies, pManager, this.soundFX, this.fxSystem);
    });

    // Advance Time (1 hour = 8 seconds real time => 24 hours = 192s)
    this.timeOfDay += dt * (1 / 8);
    if (this.timeOfDay >= 24) this.timeOfDay -= 24;

    this.ui.updateHUD(this.getHUDState());
  }

  // ===========================================================================
  // RENDER CANVAS
  // ===========================================================================
  render() {
    const ctx = this.ctx;
    ctx.save();

    if (this.shakeIntensity > 0) {
      ctx.translate((Math.random() * 2 - 1) * this.shakeIntensity, (Math.random() * 2 - 1) * this.shakeIntensity);
    }

    // 1. Terrain & Ruins Background
    if (this.gameMap && typeof this.gameMap.renderBackground === 'function') {
      this.gameMap.renderBackground(ctx);
    } else {
      this.renderFallbackTerrain(ctx);
    }

    // 2. Blood Decals & Persistent Gore Canvas
    if (this.fxSystem && typeof this.fxSystem.renderGore === 'function') {
      this.fxSystem.renderGore(ctx);
      this.fxSystem.renderGroundDecals(ctx);
    }
    this.bloodDecals.forEach((decal) => {
      ctx.fillStyle = `rgba(130, 15, 10, ${decal.alpha})`;
      ctx.beginPath();
      ctx.arc(decal.x, decal.y, decal.radius, 0, Math.PI * 2);
      ctx.fill();
    });

    // Render NPCs
    this.npcs.forEach(npc => npc.draw(ctx));

    // 3. Render Towers
    if (this.towerManager && typeof this.towerManager.draw === 'function') {
      this.towerManager.draw(ctx, {
        hoveredTower: null,
        selectedTower: this.ui.selectedPlacedTower
      });
    } else {
      this.towers.forEach((t) => {
        const isHovered = dist2D(this.mouseX, this.mouseY, t.x, t.y) <= 24;
        const isSelected = this.ui.selectedPlacedTower === t;
        t.draw(ctx, isHovered, isSelected);
      });
    }

    // 4. Render Selected Tower Range Circle
    if (this.ui.selectedPlacedTower) {
      const t = this.ui.selectedPlacedTower;
      const range = t.range || (t.stats && t.stats.range) || (t.def && t.def.range) || 180;
      ctx.strokeStyle = '#4cdb4c';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.arc(t.x, t.y, range, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(76, 219, 76, 0.08)';
      ctx.beginPath();
      ctx.arc(t.x, t.y, range, 0, Math.PI * 2);
      ctx.fill();
    }

    // 5. Render Zombies
    if (this.zombieManager && typeof this.zombieManager.draw === 'function') {
      this.zombieManager.draw(ctx);
    } else {
      this.zombies.forEach((z) => z.draw(ctx));
    }

    // 6. Render Projectiles & Particles
    this.projectiles.forEach((p) => p.draw(ctx));
    this.particles.forEach((part) => part.draw(ctx));
    if (this.fxSystem && typeof this.fxSystem.renderParticles === 'function') {
      this.fxSystem.renderParticles(ctx);
    }

    // 7. Foreground Overhead Archways (Zombies walk under Entry A & B)
    if (this.gameMap && typeof this.gameMap.renderForeground === 'function') {
      this.gameMap.renderForeground(ctx);
    }

    // 8. Floating Combat Text
    if (this.fxSystem && typeof this.fxSystem.renderText === 'function') {
      this.fxSystem.renderText(ctx);
    }

    // 9. Night Overlay (Day/Night cycle)
    let nightAlpha = 0;
    if (this.timeOfDay >= 18) {
      nightAlpha = Math.min(0.55, (this.timeOfDay - 18) * 0.15); 
    } else if (this.timeOfDay <= 6) {
      nightAlpha = Math.max(0, 0.55 - (this.timeOfDay * 0.1)); 
    }
    
    if (nightAlpha > 0.05) {
      ctx.fillStyle = `rgba(5, 10, 25, ${nightAlpha})`;
      ctx.fillRect(0, 0, 1280, 720);
    }

    // 8. Placement Preview Ghost & Range Circle
    if (this.ui.selectedTowerType && this.mouseInCanvas) {
      const def = getTowerDef(this.ui.selectedTowerType);
      const valid = this.hoverValid;

      ctx.strokeStyle = valid ? '#4cdb4c' : '#ff3333';
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      ctx.arc(this.mouseX, this.mouseY, def.range, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = valid ? 'rgba(76, 219, 76, 0.15)' : 'rgba(255, 51, 51, 0.18)';
      ctx.beginPath();
      ctx.arc(this.mouseX, this.mouseY, def.range, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalAlpha = 0.65;
      ctx.fillStyle = valid ? '#26201b' : '#551515';
      ctx.beginPath();
      ctx.arc(this.mouseX, this.mouseY, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1.0;
    }

    ctx.restore();
  }

  renderFallbackTerrain(ctx) {
    ctx.fillStyle = '#302821';
    ctx.fillRect(0, 0, 1280, 720);

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#221c17';
    ctx.lineWidth = 56;
    this.paths.forEach((p) => {
      ctx.beginPath();
      p.forEach((pt, i) => (i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
      ctx.stroke();
    });

    ctx.strokeStyle = '#4e4337';
    ctx.lineWidth = 44;
    this.paths.forEach((p) => {
      ctx.beginPath();
      p.forEach((pt, i) => (i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
      ctx.stroke();
    });

    // Survivor Base
    ctx.fillStyle = '#5c4d3d';
    ctx.fillRect(1000, 360, 240, 180);
    ctx.fillStyle = '#3a4a59';
    ctx.fillRect(1080, 200, 150, 130);
  }
}

// Instantiate on Page Load
window.ZombieGame = ZombieGame;
window.addEventListener('DOMContentLoaded', () => {
  window.game = new ZombieGame();
});
