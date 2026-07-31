/* =====================================================================
   Buyer Strategy Engine — Phase 3 Gate A test harness
   M-1 / applyState canonical unit restoration  (Phase 1 finding C-4a,
   Phase 2 migration risk M-1, locked by Decision L-13)

   Usage:
     node m1-canonical-units.test.js <baseline.html> <patched.html>

   The harness drives the real application in headless Chromium. It does not
   stub, mock, or re-implement any calculation. Three parts:

     PART A  REGRESSION   — identical economic inputs must produce identical
                            gatherInputs() output and identical rendered text
                            in the baseline and the patched file.
     PART B  M-1 TESTS    — capture / restore / recalculate invariants and
                            repeated-toggle drift, on the patched file.
     PART C  DEFECT REPRO — demonstrates the M-1 failure path on the baseline
                            file and its absence on the patched file.

   Requires: node, playwright (chromium).
   ===================================================================== */
const { chromium } = require('playwright');
const path = require('path');

const BASELINE = path.resolve(process.argv[2]);
const PATCHED  = path.resolve(process.argv[3]);

let pass = 0, fail = 0;
const failures = [];
function check(name, ok, detail) {
  if (ok) { pass++; console.log('  PASS  ' + name); }
  else { fail++; failures.push(name + (detail ? ' :: ' + detail : '')); console.log('  FAIL  ' + name + (detail ? '\n        ' + detail : '')); }
}

/* ---------- in-page helpers (serialized into the browser) ---------- */
const PAGE_HELPERS = `
window.__set = function(sc){
  /* This suite is DIFFERENTIAL: it drives the pre-Phase-3 baseline file and the
     file under test and compares them. Any input it does not set explicitly is
     inherited from each file's own markup defaults — so the moment those
     defaults diverge, every case fails for a reason that has nothing to do with
     the behaviour under test. That happened when the property-tax field's
     default value was blanked (a stale 1.20 sitting in a $/MO field would
     have meant one dollar twenty per month). PITI assumptions are pinned here, matching
     the values the baseline file shipped with, and a case may still override
     any of them. This pins the test's INTENT, not its outcome. */
  /* WP-3 added a priority control, for exactly the reason this block exists.
     The baseline file defaults the buyer priority to 'balanced'; the file under
     test has no default at all, because WP-3 made the priority mandatory and
     buyer-stated. Left unpinned, every case would diverge on a control neither
     side's scenario set even depends on. 'payment' is the documented migration
     of 'balanced' and is valid in BOTH files, so this pins the test's intent
     and not its outcome — same as the four PITI assumptions beside it. */
  var PINNED = { taxRate:'1.20', hoi:'150', hoa:'0', cdd:'0', flood:'0', priority:'payment' };
  var f = Object.assign({}, PINNED, sc.fields || {});
  Object.keys(f).forEach(function(id){
    var el = document.getElementById(id); if(!el) return;
    if(el.type==='checkbox') el.checked = !!f[id]; else el.value = f[id];
  });
  if(sc.negMode){
    document.querySelectorAll('input[name="negMode"]').forEach(function(r){ r.checked = (r.value===sc.negMode); });
  }
  // Units are assigned directly on BOTH files so the economic inputs are identical.
  // The DEFAULTS are pinned explicitly rather than inherited from the application:
  // a case that means "1.20 percent" must say so, or it silently re-interprets
  // itself when the application's default display unit changes (as it did when
  // $/MO became the default property-tax mode). The baseline file and the file
  // under test are set identically either way, so this pins intent, not outcome.
  var u = sc.units || {};
  unitState.dp  = u.dp  || 'pct';
  unitState.tax = u.tax || 'pct';
  if(u.offerConc) offerConcUnit.v = u.offerConc;
  if(u.counterConc) counterUnit.v = u.counterConc;
  renderUnitToggles();
  recalc();
  if(sc.gap){ var b=document.querySelector('#gsBtns .gs-btn[data-gs="'+sc.gap+'"]'); if(b) b.click(); }
  if(sc.counter){ recalcCounter(); }
  return true;
};
/* ---- APPROVED RENAMES ------------------------------------------------
   The differential compares rendered TEXT against a frozen pre-Phase-3 file.
   A work package that renames a label by approval would otherwise fail here
   forever, for a reason that has nothing to do with M-1. Each rename is listed
   explicitly, applied to BOTH sides, and is a pure label substitution — it can
   never mask a moved NUMBER, because no number is touched. Anything not on
   this list still fails.

     WP-3  "★ Start here"  ->  "Matches your stated priority"
           The badge stopped being a recommendation and became a statement of
           which structure the buyer's stated priority points at.
   -------------------------------------------------------------------- */
window.__renames = function(s){
  if(s == null) return s;
  return String(s)
    .replace(/★ Start here/gi, 'PRIORITY-MATCH BADGE')
    .replace(/★ START HERE/g,  'PRIORITY-MATCH BADGE')
    .replace(/Matches your stated priority/gi, 'PRIORITY-MATCH BADGE')
    .replace(/MATCHES YOUR STATED PRIORITY/g,  'PRIORITY-MATCH BADGE');
};
window.__fingerprint = function(){
  var t = function(id){ var e=document.getElementById(id); return e ? window.__renames((e.innerText||'').replace(/\\s+/g,' ').trim()) : null; };
  return {
    inputs: JSON.parse(JSON.stringify(gatherInputs())),
    modeBadge: t('modeBadge'),
    snapBody:  t('snapBody'),
    cardsBody: t('cardsBody'),
    gsPanel:   t('gsPanel'),
    negMount:  t('negMount'),
    propFull:  t('propFull'),
    coPanels:  t('coPanels'),
    coNetVal:  t('coNetVal'),
    counterBody: t('counterBody'),
    stPay: t('stPay'), stCash: t('stCash'), stDti: t('stDti')
  };
};
window.__dom = function(){
  var v = function(id){ var e=document.getElementById(id); return e ? e.value : null; };
  return { dpTarget:v('dpTarget'), taxRate:v('taxRate'), offerConc:v('offerConc'), counterConc:v('counterConc'),
           units:{ dp:unitState.dp, tax:unitState.tax, offerConc:offerConcUnit.v, counterConc:counterUnit.v } };
};
`;

