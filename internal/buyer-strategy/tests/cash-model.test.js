/* =====================================================================
   CASH MODEL — the live-call standard
   =====================================================================
   WP-2 built a cash model with four authored components: a total-out-of-pocket
   toggle, a desired-reserve floor, an escrow deposit and earnest money. The
   live-call cleanup removed all four from the workflow, because none of them is
   knowable — or discussed — during a pre-approval or pre-offer conversation.
   Earnest money is set by the contract. Prepaids depend on the closing date,
   the insurance binder, tax timing and lender setup. Both belong on the Loan
   Estimate, which is produced after the property is under contract.

   WHAT THIS SUITE NOW PROTECTS

     • TWO cash numbers, which is what the conversation needs (Group A):
         TOTAL CASH AVAILABLE     own funds + gift    what they HAVE
         DOWN PAYMENT CONSIDERED  the dp target       what they intend to use
       Available funds are still NEVER silently converted into a down payment.

     • The pre-offer cash standard (Group B):
         CASH TO CLOSE = DOWN PAYMENT + CONSERVATIVE ESTIMATED CLOSING COSTS
       No escrow deposit, no earnest-money credit, no LE reconciliation.

     • Dollars are the DEFAULT down-payment mode, and a dollar figure means the
       down payment — one meaning, nothing to mis-set mid-call. Percent remains
       a full alternate mode (Group C).

     • A genuine shortfall surfaces; sufficiency does not (Group D).

     • The four retired fields are gone from the workflow and CANNOT be required
       to answer a Stage 1 or Stage 2 question (Group E).

     • Nothing saved before today is destroyed: the four columns survive in the
       data model and round-trip untouched (Group F).

   PINNED CASE — Fernando Montilla: $499,900, $200,000 available, $150,000 down.

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

const BASE = {
  price: '500,000', score: '760', ownFunds: '200,000', gift: '0',
  dpTarget: '', target: '4,500', income: '18,000', debts: '0',
  stay: '7', priority: 'payment', rateConv: '6.750', rateFha: '6.250',
  rateVa: '6.125', ccPct: '3', ccOverride: '', taxRate: '1.20',
  hoi: '150', hoa: '0', cdd: '0', flood: '0',
  offerPrice: '', offerConc: '0', counterPrice: '', counterConc: '0', counterLoan: 'auto'
};

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(String(e)));
  await page.goto('file://' + path.resolve(appPath));
  await page.waitForFunction(() => typeof window.recalc === 'function');

  /* Read the SHIPPED default before anything has run. */
  const shippedDpUnit = await page.evaluate(() => unitState.dp);

  console.log('\n=========================================================');
  console.log('  CASH MODEL — LIVE-CALL STANDARD');
  console.log('  app under test: ' + appPath);
  console.log('=========================================================\n');

  await page.evaluate(() => {
    window.__cash = function (fields, dpUnit) {
      Object.keys(fields).forEach(id => { const e = document.getElementById(id); if (e) e.value = fields[id]; });
      ['hoaNA', 'cddNA', 'floodNA'].forEach(i => { const e = document.getElementById(i); if (e) e.checked = true; });
      ['tgFthb', 'tgVa', 'vaExempt'].forEach(i => { const e = document.getElementById(i); if (e) e.checked = false; });
      if (dpUnit) unitState.dp = dpUnit;
      unitState.tax = 'pct';
      renderUnitToggles(); recalc();
      const inp = gatherInputs();
      const out = engineRun(inp);
      const txt = id => { const e = document.getElementById(id); return e ? (e.innerText || '').replace(/\s+/g, ' ').trim() : ''; };
      return {
        inp: JSON.parse(JSON.stringify(inp)),
        scenarios: out.scenarios.map(s => ({ name: s.name, dp: s.dp, down: s.down, closing: s.closing,
                                             cashToClose: s.cashToClose, cashRemaining: s.cashRemaining,
                                             maxPrice: s.maxPrice, piti: s.piti })),
        answer: txt('answerBody'), dpSub: txt('dpSub'),
        shortfall: !!document.querySelector('.cashshort')
      };
    };
  });

  const F = (over, dpUnit) => page.evaluate(([b, o, u]) => window.__cash(Object.assign({}, b, o), u),
                                            [BASE, over || {}, dpUnit || null]);

  /* =================================================================
     GROUP A — two cash numbers, and they stay apart
     ================================================================= */
  console.log('--- A. Total cash available vs. the down payment considered ---');
  {
    const r = await F({ ownFunds: '200,000', gift: '25,000', dpTarget: '' });
    ok('A1 total cash available = own funds + gift', near(r.inp.funds, 225000, 0.5), r.inp.funds);
    ok('A2 available funds are NOT the down payment',
       r.scenarios.every(s => s.down < 225000 * 0.9),
       r.scenarios.map(s => s.name + ':' + Math.round(s.down)).join(' '));
    ok('A3 with nothing authored the down-payment target stays null',
       r.inp.dpTarget === null, r.inp.dpTarget);
  }
  {
    const r = await F({ dpTarget: '150,000' }, 'dollar');
    ok('A4 an authored dollar figure IS the down payment — no second meaning',
       r.inp.dpTarget && r.inp.dpTarget.isPct === false && near(r.inp.dpTarget.dollar, 150000, 0.5),
       r.inp.dpTarget);
    ok('A5 and it does not consume the rest of the available funds',
       near(r.inp.funds, 200000, 0.5), r.inp.funds);
  }

  /* =================================================================
     GROUP B — the pre-offer cash standard
     ================================================================= */
  console.log('\n--- B. Cash to close = down payment + conservative closing costs ---');
  {
    const r = await F({ price: '500,000', dpTarget: '20', ccPct: '3' }, 'pct');
    const s = r.scenarios.find(x => x.dp === 20);
    ok('B1 cash to close is exactly down + closing, with nothing else added',
       s && near(s.cashToClose, s.down + s.closing, 0.01),
       s && { down: s.down, closing: s.closing, ctc: s.cashToClose });
    ok('B1b the closing cost is the conservative percentage of the loan',
       s && near(s.closing, (500000 - s.down) * 0.03, 0.01), s && s.closing);
    ok('B1c cash remaining is available funds less cash to close',
       s && near(s.cashRemaining, r.inp.funds - s.cashToClose, 0.01), s && s.cashRemaining);
  }
  {
    const r = await F({ price: '500,000', dpTarget: '20', ccOverride: '12,500' }, 'pct');
    const s = r.scenarios.find(x => x.dp === 20);
    ok('B2 a fixed-dollar closing-cost override is honoured', s && near(s.closing, 12500, 0.5), s && s.closing);
    ok('B2b and cash to close follows it', s && near(s.cashToClose, s.down + 12500, 0.5), s && s.cashToClose);
  }
  {
    const r = await F({});
    ok('B3 no escrow deposit reaches the engine', r.inp.escrowDeposit === 0, r.inp.escrowDeposit);
    ok('B3b no earnest-money credit reaches the engine', r.inp.earnestMoney === 0, r.inp.earnestMoney);
    ok('B3c no total-out-of-pocket interpretation is in force', r.inp.cashIsTotal === false, r.inp.cashIsTotal);
    ok('B3d no reserve goal is in force', r.inp.desiredReserves === null, r.inp.desiredReserves);
    ok('B3e the reserve floor is the plain $500 default', r.inp.reserveFloor === 500, r.inp.reserveFloor);
  }

  /* =================================================================
     GROUP C — dollars are the default, percent still works
     ================================================================= */
  console.log('\n--- C. The down payment is authored in dollars by default ---');
  ok('C1 the shipped default down-payment mode is DOLLARS', shippedDpUnit === 'dollar', shippedDpUnit);
  {
    const d = await F({ price: '500,000', dpTarget: '150,000' }, 'dollar');
    ok('C2 a dollar figure resolves to that many dollars of down payment',
       near(d.inp.dpTarget.dollar, 150000, 0.5), d.inp.dpTarget);
    ok('C2b and the percentage it works out to is shown as supporting information',
       /30\.0% of \$500,000/.test(d.dpSub), d.dpSub);
  }
  {
    const p = await F({ price: '500,000', dpTarget: '30' }, 'pct');
    ok('C3 percent mode still works and still means percent',
       p.inp.dpTarget.isPct === true && near(p.inp.dpTarget.pct, 30, 0.001), p.inp.dpTarget);
    ok('C3b and the dollars it works out to are shown', /\$150,000 at \$500,000/.test(p.dpSub), p.dpSub);
    const d = await F({ price: '500,000', dpTarget: '150,000' }, 'dollar');
    const sd = d.scenarios.find(x => near(x.down, 150000, 2));
    const sp = p.scenarios.find(x => near(x.down, 150000, 2));
    ok('C3c the two modes produce identical economics at the same price',
       !!sd && !!sp && near(sd.piti, sp.piti, 0.01) && near(sd.cashToClose, sp.cashToClose, 0.01),
       { dollars: sd, percent: sp });
  }
  {
    /* The mathematics is unchanged: in Shopping Range the authored dollars are
       held fixed at every price, exactly as before. */
    const r = await F({ price: '', dpTarget: '150,000', score: '788', income: '9,500',
                        debts: '40', target: '3,000' }, 'dollar');
    ok('C4 in Shopping Range an authored dollar figure is held fixed, not scaled',
       r.scenarios.length > 0 && r.scenarios.every(s => near(s.down, 150000, 1)),
       r.scenarios.map(s => s.name + ':' + Math.round(s.down)).join(' '));
  }

  /* =================================================================
     GROUP D — a shortfall is news; sufficiency is not
     ================================================================= */
  console.log('\n--- D. Cash shortfall ---');
  {
    const r = await F({ price: '500,000', ownFunds: '4,000', dpTarget: '' }, 'pct');
    ok('D1 a genuine shortfall surfaces', r.shortfall === true, r.answer.slice(0, 300));
    ok('D1b with the figure named', /Cash shortfall \$[0-9,]+/i.test(r.answer), r.answer.slice(0, 300));
    ok('D1c stated as down payment plus estimated closing costs',
       /down plus \$[0-9,]+ estimated closing costs/i.test(r.answer), r.answer.slice(0, 400));
  }
  {
    const r = await F({ price: '500,000', ownFunds: '200,000', dpTarget: '' }, 'pct');
    ok('D2 ample funds produce NO cash headline at all', r.shortfall === false, r.answer.slice(0, 300));
    ok('D2b and nothing claims a shortfall', !/Cash shortfall/i.test(r.answer), r.answer.slice(0, 300));
  }
  {
    const r = await F({ price: '', ownFunds: '4,000', dpTarget: '' }, 'pct');
    ok('D3 Shopping Range never claims a shortfall — cash is a ceiling there, not a gap',
       r.shortfall === false, r.answer.slice(0, 300));
  }

  /* =================================================================
     GROUP E — the retired inputs are gone and cannot be required
     ================================================================= */
  console.log('\n--- E. The retired WP-2 inputs are out of the workflow ---');
  {
    const r = await page.evaluate(() => ({
      desiredReserves: !!document.getElementById('desiredReserves'),
      cashIsTotal: !!document.getElementById('cashIsTotal'),
      escrowDeposit: !!document.getElementById('escrowDeposit'),
      earnestMoney: !!document.getElementById('earnestMoney'),
      converter: typeof window.resolveDownFromCash
    }));
    ok('E1 the "desired reserves after closing" field is gone', r.desiredReserves === false, r);
    ok('E2 the "total out of pocket" toggle is gone', r.cashIsTotal === false, r);
    ok('E3 the escrow-deposit field is gone', r.escrowDeposit === false, r);
    ok('E4 the earnest-money field is gone', r.earnestMoney === false, r);
    ok('E5 the total-out-of-pocket converter is gone with them', r.converter === 'undefined', r);
  }
  {
    /* The acceptance question: can Stage 1 and Stage 2 be answered WITHOUT any
       of them? Nothing below authors one, and every figure still resolves. */
    const r = await page.evaluate(() => {
      const F = { price: '499,900', score: '800', ownFunds: '200,000', gift: '0',
                  dpTarget: '150,000', target: '3,000', income: '15,000', debts: '0',
                  stay: '7', rateConv: '6.750', ccPct: '3', taxRate: '582.26',
                  hoi: '250', hoa: '0', cdd: '0', flood: '0' };
      Object.keys(F).forEach(id => { const e = document.getElementById(id); if (e) e.value = F[id]; });
      ['hoaNA', 'cddNA', 'floodNA'].forEach(i => document.getElementById(i).checked = true);
      ['tgFthb', 'tgVa', 'vaExempt'].forEach(i => document.getElementById(i).checked = false);
      document.getElementById('priority').value = 'payment';
      unitState.dp = 'dollar'; unitState.tax = 'dollarMo';
      renderUnitToggles(); recalc();
      const inp = gatherInputs();
      const s = engineRun(inp).scenarios.find(x => Math.abs(x.down - 150000) < 2) || engineRun(inp).scenarios[0];
      const sol = requiredDownForPayment(inp, inp.price, inp.target);
      const rr = requiredRateForPayment(inp, s, inp.target);
      const shop = (function(){ const t = Object.assign({}, inp, { shopping:true, price:0 });
                                return powerSnapshot(t); })();
      return {
        piti: s.piti, cashToClose: s.cashToClose,
        requiredDown: sol && sol.recommended ? sol.recommended.dpDollar : null,
        requiredRate: rr ? rr.requiredRate : null,
        comfort: shop ? shop.comfort : null, qual: shop ? shop.qual : null,
        dtiAtComfort: dtiAtComfortPrice(inp)
      };
    });
    ok('E6 Stage 2 payment resolves with none of the retired inputs',
       near(r.piti, 3101.70, 0.02), r.piti);
    ok('E7 Stage 2 cash to close resolves — down plus closing only',
       near(r.cashToClose, 150000 + 0.03 * 349900, 0.5), r.cashToClose);
    ok('E8 the required-down solver still answers', r.requiredDown > 0, r.requiredDown);
    ok('E9 the required-rate solver still answers', r.requiredRate > 0 && r.requiredRate < 6.75, r.requiredRate);
    ok('E10 Stage 1 comfort and qualifying prices still resolve',
       r.comfort > 0 && r.qual > 0, { comfort: r.comfort, qual: r.qual });
    ok('E11 DTI at comfort price still resolves', r.dtiAtComfort > 0, r.dtiAtComfort);
  }

  /* =================================================================
     GROUP F — nothing saved before today is destroyed
     ================================================================= */
  console.log('\n--- F. The retired columns survive in the data model ---');
  {
    const r = await page.evaluate(() => {
      const ctx = { owner_user_id:'u', buyer_profile_id:'b', shopping_plan_id:'s', property_id:'p',
                    property_scenario_id:'ps', assumption_set_id:'a', display_name:'legacy', property_label:'P1' };
      /* A record written by the WP-2 build, with all four values populated. */
      const rows0 = BSEPersistence.__serializeRows(BSEModel.capture(), ctx, null);
      rows0.buyer_profile.cash_input_mode = 'total';
      rows0.buyer_profile.desired_reserves = 55000;
      rows0.property_scenario.escrow_deposit = 7250;
      rows0.property_scenario.earnest_money = 5000;
      const back = BSEPersistence.__deserializeRows(rows0, BSEPersistence.__presentationFrom(rows0), null);
      BSEModel.apply(back);
      recalc();
      const inp = gatherInputs();
      /* Save again, unmodified, and see what is written out. */
      const rows1 = BSEPersistence.__serializeRows(BSEModel.capture(), ctx, null);
      return {
        deserialized: { mode: back.buyer_profile.cash_input_mode, resv: back.buyer_profile.desired_reserves,
                        esc: back.property_scenario.escrow_deposit, emd: back.property_scenario.earnest_money },
        rewritten: { mode: rows1.buyer_profile.cash_input_mode, resv: rows1.buyer_profile.desired_reserves,
                     esc: rows1.property_scenario.escrow_deposit, emd: rows1.property_scenario.earnest_money },
        resolved: { esc: inp.escrowDeposit, emd: inp.earnestMoney,
                    total: inp.cashIsTotal, resv: inp.desiredReserves, floor: inp.reserveFloor }
      };
    });
    ok('F1 a legacy record still deserializes all four values',
       r.deserialized.mode === 'total' && near(r.deserialized.resv, 55000, 0.5) &&
       near(r.deserialized.esc, 7250, 0.5) && near(r.deserialized.emd, 5000, 0.5), r.deserialized);
    ok('F2 and saving again writes them back UNCHANGED — no history is destroyed',
       r.rewritten.mode === 'total' && near(r.rewritten.resv, 55000, 0.5) &&
       near(r.rewritten.esc, 7250, 0.5) && near(r.rewritten.emd, 5000, 0.5), r.rewritten);
    ok('F3 but none of them reaches the engine any more',
       r.resolved.esc === 0 && r.resolved.emd === 0 && r.resolved.total === false &&
       r.resolved.resv === null && r.resolved.floor === 500, r.resolved);
  }

  ok('Z1 no page errors during the suite', pageErrors.length === 0, pageErrors.join(' | '));

  console.log('\n===============================================');
  console.log('  PASS ' + pass + '   FAIL ' + fail);
  if (failures.length) { console.log('  Failures:'); failures.forEach(f => console.log('   - ' + f)); }
  console.log('===============================================');
  await browser.close();
  process.exit(fail === 0 ? 0 : 1);
})();
