/* =====================================================================
   BUY DOWN vs MORE DOWN — acceptance
   =====================================================================
   Fernando's question, in his own words:

       "If I have another $10,000, am I better off putting it down or buying
        the rate down?"

   THE ONE RULE THIS SUITE EXISTS TO ENFORCE

     BSE does not price rates. There is no rate sheet in this file, no
     (rate, points) table, and no cost-of-a-point curve. The only points model
     anywhere in the application is the 0.25%-per-point constant inside the
     concession logic, which the Phase 0-1 forensic audit already recorded as
     "an embedded rule, not a table", and which disagrees with the HomeWealth
     rate tool's own curve by 50% at one point.

     So the comparison is driven by a paired quote the advisor transcribes from
     the sheet in front of them. When that quote is absent — ANY of the four
     boxes blank — the section renders NOTHING. Not a placeholder, not a
     default, not an estimate. And when the extra cash does not reach the
     quoted rate, it says so and stops; it never interpolates a rate that the
     sheet did not quote.

   WHAT IS ASSERTED

     L  the section is hidden unless a complete, coherent quote is present
     M  both sides are computed through the engine, not restated from the UI
     N  the points side is the QUOTED rate, at the QUOTED cost, or nothing
     O  no winner is declared, and no pricing is invented
     P  the section never disturbs the figures already pinned around it

   PINNED CASE — Fernando Montilla: $499,900 · $150,000 down · $3,000 comfort ·
   6.750% · $582.26/mo taxes · $250/mo insurance.

   Usage:  node tests/buy-down.test.js index.html
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
    if (detail !== undefined) console.log('        ' + (typeof detail === 'string' ? detail.slice(0, 600) : JSON.stringify(detail).slice(0, 600)));
  }
}
const near = (a, b, eps) => Math.abs(a - b) <= (eps === undefined ? 0.01 : eps);
/* The card and row labels are uppercased in CSS, and innerText reports what is
   RENDERED, so every label match here is deliberately case-insensitive. */
const at = (hay, needle) => hay.toUpperCase().indexOf(needle.toUpperCase());
const has = (hay, needle) => at(hay, needle) > -1;

/* Job 1 is the shopping view, so the MAIN price field stays empty — $499,900
   is typed into "Desired purchase price" (#whatIfPrice), which is where this
   conversation actually happens on a live call. */
