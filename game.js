
// GAME STATE
const G = {
  mode: 'campaign', // 'campaign' | 'endless'
  sector: 1,
  maxSectors: 10,
  // Player stats
  hp: 3, maxHp: 3,
  atk: 1, baseAtk: 1,
  mp: 5, maxMp: 5,
  exp: 0, expNext: 200,
  level: 1,
  // Meta upgrades (persistent)
  meta: { atk: false, hp: false, arch: false },
  runes: 0,
  // Grid
  cols: 8, rows: 8,
  cells: [], // flat array [row*cols+col]
  firstClick: true,
  gameOver: false,
  won: false,
  // Items/objectives
  keyFound: false, hatchOpen: false,
  keyCell: -1, hatchCell: -1,
  // Spell
  activeSpell: null,
  // Shield
  hasShield: false,
};

// Sector configs [cols, rows, density, newEnemies]
const SECTORS = [
  [8, 8, 0.15, ['slime']],
  [10, 10, 0.18, ['slime','guardian']],
  [12, 12, 0.20, ['slime','guardian','mimic']],
  [14, 14, 0.22, ['slime','guardian','brutal','mimic']],
  [12, 12, 0.25, ['slime','guardian','brutal','mimic']], // rest
  [16, 16, 0.24, ['slime','guardian','brutal','specter','mimic']],
  [18, 18, 0.26, ['slime','guardian','brutal','specter','mimic']],
  [20, 20, 0.28, ['slime','guardian','brutal','specter','mimic']],
  [22, 22, 0.30, ['slime','guardian','brutal','specter','mimic']],
  [12, 12, 0.20, ['guardian','brutal','specter']], // boss sector
];

const ENEMIES = {
  slime:    { level:1, exp:4,  emoji:'🟢', name:'Szlam Wymiarowy' },
  guardian: { level:2, exp:10, emoji:'🤖', name:'Spaczony Strażnik' },
  brutal:   { level:function(s){ return s<=6?3:4; }, exp:20, emoji:'👹', name:'Brutal Matrycy' },
  specter:  { level:function(s){ return Math.min(8, 4+Math.floor(s/3)); }, exp:40, emoji:'👻', name:'Widmo Przestrzenne' },
  mimic:    { level:0, exp:30, emoji:'📦', name:'Skrzynia (Mimik)' },
};

const CELL_COVERED = 0, CELL_REVEALED = 1;
const CONTENT_EMPTY = 'empty';
const CONTENT_ENEMY = 'enemy';
const CONTENT_KEY = 'key';
const CONTENT_HATCH = 'hatch';
const CONTENT_POTION = 'potion';
const CONTENT_CRYSTAL = 'crystal';
const CONTENT_SHIELD = 'shield';


// SCREEN MANAGEMENT

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-' + id).classList.add('active');
}

function showTitle() { showScreen('title'); }

function showNode() {
  updateNodeUI();
  showScreen('node');
}

function showTitle_() { showScreen('title'); }

function updateNodeUI() {
  document.getElementById('node-sector').textContent = G.sector;
  document.getElementById('node-runes').textContent = G.runes;
  document.getElementById('node-level').textContent = G.level;
  const upgrades = [
    { id:'buy-atk', key:'atk', cost:50, label:'shop-atk-cost' },
    { id:'buy-hp', key:'hp', cost:40, label:'shop-hp-cost' },
    { id:'buy-arch', key:'arch', cost:30, label:'shop-arch-cost' },
  ];
  upgrades.forEach(u => {
    const btn = document.getElementById('btn-' + u.id);
    const lbl = document.getElementById(u.label);
    if (G.meta[u.key]) {
      btn.textContent = '✓ KUPIONO';
      btn.disabled = true;
      lbl.textContent = '—';
    } else {
      btn.textContent = 'KUP';
      btn.disabled = G.runes < u.cost;
      lbl.textContent = u.cost + ' ✦';
    }
  });
  document.getElementById('node-msg').textContent = '';
}

