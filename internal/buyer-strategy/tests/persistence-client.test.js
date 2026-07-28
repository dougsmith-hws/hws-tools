/* =====================================================================
   PERSISTENCE — CLIENT ORCHESTRATION
   Phase 3 Gate C.

   Everything in BSEPersistence EXCEPT the Supabase network transport is
   deterministic and can be proven without a network. This suite injects a
   mock transport through BSEPersistence.__setTransport and asserts the
   behaviour that the schema test cannot reach:

     P1  no transport / not signed in  -> the tool still calculates, no save
     P2  a manual save writes exactly one coherent row set
     P3  autosave is debounced and NEVER fires from recalc()
     P4  concurrent saves are single-flight with a queued LATEST state;
         an older snapshot can never land on top of a newer one
     P5  a failed save leaves in-memory state untouched and says so
     P6  load recomputes; a false stored result_summary is inert
     P7  the save-status chip reports each state truthfully
     P8  presentationFrom() rebuilds display from AUTHORED values only (M-1)
     P9  signing out clears the binding; it does not clear the buyer's work

   Usage: node tests/persistence-client.test.js <app.html>
   ===================================================================== */
const { chromium } = require('playwright');
const path = require('path');
const harness = require('./lib/app-harness');

const APP = path.resolve(process.argv[2]);
let pass = 0, fail = 0;
const check = (name, ok, detail) => {
  if (ok) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? '\n        ' + detail : '')); }
};

/* The mock transport is installed inside the page. It records every call,
   can be told to fail, and can be told to stall so concurrency is observable. */
const MOCK = `
window.__mock = {
  calls: [], saves: [], failNext: false, stallMs: 0, store: null,
  session: { user: { id: '11111111-1111-4111-8111-111111111111' } }
};
window.__transport = {
  kind: 'mock',
  assumptionSetId: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
  async getSession(){ return window.__mock.session; },
  async signIn(email){ window.__mock.calls.push(['signIn', email]); return true; },
  async signOut(){ window.__mock.calls.push(['signOut']); window.__mock.session = null; },
  onAuthChange(fn){ window.__mock.authCb = fn; },
  async currentAssumptionSetId(){
    window.__mock.calls.push(['currentAssumptionSetId']);
    // the live schema grants this table to \`authenticated\` only
    if(!window.__mock.session) throw new Error('permission denied for table program_assumption_set');
    return { id: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa', version_label: '2026.07-baseline' };
  },
  async save(rows){
    window.__mock.calls.push(['save']);
    if(window.__mock.stallMs){ await new Promise(r => setTimeout(r, window.__mock.stallMs)); }
    if(window.__mock.failNext){ window.__mock.failNext = false; throw new Error('network unreachable'); }
    window.__mock.saves.push(JSON.parse(JSON.stringify(rows)));
    window.__mock.store = JSON.parse(JSON.stringify(rows));
    return true;
  },
  async load(id){
    window.__mock.calls.push(['load', id]);
    if(window.__mock.failNext){ window.__mock.failNext = false; throw new Error('network unreachable'); }
    var s = window.__mock.store;
    if(!s) return null;
    return { buyer_profile: s.buyer_profile, shopping_plan: s.shopping_plan,
             property: s.property, property_scenario: s.property_scenario,
             negotiation_rounds: s.negotiation_rounds,
             assumption_set_version: '2026.07-baseline' };
  },
  async listBuyers(){ return []; }
};
window.__install = function(signedIn){
  BSEPersistence.__setTransport(window.__transport, signedIn === false ? null : window.__mock.session);
};
// install with NO pre-seeded assumption set, so the lazy lookup is observable
window.__installBare = function(signedIn){
  const bare = Object.assign({}, window.__transport);
  delete bare.assumptionSetId;
  BSEPersistence.__setTransport(bare, signedIn === false ? null : window.__mock.session);
};
`;

const SIGNED_IN_ID = '11111111-1111-4111-8111-111111111111';