const FERN = {
  price: '', score: '800', ownFunds: '200,000', gift: '0',
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
  console.log('  BUY DOWN vs MORE DOWN — ACCEPTANCE');
  console.log('  app under test: ' + appPath);
  console.log('=========================================================\n');

  /* ===================================================================
     The driver types into the real fields and dispatches the real event,
     so the delegated handler on <body> runs exactly as it does on a call.
     Nothing here sets buyDown.* directly — that would test the renderer
     while skipping the parsing.
     =================================================================== */
  await page.evaluate(() => {
    window.__bd = function (fields, wip, quote) {
      Object.keys(fields).forEach(id => { const e = document.getElementById(id); if (e) e.value = fields[id]; });
      [['hoaNA', 'hoa'], ['cddNA', 'cdd'], ['floodNA', 'flood']].forEach(function (p) {
        const box = document.getElementById(p[0]);
        const val = (document.getElementById(p[1]) || {}).value;
        if (box) box.checked = !(+String(val).replace(/[^0-9.]/g, '') > 0);
      });
      ['tgFthb', 'tgVa', 'vaExempt'].forEach(i => { const e = document.getElementById(i); if (e) e.checked = false; });
      ['flTaxOn', 'flHomestead'].forEach(i => { const e = document.getElementById(i); if (e) e.checked = false; });
      ['flMillage', 'flNonAdVal', 'flPriorMkt', 'flPriorAssessed'].forEach(i => {
        const e = document.getElementById(i); if (e) e.value = ''; });
      document.getElementById('priority').value = 'payment';
      unitState.dp = 'dollar'; unitState.tax = 'dollarMo';
      renderUnitToggles(); recalc();

      /* Clear the quote through the handler, so state never leaks between cases. */
      buyDown = { extra: 0, ptsNow: null, rate: null, pts: null };

      const type = (id, v) => {
        const e = document.getElementById(id);
        if (!e) return false;
        e.value = v;
        e.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      };

      /* The desired price drives everything below it. */
      const wipEl = document.getElementById('whatIfPrice');
      let wipTyped = false;
      if (wipEl) { wipEl.value = wip; wipEl.dispatchEvent(new Event('input', { bubbles: true })); wipTyped = true; }

      /* Now the quote, if this case supplies one. The fields only exist once a
         desired price produced a property-fit block, which is itself the point. */
      const fieldsPresent = ['bdExtra', 'bdPtsNow', 'bdRate', 'bdPts']
        .every(id => !!document.getElementById(id));
      const typed = {};
      if (quote) {
        Object.keys(quote).forEach(k => { typed[k] = type(k, quote[k]); });
      }

      const out = document.getElementById('bdOut');
      const inp = gatherInputs();
      const dref = desiredPriceRef(inp);

      /* Independent recomputation of both sides, straight through the engine,
         so the assertions below compare the SCREEN against the ENGINE and not
         against a second copy of the screen's own arithmetic. */
      let expect = null;
      if (dref && buyDown.extra > 0 && buyDown.pts != null && buyDown.ptsNow != null && buyDown.rate > 0) {
        const w = desiredPriceInputs(inp);
        const pointsNeeded = buyDown.pts - buyDown.ptsNow;
        const costToBuy = pointsNeeded / 100 * dref.loanAmount;
        let more = null, bought = null;
        try {
          more = dpScenarioAt(w, dref.id, whatIfPrice,
                              Math.min(100, (dref.down + buyDown.extra) / whatIfPrice * 100));
        } catch (e) { /* leave null */ }
        try { bought = propRateAt(w, dref.id, whatIfPrice, dref.dp, buyDown.rate); } catch (e) { /* leave null */ }
        expect = {
          refPiti: dref.piti, refDown: dref.down, refRate: dref.rate,
          refLoan: dref.loanAmount, refMI: dref.monthlyMI,
          pointsNeeded: pointsNeeded, costToBuy: costToBuy,
          reaches: buyDown.extra >= costToBuy - 0.5,
          morePiti: more ? more.piti : null, moreMI: more ? more.monthlyMI : null,
          boughtPiti: bought ? bought.piti : null, boughtRate: bought ? bought.rate : null
        };
      }

      const txt = id => { const e = document.getElementById(id); return e ? (e.innerText || '').replace(/\s+/g, ' ').trim() : ''; };
      return {
        wipTyped: wipTyped, fieldsPresent: fieldsPresent, typed: typed,
        state: JSON.parse(JSON.stringify(buyDown)),
        hasOut: !!out,
        bd: out ? (out.innerText || '').replace(/\s+/g, ' ').trim() : '',
        bdHtml: out ? out.innerHTML : '',
        quoteRow: !!document.querySelector('.bdq'),
        bdqText: (function (n) { return n ? (n.innerText || '').replace(/\s+/g, ' ').trim() : ''; })(document.querySelector('.bdq')),
        cmp: !!document.querySelector('.bdcmp'),
        whatIf: txt('whatIfOut'),
        answer: txt('answerBody'),
        expect: expect
      };
    };
  });

  const B = (wip, quote, over) =>
    page.evaluate(([f, w, q]) => window.__bd(f, w, q),
                  [Object.assign({}, FERN, over || {}), wip, quote || null]);

  /* A quote that DOES reach: 6.750% at 0.000 points, 6.375% at 1.250 points.
     On Fernando's ~$349,900 loan that is 1.250% = ~$4,374, well inside $10,000. */
  const QUOTE_REACHES = { bdExtra: '10,000', bdPtsNow: '0.000', bdRate: '6.375', bdPts: '1.250' };
  /* A quote that does NOT reach: the same rate priced at 4.000 points is
     ~$14,000 on that loan, so $10,000 falls short. */
  const QUOTE_SHORT   = { bdExtra: '10,000', bdPtsNow: '0.000', bdRate: '6.375', bdPts: '4.000' };

  /* =================================================================
     L — SILENCE IS THE DEFAULT
     ================================================================= */
  console.log('--- L. Hidden unless a complete quote is present ---');
  {
    const r = await B('499,900', null);
    ok('L1 the quote row appears once a desired price exists', r.quoteRow === true, r.quoteRow);
    ok('L2 all four boxes exist to be typed into', r.fieldsPresent === true, r.fieldsPresent);
    ok('L3 with every box blank the comparison renders nothing', r.cmp === false && r.bd === '',
       r.bd.slice(0, 300));
    ok('L4 and nothing that looks like a payment is printed',
       !/\/mo/.test(r.bd) && !/\$/.test(r.bd), r.bd.slice(0, 300));
  }
  {
    /* One box at a time left blank — four separate ways to be incomplete. */
    const keys = ['bdExtra', 'bdPtsNow', 'bdRate', 'bdPts'];
    for (let i = 0; i < keys.length; i++) {
      const q = Object.assign({}, QUOTE_REACHES);
      q[keys[i]] = '';
      const r = await B('499,900', q);
      ok('L5.' + (i + 1) + ' blank ' + keys[i] + ' keeps the comparison hidden',
         r.cmp === false && r.bd === '', { blank: keys[i], bd: r.bd.slice(0, 200) });
    }
  }
  {
    /* A quote that is present but incoherent is not a quote. A "lower" rate that
       costs no more than the one already priced is a transcription error, and
       BSE will not guess which of the two numbers is wrong. */
    const r = await B('499,900', Object.assign({}, QUOTE_REACHES, { bdPts: '0.000' }));
    ok('L6 a lower rate priced at or below the current points is rejected',
       r.cmp === false && r.bd === '', r.bd.slice(0, 200));
  }
  {
    const r = await B('499,900', Object.assign({}, QUOTE_REACHES, { bdExtra: '0' }));
    ok('L7 zero extra cash is not a comparison', r.cmp === false && r.bd === '', r.bd.slice(0, 200));
  }
  {
    /* No desired price at all: there is no property to compare against, so the
       quote row itself must not appear. */
    const r = await B('', QUOTE_REACHES);
    ok('L8 with no desired price there is no quote row at all',
       r.quoteRow === false && r.cmp === false, { quoteRow: r.quoteRow, cmp: r.cmp });
  }

  /* =================================================================
     M — BOTH SIDES COME FROM THE ENGINE
     ================================================================= */
  console.log('\n--- M. Both sides through the engine ---');
  {
    const r = await B('499,900', QUOTE_REACHES);
    ok('M1 a complete quote renders the comparison', r.cmp === true, r.bd.slice(0, 300));
    ok('M2 the quote parsed exactly as typed',
       r.state.extra === 10000 && r.state.ptsNow === 0 && r.state.rate === 6.375 && r.state.pts === 1.25,
       r.state);
    ok('M3 the extra cash is stated in the heading',
       /If another \$10,000 were available/i.test(r.bd), r.bd.slice(0, 160));

    const e = r.expect;
    ok('M4 the engine produced a more-down scenario', e && e.morePiti != null, e);

    /* MORE DOWN — the payment reduction printed must equal ref.piti - more.piti
       computed independently through Engine.computeScenario(). */
    const moreDelta = Math.round(e.refPiti - e.morePiti);
    ok('M5 the more-down payment reduction is the engine figure',
       new RegExp('Apply toward down payment.{0,120}?\\$' + moreDelta.toLocaleString('en-US') + '\\b', 'i').test(r.bd),
       { want: moreDelta, saw: r.bd.slice(at(r.bd, 'Apply toward down payment'), at(r.bd, 'Apply toward down payment') + 260) });
    ok('M6 the new payment on that side is the engine figure',
       r.bd.indexOf('$' + Math.round(e.morePiti).toLocaleString('en-US')) > -1,
       { want: Math.round(e.morePiti), bd: r.bd.slice(0, 500) });
    ok('M7 the down payment movement is stated in real dollars',
       r.bd.indexOf('$' + Math.round(e.refDown).toLocaleString('en-US')) > -1 &&
       r.bd.indexOf('$' + Math.round(e.refDown + 10000).toLocaleString('en-US')) > -1,
       { from: e.refDown, to: e.refDown + 10000 });

    /* POINTS — the payment reduction must equal ref.piti - propRateAt(quoted). */
    ok('M8 the engine produced a bought-rate scenario', e.boughtPiti != null, e);
    ok('M9 the bought scenario really is at the QUOTED rate',
       near(e.boughtRate, 6.375, 0.0005), e.boughtRate);
    const buyDelta = Math.round(e.refPiti - e.boughtPiti);
    ok('M10 the points payment reduction is the engine figure',
       new RegExp('Apply toward discount points.{0,140}?\\$' + buyDelta.toLocaleString('en-US') + '\\b', 'i').test(r.bd),
       { want: buyDelta, saw: r.bd.slice(at(r.bd, 'Apply toward discount points'), at(r.bd, 'Apply toward discount points') + 280) });
    ok('M11 the new payment on that side is the engine figure',
       r.bd.indexOf('$' + Math.round(e.boughtPiti).toLocaleString('en-US')) > -1,
       { want: Math.round(e.boughtPiti), bd: r.bd.slice(0, 700) });

    /* The two sides must be genuinely different calculations. */
    ok('M12 the two sides are not the same scenario twice',
       Math.abs(e.morePiti - e.boughtPiti) > 0.005, { more: e.morePiti, bought: e.boughtPiti });

    /* DIFFERENCE — the gap between the two, and today's payment beside it. */
    const diff = Math.round(Math.abs(e.boughtPiti - e.morePiti));
    ok('M13 the difference is the gap between the two engine results',
       r.bd.indexOf('$' + diff.toLocaleString('en-US')) > -1, { want: diff, bd: r.bd.slice(-500) });
    ok('M14 today’s payment is shown beside it',
       r.bd.indexOf('$' + Math.round(e.refPiti).toLocaleString('en-US')) > -1,
       { want: Math.round(e.refPiti) });
  }

  /* =================================================================
     N — THE QUOTED COST, OR NOTHING
     ================================================================= */
  console.log('\n--- N. The quoted cost, or nothing ---');
  {
    const r = await B('499,900', QUOTE_REACHES);
    const e = r.expect;
    ok('N1 the cost of the points is points-as-a-percentage-of-LOAN',
       near(e.costToBuy, 1.25 / 100 * e.refLoan, 0.01), { cost: e.costToBuy, loan: e.refLoan });
    ok('N2 and it is printed as that dollar figure',
       r.bd.indexOf('$' + Math.round(e.costToBuy).toLocaleString('en-US')) > -1,
       { want: Math.round(e.costToBuy), bd: r.bd });
    ok('N3 the points actually needed is the DIFFERENCE of the two quotes',
       near(e.pointsNeeded, 1.25, 1e-9) && /1\.250 points/.test(r.bd), e.pointsNeeded);
    ok('N4 leftover cash is disclosed rather than quietly absorbed',
       e.reaches === true &&
       r.bd.indexOf('$' + Math.round(10000 - e.costToBuy).toLocaleString('en-US')) > -1,
       { left: 10000 - e.costToBuy, bd: r.bd.slice(0, 700) });
  }
  {
    const r = await B('499,900', QUOTE_SHORT);
    const e = r.expect;
    ok('N5 a quote the cash cannot reach still renders the section', r.cmp === true, r.bd.slice(0, 200));
    ok('N6 the engine agrees the cash falls short', e.reaches === false, e);
    ok('N7 the shortfall is stated in dollars',
       new RegExp('\\$' + Math.round(e.costToBuy - 10000).toLocaleString('en-US') + ' short').test(r.bd),
       { short: e.costToBuy - 10000, bd: r.bd.slice(0, 600) });
    ok('N8 no payment is invented for a rate that was not bought',
       /the sheet quotes rates, not a curve/i.test(r.bd) &&
       /will not interpolate a rate between quotes/i.test(r.bd), r.bd.slice(0, 600));
    ok('N9 the difference card refuses to compare',
       /Not comparable/i.test(r.bd), r.bd.slice(-400));
    /* And specifically: the quoted rate's payment must NOT appear anywhere. */
    ok('N10 the unreachable rate’s payment is absent from the screen',
       e.boughtPiti == null || r.bd.indexOf('$' + Math.round(e.boughtPiti).toLocaleString('en-US')) === -1,
       { hidden: Math.round(e.boughtPiti), bd: r.bd.slice(0, 600) });
  }

  /* =================================================================
     O — NO INVENTED PRICING, NO WINNER
     ================================================================= */
  console.log('\n--- O. No invented pricing, no winner ---');
  {
    const r = await B('499,900', QUOTE_REACHES);
    ok('O1 the section says plainly that the pricing came from the advisor',
       /rate-sheet quote transcribed by the advisor, not a BSE estimate/i.test(r.bd), r.bd.slice(-400));
    ok('O2 BSE does not choose', /BSE does not choose/i.test(r.bd), r.bd.slice(-300));
    ok('O3 nothing is recommended, preferred, or called best',
       !/\brecommend/i.test(r.bd) && !/\bbest\b/i.test(r.bd) && !/\byou should\b/i.test(r.bd) &&
       !/\boptimal\b/i.test(r.bd) && !/\bwinner\b/i.test(r.bd), r.bd);
    ok('O4 the difference is stated as a direction, not a verdict',
       /(Points reduce it more|More down reduces it more|The same payment)/i.test(r.bd), r.bd.slice(-400));
    ok('O5 the field help states BSE will not price a point',
       /BSE does not price rates and will not estimate the cost of a point/i.test(r.bdqText),
       r.bdqText.slice(0, 400));
  }
  {
    /* The 0.25%-per-point constant that lives in the concession logic must not
       be the source of anything here. If it were, a quote of 1.250 points would
       silently produce a 0.3125% rate improvement regardless of what the sheet
       said. Change ONLY the quoted rate and the whole points side must move. */
    const a = await B('499,900', QUOTE_REACHES);
    const b = await B('499,900', Object.assign({}, QUOTE_REACHES, { bdRate: '6.500' }));
    ok('O6 the quoted rate — not a constant — drives the points side',
       a.expect.boughtPiti != null && b.expect.boughtPiti != null &&
       Math.abs(a.expect.boughtPiti - b.expect.boughtPiti) > 1,
       { at6375: a.expect.boughtPiti, at6500: b.expect.boughtPiti });
    ok('O7 and the printed figure moves with it',
       a.bd !== b.bd &&
       b.bd.indexOf('$' + Math.round(b.expect.boughtPiti).toLocaleString('en-US')) > -1,
       { want: Math.round(b.expect.boughtPiti) });
    ok('O8 changing only the COST changes what the cash reaches, not the rate',
       near(a.expect.boughtPiti,
            (await B('499,900', Object.assign({}, QUOTE_REACHES, { bdPts: '2.000' }))).expect.boughtPiti, 0.01),
       null);
  }

  /* =================================================================
     P — THE SECTION DISTURBS NOTHING AROUND IT
     ================================================================= */
  console.log('\n--- P. Nothing else moved ---');
  {
    const before = await B('499,900', null);
    const after  = await B('499,900', QUOTE_REACHES);
    /* Excise the new section — everything from the quote row to the start of the
       sensitivity table — and what remains must be character-for-character
       identical. That covers BOTH the property fit above it and the rate
       sensitivity below it, which is the whole of Job 1 around the insertion. */
    const strip = s => {
      const i = at(s, 'If more cash were available');
      const j = at(s, 'Rate sensitivity on this home');
      return (i < 0 ? s : s.slice(0, i)) + ' ||| ' + (j < 0 ? '' : s.slice(j));
    };
    ok('P1 the property fit and the sensitivity table are both unchanged',
       strip(before.whatIf) === strip(after.whatIf) &&
       has(strip(after.whatIf), 'Required down payment') &&
       has(strip(after.whatIf), 'Rate sensitivity on this home'),
       { before: strip(before.whatIf).slice(-320), after: strip(after.whatIf).slice(-320) });
    ok('P2 the shopping-range answer around it is unchanged',
       strip(before.answer) === strip(after.answer) && strip(after.answer).length > 1200,
       { len: strip(after.answer).length,
         b: strip(before.answer).slice(-200), a: strip(after.answer).slice(-200) });
    ok('P3 the pinned current payment still reads $3,101.70',
       near(after.expect.refPiti, 3101.70, 0.01), after.expect.refPiti);
    ok('P4 the pinned reference down payment is still $150,000',
       near(after.expect.refDown, 150000, 1), after.expect.refDown);
    /* Live-call order: the two levers answer "more down or a lower rate", the
       quote row answers the natural follow-up, and the sensitivity table is the
       context that closes the conversation. */
    const iFit   = at(after.whatIf, 'Required down payment');
    const iRate  = at(after.whatIf, 'Required rate');
    const iQuote = at(after.whatIf, 'If more cash were available');
    const iCmp   = at(after.whatIf, 'If another $10,000 were available');
    const iSens  = at(after.whatIf, 'Rate sensitivity on this home');
    ok('P5 the comparison sits between the levers and the sensitivity table',
       iFit > -1 && iRate > iFit && iQuote > iRate && iCmp > iQuote && iSens > iCmp,
       { fit: iFit, rate: iRate, quote: iQuote, cmp: iCmp, sens: iSens });
  }

  ok('Z1 no page errors during the suite', pageErrors.length === 0, pageErrors.join(' | '));

  console.log('\n===============================================');
  console.log('  PASS ' + pass + '   FAIL ' + fail);
  if (failures.length) { console.log('  Failures:'); failures.forEach(f => console.log('   - ' + f)); }
  console.log('===============================================');
  await browser.close();
  process.exit(fail === 0 ? 0 : 1);
})();
