-- =====================================================================
-- 0003 — WP-1: activate the reserved fl_millage tax method
-- =====================================================================
-- Additive and idempotent. No DDL: every column WP-1 needs already exists.
--   property_scenario.tax_method            -> the discriminator
--   property_scenario.tax_method_version    -> stamped 1
--   property_scenario.tax_inputs  (jsonb)   -> authored millage + prior parcel
--   property_scenario.tax_outputs (jsonb)   -> derived Year 1 / Year 2 cache
--   buyer_profile.homestead_intent / prior_homestead_market_value /
--     prior_homestead_assessed_value / portability_eligible
--
-- 0002 seeded this row with is_active = false and the note "Reserved. FL tax
-- integration is LAST among approved calculation changes and is NOT
-- implemented." WP-1 implements it, so the row is activated and the note
-- updated. tax_outputs is a CACHE and is never read back as authority.
-- =====================================================================
update tax_method
   set is_active = true,
       version   = 2,
       label     = 'Florida millage — assessed value x millage + non-ad-valorem',
       notes     = 'Implemented in WP-1. Year 1 = purchase price x millage + non-ad-valorem '
                   '(reassessed on sale, no exemptions) and is the ONLY figure that reaches '
                   'the payment engine. Year 2 = (price - portable SOH benefit) less both '
                   'homestead tiers, blended across school/non-school, and is projection only. '
                   'Portability applies the proportional downsizing rule and the $500,000 cap. '
                   'Out of scope: SOH 3% cap beyond year 2, non-homestead 10% cap, '
                   'senior/veteran/widow exemptions, county lookup.'
 where code = 'fl_millage';
