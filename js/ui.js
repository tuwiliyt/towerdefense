/**
 * ZOMBIE TOWER DEFENSE - UI & MINIMAP CONTROLLER
 * Full retro apocalyptic HUD, controls, bottom panel, minimap radar, tooltips, and modal systems.
 */

class RetroAudio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.masterGain = null;
    this.externalSound = null;
  }

  init() {
    if (this.ctx) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.muted ? 0 : 0.35, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);
    } catch (e) {
      console.warn("Web Audio API not supported", e);
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.muted ? 0 : 0.35, this.ctx.currentTime);
    }
    if (this.externalSound && typeof this.externalSound.toggleMute === 'function') {
      this.externalSound.toggleMute();
    }
    return this.muted;
  }

  playTone(freq, type, duration, endFreq = null) {
    if (this.muted) return;
    this.init();
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
      gain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + duration);
    } catch (err) {}
  }

  playClick() {
    this.playTone(850, 'square', 0.05, 400);
  }

  playSelect() {
    this.playTone(520, 'triangle', 0.08, 780);
  }

  playPlace() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;
    this.playTone(160, 'sawtooth', 0.12, 60);
    setTimeout(() => this.playTone(450, 'square', 0.08, 900), 50);
  }

  playUpgrade() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;
    [350, 520, 690, 1040].forEach((freq, idx) => {
      setTimeout(() => this.playTone(freq, 'triangle', 0.1), idx * 55);
    });
  }

  playSell() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;
    this.playTone(980, 'sine', 0.1);
    setTimeout(() => this.playTone(1320, 'sine', 0.18), 80);
  }

  playNextWave() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;
    this.playTone(220, 'sawtooth', 0.35, 330);
    setTimeout(() => this.playTone(290, 'sawtooth', 0.4, 440), 200);
  }

  playOvercharge() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;
    this.playTone(120, 'sawtooth', 0.8, 40);
    setTimeout(() => this.playTone(880, 'square', 0.4, 150), 100);
  }

  playError() {
    this.playTone(180, 'square', 0.15, 140);
  }

  playShoot(type) {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;
    const t = (type || '').toLowerCase();
    switch (t) {
      case 'gunner':
        this.playTone(600 + Math.random() * 200, 'square', 0.04, 150);
        break;
      case 'archer':
        this.playTone(400, 'triangle', 0.08, 200);
        break;
      case 'rocket':
        this.playTone(180, 'sawtooth', 0.25, 60);
        break;
      case 'flametrost':
      case 'flame':
        this.playTone(120 + Math.random() * 80, 'sawtooth', 0.06, 80);
        break;
      case 'tesla':
        this.playTone(900 + Math.random() * 300, 'sawtooth', 0.08, 300);
        break;
      case 'mortar':
        this.playTone(90, 'sawtooth', 0.45, 30);
        break;
      default:
        this.playTone(400, 'square', 0.05);
    }
  }

  playZombieHit() {
    if (this.muted || Math.random() > 0.3) return;
    this.playTone(160 + Math.random() * 60, 'triangle', 0.05, 80);
  }
}

// Tower Definitions & Key Mapping
const TOWER_TYPE_MAP = {
  gunner: 'GUNNER',
  archer: 'ARCHER',
  rocket: 'ROCKET',
  flame: 'FLAMETROST',
  tesla: 'TESLA',
  mortar: 'MORTAR'
};