function buyUpgrade(type) {
  const costs = { atk:50, hp:40, arch:30 };
  const cost = costs[type];
  if (G.meta[type]) return;
  if (G.runes < cost) {
    document.getElementById('node-msg').textContent = 'Za mało Złotych Run!';
    return;
  }
  G.runes -= cost;
  G.meta[type] = true;
  const names = { atk:'ATK bazowy +1', hp:'Lepsze mikstury', arch:'Bonus EXP +5' };
  document.getElementById('node-msg').textContent = '✓ Odblokowano: ' + names[type];
  updateNodeUI();
}

function continueFromNode() { startSector(); }

// =====================================================================
// GAME INIT
// =====================================================================
function startGame(mode) {
  G.mode = mode;
  G.sector = 1;
  G.hp = 3; G.maxHp = 3;
  G.atk = 1 + (G.meta.atk ? 1 : 0); G.baseAtk = G.atk;
  G.mp = 5; G.maxMp = 5;
  G.exp = 0; G.expNext = 100;
  G.level = 1;
  G.runes = 0;
  G.hasShield = false;
  startSector();
}

function startSector() {
  const idx = Math.min(G.sector - 1, SECTORS.length - 1);
  const cfg = SECTORS[idx];
  G.cols = cfg[0]; G.rows = cfg[1];
  const density = cfg[2];
  const allowedTypes = cfg[3];
  G.firstClick = true;
  G.gameOver = false;
  G.won = false;
  G.keyFound = false;
  G.hatchOpen = false;
  G.keyCell = -1;
  G.hatchCell = -1;
  G.activeSpell = null;
  G.atk = G.baseAtk + (G.meta.atk && G.sector===1 ? 0 : 0); // already set at start
  // heal to full at sector start if leveled up (handled in levelUp)

  buildGrid(density, allowedTypes);
  renderHUD();
  showScreen('game');
  addLog('info', `▶ Sektor ${G.sector} - ${getCellDesc()}`);
  addLog('info', 'Kliknij pole aby zacząć eksplorację.');
  document.getElementById('hud-sector').innerHTML =
    `SEKTOR ${G.sector}<br><span style="color:#444466;font-size:6px;">${G.mode==='endless'?'TRYB NIESKOŃCZONY':'KAMPANIA'}</span>`;
}

function getCellDesc() {
  const idx = Math.min(G.sector-1, SECTORS.length-1);
  const cfg = SECTORS[idx];
  return `${cfg[0]}×${cfg[1]}, ${Math.round(cfg[2]*100)}% wrogów`;
}

// =====================================================================
// GRID GENERATION
// =====================================================================
function buildGrid(density, allowedTypes) {
  const n = G.cols * G.rows;
  G.cells = [];

  // 1. Place enemies
  const numEnemies = Math.floor(n * density);
  const positions = shuffle(Array.from({length: n}, (_,i)=>i));

  // Reserve safe zone: we'll place safe cells later (first click guarantee)
  // For now, fill with empty
  for (let i = 0; i < n; i++) {
    G.cells.push({
      state: CELL_COVERED,
      content: CONTENT_EMPTY,
      enemy: null,
      item: null,
      number: 0,
      flagged: false,
      echoed: false,
    });
  }

  // Place enemies in first numEnemies positions
  for (let i = 0; i < numEnemies && i < positions.length; i++) {
    const pos = positions[i];
    const type = allowedTypes[Math.floor(Math.random() * allowedTypes.length)];
    const eInfo = ENEMIES[type];
    const level = typeof eInfo.level === 'function' ? eInfo.level(G.sector) : eInfo.level;
    G.cells[pos].content = CONTENT_ENEMY;
    G.cells[pos].enemy = { type, level, exp: eInfo.exp + (G.meta.arch ? 5 : 0), emoji: eInfo.emoji, name: eInfo.name };
  }

  // Place key and hatch under safe cells
  const safeCells = positions.slice(numEnemies);
  shuffle(safeCells);
  G.keyCell = safeCells[0];
  G.hatchCell = safeCells[1];
  G.cells[G.keyCell].item = 'key';
  G.cells[G.hatchCell].item = 'hatch';

  // Place items in remaining safe cells
  const itemPool = ['potion','potion','crystal','shield','potion'];
  for (let i = 2; i < safeCells.length && i-2 < itemPool.length; i++) {
    if (Math.random() < 0.3) {
      G.cells[safeCells[i]].item = itemPool[i-2];
    }
  }

  // Compute numbers
  computeNumbers();
  renderGrid();
}

