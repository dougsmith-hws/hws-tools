/* =====================================================================
   C-4b — PRESENTATION MUST NOT MUTATE ECONOMIC STATE
   Phase 3 Gate B.5, Stage 1/2.

   The defect: updateInlineHints() ran AFTER gatherInputs() inside recalc()
   and overwrote #hoa / #cdd / #flood with '0'. The render was therefore
   computed from an economic assumption the DOM no longer held, and a later
   capture/restore produced a different result — persistence would have
   faithfully saved the wrong assumption.

   The invariant this suite enforces:

       CANONICAL VALUE -> CALCULATION -> RENDER -> INLINE HINT
       -> CAPTURE -> RESTORE -> RECALCULATE

   must preserve the same economic assumption and the same result, and the
   DOM must never end up representing something the calculation did not use.

   Usage: node tests/c4b-presentation-integrity.test.js <app.html> [--verbose]
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
window.__render = function(){
  var t=function(id){var e=document.getElementById(id);return e?(e.innerText||'').replace(/\\s+/g,' ').trim():null;};
  return JSON.stringify({ snap:t('snapBody'), cards:t('cardsBody'), gs:t('gsPanel'), prop:t('propFull'),
                          pay:t('stPay'), cash:t('stCash'), dti:t('stDti') });
};
window.__econ = function(){
  var i = gatherInputs();
  return JSON.stringify({ hoa:i.hoa, cdd:i.cdd, flood:i.flood, hoi:i.hoi, taxRate:i.taxRate,
                          taxMonthly:i.taxMonthly, taxFixed:i.taxFixed,
                          dp:i.dpTarget, conc:i.sellerConcession, price:i.price, funds:i.funds });
};
window.__dom = function(ids){
  var o={};
  ids.forEach(function(id){ var e=document.getElementById(id); if(e) o[id] = (e.type==='checkbox') ? e.checked : e.value; });
  return JSON.stringify(o);
};
window.__set = function(map){
  Object.keys(map).forEach(function(id){
    var e=document.getElementById(id); if(!e) return;
    if(e.type==='checkbox') e.checked = !!map[id]; else e.value = map[id];
  });
  recalc();
};
`;

const ECON_IDS = ['hoa','hoaNA','cdd','cddNA','flood','floodNA','hoi','taxRate','dpTarget','offerConc','price','offerPrice'];

// Fields where display logic could plausibly touch an economic value.
const FIELD_CASES = [
  { id: 'HOA — typed value with N/A confirmed (R-43 shape)',
    set: { price: '400,000', hoa: '250', hoaNA: true }, domKeep: { hoa: '250' }, econ: { hoa: 0 } },
  { id: 'HOA — typed value, N/A off',
    set: { price: '400,000', hoa: '340', hoaNA: false }, domKeep: { hoa: '340' }, econ: { hoa: 340 } },
  { id: 'CDD — typed value with N/A confirmed',
    set: { price: '400,000', cdd: '120', cddNA: true }, domKeep: { cdd: '120' }, econ: { cdd: 0 } },
  { id: 'CDD — typed value, N/A off',
    set: { price: '400,000', cdd: '120', cddNA: false }, domKeep: { cdd: '120' }, econ: { cdd: 120 } },
  { id: 'Flood — typed value with N/A confirmed',
    set: { price: '400,000', flood: '85', floodNA: true }, domKeep: { flood: '85' }, econ: { flood: 0 } },
  { id: 'Flood — typed value, N/A off',
    set: { price: '400,000', flood: '85', floodNA: false }, domKeep: { flood: '85' }, econ: { flood: 85 } },
  { id: 'Insurance (HOI) — no N/A control, must never be rewritten',
    set: { price: '400,000', hoi: '225' }, domKeep: { hoi: '225' }, econ: { hoi: 225 } },
  { id: 'Tax as % — hint recomputes annual/monthly, must not rewrite the field',
    set: { price: '437,000', taxRate: '1.205' }, domKeep: { taxRate: '1.205' }, econ: { taxRate: 1.205 } },
  { id: 'Tax rate above the 15% warning threshold — warning must not "correct" the value',
    set: { price: '437,000', taxRate: '6347' }, domKeep: { taxRate: '6347' }, econ: { taxRate: 6347 } },
  { id: 'Down-payment target — hint shows both $ and %, must not rewrite',
    set: { price: '437,000', dpTarget: '3.375' }, domKeep: { dpTarget: '3.375' }, econ: null },
  { id: 'Seller concession — hint resolves $ of offer, must not rewrite',
    set: { price: '450,000', offerPrice: '440,000', offerConc: '9,000' }, domKeep: { offerConc: '9,000' }, econ: { conc: 9000 } }
];

(async () => {
  const spec = harness.loadSpec();
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));

  // ---------- 1. render idempotence across every regression scenario ----------
  // A second recalc with no input change must produce byte-identical output.
  // Under the C-4b defect R-43 failed this: the first render used HOA $250,
  // the second used the '0' the first render had just written.
  const cases = harness.flatten(spec).filter(c => !c.not_executable);
  const notIdempotent = [];
  for (const c of cases) {
    await page.goto('file://' + APP);
    await page.addScriptTag({ content: harness.HELPERS });
    await page.addScriptTag({ content: PROBE });
    await page.evaluate(([sc, d]) => window.__apply(sc, d), [c, spec.defaults]);
    const r = await page.evaluate(() => {
      const a = window.__render(), e1 = window.__econ(), d1 = window.__dom(['hoa','cdd','flood','hoi','taxRate','dpTarget']);
      recalc();
      const b = window.__render(), e2 = window.__econ(), d2 = window.__dom(['hoa','cdd','flood','hoi','taxRate','dpTarget']);
      recalc();
      const c3 = window.__render();
      return { renderStable: a === b && b === c3, econStable: e1 === e2, domStable: d1 === d2 };
    });
    if (!r.renderStable || !r.econStable || !r.domStable) notIdempotent.push(c.id + ' ' + JSON.stringify(r));
  }
  check('C4b-1 render, economic inputs and DOM are stable across repeated recalc on all ' + cases.length + ' scenarios',
    notIdempotent.length === 0, notIdempotent.slice(0, 6).join('\n        '));

  // ---------- 2. per-field: presentation never mutates, and the round trip holds ----------
  for (const f of FIELD_CASES) {
    await page.goto('file://' + APP);
    await page.addScriptTag({ content: harness.HELPERS });
    await page.addScriptTag({ content: PROBE });
    await page.evaluate(([sc, d]) => window.__apply(sc, d), [{ fields: {} }, spec.defaults]);
    const r = await page.evaluate(f => {
      window.__set(f.set);
      const domAfterRender = JSON.parse(window.__dom(Object.keys(f.domKeep)));
      const econBefore = window.__econ();
      const renderBefore = window.__render();
      const model = BSEModel.capture();
      const modelInputs = JSON.stringify(BSEModel.toInputs(model));
      // contaminate, then restore through the canonical path
      ['hoa','cdd','flood','hoi','taxRate','dpTarget','offerConc','price','offerPrice'].forEach(id => {
        const e = document.getElementById(id); if (e) e.value = '';
      });
      ['hoaNA','cddNA','floodNA'].forEach(id => { document.getElementById(id).checked = false; });
      recalc();
      BSEModel.apply(JSON.parse(JSON.stringify(model)));
      const econAfter = window.__econ();
      const renderAfter = window.__render();
      const domAfterRestore = JSON.parse(window.__dom(Object.keys(f.domKeep)));
      return { domAfterRender, econBefore, econAfter, renderBefore, renderAfter, domAfterRestore,
               modelInputs, liveInputs: JSON.stringify(gatherInputs()),
               econObj: JSON.parse(econBefore) };
    }, f);

    const kept = Object.keys(f.domKeep).every(k => String(r.domAfterRender[k]) === String(f.domKeep[k]));
    check('C4b-2 ' + f.id + ' — the DOM still holds what was typed after render + hints',
      kept, JSON.stringify(r.domAfterRender));
    if (f.econ) {
      const econOk = Object.keys(f.econ).every(k => Math.abs((r.econObj[k] || 0) - f.econ[k]) < 1e-9);
      check('C4b-3 ' + f.id + ' — the calculation used the intended economic value',
        econOk, JSON.stringify(r.econObj));
    }
    check('C4b-4 ' + f.id + ' — capture -> restore -> recalculate preserves the economic inputs',
      r.econBefore === r.econAfter, r.econBefore + '\n        ' + r.econAfter);
    check('C4b-5 ' + f.id + ' — capture -> restore -> recalculate preserves the rendered result',
      r.renderBefore === r.renderAfter);
    check('C4b-6 ' + f.id + ' — the DOM survives the round trip unchanged',
      JSON.stringify(r.domAfterRender) === JSON.stringify(r.domAfterRestore),
      JSON.stringify(r.domAfterRestore));
  }

  // ---------- 3. N/A is reversible: the value is no longer destroyed ----------
  await page.goto('file://' + APP);
  await page.addScriptTag({ content: harness.HELPERS });
  await page.addScriptTag({ content: PROBE });
  await page.evaluate(([sc, d]) => window.__apply(sc, d), [{ fields: { price: '400,000' } }, spec.defaults]);
  const rev = await page.evaluate(() => {
    const out = {};
    [['hoa','hoaNA'], ['cdd','cddNA'], ['flood','floodNA']].forEach(([f, na]) => {
      document.getElementById(na).checked = false;
      document.getElementById(f).value = '250';
      recalc();
      const typedEcon = gatherInputs()[f];
      document.getElementById(na).checked = true;   // confirm none
      recalc();
      const naEcon = gatherInputs()[f], naDom = document.getElementById(f).value;
      document.getElementById(na).checked = false;  // un-confirm
      recalc();
      out[f] = { typedEcon, naEcon, naDom, restoredEcon: gatherInputs()[f],
                 restoredDom: document.getElementById(f).value };
    });
    return out;
  });
  for (const f of ['hoa', 'cdd', 'flood']) {
    check('C4b-7 ' + f + ' — ticking N/A zeroes the economics without destroying the value',
      rev[f].typedEcon === 250 && rev[f].naEcon === 0 && rev[f].naDom === '250', JSON.stringify(rev[f]));
    check('C4b-8 ' + f + ' — un-ticking N/A restores the typed value (was permanently lost before)',
      rev[f].restoredEcon === 250 && rev[f].restoredDom === '250', JSON.stringify(rev[f]));
  }

  // ---------- 4. R-43 specifically ----------
  const r43 = harness.flatten(spec).find(c => c.id === 'R-43');
  await page.goto('file://' + APP);
  await page.addScriptTag({ content: harness.HELPERS });
  await page.addScriptTag({ content: PROBE });
  await page.evaluate(([sc, d]) => window.__apply(sc, d), [r43, spec.defaults]);
  const r43out = await page.evaluate(() => {
    const before = window.__render(), econ = window.__econ();
    const m = BSEModel.capture();
    const modelIdentity = (function () { const a = JSON.stringify(m); BSEModel.apply(JSON.parse(a)); return a === JSON.stringify(BSEModel.capture()); })();
    recalc();
    const after = window.__render();
    return { renderStable: before === after, modelIdentity, econ,
             domHoa: document.getElementById('hoa').value,
             hoaNA: document.getElementById('hoaNA').checked,
             fhaCardShows: (document.getElementById('cardsBody').innerText.match(/\$[\d,]+\/mo PITI/) || [])[0] };
  });
  check('R-43 — render is stable and the model round-trips exactly',
    r43out.renderStable && r43out.modelIdentity, JSON.stringify(r43out));
  check('R-43 — the typed $250 survives while contributing zero to the calculation',
    r43out.domHoa === '250' && r43out.hoaNA === true && JSON.parse(r43out.econ).hoa === 0, JSON.stringify(r43out));

  check('C4b-9 no JavaScript errors', errors.length === 0, errors.join(' | '));

  await browser.close();
  console.log('\n=========================================================');
  console.log('  C-4b PRESENTATION INTEGRITY — Gate B.5');
  console.log('  scenarios exercised: ' + cases.length + '   field cases: ' + FIELD_CASES.length);
  console.log('  PASS ' + pass + '   FAIL ' + fail);
  if (failures.length) failures.forEach(f => console.log('   - ' + f));
  console.log('=========================================================');
  process.exit(fail ? 1 : 0);
})();