const TOWER_DEFINITIONS = {
  GUNNER: {
    id: 'gunner',
    key: 'GUNNER',
    name: 'GUNNER NEST',
    cost: 280,
    range: 165,
    damage: 24,
    fireRate: 0.18,
    type: 'Rapid Ballistic',
    color: '#6d5c4b',
    desc: 'Rapid single-target gunfire. High rate of fire suppresses fast runners.',
    upgradeMultiplier: { cost: 0.8, dmg: 1.75, range: 25, rate: 0.85 }
  },
  ARCHER: {
    id: 'archer',
    key: 'ARCHER',
    name: 'ARCHER TOWER',
    cost: 350,
    range: 225,
    damage: 48,
    fireRate: 0.7,
    type: 'Piercing Arrow',
    color: '#784f2b',
    desc: 'Long-range archery with penetrating shots and critical strikes.',
    upgradeMultiplier: { cost: 0.8, dmg: 1.7, range: 30, rate: 0.88 }
  },
  ROCKET: {
    id: 'rocket',
    key: 'ROCKET',
    name: 'ROCKET LAUNCHER',
    cost: 550,
    range: 200,
    damage: 95,
    fireRate: 1.35,
    splashRadius: 70,
    type: 'Heavy Explosive',
    color: '#4f5945',
    desc: 'Fires high-velocity explosive rockets causing heavy AoE blast damage.',
    upgradeMultiplier: { cost: 0.8, dmg: 1.65, range: 25, rate: 0.85 }
  },
  FLAMETROST: {
    id: 'flame',
    key: 'FLAMETROST',
    name: 'FLAMETROST',
    cost: 1250,
    range: 155,
    damage: 15,
    fireRate: 0.08,
    type: 'AoE Flame & Slow',
    color: '#ff7700',
    desc: 'Dual napalm & frost burner torches and slows marching zombie swarms.',
    upgradeMultiplier: { cost: 0.8, dmg: 1.8, range: 20, rate: 0.82 }
  },
  TESLA: {
    id: 'tesla',
    key: 'TESLA',
    name: 'TESLA COIL',
    cost: 650,
    range: 180,
    damage: 65,
    fireRate: 0.9,
    type: 'Chain Lightning',
    color: '#00d9ff',
    desc: 'High-voltage electric arcs leaping between multiple targets with stun.',
    upgradeMultiplier: { cost: 0.8, dmg: 1.7, range: 25, rate: 0.85 }
  },
  MORTAR: {
    id: 'mortar',
    key: 'MORTAR',
    name: 'MORTAR',
    cost: 2150,
    range: 350,
    minRange: 90,
    damage: 290,
    fireRate: 2.7,
    splashRadius: 110,
    type: 'Heavy Artillery',
    color: '#4f4940',
    desc: 'Lobs colossal explosive mortar shells into dense zombie clusters.',
    upgradeMultiplier: { cost: 0.8, dmg: 1.6, range: 35, rate: 0.85 }
  }
};

// Aliases for lowercase access
Object.keys(TOWER_DEFINITIONS).forEach((k) => {
  TOWER_DEFINITIONS[k.toLowerCase()] = TOWER_DEFINITIONS[k];
  TOWER_DEFINITIONS[TOWER_DEFINITIONS[k].id] = TOWER_DEFINITIONS[k];
});

class UIController {
  constructor() {
    this.audio = (typeof window !== 'undefined' && window.SoundFX) ? new window.SoundFX() : new RetroAudio();
    this.selectedTowerType = null; // e.g. 'GUNNER'
    this.selectedPlacedTower = null;
    this.speedMultiplier = 1;
    this.isPaused = false;
    this.crtActive = true;
    this.placementValid = false;
    this.mouseCanvasPos = { x: 0, y: 0 };
    this.toastTimer = null;

    // Callbacks hooked by Main Engine
    this.onTowerPlaced = null;
    this.onNextWaveRequested = null;
    this.onSpeedChanged = null;
    this.onPauseToggled = null;
    this.onOverchargeRequested = null;
    this.onTowerUpgraded = null;
    this.onTowerSold = null;
    this.onRestartGame = null;

    this.cacheDOMElements();
    this.initEventListeners();
    this.initResponsiveScaling();
  }

