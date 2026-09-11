const { createCanvas } = require('canvas');
const fs = require('fs');
const { GameMap } = require('./js/map.js');
const { FXSystem } = require('./js/fx.js');

const width = 1280;
const height = 720;
const canvas = createCanvas(width, height);
const ctx = canvas.getContext('2d');

console.log('Initializing GameMap...');
const gameMap = new GameMap(width, height);

console.log('Initializing FXSystem...');
const fx = new FXSystem(width, height);

// 1. Add persistent blood splatters and pools along the road
fx.addBloodPool(560, 410, 24, '#7a0505');
fx.addBloodPool(715, 380, 20, '#600202');
fx.addBloodPool(885, 270, 28, '#850707');

for (let i = 0; i < 20; i++) {
  const rx = 350 + Math.random() * 550;
  const ry = 220 + Math.random() * 320;
  fx.addBloodSplatter(rx, ry, { count: 16, radius: 25 });
}

// 2. Add severed gib decals onto road
fx.addGibDecal(570, 420, 'head', 0.4);
fx.addGibDecal(720, 370, 'arm', -0.6);
fx.addGibDecal(890, 260, 'leg', 1.2);
fx.addGibDecal(550, 440, 'ribs', 0.1);

// 3. Create active combat effects
// Explosion at top bend
fx.createExplosion(630, 260, 50, { count: 30, hasGore: true });

// Tesla lightning arc leaping across road
fx.createTeslaArc(605, 440, 715, 380, { branches: 3, duration: 0.5 });

// Flamethrower stream
fx.createFlameCone(505, 250, 0.45, 160, 0.4, 25);

// Last Stand Gatling muzzle flash and casings
fx.createMuzzleFlash(1160, 460, -Math.PI * 0.75, 24);
for (let c = 0; c < 8; c++) {
  fx.createBulletCasing(1160, 460, -Math.PI * 0.75, 'heavy');
}

// 4. Spawn vibrant retro floating damage numbers matching screenshot!
fx.spawnDamageText(630, 220, 461, 'crit', true);
fx.spawnDamageText(660, 240, 250, 'crit', true);
fx.spawnDamageText(540, 360, 131, 'fire');
fx.spawnDamageText(580, 390, 80, 'toxic');
fx.spawnDamageText(710, 360, 336, 'crit', true);
fx.spawnDamageText(740, 340, 43, 'physical');
fx.spawnDamageText(890, 240, 182, 'crit', true);
fx.spawnDamageText(920, 220, 363, 'toxic');

// Set Last Stand state to firing
gameMap.setLastStandState(-Math.PI * 0.72, true);
gameMap.update(0.1);

// Step FX system forward
for (let f = 0; f < 5; f++) {
  fx.update(0.016);
}

// 5. Render entire scene in proper depth order
console.log('Rendering background...');
gameMap.renderBackground(ctx);

console.log('Rendering persistent gore...');
fx.renderGore(ctx);

console.log('Rendering ground decals...');
fx.renderGroundDecals(ctx);

console.log('Rendering build spots...');
gameMap.renderBuildSpots(ctx, 'spot_2');

console.log('Rendering particle FX...');
fx.renderParticles(ctx);

console.log('Rendering foreground archways...');
gameMap.renderForeground(ctx);

console.log('Rendering floating combat text...');
fx.renderText(ctx);

// 6. Render MiniMap in corner
gameMap.renderMiniMap(ctx, 1020, 580, 120, 80, [{ x: 560, y: 380 }, { x: 715, y: 400 }], [{ x: 475, y: 215 }]);

console.log('Saving output image...');
const buffer = canvas.toBuffer('image/png');
fs.writeFileSync('/content/zombie_tower_defense/render_test_output.png', buffer);
console.log('Successfully saved /content/zombie_tower_defense/render_test_output.png');
