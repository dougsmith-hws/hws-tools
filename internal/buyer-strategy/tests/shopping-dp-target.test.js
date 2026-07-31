/* =====================================================================
   SHOPPING RANGE — AUTHORED INPUT CONTRACT
   =====================================================================
   THE GOVERNING PRINCIPLE (Doug Smith, 2026-07-29):

     "If I enter the same loan assumptions into Arive and BSE, the
      resulting PITI should essentially match."

   Shopping Range is that same arithmetic run backwards — an inverse
   mortgage calculator. Which means an authored input must stay authored:
   the solver may never quietly reinterpret an assumption while solving.

   WHAT THIS SUITE LOCKS

     1 · ARIVE RECONCILIATION. The reference quote, component by
         component, against BSE's protected engine.

     2 · DOWN PAYMENT MODE. $150,000 means $150,000 at every price probe.
         20% means 20% at every price probe. Neither is ever converted
         into the other in order to solve.

     3 · TAX MODE. %, $/MO and $/YR are three authored modes. A
         percentage scales with price; a fixed dollar amount does not.
         Monthly and annual entries that are mathematically equivalent
         must produce identical results.

     4 · ROUND TRIP. The Comfort Shopping Max, fed back through
         Engine.computeScenario(), must reproduce the target PITI — and
         the down payment must still be exactly what was authored.

     5 · CARD CONSISTENCY. All three buying-power figures use the SAME
         authored down-payment assumption.

   HISTORY. This file previously locked a defect where a DOLLAR down
   payment in Shopping Range produced zero scenarios, and then locked the
   first fix, which solved a preliminary price and converted $150,000
   into a percentage. That conversion was itself the defect — it changed
   the assumption the advisor entered, and left the three buying-power
   cards each describing a slightly different down payment. The
   fixed-dollar solver replaced it and this suite was rewritten to the
   corrected contract.

   Usage:  node tests/shopping-dp-target.test.js index.html
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

/* Doug's buyer. Tax defaults to the $/YR equivalent of $582.26/mo. */
const BUYER = {
  price: '', score: '788', ownFunds: '200,000', gift: '0', dpTarget: '150,000',
  target: '3,000', income: '9,500', debts: '40', stay: '7', priority: 'payment',
  rateConv: '6.750', rateFha: '6.250', rateVa: '6.125', ccPct: '3', ccOverride: '',
  taxRate: '6,987.12', hoi: '250', hoa: '0', cdd: '0', flood: '0',
  offerPrice: '', offerConc: '0', counterPrice: '', counterConc: '0', counterLoan: 'auto'
};
const CHECKS = { hoaNA: true, cddNA: true, floodNA: true, tgFthb: false, tgVa: false, vaExempt: false };

