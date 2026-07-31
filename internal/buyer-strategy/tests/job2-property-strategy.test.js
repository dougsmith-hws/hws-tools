/* =====================================================================
   JOB 2 — PROPERTY STRATEGY (answer-first)
   =====================================================================
   PROPERTY → BUYER GOAL → ANSWER → STRATEGY IF NEEDED.

   Covers the nine cases in the Job 2 scope §16:

     A  payment goal, achievable                 required down solved, funds
                                                 sufficient, qualification passes
     B  payment goal, cash short                 payment reachable mathematically,
                                                 buyer cannot execute it
     C  payment goal, qualification fails        must NOT read "Goal achievable"
     D  already under target                     no unnecessary additional down
     E  debt payoff helps                        goal flips to achievable
     F  debt payoff hurts                        at-closing payoff consumes the
                                                 cash that made it work — must
                                                 say do not do it
     G  seller value                             the existing negotiation engine
                                                 ranks by buyer priority
     H  negotiation counter                      updated terms rerun the same
                                                 goal test, round history intact
     I  Job 1 non-interference                   the approved pins are unmoved

   Plus: constraint classification agrees with the banner (the defect class
   Phase 4 §2.6 fixed once already), Accepted status round-trips, and no
   NaN / undefined / Infinity reaches the screen in any case.

   THE PINNED PROFILE is the one Doug verified by hand, from
   tests/job1-whatif.test.js:
     credit 788 · funds $200,000 · preferred down $150,000 (dollars)
     target $3,000/mo · income $9,500 · debts $40 · tax $582/mo · HOI $250
   At conv 6.750% the Job 1 figures are Comfort Shopping Max $484,259,
   Maximum Purchasing Power $674,670, Cash-Limited $1,816,667.
   At conv 6.875% — Implementation-Report Addendum B5 — a $499,900 property
   requires $169,900 down to hold $3,000/mo.

   Usage:  node tests/job2-property-strategy.test.js index.html
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
    if (detail !== undefined)
      console.log('        ' + (typeof detail === 'string' ? detail.slice(0, 500) : JSON.stringify(detail).slice(0, 500)));
  }
}
const near = (a, b, eps) => Math.abs(a - b) <= (eps === undefined ? 0.51 : eps);

/* The verified profile, at the 6.875% conventional rate of Addendum B5. */
const BASE = {
  price: '499,900', score: '788', ownFunds: '200,000', gift: '0', dpTarget: '150,000',
  target: '3,000', income: '9,500', debts: '40', stay: '7', priority: 'balanced',
  rateConv: '6.875', rateFha: '6.250', rateVa: '6.125', ccPct: '3', ccOverride: '',
  taxRate: '582', hoi: '250', hoa: '0', cdd: '0', flood: '0',
  offerPrice: '', offerConc: '0', counterPrice: '', counterConc: '0', counterLoan: 'auto'
};
const CHECKS = { hoaNA: true, cddNA: true, floodNA: true, tgFthb: false, tgVa: false, vaExempt: false };