function computeNumbers() {
  for (let r = 0; r < G.rows; r++) {
    for (let c = 0; c < G.cols; c++) {
      const idx = r*G.cols+c;
      if (G.cells[idx].content === CONTENT_ENEMY) {
        G.cells[idx].number = G.cells[idx].enemy.level;
        continue;
      }
      let sum = 0;
      for (let dr=-1;dr<=1;dr++) for (let dc=-1;dc<=1;dc++) {
        if (dr===0&&dc===0) continue;
        const nr=r+dr, nc=c+dc;
        if (nr<0||nr>=G.rows||nc<0||nc>=G.cols) continue;
        const ni=nr*G.cols+nc;
        if (G.cells[ni].content===CONTENT_ENEMY) sum+=G.cells[ni].enemy.level;
      }
      G.cells[idx].number = sum;
    }
  }
}

// =====================================================================
// RENDERING
// =====================================================================
function renderGrid() {
  const grid = document.getElementById('grid');
  // Compute cell size based on viewport
  const availW = window.innerWidth - 170; // side panel
  const availH = window.innerHeight - 52 - 52 - 10; // hud + spellbar
  const maxCellW = Math.floor((availW - 20) / G.cols);
  const maxCellH = Math.floor((availH - 20) / G.rows);
  const cellSize = Math.max(18, Math.min(maxCellW, maxCellH, 48));

  document.documentElement.style.setProperty('--cell-size', cellSize+'px');
  grid.style.gridTemplateColumns = `repeat(${G.cols}, ${cellSize}px)`;
  grid.innerHTML = '';

  for (let i = 0; i < G.cells.length; i++) {
    const el = document.createElement('div');
    el.className = 'cell';
    el.dataset.idx = i;
    el.addEventListener('click', onCellClick);
    el.addEventListener('contextmenu', onCellRightClick);
    grid.appendChild(el);
  }
  updateAllCells();
}

function updateAllCells() {
  const cells = document.querySelectorAll('.cell');
  cells.forEach(el => updateCellEl(el, parseInt(el.dataset.idx)));
}

function updateCellEl(el, idx) {
  const c = G.cells[idx];
  el.className = 'cell';
  el.innerHTML = '';
  el.title = '';

  if (c.state === CELL_COVERED) {
    el.classList.add('covered');
    if (G.activeSpell === 'echo' || G.activeSpell === 'dezint') {
      el.classList.add('spell-cursor');
    }
    if (c.flagged) {
      el.classList.add('flagged');
      const fm = document.createElement('span');
      fm.className = 'flag-mark';
      fm.textContent = '⚑';
      el.appendChild(fm);
    } else if (c.echoed) {
      el.classList.add('echoed');
      const er = document.createElement('span');
      er.className = 'echo-reveal';
      if (c.content === CONTENT_ENEMY) {
        er.textContent = c.enemy.emoji;
        er.title = c.enemy.name + ' Lv.' + c.enemy.level;
      } else if (c.item === 'key') { er.textContent = '🗝'; }
      else if (c.item === 'hatch') { er.textContent = '🚪'; }
      else if (c.item === 'potion') { er.textContent = '🧪'; }
      else if (c.item === 'crystal') { er.textContent = '💎'; }
      else if (c.item === 'shield') { er.textContent = '🛡'; }
      else { er.textContent = '·'; }
      el.appendChild(er);
    }
    return;
  }

  // Revealed
  el.classList.add('revealed');
  if (c.content === CONTENT_EMPTY || c.content === CONTENT_ENEMY) {
    if (c.item === 'key' && !G.keyFound) {
      el.textContent = '🗝';
      el.classList.add('key-cell');
    } else if (c.item === 'hatch' && G.keyFound && !G.hatchOpen) {
      el.textContent = '🚪';
      el.classList.add('hatch-cell');
    } else if (c.item === 'potion') {
      el.textContent = '🧪';
    } else if (c.item === 'crystal') {
      el.textContent = '💎';
    } else if (c.item === 'shield') {
      el.textContent = '🛡';
    } else if (c.number > 0) {
      el.classList.add('n'+Math.min(c.number,8));
      el.textContent = c.number;
    }
  }
}

function updateCell(idx) {
  const el = document.querySelector(`.cell[data-idx="${idx}"]`);
  if (el) updateCellEl(el, idx);
}

