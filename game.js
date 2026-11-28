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
  // poziomy ulepszen trwalych (meta) i waluta
  meta: {},   // wypelniane w INIT z zapisu (patrz META_DEFAULT)
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
  supplyBought: {},   // ile razy w tej wyprawie kupiono kazdy zapas (podnosi cene)
};

// ---------- ZAPIS POSTEPU (localStorage, z bezpiecznym fallbackiem) ----------
// poziomy wszystkich ulepszen trwalych na starcie (0 = niekupione)
const META_DEFAULT = { exp: 0, vein: 0, mp: 0, alch: 0, hp: 0, scan: 0, atk: 0 };

// zamienia zapis meta na poziomy; obsluguje tez stary format (true/false z pierwszej wersji sklepu)
function migrateMeta(m) {
  const out = Object.assign({}, META_DEFAULT);
  m = m || {};
  Object.keys(META_DEFAULT).forEach(k => {
    if (typeof m[k] === 'number') out[k] = m[k];
  });
  if (m.atk === true) out.atk = 1;    // stare "ATK bazowy +1"
  if (m.hp === true) out.alch = 1;    // stare "Lepsze mikstury" to teraz Syntezator Alchemiczny
  if (m.arch === true) out.exp = 1;   // stare "Archiwum Matrycy" to teraz bonus % EXP
  return out;
}

