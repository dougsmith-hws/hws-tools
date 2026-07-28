/* =====================================================================
   PERSISTENCE CONTRACT — Phase 3 Gate B.75

   Locks the four contracts that must hold before any database exists:

     P1  ONE SOURCE OF TRUTH   — no legacy DOM path; a DOM mutation that
                                 bypasses the model cannot become authoritative
     P2  BLANK INHERITANCE     — blank inherits the assumption-set default;
                                 an explicit 0 is an authored zero and wins
     P3  AUTHORED vs RESOLVED  — the inherited value is never written back
     P4  PENDING RECONCILED    — concession-before-price and mode-before-round
                                 are first-class scenario state, never lost
     P5  result_summary        — cache only. Recompute always wins.

   Usage: node tests/persistence-contract.test.js <app.html> [--verbose]
   ===================================================================== */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const harness = require('./lib/app-harness');

const APP = path.resolve(process.argv[2]);
const VERBOSE = process.argv.includes('--verbose');
const EDGE_BASELINE = path.join(__dirname, 'baseline', 'edge-inputs-baseline.json');
const EDGE = JSON.parse(fs.readFileSync(path.join(__dirname, 'edge-cases.json'), 'utf8'));

let pass = 0, fail = 0;
const failures = [];
function check(name, ok, detail) {
  if (ok) { pass++; if (VERBOSE) console.log('  PASS  ' + name); }
  else { fail++; failures.push(name); console.log('  FAIL  ' + name + (detail ? '\n        ' + detail : '')); }
}
const REL = 1e-9, ABS = 1e-6;
const near = (a, b) => (a == null && b == null) || (a != null && b != null && Math.abs(a - b) <= Math.max(ABS, REL * Math.max(Math.abs(a), Math.abs(b))));

const PROBE = `
window.__setRaw = function(map){
  Object.keys(map).forEach(function(id){
    var e=document.getElementById(id); if(!e) return;
    if(e.type==='checkbox') e.checked = !!map[id]; else e.value = map[id];
  });
};
window.__headline = function(){
  var i = gatherInputs(), res = Engine.run(i, A_CONST);
  var pick = res.scenarios.length ? Engine.pickBestOverall(res.scenarios, i) : null;
  return { rates: i.rates, ccPct: i.ccPct,
           scenarios: res.scenarios.map(function(s){ return {id:s.id, dp:s.dp, piti:s.piti,
             cashToClose:s.cashToClose, maxPrice:s.maxPrice, binding:s.binding}; }),
           pick: pick ? {id:pick.id, dp:pick.dp, piti:pick.piti} : null };
};
`;

