const S = require('./sim.js');
function clone(o) { return JSON.parse(JSON.stringify(o)); }
function build(v) {
  const cfg = { ...S.DEFAULT_CFG, sectors: clone(S.DEFAULT_CFG.sectors), enemies: { ...S.DEFAULT_CFG.enemies } };
  if (v.specter) cfg.enemies.specter = { level: v.specter, exp: 38 };
  if (v.brutal) cfg.enemies.brutal = { level: v.brutal, exp: 26 };
  if (v.guardian) cfg.enemies.guardian = { level: v.guardian, exp: 16 };
  if (v.sec) for (const [i, patch] of Object.entries(v.sec)) Object.assign(cfg.sectors[i - 1], patch);
  if (v.boss) cfg.boss = v.boss;
  return cfg;
}
function summary(cfg, stepFn, meta, opts, N) {
  const reach = Array(13).fill(0); let wins = 0, retries = 0;
  for (let i = 0; i < N; i++) { const r = S.playCampaign(cfg, 1000 + i * 7919, stepFn, meta, opts); reach[r.reached]++; if (r.reached > 10) wins++; retries += r.retries; }
  const surv = []; let alive = N; for (let s = 1; s <= 10; s++) { alive -= reach[s]; surv.push(String(Math.round(100 * alive / N)).padStart(4)); }
  return `${surv.join('')} | win ${(100 * wins / N).toFixed(0).padStart(3)}% powt. ${(retries / N).toFixed(1)}`;
}
module.exports = { build, summary, clone };