async function openPage(browser, file) {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto('file://' + file);
  await page.addScriptTag({ content: PAGE_HELPERS });
  page.__errors = errors;
  return page;
}

/* ---------- PART A scenarios: economic-input regression ----------
   Defaults: score 740, own funds 40,000, gift 0, target 3,200, income 9,500,
   debts 650, stay 7, priority payment (WP-3 pinned), rates 6.750/6.250/6.125, ccPct 3,
   tax 1.20%, HOI 150, HOA/CDD/flood 0 with N/A checked.                       */
const SCENARIOS = [
  { id:'A-01 Shopping Range — defaults, no price', fields:{ price:'' } },
  { id:'A-02 Specific price — Conventional', fields:{ price:'400,000' } },
  { id:'A-03 FHA tier — score 660, FTHB', fields:{ price:'400,000', score:'660', tgFthb:true } },
  { id:'A-04 FHA low tier — score 540', fields:{ price:'350,000', score:'540' } },
  { id:'A-05 VA first use', fields:{ price:'450,000', score:'700', tgVa:true, vaUse:'first' } },
  { id:'A-06 VA subsequent use', fields:{ price:'450,000', score:'700', tgVa:true, vaUse:'sub' } },
  { id:'A-07 VA exempt', fields:{ price:'450,000', score:'700', tgVa:true, vaExempt:true } },
  { id:'A-08 Max buying power — high income', fields:{ price:'', income:'20,000', debts:'0', ownFunds:'200,000' } },
  { id:'A-09 Comfort buying power — low target', fields:{ price:'', target:'2,400' } },
  { id:'A-10 Cash-limited', fields:{ price:'', ownFunds:'15,000' } },
  { id:'A-11 DTI-limited', fields:{ price:'', income:'6,000', debts:'1,500' } },
  { id:'A-12 PMI band — 5% down', fields:{ price:'400,000', dpTarget:'5' }, units:{dp:'pct'} },
  { id:'A-13 No PMI — 20% down', fields:{ price:'400,000', dpTarget:'20' }, units:{dp:'pct'} },
  { id:'A-14 High down payment 25%', fields:{ price:'500,000', dpTarget:'25' }, units:{dp:'pct'} },
  { id:'A-15 DP target in $', fields:{ price:'500,000', dpTarget:'125,000' }, units:{dp:'dollar'} },
  { id:'A-16 Tax as % (flat rate)', fields:{ price:'450,000', taxRate:'1.20' }, units:{tax:'pct'} },
  { id:'A-17 Tax as annual $ (fixed escrow)', fields:{ price:'450,000', taxRate:'6,000' }, units:{tax:'dollar'} },
  { id:'A-18 Tax as annual $ in Shopping Mode', fields:{ price:'', taxRate:'6,000' }, units:{tax:'dollar'} },
  { id:'A-19 Closing costs override', fields:{ price:'400,000', ccOverride:'11,500' } },
  { id:'A-20 HOA/CDD/flood present', fields:{ price:'400,000', hoa:'340', cdd:'120', flood:'85', hoaNA:false, cddNA:false, floodNA:false } },
  { id:'A-21 Offer strategy — concession mode', fields:{ price:'450,000', offerPrice:'440,000', offerConc:'8,000' }, units:{offerConc:'dollar'}, negMode:'concession' },
  { id:'A-22 Offer strategy — reduction mode', fields:{ price:'450,000', offerPrice:'440,000', offerConc:'8,000' }, units:{offerConc:'dollar'}, negMode:'reduction' },
  { id:'A-23 Offer strategy — split mode', fields:{ price:'450,000', offerPrice:'440,000', offerConc:'8,000' }, units:{offerConc:'dollar'}, negMode:'split' },
  { id:'A-24 Offer strategy — concession as %', fields:{ price:'450,000', offerPrice:'440,000', offerConc:'2' }, units:{offerConc:'pct'}, negMode:'concession' },
  { id:'A-25 Concession over limit', fields:{ price:'400,000', dpTarget:'5', offerPrice:'395,000', offerConc:'20,000' }, units:{dp:'pct', offerConc:'dollar'} },
  { id:'A-26 Gap Solver — payment tab', fields:{ price:'450,000', target:'2,500' }, gap:'pay' },
  { id:'A-27 Gap Solver — cash tab', fields:{ price:'400,000', ownFunds:'10,000' }, gap:'cash' },
  { id:'A-28 Gap Solver — DTI tab', fields:{ price:'450,000', income:'6,500', debts:'1,800' }, gap:'dti' },
  { id:'A-29 Recommendation — priority payment', fields:{ price:'', priority:'payment' } },
  { id:'A-30 Recommendation — priority cash', fields:{ price:'', priority:'cash' } },
  { id:'A-31 Recommendation — priority power', fields:{ price:'', priority:'power' } },
  { id:'A-32 Planned stay 3 years', fields:{ price:'', stay:'3' } },
  { id:'A-33 Planned stay 10 years', fields:{ price:'', stay:'10' } },
  { id:'A-34 Counteroffer — $ concession', fields:{ price:'500,000', offerPrice:'485,000', offerConc:'8,000', counterPrice:'492,000', counterConc:'4,000' }, units:{offerConc:'dollar', counterConc:'dollar'}, counter:true },
  { id:'A-35 Counteroffer — % concession', fields:{ price:'500,000', offerPrice:'485,000', offerConc:'8,000', counterPrice:'492,000', counterConc:'1' }, units:{offerConc:'dollar', counterConc:'pct'}, counter:true },
  { id:'A-36 Counteroffer — restructure case', fields:{ price:'500,000', offerPrice:'480,000', offerConc:'12,000', counterPrice:'495,000', counterConc:'6,000' }, units:{offerConc:'dollar', counterConc:'dollar'}, counter:true },
  { id:'A-37 Buydown ratio 0.25 check', fields:{ price:'450,000', offerPrice:'450,000', offerConc:'13,500', priority:'payment' }, units:{offerConc:'dollar'}, negMode:'concession' }
];

