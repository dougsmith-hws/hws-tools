-- =====================================================================
-- 0005 — WP-3: buyer priority becomes mandatory and buyer-stated
-- =====================================================================
-- 'balanced' is retired. It was the label under which the engine made the
-- cash-versus-payment tradeoff on the buyer's behalf, which the locked
-- workflow prohibits. 'reserves' takes its place in the enum.
--
-- EXISTING ROWS ARE MIGRATED, NOT DROPPED. Every 'balanced' row becomes
-- 'payment', because the retired selector's own comfort filter made payment
-- its effective default — that is the reading which changes the fewest
-- existing files. The migration runs BEFORE the new constraint is applied,
-- so no row can be left in violation.
--
-- shopping_plan.buyer_priority stays NOT NULL with a default so that older
-- clients keep working; the application treats an unstated priority as a
-- real state and does not write one. property_scenario.buyer_priority stays
-- NULL-means-inherit, exactly as before.
--
-- Additive and reversible in effect: no column is dropped, no type changes,
-- no data is lost — only the set of permitted values moves.
-- =====================================================================

-- 1. Migrate the data first. -----------------------------------------
update shopping_plan
   set buyer_priority = 'payment'
 where buyer_priority = 'balanced';

update property_scenario
   set buyer_priority = 'payment'
 where buyer_priority = 'balanced';

-- 2. Then move the permitted set. -------------------------------------
alter table shopping_plan
  drop constraint if exists shopping_plan_buyer_priority_check;
alter table shopping_plan
  add constraint shopping_plan_buyer_priority_check
  check (buyer_priority in ('payment','cash','reserves','power'));

alter table property_scenario
  drop constraint if exists property_scenario_buyer_priority_check;
alter table property_scenario
  add constraint property_scenario_buyer_priority_check
  check (buyer_priority in ('payment','cash','reserves','power'));

-- 3. The default follows the same mapping. ----------------------------
alter table shopping_plan
  alter column buyer_priority set default 'payment';

comment on column shopping_plan.buyer_priority is
  'WP-3. Buyer-stated priority: payment | cash | reserves | power. "balanced" was retired — the engine no longer makes the tradeoff itself.';
comment on column property_scenario.buyer_priority is
  'WP-3. NULL means inherit from the shopping plan. Permitted values: payment | cash | reserves | power.';
