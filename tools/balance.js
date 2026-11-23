/* Headless balance harness: simulates a sensible player over many seeds.
 * Usage: node tools/balance.js [mode] [runs] */
const NM = require('../game.js');

function simulate(mode, seed, maxWeeks) {
  maxWeeks = maxWeeks || 600;
  const s = NM.newGame({ mode, seed, jobId: 'shopassistant' });
  const courseOrder = ['plumbing', 'electrical', 'nursing', 'business', 'engineering', 'law', 'medical'];
  while (!s.over && s.week <= maxWeeks) {
    // spend action points sensibly
    let guard = 8;
    while (s.ap > 0 && guard-- > 0 && !s.over) {
      const rep = NM.weeklyReport(s);
      // pay debt first if any
      if (s.debts.length && s.cash > 2000) { NM.payDebt(s, 2000); continue; }
      // study next course if affordable (keep buffer)
      if (!s.studying) {
        const next = courseOrder.find(c => !s.skills.includes(NM.DATA.COURSES[c].skill));
        if (next && s.cash > NM.DATA.COURSES[next].cost + 1500) { NM.study(s, next); continue; }
      }
      // apply for best available job
      let best = null, bestSal = NM.salary(s);
      for (const j of Object.values(NM.DATA.JOBS)) {
        if (j.skill && !s.skills.includes(j.skill)) continue;
        if (j.salary > bestSal + 50) { best = j; bestSal = j.salary; }
      }
      if (best && s.job.id !== best.id) { NM.applyJob(s, best.id); continue; }
      // buy business if entrepreneur and flush
      if (s.skills.includes('business') && s.businesses.length < 2) {
        const b = NM.DATA.BUSINESSES.cafe;
        if (s.cash > b.cost + 5000) { NM.buyBusiness(s, 'cafe'); continue; }
      }
      // buy a rental property if deposit affordable with buffer
      const target = s.mode === 'beginner' ? 4 : 9;
      if (s.properties.length < target) {
        const afford = s.market.listings
          .filter(l => s.cash > Math.round(l.price * NM.DATA.PROPERTY_TYPES[l.type].depositPct) + 2500)
          .sort((a, b) => b.rent - a.rent)[0];
        if (afford) { NM.buyProperty(s, afford.id); continue; }
      }
      // renovate kitchen/paint/solar when flush
      const renoTarget = s.properties.find(p => !p.reno.includes('kitchen'));
      if (renoTarget && s.cash > 12000) { NM.renovate(s, renoTarget.id, 'kitchen'); continue; }
      const solarTarget = s.properties.find(p => !p.reno.includes('solar'));
      if (solarTarget && s.cash > 10000) { NM.renovate(s, solarTarget.id, 'solar'); continue; }
      const paintTarget = s.properties.find(p => !p.reno.includes('paint'));
      if (paintTarget && s.cash > 6000) { NM.renovate(s, paintTarget.id, 'paint'); continue; }
      break; // nothing useful to do with the point
    }
    NM.endWeek(s);
  }
  return {
    seed, mode, won: s.won, week: s.week, wealth: NM.wealth(s),
    passive: NM.passiveIncome(s), costs: NM.expenses(s).total,
    salary: NM.salary(s), props: s.properties.length, biz: s.businesses.length,
    cash: Math.round(s.cash), credit: s.credit,
  };
}

const mode = process.argv[2] || 'freedom';
const runs = parseInt(process.argv[3] || '200', 10);
const results = [];
for (let i = 0; i < runs; i++) results.push(simulate(mode, 1000 + i * 7919));
const wins = results.filter(r => r.won);
console.log(`mode=${mode} runs=${runs} wins=${wins.length}`);
if (wins.length) {
  const weeks = wins.map(r => r.week).sort((a, b) => a - b);
  const q = p => weeks[Math.floor(p * (weeks.length - 1))];
  console.log(`win week: min=${weeks[0]} p25=${q(0.25)} median=${q(0.5)} p75=${q(0.75)} max=${weeks[weeks.length - 1]}`);
  console.log('sample wins:', wins.slice(0, 5).map(r => `w${r.week} wealth=${r.wealth} passive=${r.passive} costs=${r.costs} props=${r.props} biz=${r.biz}`).join(' | '));
}
const sample = results.slice(0, 8);
console.log('first runs:', sample.map(r => `seed${r.seed} won=${r.won} wk=${r.week} wealth=${r.wealth} passive=${r.passive} costs=${r.costs} props=${r.props} cash=${r.cash}`).join('\n  '));