const Save = {
  KEY: 'mineCrawl.save.v1',
  data: { runes: 0, meta: Object.assign({}, META_DEFAULT), tutorialSeen: false },
  load() {
    try {
      const raw = window.localStorage.getItem(this.KEY);
      if (raw) {
        const d = JSON.parse(raw);
        this.data.runes = Number(d.runes) || 0;
        this.data.meta = migrateMeta(d.meta);
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
const START_HP = 3;              // kazda wyprawa zaczyna sie z 3 zyciami, niezaleznie od ulepszen

// ULEPSZENIA TRWALE: kilka poziomow, kazdy drozszy; zostaja po smierci.
// Pelna kampania daje 370 run (ok. 445 ze Zlota Zyla), a wykupienie wszystkiego kosztuje 1890,
// czyli ok. 5 pelnych kampanii; wczesniejsze smierci daja mniej, wiec sklep zostaje przydatny dlugo.
// Kolejnosc = kolejnosc kart w sklepie.
const UPGRADES = {
  exp:  { name: 'ARCHIWUM MATRYCY',       sprite: 'book',    costs: [40, 90, 160],
          label: 'EXP z wrogów',            val: l => `+${l * 15}%` },
  vein: { name: 'ZŁOTA ŻYŁA',             sprite: 'rune',    costs: [50, 120],
          label: 'Runy za sektor',          val: l => `+${l * 10}%` },
  mp:   { name: 'REZERWUAR MANY',         sprite: 'crystal', costs: [50, 110],
          label: 'Maks. MP',                val: l => `${5 + l}` },
  alch: { name: 'SYNTEZATOR ALCHEMICZNY', sprite: 'potion',  costs: [60, 150],
          label: 'Mikstura leczy',          val: l => `${1 + l} HP` },
  hp:   { name: 'PANCERZ DEFUZERA',       sprite: 'heart',   costs: [80, 160, 250],
          label: 'Limit HP',                val: l => `${START_HP + l}` },
  scan: { name: 'SONAR MATRYCY',          sprite: 'eye',     costs: [90, 180],
          label: 'Pola prześwietlone na starcie', val: l => `${l * 2}` },
  atk:  { name: 'OSTRZE ROZPADU',         sprite: 'sword',   costs: [300],
          label: 'ATK bazowy',              val: l => `${1 + l}` },
};

// ZAPASY: jednorazowe zakupy na biezaca wyprawe, dzialaja od razu i mozna je kupowac wielokrotnie.
// Kazdy kolejny zakup tego samego zapasu w jednej wyprawie drozeje o "step" (licznik G.supplyBought),
// wiec nie da sie tanio leczyc do pelna w kazdym sklepie.
// Konkuruja o te same runy co ulepszenia trwale: przezyc teraz albo zainwestowac w kolejne podejscia.
const SUPPLIES = {
  potion:  { name: 'MIKSTURA',          sprite: 'potion',  cost: 25, step: 10,
             desc: () => `+${1 + G.meta.alch} HP od razu`, can: () => G.hp < G.maxHp, blocked: 'Pełne HP',
             apply: () => { G.hp = Math.min(G.maxHp, G.hp + 1 + G.meta.alch); } },
  crystal: { name: 'KRYSZTAŁ MANY',     sprite: 'crystal', cost: 15, step: 5,
             desc: () => '+2 MP od razu', can: () => G.mp < G.maxMp, blocked: 'Pełna mana',
             apply: () => { G.mp = Math.min(G.maxMp, G.mp + 2); } },
  shield:  { name: 'TARCZA KINETYCZNA', sprite: 'shield',  cost: 35, step: 15,
             desc: () => 'Pochłania najbliższy cios', can: () => !G.hasShield, blocked: 'Masz już tarczę',
             apply: () => { G.hasShield = true; } },
};

// aktualna cena zapasu w tej wyprawie
function supplyCost(key) {
  return SUPPLIES[key].cost + SUPPLIES[key].step * (G.supplyBought[key] || 0);
}

// koszt nastepnego poziomu ulepszenia albo null, gdy wykupione do konca
function upgradeCost(key) {
  const lvl = G.meta[key] || 0;
  return lvl < UPGRADES[key].costs.length ? UPGRADES[key].costs[lvl] : null;
}

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

// nazwy sektorow pokazywane na planszy przejscia, w HUD i w logu
const SECTOR_NAMES = [
  'Przedsionek Cieni', 'Zalane Korytarze', 'Kuźnia Strażników', 'Krypty Matrycy', 'Cicha Studnia',
  'Ossuarium', 'Szepczące Głębie', 'Komora Widm', 'Gardziel Otchłani', 'Serce Matrycy',
];

function sectorName(s) {
  return s <= SECTOR_NAMES.length ? SECTOR_NAMES[s - 1] : `Otchłań ${s - SECTOR_NAMES.length}`;
}

// glebokosc 0..1 przyciemnia winiete i klimat (sektor 1 = 0, sektor 10 i dalej = 1)
function sectorDepth(s) { return Math.min(1, (s - 1) / 9); }

// grafika kazdego wroga to sprite o nazwie takiej jak jego typ (sprites.js)
const ENEMIES = {
  slime:    { level:1, exp:11, name:'Szlam Wymiarowy' },
  guardian: { level:function(s){ return s>=6?3:2; }, exp:16, name:'Spaczony Strażnik' },
  brutal:   { level:function(s){ return s<=4?3:(s<=7?4:5); }, exp:26, name:'Brutal Matrycy' },
  specter:  { level:function(s){ return Math.min(9, 4 + Math.floor(s/2)); }, exp:38, name:'Widmo Przestrzenne' },
  mimic:    { level:0, exp:24, name:'Skrzynia (Mimik)' },
};

// nazwy przedmiotow do logu (np. po Echokacji)
const ITEM_NAMES = {
  key: 'Klucz Sektora',
  hatch: 'Właz',
  potion: 'Mikstura zdrowia',
  crystal: 'Kryształ Many',
  shield: 'Tarcza Kinetyczna',
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

// sprite przedmiotu lezacego na polu; wlaz zmienia wyglad po zdobyciu klucza
function itemSprite(item) {
  if (item === 'hatch') return G.keyFound ? 'hatch_open' : 'hatch_locked';
  return item;
}


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
  renderShop();
  $('node-msg').textContent = '';
}

// karty sklepu budowane od nowa po kazdym zakupie
function renderShop() {
  const meta = $('shop-meta');
  meta.innerHTML = '';
  Object.keys(UPGRADES).forEach(key => {
    const up = UPGRADES[key];
    const lvl = G.meta[key] || 0;
    const max = up.costs.length;
    const cost = upgradeCost(key);
    const pips = Array.from({ length: max }, (_, i) => `<span class="pip${i < lvl ? ' on' : ''}"></span>`).join('');
    const card = document.createElement('div');
    card.className = 'node-shop' + (cost === null ? ' maxed' : '');
    card.innerHTML = `
      ${Sprites.html(up.sprite, 'icon-big')}
      <div class="shop-info">
        <div class="shop-head"><h3>${up.name}</h3><div class="shop-pips">${pips}</div></div>
        <p>${up.label}: ${up.val(lvl)}${cost === null ? '' : ` <b>→ ${up.val(lvl + 1)}</b>`}</p>
      </div>
      <div class="shop-buy"><div class="cost">${cost === null ? 'MAKS.' : cost + ' ✦'}</div></div>`;
    const btn = document.createElement('button');
    btn.className = 'node-btn';
    btn.textContent = cost === null ? '✓ MAKS.' : 'KUP';
    btn.disabled = cost === null || G.runes < cost;
    btn.addEventListener('click', () => buyUpgrade(key));
    card.querySelector('.shop-buy').appendChild(btn);
    meta.appendChild(card);
  });

  const sup = $('shop-supplies');
  sup.innerHTML = '';
  Object.keys(SUPPLIES).forEach(key => {
    const s = SUPPLIES[key];
    const usable = s.can();
    const card = document.createElement('div');
    card.className = 'node-shop supply';
    card.innerHTML = `
      ${Sprites.html(s.sprite, 'icon-big')}
      <div class="shop-info"><h3>${s.name}</h3><p>${usable ? s.desc() : s.blocked}</p></div>
      <div class="shop-buy"><div class="cost">${supplyCost(key)} ✦</div></div>`;
    const btn = document.createElement('button');
    btn.className = 'node-btn';
    btn.textContent = 'KUP';
    btn.disabled = !usable || G.runes < supplyCost(key);
    btn.addEventListener('click', () => buySupply(key));
    card.querySelector('.shop-buy').appendChild(btn);
    sup.appendChild(card);
  });
}

function buyUpgrade(type) {
  const up = UPGRADES[type];
  const cost = up ? upgradeCost(type) : null;
  if (cost === null) return;
  if (G.runes < cost) {
    $('node-msg').textContent = 'Za mało Złotych Run!';
    return;
  }
  G.runes -= cost;
  G.meta[type] = (G.meta[type] || 0) + 1;
  // ulepszenia statystyk dzialaja od razu, nie dopiero od nowej gry
  if (type === 'atk') { G.baseAtk++; G.atk = G.baseAtk; }
  if (type === 'hp') { G.maxHp++; }   // Pancerz podnosi limit HP, ale nie leczy
  if (type === 'mp') { G.maxMp++; G.mp++; }
  persistProgress();
  renderHUD();
  updateNodeUI();
  $('node-msg').textContent = `✓ ${up.name}: ${up.label} ${up.val(G.meta[type])}`;
}

function buySupply(type) {
  const s = SUPPLIES[type];
  if (!s || !s.can()) return;
  const cost = supplyCost(type);
  if (G.runes < cost) {
    $('node-msg').textContent = 'Za mało Złotych Run!';
    return;
  }
  G.runes -= cost;
  G.supplyBought[type] = (G.supplyBought[type] || 0) + 1;
  s.apply();
  persistProgress();
  renderHUD();
  updateNodeUI();
  $('node-msg').textContent = `✓ Kupiono: ${s.name.toLowerCase()}`;
}

// sklep miedzy sektorami pokazujemy tylko wtedy, gdy gracz moze w nim cos sensownie kupic
function canAffordAnything() {
  const meta = Object.keys(UPGRADES).some(k => {
    const cost = upgradeCost(k);
    return cost !== null && G.runes >= cost;
  });
  const supply = Object.keys(SUPPLIES).some(k => SUPPLIES[k].can() && G.runes >= supplyCost(k));
  return meta || supply;
}

function continueFromNode() { startSector(); }

function resetProgress() {
  if (!window.confirm('Usunąć Złote Runy, ulepszenia i postęp samouczka?')) return;
  G.runes = 0;
  G.meta = Object.assign({}, META_DEFAULT);
  Save.data = { runes: 0, meta: Object.assign({}, META_DEFAULT), tutorialSeen: false };
  Save.save();
}

// =====================================================================
// GAME INIT
// =====================================================================
function startGame(mode) {
  G.mode = mode;
  G.sector = 1;
  // statystyki startowe = baza + poziomy ulepszen trwalych
  G.maxHp = START_HP + G.meta.hp; G.hp = START_HP;   // Pancerz daje zapas na leczenie, start zawsze 3 HP
  G.maxMp = 5 + G.meta.mp; G.mp = G.maxMp;
  G.baseAtk = 1 + G.meta.atk;
  G.atk = G.baseAtk;
  G.exp = 0; G.expNext = 75;
  G.level = 1;
  G.hasShield = false;
  G.supplyBought = {};
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
  const name = sectorName(G.sector);
  logSector(G.sector, name);
  addLog('info', '', `${cfg.cols}×${cfg.rows} · ${Math.round(cfg.density * 100)}% wrogów`);
  addLog('info', '', 'Pierwszy krok jest bezpieczny.');
  $('hud-sector').innerHTML =
    `SEKTOR ${G.sector}<br><span class="hud-sector-name">${name}</span>`;

  // im glebiej, tym ciemniej i czerwieniej
  const depth = sectorDepth(G.sector);
  document.documentElement.style.setProperty('--depth', depth.toFixed(2));
  if (typeof Atmos !== 'undefined') Atmos.setDepth(depth);
  showSectorIntro(name);
}

// PRZEJSCIA MIEDZY SEKTORAMI
let introTimer = null;

// wygaszenie ekranu do czerni (np. po wejsciu do wlazu), potem callback
function fadeToBlack(cb) {
  const el = $('sector-intro');
  el.classList.remove('reveal');
  el.classList.add('show');
  setTimeout(cb, 600);
}

// plansza "SEKTOR N / nazwa" na czarnym tle; klikniecie pomija
function showSectorIntro(name) {
  const el = $('sector-intro');
  clearTimeout(introTimer);
  $('si-sector').textContent = `SEKTOR ${G.sector}`;
  $('si-name').textContent = name;
  if (!el.classList.contains('show')) {
    el.style.transition = 'none';   // z innego ekranu wchodzimy od razu w czern
    el.classList.add('show');
    void el.offsetWidth;
    el.style.transition = '';
  }
  el.classList.remove('reveal');
  void el.offsetWidth;
  el.classList.add('reveal');
  introTimer = setTimeout(hideSectorIntro, 1800);
}

function hideSectorIntro() {
  clearTimeout(introTimer);
  const el = $('sector-intro');
  el.classList.remove('show');
  setTimeout(() => el.classList.remove('reveal'), 600);
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
  const exp = Math.round(eInfo.exp * (1 + 0.15 * G.meta.exp));   // Archiwum Matrycy: +15% EXP za poziom
  G.cells[pos].enemy = { type, level, exp, name: eInfo.name };
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

  // sprite 16x16 skalujemy o pelna wielokrotnosc, zeby piksele zostaly ostre
  const sprTarget = cellSize * 0.8;
  const sprSize = sprTarget >= 32 ? Math.floor(sprTarget / 16) * 16 : Math.round(sprTarget);

  document.documentElement.style.setProperty('--cell-size', cellSize+'px');
  document.documentElement.style.setProperty('--spr-cell', sprSize+'px');
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

// wariant tekstury kafelka (kamien / posadzka), staly dla danego pola w sektorze
function cellVariant(idx) {
  return (((idx + 1) * 2654435761 + G.sector * 40503) >>> 0) % 3;
}

function updateCellEl(el, idx) {
  const c = G.cells[idx];
  el.className = 'cell v' + cellVariant(idx);
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
        er.innerHTML = Sprites.html(c.enemy.type);
        er.title = c.enemy.name + ' Lv.' + c.enemy.level;
      } else if (c.item) {
        er.innerHTML = Sprites.html(itemSprite(c.item));
        er.title = ITEM_NAMES[c.item] || '';
      } else {
        er.textContent = '·';
      }
      el.appendChild(er);
    }
    if (c.flagged) {
      el.classList.add('flagged');
      const fm = document.createElement('span');
      fm.className = 'spr spr-flag flag-mark' + (c.echoed ? ' small' : '');
      el.appendChild(fm);
    }
    return;
  }

  // --- pole odkryte: ZAWSZE pokazujemy liczbe wrogow dookoła (gdy > 0) ---
  el.classList.add('revealed');

  let icon = null;
  if (c.item === 'key' && !G.keyFound) {
    icon = 'key';
    el.classList.add('key-cell');
  } else if (c.item === 'hatch' && !G.hatchOpen) {
    icon = itemSprite('hatch');
    el.classList.add(G.keyFound ? 'hatch-cell' : 'hatch-locked');
    el.title = G.keyFound ? 'Otwarty właz — kliknij, aby przejść dalej' : 'Zamknięty właz — potrzebujesz klucza';
  } else if (c.item === 'potion' || c.item === 'crystal' || c.item === 'shield') {
    icon = c.item;
  }

  if (c.number > 0) {
    el.classList.add(numberClass(c.number));
    const num = document.createElement('span');
    num.className = 'cell-num' + (icon ? ' corner' : '') + (c.number >= 10 ? ' two-digit' : '');   // przy przedmiocie cyfra idzie w rog
    num.textContent = c.number;
    el.appendChild(num);
    if (!el.title) el.title = `Suma poziomów wrogów dookoła: ${c.number}`;
  } else if (!el.title) {
    el.title = 'Brak wrogów dookoła';
  }

  if (icon) {
    const ic = document.createElement('span');
    ic.className = `spr spr-${icon} cell-icon` + (c.number > 0 ? '' : ' center');
    el.appendChild(ic);
  }
}

function updateCell(idx) {
  const el = document.querySelector(`.cell[data-idx="${idx}"]`);
  if (el) updateCellEl(el, idx);
}

// kolor cyfry: 1-8 maja wlasne kolory, wyzsze sumy wpadaja w progi o rosnacym zagrozeniu
// (od 21 w gore kafelek dodatkowo ciemnieje na czerwono, a od 36 pulsuje)
const NUMBER_TIERS = [
  { max: 11, cls: 'nt1' },        // 9-11   zolty
  { max: 15, cls: 'nt2' },        // 12-15  limonkowy
  { max: 20, cls: 'nt3' },        // 16-20  indygo
  { max: 27, cls: 'nt4' },        // 21-27  bialy z czerwona poswiata
  { max: 35, cls: 'nt5' },        // 28-35  krwawa czerwien na ciemnym tle
  { max: Infinity, cls: 'nt6' },  // 36+    pulsujace ostrzezenie
];

function numberClass(n) {
  if (n <= 8) return 'n' + n;
  return NUMBER_TIERS.find(t => n <= t.max).cls;
}

// =====================================================================
// HUD
// =====================================================================
function renderHUD() {
  // serca jako sprite'y (pelne / puste)
  const hr = document.getElementById('hearts-row');
  hr.innerHTML = '';
  for (let i = 0; i < G.maxHp; i++) {
    const h = document.createElement('span');
    h.className = 'heart spr ' + (i >= G.hp ? 'spr-heart_empty empty' : 'spr-heart');
    hr.appendChild(h);
  }
  // ATK
  document.getElementById('atk-val').textContent = G.atk;
  // krysztaly many jako sprite'y (pelne / puste)
  const cr = document.getElementById('crystals-row');
  cr.innerHTML = '';
  for (let i = 0; i < G.maxMp; i++) {
    const c = document.createElement('span');
    c.className = 'crystal spr ' + (i >= G.mp ? 'spr-mana_empty empty' : 'spr-mana');
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
  if (G.hasShield) items.push({ sprite:'shield', label:'Tarcza Kinetyczna' });
  if (G.keyFound) items.push({ sprite:'key', label:'Klucz Sektora' });
  for (let i = 0; i < 6; i++) {
    const slot = document.createElement('div');
    slot.className = 'inv-slot';
    if (items[i]) { slot.innerHTML = Sprites.html(items[i].sprite); slot.title = items[i].label; }
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
      addLog('warn', '', 'Najpierw odkryj pole startowe.');
      return;
    }
    if (G.activeSpell === 'echo') castEcho(idx); else castDezint(idx);
    return;
  }

  // zwykly klik nie rusza pola z Znakiem Slabosci (ochrona przed pomylka)
  if (c.flagged) return;

  // normalne odkrycie pola
  const wasFirst = G.firstClick;
  if (G.firstClick) {
    ensureSafeStart(idx);
    G.firstClick = false;
  }
  revealCell(idx, true);
  if (wasFirst) applySonar();
}

// Sonar Matrycy: po pierwszym ruchu darmowa Echokacja na losowych zakrytych polach
function applySonar() {
  const count = G.meta.scan * 2;
  if (!count) return;
  const pool = shuffle(G.cells.map((_, i) => i).filter(i => G.cells[i].state === CELL_COVERED && !G.cells[i].echoed));
  pool.slice(0, count).forEach(i => {
    G.cells[i].echoed = true;
    updateCell(i);
  });
  addLog('spell', 'eye', 'Sonar Matrycy', `${Math.min(count, pool.length)} pola`);
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
      addLog('warn', 'shield', `Tarcza zatrzymała: ${enemySnapshot.name}`, '0 :heart:');
    } else if (dmg > 0) {
      G.hp = Math.max(0, G.hp - dmg);
      if (isMimicAmbush) {
        addLog('damage', 'mimic', 'Zasadzka Mimika!', `−${dmg} :heart:`);
      } else {
        addLog('damage', enemySnapshot.type, `${enemySnapshot.name} Lv.${enemySnapshot.level}`, `−${dmg} :heart:`);
      }
      // blysk portretu odpala sie w playCombatAnimation, w chwili uderzenia wroga
    } else {
      addLog('kill', enemySnapshot.type, `${enemySnapshot.name} Lv.${enemySnapshot.level}`, `+${enemySnapshot.exp} EXP`);
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
      setTimeout(()=>playerDied(), 700);   // ekran smierci dopiero po ciosie, ktory zabil gracza
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

// czas jednej klatki animacji walki (ms)
const COMBAT_FRAME_MS = 110;

// effectOverride to nazwa sprite'a efektu (np. 'blast' dla Dezintegracji)
// przebieg: gdy wrog zadaje obrazenia, najpierw gra jego atak (2 klatki, doskok do gracza),
// w chwili uderzenia odpala sie efekt, wstrzas i tekst, a na koncu wrog gra animacje smierci (3 klatki)
function playCombatAnimation(idx, enemy, dmg, blockedByShield = false, effectOverride = null) {
  const el = document.querySelector(`.cell[data-idx="${idx}"]`);
  const gridContainer = document.getElementById('grid-container');
  const type = enemy.type || 'slime';
  const isHeavy = dmg >= 2 || enemy.level >= 4;

  // klatki wroga: atak tylko wtedy, gdy wrog faktycznie uderza (rowniez gdy cios przyjmie tarcza)
  const anim = Sprites.anim(type);
  const attackFrames = dmg > 0 && !effectOverride ? anim.attack : [];
  const frames = [...attackFrames, type, ...anim.death];
  const strikeAt = attackFrames.length * COMBAT_FRAME_MS;

  if (el) {
    const ghost = document.createElement('div');
    ghost.className = 'combat-enemy' + (attackFrames.length ? ' lunge' : '');
    const spr = document.createElement('span');
    spr.className = 'spr';
    ghost.appendChild(spr);
    el.appendChild(ghost);
    Sprites.animate(spr, frames, COMBAT_FRAME_MS, () => ghost.remove());
  }

  // moment uderzenia: wstrzas planszy, animacja kafelka, fala, efekt i tekst
  setTimeout(() => {
    if (gridContainer) {
      gridContainer.classList.remove('flash-damage', 'combat-shake-light', 'combat-shake-heavy', 'combat-shake-brutal');
      void gridContainer.offsetWidth;
      if (dmg > 0 && !blockedByShield) {
        gridContainer.classList.add('flash-damage', isHeavy ? 'combat-shake-brutal' : 'combat-shake-heavy');
      } else {
        gridContainer.classList.add('combat-shake-light');
      }
    }

    // gracz oberwal: czerwony blysk portretu
    if (dmg > 0 && !blockedByShield) {
      const portrait = document.getElementById('portrait');
      portrait.classList.remove('pulse');
      void portrait.offsetWidth;
      portrait.classList.add('pulse');
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

    // sprite efektu dopasowany do typu przeciwnika
    const effectSprites = {
      slime: 'splash',
      guardian: 'spark',
      brutal: 'flame',
      specter: 'vortex',
      mimic: dmg > 0 ? 'bite' : 'unlock'
    };

    const slash = document.createElement('div');
    slash.className = `combat-slash slash-${type}`;
    slash.innerHTML = Sprites.html(blockedByShield ? 'shield' : (effectOverride || effectSprites[type] || 'blast'));
    el.appendChild(slash);
    setTimeout(() => slash.remove(), 500);

    // unoszacy sie tekst nad kafelkiem
    if (blockedByShield) {
      spawnParticle(el, ':shield: -0 HP', '#4fc3f7');
    } else if (dmg > 0) {
      spawnParticle(el, `-${dmg} HP`, '#ff5252');
    } else {
      spawnParticle(el, `+${enemy.exp} EXP`, '#66bb6a');
    }
  }, strikeAt);
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
    if (G.mp < costs[spell]) { addLog('warn', '', 'Brak many.'); return; }
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
    addLog('spell', 'flag', 'Znak zdjęty', '+1 MP');
  } else {
    if (G.mp < 1) { addLog('warn', '', 'Brak many.'); return; }
    G.mp -= 1;
    c.flagged = true;
    addLog('spell', 'flag', 'Znak Słabości', '−1 MP');
  }
  G.activeSpell = null;
  updateSpellButtons();
  updateCell(idx);
  renderHUD();
}

function castEcho(idx) {
  const c = G.cells[idx];
  if (c.state === CELL_REVEALED) return;
  if (c.echoed) { addLog('info', '', 'Pole już prześwietlone.'); return; }
  if (G.mp < 2) { addLog('warn', '', 'Brak many.'); return; }
  G.mp -= 2;
  c.echoed = true;
  G.activeSpell = null;
  if (c.content === CONTENT_ENEMY) addLog('spell', c.enemy.type, `Echo: ${c.enemy.name} Lv.${c.enemy.level}`, '−2 MP');
  else if (c.item) addLog('spell', itemSprite(c.item), `Echo: ${ITEM_NAMES[c.item] || c.item}`, '−2 MP');
  else addLog('spell', 'eye', 'Echo: puste pole', '−2 MP');
  updateSpellButtons();
  updateCell(idx);
  renderHUD();
}

function castDezint(idx) {
  const c = G.cells[idx];
  if (c.state === CELL_REVEALED) return;
  if (G.mp < 4) { addLog('warn', '', 'Brak many.'); return; }
  G.mp -= 4;
  G.activeSpell = null;

  const el = document.querySelector(`.cell[data-idx="${idx}"]`);
  c.state = CELL_REVEALED;
  c.echoed = false;
  c.flagged = false;   // Dezintegracja dziala tez na polach z Znakiem Slabosci

  if (c.content === CONTENT_ENEMY) {
    const snap = { ...c.enemy };
    addLog('spell', 'blast', `Rozbito: ${snap.name} Lv.${snap.level}`, `+${snap.exp} EXP`);
    c.content = CONTENT_EMPTY;
    c.enemy = null;
    gainExp(snap.exp);
    updateSpellButtons();
    renderHUD();
    settleAfterKill(idx);                                  // te same zasady co po zwyklej walce
    playCombatAnimation(idx, snap, 0, false, 'blast');
    return;
  }

  addLog('spell', 'blast', 'Dezintegracja: pusto', '−4 MP');
  if (c.number === 0 && !c.item) cascadeReveal(idx);
  updateCell(idx);
  spawnParticle(el, ':blast: puste pole', '#ff8a65');
  updateSpellButtons();
  renderHUD();
}

// ITEMS
function collectKey(idx) {
  G.keyFound = true;
  G.cells[idx].item = null;
  addLog('item', 'key', 'Klucz Sektora. Szukaj włazu.');
  showOverlay(':key: KLUCZ ZNALEZIONY!\nSzukaj włazu...', 1200);
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
  if (!G.keyFound) { addLog('warn', 'hatch_locked', 'Właz zamknięty. Potrzebny klucz.'); return; }
  G.hatchOpen = true;
  G.cells[idx].item = null;
  addLog('item', 'hatch_open', 'Właz otwarty', `+${sectorReward(G.sector)} ✦`);
  showOverlay(`:hatch_open: SEKTOR UKOŃCZONY!\n+${sectorReward(G.sector)} ✦ Złotych Run`, 1100);
  setTimeout(() => fadeToBlack(() => nextSector()), 900);   // schodzimy w ciemnosc
}

function collectPotion(idx, type) {
  const c = G.cells[idx];
  if (type === 'potion') {
    const heal = 1 + G.meta.alch;   // Syntezator Alchemiczny: +1 HP leczenia za poziom
    const prev = G.hp;
    G.hp = Math.min(G.maxHp, G.hp + heal);
    if (G.hp === prev) addLog('item', 'potion', 'HP już pełne');
    else addLog('item', 'potion', 'Mikstura', `+${G.hp - prev} :heart:`);
  } else if (type === 'crystal') {
    const prev = G.mp;
    G.mp = Math.min(G.maxMp, G.mp + 1);
    addLog('item', 'crystal', 'Kryształ Many', `+${G.mp - prev} MP`);
  } else if (type === 'shield') {
    G.hasShield = true;
    addLog('item', 'shield', 'Tarcza Kinetyczna aktywna');
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
  addLog('lvlup', 'star', `Poziom ${G.level}`, 'ATK +1');
  const portrait = document.getElementById('portrait');
  portrait.classList.remove('levelup');
  void portrait.offsetWidth;
  portrait.classList.add('levelup');
  showOverlay(`:star: AWANS!\nPoziom ${G.level}\nATK: ${G.atk}`, 900);
  document.getElementById('atk-val').textContent = G.atk;
}

// SECTOR COMPLETION
function checkSectorComplete() {
  // Win by hatch (main path)
}

// nagroda w Zlotych Runach za ukonczenie sektora: 19, 23, 27 ... 55 (Zlota Zyla: +10% za poziom)
function sectorReward(sector) { return Math.round((15 + sector * 4) * (1 + 0.10 * G.meta.vein)); }

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
    hideSectorIntro();
    return;
  }

  G.sector = cleared + 1;
  if (G.mode === 'endless') {
    startSector();
  } else if (cleared === NODE_AFTER_SECTOR) {
    G.nodeUnlocked = true;          // od teraz wracasz tu po smierci
    showNode('node');
    hideSectorIntro();
  } else if (canAffordAnything()) {
    showNode('shop');               // miedzy sektorami mozna kupic ulepszenia, jesli stac gracza
    hideSectorIntro();
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

// LOG WALKI: wpis = ikona (nazwa sprite'a lub '') | krotki tekst | wartosc wyrownana do prawej
// type: info, warn, spell, item, kill, damage, lvlup; w tekscie i wartosci dzialaja tokeny :nazwa: (np. ':heart:')
const LOG_MAX = 40;

function addLog(type, icon, text, value = '') {
  const log = document.getElementById('combat-log');
  const el = document.createElement('div');
  el.className = 'log-entry ' + type;
  el.innerHTML =
    `<span class="log-ico">${icon ? Sprites.html(icon) : '<span class="log-dot"></span>'}</span>` +
    `<span class="log-text">${Sprites.rich(text)}</span>` +
    `<span class="log-val">${Sprites.rich(value)}</span>`;
  log.appendChild(el);
  while (log.children.length > LOG_MAX) log.removeChild(log.firstChild);
  log.scrollTop = log.scrollHeight;
}

// separator z numerem i nazwa sektora; starsze wpisy powoli gasna (CSS)
function logSector(sector, name) {
  const log = document.getElementById('combat-log');
  const el = document.createElement('div');
  el.className = 'log-sep';
  el.textContent = `SEKTOR ${sector} · ${name}`;
  log.appendChild(el);
}

function showOverlay(msg, duration=1500) {
  const ov = document.getElementById('overlay-msg');
  ov.innerHTML = Sprites.rich(msg);
  ov.classList.add('show');
  setTimeout(()=>ov.classList.remove('show'), duration);
}

function spawnParticle(el, text, color) {
  if (!el) return;
  const rect = el.getBoundingClientRect();
  const p = document.createElement('div');
  p.className = 'particle';
  p.innerHTML = Sprites.rich(text);
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

// klikniecie w plansze przejscia pomija ja
document.getElementById('sector-intro').addEventListener('click', hideSectorIntro);

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
G.meta = migrateMeta(Save.data.meta);

// funkcje wywolywane z atrybutow onclick w index.html
window.Save = Save;   // dostep dla tutorial.js
window.startGame = startGame;
window.showTitle = showTitle;
window.showNode = showNode;
window.buyUpgrade = buyUpgrade;
window.buySupply = buySupply;
window.continueFromNode = continueFromNode;
window.setSpell = setSpell;
window.deathPrimary = deathPrimary;
window.resetProgress = resetProgress;