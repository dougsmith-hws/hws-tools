/* =====================================================================
   JOB 1 CLOSEOUT — presentation contract + pinned manual cases
   =====================================================================
   Locks the final Job 1 presentation decisions so they cannot silently
   regress, and pins the manually validated $499,900 what-if case.

   THE PRESENTATION CONTRACT

     • ANSWER FIRST. The three buying-power cards, the SHOP UP TO figure,
       the down-payment restatement, then the what-if, then the two
       supporting tools. Nothing else competes.
     • Qualification Snapshot and Property Strategy are COLLAPSED BY
       DEFAULT. They are supporting diagnostic detail, not headlines.
     • The what-if control names the buyer's actual target payment, so
       its purpose is obvious without opening it.
     • $/MO is the default property-tax mode for a NEW session, because
       that is the unit a lender quote reports an escrow in.
     • A SAVED buyer restores its own authored tax unit verbatim.

   WHY COLLAPSE IS CLIPPED RATHER THAN `display:none`
   `display:none` removes content from innerText, which blanks every
   frozen render capture the 47-scenario regression suite compares
   against — collapsing Sections 1 and 2 that way failed all 68 cases for
   purely presentational reasons. Clipping keeps the content rendered and
   therefore still verifiable while being genuinely collapsed (the body
   measures 0px). `inert` keeps clipped inputs out of the tab order.
   Both halves of that are asserted below.

   THE PINNED $499,900 CASE — see §5. Doug's manual run reproduces
   EXACTLY at 6.875% conventional, not the 6.750% listed alongside it, so
   BOTH rates are pinned. Whichever he meant is locked.

   Usage:  node tests/job1-closeout.test.js index.html
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

const SETUP = `
window.__fresh = function(){
  return {
    taxUnit: unitState.tax,
    taxValue: document.getElementById('taxRate').value,
    activeTaxBtn: Array.prototype.slice.call(
      document.getElementById('taxUnitTg').querySelectorAll('button'))
      .filter(function(b){ return b.classList.contains('active'); })
      .map(function(b){ return b.dataset.u; })[0],
    taxButtons: Array.prototype.slice.call(
      document.getElementById('taxUnitTg').querySelectorAll('button'))
      .map(function(b){ return b.dataset.u; })
  };
};
window.__sections = function(){
  var out = {};
  /* REFINEMENT §1 — sec1 (Qualification Snapshot) was deleted; sec2 remains. */
  ['sec1','sec2'].forEach(function(id){
    var el = document.getElementById(id); if(!el) return;
    var body = el.querySelector('.sec-body');
    out[id] = { collapsed: el.classList.contains('collapsed'),
                bodyHeight: body.getBoundingClientRect().height,
                headerVisible: el.querySelector('.sec-head').getBoundingClientRect().height > 10,
                innerTextLength: (body.innerText||'').length,
                inert: body.hasAttribute('inert') };
  });
  out.answerLayerIsSection = document.getElementById('answerLayer').classList.contains('section');
  out.sec1Exists = !!document.getElementById('sec1');
  out.sectionCount = document.querySelectorAll('.section').length;
  out.capturedCollapsed = BSEState.capture().uiState ? null : null;
  return out;
};
window.__set = function(f, c, dpUnit, taxUnit){
  Object.keys(f).forEach(function(id){ var e=document.getElementById(id); if(e) e.value=f[id]; });
  Object.keys(c||{}).forEach(function(id){ var e=document.getElementById(id); if(e) e.checked=!!c[id]; });
  unitState.dp=dpUnit||'dollar'; unitState.tax=taxUnit||'dollarMo';
  renderUnitToggles(); recalc(); return true;
};
/* CORRECTION §2 — the desired-price block left its disclosure and is now in the
   primary view, so the label to read is the field's own. */
