// headless simulator of Mine-Crawl rules (mirrors game.js) for difficulty analysis
'use strict';

function makeRng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

const DEFAULT_CFG = {
  sectors: [
    { cols: 8,  rows: 8,  density: 0.22, mimics: 0, weights: { slime: 8, guardian: 5, brutal: 1 } },
    { cols: 10, rows: 10, density: 0.21, mimics: 1, weights: { slime: 5, guardian: 5, brutal: 2 } },
    { cols: 12, rows: 12, density: 0.22, mimics: 1, weights: { slime: 3, guardian: 5, brutal: 3 } },
    { cols: 14, rows: 14, density: 0.24, mimics: 2, weights: { guardian: 4, brutal: 4, specter: 1 } },
    { cols: 12, rows: 12, density: 0.22, mimics: 0, weights: { slime: 3, guardian: 4, brutal: 3 } },
    { cols: 16, rows: 16, density: 0.25, mimics: 2, weights: { guardian: 3, brutal: 4, specter: 3 } },
    { cols: 18, rows: 18, density: 0.27, mimics: 2, weights: { guardian: 2, brutal: 4, specter: 4 } },
    { cols: 20, rows: 20, density: 0.29, mimics: 3, weights: { brutal: 4, specter: 5 } },
    { cols: 22, rows: 22, density: 0.31, mimics: 3, weights: { brutal: 3, specter: 6 } },
    { cols: 12, rows: 12, density: 0.25, mimics: 2, weights: { brutal: 4, specter: 6 } },
  ],
  enemies: {
    slime:    { level: () => 1, exp: 11 },
    guardian: { level: s => (s >= 6 ? 3 : 2), exp: 16 },
    brutal:   { level: s => (s <= 4 ? 3 : (s <= 7 ? 4 : 5)), exp: 26 },
    specter:  { level: s => Math.min(9, 4 + Math.floor(s / 2)), exp: 38 },
    mimic:    { level: () => 0, exp: 24 },
  },
  itemPool: ['potion', 'potion', 'crystal', 'shield', 'potion'],
  itemChance: 0.3,
  nodeAfter: 5,
  boss: null,   // konfiguracja bossa (sektor 10), ustawiana w testach
};

class Game {
  constructor(cfg, rng, meta) {
    this.cfg = cfg; this.rng = rng; this.meta = meta || {};
    this.hp = 3; this.maxHp = 3 + (this.meta.hp || 0);
    this.mp = 5 + (this.meta.mp || 0); this.maxMp = this.mp;
    this.atk = 1 + (this.meta.atk || 0);
    this.exp = 0; this.expNext = 75; this.level = 1;
    this.shield = false;
    this.stats = { kills: 0, dmgTaken: 0, echoes: 0, dezints: 0, potions: 0 };
  }

  shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(this.rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

  pickWeighted(w) {
    const e = Object.entries(w); const t = e.reduce((a, [, v]) => a + v, 0);
    let r = this.rng() * t; for (const [k, v] of e) { r -= v; if (r <= 0) return k; } return e[0][0];
  }

  sectorCfg(s) { return this.cfg.sectors[s - 1]; }

  buildSector(s) {
    this.sector = s;
    const c = this.sectorCfg(s);
    this.cols = c.cols; this.rows = c.rows;
    const n = this.cols * this.rows;
    this.cells = Array.from({ length: n }, () => ({ enemy: null, item: null, number: 0, revealed: false, echoed: false }));
    this.firstClick = true; this.keyFound = false; this.done = false;
    this.isBoss = !!(this.cfg.boss && this.cfg.boss.sectors.includes(s));
    const positions = this.shuffle([...Array(n).keys()]);
    let used = new Set();

    if (this.isBoss) this.placeBoss(new Set());
    const free = positions.filter(i => !this.cells[i].enemy);
    const isFirst = s === 1;
    const total = Math.min(isFirst ? 14 : Math.floor(n * c.density), n - 4);
    const mimics = Math.min(c.mimics || 0, total);
    const roster = isFirst ? this.shuffle(['slime','slime','slime','slime','slime','slime','slime','slime','guardian','guardian','guardian','guardian','guardian','brutal']) : null;
    let p = 0;
    for (let i = 0; i < total - mimics; i++, p++) this.placeEnemy(free[p], roster ? roster[i] : this.pickWeighted(c.weights));
    for (let i = 0; i < mimics; i++, p++) this.placeEnemy(free[p], 'mimic');
    const safe = free.slice(p);
    if (this.isBoss) {
      const seals = this.cfg.boss.seals;
      for (let i = 0; i < seals; i++) this.cells[safe[i]].item = 'seal';
      this.keyCell = -1; this.hatchCell = -1;
      this.sealsLeft = seals; this.wrath = 0; this.spawned = 0; this.awake = false;
      for (let i = seals; i < safe.length && i - seals < this.cfg.itemPool.length; i++) {
        if (this.rng() < this.cfg.itemChance) this.cells[safe[i]].item = this.cfg.itemPool[i - seals];
      }
    } else {
      this.keyCell = safe[0]; this.hatchCell = safe[1];
      this.cells[safe[0]].item = 'key'; this.cells[safe[1]].item = 'hatch';
      for (let i = 2; i < safe.length && i - 2 < this.cfg.itemPool.length; i++) {
        if (this.rng() < this.cfg.itemChance) this.cells[safe[i]].item = this.cfg.itemPool[i - 2];
      }
    }
    this.computeNumbers();
  }

  placeBoss(avoid) {
    const b = this.cfg.boss;
    const level = Math.max(b.minLevel, this.atk + b.over);
    this.bossLevel = level;
    const cand = [];
    for (let r = 1; r < this.rows - 2; r++) for (let c = 1; c < this.cols - 2; c++) {
      const cells = [r * this.cols + c, r * this.cols + c + 1, (r + 1) * this.cols + c, (r + 1) * this.cols + c + 1];
      if (cells.every(i => !this.cells[i].enemy && !this.cells[i].item && !avoid.has(i))) cand.push(cells);
    }
    const pick = cand[Math.floor(this.rng() * cand.length)];
    this.bossCells = pick;
    this.bossAlive = 4;
    pick.forEach((i, k) => { this.cells[i].enemy = { type: 'boss', level, exp: 0, part: k }; });
  }

  placeEnemy(pos, type) {
    const e = this.cfg.enemies[type];
    this.cells[pos].enemy = { type, level: e.level(this.sector), exp: Math.round(e.exp * (1 + 0.15 * (this.meta.exp || 0))) };
  }

  nb(i) {
    const r = Math.floor(i / this.cols), c = i % this.cols, out = [];
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue; const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nr < this.rows && nc >= 0 && nc < this.cols) out.push(nr * this.cols + nc);
    }
    return out;
  }
  sum(i) { let s = 0; for (const j of this.nb(i)) if (this.cells[j].enemy) s += this.cells[j].enemy.level; return s; }
  computeNumbers() { this.cells.forEach((c, i) => { c.number = this.sum(i); }); }

  ensureSafeStart(idx) {
    const zone = new Set([idx, ...this.nb(idx)]);
    if (this.isBoss && this.bossCells.some(i => zone.has(i))) {
      this.bossCells.forEach(i => { this.cells[i].enemy = null; });
      const avoid = new Set(zone); [...zone].forEach(z => this.nb(z).forEach(x => avoid.add(x)));
      this.placeBoss(avoid);
    }
    const movers = [...zone].filter(i => this.cells[i].enemy);
    if (movers.length) {
      const spots = this.shuffle(this.cells.map((_, i) => i).filter(i => !zone.has(i) && !this.cells[i].enemy && !this.cells[i].revealed && !this.cells[i].item));
      for (const f of movers) { const t = spots.pop(); if (t === undefined) continue; this.cells[t].enemy = this.cells[f].enemy; this.cells[f].enemy = null; }
    }
    this.computeNumbers();
  }

  cascade(idx) {
    const q = [idx], seen = new Set([idx]);
    while (q.length) {
      const cur = q.shift();
      for (const n of this.nb(cur)) {
        if (seen.has(n)) continue; seen.add(n);
        const c = this.cells[n];
        if (c.revealed || c.enemy) continue;
        c.revealed = true; c.echoed = false;
        if (c.number === 0 && !c.item) q.push(n);
      }
    }
  }

  refreshAround(idx) {
    const zero = [];
    for (const i of [idx, ...this.nb(idx)]) {
      const c = this.cells[i]; const nx = this.sum(i); const ch = nx !== c.number; c.number = nx;
      if (i !== idx && c.revealed && ch && nx === 0 && !c.item) zero.push(i);
    }
    const c = this.cells[idx];
    if (c.number === 0 && !c.item) this.cascade(idx);
    zero.forEach(i => this.cascade(i));
  }

  gainExp(a) { this.exp += a; while (this.exp >= this.expNext) { this.exp -= this.expNext; this.level++; this.expNext = Math.floor(this.expNext * 1.8); this.atk++; this.hp = Math.min(this.maxHp, this.hp + 1); this.mp = Math.min(this.maxMp, this.mp + 1); } }

  hit(dmg) {
    if (dmg <= 0) return;
    if (this.shield) { this.shield = false; return; }
    this.hp -= dmg; this.stats.dmgTaken += dmg;
  }

  // akcja gracza: odkrycie pola
  reveal(idx) {
    const c = this.cells[idx];
    if (c.revealed) return;
    if (this.firstClick) { this.ensureSafeStart(idx); this.firstClick = false; }
    const wasEcho = c.echoed;
    c.revealed = true; c.echoed = false;
    if (c.enemy) {
      const e = c.enemy;
      const dmg = e.type === 'mimic' && !wasEcho ? 1 : Math.max(0, e.level - this.atk);
      this.hit(dmg);
      this.gainExp(e.exp); this.stats.kills++;
      c.enemy = null;
      if (e.type === 'boss') this.bossHit();
      this.refreshAround(idx);
    } else if (c.number === 0 && !c.item) this.cascade(idx);
    this.tickWrath(1);
  }

  echo(idx) { if (this.mp < 2) return false; this.mp -= 2; this.cells[idx].echoed = true; this.stats.echoes++; this.tickWrath(1); return true; }

  dezint(idx) {
    if (this.mp < 4) return false;
    this.mp -= 4; this.stats.dezints++;
    const c = this.cells[idx]; c.revealed = true; c.echoed = false;
    if (c.enemy) {
      const e = c.enemy;
      if (e.type === 'boss' && this.cfg.boss.dezintImmune) { c.revealed = false; c.echoed = true; this.mp += 0; return true; }
      this.gainExp(e.exp); this.stats.kills++; c.enemy = null;
      if (e.type === 'boss') this.bossHit();
      this.refreshAround(idx);
    } else if (c.number === 0 && !c.item) this.cascade(idx);
    this.tickWrath(1);
    return true;
  }

  bossHit() {
    this.bossAlive--;
    if (this.cfg.boss.partWeaken) {
      this.bossLevel = Math.max(0, this.bossLevel - this.cfg.boss.partWeaken);
      this.bossCells.forEach(i => { if (this.cells[i].enemy) this.cells[i].enemy.level = this.bossLevel; });
      this.bossCells.forEach(i => this.refreshAround(i));
    }
    if (!this.awake) this.awaken();
    if (this.bossAlive === 0) this.done = 'win';
  }

  awaken() { this.awake = true; this.bossCells.forEach(i => { if (!this.cells[i].revealed) this.cells[i].echoed = true; }); }

  tickWrath(n) {
    if (!this.isBoss || this.done) return;
    const b = this.cfg.boss;
    this.wrath += n;
    const every = this.awake ? b.wrathAwake : b.wrathEvery;
    if (this.wrath >= every) {
      this.wrath = 0;
      if (this.awake && b.pulseDamage) this.hit(b.pulseDamage);
      if (this.spawned >= b.maxSpawns) return;
      const cand = this.cells.map((_, i) => i).filter(i => !this.cells[i].revealed && !this.cells[i].enemy && !this.cells[i].item && !this.cells[i].echoed);
      if (!cand.length) return;
      const i = cand[Math.floor(this.rng() * cand.length)];
      this.placeEnemy(i, this.pickWeighted(b.spawnWeights));
      this.spawned++;
      for (const j of [i, ...this.nb(i)]) this.cells[j].number = this.sum(j);
    }
  }

  collect(idx) {
    const c = this.cells[idx];
    if (c.item === 'key') { this.keyFound = true; c.item = null; }
    else if (c.item === 'hatch') { if (this.keyFound) { this.done = 'exit'; } }
    else if (c.item === 'potion') { this.hp = Math.min(this.maxHp, this.hp + 1 + (this.meta.alch || 0)); this.stats.potions++; c.item = null; }
    else if (c.item === 'crystal') { this.mp = Math.min(this.maxMp, this.mp + 1); c.item = null; }
    else if (c.item === 'shield') { this.shield = true; c.item = null; }
    else if (c.item === 'seal') {
      c.item = null; this.sealsLeft--;
      const drop = this.cfg.boss.sealDrop;
      this.bossLevel = Math.max(0, this.bossLevel - drop);
      this.bossCells.forEach(i => { if (this.cells[i].enemy) this.cells[i].enemy.level = this.bossLevel; });
      this.bossCells.forEach(i => this.refreshAround(i));
      if (this.sealsLeft === 0 && this.cfg.boss.revealOnSeals) this.awaken();
    }
  }
}

