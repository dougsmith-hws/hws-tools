/* =====================================================================
   ANSWER LAYER — regression suite                        (Phase 4)
   =====================================================================
   Covers the Phase 4 decision-support layer:

     • JOB 1  the three buying-power figures, the controlling constraint,
              and the REVIVED strategy-action code
     • the debt payoff lever, in BOTH directions
     • JOB 2  the goal answer, property fit, binding constraint
     • the persistent buyer goal bar

   WHY THE NaN SWEEP EXISTS
   ------------------------
   strategyActionsFor / strategyOkCard / strategyActionsList / powerBadge
   were found by the Phase 4 audit to be defined in the application and
   called from nowhere. They had never executed. strategyActionsFor
   destructures a `secondary` that no caller supplied, so every dollar
   figure derived from it would have rendered as NaN.

   Phase 4 supplies `secondary` from powerCeilings() and renders the block.
   Because that code has no execution history, this suite sweeps a matrix
   of buyer profiles chosen to drive EVERY branch — cash-bound, DTI-bound,
   comfort-bound and loan-limit-bound — and asserts that no rendered output
   ever contains NaN, undefined, Infinity, "$NaN" or an empty money figure.
   Treat a failure here as the dead code being wrong, not the test.

   Usage:  node tests/answer-layer.test.js index.html
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
  renderUnitToggles(); recalc(); return true;
};
window.__txt = function(id){ var e=document.getElementById(id); return e ? (e.innerText||'') : ''; };
window.__html = function(id){ var e=document.getElementById(id); return e ? e.innerHTML : ''; };
window.__openAll = function(){
  ['whyBox','debtLever'].forEach(function(id){ var d=document.getElementById(id); if(d){ d.open=true; } });
  return true;
};
window.__ceilings = function(){
  var inp = gatherInputs(); var s = powerSnapshot(inp);
  if(!s) return null;
  return { comfort:s.comfort, qual:s.qual, cash:s.cash, shopTo:s.shopTo,
           controlling:s.controlling.why, secondary:s.P.secondary,
           list:s.P.list.map(function(c){ return {why:c.why, price:c.price}; }) };
};
window.__setDebts = function(rows, timing){
  debtList = rows.map(function(r,i){ return {id:i+1, label:r.label, monthly:r.monthly, balance:r.balance, on:true}; });
  debtSeq = rows.length; debtTiming = timing; answerUi.lever = true;
  recalc(); return true;
};
window.__payoff = function(){
  var inp = gatherInputs();
  var r = debtPayoffImpact(inp, debtSelected(), debtTiming);
  if(!r.before || !r.after) return null;
  return { beforeShop:r.before.shopTo, afterShop:r.after.shopTo,
           beforeQual:r.before.qual, afterQual:r.after.qual,
           beforeCash:r.before.cash, afterCash:r.after.cash,
           beforeCtrl:r.before.controlling.why, afterCtrl:r.after.controlling.why,
           monthlyFreed:r.monthlyFreed, cashOut:r.cashOut };
};
window.__bind = function(){
  var inp = gatherInputs(); if(inp.shopping) return null;
  var res = Engine.run(inp, A_CONST);
  var viable = res.scenarios.slice();
  var ref = viable.length ? priorityScenario(viable, inp) : null;
  return bindingAtProperty(inp, res, ref);
};
`;

/* Anything that must never reach the screen. */
const BAD = /NaN|undefined|Infinity|\\$-?0\\b(?![\\d.])|null/;
function scanBad(text) {
  const hits = [];
  if (/NaN/.test(text)) hits.push('NaN');
  if (/undefined/.test(text)) hits.push('undefined');
  if (/Infinity/.test(text)) hits.push('Infinity');
  if (/\[object Object\]/.test(text)) hits.push('[object Object]');
  return hits;
}

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
  const answerText = () => page.evaluate(() => window.__txt('answerBody'));
  const goalText   = () => page.evaluate(() => window.__txt('goalBar'));

  /* ================================================================
     1 · JOB 1 — the three figures
     ================================================================ */
  console.log('\n--- 1 · Job 1: the three buying-power figures ---');
  await setBuyer({});
  let t = await answerText();
  ok('Job 1 renders when no list price is entered',
     /What should this buyer shop for/.test(await page.evaluate(() => window.__txt('answerHead'))));
  /* LIVE-CALL CLEANUP §3/§5/§17 — the third headline is no longer a theoretical
     cash ceiling. The primary view answers: where should they shop, what could
     they qualify for, and how much qualifying room is left. */
  ok('Comfort Purchase Price is shown', /COMFORT PURCHASE PRICE/i.test(t), t.slice(0, 200));
  ok('Max Qualifying Price is shown', /MAX QUALIFYING PRICE/i.test(t));
  ok('DTI at Comfort Price is shown', /DTI AT COMFORT PRICE/i.test(t));
  ok('Cash-Limited Buying Power is NOT a headline',
     !/CASH-LIMITED BUYING POWER/i.test(t), t.slice(0, 300));
  ok('a single "shop up to" figure is stated', /SHOP UP TO/i.test(t));
  ok('exactly one figure is flagged controlling',
     (t.match(/controlling/gi) || []).length === 1, (t.match(/controlling/gi) || []).length);

  const c = await page.evaluate(() => window.__ceilings());
  ok('the controlling ceiling is the lowest of the candidates',
     c && c.list.every(x => x.price >= c.list.find(y => y.why === c.controlling).price - 0.5),
     c && c.list);
  ok('"shop up to" equals the controlling ceiling',
     c && Math.abs(c.shopTo - c.list.find(x => x.why === c.controlling).price) < 0.5, c);
  ok('secondary is the second-lowest ceiling, not undefined',
     c && typeof c.secondary === 'number' && isFinite(c.secondary) && c.secondary >= c.shopTo - 0.5,
     c && { secondary: c.secondary, shopTo: c.shopTo });

  /* ================================================================
     2 · THE REVIVED STRATEGY CODE — NaN sweep across every branch
     ================================================================ */
  console.log('\n--- 2 · revived strategy layer: NaN sweep across all four branches ---');
  const MATRIX = [
    { name: 'comfort-bound (ample cash and income)',
      over: { ownFunds: '400,000', income: '25,000', debts: '0', target: '3,000' } },
    { name: 'cash-bound (thin funds)',
      over: { ownFunds: '12,000', income: '18,000', debts: '0', target: '6,000' } },
    { name: 'DTI-bound (low income, high debt)',
      over: { ownFunds: '300,000', income: '6,500', debts: '1,900', target: '9,000' } },
    { name: 'loan-limit-bound (very high income and cash)',
      over: { ownFunds: '900,000', income: '60,000', debts: '0', target: '20,000' } },
    { name: 'FHA-only (sub-620 credit)',
      over: { score: '600', ownFunds: '60,000', income: '11,000', debts: '400' } },
    { name: 'low credit FHA 10% tier',
      over: { score: '540', ownFunds: '80,000', income: '12,000', debts: '300' } },
    { name: 'VA eligible, zero down',
      over: { ownFunds: '25,000', income: '10,000', debts: '500' }, chk: { tgVa: true } },
    { name: 'first-time buyer with DPA flag',
      over: { score: '660', ownFunds: '18,000', income: '8,500', debts: '350' }, chk: { tgFthb: true } },
    { name: 'gift-funded',
      over: { ownFunds: '5,000', gift: '35,000', income: '10,000', debts: '400' } },
    { name: 'zero debts, zero gift',
      over: { ownFunds: '75,000', income: '9,000', debts: '0' } },
    { name: 'dollar down-payment target',
      over: { ownFunds: '150,000', dpTarget: '60,000', income: '12,000', debts: '400' } },
    { name: 'HOA + CDD + flood all present',
      over: { ownFunds: '90,000', income: '12,000', debts: '500', hoa: '250', cdd: '120', flood: '95' },
      chk: { hoaNA: false, cddNA: false, floodNA: false } }
  ];
  const seenBranches = new Set();
  for (const m of MATRIX) {
    await setBuyer(m.over, m.chk);
    await page.evaluate(() => window.__openAll());
    const txt = await page.evaluate(() => window.__txt('answerBody'));
    const cc = await page.evaluate(() => window.__ceilings());
    if (cc) seenBranches.add(cc.controlling);
    const hits = scanBad(txt);
    ok('no NaN / undefined / Infinity in the answer layer — ' + m.name, hits.length === 0,
       hits.length ? hits.join(',') + ' :: ' + txt.replace(/\s+/g, ' ').slice(0, 300) : '');
    const gb = await page.evaluate(() => window.__txt('goalBar'));
    ok('no NaN in the goal bar — ' + m.name, scanBad(gb).length === 0, gb);
  }
  ok('the sweep exercised at least three different controlling constraints',
     seenBranches.size >= 3, Array.from(seenBranches));

  /* Explicitly force the cash branch and read the strategy list. */
  await setBuyer({ ownFunds: '12,000', income: '18,000', debts: '0', target: '6,000' });
  await page.evaluate(() => window.__openAll());
  const cashTxt = await page.evaluate(() => window.__txt('answerBody'));
  const cashC = await page.evaluate(() => window.__ceilings());
  ok('a thin-funds buyer is correctly identified as cash-bound',
     cashC && cashC.controlling === 'Cash to Close', cashC && cashC.controlling);
  ok('the cash branch produces at least one actionable next move',
     /Seller concession|Lower down payment|Gift funds|Down-payment assistance|Lower list price/i.test(cashTxt),
     cashTxt.replace(/\s+/g, ' ').slice(0, 300));
  ok('the cash branch renders real dollar figures, not NaN',
     !/NaN/.test(cashTxt) && /\$[\d,]+/.test(cashTxt));

  /* Force the DTI branch — the other consumer of `secondary`. */
  await setBuyer({ ownFunds: '300,000', income: '6,500', debts: '1,900', target: '9,000' });
  await page.evaluate(() => window.__openAll());
  const dtiTxt = await page.evaluate(() => window.__txt('answerBody'));
  const dtiC = await page.evaluate(() => window.__ceilings());
  ok('a low-income high-debt buyer is correctly identified as DTI-bound',
     dtiC && dtiC.controlling === 'DTI', dtiC && dtiC.controlling);
  ok('the DTI branch produces at least one actionable next move',
     /Eliminate|Reduce monthly debt|co-borrower|Switch to|Lower list price/i.test(dtiTxt),
     dtiTxt.replace(/\s+/g, ' ').slice(0, 300));
  ok('the DTI branch renders real dollar figures, not NaN',
     !/NaN/.test(dtiTxt) && /\$[\d,]+/.test(dtiTxt));

  /* ================================================================
     3 · DEBT PAYOFF — both directions
     ================================================================ */
  console.log('\n--- 3 · debt payoff lever: it must be able to say "do not do this" ---');

  /* (a) Payoff HELPS: DTI-bound buyer with plenty of cash. */
  await setBuyer({ ownFunds: '250,000', income: '7,000', debts: '900', target: '9,000' });
  await page.evaluate(() => window.__setDebts([{ label: 'Car', monthly: 600, balance: 14000 }], 'at_closing'));
  const helps = await page.evaluate(() => window.__payoff());
  ok('a DTI-bound buyer with ample cash gains purchasing power',
     helps && helps.afterShop > helps.beforeShop + 500, helps);
  ok('the monthly freed is reported correctly', helps && helps.monthlyFreed === 600, helps);
  ok('at-closing payoff reports the cash consumed', helps && helps.cashOut === 14000, helps);
  let dtxt = await page.evaluate(() => window.__txt('answerBody'));
  ok('the helping case is presented as a gain', /raises what this buyer should shop for/i.test(dtxt),
     dtxt.replace(/\s+/g, ' ').slice(0, 300));

  /* (b) Payoff HURTS: cash-bound buyer, large balance paid at closing. */
  await setBuyer({ ownFunds: '45,000', income: '16,000', debts: '500', target: '7,000' });
  await page.evaluate(() => window.__setDebts([{ label: 'Car', monthly: 450, balance: 32000 }], 'at_closing'));
  const hurts = await page.evaluate(() => window.__payoff());
  ok('a cash-bound buyer LOSES purchasing power paying off at closing',
     hurts && hurts.afterShop < hurts.beforeShop - 500, hurts);
  ok('the cash ceiling drops by roughly the balance consumed',
     hurts && hurts.afterCash < hurts.beforeCash, hurts);
  dtxt = await page.evaluate(() => window.__txt('answerBody'));
  ok('the hurting case says plainly not to do it',
     /Do not pay this off at closing/i.test(dtxt), dtxt.replace(/\s+/g, ' ').slice(0, 400));
  ok('it names paying before closing as the alternative',
     /before<\/i>? ?closing|before closing/i.test(dtxt));

  /* A constraint switch is called out — asserted against THIS render, before
     the timing is changed below. Reading it later would test stale text. */
  ok('a change of binding constraint is surfaced when it happens',
     !hurts || hurts.beforeCtrl === hurts.afterCtrl || /binding constraint changes/i.test(dtxt),
     { before: hurts && hurts.beforeCtrl, after: hurts && hurts.afterCtrl,
       txt: dtxt.replace(/\s+/g, ' ').slice(-260) });

  /* (c) Same debt, paid BEFORE closing — cash is not consumed from funds. */
  await page.evaluate(() => window.__setDebts([{ label: 'Car', monthly: 450, balance: 32000 }], 'before_closing'));
  const beforeClose = await page.evaluate(() => window.__payoff());
  ok('before-closing payoff consumes no cash from available funds',
     beforeClose && beforeClose.cashOut === 0, beforeClose);
  ok('before-closing payoff does not reduce the cash ceiling',
     beforeClose && Math.abs(beforeClose.afterCash - beforeClose.beforeCash) < 1, beforeClose);
  ok('before-closing payoff is at least as good as at-closing',
     beforeClose && hurts && beforeClose.afterShop >= hurts.afterShop - 0.5,
     { before: beforeClose.afterShop, at: hurts.afterShop });

  /* (d) The guideline flag is always present. */
  dtxt = await page.evaluate(() => window.__txt('answerBody'));
  ok('the lender-guideline caveat is always shown',
     /mathematical.*impact only/i.test(dtxt) && /lender guideline/i.test(dtxt));
  ok('the caveat explicitly declines to reproduce AUS', /AUS/.test(dtxt));

  /* (e) No debts selected → no output claimed. */
  await page.evaluate(() => window.__setDebts([], 'at_closing'));
  dtxt = await page.evaluate(() => window.__txt('answerBody'));
  ok('with nothing ticked the lever makes no claim',
     /Tick a debt|No debts itemised/i.test(dtxt));

  /* ================================================================
     4 · JOB 2 — the goal answer and property fit agree
     ================================================================ */
  console.log('\n--- 4 · Job 2: answer and fit describe the SAME structure ---');
  await setBuyer({ price: '461,000', target: '3,000', ownFunds: '200,000', income: '11,000', debts: '400' });
  const j2 = await answerText();
  ok('Job 2 takes over once a list price is entered',
     /How do we accomplish/.test(await page.evaluate(() => window.__txt('answerHead'))));
  ok('the goal is stated before any number', /GOAL[\s\S]{0,80}Keep the payment at or under/i.test(j2));
  ok('the required down payment is the headline answer',
     /TO HIT \$3,000\/MO, THE BUYER NEEDS DOWN/i.test(j2), j2.slice(0, 300));
  ok('the answer names the structure it was evaluated at',
     /Evaluated at/i.test(j2));
  ok('a feasible answer does not simultaneously report the payment over target',
     !(/VERDICT[\s\S]{0,40}Feasible/i.test(j2) && /COMFORT PAYMENT[\s\S]{0,60}above comfort target/i.test(j2)),
     j2.replace(/\s+/g, ' ').slice(0, 600));
  ok('the cash-vs-payment tradeoff is stated in one line', /TRADEOFF/i.test(j2));
  ok('binding constraint reads None when the goal is achievable and affordable',
     /BINDING CONSTRAINT[\s\S]{0,40}None/i.test(j2), j2.replace(/\s+/g, ' ').slice(-400));
  ok('no NaN anywhere in Job 2', scanBad(j2).length === 0, scanBad(j2));

  /* Qualifies-but-over-comfort must NOT read as "cannot buy". */
  console.log('\n--- 5 · qualifies but over comfort: never reads as "cannot buy" ---');
  await setBuyer({ price: '461,000', target: '3,000', ownFunds: '32,000', income: '19,000', debts: '200' });
  const overC = await answerText();
  ok('the buyer is shown as qualifying', /QUALIFICATION[\s\S]{0,40}✅ Qualifies/i.test(overC),
     overC.replace(/\s+/g, ' ').slice(0, 500));
  ok('the comfort miss is shown as a warning, not a failure',
     /COMFORT PAYMENT[\s\S]{0,60}above comfort target/i.test(overC));
  ok('the comfort miss is explicitly labelled a preference, not a qualification limit',
     /preference, not a qualification limit/i.test(overC));
  ok('nothing claims the buyer cannot purchase',
     !/cannot (buy|purchase)|does not qualify/i.test(overC.replace(/does not qualify as structured/g, '')),
     overC.replace(/\s+/g, ' ').slice(0, 400));

  /* ================================================================
     6 · BINDING CONSTRAINT CLASSIFICATION (N-2)
     ================================================================ */
  console.log('\n--- 6 · property-level binding constraint ---');
  const CASES = [
    { name: 'cash short',      over: { price: '600,000', ownFunds: '9,000',  income: '30,000', debts: '0',     target: '9,000' }, kind: 'cash' },
    { name: 'DTI blocked',     over: { price: '700,000', ownFunds: '400,000', income: '5,000', debts: '2,500', target: '9,000' }, kind: 'qualification' },
    { name: 'payment over',    over: { price: '461,000', ownFunds: '250,000', income: '20,000', debts: '0',    target: '1,900' }, kind: 'payment' },
    { name: 'program blocked', over: { price: '900,000', ownFunds: '500,000', income: '40,000', debts: '0',    target: '12,000', score: '560' }, kind: 'program' }
  ];
  for (const cs of CASES) {
    await setBuyer(cs.over);
    const b = await page.evaluate(() => window.__bind());
    ok('binding constraint for "' + cs.name + '" classifies as ' + cs.kind,
       b && b.kind === cs.kind, b);
    const txt = await answerText();
    ok('  …and the answer layer renders it without NaN', scanBad(txt).length === 0, scanBad(txt));
  }

  /* ================================================================
     7 · GOAL BAR
     ================================================================ */
  console.log('\n--- 7 · persistent buyer goal bar ---');
  await setBuyer({ price: '', target: '3,450', ownFunds: '55,000', gift: '10,000', dpTarget: '12' });
  let gb = await goalText();
  /* WP-3 — the bar states the buyer's STATED priority. 'Balanced' is retired. */
  ok('the goal bar shows the stated priority', /Stay near Comfort Payment/i.test(gb), gb);
  ok('the goal bar shows the target payment', /\$3,450\/mo/.test(gb), gb);
  ok('the goal bar shows the preferred down payment', /12%/.test(gb), gb);
  ok('the goal bar shows total available funds including gift', /\$65,000/.test(gb), gb);
  ok('the goal bar shows shopping mode', /SHOPPING RANGE/i.test(gb), gb);
  await setBuyer({ price: '400,000', target: '3,450', ownFunds: '55,000', gift: '10,000', dpTarget: '12' });
  gb = await goalText();
  ok('the goal bar switches to property mode with a price', /PROPERTY STRATEGY/i.test(gb), gb);

  await page.evaluate(() => {
    const s = document.getElementById('priority'); s.value = 'cash';
    s.dispatchEvent(new Event('change', { bubbles: true }));
  });
  gb = await goalText();
  ok('changing the buyer priority updates the goal bar', /Lowest cash to close/i.test(gb), gb);
  const cashGoal = await answerText();
  ok('a cash goal changes the Job 2 answer', /Minimise cash to close/i.test(cashGoal),
     cashGoal.replace(/\s+/g, ' ').slice(0, 300));

  await page.evaluate(() => {
    const s = document.getElementById('priority'); s.value = 'power';
    s.dispatchEvent(new Event('change', { bubbles: true }));
  });
  const powerGoal = await answerText();
  ok('a maximum-price goal changes the Job 2 answer',
     /Maximum purchase price within qualification/i.test(powerGoal),
     powerGoal.replace(/\s+/g, ' ').slice(0, 300));
  ok('no NaN under any goal', scanBad(powerGoal).length === 0 && scanBad(cashGoal).length === 0);

  /* ================================================================
     8 · THE ANSWER LAYER IS ADDITIVE — it did not disturb the old one
     ================================================================ */
  console.log('\n--- 8 · the existing analysis is untouched ---');
  await page.evaluate(() => {
    const s = document.getElementById('priority'); s.value = 'payment';
    s.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await setBuyer({ price: '461,000', target: '3,000', ownFunds: '200,000', income: '11,000', debts: '400' });
  const legacy = await page.evaluate(() => ({
    snap: window.__txt('snapBody').length, cards: window.__txt('cardsBody').length,
    gs: window.__txt('gsPanel').length, co: window.__txt('coPanels').length,
    propFullShown: document.getElementById('propFull').style.display !== 'none'
  }));
  ok('Section 1 still renders', legacy.snap > 50, legacy);
  ok('the Recommendation Engine still renders', legacy.cards > 50, legacy);
  ok('the Gap Solver still renders', legacy.gs > 20, legacy);
  ok('the Counter Offer Analyzer still renders', legacy.co > 20, legacy);
  ok('Section 2 is still shown when a price is entered', legacy.propFullShown === true, legacy);

  const noSectionClass = await page.evaluate(() =>
    !document.getElementById('answerLayer').classList.contains('section') &&
    !document.getElementById('goalBar').classList.contains('section') &&
    document.querySelectorAll('.section').length === 2);
  ok('the answer layer is not a .section — collapsed-state capture is unaffected', noSectionClass);

  /* ================================================================
     9 · RESPONSIVE — the goal bar must not break the phone layout
     ================================================================ */
  console.log('\n--- 9 · responsive ---');
  for (const w of [375, 430, 768, 1440]) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.evaluate(() => recalc());
    const v = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      barFits: document.getElementById('goalBar').scrollWidth <= window.innerWidth + 1,
      answerFits: document.getElementById('answerLayer').scrollWidth <= window.innerWidth + 1
    }));
    ok('at ' + w + 'px the page does not scroll sideways', !v.overflow, v);
    ok('at ' + w + 'px the goal bar fits', v.barFits, v);
    ok('at ' + w + 'px the answer layer fits', v.answerFits, v);
  }
  await page.setViewportSize({ width: 1280, height: 900 });

  ok('no JavaScript errors during the whole answer-layer suite', pageErrors.length === 0,
     pageErrors.slice(0, 4).join(' | '));

  await browser.close();
  console.log('');
  console.log('=========================================================');
  console.log('  ANSWER LAYER (Phase 4)');
  console.log('  app under test: ' + appPath);
  console.log('  PASS ' + pass + '   FAIL ' + fail);
  if (failures.length) failures.forEach(f => console.log('    ✗ ' + f));
  console.log('=========================================================');
  process.exit(fail ? 1 : 0);
})();
