/* =====================================================================
   JOB 1 — "WHAT IF THEY WANT TO SPEND MORE?"  regression suite
   =====================================================================
   The inverse of the Shopping Range answer:

     Shopping Range  down payment + comfort payment -> what price?
     This what-if    desired price  + comfort payment -> what down payment?

   It reuses requiredDownForPayment() — the Fernando solver — unchanged.
   There is no second solver, and the solver still probes
   Engine.computeScenario() rather than reproducing mortgage mathematics.

   WHAT THIS SUITE PROTECTS

     • the answer is the REQUIRED DOWN PAYMENT, and it round-trips
     • down payment and cash to close are never conflated: having enough
       for the down payment does not mean the deal is fundable
     • three INDEPENDENT verdicts — payment target, qualification, funds
     • every assumption on screen flows through (tax mode, HOA/CDD/flood,
       MI thresholds, credit, income, debts, closing-cost %)
     • the three Shopping Range cards are completely unaffected

   PINNED CASE — the profile Doug verified by hand on 2026-07-29:
     credit 788 · funds $200,000 · preferred down $150,000 (dollars)
     target $3,000/mo · income $9,500 · debts $40 · conv 6.750%
     property tax $582/mo fixed · insurance $250/mo
   ->  Comfort Shopping Max $484,259 · Maximum Purchasing Power $674,670
       Cash-Limited Buying Power $1,816,667 · controlling: Comfort Payment

   Usage:  node tests/job1-whatif.test.js index.html
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

/* The verified profile. */
const VERIFIED = {
  price: '', score: '788', ownFunds: '200,000', gift: '0', dpTarget: '150,000',
  target: '3,000', income: '9,500', debts: '40', stay: '7', priority: 'payment',
  rateConv: '6.750', rateFha: '6.250', rateVa: '6.125', ccPct: '3', ccOverride: '',
  taxRate: '582', hoi: '250', hoa: '0', cdd: '0', flood: '0',
  offerPrice: '', offerConc: '0', counterPrice: '', counterConc: '0', counterLoan: 'auto'
};
const CHECKS = { hoaNA: true, cddNA: true, floodNA: true, tgFthb: false, tgVa: false, vaExempt: false };

