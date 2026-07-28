/* =====================================================================
   PERSISTENCE — SCHEMA, RLS AND CANONICAL ROUND TRIP
   Phase 3 Gate C.

   Runs the real Buyer Strategy Engine headless, captures canonical state,
   writes it through supabase/mapping/canonical-to-db.js into a REAL
   PostgreSQL database created from supabase/migrations/*.sql with RLS
   enabled and forced, reads it back as the owning user, reconstructs the
   canonical model, restores it into the application, and asserts:

     D1  the migrations apply cleanly and the seven tables exist
     D2  RLS denies a second authenticated user every operation
     D3  authored NULL survives as SQL NULL and stays NULL on load
     D4  an explicit zero survives as zero and never becomes an inherited default
     D5  canonical (value, unit) pairs survive intact and cannot be split
     D6  a concession authored before a price survives with no round created
     D7  negotiation mode without a round survives
     D8  a negotiation_round cannot exist without a price
     D9  canonical A -> database -> canonical B is identity for authored state
     D10 load recomputes: a deliberately false result_summary cache has no effect
     D11 the assumption set is immutable

   Requires: a local PostgreSQL (see supabase/local-verify/README.md).
   This proves the SCHEMA and the MAPPING. It does not and cannot prove
   Supabase Auth or magic-link delivery — see the Gate C report.

   Usage: node tests/persistence-db.test.js <app.html>
   ===================================================================== */
const { chromium } = require('playwright');
const { Client } = require('pg');
const path = require('path');
const fs = require('fs');
const map = require('../supabase/mapping/canonical-to-db');
const harness = require('./lib/app-harness');

const APP = path.resolve(process.argv[2]);
const PG = { host: process.env.PGHOST || '/tmp/pgsock', port: +(process.env.PGPORT || 5433),
             user: 'postgres', database: 'bse_verify' };

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';

let pass = 0, fail = 0; const failures = [];
function check(name, ok, detail) {
  if (ok) { pass++; console.log('  PASS  ' + name); }
  else { fail++; failures.push(name); console.log('  FAIL  ' + name + (detail ? '\n        ' + detail : '')); }
}

const { randomUUID } = require('crypto');
const uuid = () => randomUUID();
const ids = n => Array.from({ length: n }, () => uuid());

async function asUser(db, uid, fn) {
  await db.query('begin');
  await db.query("set local role authenticated");
  await db.query("select set_config('request.jwt.claim.sub', $1, true)", [uid]);
  await db.query("select set_config('request.jwt.claim.role', 'authenticated', true)");
  try { const r = await fn(); await db.query('commit'); return r; }
  catch (e) { await db.query('rollback'); throw e; }
}

function insert(table, row) {
  const cols = Object.keys(row).filter(k => row[k] !== undefined);
  const vals = cols.map(k => row[k]);
  const ph = cols.map((_, i) => '$' + (i + 1)).join(',');
  return { text: `insert into ${table} (${cols.join(',')}) values (${ph}) returning *`, values: vals };
}

/* Scenarios chosen to exercise every required round-trip case. */
const CASES = [
  { id: 'blank rate + blank closing-cost percent (authored NULL)',
    fields: { rateConv: '', ccPct: '' } },
  { id: 'explicit zero rate + explicit zero closing-cost percent',
    fields: { rateConv: '0', ccPct: '0' } },
  { id: 'authored nonzero rate and closing-cost percent',
    fields: { rateConv: '7.125', ccPct: '2.5' } },
  { id: 'down payment as a percent pair',
    fields: { price: '437,000', dpTarget: '3.375' }, units: { dp: 'pct' } },
  { id: 'down payment as a dollar pair',
    fields: { price: '437,000', dpTarget: '87,400' }, units: { dp: 'dollar' } },
  { id: 'tax as an annual dollar amount',
    fields: { price: '450,000', taxRate: '6,000' }, units: { tax: 'dollar' } },
  { id: 'concession authored before any offer price',
    fields: { price: '400,000', offerConc: '5,000' } },
  { id: 'percent concession with no price at all (unresolvable, retained)',
    fields: { price: '', offerConc: '2' }, units: { offerConc: 'pct' } },
  { id: 'negotiation mode selected with no round',
    fields: {}, negMode: 'reduction' },
  { id: 'full negotiation: offer + counter rounds',
    fields: { price: '500,000', offerPrice: '485,000', offerConc: '8,000',
              counterPrice: '492,000', counterConc: '4,000' }, counter: true, negMode: 'split' },
  { id: 'three-state cost fields — typed values with N/A confirmed',
    fields: { price: '400,000', hoa: '250', cdd: '120', flood: '85' },
    checkboxes: { hoaNA: true, cddNA: true, floodNA: true } },
  { id: 'three-state cost fields — known values',
    fields: { price: '400,000', hoa: '340', cdd: '120', flood: '85' },
    checkboxes: { hoaNA: false, cddNA: false, floodNA: false } },
  { id: 'shopping mode, no price',
    fields: { price: '' } }
];

