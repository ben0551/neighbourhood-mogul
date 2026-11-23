/* Neighbourhood Mogul — DOM controller. All game rules live in game.js (window.NM). */
(function () {
  'use strict';
  const SAVE_KEY = 'nm-save-v1';
  let G = null;                 // game state
  let currentTab = 'town';
  let seenLog = 0;
  let toastEl = null;

  // kid word -> real finance word
  const TERMS = {
    income: 'Income',
    expenses: 'Expenses',
    leftover: 'Cash Flow',
    makers: 'Assets',
    takers: 'Liabilities',
    wealth: 'Net Worth',
    borrowing: 'Interest',
    goal_freedom: 'Financial Freedom',
  };

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));
  const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------- persistence ----------
  function save() {
    if (!G) return;
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(G)); } catch (e) { /* private mode */ }
  }
  function loadSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      return (s && s.version === 1 && s.town) ? s : null;
    } catch (e) { return null; }
  }
  function clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch (e) {} }

  // ---------- screens ----------
  function show(id) {
    $$('.screen').forEach(s => s.classList.toggle('active', s.id === id));
    window.scrollTo(0, 0);
  }

  function toast(msg) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.style.cssText = 'position:fixed;left:50%;bottom:80px;transform:translateX(-50%);background:#2b2620;color:#fff;padding:10px 16px;border-radius:10px;font-size:14px;z-index:99;max-width:90vw;text-align:center;box-shadow:0 4px 12px rgba(0,0,0,.3)';
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.classList.remove('hidden');
    clearTimeout(toastEl._t);
    toastEl._t = setTimeout(() => toastEl.classList.add('hidden'), 2200);
  }

  // ---------- finance mode labels ----------
  function applyTermLabels() {
    const fin = !!(G && G.financeMode);
    $$('[data-term]').forEach(el => {
      const key = el.getAttribute('data-term');
      if (key === 'leftover') el.textContent = fin ? 'Cash Flow' : 'Money Left Over';
      else if (key === 'makers') el.textContent = fin ? 'Assets' : 'Money Makers';
      else if (key === 'takers') el.textContent = fin ? 'Liabilities' : 'Money Takers';
      else if (key === 'wealth') el.textContent = fin ? 'Net Worth' : 'Total Wealth';
      else if (key === 'borrowing') el.textContent = fin ? 'Interest' : 'Borrowing Cost';
    });
  }
  const L = (key) => {
    const fin = !!(G && G.financeMode);
    if (key === 'leftover') return fin ? 'Cash Flow' : 'Money Left Over';
    if (key === 'makers') return fin ? 'Assets' : 'Money Makers';
    if (key === 'wealth') return fin ? 'Net Worth' : 'Total Wealth';
    return TERMS[key] || key;
  };

  // ---------- HUD ----------
  function renderHud() {
    $('#hud-week').textContent = G.week;
    $('#hud-name').textContent = G.name;
    $('#hud-cash').textContent = NM.fmt(G.cash);
    $('#hud-credit').textContent = '★'.repeat(G.credit) + '☆'.repeat(5 - G.credit);
    $('#chk-finance').checked = !!G.financeMode;

    const rep = NM.weeklyReport(G);
    $('#cf-income').textContent = NM.fmt(rep.income);
    $('#cf-expenses').textContent = NM.fmt(rep.expenses);
    const lo = $('#cf-leftover');
    lo.textContent = (rep.cashflow < 0 ? '-' : '') + '$' + Math.abs(rep.cashflow).toLocaleString();
    $('#cf-leftover-box').classList.toggle('negative', rep.cashflow < 0);
    $('#cf-detail').textContent = `Salary ${NM.fmt(rep.salary)} · Rent ${NM.fmt(rep.property)} · Business ${NM.fmt(rep.business)}`;

    const barwrap = $('#cf-barwrap');
    if (G.mode === 'freedom') {
      barwrap.classList.remove('hidden');
      const pct = rep.livingCosts > 0 ? Math.min(100, Math.round(rep.passive / rep.livingCosts * 100)) : 0;
      $('#cf-barfill').style.width = pct + '%';
      $('#cf-barlabel').textContent = `${L('makers')}: ${NM.fmt(rep.passive)} of ${NM.fmt(rep.livingCosts)} bills covered (${pct}%)`;
      $('#cf-goal').textContent = 'Goal: Money Makers cover all bills';
    } else {
      barwrap.classList.remove('hidden');
      const w = NM.wealth(G);
      const pct = Math.min(100, Math.round(w / 50000 * 100));
      $('#cf-barfill').style.width = pct + '%';
      $('#cf-barlabel').textContent = `Total Wealth: ${NM.fmt(w)} of $50,000 (${pct}%) · Properties: ${G.properties.length} of 3`;
      $('#cf-goal').textContent = 'Goal: $50,000 or 3 properties';
    }

    // action points
    const dots = $('#ap-dots');
    dots.innerHTML = '';
    for (let i = 0; i < G.apMax; i++) {
      const d = document.createElement('span');
      d.className = 'ap-dot' + (i < G.ap ? '' : ' used');
      dots.appendChild(d);
    }
    $('#btn-endweek').disabled = G.over;
  }

  // ---------- tabs ----------
  function renderTab() {
    const body = $('#tab-body');
    if (currentTab === 'town') body.innerHTML = tabTown();
    else if (currentTab === 'places') body.innerHTML = tabPlaces();
    else if (currentTab === 'career') body.innerHTML = tabCareer();
    else if (currentTab === 'money') body.innerHTML = tabMoney();
    else body.innerHTML = tabLog();
    applyTermLabels();
  }

  function renderAll() { renderHud(); renderTab(); }

  // ---------- tab: town ----------
  function tabTown() {
    let html = '<div class="section-title">For sale this week</div>';
    const listings = G.market.listings;
    if (!listings.length) html += '<div class="empty">Nothing for sale right now — check back next week.</div>';
    for (const l of listings) {
      const t = NM.DATA.PROPERTY_TYPES[l.type];
      const deposit = Math.round(l.price * t.depositPct);
      html += `<div class="card">
        <div class="street-head"><h4>⌂ ${esc(l.typeName)}</h4><span class="badge">${esc(l.street)}</span></div>
        <div class="row"><span>Price</span><b>${NM.fmt(l.price)}</b></div>
        <div class="row"><span>Deposit needed (1 − ${Math.round((1 - t.depositPct) * 100)}% loan)</span><b>${NM.fmt(deposit)}</b></div>
        <div class="row"><span>Rent</span><b>${NM.fmt(l.rent)} / week</b></div>
        <div class="row"><span>Condition</span><b>${l.condition}%</b></div>
        <div class="actions"><button class="btn small primary" data-action="buy" data-id="${l.id}">Buy</button></div>
      </div>`;
    }
    html += '<div class="section-title">The neighbourhood</div>';
    for (const st of G.town) {
      const owned = G.properties.filter(p => p.street === st.name);
      const bar = (v, max) => `<span class="score-bar"><i style="width:${Math.round(v / max * 100)}%"></i></span>`;
      html += `<div class="card">
        <div class="street-head"><h4>${esc(st.name)}</h4></div>
        <div class="street-scores">
          <span>Desirability ${bar(st.desirability, 100)}</span>
          <span>School ${bar(st.school, 100)}</span>
          <span>Low crime ${bar(100 - st.crime, 100)}</span>
          <span>Growth ${bar(st.growth, 10)}</span>
        </div>
        ${owned.length ? `<div class="row"><span>You own</span><b>${owned.map(p => esc(p.typeName)).join(', ')}</b></div>` : ''}
      </div>`;
    }
    return html;
  }

  // ---------- tab: places ----------
  function tabPlaces() {
    let html = '<div class="section-title">Your houses</div>';
    for (const p of G.properties) {
      const equity = p.value - p.mortgage;
      html += `<div class="card">
        <div class="street-head"><h4>⌂ ${esc(p.typeName)}</h4><span class="badge">${esc(p.streetName)}</span></div>
        ${p.isHome ? '<div class="row"><span></span><b><span class="badge gold">Your home</span></b></div>' : ''}
        ${p.vacant > 0 ? '<div class="row"><span></span><b><span class="badge warn">Empty — no rent this week</span></b></div>' : ''}
        ${p.solar ? '<div class="row"><span></span><b><span class="badge good">Solar panels −20% power</span></b></div>' : ''}
        <div class="row"><span>Value</span><b>${NM.fmt(p.value)}</b></div>
        <div class="row"><span>${L('takers')} (loan)</span><b>${NM.fmt(p.mortgage)}</b></div>
        <div class="row"><span>Your equity</span><b>${NM.fmt(equity)}</b></div>
        <div class="row"><span>Rent</span><b>${NM.fmt(p.rent)} / week</b></div>
        <div class="row"><span>Weekly loan payment</span><b>${NM.fmt(p.payment)} (${(p.rate * 100).toFixed(1)}%)</b></div>
        <div class="row"><span>Condition</span><b>${p.condition}%</b></div>
        <div class="cond-bar"><i style="width:${p.condition}%"></i></div>
        <div class="actions">
          <button class="btn small" data-action="reno" data-id="${p.id}">Renovate</button>
          ${p.isHome ? '' : `<button class="btn small ghost" data-action="sell" data-id="${p.id}">Sell</button>`}
        </div>
        <div class="reno-panel hidden" id="reno-${p.id}">
          ${Object.values(NM.DATA.RENOVATIONS).map(r => {
            const done = p.reno.includes(r.id);
            const bits = [];
            if (r.rent) bits.push(`+${NM.fmt(r.rent)} rent`);
            if (r.condition) bits.push(`+${r.condition} condition`);
            if (r.powerCut) bits.push(`−${Math.round(r.powerCut * 100)}% power`);
            bits.push(`+${NM.fmt(r.value)} value`);
            return `<div class="row"><span>${esc(r.name)} <small>(${bits.join(', ')})</small></span>
              <b>${done ? '<span class="badge good">Done</span>' : `<button class="btn tiny" data-action="renovate" data-id="${p.id}" data-reno="${r.id}" ${G.cash < r.cost ? 'disabled' : ''}>${NM.fmt(r.cost)}</button>`}</b></div>`;
          }).join('')}
        </div>
      </div>`;
    }
    html += '<div class="section-title">Your businesses</div>';
    if (!G.businesses.length) {
      html += `<div class="empty">No businesses yet. Study <b>Business Basics</b> in the Career tab to unlock them.</div>`;
    }
    for (const b of G.businesses) {
      const d = NM.DATA.BUSINESSES[b.id];
      html += `<div class="card">
        <div class="street-head"><h4>⚙ ${esc(d.name)}</h4><span class="badge good">Money Maker</span></div>
        <div class="row"><span>Income</span><b>${NM.fmt(d.income)} / week</b></div>
        <div class="row"><span>Running costs</span><b>${NM.fmt(d.costWeekly)} / week</b></div>
        <div class="row"><span>Profit</span><b>${NM.fmt(d.income - d.costWeekly)} / week</b></div>
        <div class="actions"><button class="btn small ghost" data-action="sellbiz" data-id="${d.id}">Sell for ${NM.fmt(d.cost)}</button></div>
      </div>`;
    }
    return html;
  }

  // ---------- tab: career ----------
  function tabCareer() {
    const job = G.job ? NM.DATA.JOBS[G.job.id] : null;
    let html = '<div class="section-title">Your job</div>';
    if (G.studying) {
      const c = NM.DATA.COURSES[G.studying.courseId];
      html += `<div class="card"><h4>Studying: ${esc(c.name)}</h4>
        <div class="row"><span>Weeks left</span><b>${G.studying.weeksLeft}</b></div>
        <div class="row"><span>You keep earning your salary while studying.</span><b></b></div></div>`;
    } else if (job) {
      html += `<div class="card"><div class="street-head"><h4>${esc(job.name)}</h4><span class="badge">${esc(job.tier)}</span></div>
        <div class="row"><span>Salary</span><b>${NM.fmt(NM.salary(G))} / week</b></div></div>`;
    } else {
      html += '<div class="empty">You have no job. Apply for one below.</div>';
    }

    html += '<div class="section-title">Courses — spend money now, earn more later</div>';
    for (const c of Object.values(NM.DATA.COURSES)) {
      const done = G.skills.includes(c.skill);
      const studying = G.studying && G.studying.courseId === c.id;
      html += `<div class="card">
        <div class="street-head"><h4>${esc(c.name)}</h4>${done ? '<span class="badge good">Done</span>' : ''}</div>
        <div class="row"><span>Cost</span><b>${NM.fmt(c.cost)}</b></div>
        <div class="row"><span>Time</span><b>${c.weeks} weeks</b></div>
        <div class="row"><span>Unlocks</span><b>${esc(c.unlocks)}</b></div>
        <div class="actions">${done ? '' : `<button class="btn small primary" data-action="study" data-id="${c.id}" ${G.cash < c.cost || G.studying ? 'disabled' : ''}>${studying ? 'Studying…' : 'Study'}</button>`}</div>
      </div>`;
    }

    html += '<div class="section-title">Jobs you can apply for</div>';
    for (const j of Object.values(NM.DATA.JOBS)) {
      const locked = j.skill && !G.skills.includes(j.skill);
      const current = G.job && G.job.id === j.id;
      const course = j.skill ? NM.DATA.COURSES[skillToCourse(j.skill)] : null;
      html += `<div class="card">
        <div class="street-head"><h4>${esc(j.name)}</h4><span class="badge">${esc(j.tier)}</span></div>
        <div class="row"><span>Salary</span><b>${NM.fmt(Math.round(j.salary * (current ? 1 + 0.08 * G.job.raises : 1)))} / week</b></div>
        <div class="row"><span>Requires</span><b>${locked ? '🔒 ' + esc(course ? course.name : '') : 'Nothing'}</b></div>
        <div class="actions">${current ? '<span class="badge good">Current job</span>' : `<button class="btn small primary" data-action="job" data-id="${j.id}" ${locked ? 'disabled' : ''}>Apply</button>`}</div>
      </div>`;
    }

    if (G.skills.includes('business')) {
      html += '<div class="section-title">Businesses you can buy</div>';
      for (const b of Object.values(NM.DATA.BUSINESSES)) {
        const owned = G.businesses.some(x => x.id === b.id);
        html += `<div class="card">
          <div class="street-head"><h4>⚙ ${esc(b.name)}</h4></div>
          <div class="row"><span>Cost</span><b>${NM.fmt(b.cost)}</b></div>
          <div class="row"><span>Profit</span><b>${NM.fmt(b.income - b.costWeekly)} / week</b></div>
          <div class="actions">${owned ? '<span class="badge good">Owned</span>' : `<button class="btn small primary" data-action="buybiz" data-id="${b.id}" ${G.cash < b.cost ? 'disabled' : ''}>Buy</button>`}</div>
        </div>`;
      }
    }
    return html;
  }
  function skillToCourse(skill) {
    for (const k of Object.keys(NM.DATA.COURSES)) if (NM.DATA.COURSES[k].skill === skill) return k;
    return null;
  }

  // ---------- tab: money ----------
  function tabMoney() {
    const rep = NM.weeklyReport(G);
    const d = rep.detail;
    let html = `<div class="section-title">${L('wealth')} breakdown</div>
      <div class="card">
        <div class="row"><span>Cash</span><b>${NM.fmt(G.cash)}</b></div>
        <div class="row"><span>Houses (value − loans)</span><b>${NM.fmt(G.properties.reduce((a, p) => a + p.value - p.mortgage, 0))}</b></div>
        <div class="row"><span>Businesses</span><b>${NM.fmt(G.businesses.reduce((a, b) => a + NM.DATA.BUSINESSES[b.id].cost, 0))}</b></div>
        <div class="row"><span>Debts</span><b>−${NM.fmt(G.debts.reduce((a, x) => a + x.balance, 0))}</b></div>
        <div class="row"><span><b>${L('wealth')}</b></span><b><b>${NM.fmt(rep.wealth)}</b></b></div>
      </div>
      <div class="section-title">Weekly bills</div>
      <div class="card">
        <div class="row"><span>Loan payments</span><b>${NM.fmt(d.mortgage)}</b></div>
        <div class="row"><span>Power</span><b>${NM.fmt(d.power)}</b></div>
        <div class="row"><span>Rates</span><b>${NM.fmt(d.rates)}</b></div>
        <div class="row"><span>Maintenance</span><b>${NM.fmt(d.maintenance)}</b></div>
        <div class="row"><span>Food &amp; living</span><b>${NM.fmt(d.living)}</b></div>
        <div class="row"><span>${L('borrowing')} on debts</span><b>${NM.fmt(d.debtInterest)}</b></div>
        <div class="row"><span><b>Total</b></span><b><b>${NM.fmt(d.total)}</b></b></div>
      </div>
      <div class="section-title">Credit score: ${'★'.repeat(G.credit)}${'☆'.repeat(5 - G.credit)}</div>
      <div class="card">
        <div class="row"><span>Better credit = cheaper loans.</span><b></b></div>
        <div class="row"><span>Miss a payment and it drops.</span><b></b></div>
        <div class="row"><span>4 weeks of on-time payments raises it.</span><b></b></div>
        <div class="row"><span>Bank's interest rate this week</span><b>${(G.market.rate * 100).toFixed(1)}%</b></div>
      </div>
      <div class="section-title">Your debts</div>`;
    if (!G.debts.length) html += '<div class="empty">No debts. Nice!</div>';
    for (const debt of G.debts) {
      html += `<div class="card">
        <div class="row"><span>${esc(debt.name)}</span><b>${NM.fmt(debt.balance)}</b></div>
        <div class="row"><span>${L('borrowing')}</span><b>${(debt.rate * 52 * 100).toFixed(0)}% a year</b></div>
        <div class="actions">
          <button class="btn small primary" data-action="paydebt" data-amt="500" ${G.cash < 100 ? 'disabled' : ''}>Pay $500</button>
          <button class="btn small primary" data-action="paydebt" data-amt="2000" ${G.cash < 100 ? 'disabled' : ''}>Pay $2,000</button>
          <button class="btn small primary" data-action="paydebt" data-amt="999999" ${G.cash < 100 ? 'disabled' : ''}>Pay it all</button>
        </div>
      </div>`;
    }
    return html;
  }

  // ---------- tab: log ----------
  function tabLog() {
    const items = G.log.slice(-60).reverse();
    if (!items.length) return '<div class="empty">Nothing yet.</div>';
    return `<div class="log-list">` + items.map(e =>
      `<div class="log-entry ${esc(e.kind)}"><span class="lw">W${e.week}</span>${esc(e.text)}</div>`
    ).join('') + '</div>';
  }

  // ---------- actions ----------
  function act(fn) {
    const res = fn();
    if (res && res.ok === false) { toast(res.msg || 'Cannot do that.'); return; }
    save();
    renderAll();
  }

  $('#tab-body').addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-action]');
    if (!btn) return;
    const id = btn.getAttribute('data-id');
    const action = btn.getAttribute('data-action');
    if (action === 'buy') act(() => NM.buyProperty(G, Number(id)));
    else if (action === 'sell') act(() => NM.sellProperty(G, Number(id)));
    else if (action === 'reno') {
      const panel = document.getElementById('reno-' + id);
      if (panel) panel.classList.toggle('hidden');
    }
    else if (action === 'renovate') act(() => NM.renovate(G, Number(id), btn.getAttribute('data-reno')));
    else if (action === 'study') act(() => NM.study(G, id));
    else if (action === 'job') act(() => NM.applyJob(G, id));
    else if (action === 'buybiz') act(() => NM.buyBusiness(G, id));
    else if (action === 'sellbiz') act(() => NM.sellBusiness(G, id));
    else if (action === 'paydebt') act(() => NM.payDebt(G, Number(btn.getAttribute('data-amt'))));
  });

  // ---------- end week ----------
  function endWeek() {
    if (G.over) return;
    const summary = NM.endWeek(G);
    save();
    renderAll();
    $('#week-modal-title').textContent = `Week ${summary.week} report`;
    $('#wm-income').textContent = NM.fmt(summary.income);
    $('#wm-expenses').textContent = NM.fmt(summary.expenses);
    const lo = $('#wm-leftover');
    lo.textContent = (summary.cashflow < 0 ? '-' : '') + '$' + Math.abs(summary.cashflow).toLocaleString();
    lo.style.color = summary.cashflow < 0 ? 'var(--red)' : 'var(--green)';
    const ul = $('#wm-events');
    ul.innerHTML = '';
    const items = [];
    if (summary.missed) items.push({ t: `Missed payments! $${summary.missed} went onto your credit card.`, k: 'bad' });
    for (const c of summary.courses) items.push({ t: `Course finished: ${c.name}!`, k: 'good' });
    for (const e of summary.events) items.push({ t: e.text, k: e.kind });
    if (!items.length) items.push({ t: 'A quiet week on the street.', k: '' });
    ul.innerHTML = items.map(i => `<li class="${i.k}">${esc(i.t)}</li>`).join('');
    $('#wm-note').textContent = summary.won ? '' : `Week ${G.week} begins — you have ${G.ap} actions.`;
    $('#modal-week').classList.remove('hidden');
    $('#btn-week-ok').onclick = () => {
      $('#modal-week').classList.add('hidden');
      if (G.over && G.won) showWin();
    };
    if (summary.won) $('#btn-week-ok').textContent = 'See your result →';
    else $('#btn-week-ok').textContent = 'Keep going →';
  }

  function showWin() {
    $('#win-text').textContent = G.winInfo || 'You won!';
    const rep = NM.weeklyReport(G);
    $('#win-stats').innerHTML = `
      <span>Weeks: <b>${G.week - 1}</b></span>
      <span>${L('wealth')}: <b>${NM.fmt(rep.wealth)}</b></span>
      <span>Houses: <b>${G.properties.length}</b></span>
      <span>Money Makers: <b>${NM.fmt(rep.passive)}/wk</b></span>`;
    $('#modal-win').classList.remove('hidden');
    clearSave();
  }

  // ---------- wiring ----------
  function startGame(opts) {
    G = NM.newGame(opts);
    currentTab = 'town';
    seenLog = G.log.length;
    save();
    renderAll();
    show('screen-game');
    $$('.tab').forEach(t => t.classList.toggle('selected', t.dataset.tab === 'town'));
  }

  function init() {
    // title
    const saved = loadSave();
    if (saved && !saved.over) $('#btn-continue').classList.remove('hidden');
    $('#btn-new').onclick = () => { show('screen-setup'); };
    $('#btn-continue').onclick = () => {
      G = loadSave();
      if (!G) { toast('Save not found.'); return; }
      renderAll();
      show('screen-game');
    };
    $('#btn-how').onclick = () => $('#modal-how').classList.remove('hidden');
    $('#btn-how-ok').onclick = () => $('#modal-how').classList.add('hidden');

    // setup
    let mode = 'freedom', jobId = 'shopassistant';
    $('#mode-row').addEventListener('click', (e) => {
      const b = e.target.closest('[data-mode]'); if (!b) return;
      mode = b.dataset.mode;
      $$('#mode-row .choice').forEach(x => x.classList.toggle('selected', x === b));
    });
    $('#job-row').addEventListener('click', (e) => {
      const b = e.target.closest('[data-job]'); if (!b) return;
      jobId = b.dataset.job;
      $$('#job-row .choice').forEach(x => x.classList.toggle('selected', x === b));
    });
    $('#btn-start').onclick = () => {
      const name = $('#inp-name').value.trim() || 'Player';
      clearSave();
      startGame({ name, mode, jobId });
    };
    $('#btn-back').onclick = () => show('screen-title');

    // game
    $$('.tab').forEach(t => t.onclick = () => {
      currentTab = t.dataset.tab;
      $$('.tab').forEach(x => x.classList.toggle('selected', x === t));
      renderTab();
    });
    $('#btn-endweek').onclick = endWeek;
    $('#chk-finance').onchange = (e) => { G.financeMode = e.target.checked; save(); renderAll(); };
    $('#btn-menu').onclick = () => $('#modal-menu').classList.remove('hidden');
    $('#btn-resume').onclick = () => $('#modal-menu').classList.add('hidden');
    $('#btn-restart').onclick = () => {
      $('#modal-menu').classList.add('hidden');
      if (confirm('Restart with a brand new neighbourhood? Your current game will be lost.')) { clearSave(); show('screen-title'); $('#btn-new').click(); }
    };
    $('#btn-quit').onclick = () => { $('#modal-menu').classList.add('hidden'); save(); location.reload(); };
    $('#btn-win-again').onclick = () => { $('#modal-win').classList.add('hidden'); show('screen-title'); $('#btn-new').click(); };
    $('#btn-win-title').onclick = () => { $('#modal-win').classList.add('hidden'); clearSave(); location.reload(); };

    // log badge: count entries added since tab last viewed
    seenLog = G ? G.log.length : 0;
    setInterval(() => {
      if (!G || currentTab === 'log') { seenLog = G ? G.log.length : 0; return; }
      const badge = $('#log-badge');
      const delta = G.log.length - seenLog;
      if (delta > 0 && !$('#modal-week').classList.contains('hidden')) return;
      if (delta > 0) { badge.textContent = delta > 9 ? '9+' : delta; badge.classList.remove('hidden'); }
    }, 800);
    const origRenderTab = renderTab;
    renderTab = function () { origRenderTab(); if (currentTab === 'log') { seenLog = G.log.length; $('#log-badge').classList.add('hidden'); } };
  }

  document.addEventListener('DOMContentLoaded', init);
})();