// BOT "rozwazny": dedukcja z sum poziomow, darmowe zabicia, echo przy niepewnosci, dezintegracja w kryzysie
function smartStep(g) {
  const C = g.cells;
  const covered = [], frontier = [];
  for (let i = 0; i < C.length; i++) if (!C[i].revealed) covered.push(i);
  if (g.firstClick) { const i = Math.floor(g.rows / 2) * g.cols + Math.floor(g.cols / 2); g.reveal(i); return true; }

  // przedmioty na odkrytych polach
  for (let i = 0; i < C.length; i++) {
    const c = C[i]; if (!c.revealed || !c.item) continue;
    if (c.item === 'key' || c.item === 'seal') { g.collect(i); return true; }
    if (c.item === 'potion' && g.hp < g.maxHp) { g.collect(i); return true; }
    if (c.item === 'crystal' && g.mp < g.maxMp) { g.collect(i); return true; }
    if (c.item === 'shield' && !g.shield) { g.collect(i); return true; }
  }

  // przebudzony boss: atak na najslabsza czesc (pulsy Gniewu nie pozwalaja zwlekac)
  if (g.isBoss && g.awake) {
    const parts = g.bossCells.filter(i => C[i].enemy && !C[i].revealed);
    if (parts.length) {
      const i = parts[0]; const dmg = C[i].enemy.level - g.atk;
      if (dmg >= g.hp && g.mp >= 4 && !g.cfg.boss.dezintImmune) { g.dezint(i); return true; }
      g.reveal(i); return true;
    }
  }

  // ograniczenie gorne poziomu i pewne puste pola
  const ub = new Map(); const safe = new Set();
  for (let r = 0; r < C.length; r++) {
    const c = C[r]; if (!c.revealed) continue;
    const nbs = g.nb(r).filter(j => !C[j].revealed);
    if (!nbs.length) continue;
    let known = 0; const unknown = [];
    for (const j of nbs) { if (C[j].echoed) { if (C[j].enemy) known += C[j].enemy.level; } else unknown.push(j); }
    const rest = c.number - known;
    for (const j of unknown) ub.set(j, Math.min(ub.has(j) ? ub.get(j) : Infinity, rest));
    if (rest === 0) unknown.forEach(j => safe.add(j));
  }
  for (const j of covered) if (C[j].echoed && !C[j].enemy) safe.add(j);

  // 1. pewne puste pola
  for (const j of safe) { g.reveal(j); return true; }
  // 2. przeswietleni wrogowie do zabicia bez strat (bossa tylko gdy oplaca sie walczyc)
  for (const j of covered) { const c = C[j]; if (c.echoed && c.enemy && c.enemy.level <= g.atk) { g.reveal(j); return true; } }
  // 3. pola, gdzie kazdy wrog bylby slabszy od ATK
  let bestFree = null;
  for (const [j, u] of ub) if (!C[j].echoed && u <= g.atk) { bestFree = j; break; }
  if (bestFree !== null) { g.reveal(bestFree); return true; }

  // wyjscie, gdy nic darmowego nie zostalo
  if (g.keyFound && g.hatchCell >= 0 && C[g.hatchCell].revealed) { g.collect(g.hatchCell); return true; }

  // 4. echo na najmniej groznym polu frontu
  const cand = [...ub.entries()].filter(([j]) => !C[j].echoed).sort((a, b) => a[1] - b[1]);
  if (cand.length && g.mp >= 2 && (g.mp >= 4 || cand[0][1] - g.atk >= g.hp)) {
    g.echo(cand[0][0]); return true;
  }
  // 5. kryzys: dezintegracja przeswietlonego, groznego wroga albo niepewnego pola
  const echoedThreats = covered.filter(j => C[j].echoed && C[j].enemy && C[j].enemy.type !== 'boss').sort((a, b) => C[a].enemy.level - C[b].enemy.level);
  if (g.mp >= 4) {
    if (cand.length && cand[0][1] - g.atk >= g.hp) { g.dezint(cand[0][0]); return true; }
  }
  // 6. wymuszony ruch: najmniejsze ryzyko
  let pick = null, risk = Infinity;
  for (const [j, u] of cand) { const r = u - g.atk; if (r < risk) { risk = r; pick = j; } }
  for (const j of echoedThreats) { const r = C[j].enemy.level - g.atk; if (r < risk) { risk = r; pick = j; } }
  const unknownInterior = covered.filter(j => !ub.has(j) && !C[j].echoed);
  if ((pick === null || risk >= 2) && unknownInterior.length) pick = unknownInterior[Math.floor(g.rng() * unknownInterior.length)];
  if (pick === null) {
    // zostaly tylko przeswietlone silne cele (np. boss)
    const rest = covered.filter(j => C[j].echoed && C[j].enemy).sort((a, b) => C[a].enemy.level - C[b].enemy.level);
    if (!rest.length) return false;
    pick = rest[0];
  }
  g.reveal(pick);
  return true;
}