(async () => {
  const spec = harness.loadSpec();
  const db = new Client(PG);
  await db.connect();

  // ---------- D1 schema ----------
  const tables = (await db.query(
    "select tablename from pg_tables where schemaname='public' order by 1")).rows.map(r => r.tablename);
  check('D1 the seven Phase 2 tables exist after applying the migrations',
    ['buyer_profile', 'negotiation_round', 'program_assumption_set', 'property',
     'property_scenario', 'shopping_plan', 'tax_method'].every(t => tables.includes(t)), tables.join(','));
  const rls = (await db.query(
    `select relname, relrowsecurity, relforcerowsecurity from pg_class
      where relname in ('buyer_profile','shopping_plan','property','property_scenario','negotiation_round')`)).rows;
  check('D1 RLS is enabled AND forced on all five buyer-owned tables',
    rls.length === 5 && rls.every(r => r.relrowsecurity && r.relforcerowsecurity), JSON.stringify(rls));

  const asId = (await db.query("select id, version_label from program_assumption_set where is_current")).rows[0];
  check('D1 the 2026.07-baseline assumption set is seeded and current', asId.version_label === '2026.07-baseline');

  await db.query('insert into auth.users (id,email) values ($1,$2),($3,$4) on conflict do nothing',
    [USER_A, 'a@example.test', USER_B, 'b@example.test']);

  // ---------- browser: produce canonical states ----------
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(String(e)));

  let caseNo = 0;
  for (const c of CASES) {
    caseNo++;
    const [bpId, spId, prId, scId] = ids(4);
    await page.goto('file://' + APP);
    await page.addScriptTag({ content: harness.HELPERS });
    await page.evaluate(([sc, d]) => window.__apply(sc, d), [c, spec.defaults]);

    const before = await page.evaluate(() => ({
      model: JSON.parse(JSON.stringify(BSEModel.capture())),
      summary: BSEModel.buildResultSummary()
    }));

    const ctx = { owner_user_id: USER_A, buyer_profile_id: bpId, shopping_plan_id: spId,
                  property_id: prId, property_scenario_id: scId, assumption_set_id: asId.id,
                  display_name: 'Round-trip buyer ' + caseNo, property_label: 'Case ' + caseNo };
    // a deliberately WRONG cache is stored alongside every scenario
    const falseCache = { cache_only: true, authoritative: false, recommended_program: 'fha',
                         recommended_scenario_dp: 3.5, piti: 1, cash_to_close: 1,
                         binding_constraint: 'Nonsense', price: 1, max_price: 1,
                         assumption_set_version: 'bogus', engine_version: 'bogus' };
    const rows = map.serialize(before.model, ctx, falseCache);

    let readBack;
    try {
      readBack = await asUser(db, USER_A, async () => {
        await db.query(insert('buyer_profile', rows.buyer_profile));
        await db.query(insert('shopping_plan', rows.shopping_plan));
        await db.query(insert('property', rows.property));
        await db.query(insert('property_scenario', rows.property_scenario));
        for (const r of rows.negotiation_rounds) await db.query(insert('negotiation_round', r));
        return {
          buyer_profile: (await db.query('select * from buyer_profile where id=$1', [bpId])).rows[0],
          shopping_plan: (await db.query('select * from shopping_plan where id=$1', [spId])).rows[0],
          property: (await db.query('select * from property where id=$1', [prId])).rows[0],
          property_scenario: (await db.query('select * from property_scenario where id=$1', [scId])).rows[0],
          negotiation_rounds: (await db.query(
            'select * from negotiation_round where property_scenario_id=$1 order by round_number', [scId])).rows,
          assumption_set_version: asId.version_label
        };
      });
    } catch (e) {
      check('D9 ' + c.id + ' — writes to the database', false, String(e.message).slice(0, 220));
      continue;
    }

    // authored NULL / zero must survive as SQL NULL / 0
    if (caseNo === 1) {
      check('D3 authored blank rate is stored as SQL NULL, not the inherited 6.750',
        readBack.shopping_plan.rate_conv === null, String(readBack.shopping_plan.rate_conv));
      check('D3 authored blank closing-cost percent is stored as SQL NULL, not 3.00',
        readBack.shopping_plan.closing_cost_pct === null, String(readBack.shopping_plan.closing_cost_pct));
    }
    if (caseNo === 2) {
      check('D4 an explicit zero rate is stored as 0, distinct from NULL',
        readBack.shopping_plan.rate_conv !== null && parseFloat(readBack.shopping_plan.rate_conv) === 0,
        String(readBack.shopping_plan.rate_conv));
      check('D4 an explicit zero closing-cost percent is stored as 0',
        readBack.shopping_plan.closing_cost_pct !== null && parseFloat(readBack.shopping_plan.closing_cost_pct) === 0,
        String(readBack.shopping_plan.closing_cost_pct));
    }
    if (caseNo === 7) {
      check('D6 a concession authored before a price is stored on the scenario with NO round created',
        parseFloat(readBack.property_scenario.offer_concession_value) === 5000 &&
        readBack.property_scenario.offer_concession_unit === 'amount' &&
        readBack.negotiation_rounds.length === 0,
        JSON.stringify({ v: readBack.property_scenario.offer_concession_value, r: readBack.negotiation_rounds.length }));
    }
    if (caseNo === 8) {
      check('D6 a percent concession with no price is retained as (2, percent), not zeroed',
        parseFloat(readBack.property_scenario.offer_concession_value) === 2 &&
        readBack.property_scenario.offer_concession_unit === 'percent',
        JSON.stringify(readBack.property_scenario.offer_concession_value));
    }
    if (caseNo === 9) {
      check('D7 negotiation mode survives with no round',
        readBack.property_scenario.negotiation_mode === 'reduction' && readBack.negotiation_rounds.length === 0);
    }
    if (caseNo === 10) {
      check('D8 both rounds persist with their prices and the buyer round keeps its mode',
        readBack.negotiation_rounds.length === 2 &&
        parseFloat(readBack.negotiation_rounds[0].price) === 485000 &&
        readBack.negotiation_rounds[0].negotiation_mode === 'split' &&
        readBack.negotiation_rounds[1].negotiation_mode === null,
        JSON.stringify(readBack.negotiation_rounds.map(r => [r.actor, r.price, r.negotiation_mode])));
    }

    // ---------- D9 canonical A -> DB -> canonical B ----------
    const restored = map.deserialize(readBack, before.model.presentation, before.model.ui_state);
    const after = await page.evaluate(m => {
      BSEModel.apply(m);
      return { model: JSON.parse(JSON.stringify(BSEModel.capture())),
               summary: BSEModel.buildResultSummary() };
    }, restored);

    const authoredOf = m => JSON.stringify({
      buyer_profile: m.buyer_profile, shopping_plan: m.shopping_plan,
      property_scenario: m.property_scenario, negotiation_rounds: m.negotiation_rounds
    });
    const a = authoredOf(before.model), b = authoredOf(after.model);
    let firstDiff = '';
    if (a !== b) {
      const A = JSON.parse(a), B = JSON.parse(b);
      for (const k of Object.keys(A)) {
        if (JSON.stringify(A[k]) !== JSON.stringify(B[k])) {
          firstDiff = k + '\n          A: ' + JSON.stringify(A[k]).slice(0, 260) +
                          '\n          B: ' + JSON.stringify(B[k]).slice(0, 260);
          break;
        }
      }
    }
    check('D9 ' + c.id + ' — canonical A -> database -> canonical B is identity for authored state',
      a === b, firstDiff);

    check('D10 ' + c.id + ' — load recomputes; the false cache had no effect',
      JSON.stringify(after.summary) !== JSON.stringify(map.authored(null)) &&
      after.summary.recommended_program === before.summary.recommended_program &&
      String(after.summary.piti) === String(before.summary.piti) &&
      after.summary.assumption_set_version === '2026.07-baseline',
      JSON.stringify({ before: before.summary.piti, after: after.summary.piti }));
  }

  // ---------- D2 cross-user isolation ----------
  const victimId = ids(1)[0];
  await asUser(db, USER_A, async () => {
    await db.query(insert('buyer_profile', {
      id: victimId, owner_user_id: USER_A, display_name: 'Private buyer',
      qualifying_income_monthly: 9500, monthly_debts: 650, own_funds: 40000, gift_funds: 0
    }));
  });
  const denial = await asUser(db, USER_B, async () => {
    const sel = (await db.query('select * from buyer_profile where id=$1', [victimId])).rows.length;
    const upd = (await db.query("update buyer_profile set display_name='hacked' where id=$1", [victimId])).rowCount;
    const del = (await db.query('delete from buyer_profile where id=$1', [victimId])).rowCount;
    const allVisible = (await db.query('select count(*)::int c from buyer_profile')).rows[0].c;
    return { sel, upd, del, allVisible };
  });
  // the forged INSERT aborts its transaction, so it needs its own
  let insertBlocked = false;
  try {
    await asUser(db, USER_B, async () => {
      await db.query(insert('buyer_profile', {
        id: uuid(), owner_user_id: USER_A, display_name: 'forged',
        qualifying_income_monthly: 1, monthly_debts: 0, own_funds: 0, gift_funds: 0
      }));
    });
  } catch (e) { insertBlocked = /row-level security/i.test(e.message); }
  denial.insertBlocked = insertBlocked;

  check('D2 a second authenticated user cannot SELECT another user\'s buyer', denial.sel === 0, JSON.stringify(denial));
  check('D2 …cannot UPDATE it', denial.upd === 0, JSON.stringify(denial));
  check('D2 …cannot DELETE it', denial.del === 0, JSON.stringify(denial));
  check('D2 …cannot INSERT a row owned by someone else (WITH CHECK)', denial.insertBlocked, JSON.stringify(denial));
  check('D2 …sees zero of the other user\'s rows at all', denial.allVisible === 0, JSON.stringify(denial));

  const ownerSees = await asUser(db, USER_A, async () =>
    (await db.query('select count(*)::int c from buyer_profile where id=$1', [victimId])).rows[0].c);
  check('D2 the owning user still sees their own record', ownerSees === 1);

  // ---------- D8 / D5 constraint enforcement ----------
  // Each attempt runs in its own transaction: a failed statement aborts the
  // surrounding transaction, so they cannot share one.
  const anyScenarioId = (await asUser(db, USER_A, async () =>
    (await db.query('select id from property_scenario limit 1')).rows[0].id));

  async function expectViolation(label, sql, params, pattern) {
    let msg = null;
    try {
      await asUser(db, USER_A, async () => { await db.query(sql, params); });
    } catch (e) { msg = e.message; }
    check(label, msg !== null && pattern.test(msg), msg ? msg.slice(0, 160) : 'the statement SUCCEEDED');
  }

  await expectViolation('D8 the database refuses a negotiation_round with no price',
    'insert into negotiation_round (owner_user_id, property_scenario_id, round_number, actor) values ($1,$2,99,$3)',
    [USER_A, anyScenarioId, 'buyer'], /null value in column "price"|not-null/i);
  await expectViolation('D8 the database refuses a negotiation_round with a zero price',
    'insert into negotiation_round (owner_user_id, property_scenario_id, round_number, actor, price) values ($1,$2,98,$3,0)',
    [USER_A, anyScenarioId, 'buyer'], /round_price_positive/i);
  await expectViolation('D5 the database refuses to split a down-payment (value, unit) pair — C-4a made impossible to persist',
    'update property_scenario set dp_target_value=20, dp_target_unit=null where id=$1',
    [anyScenarioId], /scenario_dp_pair_intact/);
  await expectViolation('D5 the database refuses to split a concession (value, unit) pair',
    'update property_scenario set offer_concession_value=5000, offer_concession_unit=null where id=$1',
    [anyScenarioId], /scenario_concession_pair_intact/);
  await expectViolation('D5 the database refuses a three-state cost field with a value but no "known" status',
    "update shopping_plan set hoa_monthly=250, hoa_status='confirmed_none' where owner_user_id=$1",
    [USER_A], /plan_hoa_three_state/);
  await expectViolation('D8 the database refuses an fl_millage scenario with no closing date',
    "update property_scenario set tax_method='fl_millage' where id=$1",
    [anyScenarioId], /fl_millage_requires_closing_date/);
  // the status change and the delete must be separate statements: inside one
  // CTE the DELETE would still see the pre-update snapshot
  await asUser(db, USER_A, async () => {
    await db.query("update property_scenario set status='presented' where id=$1", [anyScenarioId]);
  });
  await expectViolation('D8 a presented scenario cannot be hard-deleted (soft-delete rule)',
    'delete from property_scenario where id=$1', [anyScenarioId], /not hard-deletable|draft/i);

  // ---------- D11 assumption sets are immutable ----------
  let updBlocked = false, delBlocked = false;
  try { await db.query("update program_assumption_set set notes='edited' where version_label='2026.07-baseline'"); }
  catch (e) { updBlocked = /INSERT-only/.test(e.message); }
  try { await db.query("delete from program_assumption_set where version_label='2026.07-baseline'"); }
  catch (e) { delBlocked = /INSERT-only/.test(e.message); }
  check('D11 the assumption set cannot be updated or deleted (M-9)', updBlocked && delBlocked);

  check('D-ERR no JavaScript errors in the application during any round trip', pageErrors.length === 0, pageErrors.join(' | '));

  await browser.close();
  await db.end();
  console.log('\n=========================================================');
  console.log('  PERSISTENCE — SCHEMA / RLS / ROUND TRIP (Gate C)');
  console.log('  round-trip cases: ' + CASES.length);
  console.log('  PASS ' + pass + '   FAIL ' + fail);
  if (failures.length) failures.forEach(f => console.log('   - ' + f));
  console.log('=========================================================');
  process.exit(fail ? 1 : 0);
})();