  cacheDOMElements() {
    // Top-Left HUD
    this.hudWave = document.getElementById('hudWave');
    this.hudMaxWaves = document.getElementById('hudMaxWaves');
    this.hudScore = document.getElementById('hudScore');
    this.hudZombies = document.getElementById('hudZombies');
    this.hudGold = document.getElementById('hudGold');
    this.hudEnergy = document.getElementById('hudEnergy');

    // Top-Right Controls
    this.btnSpeed = document.getElementById('btnSpeed');
    this.speedIndicator = document.getElementById('speedIndicator');
    this.btnPause = document.getElementById('btnPause');
    this.pauseIcon = document.getElementById('pauseIcon');
    this.btnAudio = document.getElementById('btnAudio');
    this.audioIcon = document.getElementById('audioIcon');
    this.btnCrt = document.getElementById('btnCrt');

    // Survivor Base / Last Stand
    this.baseHpFill = document.getElementById('baseHpFill');
    this.baseHpText = document.getElementById('baseHpText');
    this.btnOvercharge = document.getElementById('btnOvercharge');

    // Bottom Panel
    this.towerCards = document.querySelectorAll('.tower-card');
    this.towerTooltip = document.getElementById('towerTooltip');
    this.ttName = document.getElementById('ttName');
    this.ttCost = document.getElementById('ttCost');
    this.ttDmg = document.getElementById('ttDmg');
    this.ttRate = document.getElementById('ttRate');
    this.ttRange = document.getElementById('ttRange');
    this.ttType = document.getElementById('ttType');
    this.ttDesc = document.getElementById('ttDesc');

    // Minimap
    this.minimapCanvas = document.getElementById('minimapCanvas');
    this.minimapCtx = this.minimapCanvas.getContext('2d');

    // Next Wave Button
    this.btnNextWave = document.getElementById('btnNextWave');
    this.waveStatusSub = document.getElementById('waveStatusSub');

    // Upgrade/Sell Modal
    this.towerModal = document.getElementById('towerModal');
    this.modalTowerTitle = document.getElementById('modalTowerTitle');
    this.modalLevelBadge = document.getElementById('modalLevelBadge');
    this.modalCurrentDmg = document.getElementById('modalCurrentDmg');
    this.modalNextDmg = document.getElementById('modalNextDmg');
    this.modalCurrentRange = document.getElementById('modalCurrentRange');
    this.modalNextRange = document.getElementById('modalNextRange');
    this.modalCurrentRate = document.getElementById('modalCurrentRate');
    this.modalNextRate = document.getElementById('modalNextRate');
    this.modalKills = document.getElementById('modalKills');
    this.modalTargetMode = document.getElementById('modalTargetMode');
    this.modalUpgradeBtn = document.getElementById('modalUpgradeBtn');
    this.modalUpgradeCost = document.getElementById('modalUpgradeCost');
    this.modalSellBtn = document.getElementById('modalSellBtn');
    this.modalSellRefund = document.getElementById('modalSellRefund');
    this.modalCloseBtn = document.getElementById('modalCloseBtn');

    // Toast Banner & Modals
    this.toastBanner = document.getElementById('toastBanner');
    this.gameStateModal = document.getElementById('gameStateModal');
    this.stateTitle = document.getElementById('stateTitle');
    this.stateStats = document.getElementById('stateStats');
    this.btnRestart = document.getElementById('btnRestart');

    // Containers
    this.gameCanvas = document.getElementById('gameCanvas');
    this.cabinetFrame = document.getElementById('cabinet-frame');
    this.cabinetViewport = document.getElementById('cabinet-viewport');
    this.crtOverlay = document.getElementById('crtOverlay');
  }

