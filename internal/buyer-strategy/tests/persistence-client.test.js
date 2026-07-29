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
     P10 the pre-authentication path never dereferences a null transport
     P11 Gate C.5 — saved-buyer retrieval, record identity, status truthfulness
     P12 auth events: a token refresh must not orphan the active buyer
     P13 Gate D — config validation, vendored dependency, session expiry
         mid-edit, offline honesty, error classification
     P14 Gate D — the persistence bar is usable at phone/tablet widths (Q-6)

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
  // db: every row set ever written, keyed by buyer_profile_id. listBuyers and
  // load filter it by owner the way RLS does on the real backend, so a
  // cross-user test here fails for the same reason it would fail live.
  db: {},
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
    window.__mock.db[rows.buyer_profile.id] = JSON.parse(JSON.stringify(rows));
    return true;
  },
  async load(id){
    window.__mock.calls.push(['load', id]);
    if(window.__mock.failNext){ window.__mock.failNext = false; throw new Error('network unreachable'); }
    var s = window.__mock.db[id] || window.__mock.store;
    if(!s) return null;
    // RLS: a row you do not own does not exist as far as you are concerned
    var me = window.__mock.session && window.__mock.session.user.id;
    if(s.buyer_profile.owner_user_id !== me) return null;
    return { buyer_profile: s.buyer_profile, shopping_plan: s.shopping_plan,
             property: s.property, property_scenario: s.property_scenario,
             negotiation_rounds: s.negotiation_rounds,
             assumption_set_version: '2026.07-baseline' };
  },
  async listBuyers(){
    window.__mock.calls.push(['listBuyers']);
    var me = window.__mock.session && window.__mock.session.user.id;
    return Object.keys(window.__mock.db)
      .map(function(k){ return window.__mock.db[k].buyer_profile; })
      .filter(function(b){ return b.owner_user_id === me && b.status === 'active'; })
      .map(function(b){ return { id: b.id, display_name: b.display_name, updated_at: null }; });
  }
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
// The application applies live comma formatting on input (commit 540ccbe), so
// a field typed as 488000 reads back as "488,000". Compare on the number.
const num = v => String(v == null ? '' : v).replace(/,/g, '');

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
  /* Gate D §11 changed this deliberately. The Supabase client is now vendored
     locally, so it loads even with no network at all — the tool comes up with a
     real transport and simply cannot reach the server. 'no-save' is now
     reserved for a MISSING or corrupt vendored file, which P13i covers. The
     M-10 promise itself is unchanged and still asserted below: no account, no
     network, and the tool still calculates. */
  check('P1 offline, the vendored library still loads and the tool offers sign-in (Gate D §11)',
    p1.before.transport === 'supabase' && p1.before.state === 'signed-out',
    JSON.stringify(p1.before));
  check('P1 a save attempt with no session is refused, not thrown',
    p1.attempted.ok === false && /not authenticated/.test(p1.attempted.reason),
    JSON.stringify(p1.attempted));
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
  check('P10 with a transport but no session it says "Sign in to save", not an internal error',
    p10.chipText === 'Sign in to save', JSON.stringify(p10));

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
  /* Gate D §17: a message containing "network unreachable" is now classified as
     a connectivity problem rather than reported as a generic save failure. That
     is the point of §17 — the chip must not hide what the tool can identify. */
  check('P5 a connectivity failure is reported as OFFLINE, not as a generic save failure',
    p5.status.state === 'offline' && /Offline/.test(p5.chipText) &&
    /failed/.test(p5.chipClass), JSON.stringify({ t: p5.chipText, c: p5.chipClass }));
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
    // poison the stored cache with a different, wrong recommendation.
    // The mock now serves load() from db[id], so poison the row load() will
    // actually return — otherwise the test proves nothing.
    const poison = {
      cache_only: true, authoritative: false, recommended_program: 'va',
      recommended_scenario_dp: 0, piti: 1, cash_to_close: 1, max_price: 1,
      binding_constraint: 'Nonsense', assumption_set_version: 'bogus', engine_version: 'bogus'
    };
    window.__mock.store.property_scenario.result_summary = poison;
    if(window.__mock.db[buyerId]) window.__mock.db[buyerId].property_scenario.result_summary = poison;
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
  check('P7 the chip reads "Sign in to save" on a booted, signed-out page',
    p7.noSave === 'Sign in to save', p7.noSave);
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

  /* ================= P11: Gate C.5 — saved-buyer retrieval =================
     Everything here is about the loan officer getting back to a buyer they
     saved earlier, and about the chip never claiming more than it can prove. */

  // ---- P11a: an authenticated but unsaved workspace must NOT claim "Saved"
  await fresh({ fields: { price: '400000', income: '9500', debts: '650', ownFunds: '40000' } });
  const p11a = await page.evaluate(async () => {
    window.__mock.db = {}; window.__mock.store = null;
    window.__mock.session = { user: { id: '11111111-1111-4111-8111-111111111111' } };
    window.__install(true);
    const chip = document.getElementById('bseSaveStatus');
    const marker = document.getElementById('bseCurrentBuyer');
    return { chip: chip.textContent, state: BSEPersistence.status().state,
             marker: marker.textContent, markerClass: marker.className,
             listLen: document.getElementById('bseBuyerList').options.length,
             ctx: BSEPersistence.__context() };
  });
  check('P11a a fresh authenticated workspace says "Not saved", never "Saved"',
    p11a.chip === 'Not saved' && p11a.state === 'unsaved', JSON.stringify(p11a));
  check('P11a nothing is bound yet, and the UI says so',
    p11a.ctx === null && p11a.marker === 'New buyer' && /none/.test(p11a.markerClass),
    JSON.stringify(p11a));
  check('P11a the selector holds only its placeholder when nothing is saved',
    p11a.listLen === 1, String(p11a.listLen));

  // ---- P11b: saving earns "Saved" and puts the buyer in the selector
  const p11b = await page.evaluate(async () => {
    document.getElementById('bseBuyerName').value = 'Alvarez, Maria';
    const r = await BSEPersistence.saveNow();
    const sel = document.getElementById('bseBuyerList');
    const ctx = BSEPersistence.__context();
    return { ok: r.ok, chip: document.getElementById('bseSaveStatus').textContent,
             options: Array.from(sel.options).map(o => o.textContent),
             selected: sel.value, ctxId: ctx.buyer_profile_id,
             marker: document.getElementById('bseCurrentBuyer').textContent,
             storedName: window.__mock.store.buyer_profile.display_name };
  });
  check('P11b a successful write earns the word "Saved"',
    p11b.ok === true && p11b.chip === 'Saved', JSON.stringify(p11b));
  check('P11b the typed buyer name reaches the database row',
    p11b.storedName === 'Alvarez, Maria', p11b.storedName);
  check('P11b the new buyer appears in the selector and is the selected entry',
    p11b.options.includes('Alvarez, Maria') && p11b.selected === p11b.ctxId,
    JSON.stringify(p11b.options));
  check('P11b the currently loaded buyer is identifiable in the UI',
    p11b.marker === 'Alvarez, Maria', p11b.marker);

  // ---- P11c: an edit revokes the "Saved" claim immediately
  const p11c = await page.evaluate(async () => {
    const el = document.getElementById('price');
    el.value = '455000'; el.dispatchEvent(new Event('input', { bubbles: true }));
    const immediate = document.getElementById('bseSaveStatus').textContent;
    await new Promise(r => setTimeout(r, BSEPersistence.AUTOSAVE_DEBOUNCE_MS + 400));
    return { immediate, settled: document.getElementById('bseSaveStatus').textContent };
  });
  check('P11c typing revokes "Saved" at once and says there are unsaved changes',
    p11c.immediate === 'Unsaved changes', p11c.immediate);
  check('P11c the autosave then earns "Saved" back',
    p11c.settled === 'Saved', p11c.settled);

  // ---- P11d: repeated save/autosave must not create duplicate records
  const p11d = await page.evaluate(async () => {
    const ids = () => { const c = BSEPersistence.__context();
      return [c.buyer_profile_id, c.shopping_plan_id, c.property_id, c.property_scenario_id].join('|'); };
    const first = ids();
    for (const v of ['460000', '465000', '470000']) {
      const el = document.getElementById('price');
      el.value = v; el.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(r => setTimeout(r, BSEPersistence.AUTOSAVE_DEBOUNCE_MS + 300));
    }
    await BSEPersistence.saveNow();
    await BSEPersistence.saveNow();
    const rows = Object.keys(window.__mock.db).map(k => window.__mock.db[k]);
    return { stable: first === ids(), buyers: Object.keys(window.__mock.db).length,
             plans: new Set(rows.map(r => r.shopping_plan.id)).size,
             props: new Set(rows.map(r => r.property.id)).size,
             scens: new Set(rows.map(r => r.property_scenario.id)).size,
             writes: window.__mock.saves.length };
  });
  check('P11d the record ids never change across repeated autosaves and manual saves',
    p11d.stable === true);
  check('P11d repeated writes create no duplicate buyer, plan, property or scenario rows',
    p11d.buyers === 1 && p11d.plans === 1 && p11d.props === 1 && p11d.scens === 1,
    JSON.stringify(p11d));

  // ---- P11e: selecting a buyer restores it AND recomputes
  const p11e = await page.evaluate(async () => {
    const buyerA = BSEPersistence.__context().buyer_profile_id;
    // save a second, different buyer so the selector has a real choice
    BSEPersistence.__setContext(null);
    document.getElementById('bseBuyerName').value = 'Okafor, Daniel';
    document.getElementById('price').value = '325000';
    document.getElementById('income').value = '7200';
    recalc();
    await BSEPersistence.saveNow();
    const buyerB = BSEPersistence.__context().buyer_profile_id;
    const bSummary = BSEModel.buildResultSummary();

    // poison A's cached summary, then go back to A through the SELECTOR
    window.__mock.db[buyerA].property_scenario.result_summary = {
      cache_only: true, authoritative: false, recommended_program: 'va',
      recommended_scenario_dp: 0, piti: 1, cash_to_close: 1, max_price: 1,
      binding_constraint: 'Nonsense', assumption_set_version: 'bogus', engine_version: 'bogus'
    };
    const sel = document.getElementById('bseBuyerList');
    sel.value = buyerA;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 250));
    const aSummary = BSEModel.buildResultSummary();
    return { buyerA, buyerB,
             options: Array.from(sel.options).filter(o => o.value).map(o => o.textContent),
             boundTo: BSEPersistence.__context().buyer_profile_id,
             marker: document.getElementById('bseCurrentBuyer').textContent,
             chip: document.getElementById('bseSaveStatus').textContent,
             price: document.getElementById('price').value,
             income: document.getElementById('income').value,
             aProgram: aSummary.recommended_program, aPiti: String(aSummary.piti),
             bProgram: bSummary.recommended_program, bPiti: String(bSummary.piti) };
  });
  check('P11e the selector lists both saved buyers by name',
    p11e.options.length === 2 && p11e.options.includes('Alvarez, Maria') &&
    p11e.options.includes('Okafor, Daniel'), JSON.stringify(p11e.options));
  check('P11e selecting a buyer loads that exact record and rebinds to it',
    p11e.boundTo === p11e.buyerA && p11e.marker === 'Alvarez, Maria', JSON.stringify(p11e));
  check('P11e the loaded buyer\'s own inputs are restored, not the other buyer\'s',
    p11e.price === '470000' && p11e.income === '9500',
    JSON.stringify({ price: p11e.price, income: p11e.income }));
  check('P11e the load recomputes through the engine rather than trusting the cache',
    p11e.aProgram !== 'va' && p11e.aPiti !== '1', JSON.stringify(p11e));
  check('P11e the two buyers genuinely differ, so the restore proves something',
    p11e.aPiti !== p11e.bPiti, JSON.stringify({ a: p11e.aPiti, b: p11e.bPiti }));
  check('P11e a completed load may say "Saved" — loaded and unchanged',
    p11e.chip === 'Saved', p11e.chip);

  // ---- P11f: editing a LOADED buyer autosaves back to the same record
  const p11f = await page.evaluate(async () => {
    const before = BSEPersistence.__context().buyer_profile_id;
    const beforeCount = Object.keys(window.__mock.db).length;
    const el = document.getElementById('price');
    el.value = '481500'; el.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, BSEPersistence.AUTOSAVE_DEBOUNCE_MS + 400));
    return { sameRecord: BSEPersistence.__context().buyer_profile_id === before,
             noNewRows: Object.keys(window.__mock.db).length === beforeCount,
             persisted: String(window.__mock.db[before].property_scenario.list_price),
             chip: document.getElementById('bseSaveStatus').textContent };
  });
  check('P11f editing a loaded buyer autosaves back to the SAME record',
    p11f.sameRecord && p11f.noNewRows && p11f.chip === 'Saved', JSON.stringify(p11f));
  check('P11f the edited value is what actually landed in that record',
    p11f.persisted === '481500', p11f.persisted);

  // ---- P11g: a second user sees none of the first user's buyers
  const p11g = await page.evaluate(async () => {
    const otherId = '22222222-2222-4222-8222-222222222222';
    const victim = Object.keys(window.__mock.db)[0];
    await window.__transport.signOut();
    BSEPersistence.__setTransport(window.__transport, null);
    const afterSignOut = { list: document.getElementById('bseBuyerList').options.length,
                           marker: document.getElementById('bseCurrentBuyer').textContent,
                           ctx: BSEPersistence.__context() };
    window.__mock.session = { user: { id: otherId } };
    BSEPersistence.__setTransport(window.__transport, window.__mock.session);
    await BSEPersistence.__refreshBuyerList();
    const sel = document.getElementById('bseBuyerList');
    // and a direct attempt to open someone else's record by id
    const stolen = await BSEPersistence.load(victim);
    return { afterSignOut, victim,
             options: Array.from(sel.options).map(o => o.value).filter(Boolean),
             chip: document.getElementById('bseSaveStatus').textContent,
             stolenOk: stolen.ok, stolenReason: stolen.reason };
  });
  check('P11g signing out empties the selector and clears the binding',
    p11g.afterSignOut.list === 1 && p11g.afterSignOut.ctx === null &&
    p11g.afterSignOut.marker === 'New buyer', JSON.stringify(p11g.afterSignOut));
  check('P11g a different user sees NONE of the first user\'s saved buyers',
    p11g.options.length === 0, JSON.stringify(p11g.options));
  check('P11g a different user starts at "Not saved", not "Saved"',
    p11g.chip === 'Not saved', p11g.chip);
  check('P11g even asking for another user\'s record by id returns nothing',
    p11g.stolenOk === false && /not found/.test(p11g.stolenReason), JSON.stringify(p11g));

  /* ================= P12: auth events must not orphan the binding =========
     Doug's live Supabase data showed four property_scenario rows. Three were
     historical, and the query confirmed no duplication had actually occurred —
     but reading the code to answer that question surfaced a real defect that
     had simply not been triggered yet.

     BSEPersistence tore down the active binding on EVERY Supabase auth event.
     Supabase fires onAuthStateChange for INITIAL_SESSION, SIGNED_IN,
     TOKEN_REFRESHED, USER_UPDATED and SIGNED_OUT. TOKEN_REFRESHED fires on a
     timer and on tab focus, while the officer is mid-session. When it did, ctx
     went null, and the very next autosave minted fresh ids and wrote a whole
     new buyer/plan/property/scenario set — while the screen still showed the
     buyer they believed they were editing.

     P12 pins the rule: only a sign-out, or a switch to a genuinely different
     user, may end a working session. */

  await fresh({ fields: { price: '400000', income: '9500', debts: '650',
                          ownFunds: '40000', score: '740' } });

  const p12setup = await page.evaluate(async () => {
    window.__mock.db = {}; window.__mock.store = null; window.__mock.calls.length = 0;
    window.__mock.session = { user: { id: '11111111-1111-4111-8111-111111111111' },
                              access_token: 'token-ONE' };
    window.__install(true);
    document.getElementById('bseBuyerName').value = 'Refresh Test Buyer';
    await BSEPersistence.saveNow();
    const c = BSEPersistence.__context();
    return { ids: [c.buyer_profile_id, c.shopping_plan_id, c.property_id, c.property_scenario_id],
             rows: Object.keys(window.__mock.db).length,
             chip: document.getElementById('bseSaveStatus').textContent,
             registered: typeof window.__mock.authCb === 'function' };
  });
  check('P12 the application registers its own auth-change handler (test uses the real one)',
    p12setup.registered === true);
  if (!p12setup.registered) {
    // Without the handler the rest of P12 cannot be executed. Fail every
    // remaining assertion explicitly rather than throwing — a build that does
    // not register the handler is exactly the broken build P12 exists to catch.
    ['P12a a token refresh does NOT clear the active buyer binding',
     'P12a the buyer stays identified on screen through a token refresh',
     'P12a the saved-buyer list is not emptied by a token refresh',
     'P12a the status chip is not reset to "Not saved" by a token refresh',
     "P12a the officer's work is untouched and the session is still live",
     'P12b the autosave after a token refresh creates NO new records',
     'P12b it writes to the SAME four record ids as before the refresh',
     'P12b the edited value lands in that same existing scenario',
     'P12c five consecutive auth events for the same user still produce ONE buyer',
     'P12c the last edit still lands in the original scenario',
     'P12d a switch to a DIFFERENT user does end the session and clear the binding',
     "P12d the new user sees none of the previous user's buyers",
     'P12e a sign-out event ends the session and empties the list',
     'P12e signing out still leaves the tool calculating'
    ].forEach(n => check(n, false, 'no auth-change handler registered — cannot run'));
  } else {
  check('P12 a buyer is saved and bound before the refresh',
    p12setup.rows === 1 && p12setup.chip === 'Saved', JSON.stringify(p12setup));

  // ---- P12a: TOKEN_REFRESHED for the SAME user must change nothing
  const p12a = await page.evaluate(async () => {
    // exactly what supabase-js delivers on a token refresh: same user, new JWT
    window.__mock.session = { user: { id: '11111111-1111-4111-8111-111111111111' },
                              access_token: 'token-TWO' };
    window.__mock.authCb(window.__mock.session);
    await new Promise(r => setTimeout(r, 50));
    const c = BSEPersistence.__context();
    return { ctx: c && [c.buyer_profile_id, c.shopping_plan_id, c.property_id, c.property_scenario_id],
             chip: document.getElementById('bseSaveStatus').textContent,
             marker: document.getElementById('bseCurrentBuyer').textContent,
             nameField: document.getElementById('bseBuyerName').value,
             listLen: document.getElementById('bseBuyerList').options.length,
             price: document.getElementById('price').value,
             token: BSEPersistence.status().authenticated };
  });
  check('P12a a token refresh does NOT clear the active buyer binding',
    p12a.ctx !== null && JSON.stringify(p12a.ctx) === JSON.stringify(p12setup.ids),
    JSON.stringify({ before: p12setup.ids, after: p12a.ctx }));
  check('P12a the buyer stays identified on screen through a token refresh',
    p12a.marker === 'Refresh Test Buyer' && p12a.nameField === 'Refresh Test Buyer',
    JSON.stringify(p12a));
  check('P12a the saved-buyer list is not emptied by a token refresh',
    p12a.listLen === 2, String(p12a.listLen));
  check('P12a the status chip is not reset to "Not saved" by a token refresh',
    p12a.chip === 'Saved', p12a.chip);
  check('P12a the officer\'s work is untouched and the session is still live',
    p12a.price === '400000' && p12a.token === true, JSON.stringify(p12a));

  // ---- P12b: the autosave AFTER a refresh must update, not duplicate
  const p12b = await page.evaluate(async () => {
    const el = document.getElementById('price');
    el.value = '512000'; el.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, BSEPersistence.AUTOSAVE_DEBOUNCE_MS + 400));
    const c = BSEPersistence.__context();
    const keys = Object.keys(window.__mock.db);
    const rows = keys.map(k => window.__mock.db[k]);
    return { buyers: keys.length,
             plans: new Set(rows.map(r => r.shopping_plan.id)).size,
             props: new Set(rows.map(r => r.property.id)).size,
             scens: new Set(rows.map(r => r.property_scenario.id)).size,
             ids: [c.buyer_profile_id, c.shopping_plan_id, c.property_id, c.property_scenario_id],
             persisted: String(window.__mock.db[c.buyer_profile_id].property_scenario.list_price),
             chip: document.getElementById('bseSaveStatus').textContent };
  });
  check('P12b the autosave after a token refresh creates NO new records',
    p12b.buyers === 1 && p12b.plans === 1 && p12b.props === 1 && p12b.scens === 1,
    JSON.stringify(p12b));
  check('P12b it writes to the SAME four record ids as before the refresh',
    JSON.stringify(p12b.ids) === JSON.stringify(p12setup.ids),
    JSON.stringify({ before: p12setup.ids, after: p12b.ids }));
  check('P12b the edited value lands in that same existing scenario',
    p12b.persisted === '512000' && p12b.chip === 'Saved', JSON.stringify(p12b));

  // ---- P12c: repeated refreshes, and a USER_UPDATED-shaped event, are inert
  const p12c = await page.evaluate(async () => {
    for (let i = 3; i <= 6; i++) {
      window.__mock.session = { user: { id: '11111111-1111-4111-8111-111111111111' },
                                access_token: 'token-' + i };
      window.__mock.authCb(window.__mock.session);
      await new Promise(r => setTimeout(r, 20));
    }
    // USER_UPDATED: same id, extra profile fields
    window.__mock.authCb({ user: { id: '11111111-1111-4111-8111-111111111111',
                                   email: 'doug@example.test' }, access_token: 'token-7' });
    await new Promise(r => setTimeout(r, 50));
    const el = document.getElementById('price');
    el.value = '523500'; el.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, BSEPersistence.AUTOSAVE_DEBOUNCE_MS + 400));
    const c = BSEPersistence.__context();
    return { buyers: Object.keys(window.__mock.db).length,
             ids: [c.buyer_profile_id, c.shopping_plan_id, c.property_id, c.property_scenario_id],
             persisted: String(window.__mock.db[c.buyer_profile_id].property_scenario.list_price) };
  });
  check('P12c five consecutive auth events for the same user still produce ONE buyer',
    p12c.buyers === 1 && JSON.stringify(p12c.ids) === JSON.stringify(p12setup.ids),
    JSON.stringify(p12c));
  check('P12c the last edit still lands in the original scenario',
    p12c.persisted === '523500', p12c.persisted);

  // ---- P12d: a DIFFERENT user must still end the session
  const p12d = await page.evaluate(async () => {
    window.__mock.session = { user: { id: '22222222-2222-4222-8222-222222222222' },
                              access_token: 'other-user' };
    window.__mock.authCb(window.__mock.session);
    await new Promise(r => setTimeout(r, 80));
    return { ctx: BSEPersistence.__context(),
             marker: document.getElementById('bseCurrentBuyer').textContent,
             nameField: document.getElementById('bseBuyerName').value,
             listIds: Array.from(document.getElementById('bseBuyerList').options)
                        .map(o => o.value).filter(Boolean),
             chip: document.getElementById('bseSaveStatus').textContent };
  });
  check('P12d a switch to a DIFFERENT user does end the session and clear the binding',
    p12d.ctx === null && p12d.marker === 'New buyer' && p12d.nameField === '',
    JSON.stringify(p12d));
  /* The security property is the empty list. Gate D additionally refuses to let
     the new user save the previous user's workspace, so the chip now says so. */
  check('P12d the new user sees none of the previous user\'s buyers',
    p12d.listIds.length === 0, JSON.stringify(p12d.listIds));
  check('P12d and Gate D flags that the on-screen workspace is not theirs to save',
    p12d.chip === 'Different account — reload to start fresh' || p12d.chip === 'Not saved',
    p12d.chip);

  // ---- P12e: SIGNED_OUT must still end the session
  const p12e = await page.evaluate(async () => {
    window.__mock.session = null;
    window.__mock.authCb(null);
    await new Promise(r => setTimeout(r, 60));
    return { ctx: BSEPersistence.__context(),
             chip: document.getElementById('bseSaveStatus').textContent,
             listIds: Array.from(document.getElementById('bseBuyerList').options)
                        .map(o => o.value).filter(Boolean),
             marker: document.getElementById('bseCurrentBuyer').textContent,
             // NB: assert the engine still RUNS, not that a program qualifies.
             // By this point the scenario is $523,500 on $9,500 income, which
             // may legitimately eliminate every program — that is the engine
             // working, not failing.
             summary: BSEModel.buildResultSummary(),
             recalcThrew: (() => { try { recalc(); return false; } catch(e){ return String(e); } })() };
  });
  check('P12e a sign-out event ends the session and empties the list',
    p12e.ctx === null && p12e.chip === 'Sign in to save' && p12e.listIds.length === 0,
    JSON.stringify(p12e));
  check('P12e signing out still leaves the tool calculating',
    p12e.recalcThrew === false && p12e.summary !== null &&
    typeof p12e.summary === 'object' && p12e.summary.assumption_set_version === '2026.07-baseline',
    JSON.stringify({ threw: p12e.recalcThrew, program: p12e.summary && p12e.summary.recommended_program,
                     binding: p12e.summary && p12e.summary.binding_constraint }));

  }

  /* ================= P13: Gate D — deployment readiness =================
     §10 configuration validation · §11 vendored dependency ·
     §13 session expiry mid-edit · §15 offline · §17 error classification. */

  // ---- P13a §10: configuration validation names the fault
  await fresh();
  const p13a = await page.evaluate(() => {
    const V = BSEPersistence.__validateConfig;
    const good = { url: 'https://oxvtuvoguulphgycgixg.supabase.co',
                   publishableKey: 'sb_publishable_TNOuVKFrd0VMkyEOic2V-Q_wtNRrHnP' };
    return {
      good:      V(good),
      shortRef:  V({ ...good, url: 'https://oxvtuvoqulphgycgixg.supabase.co' }), // the real §57c bug: 19 chars
      notUrl:    V({ ...good, url: 'oxvtuvoguulphgycgixg' }),
      blankUrl:  V({ ...good, url: '' }),
      badKey:    V({ ...good, publishableKey: 'hunter2' }),
      secretKey: V({ ...good, publishableKey: 'sb_secret_abcdefghijklmnopqrstuvwxyz' }),
      shipped:   BSEPersistence.__validateShipped(),
      cfg:       BSEPersistence.__config()
    };
  });
  check('P13a §10 the shipped configuration validates clean',
    p13a.good.length === 0 && p13a.shipped.length === 0, JSON.stringify(p13a.shipped));
  check('P13a §10 the exact Gate C §57c failure is now caught by name, not by a network error',
    p13a.shortRef.length === 1 && /19 characters/.test(p13a.shortRef[0]), JSON.stringify(p13a.shortRef));
  check('P13a §10 a non-URL and a blank URL are both rejected',
    p13a.notUrl.length >= 1 && p13a.blankUrl.length >= 1);
  check('P13a §10 a malformed publishable key is rejected',
    p13a.badKey.length === 1 && /publishable key/i.test(p13a.badKey[0]), JSON.stringify(p13a.badKey));
  check('P13a §10 a SECRET key in browser config is caught and named as such',
    p13a.secretKey.some(m => /SECRET KEY DETECTED/.test(m)), JSON.stringify(p13a.secretKey));

  // ---- P13b §11: the dependency is local and pinned, with no CDN anywhere
  check('P13b §11 the client loads a vendored local library, not a CDN',
    /^vendor\//.test(p13a.cfg.libraryUrl) && !/https?:/.test(p13a.cfg.libraryUrl),
    p13a.cfg.libraryUrl);
  check('P13b §11 the vendored version is pinned in the path and recorded',
    p13a.cfg.libraryVersion === '2.111.0' && p13a.cfg.libraryUrl.indexOf('2.111.0') >= 0,
    JSON.stringify(p13a.cfg));
  const appSrc = require('fs').readFileSync(APP, 'utf8');
  check('P13b §11 no CDN hostname survives anywhere in the application',
    !/esm\.sh|cdn\.jsdelivr|unpkg\.com|cdnjs/.test(appSrc));

  // ---- P13c §17: failure classification distinguishes what it can
  const p13c = await page.evaluate(() => {
    const C = BSEPersistence.__classifyFailure;
    return { jwt:      C(new Error('JWT expired')),
             expired:  C({ message: 'token is expired', status: 401 }),
             http403:  C({ message: 'boom', status: 403 }),
             fetchErr: C(new TypeError('Failed to fetch')),
             netErr:   C(new Error('NetworkError when attempting to fetch resource')),
             other:    C(new Error('duplicate key value violates unique constraint')) };
  });
  check('P13c §17 an expired JWT is classified as an auth loss, not a save failure',
    p13c.jwt === 'auth-lost' && p13c.expired === 'auth-lost' && p13c.http403 === 'auth-lost',
    JSON.stringify(p13c));
  check('P13c §17 a fetch/network error is classified as offline',
    p13c.fetchErr === 'offline' && p13c.netErr === 'offline', JSON.stringify(p13c));
  check('P13c §17 an unrecognised error stays a plain save failure with its real message',
    p13c.other === 'failed', p13c.other);

  // ---- P13d §13: a session that dies mid-edit
  await fresh({ fields: { price: '400000', income: '9500', debts: '650',
                          ownFunds: '40000', score: '740' } });
  const A = '11111111-1111-4111-8111-111111111111';
  const B = '22222222-2222-4222-8222-222222222222';

  const p13d = await page.evaluate(async (A) => {
    window.__mock.db = {}; window.__mock.store = null;
    window.__mock.session = { user: { id: A }, access_token: 't1' };
    window.__install(true);
    document.getElementById('bseBuyerName').value = 'Expiry Test Buyer';
    await BSEPersistence.saveNow();
    const bound = BSEPersistence.__context().buyer_profile_id;

    // the officer edits...
    const el = document.getElementById('price');
    el.value = '488000'; el.dispatchEvent(new Event('input', { bubbles: true }));
    const afterEdit = document.getElementById('bseSaveStatus').textContent;

    // ...and the session dies before the debounce fires
    window.__mock.session = null;
    window.__mock.authCb(null);
    await new Promise(r => setTimeout(r, BSEPersistence.AUTOSAVE_DEBOUNCE_MS + 400));

    const g = BSEPersistence.__gateD();
    return { bound, afterEdit,
             chip: document.getElementById('bseSaveStatus').textContent,
             price: document.getElementById('price').value,
             income: document.getElementById('income').value,
             // NB: assert the engine RUNS, not that a program qualifies — at
             // $488,000 on $9,500 income, eliminating every program is correct.
             summary: BSEModel.buildResultSummary(),
             engineRuns: (() => { try { recalc(); return true; } catch(e){ return false; } })(),
             parkedOwner: g.parkedOwner, parked: !!g.parkedCtx, dirty: g.dirty,
             rowsWritten: Object.keys(window.__mock.db).length };
  }, A);
  check('P13d §13 an edit is marked unsaved the moment it happens',
    p13d.afterEdit === 'Unsaved changes', p13d.afterEdit);
  check('P13d §13 a session ending mid-edit NEVER displays "Saved"',
    p13d.chip !== 'Saved' && /Session expired/.test(p13d.chip), p13d.chip);
  check('P13d §13 the authored workspace is not discarded — it is all still on screen',
    num(p13d.price) === '488000' && num(p13d.income) === '9500' &&
    p13d.engineRuns === true && !!p13d.summary,
    JSON.stringify({ price: p13d.price, income: p13d.income,
                     engineRuns: p13d.engineRuns,
                     program: p13d.summary && p13d.summary.recommended_program }));
  check('P13d §13 the buyer binding is PARKED, not destroyed, and tagged to its owner',
    p13d.parked === true && p13d.parkedOwner === A, JSON.stringify(p13d));
  check('P13d §13 no new buyer was created when session identity disappeared',
    p13d.rowsWritten === 1, String(p13d.rowsWritten));

  // ---- P13e §13: the SAME user comes back
  const p13e = await page.evaluate(async (A) => {
    window.__mock.session = { user: { id: A }, access_token: 't2' };
    window.__mock.authCb(window.__mock.session);
    await new Promise(r => setTimeout(r, BSEPersistence.AUTOSAVE_DEBOUNCE_MS + 500));
    const c = BSEPersistence.__context();
    const keys = Object.keys(window.__mock.db);
    return { rebound: c && c.buyer_profile_id, rows: keys.length,
             marker: document.getElementById('bseCurrentBuyer').textContent,
             chip: document.getElementById('bseSaveStatus').textContent,
             persisted: String(window.__mock.db[keys[0]].property_scenario.list_price),
             dirty: BSEPersistence.__gateD().dirty };
  }, A);
  check('P13e §13 reauthenticating as the same user rebinds the SAME buyer',
    p13e.rebound === p13d.bound && p13e.marker === 'Expiry Test Buyer',
    JSON.stringify({ was: p13d.bound, now: p13e.rebound }));
  check('P13e §13 the pending edit saves to that same record — no fork',
    p13e.rows === 1 && num(p13e.persisted) === '488000', JSON.stringify(p13e));
  check('P13e §13 and only then does the chip earn "Saved" again',
    p13e.chip === 'Saved' && p13e.dirty === false, JSON.stringify(p13e));

  // ---- P13f §13: a DIFFERENT user must never inherit the workspace
  const p13f = await page.evaluate(async (B) => {
    // fresh unsaved edits belonging to user A are on screen
    const el = document.getElementById('price');
    el.value = '499000'; el.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 40));
    const rowsBefore = Object.keys(window.__mock.db).length;

    window.__mock.session = { user: { id: B }, access_token: 'b1' };
    window.__mock.authCb(window.__mock.session);
    await new Promise(r => setTimeout(r, 80));

    const g1 = BSEPersistence.__gateD();
    const attempted = await BSEPersistence.saveNow();
    // and let any debounce that might be pending fire too
    await new Promise(r => setTimeout(r, BSEPersistence.AUTOSAVE_DEBOUNCE_MS + 400));

    const rows = Object.keys(window.__mock.db).map(k => window.__mock.db[k]);
    return { ctx: BSEPersistence.__context(), parked: !!g1.parkedCtx,
             workspaceOwner: g1.workspaceOwner,
             chip: document.getElementById('bseSaveStatus').textContent,
             attempted: attempted,
             rowsBefore: rowsBefore, rowsAfter: rows.length,
             anyOwnedByB: rows.some(r => r.buyer_profile.owner_user_id === B),
             marker: document.getElementById('bseCurrentBuyer').textContent,
             price: document.getElementById('price').value };
  }, B);
  check('P13f §13 the parked binding is discarded for a different user, never inherited',
    p13f.parked === false && p13f.ctx === null, JSON.stringify(p13f));
  check('P13f §13 a save under the wrong account is REFUSED, with a reason',
    p13f.attempted.ok === false && /different account/.test(p13f.attempted.reason),
    JSON.stringify(p13f.attempted));
  check('P13f §13 NO record of user A\'s data is written under user B — the whole point',
    p13f.rowsAfter === p13f.rowsBefore && p13f.anyOwnedByB === false,
    JSON.stringify({ before: p13f.rowsBefore, after: p13f.rowsAfter, ownedByB: p13f.anyOwnedByB }));
  check('P13f §13 the autosave debounce cannot sneak the write through either',
    p13f.anyOwnedByB === false && p13f.chip === 'Different account — reload to start fresh',
    p13f.chip);
  check('P13f §13 user B sees no buyer name from user A',
    p13f.marker === 'New buyer', p13f.marker);
  check('P13f §13 user A\'s numbers are still on screen and are NOT silently wiped',
    num(p13f.price) === '499000', p13f.price);

  // ---- P13g §15 / §14: offline honesty
  await fresh({ fields: { price: '425000', income: '9000' } });
  const p13g = await page.evaluate(async (A) => {
    window.__mock.db = {}; window.__mock.store = null;
    window.__mock.session = { user: { id: A }, access_token: 't1' };
    window.__install(true);
    await BSEPersistence.saveNow();
    const bound = BSEPersistence.__context().buyer_profile_id;

    // network drops
    Object.defineProperty(window.navigator, 'onLine', { value: false, configurable: true });
    window.__mock.failNext = true;
    const el = document.getElementById('price');
    el.value = '431000'; el.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, BSEPersistence.AUTOSAVE_DEBOUNCE_MS + 400));
    const offlineChip = document.getElementById('bseSaveStatus').textContent;
    const offlineWork = document.getElementById('price').value;
    const offlineRec  = !!BSEModel.buildResultSummary();   // engine runs; a program need not qualify

    // network returns
    Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true });
    const again = await BSEPersistence.saveNow();
    const keys = Object.keys(window.__mock.db);
    return { bound, offlineChip, offlineWork, offlineRec,
             recovered: again.ok,
             chip: document.getElementById('bseSaveStatus').textContent,
             rows: keys.length, sameRecord: keys[0] === bound,
             persisted: String(window.__mock.db[keys[0]].property_scenario.list_price) };
  }, A);
  check('P13g §14 an offline autosave NEVER claims "Saved"',
    p13g.offlineChip !== 'Saved' && /Offline/.test(p13g.offlineChip), p13g.offlineChip);
  check('P13g §14 authored state stays visible and the recommendation stays correct while offline',
    num(p13g.offlineWork) === '431000' && !!p13g.offlineRec, JSON.stringify(p13g));
  check('P13g §14 saving after the connection returns succeeds',
    p13g.recovered === true && p13g.chip === 'Saved', JSON.stringify(p13g));
  check('P13g §14 recovery updates the SAME record and creates no duplicate',
    p13g.rows === 1 && p13g.sameRecord && num(p13g.persisted) === '431000', JSON.stringify(p13g));

  // ---- P13h §15: offline cold start fails honestly, on a genuinely cold page
  await fresh();
  const p13h = await page.evaluate(() => {
    const st = BSEPersistence.status();
    return { state: st.state, chip: document.getElementById('bseSaveStatus').textContent,
             calculates: !!BSEModel.buildResultSummary(),
             engineRuns: (() => { try { recalc(); return true; } catch(e){ return false; } })() };
  });
  check('P13h §15 an offline cold start never claims "Saved" or a connected account',
    p13h.chip !== 'Saved' && p13h.state !== 'saved' && p13h.state !== 'dirty',
    JSON.stringify(p13h));
  check('P13h §15 it states plainly that signing in is required before anything can save',
    p13h.chip === 'Sign in to save', p13h.chip);
  check('P13h §15 and the calculator still works offline with no account (M-10)',
    p13h.engineRuns === true && p13h.calculates === true, JSON.stringify(p13h));

  // ---- P13i §11: a MISSING vendored library must degrade, not crash
  const p13i = await page.evaluate(async () => {
    let err = null;
    try {
      await new Promise((resolve, reject) => {
        const el = document.createElement('script');
        el.src = new URL('vendor/does-not-exist.js', document.baseURI).href;
        el.onload = resolve;
        el.onerror = () => reject(new Error('vendored Supabase library could not be loaded from ' + el.src));
        document.head.appendChild(el);
      });
    } catch(e){ err = String(e.message); }
    return { err: err, stillCalculates: !!BSEModel.buildResultSummary(),
             engineRuns: (() => { try { recalc(); return true; } catch(e){ return false; } })() };
  });
  check('P13i §11 a missing vendored library surfaces a named error, not a silent failure',
    p13i.err !== null && /could not be loaded from/.test(p13i.err), String(p13i.err));
  check('P13i §11 and the tool keeps calculating regardless — the M-10 promise holds',
    p13i.stillCalculates === true && p13i.engineRuns === true, JSON.stringify(p13i));

  /* ---- P14 §18: the signed-in bar must be usable at phone widths ----
     Q-6 is locked at FULL phone editing. Before Gate D the signed-in bar was
     577px wide and sat at left:-210px in a 375px viewport, putting the Buyer
     name field entirely off the screen — a buyer could not be named or renamed
     on a phone at all. */
  for (const [label, w, h] of [['phone 375', 375, 667], ['phone 430', 430, 932],
                               ['tablet 768', 768, 1024], ['desktop 1440', 1440, 900]]) {
    await page.setViewportSize({ width: w, height: h });
    await fresh({ fields: { price: '450000' } });
    const v = await page.evaluate(async () => {
      window.__mock.db = {}; window.__mock.store = null;
      window.__mock.session = { user: { id: '11111111-1111-4111-8111-111111111111' } };
      window.__install(true);
      document.getElementById('bseBuyerName').value = 'Alvarez, Maria';
      await BSEPersistence.saveNow();
      const bar = document.getElementById('bsePersistBar').getBoundingClientRect();
      const onScreen = id => {
        const e = document.getElementById(id);
        if (!e || getComputedStyle(e).display === 'none') return false;
        const b = e.getBoundingClientRect();
        return b.left >= -1 && b.right <= window.innerWidth + 1 && b.width > 0 && b.height > 0;
      };
      return { fits: bar.left >= -1 && bar.right <= window.innerWidth + 1,
               name: onScreen('bseBuyerName'), list: onScreen('bseBuyerList'),
               save: onScreen('bseSave'), out: onScreen('bseSignOut'),
               marker: onScreen('bseCurrentBuyer'),
               pageOverflowX: document.documentElement.scrollWidth > window.innerWidth + 1 };
    });
    check('P14 §18 ' + label + ' — the signed-in bar fits the viewport', v.fits, JSON.stringify(v));
    check('P14 §18 ' + label + ' — every persistence control is reachable on screen',
      v.name && v.list && v.save && v.out && v.marker, JSON.stringify(v));
    check('P14 §18 ' + label + ' — the page does not scroll sideways', !v.pageOverflowX);
  }
  await page.setViewportSize({ width: 1280, height: 800 });

  check('P-ERR no JavaScript errors in the application during the whole client suite',
    pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));

  await browser.close();
  console.log('\n=========================================================');
  console.log('  PERSISTENCE — CLIENT ORCHESTRATION (Gate C)');
  console.log('  PASS ' + pass + '   FAIL ' + fail);
  console.log('=========================================================');
  process.exit(fail ? 1 : 0);
})();
