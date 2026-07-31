/* =====================================================================
   LIVE-CALL CLEANUP — acceptance
   =====================================================================
   One question governs every assertion here:

       "Do I need this to answer the buyer's next question during a live call?"

   WHAT THIS SUITE PROTECTS

     A  Balanced is gone, everywhere, with no fallback path back to it.
     B  Best Overall is gone, and nothing replaced it with another automatic
        winner — not on the program cards, not on the negotiation table, not in
        the Gap Solver.
     C  The Stage 1 primary view is three figures: Comfort Purchase Price, Max
        Qualifying Price, DTI at Comfort Price. The redundant Limiting Factor
        card is gone. Cash-Limited Buying Power is not a headline.
     D  The Stage 2 primary view answers the five live-call questions, including
        BOTH solvers: how much more down, and what rate.
     E  The required-rate solver is correct, and re-solves immediately when any
        input that moves the payment moves.
     F  Comfort Payment drives shopping; the DTI maximum is a guardrail that
        nothing optimises toward.
     G  Florida property costs are preserved.

   PINNED CASE — Fernando Montilla: $499,900 · $150,000 down · $3,000 comfort ·
   6.750% · $582.26/mo taxes · $250/mo insurance.

   Usage:  node tests/live-call.test.js index.html
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
    if (detail !== undefined) console.log('        ' + (typeof detail === 'string' ? detail.slice(0, 500) : JSON.stringify(detail).slice(0, 500)));
  }
}
const near = (a, b, eps) => Math.abs(a - b) <= (eps === undefined ? 0.01 : eps);

/* Doug's own worked example from the cleanup brief: $484,259 comfort,
   $674,670 qualifying, 32.0% DTI at comfort. */
