// =====================================================================
// MINE-CRAWL: TACTICAL DEFUSER - logika gry
// =====================================================================

// ---------- STAN GRY ----------
const G = {
  mode: 'campaign', // 'campaign' | 'endless'
  sector: 1,
  maxSectors: 10,
  // statystyki gracza
  hp: 3, maxHp: 3,
  atk: 1, baseAtk: 1,
  mp: 5, maxMp: 5,
  exp: 0, expNext: 75,
  level: 1,
  // ulepszenia trwale (meta) i waluta
  meta: { atk: false, hp: false, arch: false },
  runes: 0,
  nodeUnlocked: false,   // Bezpieczny Wezel odblokowuje sie po sektorze NODE_AFTER_SECTOR
  nodeScreenKind: 'node',
  // plansza
  cols: 8, rows: 8,
  cells: [], // plaska tablica [row*cols+col]
  firstClick: true,
  gameOver: false,
  won: false,
  // cele sektora
  keyFound: false, hatchOpen: false,
  keyCell: -1, hatchCell: -1,
  // zaklecie / tarcza
  activeSpell: null,
  hasShield: false,
};

// ---------- ZAPIS POSTEPU (localStorage, z bezpiecznym fallbackiem) ----------
const Save = {
  KEY: 'mineCrawl.save.v1',
  data: { runes: 0, meta: { atk: false, hp: false, arch: false }, tutorialSeen: false },
  load() {
    try {
      const raw = window.localStorage.getItem(this.KEY);
      if (raw) {
        const d = JSON.parse(raw);
        this.data.runes = Number(d.runes) || 0;
        this.data.meta = Object.assign({ atk: false, hp: false, arch: false }, d.meta || {});
        this.data.tutorialSeen = !!d.tutorialSeen;
      }
    } catch (e) { /* brak dostepu do storage - gra dziala dalej bez zapisu */ }
  },
  save() {
    try { window.localStorage.setItem(this.KEY, JSON.stringify(this.data)); } catch (e) { /* ignorujemy */ }
  },
};

function persistProgress() {
  Save.data.runes = G.runes;
  Save.data.meta = Object.assign({}, G.meta);
  Save.save();
}

// ---------- KONFIGURACJA ----------
const NODE_AFTER_SECTOR = 5;     // Bezpieczny Wezel pojawia sie dopiero po ukonczeniu tego sektora
const MIMIC_AMBUSH_DAMAGE = 1;   // zasadzka mimika zawsze zabiera 1 HP

const UPGRADES = {
  atk:  { cost: 50, name: 'ATK bazowy +1' },
  hp:   { cost: 40, name: 'Lepsze mikstury (+2 HP)' },
  arch: { cost: 30, name: 'Bonus EXP +5 za wroga' },
};

// konfiguracja sektorow: rozmiar, gestosc wrogow (razem z mimikami),
// STALA liczba mimikow na sektor oraz wagi pozostalych przeciwnikow
const SECTORS = [
  { cols: 8,  rows: 8,  density: 0.22, mimics: 0, weights: { slime: 8, guardian: 5, brutal: 1 } },
  { cols: 10, rows: 10, density: 0.21, mimics: 1, weights: { slime: 5, guardian: 5, brutal: 2 } },
  { cols: 12, rows: 12, density: 0.22, mimics: 1, weights: { slime: 3, guardian: 5, brutal: 3 } },
  { cols: 14, rows: 14, density: 0.24, mimics: 2, weights: { guardian: 4, brutal: 4, specter: 1 } },
  { cols: 12, rows: 12, density: 0.22, mimics: 0, weights: { slime: 3, guardian: 4, brutal: 3 } }, // sektor odpoczynkowy
  { cols: 16, rows: 16, density: 0.25, mimics: 2, weights: { guardian: 3, brutal: 4, specter: 3 } },
  { cols: 18, rows: 18, density: 0.27, mimics: 2, weights: { guardian: 2, brutal: 4, specter: 4 } },
  { cols: 20, rows: 20, density: 0.29, mimics: 3, weights: { brutal: 4, specter: 5 } },
  { cols: 22, rows: 22, density: 0.31, mimics: 3, weights: { brutal: 3, specter: 6 } },
  { cols: 12, rows: 12, density: 0.25, mimics: 2, weights: { brutal: 4, specter: 6 } },            // sektor finalowy
];

