/* Neighbourhood Mogul — game engine (pure logic, no DOM).
 * Works in the browser (window.NM) and in Node (module.exports) for headless balancing. */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.NM = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------- seeded RNG ----------
  function rnd(state) {
    // mulberry32, state stored as a single integer
    state.rngState |= 0;
    state.rngState = (state.rngState + 0x6D2B79F5) | 0;
    let t = state.rngState;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function rint(state, min, max) { return min + Math.floor(rnd(state) * (max - min + 1)); }
  function pick(state, arr) { return arr[Math.floor(rnd(state) * arr.length)]; }
  function chance(state, p) { return rnd(state) < p; }

  // ---------- static data ----------
  const STREET_NAMES = [
    'Oak Street', 'Maple Avenue', 'River Road', 'School Way', 'Park Crescent',
    'Hill Street', 'Church Lane', 'Station Road', 'Garden Grove', 'Lake View',
    'Bridge Street', 'Forest Drive', 'Beach Road', 'Market Street', 'Mill Lane',
  ];

  const PROPERTY_TYPES = {
    small:  { key: 'small',  name: 'Small House',      price: 100000,  rent: 300,  power: 30,  maintenance: 15, depositPct: 0.20 },
    family: { key: 'family', name: 'Family House',     price: 250000,  rent: 650,  power: 45,  maintenance: 25, depositPct: 0.20 },
    duplex: { key: 'duplex', name: 'Duplex',           price: 500000,  rent: 1400, power: 70,  maintenance: 45, depositPct: 0.20 },
    block:  { key: 'block',  name: 'Apartment Block',  price: 1000000, rent: 3000, power: 120, maintenance: 90, depositPct: 0.25 },
  };

  const JOBS = {
    dogwalker:      { id: 'dogwalker',      name: 'Dog Walker',      tier: 'Starter',      salary: 220,  skill: null },
    shopassistant:  { id: 'shopassistant',  name: 'Shop Assistant',  tier: 'Starter',      salary: 400,  skill: null },
    lawnmower:      { id: 'lawnmower',      name: 'Lawn Mower',      tier: 'Starter',      salary: 300,  skill: null },
    plumber:        { id: 'plumber',        name: 'Plumber',         tier: 'Intermediate', salary: 620,  skill: 'plumbing' },
    electrician:    { id: 'electrician',    name: 'Electrician',     tier: 'Intermediate', salary: 660,  skill: 'electrical' },
    nurse:          { id: 'nurse',          name: 'Nurse',           tier: 'Intermediate', salary: 700,  skill: 'nursing' },
    engineer:       { id: 'engineer',       name: 'Engineer',        tier: 'Professional', salary: 1200, skill: 'engineering' },
    lawyer:         { id: 'lawyer',         name: 'Lawyer',          tier: 'Professional', salary: 1400, skill: 'law' },
    doctor:         { id: 'doctor',         name: 'Doctor',          tier: 'Professional', salary: 1600, skill: 'medical' },
  };

  const COURSES = {
    plumbing:    { id: 'plumbing',    name: 'Plumbing Course',    cost: 1500,  weeks: 2, skill: 'plumbing',    unlocks: 'Plumber' },
    electrical:  { id: 'electrical',  name: 'Electrical Course',  cost: 1700,  weeks: 2, skill: 'electrical',  unlocks: 'Electrician' },
    nursing:     { id: 'nursing',     name: 'Nursing Course',     cost: 2000,  weeks: 3, skill: 'nursing',     unlocks: 'Nurse' },
    engineering: { id: 'engineering', name: 'Engineering Degree', cost: 8000,  weeks: 6, skill: 'engineering', unlocks: 'Engineer' },
    law:         { id: 'law',         name: 'Law Degree',         cost: 10000, weeks: 6, skill: 'law',         unlocks: 'Lawyer' },
    medical:     { id: 'medical',     name: 'Medical Degree',     cost: 12000, weeks: 8, skill: 'medical',     unlocks: 'Doctor' },
    business:    { id: 'business',    name: 'Business Basics',    cost: 5000,  weeks: 4, skill: 'business',    unlocks: 'Owning a business' },
  };

  const BUSINESSES = {
    lawn:  { id: 'lawn',  name: 'Lawn Service', cost: 25000, income: 170, costWeekly: 40 },
    carwash:{ id: 'carwash', name: 'Car Wash',   cost: 40000, income: 240, costWeekly: 60 },
    cafe:  { id: 'cafe',  name: 'Cafe',          cost: 65000, income: 380, costWeekly: 120 },
  };

  const RENOVATIONS = {
    paint:   { id: 'paint',   name: 'Paint',         cost: 2000,  rent: 15, condition: 10, value: 5000,  powerCut: 0 },
    kitchen: { id: 'kitchen', name: 'New Kitchen',   cost: 10000, rent: 55, condition: 20, value: 18000, powerCut: 0 },
    solar:   { id: 'solar',   name: 'Solar Panels',  cost: 8000,  rent: 0,  condition: 0,  value: 6000,  powerCut: 0.20 },
    repairs: { id: 'repairs', name: 'Repairs',       cost: 1500,  rent: 0,  condition: 30, value: 2000,  powerCut: 0 },
  };

  // weight, minWeek, apply(state) -> message
  const EVENTS = [
    { id: 'promotion', w: 6, min: 4, good: true, apply(s) {
        if (!s.job) return null;
        s.job.raises += 1;
        return { text: 'Promotion! Your pay goes up 8%.', kind: 'good' };
      } },
    { id: 'boom', w: 6, min: 6, good: true, apply(s) {
        for (const p of s.properties) p.value = Math.round(p.value * 1.05);
        return { text: 'Property boom! Every property you own is worth 5% more.', kind: 'good' };
      } },
    { id: 'rebate', w: 5, min: 2, good: true, apply(s) {
        s.cash += 1500;
        return { text: 'Solar rebate from the council! +$1,500.', kind: 'good' };
      } },
    { id: 'ratesfall', w: 5, min: 4, good: true, apply(s) {
        s.market.rate = Math.max(0.025, +(s.market.rate - 0.005).toFixed(4));
        return { text: 'Interest rates fall! New mortgages are cheaper.', kind: 'good' };
      } },
    { id: 'refund', w: 5, min: 3, good: true, apply(s) {
        const amt = 300;
        s.cash += amt;
        return { text: `Tax refund! +$${amt}.`, kind: 'good' };
      } },
    { id: 'leak', w: 6, min: 3, good: false, apply(s) {
        const target = pick(s, s.properties);
        if (!target) return null;
        target.condition = Math.max(5, target.condition - 20);
        return { text: `Roof leak at your ${target.typeName} on ${target.streetName}! Condition -20.`, kind: 'bad' };
      } },
    { id: 'tenant', w: 6, min: 3, good: false, apply(s) {
        const target = pick(s, s.properties.filter(p => !p.isHome));
        if (!target) return null;
        target.vacant = rint(s, 1, 2);
        return { text: `A tenant moved out of your ${target.typeName} on ${target.streetName}. It is empty for a week or two.`, kind: 'bad' };
      } },
    { id: 'car', w: 5, min: 2, good: false, apply(s) {
        const amt = 800;
        s.cash -= amt;
        return { text: `Your car broke down. Repairs cost $${amt}.`, kind: 'bad' };
      } },
    { id: 'ratesrise', w: 5, min: 4, good: false, apply(s) {
        s.market.rate = Math.min(0.09, +(s.market.rate + 0.005).toFixed(4));
        return { text: 'Interest rates rise! New mortgages cost more.', kind: 'bad' };
      } },
    { id: 'power', w: 5, min: 2, good: false, apply(s) {
        const amt = 150;
        s.cash -= amt;
        return { text: `Heat wave! Your power bill jumps by $${amt}.`, kind: 'bad' };
      } },
    { id: 'storm', w: 4, min: 8, good: false, apply(s) {
        for (const p of s.properties) { p.value = Math.round(p.value * 0.97); p.condition = Math.max(5, p.condition - 5); }
        return { text: 'A big storm! Property values dip 3% and conditions fall.', kind: 'bad' };
      } },
  ];

  // ---------- town generation ----------
  function generateTown(seed) {
    const s = { rngState: seed };
    const names = STREET_NAMES.slice();
    const streets = [];
    const count = 5 + Math.floor(rnd(s) * 3); // 5-7 streets
    for (let i = 0; i < count; i++) {
      const ni = Math.floor(rnd(s) * names.length);
      const name = names.splice(ni, 1)[0];
      streets.push({
        name,
        desirability: rint(s, 40, 95),
        school: rint(s, 30, 100),
        crime: rint(s, 5, 60),          // higher = worse
        growth: rint(s, 2, 10),         // weekly appreciation driver
      });
    }
    return streets;
  }

  function streetMult(street) { return street.desirability / 70; }

  // ---------- mortgage maths ----------
  function mortgagePayment(principal, annualRate, weeks) {
    weeks = weeks || 520;
    const r = annualRate / 52;
    if (r <= 0) return principal / weeks;
    const f = Math.pow(1 + r, weeks);
    return principal * r * f / (f - 1);
  }

  function rateForCredit(baseRate, credit) {
    return Math.max(0.01, baseRate + (3 - credit) * 0.006);
  }

  // ---------- new game ----------
  function newGame(opts) {
    opts = opts || {};
    const seed = (opts.seed != null) ? opts.seed : Math.floor(Math.random() * 1e9);
    const town = generateTown(seed);
    const state = {
      version: 1,
      seed,
      rngState: seed,
      week: 1,
      mode: opts.mode || 'freedom',       // 'beginner' | 'freedom'
      name: opts.name || 'Player',
      cash: 5000,
      credit: 3,
      weeksSinceMiss: 4,
      job: { id: opts.jobId || 'shopassistant', raises: 0 },
      skills: [],
      studying: null,
      properties: [],
      debts: [],
      businesses: [],
      town,
      market: { rate: 0.05, listings: [] },
      ap: 2,
      apMax: 2,
      log: [],
      over: false,
      won: false,
      winInfo: null,
      financeMode: !!opts.financeMode,
      nextId: 1,
    };

    // starter home: modest small house with a loan (the "I owe the bank" hook)
    const homeStreet = town.reduce((a, b) => (a.desirability < b.desirability ? a : b));
    const price = Math.round(PROPERTY_TYPES.small.price * streetMult(homeStreet));
    const deposit = Math.round(price * PROPERTY_TYPES.small.depositPct);
    const loan = price - deposit;
    const rate = rateForCredit(state.market.rate, state.credit);
    const home = {
      id: state.nextId++,
      type: 'small',
      typeName: PROPERTY_TYPES.small.name,
      street: homeStreet.name,
      streetName: homeStreet.name,
      price, value: price,
      mortgage: loan,
      rate,
      payment: mortgagePayment(loan, rate),
      rent: Math.round(PROPERTY_TYPES.small.rent * streetMult(homeStreet)),
      condition: 75,
      solar: false,
      reno: [],
      vacant: 0,
      isHome: true,
    };
    state.properties.push(home);
    state.market.listings = [makeListing(state), makeListing(state), makeListing(state)];
    addLog(state, `Welcome to ${town[0].name} neighbourhood! You have a job as a ${JOBS[state.job.id].name} and a small house with a $${loan.toLocaleString()} loan.`, 'system');
    addLog(state, `Goal: ${state.mode === 'beginner' ? '$40,000 total wealth or 3 properties' : 'Financial Freedom — your Money Makers must cover all your bills'}.`, 'system');
    return state;
  }

  function makeListing(state) {
    const roll = rnd(state);
    let type = 'small';
    if (roll < 0.40) type = 'small';
    else if (roll < 0.75) type = 'family';
    else if (roll < 0.95) type = 'duplex';
    else type = 'block';
    const t = PROPERTY_TYPES[type];
    const street = pick(state, state.town);
    const m = streetMult(street);
    const price = Math.round(t.price * m * (0.95 + rnd(state) * 0.10));
    const rent = Math.round(t.rent * m * (0.95 + rnd(state) * 0.10));
    return {
      id: state.nextId++,
      type, typeName: t.name,
      street: street.name, streetName: street.name,
      price, rent,
      condition: rint(state, 60, 95),
    };
  }

  function addLog(state, text, kind) {
    state.log.push({ week: state.week, text, kind: kind || 'info' });
    if (state.log.length > 200) state.log = state.log.slice(-200);
  }

  // ---------- derived numbers ----------
  function salary(state) {
    if (!state.job) return 0;
    const j = JOBS[state.job.id];
    return Math.round(j.salary * (1 + 0.08 * state.job.raises));
  }

  function propertyIncome(state) {
    let sum = 0;
    for (const p of state.properties) {
      if (p.isHome) continue;                 // you live in it
      if (p.vacant > 0) continue;
      sum += p.rent;
    }
    return sum;
  }

  function businessIncome(state) {
    let sum = 0;
    for (const b of state.businesses) sum += BUSINESSES[b.id].income - BUSINESSES[b.id].costWeekly;
    return sum;
  }

  function passiveIncome(state) { return propertyIncome(state) + businessIncome(state); }

  function expenses(state) {
    let mortgage = 0, power = 0, rates = 0, maintenance = 0;
    for (const p of state.properties) {
      mortgage += p.payment;
      power += p.solar ? PROPERTY_TYPES[p.type].power * (1 - 0.2) : PROPERTY_TYPES[p.type].power;
      rates += p.value * 0.0002;
      maintenance += PROPERTY_TYPES[p.type].maintenance + Math.max(0, (100 - p.condition) * 0.4);
    }
    const living = 60;
    const debtInterest = state.debts.reduce((a, d) => a + d.balance * d.rate, 0);
    const total = mortgage + power + rates + maintenance + living + debtInterest;
    return {
      mortgage: Math.round(mortgage),
      power: Math.round(power),
      rates: Math.round(rates),
      maintenance: Math.round(maintenance),
      living,
      debtInterest: Math.round(debtInterest),
      total: Math.round(total),
    };
  }

  function totalIncome(state) { return salary(state) + propertyIncome(state) + businessIncome(state); }

  function wealth(state) {
    let w = state.cash;
    for (const p of state.properties) w += p.value - p.mortgage;
    for (const b of state.businesses) w += BUSINESSES[b.id].cost;
    for (const d of state.debts) w -= d.balance;
    return Math.round(w);
  }

  function weeklyReport(state) {
    const inc = totalIncome(state);
    const exp = expenses(state);
    return {
      salary: salary(state),
      property: propertyIncome(state),
      business: businessIncome(state),
      income: inc,
      expenses: exp.total,
      cashflow: inc - exp.total,
      passive: passiveIncome(state),
      livingCosts: exp.total,
      wealth: wealth(state),
      detail: exp,
    };
  }

  // ---------- actions ----------
  function canAct(state) { return !state.over && state.ap > 0; }

  function study(state, courseId) {
    const c = COURSES[courseId];
    if (!c || state.over) return { ok: false, msg: 'Not available.' };
    if (state.skills.includes(c.skill)) return { ok: false, msg: 'You already did this course.' };
    if (state.studying) return { ok: false, msg: 'You can only study one course at a time.' };
    if (state.cash < c.cost) return { ok: false, msg: 'Not enough cash.' };
    if (!canAct(state)) return { ok: false, msg: 'No action points left this week.' };
    state.cash -= c.cost;
    state.ap -= 1;
    state.studying = { courseId, weeksLeft: c.weeks };
    addLog(state, `Started ${c.name} ($${c.cost.toLocaleString()}, ${c.weeks} weeks).`, 'action');
    return { ok: true };
  }

  function applyJob(state, jobId) {
    const j = JOBS[jobId];
    if (!j || state.over) return { ok: false, msg: 'Not available.' };
    if (j.skill && !state.skills.includes(j.skill)) return { ok: false, msg: `Requires the ${COURSES[skillToCourse(j.skill)].name}.` };
    if (!canAct(state)) return { ok: false, msg: 'No action points left this week.' };
    state.ap -= 1;
    state.job = { id: j.id, raises: 0 };
    addLog(state, `New job: ${j.name}! Salary $${salary(state).toLocaleString()}/week.`, 'good');
    return { ok: true };
  }
  function skillToCourse(skill) {
    for (const k of Object.keys(COURSES)) if (COURSES[k].skill === skill) return k;
    return null;
  }

  function buyProperty(state, listingId) {
    const i = state.market.listings.findIndex(l => l.id === listingId);
    if (i < 0) return { ok: false, msg: 'That property is no longer for sale.' };
    const l = state.market.listings[i];
    const t = PROPERTY_TYPES[l.type];
    if (!canAct(state)) return { ok: false, msg: 'No action points left this week.' };
    const deposit = Math.round(l.price * t.depositPct);
    if (state.cash < deposit) return { ok: false, msg: `You need $${deposit.toLocaleString()} for the deposit.` };
    state.cash -= deposit;
    state.ap -= 1;
    const loan = l.price - deposit;
    const rate = rateForCredit(state.market.rate, state.credit);
    state.properties.push({
      id: state.nextId++,
      type: l.type, typeName: l.typeName,
      street: l.street, streetName: l.streetName,
      price: l.price, value: l.price,
      mortgage: loan, rate,
      payment: mortgagePayment(loan, rate),
      rent: l.rent, condition: l.condition,
      solar: false, reno: [], vacant: 0, isHome: false,
    });
    state.market.listings.splice(i, 1);
    addLog(state, `Bought a ${l.typeName} on ${l.street} for $${l.price.toLocaleString()} (deposit $${deposit.toLocaleString()}, loan $${loan.toLocaleString()} at ${(rate * 100).toFixed(1)}%). Rent $${l.rent}/week.`, 'action');
    return { ok: true };
  }

  function sellProperty(state, propertyId) {
    const i = state.properties.findIndex(p => p.id === propertyId);
    if (i < 0) return { ok: false, msg: 'Not found.' };
    const p = state.properties[i];
    if (p.isHome) return { ok: false, msg: 'You cannot sell your own home yet.' };
    if (!canAct(state)) return { ok: false, msg: 'No action points left this week.' };
    const sellPrice = Math.round(p.value * 0.97);
    const equity = sellPrice - p.mortgage;
    state.cash += equity;
    state.ap -= 1;
    state.properties.splice(i, 1);
    addLog(state, `Sold your ${p.typeName} on ${p.streetName} for $${sellPrice.toLocaleString()}. You keep the equity: $${equity.toLocaleString()}.`, 'action');
    return { ok: true };
  }

  function renovate(state, propertyId, renoId) {
    const p = state.properties.find(x => x.id === propertyId);
    const r = RENOVATIONS[renoId];
    if (!p || !r || state.over) return { ok: false, msg: 'Not available.' };
    if (p.reno.includes(renoId)) return { ok: false, msg: 'Already done.' };
    if (state.cash < r.cost) return { ok: false, msg: 'Not enough cash.' };
    if (!canAct(state)) return { ok: false, msg: 'No action points left this week.' };
    state.cash -= r.cost;
    state.ap -= 1;
    p.reno.push(renoId);
    p.rent += r.rent;
    p.condition = Math.min(100, p.condition + r.condition);
    p.value += r.value;
    if (renoId === 'solar') p.solar = true;
    addLog(state, `${r.name} done at your ${p.typeName} on ${p.streetName} ($${r.cost.toLocaleString()}).`, 'action');
    return { ok: true };
  }

  function buyBusiness(state, businessId) {
    const b = BUSINESSES[businessId];
    if (!b) return { ok: false, msg: 'Not available.' };
    if (!state.skills.includes('business')) return { ok: false, msg: 'Finish Business Basics first.' };
    if (state.businesses.some(x => x.id === businessId)) return { ok: false, msg: 'You already own one.' };
    if (state.cash < b.cost) return { ok: false, msg: 'Not enough cash.' };
    if (!canAct(state)) return { ok: false, msg: 'No action points left this week.' };
    state.cash -= b.cost;
    state.ap -= 1;
    state.businesses.push({ id: businessId });
    addLog(state, `Bought a ${b.name} for $${b.cost.toLocaleString()}! It earns $${b.income - b.costWeekly} every week.`, 'good');
    return { ok: true };
  }

  function sellBusiness(state, businessId) {
    const i = state.businesses.findIndex(x => x.id === businessId);
    if (i < 0) return { ok: false, msg: 'Not found.' };
    if (!canAct(state)) return { ok: false, msg: 'No action points left this week.' };
    const b = BUSINESSES[businessId];
    state.cash += b.cost;
    state.businesses.splice(i, 1);
    state.ap -= 1;
    addLog(state, `Sold your ${b.name} for $${b.cost.toLocaleString()}.`, 'action');
    return { ok: true };
  }

  function payDebt(state, amount) {
    if (state.debts.length === 0) return { ok: false, msg: 'No debt to pay.' };
    if (!canAct(state)) return { ok: false, msg: 'No action points left this week.' };
    const total = state.debts.reduce((a, d) => a + d.balance, 0);
    const amt = Math.min(Math.round(amount), total, Math.max(0, Math.floor(state.cash)));
    if (amt <= 0) return { ok: false, msg: 'No cash to pay with.' };
    let left = amt;
    for (const d of state.debts) {
      const pay = Math.min(d.balance, left);
      d.balance -= pay;
      left -= pay;
      if (left <= 0) break;
    }
    state.debts = state.debts.filter(d => d.balance > 1);
    state.cash -= amt;
    state.ap -= 1;
    addLog(state, `Paid $${amt.toLocaleString()} off your debts.`, 'action');
    return { ok: true, paid: amt };
  }

  // ---------- end of week ----------
  function endWeek(state) {
    if (state.over) return { ok: false };
    const summary = { week: state.week, income: 0, expenses: 0, cashflow: 0, events: [], courses: [], missed: null, won: false, wealth: 0 };

    // course progress
    if (state.studying) {
      state.studying.weeksLeft -= 1;
      if (state.studying.weeksLeft <= 0) {
        const c = COURSES[state.studying.courseId];
        state.skills.push(c.skill);
        summary.courses.push(c);
        addLog(state, `Course finished: ${c.name}! You can now apply for ${c.unlocks}.`, 'good');
        state.studying = null;
      }
    }

    const rep = weeklyReport(state);
    summary.income = rep.income;
    summary.expenses = rep.expenses;
    summary.cashflow = rep.cashflow;
    summary.wealth = rep.wealth;
    state.cash += rep.cashflow;

    // missed payment?
    if (state.cash < 0) {
      const shortfall = Math.round(-state.cash);
      state.cash = 0;
      state.debts.push({ name: 'Credit Card', balance: shortfall, rate: 0.0025 });
      state.credit = Math.max(1, state.credit - 1);
      state.weeksSinceMiss = 0;
      summary.missed = shortfall;
      addLog(state, `You could not cover your bills! $${shortfall} went onto your credit card and your credit score dropped.`, 'bad');
    } else if (state.weeksSinceMiss >= 4 && state.credit < 5) {
      state.credit += 1;
      state.weeksSinceMiss = 0;
      addLog(state, `Four weeks of on-time payments — your credit score went up to ${state.credit} stars.`, 'good');
    }
    state.weeksSinceMiss += 1;

    // debt interest
    for (const d of state.debts) d.balance = Math.round(d.balance * (1 + d.rate));
    state.debts = state.debts.filter(d => d.balance > 1);

    // property upkeep: condition decay, vacancy, appreciation
    for (const p of state.properties) {
      p.condition = Math.max(5, p.condition - 1);
      if (p.vacant > 0) p.vacant -= 1;
      const street = state.town.find(t => t.name === p.street);
      const g = street ? street.growth : 5;
      p.value = Math.round(p.value * (1 + (g - 3) * 0.0004));
      // natural vacancy
      if (!p.isHome && p.vacant === 0 && chance(state, 0.04)) {
        p.vacant = rint(state, 1, 2);
        addLog(state, `A tenant left your ${p.typeName} on ${p.streetName}.`, 'bad');
      }
    }

    // market refresh
    for (let i = 0; i < state.market.listings.length; i++) {
      if (chance(state, 0.45)) state.market.listings[i] = makeListing(state);
    }
    while (state.market.listings.length < 3) state.market.listings.push(makeListing(state));

    // random event
    if (chance(state, 0.40)) {
      const pool = EVENTS.filter(e => state.week >= e.min);
      if (pool.length) {
        const totalW = pool.reduce((a, e) => a + e.w, 0);
        let roll = rnd(state) * totalW;
        let ev = pool[pool.length - 1];
        for (const e of pool) { roll -= e.w; if (roll <= 0) { ev = e; break; } }
        const res = ev.apply(state);
        if (res) {
          summary.events.push(res);
          addLog(state, res.text, res.kind);
        }
      }
    }

    // win checks
    if (state.mode === 'beginner') {
      if (wealth(state) >= 50000 || state.properties.length >= 3) {
        state.over = true; state.won = true;
        state.winInfo = wealth(state) >= 50000 ? `Total wealth reached $${wealth(state).toLocaleString()}!` : `You own ${state.properties.length} properties!`;
      }
    } else {
      const r = weeklyReport(state);
      if (r.passive >= r.livingCosts && r.passive > 0) {
        state.over = true; state.won = true;
        state.winInfo = `Financial Freedom! Your Money Makers bring in $${r.passive.toLocaleString()} a week, covering all $${r.livingCosts.toLocaleString()} of your bills.`;
      }
    }
    summary.won = state.won;

    state.week += 1;
    state.ap = state.apMax;
    addLog(state, `Week ${summary.week}: income $${summary.income.toLocaleString()}, expenses $${summary.expenses.toLocaleString()}, money left over $${summary.cashflow.toLocaleString()}.`, 'week');
    return summary;
  }

  function fmt(n) {
    const neg = n < 0;
    return (neg ? '-$' : '$') + Math.abs(Math.round(n)).toLocaleString();
  }

  return {
    DATA: { STREET_NAMES, PROPERTY_TYPES, JOBS, COURSES, BUSINESSES, RENOVATIONS },
    generateTown, newGame, makeListing,
    salary, propertyIncome, businessIncome, passiveIncome, expenses, totalIncome, wealth, weeklyReport,
    study, applyJob, buyProperty, sellProperty, renovate, buyBusiness, sellBusiness, payDebt, endWeek,
    mortgagePayment, rateForCredit, fmt,
  };
});