// =====================================================================
// HUD
// =====================================================================
function renderHUD() {
  // Hearts
  const hr = document.getElementById('hearts-row');
  hr.innerHTML = '';
  for (let i = 0; i < G.maxHp; i++) {
    const h = document.createElement('span');
    h.className = 'heart' + (i >= G.hp ? ' empty' : '');
    h.textContent = '❤';
    hr.appendChild(h);
  }
  // ATK
  document.getElementById('atk-val').textContent = G.atk;
  // Crystals
  const cr = document.getElementById('crystals-row');
  cr.innerHTML = '';
  for (let i = 0; i < G.maxMp; i++) {
    const c = document.createElement('span');
    c.className = 'crystal' + (i >= G.mp ? ' empty' : '');
    c.textContent = '◆';
    cr.appendChild(c);
  }
  // EXP
  const pct = Math.min(100, Math.floor(G.exp / G.expNext * 100));
  document.getElementById('exp-bar').style.width = pct+'%';
  document.getElementById('exp-label').textContent = `Lv.${G.level}`;
  // Spell buttons
  updateSpellButtons();
  // Inventory
  renderInventory();
}

function updateSpellButtons() {
  const spells = [
    {id:'flag', cost:1}, {id:'echo', cost:2}, {id:'dezint', cost:4}
  ];
  spells.forEach(s => {
    const btn1 = document.getElementById('sb-'+s.id);
    const btn2 = document.getElementById('sbb-'+s.id);
    const canAfford = G.mp >= s.cost;
    const isActive = G.activeSpell === s.id;
    if (btn1) { btn1.disabled = !canAfford; btn1.classList.toggle('active-spell', isActive); }
    if (btn2) { btn2.disabled = !canAfford; btn2.classList.toggle('active', isActive); }
  });
  // body cursor class
  document.body.className = G.activeSpell === 'echo' ? 'spell-echo' :
                             G.activeSpell === 'dezint' ? 'spell-dezint' : '';
}

function renderInventory() {
  const ig = document.getElementById('inv-grid');
  ig.innerHTML = '';
  const items = [];
  if (G.hasShield) items.push({ icon:'🛡', label:'Tarcza Kinetyczna' });
  if (G.keyFound) items.push({ icon:'🗝', label:'Klucz Sektora' });
  for (let i = 0; i < 6; i++) {
    const slot = document.createElement('div');
    slot.className = 'inv-slot';
    if (items[i]) { slot.textContent = items[i].icon; slot.title = items[i].label; }
    ig.appendChild(slot);
  }
}

// =====================================================================
// CELL INTERACTION
// =====================================================================
function onCellClick(e) {
  e.preventDefault();
  if (G.gameOver || G.won) return;
  const idx = parseInt(e.currentTarget.dataset.idx);
  const c = G.cells[idx];
  if (c.state === CELL_REVEALED) {
    if (c.item === 'key' && !G.keyFound) { collectKey(idx); return; }
    if (c.item === 'hatch' && G.keyFound) { openHatch(idx); return; }
    if (c.item === 'potion') { collectPotion(idx, 'potion'); return; }
    if (c.item === 'crystal') { collectPotion(idx, 'crystal'); return; }
    if (c.item === 'shield') { collectPotion(idx, 'shield'); return; }
    return;
  }
  if (c.flagged && G.activeSpell !== 'flag') return; // blocked

  // SPELL MODE
  if (G.activeSpell === 'echo') { castEcho(idx); return; }
  if (G.activeSpell === 'dezint') { castDezint(idx); return; }

  // Normal reveal
  if (G.firstClick) {
    ensureSafeStart(idx);
    G.firstClick = false;
  }
  revealCell(idx, true);
}

function onCellRightClick(e) {
  e.preventDefault();
  if (G.gameOver || G.won) return;
  const idx = parseInt(e.currentTarget.dataset.idx);
  const c = G.cells[idx];
  if (c.state === CELL_REVEALED) return;
  castFlag(idx);
}