/* ---------- PART A: the additive-inputs allowance -------------------------
   The baseline in this differential is a FROZEN pre-Phase-3 file. It cannot
   know about engine inputs added later by an approved work package, so a
   whole-object comparison of gatherInputs() fails the moment a legitimate
   input is added — for a reason that has nothing to do with M-1.

   The allowance is deliberately narrower than the comparison it replaces, in
   three ways, so this is a STRENGTHENING and not a relaxation:

     1. Every key the baseline has must still match EXACTLY. No baseline input
        may move, be renamed, or be removed.
     2. The set of added keys must equal ALLOWED_NEW_INPUTS exactly. An
        unannounced new input fails — the old comparison could not distinguish
        "a new key appeared" from "a value changed", and reported both as one
        opaque failure.
     3. Each added key must carry its INERT default in every Part A scenario.
        Part A never authors a WP-2 cash field, so a non-inert value here means
        the new input is not inert-by-default and is silently in play.

   Every other fingerprint key — all twelve rendered panels — is still compared
   whole and byte-for-byte. Adding an input that changes any rendered output
   still fails Part A.
   ------------------------------------------------------------------------ */
const ALLOWED_NEW_INPUTS = {
  // WP-2 cash model. reserveFloor's inert value is the 500 that WP-2 extracted
  // from its hard-coded position inside pickBestOverall, so an un-authored
  // buyer is scored against exactly the baseline floor.
  escrowDeposit:   0,
  earnestMoney:    0,
  cashIsTotal:     false,
  cashAuthoredTotal: null,
  desiredReserves: null,
  reserveFloor:    500
};

