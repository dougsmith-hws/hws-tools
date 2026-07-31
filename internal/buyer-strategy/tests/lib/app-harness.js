/* =====================================================================
   BSE test harness — shared scenario driver
   Used by tests/capture-engine-output.js and tests/bse-regression.test.js
   so the permanent suite drives the application exactly the way the
   baseline was captured.
   ===================================================================== */
const fs = require('fs');
const path = require('path');

const SPEC_PATH = path.join(__dirname, '..', 'scenarios', 'bse-regression-scenarios.json');

const HELPERS = `
window.__apply = function(sc, defaults){
  var f = Object.assign({}, defaults.fields, sc.fields || {});
  Object.keys(f).forEach(function(id){ var el=document.getElementById(id); if(el) el.value = f[id]; });
  var c = Object.assign({}, defaults.checkboxes, sc.checkboxes || {});
  Object.keys(c).forEach(function(id){ var el=document.getElementById(id); if(el) el.checked = !!c[id]; });
  var s = Object.assign({}, defaults.selects, sc.selects || {});
  Object.keys(s).forEach(function(id){ var el=document.getElementById(id); if(el) el.value = s[id]; });
  var u = Object.assign({}, defaults.units, sc.units || {});
  unitState.dp = u.dp; unitState.tax = u.tax; offerConcUnit.v = u.offerConc; counterUnit.v = u.counterConc;
  var nm = sc.negMode || defaults.negMode;
  document.querySelectorAll('input[name="negMode"]').forEach(function(r){ r.checked = (r.value===nm); });
  renderUnitToggles();
  recalc();
  (sc.toggles||[]).forEach(function(t){
    if(t.key==='dp'||t.key==='tax') setUnit(t.key, t.to);
    else if(t.key==='offerConc') setOfferConcUnit(t.to);
    else setCounterUnit(t.to);
  });
  if(sc.then_fields){
    Object.keys(sc.then_fields).forEach(function(id){ var el=document.getElementById(id); if(el) el.value = sc.then_fields[id]; });
    recalc();
  }
  if(sc.manual_split){
    var btn=document.getElementById('btnManualSplit'); if(btn) btn.click();
    if(sc.manual_split.costs!=null){
      var cEl=document.getElementById('concCosts');
      cEl.value = sc.manual_split.costs;
      cEl.dispatchEvent(new Event('input', {bubbles:true}));
      cEl.dispatchEvent(new Event('blur', {bubbles:true}));
    }
  }
  if(sc.gap){ var b=document.querySelector('#gsBtns .gs-btn[data-gs="'+sc.gap+'"]'); if(b) b.click(); }
  if(sc.counter){ recalcCounter(); }
  return true;
};

window.__capture = function(){
  var t = function(id){ var e=document.getElementById(id); return e ? (e.innerText||'').replace(/\\s+/g,' ').trim() : null; };
  var inp = gatherInputs();
  /* WP-3 — pickBestOverall() was deleted from the engine. The capture keeps a
     bestOverall key so the frozen baseline's shape does not change, and it now
     holds the priority-aware pick: the ONE selector that remains. */
  var res = null, pick = null, prio = null;
  try { res = Engine.run(inp, A_CONST); } catch(e){ res = { error: String(e) }; }
  try { prio = (res && res.scenarios) ? Engine.priorityPick(res.scenarios, inp) : null; } catch(e){ prio = { error:String(e) }; }
  pick = prio;
  var slim = function(s){
    var o = {};
    ['id','label','name','dp','price','down','baseLoan','loanAmount','ltv','rate','financedFee','feePct','feeLabel',
     'miRate','monthlyMI','miMode','mipLife','mipDropMonth','pi','escrow','taxes','fixedEsc','piti','closing',
     'cashToClose','cashRemaining','front','back','cancelMonth','postCancelPITI','miCostHorizon','totalCostHorizon',
     'concLimitPct','concLimit','conc','maxPrice','binding','comfortPrice','qualPrice','frontFlag','requiresGift']
      .forEach(function(k){ if(s[k]!==undefined) o[k] = s[k]; });
    return o;
  };
  return {
    inputs: JSON.parse(JSON.stringify(inp)),
    unitState: { dp: unitState.dp, tax: unitState.tax, offerConc: offerConcUnit.v, counterConc: counterUnit.v },
    domValues: { price: (document.getElementById('price')||{}).value,
                 dpTarget: (document.getElementById('dpTarget')||{}).value,
                 taxRate: (document.getElementById('taxRate')||{}).value,
                 offerConc: (document.getElementById('offerConc')||{}).value,
                 counterConc: (document.getElementById('counterConc')||{}).value },
    scenarios: (res && res.scenarios) ? res.scenarios.map(slim) : [],
    eliminated: (res && res.eliminated) ? res.eliminated : [],
    dpDimmed: (res && res.dpDimmed) ? res.dpDimmed : [],
    bestOverall: pick ? { id: pick.id, name: pick.name, dp: pick.dp, piti: pick.piti,
                          cashRemaining: pick.cashRemaining, totalCostHorizon: pick.totalCostHorizon,
                          cashToClose: pick.cashToClose, _reason: pick._reason, _gapMode: pick._gapMode } : null,
    priorityPick: prio ? { id: prio.id, name: prio.name, dp: prio.dp } : null,
    rendered: { modeBadge: t('modeBadge'), snapBody: t('snapBody'), cardsBody: t('cardsBody'),
                gsPanel: t('gsPanel'), negMount: t('negMount'), propFull: t('propFull'),
                coPanels: t('coPanels'), coNetVal: t('coNetVal'), counterBody: t('counterBody'),
                stPay: t('stPay'), stCash: t('stCash'), stDti: t('stDti') }
  };
};
`;

