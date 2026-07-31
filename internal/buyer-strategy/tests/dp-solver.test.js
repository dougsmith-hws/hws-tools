/* =====================================================================
   REQUIRED DOWN PAYMENT SOLVER — regression suite      (Phase 4, N-1)
   =====================================================================
   Protects requiredDownForPayment() / requiredDownForProgram(), the
   solver that answers the Fernando question:

     "The house is $461,000 and the buyer wants to keep the payment at
      $3,000. How much does the buyer need to put down?"

   WHAT THIS SUITE ACTUALLY PROVES
   -------------------------------
   1 · ROUND TRIP. Feeding the solved down payment back into
       Engine.computeScenario() reproduces the payment the solver
       reported, to the cent. If the solver ever starts re-deriving the
       mathematics instead of calling the engine, this fails.

   2 · CONSTRAINT MET. The solved payment is at or under the target.

   3 · MINIMALITY. One rounding step LESS down payment overshoots the
       target. Without this, a solver that always answered "put 100% down"
       would pass every other assertion in the file.

   4 · MONOTONICITY. PITI never rises as the down payment rises. This is
       the property bisection depends on; it is asserted, not assumed.

   5 · BAND BEHAVIOUR. The PMI bands (95 / 90 / 85 / 80 LTV) make PITI a
       step function. Solutions landing near a boundary are checked, and
       the "one step further" boundary fact is verified against the engine.

   6 · INFEASIBILITY IS HONEST. When escrow alone exceeds the target, the
       solver says so and returns no down payment, rather than inventing
       one.

   7 · IT DID NOT MOVE ANYTHING. gatherInputs() is captured before and
       after a solve and compared. The solver must be side-effect free.

   Usage:  node tests/dp-solver.test.js index.html
   ===================================================================== */
const path = require('path');
const { chromium } = require('playwright');

const appPath = process.argv[2] || 'index.html';