const ENEMIES = {
  slime:    { level:1, exp:11, emoji:'🟢', name:'Szlam Wymiarowy' },
  guardian: { level:function(s){ return s>=6?3:2; }, exp:16, emoji:'🤖', name:'Spaczony Strażnik' },
  brutal:   { level:function(s){ return s<=4?3:(s<=7?4:5); }, exp:26, emoji:'👹', name:'Brutal Matrycy' },
  specter:  { level:function(s){ return Math.min(9, 4 + Math.floor(s/2)); }, exp:38, emoji:'👻', name:'Widmo Przestrzenne' },
  mimic:    { level:0, exp:24, emoji:'📦', name:'Skrzynia (Mimik)' },
};

const CELL_COVERED = 0, CELL_REVEALED = 1;
const CONTENT_EMPTY = 'empty';
const CONTENT_ENEMY = 'enemy';
const CONTENT_KEY = 'key';
const CONTENT_HATCH = 'hatch';
const CONTENT_POTION = 'potion';
const CONTENT_CRYSTAL = 'crystal';
const CONTENT_SHIELD = 'shield';

const $ = (id) => document.getElementById(id);


// ---------- EKRANY I SKLEP ----------
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $('screen-' + id).classList.add('active');
}

function showTitle() { showScreen('title'); }

// kind: 'node' = Bezpieczny Wezel (pelne leczenie + sklep), 'shop' = Stacja Ulepszen (tylko sklep)
function showNode(kind) {
  G.nodeScreenKind = (kind === 'shop') ? 'shop' : 'node';
  if (G.nodeScreenKind === 'node') {
    G.hp = G.maxHp;   // po powrocie do wezla gracz ma pelne zdrowie i mane
    G.mp = G.maxMp;
    renderHUD();
  }
  updateNodeUI();
  showScreen('node');
}

function updateNodeUI() {
  const isNode = G.nodeScreenKind === 'node';
  $('node-title').textContent = isNode ? '⬡ BEZPIECZNY WĘZEŁ ⬡' : '⬡ STACJA ULEPSZEŃ ⬡';
  $('node-note').textContent = isNode
    ? '✚ Zdrowie i mana w pełni odnowione. Tu wrócisz po śmierci w kampanii.'
    : (G.nodeUnlocked
        ? 'Zdrowie i mana przechodzą do następnego sektora.'
        : `Bezpieczny Węzeł (pełne leczenie) odblokuje się po sektorze ${NODE_AFTER_SECTOR}.`);
  $('node-sector').textContent = G.sector;
  $('node-runes').textContent = G.runes;
  $('node-level').textContent = G.level;
  $('node-hp').textContent = `${G.hp}/${G.maxHp}`;
  $('node-mp').textContent = `${G.mp}/${G.maxMp}`;
  $('node-continue').textContent = `▶ WEJDŹ DO SEKTORA ${G.sector}`;

  Object.keys(UPGRADES).forEach(key => {
    const up = UPGRADES[key];
    const btn = $('btn-buy-' + key);
    const lbl = $('shop-' + key + '-cost');
    if (G.meta[key]) {
      btn.textContent = '✓ KUPIONO';
      btn.disabled = true;
      lbl.textContent = '—';
    } else {
      btn.textContent = 'KUP';
      btn.disabled = G.runes < up.cost;
      lbl.textContent = up.cost + ' ✦';
    }
  });
  $('node-msg').textContent = '';
}

function buyUpgrade(type) {
  const up = UPGRADES[type];
  if (!up || G.meta[type]) return;
  if (G.runes < up.cost) {
    $('node-msg').textContent = 'Za mało Złotych Run!';
    return;
  }
  G.runes -= up.cost;
  G.meta[type] = true;
  if (type === 'atk') {          // ulepszenie ataku dziala od razu, nie dopiero od nowej gry
    G.baseAtk++;
    G.atk = G.baseAtk;
  }
  persistProgress();
  updateNodeUI();
  $('node-msg').textContent = '✓ Odblokowano: ' + up.name;
}

