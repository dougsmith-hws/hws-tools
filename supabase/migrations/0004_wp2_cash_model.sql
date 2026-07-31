-- =====================================================================
-- 0004 — WP-2: cash model
-- =====================================================================
-- Additive only. Four nullable columns, no type changes, no drops, no
-- backfill. Every existing row keeps its behaviour: cash_input_mode
-- defaults to 'down' (the pre-WP-2 interpretation) and the three dollar
-- columns are NULL, which resolves to zero.
--
--   buyer_profile.cash_input_mode   how to read PREFERRED CASH TO USE.
--                                   'down'  = it is a down payment (default)
--                                   'total' = it is total out of pocket and
--                                             closing costs come out of it
--   buyer_profile.desired_reserves  DESIRED RESERVES AFTER CLOSING. NULL
--                                   falls back to the $500 floor that was
--                                   hard-coded in pickBestOverall.
--   property_scenario.escrow_deposit  prepaids + initial escrow reserve, an
--                                     authored funds-to-close component.
--   property_scenario.earnest_money   already paid; credited at closing.
--
-- TOTAL AVAILABLE FUNDS is unchanged: own_funds + gift_funds. It is never
-- converted into a down payment.
-- =====================================================================
alter table buyer_profile
  add column if not exists cash_input_mode text not null default 'down'
    check (cash_input_mode in ('down','total'));

alter table buyer_profile
  add column if not exists desired_reserves numeric(12,2) null;

alter table property_scenario
  add column if not exists escrow_deposit numeric(12,2) null;

alter table property_scenario
  add column if not exists earnest_money numeric(12,2) null;

comment on column buyer_profile.cash_input_mode is
  'WP-2. Interpretation of the authored down-payment target in DOLLAR mode only. Percent mode is unambiguous and ignores this.';
comment on column buyer_profile.desired_reserves is
  'WP-2. Cash the buyer wants left after closing. NULL = the $500 default floor.';
comment on column property_scenario.escrow_deposit is
  'WP-2. Authored prepaids + initial escrow reserve. Not an itemisation; BSE is not an LOS.';
comment on column property_scenario.earnest_money is
  'WP-2. Deposit already paid. Netted at cash to close, never off the closing-cost figure.';
