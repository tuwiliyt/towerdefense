const assert = require('assert');
const {
  GameEngine,
  Engine,
  GameState,
  PathSystem,
  SplinePath,
  EntityManager,
  EventBus,
  STRATEGIC_TOWER_SLOTS,
  DEFAULT_CONTROL_POINTS,
  ENGINE_CONFIG,
} = require('./js/engine.js');

console.log('=== RUNNING CORE GAME ENGINE TEST SUITE ===\n');

let testsPassed = 0;
let testsFailed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  [PASS] ${name}`);
    testsPassed++;
  } catch (err) {
    console.error(`  [FAIL] ${name}`);
    console.error(err);
    testsFailed++;
  }
}

// -------------------------------------------------------------
// 1. GAME STATE TESTS
// -------------------------------------------------------------
console.log('--- 1. Game State Management ---');

test('Initial default values match specifications (2450 G, 120 E, 78500 Score, Wave 24/40, 100 HP)', () => {
  const engine = new Engine();
  assert.strictEqual(engine.state.gold, 2450, 'Gold should default to 2450');
  assert.strictEqual(engine.state.energy, 120, 'Energy should default to 120');
  assert.strictEqual(engine.state.score, 78500, 'Score should default to 78500');
  assert.strictEqual(engine.state.wave, 24, 'Wave should default to 24');
  assert.strictEqual(engine.state.maxWaves, 40, 'Max waves should default to 40');
  assert.strictEqual(engine.state.baseHp, 100, 'Base HP should default to 100');
  assert.strictEqual(engine.state.speed, 1, 'Speed should default to 1x');
  assert.strictEqual(engine.state.isPaused, false, 'Game should not be paused by default');
});

test('Gold economy: add, spend, canAfford', () => {
  const engine = new Engine();
  assert.strictEqual(engine.state.canAfford(2000), true);
  assert.strictEqual(engine.state.canAfford(3000), false);

  const spent = engine.state.spendGold(450);
  assert.strictEqual(spent, true);
  assert.strictEqual(engine.state.gold, 2000);
  assert.strictEqual(engine.state.stats.goldSpent, 450);

  const overspent = engine.state.spendGold(5000);
  assert.strictEqual(overspent, false);
  assert.strictEqual(engine.state.gold, 2000);

  engine.state.addGold(500);
  assert.strictEqual(engine.state.gold, 2500);
  assert.strictEqual(engine.state.stats.goldEarned, 500);
});

test('Energy economy: add, spend, canAffordEnergy, max clamp', () => {
  const engine = new Engine();
  assert.strictEqual(engine.state.spendEnergy(40), true);
  assert.strictEqual(engine.state.energy, 80);
  assert.strictEqual(engine.state.stats.energySpent, 40);

  assert.strictEqual(engine.state.spendEnergy(100), false);
  assert.strictEqual(engine.state.energy, 80);

  engine.state.addEnergy(100);
  assert.strictEqual(engine.state.energy, 120, 'Energy should not exceed maxEnergy');
});

test('Base HP: damage, repair, and GameOver trigger', () => {
  const engine = new Engine();
  let gameOverEmitted = false;
  engine.on('game:over', () => { gameOverEmitted = true; });

  engine.state.damageBase(30);
  assert.strictEqual(engine.state.baseHp, 70);
  assert.strictEqual(engine.state.stats.damageTaken, 30);

  engine.state.repairBase(15);
  assert.strictEqual(engine.state.baseHp, 85);

  engine.state.repairBase(50);
  assert.strictEqual(engine.state.baseHp, 100, 'HP should clamp to maxBaseHp');

  engine.state.damageBase(100);
  assert.strictEqual(engine.state.baseHp, 0);
  assert.strictEqual(engine.state.status, 'gameover');
  assert.strictEqual(gameOverEmitted, true);
});

test('Wave progression & Victory condition', () => {
  const engine = new Engine();
  engine.state.setWave(39);
  assert.strictEqual(engine.state.wave, 39);

  let victoryEmitted = false;
  engine.on('game:victory', () => { victoryEmitted = true; });

  engine.state.clearWave();
  assert.strictEqual(engine.state.wave, 40);
  assert.strictEqual(victoryEmitted, false);

  engine.state.clearWave();
  assert.strictEqual(engine.state.status, 'victory');
  assert.strictEqual(victoryEmitted, true);
});

// -------------------------------------------------------------
// 2. SPEED MULTIPLIERS & PAUSE
// -------------------------------------------------------------
console.log('\n--- 2. Speed Multipliers & Pause ---');

test('Speed multipliers: 1x, 2x, 4x cycling', () => {
  const engine = new Engine();
  assert.strictEqual(engine.state.speed, 1);

  engine.toggleSpeed();
  assert.strictEqual(engine.state.speed, 2);

  engine.toggleSpeed();
  assert.strictEqual(engine.state.speed, 4);

  engine.toggleSpeed();
  assert.strictEqual(engine.state.speed, 1);

  engine.setSpeed(2);
  assert.strictEqual(engine.state.speed, 2);
});

test('Pause and Resume state toggling', () => {
  const engine = new Engine();
  assert.strictEqual(engine.state.isPaused, false);

  engine.pause();
  assert.strictEqual(engine.state.isPaused, true);

  engine.resume();
  assert.strictEqual(engine.state.isPaused, false);

  engine.togglePause();
  assert.strictEqual(engine.state.isPaused, true);
  engine.togglePause();
  assert.strictEqual(engine.state.isPaused, false);
});

// -------------------------------------------------------------
// 3. DUAL-PATH SYSTEM & SPLINES
// -------------------------------------------------------------
console.log('\n--- 3. Dual-Path Coordinate System ---');

test('Path A starts at Entry A (120, 220) and ends at Survivor Base (1100, 180)', () => {
  const engine = new Engine();
  const start = engine.paths.getPositionAtProgress('A', 0.0);
  const end = engine.paths.getPositionAtProgress('A', 1.0);

  assert(Math.hypot(start.x - 120, start.y - 220) < 0.1, 'Path A start must match Entry A');
  assert(Math.hypot(end.x - 1100, end.y - 180) < 0.1, 'Path A end must match Survivor Base');
  assert(engine.paths.getTotalLength('A') > 1500, 'Path A length should be substantial');
});

test('Path B starts at Entry B (110, 550) and ends at Survivor Base (1100, 180)', () => {
  const engine = new Engine();
  const start = engine.paths.getPositionAtProgress('B', 0.0);
  const end = engine.paths.getPositionAtProgress('B', 1.0);

  assert(Math.hypot(start.x - 110, start.y - 550) < 0.1, 'Path B start must match Entry B');
  assert(Math.hypot(end.x - 1100, end.y - 180) < 0.1, 'Path B end must match Survivor Base');
  assert(engine.paths.getTotalLength('B') > 1500, 'Path B length should be substantial');
});

test('Continuous arc-length parameterization & rotation angles', () => {
  const engine = new Engine();
  const p1 = engine.paths.getPositionAtDistance('A', 100);
  const p2 = engine.paths.getPositionAtDistance('A', 200);

  assert(p1.distance === 100);
  assert(p2.distance === 200);
  assert(p2.progress > p1.progress);
  assert(typeof p1.angle === 'number' && !isNaN(p1.angle));
  assert(typeof p1.normal.x === 'number' && typeof p1.normal.y === 'number');

  // Lane offset test
  const offsetPos = p1.getOffsetPoint(10);
  const distFromCenter = Math.hypot(offsetPos.x - p1.x, offsetPos.y - p1.y);
  assert(Math.abs(distFromCenter - 10) < 0.01, 'Offset should be exactly 10 units perpendicular');
});

test('Road collision check: isPointOnRoad detects road points and off-road points', () => {
  const engine = new Engine();
  assert.strictEqual(engine.paths.isPointOnRoad(120, 220), true, 'Entry A is on road');
  assert.strictEqual(engine.paths.isPointOnRoad(110, 550), true, 'Entry B is on road');
  assert.strictEqual(engine.paths.isPointOnRoad(50, 50), false, 'Top-left corner is off road');
  assert.strictEqual(engine.paths.isPointOnRoad(1000, 600), false, 'Bottom-right is off road');
});

// -------------------------------------------------------------
// 4. EVENT BUS SYSTEM
// -------------------------------------------------------------
console.log('\n--- 4. Event Bus System ---');

test('EventBus handles on, once, off, and aliases (colon vs underscore)', () => {
  const bus = new EventBus();
  let colonCount = 0;
  let underscoreCount = 0;
  let wildcardCount = 0;

  bus.on('zombie:killed', () => { colonCount++; });
  bus.on('zombie_killed', () => { underscoreCount++; });
  bus.on('*', () => { wildcardCount++; });

  bus.emit('zombie:killed', { id: 'z1' });
  assert.strictEqual(colonCount, 1, 'Colon handler received event');
  assert.strictEqual(underscoreCount, 1, 'Underscore handler received aliased event');
  assert.strictEqual(wildcardCount, 1, 'Wildcard handler received event');

  // Once test
  let onceCount = 0;
  bus.once('tower:placed', () => { onceCount++; });
  bus.emit('tower:placed', {});
  bus.emit('tower:placed', {});
  assert.strictEqual(onceCount, 1, 'Once handler should only trigger once');
});

// -------------------------------------------------------------
// 5. ENTITY MANAGER (TOWERS, ZOMBIES, TARGETING)
// -------------------------------------------------------------
console.log('\n--- 5. Entity Management & Combat ---');

test('Tower placement on strategic slot and free placement', () => {
  const engine = new Engine();
  const initialGold = engine.state.gold;

  const tower = engine.entities.addTower({
    slotId: 'slot_a1',
    name: 'Sniper Watchpost',
    cost: 260,
    range: 180,
  });

  assert(tower !== null, 'Tower should be placed successfully');
  assert.strictEqual(tower.slotId, 'slot_a1');
  assert.strictEqual(engine.state.gold, initialGold - 260);

  // Trying to place on occupied slot should fail
  const duplicate = engine.entities.addTower({
    slotId: 'slot_a1',
    cost: 260,
  });
  assert.strictEqual(duplicate, null, 'Occupied slot should reject new tower');
});

test('Tower upgrade and sell refund', () => {
  const engine = new Engine();
  const tower = engine.entities.addTower({
    slotId: 'slot_c1',
    cost: 260,
    damage: 20,
    upgradeCost: 150,
    sellRefund: 180,
  });

  const upgraded = engine.entities.upgradeTower(tower.id);
  assert.strictEqual(upgraded.level, 2);
  assert(upgraded.damage > 20, 'Damage should increase');

  const sold = engine.entities.removeTower(tower.id, true);
  assert.strictEqual(sold, true);
  assert.strictEqual(engine.entities.getTower(tower.id), null);
});

test('Zombie spawning, movement, and priority targeting', () => {
  const engine = new Engine();

  const z1 = engine.entities.addZombie({
    pathId: 'A',
    hp: 150,
    speed: 100,
    goldBounty: 25,
    scoreValue: 100,
  });

  const z2 = engine.entities.addZombie({
    pathId: 'A',
    hp: 300,
    speed: 50,
    goldBounty: 50,
    scoreValue: 200,
  });

  assert.strictEqual(engine.entities.getZombies().length, 2);

  // Simulate movement
  engine.update(1.0); // 1 second
  assert(z1.distanceTraveled > z2.distanceTraveled, 'Faster zombie should travel further');

  // Priority targeting: 'first' should pick z1
  const targetFirst = engine.entities.getPriorityTarget(120, 220, 300, 'first');
  assert.strictEqual(targetFirst.id, z1.id);

  // Priority targeting: 'strongest' should pick z2
  const targetStrong = engine.entities.getPriorityTarget(120, 220, 300, 'strongest');
  assert.strictEqual(targetStrong.id, z2.id);

  // Damage and Kill
  const goldBefore = engine.state.gold;
  engine.entities.damageZombie(z1.id, 200); // lethal
  assert.strictEqual(engine.entities.getZombie(z1.id), null, 'Killed zombie should be removed');
  assert.strictEqual(engine.state.gold, goldBefore + 25, 'Bounty should be awarded');
  assert.strictEqual(engine.state.stats.zombiesKilled, 1);
});

// -------------------------------------------------------------
// 6. GAME LOOP & FIXED TIMESTEP
// -------------------------------------------------------------
console.log('\n--- 6. Game Loop & Clock ---');

test('Fixed timestep accumulator updates logic deterministically', () => {
  const engine = new Engine();
  let ticks = 0;
  engine.on('tick', () => { ticks++; });

  // Simulate 1/60s frame
  engine.clock.stepFrame(1000);
  engine.clock.stepFrame(1000 + 1000 / 60);

  assert(ticks >= 1, 'Should trigger at least 1 fixed update tick');
  assert(engine.clock.gameTime > 0, 'Game time should advance');
});

console.log(`\n=== TEST SUMMARY: ${testsPassed} passed, ${testsFailed} failed ===`);
if (testsFailed > 0) {
  process.exit(1);
} else {
  console.log('ALL TESTS PASSED WITH 100% SUCCESS!\n');
}