function canAffordAnyUpgrade() {
  return Object.keys(UPGRADES).some(k => !G.meta[k] && G.runes >= UPGRADES[k].cost);
}

function continueFromNode() { startSector(); }

function resetProgress() {
  if (!window.confirm('Usunąć Złote Runy, ulepszenia i postęp samouczka?')) return;
  G.runes = 0;
  G.meta = { atk: false, hp: false, arch: false };
  Save.data = { runes: 0, meta: { atk: false, hp: false, arch: false }, tutorialSeen: false };
  Save.save();
}

// =====================================================================
// GAME INIT
// =====================================================================
function startGame(mode) {
  G.mode = mode;
  G.sector = 1;
  G.maxHp = 3; G.hp = 3;
  G.maxMp = 5; G.mp = 5;
  G.baseAtk = 1 + (G.meta.atk ? 1 : 0);
  G.atk = G.baseAtk;
  G.exp = 0; G.expNext = 75;
  G.level = 1;
  G.hasShield = false;
  G.nodeUnlocked = false;
  // Zlote Runy i ulepszenia meta zostaja miedzy podejsciami (waluta trwala)

  // samouczek przy pierwszym uruchomieniu
  if (!Save.data.tutorialSeen && typeof Tutorial !== 'undefined') {
    Tutorial.open(() => startSector());
  } else {
    startSector();
  }
}

// konfiguracja sektora; w trybie nieskonczonym plansze rosna po sektorze 10
function sectorConfig(s) {
  s = s || G.sector;
  if (s <= SECTORS.length) return SECTORS[s - 1];
  const extra = s - SECTORS.length;
  const size = Math.min(26, 22 + extra);
  return {
    cols: size, rows: size,
    density: Math.min(0.36, 0.31 + extra * 0.005),
    mimics: 3,
    weights: { brutal: 3, specter: 6 },
  };
}

function startSector() {
  const cfg = sectorConfig();
  G.cols = cfg.cols; G.rows = cfg.rows;
  G.firstClick = true;
  G.gameOver = false;
  G.won = false;
  G.keyFound = false;
  G.hatchOpen = false;
  G.keyCell = -1;
  G.hatchCell = -1;
  G.activeSpell = null;
  G.atk = G.baseAtk;

  showScreen('game');   // najpierw pokazujemy ekran, zeby poprawnie zmierzyc rozmiar planszy
  buildGrid(cfg);
  renderHUD();
  addLog('info', `▶ Sektor ${G.sector} - ${getCellDesc(cfg)}`);
  addLog('info', 'Kliknij pole aby zacząć eksplorację.');
  $('hud-sector').innerHTML =
    `SEKTOR ${G.sector}<br><span style="color:#444466;font-size:6px;">${G.mode==='endless'?'TRYB NIESKOŃCZONY':'KAMPANIA'}</span>`;
}

function getCellDesc(cfg) {
  cfg = cfg || sectorConfig();
  return `${cfg.cols}×${cfg.rows}, ${Math.round(cfg.density*100)}% wrogów`;
}

