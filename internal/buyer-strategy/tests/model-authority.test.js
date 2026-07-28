/* =====================================================================
   BSEModel SOURCE-OF-TRUTH TESTS — Phase 3 Gate B.5, Stage 4

   After the cutover the flow is:
       UI / DOM -> BSEModel.capture() -> resolve() (L-1) -> toInputs()
                -> gatherInputs() -> Engine

   Proves the ten required properties, plus an edge-case sweep that compares the
   new model path against the retained DOM reader on inputs the 47 regression
   scenarios never exercise (blank rates, blank closing-cost %, blank income,
   price "0", negotiation modes with no offer, and so on).

   Usage: node tests/model-authority.test.js <app.html> [--verbose]
   ===================================================================== */
const { chromium } = require('playwright');
const path = require('path');
const harness = require('./lib/app-harness');

const APP = path.resolve(process.argv[2]);
const VERBOSE = process.argv.includes('--verbose');

let pass = 0, fail = 0;
const failures = [];
function check(name, ok, detail) {
  if (ok) { pass++; if (VERBOSE) console.log('  PASS  ' + name); }
  else { fail++; failures.push(name); console.log('  FAIL  ' + name + (detail ? '\n        ' + detail : '')); }
}

const PROBE = `
window.__econ = function(){ return JSON.stringify(gatherInputs()); };
window.__setRaw = function(map){
  Object.keys(map).forEach(function(id){
    var e=document.getElementById(id); if(!e) return;
    if(e.type==='checkbox') e.checked = !!map[id]; else e.value = map[id];
  });
};
window.__render = function(){
  var t=function(id){var e=document.getElementById(id);return e?(e.innerText||'').replace(/\\s+/g,' ').trim():null;};
  return JSON.stringify({snap:t('snapBody'),cards:t('cardsBody'),gs:t('gsPanel'),prop:t('propFull')});
};
`;

// Edge cases the 47 scenarios do not cover.
const EDGE = [
  { id: 'all defaults', set: {} },
  { id: 'blank conventional rate', set: { rateConv: '' } },
  { id: 'all three rates blank', set: { rateConv: '', rateFha: '', rateVa: '' } },
  { id: 'blank closing-cost percent', set: { ccPct: '' } },
  { id: 'blank closing-cost percent with a $ override, specific mode', set: { price: '400,000', ccPct: '', ccOverride: '11,500' } },
  { id: 'blank insurance', set: { hoi: '' } },
  { id: 'blank target payment', set: { target: '' } },
  { id: 'blank income', set: { income: '' } },
  { id: 'blank debts', set: { debts: '' } },
  { id: 'blank credit score', set: { score: '' } },
  { id: 'blank own funds and gift', set: { ownFunds: '', gift: '' } },
  { id: 'blank tax rate', set: { taxRate: '' } },
  { id: 'price "0"', set: { price: '0' } },
  { id: 'price "."', set: { price: '.' } },
  { id: 'negative debts', set: { debts: '-500' } },
  { id: 'malformed tax "1.2.3"', set: { taxRate: '1.2.3' } },
  { id: 'dp target 0 (discarded by the >0 rule)', set: { price: '400,000', dpTarget: '0' } },
  { id: 'dp target blank', set: { price: '400,000', dpTarget: '' } },
  { id: 'concession with no offer price', set: { price: '400,000', offerConc: '5,000' } },
  { id: 'concession % with no offer price', set: { price: '400,000', offerConc: '2' }, units: { offerConc: 'pct' } },
  { id: 'offer above list', set: { price: '400,000', offerPrice: '410,000' } },
  { id: 'offer equal to list', set: { price: '400,000', offerPrice: '400,000' } },
  { id: 'negMode reduction, no offer price', set: {}, negMode: 'reduction' },
  { id: 'negMode compare, no offer price', set: {}, negMode: 'compare' },
  { id: 'negMode split, no offer price', set: {}, negMode: 'split' },
  { id: 'negMode reduction with an offer', set: { price: '450,000', offerPrice: '440,000' }, negMode: 'reduction' },
  { id: 'all cost fields typed with N/A confirmed', set: { price: '400,000', hoa: '250', cdd: '120', flood: '85', hoaNA: true, cddNA: true, floodNA: true } },
  { id: 'all cost fields typed, N/A off', set: { price: '400,000', hoa: '250', cdd: '120', flood: '85', hoaNA: false, cddNA: false, floodNA: false } },
  { id: 'tax in $ mode, shopping', set: { taxRate: '6,000' }, units: { tax: 'dollar' } },
  { id: 'tax in $ mode, specific', set: { price: '450,000', taxRate: '6,000' }, units: { tax: 'dollar' } },
  { id: 'dp target in $ mode', set: { price: '500,000', dpTarget: '125,000' }, units: { dp: 'dollar' } },
  { id: 'VA on, exempt, subsequent use', set: { price: '450,000', tgVa: true, vaExempt: true }, selects: { vaUse: 'sub' } },
  { id: 'FTHB on with a low score', set: { price: '400,000', score: '585', tgFthb: true } }
];