const SETUP = `
window.__set = function(f, c){
  Object.keys(f).forEach(function(id){ var e=document.getElementById(id); if(e) e.value=f[id]; });
  Object.keys(c).forEach(function(id){ var e=document.getElementById(id); if(e) e.checked=!!c[id]; });
  unitState.dp='dollar'; unitState.tax='dollarMo';
  offerConcUnit.v='dollar'; counterUnit.v='dollar';
  renderUnitToggles(); recalc(); return true;
};
window.__txt = function(id){ var e=document.getElementById(id); return e ? (e.innerText||'') : ''; };
/* The Job 2 verdict, read from the model rather than scraped off the screen. */
window.__goal = function(){
  var inp = resolvedInputs();
  if(inp.shopping) return null;
  var sol = requiredDownForPayment(inp, inp.price, inp.target);
  var st  = paymentGoalStatus(inp, sol);
  var out = { state: st.state, why: st.why || null, alreadyUnder: !!st.alreadyUnder,
              payOk: !!st.payOk, qualOk: !!st.qualOk, fundsOk: !!st.fundsOk,
              constraint: (st.state === 'yes' || st.state === 'unknown')
                            ? null : goalConstraint(inp, st).kind,
              planned: plannedDownAt(inp, inp.price) };
  if(st.r){
    out.dpDollar = st.r.dpDollar; out.dpPct = st.r.dpPct; out.piti = st.r.piti;
    out.cashToClose = st.r.cashToClose; out.cashRemaining = st.r.cashRemaining;
    out.cashGap = st.r.cashGap; out.back = st.r.back; out.backLimit = st.r.backLimit;
    out.label = st.r.label; out.closing = st.r.closing;
  }
  if(st.state === 'hard') out.floor = st.floor;
  return out;
};
/* The property-level payoff comparison, from the same helpers the lever uses. */
window.__payoff = function(list, timing){
  debtList = list.map(function(d, i){ return { id:i+1, label:d.label||'', monthly:d.monthly||0,
                                               balance:d.balance||0, on:true }; });
  debtTiming = timing;
  var inp = resolvedInputs();
  var adj = debtAdjustedInputs(inp, debtSelected(), timing);
  var before = propertyGoalSnapshot(inp), after = propertyGoalSnapshot(adj.inputs);
  var html = propDebtOutHTML(inp);
  return { beforeAchievable: before.achievable, afterAchievable: after.achievable,
           beforeReserve: before.reserve, afterReserve: after.reserve,
           beforeBack: before.back, afterBack: after.back,
           beforeCash: before.cashToClose, afterCash: after.cashToClose,
           monthlyFreed: adj.monthlyFreed, cashOut: adj.cashOut,
           verdictGood: /dpo-verdict good/.test(html),
           verdictBad: /dpo-verdict bad/.test(html),
           verdictMixed: /dpo-verdict mixed/.test(html),
           html: html.replace(/<[^>]+>/g,' ').replace(/\\s+/g,' ') };
};
window.__clearDebts = function(){ debtList = []; return true; };
window.__neg = function(){
  var inp = resolvedInputs();
  var res = engineRun(inp);
  var neg = analyzeNegotiation(inp, res);
  if(!neg) return null;
  var html = job2SellerValueHTML(inp, neg);
  return { room: neg.room, recommendedPathKey: neg.recommendedPathKey,
           rendered: !!html, sellerValue: (inp.negotiatingRoom||0) + Math.max(0, inp.sellerConcession||0),
           text: html.replace(/<[^>]+>/g,' ').replace(/\\s+/g,' '),
           paths: Object.keys(neg.paths).reduce(function(o,k){
             var p = neg.paths[k];
             o[k] = p ? { piti:p.piti, cashToClose:p.cashToClose, price:p.price, unused:p.unused } : null;
             return o; }, {}) };
};
window.__job1 = function(){
  var inp = resolvedInputs();
  var snap = powerSnapshot(inp);
  if(!snap) return null;
  return { comfort: snap.comfort, qual: snap.qual, cash: snap.cash,
           shopTo: snap.shopTo, controlling: snap.controlling.why };
};
window.__accept = function(v){
  propertyAccepted = v; recalc();
  var rows = BSEPersistence.__serializeRows(BSEModel.capture(),
    { owner_user_id:'u', buyer_profile_id:'b', shopping_plan_id:'s', property_id:'p',
      property_scenario_id:'ps', assumption_set_id:'a', display_name:'T', property_label:'P1' }, null);
  return { status: rows.property_scenario.status,
           accepted: rows.property_scenario.is_accepted_property,
           rounds: (rows.negotiation_rounds||[]).length,
           bar: /acceptbar on/.test(document.getElementById('answerBody').innerHTML) };
};
window.__rate = function(){
  var inp = resolvedInputs();
  var res = engineRun(inp);
  var viable = (res.scenarios||[]).slice();
  var ref = viable.length ? priorityScenario(viable, inp) : null;
  if(!ref) return null;
  /* Do not leave the lever open — a later interaction test clicks it. */
  var was = answerUi.prate;
  answerUi.prate = true;
  var html = job2RateHTML(inp, ref);
  answerUi.prate = was;
  /* propRateAt must agree with the protected engine at the SAME rate. */
  var same = propRateAt(inp, ref.id, inp.price, ref.dp, ref.rate);
  return { text: html.replace(/<[^>]+>/g,' ').replace(/\\s+/g,' '),
           basePiti: ref.piti, probePiti: same.piti };
};
`;