function loadSpec() {
  return JSON.parse(fs.readFileSync(SPEC_PATH, 'utf8'));
}

function flatten(spec) {
  const out = [];
  for (const s of spec.scenarios) {
    if (s.subcases) {
      for (const sub of s.subcases) {
        out.push({ parent: s.id, id: sub.id, name: s.name + ' — ' + sub.label,
                   not_executable: sub.not_executable,
                   fields: Object.assign({}, s.fields, sub.fields),
                   checkboxes: Object.assign({}, s.checkboxes, sub.checkboxes),
                   selects: Object.assign({}, s.selects, sub.selects),
                   units: Object.assign({}, s.units, sub.units),
                   negMode: sub.negMode || s.negMode, gap: sub.gap || s.gap,
                   counter: sub.counter || s.counter, toggles: sub.toggles || s.toggles,
                   then_fields: sub.then_fields || s.then_fields,
                   manual_split: sub.manual_split || s.manual_split,
                   audit_note: s.audit_note });
      }
    } else {
      out.push(Object.assign({ parent: s.id }, s));
    }
  }
  return out;
}

/** Run every scenario against an application file and return the raw capture. */
async function captureAll(appPath, chromium) {
  const spec = loadSpec();
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  const cases = flatten(spec);
  const results = {};
  for (const c of cases) {
    if (c.not_executable) { results[c.id] = { id: c.id, name: c.name, not_executable: c.not_executable }; continue; }
    await page.goto('file://' + path.resolve(appPath));
    await page.addScriptTag({ content: HELPERS });
    await page.evaluate(([sc, d]) => window.__apply(sc, d), [c, spec.defaults]);
    const cap = await page.evaluate(() => window.__capture());
    results[c.id] = Object.assign({ id: c.id, parent: c.parent, name: c.name, audit_note: c.audit_note }, cap);
  }
  await browser.close();
  return { cases: results, pageErrors: errors, spec };
}

module.exports = { HELPERS, loadSpec, flatten, captureAll, SPEC_PATH };