(async () => {
  const spec = harness.loadSpec();
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(String(e)));

  const fresh = async (scenario) => {
    await page.goto('file://' + APP);
    await page.addScriptTag({ content: harness.HELPERS });
    await page.addScriptTag({ content: MOCK });
    // boot() is asynchronous. Every test below asserts about a settled page,
    // so wait for boot to reach a terminal state instead of racing it.
    await page.waitForFunction(() => window.BSEPersistence && BSEPersistence.status().booted,
                               null, { timeout: 15000 });
    await page.evaluate(([sc, d]) => window.__apply(sc, d), [scenario || {}, spec.defaults]);
  };

  // ---------------- P1: no transport, and signed out ----------------
  await fresh();
  const p1 = await page.evaluate(async () => {
    // boot() ran at load with no network: the library import failed.
    const before = BSEPersistence.status();
    const attempted = await BSEPersistence.saveNow();
    const stillWorks = typeof recalc === 'function' && (recalc(), true);
    const summary = BSEModel.buildResultSummary();
    return { before: before, attempted: attempted, stillWorks: stillWorks,
             hasResult: !!(summary && summary.recommended_program) };
  });
  check('P1 with no reachable library the tool boots in no-save mode (M-10)',
    p1.before.state === 'no-save' && p1.before.transport === null, JSON.stringify(p1.before));
  check('P1 a save attempt with no transport is refused, not thrown',
    p1.attempted.ok === false && /no transport/.test(p1.attempted.reason), JSON.stringify(p1.attempted));
  check('P1 the calculation engine still produces a recommendation with no account',
    p1.stillWorks && p1.hasResult);

  const p1b = await page.evaluate(async () => {
    window.__install(false);                       // transport present, nobody signed in
    const s = BSEPersistence.status();
    const r = await BSEPersistence.saveNow();
    return { state: s.state, authenticated: s.authenticated, r: r,
             saves: window.__mock.saves.length };
  });
  check('P1 signed out: state is signed-out and no write is attempted',
    p1b.state === 'signed-out' && p1b.authenticated === false &&
    p1b.r.ok === false && /not authenticated/.test(p1b.r.reason) && p1b.saves === 0,
    JSON.stringify(p1b));

  /* ---------------- P10: the pre-authentication path ----------------
     The first live sign-in attempt failed with
       "Save failed — Cannot read properties of null (reading 'signIn')"
     Three separate defects in one chain:
       1. boot() read program_assumption_set, which is granted to
          `authenticated` only. Before sign-in the browser is `anon`, so it
          came back "permission denied" — you could not sign in because
          signing in required being signed in.
       2. That failure took boot's catch, which nulled out a transport that
          worked perfectly.
       3. The sign-in handler then dereferenced the null transport and put a
          raw TypeError in front of the user, labelled "Save failed" when
          nothing was being saved.
     P10 pins all three. */
  await fresh();
  const p10 = await page.evaluate(async () => {
    // boot() ran offline, so db is null — exactly the state the live bug hit.
    const before = BSEPersistence.status();
    document.getElementById('bseEmail').value = 'doug@example.test';
    document.getElementById('bseSignIn').click();
    await new Promise(r => setTimeout(r, 60));
    const chip = document.getElementById('bseSaveStatus');
    return { transport: before.transport, chipText: chip.textContent,
             chipTitle: chip.title, status: BSEPersistence.status() };
  });
  check('P10 clicking sign-in with no transport does not throw and does not crash the page',
    pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));
  check('P10 the chip never shows a raw internal error to the user',
    !/Cannot read propert|undefined|TypeError|null/i.test(p10.chipText), p10.chipText);
  check('P10 the chip does not claim a SAVE failed when the user was signing in',
    !/Save failed/.test(p10.chipText), p10.chipText);
  check('P10 it says the tool is simply not connected, and reassures the user',
    p10.chipText === 'Not connected' && /nothing has been lost/.test(p10.chipTitle),
    JSON.stringify(p10));

  const p10b = await page.evaluate(async () => {
    // a transport whose sign-in genuinely fails must be reported as sign-in,
    // not as a save, and must not disturb the buyer's work
    window.__install(false);
    window.__transport.signIn = async () => { throw new Error('rate limit exceeded'); };
    document.getElementById('bseEmail').value = 'doug@example.test';
    document.getElementById('bseSignIn').click();
    await new Promise(r => setTimeout(r, 60));
    const chip = document.getElementById('bseSaveStatus');
    return { text: chip.textContent, cls: chip.className,
             hasResult: !!BSEModel.buildResultSummary().recommended_program };
  });
  check('P10 a real sign-in failure is reported as a SIGN-IN failure and names the reason',
    /^Sign-in failed — /.test(p10b.text) && /rate limit exceeded/.test(p10b.text), p10b.text);
  check('P10 a sign-in failure still renders as an error and leaves the tool working',
    /failed/.test(p10b.cls) && p10b.hasResult, JSON.stringify(p10b));

  await fresh();
  const p10c = await page.evaluate(async () => {
    window.__mock.session = { user: { id: '11111111-1111-4111-8111-111111111111' } };
    window.__mock.calls.length = 0;
    // signed OUT, transport present — the exact live pre-sign-in state
    window.__installBare(false);
    const beforeSignIn = window.__mock.calls.map(c => c[0]);
    // now a session arrives and the user saves
    window.__installBare(true);
    const afterSignIn = window.__mock.calls.map(c => c[0]);
    const r = await BSEPersistence.saveNow();
    const afterSave = window.__mock.calls.map(c => c[0]);
    const rows = window.__mock.saves[window.__mock.saves.length - 1];
    return { beforeSignIn, afterSignIn, afterSave, ok: r.ok,
             asId: rows ? rows.property_scenario.assumption_set_id : null };
  });
  check('P10 the assumption set is NEVER read before a session exists — the root cause',
    !p10c.beforeSignIn.includes('currentAssumptionSetId') &&
    !p10c.afterSignIn.includes('currentAssumptionSetId'),
    JSON.stringify({ before: p10c.beforeSignIn, after: p10c.afterSignIn }));
  check('P10 it IS read lazily on the first save, once a session exists',
    p10c.afterSave.includes('currentAssumptionSetId'), JSON.stringify(p10c.afterSave));
  check('P10 the lazily-resolved assumption set reaches the row, so the NOT NULL column is satisfied',
    p10c.ok === true && p10c.asId === 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa', JSON.stringify(p10c));

  // ---------------- P2: a manual save writes one coherent row set ----------------
  await fresh({ fields: { price: '450000', income: '9500', debts: '650', ownFunds: '40000',
                          score: '740', offerPrice: '440000' } });
  const p2 = await page.evaluate(async () => {
    window.__install(true);
    const r = await BSEPersistence.saveNow();
    const rows = window.__mock.saves[0];
    return { r: r, count: window.__mock.saves.length, rows: rows,
             status: BSEPersistence.status() };
  });
  check('P2 a manual save succeeds and writes exactly one row set', p2.r.ok === true && p2.count === 1,
    JSON.stringify({ ok: p2.r, n: p2.count }));
  check('P2 every row carries the signed-in user as owner — never a client-chosen owner',
    p2.rows.buyer_profile.owner_user_id === SIGNED_IN_ID &&
    p2.rows.shopping_plan.owner_user_id === SIGNED_IN_ID &&
    p2.rows.property.owner_user_id === SIGNED_IN_ID &&
    p2.rows.property_scenario.owner_user_id === SIGNED_IN_ID &&
    p2.rows.negotiation_rounds.every(r => r.owner_user_id === SIGNED_IN_ID));
  check('P2 the child rows point at the parents that were written in the same set',
    p2.rows.shopping_plan.buyer_profile_id === p2.rows.buyer_profile.id &&
    p2.rows.property.buyer_profile_id === p2.rows.buyer_profile.id &&
    p2.rows.property_scenario.property_id === p2.rows.property.id &&
    p2.rows.property_scenario.shopping_plan_id === p2.rows.shopping_plan.id &&
    p2.rows.negotiation_rounds.every(r => r.property_scenario_id === p2.rows.property_scenario.id));
  check('P2 the stored result_summary is marked cache-only and stamped',
    p2.rows.property_scenario.result_summary &&
    p2.rows.property_scenario.result_summary.cache_only === true &&
    p2.rows.property_scenario.result_summary.authoritative === false &&
    !!p2.rows.property_scenario.results_computed_at,
    JSON.stringify(p2.rows.property_scenario.result_summary).slice(0, 200));
  check('P2 no resolved default leaks into an authored column (resolved_inputs stays null)',
    p2.rows.property_scenario.resolved_inputs === null);
  check('P2 a second save reuses the same record ids rather than creating a new buyer',
    (await page.evaluate(async () => {
      await BSEPersistence.saveNow();
      const a = window.__mock.saves[0], b = window.__mock.saves[1];
      return a.buyer_profile.id === b.buyer_profile.id &&
             a.property_scenario.id === b.property_scenario.id;
    })) === true);

  // ---------------- P3: autosave is debounced and off the recalc path ----------------
  await fresh({ fields: { price: '450000' } });
  const p3 = await page.evaluate(async () => {
    window.__install(true);
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const n0 = window.__mock.saves.length;
    // 8 rapid edits, well inside one debounce window
    for (let i = 0; i < 8; i++) {
      const el = document.getElementById('price');
      el.value = String(450000 + i * 1000);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      await sleep(30);
    }
    const duringBurst = window.__mock.saves.length - n0;
    // recalc() on its own must never schedule or perform a save
    const beforeRecalc = window.__mock.saves.length;
    for (let i = 0; i < 5; i++) recalc();
    await sleep(BSEPersistence.AUTOSAVE_DEBOUNCE_MS + 400);
    const afterSettle = window.__mock.saves.length;
    return { duringBurst: duringBurst, fromBurst: afterSettle - beforeRecalc,
             total: afterSettle - n0, lastPrice: window.__mock.saves.length
               ? window.__mock.saves[window.__mock.saves.length - 1].property_scenario.list_price : null };
  });
  check('P3 eight rapid edits inside one debounce window produce no writes yet',
    p3.duringBurst === 0, 'writes during burst: ' + p3.duringBurst);
  check('P3 the burst collapses into exactly one write after the debounce settles',
    p3.total === 1, 'total writes: ' + p3.total);
  check('P3 the single write carries the LAST value typed, not the first',
    Number(p3.lastPrice) === 457000, String(p3.lastPrice));

  const p3b = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const n0 = window.__mock.saves.length;
    for (let i = 0; i < 5; i++) recalc();       // recalc alone, no input event
    await sleep(BSEPersistence.AUTOSAVE_DEBOUNCE_MS + 400);
    return window.__mock.saves.length - n0;
  });
  check('P3 recalc() by itself never persists — persistence is off the calculation path (M-8)',
    p3b === 0, 'writes caused by recalc(): ' + p3b);

  // ---------------- P4: single-flight with queued latest ----------------
  await fresh({ fields: { price: '400000' } });
  const p4 = await page.evaluate(async () => {
    window.__install(true);
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    window.__mock.stallMs = 500;                       // hold the first write open
    const first = BSEPersistence.saveNow();            // in flight
    await sleep(50);
    document.getElementById('price').value = '600000'; // newer state arrives mid-flight
    recalc();
    const queued = await BSEPersistence.saveNow();     // must queue, not race
    const firstRes = await first;
    await sleep(900);
    window.__mock.stallMs = 0;
    const saves = window.__mock.saves;
    return { queuedFlag: queued.queued === true, n: saves.length,
             prices: saves.map(s => Number(s.property_scenario.list_price)),
             status: BSEPersistence.status() };
  });
  check('P4 a save requested while one is in flight is queued, not run concurrently',
    p4.queuedFlag === true, JSON.stringify(p4));
  check('P4 the queued save runs after the in-flight one and writes the NEWER state last',
    p4.n === 2 && p4.prices[0] === 400000 && p4.prices[1] === 600000,
    JSON.stringify(p4.prices));
  check('P4 the client revision counter records the newer snapshot as the winner',
    p4.status.savedRevision === p4.status.revision && p4.status.revision >= 2,
    JSON.stringify(p4.status));

  // ---------------- P5: a failed save is safe ----------------
  await fresh({ fields: { price: '525000', income: '11000' } });
  const p5 = await page.evaluate(async () => {
    window.__install(true);
    const beforeModel = JSON.parse(JSON.stringify(BSEModel.capture()));
    const beforeSummary = BSEModel.buildResultSummary();
    window.__mock.failNext = true;
    const r = await BSEPersistence.saveNow();
    const afterModel = JSON.parse(JSON.stringify(BSEModel.capture()));
    const afterSummary = BSEModel.buildResultSummary();
    const chip = document.getElementById('bseSaveStatus');
    return { r: r, identical: JSON.stringify(beforeModel) === JSON.stringify(afterModel),
             sameResult: beforeSummary.recommended_program === afterSummary.recommended_program &&
                         String(beforeSummary.piti) === String(afterSummary.piti),
             status: BSEPersistence.status(),
             chipText: chip ? chip.textContent : null,
             chipClass: chip ? chip.className : null,
             priceStillOnScreen: document.getElementById('price').value };
  });
  check('P5 a network failure is returned as a result, not thrown at the user',
    p5.r.ok === false && /network unreachable/.test(p5.r.error), JSON.stringify(p5.r));
  check('P5 the buyer\'s in-memory canonical state is untouched by a failed save', p5.identical);
  check('P5 the displayed recommendation is unchanged by a failed save', p5.sameResult);
  check('P5 the buyer\'s typed input is still on screen after a failed save',
    p5.priceStillOnScreen === '525000', p5.priceStillOnScreen);
  check('P5 the status chip says the save failed and names the reason',
    p5.status.state === 'failed' && /Save failed/.test(p5.chipText) &&
    /network unreachable/.test(p5.chipText) && /failed/.test(p5.chipClass),
    JSON.stringify({ t: p5.chipText, c: p5.chipClass }));
  const p5b = await page.evaluate(async () => {
    const r = await BSEPersistence.saveNow();          // retry, no failure injected
    return { ok: r.ok, state: BSEPersistence.status().state,
             chip: document.getElementById('bseSaveStatus').textContent };
  });
  check('P5 a retry after the failure succeeds and the chip recovers',
    p5b.ok === true && p5b.state === 'saved' && p5b.chip === 'Saved', JSON.stringify(p5b));

  // ---------------- P6: load recomputes; a false cache is inert ----------------
  await fresh({ fields: { price: '400000', income: '9500', debts: '650', ownFunds: '40000',
                          score: '780', ownFundsSplit: '' } });
  const p6 = await page.evaluate(async () => {
    window.__install(true);
    await BSEPersistence.saveNow();
    const truth = BSEModel.buildResultSummary();
    const buyerId = window.__mock.store.buyer_profile.id;
    // poison the stored cache with a different, wrong recommendation
    window.__mock.store.property_scenario.result_summary = {
      cache_only: true, authoritative: false, recommended_program: 'va',
      recommended_scenario_dp: 0, piti: 1, cash_to_close: 1, max_price: 1,
      binding_constraint: 'Nonsense', assumption_set_version: 'bogus', engine_version: 'bogus'
    };
    // wipe the live session so the load has to reconstruct everything
    document.getElementById('price').value = '';
    document.getElementById('income').value = '';
    recalc();
    const res = await BSEPersistence.load(buyerId);
    const after = BSEModel.buildResultSummary();
    return { res: res, truth: truth, after: after,
             priceRestored: document.getElementById('price').value };
  });
  check('P6 load restores the authored price into the interface',
    p6.priceRestored === '400000', p6.priceRestored);
  check('P6 load reports the recomputed summary as the authoritative source',
    p6.res.ok === true && p6.res.authoritative_source === 'recomputed', JSON.stringify(p6.res).slice(0, 200));
  check('P6 the recomputed result matches what the engine produced before the save',
    p6.after.recommended_program === p6.truth.recommended_program &&
    String(p6.after.piti) === String(p6.truth.piti),
    JSON.stringify({ truth: p6.truth.recommended_program + '/' + p6.truth.piti,
                     after: p6.after.recommended_program + '/' + p6.after.piti }));
  check('P6 the poisoned cache did NOT become the answer',
    p6.after.recommended_program !== 'va' && Number(p6.after.piti) !== 1,
    JSON.stringify(p6.after).slice(0, 160));
  check('P6 load reports that the discarded cache disagreed with the recompute',
    p6.res.cache_agreed_with_recompute === false &&
    p6.res.cache_discarded && p6.res.cache_discarded.recommended_program === 'va');

  // ---------------- P7: status chip truthfulness ----------------
  await fresh();
  const p7 = await page.evaluate(async () => {
    const chip = () => document.getElementById('bseSaveStatus').textContent;
    const seen = {};
    seen.noSave = chip();
    window.__install(false); seen.signedOut = chip();
    window.__install(true);  seen.idle = chip();
    window.__mock.stallMs = 250;
    const p = BSEPersistence.saveNow();
    await new Promise(r => setTimeout(r, 60));
    seen.saving = chip();
    await p; window.__mock.stallMs = 0;
    seen.saved = chip();
    return seen;
  });
  check('P7 the chip reads "Not connected" before any transport exists', p7.noSave === 'Not connected', p7.noSave);
  check('P7 the chip reads "Sign in to save" when signed out', p7.signedOut === 'Sign in to save', p7.signedOut);
  check('P7 the chip reads "Saving…" while a write is genuinely in flight', p7.saving === 'Saving…', p7.saving);
  check('P7 the chip reads "Saved" only after the write actually returned', p7.saved === 'Saved', p7.saved);

  // ---------------- P8: presentation rebuilt from authored values (M-1) ----------------
  await fresh({ fields: { price: '437000', dpTarget: '3.375', taxRate: '1.205', offerConc: '2.75' },
                units: { dp: 'pct', tax: 'pct', offerConc: 'pct', counterConc: 'dollar' } });
  const p8 = await page.evaluate(async () => {
    window.__install(true);
    await BSEPersistence.saveNow();
    const rows = window.__mock.store;
    const pres = BSEPersistence.__presentationFrom(rows);
    return { dp: pres.canonical.dp, tax: pres.canonical.tax, conc: pres.canonical.offerConc,
             units: pres.units, dpField: pres.fields.dpTarget.value };
  });
  check('P8 the rebuilt presentation carries the canonical percent value, not a dollar rendering',
    p8.dp.value === '3.375' && p8.dp.unit === 'pct', JSON.stringify(p8.dp));
  check('P8 the tax pair is rebuilt as (1.205, pct) — the two tax columns are never conflated',
    p8.tax.value === '1.205' && p8.tax.unit === 'pct', JSON.stringify(p8.tax));
  check('P8 the concession pair is rebuilt as (2.75, pct)',
    p8.conc.value === '2.75' && p8.conc.unit === 'pct', JSON.stringify(p8.conc));
  check('P8 the unit map agrees with the canonical pairs — no split possible',
    p8.units.dp === p8.dp.unit && p8.units.tax === p8.tax.unit &&
    p8.units.offerConc === p8.conc.unit, JSON.stringify(p8.units));
  check('P8 the display field equals the authored value, so restore cannot double-convert (M-1)',
    p8.dpField === '3.375', p8.dpField);

  // ---------------- P9: signing out ----------------
  const p9 = await page.evaluate(async () => {
    const priceBefore = document.getElementById('price').value;
    await window.__transport.signOut();
    BSEPersistence.__setTransport(window.__transport, null);
    const r = await BSEPersistence.saveNow();
    return { ctx: BSEPersistence.__context(), r: r,
             price: document.getElementById('price').value, priceBefore: priceBefore,
             hasResult: !!BSEModel.buildResultSummary().recommended_program,
             chip: document.getElementById('bseSaveStatus').textContent };
  });
  check('P9 signing out clears the record binding so the next user starts clean',
    p9.ctx === null, JSON.stringify(p9.ctx));
  check('P9 signing out does NOT clear the buyer\'s work on screen',
    p9.price === p9.priceBefore && p9.price === '437000' && p9.hasResult, JSON.stringify(p9));
  check('P9 after signing out a save is refused and the chip says so',
    p9.r.ok === false && p9.chip === 'Sign in to save', JSON.stringify(p9.r));

  check('P-ERR no JavaScript errors in the application during the whole client suite',
    pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));

  await browser.close();
  console.log('\n=========================================================');
  console.log('  PERSISTENCE — CLIENT ORCHESTRATION (Gate C)');
  console.log('  PASS ' + pass + '   FAIL ' + fail);
  console.log('=========================================================');
  process.exit(fail ? 1 : 0);
})();
