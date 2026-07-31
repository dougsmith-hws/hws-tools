/* =====================================================================
   R-47 — Comfort Calculator parity (audit §11.3, finding C-6)
   The only cross-tool scenario in the 47. Both tools are loaded READ-ONLY
   and driven with the C-6 worked inputs; the documented $115,338 gap is
   asserted against the audit's own published figures.

   The Comfort Calculator is never modified — it is opened from a copy and
   only its inputs and rendered results are touched.

   Usage: node tests/r47-cross-tool.test.js <bse.html> <comfort-calculator.html>
   ===================================================================== */
const { chromium } = require('playwright');
const path = require('path');

const BSE = path.resolve(process.argv[2]);
const CC = path.resolve(process.argv[3]);

// audit finding C-6, worked example — identical buyer in both tools
const C6 = { annualIncome: 114000, monthlyDebt: 650, comfortPayment: 3200, cash: 40000, rate: 6.75, term: 30, score: 740 };
// audit finding C-6, published figures — these are the independently established
// expected values for this scenario
const DOC = { cc_max_price: 524047, cc_comfort_price: 399080, bse_max_price: 408709, delta: 115338 };

const money = s => Number(String(s).replace(/[^0-9.\-]/g, '')) || 0;
let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? '\n        ' + detail : '')); }
}

(async () => {
  const browser = await chromium.launch();

  // ---- Comfort Calculator side (read-only) ----
  const cc = await browser.newPage();
  await cc.goto('file://' + CC);
  const ccOut = await cc.evaluate(c => {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
    set('annualIncome', c.annualIncome); set('monthlyDebt', c.monthlyDebt);
    set('comfortPayment', c.comfortPayment); set('downPayment', c.cash);
    set('rate', c.rate); set('termYears', c.term);
    calculate();
    return { maxPrice: document.getElementById('r_maxPrice').textContent,
             comfortPrice: document.getElementById('r_comfortPrice').textContent,
             taxes: document.getElementById('annualTaxes').value,
             hoi: document.getElementById('annualHOI').value,
             pmi: document.getElementById('pmiRate').value,
             dti: document.getElementById('dtiLimit').value };
  }, C6);
  await cc.close();

  // ---- BSE side ----
  const bse = await browser.newPage();
  await bse.goto('file://' + BSE);
  const bseOut = await bse.evaluate(c => {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
    set('price', ''); set('score', c.score); set('ownFunds', c.cash); set('gift', '0');
    set('target', c.comfortPayment); set('income', String(c.annualIncome / 12));
    set('debts', c.monthlyDebt); set('rateConv', c.rate);
    /* The audit C-6 comparison depends on BSE's PITI assumptions — 1.20% tax and
       $150/mo insurance. These were previously inherited from the application's
       initial field values; they are now pinned explicitly so the documented
       cross-tool gap cannot silently re-interpret itself when a default display
       unit changes ($/MO became the default property-tax mode). */
    set('taxRate', '1.20'); set('hoi', '150');
    unitState.tax = 'pct';
    renderUnitToggles();
    recalc();
    const res = Engine.run(gatherInputs(), A_CONST);
    const conv5 = res.scenarios.find(s => s.id === 'conv' && s.dp === 5);
    return conv5 ? { maxPrice: conv5.maxPrice, binding: conv5.binding, comfortPrice: conv5.comfortPrice } : null;
  }, C6);
  await bse.close();
  await browser.close();

  const ccMax = money(ccOut.maxPrice), ccComfort = money(ccOut.comfortPrice);
  const bseMax = bseOut ? Math.round(bseOut.maxPrice) : null;

  console.log('  Comfort Calculator defaults in play: taxes ' + ccOut.taxes + '/yr, HOI ' + ccOut.hoi +
              '/yr, PMI ' + ccOut.pmi + '%, DTI ' + ccOut.dti);
  console.log('  Comfort Calculator max price:  ' + ccMax);
  console.log('  Comfort Calculator comfort:    ' + ccComfort);
  console.log('  BSE Conv 5% max price:         ' + bseMax + '  (binding: ' + (bseOut && bseOut.binding) + ')');
  console.log('  Delta:                         ' + (ccMax - bseMax));

  check('R-47 Comfort Calculator max price matches audit C-6 ($' + DOC.cc_max_price + ')',
    Math.abs(ccMax - DOC.cc_max_price) <= 1, 'got ' + ccMax);
  check('R-47 Comfort Calculator comfort price matches audit C-6 ($' + DOC.cc_comfort_price + ')',
    Math.abs(ccComfort - DOC.cc_comfort_price) <= 1, 'got ' + ccComfort);
  check('R-47 BSE max price matches audit C-6 ($' + DOC.bse_max_price + ')',
    bseMax !== null && Math.abs(bseMax - DOC.bse_max_price) <= 1, 'got ' + bseMax);
  check('R-47 documented gap of $' + DOC.delta + ' reproduces',
    Math.abs((ccMax - bseMax) - DOC.delta) <= 2, 'got ' + (ccMax - bseMax));

  console.log('\n  R-47: PASS ' + pass + '  FAIL ' + fail);
  process.exit(fail ? 1 : 0);
})();