function ensureSafeStart(idx) {
  // jesli pierwsze klikniecie trafia we wroga, przenosimy go
  if (G.cells[idx].content === CONTENT_ENEMY) {
    for (let i = 0; i < G.cells.length; i++) {
      if (G.cells[i].content === CONTENT_EMPTY && i !== idx &&
          G.cells[i].item !== 'key' && G.cells[i].item !== 'hatch') {
        G.cells[i].content = CONTENT_ENEMY;
        G.cells[i].enemy = G.cells[idx].enemy;
        G.cells[idx].content = CONTENT_EMPTY;
        G.cells[idx].enemy = null;
        computeNumbers();
        break;
      }
    }
  }

  // czyszczenie bezpiecznej strefy 3x3
  const r0 = Math.floor(idx / G.cols);
  const c0 = idx % G.cols;
  for (let dr=-1;dr<=1;dr++) for (let dc=-1;dc<=1;dc++) {
    const nr=r0+dr, nc=c0+dc;
    if (nr<0||nr>=G.rows||nc<0||nc>=G.cols) continue;
    const ni=nr*G.cols+nc;
    if (G.cells[ni].content===CONTENT_ENEMY) {
      for (let i=0;i<G.cells.length;i++) {
        if (G.cells[i].content===CONTENT_EMPTY && !isNearIdx(i,idx,1) &&
            G.cells[i].item!=='key' && G.cells[i].item!=='hatch') {
          G.cells[i].content=CONTENT_ENEMY;
          G.cells[i].enemy=G.cells[ni].enemy;
          G.cells[ni].content=CONTENT_EMPTY;
          G.cells[ni].enemy=null;
          computeNumbers();
          break;
        }
      }
    }
  }

  // przeniesienie wlazu i klucza z dala od strefy startowej
  relocateObjectivesFromStart(idx);
}

function relocateObjectivesFromStart(startIdx) {
  const sr = Math.floor(startIdx / G.cols);
  const sc = startIdx % G.cols;

  const distFromStart = (i) => {
    const r = Math.floor(i / G.cols);
    const c = i % G.cols;
    return Math.abs(r - sr) + Math.abs(c - sc);
  };

  // szukamy bezpiecznych zakrytych pol daleko od startu
  const candidates = [];
  for (let i = 0; i < G.cells.length; i++) {
    const cell = G.cells[i];
    if (cell.content === CONTENT_EMPTY && cell.state === CELL_COVERED && !isNearIdx(i, startIdx, 2)) {
      candidates.push(i);
    }
  }

  if (candidates.length < 2) return;

  // priorytet dla pol sasiadujacych z wrogami (number > 0), aby kaskada 0 ich nie odslonila
  const guarded = candidates.filter(i => G.cells[i].number > 0 && !G.cells[i].item);
  const pool = guarded.length >= 2 ? guarded : candidates.filter(i => !G.cells[i].item);

  if (pool.length === 0) return;

  // sortujemy malejaco po odleglosci od klikniecia startowego
  pool.sort((a, b) => distFromStart(b) - distFromStart(a));

  // przenosimy wlaz na najdalsze chronione pole
  const newHatch = pool[0];
  if (G.hatchCell !== -1) G.cells[G.hatchCell].item = null;
  G.hatchCell = newHatch;
  G.cells[G.hatchCell].item = 'hatch';

  // jesli klucz byl blisko startu lub na polu 0, tez przenosimy go w inne odlegle miejsce
  if (isNearIdx(G.keyCell, startIdx, 2) || G.cells[G.keyCell].number === 0) {
    const keyPool = pool.filter(i => i !== newHatch);
    if (keyPool.length > 0) {
      const pick = keyPool[Math.floor(Math.random() * Math.min(4, keyPool.length))];
      if (G.keyCell !== -1) G.cells[G.keyCell].item = null;
      G.keyCell = pick;
      G.cells[G.keyCell].item = 'key';
    }
  }
}

function isNearIdx(i,j,dist) {
  const ri=Math.floor(i/G.cols), ci=i%G.cols;
  const rj=Math.floor(j/G.cols), cj=j%G.cols;
  return Math.abs(ri-rj)<=dist && Math.abs(ci-cj)<=dist;
}