  initEventListeners() {
    // 1. Tower Card Selection & Tooltip Hover
    this.towerCards.forEach((card) => {
      const typeKey = card.dataset.tower;
      const canonicalKey = TOWER_TYPE_MAP[typeKey] || typeKey.toUpperCase();
      const def = TOWER_DEFINITIONS[canonicalKey];

      // Card Click
      card.addEventListener('click', (e) => {
        e.stopPropagation();
        this.selectTowerCard(canonicalKey);
      });

      // Card Hover Tooltip
      card.addEventListener('mouseenter', (e) => {
        if (def) this.showTooltip(def, card);
      });

      card.addEventListener('mouseleave', () => {
        this.hideTooltip();
      });
    });

    // 2. Speed Toggle Button (1x -> 2x -> 4x -> 1x)
    this.btnSpeed.addEventListener('click', (e) => {
      e.stopPropagation();
      this.audio.playClick();
      if (this.speedMultiplier === 1) this.speedMultiplier = 2;
      else if (this.speedMultiplier === 2) this.speedMultiplier = 4;
      else this.speedMultiplier = 1;

      this.speedIndicator.textContent = `${this.speedMultiplier}x`;
      if (this.speedMultiplier > 1) {
        this.btnSpeed.classList.add('active');
      } else {
        this.btnSpeed.classList.remove('active');
      }

      if (this.onSpeedChanged) this.onSpeedChanged(this.speedMultiplier);
    });

    // 3. Pause Button
    this.btnPause.addEventListener('click', (e) => {
      e.stopPropagation();
      this.audio.playClick();
      this.togglePause();
    });

    // 4. Audio Button
    this.btnAudio.addEventListener('click', (e) => {
      e.stopPropagation();
      const isMuted = this.audio.toggleMute();
      this.audioIcon.textContent = isMuted ? '🔇' : '🔊';
      if (!isMuted) this.audio.playClick();
    });

    // 5. CRT Scanline Toggle
    this.btnCrt.addEventListener('click', (e) => {
      e.stopPropagation();
      this.audio.playClick();
      this.crtActive = !this.crtActive;
      if (this.crtActive) {
        this.crtOverlay.classList.remove('crt-disabled');
        this.btnCrt.classList.remove('active');
      } else {
        this.crtOverlay.classList.add('crt-disabled');
        this.btnCrt.classList.add('active');
      }
    });

    // 6. Overcharge Manual Trigger
    this.btnOvercharge.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.onOverchargeRequested) {
        const success = this.onOverchargeRequested();
        if (success) {
          this.audio.playOvercharge();
          this.showToast('⚡ APOCALYPSE OVERCHARGE ACTIVATED!');
        } else {
          this.audio.playError();
          this.showToast('NOT ENOUGH ENERGY (REQUIRES 50 E)');
        }
      }
    });

    // 7. Next Wave Button
    this.btnNextWave.addEventListener('click', (e) => {
      e.stopPropagation();
      this.requestNextWave();
    });

    // 8. Tower Modal Actions (Upgrade / Sell / Target / Close)
    this.modalCloseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.audio.playClick();
      this.closeTowerModal();
    });

    this.modalUpgradeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!this.selectedPlacedTower) return;
      if (this.onTowerUpgraded) {
        const res = this.onTowerUpgraded(this.selectedPlacedTower);
        if (res && res.success) {
          this.audio.playUpgrade();
          this.refreshTowerModal(this.selectedPlacedTower);
          const name = this.selectedPlacedTower.name || (this.selectedPlacedTower.def && this.selectedPlacedTower.def.name) || 'TOWER';
          const lvl = this.selectedPlacedTower.level || this.selectedPlacedTower.currentLevel || 2;
          this.showToast(`${name} UPGRADED TO LVL ${lvl}!`);
        } else {
          this.audio.playError();
          this.showToast((res && res.message) || 'CANNOT UPGRADE');
        }
      }
    });

    this.modalSellBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!this.selectedPlacedTower) return;
      if (this.onTowerSold) {
        const refund = this.getTowerSellRefund(this.selectedPlacedTower);
        this.onTowerSold(this.selectedPlacedTower);
        this.audio.playSell();
        this.showToast(`TOWER SOLD (+${refund} G)`);
        this.closeTowerModal();
      }
    });

    this.modalTargetMode.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!this.selectedPlacedTower) return;
      this.audio.playClick();
      const newMode = this.cycleTowerTargetMode(this.selectedPlacedTower);
      this.modalTargetMode.textContent = `${newMode.toUpperCase()} ▶`;
    });

    // 9. Restart Game Button
    this.btnRestart.addEventListener('click', (e) => {
      e.stopPropagation();
      this.audio.playClick();
      this.gameStateModal.classList.remove('active');
      if (this.onRestartGame) this.onRestartGame();
    });

    // 10. Global Keyboard Shortcuts
    window.addEventListener('keydown', (e) => {
      if (['1', '2', '3', '4', '5', '6'].includes(e.key)) {
        const order = ['GUNNER', 'ARCHER', 'ROCKET', 'FLAMETROST', 'TESLA', 'MORTAR'];
        const idx = parseInt(e.key, 10) - 1;
        if (order[idx]) {
          this.selectTowerCard(order[idx]);
        }
      } else if (e.code === 'Space') {
        e.preventDefault();
        this.togglePause();
      } else if (e.key === 'f' || e.key === 'F') {
        this.btnSpeed.click();
      } else if (e.key === 'n' || e.key === 'N') {
        this.requestNextWave();
      } else if (e.key === 'e' || e.key === 'E' || e.key === 'o' || e.key === 'O') {
        this.btnOvercharge.click();
      } else if (e.key === 'm' || e.key === 'M') {
        this.btnAudio.click();
      } else if (e.key === 'Escape') {
        this.cancelPlacement();
        this.closeTowerModal();
      } else if (e.key === 'u' || e.key === 'U') {
        if (this.selectedPlacedTower) this.modalUpgradeBtn.click();
      } else if (e.key === 's' || e.key === 'S') {
        if (this.selectedPlacedTower) this.modalSellBtn.click();
      }
    });

    window.addEventListener('click', (e) => {
      if (!e.target.closest('#towerModal') && !e.target.closest('.tower-card')) {
        this.closeTowerModal();
      }
    });
  }

  initResponsiveScaling() {
    const resizeHandler = () => {
      const targetW = 1280;
      const targetH = 720;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const scale = Math.min((vw - 16) / targetW, (vh - 16) / targetH);
      this.cabinetFrame.style.transform = `scale(${Math.max(0.2, scale)})`;
    };

    window.addEventListener('resize', resizeHandler);
    resizeHandler();
  }

  getCanvasCoordinates(clientX, clientY) {
    const rect = this.gameCanvas.getBoundingClientRect();
    const scaleX = 1280 / rect.width;
    const scaleY = 720 / rect.height;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  }

  selectTowerCard(typeKey) {
    const canonical = TOWER_TYPE_MAP[typeKey.toLowerCase()] || typeKey.toUpperCase();
    if (this.selectedTowerType === canonical) {
      this.cancelPlacement();
      return;
    }

    this.selectedTowerType = canonical;
    this.closeTowerModal();
    this.audio.playSelect();

    this.towerCards.forEach((card) => {
      const cardType = card.dataset.tower;
      const cardCanonical = TOWER_TYPE_MAP[cardType] || cardType.toUpperCase();
      if (cardCanonical === canonical) {
        card.classList.add('selected');
      } else {
        card.classList.remove('selected');
      }
    });
  }

  cancelPlacement() {
    this.selectedTowerType = null;
    this.towerCards.forEach((card) => card.classList.remove('selected'));
  }

  requestNextWave() {
    this.btnNextWave.classList.add('pressed');
    setTimeout(() => this.btnNextWave.classList.remove('pressed'), 120);

    if (this.onNextWaveRequested) {
      const res = this.onNextWaveRequested();
      if (res && res.success) {
        this.audio.playNextWave();
        this.showToast(`WAVE ${res.wave} COMMENCING! PREPARE DEFENSES!`);
      } else if (res && res.message) {
        this.showToast(res.message);
      }
    }
  }

  togglePause() {
    this.isPaused = !this.isPaused;
    this.pauseIcon.textContent = this.isPaused ? '▶' : '||';
    if (this.isPaused) {
      this.btnPause.classList.add('active');
      this.showToast('TACTICAL SIMULATION PAUSED');
    } else {
      this.btnPause.classList.remove('active');
      this.showToast('RESUMING COMBAT');
    }
    if (this.onPauseToggled) this.onPauseToggled(this.isPaused);
  }

  showTooltip(def, cardElement) {
    this.ttName.textContent = def.name;
    this.ttCost.textContent = `${def.cost} G`;
    this.ttDmg.textContent = def.damage;
    this.ttRate.textContent = `${def.fireRate}s`;
    this.ttRange.textContent = `${def.range} px`;
    this.ttType.textContent = def.type;
    this.ttDesc.textContent = def.desc;

    const cardRect = cardElement.getBoundingClientRect();
    const frameRect = this.cabinetFrame.getBoundingClientRect();
    const scale = frameRect.width / 1280;

    const leftInFrame = (cardRect.left - frameRect.left) / scale;
    this.towerTooltip.style.left = `${Math.max(10, Math.min(1280 - 310, leftInFrame - 40))}px`;
    this.towerTooltip.classList.add('visible');
  }

  hideTooltip() {
    this.towerTooltip.classList.remove('visible');
  }

  openTowerModal(tower) {
    this.selectedPlacedTower = tower;
    this.cancelPlacement();
    this.refreshTowerModal(tower);

    let modalX = tower.x - 150;
    let modalY = tower.y - 210;
    if (modalX < 20) modalX = 20;
    if (modalX > 1280 - 320) modalX = 1280 - 320;
    if (modalY < 70) modalY = tower.y + 40;
    if (modalY > 720 - 240) modalY = 720 - 240;

    this.towerModal.style.left = `${modalX}px`;
    this.towerModal.style.top = `${modalY}px`;
    this.towerModal.classList.add('open');
    this.audio.playSelect();
  }

  getTowerLevel(tower) {
    return tower.currentLevel || tower.level || 1;
  }

  getTowerUpgradeCost(tower) {
    if (typeof tower.getUpgradeCost === 'function') return tower.getUpgradeCost();
    if (tower.typeDef && tower.typeDef.levels) {
      const nextLvl = this.getTowerLevel(tower) + 1;
      const nextDef = tower.typeDef.levels.find((l) => l.level === nextLvl);
      return nextDef ? nextDef.upgradeCost : 0;
    }
    const def = tower.def || TOWER_DEFINITIONS[tower.typeKey] || TOWER_DEFINITIONS[tower.type];
    if (!def) return 250;
    return Math.round(def.cost * (this.getTowerLevel(tower) === 1 ? 0.8 : 1.35));
  }

  getTowerSellRefund(tower) {
    if (typeof tower.getSellValue === 'function') return tower.getSellValue();
    if (typeof tower.getSellRefund === 'function') return tower.getSellRefund();
    if (typeof tower.sell === 'function') {
      const invested = tower.totalInvestment || tower.totalInvested || 300;
      return Math.round(invested * 0.70);
    }
    const invested = tower.totalInvested || tower.totalInvestment || 300;
    return Math.round(invested * 0.70);
  }

  cycleTowerTargetMode(tower) {
    if (typeof tower.cycleTargetMode === 'function') return tower.cycleTargetMode();
    const modes = ['first', 'closest', 'strongest', 'weakest'];
    const cur = tower.targetingMode || tower.targetMode || 'first';
    const next = modes[(modes.indexOf(cur) + 1) % modes.length];
    tower.targetingMode = next;
    tower.targetMode = next;
    return next;
  }

  refreshTowerModal(tower) {
    const level = this.getTowerLevel(tower);
    const isMax = level >= 3;
    const name = tower.name || (tower.typeDef && tower.typeDef.name) || (tower.def && tower.def.name) || 'TOWER';

    this.modalTowerTitle.textContent = name;
    this.modalLevelBadge.textContent = isMax ? 'LVL 3 (MAX)' : `LVL ${level}`;

    const dmg = Math.round(tower.damage || (tower.stats && tower.stats.damage) || 25);
    const range = Math.round(tower.range || (tower.stats && tower.stats.range) || 180);
    const rate = tower.fireRate || (tower.stats && tower.stats.fireRate) || 0.2;
    const kills = tower.kills || tower.enemiesKilled || 0;
    const targetMode = tower.targetingMode || tower.targetMode || 'first';

    this.modalCurrentDmg.textContent = dmg;
    this.modalCurrentRange.textContent = range;
    this.modalCurrentRate.textContent = `${typeof rate === 'number' ? rate.toFixed(2) : rate}s`;
    this.modalKills.textContent = `${kills} ZOMBIES`;
    this.modalTargetMode.textContent = `${targetMode.toUpperCase()} ▶`;

    if (!isMax) {
      const cost = this.getTowerUpgradeCost(tower);
      this.modalNextDmg.textContent = `+${Math.round(dmg * 0.75)}`;
      this.modalNextRange.textContent = `+30`;
      this.modalNextRate.textContent = `-0.03s`;
      this.modalUpgradeCost.textContent = `${cost} G`;
      this.modalUpgradeBtn.disabled = false;
    } else {
      this.modalNextDmg.textContent = 'MAX';
      this.modalNextRange.textContent = 'MAX';
      this.modalNextRate.textContent = 'MAX';
      this.modalUpgradeCost.textContent = 'MAX LEVEL';
      this.modalUpgradeBtn.disabled = true;
    }

    const refund = this.getTowerSellRefund(tower);
    this.modalSellRefund.textContent = `+${refund} G`;
  }

  closeTowerModal() {
    this.selectedPlacedTower = null;
    this.towerModal.classList.remove('open');
  }

  showToast(msg, duration = 2400) {
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastBanner.textContent = msg;
    this.toastBanner.classList.add('show');
    this.toastTimer = setTimeout(() => {
      this.toastBanner.classList.remove('show');
    }, duration);
  }

  showGameOver(victory, wave, score, kills) {
    this.stateTitle.textContent = victory ? 'SURVIVORS VICTORIOUS!' : 'SURVIVOR BASE OVERRUN!';
    this.stateTitle.className = `state-title ${victory ? 'victory' : 'defeat'}`;
    this.stateStats.innerHTML = `
      WAVES ENDURED: ${wave}/40<br>
      FINAL SCORE: ${(score || 0).toLocaleString()}<br>
      ZOMBIES TERMINATED: ${(kills || 0).toLocaleString()}
    `;
    this.gameStateModal.classList.add('active');
  }

  updateHUD(state) {
    // 1. Wave
    this.hudWave.textContent = state.wave;
    this.hudMaxWaves.textContent = state.maxWaves || 40;

    // 2. Score
    this.hudScore.textContent = (state.score || 0).toLocaleString();

    // 3. Zombies remaining
    this.hudZombies.textContent = state.zombiesRemaining;

    // 4. Resources
    this.hudGold.textContent = `${Math.floor(state.gold)} G`;
    this.hudEnergy.textContent = `${Math.floor(state.energy)} E`;

    // 5. Base HP Bar
    const hpRatio = Math.max(0, Math.min(1, state.baseHp / (state.baseMaxHp || 100)));
    this.baseHpFill.style.width = `${hpRatio * 100}%`;
    this.baseHpText.textContent = `${Math.ceil(state.baseHp)}/${state.baseMaxHp || 100}`;

    if (hpRatio < 0.25) {
      this.baseHpFill.style.background = 'linear-gradient(180deg, #ff3333 0%, #aa0000 100%)';
    } else if (hpRatio < 0.5) {
      this.baseHpFill.style.background = 'linear-gradient(180deg, #ffbb00 0%, #bb6600 100%)';
    } else {
      this.baseHpFill.style.background = 'linear-gradient(180deg, #5de65d 0%, #20a020 100%)';
    }

    // 6. Overcharge Button State
    this.btnOvercharge.disabled = state.energy < 50;

    // 7. Tower Cards Affordability State
    this.towerCards.forEach((card) => {
      const typeKey = card.dataset.tower;
      const canonical = TOWER_TYPE_MAP[typeKey] || typeKey.toUpperCase();
      const def = TOWER_DEFINITIONS[canonical];
      if (def && state.gold < def.cost) {
        card.classList.add('disabled');
      } else {
        card.classList.remove('disabled');
      }
    });

    // 8. Next Wave Button Status Subtext
    if (state.waveActive) {
      this.waveStatusSub.textContent = `IN COMBAT (${state.zombiesRemaining})`;
      this.btnNextWave.classList.add('wave-active');
    } else {
      this.waveStatusSub.textContent = `WAVE ${state.wave + 1} (N)`;
      this.btnNextWave.classList.remove('wave-active');
    }
  }

  // =========================================================================
  // REAL-TIME MINIMAP RADAR RENDERER
  // =========================================================================
  renderMinimap(game) {
    const ctx = this.minimapCtx;
    const w = this.minimapCanvas.width;
    const h = this.minimapCanvas.height;
    const sx = w / 1280;
    const sy = h / 720;

    // Dark military radar screen
    ctx.fillStyle = '#14120e';
    ctx.fillRect(0, 0, w, h);

    // Grid lines
    ctx.strokeStyle = 'rgba(70, 65, 50, 0.25)';
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 22) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y < h; y += 20) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Winding Paths
    const paths = (game.gameMap && [game.gameMap.pathA, game.gameMap.pathB]) || game.paths || [];
    if (paths && paths.length > 0) {
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // Outer path border
      ctx.strokeStyle = '#383226';
      ctx.lineWidth = 9;
      paths.forEach((path) => {
        if (!path || path.length === 0) return;
        ctx.beginPath();
        path.forEach((pt, i) => {
          if (i === 0) ctx.moveTo(pt.x * sx, pt.y * sy);
          else ctx.lineTo(pt.x * sx, pt.y * sy);
        });
        ctx.stroke();
      });

      // Inner road
      ctx.strokeStyle = '#5a503e';
      ctx.lineWidth = 5;
      paths.forEach((path) => {
        if (!path || path.length === 0) return;
        ctx.beginPath();
        path.forEach((pt, i) => {
          if (i === 0) ctx.moveTo(pt.x * sx, pt.y * sy);
          else ctx.lineTo(pt.x * sx, pt.y * sy);
        });
        ctx.stroke();
      });
    }

    // Entry A & B markers
    ctx.font = 'bold 7px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ff4444';
    ctx.fillText('A', 80 * sx, 150 * sy);
    ctx.fillText('B', 80 * sx, 430 * sy);

    // Survivor Base Marker
    ctx.fillStyle = '#00d9ff';
    ctx.beginPath();
    ctx.arc(1060 * sx, 450 * sy, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Placed Towers
    const towers = (game.towerManager && game.towerManager.towers) || game.towers || [];
    towers.forEach((tower) => {
      const tx = tower.x * sx;
      const ty = tower.y * sy;
      const def = tower.typeDef || tower.def || TOWER_DEFINITIONS[tower.typeKey] || TOWER_DEFINITIONS[tower.type];
      ctx.fillStyle = (def && def.color) || '#44cc44';
      ctx.fillRect(tx - 2, ty - 2, 4, 4);

      if (this.getTowerLevel(tower) > 1) {
        ctx.fillStyle = '#ffcc00';
        ctx.fillRect(tx - 1, ty - 1, 2, 2);
      }
    });

    // Active Zombies (Glowing Red Dots)
    const zombies = (game.zombieManager && game.zombieManager.zombies) || game.zombies || [];
    zombies.forEach((zombie) => {
      const isAlive = zombie.active !== undefined ? zombie.active : zombie.alive;
      if (!isAlive) return;

      const zx = zombie.x * sx;
      const zy = zombie.y * sy;

      if (zombie.isBoss || zombie.type === 'tank' || zombie.type === 'TANK') {
        ctx.fillStyle = '#ffcc00';
        ctx.beginPath();
        ctx.arc(zx, zy, 2.8, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = '#ff2222';
        ctx.beginPath();
        ctx.arc(zx, zy, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  }
}

// Global Exports
window.TOWER_TYPE_MAP = TOWER_TYPE_MAP;
window.TOWER_DEFINITIONS = TOWER_DEFINITIONS;
window.UIController = UIController;