const BAD = /(NaN|undefined|Infinity|\[object Object\]|\$-0\b)/;
const scanBad = t => (t.match(BAD) || []);

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.addInitScript(SETUP);
  await page.goto('file://' + path.resolve(appPath));
  await page.waitForFunction(() => typeof window.__set === 'function');

  const set = f => page.evaluate(a => window.__set(a.f, a.c), { f: Object.assign({}, BASE, f), c: CHECKS });
  const goal = () => page.evaluate(() => window.__goal());
  const body = () => page.evaluate(() => window.__txt('answerBody'));

  /* ================================================================
     I · JOB 1 NON-INTERFERENCE — checked FIRST, before anything else
     ================================================================ */
  console.log('\n--- I · Job 1 is unmoved (checked first) ---');
  await set({ price: '', rateConv: '6.750' });
  let j1 = await page.evaluate(() => window.__job1());
  ok('Shopping Range still activates when the list price is blank', !!j1, j1);
  ok('Comfort Shopping Max is still $484,259', near(j1.comfort, 484259, 1), j1);
  ok('Maximum Purchasing Power is still $674,670', near(j1.qual, 674670, 1), j1);
  ok('Cash-Limited Buying Power is still $1,816,667', near(j1.cash, 1816667, 1), j1);
  ok('the controlling constraint is still Comfort Payment', j1.controlling === 'Comfort Payment', j1);
  ok('Shop up to is still the comfort figure', near(j1.shopTo, 484259, 1), j1);
  const shopTxt = await body();
  ok('Job 1 still shows all three cards', /COMFORT SHOPPING MAX/i.test(shopTxt) &&
     /MAXIMUM PURCHASING POWER/i.test(shopTxt) && /CASH-LIMITED BUYING POWER/i.test(shopTxt));
  ok('Job 1 still shows the required-down what-if', /How much down to stay at \$3,000\/mo\?/i.test(shopTxt));
  ok('Job 1 still shows Rate Impact', /What would a rate change mean\?/i.test(shopTxt));
  ok('Job 1 still shows the debt payoff lever', /Debt payoff lever/i.test(shopTxt));
  ok('Job 1 does not show any Job 2 block', !/GOAL ACHIEVABLE|REQUIRED DOWN PAYMENT|HOW ELSE COULD WE STRUCTURE IT/i.test(shopTxt),
     shopTxt.slice(0, 300));
  ok('no NaN in Job 1', scanBad(shopTxt).length === 0, scanBad(shopTxt));

  /* Rate Impact pins, §15. */
  const ri = await page.evaluate(() => {
    const inp = resolvedInputs(), snap = powerSnapshot(inp), ref = rateReference(snap);
    const R = rateScenarios(inp, ref);
    const at = d => R.rows.filter(r => Math.abs(r.delta - d) < 1e-9)[0];
    return { base: R.base.piti, baseCeil: R.base.ceiling,
             up: at(0.25).piti, upCeil: at(0.25).ceiling,
             dn: at(-0.25).piti, dnCeil: at(-0.25).ceiling, rate: ref.rate };
  });
  ok('Rate Impact base rate is still 6.750%', near(ri.rate, 6.75, 0.0001), ri);
  ok('Rate Impact +0.25% is still +$56/mo', Math.round(ri.up - ri.base) === 56, ri);
  ok('Rate Impact +0.25% is still −$8,393 of buying power',
     Math.round(ri.upCeil - ri.baseCeil) === -8393, ri);
  ok('Rate Impact −0.25% is still −$55/mo', Math.round(ri.dn - ri.base) === -55, ri);
  ok('Rate Impact −0.25% is still +$8,742 of buying power',
     Math.round(ri.dnCeil - ri.baseCeil) === 8742, ri);

  /* ================================================================
     ACTIVATION — Job 2 takes over on a list price and nothing else
     ================================================================ */
  console.log('\n--- activation ---');
  await set({});
  let head = await page.evaluate(() => window.__txt('answerHead'));
  ok('entering a list price activates Job 2', /JOB 2/.test(head) && /How do we accomplish/.test(head), head);
  let t = await body();
  ok('the property price is the reference price on screen', /PROPERTY[\s\S]{0,20}\$499,900/i.test(t), t.slice(0, 200));
  ok('the buyer goal is shown at the top', /GOAL[\s\S]{0,90}Keep the payment at or under \$3,000\/mo/i.test(t),
     t.slice(0, 400));

  /* ================================================================
     A · PAYMENT GOAL — ACHIEVABLE  (the Fernando question)
     ================================================================ */
  console.log('\n--- A · payment goal, achievable ---');
  let g = await goal();
  ok('A the goal is achievable', g.state === 'yes', g);
  ok('A required down is $169,900', near(g.dpDollar, 169900, 1), g);
  ok('A that is 34.0% down', near(g.dpPct, 34.0, 0.05), g);
  ok('A the payment lands at $3,000/mo', near(g.piti, 3000, 0.51), g);
  ok('A cash to close is $179,800', near(g.cashToClose, 179800, 1), g);
  ok('A reserve after close is $20,200', near(g.cashRemaining, 20200, 1), g);
  ok('A the planned down payment resolves to $150,000', near(g.planned, 150000, 0.01), g);
  ok('A all three tests pass', g.payOk && g.qualOk && g.fundsOk, g);
  ok('A there is no blocking constraint', g.constraint === null, g);

  t = await body();
  ok('A the verdict is stated before any figure',
     t.indexOf('GOAL ACHIEVABLE') > -1 &&
     t.indexOf('GOAL ACHIEVABLE') < t.indexOf('REQUIRED DOWN PAYMENT'), t.slice(0, 500));
  ok('A the answer states it in one sentence',
     /This property can be kept at \$3,000\/mo with \$169,900 down/i.test(t), t.slice(0, 700));
  ok('A it says the buyer has sufficient funds and names the reserve',
     /sufficient funds and would retain approximately \$20,200/i.test(t));
  ok('A required down payment is the headline answer',
     /REQUIRED DOWN PAYMENT[\s\S]{0,30}\$169,900/i.test(t), t.slice(0, 600));
  ok('A the planned down payment is shown', /PLANNED DOWN[\s\S]{0,20}\$150,000/i.test(t));
  ok('A the additional needed is shown as $19,900', /ADDITIONAL NEEDED[\s\S]{0,20}\$19,900/i.test(t));
  ok('A estimated PITI is shown', /ESTIMATED PITI[\s\S]{0,20}\$3,000\/mo/i.test(t));
  ok('A estimated cash to close is shown', /ESTIMATED CASH TO CLOSE[\s\S]{0,20}\$179,800/i.test(t));
  ok('A available funds are shown', /AVAILABLE FUNDS[\s\S]{0,20}\$200,000/i.test(t));
  ok('A reserve after close is shown', /RESERVE AFTER CLOSE[\s\S]{0,20}\$20,200/i.test(t));
  ok('A the three checks all read positive',
     /✓[\s\S]{0,4}Payment target achieved/i.test(t) &&
     /✓[\s\S]{0,4}Qualification achieved/i.test(t) &&
     /✓[\s\S]{0,4}Available funds sufficient/i.test(t), t);
  ok('A binding constraint reads None', /BINDING CONSTRAINT[\s\S]{0,30}None/i.test(t));
  ok('A the answer is not buried under strategy — the answer comes first',
     t.indexOf('REQUIRED DOWN PAYMENT') < t.indexOf('HOW ELSE COULD WE STRUCTURE IT'), t.slice(0, 200));
  ok('A the secondary structuring area exists', /HOW ELSE COULD WE STRUCTURE IT/i.test(t));
  ok('A no NaN', scanBad(t).length === 0, scanBad(t));

  /* The answer must be reproducible through the protected engine. */
  const rt = await page.evaluate(() => {
    const inp = resolvedInputs();
    const sol = requiredDownForPayment(inp, inp.price, inp.target);
    const r = sol.recommended;
    const s = Engine.computeScenario(Object.assign({}, inp, { shopping:false, dpTarget:null }),
                A_CONST, Engine.PROGRAMS[r.id], { dp:r.dpPct, name:'rt' }, inp.price);
    return { reported: r.piti, engine: s.piti, cashR: r.cashToClose, cashE: s.cashToClose };
  });
  ok('A the reported payment round-trips through Engine.computeScenario to the cent',
     near(rt.reported, rt.engine, 0.005), rt);
  ok('A the reported cash to close round-trips too', near(rt.cashR, rt.cashE, 0.005), rt);

  /* ================================================================
     B · PAYMENT GOAL — CASH SHORT
     ================================================================ */
  console.log('\n--- B · payment goal, cash short ---');
  await set({ ownFunds: '60,000', dpTarget: '' });
  g = await goal();
  ok('B the payment target is mathematically reachable', g.payOk, g);
  ok('B qualification still passes', g.qualOk, g);
  ok('B funds are insufficient', !g.fundsOk, g);
  ok('B the goal is NOT achievable', g.state === 'no', g);
  ok('B the blocking constraint is cash to close', g.constraint === 'cash', g);
  ok('B the shortfall is reported', near(g.cashGap, 119800, 1), g);
  t = await body();
  ok('B the banner says not achievable with the current structure',
     /GOAL NOT ACHIEVABLE WITH CURRENT STRUCTURE/i.test(t), t.slice(0, 300));
  ok('B it says the payment is achievable mathematically',
     /achievable .{0,4}mathematically/i.test(t), t.slice(0, 700));
  ok('B it says the buyer does not have the cash to execute it',
     /does not have the cash to execute it/i.test(t));
  ok('B the funds check fails and the other two pass',
     /✗[\s\S]{0,4}Available funds sufficient/i.test(t) &&
     /✓[\s\S]{0,4}Payment target achieved/i.test(t) &&
     /✓[\s\S]{0,4}Qualification achieved/i.test(t), t);
  ok('B the binding constraint on screen is cash, not comfort payment',
     /BINDING CONSTRAINT[\s\S]{0,40}Cash to close/i.test(t), t.slice(t.indexOf('BINDING'), t.indexOf('BINDING') + 300));
  ok('B cash strategies are offered', /Seller concession to closing costs|Gift funds/i.test(t));
  ok('B debt payoff is NOT offered as a cash strategy',
     !/WHAT MOVES IT — CASH TO CLOSE[\s\S]{0,600}?Debt payoff —/i.test(t));
  ok('B no NaN', scanBad(t).length === 0, scanBad(t));

  /* ================================================================
     C · PAYMENT GOAL — QUALIFICATION FAILS
     ================================================================ */
  console.log('\n--- C · payment goal, qualification fails ---');
  await set({ income: '5,000', debts: '2,500', ownFunds: '400,000', dpTarget: '' });
  g = await goal();
  ok('C the payment target is reachable', g.payOk, g);
  ok('C funds are sufficient', g.fundsOk, g);
  ok('C qualification fails', !g.qualOk, g);
  ok('C the goal is NOT achievable', g.state === 'no', g);
  ok('C the blocking constraint is qualification', g.constraint === 'qualification', g);
  t = await body();
  ok('C the banner does NOT say Goal achievable', !/✅ GOAL ACHIEVABLE|GOAL ALREADY ACHIEVED/i.test(t),
     t.slice(0, 300));
  ok('C the banner says not achievable', /GOAL NOT ACHIEVABLE WITH CURRENT STRUCTURE/i.test(t));
  ok('C it explains the file does not qualify as structured',
     /does not qualify as structured/i.test(t));
  ok('C the qualification check fails', /✗[\s\S]{0,4}Qualification achieved/i.test(t), t);
  ok('C the property fit is evaluated at the goal structure, not "no eligible structure"',
     !/No eligible structure/i.test(t), t.slice(0, 900));
  ok('C DTI strategies are offered', /Co-borrower|Debt payoff/i.test(t));
  ok('C no nonsense price reduction to $0 is offered', !/\(to \$0\)/.test(t), t);
  ok('C no NaN', scanBad(t).length === 0, scanBad(t));

  /* ================================================================
     D · ALREADY UNDER TARGET
     ================================================================ */
  console.log('\n--- D · already under target ---');
  await set({ target: '5,000', dpTarget: '' });
  g = await goal();
  ok('D the goal is achievable', g.state === 'yes', g);
  ok('D the solver reports it is already met at the program minimum', g.alreadyUnder, g);
  ok('D the payment is under the target', g.piti < 5000, g);
  t = await body();
  ok('D the banner says the goal is already achieved', /GOAL ALREADY ACHIEVED/i.test(t), t.slice(0, 300));
  ok('D it states no additional down payment is required',
     /No additional down payment is required/i.test(t), t.slice(0, 800));
  ok('D no additional-down-payment strategy is recommended',
     !/Additional down payment —/i.test(t), t);
  ok('D binding constraint reads None', /BINDING CONSTRAINT[\s\S]{0,30}None/i.test(t));
  ok('D the constraint line says optimisation only',
     /optimisation only, not a problem to solve/i.test(t));
  ok('D no NaN', scanBad(t).length === 0, scanBad(t));

  /* ================================================================
     E · DEBT PAYOFF HELPS
     ================================================================ */
  console.log('\n--- E · debt payoff materially helps ---');
  /* Income and debts chosen so the goal structure fails DTI by a margin one
     debt clears, with plenty of cash so the payoff cannot create a cash problem. */
  await set({ income: '6,800', debts: '500', ownFunds: '400,000', dpTarget: '', target: '3,000' });
  g = await goal();
  ok('E the goal starts out not achievable on qualification',
     g.state === 'no' && g.constraint === 'qualification', g);
  let po = await page.evaluate(() => window.__payoff([{ label:'Car', monthly:500, balance:9000 }], 'before_closing'));
  ok('E paying it off BEFORE closing makes the property work',
     po.beforeAchievable === false && po.afterAchievable === true, po);
  ok('E DTI improves', po.afterBack < po.beforeBack, po);
  ok('E paid before closing does not touch cash to close',
     near(po.beforeCash, po.afterCash, 0.51), po);
  ok('E the verdict is positive and says so',
     po.verdictGood && /makes the property work/i.test(po.html), po.html.slice(0, 400));
  ok('E the AUS caveat is always present',
     /Verify debt treatment with lender guidelines\/AUS/i.test(po.html));
  ok('E no NaN in the payoff output', scanBad(po.html).length === 0, scanBad(po.html));

  /* ================================================================
     F · DEBT PAYOFF HURTS
     ================================================================ */
  console.log('\n--- F · debt payoff hurts — must say do not do it ---');
  await set({ income: '9,500', debts: '440', ownFunds: '200,000', dpTarget: '150,000', target: '3,000' });
  g = await goal();
  ok('F the goal is achievable before any payoff', g.state === 'yes', g);
  po = await page.evaluate(() => window.__payoff([{ label:'Car', monthly:400, balance:32000 }], 'at_closing'));
  ok('F an at-closing payoff improves DTI', po.afterBack < po.beforeBack, po);
  ok('F it consumes the buyer cash', near(po.cashOut, 32000, 0.01), po);
  ok('F reserve after close gets worse', po.afterReserve < po.beforeReserve, po);
  ok('F the tool says do not pay this off at closing',
     /Do not pay this off at closing/i.test(po.html), po.html.slice(0, 500));
  ok('F it points at paying before closing instead',
     /before.{0,3} closing/i.test(po.html));
  ok('F the verdict is rendered as bad or mixed, never good',
     (po.verdictBad || po.verdictMixed) && !po.verdictGood, po);
  ok('F no NaN in the payoff output', scanBad(po.html).length === 0, scanBad(po.html));

  /* The same payoff BEFORE closing must not be condemned. */
  po = await page.evaluate(() => window.__payoff([{ label:'Car', monthly:400, balance:32000 }], 'before_closing'));
  ok('F paid before closing is not condemned', !/Do not pay this off/i.test(po.html), po.html.slice(0, 300));
  await page.evaluate(() => window.__clearDebts());

  /* ================================================================
     G · SELLER VALUE — the existing negotiation engine, goal-first
     ================================================================ */
  console.log('\n--- G · negotiable seller value ---');
  await set({ offerPrice: '489,900', offerConc: '10,000', priority: 'payment' });
  let n = await page.evaluate(() => window.__neg());
  ok('G the negotiation engine still produces a recommendation', !!n && !!n.recommendedPathKey, n);
  ok('G the requested adjustment is $10,000', near(n.room, 10000, 0.01), n);
  ok('G negotiable seller value counts the concession too', near(n.sellerValue, 20000, 0.01), n);
  ok('G the goal-first panel renders', n.rendered, n);
  ok('G it names the winning path', new RegExp(n.recommendedPathKey === 'reduction' ? 'Price reduction'
        : n.recommendedPathKey === 'concession' ? 'concession' : 'Split', 'i').test(n.text), n.text.slice(0, 400));
  ok('G it states a recommendation tied to the buyer goal',
     /Recommendation\.[\s\S]{0,400}stated goal/i.test(n.text), n.text.slice(0, 600));
  ok('G with a payment priority the recommendation reasons about payment',
     /Lowest payment|payment/i.test(n.text), n.text.slice(0, 400));
  ok('G all three paths are compared when there is room to allocate',
     /Price reduction/i.test(n.text) && /Split/i.test(n.text), n.text.slice(0, 500));
  ok('G no NaN in the seller-value panel', scanBad(n.text).length === 0, scanBad(n.text));

  /* A concession written at list — no price adjustment — still shows the panel. */
  await set({ offerPrice: '499,900', offerConc: '10,000', priority: 'payment' });
  n = await page.evaluate(() => window.__neg());
  ok('G a concession at list price still renders the panel', n && n.rendered, n);
  ok('G …and reports $10,000 of seller value, not $0', near(n.sellerValue, 10000, 0.01), n);
  ok('G …and collapses to one row, because the three paths are identical arithmetic',
     !/Price reduction/i.test(n.text), n.text.slice(0, 400));

  /* Changing the priority must change what wins or how it is argued. */
  await set({ offerPrice: '489,900', offerConc: '0', priority: 'cash' });
  const nCash = await page.evaluate(() => window.__neg());
  await set({ offerPrice: '489,900', offerConc: '0', priority: 'payment' });
  const nPay = await page.evaluate(() => window.__neg());
  ok('G buyer priority drives the seller-value answer',
     nCash.recommendedPathKey !== nPay.recommendedPathKey || nCash.text !== nPay.text,
     { cash: nCash.recommendedPathKey, payment: nPay.recommendedPathKey });
  ok('G a cash priority measures the paths in cash to close',
     /cash to close/i.test(nCash.text), nCash.text.slice(0, 300));

  /* ================================================================
     H · NEGOTIATION COUNTER — the same goal test against new terms
     ================================================================ */
  console.log('\n--- H · seller counter reruns the same goal test ---');
  await set({ priority: 'balanced', dpTarget: '150,000', ownFunds: '200,000',
              income: '9,500', debts: '40', offerPrice: '', offerConc: '0' });
  const atList = await goal();
  await set({ price: '479,900', priority: 'balanced', dpTarget: '150,000', ownFunds: '200,000',
              income: '9,500', debts: '40' });
  const atCounter = await goal();
  ok('H updated property terms rerun the same goal test',
     atCounter.state === 'yes' && atCounter.dpDollar < atList.dpDollar,
     { list: atList.dpDollar, counter: atCounter.dpDollar });
  ok('H the counter needs less down and states it',
     atList.dpDollar - atCounter.dpDollar > 1000, { list: atList.dpDollar, counter: atCounter.dpDollar });
  t = await body();
  ok('H the counter price becomes the reference price', /PROPERTY[\s\S]{0,20}\$479,900/i.test(t), t.slice(0, 200));

  /* Round persistence: two rounds captured, identity stable, history preserved. */
  await set({ price: '499,900', offerPrice: '489,900', counterPrice: '494,900', counterConc: '5,000' });
  const rounds = await page.evaluate(() => {
    const m = BSEModel.capture();
    return (m.negotiation_rounds || []).map(r => ({ n: r.round_number, actor: r.actor, price: r.price }));
  });
  ok('H a buyer round and a seller counter are both captured', rounds.length === 2, rounds);
  ok('H the buyer round is round 1', rounds[0] && rounds[0].round_number !== 0 &&
     rounds[0].n === 1 && rounds[0].actor === 'buyer', rounds);
  ok('H the seller counter is round 2 at the counter price',
     rounds[1] && rounds[1].n === 2 && rounds[1].actor === 'seller' && near(rounds[1].price, 494900, 0.01), rounds);

  /* ================================================================
     ACCEPTED / CONTRACT  (§12 — only because the DB guard is verified)
     ================================================================ */
  console.log('\n--- Accepted / contract status ---');
  let acc = await page.evaluate(() => window.__accept(false));
  ok('a draft scenario persists as status draft', acc.status === 'draft' && acc.accepted === false, acc);
  ok('the accept bar is not highlighted while unaccepted', acc.bar === false, acc);
  acc = await page.evaluate(() => window.__accept(true));
  ok('marking accepted persists status under_contract',
     acc.status === 'under_contract' && acc.accepted === true, acc);
  ok('marking accepted preserves round history', acc.rounds === 2, acc);
  ok('the accept bar reflects the accepted state', acc.bar === true, acc);
  t = await body();
  ok('accepted is explicitly not immutable on screen',
     /every field stays editable/i.test(t), t.slice(t.indexOf('Accepted'), t.indexOf('Accepted') + 400));
  const stillEditable = await page.evaluate(() => {
    document.getElementById('counterPrice').value = '492,000';
    recalc();
    const m = BSEModel.capture();
    const seller = (m.negotiation_rounds || []).filter(r => r.actor === 'seller')[0];
    return { price: seller ? seller.price : null,
             accepted: m.property_scenario.is_accepted_property,
             status: m.property_scenario.status };
  });
  ok('fields remain editable after acceptance', near(stillEditable.price, 492000, 0.01), stillEditable);
  ok('and the accepted marking survives the edit',
     stillEditable.accepted === true && stillEditable.status === 'under_contract', stillEditable);
  await page.evaluate(() => window.__accept(false));

  /* ================================================================
     RATE INTELLIGENCE AT THE PROPERTY (§10)
     ================================================================ */
  console.log('\n--- rate intelligence at this property ---');
  await set({ price: '499,900', target: '2,800', offerPrice: '', offerConc: '0',
              counterPrice: '', counterConc: '0', dpTarget: '' });
  const rr = await page.evaluate(() => window.__rate());
  ok('the property rate probe agrees with the engine at the base rate',
     near(rr.basePiti, rr.probePiti, 0.005), rr);
  ok('it answers what rate would make this property work',
     /What rate would make this property work/i.test(rr.text), rr.text.slice(0, 300));
  ok('the reference structure is named and the price is this property',
     /Reference structure[\s\S]{0,120}\$499,900/i.test(rr.text), rr.text.slice(0, 300));
  ok('it states that only the rate moves',
     /Only the rate moves/i.test(rr.text));
  ok('it carries the illustrative-rate disclaimer',
     /Not a rate quote, not a lock, and not a commitment to lend/i.test(rr.text));
  ok('no NaN in the rate section', scanBad(rr.text).length === 0, scanBad(rr.text));

  /* ================================================================
     OTHER GOALS still answer, and still classify
     ================================================================ */
  console.log('\n--- the other buyer priorities ---');
  await set({ priority: 'cash', dpTarget: '', ownFunds: '200,000', target: '3,000' });
  t = await body();
  ok('a cash goal answers in cash to close', /Minimise cash to close/i.test(t), t.slice(0, 300));
  ok('a cash goal still commits to a verdict', /GOAL ACHIEVABLE|GOAL NOT ACHIEVABLE/i.test(t), t.slice(0, 300));
  ok('no NaN under a cash goal', scanBad(t).length === 0, scanBad(t));
  await set({ priority: 'power', dpTarget: '', ownFunds: '200,000', target: '3,000' });
  t = await body();
  ok('a maximum-price goal answers in qualifying price',
     /Maximum purchase price within qualification/i.test(t), t.slice(0, 300));
  ok('a maximum-price goal still commits to a verdict',
     /GOAL ACHIEVABLE|GOAL NOT ACHIEVABLE/i.test(t), t.slice(0, 300));
  ok('no NaN under a maximum-price goal', scanBad(t).length === 0, scanBad(t));

  /* reserves / custom are NOT offered — they are reported deferred, not faked. */
  const opts = await page.evaluate(() =>
    Array.from(document.getElementById('priority').options).map(o => o.value));
  ok('the buyer_priority enum is unchanged — reserves and custom are not offered',
     opts.join(',') === 'balanced,payment,cash,power', opts);

  /* ================================================================
     THE BANNER AND THE CONSTRAINT NEVER CONTRADICT EACH OTHER
     ================================================================ */
  console.log('\n--- the verdict and the constraint always agree ---');
  const MATRIX = [
    { name: 'achievable',        f: { ownFunds: '200,000', income: '9,500', debts: '40', target: '3,000', dpTarget: '150,000' } },
    { name: 'cash short',        f: { ownFunds: '60,000',  income: '9,500', debts: '40', target: '3,000', dpTarget: '' } },
    { name: 'DTI blocked',       f: { ownFunds: '400,000', income: '5,000', debts: '2,500', target: '3,000', dpTarget: '' } },
    { name: 'escrow above target', f: { ownFunds: '400,000', income: '20,000', debts: '0', target: '700', dpTarget: '' } },
    { name: 'already under',     f: { ownFunds: '200,000', income: '9,500', debts: '40', target: '6,000', dpTarget: '' } },
    { name: 'low credit',        f: { score: '560', ownFunds: '400,000', income: '20,000', debts: '0', target: '3,000', dpTarget: '' } }
  ];
  for (const c of MATRIX) {
    await set(Object.assign({ price: '499,900', priority: 'balanced' }, c.f));
    const gg = await goal();
    const tt = await body();
    const saysYes = /✅ GOAL (ACHIEVABLE|ALREADY ACHIEVED)/i.test(tt);
    ok('"' + c.name + '" — the banner matches the model verdict',
       saysYes === (gg.state === 'yes'), { state: gg.state, saysYes: saysYes });
    ok('"' + c.name + '" — a positive verdict never shows a blocking constraint',
       !saysYes || /BINDING CONSTRAINT[\s\S]{0,30}None/i.test(tt),
       tt.slice(tt.indexOf('BINDING'), tt.indexOf('BINDING') + 200));
    ok('"' + c.name + '" — a negative verdict always names a constraint',
       saysYes || !/BINDING CONSTRAINT[\s\S]{0,30}None/i.test(tt),
       tt.slice(tt.indexOf('BINDING'), tt.indexOf('BINDING') + 200));
    ok('"' + c.name + '" — renders without NaN', scanBad(tt).length === 0, scanBad(tt));
  }

  /* ================================================================
     INTERACTION — the levers must not re-render the element that was clicked
     ================================================================
     An earlier revision refreshed the whole answer body from inside the
     `toggle` handler, which detached the <summary> mid-event and made every
     following click on the answer layer fail. Both Job 2 levers now refresh
     only their own body, and the accept bar is updated in place. */
  console.log('\n--- interaction ---');
  await set({ price: '499,900', dpTarget: '150,000', ownFunds: '200,000', income: '9,500',
              debts: '40', target: '3,000', priority: 'balanced',
              offerPrice: '', offerConc: '0', counterPrice: '', counterConc: '0' });
  for (const id of ['j2RateBox', 'j2AltBox', 'debtLever']) {
    await page.click('#' + id + ' > summary');
    const st2 = await page.evaluate(i => {
      const e = document.getElementById(i);
      return { open: !!(e && e.open), len: e ? (e.innerText || '').length : 0 };
    }, id);
    ok(id + ' opens and renders content on a real click', st2.open && st2.len > 100, st2);
  }
  await page.click('#debtAdd');
  await page.fill('.debt-row input[data-f="label"]', 'Car loan');
  await page.fill('.debt-row input[data-f="monthly"]', '400');
  await page.fill('.debt-row input[data-f="balance"]', '32000');
  await page.waitForTimeout(120);
  const focusKept = await page.evaluate(() =>
    document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.f : null);
  ok('typing in a debt field never loses focus', focusKept === 'balance', focusKept);
  const leverOut = await page.evaluate(() => document.getElementById('debtOut').innerText);
  ok('the property payoff answer updates as the debt is typed',
     /Back-end DTI at the goal structure/i.test(leverOut), leverOut.slice(0, 300));
  await page.click('#acceptToggle');
  let accUi = await page.evaluate(() => ({ flag: propertyAccepted,
    checked: document.getElementById('acceptToggle').checked,
    cls: document.getElementById('acceptBar').className }));
  ok('clicking the accept toggle marks the scenario accepted',
     accUi.flag === true && accUi.checked === true && /acceptbar on/.test(accUi.cls), accUi);
  await page.click('#acceptToggle');
  accUi = await page.evaluate(() => ({ flag: propertyAccepted,
    checked: document.getElementById('acceptToggle').checked,
    cls: document.getElementById('acceptBar').className }));
  ok('and clicking it again clears it, with the checkbox still live',
     accUi.flag === false && accUi.checked === false && !/acceptbar on/.test(accUi.cls), accUi);
  await page.evaluate(() => window.__clearDebts());

  /* ================================================================
     BELOW THE FOLD — nothing was deleted
     ================================================================ */
  console.log('\n--- the existing analysis is all still there ---');
  await set({ price: '499,900', offerPrice: '489,900', offerConc: '5,000',
              counterPrice: '494,900', dpTarget: '150,000', ownFunds: '200,000' });
  const legacy = await page.evaluate(() => ({
    snap: (document.getElementById('snapBody').innerText || '').length,
    cards: (document.getElementById('cardsBody').innerText || '').length,
    gap: !!document.getElementById('gsPanel'),
    neg: (document.getElementById('negMount').innerText || '').length,
    counter: (document.getElementById('counterBody').innerText || '').length,
    sec2visible: document.getElementById('propFull').style.display !== 'none'
  }));
  ok('Section 1 Qualification Snapshot still renders', legacy.snap > 50, legacy);
  ok('2a Recommendation Engine still renders', legacy.cards > 50, legacy);
  ok('2b Negotiation Strategy still renders', legacy.neg > 50, legacy);
  ok('2c Gap Solver is still mounted', legacy.gap, legacy);
  ok('2d Counter Offer Analyzer still renders', legacy.counter > 50, legacy);
  ok('Section 2 still activates with a list price', legacy.sec2visible, legacy);

  ok('no JavaScript errors during the whole Job 2 suite', errors.length === 0, errors);

  console.log('\n=========================================================');
  console.log('  JOB 2 — PROPERTY STRATEGY');
  console.log('  app under test: ' + appPath);
  console.log('  PASS ' + pass + '   FAIL ' + fail);
  if (fail) { console.log('  FAILURES:'); failures.forEach(f => console.log('    - ' + f)); }
  console.log('=========================================================');
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
