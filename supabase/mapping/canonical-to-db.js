/* =====================================================================
   CANONICAL MODEL  <->  DATABASE ROWS
   Phase 3 Gate C — the persistence mapping.

   Pure functions. No Supabase dependency, no network, no DOM. The same
   module serves the verification harness today and the browser client
   once a Supabase project exists.

   Rules encoded here, not left to the caller:
     • authored NULL is written as SQL NULL and read back as null.
       The RESOLVED value (6.750, 3.00) is never written to an authored
       column — resolve() is not consulted anywhere in this file.
     • an explicit 0 is an authored zero and survives as 0.
     • (value, unit) pairs move together or not at all.
     • result_summary is cache only and is written from a separate
       argument, never from canonical state.
     • a negotiation_round is emitted only when a price exists.
   ===================================================================== */

const SCHEMA_VERSION = 'bse-persistence/1';

/** authored value -> column value. undefined and '' are treated as absent. */
function authored(v) {
  return (v === undefined || v === '') ? null : v;
}

function toBuyerProfileRow(model, ctx) {
  const b = model.buyer_profile;
  return {
    id: ctx.buyer_profile_id, owner_user_id: ctx.owner_user_id, organization_id: null,
    display_name: b.display_name || ctx.display_name || 'Untitled buyer',
    reference_code: authored(b.reference_code),
    qualifying_income_monthly: b.qualifying_income_monthly,
    monthly_debts: b.monthly_debts,
    credit_score: authored(b.credit_score),
    own_funds: b.own_funds,
    gift_funds: b.gift_funds,
    is_first_time_buyer: b.is_first_time_buyer,
    va_eligible: b.va_eligible,
    va_use: authored(b.va_use),
    va_funding_fee_exempt: b.va_funding_fee_exempt,
    dti_override_enabled: b.dti_override_enabled,
    dti_override_front: authored(b.dti_override_front),
    dti_override_back: authored(b.dti_override_back),
    dti_override_source: authored(b.dti_override_source),
    homestead_intent: authored(b.homestead_intent),
    prior_homestead_market_value: authored(b.prior_homestead_market_value),
    prior_homestead_assessed_value: authored(b.prior_homestead_assessed_value),
    portability_eligible: b.portability_eligible,
    status: b.status || 'active'
  };
}

function toShoppingPlanRow(model, ctx) {
  const s = model.shopping_plan;
  return {
    id: ctx.shopping_plan_id, owner_user_id: ctx.owner_user_id, organization_id: null,
    buyer_profile_id: ctx.buyer_profile_id,
    plan_label: s.plan_label, is_active: s.is_active,
    target_payment: s.target_payment,
    dp_target_value: authored(s.dp_target_value),
    dp_target_unit: authored(s.dp_target_unit),
    planned_stay_years: s.planned_stay_years,
    buyer_priority: s.buyer_priority,
    tax_method: s.tax_method,
    tax_rate_pct: authored(s.tax_rate_pct),
    tax_annual_amount: authored(s.tax_annual_amount),
    tax_input_unit: s.tax_input_unit,
    hoi_monthly: authored(s.hoi_monthly),
    hoa_monthly: authored(s.hoa_monthly), hoa_status: s.hoa_status,
    cdd_monthly: authored(s.cdd_monthly), cdd_status: s.cdd_status,
    flood_monthly: authored(s.flood_monthly), flood_status: s.flood_status,
    // authored NULL, never the inherited default
    rate_conv: authored(s.rate_conv),
    rate_fha: authored(s.rate_fha),
    rate_va: authored(s.rate_va),
    closing_cost_pct: authored(s.closing_cost_pct),
    assumption_set_id: ctx.assumption_set_id
  };
}

function toPropertyRow(model, ctx) {
  const p = model.property;
  return {
    id: ctx.property_id, owner_user_id: ctx.owner_user_id, organization_id: null,
    buyer_profile_id: ctx.buyer_profile_id,
    label: p.label || ctx.property_label || 'Untitled property',
    address_line1: authored(p.address_line1), address_line2: authored(p.address_line2),
    city: authored(p.city), state: p.state || 'FL', postal_code: authored(p.postal_code),
    county: authored(p.county), property_type: authored(p.property_type),
    mls_number: authored(p.mls_number), status: p.status || 'active'
  };
}

