-- =====================================================================
-- BUYER STRATEGY ENGINE — Phase 3 Gate C
-- 0002_seed_reference_data.sql — tax methods + the immutable
-- 2026.07-baseline assumption set.
--
-- The payload is the audited production constant set, verbatim, from
-- docs/BSE-Phase2-Architecture.md §9.2 and the frozen ASSUMPTION_SET in
-- the application. Buydown ratio 0.25 (L-8) — Staging's 0.24 is NOT adopted.
--
-- INSERT-only. A rate change creates a NEW version_label row; it never
-- edits this one (M-9). The immutability trigger in 0001 enforces that.
--
-- NO SECRETS IN THIS FILE.
-- =====================================================================

insert into tax_method (code, label, is_active, version, notes) values
  ('flat_rate',  'Flat rate — % of price or fixed annual $', true,  1,
   'The only method in use through Gate C. Shopping plans are always flat_rate (L-1 / §13.5).'),
  ('fl_millage', 'Florida millage — assessed value x millage + non-ad-valorem', false, 1,
   'Reserved. FL tax integration is LAST among approved calculation changes and is NOT implemented.')
on conflict (code) do nothing;

insert into program_assumption_set (version_label, effective_from, is_current, notes, payload)
values (
  '2026.07-baseline',
  date '2026-07-28',
  true,
  'Seed version 1. Audited production values, verbatim (Phase 2 §9.2). INSERT-only: never edit a payload.',
  $json${
    "engine": { "term_months": 360 },
    "programs": {
      "conv": { "min_score": 620, "dti_front": 28, "dti_back": 45 },
      "fha":  { "min_score": 500, "dti_front": 31, "dti_back": 43 },
      "va":   { "min_score": 0,   "dti_front": 41, "dti_back": 41 }
    },
    "mi": {
      "fha_ufmip_pct": 1.75,
      "fha_annual_high_pct": 0.55,
      "fha_annual_low_pct": 0.50,
      "fha_mip_drop_month": 132,
      "va_funding_fee_first_pct": 2.15,
      "va_funding_fee_sub_pct": 3.30,
      "pmi_ltv_bands": { "a": "> 95", "b": "> 90", "c": "> 85", "d": "> 80.0001" },
      "pmi_table": {
        "760+": { "a": 0.35, "b": 0.30, "c": 0.22, "d": 0.15 },
        "740":  { "a": 0.45, "b": 0.38, "c": 0.28, "d": 0.18 },
        "720":  { "a": 0.57, "b": 0.48, "c": 0.35, "d": 0.22 },
        "700":  { "a": 0.70, "b": 0.58, "c": 0.43, "d": 0.27 },
        "680":  { "a": 0.85, "b": 0.70, "c": 0.52, "d": 0.32 },
        "660":  { "a": 1.05, "b": 0.88, "c": 0.65, "d": 0.40 },
        "640":  { "a": 1.35, "b": 1.10, "c": 0.82, "d": 0.52 },
        "<640": { "a": 1.60, "b": 1.32, "c": 1.00, "d": 0.65 }
      }
    },
    "limits": {
      "conforming": 766550,
      "fha_national_floor": 498257,
      "fha_limit_is_county_specific": false
    },
    "concession_limits_pct": { "fha": 6, "va": 4 },
    "costs": { "closing_cost_pct_default": 3.00 },
    "rates_default": { "conv": 6.750, "fha": 6.250, "va": 6.125 },
    "buydown": { "pct_per_point": 0.25, "rate_rounding": 0.125 },
    "decision_thresholds": {
      "step_up_min_payment_saving": 150,
      "step_up_max_payback_months": 36,
      "reserve_preference_floor": 500,
      "reserve_warning_floor": 1000,
      "near_tie_cash": 250,
      "near_tie_payment": 50,
      "near_tie_financing": 2500,
      "tiebreak_cash_delta": 2000,
      "tiebreak_financing_delta": 2500
    },
    "tax_defaults": { "flat_rate_pct": 1.20 }
  }$json$::jsonb
)
on conflict (version_label) do nothing;