// =====================================================================
// GRID GENERATION
// =====================================================================
function buildGrid(cfg) {
  const n = G.cols * G.rows;
  G.cells = [];
  for (let i = 0; i < n; i++) {
    G.cells.push({
      state: CELL_COVERED,
      content: CONTENT_EMPTY,
      enemy: null,
      item: null,
      number: 0,        // suma poziomow ZYWYCH wrogow na 8 sasiednich polach
      flagged: false,
      echoed: false,
    });
  }
  const positions = shuffle(Array.from({length: n}, (_, i) => i));

  // Lacznie wrogow = gestosc * pola; z tego STALA liczba mimikow, reszta wg wag
  const isFirst = G.sector === 1;
  const totalEnemies = Math.min(isFirst ? 14 : Math.floor(n * cfg.density), n - 4);
  const mimicCount = Math.min(cfg.mimics || 0, totalEnemies);
  const regularCount = totalEnemies - mimicCount;

  // w sektorze 1 gwarantujemy dokladny sklad: 8 szlamow, 5 straznikow, 1 brutal
  const sector1Roster = isFirst
    ? shuffle(['slime','slime','slime','slime','slime','slime','slime','slime','guardian','guardian','guardian','guardian','guardian','brutal'])
    : null;

  let p = 0;
  for (let i = 0; i < regularCount; i++, p++) {
    const type = sector1Roster ? sector1Roster[i] : pickWeightedEnemy(cfg.weights);
    placeEnemy(positions[p], type);
  }
  for (let i = 0; i < mimicCount; i++, p++) {
    placeEnemy(positions[p], 'mimic');
  }

  // klucz i wlaz zawsze pod bezpiecznymi polami
  const safeCells = positions.slice(p);
  G.keyCell = safeCells[0];
  G.hatchCell = safeCells[1];
  G.cells[G.keyCell].item = 'key';
  G.cells[G.hatchCell].item = 'hatch';

  // przedmioty w pozostalych bezpiecznych polach
  const itemPool = ['potion','potion','crystal','shield','potion'];
  for (let i = 2; i < safeCells.length && i-2 < itemPool.length; i++) {
    if (Math.random() < 0.3) {
      G.cells[safeCells[i]].item = itemPool[i-2];
    }
  }

  computeNumbers();
  renderGrid();
}

function placeEnemy(pos, type) {
  const eInfo = ENEMIES[type];
  const level = typeof eInfo.level === 'function' ? eInfo.level(G.sector) : eInfo.level;
  G.cells[pos].content = CONTENT_ENEMY;
  G.cells[pos].enemy = { type, level, exp: eInfo.exp + (G.meta.arch ? 5 : 0), emoji: eInfo.emoji, name: eInfo.name };
}

function pickWeightedEnemy(weightsObj) {
  const entries = Object.entries(weightsObj);
  const total = entries.reduce((acc, [, w]) => acc + w, 0);
  let roll = Math.random() * total;
  for (const [type, weight] of entries) {
    roll -= weight;
    if (roll <= 0) return type;
  }
  return entries[0][0];
}

// ---------- LICZBY NA POLACH (najwazniejsza mechanika dedukcji) ----------
// Liczba na polu = suma poziomow wrogow, ktorzy WCIAZ kryja sie na 8 sasiednich polach.
// Wartosc jest liczona dla KAZDEGO pola (rowniez tego, na ktorym stal wrog),
// a po kazdej zmianie ukladu wrogow odswiezana lokalnie (refreshAround).
function neighborsOf(idx) {
  const r = Math.floor(idx / G.cols), c = idx % G.cols, out = [];
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
    if (dr === 0 && dc === 0) continue;
    const nr = r + dr, nc = c + dc;
    if (nr < 0 || nr >= G.rows || nc < 0 || nc >= G.cols) continue;
    out.push(nr * G.cols + nc);
  }
  return out;
}

function neighborSum(idx) {
  let sum = 0;
  for (const ni of neighborsOf(idx)) {
    const nc = G.cells[ni];
    if (nc.content === CONTENT_ENEMY) sum += nc.enemy.level;
  }
  return sum;
}

function computeNumbers() {
  for (let i = 0; i < G.cells.length; i++) G.cells[i].number = neighborSum(i);
}

// po usunieciu wroga z pola idx: przelicza liczby w jego otoczeniu (i na nim samym)
// i odswieza tylko te pola, ktore sie zmienily. Zwraca odkryte pola, ktore spadly do 0.
function refreshAround(idx) {
  const turnedZero = [];
  for (const i of [idx, ...neighborsOf(idx)]) {
    const cell = G.cells[i];
    const next = neighborSum(i);
    const changed = next !== cell.number;
    cell.number = next;
    if (i !== idx && cell.state === CELL_REVEALED) {
      updateCell(i);
      if (changed) {
        flashNumber(i);
        if (next === 0 && !cell.item) turnedZero.push(i);
      }
    }
  }
  return turnedZero;
}

