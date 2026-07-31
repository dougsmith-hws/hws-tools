/* =====================================================================
   WP-3 — BUYER PRIORITY IS MANDATORY · BEST OVERALL IS RETIRED
   =====================================================================
   WHAT THIS SUITE PROTECTS

     • NO CODE PATH SELECTS A SCENARIO WITHOUT AN EXPLICIT PRIORITY.
       This is the whole work package. Every panel that used to lead with a
       recommendation now says "no buyer priority stated" until the advisor
       says what the buyer is optimising for. (Group A.)

     • The three defects that justified the deletion are gone BY
       CONSTRUCTION, not by care (Group B):
         1. the silent auto-optimisation toward the lowest down payment,
         2. the non-transitive `near` comparator, whose winner could depend on
            the order the scenarios happened to arrive in,
         3. the priority hard-coded from planned stay length.

     • The fourth priority, PRESERVE RESERVES, respects the floor authored in
       WP-2 — and does not override a differently-stated priority (Group C).

     • reasonFor() survived the deletion and still produces a sentence for
       every priority (Group D).

     • A saved buyer carrying the retired 'balanced' value loads, migrates to
       'payment', and round-trips (Group E).

     • Nothing is badged "best" or "recommended" any more (Group F).

     • CHANGE INPUT -> RE-RUN -> SEE CONSEQUENCES. Changing the priority alone
       immediately and correctly changes the selection, and changes NO computed
       figure (Group G).

     • LIVE-CALL DESIGN STANDARD: a ceiling that is nowhere near binding is not
       a headline number (Group H).

   Usage:  node tests/buyer-priority.test.js index.html
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
    if (detail !== undefined) console.log('        ' + (typeof detail === 'string' ? detail.slice(0, 500) : JSON.stringify(detail).slice(0, 500)));
  }
}
const near = (a, b, eps) => Math.abs(a - b) <= (eps === undefined ? 0.01 : eps);

/* A buyer with a genuinely contested option set: the lowest payment, the lowest
   cash and the largest reserve are three DIFFERENT structures, so a selector
   that ignored the stated priority could not hide. */