function revealCell(idx, userTriggered) {
  const c = G.cells[idx];
  if (c.state === CELL_REVEALED) return;
  c.state = CELL_REVEALED;
  c.echoed = false;
  c.flagged = false;

  if (c.content === CONTENT_ENEMY) {
    // obliczanie obrazen i zapisanie danych wroga przed wyczyszczeniem pola
    const dmg = Math.max(0, c.enemy.level - G.atk);
    const enemySnapshot = { ...c.enemy };
    let blockedByShield = false;

    if (G.hasShield && dmg > 0) {
      G.hasShield = false;
      blockedByShield = true;
      addLog('warn', `🛡 Tarcza pochłonęła atak ${enemySnapshot.name}!`);
    } else if (dmg > 0) {
      G.hp = Math.max(0, G.hp - dmg);
      addLog('damage', `⚔ Walka: ${enemySnapshot.name} Lv.${enemySnapshot.level} — obrażenia: ${dmg} HP`);
      const portrait = document.getElementById('portrait');
      portrait.classList.remove('pulse');
      void portrait.offsetWidth;
      portrait.classList.add('pulse');
    } else {
      addLog('kill', `⚔ Zabito ${enemySnapshot.name} Lv.${enemySnapshot.level} bez obrażeń!`);
    }

    // przyznanie exp i wyczyszczenie pola
    gainExp(enemySnapshot.exp);
    c.content = CONTENT_EMPTY;
    c.enemy = null;
    renderHUD();

    // najpierw odswiezamy kafelek, potem odpalamy animacje walki
    updateCell(idx);
    playCombatAnimation(idx, enemySnapshot, dmg, blockedByShield);

    if (G.hp <= 0) { setTimeout(()=>playerDied(), 350); return; }
  } else {
    // bezpieczne pole i kaskada
    if (c.number === 0 && !c.item) {
      cascadeReveal(idx);
    }
    updateCell(idx);
  }

  // sprawdzenie warunku wygranej
  checkSectorComplete();
}

function playCombatAnimation(idx, enemy, dmg) {
  const el = document.querySelector(`.cell[data-idx="${idx}"]`);
  const gridContainer = document.getElementById('grid-container');

  if (gridContainer) {
    gridContainer.classList.remove('flash-damage', 'combat-shake-light', 'combat-shake-heavy');
    void gridContainer.offsetWidth;
    if (dmg > 0) {
      gridContainer.classList.add('flash-damage', 'combat-shake-heavy');
    } else {
      gridContainer.classList.add('combat-shake-light');
    }
  }

  if (!el) return;

  // animacja uderzenia na samym kafelku
  el.classList.remove('combat-hit', 'combat-kill');
  void el.offsetWidth;
  el.classList.add(dmg > 0 ? 'combat-hit' : 'combat-kill');

  // chwilowe pokazanie ikony potwora i ciecia mieczem
  const slash = document.createElement('div');
  slash.className = 'combat-slash';
  slash.textContent = dmg > 0 ? '💥' : '⚔';
  el.appendChild(slash);
  setTimeout(() => slash.remove(), 450);

  // unoszacy sie tekst nad kafelkiem
  if (dmg > 0) {
    spawnParticle(el, `-${dmg} HP`, '#ff5252');
  } else {
    spawnParticle(el, `⚔ +${enemy.exp} EXP`, '#66bb6a');
  }
}

function cascadeReveal(idx) {
  const queue = [idx];
  const visited = new Set([idx]);
  while (queue.length) {
    const cur = queue.shift();
    const r = Math.floor(cur/G.cols), col = cur%G.cols;
    for (let dr=-1;dr<=1;dr++) for (let dc=-1;dc<=1;dc++) {
      if (dr===0&&dc===0) continue;
      const nr=r+dr, nc=col+dc;
      if (nr<0||nr>=G.rows||nc<0||nc>=G.cols) continue;
      const ni=nr*G.cols+nc;
      if (visited.has(ni)) continue;
      visited.add(ni);
      const c2 = G.cells[ni];
      if (c2.state===CELL_REVEALED || c2.content===CONTENT_ENEMY || c2.item==='hatch') continue;
      c2.state = CELL_REVEALED;
      c2.echoed = false;
      c2.flagged = false;
      updateCell(ni);
      if (c2.number===0 && !c2.item) queue.push(ni);
    }
  }
}

// SPELLS
function setSpell(spell) {
  if (G.activeSpell === spell) {
    G.activeSpell = null;
  } else {
    const costs = { flag:1, echo:2, dezint:4 };
    if (G.mp < costs[spell]) { addLog('warn','Brak many!'); return; }
    G.activeSpell = spell;
  }
  updateSpellButtons();
}

