#!/usr/bin/env python3
"""BSE Phase 3 Gate C — client persistence layer.

Additive: one inserted block plus one appended boot call. No existing
function is modified. The Engine, gatherInputs, recalc, BSEModel and
BSEState are untouched.

The canonical <-> row mapping lives HERE, in the application, as the single
source of truth. tests/persistence-db.test.js calls it inside the page and
writes the result to a real PostgreSQL database, so the same code that runs
against Supabase is the code under test.
"""
import sys, hashlib

PATH = sys.argv[1]
EXPECT_MD5 = "90bcc96f62feb7f90c34c8407ddeacd0"   # Gate B.75 output

src = open(PATH, encoding="utf-8").read()
before = hashlib.md5(src.encode("utf-8")).hexdigest()
if before != EXPECT_MD5:
    sys.exit("REFUSING: source md5 %s != expected Gate B.75 baseline %s" % (before, EXPECT_MD5))

ANCHOR = "function init(){"

INSERT = r"""/* =====================================================================
   SUPABASE PERSISTENCE — Phase 3 Gate C

   Contracts this layer is built to, all locked in earlier gates:

     • BSEModel is the authoritative economic state. Nothing here reads an
       economic value from the DOM.
     • Authored NULL is written as SQL NULL. A resolved default is never
       written to an authored column — resolve() is not called in this file.
     • result_summary is CACHE ONLY. It is written from a separate recompute,
       is never returned into canonical state, and never feeds a calculation.
     • A negotiation_round is emitted only when a price exists. Scenario-level
       negotiation intent needs no round.
     • Persistence never runs from recalc(). A user edit updates canonical
       state, recalculates immediately, and schedules a debounced save.
     • M-10: the library is loaded lazily. If it cannot load, or no one is
       signed in, the tool runs exactly as before in unauthenticated no-save
       mode. The offline property is preserved for everyone who never signs in.

   The URL and publishable key below are PUBLIC client values. Security comes
   from Supabase Auth plus the row-level security policies in
   supabase/migrations/0001_bse_schema.sql — never from anything in this file.
   A service-role key must never appear here.
   ===================================================================== */
const BSE_SUPABASE = Object.freeze({
  url: 'https://oxvtuvoqulphgycgixg.supabase.co',
  publishableKey: 'sb_publishable_TNOuVKFrd0VMkyEOic2V-Q_wtNRrHnP',
  libraryUrl: 'https://esm.sh/@supabase/supabase-js@2'
});

const BSEPersistence = (function(){

  const AUTOSAVE_DEBOUNCE_MS = 1500;
  let db = null;              // transport; injectable for testing
  let session = null;
  let ctx = null;             // the record ids this browser is bound to
  let assumptionSetId = null;
  let revision = 0;           // monotonic client revision — stale-write guard
  let savedRevision = 0;
  let inFlight = false, pending = false;
  let debounceTimer = null;
  let lastError = null;
  let state = 'no-save';      // no-save | signed-out | idle | saving | saved | failed
  let booted = false;         // boot() has reached a terminal state
  let transportInjected = false;  // a transport was installed outside boot()

  /* ---------------- serialization: canonical model -> database rows ---------------- */
  const authored = v => (v === undefined || v === '') ? null : v;

  function serializeRows(model, c, resultSummaryCache){
    const b = model.buyer_profile, s = model.shopping_plan,
          p = model.property, sc = model.property_scenario;
    return {
      buyer_profile: {
        id: c.buyer_profile_id, owner_user_id: c.owner_user_id, organization_id: null,
        display_name: b.display_name || c.display_name || 'Untitled buyer',
        reference_code: authored(b.reference_code),
        qualifying_income_monthly: b.qualifying_income_monthly,
        monthly_debts: b.monthly_debts, credit_score: authored(b.credit_score),
        own_funds: b.own_funds, gift_funds: b.gift_funds,
        is_first_time_buyer: b.is_first_time_buyer, va_eligible: b.va_eligible,
        va_use: authored(b.va_use), va_funding_fee_exempt: b.va_funding_fee_exempt,
        dti_override_enabled: b.dti_override_enabled,
        dti_override_front: authored(b.dti_override_front),
        dti_override_back: authored(b.dti_override_back),
        dti_override_source: authored(b.dti_override_source),
        homestead_intent: authored(b.homestead_intent),
        prior_homestead_market_value: authored(b.prior_homestead_market_value),
        prior_homestead_assessed_value: authored(b.prior_homestead_assessed_value),
        portability_eligible: b.portability_eligible, status: b.status || 'active'
      },
      shopping_plan: {
        id: c.shopping_plan_id, owner_user_id: c.owner_user_id, organization_id: null,
        buyer_profile_id: c.buyer_profile_id,
        plan_label: s.plan_label, is_active: s.is_active, target_payment: s.target_payment,
        dp_target_value: authored(s.dp_target_value), dp_target_unit: authored(s.dp_target_unit),
        planned_stay_years: s.planned_stay_years, buyer_priority: s.buyer_priority,
        tax_method: s.tax_method,
        tax_rate_pct: authored(s.tax_rate_pct), tax_annual_amount: authored(s.tax_annual_amount),
        tax_input_unit: s.tax_input_unit, hoi_monthly: authored(s.hoi_monthly),
        hoa_monthly: authored(s.hoa_monthly), hoa_status: s.hoa_status,
        cdd_monthly: authored(s.cdd_monthly), cdd_status: s.cdd_status,
        flood_monthly: authored(s.flood_monthly), flood_status: s.flood_status,
        // authored NULL, never the inherited default
        rate_conv: authored(s.rate_conv), rate_fha: authored(s.rate_fha), rate_va: authored(s.rate_va),
        closing_cost_pct: authored(s.closing_cost_pct),
        assumption_set_id: c.assumption_set_id
      },
      property: {
        id: c.property_id, owner_user_id: c.owner_user_id, organization_id: null,
        buyer_profile_id: c.buyer_profile_id,
        label: p.label || c.property_label || 'Untitled property',
        address_line1: authored(p.address_line1), address_line2: authored(p.address_line2),
        city: authored(p.city), state: p.state || 'FL', postal_code: authored(p.postal_code),
        county: authored(p.county), property_type: authored(p.property_type),
        mls_number: authored(p.mls_number), status: p.status || 'active'
      },
      property_scenario: {
        id: c.property_scenario_id, owner_user_id: c.owner_user_id, organization_id: null,
        property_id: c.property_id, buyer_profile_id: c.buyer_profile_id,
        shopping_plan_id: c.shopping_plan_id, parent_scenario_id: null,
        scenario_label: sc.scenario_label, analysis_mode: sc.analysis_mode,
        list_price: authored(sc.list_price),
        hoi_monthly: authored(sc.hoi_monthly),
        hoa_monthly: authored(sc.hoa_monthly), hoa_status: authored(sc.hoa_status),
        cdd_monthly: authored(sc.cdd_monthly), cdd_status: authored(sc.cdd_status),
        flood_monthly: authored(sc.flood_monthly), flood_status: authored(sc.flood_status),
        rate_conv: authored(sc.rate_conv), rate_fha: authored(sc.rate_fha), rate_va: authored(sc.rate_va),
        closing_cost_pct: authored(sc.closing_cost_pct),
        closing_cost_override_amount: authored(sc.closing_cost_override_amount),
        target_payment: authored(sc.target_payment),
        dp_target_value: authored(sc.dp_target_value), dp_target_unit: authored(sc.dp_target_unit),
        planned_stay_years: authored(sc.planned_stay_years),
        buyer_priority: authored(sc.buyer_priority),
        dti_override_enabled: authored(sc.dti_override_enabled),
        dti_override_front: authored(sc.dti_override_front),
        dti_override_back: authored(sc.dti_override_back),
        dti_override_source: authored(sc.dti_override_source),
        negotiation_mode: sc.negotiation_mode,
        offer_concession_value: authored(sc.offer_concession_value),
        offer_concession_unit: authored(sc.offer_concession_unit),
        closing_date: authored(sc.closing_date), occupancy_date: authored(sc.occupancy_date),
        tax_method: authored(sc.tax_method), tax_method_version: authored(sc.tax_method_version),
        tax_inputs: sc.tax_inputs || null, tax_outputs: sc.tax_outputs || null,
        qualifying_tax_basis: sc.qualifying_tax_basis,
        assumption_set_id: c.assumption_set_id,
        assumption_overrides: sc.assumption_overrides || null,
        engine_version: sc.engine_version, resolved_inputs: null,
        // CACHE ONLY — supplied separately, never derived from canonical state
        result_summary: resultSummaryCache || null,
        results_computed_at: resultSummaryCache ? new Date().toISOString() : null,
        status: sc.status, is_accepted_property: sc.is_accepted_property
      },
      // a round is emitted ONLY when a price exists
      negotiation_rounds: (model.negotiation_rounds || [])
        .filter(r => r.price !== null && r.price !== undefined && r.price > 0)
        .map(r => ({
          owner_user_id: c.owner_user_id, organization_id: null,
          property_scenario_id: c.property_scenario_id,
          round_number: r.round_number, actor: r.actor, price: r.price,
          concession_value: authored(r.concession_value), concession_unit: authored(r.concession_unit),
          negotiation_mode: r.actor === 'buyer' ? authored(r.negotiation_mode) : null,
          loan_program_override: authored(r.loan_program_override),
          manual_split_buydown: authored(r.manual_split_buydown),
          manual_split_costs: authored(r.manual_split_costs),
          manual_split_enabled: !!r.manual_split_enabled,
          is_accepted: !!r.is_accepted, note: authored(r.note)
        }))
    };
  }

  /* ---------------- deserialization: rows -> canonical model ----------------
     numeric() arrives as a string over the wire; canonical state holds numbers.
     result_summary is deliberately NOT carried back into canonical state. */
  const n = v => (v === null || v === undefined) ? null : (typeof v === 'number' ? v : parseFloat(v));
  const dt = v => (v === null || v === undefined) ? null
                : (typeof v === 'string' ? v.slice(0,10) : new Date(v).toISOString().slice(0,10));

  function deserializeRows(rows, presentation, uiState){
    const b = rows.buyer_profile, s = rows.shopping_plan,
          p = rows.property, sc = rows.property_scenario;
    return {
      schema: BSEModel.SCHEMA, engine_version: sc.engine_version,
      assumption_set: { version_label: rows.assumption_set_version, is_current: true },
      buyer_profile: {
        display_name: b.display_name, reference_code: b.reference_code,
        qualifying_income_monthly: n(b.qualifying_income_monthly),
        monthly_debts: n(b.monthly_debts), credit_score: n(b.credit_score),
        own_funds: n(b.own_funds), gift_funds: n(b.gift_funds),
        is_first_time_buyer: b.is_first_time_buyer, va_eligible: b.va_eligible,
        va_use: b.va_use, va_funding_fee_exempt: b.va_funding_fee_exempt,
        dti_override_enabled: b.dti_override_enabled,
        dti_override_front: n(b.dti_override_front), dti_override_back: n(b.dti_override_back),
        dti_override_source: b.dti_override_source, homestead_intent: b.homestead_intent,
        prior_homestead_market_value: n(b.prior_homestead_market_value),
        prior_homestead_assessed_value: n(b.prior_homestead_assessed_value),
        portability_eligible: b.portability_eligible, status: b.status
      },
      shopping_plan: {
        plan_label: s.plan_label, is_active: s.is_active, target_payment: n(s.target_payment),
        dp_target_value: n(s.dp_target_value), dp_target_unit: s.dp_target_unit,
        planned_stay_years: s.planned_stay_years, buyer_priority: s.buyer_priority,
        tax_method: s.tax_method, tax_rate_pct: n(s.tax_rate_pct),
        tax_annual_amount: n(s.tax_annual_amount), tax_input_unit: s.tax_input_unit,
        hoi_monthly: n(s.hoi_monthly),
        hoa_monthly: n(s.hoa_monthly), hoa_status: s.hoa_status,
        cdd_monthly: n(s.cdd_monthly), cdd_status: s.cdd_status,
        flood_monthly: n(s.flood_monthly), flood_status: s.flood_status,
        rate_conv: n(s.rate_conv), rate_fha: n(s.rate_fha), rate_va: n(s.rate_va),
        closing_cost_pct: n(s.closing_cost_pct),
        assumption_set_version: rows.assumption_set_version
      },
      property: {
        label: p.label, address_line1: p.address_line1, address_line2: p.address_line2,
        city: p.city, state: p.state, postal_code: p.postal_code, county: p.county,
        property_type: p.property_type, mls_number: p.mls_number, status: p.status
      },
      property_scenario: {
        scenario_label: sc.scenario_label, analysis_mode: sc.analysis_mode,
        list_price: n(sc.list_price), tax_method: sc.tax_method,
        hoi_monthly: n(sc.hoi_monthly),
        hoa_monthly: n(sc.hoa_monthly), hoa_status: sc.hoa_status,
        cdd_monthly: n(sc.cdd_monthly), cdd_status: sc.cdd_status,
        flood_monthly: n(sc.flood_monthly), flood_status: sc.flood_status,
        rate_conv: n(sc.rate_conv), rate_fha: n(sc.rate_fha), rate_va: n(sc.rate_va),
        closing_cost_pct: n(sc.closing_cost_pct),
        closing_cost_override_amount: n(sc.closing_cost_override_amount),
        target_payment: n(sc.target_payment),
        dp_target_value: n(sc.dp_target_value), dp_target_unit: sc.dp_target_unit,
        planned_stay_years: sc.planned_stay_years, buyer_priority: sc.buyer_priority,
        dti_override_enabled: sc.dti_override_enabled,
        dti_override_front: n(sc.dti_override_front), dti_override_back: n(sc.dti_override_back),
        dti_override_source: sc.dti_override_source,
        negotiation_mode: sc.negotiation_mode,
        offer_concession_value: n(sc.offer_concession_value),
        offer_concession_unit: sc.offer_concession_unit,
        closing_date: dt(sc.closing_date), occupancy_date: dt(sc.occupancy_date),
        tax_inputs: sc.tax_inputs, tax_outputs: sc.tax_outputs,
        tax_method_version: sc.tax_method_version,
        qualifying_tax_basis: sc.qualifying_tax_basis,
        assumption_set_version: rows.assumption_set_version,
        assumption_overrides: sc.assumption_overrides,
        engine_version: sc.engine_version,
        status: sc.status, is_accepted_property: sc.is_accepted_property
      },
      negotiation_rounds: (rows.negotiation_rounds || []).map(r => ({
        round_number: r.round_number, actor: r.actor, price: n(r.price),
        concession_value: n(r.concession_value), concession_unit: r.concession_unit,
        negotiation_mode: r.negotiation_mode, loan_program_override: r.loan_program_override,
        manual_split_buydown: n(r.manual_split_buydown), manual_split_costs: n(r.manual_split_costs),
        manual_split_enabled: r.manual_split_enabled, is_accepted: r.is_accepted, note: r.note
      })),
      ui_state: uiState || null,
      presentation: presentation
    };
  }

  /* ---------------- transport ---------------- */
  function supabaseTransport(client){
    return {
      kind: 'supabase',
      async getSession(){ const { data } = await client.auth.getSession(); return data.session || null; },
      async signIn(email){
        const { error } = await client.auth.signInWithOtp({
          email: email, options: { emailRedirectTo: window.location.origin + window.location.pathname }
        });
        if(error) throw error; return true;
      },
      async signOut(){ await client.auth.signOut(); },
      onAuthChange(fn){ client.auth.onAuthStateChange((_e, s) => fn(s)); },
      async currentAssumptionSetId(){
        const { data, error } = await client.from('program_assumption_set')
          .select('id,version_label').eq('is_current', true).limit(1);
        if(error) throw error;
        return data && data[0] ? data[0] : null;
      },
      async save(rows){
        // Order matters: parents before children.
        for(const [table, payload] of [['buyer_profile', rows.buyer_profile],
                                       ['shopping_plan', rows.shopping_plan],
                                       ['property', rows.property],
                                       ['property_scenario', rows.property_scenario]]){
          const { error } = await client.from(table).upsert(payload, { onConflict: 'id' });
          if(error) throw error;
        }
        /* Rounds are UPSERTED on their natural key (property_scenario_id,
           round_number), never deleted and re-inserted. Delete-and-reinsert
           would be rejected by bse_round_delete_guard the moment the scenario
           leaves 'draft', which would make every later autosave fail — the
           soft-delete rule exists precisely so a round a client was shown
           cannot be silently replaced. Round identity is therefore stable
           across saves. */
        if(rows.negotiation_rounds.length){
          const { error } = await client.from('negotiation_round')
            .upsert(rows.negotiation_rounds, { onConflict: 'property_scenario_id,round_number' });
          if(error) throw error;
        }
        /* Only rounds the buyer has actually withdrawn are removed, and only
           the surplus ones. If the scenario is no longer a draft the database
           refuses, and that refusal is surfaced rather than swallowed. */
        const highest = rows.negotiation_rounds.reduce((m, r) => Math.max(m, r.round_number), 0);
        const { error: delErr } = await client.from('negotiation_round')
          .delete().eq('property_scenario_id', rows.property_scenario.id).gt('round_number', highest);
        if(delErr) throw delErr;
        return true;
      },
      async load(buyerProfileId){
        const one = async (table, col, val) => {
          const { data, error } = await client.from(table).select('*').eq(col, val).limit(1);
          if(error) throw error; return data && data[0] ? data[0] : null;
        };
        const bp = await one('buyer_profile', 'id', buyerProfileId);
        if(!bp) return null;
        const sp = await one('shopping_plan', 'buyer_profile_id', buyerProfileId);
        const pr = await one('property', 'buyer_profile_id', buyerProfileId);
        const sc = pr ? await one('property_scenario', 'property_id', pr.id) : null;
        let rounds = [];
        if(sc){
          const { data, error } = await client.from('negotiation_round')
            .select('*').eq('property_scenario_id', sc.id).order('round_number');
          if(error) throw error; rounds = data || [];
        }
        const asRow = await this.currentAssumptionSetId();
        return { buyer_profile: bp, shopping_plan: sp, property: pr, property_scenario: sc,
                 negotiation_rounds: rounds,
                 assumption_set_version: asRow ? asRow.version_label : null };
      },
      async listBuyers(){
        const { data, error } = await client.from('buyer_profile')
          .select('id,display_name,updated_at').eq('status','active').order('updated_at', { ascending: false });
        if(error) throw error; return data || [];
      }
    };
  }

  /* ---------------- save status ---------------- */
  const LABEL = { 'no-save':'Not connected', 'signed-out':'Sign in to save',
                  idle:'Saved', saving:'Saving…', saved:'Saved',
                  failed:'Save failed', 'signin-failed':'Sign-in failed' };
  /* A sign-in failure and a save failure are different events and must not
     share a message. "Save failed" while the buyer is trying to sign in is
     both wrong and alarming — nothing was being saved. */
  function setState(s, err){
    state = s; lastError = err || null;
    const el = document.getElementById('bseSaveStatus');
    if(!el) return;
    const reason = err ? String(err.message || err) : '';
    el.textContent = (s === 'failed' && err)        ? ('Save failed — ' + reason)
                   : (s === 'signin-failed' && err) ? ('Sign-in failed — ' + reason)
                   : LABEL[s];
    el.className = 'bse-save ' + (s === 'signin-failed' ? 'failed' : s);
    el.title = s === 'failed'        ? 'Your work is still here. Fix the connection and press Save.'
             : s === 'signin-failed' ? 'Your work is still here. You can keep using the tool without an account.'
             : s === 'no-save'       ? 'Saving is unavailable — the tool is working normally and nothing has been lost.'
             : '';
  }

  /* ---------------- save / load ---------------- */
  function newId(){
    return (crypto && crypto.randomUUID) ? crypto.randomUUID()
      : 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () =>
          Math.floor(Math.random()*16).toString(16));
  }

  /* The assumption set lives on a reference table granted to `authenticated`
     only. It therefore CANNOT be read before someone signs in, and nothing on
     the pre-authentication path is allowed to depend on it. It is resolved
     lazily, once, on the first save after a session exists. */
  async function ensureAssumptionSet(){
    if(assumptionSetId) return assumptionSetId;
    if(!db || !session) return null;
    const row = await db.currentAssumptionSetId();
    assumptionSetId = row ? row.id : null;
    return assumptionSetId;
  }

  function ensureCtx(){
    // A ctx built before the assumption set resolved must pick it up, or the
    // NOT NULL column would be written as null.
    if(ctx){ if(!ctx.assumption_set_id) ctx.assumption_set_id = assumptionSetId; return ctx; }
    ctx = { owner_user_id: session && session.user ? session.user.id : null,
            buyer_profile_id: newId(), shopping_plan_id: newId(),
            property_id: newId(), property_scenario_id: newId(),
            assumption_set_id: assumptionSetId,
            display_name: 'Buyer ' + new Date().toISOString().slice(0,10),
            property_label: 'Property 1' };
    return ctx;
  }

  /* Single-flight with a queued latest state. If a save is requested while one
     is in flight, the newest canonical state is captured AFTER the in-flight
     write completes, so an older snapshot can never land on top of a newer one.
     The client revision counter records which snapshot won. */
  async function saveNow(){
    if(!db) { setState('no-save'); return { ok:false, reason:'no transport' }; }
    if(!session){ setState('signed-out'); return { ok:false, reason:'not authenticated' }; }
    if(inFlight){ pending = true; return { ok:true, queued:true }; }
    inFlight = true;
    const rev = ++revision;
    setState('saving');
    try {
      await ensureAssumptionSet();      // requires a session; safe here, not at boot
      const model = BSEModel.capture();
      const summary = BSEModel.buildResultSummary();   // recomputed, cache only
      const rows = serializeRows(model, ensureCtx(), summary);
      await db.save(rows);
      savedRevision = rev;
      inFlight = false;
      if(pending){ pending = false; return saveNow(); }
      setState('saved');
      return { ok:true, revision: rev };
    } catch(e){
      inFlight = false;
      setState('failed', e);
      return { ok:false, error: String(e.message || e) };   // in-memory state untouched
    }
  }

  async function load(buyerProfileId){
    if(!db) return { ok:false, reason:'no transport' };
    if(!session) return { ok:false, reason:'not authenticated' };
    const rows = await db.load(buyerProfileId);
    if(!rows || !rows.buyer_profile) return { ok:false, reason:'not found' };
    const cachedSummary = rows.property_scenario ? rows.property_scenario.result_summary : null;

    // The presentation payload is rebuilt from the AUTHORED values, never from
    // stored display strings, so the canonical (value, unit) pairs govern.
    const model = deserializeRows(rows, presentationFrom(rows), null);
    BSEModel.apply(model);                 // canonical restore; no unit handler fires
    const recomputed = BSEModel.buildResultSummary();   // recompute always wins

    ctx = { owner_user_id: session.user.id,
            buyer_profile_id: rows.buyer_profile.id,
            shopping_plan_id: rows.shopping_plan ? rows.shopping_plan.id : newId(),
            property_id: rows.property ? rows.property.id : newId(),
            property_scenario_id: rows.property_scenario ? rows.property_scenario.id : newId(),
            assumption_set_id: assumptionSetId,
            display_name: rows.buyer_profile.display_name,
            property_label: rows.property ? rows.property.label : 'Property 1' };
    setState('saved');
    return { ok:true, result_summary: recomputed, cache_discarded: cachedSummary,
             cache_agreed_with_recompute: cachedSummary
               ? (cachedSummary.recommended_program === recomputed.recommended_program &&
                  Math.abs((cachedSummary.piti||0) - (recomputed.piti||0)) < 0.005)
               : null,
             authoritative_source: 'recomputed' };
  }

  /* Rebuild the Gate A presentation payload from authored values only. */
  function presentationFrom(rows){
    const s = rows.shopping_plan || {}, sc = rows.property_scenario || {};
    const U = { percent:'pct', amount:'dollar' };
    const dpUnit  = sc.dp_target_unit || s.dp_target_unit || null;
    const dpValue = sc.dp_target_unit ? sc.dp_target_value : s.dp_target_value;
    const taxUnit = s.tax_input_unit || 'percent';
    const taxVal  = taxUnit === 'percent' ? s.tax_rate_pct : s.tax_annual_amount;
    const concUnit = sc.offer_concession_unit || null;
    const concVal  = sc.offer_concession_value;
    const buyer = (rows.negotiation_rounds || []).filter(r => r.actor === 'buyer')[0] || null;
    const seller = (rows.negotiation_rounds || []).filter(r => r.actor === 'seller')[0] || null;
    const str = v => (v === null || v === undefined) ? '' : String(v);
    const fields = {
      price: str(sc.list_price), score: str(rows.buyer_profile.credit_score),
      ownFunds: str(rows.buyer_profile.own_funds), gift: str(rows.buyer_profile.gift_funds),
      dpTarget: str(dpValue), target: str(s.target_payment),
      income: str(rows.buyer_profile.qualifying_income_monthly),
      debts: str(rows.buyer_profile.monthly_debts), stay: str(s.planned_stay_years),
      priority: s.buyer_priority, rateConv: str(s.rate_conv), rateFha: str(s.rate_fha),
      rateVa: str(s.rate_va), ccPct: str(s.closing_cost_pct),
      ccOverride: str(sc.closing_cost_override_amount), taxRate: str(taxVal),
      hoi: str(s.hoi_monthly), hoa: str(s.hoa_monthly), cdd: str(s.cdd_monthly),
      flood: str(s.flood_monthly), offerConc: str(concVal),
      offerPrice: buyer ? str(buyer.price) : '',
      counterPrice: seller ? str(seller.price) : '',
      counterConc: seller ? str(seller.concession_value) : '',
      counterLoan: seller && seller.loan_program_override ? seller.loan_program_override : 'auto',
      vaUse: rows.buyer_profile.va_use || 'first'
    };
    const out = { version: BSEState.VERSION, fields: {}, units: {
      dp: U[dpUnit] || 'pct', tax: U[taxUnit] || 'pct',
      offerConc: U[concUnit] || 'dollar',
      counterConc: seller && seller.concession_unit ? U[seller.concession_unit] : 'dollar'
    }, canonical: {
      dp:  { value: str(dpValue), unit: U[dpUnit] || 'pct' },
      tax: { value: str(taxVal),  unit: U[taxUnit] || 'pct' },
      offerConc:   { value: str(concVal), unit: U[concUnit] || 'dollar' },
      counterConc: { value: seller ? str(seller.concession_value) : '',
                     unit: seller && seller.concession_unit ? U[seller.concession_unit] : 'dollar' }
    }};
    Object.keys(fields).forEach(k => { out.fields[k] = { value: fields[k] }; });
    out.fields.hoaNA   = { checked: (sc.hoa_status || s.hoa_status) === 'confirmed_none' };
    out.fields.cddNA   = { checked: (sc.cdd_status || s.cdd_status) === 'confirmed_none' };
    out.fields.floodNA = { checked: (sc.flood_status || s.flood_status) === 'confirmed_none' };
    out.fields.tgFthb  = { checked: !!rows.buyer_profile.is_first_time_buyer };
    out.fields.tgVa    = { checked: !!rows.buyer_profile.va_eligible };
    out.fields.vaExempt= { checked: !!rows.buyer_profile.va_funding_fee_exempt };
    out.fields['name:negMode'] = { value: sc.negotiation_mode || 'concession' };
    return out;
  }

  /* ---------------- autosave: NEVER from recalc() ----------------
     A user edit updates canonical state and recalculates immediately; the save
     is scheduled separately on its own listener and debounced. */
  function scheduleSave(){
    if(!session || !db) return;
    if(debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => { debounceTimer = null; saveNow(); }, AUTOSAVE_DEBOUNCE_MS);
  }

  function attachAutosave(){
    document.querySelectorAll('input,select').forEach(el => {
      el.addEventListener('input', scheduleSave);
      el.addEventListener('change', scheduleSave);
    });
  }

  /* ---------------- UI: auth + save status ---------------- */
  function mountUI(){
    if(document.getElementById('bsePersistBar')) return;
    const bar = document.createElement('div');
    bar.id = 'bsePersistBar';
    bar.innerHTML =
      '<style>' +
      '#bsePersistBar{position:fixed;top:8px;right:8px;z-index:99998;display:flex;gap:6px;align-items:center;' +
      'background:#fff;border:1px solid #E2E8F0;border-radius:10px;padding:6px 10px;font-size:12px;' +
      'box-shadow:0 2px 10px rgba(0,0,0,.12);font-family:-apple-system,BlinkMacSystemFont,sans-serif}' +
      '#bsePersistBar input{border:1px solid #E2E8F0;border-radius:7px;padding:5px 7px;font-size:12px;width:170px}' +
      '#bsePersistBar button{border:1px solid #3BB1ED;background:#3BB1ED;color:#fff;border-radius:7px;' +
      'padding:5px 9px;font-size:12px;font-weight:600;cursor:pointer}' +
      '#bsePersistBar button.ghost{background:#fff;color:#3BB1ED}' +
      '.bse-save{font-weight:600;color:#6B7280}.bse-save.saving{color:#3BB1ED}.bse-save.saved{color:#4a7a1a}' +
      '.bse-save.failed{color:#B91C1C}' +
      '</style>' +
      '<span class="bse-save" id="bseSaveStatus">Not connected</span>' +
      '<input id="bseEmail" type="email" placeholder="you@example.com" autocomplete="email">' +
      '<button id="bseSignIn" type="button">Email me a link</button>' +
      '<button id="bseSave" class="ghost" type="button" style="display:none">Save</button>' +
      '<button id="bseSignOut" class="ghost" type="button" style="display:none">Sign out</button>';
    document.body.appendChild(bar);
    document.getElementById('bseSignIn').addEventListener('click', async () => {
      const email = (document.getElementById('bseEmail').value || '').trim();
      if(!email) return;
      /* No transport means the library never loaded. Say that plainly instead
         of dereferencing null and showing the buyer a raw TypeError. */
      if(!db){ setState('no-save'); return; }
      try { await db.signIn(email); setState(state); alert('Check ' + email + ' for the sign-in link.'); }
      catch(e){ setState('signin-failed', e); }
    });
    document.getElementById('bseSave').addEventListener('click', () => saveNow());
    document.getElementById('bseSignOut').addEventListener('click', async () => {
      await db.signOut(); session = null; ctx = null; renderAuthUI(); setState('signed-out');
    });
  }

  function renderAuthUI(){
    const signedIn = !!session;
    const g = id => document.getElementById(id);
    if(!g('bsePersistBar')) return;
    g('bseEmail').style.display  = signedIn ? 'none' : '';
    g('bseSignIn').style.display = signedIn ? 'none' : '';
    g('bseSave').style.display   = signedIn ? '' : 'none';
    g('bseSignOut').style.display= signedIn ? '' : 'none';
  }

  /* ---------------- boot ---------------- */
  async function boot(){
    mountUI();
    setState('no-save');
    /* The autosave listeners are attached unconditionally, before any network
       work. scheduleSave() is inert without a session and a transport, so this
       is safe, and it removes an ordering hazard: whether a buyer's edits are
       ever eligible for autosave must not depend on how long a CDN took to
       answer, or on whether they signed in before or after the page settled. */
    attachAutosave();
    try {
      const mod = await import(BSE_SUPABASE.libraryUrl);
      const client = mod.createClient(BSE_SUPABASE.url, BSE_SUPABASE.publishableKey);
      const transport = supabaseTransport(client);
      /* getSession() reads local storage. It is the ONLY thing boot is allowed
         to await that touches the backend surface, because everything else on
         this schema requires the `authenticated` role — and at boot nobody is
         authenticated yet. Reading the assumption set here would fail with
         "permission denied", take the catch below, and null out a transport
         that works perfectly, leaving the user unable to sign in at all.
         Sign-in must never depend on a privileged read. */
      const s = await transport.getSession();
      /* Never publish over a transport installed while we were waiting. */
      if(transportInjected){ booted = true; return; }
      db = transport; session = s;
      db.onAuthChange(s2 => { session = s2; ctx = null; assumptionSetId = null;
                              renderAuthUI(); setState(s2 ? 'idle' : 'signed-out'); });
      renderAuthUI();
      setState(session ? 'idle' : 'signed-out');
    } catch(e){
      // M-10: no library, no network, no account — the tool still works, it just
      // cannot save. Nothing about the calculation path depends on this.
      if(!transportInjected){ db = null; renderAuthUI(); setState('no-save'); }
    } finally {
      booted = true;
    }
  }

  return {
    boot: boot, saveNow: saveNow, load: load, scheduleSave: scheduleSave,
    status: () => ({ state: state, error: lastError, revision: revision,
                     savedRevision: savedRevision, authenticated: !!session,
                     booted: booted, transport: db ? db.kind : null }),
    // testing surface: inject a transport and a session without a network
    __setTransport: (t, s) => { transportInjected = true;
                                db = t; session = s || null; ctx = null;
                                assumptionSetId = t && t.assumptionSetId || null;
                                renderAuthUI(); setState(s ? 'idle' : 'signed-out'); },
    __setContext: c => { ctx = c; },
    __context: () => ctx,
    __serializeRows: (model, c, cache) => serializeRows(model, c, cache),
    __deserializeRows: (rows, presentation, ui) => deserializeRows(rows, presentation, ui),
    __presentationFrom: presentationFrom,
    AUTOSAVE_DEBOUNCE_MS: AUTOSAVE_DEBOUNCE_MS
  };
})();

window.BSEPersistence = BSEPersistence;

"""

if src.count(ANCHOR) != 1:
    sys.exit("REFUSING: init anchor matched %d times" % src.count(ANCHOR))
src = src.replace(ANCHOR, INSERT + ANCHOR)

TAIL_OLD = "\ninit();\n"
TAIL_NEW = "\ninit();\n// Gate C: persistence boots after the application, never inside it.\nBSEPersistence.boot();\n"
if src.count(TAIL_OLD) != 1:
    sys.exit("REFUSING: init() call matched %d times" % src.count(TAIL_OLD))
src = src.replace(TAIL_OLD, TAIL_NEW)

open(PATH, "w", encoding="utf-8").write(src)
print("PATCHED OK")
print("  before md5:", before)
print("  after  md5:", hashlib.md5(src.encode("utf-8")).hexdigest())