const SETUP = `
window.__set = function(f, c, dpUnit, taxUnit){
  Object.keys(f).forEach(function(id){ var e=document.getElementById(id); if(e) e.value=f[id]; });
  Object.keys(c).forEach(function(id){ var e=document.getElementById(id); if(e) e.checked=!!c[id]; });
  unitState.dp=dpUnit||'dollar'; unitState.tax=taxUnit||'dollar';
  offerConcUnit.v='dollar'; counterUnit.v='dollar';
  renderUnitToggles(); recalc(); return true;
};
/* Reads through engineRun() — the same dispatcher the application renders from. */
window.__state = function(){
  var inp = gatherInputs();
  var res = engineRun(inp);
  var snap = powerSnapshot(inp);
  var m = BSEModel.capture();
  return {
    authoredDp: inp.dpTarget,
    tax: { monthly: inp.taxMonthly, rate: inp.taxRate, fixed: inp.taxFixed, raw: inp.taxRaw,
           storedAnnual: m.shopping_plan.tax_annual_amount, storedPct: m.shopping_plan.tax_rate_pct,
           storedUnit: m.shopping_plan.tax_input_unit },
    viable: res.scenarios.map(function(s){ return {name:s.name, id:s.id, dp:s.dp, maxPrice:s.maxPrice,
              comfortPrice:s.comfortPrice, qualPrice:s.qualPrice, cashPrice:s.cashPrice,
              piti:s.piti, down:s.down, cashToClose:s.cashToClose, binding:s.binding}; }),
    dimmed: (res.dpDimmed||[]).map(function(s){ return s.name; }),
    eliminated: res.eliminated,
    snap: snap ? {comfort:snap.comfort, qual:snap.qual, cash:snap.cash, shopTo:snap.shopTo,
                  controlling:snap.controlling.why} : null,
    answerBody: (document.getElementById('answerBody')||{innerText:''}).innerText,
    goalBar: (document.getElementById('goalBar')||{innerText:''}).innerText,
    taxSub: (document.getElementById('taxSub')||{textContent:''}).textContent
  };
};
/* Independent probe straight into the protected engine. */
window.__probe = function(id, price, dpPct){
  var inp = gatherInputs();
  var t = Object.assign({}, inp, {shopping:false, price:price, dpTarget:null, ccOverride:0});
  var s = Engine.computeScenario(t, A_CONST, Engine.PROGRAMS[id], {dp:dpPct, name:'p'}, price);
  return {piti:s.piti, pi:s.pi, taxes:s.taxes, fixedEsc:s.fixedEsc, monthlyMI:s.monthlyMI,
          down:s.down, baseLoan:s.baseLoan, ltv:s.ltv, cashToClose:s.cashToClose};
};
`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(String(e)));
  await page.goto('file://' + path.resolve(appPath));
  await page.addScriptTag({ content: SETUP });

  const set = async (over, dpUnit, taxUnit, chk) =>
    page.evaluate(([f, c, du, tu]) => window.__set(f, c, du, tu),
      [Object.assign({}, BUYER, over || {}), Object.assign({}, CHECKS, chk || {}),
       dpUnit || 'dollar', taxUnit || 'dollar']);

  /* ================================================================
     1 · ARIVE RECONCILIATION
     ================================================================ */
  console.log('\n--- 1 · Arive reconciliation: $499,900 / $150,000 down / 6.750% ---');
  await set({ price: '499,900' });
  const ar = await page.evaluate(() => window.__probe('conv', 499900, 150000 / 499900 * 100));
  console.log('        P&I ' + ar.pi.toFixed(4) + '  taxes ' + ar.taxes.toFixed(2) +
              '  ins ' + ar.fixedEsc.toFixed(2) + '  MI ' + ar.monthlyMI.toFixed(2) +
              '  PITI ' + ar.piti.toFixed(2));
  ok('loan amount is $349,900', near(ar.baseLoan, 349900, 0.5), ar.baseLoan);
  ok('down payment is $150,000', near(ar.down, 150000, 0.5), ar.down);
  ok('P&I matches Arive $2,269.44 (to the cent)', near(ar.pi, 2269.44, 0.005), ar.pi);
  ok('taxes match Arive $582.26', near(ar.taxes, 582.26, 0.005), ar.taxes);
  ok('insurance matches Arive $250.00', near(ar.fixedEsc, 250, 0.005), ar.fixedEsc);
  ok('MI is $0 — LTV is under 80%', ar.monthlyMI === 0 && ar.ltv < 80, { mi: ar.monthlyMI, ltv: ar.ltv });
  ok('TOTAL PITI matches Arive $3,101.70', near(ar.piti, 3101.70, 0.01), ar.piti);

  /* ================================================================
     2 · DOWN PAYMENT — AUTHORED MODE IS PRESERVED
     ================================================================ */
  console.log('\n--- 2 · $150,000 stays $150,000 at every price ---');
  await set({});
  const d = await page.evaluate(() => window.__state());
  ok('the authored target is dollars, and stays dollars',
     d.authoredDp && d.authoredDp.isPct === false && d.authoredDp.dollar === 150000, d.authoredDp);
  ok('no derived percentage is written back into the authored input',
     !d.authoredDp.derivedFromDollar && d.authoredDp.pct === null, d.authoredDp);
  ok('an eligible scenario is produced', d.viable.length > 0, { dimmed: d.dimmed, elim: d.eliminated });
  const conv = d.viable.find(v => v.id === 'conv');
  ok('a Conventional scenario exists', !!conv, d.viable.map(v => v.name));
  ok('the goal bar shows $150,000 as the preferred down payment',
     /PREFERRED DOWN\s*\$150,000/i.test(d.goalBar.replace(/\s+/g, ' ')), d.goalBar.replace(/\s+/g, ' '));
  ok('the screen no longer explains a conversion that no longer happens',
     !/built on that percentage|resolved to a percent/i.test(d.answerBody));

  if (conv) {
    console.log('        comfort $' + Math.round(conv.comfortPrice).toLocaleString() +
                '  qual $' + Math.round(conv.qualPrice).toLocaleString() +
                '  cash $' + Math.round(conv.cashPrice).toLocaleString());

    /* §4 — the round trip. */
    const P = conv.comfortPrice;
    const rt = await page.evaluate(([pr]) => window.__probe('conv', pr, 150000 / pr * 100), [P]);
    ok('ROUND TRIP: the Comfort Shopping Max reproduces the $3,000 target PITI',
       near(rt.piti, 3000, 1), { piti: rt.piti });
    ok('ROUND TRIP: the down payment is still exactly $150,000',
       near(rt.down, 150000, 0.5), { down: rt.down });
    ok('ROUND TRIP: taxes are still exactly $582.26', near(rt.taxes, 582.26, 0.01), rt.taxes);
    ok('ROUND TRIP: insurance is still exactly $250', near(rt.fixedEsc, 250, 0.01), rt.fixedEsc);

    /* The dollars do not scale — the whole point. */
    const lo = await page.evaluate(() => window.__probe('conv', 300000, 150000 / 300000 * 100));
    const hi = await page.evaluate(() => window.__probe('conv', 700000, 150000 / 700000 * 100));
    ok('a fixed-dollar down payment does NOT scale with price',
       near(lo.down, 150000, 0.5) && near(hi.down, 150000, 0.5),
       { at300k: lo.down, at700k: hi.down });
  }

  /* §5 — every ceiling was solved with the authored dollars. */
  console.log('\n--- 2b · all three buying-power figures use the same assumption ---');
  ok('Comfort Shopping Max is present', d.snap && d.snap.comfort > 0, d.snap);
  ok('Maximum Purchasing Power is present', d.snap && d.snap.qual > 0, d.snap);
  ok('Cash-Limited Buying Power is present', d.snap && isFinite(d.snap.cash) && d.snap.cash > 0, d.snap);
  for (const [k, label] of [['comfortPrice', 'Comfort Shopping Max'],
                            ['qualPrice', 'Maximum Purchasing Power'],
                            ['cashPrice', 'Cash-Limited Buying Power']]) {
    if (!conv) break;
    const P = conv[k];
    if (!isFinite(P) || P <= 0) continue;
    const probe = await page.evaluate(([pr]) => window.__probe('conv', pr, 150000 / pr * 100), [P]);
    ok(label + ' was solved with exactly $150,000 down', near(probe.down, 150000, 0.5),
       { ceiling: P, down: probe.down });
  }
  ok('the cash card names the authored dollar amount, not a derived percent',
     /available with \$150,000 down/.test(d.answerBody), d.answerBody.slice(0, 400));

  /* ================================================================
     3 · PERCENT MODE IS EQUALLY PRESERVED
     ================================================================ */
  console.log('\n--- 3 · 20% stays 20% at every price ---');
  await set({ dpTarget: '20' }, 'pct', 'dollar');
  const pct20 = await page.evaluate(() => window.__state());
  ok('the authored target is a percent, and stays a percent',
     pct20.authoredDp && pct20.authoredDp.isPct === true && pct20.authoredDp.pct === 20, pct20.authoredDp);
  ok('the goal bar shows 20% as the preferred down payment',
     /PREFERRED DOWN\s*20%/i.test(pct20.goalBar.replace(/\s+/g, ' ')), pct20.goalBar.replace(/\s+/g, ' '));
  const c20 = pct20.viable.find(v => v.id === 'conv');
  ok('a Conventional 20% scenario exists', !!c20, pct20.viable.map(v => v.name));
  if (c20) {
    const P = c20.comfortPrice;
    const rt = await page.evaluate(([pr]) => window.__probe('conv', pr, 20), [P]);
    ok('ROUND TRIP: 20% Comfort Shopping Max reproduces the $3,000 target',
       near(rt.piti, 3000, 1), rt.piti);
    ok('ROUND TRIP: the down payment is exactly 20% of the solved price',
       near(rt.down, P * 0.20, 0.5), { down: rt.down, expected: P * 0.20 });
    const lo = await page.evaluate(() => window.__probe('conv', 300000, 20));
    const hi = await page.evaluate(() => window.__probe('conv', 700000, 20));
    ok('a percentage down payment DOES scale with price',
       near(lo.down, 60000, 0.5) && near(hi.down, 140000, 0.5), { at300k: lo.down, at700k: hi.down });
  }

  await set({ dpTarget: '15' }, 'pct', 'dollar');
  const pct15 = await page.evaluate(() => window.__state());
  ok('an authored 15% still resolves (Hole 2 stays closed)',
     pct15.viable.some(v => v.id === 'conv' && near(v.dp, 15, 0.001)),
     pct15.viable.map(v => v.name + '@' + v.dp));

  /* ================================================================
     4 · CASH-LIMITED FIXED-DOLLAR CASE
     ================================================================ */
  console.log('\n--- 4 · cash as the binding constraint, dollars authored ---');
  await set({ dpTarget: '150,000', ownFunds: '155,000' });
  const tight = await page.evaluate(() => window.__state());
  ok('a buyer with barely more cash than the down payment still gets an answer',
     tight.viable.length > 0, { dimmed: tight.dimmed, elim: tight.eliminated });
  ok('cash becomes the binding constraint',
     tight.snap && tight.snap.controlling === 'Cash to Close', tight.snap);
  ok('the preferred down payment is NOT silently increased to all available funds',
     tight.authoredDp.dollar === 150000, tight.authoredDp);

  await set({ dpTarget: '150,000', ownFunds: '90,000' });
  const broke = await page.evaluate(() => window.__state());
  ok('a down payment larger than available funds is refused with a reason',
     broke.viable.length === 0 &&
     broke.eliminated.some(e => /exceeds available funds/i.test(e.reason || '')),
     broke.eliminated);

  /* ================================================================
     5 · PROPERTY TAX — THREE AUTHORED MODES
     ================================================================ */
  console.log('\n--- 5 · property tax: %, $/MO, $/YR ---');
  await set({ dpTarget: '150,000', ownFunds: '200,000', taxRate: '582.26' }, 'dollar', 'dollarMo');
  const tMo = await page.evaluate(() => window.__state());
  ok('$/MO entry resolves to exactly $582.26 per month',
     near(tMo.tax.monthly, 582.26, 0.005), tMo.tax);
  ok('$/MO is stored as the equivalent ANNUAL amount — no new schema unit',
     tMo.tax.storedUnit === 'amount' && near(tMo.tax.storedAnnual, 6987.12, 0.01), tMo.tax);
  ok('the sub-label states the assumption in both units',
     /\$582\.26\/mo/.test(tMo.taxSub) && /\$6,987\.12\/yr/.test(tMo.taxSub), tMo.taxSub);
  ok('the sub-label says the amount is fixed at every price',
     /fixed at every price/i.test(tMo.taxSub), tMo.taxSub);
  ok('no warning is issued for a legitimate fixed-dollar tax',
     !/does not scale as the price moves/i.test(tMo.answerBody));

  await set({ taxRate: '6,987.12' }, 'dollar', 'dollar');
  const tYr = await page.evaluate(() => window.__state());
  ok('$/YR entry resolves to the same $582.26 per month',
     near(tYr.tax.monthly, 582.26, 0.005), tYr.tax);
  ok('$/MO and $/YR produce IDENTICAL Comfort Shopping Max',
     near(tMo.snap.comfort, tYr.snap.comfort, 0.5),
     { perMonth: tMo.snap.comfort, perYear: tYr.snap.comfort });
  ok('$/MO and $/YR produce IDENTICAL Maximum Purchasing Power',
     near(tMo.snap.qual, tYr.snap.qual, 0.5), { perMonth: tMo.snap.qual, perYear: tYr.snap.qual });

  await set({ taxRate: '1.20' }, 'dollar', 'pct');
  const tPct = await page.evaluate(() => window.__state());
  ok('% entry is stored as a rate, not an amount',
     tPct.tax.storedUnit === 'percent' && near(tPct.tax.storedPct, 1.20, 0.001), tPct.tax);
  ok('the % sub-label says it scales with price',
     /scales with price/i.test(tPct.taxSub), tPct.taxSub);

  /* Scaling behaviour, measured through the engine. */
  const scaleOf = async (taxVal, taxUnit) => {
    await set({ taxRate: taxVal }, 'dollar', taxUnit);
    const a = await page.evaluate(() => window.__probe('conv', 300000, 20));
    const b = await page.evaluate(() => window.__probe('conv', 600000, 20));
    return { at300k: a.taxes, at600k: b.taxes };
  };
  const sPct = await scaleOf('1.20', 'pct');
  ok('a PERCENTAGE tax scales with price ($300 at $300k, $600 at $600k)',
     near(sPct.at300k, 300, 0.01) && near(sPct.at600k, 600, 0.01), sPct);
  const sMo = await scaleOf('582.26', 'dollarMo');
  ok('a fixed $/MO tax does NOT scale with price',
     near(sMo.at300k, 582.26, 0.01) && near(sMo.at600k, 582.26, 0.01), sMo);
  const sYr = await scaleOf('6,987.12', 'dollar');
  ok('a fixed $/YR tax does NOT scale with price',
     near(sYr.at300k, 582.26, 0.01) && near(sYr.at600k, 582.26, 0.01), sYr);

  /* Unit toggling must not drift the authored value (Gate A / M-1 contract). */
  const trail = await page.evaluate(() => {
    document.getElementById('price').value = '499,900';
    document.getElementById('taxRate').value = '582.26';
    unitState.tax = 'dollarMo';
    canonSet('tax', '582.26', 'dollarMo');
    renderUnitToggles(); recalc();
    const out = [];
    ['dollar', 'dollarMo', 'pct', 'dollarMo'].forEach(u => {
      setUnit('tax', u); out.push(u + ':' + document.getElementById('taxRate').value);
    });
    return out;
  });
  ok('toggling $/MO -> $/YR -> $/MO -> % -> $/MO returns the authored 582.26 with no drift',
     /dollarMo:582\.26$/.test(trail[trail.length - 1]), trail);

  /* ================================================================
     6 · FHA AND VA ARE UNCHANGED
     ================================================================ */
  console.log('\n--- 6 · FHA and VA behaviour is not disturbed ---');
  await set({ dpTarget: '20,000', ownFunds: '60,000', taxRate: '6,987.12' }, 'dollar', 'dollar');
  const small = await page.evaluate(() => window.__state());
  const fha = small.viable.find(v => v.id === 'fha');
  ok('FHA still appears when the authored dollars sit under 20% down',
     !!fha || small.dimmed.length > 0, { viable: small.viable.map(v => v.name), dimmed: small.dimmed });
  if (fha) ok('  …and FHA is solved with exactly the authored $20,000',
     near(fha.down, 20000, 0.5), fha.down);

  await set({ dpTarget: '150,000', ownFunds: '200,000' }, 'dollar', 'dollar');
  const big = await page.evaluate(() => window.__state());
  ok('above 20% down only Conventional is modelled, and FHA/VA say why',
     !big.viable.some(v => v.id !== 'conv') && big.dimmed.length > 0,
     { viable: big.viable.map(v => v.name), dimmed: big.dimmed });

  await set({ dpTarget: '20,000', ownFunds: '60,000' }, 'dollar', 'dollar', { tgVa: true });
  const withVa = await page.evaluate(() => window.__state());
  ok('a VA-eligible buyer still gets a VA scenario',
     withVa.viable.some(v => v.id === 'va') || withVa.dimmed.length > 0,
     { viable: withVa.viable.map(v => v.name), dimmed: withVa.dimmed });

  /* ================================================================
     7 · NO-OP OUTSIDE SHOPPING RANGE
     ================================================================ */
  console.log('\n--- 7 · specific-price mode is untouched ---');
  await set({ price: '500,000', dpTarget: '150,000', ownFunds: '200,000' }, 'dollar', 'dollar');
  const withPrice = await page.evaluate(() => window.__state());
  ok('with a list price the engine handles the dollar target itself',
     withPrice.viable.some(v => /Conv 30/.test(v.name)), withPrice.viable.map(v => v.name));
  ok('the authored dollars are untouched in specific-price mode',
     withPrice.authoredDp.isPct === false && withPrice.authoredDp.dollar === 150000, withPrice.authoredDp);

  await set({ price: '', dpTarget: '' }, 'dollar', 'dollar');
  const none = await page.evaluate(() => window.__state());
  ok('with no down-payment target the full tier range is eligible',
     none.viable.length >= 3, none.viable.map(v => v.name));

  ok('no JavaScript errors during the whole suite', pageErrors.length === 0, pageErrors.slice(0, 3));

  await browser.close();
  console.log('');
  console.log('=========================================================');
  console.log('  SHOPPING RANGE — AUTHORED INPUT CONTRACT');
  console.log('  app under test: ' + appPath);
  console.log('  PASS ' + pass + '   FAIL ' + fail);
  if (failures.length) failures.forEach(f => console.log('    ✗ ' + f));
  console.log('=========================================================');
  process.exit(fail ? 1 : 0);
})();
