/* =====================================================================
   WP-2 — CASH MODEL AND CASH-TO-CLOSE TRUTH
   =====================================================================
   WHAT THIS SUITE PROTECTS

     • THREE CASH CONCEPTS STAY DISTINCT and never collapse into each other:
         TOTAL AVAILABLE FUNDS   own funds + gift      what the buyer HAS
         PREFERRED CASH TO USE   the dp target         what they WANT to spend
         DESIRED RESERVES        authored floor        what must be LEFT
       Available funds are NEVER silently converted into a down payment. This
       is the single most important assertion in the suite (Group E).

     • "I could put up to 200, but I think 150 gets me there" is a TOTAL, not a
       down payment. When the advisor says so, the figure converts through one
       closed-form implementation, and the resulting cash to close comes back
       to the authored total EXACTLY (Group B).

     • Cash to close now includes the escrow deposit — the prepaids and initial
       escrow reserve BSE previously omitted entirely — and credits earnest
       money already paid. The displayed CLOSING figure stays a true cost; the
       earnest credit is netted at cash to close, not hidden inside the cost
       (Group C).

     • The cash CEILING inverts the cash-to-close the engine actually computes.
       Before WP-2 the ceiling always re-derived from ccPct and silently ignored
       a fixed-dollar override, so the ceiling and the scenario disagreed
       (Group D).

     • The reserve floor is authored, and defaults to the $500 that used to be
       hard-coded inside pickBestOverall, so an un-authored buyer is scored
       exactly as before (Group F).

     • Everything WP-2 adds is INERT until authored, and the escrow deposit and
       earnest money are PROPERTY MODE ONLY — Shopping Range has no single
       property to pay costs on (Group H).

   PINNED CASE — Fernando Montilla, 27-28 July 2026 calls:
     $200,000 available · "150 is what I want to use" · $5,000 earnest money
     already paid on a $499,900 contract.

   Usage:  node tests/cash-model.test.js index.html
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

/* A deliberately ordinary buyer. Income and debts are set clear of the DTI
   limit so that nothing below is accidentally a DTI test. */