const SETUP = `
window.__set = function(f, c, taxUnit){
  Object.keys(f).forEach(function(id){ var e=document.getElementById(id); if(e) e.value=f[id]; });
  Object.keys(c).forEach(function(id){ var e=document.getElementById(id); if(e) e.checked=!!c[id]; });
  unitState.dp='dollar'; unitState.tax=taxUnit||'dollarMo';
  offerConcUnit.v='dollar'; counterUnit.v='dollar';
  answerUi.whatif = true;
  renderUnitToggles(); recalc(); return true;
};
window.__ask = function(price){
  whatIfPrice = price; refreshWhatIf();
  var inp = resolvedInputs();
  var sol = requiredDownForPayment(whatIfInputs(inp), price, inp.target);
  var r = sol.recommended;
  return {
    feasible: sol.feasible, escrowFloor: sol.escrowFloor,
    rec: r ? { id:r.id, label:r.label, dpDollar:r.dpDollar, dpPct:r.dpPct, piti:r.piti,
               closing:r.closing, cashToClose:r.cashToClose, cashRemaining:r.cashRemaining,
               cashGap:r.cashGap, fundsSufficient:r.fundsSufficient, dtiOk:r.dtiOk,
               back:r.back, backLimit:r.backLimit, overLoanLimit:r.overLoanLimit,
               monthlyMI:r.monthlyMI, atMinimum:r.atMinimum, eligible:r.eligible } : null,
    out: (document.getElementById('whatIfOut')||{innerText:''}).innerText
  };
};
window.__cards = function(){
  var snap = powerSnapshot(resolvedInputs());
  return snap ? {comfort:snap.comfort, qual:snap.qual, cash:snap.cash,
                 shopTo:snap.shopTo, controlling:snap.controlling.why} : null;
};
window.__probe = function(id, price, dpPct){
  var inp = resolvedInputs();
  var t = Object.assign({}, inp, {shopping:false, price:price, dpTarget:null, ccOverride:0});
  var s = Engine.computeScenario(t, A_CONST, Engine.PROGRAMS[id], {dp:dpPct, name:'p'}, price);
  return {piti:s.piti, down:s.down, baseLoan:s.baseLoan, taxes:s.taxes, fixedEsc:s.fixedEsc,
          monthlyMI:s.monthlyMI, ltv:s.ltv, cashToClose:s.cashToClose, back:s.back};
};
window.__answerText = function(){ return (document.getElementById('answerBody')||{innerText:''}).innerText; };
`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(String(e)));
  await page.goto('file://' + path.resolve(appPath));
  await page.addScriptTag({ content: SETUP });

  const set = async (over, taxUnit, chk) =>
    page.evaluate(([f, c, tu]) => window.__set(f, c, tu),
      [Object.assign({}, VERIFIED, over || {}), Object.assign({}, CHECKS, chk || {}), taxUnit || 'dollarMo']);
  const ask = price => page.evaluate(p => window.__ask(p), price);

  /* ================================================================
     12 · THE THREE SHOPPING RANGE CARDS ARE UNCHANGED  (checked FIRST)
     ================================================================ */
  console.log('\n--- 12 · the verified profile still produces the verified numbers ---');
  await set({});
  const before = await page.evaluate(() => window.__cards());
  ok('Comfort Shopping Max is still $484,259', near(Math.round(before.comfort), 484259, 1), before.comfort);
  ok('Maximum Purchasing Power is still $674,670', near(Math.round(before.qual), 674670, 1), before.qual);
  /* INTENTIONAL PIN CHANGE, 2026-07-29, approved.
     Was $605,219 — the percentage-derived figure, which treated the authored
     $150,000 as 31% of whatever price came out. That answered a question the
     buyer never asked. The card now reads the same authored-dollar ceiling the
     binding-constraint logic already used:
         $150,000 + ($200,000 - $150,000) / 3% = $1,816,667
     With a fixed-dollar down payment the down payment does NOT grow with price
     — only closing costs do — so cash genuinely stops constraining, and the
     card says so. No engine or cash calculation changed; only the wiring that
     fed the card. Comfort Shopping Max and Maximum Purchasing Power are
     unaffected. */
  ok('Cash-Limited Buying Power is the authored-dollar ceiling, $1,816,667',
     near(Math.round(before.cash), 1816667, 1), before.cash);
  ok('the controlling constraint is still Comfort Payment', before.controlling === 'Comfort Payment', before);

  await ask(500000);
  const after = await page.evaluate(() => window.__cards());
  ok('using the what-if does not move Comfort Shopping Max', near(before.comfort, after.comfort, 0.01), after.comfort);
  ok('using the what-if does not move Maximum Purchasing Power', near(before.qual, after.qual, 0.01), after.qual);
  ok('using the what-if does not move Cash-Limited Buying Power', near(before.cash, after.cash, 0.01), after.cash);

  /* ================================================================
     1 · DESIRED PRICE ABOVE THE COMFORT SHOPPING MAX  (the pinned case)
     ================================================================ */
  console.log('\n--- 1 · $500,000, above the $484,259 comfort max ---');
  const a = await ask(500000);
  ok('the case is feasible', a.feasible === true, a);
  ok('a recommendation is produced', !!a.rec, a);
  if (a.rec) {
    const r = a.rec;
    console.log('        required down $' + Math.round(r.dpDollar).toLocaleString() +
                ' (' + r.dpPct.toFixed(1) + '%)  cash to close $' + Math.round(r.cashToClose).toLocaleString() +
                '  reserve $' + Math.round(r.cashRemaining).toLocaleString());
    ok('the payment lands at or under the $3,000 target', r.piti <= 3000.005, r.piti);
    ok('the required down payment exceeds the $150,000 they planned',
       r.dpDollar > 150000, r.dpDollar);
    ok('the required down payment is less than the price', r.dpDollar < 500000, r.dpDollar);

    /* ROUND TRIP through the protected engine. */
    const probe = await page.evaluate(([id, pr, dp]) => window.__probe(id, pr, dp),
                                      [r.id, 500000, r.dpPct]);
    ok('ROUND TRIP: computeScenario reproduces the payment', near(probe.piti, r.piti, 0.02),
       { solver: r.piti, engine: probe.piti });
    ok('ROUND TRIP: the down payment agrees', near(probe.down, r.dpDollar, 0.5), probe.down);
    ok('ROUND TRIP: cash to close agrees', near(probe.cashToClose, r.cashToClose, 0.5), probe.cashToClose);
    ok('the loan amount equals price minus the required down',
       near(500000 - r.dpDollar, probe.baseLoan, 0.5), probe.baseLoan);

    /* MINIMALITY — the answer is the LEAST down payment that works. */
    const less = await page.evaluate(([id, pr, dp]) => window.__probe(id, pr, dp),
                                     [r.id, 500000, (r.dpDollar - 100) / 500000 * 100]);
    ok('$100 less down breaks the target — the answer is minimal', less.piti > 3000.005,
       { at: r.piti, less: less.piti });

    ok('the screen leads with the required down payment', /REQUIRED DOWN PAYMENT/i.test(a.out));
    /* CONDENSING §4 — the duplicate detail block is gone from Job 1. Cash to
       close, the loan amount, reserves and the qualification ticks belong to
       Property Strategy, where there is a property under offer; on a live call
       the required down payment and the required rate are the answer. The
       FIGURES are still asserted above, straight off the solver. */
    ok('cash to close is no longer duplicated in the Job 1 view',
       !/ESTIMATED CASH TO CLOSE/i.test(a.out), a.out.slice(0, 300));
    ok('nor is the loan amount', !/LOAN AMOUNT/i.test(a.out), a.out.slice(0, 300));
    ok('the screen gives context against the shop-to figure',
       /above the \$484,259 they should shop to/i.test(a.out), a.out.slice(0, 160));
  }

  /* ================================================================
     2 · DESIRED PRICE EQUAL TO THE COMFORT SHOPPING MAX
     ================================================================ */
  console.log('\n--- 2 · desired price == Comfort Shopping Max ---');
  const eq = await ask(Math.round(before.comfort));
  ok('at the comfort max the case is feasible', eq.feasible === true, eq);
  if (eq.rec) {
    ok('the required down payment is essentially the preferred $150,000',
       Math.abs(eq.rec.dpDollar - 150000) <= 200, eq.rec.dpDollar);
    ok('the payment is at the target', near(eq.rec.piti, 3000, 1.5), eq.rec.piti);
    ok('funds are sufficient at the comfort max', eq.rec.fundsSufficient === true, eq.rec);
  }

  /* ================================================================
     3 · DESIRED PRICE BELOW THE COMFORT SHOPPING MAX
     ================================================================ */
  console.log('\n--- 3 · $400,000, below the comfort max ---');
  const lo = await ask(400000);
  ok('a cheaper property is feasible', lo.feasible === true, lo);
  if (lo.rec) {
    ok('less down is required than at the comfort max', lo.rec.dpDollar < 150000, lo.rec.dpDollar);
    ok('the payment still lands at or under target', lo.rec.piti <= 3000.005, lo.rec.piti);
    ok('the context line says it is below the shop-to figure',
       /below the \$484,259 they should shop to/i.test(lo.out), lo.out.slice(0, 160));
  }

  /* ================================================================
     4 & 5 · FUNDS SUFFICIENT vs SUFFICIENT-FOR-THE-DOWN-PAYMENT-ONLY
     ================================================================ */
  console.log('\n--- 4/5 · the down payment is not the same as cash to close ---');
  await set({});
  const base = await ask(500000);
  ok('with $200,000 the buyer is funded', base.rec && base.rec.fundsSufficient === true, base.rec);
  ok('reserves are reported', base.rec && base.rec.cashRemaining > 0, base.rec && base.rec.cashRemaining);

  /* Funds set BETWEEN the required down payment and the required cash to close.
     Having enough for the down payment alone must NOT read as fundable. */
  const dpNeeded = Math.round(base.rec.dpDollar);
  const cashNeeded = Math.round(base.rec.cashToClose);
  const between = dpNeeded + Math.round((cashNeeded - dpNeeded) / 2);
  await set({ ownFunds: between.toLocaleString('en-US') });
  const tight = await ask(500000);
  ok('funds covering the down payment but NOT closing costs are reported as short',
     tight.rec && tight.rec.fundsSufficient === false,
     { funds: between, down: dpNeeded, cashToClose: cashNeeded, rec: tight.rec });
  ok('the shortfall is quantified', tight.rec && tight.rec.cashGap > 0, tight.rec && tight.rec.cashGap);
  ok('the shortfall equals cash to close minus funds',
     tight.rec && near(tight.rec.cashGap, tight.rec.cashToClose - between, 1), tight.rec);
  /* The shortfall itself is asserted above, off the solver. Job 1 no longer
     renders the funds rows or the tick list (§4). */
  ok('the funds rows are no longer duplicated in the Job 1 view',
     !/ADDITIONAL CASH NEEDED/i.test(tight.out) && !/LEFT IN RESERVE/i.test(tight.out),
     tight.out.slice(0, 400));
  ok('nor is the qualification tick list',
     !/Payment target achieved/i.test(tight.out) && !/Available funds sufficient/i.test(tight.out),
     tight.out.slice(-400));

  /* ================================================================
     6 · TARGET PAYMENT MATHEMATICALLY IMPOSSIBLE
     ================================================================ */
  console.log('\n--- 6 · escrow alone above the target ---');
  await set({ ownFunds: '900,000', target: '700', taxRate: '900', hoi: '400' });
  const imp = await ask(600000);
  ok('an unreachable target reports not feasible', imp.feasible === false, imp);
  ok('no down payment is invented', !imp.rec || imp.rec === null, imp.rec);
  ok('the escrow floor is stated', imp.escrowFloor > 700, imp.escrowFloor);
  ok('the screen says it is not achievable at any down payment',
     /Not achievable at any down payment/i.test(imp.out), imp.out.slice(0, 300));

  /* ================================================================
     7 · HITS THE PAYMENT BUT FAILS QUALIFICATION
     ================================================================ */
  console.log('\n--- 7 · payment achieved, qualification not ---');
  await set({ ownFunds: '400,000', income: '5,000', debts: '200', target: '3,000' });
  const dq = await ask(500000);
  ok('a solution exists on payment alone', dq.feasible === true, dq);
  if (dq.rec) {
    ok('the payment target IS met', dq.rec.piti <= 3000.005, dq.rec.piti);
    ok('qualification FAILS on back-end DTI', dq.rec.dtiOk === false,
       { back: dq.rec.back, limit: dq.rec.backLimit });
    /* The DTI failure is asserted above, off the solver. Job 1 no longer renders
       the tick list that restated it (§4); Job 2 still does, and
       job2-property-strategy pins it there. */
    ok('the qualification tick list is no longer duplicated in the Job 1 view',
       !/Qualification achieved/i.test(dq.out), dq.out.slice(-500));
  }

  /* ================================================================
     8 · MI THRESHOLD MOVES WITH THE REQUIRED DOWN PAYMENT
     ================================================================ */
  console.log('\n--- 8 · mortgage insurance appears and disappears correctly ---');
  await set({ ownFunds: '400,000', income: '25,000', debts: '0', target: '4,200' });
  const mi = await ask(500000);
  ok('a generous target needs less down', mi.rec && mi.rec.dpDollar < 100000, mi.rec && mi.rec.dpDollar);
  if (mi.rec) {
    ok('under 20% down mortgage insurance is present',
       mi.rec.dpPct >= 20 || mi.rec.monthlyMI > 0, { dpPct: mi.rec.dpPct, mi: mi.rec.monthlyMI });
    const at20 = await page.evaluate(() => window.__probe('conv', 500000, 20));
    const at19 = await page.evaluate(() => window.__probe('conv', 500000, 19));
    ok('MI is zero at exactly 20% down', at20.monthlyMI === 0, at20.monthlyMI);
    ok('MI is charged at 19% down', at19.monthlyMI > 0, at19.monthlyMI);
    ok('crossing to 20% never raises the payment', at20.piti <= at19.piti + 0.005,
       { at19: at19.piti, at20: at20.piti });
  }
  await set({ ownFunds: '400,000', income: '25,000', debts: '0', target: '3,000' });
  const miHigh = await ask(500000);
  ok('a tighter target pushes the answer past 20% down and drops MI',
     miHigh.rec && miHigh.rec.monthlyMI === 0 && miHigh.rec.dpPct >= 20,
     miHigh.rec && { dpPct: miHigh.rec.dpPct, mi: miHigh.rec.monthlyMI });

  /* ================================================================
     9 & 10 · TAX ASSUMPTIONS FLOW THROUGH IN THEIR AUTHORED MODE
     ================================================================ */
  console.log('\n--- 9/10 · fixed-dollar tax stays fixed, percentage tax scales ---');
  await set({ taxRate: '582' }, 'dollarMo');
  const fx400 = await ask(400000), fx600 = await ask(600000);
  const t400 = await page.evaluate(() => window.__probe('conv', 400000, 30));
  const t600 = await page.evaluate(() => window.__probe('conv', 600000, 30));
  ok('a fixed $/MO tax is identical at $400k and $600k',
     near(t400.taxes, 582, 0.01) && near(t600.taxes, 582, 0.01), { at400: t400.taxes, at600: t600.taxes });
  ok('the fixed tax flows into the what-if answer at both prices',
     fx400.rec && fx600.rec && fx400.rec.dpDollar < fx600.rec.dpDollar,
     { at400: fx400.rec && fx400.rec.dpDollar, at600: fx600.rec && fx600.rec.dpDollar });

  await set({ taxRate: '1.20' }, 'pct');
  const p400 = await page.evaluate(() => window.__probe('conv', 400000, 30));
  const p600 = await page.evaluate(() => window.__probe('conv', 600000, 30));
  ok('a percentage tax scales with price ($400 at $400k, $600 at $600k)',
     near(p400.taxes, 400, 0.01) && near(p600.taxes, 600, 0.01), { at400: p400.taxes, at600: p600.taxes });
  const pct500 = await ask(500000);
  ok('the percentage tax flows into the what-if answer', pct500.rec && pct500.rec.dpDollar > 0, pct500.rec);

  /* $/MO and $/YR must give the SAME what-if answer. */
  await set({ taxRate: '582' }, 'dollarMo');
  const wMo = await ask(500000);
  await set({ taxRate: '6,984' }, 'dollar');
  const wYr = await ask(500000);
  ok('$582/mo and $6,984/yr produce the same required down payment',
     near(wMo.rec.dpDollar, wYr.rec.dpDollar, 1),
     { perMonth: wMo.rec.dpDollar, perYear: wYr.rec.dpDollar });

  /* ================================================================
     11 · HOA / CDD / FLOOD FLOW THROUGH
     ================================================================ */
  console.log('\n--- 11 · HOA, CDD and flood insurance flow through ---');
  await set({ taxRate: '582', hoa: '0', cdd: '0', flood: '0' }, 'dollarMo');
  const noFees = await ask(500000);
  await set({ taxRate: '582', hoa: '250', cdd: '120', flood: '95' }, 'dollarMo',
            { hoaNA: false, cddNA: false, floodNA: false });
  const withFees = await ask(500000);
  ok('adding $465/mo of HOA, CDD and flood raises the required down payment',
     withFees.rec && noFees.rec && withFees.rec.dpDollar > noFees.rec.dpDollar,
     { without: noFees.rec && noFees.rec.dpDollar, with: withFees.rec && withFees.rec.dpDollar });
  const feeProbe = await page.evaluate(() => window.__probe('conv', 500000, 40));
  ok('the escrow line carries HOA + CDD + flood + insurance ($250+$250+$120+$95)',
     near(feeProbe.fixedEsc, 715, 0.01), feeProbe.fixedEsc);
  ok('the payment still lands at or under target with the fees included',
     withFees.rec && withFees.rec.piti <= 3000.005, withFees.rec && withFees.rec.piti);

  /* ================================================================
     BOUNDARIES · Job 2 material must not leak into Job 1
     ================================================================ */
  console.log('\n--- boundaries · no negotiation content in Job 1 ---');
  await set({});
  await ask(500000);
  const j1 = await page.evaluate(() => window.__answerText());
  for (const term of ['concession', 'buydown', 'price reduction', 'counter', 'negotiat', 'seller']) {
    ok('Job 1 never mentions "' + term + '"', !new RegExp(term, 'i').test(j1),
       (j1.match(new RegExp('.{0,60}' + term + '.{0,60}', 'i')) || [''])[0]);
  }

  /* Clearing the price returns the prompt, not a stale answer. */
  const cleared = await ask(0);
  ok('clearing the price clears the answer', /Enter a price to see/i.test(cleared.out), cleared.out.slice(0, 160));

  ok('no JavaScript errors during the whole suite', pageErrors.length === 0, pageErrors.slice(0, 3));

  await browser.close();
  console.log('');
  console.log('=========================================================');
  console.log('  JOB 1 — REQUIRED DOWN PAYMENT WHAT-IF');
  console.log('  app under test: ' + appPath);
  console.log('  PASS ' + pass + '   FAIL ' + fail);
  if (failures.length) failures.forEach(f => console.log('    ✗ ' + f));
  console.log('=========================================================');
  process.exit(fail ? 1 : 0);
})();
