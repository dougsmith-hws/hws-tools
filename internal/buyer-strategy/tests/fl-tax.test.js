/* =====================================================================
   WP-1 — FLORIDA PROPERTY TAX, HOMESTEAD AND SAVE OUR HOMES PORTABILITY
   =====================================================================
   WHAT THIS SUITE PROTECTS

     • Year 1 and Year 2 are two different figures and never collapse.
       Year 1 (reassessed to the purchase price, no exemptions) is the ONLY
       one that reaches the payment engine. Year 2 is projection.
     • Portability transfers in FULL when the buyer is not downsizing, and
       PROPORTIONALLY when they are. The proportional rule is the defect in
       the donor tool and it must never come back.
     • Both homestead tiers, including the second exemption's $50k-$75k band.
     • The FL estimate is PROPERTY MODE ONLY — Shopping Range is untouched.
     • tax_method / tax_inputs / tax_outputs round-trip through persistence,
       and the four buyer_profile homestead columns actually populate.
     • Turning the panel off restores the authored tax figure exactly.

   PINNED CASE — Fernando Montilla, 27-28 July 2026 calls:
     purchase $499,900 · prior FL homestead sold $250,000, assessed $110,464
     -> transferable Save Our Homes benefit $139,536, transferred in FULL
        (the new home is worth more than the old one)
     At 18.2300 mills that is a Year 2 saving of ~$269/mo, which is the
     figure Doug quoted on the call.

   Usage:  node tests/fl-tax.test.js index.html
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

/* Fernando's profile. Income and debts were never stated on the calls — he was
   pre-approved earlier — so they are set clear of the DTI limit deliberately;
   no assertion below depends on them. */
