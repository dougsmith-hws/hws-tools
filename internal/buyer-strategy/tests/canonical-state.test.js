/* =====================================================================
   BSE — CANONICAL APPLICATION STATE TESTS (Phase 3 Gate B, Stage 2)

   Proves, on every executable regression scenario:
     C1  DOM INPUT -> CANONICAL STATE -> ENGINE INPUT is lossless
     C2  DOM INPUT -> CANONICAL STATE -> CALCULATION == the live calculation
     C3  CANONICAL STATE -> DOM -> CALCULATION reproduces the same results,
         restoring into a deliberately contaminated session
     C4  repeated capture/restore cycles are stable
   and, as targeted checks:
     C5  L-1 inheritance: a scenario override wins and never writes back
     C6  §15 DTI resolution: program default -> buyer override -> scenario override
     C7  §9 assumption set is immutable and carries buydown 0.25
     C8  prohibited data (Phase 0) is absent from the canonical model
     C9  presentation state cannot alter economic state
     C10 M-1 still holds after Gate B: restore never runs a unit conversion

   Usage: node tests/canonical-state.test.js <app.html> [--verbose]
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

const REL = 1e-9, ABS = 1e-6;
function deepDiff(a, b, p) {
  p = p || '';
  if (a === b) return null;
  if (typeof a === 'number' && typeof b === 'number') {
    if (Math.abs(a - b) <= Math.max(ABS, REL * Math.max(Math.abs(a), Math.abs(b)))) return null;
    return p + ': ' + a + ' vs ' + b;
  }
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') {
    return p + ': ' + JSON.stringify(a) + ' vs ' + JSON.stringify(b);
  }
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    const d = deepDiff(a[k], b[k], p ? p + '.' + k : k);
    if (d) return d;
  }
  return null;
}

const PROBE = `
window.__probe = function(){
  var model = BSEModel.capture();
  var fromDom = JSON.parse(JSON.stringify(gatherInputs()));
  var fromModel = JSON.parse(JSON.stringify(BSEModel.toInputs(model)));
  var runDom = null, runModel = null;
  try { runDom = JSON.parse(JSON.stringify(Engine.run(gatherInputs(), A_CONST))); } catch(e){ runDom = {error:String(e)}; }
  try { runModel = JSON.parse(JSON.stringify(Engine.run(BSEModel.toInputs(model), A_CONST))); } catch(e){ runModel = {error:String(e)}; }
  return { model: JSON.parse(JSON.stringify(model)), fromDom: fromDom, fromModel: fromModel,
           runDom: runDom, runModel: runModel };
};
window.__outputs = function(){
  var t=function(id){var e=document.getElementById(id);return e?(e.innerText||'').replace(/\\s+/g,' ').trim():null;};
  return { snapBody:t('snapBody'), cardsBody:t('cardsBody'), gsPanel:t('gsPanel'), negMount:t('negMount'),
           propFull:t('propFull'), coPanels:t('coPanels'), counterBody:t('counterBody'), modeBadge:t('modeBadge'),
           dom:{ price:(document.getElementById('price')||{}).value,
                 dpTarget:(document.getElementById('dpTarget')||{}).value,
                 taxRate:(document.getElementById('taxRate')||{}).value,
                 offerConc:(document.getElementById('offerConc')||{}).value },
           units:{ dp:unitState.dp, tax:unitState.tax, offerConc:offerConcUnit.v, counterConc:counterUnit.v } };
};
window.__roundTrip = function(cycles){
  var model = BSEModel.capture();
  var before = window.__outputs();
  var seen = [];
  for(var i=0;i<cycles;i++){
    // contaminate: flip every displayed unit and blank every canonical field
    unitState.dp = unitState.dp==='pct'?'dollar':'pct';
    unitState.tax = unitState.tax==='pct'?'dollar':'pct';
    offerConcUnit.v = offerConcUnit.v==='pct'?'dollar':'pct';
    counterUnit.v = counterUnit.v==='pct'?'dollar':'pct';
    ['dpTarget','taxRate','offerConc','counterConc','price'].forEach(function(id){ document.getElementById(id).value=''; });
    recalc();
    BSEModel.apply(JSON.parse(JSON.stringify(model)));
    if(document.getElementById('counterPrice').value) recalcCounter();
    seen.push(JSON.stringify(window.__outputs()));
  }
  return { before: JSON.stringify(before), seen: seen };
};
`;

(async () => {
  const spec = harness.loadSpec();
  const cases = harness.flatten(spec).filter(c => !c.not_executable);
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));

  // ---------- C1 / C2 / C3 / C4 across every scenario ----------
  let c1 = 0, c2 = 0, c3 = 0, c4 = 0;
  const c1bad = [], c2bad = [], c3bad = [], c4bad = [], c3note = [];
  for (const c of cases) {
    await page.goto('file://' + APP);
    await page.addScriptTag({ content: harness.HELPERS });
    await page.addScriptTag({ content: PROBE });
    await page.evaluate(([sc, d]) => window.__apply(sc, d), [c, spec.defaults]);

    const p = await page.evaluate(() => window.__probe());
    const d1 = deepDiff(p.fromDom, p.fromModel);
    if (d1) c1bad.push(c.id + ' ' + d1); else c1++;
    const d2 = deepDiff(p.runDom, p.runModel);
    if (d2) c2bad.push(c.id + ' ' + d2); else c2++;

    const rt = await page.evaluate(() => window.__roundTrip(3));
    const divergence = (spec.scenarios.find(s => s.id === c.parent) || {}).render_divergence_on_restore;
    if (rt.seen[0] !== rt.before) {
      if (divergence) {
        // documented exception: the pre-restore render did not correspond to the DOM
        const modelIdentity = await page.evaluate(() => {
          const a = JSON.stringify(BSEModel.capture());
          BSEModel.apply(JSON.parse(a));
          return a === JSON.stringify(BSEModel.capture());
        });
        if (modelIdentity) { c3++; c3note.push(c.id + ' — render divergence accepted (documented C-4b), model identity holds'); }
        else c3bad.push(c.id + ' model identity failed under documented render divergence');
      } else c3bad.push(c.id + ' first restore differs');
    } else c3++;
    if (!rt.seen.every(s => s === rt.seen[0])) c4bad.push(c.id + ' cycles unstable');
    else c4++;
  }
  check('C1 DOM -> canonical model -> engine input is lossless on all ' + cases.length + ' scenarios',
    c1bad.length === 0, c1bad.slice(0, 5).join('\n        '));
  check('C2 canonical model -> Engine.run matches the live DOM run on all ' + cases.length + ' scenarios',
    c2bad.length === 0, c2bad.slice(0, 5).join('\n        '));
  check('C3 canonical model -> DOM -> calculation reproduces every rendered output',
    c3bad.length === 0, c3bad.slice(0, 5).join('\n        '));
  c3note.forEach(n => console.log('  NOTE  ' + n));
  check('C4 three consecutive capture/restore cycles are stable on all scenarios',
    c4bad.length === 0, c4bad.slice(0, 5).join('\n        '));

  // ---------- targeted checks ----------
  await page.goto('file://' + APP);
  await page.addScriptTag({ content: harness.HELPERS });
  await page.addScriptTag({ content: PROBE });
  await page.evaluate(([sc, d]) => window.__apply(sc, d), [{ fields: { price: '450,000' } }, spec.defaults]);

  // C5 — L-1 inheritance
  const inh = await page.evaluate(() => {
    const m = BSEModel.capture();
    const planTax = m.shopping_plan.tax_rate_pct;
    const planHoi = m.shopping_plan.hoi_monthly;
    const baseline = BSEModel.resolve(m);
    // author a property-level override, exactly as a Property Scenario would
    m.property_scenario.tax_method = 'flat_rate';
    m.property_scenario.tax_rate_pct = 1.85;
    m.property_scenario.tax_annual_amount = null;
    m.property_scenario.tax_input_unit = 'percent';
    m.property_scenario.hoi_monthly = 210;
    m.property_scenario.hoa_monthly = 340; m.property_scenario.hoa_status = 'known';
    const resolved = BSEModel.resolve(m);
    const inputs = BSEModel.toInputs(m);
    return { planTaxBefore: planTax, planTaxAfter: m.shopping_plan.tax_rate_pct,
             planHoiBefore: planHoi, planHoiAfter: m.shopping_plan.hoi_monthly,
             baselineTax: baseline.tax_rate_pct, resolvedTax: resolved.tax_rate_pct,
             resolvedHoi: resolved.hoi_monthly, resolvedHoa: resolved.hoa,
             inputsTaxRate: inputs.taxRate, inputsHoi: inputs.hoi, inputsHoa: inputs.hoa };
  });
  check('C5 scenario override wins over the shopping plan', inh.resolvedTax === 1.85 && inh.resolvedHoi === 210 && inh.resolvedHoa.monthly === 340, JSON.stringify(inh));
  check('C5 the override reaches the engine input', inh.inputsTaxRate === 1.85 && inh.inputsHoi === 210 && inh.inputsHoa === 340, JSON.stringify(inh));
  check('C5 the shopping plan is NOT written back (L-1)',
    inh.planTaxAfter === inh.planTaxBefore && inh.planHoiAfter === inh.planHoiBefore, JSON.stringify(inh));
  check('C5 resolution without an override falls through to the plan', inh.baselineTax === inh.planTaxBefore, JSON.stringify(inh));

  // C6 — DTI resolution
  const dti = await page.evaluate(() => {
    const m = BSEModel.capture();
    const def = { conv: BSEModel.resolveDti('conv', m), fha: BSEModel.resolveDti('fha', m), va: BSEModel.resolveDti('va', m) };
    m.buyer_profile.dti_override_enabled = true; m.buyer_profile.dti_override_back = 50;
    m.buyer_profile.dti_override_source = 'DU Approve/Eligible 2026-07-14';
    const buyer = BSEModel.resolveDti('conv', m);
    m.property_scenario.dti_override_enabled = true; m.property_scenario.dti_override_back = 47;
    const scen = BSEModel.resolveDti('conv', m);
    return { def, buyer, scen };
  });
  check('C6 program defaults are the audited production values (28/45, 31/43, 41/41)',
    dti.def.conv.front === 28 && dti.def.conv.back === 45 && dti.def.fha.front === 31 && dti.def.fha.back === 43 &&
    dti.def.va.front === 41 && dti.def.va.back === 41 && dti.def.conv.source === 'program_default', JSON.stringify(dti.def));
  check('C6 a buyer-level override supersedes the program default',
    dti.buyer.back === 50 && dti.buyer.source.indexOf('DU Approve') === 0, JSON.stringify(dti.buyer));
  check('C6 a scenario-level override supersedes the buyer override',
    dti.scen.back === 47 && dti.scen.source === 'scenario_override', JSON.stringify(dti.scen));

  // C7 — assumption set
  const asrt = await page.evaluate(() => {
    const A = BSEModel.assumptionSet;
    let mutated = false;
    try { A.payload.buydown.pct_per_point = 0.24; } catch (e) { /* frozen throws in strict mode */ }
    mutated = A.payload.buydown.pct_per_point !== 0.25;
    return { version: A.version_label, buydown: A.payload.buydown.pct_per_point, mutated: mutated,
             frozen: Object.isFrozen(A) && Object.isFrozen(A.payload) && Object.isFrozen(A.payload.buydown),
             conforming: A.payload.limits.conforming, fhaFloor: A.payload.limits.fha_national_floor,
             ufmip: A.payload.mi.fha_ufmip_pct, vaFirst: A.payload.mi.va_funding_fee_first_pct,
             vaSub: A.payload.mi.va_funding_fee_sub_pct, nearTiePayment: A.payload.decision_thresholds.near_tie_payment };
  });
  check('C7 assumption set is 2026.07-baseline and immutable',
    asrt.version === '2026.07-baseline' && asrt.frozen && !asrt.mutated, JSON.stringify(asrt));
  check('C7 buydown ratio is 0.25 and resisted an attempted write to 0.24', asrt.buydown === 0.25, JSON.stringify(asrt));
  check('C7 audited constants carried verbatim',
    asrt.conforming === 766550 && asrt.fhaFloor === 498257 && asrt.ufmip === 1.75 &&
    asrt.vaFirst === 2.15 && asrt.vaSub === 3.30 && asrt.nearTiePayment === 50, JSON.stringify(asrt));

  // C8 — Phase 0 prohibited data
  const prohibited = await page.evaluate(() => {
    const m = BSEModel.capture();
    const json = JSON.stringify(m).toLowerCase();
    const banned = ['ssn', 'social_security', 'date_of_birth', 'dob', 'drivers_license', 'government_id',
                    'bank_account', 'routing', 'account_number', 'credit_report', 'paystub', 'w2', 'w-2',
                    'tax_return', 'bank_statement', 'asset_statement', 'document_url', 'urla', 'form_1003'];
    return { hits: banned.filter(b => json.indexOf(b) >= 0),
             keys: Object.keys(m.buyer_profile) };
  });
  check('C8 no prohibited borrower data appears anywhere in the canonical model',
    prohibited.hits.length === 0, 'hits: ' + prohibited.hits.join(', '));
  check('C8 buyer profile carries the VA exemption as a boolean only',
    prohibited.keys.indexOf('va_funding_fee_exempt') >= 0 &&
    !prohibited.keys.some(k => /rating|award|condition|disabil/i.test(k)), prohibited.keys.join(','));

  // C9 — presentation state cannot alter economic state
  const uiTest = await page.evaluate(() => {
    const before = BSEModel.capture();
    const econBefore = JSON.stringify({ b: before.buyer_profile, s: before.shopping_plan,
                                        p: before.property_scenario, n: before.negotiation_rounds });
    const m = JSON.parse(JSON.stringify(before));
    m.ui_state.gap_tab = 'cash';
    m.ui_state.collapsed_sections = ['sec1'];
    m.ui_state.manual_split_open = true;
    BSEModel.apply(m);
    const after = BSEModel.capture();
    const econAfter = JSON.stringify({ b: after.buyer_profile, s: after.shopping_plan,
                                       p: after.property_scenario, n: after.negotiation_rounds });
    return { same: econBefore === econAfter, gap: after.ui_state.gap_tab,
             collapsed: after.ui_state.collapsed_sections };
  });
  check('C9 changing presentation state leaves every economic field untouched', uiTest.same, JSON.stringify(uiTest));
  check('C9 presentation state itself did change (the test is not vacuous)',
    uiTest.gap === 'cash' && uiTest.collapsed.indexOf('sec1') >= 0, JSON.stringify(uiTest));

  // C10 — M-1 after Gate B
  const m1 = await page.evaluate(() => {
    const set = (id, v) => { document.getElementById(id).value = v; };
    set('price', '437,000'); set('dpTarget', '87,400'); set('taxRate', '6,347');
    unitState.dp = 'dollar'; unitState.tax = 'dollar';
    renderUnitToggles(); recalc();
    const model = BSEModel.capture();
    // contaminate hard
    unitState.dp = 'pct'; unitState.tax = 'pct';
    set('dpTarget', ''); set('taxRate', ''); recalc();
    BSEModel.apply(JSON.parse(JSON.stringify(model)));
    const i = gatherInputs();
    return { dpTarget: document.getElementById('dpTarget').value,
             taxRate: document.getElementById('taxRate').value,
             units: { dp: unitState.dp, tax: unitState.tax },
             dpIsPct: i.dpTarget ? i.dpTarget.isPct : null, dpDollar: i.dpTarget ? i.dpTarget.dollar : null,
             taxFixed: i.taxFixed, taxMonthly: i.taxMonthly };
  });
  check('C10 M-1 holds after Gate B — restored values are not converted',
    m1.dpTarget === '87,400' && m1.taxRate === '6,347' && m1.units.dp === 'dollar' && m1.units.tax === 'dollar',
    JSON.stringify(m1));
  check('C10 the engine reads the restored canonical pair correctly',
    m1.dpIsPct === false && m1.dpDollar === 87400 && m1.taxFixed === true &&
    Math.abs(m1.taxMonthly - 6347 / 12) < 1e-9, JSON.stringify(m1));

  // representative Buyer Profile / Shopping Plan state changes
  const changes = await page.evaluate(() => {
    const m = BSEModel.capture();
    m.buyer_profile.qualifying_income_monthly = 12000;
    m.buyer_profile.credit_score = 700;
    m.shopping_plan.target_payment = 2900;
    m.shopping_plan.planned_stay_years = 10;
    m.shopping_plan.buyer_priority = 'cash';
    const i = BSEModel.toInputs(m);
    return { income: i.income, score: i.score, target: i.target, stay: i.stayYears, priority: i.priority };
  });
  check('C11 representative Buyer Profile and Shopping Plan edits flow through to the engine input',
    changes.income === 12000 && changes.score === 700 && changes.target === 2900 &&
    changes.stay === 10 && changes.priority === 'cash', JSON.stringify(changes));

  check('C12 no JavaScript errors during any canonical-state operation', errors.length === 0, errors.join(' | '));

  await browser.close();
  console.log('\n=========================================================');
  console.log('  CANONICAL APPLICATION STATE — Gate B Stage 2');
  console.log('  scenarios exercised: ' + cases.length);
  console.log('  PASS ' + pass + '   FAIL ' + fail);
  if (failures.length) failures.forEach(f => console.log('   - ' + f));
  console.log('=========================================================');
  process.exit(fail ? 1 : 0);
})();