function toScenarioRow(model, ctx, resultSummaryCache) {
  const sc = model.property_scenario;
  return {
    id: ctx.property_scenario_id, owner_user_id: ctx.owner_user_id, organization_id: null,
    property_id: ctx.property_id, buyer_profile_id: ctx.buyer_profile_id,
    shopping_plan_id: ctx.shopping_plan_id, parent_scenario_id: null,
    scenario_label: sc.scenario_label,
    analysis_mode: sc.analysis_mode,
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
    // Gate B.75 first-class fields
    negotiation_mode: sc.negotiation_mode,
    offer_concession_value: authored(sc.offer_concession_value),
    offer_concession_unit: authored(sc.offer_concession_unit),
    closing_date: authored(sc.closing_date),
    occupancy_date: authored(sc.occupancy_date),
    tax_method: authored(sc.tax_method),
    tax_method_version: authored(sc.tax_method_version),
    tax_inputs: sc.tax_inputs ? JSON.stringify(sc.tax_inputs) : null,
    tax_outputs: sc.tax_outputs ? JSON.stringify(sc.tax_outputs) : null,
    qualifying_tax_basis: sc.qualifying_tax_basis,
    assumption_set_id: ctx.assumption_set_id,
    assumption_overrides: sc.assumption_overrides ? JSON.stringify(sc.assumption_overrides) : null,
    engine_version: sc.engine_version,
    resolved_inputs: null,
    // CACHE ONLY — supplied separately, never derived from canonical state
    result_summary: resultSummaryCache ? JSON.stringify(resultSummaryCache) : null,
    results_computed_at: resultSummaryCache ? new Date().toISOString() : null,
    status: sc.status, is_accepted_property: sc.is_accepted_property
  };
}

/** A round is emitted only when a price exists (Gate C locked decision 3). */
function toRoundRows(model, ctx) {
  return (model.negotiation_rounds || [])
    .filter(r => r.price !== null && r.price !== undefined && r.price > 0)
    .map(r => ({
      owner_user_id: ctx.owner_user_id, organization_id: null,
      property_scenario_id: ctx.property_scenario_id,
      round_number: r.round_number, actor: r.actor, price: r.price,
      concession_value: authored(r.concession_value),
      concession_unit: authored(r.concession_unit),
      negotiation_mode: r.actor === 'buyer' ? authored(r.negotiation_mode) : null,
      loan_program_override: authored(r.loan_program_override),
      manual_split_buydown: authored(r.manual_split_buydown),
      manual_split_costs: authored(r.manual_split_costs),
      manual_split_enabled: !!r.manual_split_enabled,
      is_accepted: !!r.is_accepted, note: authored(r.note)
    }));
}

function serialize(model, ctx, resultSummaryCache) {
  return {
    schema: SCHEMA_VERSION,
    buyer_profile: toBuyerProfileRow(model, ctx),
    shopping_plan: toShoppingPlanRow(model, ctx),
    property: toPropertyRow(model, ctx),
    property_scenario: toScenarioRow(model, ctx, resultSummaryCache),
    negotiation_rounds: toRoundRows(model, ctx)
  };
}

/* ---------------------------------------------------------------- read back */

// numeric(x,y) arrives from pg as a string; JS canonical state holds numbers.
const n = v => (v === null || v === undefined) ? null : (typeof v === 'number' ? v : parseFloat(v));
const d = v => {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') return v.slice(0, 10);
  return v.toISOString().slice(0, 10);
};

/** Database rows -> the canonical model shape BSEModel.apply() consumes.
    `presentation` is the Gate A canonical unit payload, reconstructed by the
    caller from the authored values (never from stored display strings). */
function deserialize(rows, presentation, uiState) {
  const b = rows.buyer_profile, s = rows.shopping_plan, p = rows.property, sc = rows.property_scenario;
  return {
    schema: 'bse-canonical-state/1',
    engine_version: sc.engine_version,
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
      dti_override_source: b.dti_override_source,
      homestead_intent: b.homestead_intent,
      prior_homestead_market_value: n(b.prior_homestead_market_value),
      prior_homestead_assessed_value: n(b.prior_homestead_assessed_value),
      portability_eligible: b.portability_eligible, status: b.status
    },
    shopping_plan: {
      plan_label: s.plan_label, is_active: s.is_active,
      target_payment: n(s.target_payment),
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
      list_price: n(sc.list_price),
      tax_method: sc.tax_method,
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
      closing_date: d(sc.closing_date), occupancy_date: d(sc.occupancy_date),
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
    // NOTE: result_summary is deliberately NOT returned into canonical state.
  };
}

module.exports = { SCHEMA_VERSION, serialize, deserialize, authored,
                   toBuyerProfileRow, toShoppingPlanRow, toPropertyRow, toScenarioRow, toRoundRows };