(async () => {
  const spec = harness.loadSpec();
  const frozen = JSON.parse(fs.readFileSync(EDGE_BASELINE, 'utf8')).cases;
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

  // ================= P1 — one source of truth =================
  const source = fs.readFileSync(APP, 'utf8');
  check('P1-1 __legacyGatherInputsFromDom is absent from the application source',
    !source.includes('__legacyGatherInputsFromDom'));
  check('P1-2 no other DOM-only gather path exists (exactly one gatherInputs definition, and it delegates)',
    (source.match(/function gatherInputs\(/g) || []).length === 1 &&
    /function gatherInputs\(\)\{[^}]*BSEModel\.toInputs\(BSEModel\.capture\(\)\)/s.test(source));

  await fresh();
  const dep = await page.evaluate(() => {
    const real = BSEModel.toInputs;
    let called = false;
    BSEModel.toInputs = function (m) { called = true; return real(m); };
    gatherInputs();
    BSEModel.toInputs = real;
    return called;
  });
  check('P1-3 gatherInputs() obtains its economic values from BSEModel', dep);

  // A DOM mutation that never reaches the model cannot become authoritative.
  await fresh({ fields: { price: '400,000' } });
  const bypass = await page.evaluate(() => {
    const before = gatherInputs().income;
    // capture a model snapshot, then poke the DOM behind the model's back
    const model = BSEModel.capture();
    document.getElementById('income').value = '99,999';       // no event, no model update
    const viaModel = BSEModel.toInputs(model).income;         // the captured canonical state
    const afterRestore = (BSEModel.apply(JSON.parse(JSON.stringify(model))), gatherInputs().income);
    return { before, viaModel, afterRestore, domNow: document.getElementById('income').value };
  });
  check('P1-4 a raw DOM write that bypasses the model cannot survive a canonical restore',
    bypass.before === 9500 && bypass.viaModel === 9500 && bypass.afterRestore === 9500,
    JSON.stringify(bypass));

  await fresh({ fields: { price: '400,000' } });
  const capRestore = await page.evaluate(() => {
    const m = BSEModel.capture();
    const usesModel = m.buyer_profile && m.shopping_plan && m.property_scenario && m.presentation;
    document.getElementById('target').value = '';
    document.getElementById('price').value = '';
    recalc();
    BSEModel.apply(JSON.parse(JSON.stringify(m)));
    const i = gatherInputs();
    return { usesModel, target: i.target, price: i.price };
  });
  check('P1-5 state capture uses BSEModel and restore repopulates it before calculation',
    capRestore.usesModel && capRestore.target === 3200 && capRestore.price === 400000,
    JSON.stringify(capRestore));

  // ================= P2 / P3 — blank inheritance =================
  const BLANK = [
    { id: 'blank conv rate inherits the assumption set', set: { rateConv: '' },
      expect: i => i.rates.conv === 6.750, authored: m => m.shopping_plan.rate_conv === null },
    { id: 'blank FHA rate inherits 6.250', set: { rateFha: '' },
      expect: i => i.rates.fha === 6.250, authored: m => m.shopping_plan.rate_fha === null },
    { id: 'blank VA rate inherits 6.125', set: { rateVa: '' },
      expect: i => i.rates.va === 6.125, authored: m => m.shopping_plan.rate_va === null },
    { id: 'blank closing-cost percent inherits 3.00', set: { ccPct: '' },
      expect: i => i.ccPct === 3.00, authored: m => m.shopping_plan.closing_cost_pct === null },
    { id: 'explicit zero rate stays 0 (authored zero wins)', set: { rateConv: '0' },
      expect: i => i.rates.conv === 0, authored: m => m.shopping_plan.rate_conv === 0 },
    { id: 'explicit zero closing-cost percent stays 0', set: { ccPct: '0' },
      expect: i => i.ccPct === 0, authored: m => m.shopping_plan.closing_cost_pct === 0 },
    { id: 'authored nonzero rate wins over the default', set: { rateConv: '7.125' },
      expect: i => i.rates.conv === 7.125, authored: m => m.shopping_plan.rate_conv === 7.125 },
    { id: 'authored nonzero closing-cost percent wins', set: { ccPct: '2.5' },
      expect: i => i.ccPct === 2.5, authored: m => m.shopping_plan.closing_cost_pct === 2.5 }
  ];
  for (const b of BLANK) {
    await fresh();
    const r = await page.evaluate(set => {
      window.__setRaw(set); recalc();
      const m = BSEModel.capture();
      return { inputs: JSON.parse(JSON.stringify(gatherInputs())), model: JSON.parse(JSON.stringify(m)) };
    }, b.set);
    check('P2 ' + b.id, b.expect(r.inputs), JSON.stringify(r.inputs.rates) + ' ccPct=' + r.inputs.ccPct);
    check('P3 ' + b.id + ' — the authored record still records what was authored',
      b.authored(r.model), JSON.stringify({ rate_conv: r.model.shopping_plan.rate_conv,
                                            rate_fha: r.model.shopping_plan.rate_fha,
                                            rate_va: r.model.shopping_plan.rate_va,
                                            cc: r.model.shopping_plan.closing_cost_pct }));
  }

  // scenario-level override still beats the plan and the default
  await fresh({ fields: { price: '450,000', rateConv: '' } });
  const ovr = await page.evaluate(() => {
    const m = BSEModel.capture();
    const inherited = BSEModel.toInputs(m).rates.conv;
    m.property_scenario.rate_conv = 5.875;
    const overridden = BSEModel.toInputs(m).rates.conv;
    return { inherited, overridden, planStill: m.shopping_plan.rate_conv };
  });
  check('P2 hierarchy: scenario override > plan authored > assumption-set default',
    ovr.inherited === 6.750 && ovr.overridden === 5.875 && ovr.planStill === null, JSON.stringify(ovr));

  // capture -> restore -> resolve: blank stays blank in canonical state
  await fresh({ fields: { rateConv: '', ccPct: '' } });
  const rt = await page.evaluate(() => {
    const m = BSEModel.capture();
    const before = { authoredRate: m.shopping_plan.rate_conv, authoredCc: m.shopping_plan.closing_cost_pct,
                     resolvedRate: BSEModel.resolve(m).rate_conv, resolvedCc: BSEModel.resolve(m).closing_cost_pct };
    BSEModel.apply(JSON.parse(JSON.stringify(m)));
    const m2 = BSEModel.capture();
    return { before, after: { authoredRate: m2.shopping_plan.rate_conv, authoredCc: m2.shopping_plan.closing_cost_pct,
                              resolvedRate: BSEModel.resolve(m2).rate_conv, resolvedCc: BSEModel.resolve(m2).closing_cost_pct },
             domRate: document.getElementById('rateConv').value, domCc: document.getElementById('ccPct').value };
  });
  check('P3 capture -> restore -> resolve: a blank authored value stays NULL and still resolves to the default',
    rt.before.authoredRate === null && rt.after.authoredRate === null &&
    rt.before.resolvedRate === 6.750 && rt.after.resolvedRate === 6.750 &&
    rt.after.authoredCc === null && rt.after.resolvedCc === 3.00 &&
    rt.domRate === '' && rt.domCc === '', JSON.stringify(rt));

  // ================= edge sweep against the frozen baseline =================
  const edgeBad = [];
  for (const e of EDGE) {
    await fresh({ fields: {}, units: e.units, selects: e.selects, negMode: e.negMode });
    const got = await page.evaluate(e => { window.__setRaw(e.set || {}); recalc(); return window.__headline(); }, e);
    const want = frozen[e.id];
    if (!want) { edgeBad.push(e.id + ' missing from the frozen baseline'); continue; }
    let bad = null;
    if (JSON.stringify(got.rates) !== JSON.stringify(want.inputs.rates)) bad = 'rates ' + JSON.stringify(got.rates);
    else if (!near(got.ccPct, want.inputs.ccPct)) bad = 'ccPct ' + got.ccPct;
    else if (got.scenarios.length !== want.scenarios.length) bad = 'scenario count';
    else got.scenarios.forEach((s, i) => {
      const w = want.scenarios[i];
      if (!bad && (s.id !== w.id || s.dp !== w.dp || !near(s.piti, w.piti) || !near(s.cashToClose, w.cashToClose) ||
                   !near(s.maxPrice, w.maxPrice) || s.binding !== w.binding))
        bad = s.id + '@' + s.dp + ' piti ' + s.piti + ' vs ' + w.piti;
    });
    if (bad) edgeBad.push(e.id + ' :: ' + bad);
  }
  check('P2 edge sweep — all ' + EDGE.length + ' cases match the frozen (oracle-verified) baseline',
    edgeBad.length === 0, edgeBad.slice(0, 4).join('\n        '));

  // ================= P4 — reconciled scenario fields =================
  check('P4-1 no "pending_" field name remains in the model', !/pending_(negotiation_mode|concession)/.test(source));

  await fresh({ fields: { price: '400,000', offerConc: '5,000' } });   // concession, no offer price
  const noPrice = await page.evaluate(() => {
    const m = BSEModel.capture(), r = BSEModel.resolve(m), i = BSEModel.toInputs(m);
    return { value: m.property_scenario.offer_concession_value, unit: m.property_scenario.offer_concession_unit,
             rounds: m.negotiation_rounds.length, resolvable: r.concession_resolvable,
             engineConcession: i.sellerConcession };
  });
  check('P4-2 a concession authored before an offer price is kept as a canonical (value, unit) pair on the scenario',
    noPrice.value === 5000 && noPrice.unit === 'amount' && noPrice.rounds === 0, JSON.stringify(noPrice));
  check('P4-3 it resolves against the list price when one exists, and is flagged resolvable',
    noPrice.resolvable === true && noPrice.engineConcession === 5000, JSON.stringify(noPrice));

  await fresh({ fields: { price: '', offerConc: '2' }, units: { offerConc: 'pct' } });  // % with no price at all
  const noBase = await page.evaluate(() => {
    const m = BSEModel.capture(), r = BSEModel.resolve(m), i = BSEModel.toInputs(m);
    return { value: m.property_scenario.offer_concession_value, unit: m.property_scenario.offer_concession_unit,
             resolvable: r.concession_resolvable, engineConcession: i.sellerConcession };
  });
  check('P4-4 a percentage concession with no price is retained as 2% and marked NOT resolvable, not converted to zero',
    noBase.value === 2 && noBase.unit === 'percent' && noBase.resolvable === false && noBase.engineConcession === 0,
    JSON.stringify(noBase));

  for (const mode of ['reduction', 'split', 'compare', 'concession']) {
    await fresh({ fields: {}, negMode: mode });
    const nm = await page.evaluate(() => {
      const m = BSEModel.capture();
      return { scenarioMode: m.property_scenario.negotiation_mode, rounds: m.negotiation_rounds.length,
               engineMode: BSEModel.toInputs(m).negotiationMode };
    });
    check('P4-5 negotiation mode "' + mode + '" selected before any round is first-class scenario state',
      nm.scenarioMode === mode && nm.rounds === 0 && nm.engineMode === mode, JSON.stringify(nm));
  }

  await fresh({ fields: { price: '450,000', offerPrice: '440,000', offerConc: '9,000' }, negMode: 'split' });
  const withRound = await page.evaluate(() => {
    const m = BSEModel.capture();
    const buyer = m.negotiation_rounds.filter(r => r.actor === 'buyer')[0];
    return { scenarioMode: m.property_scenario.negotiation_mode, roundMode: buyer && buyer.negotiation_mode,
             roundPrice: buyer && buyer.price, roundConc: buyer && buyer.concession_value,
             scenarioConc: m.property_scenario.offer_concession_value,
             engineMode: BSEModel.toInputs(m).negotiationMode, engineConc: BSEModel.toInputs(m).sellerConcession };
  });
  check('P4-6 once a price exists the round carries price + concession and snapshots the mode; the scenario keeps the authored pair',
    withRound.scenarioMode === 'split' && withRound.roundMode === 'split' && withRound.roundPrice === 440000 &&
    withRound.roundConc === 9000 && withRound.scenarioConc === 9000 && withRound.engineMode === 'split' &&
    withRound.engineConc === 9000, JSON.stringify(withRound));

  // ================= P5 — result_summary is cache only =================
  check('P5-1 the model declares result_summary non-authoritative', await page.evaluate(() => BSEModel.RESULT_SUMMARY_AUTHORITATIVE === false));

  // R-12 shape (Conv 20%, funds $120,000) — a real regression scenario whose true
  // winner is Conventional, with a deliberately false cached summary claiming FHA.
  await fresh({ fields: { price: '400,000', dpTarget: '20', ownFunds: '120,000' } });
  const stale = await page.evaluate(() => {
    const truth = BSEModel.buildResultSummary();
    const saved = BSEModel.capture();
    saved.result_summary = {                       // deliberately wrong
      cache_only: true, authoritative: false,
      recommended_program: 'fha', recommended_scenario_dp: 3.5,
      piti: 2000, cash_to_close: 1, binding_constraint: 'Nonsense',
      price: 1, max_price: 1, assumption_set_version: 'bogus', engine_version: 'bogus'
    };
    const loaded = BSEModel.loadWithRecompute(JSON.parse(JSON.stringify(saved)));
    const afterModel = BSEModel.capture();
    return { truth, loaded, cacheInCanonical: 'result_summary' in afterModel,
             engineNow: (function(){ const i = gatherInputs(), r = Engine.run(i, A_CONST);
                                     const p = Engine.pickBestOverall(r.scenarios, i);
                                     return { id: p.id, piti: p.piti }; })() };
  });
  check('P5-2 a stale cached summary is discarded on load and never enters canonical state',
    stale.cacheInCanonical === false && stale.loaded.cache_discarded.piti === 2000 &&
    stale.loaded.authoritative_source === 'recomputed', JSON.stringify(stale.loaded).slice(0, 300));
  check('P5-3 the recomputed result wins — Conventional, not the cached FHA $2,000',
    stale.loaded.result_summary.recommended_program === stale.truth.recommended_program &&
    near(stale.loaded.result_summary.piti, stale.truth.piti) &&
    stale.loaded.result_summary.recommended_program === 'conv' &&
    Math.abs(stale.loaded.result_summary.piti - 2000) > 100,
    'recomputed=' + JSON.stringify(stale.loaded.result_summary));
  check('P5-4 the engine itself is unaffected by the cache',
    stale.engineNow.id === stale.truth.recommended_program && near(stale.engineNow.piti, stale.truth.piti),
    JSON.stringify(stale.engineNow));
  check('P5-5 the load contract reports that the cache disagreed rather than silently accepting it',
    stale.loaded.cache_agreed_with_recompute === false);
  check('P5-6 a cached bestOverall never drives calculation after restore — the summary carries only recomputed values',
    stale.loaded.result_summary.cache_only === true && stale.loaded.result_summary.authoritative === false &&
    stale.loaded.result_summary.assumption_set_version === '2026.07-baseline');

  check('P6 no JavaScript errors', errors.length === 0, errors.join(' | '));

  await browser.close();
  console.log('\n=========================================================');
  console.log('  PERSISTENCE CONTRACT — Gate B.75');
  console.log('  edge cases: ' + EDGE.length);
  console.log('  PASS ' + pass + '   FAIL ' + fail);
  if (failures.length) failures.forEach(f => console.log('   - ' + f));
  console.log('=========================================================');
  process.exit(fail ? 1 : 0);
})();