function castFlag(idx) {
  const c = G.cells[idx];
  if (c.state === CELL_REVEALED) return;
  if (c.flagged) {
    // Remove flag, refund 1 MP
    c.flagged = false;
    G.mp = Math.min(G.maxMp, G.mp + 1);
    addLog('spell', '⚑ Usunięto Znak Słabości (+1 MP zwrócono)');
  } else {
    if (G.mp < 1) { addLog('warn','Brak many!'); return; }
    G.mp -= 1;
    c.flagged = true;
    addLog('spell', '⚑ Nałożono Znak Słabości (-1 MP)');
  }
  G.activeSpell = null;
  updateSpellButtons();
  updateCell(idx);
  renderHUD();
}

function castEcho(idx) {
  const c = G.cells[idx];
  if (c.state === CELL_REVEALED) return;
  if (G.mp < 2) { addLog('warn','Brak many!'); return; }
  G.mp -= 2;
  c.echoed = true;
  G.activeSpell = null;
  const desc = c.content===CONTENT_ENEMY
    ? `${c.enemy.emoji} ${c.enemy.name} Lv.${c.enemy.level}`
    : c.item ? `Przedmiot: ${c.item}` : 'Puste pole';
  addLog('spell', `👁 Echokacja: ${desc} (-2 MP)`);
  updateSpellButtons();
  updateCell(idx);
  renderHUD();
}

function castDezint(idx) {
  const c = G.cells[idx];
  if (c.state === CELL_REVEALED) return;
  if (G.mp < 4) { addLog('warn','Brak many!'); return; }
  G.mp -= 4;
  G.activeSpell = null;

  if (c.content === CONTENT_ENEMY) {
    addLog('spell', `💥 Dezintegracja: ${c.enemy.name} Lv.${c.enemy.level} zniszczony! (+${c.enemy.exp} EXP)`);
    gainExp(c.enemy.exp);
    c.content = CONTENT_EMPTY;
    c.enemy = null;
    computeNumbers();
  } else {
    addLog('spell', '💥 Dezintegracja: Pole bezpieczne. Odsłonięto.');
  }
  c.state = CELL_REVEALED;
  c.echoed = false;
  c.flagged = false;
  G.activeSpell = null;
  updateSpellButtons();
  updateAllCells();
  renderHUD();
}

// ITEMS
function collectKey(idx) {
  G.keyFound = true;
  G.cells[idx].item = null;
  addLog('item', '🗝 Znaleziono Klucz Sektora! Szukaj włazu.');
  showOverlay('🗝 KLUCZ ZNALEZIONY!\nSzukaj włazu...', 1200);
  updateCell(idx);
  renderInventory();
  // Reveal hatch cell hint
  updateCell(G.hatchCell);
}

function openHatch(idx) {
  if (!G.keyFound) { addLog('warn','Potrzebujesz klucza!'); return; }
  G.hatchOpen = true;
  G.cells[idx].item = null;
  addLog('item', '🚪 Właz otwarty! Przejście do następnego sektora.');
  showOverlay('🚪 SEKTOR UKOŃCZONY!', 1000);
  setTimeout(()=>nextSector(), 1200);
}

function collectPotion(idx, type) {
  const c = G.cells[idx];
  if (type === 'potion') {
    const heal = G.meta.hp ? 2 : 1;
    const prev = G.hp;
    G.hp = Math.min(G.maxHp, G.hp + heal);
    if (G.hp === prev) addLog('item','🧪 HP już pełne.');
    else addLog('item',`🧪 Mikstura zdrowia: +${G.hp-prev} HP`);
  } else if (type === 'crystal') {
    const prev = G.mp;
    G.mp = Math.min(G.maxMp, G.mp + 1);
    addLog('item',`💎 Kryształ Many: +${G.mp-prev} MP`);
  } else if (type === 'shield') {
    G.hasShield = true;
    addLog('item','🛡 Tarcza Kinetyczna aktywna!');
  }
  c.item = null;
  updateCell(idx);
  renderHUD();
}

