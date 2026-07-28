-- =====================================================================
-- BUYER STRATEGY ENGINE — Phase 3 Gate C
-- 0001_bse_schema.sql — the seven-table persistence model
--
-- Implements docs/BSE-Phase2-Architecture.md §18 (conventions, indexes,
-- illustrative DDL, RLS shape, soft-delete) as executable migration.
-- Phase 2's DDL was explicitly marked "do not execute"; this is Gate C
-- turning that design into the real thing.
--
-- Locked decisions carried into the schema, not just the application:
--   L-1   scenario columns are NULLABLE and NULL means inherit
--   L-8   buydown 0.25 lives in the assumption-set payload, seeded in 0002
--   L-10  organization_id nullable on every buyer-owned table, unused
--   L-13  a (value, unit) pair can never be split — CHECK constraints
--   M-5   analysis_mode is explicit, never inferred from a null price
--   M-6   three-state cost fields: value stays NULL in both zero cases
--   M-7   money is numeric, never float8
--   Gate B.75  authored NULL is stored as SQL NULL; a negotiation_round
--              requires a price, scenario-level intent does not
--
-- NO SECRETS IN THIS FILE.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- helpers
create or replace function bse_touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- =====================================================================
-- 1. tax_method — lookup, not an ENUM (L-3: must extend without ALTER TYPE)
-- =====================================================================
create table if not exists tax_method (
  code          text primary key,
  label         text not null,
  is_active     boolean not null default true,
  version       smallint not null default 1,
  notes         text,
  created_at    timestamptz not null default now()
);

-- =====================================================================
-- 2. program_assumption_set — immutable, versioned, global
--    INSERT-only. Never UPDATE a payload (Phase 2 §9.1, risk M-9).
-- =====================================================================
create table if not exists program_assumption_set (
  id             uuid primary key default gen_random_uuid(),
  version_label  text not null unique,
  effective_from date not null,
  is_current     boolean not null default false,
  payload        jsonb not null,
  notes          text,
  created_at     timestamptz not null default now()
);

create unique index if not exists assumption_set_one_current
  on program_assumption_set (is_current) where is_current;

-- =====================================================================
-- 3. buyer_profile  (Phase 2 §4)
-- =====================================================================
create table if not exists buyer_profile (
  id                              uuid primary key default gen_random_uuid(),
  owner_user_id                   uuid not null,
  organization_id                 uuid null,               -- L-10 reserved
  display_name                    text not null,
  reference_code                  text null,

  qualifying_income_monthly       numeric(12,2) not null,
  monthly_debts                   numeric(12,2) not null default 0,
  credit_score                    smallint null,
  own_funds                       numeric(12,2) not null default 0,
  gift_funds                      numeric(12,2) not null default 0,

  is_first_time_buyer             boolean not null default false,
  va_eligible                     boolean not null default false,
  va_use                          text null check (va_use in ('first','sub')),
  va_funding_fee_exempt           boolean not null default false,

  dti_override_enabled            boolean not null default false,
  dti_override_front              numeric(5,2) null,
  dti_override_back               numeric(5,2) null,
  dti_override_source             text null,

  homestead_intent                boolean null,            -- M-14: NULL, never defaulted true
  prior_homestead_market_value    numeric(12,2) null,
  prior_homestead_assessed_value  numeric(12,2) null,
  portability_eligible            boolean not null default false,

  status                          text not null default 'active'
                                    check (status in ('active','archived')),
  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz not null default now(),

  -- Gate B.75: an override is meaningless without a back-end figure
  constraint dti_override_needs_back
    check (dti_override_enabled = false or dti_override_back is not null)
);

create index if not exists buyer_profile_owner_status on buyer_profile (owner_user_id, status);
create index if not exists buyer_profile_owner_name   on buyer_profile (owner_user_id, display_name);
create trigger buyer_profile_touch before update on buyer_profile
  for each row execute function bse_touch_updated_at();