function diffInputs(base, patched) {
  const problems = [];
  for (const k of Object.keys(base)) {
    if (!(k in patched)) { problems.push('baseline input REMOVED: ' + k); continue; }
    if (JSON.stringify(base[k]) !== JSON.stringify(patched[k]))
      problems.push('baseline input MOVED: ' + k + '  baseline=' + JSON.stringify(base[k]) +
                    '  patched=' + JSON.stringify(patched[k]));
  }
  const added = Object.keys(patched).filter(k => !(k in base));
  for (const k of added) {
    if (!(k in ALLOWED_NEW_INPUTS)) { problems.push('UNDECLARED new input: ' + k + '=' + JSON.stringify(patched[k])); continue; }
    if (JSON.stringify(patched[k]) !== JSON.stringify(ALLOWED_NEW_INPUTS[k]))
      problems.push('new input NOT INERT: ' + k + '=' + JSON.stringify(patched[k]) +
                    '  expected ' + JSON.stringify(ALLOWED_NEW_INPUTS[k]));
  }
  for (const k of Object.keys(ALLOWED_NEW_INPUTS))
    if (!(k in patched)) problems.push('declared new input MISSING: ' + k);
  return problems;
}

async function partA(browser) {
  console.log('\n=== PART A — REGRESSION: baseline vs patched, identical economic inputs ===');
  const a = await openPage(browser, BASELINE);
  const b = await openPage(browser, PATCHED);
  for (const sc of SCENARIOS) {
    await a.reload(); await a.addScriptTag({ content: PAGE_HELPERS });
    await b.reload(); await b.addScriptTag({ content: PAGE_HELPERS });
    await a.evaluate(s => window.__set(s), sc);
    await b.evaluate(s => window.__set(s), sc);
    const fa = await a.evaluate(() => window.__fingerprint());
    const fb = await b.evaluate(() => window.__fingerprint());
    let detail = '', ok = true;
    // Every rendered panel: compared whole, unchanged from the original harness.
    for (const k of Object.keys(fa)) {
      if (k === 'inputs') continue;
      if (JSON.stringify(fa[k]) !== JSON.stringify(fb[k])) {
        ok = false;
        detail += '\n          key=' + k + '\n           baseline: ' + JSON.stringify(fa[k]).slice(0, 400) +
                  '\n            patched: ' + JSON.stringify(fb[k]).slice(0, 400);
      }
    }
    // gatherInputs(): baseline keys exact, additions declared and inert.
    const problems = diffInputs(fa.inputs, fb.inputs);
    if (problems.length) { ok = false; detail += '\n          inputs:\n           ' + problems.join('\n           '); }
    check(sc.id, ok, detail);
  }
  check('A-ERR baseline page had no JS errors', a.__errors.length === 0, a.__errors.join(' | '));
  check('A-ERR patched page had no JS errors', b.__errors.length === 0, b.__errors.join(' | '));
  await a.close(); await b.close();
}