// EXP & LEVELING
function gainExp(amount) {
  G.exp += amount;
  while (G.exp >= G.expNext) {
    G.exp -= G.expNext;
    levelUp();
  }
}

function levelUp() {
  G.level++;
  G.expNext = Math.floor(G.expNext * 1.7);
  G.baseAtk++;
  G.atk = G.baseAtk;
  G.hp = G.maxHp; // full heal
  addLog('lvlup', `★ POZIOM ${G.level}! ATK +1, HP odnowione!`);
  const portrait = document.getElementById('portrait');
  portrait.classList.remove('levelup');
  void portrait.offsetWidth;
  portrait.classList.add('levelup');
  showOverlay(`★ AWANS!\nPoziom ${G.level}\nATK: ${G.atk}`, 900);
  document.getElementById('atk-val').textContent = G.atk;
}

// SECTOR COMPLETION
function checkSectorComplete() {
  // Win by hatch (main path)
}

function nextSector() {
  G.sector++;
  if (G.mode === 'campaign' && G.sector > G.maxSectors) {
    // Win!
    document.getElementById('ws-sectors').textContent = G.maxSectors;
    document.getElementById('ws-level').textContent = G.level;
    document.getElementById('ws-runes').textContent = G.runes;
    showScreen('win');
    return;
  }
  // Earn runes per sector
  G.runes += 15 + G.sector * 5;
  if (G.mode === 'endless') {
    startSector();
  } else {
    showNode();
  }
}

// DEATH
function playerDied() {
  G.gameOver = true;
  document.getElementById('ds-sector').textContent = G.sector;
  document.getElementById('ds-level').textContent = G.level;
  document.getElementById('ds-atk').textContent = G.atk;
  document.getElementById('ds-exp').textContent = G.exp;
  document.getElementById('ds-runes').textContent = G.runes;
  showScreen('death');
}


// HELPERS
function shuffle(arr) {
  for (let i=arr.length-1;i>0;i--) {
    const j=Math.floor(Math.random()*(i+1));
    [arr[i],arr[j]]=[arr[j],arr[i]];
  }
  return arr;
}

function addLog(type, msg) {
  const log = document.getElementById('combat-log');
  const el = document.createElement('div');
  el.className = 'log-entry ' + type;
  el.textContent = msg;
  log.appendChild(el);
  // Keep max 50 entries
  while (log.children.length > 50) log.removeChild(log.firstChild);
  log.scrollTop = log.scrollHeight;
}

function showOverlay(msg, duration=1500) {
  const ov = document.getElementById('overlay-msg');
  ov.textContent = msg;
  ov.classList.add('show');
  setTimeout(()=>ov.classList.remove('show'), duration);
}

function spawnParticle(el, text, color) {
  if (!el) return;
  const rect = el.getBoundingClientRect();
  const p = document.createElement('div');
  p.className = 'particle';
  p.textContent = text;
  p.style.color = color;
  p.style.left = (rect.left + rect.width/2) + 'px';
  p.style.top = (rect.top) + 'px';
  p.style.textShadow = '0 0 6px ' + color;
  document.body.appendChild(p);
  setTimeout(()=>p.remove(), 1200);
}


// KEYBOARD
document.addEventListener('keydown', e => {
  if (G.gameOver || G.won) return;
  const key = e.key;
  if (key==='1') setSpell('flag');
  else if (key==='2') setSpell('echo');
  else if (key==='3') setSpell('dezint');
  else if (key==='Escape') { G.activeSpell=null; updateSpellButtons(); }
});

// Prevent context menu everywhere
document.addEventListener('contextmenu', e=>e.preventDefault());

// Fix portrait animations - clean up after they finish
document.getElementById('portrait').addEventListener('animationend', function(e){
  if(e.animationName==='portraitPulse') this.classList.remove('pulse');
  if(e.animationName==='levelUpPulse') this.classList.remove('levelup');
});

// WINDOW RESIZE
window.addEventListener('resize', ()=>{
  if (document.getElementById('screen-game').classList.contains('active')) {
    renderGrid();
  }
});


// INIT

// Make showTitle work on buttons
window.startGame = startGame;
window.showTitle = showTitle;
window.showNode = showNode;
window.buyUpgrade = buyUpgrade;
window.continueFromNode = continueFromNode;
window.setSpell = setSpell;