// wspolna "obrobka" po zabiciu wroga (walka wrecz i Dezintegracja)
function settleAfterKill(idx) {
  const turnedZero = refreshAround(idx);
  const cell = G.cells[idx];
  updateCell(idx);
  if (cell.number === 0 && !cell.item) cascadeReveal(idx);   // zero = kaskada, jak w klasycznym saperze
  turnedZero.forEach(i => cascadeReveal(i));
}

function flashNumber(idx) {
  const el = document.querySelector(`.cell[data-idx="${idx}"]`);
  if (!el) return;
  el.classList.add('num-changed');
  setTimeout(() => el.classList.remove('num-changed'), 700);
}

// =====================================================================
// RENDERING
// =====================================================================
function renderGrid() {
  const grid = document.getElementById('grid');
  // Compute cell size based on viewport
  const hudH = $('hud').offsetHeight || 52;
  const sideW = $('side-panel').offsetWidth || 160;
  const availW = window.innerWidth - sideW;
  const availH = window.innerHeight - hudH;
  // plansza = komorki + odstepy (gap 2px) + ramka/padding (8px) + zapas na marginesy
  const maxCellW = Math.floor((availW - 40 - 8 - (G.cols - 1) * 2) / G.cols);
  const maxCellH = Math.floor((availH - 40 - 8 - (G.rows - 1) * 2) / G.rows);
  const cellSize = Math.max(18, Math.min(maxCellW, maxCellH, 60));

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
  const cells = document.querySelectorAll('#grid .cell');   // tylko plansza (nie ilustracje samouczka)
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
    if (c.echoed) {
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
    if (c.flagged) {
      el.classList.add('flagged');
      const fm = document.createElement('span');
      fm.className = 'flag-mark' + (c.echoed ? ' small' : '');
      fm.textContent = '⚑';
      el.appendChild(fm);
    }
    return;
  }

  // --- pole odkryte: ZAWSZE pokazujemy liczbe wrogow dookoła (gdy > 0) ---
  el.classList.add('revealed');

  let icon = null;
  if (c.item === 'key' && !G.keyFound) {
    icon = '🗝';
    el.classList.add('key-cell');
  } else if (c.item === 'hatch' && !G.hatchOpen) {
    icon = '🚪';
    el.classList.add(G.keyFound ? 'hatch-cell' : 'hatch-locked');
    el.title = G.keyFound ? 'Otwarty właz — kliknij, aby przejść dalej' : 'Zamknięty właz — potrzebujesz klucza';
  } else if (c.item === 'potion') { icon = '🧪'; }
  else if (c.item === 'crystal') { icon = '💎'; }
  else if (c.item === 'shield') { icon = '🛡'; }

  if (c.number > 0) {
    el.classList.add('n' + Math.min(c.number, 8));
    const num = document.createElement('span');
    num.className = 'cell-num' + (icon ? ' corner' : '');   // przy przedmiocie cyfra idzie w rog
    num.textContent = c.number;
    el.appendChild(num);
    if (!el.title) el.title = `Suma poziomów wrogów dookoła: ${c.number}`;
  } else if (!el.title) {
    el.title = 'Brak wrogów dookoła';
  }

  if (icon) {
    const ic = document.createElement('span');
    ic.className = 'cell-icon' + (c.number > 0 ? '' : ' center');
    ic.textContent = icon;
    el.appendChild(ic);
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
  // Zlote Runy
  const runesEl = $('hud-runes');
  if (runesEl) runesEl.textContent = '✦ ' + G.runes;
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
    const btn = $('sb-' + s.id);
    const canAfford = G.mp >= s.cost;
    const isActive = G.activeSpell === s.id;
    if (btn) { btn.disabled = !canAfford; btn.classList.toggle('active-spell', isActive); }
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
  if (typeof Tutorial !== 'undefined' && Tutorial.isOpen()) return;
  const idx = parseInt(e.currentTarget.dataset.idx);
  const c = G.cells[idx];

  // klikniecie w odkryte pole: podniesienie przedmiotu / wlaz
  if (c.state === CELL_REVEALED) {
    if (c.item === 'key' && !G.keyFound) { collectKey(idx); return; }
    if (c.item === 'hatch') { openHatch(idx); return; }
    if (c.item === 'potion') { collectPotion(idx, 'potion'); return; }
    if (c.item === 'crystal') { collectPotion(idx, 'crystal'); return; }
    if (c.item === 'shield') { collectPotion(idx, 'shield'); return; }
    return;
  }

  // tryb zaklec ma pierwszenstwo (rowniez na polach z Znakiem Slabosci)
  if (G.activeSpell === 'flag') { castFlag(idx); return; }
  if (G.activeSpell === 'echo' || G.activeSpell === 'dezint') {
    if (G.firstClick) {
      addLog('warn', 'Najpierw odkryj pole startowe — Echokacja i Dezintegracja działają od pierwszego ruchu.');
      return;
    }
    if (G.activeSpell === 'echo') castEcho(idx); else castDezint(idx);
    return;
  }

  // zwykly klik nie rusza pola z Znakiem Slabosci (ochrona przed pomylka)
  if (c.flagged) return;

  // normalne odkrycie pola
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
  // strefa startowa 3x3 wokol pierwszego klikniecia musi byc wolna od wrogow
  const zone = [idx, ...neighborsOf(idx)];
  const inZone = new Set(zone);
  const movers = zone.filter(i => G.cells[i].content === CONTENT_ENEMY);

  if (movers.length) {
    // wrogowie trafiaja na losowe, zakryte, puste pola bez przedmiotow (poza strefa startu)
    const spots = shuffle(
      G.cells.map((_, i) => i).filter(i =>
        !inZone.has(i) &&
        G.cells[i].content === CONTENT_EMPTY &&
        G.cells[i].state === CELL_COVERED &&
        !G.cells[i].item)
    );
    movers.forEach(from => {
      const to = spots.pop();
      if (to === undefined) return;
      G.cells[to].content = CONTENT_ENEMY;
      G.cells[to].enemy = G.cells[from].enemy;
      G.cells[from].content = CONTENT_EMPTY;
      G.cells[from].enemy = null;
    });
    computeNumbers();
  }
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
  const wasEchoed = c.echoed;
  c.state = CELL_REVEALED;
  c.echoed = false;
  c.flagged = false;

  if (c.content === CONTENT_ENEMY) {
    // mimik ma poziom 0 na runach, ale zaskakuje gracza przy kliknieciu bez echokacji
    const isMimicAmbush = c.enemy.type === 'mimic' && !wasEchoed;
    const dmg = isMimicAmbush
      ? MIMIC_AMBUSH_DAMAGE
      : Math.max(0, c.enemy.level - G.atk);

    const enemySnapshot = { ...c.enemy };
    let blockedByShield = false;

    if (G.hasShield && dmg > 0) {
      G.hasShield = false;
      blockedByShield = true;
      addLog('warn', `🛡 Tarcza pochłonęła atak ${enemySnapshot.name}!`);
    } else if (dmg > 0) {
      G.hp = Math.max(0, G.hp - dmg);
      if (isMimicAmbush) {
        addLog('damage', `📦 Zasadzka Mimika! Otrzymujesz ${dmg} HP obrażeń!`);
      } else {
        addLog('damage', `⚔ Walka: ${enemySnapshot.name} Lv.${enemySnapshot.level} — obrażenia: ${dmg} HP`);
      }
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

    // przeliczamy liczby wokol pola, potem odpalamy animacje walki
    settleAfterKill(idx);
    playCombatAnimation(idx, enemySnapshot, dmg, blockedByShield);

    if (G.hp <= 0) {
      G.gameOver = true;   // od razu blokujemy kolejne klikniecia
      setTimeout(()=>playerDied(), 350);
      return;
    }
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

function playCombatAnimation(idx, enemy, dmg, blockedByShield = false, effectOverride = null) {
  const el = document.querySelector(`.cell[data-idx="${idx}"]`);
  const gridContainer = document.getElementById('grid-container');
  const type = enemy.type || 'slime';
  const isHeavy = dmg >= 2 || enemy.level >= 4;

  if (gridContainer) {
    gridContainer.classList.remove('flash-damage', 'combat-shake-light', 'combat-shake-heavy', 'combat-shake-brutal');
    void gridContainer.offsetWidth;
    if (dmg > 0 && !blockedByShield) {
      gridContainer.classList.add('flash-damage', isHeavy ? 'combat-shake-brutal' : 'combat-shake-heavy');
    } else {
      gridContainer.classList.add('combat-shake-light');
    }
  }

  if (!el) return;

  // czyszczenie poprzednich klas animacji kafelka
  const animClasses = [
    'combat-hit', 'combat-kill',
    'anim-slime', 'anim-guardian', 'anim-brutal', 'anim-specter', 'anim-mimic'
  ];
  el.classList.remove(...animClasses);
  void el.offsetWidth;

  // przypisanie unikalnej klasy dla typu przeciwnika oraz wyniku starcia
  el.classList.add(`anim-${type}`, dmg > 0 && !blockedByShield ? 'combat-hit' : 'combat-kill');

  // fala uderzeniowa dla silniejszych przeciwnikow (poziom 3+ lub obrazenia > 0)
  if (enemy.level >= 3 || dmg > 0 || effectOverride) {
    const ring = document.createElement('div');
    ring.className = `combat-ring ring-${type}`;
    el.appendChild(ring);
    setTimeout(() => ring.remove(), 500);
  }

  // ikona efektu dopasowana do typu przeciwnika
  const effectIcons = {
    slime: '💧',
    guardian: '⚡',
    brutal: '🔥',
    specter: '🌀',
    mimic: dmg > 0 ? '💢' : '🔓'
  };

  const slash = document.createElement('div');
  slash.className = `combat-slash slash-${type}`;
  slash.textContent = blockedByShield ? '🛡' : (effectOverride || effectIcons[type] || '⚔');
  el.appendChild(slash);
  setTimeout(() => slash.remove(), 500);

  // unoszacy sie tekst nad kafelkiem
  if (blockedByShield) {
    spawnParticle(el, '🛡 -0 HP', '#4fc3f7');
  } else if (dmg > 0) {
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
      if (c2.state===CELL_REVEALED || c2.content===CONTENT_ENEMY) continue;
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
  if (c.echoed) { addLog('info', 'To pole jest już prześwietlone.'); return; }
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
  if (G.mp < 4) { addLog('warn', 'Brak many!'); return; }
  G.mp -= 4;
  G.activeSpell = null;

  const el = document.querySelector(`.cell[data-idx="${idx}"]`);
  c.state = CELL_REVEALED;
  c.echoed = false;
  c.flagged = false;   // Dezintegracja dziala tez na polach z Znakiem Slabosci

  if (c.content === CONTENT_ENEMY) {
    const snap = { ...c.enemy };
    addLog('spell', `💥 Dezintegracja: ${snap.name} Lv.${snap.level} zniszczony! (+${snap.exp} EXP, -4 MP)`);
    c.content = CONTENT_EMPTY;
    c.enemy = null;
    gainExp(snap.exp);
    updateSpellButtons();
    renderHUD();
    settleAfterKill(idx);                                  // te same zasady co po zwyklej walce
    playCombatAnimation(idx, snap, 0, false, '💥');
    return;
  }

  addLog('spell', '💥 Dezintegracja: pole było bezpieczne. Odsłonięto (-4 MP).');
  if (c.number === 0 && !c.item) cascadeReveal(idx);
  updateCell(idx);
  spawnParticle(el, '💥 puste pole', '#ff8a65');
  updateSpellButtons();
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

  // jesli wlaz zostal juz wczesniej odkryty na planszy, odblokowujemy jego wyglad
  if (G.hatchCell !== -1 && G.cells[G.hatchCell].state === CELL_REVEALED) {
    updateCell(G.hatchCell);
    const hatchEl = document.querySelector(`.cell[data-idx="${G.hatchCell}"]`);
    if (hatchEl) {
      hatchEl.classList.add('hatch-unlock-flash');
      setTimeout(() => hatchEl.classList.remove('hatch-unlock-flash'), 600);
    }
  }
}

function openHatch(idx) {
  if (!G.keyFound) { addLog('warn','Potrzebujesz klucza!'); return; }
  G.hatchOpen = true;
  G.cells[idx].item = null;
  addLog('item', '🚪 Właz otwarty! Przejście do następnego sektora.');
  showOverlay(`🚪 SEKTOR UKOŃCZONY!\n+${sectorReward(G.sector)} ✦ Złotych Run`, 1100);
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
  G.expNext = Math.floor(G.expNext * 1.8);
  G.baseAtk++;
  G.atk = G.baseAtk;
  G.hp = Math.min(G.maxHp, G.hp + 1);
  G.mp = Math.min(G.maxMp, G.mp + 1);
  addLog('lvlup', `★ POZIOM ${G.level}! ATK +1, +1 HP, +1 MP!`);
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

// nagroda w Zlotych Runach za ukonczenie sektora
function sectorReward(sector) { return 20 + sector * 5; }

function nextSector() {
  const cleared = G.sector;
  G.runes += sectorReward(cleared);
  persistProgress();

  if (G.mode === 'campaign' && cleared >= G.maxSectors) {
    // zwyciestwo
    $('ws-sectors').textContent = G.maxSectors;
    $('ws-level').textContent = G.level;
    $('ws-runes').textContent = G.runes;
    showScreen('win');
    return;
  }

  G.sector = cleared + 1;
  if (G.mode === 'endless') {
    startSector();
  } else if (cleared === NODE_AFTER_SECTOR) {
    G.nodeUnlocked = true;          // od teraz wracasz tu po smierci
    showNode('node');
  } else if (canAffordAnyUpgrade()) {
    showNode('shop');               // miedzy sektorami mozna kupic ulepszenia, jesli stac gracza
  } else {
    startSector();
  }
}

// DEATH
function playerDied() {
  G.gameOver = true;
  $('ds-sector').textContent = G.sector;
  $('ds-level').textContent = G.level;
  $('ds-atk').textContent = G.atk;
  $('ds-exp').textContent = G.exp;
  $('ds-runes').textContent = G.runes;

  const backToNode = G.mode === 'campaign' && G.nodeUnlocked;
  $('death-primary').textContent = backToNode ? '→ BEZPIECZNY WĘZEŁ' : '↻ ZACZNIJ OD NOWA';
  $('death-note').textContent = backToNode
    ? 'Wracasz do Bezpiecznego Węzła: zdrowie i mana zostaną w pełni odnowione.'
    : (G.mode === 'campaign'
        ? `Bezpieczny Węzeł odblokujesz po ukończeniu sektora ${NODE_AFTER_SECTOR}. Zaczynasz kampanię od nowa, ale Złote Runy i ulepszenia zostają.`
        : 'Koniec rundy. Złote Runy i ulepszenia zostają.');
  showScreen('death');
}

function deathPrimary() {
  if (G.mode === 'campaign' && G.nodeUnlocked) showNode('node');
  else startGame(G.mode);
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
  if (!$('screen-game').classList.contains('active')) return;
  if (typeof Tutorial !== 'undefined' && Tutorial.isOpen()) return;
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
Save.load();
G.runes = Save.data.runes;
G.meta = Object.assign({ atk: false, hp: false, arch: false }, Save.data.meta);

// funkcje wywolywane z atrybutow onclick w index.html
window.Save = Save;   // dostep dla tutorial.js
window.startGame = startGame;
window.showTitle = showTitle;
window.showNode = showNode;
window.buyUpgrade = buyUpgrade;
window.continueFromNode = continueFromNode;
window.setSpell = setSpell;
window.deathPrimary = deathPrimary;
window.resetProgress = resetProgress;