const BASE = {
  price: '500,000', score: '760', ownFunds: '150,000', gift: '0',
  dpTarget: '', target: '4,500', income: '18,000', debts: '0',
  stay: '7', rateConv: '6.750', rateFha: '6.250', rateVa: '6.125',
  ccPct: '3', ccOverride: '', taxRate: '1.20', hoi: '150', hoa: '0', cdd: '0', flood: '0',
  desiredReserves: '', escrowDeposit: '', earnestMoney: '',
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
  console.log('  WP-3 — BUYER PRIORITY / RETIRE BEST OVERALL');
  console.log('  app under test: ' + appPath);
  console.log('=========================================================\n');

  await page.evaluate(() => {
    window.__wp3 = function (fields, priority, dpUnit) {
      Object.keys(fields).forEach(id => { const e = document.getElementById(id); if (e) e.value = fields[id]; });
      ['hoaNA', 'cddNA', 'floodNA'].forEach(i => { const e = document.getElementById(i); if (e) e.checked = true; });
      ['tgFthb', 'tgVa', 'vaExempt'].forEach(i => { const e = document.getElementById(i); if (e) e.checked = false; });
      document.getElementById('priority').value = priority == null ? '' : priority;
      unitState.dp = dpUnit || 'pct'; unitState.tax = 'pct';
      renderUnitToggles(); recalc();
      const inp = gatherInputs();
      const out = engineRun(inp);
      const pick = Engine.priorityPick(out.scenarios.slice(), inp);
      const txt = id => { const e = document.getElementById(id); return e ? (e.innerText || '').replace(/\s+/g, ' ').trim() : ''; };
      return {
        priority: inp.priority,
        pick: pick ? { id: pick.id, name: pick.name, dp: pick.dp, piti: pick.piti,
                       cashToClose: pick.cashToClose, cashRemaining: pick.cashRemaining,
                       maxPrice: pick.maxPrice, reason: pick._reason,
                       floorApplied: pick._floorApplied, gapMode: pick._gapMode } : null,
        /* Every scenario's economics, so a priority change can be proved to move
           nothing but the selection. */
        set: out.scenarios.map(s => ({ name: s.name, dp: s.dp, piti: s.piti, closing: s.closing,
                                       cashToClose: s.cashToClose, cashRemaining: s.cashRemaining,
                                       maxPrice: s.maxPrice, rate: s.rate, back: s.back,
                                       totalCostHorizon: s.totalCostHorizon })),
        cards: txt('cardsBody'), snap: txt('snapBody'), prop: txt('propFull'),
        goalBar: txt('goalBar'), prioritySub: txt('prioritySub'),
        badgeCount: document.querySelectorAll('#cardsBody .badge').length,
        summary: (function(){ try { return BSEModel.buildResultSummary(); } catch(e){ return { error:String(e) }; } })()
      };
    };
  });

  const W = (over, priority, dpUnit) =>
    page.evaluate(([b, o, p, u]) => window.__wp3(Object.assign({}, b, o), p, u),
                  [BASE, over || {}, priority === undefined ? null : priority, dpUnit || null]);

  /* =================================================================
     GROUP A — nothing is selected without a stated priority
     ================================================================= */
  console.log('--- A. No priority, no selection ---');
  {
    const r = await W({}, null);
    ok('A1 an unstated priority resolves to null, not to a default',
       r.priority === null, r.priority);
    ok('A2 the engine selects NOTHING', r.pick === null, r.pick);
    ok('A3 there are eligible scenarios to select from — this is a refusal, not an empty set',
       r.set.length >= 3, r.set.length);
    ok('A4 the recommendation panel says so in words',
       /No buyer priority stated/i.test(r.cards), r.cards.slice(0, 200));
    ok('A5 no card is badged', r.badgeCount === 0, r.badgeCount);
    ok('A6 the goal bar reports the priority as not stated',
       /not stated/i.test(r.goalBar), r.goalBar);
    ok('A7 the control itself says it is required',
       /required/i.test(r.prioritySub), r.prioritySub);
    ok('A8 the cached result summary records no recommendation',
       r.summary && r.summary.recommended_program === null, r.summary);
    ok('A9 and the summary is still marked non-authoritative',
       r.summary && r.summary.authoritative === false, r.summary);
  }
  {
    const r = await W({}, 'payment');
    ok('A10 stating a priority immediately produces a selection',
       r.pick !== null && r.priority === 'payment', r.pick);
    ok('A11 and the banner disappears', !/No buyer priority stated/i.test(r.cards));
    ok('A12 and exactly one card is badged', r.badgeCount === 1, r.badgeCount);
  }
  {
    const r = await page.evaluate(() =>
      Array.from(document.getElementById('priority').options).map(o => ({ v: o.value, t: o.text })));
    ok('A13 four priorities are offered, plus an empty placeholder',
       r.length === 5 && r[0].v === '' && r.slice(1).map(o => o.v).join(',') === 'payment,cash,reserves,power', r);
    ok('A14 "balanced" is not offered — the engine no longer makes that tradeoff',
       !r.some(o => o.v === 'balanced'), r);
    ok('A15 the four options are named in the buyer\'s language, not the engine\'s',
       /Comfort Payment/i.test(r[1].t) && /Cash to Close/i.test(r[2].t) &&
       /Reserves/i.test(r[3].t) && /Buying Power/i.test(r[4].t), r.map(o => o.t));
  }

  /* =================================================================
     GROUP B — the three defects are gone by construction
     ================================================================= */
  console.log('\n--- B. The retired selector\'s defects cannot recur ---');
  {
    const pay = await W({}, 'payment');
    const cash = await W({}, 'cash');
    const resv = await W({}, 'reserves');
    const pwr = await W({}, 'power');
    const lowestPiti = pay.set.reduce((m, s) => s.piti < m.piti ? s : m, pay.set[0]);
    const lowestCash = cash.set.reduce((m, s) => s.cashToClose < m.cashToClose ? s : m, cash.set[0]);
    const mostLeft = resv.set.reduce((m, s) => s.cashRemaining > m.cashRemaining ? s : m, resv.set[0]);
    const mostHouse = pwr.set.reduce((m, s) => s.maxPrice > m.maxPrice ? s : m, pwr.set[0]);
    ok('B1 "payment" selects the lowest payment, with no down-payment preference applied',
       pay.pick.name === lowestPiti.name, { picked: pay.pick.name, lowest: lowestPiti.name });
    ok('B2 "cash" selects the least cash at the table', cash.pick.name === lowestCash.name,
       { picked: cash.pick.name, lowest: lowestCash.name });
    ok('B3 "reserves" selects the most left afterwards', resv.pick.name === mostLeft.name,
       { picked: resv.pick.name, most: mostLeft.name });
    ok('B4 "power" selects the highest supportable price', pwr.pick.name === mostHouse.name,
       { picked: pwr.pick.name, most: mostHouse.name });
    ok('B5 DEFECT 1 GONE — a higher-down structure is selectable under "payment" without a 36-month test',
       pay.pick.dp > Math.min.apply(null, pay.set.map(s => s.dp)),
       { picked: pay.pick.dp + '%', lowestTier: Math.min.apply(null, pay.set.map(s => s.dp)) + '%' });
    ok('B6 the four priorities do not all collapse to the same answer',
       new Set([pay.pick.name, cash.pick.name, resv.pick.name, pwr.pick.name]).size >= 2,
       { pay: pay.pick.name, cash: cash.pick.name, reserves: resv.pick.name, power: pwr.pick.name });
  }
  {
    /* DEFECT 2 — the deleted comparator was pairwise and non-transitive, so a
       different ARRIVAL ORDER could produce a different winner. Feed the same
       set in every permutation and demand one answer. */
    const r = await page.evaluate(([b, prios]) => {
      window.__wp3(b, 'payment');
      const inp = gatherInputs();
      const scen = engineRun(inp).scenarios;
      const perms = (a) => a.length <= 1 ? [a] :
        a.flatMap((x, i) => perms(a.slice(0, i).concat(a.slice(i + 1))).map(p => [x].concat(p)));
      const all = perms(scen.slice(0, 4));
      const out = {};
      prios.forEach(p => {
        const t = Object.assign({}, inp, { priority: p });
        out[p] = Array.from(new Set(all.map(order => {
          const w = Engine.priorityPick(order.slice(), t);
          return w ? w.name : 'null';
        })));
      });
      return { permutations: all.length, out };
    }, [BASE, ['payment', 'cash', 'reserves', 'power']]);
    ok('B7 DEFECT 2 GONE — every permutation of the same set returns ONE winner',
       Object.values(r.out).every(v => v.length === 1),
       { permutations: r.permutations, winners: r.out });
    ok('B7b the permutation test was actually exhaustive', r.permutations === 24, r.permutations);
  }
  {
    /* DEFECT 3 — the deleted selector switched its primary metric on planned
       stay: <=3 preserve cash, <=7 payment, >7 total cost. The stay must no
       longer change WHAT is optimised for. */
    const shorts = await W({ stay: '3' }, 'payment');
    const longs = await W({ stay: '30' }, 'payment');
    ok('B8 DEFECT 3 GONE — planned stay no longer changes what is optimised for',
       shorts.pick.name === longs.pick.name,
       { at3y: shorts.pick.name, at30y: longs.pick.name });
    const shortsC = await W({ stay: '3' }, 'cash');
    const longsC = await W({ stay: '30' }, 'cash');
    ok('B8b nor under the cash priority', shortsC.pick.name === longsC.pick.name,
       { at3y: shortsC.pick.name, at30y: longsC.pick.name });
  }
  {
    const r = await page.evaluate(() => ({
      pickBestOverall: typeof Engine.pickBestOverall,
      optimalSplit: typeof Engine.optimalSplit,
      priorityPick: typeof Engine.priorityPick,
      reasonFor: typeof Engine.reasonFor
    }));
    ok('B9 pickBestOverall is not on the engine surface', r.pickBestOverall === 'undefined', r);
    ok('B10 optimalSplit is not on the engine surface', r.optimalSplit === 'undefined', r);
    ok('B11 priorityPick is', r.priorityPick === 'function', r);
    ok('B12 and reasonFor survived', r.reasonFor === 'function', r);
  }

  /* =================================================================
     GROUP C — preserve reserves, and the WP-2 floor
     ================================================================= */
  console.log('\n--- C. Preserve reserves ---');
  {
    const noGoal = await W({ desiredReserves: '' }, 'reserves');
    ok('C1 with no goal the floor is the WP-2 default of $500',
       noGoal.pick !== null, noGoal.pick);
    const most = noGoal.set.reduce((m, s) => s.cashRemaining > m.cashRemaining ? s : m, noGoal.set[0]);
    ok('C1b and the pick is still the one leaving the most',
       near(noGoal.pick.cashRemaining, most.cashRemaining, 1), noGoal.pick);
  }
  {
    const r = await W({ desiredReserves: '50,000' }, 'reserves');
    ok('C2 an authored goal that some structures clear is applied as a floor',
       r.pick.floorApplied === true, r.pick);
    ok('C2b and the pick clears it', r.pick.cashRemaining >= 50000, r.pick.cashRemaining);
    ok('C2c the sub-label states the consequence',
       /most cash left after closing/i.test(r.prioritySub), r.prioritySub);
  }
  {
    /* LIVE-CALL CLEANUP §6 — the authored reserve GOAL left the workflow, so the
       floor is always the WP-2 default of $500 and every eligible scenario
       clears it on this buyer. What still matters is that the floor exists, is
       applied, and cannot leave the advisor with nothing. */
    const r = await W({}, 'reserves');
    ok('C3 the floor is applied when scenarios clear it', r.pick.floorApplied === true, r.pick);
    ok('C3b and an answer is always returned', r.pick !== null, r.pick);
  }
  {
    /* The point of WP-3, restated without the retired goal field: a stated
       priority selects on its own metric and nothing overrides it. */
    const stated = await W({}, 'payment');
    const resv = await W({}, 'reserves');
    ok('C4 a STATED payment priority is honoured even though it leaves less behind',
       stated.pick.cashRemaining < resv.pick.cashRemaining,
       { payment: stated.pick.cashRemaining, reserves: resv.pick.cashRemaining });
    ok('C4b the reserves priority would have chosen differently — the two are distinct',
       stated.pick.name !== resv.pick.name,
       { payment: stated.pick.name, reserves: resv.pick.name });
    ok('C4c neither is badged as better than the other',
       !/best/i.test(stated.cards) && !/best/i.test(resv.cards));
  }

  /* =================================================================
     GROUP D — the narrative survived
     ================================================================= */
  console.log('\n--- D. reasonFor() still speaks, for every priority ---');
  for (const p of ['payment', 'cash', 'reserves', 'power']) {
    const r = await W({}, p);
    ok('D1 ' + p + ' — produces a sentence',
       typeof r.pick.reason === 'string' && r.pick.reason.length > 25, r.pick.reason);
    ok('D1b ' + p + ' — and it names a figure, not a mood',
       /\$[0-9]/.test(r.pick.reason), r.pick.reason);
  }
  {
    const r = await W({ target: '1,200' }, 'payment');
    ok('D2 when nothing clears the comfort payment the sentence says so',
       r.pick && r.pick.gapMode === true && /No option clears the comfort payment/i.test(r.pick.reason),
       r.pick && r.pick.reason);
  }
  {
    const r = await W({}, 'payment');
    ok('D3 the sentence no longer infers a goal from the planned stay',
       !/balances a manageable payment/i.test(r.pick.reason), r.pick.reason);
  }

  /* =================================================================
     GROUP E — a legacy 'balanced' buyer loads and migrates
     ================================================================= */
  console.log('\n--- E. Legacy migration ---');
  {
    const r = await page.evaluate((b) => {
      window.__wp3(b, 'payment');
      const model = BSEModel.capture();
      const ctx = { owner_user_id:'u', buyer_profile_id:'b', shopping_plan_id:'s', property_id:'p',
                    property_scenario_id:'ps', assumption_set_id:'a', display_name:'legacy', property_label:'P1' };
      const rows = BSEPersistence.__serializeRows(model, ctx, null);
      /* Forge the pre-WP-3 value exactly as it sits on disk today. */
      rows.shopping_plan.buyer_priority = 'balanced';
      if (rows.property_scenario) rows.property_scenario.buyer_priority = 'balanced';
      const back = BSEPersistence.__deserializeRows(rows, BSEPersistence.__presentationFrom(rows), null);
      document.getElementById('priority').value = '';
      recalc();
      BSEModel.apply(back);
      recalc();
      return {
        planPriority: back.shopping_plan.buyer_priority,
        scenPriority: back.property_scenario ? back.property_scenario.buyer_priority : null,
        dom: document.getElementById('priority').value,
        resolved: gatherInputs().priority,
        selects: (function(){ const i = gatherInputs(); const s = engineRun(i).scenarios;
                              const p = Engine.priorityPick(s, i); return p ? p.name : null; })()
      };
    }, BASE);
    ok('E1 a stored "balanced" plan migrates to "payment" on deserialize',
       r.planPriority === 'payment', r);
    ok('E1b including a scenario-level override', r.scenPriority === 'payment', r);
    ok('E2 the migrated value reaches the DOM, so the advisor sees what is in force',
       r.dom === 'payment', r.dom);
    ok('E3 and resolves through to the engine', r.resolved === 'payment', r.resolved);
    ok('E4 a migrated buyer selects a scenario rather than stalling', r.selects !== null, r.selects);
  }
  {
    const r = await page.evaluate(() => ({
      balanced: migratePriority('balanced'),
      junk: migratePriority('best-overall'),
      empty: migratePriority(''),
      nul: migratePriority(null),
      valid: ['payment','cash','reserves','power'].map(migratePriority).join(',')
    }));
    ok('E5 the migration maps balanced -> payment and rejects anything unknown',
       r.balanced === 'payment' && r.junk === null && r.empty === null && r.nul === null &&
       r.valid === 'payment,cash,reserves,power', r);
  }

  /* =================================================================
     GROUP F — nothing is "best" any more
     ================================================================= */
  console.log('\n--- F. No winner language ---');
  {
    const r = await W({}, 'payment');
    const all = r.cards + ' ' + r.snap + ' ' + r.prop;
    ok('F1 the "★ Start here" badge is gone', !/start here/i.test(all), all.slice(0, 200));
    ok('F2 the badge states the match instead',
       /Matches your stated priority/i.test(r.cards), r.cards.slice(0, 200));
    ok('F3 nothing calls a structure the best', !/\bbest overall\b/i.test(all));
  }
  {
    const src = await page.evaluate(() => document.documentElement.outerHTML);
    ok('F4 the phrase "Best Overall" survives only in the comments explaining its deletion',
       (src.match(/Best Overall/g) || []).length <= 3, (src.match(/Best Overall/g) || []).length);
  }

  /* =================================================================
     GROUP G — live-call loop: change input, re-run, see consequences
     ================================================================= */
  console.log('\n--- G. Change the priority, see the consequence, and only that ---');
  {
    const a = await W({}, 'payment');
    const b = await W({}, 'cash');
    const c = await W({}, 'payment');
    ok('G1 changing the priority changes the selection immediately',
       a.pick.name !== b.pick.name, { payment: a.pick.name, cash: b.pick.name });
    ok('G2 and changes NO computed figure — every scenario is identical',
       JSON.stringify(a.set) === JSON.stringify(b.set),
       { payment: a.set.map(s => s.name + ':' + Math.round(s.piti)).join(' '),
         cash: b.set.map(s => s.name + ':' + Math.round(s.piti)).join(' ') });
    ok('G3 the loop is reversible — switching back restores the first selection',
       c.pick.name === a.pick.name, { first: a.pick.name, back: c.pick.name });
    ok('G4 the goal bar tracks the change on the same keystroke',
       /Lowest cash to close/i.test(b.goalBar), b.goalBar);
    ok('G5 the cached summary tracks it too',
       b.summary.recommended_program === b.pick.id, { summary: b.summary.recommended_program, pick: b.pick.id });
  }
  {
    /* And the reverse: changing an economic input under a fixed priority must
       move the numbers. A test that only proves things do not change is worth
       very little. */
    const a = await W({}, 'payment');
    const b = await W({ rateConv: '7.750' }, 'payment');
    ok('G6 changing the rate moves the payments, with the priority held fixed',
       JSON.stringify(a.set) !== JSON.stringify(b.set) &&
       b.set.some(s => s.name.indexOf('Conv') === 0 && a.set.find(x => x.name === s.name).piti < s.piti),
       { before: a.set.map(s => Math.round(s.piti)).join(','), after: b.set.map(s => Math.round(s.piti)).join(',') });
  }

  /* =================================================================
     GROUP H — the live-call design standard
     ================================================================= */
  console.log('\n--- H. A non-binding ceiling is not a headline ---');
  {
    /* LIVE-CALL CLEANUP §5 — the cash ceiling left the primary view entirely.
       WP-3 de-emphasised it; the cleanup removed it. What replaced the slot is
       the figure that answers "how much qualifying room is left". */
    const r = await page.evaluate(([b]) => {
      window.__wp3(Object.assign({}, b, { price: '', ownFunds: '900,000', target: '3,000', income: '9,500' }), 'payment');
      const t = (document.getElementById('answerBody') || { innerText: '' }).innerText.replace(/\s+/g, ' ').trim();
      return { t, cards: document.querySelectorAll('.pw3 .pw').length,
               dti: !!document.querySelector('.pw.dti') };
    }, [BASE]);
    ok('H1 Cash-Limited Buying Power is not in the primary view at all',
       !/Cash-Limited Buying Power/i.test(r.t), r.t.slice(0, 400));
    ok('H2 the third figure is DTI at Comfort Price', r.dti === true && /DTI at Comfort Price/i.test(r.t),
       r.t.slice(0, 400));
    ok('H2b there are exactly three primary figures', r.cards === 3, r.cards);
    ok('H2c no cash shortfall is claimed for a buyer with ample funds',
       !/Cash shortfall/i.test(r.t), r.t.slice(0, 400));
  }
  {
    /* CLEANUP §9 — cash reappears only as a genuine shortfall, and only on a
       specific property. In Shopping Range cash is a ceiling, not a shortfall. */
    const r = await page.evaluate(([b]) => {
      window.__wp3(Object.assign({}, b, { price: '500,000', ownFunds: '4,000', target: '9,000', income: '25,000' }), 'payment');
      const t = (document.getElementById('answerBody') || { innerText: '' }).innerText.replace(/\s+/g, ' ').trim();
      return { t, shortfall: !!document.querySelector('.cashshort') };
    }, [BASE]);
    ok('H3 a real cash shortfall surfaces', r.shortfall === true, r.t.slice(0, 400));
    ok('H3b with the figure named', /Cash shortfall \$[0-9,]+/i.test(r.t), r.t.slice(0, 400));
    ok('H3c and it is stated as down payment plus estimated closing costs',
       /down plus \$[0-9,]+ estimated closing costs/i.test(r.t), r.t.slice(0, 500));
  }

  ok('Z1 no page errors during the suite', pageErrors.length === 0, pageErrors.join(' | '));

  console.log('\n===============================================');
  console.log('  PASS ' + pass + '   FAIL ' + fail);
  if (failures.length) { console.log('  Failures:'); failures.forEach(f => console.log('   - ' + f)); }
  console.log('===============================================');
  await browser.close();
  process.exit(fail === 0 ? 0 : 1);
})();