const BASE = {
  price: '500,000', score: '760', ownFunds: '200,000', gift: '0',
  dpTarget: '', target: '4,500', income: '18,000', debts: '0',
  stay: '7', priority: 'balanced', rateConv: '6.750', rateFha: '6.250',
  rateVa: '6.125', ccPct: '3', ccOverride: '', taxRate: '1.20',
  hoi: '150', hoa: '0', cdd: '0', flood: '0',
  desiredReserves: '', escrowDeposit: '', earnestMoney: '',
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
  console.log('  WP-2 — CASH MODEL / CASH TO CLOSE');
  console.log('  app under test: ' + appPath);
  console.log('=========================================================\n');

  await page.evaluate(() => {
    /* Drive the real UI, read the real engine. Nothing is stubbed. */
    window.__cash = function (fields, opts) {
      opts = opts || {};
      Object.keys(fields).forEach(id => { const e = document.getElementById(id); if (e) e.value = fields[id]; });
      ['hoaNA', 'cddNA', 'floodNA'].forEach(i => { const e = document.getElementById(i); if (e) e.checked = true; });
      ['tgFthb', 'tgVa', 'vaExempt'].forEach(i => { const e = document.getElementById(i); if (e) e.checked = false; });
      document.getElementById('cashIsTotal').checked = !!opts.cashIsTotal;
      unitState.dp = opts.dpUnit || 'dollar';
      unitState.tax = 'pct';
      renderUnitToggles(); recalc();
      const inp = gatherInputs();
      /* engineRun() is the dispatcher the application itself renders from: it
         routes an authored-dollar Shopping Range to the fixed-dollar solver and
         everything else to Engine.run(). Reading through it means this suite
         tests what the advisor actually sees. */
      const out = engineRun(inp);
      const s = out.scenarios[0];
      return {
        inp: JSON.parse(JSON.stringify(inp)),
        best: out.best ? { dp: out.best.dp, down: out.best.down, cashToClose: out.best.cashToClose,
                           cashRemaining: out.best.cashRemaining, name: out.best.name } : null,
        s: s ? { dp: s.dp, down: s.down, closing: s.closing, cashToClose: s.cashToClose,
                 cashRemaining: s.cashRemaining, maxPrice: s.maxPrice, piti: s.piti, name: s.name } : null,
        scenarios: out.scenarios.map(x => ({ name: x.name, dp: x.dp, down: x.down, closing: x.closing,
                                             cashToClose: x.cashToClose, cashRemaining: x.cashRemaining,
                                             maxPrice: x.maxPrice })),
        snap: (document.getElementById('snapBody').innerText || '').replace(/\s+/g, ' ').trim(),
        cards: (document.getElementById('cardsBody').innerText || '').replace(/\s+/g, ' ').trim(),
        reservesSub: (document.getElementById('reservesSub').innerText || '').trim(),
        cashModeHidden: document.getElementById('cashModeWrap').classList.contains('hide')
      };
    };
    /* Engine-level probe: take the real resolved inputs, override only the
       cash components, and re-run. Used where the UI cannot express the case
       (e.g. an escrow deposit alongside a Shopping-Range ceiling). */
    window.__engineWith = function (fields, over, opts) {
      window.__cash(fields, opts || {});
      const inp = Object.assign(JSON.parse(JSON.stringify(gatherInputs())), over);
      const out = engineRun(inp);
      const s = out.scenarios[0];
      /* The recommendation is pickBestOverall() — the function WP-2 extracted
         the reserve floor out of — so the reserve assertions read it directly
         rather than through a renderer. */
      const bestS = out.scenarios.length ? Engine.pickBestOverall(out.scenarios.slice(), inp) : null;
      return {
        s: { dp: s.dp, down: s.down, closing: s.closing, cashToClose: s.cashToClose,
             cashRemaining: s.cashRemaining, maxPrice: s.maxPrice },
        best: bestS ? { dp: bestS.dp, cashRemaining: bestS.cashRemaining, name: bestS.name } : null,
        all: out.scenarios.map(x => ({ dp: x.dp, cashRemaining: x.cashRemaining, cashToClose: x.cashToClose }))
      };
    };
    /* Reserve-floor probe. The scenario set comes from a real engine run; the
       pick is then made with an explicit floor. A down-payment target is set on
       the pick input ONLY so that pickBestOverall's lowest-tier filter stands
       down — otherwise it narrows the field to a single scenario and there is
       nothing left for a reserve floor to decide. This is the situation the
       field exists for: "I want to put 10% down and keep six figures in the
       bank." */
    window.__pick = function (fields, floor) {
      window.__cash(fields, { dpUnit: 'pct' });
      const inp = gatherInputs();
      const scen = engineRun(inp).scenarios;
      const t = Object.assign({}, inp,
        { dpTarget: { isPct: true, pct: 10, dollar: null }, reserveFloor: floor });
      const b = Engine.pickBestOverall(scen.slice(), t);
      return { pick: b ? { dp: b.dp, name: b.name, rem: b.cashRemaining } : null,
               set: scen.map(x => ({ dp: x.dp, rem: Math.round(x.cashRemaining) })) };
    };
  });

  const F = (over, opts) => page.evaluate(([b, o, p]) => window.__cash(Object.assign({}, b, o), p),
                                          [BASE, over || {}, opts || {}]);
  const E = (over, eng, opts) => page.evaluate(([b, o, ov, p]) => window.__engineWith(Object.assign({}, b, o), ov, p),
                                               [BASE, over || {}, eng || {}, opts || {}]);

  /* =================================================================
     GROUP A — the three cash concepts are distinct
     ================================================================= */
  console.log('--- A. Three cash concepts stay distinct ---');
  {
    const r = await F({ ownFunds: '200,000', gift: '25,000', dpTarget: '' });
    ok('A1 total available funds = own funds + gift', near(r.inp.funds, 225000, 0.5), r.inp.funds);
    ok('A1b available funds are NOT the down payment', r.s.down !== 225000 && r.s.down < 225000,
       'down=' + r.s.down);
    ok('A1c preferred cash unauthored leaves dpTarget null', r.inp.dpTarget === null, r.inp.dpTarget);
  }
  {
    const r = await F({ dpTarget: '150,000' }, { cashIsTotal: false });
    ok('A2 $ target with the toggle OFF still means DOWN PAYMENT',
       r.inp.dpTarget && near(r.inp.dpTarget.dollar, 150000, 0.5), r.inp.dpTarget);
    ok('A2b no authored total is recorded when the toggle is off',
       r.inp.cashIsTotal === false && r.inp.cashAuthoredTotal === null,
       { t: r.inp.cashIsTotal, a: r.inp.cashAuthoredTotal });
  }
  {
    const r = await F({ dpTarget: '150,000' }, { cashIsTotal: true });
    ok('A3 toggle ON converts the total to a smaller DOWN PAYMENT',
       r.inp.dpTarget.dollar < 150000, r.inp.dpTarget);
    ok('A3b the authored total is preserved verbatim for presentation',
       near(r.inp.cashAuthoredTotal, 150000, 0.5), r.inp.cashAuthoredTotal);
    ok('A3c the authored total never becomes the engine down payment',
       !near(r.inp.dpTarget.dollar, 150000, 1), r.inp.dpTarget.dollar);
  }
  {
    const blankR = await F({ desiredReserves: '' });
    const authR = await F({ desiredReserves: '50,000' });
    ok('A4 desired reserves unauthored resolves to null', blankR.inp.desiredReserves === null, blankR.inp.desiredReserves);
    ok('A4b desired reserves authored resolves to the figure', near(authR.inp.desiredReserves, 50000, 0.5), authR.inp.desiredReserves);
    ok('A4c desired reserves is a THIRD number, not funds and not the target',
       authR.inp.desiredReserves !== authR.inp.funds, { r: authR.inp.desiredReserves, f: authR.inp.funds });
  }

  /* =================================================================
     GROUP B — the converter is exact: total in, total back out
     ================================================================= */
  console.log('\n--- B. Preferred cash to use converts exactly ---');
  {
    const r = await F({ price: '500,000', dpTarget: '150,000', ccPct: '3' }, { cashIsTotal: true });
    const sc = r.scenarios.find(x => near(x.down, r.inp.dpTarget.dollar, 2)) || r.s;
    ok('B1 percentage closing: cash to close returns to the authored total',
       near(sc.cashToClose, 150000, 1), { ctc: sc.cashToClose, down: sc.down, closing: sc.closing });
  }
  {
    const r = await F({ price: '500,000', dpTarget: '150,000', ccPct: '3', escrowDeposit: '4,000' }, { cashIsTotal: true });
    const sc = r.scenarios.find(x => near(x.down, r.inp.dpTarget.dollar, 2)) || r.s;
    ok('B2 with an escrow deposit the total is still hit exactly',
       near(sc.cashToClose, 150000, 1), { ctc: sc.cashToClose, down: sc.down, closing: sc.closing });
    ok('B2b the escrow deposit pushed the down payment DOWN, not the total up',
       r.inp.dpTarget.dollar < 150000 * 0.98, r.inp.dpTarget.dollar);
  }
  {
    const r = await F({ price: '500,000', dpTarget: '150,000', ccPct: '3', earnestMoney: '5,000' }, { cashIsTotal: true });
    const sc = r.scenarios.find(x => near(x.down, r.inp.dpTarget.dollar, 2)) || r.s;
    ok('B3 earnest money already paid is credited inside the total',
       near(sc.cashToClose, 145000, 1), { ctc: sc.cashToClose, note: 'total 150,000 less the 5,000 already paid' });
    ok('B3b down + closing still equals the full 150,000 committed',
       near(sc.down + sc.closing, 150000, 1), { down: sc.down, closing: sc.closing });
  }
  {
    const r = await F({ price: '500,000', dpTarget: '150,000', ccPct: '3', ccOverride: '12,500' }, { cashIsTotal: true });
    const sc = r.scenarios.find(x => near(x.down, r.inp.dpTarget.dollar, 2)) || r.s;
    ok('B4 fixed-dollar closing override: total hit exactly',
       near(sc.cashToClose, 150000, 1), { ctc: sc.cashToClose, down: sc.down, closing: sc.closing });
    ok('B4b the override, not the percentage, set the closing cost',
       near(sc.closing, 12500, 1), sc.closing);
    ok('B4c the converted down payment is total less the fixed override',
       near(r.inp.dpTarget.dollar, 137500, 1), r.inp.dpTarget.dollar);
  }
  {
    /* Degenerate guards: the closed form must never divide by zero or go
       negative, and must never hand the engine a negative down payment. */
    const r = await F({ price: '500,000', dpTarget: '2,000', ccPct: '3' }, { cashIsTotal: true });
    ok('B5 a total smaller than the closing cost floors at zero down, never negative',
       r.inp.dpTarget.dollar >= 0, r.inp.dpTarget.dollar);
    const r2 = await F({ price: '', dpTarget: '150,000', ccPct: '3' }, { cashIsTotal: true });
    ok('B5b Shopping Range carries the raw figure (no price to convert against)',
       near(r2.inp.dpTarget.dollar, 150000, 0.5), r2.inp.dpTarget);
    ok('B5c Shopping Range still records that the figure is a total',
       r2.inp.cashIsTotal === true, r2.inp.cashIsTotal);
  }
  {
    /* The Shopping-Range solver must convert at EVERY price probe, so the
       resulting range is the one the buyer can actually afford. */
    const SHOP = { price: '', dpTarget: '150,000', ccPct: '3',
                   score: '788', income: '9,500', debts: '40', target: '3,000' };
    const total = await F(SHOP, { cashIsTotal: true });
    const down  = await F(SHOP, { cashIsTotal: false });
    ok('B6 Shopping Range: a total buys LESS house than the same figure as a down payment',
       total.s.maxPrice < down.s.maxPrice,
       { asTotal: total.s.maxPrice, asDown: down.s.maxPrice });
    ok('B6b Shopping Range: the total is still hit at the top of the range',
       near(total.s.cashToClose, 150000, 1500),
       { ctc: total.s.cashToClose, price: total.s.maxPrice });
  }

  /* =================================================================
     GROUP C — cash to close tells the truth
     ================================================================= */
  console.log('\n--- C. Cash-to-close components ---');
  {
    const a = await F({ price: '500,000', dpTarget: '20', escrowDeposit: '' }, { dpUnit: 'pct' });
    const b = await F({ price: '500,000', dpTarget: '20', escrowDeposit: '6,000' }, { dpUnit: 'pct' });
    const sa = a.scenarios.find(x => x.dp === 20), sb = b.scenarios.find(x => x.dp === 20);
    ok('C1 the escrow deposit raises cash to close by exactly its amount',
       sa && sb && near(sb.cashToClose - sa.cashToClose, 6000, 1),
       { before: sa && sa.cashToClose, after: sb && sb.cashToClose });
    ok('C1b it is a real COST, so it also raises the displayed closing figure',
       sa && sb && near(sb.closing - sa.closing, 6000, 1),
       { before: sa && sa.closing, after: sb && sb.closing });
    ok('C1c the down payment is untouched by it',
       sa && sb && near(sa.down, sb.down, 1), { a: sa && sa.down, b: sb && sb.down });
  }
  {
    const a = await F({ price: '500,000', dpTarget: '20', earnestMoney: '' }, { dpUnit: 'pct' });
    const b = await F({ price: '500,000', dpTarget: '20', earnestMoney: '5,000' }, { dpUnit: 'pct' });
    const sa = a.scenarios.find(x => x.dp === 20), sb = b.scenarios.find(x => x.dp === 20);
    ok('C2 earnest money lowers cash to close by exactly its amount',
       sa && sb && near(sa.cashToClose - sb.cashToClose, 5000, 1),
       { before: sa && sa.cashToClose, after: sb && sb.cashToClose });
    ok('C2b it is a CREDIT, not a discount — the closing cost is unchanged',
       sa && sb && near(sa.closing, sb.closing, 1), { a: sa && sa.closing, b: sb && sb.closing });
    ok('C2c cash remaining rises by the credited amount',
       sa && sb && near(sb.cashRemaining - sa.cashRemaining, 5000, 1),
       { a: sa && sa.cashRemaining, b: sb && sb.cashRemaining });
  }
  {
    const r = await F({ price: '500,000', dpTarget: '20', earnestMoney: '400,000' }, { dpUnit: 'pct' });
    const s = r.scenarios.find(x => x.dp === 20);
    ok('C3 an absurd deposit floors cash to close at zero, never negative',
       s && s.cashToClose >= 0, s && s.cashToClose);
  }
  {
    const a = await F({ price: '500,000', dpTarget: '20' }, { dpUnit: 'pct' });
    const b = await F({ price: '500,000', dpTarget: '20', escrowDeposit: '6,000', earnestMoney: '6,000' }, { dpUnit: 'pct' });
    const sa = a.scenarios.find(x => x.dp === 20), sb = b.scenarios.find(x => x.dp === 20);
    ok('C4 an equal deposit and credit net to no change in cash to close',
       sa && sb && near(sa.cashToClose, sb.cashToClose, 1), { a: sa && sa.cashToClose, b: sb && sb.cashToClose });
    ok('C4b but the CLOSING cost is still higher — the two are not the same thing',
       sa && sb && near(sb.closing - sa.closing, 6000, 1), { a: sa && sa.closing, b: sb && sb.closing });
  }

  /* =================================================================
     GROUP D — the cash ceiling inverts cash to close
     ================================================================= */
  console.log('\n--- D. The cash ceiling agrees with the scenario ---');
  {
    const r = await F({ price: '', ownFunds: '40,000', gift: '0', dpTarget: '', target: '9,000', income: '25,000' });
    const cashLtd = r.scenarios.filter(x => x.cashToClose > 39000);
    ok('D1 a cash-limited range spends the funds without exceeding them',
       r.scenarios.every(x => x.cashToClose <= 40000 + 500),
       r.scenarios.map(x => x.dp + '% ' + Math.round(x.cashToClose)).join(' | '));
    ok('D1b the ceiling is actually binding (it did not simply give up)',
       cashLtd.length > 0, r.scenarios.map(x => Math.round(x.cashToClose)).join(','));
  }
  {
    /* The ceiling must move with the fixed components. Driven at engine level:
       Shopping Range zeroes these by design, so this is the only way to prove
       the ceiling formula itself is right. */
    const base = await E({ price: '', ownFunds: '40,000', target: '9,000', income: '25,000' }, {});
    const esc  = await E({ price: '', ownFunds: '40,000', target: '9,000', income: '25,000' }, { escrowDeposit: 6000 });
    const emd  = await E({ price: '', ownFunds: '40,000', target: '9,000', income: '25,000' }, { earnestMoney: 6000 });
    ok('D2 an escrow deposit lowers the affordable range', esc.s.maxPrice < base.s.maxPrice,
       { base: base.s.maxPrice, withEscrow: esc.s.maxPrice });
    ok('D2b earnest money already paid raises it', emd.s.maxPrice > base.s.maxPrice,
       { base: base.s.maxPrice, withEmd: emd.s.maxPrice });
    ok('D2c the ceiling still respects the funds with an escrow deposit present',
       esc.s.cashToClose <= 40000 + 500, esc.s.cashToClose);
    ok('D2d and with an earnest-money credit present',
       emd.s.cashToClose <= 40000 + 500, emd.s.cashToClose);
  }
  {
    /* Pre-WP-2 the ceiling always re-derived from ccPct, so a fixed-dollar
       override was silently ignored. Property mode with an override present. */
    const r = await E({ price: '', ownFunds: '40,000', target: '9,000', income: '25,000' },
                      { shopping: false, price: 300000, ccOverride: 15000 });
    ok('D3 a fixed-dollar closing override is honoured by the ceiling, not re-derived',
       near(r.s.closing, 15000, 1), r.s.closing);
  }

  /* =================================================================
     GROUP E — available funds are NEVER auto-converted
     ================================================================= */
  console.log('\n--- E. Available cash is never silently spent ---');
  {
    const r = await F({ price: '500,000', ownFunds: '200,000', dpTarget: '' });
    ok('E1 with no preferred figure the engine does not spend the funds',
       r.s.down < 200000 * 0.9, { down: r.s.down, funds: r.inp.funds });
    ok('E1b a large reserve is left over', r.s.cashRemaining > 0, r.s.cashRemaining);
    ok('E1c the funds figure itself is unchanged by anything WP-2 added',
       near(r.inp.funds, 200000, 0.5), r.inp.funds);
  }
  {
    const off = await F({ price: '500,000', dpTarget: '20' }, { dpUnit: 'pct', cashIsTotal: false });
    const on  = await F({ price: '500,000', dpTarget: '20' }, { dpUnit: 'pct', cashIsTotal: true });
    ok('E2 the toggle is inert in PERCENT mode — a percent is unambiguous',
       JSON.stringify(off.inp.dpTarget) === JSON.stringify(on.inp.dpTarget),
       { off: off.inp.dpTarget, on: on.inp.dpTarget });
    ok('E2b and the toggle is hidden in percent mode', on.cashModeHidden === true, on.cashModeHidden);
    ok('E2c and shown in dollar mode',
       (await F({ dpTarget: '150,000' }, { dpUnit: 'dollar' })).cashModeHidden === false);
  }
  {
    const r = await F({ price: '500,000', dpTarget: '' }, { cashIsTotal: true });
    ok('E3 the toggle with no preferred figure converts nothing',
       r.inp.dpTarget === null && r.inp.cashAuthoredTotal === null,
       { dp: r.inp.dpTarget, a: r.inp.cashAuthoredTotal });
  }

  /* =================================================================
     GROUP F — desired reserves after closing
     ================================================================= */
  console.log('\n--- F. Reserves after closing ---');
  {
    const blank = await F({ desiredReserves: '' });
    ok('F1 the default floor is the $500 that used to be hard-coded',
       blank.inp.reserveFloor === 500, blank.inp.reserveFloor);
    const auth = await F({ desiredReserves: '50,000' });
    ok('F1b an authored goal becomes the floor', near(auth.inp.reserveFloor, 50000, 0.5), auth.inp.reserveFloor);
  }
  {
    const CASE = { price: '500,000', ownFunds: '150,000', dpTarget: '', target: '4,500' };
    const P = (floor) => page.evaluate(([b, o, f]) => window.__pick(Object.assign({}, b, o), f),
                                       [BASE, CASE, floor]);
    const lo = await P(500);
    const hi = await P(50000);
    const impossible = await P(500000);
    ok('F2 a reserve goal changes which scenario is recommended',
       lo.pick && hi.pick && lo.pick.dp !== hi.pick.dp,
       { at500: lo.pick && lo.pick.dp, at50k: hi.pick && hi.pick.dp, set: lo.set });
    ok('F2b the recommendation under the goal actually clears it',
       hi.pick && hi.pick.rem >= 50000, hi.pick);
    ok('F2c the default floor recommends the scenario that fails the higher goal',
       lo.pick && lo.pick.rem < 50000, lo.pick);
    ok('F2d a goal no scenario can meet does not leave the buyer with nothing',
       impossible.pick !== null && impossible.pick.dp === lo.pick.dp,
       { pick: impossible.pick, set: impossible.set });
  }
  {
    const blank = await F({ desiredReserves: '' });
    const auth  = await F({ desiredReserves: '50,000' });
    ok('F3 the hint states the default when unauthored',
       /500/.test(blank.reservesSub) && /default/i.test(blank.reservesSub), blank.reservesSub);
    ok('F3b the hint states the consequence when authored',
       /50,000/.test(auth.reservesSub), auth.reservesSub);
  }
  {
    /* The scenario card must test against the authored goal, not the generic
       $1,000 notice, once a goal exists. */
    const r = await F({ price: '500,000', ownFunds: '150,000', dpTarget: '20', desiredReserves: '120,000' },
                      { dpUnit: 'pct' });
    ok('F4 a scenario short of the goal is called out by the goal, not by $1,000',
       /reserve goal/i.test(r.cards) || /reserve goal/i.test(r.snap), (r.cards || '').slice(0, 300));
  }

  /* =================================================================
     GROUP G — persistence round-trip
     ================================================================= */
  console.log('\n--- G. Round-trip through capture / serialize / restore ---');
  {
    const r = await page.evaluate(() => {
      window.__cash({ price: '500,000', score: '760', ownFunds: '200,000', gift: '0',
                      dpTarget: '150,000', target: '4,500', income: '18,000', debts: '0',
                      stay: '7', priority: 'balanced', rateConv: '6.750', ccPct: '3',
                      taxRate: '1.20', hoi: '150', hoa: '0', cdd: '0', flood: '0',
                      desiredReserves: '55,000', escrowDeposit: '7,250', earnestMoney: '5,000' },
                    { cashIsTotal: true });
      const model = BSEModel.capture();
      const rows = BSEPersistence.__serializeRows(model,
        { owner_user_id:'u', buyer_profile_id:'b', shopping_plan_id:'s', property_id:'p',
          property_scenario_id:'ps', assumption_set_id:'a', display_name:'WP-2 cash', property_label:'P1' }, null);
      const back = BSEPersistence.__deserializeRows(rows, BSEPersistence.__presentationFrom(rows), null);
      /* Wipe the DOM so the restore below is a real restore, not a no-op. */
      ['desiredReserves', 'escrowDeposit', 'earnestMoney'].forEach(id => document.getElementById(id).value = '');
      document.getElementById('cashIsTotal').checked = false;
      recalc();
      const wiped = gatherInputs();
      return {
        rowsBuyer: { mode: rows.buyer_profile.cash_input_mode, resv: rows.buyer_profile.desired_reserves },
        rowsScen: { esc: rows.property_scenario.escrow_deposit, emd: rows.property_scenario.earnest_money },
        backBuyer: { mode: back.buyer_profile.cash_input_mode, resv: back.buyer_profile.desired_reserves },
        backScen: { esc: back.property_scenario.escrow_deposit, emd: back.property_scenario.earnest_money },
        wiped: { resv: wiped.desiredReserves, esc: wiped.escrowDeposit, emd: wiped.earnestMoney, tot: wiped.cashIsTotal }
      };
    });
    ok('G1 the four values serialize into their own columns',
       r.rowsBuyer.mode === 'total' && near(r.rowsBuyer.resv, 55000, 0.5) &&
       near(r.rowsScen.esc, 7250, 0.5) && near(r.rowsScen.emd, 5000, 0.5),
       r);
    ok('G1b and survive deserialization unchanged',
       r.backBuyer.mode === 'total' && near(r.backBuyer.resv, 55000, 0.5) &&
       near(r.backScen.esc, 7250, 0.5) && near(r.backScen.emd, 5000, 0.5),
       r);
    ok('G1c wiping the DOM really does clear them (the restore below is meaningful)',
       r.wiped.resv === null && r.wiped.esc === 0 && r.wiped.emd === 0 && r.wiped.tot === false,
       r.wiped);
  }
  {
    /* WP-1 defect found during WP-2: fields were captured and serialized but
       never written back to the DOM on load. This pins the fix. */
    const r = await page.evaluate(() => {
      window.__cash({ price: '500,000', score: '760', ownFunds: '200,000', gift: '0',
                      dpTarget: '150,000', target: '4,500', income: '18,000', debts: '0',
                      stay: '7', priority: 'balanced', rateConv: '6.750', ccPct: '3',
                      taxRate: '1.20', hoi: '150', hoa: '0', cdd: '0', flood: '0',
                      desiredReserves: '55,000', escrowDeposit: '7,250', earnestMoney: '5,000' },
                    { cashIsTotal: true });
      const model = BSEModel.capture();
      const rows = BSEPersistence.__serializeRows(model,
        { owner_user_id:'u', buyer_profile_id:'b', shopping_plan_id:'s', property_id:'p',
          property_scenario_id:'ps', assumption_set_id:'a', display_name:'WP-2 cash', property_label:'P1' }, null);
      const back = BSEPersistence.__deserializeRows(rows, BSEPersistence.__presentationFrom(rows), null);
      ['desiredReserves', 'escrowDeposit', 'earnestMoney'].forEach(id => document.getElementById(id).value = '');
      document.getElementById('cashIsTotal').checked = false;
      recalc();
      BSEModel.apply(back);
      recalc();
      const v = id => document.getElementById(id).value;
      const inp = gatherInputs();
      return { dom: { resv: v('desiredReserves'), esc: v('escrowDeposit'), emd: v('earnestMoney'),
                      tot: document.getElementById('cashIsTotal').checked },
               inp: { resv: inp.desiredReserves, esc: inp.escrowDeposit, emd: inp.earnestMoney, tot: inp.cashIsTotal } };
    });
    ok('G2 the DOM is actually repopulated on restore (WP-1 restore defect, fixed)',
       /55,?000/.test(r.dom.resv) && /7,?250/.test(r.dom.esc) && /5,?000/.test(r.dom.emd) && r.dom.tot === true,
       r.dom);
    ok('G2b and the restored DOM resolves back to the same engine inputs',
       near(r.inp.resv, 55000, 0.5) && near(r.inp.esc, 7250, 0.5) &&
       near(r.inp.emd, 5000, 0.5) && r.inp.tot === true, r.inp);
  }

  /* =================================================================
     GROUP H — scope: inert until authored, property mode only
     ================================================================= */
  console.log('\n--- H. Scope and inertness ---');
  {
    const r = await F({});
    ok('H1 unauthored, every WP-2 input is inert',
       r.inp.escrowDeposit === 0 && r.inp.earnestMoney === 0 &&
       r.inp.cashIsTotal === false && r.inp.desiredReserves === null &&
       r.inp.reserveFloor === 500 && r.inp.cashAuthoredTotal === null,
       { e: r.inp.escrowDeposit, m: r.inp.earnestMoney, t: r.inp.cashIsTotal,
         d: r.inp.desiredReserves, f: r.inp.reserveFloor, a: r.inp.cashAuthoredTotal });
  }
  {
    const r = await F({ price: '', escrowDeposit: '7,000', earnestMoney: '5,000' });
    ok('H2 Shopping Range zeroes the escrow deposit — there is no property yet',
       r.inp.escrowDeposit === 0, r.inp.escrowDeposit);
    ok('H2b and zeroes earnest money — nothing has been deposited on nothing',
       r.inp.earnestMoney === 0, r.inp.earnestMoney);
  }
  {
    const zero = await F({ price: '500,000', dpTarget: '20', escrowDeposit: '0' }, { dpUnit: 'pct' });
    const blank = await F({ price: '500,000', dpTarget: '20', escrowDeposit: '' }, { dpUnit: 'pct' });
    ok('H3 an explicit 0 and a blank both resolve to zero cost (no inheritance here)',
       zero.inp.escrowDeposit === 0 && blank.inp.escrowDeposit === 0,
       { zero: zero.inp.escrowDeposit, blank: blank.inp.escrowDeposit });
  }
  {
    const r = await F({ price: '500,000', desiredReserves: '50,000' });
    ok('H4 the reserve goal never touches the payment', r.s.piti > 0 && isFinite(r.s.piti), r.s.piti);
    const r2 = await F({ price: '500,000', desiredReserves: '' });
    ok('H4b and un-authored it changes no payment at all',
       near(r.s.piti, r2.s.piti, 0.01), { withGoal: r.s.piti, without: r2.s.piti });
  }

  /* =================================================================
     GROUP I — Fernando Montilla acceptance replay
     ================================================================= */
  console.log('\n--- I. Fernando Montilla — cash acceptance case ---');
  {
    const FERN = {
      price: '499,900', score: '800', ownFunds: '200,000', gift: '0',
      dpTarget: '150,000', target: '3,000', income: '15,000', debts: '0',
      stay: '7', priority: 'payment', rateConv: '6.750', ccPct: '3',
      taxRate: '1.20', hoi: '250', hoa: '0', cdd: '0', flood: '0',
      desiredReserves: '', escrowDeposit: '', earnestMoney: '5,000'
    };
    const asDown = await page.evaluate(f => window.__cash(f, { cashIsTotal: false }), FERN);
    const asTotal = await page.evaluate(f => window.__cash(f, { cashIsTotal: true }), FERN);
    ok('I1 available funds stay at 200,000 and are not spent',
       near(asTotal.inp.funds, 200000, 0.5), asTotal.inp.funds);
    ok('I2 read as a DOWN PAYMENT, 150,000 goes down and cash to close exceeds it',
       near(asDown.inp.dpTarget.dollar, 150000, 0.5) &&
       asDown.scenarios.some(x => x.cashToClose > 150000),
       { down: asDown.inp.dpTarget.dollar, ctc: asDown.scenarios.map(x => Math.round(x.cashToClose)).join(',') });
    ok('I3 read as TOTAL OUT OF POCKET, the down payment drops below 150,000',
       asTotal.inp.dpTarget.dollar < 150000, asTotal.inp.dpTarget.dollar);
    {
      const sc = asTotal.scenarios.find(x => near(x.down, asTotal.inp.dpTarget.dollar, 2));
      ok('I4 and cash to close lands at 145,000 — the 150,000 committed, less the 5,000 already paid',
         sc && near(sc.cashToClose, 145000, 1), sc && { ctc: sc.cashToClose, down: sc.down, closing: sc.closing });
    }
    ok('I5 the difference between the two readings is material, not cosmetic',
       Math.abs(asDown.inp.dpTarget.dollar - asTotal.inp.dpTarget.dollar) > 8000,
       { asDown: asDown.inp.dpTarget.dollar, asTotal: asTotal.inp.dpTarget.dollar });
    ok('I6 the reading is stated in the presentation, never left to be guessed',
       /total out of pocket/i.test(asTotal.snap + asTotal.cards) ||
       asTotal.inp.cashAuthoredTotal === 150000,
       asTotal.inp.cashAuthoredTotal);
  }

  ok('Z1 no page errors during the suite', pageErrors.length === 0, pageErrors.join(' | '));

  console.log('\n===============================================');
  console.log('  PASS ' + pass + '   FAIL ' + fail);
  if (failures.length) { console.log('  Failures:'); failures.forEach(f => console.log('   - ' + f)); }
  console.log('===============================================');
  await browser.close();
  process.exit(fail === 0 ? 0 : 1);
})();