/* ---------- PART B — M-1 behaviour on the patched file ---------- */
const CANON_CASES = [
  { id:'dp %',            field:'dpTarget',    key:'dp',          value:'3.375',  unit:'pct',    ctx:{ price:'437,000' } },
  { id:'dp $',            field:'dpTarget',    key:'dp',          value:'87,400', unit:'dollar', ctx:{ price:'437,000' } },
  { id:'tax %',           field:'taxRate',     key:'tax',         value:'1.205',  unit:'pct',    ctx:{ price:'437,000' } },
  { id:'tax annual $',    field:'taxRate',     key:'tax',         value:'6,347',  unit:'dollar', ctx:{ price:'437,000' } },
  { id:'concession %',    field:'offerConc',   key:'offerConc',   value:'2.75',   unit:'pct',    ctx:{ price:'437,000', offerPrice:'429,000' } },
  { id:'concession $',    field:'offerConc',   key:'offerConc',   value:'11,798', unit:'dollar', ctx:{ price:'437,000', offerPrice:'429,000' } },
  { id:'counter conc %',  field:'counterConc', key:'counterConc', value:'1.375',  unit:'pct',    ctx:{ price:'437,000', offerPrice:'429,000', counterPrice:'433,000' }, counter:true },
  { id:'counter conc $',  field:'counterConc', key:'counterConc', value:'5,954',  unit:'dollar', ctx:{ price:'437,000', offerPrice:'429,000', counterPrice:'433,000' }, counter:true }
];