const DOUG = {
  price: '', score: '788', ownFunds: '200,000', gift: '0', dpTarget: '150,000',
  target: '3,000', income: '9,500', debts: '40', stay: '7',
  rateConv: '6.750', rateFha: '6.250', rateVa: '6.125', ccPct: '3', ccOverride: '',
  taxRate: '582', hoi: '250', hoa: '0', cdd: '0', flood: '0',
  offerPrice: '', offerConc: '0', counterPrice: '', counterConc: '0', counterLoan: 'auto'
};
/* Fernando's Stage 2 file. */
const FERN = {
  price: '499,900', score: '800', ownFunds: '200,000', gift: '0',
  dpTarget: '150,000', target: '3,000', income: '15,000', debts: '0', stay: '7',
  rateConv: '6.750', rateFha: '6.250', rateVa: '6.125', ccPct: '3', ccOverride: '',
  taxRate: '582.26', hoi: '250', hoa: '0', cdd: '0', flood: '0',
  offerPrice: '', offerConc: '0', counterPrice: '', counterConc: '0', counterLoan: 'auto'
};

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(String(e)));
  await page.goto('file://' + path.resolve(appPath));
  await page.waitForFunction(() => typeof window.recalc === 'function');

  console.log('\n=========================================================');
  console.log('  LIVE-CALL CLEANUP — ACCEPTANCE');
  console.log('  app under test: ' + appPath);
  console.log('=========================================================\n');

  await page.evaluate(() => {
    window.__lc = function (fields, priority, dpUnit, taxUnit) {
      Object.keys(fields).forEach(id => { const e = document.getElementById(id); if (e) e.value = fields[id]; });
      /* N/A only for the recurring costs the case left at zero — a case that
         actually sets an HOA must not have it silently zeroed. */
      [['hoaNA','hoa'], ['cddNA','cdd'], ['floodNA','flood']].forEach(function(p){
        const box = document.getElementById(p[0]);
        const val = (document.getElementById(p[1]) || {}).value;
        if (box) box.checked = !(+String(val).replace(/[^0-9.]/g, '') > 0);
      });
      ['tgFthb', 'tgVa', 'vaExempt'].forEach(i => { const e = document.getElementById(i); if (e) e.checked = false; });
      document.getElementById('priority').value = priority || '';
      unitState.dp = dpUnit || 'dollar';
      unitState.tax = taxUnit || 'pct';
      renderUnitToggles(); recalc();
      const inp = gatherInputs();
      const out = engineRun(inp);
      const ref = out.scenarios.find(s => inp.dpTarget && !inp.dpTarget.isPct
                                          ? Math.abs(s.down - inp.dpTarget.dollar) < 2 : false)
                || priorityScenario(out.scenarios, inp) || out.scenarios[0] || null;
      const txt = id => { const e = document.getElementById(id); return e ? (e.innerText || '').replace(/\s+/g, ' ').trim() : ''; };
      return {
        inp: JSON.parse(JSON.stringify(inp)),
        ref: ref ? { name: ref.name, down: ref.down, piti: ref.piti, rate: ref.rate,
                     taxes: ref.taxes, fixedEsc: ref.fixedEsc, monthlyMI: ref.monthlyMI,
                     pi: ref.pi, cashToClose: ref.cashToClose } : null,
        rr: ref ? requiredRateForPayment(inp, ref, inp.target) : null,
        dti: dtiAtComfortPrice(inp),
        answer: txt('answerBody'), snap: txt('snapBody'), cards: txt('cardsBody'),
        cardCount: document.querySelectorAll('.pw3 .pw').length,
        limfac: !!document.querySelector('.limfac')
      };
    };
  });
  const L = (f, over, prio, dpU, taxU) =>
    page.evaluate(([b, o, p, d, t]) => window.__lc(Object.assign({}, b, o), p, d, t),
                  [f, over || {}, prio === undefined ? 'payment' : prio, dpU || null, taxU || null]);

  /* =================================================================
     A — Balanced is gone
     ================================================================= */
  console.log('--- A. Balanced ---');
  {
    const r = await page.evaluate(() => {
      const opts = Array.from(document.getElementById('priority').options).map(o => o.value);
      /* Force the retired value in by every route a stored record could take. */
      const viaMigration = migratePriority('balanced');
      document.getElementById('priority').value = 'balanced';
      const stuckInDom = document.getElementById('priority').value;
      recalc();
      const resolved = gatherInputs().priority;
      const src = document.documentElement.outerHTML;
      return { opts, viaMigration, stuckInDom, resolved,
               keyed: (src.match(/balanced\s*:/g) || []).length,
               /* anchored on an identifier so the ===== comment rules do not match */
               comparisons: (src.match(/[\w$)\]]\s*===\s*'balanced'/g) || []).length };
    });
    ok('A1 "balanced" is not an option', !r.opts.includes('balanced'), r.opts);
    ok('A2 a stored "balanced" migrates to "payment"', r.viaMigration === 'payment', r.viaMigration);
    ok('A3 it cannot be forced into the control', r.stuckInDom !== 'balanced', r.stuckInDom);
    ok('A4 and it never resolves to a live priority',
       r.resolved === null || r.resolved === 'payment', r.resolved);
    /* The one place the word may legitimately still appear in CODE is the
       migration that maps it away. Nothing may be KEYED on it, and there may be
       exactly ONE comparison against it — the migration itself. */
    ok('A5 nothing is keyed on "balanced" any more', r.keyed === 0, r.keyed);
    ok('A5b exactly one comparison survives — the migration', r.comparisons === 1, r.comparisons);
  }
  {
    /* The fallback question: with NO priority, does anything silently behave as
       if one had been chosen? */
    const r = await L(DOUG, {}, '');
    ok('A6 an unstated priority selects nothing at all', r.inp.priority === null, r.inp.priority);
    ok('A7 and the panel says so rather than defaulting',
       /No buyer priority stated/i.test(r.cards), r.cards.slice(0, 200));
  }

  /* =================================================================
     B — no automatic winner, anywhere
     ================================================================= */
  console.log('\n--- B. No automatic winner ---');
  {
    const r = await page.evaluate(() => ({
      pickBestOverall: typeof Engine.pickBestOverall,
      optimalSplit: typeof Engine.optimalSplit,
      stars: (document.documentElement.outerHTML.match(/★/g) || []).length
    }));
    ok('B1 pickBestOverall is not on the engine surface', r.pickBestOverall === 'undefined', r);
    ok('B2 optimalSplit is not on the engine surface', r.optimalSplit === 'undefined', r);
    ok('B3 at most one ★ survives, in the comment recording its removal', r.stars <= 1, r.stars);
  }
  {
    const r = await L(FERN, { offerPrice: '489,900', offerConc: '10,000' }, 'payment', 'dollar', 'dollarMo');
    const all = r.answer + ' ' + r.cards + ' ' + r.snap;
    ok('B4 nothing is labelled "best strategy" or "best overall"',
       !/best strategy|best overall/i.test(all), all.slice(0, 300));
    ok('B5 nothing calls itself the engine\'s pick', !/engine.s pick/i.test(all), all.slice(0, 300));
    ok('B6 the badge states a priority match, not a recommendation',
       !/start here/i.test(all), all.slice(0, 300));
  }
  {
    /* The Gap Solver used to WITHHOLD a higher-down alternative unless the
       priority was 'payment' and it recovered inside 36 months — the last copy
       of the retired rule. Every eligible cheaper alternative is now offered. */
    const r = await page.evaluate(() => {
      const F = { price: '500,000', score: '760', ownFunds: '200,000', gift: '0', dpTarget: '',
                  target: '3,000', income: '18,000', debts: '0', stay: '7', rateConv: '6.750',
                  ccPct: '3', taxRate: '1.20', hoi: '150', hoa: '0', cdd: '0', flood: '0',
                  offerPrice: '', offerConc: '0', counterPrice: '', counterConc: '0' };
      const grab = prio => {
        Object.keys(F).forEach(id => { const e = document.getElementById(id); if (e) e.value = F[id]; });
        ['hoaNA','cddNA','floodNA'].forEach(i => document.getElementById(i).checked = true);
        ['tgFthb','tgVa','vaExempt'].forEach(i => document.getElementById(i).checked = false);
        document.getElementById('priority').value = prio;
        unitState.dp = 'pct'; unitState.tax = 'pct'; renderUnitToggles(); recalc();
        return (document.getElementById('gsPanel').innerText || '').replace(/\s+/g, ' ');
      };
      return { payment: grab('payment'), cash: grab('cash') };
    });
    /* The retired rule refused to surface a HIGHER-down alternative unless the
       priority was 'payment'. Under 'cash' the reference is the lowest-cash
       structure, and a lower-payment alternative that costs more down must now
       be offered rather than withheld. */
    ok('B7 a higher-down, lower-payment alternative is offered under a NON-payment priority',
       /Conv 20%|Conv 10%/.test(r.cash), r.cash.slice(0, 400));
  }

  /* =================================================================
     C — the Stage 1 primary view
     ================================================================= */
  console.log('\n--- C. Stage 1 primary view ---');
  {
    const r = await L(DOUG, {}, 'payment', 'dollar', 'dollarMo');
    ok('C1 Comfort Purchase Price is $484,259', /COMFORT PURCHASE PRICE \$484,259/i.test(r.answer),
       r.answer.slice(0, 220));
    ok('C2 Max Qualifying Price is $674,670', /MAX QUALIFYING PRICE \$674,670/i.test(r.answer),
       r.answer.slice(0, 260));
    ok('C3 DTI at Comfort Price is 32.0%', /DTI AT COMFORT PRICE 32\.0%/i.test(r.answer),
       r.answer.slice(0, 320));
    ok('C3b and it equals (comfort payment + debts) / income',
       near(r.dti, (3000 + 40) / 9500 * 100, 0.001), r.dti);
    ok('C4 exactly three primary figures', r.cardCount === 3, r.cardCount);
    ok('C5 Cash-Limited Buying Power is not a headline',
       !/CASH-LIMITED BUYING POWER/i.test(r.answer), r.answer.slice(0, 400));
    ok('C6 the redundant Limiting Factor card is absent when comfort controls',
       r.limfac === false && !/LIMITING FACTOR/i.test(r.snap), r.snap.slice(0, 300));
    ok('C7 the max qualifying price is a boundary, not the shopping figure',
       /SHOP UP TO \$484,259/i.test(r.answer), r.answer.slice(0, 400));
  }
  {
    /* It is not simply deleted — it still appears when it is genuinely news. */
    const r = await L(DOUG, { dpTarget: '', income: '4,200', debts: '900' }, 'payment', 'pct', 'dollarMo');
    ok('C8 the Limiting Factor card DOES appear when qualifying income is the constraint',
       /LIMITING FACTOR/i.test(r.snap) && /DTI/i.test(r.snap), r.snap.slice(0, 300));
  }

  /* =================================================================
     D — the Stage 2 primary view
     ================================================================= */
  console.log('\n--- D. Stage 2 primary view ---');
  {
    const r = await L(FERN, {}, 'payment', 'dollar', 'dollarMo');
    ok('D1 the realistic payment on this property is stated',
       /\$3,102\/mo|\$3,101/.test(r.answer), r.answer.slice(0, 400));
    ok('D2 it is compared with the comfort payment',
       /\$3,000/.test(r.answer), r.answer.slice(0, 400));
    ok('D3 the additional down payment required is answered',
       /REQUIRED DOWN PAYMENT/i.test(r.answer) && /ADDITIONAL NEEDED/i.test(r.answer),
       r.answer.slice(0, 700));
    ok('D4 the required rate is answered, in the primary view',
       /RATE THAT WOULD REACH THE COMFORT PAYMENT/i.test(r.answer) &&
       /RATE NEEDED TO REACH \$3,000/i.test(r.answer), r.answer.slice(0, 900));
    ok('D5 offer and concession levers are available to discuss',
       /concession|offer/i.test(r.answer), r.answer.slice(0, 400));
    ok('D6 and nothing declares which lever to use',
       !/best strategy|you should/i.test(r.answer), r.answer.slice(0, 400));
  }
  {
    /* When the property already fits, neither solver clutters the screen. */
    const r = await L(FERN, { target: '4,000' }, 'payment', 'dollar', 'dollarMo');
    ok('D7 no required-rate block when the payment already clears comfort',
       !/RATE NEEDED TO REACH/i.test(r.answer), r.answer.slice(0, 400));
  }

  /* =================================================================
     E — the required-rate solver
     ================================================================= */
  console.log('\n--- E. Required-rate solver ---');
  {
    const r = await L(FERN, {}, 'payment', 'dollar', 'dollarMo');
    const rr = r.rr, ref = r.ref;
    ok('E1 it solves', rr && rr.reachable === true && rr.alreadyThere === false, rr);
    ok('E2 the current payment is Fernando\'s verified $3,101.70',
       near(rr.currentPayment, 3101.70, 0.02), rr.currentPayment);
    ok('E3 the payment gap is stated', near(rr.paymentGap, 101.70, 0.02), rr.paymentGap);
    ok('E4 the solved rate is below the current rate',
       rr.requiredRate < rr.currentRate, { req: rr.requiredRate, cur: rr.currentRate });
    ok('E5 the rate gap is current minus required',
       near(rr.rateGap, rr.currentRate - rr.requiredRate, 1e-9), rr.rateGap);
    /* The real test: plug the solved rate back into the ENGINE and land on the
       comfort payment. Independent of the solver's own arithmetic. */
    const back = await page.evaluate(([f, rate]) => {
      Object.keys(f).forEach(id => { const e = document.getElementById(id); if (e) e.value = f[id]; });
      ['hoaNA','cddNA','floodNA'].forEach(i => document.getElementById(i).checked = true);
      document.getElementById('priority').value = 'payment';
      unitState.dp = 'dollar'; unitState.tax = 'dollarMo'; renderUnitToggles(); recalc();
      const inp = gatherInputs();
      const s0 = engineRun(inp).scenarios.find(x => Math.abs(x.down - 150000) < 2);
      const bumped = Object.assign({}, inp, { rates: Object.assign({}, inp.rates, { conv: rate }) });
      const s1 = Engine.computeScenario(Object.assign({}, bumped, { shopping:false, dpTarget:null }),
                                        A_CONST, Engine.PROGRAMS.conv,
                                        { dp: s0.dp, name: s0.name }, inp.price);
      return { piti: s1.piti, mi0: s0.monthlyMI, mi1: s1.monthlyMI,
               tax0: s0.taxes, tax1: s1.taxes };
    }, [FERN, r.rr.requiredRate]);
    ok('E6 re-running the ENGINE at the solved rate lands on the comfort payment',
       near(back.piti, 3000, 0.05), back.piti);
    ok('E6b and every non-P&I component was genuinely held',
       near(back.mi0, back.mi1, 0.001) && near(back.tax0, back.tax1, 0.001), back);
  }
  {
    /* CHANGE INPUT -> RE-RUN -> SEE CONSEQUENCES. Each of these must move the
       required rate, immediately, on the same recalc. */
    const base = await L(FERN, {}, 'payment', 'dollar', 'dollarMo');
    const cases = [
      ['price',           { price: '549,900' }],
      ['down payment',    { dpTarget: '175,000' }],
      ['property taxes',  { taxRate: '700.00' }],
      ['insurance',       { hoi: '400' }],
      ['HOA',             { hoa: '250' }],   // the helper unchecks hoaNA for this
      ['comfort payment', { target: '3,200' }]
    ];
    for (const [what, over] of cases) {
      const r = await L(FERN, over, 'payment', 'dollar', 'dollarMo');
      const moved = r.rr && base.rr &&
        (r.rr.requiredRate == null || base.rr.requiredRate == null
           ? r.rr.reachable !== base.rr.reachable
           : Math.abs(r.rr.requiredRate - base.rr.requiredRate) > 1e-6);
      ok('E7 the required rate re-solves when the ' + what + ' changes', !!moved,
         { before: base.rr && base.rr.requiredRate, after: r.rr && r.rr.requiredRate });
    }
    /* MI is the sixth mover: drop the down payment far enough to trigger it. */
    const mi = await L(FERN, { dpTarget: '25,000' }, 'payment', 'dollar', 'dollarMo');
    ok('E7 the required rate re-solves when mortgage insurance appears',
       mi.ref.monthlyMI > 0 && (mi.rr.requiredRate == null ||
         Math.abs(mi.rr.requiredRate - base.rr.requiredRate) > 1e-6),
       { mi: mi.ref.monthlyMI, before: base.rr.requiredRate, after: mi.rr.requiredRate });
  }
  {
    /* The honest answer when no rate can do it. */
    const r = await L(FERN, { taxRate: '3,500.00', hoi: '900', target: '2,000' }, 'payment', 'dollar', 'dollarMo');
    ok('E8 when the escrow floor alone exceeds comfort, it says no rate reaches it',
       r.rr && r.rr.reachable === false, r.rr);
    ok('E8b and the screen says so rather than printing a nonsense rate',
       /No rate reaches/i.test(r.answer), r.answer.slice(0, 600));
  }
  {
    const r = await L(FERN, { target: '4,000' }, 'payment', 'dollar', 'dollarMo');
    ok('E9 an already-comfortable payment reports the current rate, not a lower one',
       r.rr && r.rr.alreadyThere === true && near(r.rr.requiredRate, r.rr.currentRate, 1e-9), r.rr);
  }

  /* =================================================================
     F — Comfort Payment vs the maximum boundary
     ================================================================= */
  console.log('\n--- F. Comfort drives; the maximum is a guardrail ---');
  {
    const r = await L(DOUG, {}, 'payment', 'dollar', 'dollarMo');
    ok('F1 the shopping figure is the COMFORT price, never the qualifying maximum',
       /SHOP UP TO \$484,259/i.test(r.answer) && !/SHOP UP TO \$674,670/i.test(r.answer),
       r.answer.slice(0, 400));
    ok('F2 the qualifying maximum is labelled as a DTI boundary',
       /MAX QUALIFYING PRICE \$674,670 Based on 45% back-end DTI/i.test(r.answer),
       r.answer.slice(0, 400));
  }
  {
    /* Raising the comfort payment moves the shopping figure; it is the driver. */
    const a = await L(DOUG, { target: '3,000' }, 'payment', 'dollar', 'dollarMo');
    const b = await L(DOUG, { target: '3,600' }, 'payment', 'dollar', 'dollarMo');
    ok('F3 the comfort payment drives the shopping range',
       /SHOP UP TO \$484,259/i.test(a.answer) && !/SHOP UP TO \$484,259/i.test(b.answer),
       b.answer.slice(0, 250));
    ok('F4 and no priority optimises toward the qualifying maximum',
       !/SHOP UP TO \$674,670/i.test((await L(DOUG, {}, 'power', 'dollar', 'dollarMo')).answer),
       'power priority still shops to the comfort figure');
  }

  /* =================================================================
     G — Florida property costs are preserved
     ================================================================= */
  console.log('\n--- G. Florida costs preserved ---');
  {
    const r = await page.evaluate(([f]) => {
      Object.keys(f).forEach(id => { const e = document.getElementById(id); if (e) e.value = f[id]; });
      ['hoaNA','cddNA','floodNA'].forEach(i => document.getElementById(i).checked = true);
      document.getElementById('priority').value = 'payment';
      document.getElementById('flTaxOn').checked = true;
      document.getElementById('flHomestead').checked = true;
      document.getElementById('flMillage').value = '18.2300';
      document.getElementById('flPriorMkt').value = '250,000';
      document.getElementById('flPriorAssessed').value = '110,464';
      unitState.dp = 'dollar'; unitState.tax = 'dollarMo'; renderUnitToggles(); recalc();
      const fl = BSEModel.flTaxNow();
      return { active: !!(fl && fl.active), y1: fl && fl.year1Monthly, y2: fl && fl.year2Monthly,
               saving: fl && fl.monthlySaving,
               fields: ['flMillage','flNonAdVal','flPriorMkt','flPriorAssessed','hoi','hoa','cdd','flood']
                 .every(id => !!document.getElementById(id)) };
    }, [FERN]);
    ok('G1 the Florida tax estimate still runs', r.active === true, r);
    ok('G2 Year 1 and Year 2 are still two different figures', r.y1 > r.y2, r);
    ok('G3 the portability saving is still about $269/mo', near(r.saving, 269, 3), r.saving);
    ok('G4 every recurring-cost field is still present', r.fields === true, r.fields);
  }

  ok('Z1 no page errors during the suite', pageErrors.length === 0, pageErrors.join(' | '));

  console.log('\n===============================================');
  console.log('  PASS ' + pass + '   FAIL ' + fail);
  if (failures.length) { console.log('  Failures:'); failures.forEach(f => console.log('   - ' + f)); }
  console.log('===============================================');
  await browser.close();
  process.exit(fail === 0 ? 0 : 1);
})();