let pass = 0, fail = 0;
const failures = [];
function ok(label, cond, detail) {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else {
    fail++; failures.push(label);
    console.log('  FAIL  ' + label);
    if (detail !== undefined) console.log('        ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)));
  }
}
const near = (a, b, eps) => Math.abs(a - b) <= (eps === undefined ? 0.01 : eps);

/* Baseline buyer — the same defaults the 47-scenario regression spec uses,
   so any drift here is drift the numerical suite would also see. */
const DEFAULTS = {
  price: '', score: '740', ownFunds: '40,000', gift: '0', dpTarget: '',
  target: '3,200', income: '9,500', debts: '650', stay: '7', priority: 'payment',
  rateConv: '6.750', rateFha: '6.250', rateVa: '6.125', ccPct: '3', ccOverride: '',
  taxRate: '1.20', hoi: '150', hoa: '0', cdd: '0', flood: '0',
  offerPrice: '', offerConc: '0', counterPrice: '', counterConc: '0', counterLoan: 'auto'
};
const CHECKS = { hoaNA: true, cddNA: true, floodNA: true, tgFthb: false, tgVa: false, vaExempt: false };

const SETUP = `
window.__set = function(fields, checks){
  Object.keys(fields).forEach(function(id){ var e=document.getElementById(id); if(e) e.value=fields[id]; });
  Object.keys(checks).forEach(function(id){ var e=document.getElementById(id); if(e) e.checked=!!checks[id]; });
  unitState.dp='pct'; unitState.tax='pct'; offerConcUnit.v='dollar'; counterUnit.v='dollar';
  renderUnitToggles(); recalc();
  return true;
};
/* Probe the engine directly at an arbitrary down payment — the independent
   check the solver's answers are measured against. */
window.__pitiAt = function(progId, price, dpPct){
  var inp = gatherInputs();
  var probe = Object.assign({}, inp, {shopping:false, price:price, dpTarget:null});
  var s = Engine.computeScenario(probe, A_CONST, Engine.PROGRAMS[progId], {dp:dpPct,name:'probe'}, price);
  return { piti:s.piti, pi:s.pi, monthlyMI:s.monthlyMI, escrow:s.escrow, ltv:s.ltv,
           down:s.down, baseLoan:s.baseLoan, cashToClose:s.cashToClose, back:s.back };
};
window.__solve = function(price, target){
  return JSON.parse(JSON.stringify(requiredDownForPayment(gatherInputs(), price, target),
    function(k,v){ return k==='scenario' ? undefined : v; }));
};
window.__inputsSnapshot = function(){ return JSON.stringify(gatherInputs()); };
`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(String(e)));
  await page.goto('file://' + path.resolve(appPath));
  await page.addScriptTag({ content: SETUP });

  const setBuyer = async (over, chk) =>
    page.evaluate(([f, c]) => window.__set(f, c),
      [Object.assign({}, DEFAULTS, over || {}), Object.assign({}, CHECKS, chk || {})]);

  /* ================================================================
     1 · THE FERNANDO CASE — the reason this solver exists
     ================================================================ */
  console.log('\n--- 1 · Fernando: $461,000 property, $3,000/mo target ---');
  await setBuyer({ price: '461,000', target: '3,000', ownFunds: '200,000', income: '11,000', debts: '400' });
  const fern = await page.evaluate(() => window.__solve(461000, 3000));

  ok('Fernando — the solver reaches an answer', fern.feasible === true, fern);
  ok('Fernando — a program is recommended', !!fern.recommended, fern.recommended);

  if (fern.recommended) {
    const r = fern.recommended;
    console.log('        → ' + r.label + '  down ' + Math.round(r.dpDollar).toLocaleString() +
                ' (' + r.dpPct.toFixed(2) + '%)  PITI ' + r.piti.toFixed(2) +
                '  cash to close ' + Math.round(r.cashToClose).toLocaleString());

    ok('Fernando — the payment is at or under $3,000', r.piti <= 3000.005, r.piti);
    ok('Fernando — the required down payment is a positive number below the price',
       r.dpDollar > 0 && r.dpDollar < 461000, r.dpDollar);
    ok('Fernando — $200,000 of funds covers it', r.fundsSufficient === true,
       { cashToClose: r.cashToClose, gap: r.cashGap });

    /* ROUND TRIP — the single most important assertion in this file. */
    const probe = await page.evaluate(([id, p, dp]) => window.__pitiAt(id, p, dp),
                                      [r.id, 461000, r.dpPct]);
    ok('Fernando — ROUND TRIP: computeScenario at the solved down payment reproduces the PITI',
       near(probe.piti, r.piti), { solver: r.piti, engine: probe.piti });
    ok('Fernando — ROUND TRIP: the down payment dollars agree',
       near(probe.down, r.dpDollar, 0.5), { solver: r.dpDollar, engine: probe.down });
    ok('Fernando — ROUND TRIP: cash to close agrees',
       near(probe.cashToClose, r.cashToClose, 0.5), { solver: r.cashToClose, engine: probe.cashToClose });

    /* MINIMALITY — one $100 step less must overshoot. */
    const lessDp = (r.dpDollar - 100) / 461000 * 100;
    const less = await page.evaluate(([id, p, dp]) => window.__pitiAt(id, p, dp), [r.id, 461000, lessDp]);
    ok('Fernando — MINIMALITY: $100 less down payment breaks the target',
       less.piti > 3000.005,
       { at: r.dpDollar, piti: r.piti, at_minus_100: less.piti });
  }

  /* ================================================================
     2 · MONOTONICITY — the property bisection relies on
     ================================================================ */
  console.log('\n--- 2 · PITI is monotonically non-increasing in down payment ---');
  const sweep = [];
  for (let dp = 0; dp <= 60; dp += 2.5) {
    sweep.push(await page.evaluate(([id, p, d]) => window.__pitiAt(id, p, d), ['conv', 461000, dp]));
  }
  let monotone = true, worst = null;
  for (let i = 1; i < sweep.length; i++) {
    if (sweep[i].piti > sweep[i - 1].piti + 0.005) {
      monotone = false;
      worst = { atDp: i * 2.5, prev: sweep[i - 1].piti, curr: sweep[i].piti };
      break;
    }
  }
  ok('conventional PITI never rises as the down payment rises (0–60% in 2.5% steps)', monotone, worst);

  const mi = sweep.map(s => s.monthlyMI);
  ok('mortgage insurance reaches exactly zero at or before 20% down',
     mi[8] === 0, { dp20_monthlyMI: mi[8] });
  ok('mortgage insurance is present below 20% down',
     mi[0] > 0 && mi[4] > 0, { dp0: mi[0], dp10: mi[4] });

  /* ================================================================
     3 · PMI BAND BOUNDARIES — where the step function steps
     ================================================================ */
  console.log('\n--- 3 · behaviour across the 95 / 90 / 85 / 80 LTV boundaries ---');
  for (const [ltv, dp] of [[95, 5], [90, 10], [85, 15], [80, 20]]) {
    const just_above = await page.evaluate(([p, d]) => window.__pitiAt('conv', p, d), [461000, dp - 0.25]);
    const at         = await page.evaluate(([p, d]) => window.__pitiAt('conv', p, d), [461000, dp]);
    ok('LTV ' + ltv + ' boundary (' + dp + '% down) — crossing it does not raise the payment',
       at.piti <= just_above.piti + 0.005,
       { below: just_above.piti, at: at.piti });
  }

  /* A target deliberately placed so the raw solve lands just under 20% down —
     the boundary fact must be reported and must be engine-accurate. */
  await setBuyer({ price: '461,000', target: '3,000', ownFunds: '200,000', income: '11,000', debts: '400' });
  const bfern = await page.evaluate(() => window.__solve(461000, 3000));
  const brec = bfern.recommended;
  if (brec && brec.boundary) {
    const b = brec.boundary;
    const bprobe = await page.evaluate(([id, p, dp]) => window.__pitiAt(id, p, dp), [brec.id, 461000, b.dpPct]);
    ok('the reported boundary payment matches the engine at that down payment',
       near(bprobe.piti, b.piti), { reported: b.piti, engine: bprobe.piti });
    ok('the reported extra cash to reach the boundary is arithmetically consistent',
       near(b.extraCash, b.dpDollar - brec.dpDollar, 0.5), b);
    ok('the reported monthly saving at the boundary is consistent',
       near(b.monthlySaving, brec.piti - b.piti, 0.02), b);
  } else {
    ok('boundary reporting is present when the solution sits below 20% down',
       !brec || brec.dpPct >= 20 || brec.id === 'va',
       brec ? { dpPct: brec.dpPct, id: brec.id, boundary: brec.boundary } : null);
  }

  /* ================================================================
     4 · ALREADY UNDER TARGET AT THE PROGRAM MINIMUM
     ================================================================ */
  console.log('\n--- 4 · a generous target the buyer already clears at minimum down ---');
  await setBuyer({ price: '300,000', target: '6,000', ownFunds: '200,000', income: '20,000', debts: '0' });
  const easy = await page.evaluate(() => window.__solve(300000, 6000));
  ok('a comfortably reachable target is feasible', easy.feasible === true);
  ok('it is flagged as met at the program minimum', !!(easy.recommended && easy.recommended.atMinimum),
     easy.recommended);
  if (easy.recommended) {
    ok('the down payment reported equals the program minimum',
       near(easy.recommended.dpPct, easy.recommended.minDpPct, 0.001),
       { dpPct: easy.recommended.dpPct, minDpPct: easy.recommended.minDpPct });
    const p = await page.evaluate(([id, pr, dp]) => window.__pitiAt(id, pr, dp),
                                  [easy.recommended.id, 300000, easy.recommended.dpPct]);
    ok('ROUND TRIP at the minimum-down answer', near(p.piti, easy.recommended.piti),
       { solver: easy.recommended.piti, engine: p.piti });
  }

  /* ================================================================
     5 · INFEASIBLE — escrow alone exceeds the target
     ================================================================ */
  console.log('\n--- 5 · escrow alone above the target: the honest "no" ---');
  await setBuyer({ price: '600,000', target: '900', ownFunds: '600,000', income: '20,000',
                   debts: '0', taxRate: '2.00', hoi: '400' },
                 { hoaNA: false, cddNA: true, floodNA: true });
  await page.evaluate(() => { document.getElementById('hoa').value = '500'; recalc(); });
  const hard = await page.evaluate(() => window.__solve(600000, 900));
  ok('an unreachable target reports feasible:false', hard.feasible === false, hard);
  ok('the escrow floor is reported', typeof hard.escrowFloor === 'number' && hard.escrowFloor > 900,
     hard.escrowFloor);
  ok('an explanatory note is produced rather than a silent empty result',
     Array.isArray(hard.notes) && hard.notes.length > 0, hard.notes);
  ok('no program invents a down payment',
     hard.programs.every(p => !p.feasible), hard.programs.map(p => ({ id: p.id, feasible: p.feasible })));
  ok('every eligible program reports its floor payment',
     hard.programs.filter(p => p.eligible).every(p => typeof p.floorPITI === 'number'),
     hard.programs.map(p => ({ id: p.id, eligible: p.eligible, floorPITI: p.floorPITI })));

  /* ================================================================
     6 · PROGRAM GATING
     ================================================================ */
  console.log('\n--- 6 · program eligibility is respected ---');
  await setBuyer({ price: '400,000', target: '3,000', ownFunds: '150,000', score: '590',
                   income: '11,000', debts: '300' });
  const lowScore = await page.evaluate(() => window.__solve(400000, 3000));
  const conv = lowScore.programs.find(p => p.id === 'conv');
  const fha = lowScore.programs.find(p => p.id === 'fha');
  const va = lowScore.programs.find(p => p.id === 'va');
  ok('credit 590 — conventional is ineligible', conv && conv.eligible === false, conv);
  ok('credit 590 — the reason names the 620 minimum',
     !!(conv && /620/.test(conv.ineligibleReason || '')), conv && conv.ineligibleReason);
  ok('credit 590 — FHA remains eligible', !!(fha && fha.eligible === true), fha);
  ok('credit 590 — FHA minimum down is 3.5%', !!(fha && near(fha.minDpPct, 3.5, 0.001)), fha && fha.minDpPct);
  ok('VA is ineligible when the toggle is off', !!(va && va.eligible === false), va);
  ok('an ineligible program never becomes the recommendation',
     !lowScore.recommended || lowScore.recommended.eligible === true, lowScore.recommended);

  await setBuyer({ price: '400,000', target: '3,000', ownFunds: '150,000', score: '540',
                   income: '11,000', debts: '300' });
  const vlow = await page.evaluate(() => window.__solve(400000, 3000));
  const fha2 = vlow.programs.find(p => p.id === 'fha');
  ok('credit 540 — FHA minimum down steps up to 10%', !!(fha2 && near(fha2.minDpPct, 10, 0.001)),
     fha2 && fha2.minDpPct);

  await setBuyer({ price: '400,000', target: '3,000', ownFunds: '150,000', income: '11,000', debts: '300' },
                 { tgVa: true });
  const withVa = await page.evaluate(() => window.__solve(400000, 3000));
  const va2 = withVa.programs.find(p => p.id === 'va');
  ok('VA becomes eligible when the toggle is on', !!(va2 && va2.eligible === true), va2);
  ok('VA minimum down is 0%', !!(va2 && va2.minDpPct === 0), va2 && va2.minDpPct);

  /* ================================================================
     7 · FUNDS SHORTFALL IS REPORTED, NOT HIDDEN
     ================================================================ */
  console.log('\n--- 7 · the answer exists but the money does not ---');
  await setBuyer({ price: '461,000', target: '2,400', ownFunds: '30,000', income: '14,000', debts: '200' });
  const shortfall = await page.evaluate(() => window.__solve(461000, 2400));
  ok('a reachable-but-unaffordable target still returns an answer', shortfall.feasible === true, shortfall.feasible);
  if (shortfall.recommended) {
    const r = shortfall.recommended;
    ok('the funds shortfall is flagged', r.fundsSufficient === false, r);
    ok('the gap is quantified and positive', r.cashGap > 0, r.cashGap);
    ok('the gap equals cash to close minus funds',
       near(r.cashGap, r.cashToClose - 30000, 0.5), { cashGap: r.cashGap, cashToClose: r.cashToClose });
    ok('a note explains the shortfall in words',
       shortfall.notes.some(n => /exceeds available funds/.test(n)), shortfall.notes);
  }

  /* ================================================================
     8 · SIDE-EFFECT FREEDOM
     ================================================================ */
  console.log('\n--- 8 · the solver changes nothing ---');
  await setBuyer({ price: '461,000', target: '3,000', ownFunds: '200,000', income: '11,000', debts: '400' });
  const before = await page.evaluate(() => window.__inputsSnapshot());
  await page.evaluate(() => window.__solve(461000, 3000));
  await page.evaluate(() => window.__solve(250000, 1500));
  await page.evaluate(() => window.__solve(900000, 9000));
  const after = await page.evaluate(() => window.__inputsSnapshot());
  ok('gatherInputs() is byte-identical before and after three solves', before === after);

  const domAfter = await page.evaluate(() => ({
    price: document.getElementById('price').value,
    target: document.getElementById('target').value,
    dpTarget: document.getElementById('dpTarget').value
  }));
  ok('the DOM was not touched by the solver',
     domAfter.price === '461,000' && domAfter.target === '3,000' && domAfter.dpTarget === '',
     domAfter);

  /* ================================================================
     9 · GUARD RAILS
     ================================================================ */
  console.log('\n--- 9 · bad input is refused, not guessed ---');
  const noPrice = await page.evaluate(() => window.__solve(0, 3000));
  ok('a zero price returns an error, not a number', !!noPrice.error && noPrice.feasible === false, noPrice);
  const noTarget = await page.evaluate(() => window.__solve(461000, 0));
  ok('a zero target returns an error, not a number', !!noTarget.error && noTarget.feasible === false, noTarget);

  /* ================================================================
     10 · CROSS-PROGRAM SANITY AT A SINGLE TARGET
     ================================================================ */
  console.log('\n--- 10 · every feasible program independently satisfies the target ---');
  await setBuyer({ price: '461,000', target: '3,200', ownFunds: '250,000', income: '12,000', debts: '400' },
                 { tgVa: true });
  const all = await page.evaluate(() => window.__solve(461000, 3200));
  for (const p of all.programs.filter(x => x.feasible)) {
    const probe = await page.evaluate(([id, pr, dp]) => window.__pitiAt(id, pr, dp), [p.id, 461000, p.dpPct]);
    ok(p.label + ' — solved payment matches the engine', near(probe.piti, p.piti),
       { solver: p.piti, engine: probe.piti });
    ok(p.label + ' — solved payment is at or under the $3,200 target', p.piti <= 3200.005, p.piti);
    if (!p.atMinimum) {
      const lessDp = (p.dpDollar - 100) / 461000 * 100;
      const less = await page.evaluate(([id, pr, dp]) => window.__pitiAt(id, pr, dp), [p.id, 461000, lessDp]);
      ok(p.label + ' — $100 less down payment breaks the target', less.piti > 3200.005,
         { at: p.piti, less: less.piti });
    }
  }
  ok('the recommendation is the lowest cash to close among affordable programs',
     (() => {
       const aff = all.programs.filter(p => p.feasible && p.fundsSufficient && p.dtiOk && !p.overLoanLimit);
       if (!aff.length || !all.recommended) return true;
       return aff.every(p => p.cashToClose >= all.recommended.cashToClose - 0.5);
     })(),
     all.programs.filter(p => p.feasible).map(p => ({ id: p.id, cash: p.cashToClose })));

  ok('no JavaScript errors during the whole solver suite', pageErrors.length === 0, pageErrors);

  await browser.close();

  console.log('');
  console.log('=========================================================');
  console.log('  REQUIRED DOWN PAYMENT SOLVER (N-1)');
  console.log('  app under test: ' + appPath);
  console.log('  PASS ' + pass + '   FAIL ' + fail);
  if (failures.length) failures.forEach(f => console.log('    ✗ ' + f));
  console.log('=========================================================');
  process.exit(fail ? 1 : 0);
})();