async function partB(browser) {
  console.log('\n=== PART B — M-1: capture / restore / recalculate, patched file ===');
  const p = await openPage(browser, PATCHED);

  // B1 — capture → restore → identity of DOM, units and canonical pairs,
  //      restoring INTO a session whose current units are deliberately different.
  for (const c of CANON_CASES) {
    await p.reload(); await p.addScriptTag({ content: PAGE_HELPERS });
    const r = await p.evaluate(c => {
      const sc = { fields: Object.assign({}, c.ctx), units: {} };
      sc.fields[c.field] = c.value;
      sc.units[c.key] = c.unit;
      if (c.counter) sc.counter = true;
      window.__set(sc);
      const before = window.__fingerprint();
      const beforeDom = window.__dom();
      const state = BSEState.capture();
      // Contaminate the live session: flip every unit to the opposite and wipe
      // the fields, exactly as a page reused for another buyer would be.
      unitState.dp = unitState.dp === 'pct' ? 'dollar' : 'pct';
      unitState.tax = unitState.tax === 'pct' ? 'dollar' : 'pct';
      offerConcUnit.v = offerConcUnit.v === 'pct' ? 'dollar' : 'pct';
      counterUnit.v = counterUnit.v === 'pct' ? 'dollar' : 'pct';
      ['dpTarget','taxRate','offerConc','counterConc'].forEach(id => { document.getElementById(id).value = ''; });
      recalc();
      BSEState.apply(JSON.parse(JSON.stringify(state)));
      if (c.counter) recalcCounter();
      const after = window.__fingerprint();
      const afterDom = window.__dom();
      return { before, after, beforeDom, afterDom, canon: JSON.parse(JSON.stringify(BSEState.canon)) };
    }, c);
    check('B1 restore identity — ' + c.id + ' — DOM value + unit',
      JSON.stringify(r.beforeDom) === JSON.stringify(r.afterDom),
      'before ' + JSON.stringify(r.beforeDom) + '\n            after  ' + JSON.stringify(r.afterDom));
    check('B1 restore identity — ' + c.id + ' — recalculated output',
      JSON.stringify(r.before) === JSON.stringify(r.after),
      firstDiff(r.before, r.after));
    check('B1 canonical pair preserved — ' + c.id,
      r.canon[c.key].value === c.value && r.canon[c.key].unit === c.unit,
      JSON.stringify(r.canon[c.key]));
  }

  // B2 — repeated restore cycles (10x) must be stable
  await p.reload(); await p.addScriptTag({ content: PAGE_HELPERS });
  const rep = await p.evaluate(() => {
    window.__set({ fields:{ price:'437,000', offerPrice:'429,000', counterPrice:'433,000',
                            dpTarget:'3.375', taxRate:'6,347', offerConc:'2.75', counterConc:'1.375' },
                   units:{ dp:'pct', tax:'dollar', offerConc:'pct', counterConc:'pct' }, counter:true });
    const state = BSEState.capture();
    const first = window.__fingerprint();
    const seen = [];
    for (let i = 0; i < 10; i++) {
      BSEState.apply(JSON.parse(JSON.stringify(state)));
      recalcCounter();
      seen.push(JSON.stringify(window.__dom()) + '|' + JSON.stringify(window.__fingerprint()));
    }
    return { first: JSON.stringify(first), stable: seen.every(s => s === seen[0]), sample: seen[0].slice(0, 200), last: seen[9].slice(0, 200) };
  });
  check('B2 ten consecutive restore cycles are stable', rep.stable, rep.sample + ' vs ' + rep.last);

  // B3 — repeated user-initiated unit switching must not drift
  const DRIFT = [
    { id:'dp  3.375% -> $ -> % -> $ -> %', key:'dp', field:'dpTarget', start:'3.375', startUnit:'pct',
      seq:['dollar','pct','dollar','pct'], ctx:{ price:'437,000' } },
    { id:'dp  $87,400 -> % -> $ -> % -> $', key:'dp', field:'dpTarget', start:'87,400', startUnit:'dollar',
      seq:['pct','dollar','pct','dollar'], ctx:{ price:'437,000' } },
    { id:'tax 1.205% -> $ -> % -> $ -> %', key:'tax', field:'taxRate', start:'1.205', startUnit:'pct',
      seq:['dollar','pct','dollar','pct'], ctx:{ price:'437,000' } },
    { id:'tax $6,347 -> % -> $ -> % -> $', key:'tax', field:'taxRate', start:'6,347', startUnit:'dollar',
      seq:['pct','dollar','pct','dollar'], ctx:{ price:'437,000' } },
    { id:'conc 2.75% -> $ -> % -> $ -> %', key:'offerConc', field:'offerConc', start:'2.75', startUnit:'pct',
      seq:['dollar','pct','dollar','pct'], ctx:{ price:'437,000', offerPrice:'429,000' } },
    { id:'conc $11,798 -> % -> $ -> % -> $', key:'offerConc', field:'offerConc', start:'11,798', startUnit:'dollar',
      seq:['pct','dollar','pct','dollar'], ctx:{ price:'437,000', offerPrice:'429,000' } },
    { id:'ctr  1.375% -> $ -> % -> $ -> %', key:'counterConc', field:'counterConc', start:'1.375', startUnit:'pct',
      seq:['dollar','pct','dollar','pct'], ctx:{ price:'437,000', offerPrice:'429,000', counterPrice:'433,000' }, counter:true },
    { id:'ctr  $5,954 -> % -> $ -> % -> $', key:'counterConc', field:'counterConc', start:'5,954', startUnit:'dollar',
      seq:['pct','dollar','pct','dollar'], ctx:{ price:'437,000', offerPrice:'429,000', counterPrice:'433,000' }, counter:true }
  ];
  for (const d of DRIFT) {
    const res = await runDrift(p, d, PATCHED);
    check('B3 no drift (patched) — ' + d.id, res.final === d.start,
      'start ' + d.start + '  ->  final ' + res.final + '  trail ' + JSON.stringify(res.trail));
  }

  check('B-ERR patched page had no JS errors', p.__errors.length === 0, p.__errors.join(' | '));
  await p.close();
}