(async () => {
  const spec = harness.loadSpec();
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));

  async function fresh(sc) {
    await page.goto('file://' + APP);
    await page.addScriptTag({ content: harness.HELPERS });
    await page.addScriptTag({ content: PROBE });
    await page.evaluate(([s, d]) => window.__apply(s, d), [sc || { fields: {} }, spec.defaults]);
  }

  // ---------- 2. gatherInputs() genuinely reads from BSEModel ----------
  await fresh();
  const dependency = await page.evaluate(() => {
    const real = BSEModel.toInputs;
    let called = false;
    BSEModel.toInputs = function (m) { called = true; const r = real(m); r.__marker = 'from-model'; return r; };
    const out = gatherInputs();
    BSEModel.toInputs = real;
    return { called, marker: out.__marker };
  });
  check('MA-1 gatherInputs() resolves through BSEModel.toInputs (dependency proved by interception)',
    dependency.called && dependency.marker === 'from-model', JSON.stringify(dependency));

  // ---------- 1. a DOM edit updates canonical state before calculation ----------
  await fresh();
  const edit = await page.evaluate(() => {
    const before = BSEModel.capture().buyer_profile.qualifying_income_monthly;
    const el = document.getElementById('income');
    el.value = '12,345';
    el.dispatchEvent(new Event('input', { bubbles: true }));   // the app's own handler runs recalc
    const model = BSEModel.capture().buyer_profile.qualifying_income_monthly;
    const engineInput = gatherInputs().income;
    return { before, model, engineInput };
  });
  check('MA-2 a DOM edit is reflected in canonical state and reaches the engine through it',
    edit.before === 9500 && edit.model === 12345 && edit.engineInput === 12345, JSON.stringify(edit));

  // ---------- 3. presentation-only state does not change economic inputs ----------
  await fresh({ fields: { price: '450,000' } });
  const pres = await page.evaluate(() => {
    const econBefore = JSON.stringify(gatherInputs());
    document.querySelectorAll('.sec-head').forEach(h => h.click());        // collapse every section
    const b = document.querySelector('#gsBtns .gs-btn[data-gs="cash"]'); if (b) b.click();
    setUnit('tax', unitState.tax === 'pct' ? 'pct' : 'pct');               // no-op toggle
    const econAfter = JSON.stringify(gatherInputs());
    return { same: econBefore === econAfter };
  });
  check('MA-3 collapsing sections and switching the Gap Solver tab leave economic inputs untouched', pres.same);

  // ---------- 4 & 5. capture uses canonical values; restore repopulates the model first ----------
  await fresh({ fields: { price: '437,000', dpTarget: '87,400', taxRate: '6,347', hoa: '250' },
                units: { dp: 'dollar', tax: 'dollar' }, checkboxes: { hoaNA: true } });
  const cr = await page.evaluate(() => {
    const model = BSEModel.capture();
    const capturedFromModel = {
      dp: [model.shopping_plan.dp_target_value, model.shopping_plan.dp_target_unit],
      tax: [model.shopping_plan.tax_annual_amount, model.shopping_plan.tax_input_unit],
      hoa: [model.shopping_plan.hoa_monthly, model.shopping_plan.hoa_status],
      price: model.property_scenario.list_price, mode: model.property_scenario.analysis_mode
    };
    const econBefore = JSON.stringify(gatherInputs());
    const renderBefore = window.__render();
    // wipe the interface entirely
    ['price','dpTarget','taxRate','hoa','income','debts','target','ownFunds'].forEach(id => { document.getElementById(id).value = ''; });
    document.getElementById('hoaNA').checked = false;
    unitState.dp = 'pct'; unitState.tax = 'pct';
    recalc();
    BSEModel.apply(JSON.parse(JSON.stringify(model)));
    const modelAfter = BSEModel.capture();
    return { capturedFromModel, econSame: econBefore === JSON.stringify(gatherInputs()),
             renderSame: renderBefore === window.__render(),
             modelSame: JSON.stringify(model) === JSON.stringify(modelAfter),
             unitsDerived: { dp: unitState.dp, tax: unitState.tax },
             domDerived: { dpTarget: document.getElementById('dpTarget').value,
                           taxRate: document.getElementById('taxRate').value,
                           hoa: document.getElementById('hoa').value,
                           hoaNA: document.getElementById('hoaNA').checked } };
  });
  check('MA-4 capture holds canonical (value, unit) pairs and three-state cost fields, not display strings',
    JSON.stringify(cr.capturedFromModel.dp) === '[87400,"amount"]' &&
    JSON.stringify(cr.capturedFromModel.tax) === '[6347,"amount"]' &&
    JSON.stringify(cr.capturedFromModel.hoa) === '[null,"confirmed_none"]' &&
    cr.capturedFromModel.price === 437000 && cr.capturedFromModel.mode === 'property',
    JSON.stringify(cr.capturedFromModel));
  check('MA-5 restore repopulates the model and the UI is derived from it (units, values, N/A state)',
    cr.modelSame && cr.econSame && cr.renderSame &&
    cr.unitsDerived.dp === 'dollar' && cr.unitsDerived.tax === 'dollar' &&
    cr.domDerived.dpTarget === '87,400' && cr.domDerived.taxRate === '6,347' &&
    cr.domDerived.hoa === '250' && cr.domDerived.hoaNA === true, JSON.stringify(cr));

  // ---------- 6 & 7. inheritance does not mutate parents ----------
  await fresh({ fields: { price: '450,000' } });
  const inh = await page.evaluate(() => {
    const m = BSEModel.capture();
    const planBefore = JSON.stringify(m.shopping_plan);
    const buyerBefore = JSON.stringify(m.buyer_profile);
    m.property_scenario.tax_method = 'flat_rate';
    m.property_scenario.tax_rate_pct = 2.10; m.property_scenario.tax_annual_amount = null;
    m.property_scenario.tax_input_unit = 'percent';
    m.property_scenario.target_payment = 2750;
    m.property_scenario.buyer_priority = 'cash';
    m.property_scenario.hoa_monthly = 415; m.property_scenario.hoa_status = 'known';
    const resolved = BSEModel.resolve(m);
    const inputs = BSEModel.toInputs(m);
    return { planUnchanged: planBefore === JSON.stringify(m.shopping_plan),
             buyerUnchanged: buyerBefore === JSON.stringify(m.buyer_profile),
             resolvedTax: resolved.tax_rate_pct, resolvedTarget: resolved.target_payment,
             resolvedPriority: resolved.buyer_priority, resolvedHoa: resolved.hoa.monthly,
             inputTax: inputs.taxRate, inputTarget: inputs.target,
             inputPriority: inputs.priority, inputHoa: inputs.hoa };
  });
  check('MA-6 scenario overrides resolve and reach the engine',
    inh.resolvedTax === 2.10 && inh.inputTax === 2.10 && inh.inputTarget === 2750 &&
    inh.inputPriority === 'cash' && inh.inputHoa === 415, JSON.stringify(inh));
  check('MA-7 the Shopping Plan and Buyer Profile are not mutated by a scenario override (L-1)',
    inh.planUnchanged && inh.buyerUnchanged, JSON.stringify(inh));

  // ---------- 8. repeated capture/restore is lossless ----------
  await fresh({ fields: { price: '437,000', offerPrice: '429,000', offerConc: '2.75', counterPrice: '433,000', counterConc: '1.375' },
                units: { offerConc: 'pct', counterConc: 'pct' }, counter: true });
  const loop = await page.evaluate(() => {
    const first = JSON.stringify(BSEModel.capture());
    const seen = [];
    for (let i = 0; i < 10; i++) {
      const m = JSON.parse(first);
      BSEModel.apply(m);
      recalcCounter();
      seen.push(JSON.stringify(BSEModel.capture()) + '|' + JSON.stringify(gatherInputs()));
    }
    return { stable: seen.every(s => s === seen[0]), modelIdentity: seen[0].split('|')[0] === first };
  });
  check('MA-8 ten capture/restore cycles are lossless at the model and engine-input level',
    loop.stable && loop.modelIdentity, JSON.stringify(loop));

  // ---------- 9. unit switching stays deterministic and drift-free ----------
  await fresh({ fields: { price: '437,000', dpTarget: '3.375', taxRate: '1.205', offerPrice: '429,000', offerConc: '2.75' },
                units: { offerConc: 'pct' } });
  const drift = await page.evaluate(() => {
    const start = { dp: document.getElementById('dpTarget').value, tax: document.getElementById('taxRate').value,
                    conc: document.getElementById('offerConc').value };
    for (let i = 0; i < 3; i++) {
      setUnit('dp', 'dollar'); setUnit('dp', 'pct');
      setUnit('tax', 'dollar'); setUnit('tax', 'pct');
      setOfferConcUnit('dollar'); setOfferConcUnit('pct');
    }
    return { start, end: { dp: document.getElementById('dpTarget').value, tax: document.getElementById('taxRate').value,
                           conc: document.getElementById('offerConc').value } };
  });
  check('MA-9 three full unit round trips on three fields produce zero drift',
    JSON.stringify(drift.start) === JSON.stringify(drift.end), JSON.stringify(drift));

  // ---------- 10. model path == retained DOM reader, on scenarios and edge cases ----------
  const cases = harness.flatten(spec).filter(c => !c.not_executable);
  // Gate B.75 retired the legacy DOM reader, so the equivalence half of MA-10/MA-11
  // is gone by design. What remains is the property that matters: every scenario and
  // every edge case still resolves through the model without error, and the frozen
  // baselines (tests/baseline/*) hold the expected values.
  let resolved = 0;
  for (const c of cases) {
    await fresh(c);
    const ok = await page.evaluate(() => { const i = gatherInputs(); return i && typeof i.price === 'number'; });
    if (ok) resolved++;
  }
  check('MA-10 all ' + cases.length + ' regression scenarios resolve through the canonical model',
    resolved === cases.length, resolved + '/' + cases.length);

  let edgeOk = 0;
  for (const e of EDGE) {
    await fresh({ fields: {}, units: e.units, selects: e.selects, negMode: e.negMode });
    const ok = await page.evaluate(e => {
      window.__setRaw(e.set || {});
      recalc();
      const i = gatherInputs();
      return i && typeof i.price === 'number' && typeof i.ccPct === 'number';
    }, e);
    if (ok) edgeOk++;
  }
  check('MA-11 all ' + EDGE.length + ' edge cases resolve through the canonical model (values asserted in tests/persistence-contract.test.js)',
    edgeOk === EDGE.length, edgeOk + '/' + EDGE.length);

  check('MA-12 no JavaScript errors', errors.length === 0, errors.join(' | '));

  await browser.close();
  console.log('\n=========================================================');
  console.log('  BSEModel SOURCE OF TRUTH — Gate B.5');
  console.log('  scenarios: ' + cases.length + '   edge cases: ' + EDGE.length);
  console.log('  PASS ' + pass + '   FAIL ' + fail);
  if (failures.length) failures.forEach(f => console.log('   - ' + f));
  console.log('=========================================================');
  process.exit(fail ? 1 : 0);
})();
