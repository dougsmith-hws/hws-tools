/* =====================================================================
   JOB 1 — RATE IMPACT  regression suite
   =====================================================================
   Two buyer questions, one tool:

     PAYMENT IMPACT         same home, same down payment — what does a
                            rate move do to the monthly payment?
     SHOPPING POWER IMPACT  keep the comfort payment fixed — what does
                            the same move do to the shopping range?

   THE REFERENCE STRUCTURE. Job 1's Comfort Shopping Max is
   max(comfortPrice) across the buyer-profile scenario set. The scenario
   owning that maximum is the reference, and the reference price is that
   scenario's own maxPrice — already reduced by the engine to the lowest
   of its comfort / DTI / cash / loan-limit ceilings, so it is a price the
   buyer can actually reach.

   ONLY THE RATE MOVES. Price, authored down payment (dollars or percent),
   program, term, taxes, insurance, HOA, CDD and flood are all held; MI
   recalculates naturally from the unchanged structure.

   SANDBOXED. A custom rate must never reach the rate inputs, the
   canonical model, the three primary cards, or saved state.

   PINNED PROFILE — the manually validated Job 1 buyer:
     credit 788 · funds $200,000 · down $150,000 (dollars) · target
     $3,000/mo · income $9,500 · debts $40 · conv 6.750% · tax $582/mo
     fixed · insurance $250/mo  ->  Comfort Shopping Max $484,259

   Usage:  node tests/job1-rate-impact.test.js index.html
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
    if (detail !== undefined) console.log('        ' + (typeof detail === 'string' ? detail.slice(0, 400) : JSON.stringify(detail).slice(0, 400)));
  }
}
const near = (a, b, eps) => Math.abs(a - b) <= (eps === undefined ? 0.01 : eps);

const PINNED = {
  price: '', score: '788', ownFunds: '200,000', gift: '0', dpTarget: '150,000',
  target: '3,000', income: '9,500', debts: '40', stay: '7', priority: 'payment',
  rateConv: '6.750', rateFha: '6.250', rateVa: '6.125', ccPct: '3', ccOverride: '',
  taxRate: '582', hoi: '250', hoa: '0', cdd: '0', flood: '0',
  offerPrice: '', offerConc: '0', counterPrice: '', counterConc: '0', counterLoan: 'auto'
};
const CHECKS = { hoaNA: true, cddNA: true, floodNA: true, tgFthb: false, tgVa: false, vaExempt: false };

const SETUP = `
window.__set = function(f, c, dpUnit, taxUnit){
  Object.keys(f).forEach(function(id){ var e=document.getElementById(id); if(e) e.value=f[id]; });
  Object.keys(c||{}).forEach(function(id){ var e=document.getElementById(id); if(e) e.checked=!!c[id]; });
  unitState.dp=dpUnit||'dollar'; unitState.tax=taxUnit||'dollarMo';
  answerUi.rate = true; rateTableOpen = true; rateCustom = null; rateCustomRaw = '';
  renderUnitToggles(); recalc(); return true;
};
window.__ref = function(){
  var inp = resolvedInputs(); var r = rateReference(powerSnapshot(inp));
  return r ? { id:r.id, label:r.label, name:r.name, price:r.price, dp:r.dp, down:r.down,
               rate:r.rate, piti:r.piti } : null;
};
window.__rows = function(custom){
  rateCustom = (custom === undefined) ? null : custom;
  var inp = resolvedInputs(); var ref = rateReference(powerSnapshot(inp));
  if(!ref) return null;
  var R = rateScenarios(inp, ref);
  var pack = function(r){ return r ? { rate:r.rate, delta:r.delta, piti:r.piti, monthlyMI:r.monthlyMI,
      down:r.down, comfortPrice:r.comfortPrice, ceiling:r.ceiling, binding:r.binding,
      qualPrice:r.qualPrice, cashPrice:r.cashPrice, eligible:r.eligible,
      isBase:!!r.isBase, isCustom:!!r.isCustom } : null; };
  return { base:pack(R.base), rows:R.rows.map(pack), custom:pack(R.custom), refId:ref.id };
};
/* One row at an arbitrary rate, for scaling / escrow probes. */
window.__row = function(rate){
  var inp = resolvedInputs(); var ref = rateReference(powerSnapshot(inp));
  var r = rateRow(inp, ref, rate);
  var t = Object.assign({}, inp, {shopping:false, price:ref.price, dpTarget:null, ccOverride:0,
            rates: Object.assign({}, inp.rates, (function(o){o[ref.id]=rate;return o;})({}))});
  var s = Engine.computeScenario(t, A_CONST, Engine.PROGRAMS[ref.id], {dp:ref.dp,name:'p'}, ref.price);
  return { piti:r.piti, ceiling:r.ceiling, binding:r.binding, comfortPrice:r.comfortPrice,
           down:s.down, taxes:s.taxes, fixedEsc:s.fixedEsc, monthlyMI:s.monthlyMI,
           baseLoan:s.baseLoan, refPrice:ref.price, refDp:ref.dp };
};
window.__cards = function(){
  var s = powerSnapshot(resolvedInputs());
  return s ? { comfort:s.comfort, qual:s.qual, cash:s.cash, shopTo:s.shopTo,
               controlling:s.controlling.why } : null;
};
window.__state = function(){
  var m = BSEModel.capture();
  return { domRateConv: document.getElementById('rateConv').value,
           domRateFha: document.getElementById('rateFha').value,
           domRateVa: document.getElementById('rateVa').value,
           inpRates: JSON.stringify(resolvedInputs().rates),
           savedRateConv: m.shopping_plan.rate_conv,
           savedRateFha: m.shopping_plan.rate_fha,
           savedRateVa: m.shopping_plan.rate_va,
           fullModel: JSON.stringify(m) };
};
window.__panel = function(){ return (document.getElementById('rateOut')||{innerText:''}).innerText; };
window.__answer = function(){ return (document.getElementById('answerBody')||{innerText:''}).innerText; };
window.__customState = function(){
  var el = document.getElementById('rateCustomIn');
  var inp = resolvedInputs(); var ref = rateReference(powerSnapshot(inp));
  var row = (rateCustom !== null) ? rateRow(inp, ref, rateCustom) : null;
  var tr = document.querySelector('tr.custom');
  var shown = null;
  if (tr && tr.cells.length) {
    var hit = tr.cells[0].innerText.match(/[0-9.]+/);
    shown = hit ? hit[0] : null;
  }
  return { fieldExists: !!el, field: el ? el.value : null,
           focused: document.activeElement ? document.activeElement.id : null,
           stored: rateCustom, raw: rateCustomRaw,
           displayed: shown,
           piti: row ? row.piti : null, ceiling: row ? row.ceiling : null,
           domRateConv: document.getElementById('rateConv').value,
           model: JSON.stringify(BSEModel.capture()) };
};
window.__resetCustom = function(){
  rateCustom = null; rateCustomRaw = '';
  var el = document.getElementById('rateCustomIn');
  if (el) el.value = '';
  refreshRateImpact();
};
window.__pitiAtRate = function(rate){
  var inp = resolvedInputs(); var ref = rateReference(powerSnapshot(inp));
  var t = Object.assign({}, inp, {shopping:false, price:ref.price, dpTarget:null, ccOverride:0,
            rates: Object.assign({}, inp.rates, (function(o){o[ref.id]=rate;return o;})({}))});
  return Engine.computeScenario(t, A_CONST, Engine.PROGRAMS[ref.id], {dp:ref.dp,name:'p'}, ref.price).piti;
};
window.__timing = function(n){
  var t0 = performance.now();
  for (var i=0;i<n;i++) refreshRateImpact();
  return (performance.now()-t0)/n;
};
`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(String(e)));
  await page.goto('file://' + path.resolve(appPath));
  await page.addScriptTag({ content: SETUP });

  const set = async (over, dpUnit, taxUnit, chk) =>
    page.evaluate(([f, c, du, tu]) => window.__set(f, c, du, tu),
      [Object.assign({}, PINNED, over || {}), Object.assign({}, CHECKS, chk || {}),
       dpUnit || 'dollar', taxUnit || 'dollarMo']);

  /* ================================================================
     A · REFERENCE STRUCTURE
     ================================================================ */
  console.log('\n--- A · the reference structure Job 1 already recommends ---');
  await set({});
  const ref = await page.evaluate(() => window.__ref());
  ok('a reference structure is identified', !!ref, ref);
  ok('it is Conventional — the program owning the Comfort Shopping Max',
     ref.id === 'conv', ref);
  ok('the base rate is the Conventional rate already entered (6.750%)',
     near(ref.rate, 6.75, 0.0001), ref.rate);
  ok('the reference price is the Comfort Shopping Max, $484,259',
     near(Math.round(ref.price), 484259, 1), ref.price);
  ok('the reference down payment is exactly the authored $150,000',
     near(ref.down, 150000, 0.5), ref.down);
  ok('the payment at the reference price is the $3,000 target',
     near(ref.piti, 3000, 1), ref.piti);

  /* ================================================================
     B · THE SEVEN AUTOMATIC SCENARIOS  (tests 1–6, 8, 9)
     ================================================================ */
  console.log('\n--- B · automatic rate scenarios ---');
  const R = await page.evaluate(() => window.__rows());
  const deltas = R.rows.map(r => r.delta);
  ok('all seven deltas are offered: −0.500 … +0.500',
     JSON.stringify(deltas) === JSON.stringify([-0.5, -0.25, -0.125, 0, 0.125, 0.25, 0.5]), deltas);
  for (const d of [-0.5, -0.25, -0.125, 0.125, 0.25, 0.5]) {
    const row = R.rows.find(r => near(r.delta, d, 1e-9));
    ok((d > 0 ? '+' : '') + d.toFixed(3) + '% produces a row at ' + (6.75 + d).toFixed(3) + '%',
       !!row && near(row.rate, 6.75 + d, 1e-9), row && row.rate);
  }
  const base = R.rows.find(r => r.isBase);
  ok('the base row is flagged CURRENT and sits at 6.750%',
     base && near(base.rate, 6.75, 1e-9), base && base.rate);
  ok('the base row has ZERO payment difference', near(base.piti - R.base.piti, 0, 0.0001),
     base.piti - R.base.piti);
  ok('the base row reproduces the current Comfort Shopping Max exactly',
     near(Math.round(base.ceiling), 484259, 1), base.ceiling);

  /* ================================================================
     C · DIRECTION  (tests 10–13)
     ================================================================ */
  console.log('\n--- C · direction of every effect ---');
  const sorted = R.rows.slice().sort((a, b) => a.rate - b.rate);
  let payMono = true, shopMono = true;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].piti <= sorted[i - 1].piti) payMono = false;
    if (sorted[i].ceiling >= sorted[i - 1].ceiling) shopMono = false;
  }
  ok('a higher rate always increases the payment on the same structure', payMono,
     sorted.map(r => r.rate.toFixed(3) + ':' + r.piti.toFixed(2)));
  ok('a higher rate always reduces the shopping ceiling', shopMono,
     sorted.map(r => r.rate.toFixed(3) + ':' + Math.round(r.ceiling)));

  const up = R.rows.find(r => near(r.delta, 0.25, 1e-9));
  const dn = R.rows.find(r => near(r.delta, -0.25, 1e-9));
  console.log('        +0.25% -> payment ' + (up.piti - R.base.piti).toFixed(2) +
              '/mo, ceiling ' + Math.round(up.ceiling - R.base.ceiling));
  console.log('        -0.25% -> payment ' + (dn.piti - R.base.piti).toFixed(2) +
              '/mo, ceiling ' + Math.round(dn.ceiling - R.base.ceiling));
  ok('+0.25% raises the payment and lowers buying power',
     up.piti > R.base.piti && up.ceiling < R.base.ceiling, up);
  ok('−0.25% lowers the payment and raises buying power',
     dn.piti < R.base.piti && dn.ceiling > R.base.ceiling, dn);

  /* Round trip: the reported payment must come from the engine. */
  const probeUp = await page.evaluate(() => window.__row(7.0));
  ok('ROUND TRIP: the +0.25% payment matches computeScenario at that rate',
     near(probeUp.piti, up.piti, 0.02), { row: up.piti, engine: probeUp.piti });

  /* ================================================================
     D · CUSTOM RATE  (test 7)
     ================================================================ */
  console.log('\n--- D · custom rate ---');
  const C = await page.evaluate(() => window.__rows(7.125));
  ok('a custom 7.125% produces its own row', !!C.custom && near(C.custom.rate, 7.125, 1e-9), C.custom);
  ok('it is flagged as custom', C.custom.isCustom === true, C.custom);
  ok('its payment sits between the 7.000% and 7.250% rows',
     C.custom.piti > C.rows.find(r => near(r.rate, 7.0, 1e-9)).piti &&
     C.custom.piti < C.rows.find(r => near(r.rate, 7.25, 1e-9)).piti,
     { at7: C.rows.find(r => near(r.rate, 7.0, 1e-9)).piti, custom: C.custom.piti,
       at725: C.rows.find(r => near(r.rate, 7.25, 1e-9)).piti });
  ok('a custom rate equal to the base produces no extra row',
     (await page.evaluate(() => window.__rows(6.75))).custom === null);

  /* ================================================================
     E · SANDBOXED  (tests 19, 20, 21)
     ================================================================ */
  console.log('\n--- E · analysis only: nothing is mutated ---');
  await set({});
  const before = await page.evaluate(() => window.__state());
  const cardsBefore = await page.evaluate(() => window.__cards());
  await page.evaluate(() => window.__rows(8.5));
  await page.evaluate(() => window.__rows(4.25));
  await page.evaluate(() => { rateCustom = 9.99; refreshRateImpact(); });
  const after = await page.evaluate(() => window.__state());
  const cardsAfter = await page.evaluate(() => window.__cards());

  ok('the Conventional rate input is untouched',
     after.domRateConv === before.domRateConv && after.domRateConv === '6.750', after.domRateConv);
  ok('the FHA and VA rate inputs are untouched',
     after.domRateFha === before.domRateFha && after.domRateVa === before.domRateVa, after);
  ok('the resolved engine rates are unchanged', after.inpRates === before.inpRates, after.inpRates);
  ok('the saved model rates are unchanged',
     after.savedRateConv === before.savedRateConv && after.savedRateFha === before.savedRateFha &&
     after.savedRateVa === before.savedRateVa,
     { before: before.savedRateConv, after: after.savedRateConv });
  ok('the ENTIRE canonical model is byte-identical', after.fullModel === before.fullModel);
  ok('Comfort Shopping Max is unchanged', near(cardsBefore.comfort, cardsAfter.comfort, 0.01), cardsAfter.comfort);
  ok('Maximum Purchasing Power is unchanged', near(cardsBefore.qual, cardsAfter.qual, 0.01), cardsAfter.qual);
  ok('Cash-Limited Buying Power is unchanged', near(cardsBefore.cash, cardsAfter.cash, 0.01), cardsAfter.cash);
  ok('SHOP UP TO is unchanged', near(cardsBefore.shopTo, cardsAfter.shopTo, 0.01), cardsAfter.shopTo);
  ok('the panel says the custom rate is analysis only',
     /never changes the buyer/i.test(await page.evaluate(() => window.__panel())));

  /* ================================================================
     F · AUTHORED ASSUMPTIONS HELD  (tests 14–18)
     ================================================================ */
  console.log('\n--- F · only the rate moves ---');
  await set({});
  const lo = await page.evaluate(() => window.__row(6.25));
  const hi = await page.evaluate(() => window.__row(7.25));
  ok('a fixed-dollar down payment stays exactly $150,000 at every rate',
     near(lo.down, 150000, 0.5) && near(hi.down, 150000, 0.5), { lo: lo.down, hi: hi.down });
  ok('the reference price is held constant', near(lo.refPrice, hi.refPrice, 0.001),
     { lo: lo.refPrice, hi: hi.refPrice });
  ok('the loan amount is held constant', near(lo.baseLoan, hi.baseLoan, 0.5),
     { lo: lo.baseLoan, hi: hi.baseLoan });
  ok('a fixed $/MO tax stays $582.00 at every rate',
     near(lo.taxes, 582, 0.01) && near(hi.taxes, 582, 0.01), { lo: lo.taxes, hi: hi.taxes });
  ok('insurance stays $250 at every rate',
     near(lo.fixedEsc, 250, 0.01) && near(hi.fixedEsc, 250, 0.01), { lo: lo.fixedEsc, hi: hi.fixedEsc });

  /* HOA + CDD + flood carried through unchanged. */
  await set({ hoa: '250', cdd: '120', flood: '95' }, 'dollar', 'dollarMo',
            { hoaNA: false, cddNA: false, floodNA: false });
  const feeLo = await page.evaluate(() => window.__row(6.25));
  const feeHi = await page.evaluate(() => window.__row(7.25));
  ok('HOA, CDD and flood carry through and stay constant across rates ($250+$250+$120+$95)',
     near(feeLo.fixedEsc, 715, 0.01) && near(feeHi.fixedEsc, 715, 0.01),
     { lo: feeLo.fixedEsc, hi: feeHi.fixedEsc });

  /* Percentage down payment stays percentage-based and scales with price. */
  await set({ dpTarget: '20' }, 'pct', 'dollarMo');
  const pctRef = await page.evaluate(() => window.__ref());
  const pctLo = await page.evaluate(() => window.__row(6.25));
  const pctHi = await page.evaluate(() => window.__row(7.25));
  ok('a percentage down payment stays 20% of the reference price at every rate',
     near(pctLo.down, pctRef.price * 0.20, 0.5) && near(pctHi.down, pctRef.price * 0.20, 0.5),
     { lo: pctLo.down, hi: pctHi.down, expected: pctRef.price * 0.20 });
  ok('the percentage-mode shopping ceiling still falls as the rate rises',
     pctHi.ceiling < pctLo.ceiling, { lo: pctLo.ceiling, hi: pctHi.ceiling });

  /* Percentage taxes scale with the price being tested. */
  await set({ dpTarget: '150,000', taxRate: '1.20' }, 'dollar', 'pct');
  const taxPctRef = await page.evaluate(() => window.__ref());
  const taxPct = await page.evaluate(() => window.__row(6.75));
  ok('a percentage tax scales with the reference price (1.20% of it, monthly)',
     near(taxPct.taxes, taxPctRef.price * 0.012 / 12, 0.02),
     { taxes: taxPct.taxes, expected: taxPctRef.price * 0.012 / 12 });

  /* ================================================================
     G · ANOTHER CONSTRAINT BECOMING CONTROLLING  (tests 22, 23)
     ================================================================ */
  console.log('\n--- G · when a rate cut runs into a different constraint ---');
  /* Percentage down with modest funds: cash binds before the payment does. */
  await set({ dpTarget: '20', ownFunds: '95,000', income: '30,000', debts: '0', target: '3,000' },
            'pct', 'dollarMo');
  const cashCase = await page.evaluate(() => window.__rows());
  const cashRows = cashCase.rows.filter(r => r.eligible);
  ok('a cash-constrained buyer still produces a full table', cashRows.length === 7, cashRows.length);
  const cashCapped = cashRows.filter(r => r.ceiling < r.comfortPrice - 1);
  ok('cash caps the ceiling below what the payment alone would allow',
     cashCapped.length > 0,
     cashRows.map(r => r.rate.toFixed(3) + ' comfort=' + Math.round(r.comfortPrice) +
                       ' ceiling=' + Math.round(r.ceiling) + ' ' + r.binding));
  ok('  …and the controlling column names Cash to Close',
     cashCapped.every(r => r.binding === 'Cash to Close'), cashCapped.map(r => r.binding));
  const cashPanel = await page.evaluate(() => window.__panel());
  ok('  …and the panel flags that the payment would support more than they can buy',
     /another constraint binds first/i.test(cashPanel), cashPanel.slice(0, 400));

  /* Low income: DTI binds before the payment does. */
  await set({ dpTarget: '150,000', ownFunds: '250,000', income: '6,200', debts: '250', target: '3,000' },
            'dollar', 'dollarMo');
  const dtiCase = await page.evaluate(() => window.__rows());
  const dtiRows = dtiCase.rows.filter(r => r.eligible);
  const dtiCapped = dtiRows.filter(r => r.binding === 'Back-end DTI');
  ok('a low-income buyer shows DTI as the controlling constraint',
     dtiCapped.length > 0,
     dtiRows.map(r => r.rate.toFixed(3) + ' comfort=' + Math.round(r.comfortPrice) +
                      ' ceiling=' + Math.round(r.ceiling) + ' ' + r.binding));
  ok('  …and the reported ceiling never exceeds the qualifying price',
     dtiRows.every(r => r.ceiling <= r.qualPrice + 1),
     dtiRows.map(r => ({ ceiling: Math.round(r.ceiling), qual: Math.round(r.qualPrice) })));

  /* ================================================================
     H · PROGRAM DISCIPLINE  (test 24)
     ================================================================ */
  console.log('\n--- H · rate sensitivity, not program comparison ---');
  await set({ dpTarget: '150,000', ownFunds: '200,000', income: '9,500', debts: '40' });
  const convRows = await page.evaluate(() => window.__rows());
  ok('every row stays on the reference program', convRows.refId === 'conv', convRows.refId);

  /* An FHA-reference buyer must be tested at FHA rates. */
  await set({ score: '600', dpTarget: '20,000', ownFunds: '60,000', income: '9,000', debts: '300' });
  const fhaRef = await page.evaluate(() => window.__ref());
  if (fhaRef) {
    ok('a sub-620 buyer references FHA', fhaRef.id === 'fha', fhaRef);
    ok('  …and the base rate is the FHA rate (6.250%), not the Conventional one',
       near(fhaRef.rate, 6.25, 0.0001), fhaRef.rate);
    const fhaRows = await page.evaluate(() => window.__rows());
    ok('  …and the scenarios stay FHA', fhaRows.refId === 'fha', fhaRows.refId);
    ok('  …and are centred on the FHA rate',
       near(fhaRows.rows.find(r => r.isBase).rate, 6.25, 1e-9),
       fhaRows.rows.find(r => r.isBase).rate);
  } else {
    ok('a sub-620 buyer produces a reference structure', false, 'no reference');
  }

  /* VA when selected by the existing Job 1 logic. */
  await set({ score: '740', dpTarget: '0', ownFunds: '30,000', income: '9,000', debts: '300' },
            'dollar', 'dollarMo', { tgVa: true });
  const vaRef = await page.evaluate(() => window.__ref());
  ok('a VA-eligible zero-down buyer references a program Job 1 selected, at its own rate',
     !!vaRef && ['va', 'conv', 'fha'].indexOf(vaRef.id) >= 0 &&
     near(vaRef.rate, vaRef.id === 'va' ? 6.125 : (vaRef.id === 'fha' ? 6.25 : 6.75), 0.0001), vaRef);

  /* ================================================================
     I · PRESENTATION AND PERFORMANCE
     ================================================================ */
  console.log('\n--- I · presentation and speed ---');
  await set({});
  const panel = await page.evaluate(() => window.__panel());
  ok('the summary leads with the +0.25% answer', /If rates rise 0\.25%/i.test(panel), panel.slice(0, 200));
  ok('and gives the −0.25% answer too', /If rates fall 0\.25%/i.test(panel));
  ok('the summary states both effects in words',
     /on the same home/i.test(panel) && /buying power at the same payment/i.test(panel));
  ok('the reference structure is disclosed', /Reference structure/i.test(panel));
  ok('the detailed table is behind one click', /View rate scenarios/i.test(panel));

  const answer = await page.evaluate(() => window.__answer());
  const order = ['COMFORT SHOPPING MAX', 'MAXIMUM PURCHASING POWER', 'CASH-LIMITED BUYING POWER',
                 'SHOP UP TO', 'How much down to stay at', 'What would a rate change mean',
                 'Debt payoff lever'];
  let last = -1, inOrder = true, bad = null;
  for (const tok of order) {
    const i = answer.indexOf(tok);
    if (i < 0 || i < last) { inOrder = false; bad = tok; break; }
    last = i;
  }
  ok('Rate Impact sits with the other conversation tools, below SHOP UP TO', inOrder,
     bad ? 'out of order at: ' + bad : '');
  /* Count the BADGE ELEMENTS, not the word: the rate table has a legitimate
     "Controlling" column header, which made a text match read as two cards. */
  const primary = await page.evaluate(() => ({
    cards: document.querySelectorAll('#answerBody .pw').length,
    badges: document.querySelectorAll('#answerBody .pw-tag').length }));
  ok('there are still exactly three primary buying-power cards', primary.cards === 3, primary);
  ok('exactly one of them is flagged controlling', primary.badges === 1, primary);
  ok('no charts or sliders were introduced',
     !/<canvas|<svg|type="range"/i.test(await page.evaluate(() => document.getElementById('rateOut').innerHTML)));

  const ms = await page.evaluate(() => window.__timing(20));
  console.log('        full Rate Impact recompute: ' + ms.toFixed(1) + ' ms');
  ok('a full recompute of all seven scenarios stays under 40 ms', ms < 40, ms.toFixed(1) + ' ms');

  /* Closed means not computed. */
  const closedCost = await page.evaluate(() => {
    answerUi.rate = false; recalc();
    const t0 = performance.now(); for (let i = 0; i < 20; i++) recalc();
    const closed = (performance.now() - t0) / 20;
    answerUi.rate = true; recalc();
    const t1 = performance.now(); for (let i = 0; i < 20; i++) recalc();
    return { closed: closed, open: (performance.now() - t1) / 20 };
  });
  console.log('        recalc closed ' + closedCost.closed.toFixed(1) + ' ms · open ' +
              closedCost.open.toFixed(1) + ' ms');
  ok('nothing is computed while Rate Impact is collapsed',
     closedCost.closed < closedCost.open, closedCost);


  /* ================================================================
     J · CUSTOM RATE INPUT PRECISION
     ================================================================
     The control used to sit inside the region refreshRateImpact() rebuilds,
     so every keystroke destroyed and recreated the input: focus was lost
     after the first character and the field was repopulated from the PARSED
     NUMBER, so a typed "6." came back as "6". Typing 6.8125 was impossible.
     The earlier suite set rateCustom directly in JS and never typed, which
     is exactly how the defect shipped — so these assertions type.
     ================================================================ */
  console.log('\n--- J · custom rate accepts four decimals, typed naturally ---');
  await set({});

  /* The typing sequence, character by character. */
  await page.evaluate(() => window.__resetCustom());
  await page.click('#rateCustomIn');
  const seq = [];
  for (const ch of '6.8125') {
    await page.keyboard.type(ch);
    seq.push(await page.evaluate(() => {
      const st = window.__customState();
      return { field: st.field, focused: st.focused, stored: st.stored };
    }));
  }
  ok('the input survives every keystroke — it is never destroyed',
     seq.every(s2 => s2.field !== null), seq.map(s2 => s2.field));
  ok('focus is retained throughout typing',
     seq.every(s2 => s2.focused === 'rateCustomIn'), seq.map(s2 => s2.focused));
  ok('the decimal point is not swallowed: "6." stays "6."',
     seq[1].field === '6.', seq[1]);
  ok('the field shows exactly what was typed at every step',
     JSON.stringify(seq.map(s2 => s2.field)) ===
     JSON.stringify(['6', '6.', '6.8', '6.81', '6.812', '6.8125']),
     seq.map(s2 => s2.field));
  ok('the final stored value is 6.8125, to four decimals',
     seq[5].stored === 6.8125, seq[5].stored);

  /* Every required value, typed fresh, end to end. */
  const VALUES = ['5', '5.5', '6.625', '6.6875', '6.8125', '7.125', '9.9999'];
  for (const v of VALUES) {
    await set({});
    await page.evaluate(() => window.__resetCustom());
    await page.click('#rateCustomIn');
    await page.keyboard.type(v, { delay: 5 });
    const st = await page.evaluate(() => window.__customState());
    const want = parseFloat(v);
    ok(v + '% can be typed and is stored exactly', st.stored === want, st);
    ok('  …the field holds the literal text "' + v + '"', st.field === v, st.field);
    ok('  …it is displayed at its authored precision',
       st.displayed !== null && parseFloat(st.displayed) === want,
       { displayed: st.displayed, want: want });
    const enginePiti = await page.evaluate(r => window.__pitiAtRate(r), want);
    ok('  …the payment is computed at exactly ' + v + '% (engine round trip)',
       near(st.piti, enginePiti, 0.005), { row: st.piti, engine: enginePiti });
    ok('  …buying power is a real figure at that rate', st.ceiling > 0, st.ceiling);
    ok('  …the buyer\u2019s Conventional rate is untouched', st.domRateConv === '6.750', st.domRateConv);
  }

  /* Neighbouring four-decimal rates must produce DIFFERENT results — proof the
     precision is not being rounded away somewhere downstream. */
  const p1 = await page.evaluate(() => window.__pitiAtRate(6.8125));
  const p2 = await page.evaluate(() => window.__pitiAtRate(6.8130));
  const p3 = await page.evaluate(() => window.__pitiAtRate(6.875));
  ok('6.8125% and 6.8130% produce different payments — nothing rounds to 3dp',
     Math.abs(p1 - p2) > 0.001, { at68125: p1, at68130: p2 });
  ok('6.8125% is NOT silently snapped to 6.875%', Math.abs(p1 - p3) > 0.1,
     { at68125: p1, at6875: p3 });

  /* Sandbox guarantees, re-checked after real typing. */
  await set({});
  const beforeType = await page.evaluate(() => window.__customState());
  const cardsPre = await page.evaluate(() => window.__cards());
  await page.click('#rateCustomIn');
  await page.keyboard.type('9.9999', { delay: 5 });
  const afterType = await page.evaluate(() => window.__customState());
  const cardsPost = await page.evaluate(() => window.__cards());
  ok('typing a custom rate leaves the canonical model byte-identical',
     afterType.model === beforeType.model);
  ok('  …leaves the Conventional rate input at 6.750', afterType.domRateConv === '6.750', afterType.domRateConv);
  ok('  …leaves Comfort Shopping Max unchanged', near(cardsPre.comfort, cardsPost.comfort, 0.01), cardsPost.comfort);
  ok('  …leaves Maximum Purchasing Power unchanged', near(cardsPre.qual, cardsPost.qual, 0.01), cardsPost.qual);
  ok('  …leaves Cash-Limited Buying Power unchanged', near(cardsPre.cash, cardsPost.cash, 0.01), cardsPost.cash);
  ok('  …leaves SHOP UP TO unchanged', near(cardsPre.shopTo, cardsPost.shopTo, 0.01), cardsPost.shopTo);
  const savedFields = await page.evaluate(() => Object.keys(BSEState.capture().fields));
  ok('  …and the hypothetical rate is never captured for autosave',
     savedFields.indexOf('rateCustomIn') < 0, savedFields.filter(k => /rate/i.test(k)));

  /* The seven automatic scenarios are unaffected by a custom rate. */
  const autoWith = await page.evaluate(() => window.__rows(6.8125));
  await page.evaluate(() => window.__resetCustom());
  const autoWithout = await page.evaluate(() => window.__rows());
  ok('the seven automatic rows are identical with and without a custom rate',
     JSON.stringify(autoWith.rows.map(r => [r.rate, Math.round(r.piti * 100), Math.round(r.ceiling)])) ===
     JSON.stringify(autoWithout.rows.map(r => [r.rate, Math.round(r.piti * 100), Math.round(r.ceiling)])));

  /* Clearing the field removes the custom row. */
  await page.click('#rateCustomIn');
  await page.keyboard.type('7.125', { delay: 5 });
  const hasCustom = await page.evaluate(() => rateCustom);
  await page.evaluate(() => { const el = document.getElementById('rateCustomIn'); el.value = '';
    el.dispatchEvent(new Event('input', { bubbles: true })); });
  const clearedCustom = await page.evaluate(() => rateCustom);
  ok('clearing the field removes the custom rate', hasCustom === 7.125 && clearedCustom === null,
     { before: hasCustom, after: clearedCustom });

  ok('no JavaScript errors during the whole suite', pageErrors.length === 0, pageErrors.slice(0, 3));

  await browser.close();
  console.log('');
  console.log('=========================================================');
  console.log('  JOB 1 — RATE IMPACT');
  console.log('  app under test: ' + appPath);
  console.log('  PASS ' + pass + '   FAIL ' + fail);
  if (failures.length) failures.forEach(f => console.log('    ✗ ' + f));
  console.log('=========================================================');
  process.exit(fail ? 1 : 0);
})();