const FERNANDO = {
  price: '499,900', score: '800', ownFunds: '200,000', gift: '0',
  dpTarget: '150,000', target: '3,000', income: '15,000', debts: '0',
  stay: '7', priority: 'payment', rateConv: '6.750', rateFha: '6.250',
  rateVa: '6.125', ccPct: '3', ccOverride: '', taxRate: '582.26',
  hoi: '250', hoa: '0', cdd: '0', flood: '0',
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
  console.log('  WP-1 — FLORIDA TAX / HOMESTEAD / PORTABILITY');
  console.log('  app under test: ' + appPath);
  console.log('=========================================================\n');

  /* ---- helper injected once ---- */
  await page.evaluate(() => {
    window.__fl = function (fields, fl) {
      Object.keys(fields).forEach(id => { const e = document.getElementById(id); if (e) e.value = fields[id]; });
      ['hoaNA', 'cddNA', 'floodNA'].forEach(i => { const e = document.getElementById(i); if (e) e.checked = true; });
      ['tgFthb', 'tgVa'].forEach(i => { const e = document.getElementById(i); if (e) e.checked = false; });
      unitState.tax = 'dollarMo'; unitState.dp = 'dollar';
      document.getElementById('flTaxOn').checked = !!(fl && fl.on);
      document.getElementById('flHomestead').checked = !!(fl && fl.homestead);
      document.getElementById('flMillage').value = (fl && fl.millage != null) ? String(fl.millage) : '';
      document.getElementById('flNonAdVal').value = (fl && fl.nonAdVal != null) ? String(fl.nonAdVal) : '';
      document.getElementById('flPriorMkt').value = (fl && fl.priorMkt != null) ? String(fl.priorMkt) : '';
      document.getElementById('flPriorAssessed').value = (fl && fl.priorAssessed != null) ? String(fl.priorAssessed) : '';
      renderUnitToggles(); recalc();
      const model = BSEModel.capture();
      const inp = BSEModel.toInputs(model);
      const res = Engine.run(inp, A_CONST);
      return {
        flNow: BSEModel.flTaxNow(),
        taxMonthly: inp.taxMonthly, taxFixed: inp.taxFixed, shopping: inp.shopping,
        hasFlTaxOnInputs: Object.prototype.hasOwnProperty.call(inp, 'flTax'),
        tax_method: model.property_scenario.tax_method,
        tax_inputs: model.property_scenario.tax_inputs,
        tax_outputs: model.property_scenario.tax_outputs,
        tax_method_version: model.property_scenario.tax_method_version,
        qualifying_tax_basis: model.property_scenario.qualifying_tax_basis,
        bp: {
          homestead_intent: model.buyer_profile.homestead_intent,
          prior_mkt: model.buyer_profile.prior_homestead_market_value,
          prior_ass: model.buyer_profile.prior_homestead_assessed_value,
          portable: model.buyer_profile.portability_eligible
        },
        scenarios: (res.scenarios || []).map(s => ({ id: s.id, dp: s.dp, piti: s.piti, taxes: s.taxes })),
        panelText: (document.getElementById('flTaxOut').innerText || '').replace(/\s+/g, ' ').trim(),
        boxHidden: document.getElementById('flBox').classList.contains('hide')
      };
    };
    /* direct access to the pure functions */
    window.__pf = (pm, pa, nm) => flPortabilityBenefit(pm, pa, nm);
    window.__hx = a => flHomesteadTaxable(a);
    window.__est = o => flTaxEstimate(o);
  });

  // =================================================================
  console.log('-- A. PORTABILITY — the rule the donor tool got wrong ----');
  // =================================================================
  let r = await page.evaluate(() => window.__pf(250000, 110464, 499900));
  ok('A1 not downsizing — the full SOH benefit transfers',
    near(r.benefit, 139536) && r.proportional === false, r);

  r = await page.evaluate(() => window.__pf(900000, 400000, 500000));
  ok('A2 DOWNSIZING — the benefit is prorated, not transferred in full',
    r.proportional === true && near(r.benefit, (500000 / 900000) * 500000, 0.01), r);
  ok('A2b the donor tool would have granted the full $500,000 here',
    r.benefit < 500000 - 1, r.benefit);

  r = await page.evaluate(() => window.__pf(2000000, 900000, 3000000));
  ok('A3 the $500,000 statutory cap binds',
    near(r.benefit, 500000) && r.capped === true, r);

  r = await page.evaluate(() => window.__pf(0, 0, 499900));
  ok('A4 no prior homestead — no benefit, no crash', r.benefit === 0, r);

  r = await page.evaluate(() => window.__pf(300000, 300000, 499900));
  ok('A5 a prior home with no SOH cap yields no benefit', r.benefit === 0, r);

  r = await page.evaluate(() => window.__pf(250000, 110464, 100000));
  ok('A6 the benefit can never exceed the new market value', r.benefit <= 100000, r);

  // =================================================================
  console.log('\n-- B. HOMESTEAD EXEMPTION — both tiers -------------------');
  // =================================================================
  let h = await page.evaluate(() => window.__hx(360364));
  ok('B1 first $25k off all levies', near(h.school, 335364), h);
  ok('B2 second $25k off non-school only', near(h.nonSchool, 310364), h);
  ok('B3 blended taxable is the average of the two', near(h.blended, 322864), h);

  h = await page.evaluate(() => window.__hx(60000));
  ok('B4 assessed $60,000 — the second exemption is only $10,000, not $25,000',
    near(h.secondExemption, 10000) && near(h.nonSchool, 25000), h);

  h = await page.evaluate(() => window.__hx(20000));
  ok('B5 assessed below the first exemption floors at zero',
    h.school === 0 && h.nonSchool === 0, h);

  // =================================================================
  console.log('\n-- C. YEAR 1 vs YEAR 2 -----------------------------------');
  // =================================================================
  let e = await page.evaluate(() => window.__est({
    price: 499900, millage: 18.23, nonAdValorem: 0, homestead: true,
    priorMarketValue: 250000, priorAssessedValue: 110464
  }));
  ok('C1 Year 1 is the full price at millage — no exemptions',
    near(e.year1.annual, 499900 * 0.01823, 0.01), e.year1);
  ok('C2 Year 1 basis is projected_reassessed', e.year1.basis === 'projected_reassessed', e.year1.basis);
  ok('C3 Year 2 applies portability then homestead',
    near(e.year2.taxable, 322864, 0.5), e.year2);
  ok('C4 Year 2 basis is stabilized_homestead', e.year2.basis === 'stabilized_homestead', e.year2.basis);
  ok('C5 Year 2 is lower than Year 1', e.year2.annual < e.year1.annual, e);
  ok('C6 FERNANDO — the Year 2 saving is about $269/mo, as quoted on the call',
    Math.abs(e.monthlySaving - 269) < 1.5, e.monthlySaving);

  e = await page.evaluate(() => window.__est({
    price: 499900, millage: 18.23, nonAdValorem: 1200, homestead: true,
    priorMarketValue: 250000, priorAssessedValue: 110464
  }));
  ok('C7 non-ad-valorem is added to BOTH years and is never exempted',
    near(e.year1.annual, 499900 * 0.01823 + 1200, 0.01) &&
    near(e.year2.annual, 322864 * 0.01823 + 1200, 0.5), e);

  e = await page.evaluate(() => window.__est({
    price: 499900, millage: 18.23, nonAdValorem: 0, homestead: false,
    priorMarketValue: 250000, priorAssessedValue: 110464
  }));
  ok('C8 no homestead intent — Year 2 equals Year 1, portability ignored',
    near(e.year1.annual, e.year2.annual, 0.01) && e.portability.benefit === 0, e);

  ok('C9 a missing millage returns null rather than a wrong number',
    (await page.evaluate(() => window.__est({ price: 499900, millage: 0 }))) === null);
  ok('C10 a missing price returns null',
    (await page.evaluate(() => window.__est({ price: 0, millage: 18.23 }))) === null);

  // =================================================================
  console.log('\n-- D. WHAT REACHES THE PAYMENT ENGINE --------------------');
  // =================================================================
  const F = await page.evaluate(f => window.__fl(f, {
    on: true, homestead: true, millage: 18.23, nonAdVal: 0,
    priorMkt: 250000, priorAssessed: 110464
  }), FERNANDO);

  ok('D1 the engine receives the YEAR 1 figure',
    near(F.taxMonthly, F.flNow.year1Monthly, 0.01), { taxMonthly: F.taxMonthly, y1: F.flNow.year1Monthly });
  ok('D2 the engine NEVER receives the Year 2 figure',
    !near(F.taxMonthly, F.flNow.year2Monthly, 1), { taxMonthly: F.taxMonthly, y2: F.flNow.year2Monthly });
  ok('D3 the scenario taxes equal the Year 1 monthly figure',
    F.scenarios.length > 0 && near(F.scenarios[0].taxes, F.flNow.year1Monthly, 0.01), F.scenarios[0]);
  ok('D4 taxFixed is set — a derived annual amount, not a rate', F.taxFixed === true);
  ok('D5 flTax is NOT on the engine input object (pinned differential surface)',
    F.hasFlTaxOnInputs === false);
  ok('D6 qualifying_tax_basis remains projected_reassessed',
    F.qualifying_tax_basis === 'projected_reassessed', F.qualifying_tax_basis);

  // =================================================================
  console.log('\n-- E. CANONICAL STATE ------------------------------------');
  // =================================================================
  ok('E1 tax_method is the reserved fl_millage discriminator',
    F.tax_method === 'fl_millage', F.tax_method);
  ok('E2 tax_method_version is stamped', F.tax_method_version === 1, F.tax_method_version);
  ok('E3 tax_inputs carries the authored millage and prior-parcel values',
    F.tax_inputs && near(F.tax_inputs.millage, 18.23) &&
    F.tax_inputs.prior_homestead_market_value === 250000 &&
    F.tax_inputs.prior_homestead_assessed_value === 110464, F.tax_inputs);
  ok('E4 tax_outputs caches both years and the benefit',
    F.tax_outputs && F.tax_outputs.year1_annual > F.tax_outputs.year2_annual &&
    near(F.tax_outputs.portability_benefit, 139536), F.tax_outputs);
  ok('E5 the four buyer_profile homestead columns populate',
    F.bp.homestead_intent === 'will_homestead' && F.bp.prior_mkt === 250000 &&
    F.bp.prior_ass === 110464 && F.bp.portable === true, F.bp);

  // =================================================================
  console.log('\n-- F. SCOPE — what WP-1 must NOT disturb -----------------');
  // =================================================================
  const OFF = await page.evaluate(f => window.__fl(f, { on: false }), FERNANDO);
  ok('F1 panel off — the authored $582.26/mo figure is used exactly',
    near(OFF.taxMonthly, 582.26, 0.005), OFF.taxMonthly);
  ok('F2 panel off — tax_method returns to null, no discriminator written',
    OFF.tax_method === null && OFF.tax_inputs === null && OFF.tax_outputs === null, OFF);
  ok('F3 panel off — flTaxNow reports inactive', OFF.flNow.active === false, OFF.flNow);

  const SHOP = await page.evaluate(f => window.__fl(
    Object.assign({}, f, { price: '' }),
    { on: true, homestead: true, millage: 18.23, priorMkt: 250000, priorAssessed: 110464 }
  ), FERNANDO);
  ok('F4 SHOPPING MODE — the FL estimate is inert, no tax_method written',
    SHOP.shopping === true && SHOP.tax_method === null, SHOP.tax_method);
  ok('F5 SHOPPING MODE — the panel is hidden', SHOP.boxHidden === true);
  ok('F6 SHOPPING MODE — flTaxNow reports inactive', SHOP.flNow.active === false);

  // =================================================================
  console.log('\n-- G. PRESENTATION ---------------------------------------');
  // =================================================================
  const P = await page.evaluate(f => window.__fl(f, {
    on: true, homestead: true, millage: 18.23, priorMkt: 250000, priorAssessed: 110464
  }), FERNANDO);
  ok('G1 the panel names both years', /Year 1 taxes/.test(P.panelText) && /Year 2 projected/.test(P.panelText), P.panelText.slice(0, 200));
  ok('G2 it states plainly that Year 1 drives the payment',
    /Year 1 is what the payment above uses/.test(P.panelText));
  ok('G3 it discloses the blended-millage approximation',
    /non-school levies only/.test(P.panelText));
  ok('G4 it names the portability line when a benefit transfers',
    /Save Our Homes portability/.test(P.panelText));
  ok('G5 it crowns nothing — no best/recommended language',
    !/\bbest\b|\brecommend/i.test(P.panelText), P.panelText.slice(0, 200));

  const DOWN = await page.evaluate(f => window.__fl(
    Object.assign({}, f, { price: '500,000' }),
    { on: true, homestead: true, millage: 18.23, priorMkt: 900000, priorAssessed: 400000 }
  ), FERNANDO);
  ok('G6 downsizing is called out on screen, not silently prorated',
    /Downsizing/.test(DOWN.panelText) && DOWN.tax_outputs.portability_proportional === true,
    DOWN.panelText.slice(0, 240));

  ok('Z no JavaScript errors during the suite', pageErrors.length === 0, pageErrors.join(' | '));

  console.log('\n=========================================================');
  console.log('  PASS ' + pass + '   FAIL ' + fail);
  if (fail) console.log('  FAILED: ' + failures.join(', '));
  console.log('=========================================================\n');
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