window.__whatIfLabel = function(){
  var el = document.querySelector('.dpfit .wi-target');
  return el ? el.innerText.trim() : null;
};
window.__ask = function(price){
  whatIfPrice = price; answerUi.whatif = true; recalc(); refreshWhatIf();
  var inp = resolvedInputs();
  var sol = requiredDownForPayment(whatIfInputs(inp), price, inp.target);
  var r = sol.recommended;
  return r ? { down:r.dpDollar, pct:r.dpPct, piti:r.piti, cashToClose:r.cashToClose,
               reserve:r.cashRemaining, loan:price - r.dpDollar, additional:r.dpDollar - 150000,
               fundsOk:r.fundsSufficient, dtiOk:r.dtiOk, back:r.back } : null;
};
window.__cards = function(){
  var s = powerSnapshot(resolvedInputs());
  return s ? { comfort:s.comfort, qual:s.qual, cash:s.cash, shopTo:s.shopTo,
               controlling:s.controlling.why } : null;
};
window.__answer = function(){ return (document.getElementById('answerBody')||{innerText:''}).innerText; };
/* Save-and-restore through the real canonical state layer. */
window.__roundTripUnit = function(value, unit){
  document.getElementById('taxRate').value = value;
  unitState.tax = unit; canonSet('tax', value, unit);
  renderUnitToggles(); recalc();
  var saved = BSEState.capture();
  /* Disturb everything, the way opening a different buyer would. */
  document.getElementById('taxRate').value = '1.99';
  unitState.tax = 'pct'; canonSet('tax', '1.99', 'pct');
  renderUnitToggles(); recalc();
  var okApplied = BSEState.apply(saved, { silent:true });
  return { applied: okApplied, unit: unitState.tax,
           value: document.getElementById('taxRate').value,
           taxMonthly: gatherInputs().taxMonthly, taxRate: gatherInputs().taxRate };
};
`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(String(e)));
  await page.goto('file://' + path.resolve(appPath));
  await page.addScriptTag({ content: SETUP });
  await page.waitForTimeout(300);

  /* ================================================================
     1 · NEW-SESSION DEFAULTS
     ================================================================ */
  console.log('\n--- 1 · new-session property-tax default ---');
  const fresh = await page.evaluate(() => window.__fresh());
  ok('$/MO is the default property-tax mode', fresh.taxUnit === 'dollarMo', fresh);
  ok('the $/MO button is the active one', fresh.activeTaxBtn === 'dollarMo', fresh);
  ok('all three modes are offered — % , $/MO , $/YR',
     fresh.taxButtons.join(',') === 'pct,dollarMo,dollar', fresh.taxButtons);
  ok('the tax field ships EMPTY — a stale 1.20 in a $/MO field would mean $1.20/mo',
     fresh.taxValue === '', JSON.stringify(fresh.taxValue));

  /* ================================================================
     2 · A MISSING TAX IS VISIBLE, NOT SILENT
     ================================================================ */
  console.log('\n--- 2 · blank property tax is flagged ---');
  const blankFlag = await page.evaluate(() => window.__answer());
  ok('a blank property tax is flagged on the answer layer',
     /Property tax has not been entered/i.test(blankFlag), blankFlag.slice(0, 300));
  ok('the flag says the figures above are overstated',
     /overstated/i.test(blankFlag));

  /* The size of the error the flag exists to prevent. */
  await page.evaluate(() => window.__set({
    price: '', score: '788', ownFunds: '200,000', gift: '0', dpTarget: '150,000',
    target: '3,000', income: '9,500', debts: '40', rateConv: '6.750', ccPct: '3',
    taxRate: '', hoi: '250' }, { hoaNA: true, cddNA: true, floodNA: true }, 'dollar', 'dollarMo'));
  const noTax = await page.evaluate(() => window.__cards());
  await page.evaluate(() => window.__set({ taxRate: '582' }, {}, 'dollar', 'dollarMo'));
  const withTax = await page.evaluate(() => window.__cards());
  ok('a zero tax overstates Comfort Shopping Max by more than $50,000 — which is why it is flagged',
     noTax.comfort - withTax.comfort > 50000,
     { zeroTax: Math.round(noTax.comfort), withTax: Math.round(withTax.comfort) });
  const withTaxFlag = await page.evaluate(() => window.__answer());
  ok('once a tax is entered the flag disappears',
     !/Property tax has not been entered/i.test(withTaxFlag));
  ok('and no warning replaces it — a fixed monthly tax is a legitimate assumption',
     !/does not scale as the price moves/i.test(withTaxFlag));

  /* ================================================================
     3 · SAVED TAX UNITS RESTORE AS AUTHORED
     ================================================================ */
  console.log('\n--- 3 · a saved buyer restores its own authored tax unit ---');
  for (const [unit, value, expectMonthly, expectRate] of [
      ['pct', '1.20', null, 1.2],
      ['dollarMo', '582.26', 582.26, 0],
      ['dollar', '6,987.12', 582.26, 0]]) {
    const rt = await page.evaluate(([v, u]) => window.__roundTripUnit(v, u), [value, unit]);
    ok('authored ' + unit + ' restores its unit verbatim', rt.applied && rt.unit === unit, rt);
    ok('  …and its value verbatim (' + value + ')', rt.value === value, rt);
    if (expectMonthly === null)
      ok('  …and resolves as a rate, not an amount', rt.taxMonthly === null && near(rt.taxRate, expectRate, 0.001), rt);
    else
      ok('  …and resolves to ' + expectMonthly + '/mo', near(rt.taxMonthly, expectMonthly, 0.005), rt);
  }

  /* ================================================================
     4 · SECTIONS COLLAPSED BY DEFAULT — AND CAPTURES SURVIVE
     ================================================================ */
  console.log('\n--- 4 · Qualification Snapshot and Property Strategy collapsed by default ---');
  const fresh2 = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await fresh2.goto('file://' + path.resolve(appPath));
  await fresh2.addScriptTag({ content: SETUP });
  await fresh2.waitForTimeout(400);
  const sec = await fresh2.evaluate(() => window.__sections());

  /* REFINEMENT §1 — the lower Qualification Snapshot is DELETED. It restated
     the three figures the answer layer already leads with. */
  ok('the duplicate Qualification Snapshot section is gone', sec.sec1 === undefined, sec.sec1);
  ok('  …and no element is left carrying its id', sec.sec1Exists === false, sec.sec1Exists);

  ok('Property Strategy is collapsed on load in Shopping Range Mode', sec.sec2.collapsed === true, sec.sec2);
  ok('  …its body measures 0px', sec.sec2.bodyHeight === 0, sec.sec2);
  ok('  …and its inputs are inert', sec.sec2.inert === true, sec.sec2);

  ok('the answer layer is NOT a .section — it can never be collapsed away',
     sec.answerLayerIsSection === false && sec.sectionCount === 1, sec);

  /* Expanding still works on the section that remains. */
  await fresh2.click('#sec2 .sec-head');
  const expanded = await fresh2.evaluate(() => window.__sections());
  ok('clicking the header expands Property Strategy',
     expanded.sec2.collapsed === false && expanded.sec2.bodyHeight > 20, expanded.sec2);
  ok('  …and expanding clears inert', expanded.sec2.inert === false, expanded.sec2);
  await fresh2.click('#sec2 .sec-head');
  const recollapsed = await fresh2.evaluate(() => window.__sections());
  ok('clicking again re-collapses it and restores inert',
     recollapsed.sec2.collapsed === true && recollapsed.sec2.inert === true, recollapsed.sec2);
  await fresh2.close();

  /* ================================================================
     5 · THE WHAT-IF LABEL NAMES THE TARGET PAYMENT
     ================================================================ */
  console.log('\n--- 5 · dynamic what-if label ---');
  for (const [entered, shown] of [['3,000', '$3,000'], ['3,500', '$3,500'], ['4,250', '$4,250']]) {
    await page.evaluate(t => window.__set({ target: t }, {}, 'dollar', 'dollarMo'), entered);
    const label = await page.evaluate(() => window.__whatIfLabel());
    ok('target ' + shown + ' → the prompt names the comfort payment',
       label === 'what would it take to make this home fit the ' + shown + '/mo comfort payment?', label);
  }
  const stale = await page.evaluate(() => window.__whatIfLabel());
  ok('the old static wording is gone', !/want to spend more/i.test(stale), stale);

  /* ================================================================
     6 · THE PINNED $499,900 MANUAL CASE — BOTH RATES
     ================================================================ */
  console.log('\n--- 6 · pinned $499,900 / $3,000 what-if ---');
  const PROFILE = {
    price: '', score: '788', ownFunds: '200,000', gift: '0', dpTarget: '150,000',
    target: '3,000', income: '9,500', debts: '40', ccPct: '3', taxRate: '582', hoi: '250'
  };
  const CASES = [
    { rate: '6.875', label: 'at 6.875% — reproduces the manual run EXACTLY',
      down: 169900, additional: 19900, piti: 3000, cash: 179800, reserve: 20200, loan: 330000 },
    { rate: '6.750', label: 'at 6.750% — the rate listed alongside it',
      down: 165700, additional: 15700, piti: 3000, cash: 175726, reserve: 24274, loan: 334200 }
  ];
  for (const c of CASES) {
    await page.evaluate(p => window.__set(p, { hoaNA: true, cddNA: true, floodNA: true }, 'dollar', 'dollarMo'),
                        Object.assign({}, PROFILE, { rateConv: c.rate }));
    const r = await page.evaluate(() => window.__ask(499900));
    console.log('        ' + c.label);
    ok('  required down payment is $' + c.down.toLocaleString(), near(r.down, c.down, 1), r.down);
    ok('  additional down needed is $' + c.additional.toLocaleString(), near(r.additional, c.additional, 1), r.additional);
    ok('  estimated PITI is $' + c.piti.toLocaleString(), near(r.piti, c.piti, 1), r.piti);
    ok('  estimated cash to close is $' + c.cash.toLocaleString(), near(r.cashToClose, c.cash, 1), r.cashToClose);
    ok('  remaining reserve is $' + c.reserve.toLocaleString(), near(r.reserve, c.reserve, 1), r.reserve);
    ok('  loan amount is $' + c.loan.toLocaleString(), near(r.loan, c.loan, 1), r.loan);
    ok('  all three checks pass', r.piti <= 3000.005 && r.dtiOk && r.fundsOk,
       { piti: r.piti, dtiOk: r.dtiOk, fundsOk: r.fundsOk, back: r.back });
  }

  /* ================================================================
     7 · THE THREE CARDS ARE UNCHANGED BY THE CLEANUP
     ================================================================ */
  console.log('\n--- 7 · the verified Shopping Range figures still hold ---');
  await page.evaluate(p => window.__set(p, { hoaNA: true, cddNA: true, floodNA: true }, 'dollar', 'dollarMo'),
                      Object.assign({}, PROFILE, { rateConv: '6.750' }));
  const cards = await page.evaluate(() => window.__cards());
  ok('Comfort Shopping Max is still $484,259', near(Math.round(cards.comfort), 484259, 1), cards.comfort);
  ok('Maximum Purchasing Power is still $674,670', near(Math.round(cards.qual), 674670, 1), cards.qual);
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
     near(Math.round(cards.cash), 1816667, 1), cards.cash);
  /* The card and the constraint decision must be ONE number, forever. */
  const oneCash = await page.evaluate(() => {
    const s = powerSnapshot(resolvedInputs());
    const conv = s.bp.filter(x => x.id === 'conv')[0];
    const ceil = s.P.list.filter(c => c.why === 'Cash to Close')[0];
    return { card: s.cash, scenario: conv ? conv.cashPrice : null, ceiling: ceil ? ceil.price : null };
  });
  ok('the card, the solver and the constraint ceiling are the same value',
     oneCash.card === oneCash.scenario && oneCash.card === oneCash.ceiling, oneCash);
  ok('and it is arithmetically $150,000 + ($200,000 \u2212 $150,000) / 3%',
     near(oneCash.card, 150000 + (200000 - 150000) / 0.03, 1), oneCash.card);
  ok('the controlling constraint is still Comfort Payment', cards.controlling === 'Comfort Payment', cards);

  /* ================================================================
     8 · ANSWER-FIRST ORDER
     ================================================================ */
  console.log('\n--- 8 · answer-first order on the primary screen ---');
  const body = await page.evaluate(() => window.__answer());
  /* CLEANUP §3/§5 — the third headline is DTI at Comfort Price. */
  const order = ['COMFORT PURCHASE PRICE', 'MAX QUALIFYING PRICE', 'DTI AT COMFORT PRICE',
                 'SHOP UP TO', 'DESIRED PURCHASE PRICE', 'RATE SENSITIVITY ON THIS HOME',
                 'What would a rate change do to the shopping range', 'Debt payoff lever'];
  let lastIdx = -1, inOrder = true, offender = null;
  for (const token of order) {
    const i = body.indexOf(token);
    if (i < 0 || i < lastIdx) { inOrder = false; offender = token; break; }
    lastIdx = i;
  }
  ok('the primary screen reads: three cards → SHOP UP TO → what-if → supporting tools',
     inOrder, offender ? 'out of order at: ' + offender : '');
  ok('no fourth primary buying-power card was added',
     (body.match(/CONTROLLING/g) || []).length === 1,
     (body.match(/CONTROLLING/g) || []).length);

  ok('no JavaScript errors during the whole suite', pageErrors.length === 0, pageErrors.slice(0, 3));

  await browser.close();
  console.log('');
  console.log('=========================================================');
  console.log('  JOB 1 CLOSEOUT — presentation contract');
  console.log('  app under test: ' + appPath);
  console.log('  PASS ' + pass + '   FAIL ' + fail);
  if (failures.length) failures.forEach(f => console.log('    ✗ ' + f));
  console.log('=========================================================');
  process.exit(fail ? 1 : 0);
})();
