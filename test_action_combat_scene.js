const fs = require('fs');
const path = require('path');
const { createCanvas } = require('canvas');

// Global mock setup
const domListeners = {};
const mockElements = {};
function createMockElement(id) {
  return {
    id,
    style: {},
    classList: { add() {}, remove() {}, contains() { return false; }, toggle() {} },
    dataset: {},
    innerHTML: '',
    textContent: '',
    disabled: false,
    addEventListener(evt, h) {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 })
  };
}

const gameCanvas = createCanvas(1280, 720);
gameCanvas.id = 'gameCanvas';
gameCanvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1280, height: 720 });
gameCanvas.addEventListener = () => {};
const minimapCanvas = createCanvas(154, 98);
minimapCanvas.id = 'minimapCanvas';
minimapCanvas.addEventListener = () => {};

global.window = global;
global.self = global;
global.addEventListener = () => {};
global.removeEventListener = () => {};
global.document = {
  getElementById: (id) => id === 'gameCanvas' ? gameCanvas : (id === 'minimapCanvas' ? minimapCanvas : createMockElement(id)),
  querySelectorAll: () => [],
  querySelector: () => createMockElement('sel'),
  createElement: (tag) => tag.toLowerCase() === 'canvas' ? createCanvas(1280, 720) : createMockElement(tag),
  addEventListener: () => {}
};
global.performance = { now: () => Date.now() };
global.requestAnimationFrame = (cb) => setTimeout(cb, 16);
global.AudioContext = class {
  constructor() { this.currentTime = 0; }
  createGain() { return { gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }; }
  createOscillator() { return { frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, start() {}, stop() {} }; }
  createBuffer() { return { getChannelData: () => new Float32Array(100) }; }
  resume() {}
};

// Load scripts
const scripts = ['js/engine.js', 'js/audio.js', 'js/fx.js', 'js/map.js', 'js/zombies.js', 'js/towers.js', 'js/ui.js', 'js/main.js'];
scripts.forEach(s => {
  const code = fs.readFileSync(path.join(__dirname, s), 'utf8');
  const fn = new Function('window', 'document', 'module', 'exports', code);
  fn(global.window, global.document, undefined, undefined);
});

// Initialize game
const game = new ZombieGame();
global.game = game;

// Populate rich active combat matching reference screenshot:
// 1. Marching zombie horde from Entry A & B
const zm = game.zombieManager;
if (zm) {
  zm.reset();
  // Entry A column
  for (let i = 0; i < 8; i++) {
    const z = zm.spawn('walker', 'A', 2.0);
    if (z) z.progressDistance = 80 + i * 35;
  }
  for (let i = 0; i < 6; i++) {
    const z = zm.spawn('sprinter', 'A', 2.0);
    if (z) z.progressDistance = 350 + i * 28;
  }
  for (let i = 0; i < 4; i++) {
    const z = zm.spawn('bloater', 'A', 2.2);
    if (z) z.progressDistance = 560 + i * 32;
  }
  // Entry B column
  for (let i = 0; i < 6; i++) {
    const z = zm.spawn('crawler', 'B', 1.8);
    if (z) z.progressDistance = 60 + i * 30;
  }
  for (let i = 0; i < 5; i++) {
    const z = zm.spawn('armored', 'B', 2.0);
    if (z) z.progressDistance = 240 + i * 30;
  }
  // Behemoth boss entering killzone
  const boss = zm.spawn('mutant_tank', 'A', 2.5);
  if (boss) boss.progressDistance = 680;
}

// 2. Persistent gore on cobblestone
const fx = game.fxSystem;
if (fx) {
  fx.addBloodPool(560, 410, 26, '#7a0505');
  fx.addBloodPool(715, 380, 22, '#600202');
  fx.addBloodPool(885, 270, 30, '#850707');
  for (let i = 0; i < 25; i++) {
    const rx = 340 + Math.random() * 560;
    const ry = 200 + Math.random() * 340;
    fx.addBloodSplatter(rx, ry, { count: 18, radius: 26 });
  }
  fx.addGibDecal(570, 420, 'head', 0.4);
  fx.addGibDecal(720, 370, 'arm', -0.6);
  fx.addGibDecal(890, 260, 'leg', 1.2);

  // Active explosions and electric arcs
  fx.createExplosion(630, 260, 52, { count: 32, hasGore: true });
  fx.createTeslaArc(605, 515, 715, 380, { branches: 3, duration: 0.6 });
  fx.createFlameCone(550, 320, 0.45, 170, 0.4, 28);
  fx.createMuzzleFlash(1160, 460, -Math.PI * 0.75, 26);

  // Floating combat text matching retro damage colors
  fx.spawnDamageText(630, 220, 461, 'crit', true);
  fx.spawnDamageText(660, 240, 250, 'crit', true);
  fx.spawnDamageText(540, 360, 131, 'fire');
  fx.spawnDamageText(580, 390, 80, 'toxic');
  fx.spawnDamageText(710, 360, 336, 'crit', true);
  fx.spawnDamageText(740, 340, 43, 'physical');
  fx.spawnDamageText(890, 240, 182, 'crit', true);
  fx.spawnDamageText(920, 220, 363, 'toxic');
  fx.spawnDamageText(730, 440, 131461, 'crit', true);
}

// Set Gatling gun firing
if (game.gameMap) {
  game.gameMap.setLastStandState(-Math.PI * 0.72, true);
}

// Advance simulation a few steps so towers swivel and fire
for (let i = 0; i < 15; i++) {
  game.update(0.016);
}

// Render full scene
game.render();

// Save to full_action_scene.png
const outPath = path.join(__dirname, 'full_action_scene.png');
fs.writeFileSync(outPath, gameCanvas.toBuffer('image/png'));
console.log('Successfully generated full combat action scene: ' + outPath);