async function runDrift(page, d) {
  await page.reload(); await page.addScriptTag({ content: PAGE_HELPERS });
  return page.evaluate(d => {
    const sc = { fields: Object.assign({}, d.ctx), units: {} };
    sc.fields[d.field] = d.start;
    sc.units[d.key] = d.startUnit;
    if (d.counter) sc.counter = true;
    window.__set(sc);
    const trail = [];
    d.seq.forEach(u => {
      if (d.key === 'dp' || d.key === 'tax') setUnit(d.key, u);
      else if (d.key === 'offerConc') setOfferConcUnit(u);
      else setCounterUnit(u);
      trail.push(document.getElementById(d.field).value);
    });
    return { final: document.getElementById(d.field).value, trail: trail };
  }, d);
}

/* ---------- PART C — the M-1 defect, reproduced then shown resolved ---------- */
async function partC(browser) {
  console.log('\n=== PART C — M-1 failure path: baseline reproduces it, patched does not ===');

  // C1 — baseline: the only way to position a toggle is setUnit, so a restore
  //      that positions the toggle converts the already-correct value again.
  const a = await openPage(browser, BASELINE);
  const bad = await a.evaluate(() => {
    // Stored canonical state for a buyer: down-payment target $87,400 (dollar),
    // tax $6,347/yr (dollar), on a $437,000 property.
    const stored = { price:'437,000', dpTarget:'87,400', dpUnit:'dollar', taxRate:'6,347', taxUnit:'dollar' };
    document.getElementById('price').value = stored.price;
    // A naive restore: write the value, then position the toggle via the only
    // API the baseline exposes.
    document.getElementById('dpTarget').value = stored.dpTarget;
    document.getElementById('taxRate').value  = stored.taxRate;
    setUnit('dp',  stored.dpUnit);   // unitState.dp is 'pct' by default -> converts
    setUnit('tax', stored.taxUnit);  // unitState.tax is 'pct' by default -> converts
    return { dpTarget: document.getElementById('dpTarget').value,
             taxRate:  document.getElementById('taxRate').value,
             expectedDp: stored.dpTarget, expectedTax: stored.taxRate };
  });
  check('C1 baseline corrupts the restored down-payment target (defect reproduced)',
    bad.dpTarget !== bad.expectedDp,
    'restored ' + bad.expectedDp + ' -> became ' + bad.dpTarget);
  check('C1 baseline corrupts the restored tax figure (defect reproduced)',
    bad.taxRate !== bad.expectedTax,
    'restored ' + bad.expectedTax + ' -> became ' + bad.taxRate);
  console.log('        baseline restored dpTarget "' + bad.expectedDp + '" -> "' + bad.dpTarget + '"');
  console.log('        baseline restored taxRate  "' + bad.expectedTax + '" -> "' + bad.taxRate + '"');
  await a.close();

  // C2 — patched: applyState restores the same state without conversion.
  const b = await openPage(browser, PATCHED);
  const good = await b.evaluate(() => {
    const state = {
      version: 1,
      fields: { price:'437,000', dpTarget:'87,400', taxRate:'6,347' },
      units:  { dp:'dollar', tax:'dollar', offerConc:'dollar', counterConc:'dollar' },
      canonical: { dp:{value:'87,400',unit:'dollar'}, tax:{value:'6,347',unit:'dollar'},
                   offerConc:{value:'0',unit:'dollar'}, counterConc:{value:'0',unit:'dollar'} }
    };
    BSEState.apply(state);
    return { dpTarget: document.getElementById('dpTarget').value,
             taxRate:  document.getElementById('taxRate').value,
             units: { dp: unitState.dp, tax: unitState.tax },
             dpInp: gatherInputs().dpTarget, taxFixed: gatherInputs().taxFixed, taxMonthly: gatherInputs().taxMonthly };
  });
  check('C2 patched restores the down-payment target unchanged', good.dpTarget === '87,400', good.dpTarget);
  check('C2 patched restores the tax figure unchanged', good.taxRate === '6,347', good.taxRate);
  check('C2 patched restores the units unchanged', good.units.dp === 'dollar' && good.units.tax === 'dollar', JSON.stringify(good.units));
  check('C2 patched engine reads the restored dollar target',
    good.dpInp && good.dpInp.isPct === false && good.dpInp.dollar === 87400, JSON.stringify(good.dpInp));
  check('C2 patched engine reads the restored fixed escrow',
    good.taxFixed === true && Math.abs(good.taxMonthly - 6347 / 12) < 1e-9, JSON.stringify({ f: good.taxFixed, m: good.taxMonthly }));
  await b.close();

  // C3 — the same drift sequences on the baseline, recorded as the documented
  //      pre-existing behaviour the fix corrects.
  const c = await openPage(browser, BASELINE);
  console.log('        baseline repeated-toggle behaviour (documented, pre-existing):');
  for (const d of [
    { id:'dp  3.375% -> $ -> % -> $ -> %', key:'dp', field:'dpTarget', start:'3.375', startUnit:'pct', seq:['dollar','pct','dollar','pct'], ctx:{ price:'437,000' } },
    { id:'tax 1.205% -> $ -> % -> $ -> %', key:'tax', field:'taxRate', start:'1.205', startUnit:'pct', seq:['dollar','pct','dollar','pct'], ctx:{ price:'437,000' } },
    { id:'conc 2.75% -> $ -> % -> $ -> %', key:'offerConc', field:'offerConc', start:'2.75', startUnit:'pct', seq:['dollar','pct','dollar','pct'], ctx:{ price:'437,000', offerPrice:'429,000' } }
  ]) {
    const r = await runDrift(c, d);
    console.log('          ' + d.id + '  start ' + d.start + ' -> final ' + r.final + '   trail ' + JSON.stringify(r.trail));
  }
  await c.close();
}

function firstDiff(a, b) {
  for (const k of Object.keys(a)) {
    if (JSON.stringify(a[k]) !== JSON.stringify(b[k]))
      return 'key=' + k + '\n            before: ' + JSON.stringify(a[k]).slice(0, 300) + '\n            after:  ' + JSON.stringify(b[k]).slice(0, 300);
  }
  return '';
}

(async () => {
  const browser = await chromium.launch();
  await partA(browser);
  await partB(browser);
  await partC(browser);
  await browser.close();
  console.log('\n===============================================');
  console.log('  PASS ' + pass + '   FAIL ' + fail);
  if (failures.length) { console.log('  Failures:'); failures.forEach(f => console.log('   - ' + f)); }
  console.log('===============================================');
  process.exit(fail ? 1 : 0);
})();