-- =====================================================================
-- 4. shopping_plan  (Phase 2 §5) — append-only, exactly one active
-- =====================================================================
create table if not exists shopping_plan (
  id                  uuid primary key default gen_random_uuid(),
  owner_user_id       uuid not null,
  organization_id     uuid null,
  buyer_profile_id    uuid not null references buyer_profile(id),

  plan_label          text not null default 'Original Plan',
  is_active           boolean not null default true,

  target_payment      numeric(12,2) not null,

  -- §16 canonical pair — never split, never converted at rest
  dp_target_value     numeric(12,2) null,
  dp_target_unit      text null check (dp_target_unit in ('percent','amount')),

  planned_stay_years  smallint not null default 7,
  buyer_priority      text not null default 'balanced'
                        check (buyer_priority in ('balanced','payment','cash','power')),

  -- L-1 / §13.5 — shopping plans are flat_rate. No millage at this layer.
  tax_method          text not null default 'flat_rate' references tax_method(code),
  tax_rate_pct        numeric(7,4) null,
  tax_annual_amount   numeric(12,2) null,
  tax_input_unit      text not null default 'percent'
                        check (tax_input_unit in ('percent','amount')),

  hoi_monthly         numeric(10,2) null,
  hoa_monthly         numeric(10,2) null,
  hoa_status          text not null default 'unknown'
                        check (hoa_status in ('unknown','confirmed_none','known')),
  cdd_monthly         numeric(10,2) null,
  cdd_status          text not null default 'unknown'
                        check (cdd_status in ('unknown','confirmed_none','known')),
  flood_monthly       numeric(10,2) null,
  flood_status        text not null default 'unknown'
                        check (flood_status in ('unknown','confirmed_none','known')),

  -- Gate B.75: NULL = authored blank = inherit from the assumption set.
  -- An explicit 0 is an authored zero and is stored as 0.
  rate_conv           numeric(6,3) null,
  rate_fha            numeric(6,3) null,
  rate_va             numeric(6,3) null,
  closing_cost_pct    numeric(5,2) null,

  assumption_set_id   uuid not null references program_assumption_set(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  superseded_at       timestamptz null,

  constraint plan_dp_pair_intact
    check ((dp_target_value is null) = (dp_target_unit is null)),
  -- M-6: the value column stays NULL unless the status is 'known',
  -- so a status change has nothing to overwrite
  constraint plan_hoa_three_state
    check ((hoa_status = 'known') = (hoa_monthly is not null)),
  constraint plan_cdd_three_state
    check ((cdd_status = 'known') = (cdd_monthly is not null)),
  constraint plan_flood_three_state
    check ((flood_status = 'known') = (flood_monthly is not null)),
  constraint plan_tax_pair_intact
    check ((tax_input_unit = 'percent' and tax_annual_amount is null)
        or (tax_input_unit = 'amount'  and tax_rate_pct is null))
);

create index if not exists shopping_plan_buyer_active on shopping_plan (buyer_profile_id, is_active);
create unique index if not exists shopping_plan_one_active
  on shopping_plan (buyer_profile_id) where is_active;
create trigger shopping_plan_touch before update on shopping_plan
  for each row execute function bse_touch_updated_at();

-- =====================================================================
-- 5. property  (Phase 2 §6) — deliberately thin
-- =====================================================================
create table if not exists property (
  id                uuid primary key default gen_random_uuid(),
  owner_user_id     uuid not null,
  organization_id   uuid null,
  buyer_profile_id  uuid not null references buyer_profile(id),

  label             text not null,
  address_line1     text null,
  address_line2     text null,
  city              text null,
  state             char(2) not null default 'FL',
  postal_code       text null,
  county            text null,
  property_type     text null
                      check (property_type in ('single_family','condo','townhome','multi_unit','manufactured')),
  mls_number        text null,

  status            text not null default 'active'
                      check (status in ('active','passed','archived')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists property_buyer_status on property (buyer_profile_id, status);
create trigger property_touch before update on property
  for each row execute function bse_touch_updated_at();

-- =====================================================================
-- 6. property_scenario  (Phase 2 §7) — the central table
--    Every assumption column is NULLABLE: NULL means inherit (L-1).
-- =====================================================================
create table if not exists property_scenario (
  id                        uuid primary key default gen_random_uuid(),
  owner_user_id             uuid not null,
  organization_id           uuid null,
  property_id               uuid not null references property(id),
  buyer_profile_id          uuid not null references buyer_profile(id),
  shopping_plan_id          uuid not null references shopping_plan(id),
  parent_scenario_id        uuid null references property_scenario(id),

  scenario_label            text not null default 'Scenario 1',
  analysis_mode             text not null default 'property'
                              check (analysis_mode in ('shopping','property')),
  list_price                numeric(12,2) null,

  -- assumption overrides — NULL = inherit from shopping_plan
  hoi_monthly               numeric(10,2) null,
  hoa_monthly               numeric(10,2) null,
  hoa_status                text null check (hoa_status in ('unknown','confirmed_none','known')),
  cdd_monthly               numeric(10,2) null,
  cdd_status                text null check (cdd_status in ('unknown','confirmed_none','known')),
  flood_monthly             numeric(10,2) null,
  flood_status              text null check (flood_status in ('unknown','confirmed_none','known')),
  rate_conv                 numeric(6,3) null,
  rate_fha                  numeric(6,3) null,
  rate_va                   numeric(6,3) null,
  closing_cost_pct          numeric(5,2) null,
  closing_cost_override_amount numeric(12,2) null,
  target_payment            numeric(12,2) null,
  dp_target_value           numeric(12,2) null,
  dp_target_unit            text null check (dp_target_unit in ('percent','amount')),
  planned_stay_years        smallint null,
  buyer_priority            text null
                              check (buyer_priority in ('balanced','payment','cash','power')),

  dti_override_enabled      boolean null,
  dti_override_front        numeric(5,2) null,
  dti_override_back         numeric(5,2) null,
  dti_override_source       text null,

  -- Gate B.75 first-class scenario state. Negotiation intent may exist
  -- before any round; a round may not exist without a price.
  negotiation_mode          text not null default 'concession'
                              check (negotiation_mode in ('compare','reduction','concession','split')),
  offer_concession_value    numeric(12,2) null,
  offer_concession_unit     text null check (offer_concession_unit in ('percent','amount')),

  closing_date              date null,
  occupancy_date            date null,

  tax_method                text null references tax_method(code),
  tax_method_version        smallint null,
  tax_inputs                jsonb null,
  tax_outputs               jsonb null,
  qualifying_tax_basis      text not null default 'projected_reassessed'
                              check (qualifying_tax_basis in
                                     ('projected_reassessed','seller_current','stabilized_homestead')),

  assumption_set_id         uuid not null references program_assumption_set(id),
  assumption_overrides      jsonb null,
  engine_version            text not null,
  resolved_inputs           jsonb null,

  -- CACHE ONLY. Non-authoritative at the persistence boundary too (Gate B.75).
  -- Never read back into a calculation; the engine always recomputes on load.
  result_summary            jsonb null,
  results_computed_at       timestamptz null,

  status                    text not null default 'draft'
                              check (status in ('draft','presented','under_contract','closed','passed','archived')),
  is_accepted_property      boolean not null default false,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),

  -- L-13: a (value, unit) pair can never be split. This is what makes the
  -- C-4(a) corruption structurally impossible to persist.
  constraint scenario_dp_pair_intact
    check ((dp_target_value is null) = (dp_target_unit is null)),
  constraint scenario_concession_pair_intact
    check ((offer_concession_value is null) = (offer_concession_unit is null)),
  constraint scenario_hoa_three_state
    check (hoa_status is null or ((hoa_status = 'known') = (hoa_monthly is not null))),
  constraint scenario_cdd_three_state
    check (cdd_status is null or ((cdd_status = 'known') = (cdd_monthly is not null))),
  constraint scenario_flood_three_state
    check (flood_status is null or ((flood_status = 'known') = (flood_monthly is not null))),
  constraint fl_millage_requires_closing_date
    check (tax_method is distinct from 'fl_millage' or closing_date is not null),
  constraint scenario_dti_override_needs_back
    check (dti_override_enabled is not true or dti_override_back is not null),
  -- M-5: a property-mode scenario has a price; a shopping-mode one does not
  constraint scenario_mode_matches_price
    check ((analysis_mode = 'shopping' and list_price is null)
        or (analysis_mode = 'property'))
);

create index if not exists scenario_property_created on property_scenario (property_id, created_at desc);
create index if not exists scenario_buyer_accepted  on property_scenario (buyer_profile_id, is_accepted_property);
create index if not exists scenario_plan            on property_scenario (shopping_plan_id);
create trigger property_scenario_touch before update on property_scenario
  for each row execute function bse_touch_updated_at();

-- =====================================================================
-- 7. negotiation_round  (Phase 2 §8)
--    Gate B.75 locked decision: a round REQUIRES a price. Scenario-level
--    negotiation intent lives on property_scenario and needs no round.
-- =====================================================================
create table if not exists negotiation_round (
  id                     uuid primary key default gen_random_uuid(),
  owner_user_id          uuid not null,
  organization_id        uuid null,
  property_scenario_id   uuid not null references property_scenario(id),

  round_number           smallint not null,
  actor                  text not null check (actor in ('buyer','seller')),
  price                  numeric(12,2) not null,          -- REQUIRED. Gate C decision 3.

  concession_value       numeric(12,2) null,
  concession_unit        text null check (concession_unit in ('percent','amount')),
  negotiation_mode       text null
                           check (negotiation_mode in ('compare','reduction','concession','split')),
  loan_program_override  text null
                           check (loan_program_override in ('auto','fha3.5','conv5','conv10','conv20','va0')),

  -- C-9 / M-12: reserved, deliberately not surfaced as authoritative
  manual_split_buydown   numeric(12,2) null,
  manual_split_costs     numeric(12,2) null,
  manual_split_enabled   boolean not null default false,

  is_accepted            boolean not null default false,
  result_summary         jsonb null,                       -- cache only
  note                   text null,
  created_at             timestamptz not null default now(),

  constraint round_price_positive check (price > 0),
  constraint round_concession_pair_intact
    check ((concession_value is null) = (concession_unit is null)),
  -- §8: negotiation_mode is a buyer-round concept
  constraint round_mode_buyer_only
    check (actor = 'buyer' or negotiation_mode is null)
);

create unique index if not exists round_scenario_number
  on negotiation_round (property_scenario_id, round_number);
create unique index if not exists round_one_accepted
  on negotiation_round (property_scenario_id) where is_accepted;

-- =====================================================================
-- ROW LEVEL SECURITY — mandatory on all five buyer-owned tables
-- Security comes from auth + RLS, never from frontend filtering.
-- =====================================================================
alter table buyer_profile     enable row level security;
alter table shopping_plan     enable row level security;
alter table property          enable row level security;
alter table property_scenario enable row level security;
alter table negotiation_round enable row level security;

alter table buyer_profile     force row level security;
alter table shopping_plan     force row level security;
alter table property          force row level security;
alter table property_scenario force row level security;
alter table negotiation_round force row level security;

create policy buyer_profile_owner_all on buyer_profile
  for all using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
create policy shopping_plan_owner_all on shopping_plan
  for all using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
create policy property_owner_all on property
  for all using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
create policy property_scenario_owner_all on property_scenario
  for all using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
create policy negotiation_round_owner_all on negotiation_round
  for all using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());

-- Reference tables: readable by any authenticated user, writable by none.
alter table program_assumption_set enable row level security;
alter table tax_method             enable row level security;
create policy assumption_set_read on program_assumption_set
  for select using (auth.role() = 'authenticated');
create policy tax_method_read on tax_method
  for select using (auth.role() = 'authenticated');

-- =====================================================================
-- GRANTS
-- RLS is the security boundary, but a role still needs table privileges
-- for the policies to be evaluated at all. Supabase creates `anon` and
-- `authenticated`; only `authenticated` is granted here, and every row it
-- can reach is still filtered by the policies above.
-- =====================================================================
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant usage on schema public to authenticated;
    grant select, insert, update, delete on
      buyer_profile, shopping_plan, property, property_scenario, negotiation_round
      to authenticated;
    grant select on program_assumption_set, tax_method to authenticated;
  end if;
end $$;

-- =====================================================================
-- Soft-delete rule (Phase 2 §18.6): nothing a client was shown is
-- hard-deletable. A negotiation_round may be deleted only while its
-- parent scenario is still a draft.
-- =====================================================================
create or replace function bse_round_delete_guard() returns trigger
language plpgsql as $$
declare parent_status text;
begin
  select status into parent_status from property_scenario where id = old.property_scenario_id;
  if parent_status is distinct from 'draft' then
    raise exception 'negotiation_round may only be deleted while the parent scenario is draft (status=%)', parent_status;
  end if;
  return old;
end $$;

create trigger negotiation_round_delete_guard before delete on negotiation_round
  for each row execute function bse_round_delete_guard();

create or replace function bse_scenario_delete_guard() returns trigger
language plpgsql as $$
begin
  if old.status <> 'draft' then
    raise exception 'property_scenario is not hard-deletable once it leaves draft (status=%) — archive it instead', old.status;
  end if;
  return old;
end $$;

create trigger property_scenario_delete_guard before delete on property_scenario
  for each row execute function bse_scenario_delete_guard();

-- Assumption sets are immutable: INSERT-only (M-9).
create or replace function bse_assumption_immutable() returns trigger
language plpgsql as $$
begin
  raise exception 'program_assumption_set is INSERT-only — create a new version instead of editing %', old.version_label;
end $$;

create trigger assumption_set_no_update before update or delete on program_assumption_set
  for each row execute function bse_assumption_immutable();