// BOT "losowy klikacz": klika losowe zakryte pola, zbiera to, co widzi, bez zaklec
function randomStep(g) {
  const C = g.cells;
  for (let i = 0; i < C.length; i++) {
    const c = C[i]; if (!c.revealed || !c.item) continue;
    if (c.item === 'key' || c.item === 'seal' || c.item === 'shield' || (c.item === 'potion' && g.hp < g.maxHp)) { g.collect(i); return true; }
    if (c.item === 'hatch' && g.keyFound) { g.collect(i); return true; }
  }
  const covered = []; for (let i = 0; i < C.length; i++) if (!C[i].revealed) covered.push(i);
  if (!covered.length) return false;
  g.reveal(covered[Math.floor(g.rng() * covered.length)]);
  return true;
}

function playSector(g, s, stepFn) {
  g.buildSector(s);
  for (let k = 0; k < 4000; k++) {
    if (g.hp <= 0) return 'dead';
    if (g.done) return g.done === 'win' ? 'win' : 'clear';
    if (!stepFn(g)) return 'stuck';
  }
  return 'stuck';
}

// pelna kampania: po sektorze nodeAfter smierc = powrot do Wezla (pelne HP/MP) i powtorka sektora
function playCampaign(cfg, seed, stepFn, meta = {}, opts = {}) {
  const rng = makeRng(seed);
  const g = new Game(cfg, rng, meta);
  const log = []; let node = false; let retries = 0;
  let runes = opts.runes || 0; const bought = { potion: 0, crystal: 0, shield: 0 };
  const shop = () => {
    if (opts.noShop) return;
    const cost = k => ({ potion: 25, crystal: 15, shield: 35 })[k] + ({ potion: 10, crystal: 5, shield: 15 })[k] * bought[k];
    for (let k = 0; k < 6; k++) {
      if (g.hp < g.maxHp && runes >= cost('potion')) { runes -= cost('potion'); bought.potion++; g.hp = Math.min(g.maxHp, g.hp + 1 + (meta.alch || 0)); continue; }
      if (!g.shield && runes >= cost('shield') && g.hp <= 2) { runes -= cost('shield'); bought.shield++; g.shield = true; continue; }
      if (g.mp < g.maxMp - 1 && runes >= cost('crystal')) { runes -= cost('crystal'); bought.crystal++; g.mp = Math.min(g.maxMp, g.mp + 2); continue; }
      break;
    }
  };
  for (let s = 1; s <= cfg.sectors.length; s++) {
    const hpBefore = g.hp;
    const res = playSector(g, s, stepFn);
    log.push({ s, res, atk: g.atk, lvl: g.level, hp: g.hp, maxHp: g.maxHp });
    if (res === 'dead' || res === 'stuck') {
      if (!node || retries >= (opts.maxRetries ?? 0)) return { reached: s, log, retries, g };
      retries++; g.hp = g.maxHp; g.mp = g.maxMp;
      if (opts.nodeRestart) s = cfg.nodeAfter; else s--;
      continue;
    }
    runes += Math.round((15 + s * 4) * (1 + 0.10 * (meta.vein || 0)));
    if (s === cfg.nodeAfter) { node = true; g.hp = g.maxHp; g.mp = g.maxMp; }
    shop();
  }
  return { reached: cfg.sectors.length + 1, log, retries, g };
}

module.exports = { DEFAULT_CFG, Game, makeRng, smartStep, randomStep, playSector, playCampaign };
