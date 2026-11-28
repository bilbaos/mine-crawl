const S = require('./sim.js');
const { build, summary } = require('./lib.js');
const N = +process.argv[2] || 400;
const FINAL = {
  sec: { 2: { density: 0.23, weights: { slime: 4, guardian: 6, brutal: 2 } }, 3: { density: 0.24, weights: { slime: 2, guardian: 5, brutal: 4 } },
         4: { density: 0.25 }, 8: { density: 0.28 },
         10: { cols: 14, rows: 14, density: 0.22, mimics: 1, weights: { brutal: 4, specter: 6 } } },
  boss: { sectors: [10], minLevel: 9, over: 8, seals: 3, sealDrop: 2, partWeaken: 1, wrathEvery: 8, wrathAwake: 4, pulseDamage: 1, maxSpawns: 8, spawnWeights: { brutal: 2, specter: 3 }, revealOnSeals: true },
};
const cfg = build(FINAL);
const before = build({});
console.log('PRZED zmianami (obecna gra, nielimitowane powtorki od Wezla):');
console.log(' losowy klikacz            ', summary(before, S.randomStep, {}, { maxRetries: 99 }, N));
console.log(' rozwazny, bez ulepszen    ', summary(before, S.smartStep, {}, { maxRetries: 99 }, N));
console.log('\nPO zmianach (3 Iskry Wezla, boss):');
console.log(' losowy klikacz            ', summary(cfg, S.randomStep, {}, { maxRetries: 3 }, N));
console.log(' rozwazny, bez ulepszen    ', summary(cfg, S.smartStep, {}, { maxRetries: 3 }, N));
console.log(' rozwazny, srednie ulepsz. ', summary(cfg, S.smartStep, { hp: 1, mp: 1, exp: 1, alch: 1 }, { maxRetries: 3 }, N));
console.log(' rozwazny, bez ulepszen, 0 ', summary(cfg, S.smartStep, {}, { maxRetries: 0 }, N));
// zablokowane plansze (bot nie ma zadnego ruchu albo przekroczyl limit krokow)
let stuck = 0, sectors = 0;
for (let i = 0; i < N; i++) { const r = S.playCampaign(cfg, 5000 + i * 104729, S.smartStep, { hp: 3, mp: 2, exp: 3, alch: 2 }, { maxRetries: 3 }); for (const e of r.log) { sectors++; if (e.res === 'stuck') stuck++; } }
console.log(`\nzablokowane sektory: ${stuck} na ${sectors}`);
