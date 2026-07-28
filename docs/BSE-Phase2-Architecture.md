<!--
PERMANENT CONTROLLING DOCUMENT — BUYER STRATEGY ENGINE
File: docs/BSE-Phase2-Architecture.md
Status: FINAL / CLOSED 2026-07-28. All 6 open questions dispositioned. 13 locked decisions L-1 through L-13.
Origin: Produced in the Cowork session of 2026-07-28. Design only — no code written, no infrastructure created.
Companion documents: docs/BSE-Phase0-1-Forensic-Audit.md, docs/BSE-Project-Status.md
Read BSE-Project-Status.md first.
-->

> ## PORTABILITY NOTE — READ FIRST
>
> This is the **complete, final Phase 2 architecture document** as closed on 2026-07-28, including all closeout decisions. It is not a summary. It is the **controlling design specification for Phase 3 implementation**.
>
> **Quick index to the items most often needed:**
>
> | Item | Section |
> |---|---|
> | All 13 locked decisions **L-1 … L-13** | §2 |
> | Seven-table model, five buyer-owned | §3 |
> | Buyer Profile schema | §4 |
> | Shopping Plan schema + append-only versioning | §5 |
> | Property schema | §6 |
> | Property Scenario schema + inheritance resolution | §7 |
> | Offer / negotiation history (`negotiation_round`) | §8 |
> | Assumption sets + the audited seed `2026.07-baseline` | §9 |
> | Complete existing-input → future-field mapping | §10 |
> | Snapshot / reproducibility strategy | §11 |
> | `tax_method` discriminator architecture | §12 |
> | FL property-tax integration design + `qualifying_tax_basis` | §13 |
> | `closing_date` / `occupancy_date` | §14 |
> | DTI default + override architecture | §15 |
> | **Canonical value / unit architecture — the M-1 design** | §16 |
> | Versioning strategy | §17 |
> | Supabase-ready schema, **DDL in §18.4**, `organization_id` in §18.2 | §18 |
> | Cross-device / auth data flow | §19 |
> | Security / data minimization | §20 |
> | **16 migration risks, M-1 … M-16** | §21 |
> | **Q-1 … Q-6 — all resolved** | §22 |
> | Phase 3 scope + full phase sequencing | §23 |
> | Saved buyer workflow data flow | Appendix A |
> | Answers to the 10 review questions | end |
>
> **Sequencing constraints that survive into every future session:** M-1 before any persistence (L-13) · FL tax integration last · Comfort Calculator retirement gated on regression **and** live buyer-call validation (L-11) · calculation engine read-only · `maxPriceForScenario` unmodified · Live authoritative, Staging suspect.

---

# BUYER STRATEGY ENGINE — PHASE 2
## Architecture Decision Lock & Data Model Design

**HomeWealth Solutions LLC** · Company NMLS #2742458 · FL OFR Mortgage Broker License #MBR8082
Prepared for: Doug Smith, President & Broker, CMA®
Date: **July 28, 2026**
Phase: **Design only.** No code written, no file modified, no infrastructure created.
**Status: CLOSED 2026-07-28.** All six open questions dispositioned; Decisions L-7 through L-13 incorporated. Phases 0, 1 and 2 complete.

**Authoritative sources:** `Tools/Live/internal/buyer-strategy/index.html` (BSE) and `Tools/Live/property-tax.html` (FL tax engine). `Tools/Staging/buyer-strategy-v2/index.html` is treated as a suspect copy and is **not** used as a calculation reference anywhere in this document.

**Every production constant cited here was re-verified against source on 2026-07-28** before being written. No example values from prior discussion have been substituted.

---

# 1. EXECUTIVE SUMMARY

## What this design does

It separates three things the current application conflates into one flat HTML form: **who the buyer is**, **what they assumed while shopping**, and **what is true about a specific house**. That single separation is what makes saved Buyer Profiles possible, and it is also — unexpectedly — what makes the Florida tax integration mathematically possible. Those two goals turn out to be the same goal.

## The five design decisions that carry the most weight

**1. The entered unit is part of the data, not a display preference.** A buyer who says "20% down" and a buyer who says "$150,000 down" are stating different intentions. The current `setUnit` converts between them and writes the converted value back, destroying the original and drifting on every toggle. The fix is not better rounding — it is to **never convert on save**. Store `(value, unit)` as entered; convert only for display; never write a conversion back. This eliminates the entire class of corruption identified as C-4(a), and it costs one extra column per dual-unit field.

**2. Program scenarios are derived, not stored.** The four-to-six cards the BSE shows (Conv 5%, FHA 3.5%, VA 0%…) are generated combinatorially at runtime by `PROGRAMS[x].scenarios(inp)`. They are **outputs**. Persisting them would violate the Phase 0 principle that persistence saves inputs. There is therefore **no "Loan Scenario" table** in this design — a Property Scenario stores inputs, and the program comparison regenerates from them. This is why the DTI override belongs on the Buyer Profile and Property Scenario, not on a loan record that does not exist.

**3. Reproducibility comes from an immutable assumption set plus a small delta — not a fat snapshot.** Copying fifty constants onto every scenario row is wasteful and drifts. Instead: `program_assumption_sets` holds immutable, versioned rows (the full PMI table, loan limits, MIP and funding fees, DTI ratios, concession limits, thresholds); a scenario carries `assumption_set_id` plus a small JSONB of the values the user actually overrode. Opening a scenario three months later resolves the same numbers because the set it points at is immutable and was never updated in place. "Recalculate with today's assumptions" becomes a deliberate act of pointing at a newer set — producing a new row, never mutating the old one.

**4. Shopping Plans are append-only rows with one active, not a version-history system.** A buyer who moves their comfort payment from $3,000 to $3,250 gets a second Shopping Plan row; the first is retained and deactivated. Property Scenarios record which plan they were created under. That is one table and one boolean, and it fully satisfies "the original goals follow the buyer" without building a diff engine.

**5. Florida millage cannot drive Shopping Range Mode without changing protected code — and it does not need to.** The engine solves maximum price closed-form by expressing PITI as `k·price + b`. A flat tax rate lives in `k` (it scales with price). A specific property's millage-derived tax is a fixed dollar amount and lives in `b`. In Shopping Range Mode there is no price to compute millage against. **Therefore: Shopping Plans use `flat_rate`; Property Scenarios may use `fl_millage`.** That is not a compromise — it is the correct modeling of what each mode actually knows, it requires no change to `maxPriceForScenario`, and it is precisely the layering you locked in Decision 1. (A future closed-form millage solve is algebraically possible and is documented in Section 13.6 as an option requiring separate approval, because it would modify a CRITICAL-risk function.)

## What this design deliberately does not do

No transaction management. No document storage. No loan-file replication. No workflow state machine beyond a status field. No revision history on ordinary edits. The negotiation model is an ordered child list with an accepted flag — nothing more. Where a simpler structure satisfies the requirement, this document chooses the simpler structure and says so.

## Scope of eventual code change

This design requires modification of the following existing functions when Phase 3+ begins. **None were modified in this phase.** The calculation Engine (lines 526–1060) is **not** in this list — it is preserved as-is, which is the entire point.

| Function | Line | Change required | Risk |
|---|---|---|---|
| `gatherInputs` | 1142 | Must consume a state object, not the DOM | Critical |
| `setUnit` | 2807 | Must stop writing converted values back | High |
| `setOfferConcUnit` | 2612 | Same | Medium |
| `setCounterUnit` | 2586 | Same | Medium |
| `updateInlineHints` | 1243–1246 | Must stop overwriting HOA/CDD/flood with `'0'` | High |
| `renderSnapshot` | 1403 | Must read shopping assumptions, not property actuals | Critical |
| `init` | 2834 | Must become an async, gated bootstrap | Medium |
| `recalc` | 2400 | Must be debounced and decoupled from persistence | Critical |
| *(new)* | — | `applyState(state)` — the inverse of `gatherInputs` | New code |

---

# 2. LOCKED ARCHITECTURE DECISIONS

Recorded as approved and binding on this design.

### L-1 — Shopping Assumptions and Property Actuals are separate data layers

Property Actuals may override Shopping Assumptions **for that scenario only**. They may never write back. Implemented as: a Property Scenario carries its own nullable assumption columns; NULL means "inherit from the Shopping Plan"; a value means "this property overrides." Resolution happens in memory at calculation time and is never persisted back to the plan.

**Worked against your example:** Buyer's Shopping Plan holds `tax_method = flat_rate, tax_rate_pct = 1.20`. Property A holds `tax_method = fl_millage` with Hillsborough millage. Property B holds `tax_method = fl_millage` with different millage and assessments. Opening either resolves that property's own tax method. The plan's 1.20% is never read by, written by, or reachable from either property record. Closing Property A and returning to the Shopping Range restores 1.20% because it was never touched.

### L-2 — DTI limits are system/program constants with an explicit optional override

Program defaults are the audited production values and are **not** stored as buyer data:

| Program | Front-end | Back-end | Min score | Source |
|---|---|---|---|---|
| Conventional | **28** | **45** | **620** | `PROGRAMS.conv.ratios`, line 610 |
| FHA | **31** | **43** | **500** | `PROGRAMS.fha.ratios`, line 628 |
| VA | **41** | **41** | **0** | `PROGRAMS.va.ratios`, line 632 |

Override structure is explicit and three-part (`enabled`, `front`, `back`), defaulting to disabled/NULL. Placement is analysed in Section 15. **No DTI calculation logic changes.** Front-end remains advisory and non-binding exactly as it is today (comment at lines 746–747; `frontFlag` at line 845).

### L-3 — A tax-method discriminator is required, and must be extensible

`tax_method` starts as `flat_rate` and `fl_millage` but must accept future methods without breaking saved rows. Implemented as a **lookup table with a foreign key**, not a Postgres `ENUM` — enums require `ALTER TYPE` to extend and cannot carry per-method metadata or an active flag. Every saved scenario records its method and method version, so how any historical result was produced is always determinable.

### L-4 — A tax assumptions snapshot is required

Storing the resulting annual tax figure alone is insufficient. Each scenario retains the **inputs** required to reproduce the calculation, plus the outputs for fast display. No borrower information is duplicated into the tax snapshot.

### L-5 — Closing / occupancy date enters the architecture

Recommendation in Section 14, derived from the Florida rule the authoritative tool states in its own UI at line 401. **No tax logic is invented.**

### L-6 — The existing calculation engine and the FL tax tool remain read-only

Both are untouched in this phase. This document designs how they will connect; it does not connect them.

### L-7 — Qualifying tax basis *(locked 2026-07-28, resolves Q-1)*

Qualification PITI uses the **Projected Reassessed Tax (Qualifying Tax)**. The seller's current tax bill is **informational only** and never drives qualification. The post-homestead / stabilized figure is a **separate planning and display figure**. `qualifying_tax_basis` is retained on the scenario to permit lender- or program-specific overrides.

### L-8 — Buydown ratio is 0.25 *(locked, resolves Q-2)*

Live production is authoritative (line 952). Staging's 0.24 is **not** adopted. Any future change is a new assumption set, never an edit to `2026.07-baseline`.

### L-9 — No edit history *(locked, resolves Q-3)*

No revision or edit-history table. The architecture preserves **scenario reproducibility**, not every historical edit.

### L-10 — `organization_id` reserved, team functionality not built *(locked, resolves Q-4)*

A nullable `organization_id` is added to all buyer-owned tables now. It is unused, unindexed, and carries no policy logic at Phase 3.

### L-11 — Comfort Calculator retirement gate *(locked, resolves Q-5)*

The Comfort Calculator is retired **only after** the redesigned BSE Shopping Range has passed regression testing **and** has been validated in an actual buyer-call workflow. Saved Shopping Plans alone are not sufficient.

### L-12 — Phone is a full editing surface *(locked, resolves Q-6)*

Full responsive editing is required on phone. Core buyer and property inputs and the strategy calculations must remain usable from a phone. Phone is **not** review-only.

### L-13 — Canonical values, presentation-only unit toggles *(locked)*

Persist canonical values only. Restore canonical values directly. Unit toggles are presentation state only and must **never** mutate persisted canonical values. **The `applyState` double-conversion risk (M-1) must be resolved before any persistence or save/load functionality is implemented.**

---

# 3. PROPOSED ENTITY / DATA MODEL

## 3.1 Entity map

```
auth.users (Supabase)
   │
   └─< buyer_profile ──────────────────────────┐
          │                                     │
          ├─< shopping_plan  (1..n, one active) │
          │                                     │
          └─< property (1..n)                   │
                 │                              │
                 └─< property_scenario ─────────┘
                        │   (FK → shopping_plan_id, assumption_set_id)
                        │
                        └─< negotiation_round (0..n, ordered, one accepted)

program_assumption_set   (immutable, versioned, global)
tax_method               (lookup, extensible)
```

Seven tables. Two are global reference data; five are buyer-owned.

## 3.2 Refinements to your conceptual layers, and why

You asked me to evaluate the layers rather than accept them. Four changes:

**(a) `Shopping Plan` becomes its own table rather than columns on `buyer_profile`.** Your own question answers this: a buyer legitimately revises their comfort payment mid-search, and you want the original preserved. Columns on the buyer cannot hold two versions. One table, one `is_active` boolean, and Property Scenarios record `shopping_plan_id`. That is the minimum structure that answers "what plan was this property evaluated against?"

**Which values sit on Buyer Profile versus Shopping Plan:** the division is *durable fact about the borrower* versus *stated intent that may be revised*. Income, debts, credit score, FTHB status, VA eligibility, and available funds are facts — they belong on the Buyer Profile. Target payment, preferred down payment, planned stay, buyer priority, and every estimated cost assumption are intent — they belong on the Shopping Plan, because those are exactly the values that change when a buyer decides $3,250 is comfortable after all.

Available funds is the debatable one. It is a fact, but it moves (a gift arrives, a 401k loan is taken). **Recommendation: keep funds on the Buyer Profile.** If it changes, that is a correction to a fact, not a new strategy. Putting it on the plan would force a new plan row every time a bank balance updates.

**(b) There is no `Loan Scenario` entity.** As stated in Section 1, program/down-payment scenarios are derived at runtime by `PROGRAMS[x].scenarios(inp)` (lines 612–635) and re-derived on every `recalc`. Storing them would persist outputs and immediately create a second source of truth against the Engine. The one place a specific program is genuinely *chosen* rather than computed is the counteroffer override (`#counterLoan`, line 500) and the eventual accepted structure — both of which are single columns on existing rows, not a table.

**(c) `Property` holds identity only; `list_price` moves to `Property Scenario`.** List prices get reduced. If the price lived on the Property, a price cut would retroactively rewrite every historical scenario for that address — a direct violation of the reproducibility requirement. Property holds what does not change: address, city, state, ZIP, county, property type.

**County is not optional.** It is required for Florida millage lookup and for county-specific FHA loan limits — the audit found the BSE currently uses the 2024 **national FHA floor** ($498,257) while labeling it a "county loan limit." Capturing county now is what makes that correctable later.

**(d) Negotiation rounds become child records.** Analysed in Section 8.

## 3.3 Cardinality

| Relationship | Cardinality | Rationale |
|---|---|---|
| user → buyer_profile | 1 : many | RLS boundary |
| buyer_profile → shopping_plan | 1 : many, exactly one `is_active` | Your revision scenario |
| buyer_profile → property | 1 : many | 123 Main, 456 Oak, 789 Lake |
| property → property_scenario | 1 : many | Re-analysis after a price cut, or a what-if |
| property_scenario → negotiation_round | 1 : many, ordered, ≤ one `is_accepted` | Offer → counter → counter → accepted |
| property_scenario → shopping_plan | many : 1 | Records which plan it was evaluated against |
| property_scenario → program_assumption_set | many : 1 | Reproducibility |

**Deliberately excluded:** no many-to-many between buyer and property (a shared listing between two of your buyers is two property rows — duplication is cheaper than the join and the RLS complexity). No transaction entity. No party/contact entities. No task or milestone tracking.

---
# 4. BUYER PROFILE SCHEMA

**Purpose:** durable facts about the borrower that follow them through the entire lifecycle and are not restated per property.

| Field | Type | Null | Default | Source | Sensitive | Notes |
|---|---|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | new | — | PK |
| `owner_user_id` | uuid | no | `auth.uid()` | new | — | FK → `auth.users`. **RLS anchor** |
| `display_name` | text | no | — | new | No | "John Smith." Workflow identification only |
| `reference_code` | text | yes | null | new | No | Optional internal file reference |
| `qualifying_income_monthly` | numeric(12,2) | no | — | `#income` | **Yes** | Monthly gross. Exact — bucketing changes DTI |
| `monthly_debts` | numeric(12,2) | no | `0` | `#debts` | **Yes** | Non-housing |
| `credit_score` | smallint | no | — | `#score` | **Yes** | Exact — drives PMI band, eligibility, LLPA flag. **See migration risk M-4 on the blank→300 coercion** |
| `own_funds` | numeric(12,2) | no | `0` | `#ownFunds` | **Yes** | |
| `gift_funds` | numeric(12,2) | no | `0` | `#gift` | **Yes** | Separate — drives `requiresGift` (line 847) |
| `is_first_time_buyer` | boolean | no | `false` | `#tgFthb` | No | Unlocks Conv 3% |
| `va_eligible` | boolean | no | `false` | `#tgVa` | No | Gates the VA program entirely |
| `va_use` | text | yes | null | `#vaUse` | No | `first` \| `sub`. NULL when not VA eligible |
| `va_funding_fee_exempt` | boolean | no | `false` | `#vaExempt` | **Yes — health-adjacent** | **Boolean only. Never store the rating, condition, or award letter** |
| `dti_override_enabled` | boolean | no | `false` | new | No | See Section 15 |
| `dti_override_front` | numeric(5,2) | yes | null | new | No | |
| `dti_override_back` | numeric(5,2) | yes | null | new | No | |
| `dti_override_source` | text | yes | null | new | No | Free text, e.g. "DU Approve/Eligible 2026-07-14" |
| `homestead_intent` | boolean | yes | null | FL `#chk-homestead` | No | **Buyer-level: the buyer either will or will not file.** NULL = not yet established |
| `prior_homestead_market_value` | numeric(12,2) | yes | null | FL `#prior-market` | **Yes** | **Buyer-level — describes the buyer's PRIOR home, not the subject property.** Resolves the Phase 1 ambiguity |
| `prior_homestead_assessed_value` | numeric(12,2) | yes | null | FL `#prior-assessed` | **Yes** | Same |
| `portability_eligible` | boolean | no | `false` | FL `#chk-portability` | No | Buyer-level |
| `status` | text | no | `'active'` | new | No | `active` \| `archived` |
| `created_at` / `updated_at` | timestamptz | no | `now()` | new | — | |

## Design notes

**Portability data is buyer-level, and this matters.** Phase 1 flagged `prior-market` / `prior-assessed` as ambiguous. They are unambiguously buyer-level: they describe a house the buyer used to own. Placing them here means a buyer with $500,000 of portable Save Our Homes benefit carries it to every property they evaluate — which is the correct behavior and is impossible if the fields sit on the property.

**`homestead_intent` is nullable on purpose.** The FL tool defaults its checkbox to **checked** (line 405). Carrying that default silently into a buyer record would assert a homestead election you never discussed. NULL means "not established," and the UI should require an explicit answer before an `fl_millage` calculation runs.

**Deliberately absent, and permanently prohibited:** SSN, DOB, government ID, bank account or card numbers, credentials, credit reports, paystubs, W-2s, tax returns, bank or asset statements, uploaded documents, and any URLA/1003 field not consumed by a calculation. Confirmed against Section 20.

---

# 5. SHOPPING PLAN / SHOPPING ASSUMPTIONS SCHEMA

**Purpose:** the buyer's stated strategy and estimated costs used to answer *"what price range should this buyer comfortably shop in?"* — before any property exists.

| Field | Type | Null | Default | Source | Notes |
|---|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | new | PK |
| `buyer_profile_id` | uuid | no | — | new | FK |
| `owner_user_id` | uuid | no | `auth.uid()` | new | RLS |
| `plan_label` | text | no | `'Original Plan'` | new | "Original Plan", "Revised — more cash preserved" |
| `is_active` | boolean | no | `true` | new | **Exactly one true per buyer** (partial unique index) |
| `target_payment` | numeric(12,2) | no | — | `#target` | Target PITI. Prod default 3,200 |
| `dp_target_value` | numeric(12,2) | yes | null | `#dpTarget` | **Value as entered — never converted** |
| `dp_target_unit` | text | yes | null | `unitState.dp` | `percent` \| `amount`. **Mandatory companion.** See Section 16 |
| `planned_stay_years` | smallint | no | `7` | `#stay` | 2/3/5/7/10/15/20/30 |
| `buyer_priority` | text | no | `'balanced'` | `#priority` | `balanced` \| `payment` \| `cash` \| `power` |
| `tax_method` | text | no | `'flat_rate'` | new | FK → `tax_method`. **Shopping plans are `flat_rate`** — see Section 13.5 |
| `tax_rate_pct` | numeric(7,4) | yes | `1.2000` | `#taxRate` (% mode) | Annual % of price |
| `tax_annual_amount` | numeric(12,2) | yes | null | `#taxRate` ($ mode) | Annual dollars |
| `tax_input_unit` | text | no | `'percent'` | `unitState.tax` | `percent` \| `amount`. **Mandatory** |
| `hoi_monthly` | numeric(10,2) | yes | `150.00` | `#hoi` | |
| `hoa_monthly` | numeric(10,2) | yes | null | `#hoa` | |
| `hoa_status` | text | no | `'unknown'` | `#hoaNA` | `unknown` \| `confirmed_none` \| `known`. **Three-state — see below** |
| `cdd_monthly` | numeric(10,2) | yes | null | `#cdd` | |
| `cdd_status` | text | no | `'unknown'` | `#cddNA` | Same |
| `flood_monthly` | numeric(10,2) | yes | null | `#flood` | |
| `flood_status` | text | no | `'unknown'` | `#floodNA` | Same |
| `rate_conv` | numeric(6,3) | yes | null | `#rateConv` | NULL = inherit from assumption set |
| `rate_fha` | numeric(6,3) | yes | null | `#rateFha` | Same |
| `rate_va` | numeric(6,3) | yes | null | `#rateVa` | Same |
| `closing_cost_pct` | numeric(5,2) | yes | null | `#ccPct` | NULL = inherit (prod default 3.00) |
| `assumption_set_id` | uuid | no | — | new | FK — the set active when the plan was created |
| `created_at` / `updated_at` | timestamptz | no | `now()` | new | |
| `superseded_at` | timestamptz | yes | null | new | Set when deactivated |

## Versioning answer: append-only rows, one active

**Do not overwrite. Do not build a diff/version-history system.** When the buyer moves from a $3,000 to a $3,250 comfort payment, insert a new `shopping_plan` row, set the old one's `is_active = false` and `superseded_at = now()`.

| Property | Result |
|---|---|
| Historical reproducibility | Full — the original row is never mutated |
| Complexity added | One table, one boolean, one partial unique index |
| Query for "the plan in force" | `WHERE buyer_profile_id = ? AND is_active` |
| Query for "the plan this scenario used" | `property_scenario.shopping_plan_id` — direct FK |

Rejected alternatives: overwriting the row (fails the requirement outright); a `shopping_plan_revision` child table (same information, one more join, no benefit); event-sourcing the changes (materially more complexity for a single-operator tool).

## The three-state cost fields

The current model pairs a value with an N/A checkbox, and `updateInlineHints` destroys the value when the box is ticked (finding C-4b). But the *semantics* are genuinely three-valued, and the tool already relies on that — the confidence heuristic at lines 1432–1434 distinguishes "unknown" from "confirmed none":

| `*_status` | `*_monthly` | Meaning | Engine treats as |
|---|---|---|---|
| `unknown` | NULL | Not yet researched | 0, and **counts toward the low-confidence flag** |
| `confirmed_none` | NULL | Verified there is none | 0, high confidence |
| `known` | value | Verified amount | the value |

Storing this as a bare number would collapse "I haven't checked" and "there is none" into the same zero and silently destroy the confidence signal the tool already computes. The value column stays NULL in both zero cases, so **there is nothing for a status change to overwrite** — the C-4(b) destruction becomes structurally impossible rather than merely fixed.

---

# 6. PROPERTY SCHEMA

**Purpose:** stable identity of a physical address. Deliberately thin.

| Field | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | PK |
| `buyer_profile_id` | uuid | no | — | FK |
| `owner_user_id` | uuid | no | `auth.uid()` | RLS |
| `label` | text | no | — | "123 Main Street" — display handle |
| `address_line1` | text | yes | null | |
| `address_line2` | text | yes | null | |
| `city` | text | yes | null | |
| `state` | char(2) | no | `'FL'` | |
| `postal_code` | text | yes | null | |
| `county` | text | yes | null | **Required for FL millage and county FHA limits.** See Section 3.2(c) |
| `property_type` | text | yes | null | `single_family` \| `condo` \| `townhome` \| `multi_unit` \| `manufactured` |
| `mls_number` | text | yes | null | Optional convenience |
| `status` | text | no | `'active'` | `active` \| `passed` \| `archived` |
| `created_at` / `updated_at` | timestamptz | no | `now()` | |

## What is NOT here, and why

| Field | Lives on | Reason |
|---|---|---|
| `list_price` | Property Scenario | Prices get reduced. On the Property it would retroactively rewrite historical scenarios |
| Taxes, insurance, HOA, CDD, flood | Property Scenario | These are *assumptions about* the property that can legitimately be revised between scenarios |
| Millage, assessments | Property Scenario tax snapshot | Same — and they must be frozen per scenario for reproducibility |
| Offer price, concessions | Negotiation Round | Section 8 |

`property_type` is **not** consumed by any current calculation — the audit found occupancy and property type are not modeled at all, and the conventional concession limit ignores the 2% investment-property cap (finding #36). It is captured here as workflow metadata and as the enabling field for that future correction.

---

# 7. PROPERTY SCENARIO SCHEMA

**Purpose:** one complete, reproducible strategy analysis of one property. This is the central table.

| Field | Type | Null | Default | Source | Notes |
|---|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | new | PK |
| `property_id` | uuid | no | — | new | FK |
| `buyer_profile_id` | uuid | no | — | new | FK — denormalized for RLS and query simplicity |
| `shopping_plan_id` | uuid | no | — | new | **FK — which plan this was evaluated against** |
| `owner_user_id` | uuid | no | `auth.uid()` | new | RLS |
| `scenario_label` | text | no | `'Scenario 1'` | new | |
| **Mode and price** | | | | | |
| `analysis_mode` | text | no | `'property'` | new | `shopping` \| `property`. **Explicit — never inferred from a null price.** Resolves finding M-1 |
| `list_price` | numeric(12,2) | yes | null | `#price` | |
| **Assumption overrides — NULL means inherit from Shopping Plan** | | | | | |
| `tax_method` | text | yes | null | new | FK → `tax_method` |
| `hoi_monthly` | numeric(10,2) | yes | null | `#hoi` | |
| `hoa_monthly` / `hoa_status` | numeric / text | yes | null | `#hoa` / `#hoaNA` | Three-state as in Section 5 |
| `cdd_monthly` / `cdd_status` | numeric / text | yes | null | `#cdd` / `#cddNA` | |
| `flood_monthly` / `flood_status` | numeric / text | yes | null | `#flood` / `#floodNA` | |
| `rate_conv` / `rate_fha` / `rate_va` | numeric(6,3) | yes | null | `#rateConv/Fha/Va` | |
| `closing_cost_pct` | numeric(5,2) | yes | null | `#ccPct` | |
| `closing_cost_override_amount` | numeric(12,2) | yes | null | `#ccOverride` | **Property-specific — from an actual CD.** Note: engine ignores it in shopping mode (line 594) and `maxPriceForScenario` ignores it entirely (finding #4) |
| `target_payment` | numeric(12,2) | yes | null | `#target` | Override for this property only |
| `dp_target_value` / `dp_target_unit` | numeric / text | yes | null | `#dpTarget` / `unitState.dp` | Value + unit pair |
| `planned_stay_years` | smallint | yes | null | `#stay` | |
| `buyer_priority` | text | yes | null | `#priority` | |
| `dti_override_enabled` / `_front` / `_back` / `_source` | bool / numeric / numeric / text | yes | null | new | Section 15 |
| **Dates** | | | | | |
| `closing_date` | date | yes | null | new | Section 14 |
| `occupancy_date` | date | yes | null | new | Section 14 |
| **Tax** | | | | | |
| `tax_inputs` | jsonb | yes | null | new | Method-specific inputs. Section 12 |
| `tax_outputs` | jsonb | yes | null | new | Reproducible results. Section 12 |
| `tax_method_version` | smallint | yes | null | new | |
| `qualifying_tax_basis` | text | no | `'projected_reassessed'` | new | **L-7.** `projected_reassessed` \| `seller_current` \| `stabilized_homestead`. Default drives qualification PITI; retained for lender/program override |
| **Reproducibility** | | | | | |
| `assumption_set_id` | uuid | no | — | new | **FK to an immutable set** |
| `assumption_overrides` | jsonb | yes | null | new | Only the constants the user actually changed |
| `engine_version` | text | no | — | new | e.g. `bse-2.0.0` |
| `resolved_inputs` | jsonb | yes | null | new | Optional full resolved `inp` at last save. Section 11.4 |
| **Results cache — display only, never authoritative** | | | | | |
| `result_summary` | jsonb | yes | null | new | Recommended program, PITI, cash to close, binding constraint |
| `results_computed_at` | timestamptz | yes | null | new | |
| **Workflow** | | | | | |
| `status` | text | no | `'draft'` | new | `draft` \| `presented` \| `under_contract` \| `closed` \| `passed` \| `archived` |
| `is_accepted_property` | boolean | no | `false` | new | The "Accepted Property" in your tree |
| `created_at` / `updated_at` | timestamptz | no | `now()` | new | |

## Inheritance resolution

At calculation time, in memory only:

```
resolve(field) = property_scenario.field
              ?? shopping_plan.field
              ?? assumption_set.field
              ?? engine hardcoded default
```

**The resolution result is never written back to the Shopping Plan.** That single rule is the mechanical implementation of Decision L-1 and the fix for finding C-4(c).

## What is deliberately not stored

**Program scenario results.** The Conv 5% / FHA 3.5% / VA 0% cards are regenerated by the Engine from the stored inputs on every open. `result_summary` caches the headline for list views only and is explicitly non-authoritative — if it ever disagrees with a recomputation, the recomputation wins. This is what prevents a second source of truth from forming against the Engine.

---

# 8. OFFER / NEGOTIATION HISTORY RECOMMENDATION

## Recommendation: **Option B — separate child records.** Deliberately thin.

## Why not Option A

The current BSE holds exactly **one** offer (`#offerPrice`, `#offerConc`) and **one** counter (`#counterPrice`, `#counterConc`, `#counterLoan`) as flat fields. To record "Seller Counter #2" you must overwrite Counter #1 — destroying precisely the history you asked to preserve. Option A cannot represent your own stated sequence.

## The minimum viable structure

**`negotiation_round`**

| Field | Type | Null | Default | Source | Notes |
|---|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | new | PK |
| `property_scenario_id` | uuid | no | — | new | FK |
| `owner_user_id` | uuid | no | `auth.uid()` | new | RLS |
| `round_number` | smallint | no | — | new | 1, 2, 3… Unique per scenario |
| `actor` | text | no | — | new | `buyer` \| `seller` |
| `price` | numeric(12,2) | no | — | `#offerPrice` / `#counterPrice` | The price on the table this round |
| `concession_value` | numeric(12,2) | yes | null | `#offerConc` / `#counterConc` | **As entered** |
| `concession_unit` | text | yes | null | `offerConcUnit.v` / `counterUnit.v` | `percent` \| `amount`. **Mandatory companion** |
| `negotiation_mode` | text | yes | null | `negMode` radios | `compare` \| `reduction` \| `concession` \| `split`. Buyer rounds only |
| `loan_program_override` | text | yes | null | `#counterLoan` | `auto` \| `fha3.5` \| `conv5` \| `conv10` \| `conv20` \| `va0` |
| `manual_split_buydown` | numeric(12,2) | yes | null | `#concBuydown` | See caveat below |
| `manual_split_costs` | numeric(12,2) | yes | null | `#concCosts` | |
| `manual_split_enabled` | boolean | no | `false` | `concSplit.auto` inverted | |
| `is_accepted` | boolean | no | `false` | new | **≤ one true per scenario** (partial unique index) |
| `result_summary` | jsonb | yes | null | new | Cached headline for this round |
| `note` | text | yes | null | new | Free text |
| `created_at` | timestamptz | no | `now()` | new | |

**Your sequence maps directly:**

```
123 Main Street → Scenario 1
   round 1  actor=buyer   price 490,000  concession 5,000 amount   mode=concession
   round 2  actor=seller  price 495,000  concession 2,000 amount
   round 3  actor=buyer   price 492,500  concession 4,000 amount
   round 4  actor=seller  price 493,000  concession 3,000 amount   is_accepted=true
```

## What this deliberately is not

No status machine, no expiry dates, no counterparty records, no document links, no deadlines, no task list. A round is a price, a concession, and who said it. Everything else is derived by the existing Negotiation Engine, Offer Strategy, Counter Offer Analyzer, and seller-net-value math from the scenario plus the round.

## Two things this exposes

**The manual split fields are currently near-inert.** Finding C-9 established that `#concBuydown` / `#concCosts` never reach `gatherInputs` and are read at exactly one place (line 2205). Persisting them stores a value the engine largely ignores. **Recommendation: reserve the columns, and do not surface manual split in the redesigned UI until C-9 is fixed** — otherwise the saved value misrepresents what produced the recommendation. Documented, not fixed.

**Seller net value is computed, not stored.** `netVal = (list − counter_price) + counter_concession` (line 2726) derives entirely from data already in the round and the scenario. Storing it would duplicate a value that finding **C-8** proves is currently computed incorrectly — the `change` figure omits the buyer's own concession ask. Deriving it means the C-8 fix improves historical rounds automatically; storing it would freeze the wrong number into the record permanently. **Derive it.**

---

# 9. SYSTEM / PROGRAM SETTINGS ARCHITECTURE

## 9.1 `program_assumption_set` — immutable, versioned, global

| Field | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | PK |
| `version_label` | text | no | — | `2026.07-baseline` |
| `effective_from` | date | no | — | |
| `is_current` | boolean | no | `false` | Exactly one true |
| `payload` | jsonb | no | — | The full constant set |
| `notes` | text | yes | null | What changed and why |
| `created_at` | timestamptz | no | `now()` | |

**Rows are INSERT-only. Never UPDATE a payload.** That single discipline is what makes every historical scenario reproducible, because a scenario's FK points at a row that cannot change underneath it.

## 9.2 Seed version 1 — the audited production values, verbatim

Re-verified against source 2026-07-28. This becomes `2026.07-baseline`.

```jsonc
{
  "engine": { "term_months": 360 },                        // N, line 533

  "programs": {
    "conv": { "min_score": 620, "dti_front": 28, "dti_back": 45 },   // line 610
    "fha":  { "min_score": 500, "dti_front": 31, "dti_back": 43 },   // line 628
    "va":   { "min_score": 0,   "dti_front": 41, "dti_back": 41 }    // line 632
  },

  "mi": {
    "fha_ufmip_pct": 1.75,                                  // A_CONST line 1135
    "fha_annual_high_pct": 0.55,                            // LTV > 95
    "fha_annual_low_pct": 0.50,                             // LTV <= 95
    "fha_mip_drop_month": 132,                              // line 654, dp >= 10%
    "va_funding_fee_first_pct": 2.15,                       // line 1136
    "va_funding_fee_sub_pct": 3.30,
    "pmi_ltv_bands": { "a": "> 95", "b": "> 90", "c": "> 85", "d": "> 80.0001" },
    "pmi_table": {                                          // lines 565-574
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
    "conforming": 766550,                                   // line 1137 — 2024 vintage
    "fha_national_floor": 498257,                           // line 1137 — 2024 national FLOOR
    "fha_limit_is_county_specific": false                   // documents the known gap
  },

  "concession_limits_pct": {                                // lines 599-606
    "fha": 6, "va": 4,
    "conv": [ { "ltv_gt": 90, "pct": 3 }, { "ltv_gte": 75, "pct": 6 }, { "else": 9 } ]
  },

  "costs": { "closing_cost_pct_default": 3.00 },            // #ccPct line 389

  "rates_default": { "conv": 6.750, "fha": 6.250, "va": 6.125 },  // lines 384-386

  "buydown": { "pct_per_point": 0.25, "rate_rounding": 0.125 },   // line 952 / round125 line 551
                                                            // NOTE: Staging uses 0.24 — NOT adopted

  "decision_thresholds": {
    "step_up_min_payment_saving": 150,                      // line 877
    "step_up_max_payback_months": 36,                       // line 877
    "reserve_preference_floor": 500,                        // line 884
    "reserve_warning_floor": 1000,                          // line 1832
    "near_tie_cash": 250, "near_tie_payment": 50, "near_tie_financing": 2500,  // lines 900-902
    "tiebreak_cash_delta": 2000, "tiebreak_financing_delta": 2500              // lines 909-912
  },

  "tax_defaults": { "flat_rate_pct": 1.20 },                // #taxRate line 400

  "fl_tax_constants": {                                     // property-tax.html
    "homestead_band1": 25000,                               // line 636
    "homestead_band2_threshold": 50000,                     // line 637
    "portability_cap": 500000,                              // line 628
    "mills_divisor": 1000,                                  // lines 612, 639
    "school_blend_divisor": 2                               // line 638 — documented approximation
  }
}
```

## 9.3 Snapshot versus dynamic reference — the rule

> **Snapshot** anything that (a) can change outside the user's control **and** (b) changes a number.
> **Reference dynamically** only what cannot change a number.

| Category | Treatment |
|---|---|
| Rates, PMI table, MIP, funding fees, loan limits, DTI ratios, concession limits, buydown ratio, closing-cost default, term, decision thresholds, FL tax constants | **Snapshot** via `assumption_set_id` |
| User-typed overrides of any of the above | **Snapshot** via `assumption_overrides` jsonb |
| Program labels, colors, help text, UI copy, sort order | **Reference dynamically** — cosmetic only |
| Buyer name, property address, workflow status | **Reference dynamically** — a corrected address should appear everywhere |

The `assumption_overrides` blob holds only the deltas the user actually entered — typically two or three keys, not fifty:

```jsonc
{ "rates_default.conv": 6.875, "costs.closing_cost_pct_default": 2.75 }
```

## 9.4 What must never live in a scenario row

DTI defaults, loan limits, MIP and funding-fee constants, PMI tables, concession limits, and default closing costs are **program settings, not buyer data**. They are referenced by ID, never copied field-by-field onto the buyer. This is the direct implementation of your Decision L-2.

---
# 10. COMPLETE EXISTING-INPUT → FUTURE-FIELD MAPPING

Every input element, every derived value, and every piece of module state in the production BSE, plus the FL tax tool. Nothing omitted for being minor.

**Owner key:** BP = Buyer Profile · SP = Shopping Plan · PR = Property · PS = Property Scenario · NR = Negotiation Round · SYS = System/Program Setting · UI = Temporary UI State · DNP = Do Not Persist

## 10.1 BSE form inputs read by `gatherInputs`

| # | DOM id | Line | Purpose | Type | Unit | Prod default | Proposed owner | Snapshot? | Why |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `price` | 344 | List price **and** the mode switch | number | $ | *(blank)* | **PS** `list_price` | No | Property fact. **Mode moves to explicit `analysis_mode`** — resolves M-1 |
| 2 | `score` | 345 | FICO | integer | points | `740` | **BP** | No | Buyer fact; corrections should propagate |
| 3 | `ownFunds` | 346 | Buyer's own cash | number | $ | `40,000` | **BP** | No | Buyer fact |
| 4 | `gift` | 347 | Gift funds | number | $ | `0` | **BP** | No | Separate — drives `requiresGift` (847) |
| 5 | `totalFunds` | 348 | Sum display | readonly | $ | `40,000` | **DNP** | — | Derived: `own + gift` (1180). Written by `updateInlineHints` 1204 |
| 6 | `dpTarget` | 350 | Preferred down payment | number | % or $ | *(blank)* | **SP** + **PS** override | No | **Requires `dp_target_unit` companion.** Section 16 |
| 7 | `target` | 352 | Target PITI | number | $/mo | `3,200` | **SP** + **PS** override | No | Stated intent — revisable |
| 8 | `income` | 353 | Qualifying income | number | $/mo | `9,500` | **BP** | No | Exact required — DTI |
| 9 | `debts` | 354 | Monthly debts | number | $/mo | `650` | **BP** | No | Exact required — DTI |
| 10 | `stay` | 356 | Planned stay | select | years | `7` | **SP** + **PS** override | No | **Switches the decision regime** (896–899) |
| 11 | `priority` | 363 | Buyer priority | select | enum | `balanced` | **SP** + **PS** override | No | Drives 6 decision points |
| 12 | `tgFthb` | 371 | First-time buyer | checkbox | bool | unchecked | **BP** | No | Unlocks Conv 3% |
| 13 | `tgVa` | 372 | VA eligible | checkbox | bool | unchecked | **BP** | No | Gates VA entirely |
| 14 | `vaUse` | 375 | First / subsequent use | select | enum | `first` | **BP** | No | 2.15% vs 3.30% |
| 15 | `vaExempt` | 376 | Disability exemption | checkbox | bool | unchecked | **BP** | No | **Sensitive — boolean only** |
| 16 | `rateConv` | 384 | Conventional rate | number | % | `6.750` | **SYS** default → **SP**/**PS** override | **Yes** | Market value — must freeze |
| 17 | `rateFha` | 385 | FHA rate | number | % | `6.250` | Same | **Yes** | Same |
| 18 | `rateVa` | 386 | VA rate | number | % | `6.125` | Same | **Yes** | Same |
| 19 | `ccPct` | 389 | Closing costs | number | % of base loan | `3` | **SYS** default → **SP**/**PS** override | **Yes** | Assumption that changes |
| 20 | `ccOverride` | 390 | Closing cost $ override | number | $ | *(blank)* | **PS** | No | Property-specific, from a CD. **Ignored in shopping mode (594) and by `maxPriceForScenario` (finding #4)** |
| 21 | `taxRate` | 400 | Tax rate or annual $ | number | % or $ | `1.20` | **SP** (flat) + **PS** (method-specific) | **Yes** | **Requires `tax_input_unit`.** Section 12 |
| 22 | `hoi` | 402 | Homeowners insurance | number | $/mo | `150` | **SP** + **PS** override | No | |
| 23 | `hoa` | 403 | HOA | number | $/mo | `0` | **SP** + **PS** override | No | Pairs with `hoa_status` |
| 24 | `hoaNA` | 403 | HOA N/A confirmation | checkbox | bool | **checked** | **SP**/**PS** `hoa_status` | No | **Three-state — Section 5.** Fixes C-4(b) |
| 25 | `cdd` | 404 | CDD | number | $/mo | `0` | **SP** + **PS** override | No | |
| 26 | `cddNA` | 404 | CDD N/A | checkbox | bool | **checked** | `cdd_status` | No | |
| 27 | `flood` | 405 | Flood insurance | number | $/mo | `0` | **SP** + **PS** override | No | |
| 28 | `floodNA` | 405 | Flood N/A | checkbox | bool | **checked** | `flood_status` | No | |
| 29 | `offerPrice` | 449 | Buyer's offer | number | $ | *(blank)* | **NR** (`actor=buyer`) | No | Section 8 |
| 30 | `reqAdj` | 450 | Required adjustment | readonly | $ | `0` | **DNP** | — | Derived; written by `updateInlineHints` 1257 |
| 31 | `offerConc` | 452 | Seller concession ask | number | $ or % | `0` | **NR** `concession_value` | No | **Requires `concession_unit`** |
| 32 | `negMode` radios | 456–459 | Negotiation mode | radio | enum | `concession` | **NR** `negotiation_mode` | No | |
| 33 | `concBuydown` | 466 | Manual split → buydown | number | $ | `0` | **NR** (reserved) | No | **Near-inert — C-9.** Reserve, do not surface |
| 34 | `concCosts` | 467 | Manual split → costs | number | $ | `0` | **NR** (reserved) | No | Same |
| 35 | `counterPrice` | 498 | Seller's counter | number | $ | *(blank)* | **NR** (`actor=seller`) | No | |
| 36 | `counterLoan` | 500 | Program override | select | enum | `auto` | **NR** `loan_program_override` | No | `auto`/`fha3.5`/`conv5`/`conv10`/`conv20`/`va0` |
| 37 | `counterConc` | 507 | Counter concession | number | $ or % | `0` | **NR** | No | **Requires unit companion** |

## 10.2 Derived values inside `gatherInputs` — none persisted

| Derived property | Line | Formula | Owner |
|---|---|---|---|
| `shopping` | 1144 | `rawBlank('price')` | **DNP** → replaced by explicit `analysis_mode` |
| `funds` | 1180 | `ownFunds + gift` | **DNP** — recompute |
| `taxRaw` / `taxIsDollar` / `taxRate` / `taxMonthly` / `taxFixed` | 1155–1164 | Unit-dependent derivation | **DNP** — recompute from `(value, unit)` |
| `negotiatingRoom` | 1168 | `listP − offerP` when `offerP < listP` | **DNP** — recompute |
| `sellerConcession` | 1173 | `%` → `round(pct/100 × base)` | **DNP** — recompute. **Note the `%` base floats** (offer if present, else list) |
| `dpTarget {isPct,pct,dollar}` | 1147–1150 | Unit-dependent | **DNP** — replaced by `(value, unit)` |
| `appliedPath` / `appliedReduction` / `appliedConcession` / `concessionOn` / `concession` | 2410–2416 | Mutated onto `inp` after `Engine.run` | **DNP** — derived per render. `appliedReduction` is written and never read (finding #44) |

## 10.3 Module-level state — the hidden layer

| Variable | Line | Role | Owner | Snapshot? | Why |
|---|---|---|---|---|---|
| `unitState.dp` | 1091 | Interpretation of `#dpTarget` | **SP**/**PS** `dp_target_unit` | No | **Mandatory. Without it `"20"` is ambiguous** |
| `unitState.tax` | 1091 | Interpretation of `#taxRate` | **SP**/**PS** `tax_input_unit` | No | Same |
| `offerConcUnit.v` | 1093 | Interpretation of `#offerConc` | **NR** `concession_unit` | No | Same |
| `counterUnit.v` | 2475 | Interpretation of `#counterConc` | **NR** `concession_unit` | No | Same |
| `concSplit` | 1102 | Manual split + auto flag | **NR** (reserved) | No | Clobbered every recalc today (finding #19) |
| `appliedConcTotal` | 1104 | Concession deployed this cycle | **DNP** | — | Derived |
| `gapSel` | 1086 | Gap Solver tab | **UI** | — | Session-only |
| `prevSnapshot` | 2349 | Change-log previous state | **DNP** | — | |
| `changeLog` | 2349 | In-memory change list | **DNP** *(see note)* | — | **Timestamps are `hour:minute` only** — not orderable across days. Would require ISO rewrite before it could ever be persisted. Not recommended for Phase 3 |
| `firstCalcDone` / `seq` | 2349 | Log bookkeeping | **DNP** | — | `seq` resets every page load |

**None of the four unit variables appear in `FIELD_LABELS`**, so even the existing in-memory snapshot is lossy. Promoting them to first-class persisted columns is the single most important correction in this mapping.

## 10.4 FL Property Tax tool inputs

| # | DOM id | Line | Purpose | Type | Unit | Default | Proposed owner | Snapshot? | Why |
|---|---|---|---|---|---|---|---|---|---|
| 38 | `client-input` | 330 | Client name search | text | — | none | **DNP** | — | Reads the dead `hws_clients` key. **Retire — Section 20** |
| 39 | `prop-address` | 339 | Property address | text | — | none | **PR** `address_line1` | No | Not used in tax math today |
| 40 | `purchase-price` | 360 | Purchase price = assessed value | number | $ | none | **PS** `list_price` / offer price | No | **Required.** Used 1:1 as just value |
| 41 | `current-bill` | 377 | Seller's current annual bill | number | $/yr | none | **PS** `tax_inputs` | **Yes** | Only proxy for the seller's Jan-1 roll |
| 42 | `millage-rate` | 384 | Millage | number | mills | none | **PS** `tax_inputs` | **Yes** | **Required.** County-specific, changes annually |
| 43 | `non-ad-val` | 391 | Non-ad-valorem assessments | number | $/yr | none | **PS** `tax_inputs` | **Yes** | Flat add-on |
| 44 | `chk-homestead` | 405 | Buyer will file homestead | checkbox | bool | **checked** | **BP** `homestead_intent` | **Yes** (into tax snapshot) | **Buyer-level.** Default NULL, not checked — Section 4 |
| 45 | `chk-portability` | 411 | Applying SOH portability | checkbox | bool | unchecked | **BP** `portability_eligible` | **Yes** | Buyer-level |
| 46 | `prior-market` | 417 | Prior home market value | number | $ | none | **BP** | **Yes** | **Buyer-level — the buyer's prior home** |
| 47 | `prior-assessed` | 422 | Prior home assessed (TRIM) | number | $ | none | **BP** | **Yes** | Same |

## 10.5 Net-new fields with no current equivalent

| Field | Owner | Why it must exist |
|---|---|---|
| `display_name` / buyer identity | BP | **No buyer identity field exists anywhere in the BSE.** Nothing else unlocks Buyer Profiles |
| `owner_user_id` | all | RLS anchor |
| `analysis_mode` | PS | Removes the `price`-as-mode-switch overload (M-1) |
| `closing_date` / `occupancy_date` | PS | Section 14 |
| `tax_method` / `tax_inputs` / `tax_outputs` / `tax_method_version` | SP/PS | Section 12 |
| `qualifying_tax_basis` | PS | **L-7** — which FL figure drives qualification PITI |
| `dti_override_*` (4 fields) | BP + PS | Section 15 |
| `*_status` for HOA / CDD / flood | SP/PS | Three-state semantics |
| `assumption_set_id` / `assumption_overrides` / `engine_version` | PS | Reproducibility |
| `shopping_plan_id` | PS | Which plan this was evaluated against |
| `county` | PR | FL millage + county FHA limits |
| `property_type` | PR | Reserved for the occupancy/investment concession gap (finding #36) |
| `round_number` / `actor` / `is_accepted` | NR | Negotiation history |
| `status` / `is_accepted_property` | PR / PS | Workflow |
| `created_at` / `updated_at` | all | Nothing today has a usable timestamp |

## 10.6 Mapping summary

| Owner | Count |
|---|---|
| Buyer Profile | 14 mapped + 10 net-new |
| Shopping Plan | 12 mapped (+ overrides) |
| Property | 2 mapped + 4 net-new |
| Property Scenario | 4 mapped + 16 override/net-new |
| Negotiation Round | 9 mapped + 3 net-new |
| System / Program Setting | 4 mapped (as defaults) |
| Temporary UI State | 1 |
| Do Not Persist | 15 |

---
# 11. SNAPSHOT / REPRODUCIBILITY STRATEGY

## 11.1 The two questions a saved scenario must answer

1. **"Why was it $3,030?"** — reproduce the historical result exactly.
2. **"What would it be today?"** — recompute under current assumptions **without destroying the answer to question 1**.

## 11.2 The mechanism

A scenario stores **inputs** plus **three reproducibility keys**:

| Key | Purpose |
|---|---|
| `assumption_set_id` | FK to an immutable constants row |
| `assumption_overrides` | JSONB of only the constants the user changed |
| `engine_version` | Which calculation engine build produced it |

Because `program_assumption_set` rows are INSERT-only, the constants a scenario points at **cannot change underneath it**. There is no scheduled job, no cascade, no silent recalculation. Updating the rate board inserts a new set and flips `is_current`; every existing scenario keeps pointing at the old one.

## 11.3 "Recalculate with today's assumptions" is an explicit action

```
User opens "123 Main Street — Scenario 1"  (assumption_set 2026.07-baseline)
   → resolves and displays the historical result: PITI $3,030
   → banner: "Calculated 2026-07-28 using assumptions 2026.07-baseline"

User clicks "Recalculate with today's assumptions"
   → INSERT a NEW property_scenario row
       copies all inputs
       sets assumption_set_id = current set
       sets scenario_label = "Scenario 1 (recalculated 2026-11-04)"
       sets parent_scenario_id = <original id>
   → the original row is untouched and still reachable
```

One nullable `parent_scenario_id` column supports this. **No revision-history table, no diff engine, no event log.**

## 11.4 Why ordinary edits are not versioned

You edit a scenario constantly while working a deal. Making every keystroke immutable would be absurd. The design therefore allows scenario rows to be **freely mutable**, and reproducibility still holds — because the assumptions travel with the row and only change when you deliberately change them.

If you want a frozen record of what a client was actually shown, `status = 'presented'` can trigger an optional `resolved_inputs` write: the fully-resolved `inp` object at that moment. That is one JSONB column and it is optional.

**Trade-off, stated honestly:** this design does **not** give you a history of your own edits. If you change the target payment from $3,200 to $3,000 on a saved scenario, the previous value is gone. Preserving that would require a revision table. My recommendation is to accept the loss — the current tool retains nothing at all, and the requirement you stated is reproducing *the assumptions behind a recommendation*, which this satisfies.

## 11.5 Snapshot decision table

| Value | Treatment | Why |
|---|---|---|
| Interest rates | **Snapshot** | Change weekly; change every number |
| PMI table | **Snapshot** | Changes with MI company pricing |
| FHA MIP / UFMIP / VA funding fee | **Snapshot** | Change by mortgagee letter |
| Loan limits | **Snapshot** | Change annually — currently 2024 vintage |
| Program DTI ratios | **Snapshot** | Investor guideline changes |
| Concession limits | **Snapshot** | Agency guideline changes |
| Buydown ratio (0.25) | **Snapshot** | **Actively disputed — Live 0.25 vs Staging 0.24 (C-5)** |
| Closing-cost % default | **Snapshot** | Market-driven |
| Loan term (360) | **Snapshot** | Would change if 15-year is added |
| Decision thresholds ($150/36mo, $500, near-tie windows) | **Snapshot** | Change the *recommendation*, not just the numbers |
| FL tax constants + method | **Snapshot** | Statutory; and the whole point of Q-1 |
| Engine version | **Snapshot** | Logic changes independent of constants |
| Buyer name, address, labels, status | **Dynamic** | Corrections should propagate |
| Program labels, colors, copy | **Dynamic** | Cosmetic |

## 11.6 What breaks reproducibility if omitted

Two easily-overlooked items:

- **Decision thresholds.** The $150/36-month step-up rule and the near-tie windows do not change any dollar figure — they change *which program is recommended*. A scenario that reproduces the numbers but recommends a different program has not been reproduced. They must be in the snapshot.
- **Engine version.** Finding #34 established that `pickBestOverall`'s comparator is non-transitive; sort results are order-dependent with three or more near-tied scenarios. Any future correction to that comparator legitimately changes recommendations with identical inputs and identical constants. Only `engine_version` records that.

---

# 12. TAX METHOD ARCHITECTURE

## 12.1 The discriminator

**`tax_method` lookup table, not a Postgres ENUM.**

| Field | Type | Notes |
|---|---|---|
| `code` | text | PK — `flat_rate`, `fl_millage` |
| `label` | text | Display |
| `current_version` | smallint | Bumped when the method's math changes |
| `is_active` | boolean | Retire a method without breaking history |
| `requires_fields` | jsonb | Which `tax_inputs` keys the method needs |

**Why not an ENUM:** extending a PG enum requires `ALTER TYPE`, cannot carry metadata, and cannot express "retired but still valid for historical rows." A lookup table gives extensibility, per-method versioning, and an active flag for free.

## 12.2 Method-specific payloads

`tax_inputs` and `tax_outputs` are JSONB, shaped by method. Adding a third method later is a new lookup row plus a new payload shape — **no schema migration, no impact on saved rows.**

**`flat_rate` — v1 (today's BSE)**

```jsonc
"tax_inputs":  { "method": "flat_rate", "version": 1,
                 "value": 1.20, "unit": "percent" },        // or "unit":"amount","value":6000
"tax_outputs": { "annual_tax": 5400.00, "monthly_tax": 450.00,
                 "scales_with_price": true }                // false when unit = "amount"
```

**`fl_millage` — v1 (future, mirroring the authoritative tool)**

```jsonc
"tax_inputs": { "method": "fl_millage", "version": 1,
  "purchase_price": 450000,          // property-tax.html line 591
  "millage": 18.2515,                // line 592
  "non_ad_valorem": 814.60,          // line 593
  "current_bill": 6987.09,           // line 594 — optional
  "homestead": true,                 // line 595
  "portability": true,               // line 596
  "prior_market": 400000,            // line 625
  "prior_assessed": 250000,          // line 626
  "constants": { "band1": 25000, "band2_threshold": 50000,
                 "portability_cap": 500000, "mills_divisor": 1000,
                 "school_blend_divisor": 2 } },
"tax_outputs": {
  "portability_benefit": 150000, "assessed_after_portability": 300000,
  "school_taxable": 275000, "non_school_taxable": 250000, "avg_taxable": 262500,
  "ad_valorem": 4791.02, "non_ad_valorem": 814.60,
  "annual_tax": 5605.62, "monthly_tax": 467.14,
  "reassessed_annual": 9027.35,        // L-7: THIS drives qualification PITI
  "current_bill_annual": 6987.09,      // informational only
  "homestead_annual": 5605.62,         // planning / display figure
  "scales_with_price": false }
```

**The `constants` block inside `tax_inputs` is deliberate.** It is small, it is statutory, and embedding it means an `fl_millage` scenario is reproducible even if the FL constants are later corrected in the assumption set — including the documented `school_blend_divisor: 2` approximation (finding C-10a). If that approximation is ever fixed, historical scenarios still show how they were actually computed.

## 12.3 `scales_with_price` — the field that makes the engine work

This boolean is not cosmetic. It maps directly onto the existing engine's protected branch at lines 735–738:

| `scales_with_price` | Engine term | Existing code |
|---|---|---|
| `true` | goes into **`k`** (per-dollar-of-price) | `taxPer = inp.taxRate/100/12` (736) |
| `false` | goes into **`b`** (fixed monthly) | `b = ... + (taxFixedHere ? inp.taxMonthly : 0)` (738) |

The engine already has both paths. The integration supplies the flag rather than new math. **No change to `maxPriceForScenario` is required.**

## 12.4 How `flat_rate` scenarios survive `fl_millage` arriving

They survive because nothing ever asks them to change:

1. `tax_method` is stored **per scenario**, not globally.
2. The engine dispatches on the stored value.
3. No migration rewrites `tax_method`; new scenarios default from the Shopping Plan.
4. Opening a 2026 `flat_rate` scenario in 2027 runs `flat_rate` v1 against its own snapshot.
5. Converting one is an explicit user action producing a **new row** (Section 11.3).

---

# 13. FLORIDA PROPERTY TAX INTEGRATION DESIGN

**No code ported. No tool modified. This is the connection design only.**

## 13.1 Which FL inputs must become available in the BSE

All eight calculation inputs, split by layer:

| FL tool input | Line | Layer | Rationale |
|---|---|---|---|
| `purchase-price` | 360 | **Already in BSE** | `#price` / offer price |
| `millage-rate` | 384 | **Property Scenario** | County and parcel specific |
| `non-ad-val` | 391 | **Property Scenario** | Parcel specific |
| `current-bill` | 377 | **Property Scenario** | The seller's roll for this parcel |
| `chk-homestead` | 405 | **Buyer Profile** | The buyer will or will not file |
| `chk-portability` | 411 | **Buyer Profile** | Buyer's status |
| `prior-market` | 417 | **Buyer Profile** | The buyer's prior home |
| `prior-assessed` | 422 | **Buyer Profile** | Same |

## 13.2 Shopping Plan versus Property Scenario

| Shopping Plan | Property Scenario |
|---|---|
| `tax_method = flat_rate` | `tax_method = flat_rate` **or** `fl_millage` |
| One rate (1.20% default) or an annual dollar amount | Full millage inputs when `fl_millage` |
| Answers "what range can they shop in?" | Answers "what will this house actually cost?" |
| **Must scale with price** | Price is known, so tax can be a fixed figure |

A Shopping Plan may optionally carry a *typical county millage* as a note, but it does not drive the shopping-range solve. See 13.5 for why.

## 13.3 Which outputs the BSE actually needs

**One number: monthly tax.** It feeds exactly two places in the protected Engine:

```js
669:  const taxes = (inp.taxFixed && inp.taxMonthly!=null) ? inp.taxMonthly : price*inp.taxRate/100/12;
736:  const taxPer = taxFixedHere ? 0 : inp.taxRate/100/12;
738:  const b = inp.hoi + inp.hoa + inp.cdd + inp.flood + (taxFixedHere ? inp.taxMonthly : 0);
```

Everything else the FL tool produces — the four cards, the breakdown table, the escrow comparison — is **presentation**, valuable to show the client but not consumed by the payment or strategy math.

## 13.4 Which tax details to retain for reproducibility

The full `tax_inputs` and `tax_outputs` payloads in Section 12.2. Rationale: `annual_tax` alone cannot be audited, cannot be explained to a client, and cannot be re-derived if the millage source is later disputed. The intermediate values (`portability_benefit`, `assessed_after_portability`, `school_taxable`, `avg_taxable`) are what let you answer "why is this number what it is?" three months later. They cost a few hundred bytes.

**Not retained:** anything about the borrower beyond the boolean flags. No client name, no prior address, no documents.

## 13.5 Shopping-range estimate vs property-specific calculation — the structural reason

This is the most consequential finding in the integration design.

The Engine solves maximum price closed-form by expressing PITI as a linear function of price:

```js
737:  const k = pf*L1 + miPer + taxPer;      // PITI per $1 of price
738:  const b = inp.hoi + ... + (taxFixedHere ? inp.taxMonthly : 0);   // fixed monthly
739:  const priceForPITI = P => k>0 ? (P - b)/k : Infinity;
```

A flat tax **rate** is a `k` term — it scales as price moves, which is exactly what solving for maximum price requires. A millage-derived tax is computed **from a known purchase price**; in Shopping Range Mode there is no price yet, so there is nothing to compute millage against. Feeding a fixed millage-derived dollar figure into `b` would answer *"what is the maximum price, assuming the tax of a house I have not chosen?"* — which is circular.

**Therefore the layering you locked in Decision L-1 is not merely good data hygiene. It is mathematically required:**

- **Shopping Range Mode → `flat_rate` always.** Tax scales with price. Max price solves correctly.
- **Property Strategy Mode → `fl_millage` permitted.** Price is known. Tax is a fixed figure in `b`, exactly like today's `taxFixed` branch.

This requires **no change to `maxPriceForScenario`** — a CRITICAL-risk function — because the engine already implements both paths.

## 13.6 The closed-form millage option — documented, not recommended now

For completeness: Florida millage tax is **affine** in purchase price, not merely fixed. With homestead and no portability, the tool's own math reduces to:

```
tax_annual ≈ (price − 37,500) × millage/1000 + non_ad_valorem      [for assessed ≥ $75,000]
```

which is `k·price + b` with `k = millage/1000/12` and `b = (−37,500 × millage/1000 + non_ad_valorem)/12`. So a future version *could* solve shopping range under millage closed-form.

**Not recommended for Phase 3.** It would modify `maxPriceForScenario` (CRITICAL risk), it breaks down below $75,000 assessed because of the documented band-floor defect (C-10b), and it inherits the school-blend approximation (C-10a). Recorded here so the option is not lost, and flagged as requiring separate written approval.

## 13.7 First-year and following-year representation

The authoritative tool has **no year dimension** — confirmed in the Phase 1 audit. Its three tax cards map naturally onto three time points, and the data model should reserve all three:

| Concept | FL tool source | Model |
|---|---|---|
| Seller's current bill | Card 1 — passthrough of `current-bill` | `tax_outputs.current_bill_annual` |
| Reassessed, no exemptions | Card 2 — `price × millage/1000 + nonAdVal` | `tax_outputs.reassessed_annual` |
| Stabilized with homestead | Card 3 — after exemptions and portability | `tax_outputs.homestead_annual` |

Reserving all three now means the Y1/Y2+ capability exists in the data whenever you decide how to use it.

**Which figure qualifies is settled by Decision L-7:** the **reassessed** figure (`reassessed_annual`) drives qualification PITI. `current_bill_annual` is informational only. `homestead_annual` is a planning and display figure.

**I am still not assigning these to tax years.** The tool implements no date logic — the January 1 / March 1 rule exists only as prose at line 401 — and inventing that mapping would be inventing tax logic, which you prohibited. L-7 settles *which figure qualifies*, not *which tax year each figure falls in*. That mapping remains deferred to the FL integration phase.

**`flat_rate` scenarios:** the method produces one figure, so `qualifying_tax_basis` is recorded as `projected_reassessed` and resolves to that single value. The discriminator is therefore populated on every scenario regardless of method, which keeps the qualification basis explicit and auditable even before FL integration exists.

## 13.8 How closing/occupancy date affects the model

Purely as a data dependency in this phase: the dates determine *which* of the three figures applies in the buyer's first twelve months. The model stores the dates and all three figures; the selection logic is deferred to the phase where you decide Q-1.

## 13.9 Does the BSE need both Y1 and Y2+ payment views?

**Architecturally: yes, reserve for both.** In Florida the gap between the seller's capped bill and the buyer's reassessed, post-homestead bill is routinely large enough to change a strategy conversation — and the tool's own escrow-change card exists precisely because that gap matters.

**Practically: L-7 settles the qualifying figure.** Qualification PITI uses the reassessed figure; the stabilized post-homestead figure is presented as the forward planning view; the seller's current bill is informational context only. The model stores all three plus `qualifying_tax_basis`. Exactly how the two views are laid out on screen remains a later-phase UI decision, but the numbers behind them are now locked.

---

# 14. CLOSING / OCCUPANCY DATE RECOMMENDATION

## Recommendation: **store both.** `closing_date` required for `fl_millage`; `occupancy_date` nullable, defaulting to `closing_date`.

## Derived from the rule the authoritative tool states in its own UI

`property-tax.html` line 401, verbatim:

> "**FL homestead timeline:** Buyer must own and occupy as of January 1 and file by March 1. Portability transfers the SOH benefit from a prior FL homestead, capped at $500K."

The rule has **two independent conditions** — *own* and *occupy* — and they are satisfied by two different events:

| Condition | Established by | Determines |
|---|---|---|
| **Own** as of January 1 | `closing_date` | Which January 1 triggers reassessment to just value on the change of ownership |
| **Occupy** as of January 1 | `occupancy_date` | Whether homestead can be claimed for that tax year |

They usually coincide, which is why one field feels sufficient. They diverge in cases you actually see: a buyer closes in November on a home needing renovation and moves in the following March. That buyer **owns** on January 1 but does **not occupy** on January 1 — so reassessment applies and homestead does not. A single date cannot express that.

**A single `closing_date` would silently grant homestead to a buyer who does not qualify** — producing a materially understated tax figure in exactly the scenario where the buyer is already carrying renovation costs.

## Schema

| Field | Type | Null | Default | Notes |
|---|---|---|---|---|
| `closing_date` | date | yes | null | **Required when `tax_method = fl_millage`** (application-level check) |
| `occupancy_date` | date | yes | null | NULL is interpreted as "same as closing" |

`occupancy_date` stays nullable rather than defaulting in the database so the model can distinguish "not asked" from "explicitly the same day."

## Explicitly not designed here

No date-based tax logic. The authoritative tool implements none — no closing-date input, no year branching, no lien-date handling. This section adds the **fields** the stated rule requires. The logic is Q-1 and belongs to a later, separately-approved phase.

---

# 15. DTI DEFAULT / OVERRIDE ARCHITECTURE

## 15.1 Defaults — the audited production values

| Program | Front | Back | Min score | Source |
|---|---|---|---|---|
| Conventional | 28 | **45** | 620 | line 610 |
| FHA | 31 | **43** | 500 | line 628 |
| VA | 41 | **41** | 0 | line 632 |

These live in `program_assumption_set.payload.programs` and are **never** copied onto buyer records.

**Front-end remains advisory.** The engine deliberately excludes it as a price ceiling (comment at 746–747) and surfaces it only as `frontFlag` (845). The override structure carries a front value for completeness, but supplying it does **not** make front-end binding. No DTI logic changes.

## 15.2 Recommended placement: **Buyer Profile is where it is authored; Property Scenario is where it is overridden and resolved**

```
resolve_dti(program) =
    property_scenario.dti_override  if enabled
 else buyer_profile.dti_override    if enabled
 else assumption_set.programs[program].dti_back
```

## 15.3 Why — evaluated against all three options you listed

**Buyer Profile — yes, as the primary home.** A DTI stretch above the program default comes from an automated underwriting decision (DU/LP Approve/Eligible), and a **pre-approval AUS run is property-agnostic** — it is run on a TBD property and follows the buyer to every house they look at. If the override lived only on the scenario, you would re-enter it for every property, and your Shopping Range — which has no property at all — could never reflect it. That last point is decisive: **the buyer's shopping range is exactly where an approved 50% DTI matters most**, and only a buyer-level override can reach it.

**Property Scenario — yes, as an override of the override.** Final AUS findings are run against a specific property and can differ from the pre-approval, particularly where property type or occupancy affects the decision. A nullable set of override columns on the scenario costs nothing and inherits when NULL — the same inheritance pattern already used for every other assumption. Consistency here is a feature: one resolution rule for the whole model.

**Loan Scenario — no, because the entity does not and should not exist.** As established in Section 3.2(b), the four-to-six program scenarios are **derived** at runtime by `PROGRAMS[x].scenarios(inp)` and re-derived on every `recalc`. There is no persisted loan record to attach an override to. Creating one to hold a DTI override would mean persisting engine outputs — violating the Phase 0 principle that persistence saves inputs — and would immediately create a second source of truth against the Engine.

If you ever need a *per-program* override (say, a conventional stretch that does not apply to FHA), the correct shape is a small JSONB on the existing rows:

```jsonc
"dti_override_by_program": { "conv": { "front": 35, "back": 50 } }
```

Not a new table. Recorded as a future option; the simple three-field form is recommended for Phase 3.

## 15.4 Schema and snapshot

Four fields on both Buyer Profile and Property Scenario:

| Field | Type | Default |
|---|---|---|
| `dti_override_enabled` | boolean | `false` |
| `dti_override_front` | numeric(5,2) | NULL |
| `dti_override_back` | numeric(5,2) | NULL |
| `dti_override_source` | text | NULL — e.g. "DU Approve/Eligible 2026-07-14" |

`dti_override_source` is not decoration. When you open a scenario months later showing a 50% back-end ratio, "why was this allowed?" is the first question, and a free-text findings reference answers it without storing any AUS document.

**Snapshot:** the *resolved* values used at calculation time belong in `resolved_inputs`; the program defaults are already covered by `assumption_set_id`. The override fields themselves are ordinary mutable data.

---

# 16. UNIT CONVERSION / CANONICAL VALUE ARCHITECTURE

## 16.1 The principle *(locked as Decision L-13)*

> **The canonical value is the `(value, unit)` pair.** Persist the canonical value only. Restore it directly. Convert only for display. **Never write a conversion back.**

### One precision point, recorded so implementation cannot misread the lock

Decision L-13 states that "unit toggles are presentation state only." That is correct and binding, but it requires one distinction to be explicit, because collapsing it would reintroduce the exact corruption the lock exists to prevent:

| Thing | Status |
|---|---|
| **The unit a value was entered in** (`dp_target_unit`, `tax_input_unit`, `concession_unit`) | **Part of the canonical value. Persisted. Not presentation state.** |
| **The unit currently displayed on screen** (the toggle position) | **Presentation state. Not persisted. Never mutates anything.** |

The reason this matters: `dp_target_value = 20` is meaningless on its own — it is either 20% or $20. In Shopping Range Mode there is no price to normalize against, so a percent **cannot** be reduced to a dollar amount, and a single-unit canonical form is not available. The canonical value is therefore inherently a pair, and the `CHECK ((dp_target_value is null) = (dp_target_unit is null))` constraint in Section 18.4 enforces that the pair is never split.

The toggle position is genuinely presentation-only, is not persisted, and on restore is derived from the stored unit. That is the design L-13 locks.

A buyer saying "20% down" and a buyer saying "$150,000 down" are expressing different intentions. Converting either destroys information. The current `setUnit` (lines 2807–2827) converts and writes back, which is why it is both destructive and lossy.

## 16.2 Canonical representation per affected field

| Field | Canonical storage | Units | Notes |
|---|---|---|---|
| Preferred down payment | `dp_target_value` + `dp_target_unit` | `percent` \| `amount` | Never converted at rest |
| Property tax (flat) | `tax_rate_pct` **or** `tax_annual_amount` + `tax_input_unit` | `percent` \| `amount` | `amount` implies `scales_with_price = false` |
| Seller concession (offer) | `concession_value` + `concession_unit` | `percent` \| `amount` | **See the floating-base warning below** |
| Counter concession | `concession_value` + `concession_unit` | `percent` \| `amount` | Same |
| All money fields | `numeric(12,2)` | $ | **Exact decimal, not float** |
| All rates | `numeric(6,3)` | % | Matches the `step="0.001"` inputs |
| All percentages | `numeric(7,4)` | % | Millage needs 4 decimals |

**Money must be `numeric`, not `float8`.** The Engine computes in JavaScript float64, which is correct for computation, but persisting a float and reading it back reintroduces drift on every save/load cycle — for free, and invisibly.

## 16.3 How display conversion should work

A **pure, one-directional** function:

```
display(value, unit, target_unit, basis) → string      // never writes
```

- The DOM input shows the converted string.
- The store keeps `(value, unit)` untouched.
- Toggling the unit re-renders. It does **not** mutate the record.
- If the user then **types** a new number, that becomes the new `(value, unit)` in the currently displayed unit — a deliberate re-entry, not a silent conversion.

## 16.4 How user-entered values are normalized

Minimal normalization only: strip formatting characters, parse to a decimal, reject non-numeric, clamp only where a real bound exists (credit score 300–850). **No unit conversion at input.** The current `num()` helper (line 1067) strips to `[0-9.-]` and `parseFloat(...)||0`, which silently turns `"1.2.3"` into `1.2` and blank into `0` — the new parser should reject rather than coerce, and distinguish empty from zero.

## 16.5 How rounding drift is prevented

**Structurally: there is no round trip, so there is nothing to drift.**

Today, `%` → `$` applies `Math.round` (line 2817) and `$` → `%` applies `.toFixed(2)` (line 2818), so 3.375% becomes 3.37% after one round trip and degrades further with each toggle. Under this design the stored value is never touched by a toggle, so `3.375` remains `3.375` after any number of toggles.

## 16.6 The floating-base hazard

`gatherInputs` line 1172 computes the `%` concession base as `offerP > 0 ? offerP : listP`. So a percentage entered **before** an offer price silently re-bases the instant an offer price is typed. Persisting `(value, unit)` does not by itself fix this — the resolved dollar amount still depends on when the basis appeared.

**Recommendation:** `negotiation_round` stores `price` alongside `concession_value` and `concession_unit`, so the basis is unambiguous per round. The application should also resolve the percentage against **that round's own price**, not a floating global. Documented as a required behavior change in the redesign; not fixed now.

## 16.7 Fields and functions requiring eventual modification

**DO NOT MODIFY NOW.** Recorded for the implementation phase.

| Function | Line | Required change | Risk |
|---|---|---|---|
| `setUnit` | 2807–2827 | Remove the four write-back assignments (2817, 2818, 2820, 2821). Toggle updates `unitState` and re-renders only | **High** |
| `setOfferConcUnit` | 2612–2624 | Remove write-back (2620–2621). Fix the floating base | Medium |
| `setCounterUnit` | 2586–2593 | Remove write-back (2590–2591) | Medium |
| `gatherInputs` | 1147–1150, 1155–1164, 1171–1175 | Read `(value, unit)` from state, not from DOM + `unitState` | **Critical** |
| `updateInlineHints` | 1243–1246 | Stop writing `'0'` into `#hoa`/`#cdd`/`#flood`. Use three-state instead | **High** |
| `fmtVal` | 2360 | Formats the OLD value with the NEW unit — false change-log entries (finding #49) | Medium |
| `num` | 1067 | Distinguish empty from zero; reject malformed rather than coerce | **High** |
| `renderUnitToggles` | 2800 | Read from state | Low |
| *(new)* `applyState` | — | The inverse of `gatherInputs`. **Must write value and unit together, and must not fire the toggle handlers** | New |

**The single highest-risk item in the entire migration** is `applyState` triggering `setUnit` during restore. If the toggle handlers fire while restoring, values are converted a second time and the corruption is silent — no error, no exception, just a buyer's down payment target quietly wrong. **Restore must write DOM values directly and set `unitState` directly, bypassing every handler.** This warrants an explicit regression test of its own.

---
# 17. VERSIONING STRATEGY

Five version identifiers. All lightweight. **No enterprise versioning machinery.**

| # | Version | Where stored | Format | Bumped when | Carried on a scenario? |
|---|---|---|---|---|---|
| 1 | **Calculation engine** | `property_scenario.engine_version` | `bse-2.0.0` | Engine logic changes | **Yes** |
| 2 | **Program assumptions** | `property_scenario.assumption_set_id` | UUID → `version_label` | Any constant changes | **Yes** |
| 3 | **Tax method** | `property_scenario.tax_method` + `tax_method_version` | `fl_millage` + `1` | That method's math changes | **Yes** |
| 4 | **Shopping Plan** | `property_scenario.shopping_plan_id` | UUID | New plan created | **Yes** (by FK) |
| 5 | **Property Scenario** | `property_scenario.parent_scenario_id` | UUID, nullable | Explicit recalculation | Only when recalculated |

## Saved with every scenario — five values

```
engine_version      "bse-2.0.0"
assumption_set_id   → 2026.07-baseline (immutable)
tax_method          "flat_rate"
tax_method_version  1
shopping_plan_id    → "Original Plan"
```

Five columns, four of them foreign keys. That is the entire reproducibility apparatus.

## Bump rules

**Engine version** — semantic-ish, three parts:

| Part | Bump when | Example |
|---|---|---|
| Major | A calculation changes results | FL tax integration; fixing C-8 |
| Minor | Capability added without changing existing results | A new loan program |
| Patch | Display or non-calculation fix | Copy change |

**Any change that alters a number is a MAJOR bump** — including the C-7 and C-8 corrections and the stale-constant update. That makes "which scenarios predate the fix?" a single query.

**Assumption set** — never updated in place. Insert a new row, flip `is_current`, record what changed in `notes`. A rate-sheet change is a new set. So is the 0.25 → 0.24 buydown decision, if you make it.

**Tax method version** — bumped only when that method's math changes. Correcting the C-10a school blend or the C-2 portability downsizing would be `fl_millage` v2, leaving v1 scenarios intact and correctly labeled as computed under the old method.

## What is deliberately not versioned

Buyer Profiles, Properties, and Negotiation Rounds are ordinary mutable rows. A buyer's income changing is a correction to a fact, not a new version of the buyer. Reproducibility attaches to **scenarios**, which is where recommendations are made.

---

# 18. SUPABASE-READY CONCEPTUAL SCHEMA

**Design only. No tables created. No SQL executed. Pseudocode below is explanatory.**

## 18.1 Entity summary

| # | Table | Purpose | PK | FKs | Sensitive | Soft delete | RLS |
|---|---|---|---|---|---|---|---|
| 1 | `buyer_profile` | Durable borrower facts | `id` uuid | `owner_user_id` → `auth.users` | **Yes** | `status` | `owner_user_id = auth.uid()` |
| 2 | `shopping_plan` | Stated strategy + estimates | `id` uuid | `buyer_profile_id`, `assumption_set_id` | No | `is_active` + `superseded_at` | Same |
| 3 | `property` | Address identity | `id` uuid | `buyer_profile_id` | No | `status` | Same |
| 4 | `property_scenario` | One reproducible analysis | `id` uuid | `property_id`, `buyer_profile_id`, `shopping_plan_id`, `assumption_set_id`, `tax_method`, `parent_scenario_id` | No | `status` | Same |
| 5 | `negotiation_round` | Offer / counter history | `id` uuid | `property_scenario_id` | No | *(hard delete OK)* | Same |
| 6 | `program_assumption_set` | Immutable constants | `id` uuid | — | No | `is_current` | **Read-only to all authenticated** |
| 7 | `tax_method` | Extensible method lookup | `code` text | — | No | `is_active` | **Read-only to all authenticated** |

## 18.2 Conventions across all buyer-owned tables

| Concern | Decision |
|---|---|
| Primary keys | `uuid` with `gen_random_uuid()`. Never sequential integers — enumerable IDs on a client-side app leak record counts |
| `owner_user_id` | **On every buyer-owned table**, not just the root. Avoids recursive joins in RLS policies and keeps them fast and simple |
| `organization_id` | **Nullable uuid on every buyer-owned table (Decision L-10).** Reserved only — unused, unindexed, referenced by no policy at Phase 3. Present so a future assistant or second LO does not require rewriting every table and policy |
| Money | `numeric(12,2)` — exact decimal. **Never `float8`** |
| Rates | `numeric(6,3)`. Percentages `numeric(7,4)` (millage needs 4) |
| Timestamps | `timestamptz`, default `now()`. `updated_at` maintained by trigger |
| Enum-like values | `text` + `CHECK` constraint, or a lookup FK. **Never `ENUM`** — extension requires `ALTER TYPE` |
| Deletes | **Soft delete via `status`.** Nothing a client was shown should be hard-deletable |
| JSONB | Only for genuinely variable shapes: `tax_inputs`, `tax_outputs`, `assumption_overrides`, `payload`, `result_summary`, `resolved_inputs` |

## 18.3 Indexes

| Table | Index | Why |
|---|---|---|
| `buyer_profile` | `(owner_user_id, status)` | Buyer list — the main screen |
| `buyer_profile` | `(owner_user_id, display_name)` | Name search |
| `shopping_plan` | `(buyer_profile_id, is_active)` | Resolve the active plan |
| `shopping_plan` | **partial unique** `(buyer_profile_id) WHERE is_active` | **Enforces exactly one active plan** |
| `property` | `(buyer_profile_id, status)` | Property list per buyer |
| `property_scenario` | `(property_id, created_at DESC)` | Scenario list per property |
| `property_scenario` | `(buyer_profile_id, is_accepted_property)` | "Accepted Property" lookup |
| `property_scenario` | `(shopping_plan_id)` | "What used this plan?" |
| `negotiation_round` | **unique** `(property_scenario_id, round_number)` | Ordering integrity |
| `negotiation_round` | **partial unique** `(property_scenario_id) WHERE is_accepted` | **At most one accepted round** |
| `program_assumption_set` | **partial unique** `(is_current) WHERE is_current` | Exactly one current set |

The three partial unique indexes are doing real work — they enforce in the database the invariants this design depends on, rather than trusting application code.

## 18.4 Illustrative DDL — explanatory pseudocode, not for execution

```sql
-- ILLUSTRATIVE ONLY — DO NOT EXECUTE. Phase 2 is design.

create table property_scenario (
  id                      uuid primary key default gen_random_uuid(),
  owner_user_id           uuid not null references auth.users(id),
  organization_id         uuid null,          -- L-10: reserved, unused at Phase 3
  property_id             uuid not null references property(id),
  buyer_profile_id        uuid not null references buyer_profile(id),
  shopping_plan_id        uuid not null references shopping_plan(id),
  parent_scenario_id      uuid null     references property_scenario(id),

  scenario_label          text not null default 'Scenario 1',
  analysis_mode           text not null default 'property'
                            check (analysis_mode in ('shopping','property')),
  list_price              numeric(12,2),

  -- NULL = inherit from shopping_plan
  hoi_monthly             numeric(10,2),
  hoa_monthly             numeric(10,2),
  hoa_status              text check (hoa_status in ('unknown','confirmed_none','known')),
  -- cdd_*, flood_*, rate_*, closing_cost_* follow the same pattern

  dp_target_value         numeric(12,2),
  dp_target_unit          text check (dp_target_unit in ('percent','amount')),

  dti_override_enabled    boolean not null default false,
  dti_override_front      numeric(5,2),
  dti_override_back       numeric(5,2),
  dti_override_source     text,

  closing_date            date,
  occupancy_date          date,

  tax_method              text references tax_method(code),
  tax_method_version      smallint,
  tax_inputs              jsonb,
  tax_outputs             jsonb,
  qualifying_tax_basis    text,

  assumption_set_id       uuid not null references program_assumption_set(id),
  assumption_overrides    jsonb,
  engine_version          text not null,
  resolved_inputs         jsonb,

  result_summary          jsonb,
  results_computed_at     timestamptz,

  status                  text not null default 'draft',
  is_accepted_property    boolean not null default false,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),

  constraint fl_millage_requires_closing_date
    check (tax_method is distinct from 'fl_millage' or closing_date is not null),
  constraint dp_unit_requires_value
    check ((dp_target_value is null) = (dp_target_unit is null))
);
```

The last two constraints encode design rules in the schema: an `fl_millage` scenario cannot exist without a closing date, and a down-payment target can never exist without its unit. **The second one makes the C-4(a) corruption structurally impossible to persist.**

## 18.5 RLS policy shape — design only

```sql
-- ILLUSTRATIVE ONLY — DO NOT EXECUTE.
alter table property_scenario enable row level security;

create policy scenario_owner_all on property_scenario
  for all
  using      (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

-- Reference tables: readable by any authenticated user, writable by none.
create policy assumption_read on program_assumption_set
  for select using (auth.role() = 'authenticated');
```

Identical shape on all five buyer-owned tables. Because `owner_user_id` is denormalized onto every table, no policy needs a join.

## 18.6 Archive / soft-delete strategy

| Table | Mechanism | Behavior |
|---|---|---|
| `buyer_profile` | `status = 'archived'` | Hidden from lists; children remain intact and reachable |
| `shopping_plan` | `is_active = false` + `superseded_at` | Never deleted — historical scenarios reference it |
| `property` | `status = 'passed' \| 'archived'` | "We looked, we passed" is useful history |
| `property_scenario` | `status = 'archived'` | **Never hard-deleted if it was ever `presented`** |
| `negotiation_round` | Hard delete permitted **only** while the parent is `draft` | Correcting a typo before presentation |
| `program_assumption_set` | Never deleted | Historical scenarios depend on it |

**Rule: nothing a client was shown is hard-deletable.**

---

# 19. CROSS-DEVICE / AUTHENTICATION DATA FLOW

**Design only. No Supabase project, auth, or policy created.**

## 19.1 Flow

```
Any device — office desktop, laptop, iPad, phone
        │
        ▼
Netlify static host  (tools.homewealthsolutions.com)
   single-file HTML BSE + Supabase JS client
        │
        ▼
Supabase Auth — magic link to doug@homewealthsolutions.com
   token returns in the URL FRAGMENT (#access_token=...)
   app parses it, then strips it via history.replaceState
        │
        ▼
Session JWT carries auth.uid()
        │
        ▼
Supabase Postgres — every query filtered by RLS on owner_user_id
        │
        ▼
Same buyer records on every device
```

## 19.2 Application boot sequence

The current `init()` (line 2834) is synchronous and self-executing, ending in a bare `init();`. It must become gated:

```
1. Render a loading state — NOT the default form
2. Check for an existing session
3. If a magic-link fragment is present: exchange, then history.replaceState to strip the token
4. If unauthenticated: sign-in view. STOP.
5. Load the buyer list
6. On buyer selection: load profile → active shopping plan → properties → scenarios
7. applyState(resolved)   ← writes values AND units directly, bypassing every toggle handler
8. attach* wiring
9. recalc()
```

**Step 1 is a correctness requirement, not polish.** The current defaults (`score 740`, `income 9,500`, `ownFunds 40,000`) look like real client data. Booting straight into them while an async load is in flight puts a plausible fictional buyer on screen — on a screen-share, indistinguishable from the real client's numbers. Finding C-3.

**Step 7 is the highest-risk step in the migration.** See Section 16.7.

## 19.3 Persistence timing — decoupled from `recalc`

`recalc` performs roughly **six full engine runs per keystroke** with no debounce (finding 12.4). Attaching a network write to that path would be unusable.

| Trigger | Action |
|---|---|
| Keystroke | `recalc()` only — local, no network |
| 2s idle after last change | Debounced autosave of changed fields |
| Explicit Save | Immediate write |
| Scenario / buyer switch | Flush pending writes first |
| Tab hidden (`visibilitychange`) | Flush |

**Do not autosave on every `recalc`.**

## 19.4 Concurrency

Nothing today detects a conflict. Recommend optimistic concurrency: send `updated_at` with each write; if the server row is newer, reject and prompt — *"This buyer was changed on another device. Reload or overwrite?"* One column, one comparison. **Silent last-write-wins is not acceptable** when the same buyer may be open on the desktop and the iPad.

## 19.5 Device-specific notes

| Device | Consideration |
|---|---|
| iPad Safari | Partitions and evicts local storage aggressively — reinforces cloud-first. Also: **the four-card program layout and the negotiation comparison table are wide.** Responsive behavior below desktop width was not validated in the audit and should be checked before Phase 3 scoping, as it may change the UI effort materially |
| Phone | **Full editing surface (Decision L-12) — not review-only.** Core buyer and property inputs and the strategy calculations must be usable from a phone. This materially expands responsive scope: the four-card program layout, the negotiation comparison table, the Gap Solver tabs, and the counteroffer panels all need a phone-viable form. Treat this as a first-class design constraint in Phases 5–6, not a late adaptation |
| Offline | The BSE works fully offline today. **Adding Supabase removes that.** Recommend the calculator remain usable unauthenticated in a no-save mode, so a dead connection never blocks a client meeting |

19.5's last row matters more than it looks. Today you can open the BSE on a plane. After Phase 3 you cannot, unless it is designed in.

---

# 20. SECURITY / DATA-MINIMIZATION REVIEW

## 20.1 Prohibited data — confirmed absent from the design

| Item | In design? |
|---|---|
| SSN, DOB, government ID, driver's license | **No** |
| Bank account / card numbers | **No** |
| Credentials or passwords | **No** |
| Credit reports, paystubs, W-2s, tax returns | **No** |
| Bank / asset statements | **No** |
| Uploaded borrower documents *(no file storage of any kind is designed)* | **No** |
| Full URLA / 1003 data beyond calculation inputs | **No** |

**No file-upload capability, no storage bucket, and no document table appears anywhere in this design.** That absence is deliberate and should be treated as a standing constraint.

## 20.2 Sensitive fields and their justification

| Field | Required by | Could it be bucketed? |
|---|---|---|
| `qualifying_income_monthly` | DTI (678–679), DTI ceiling (744), elimination (840) | **No** — bucketing changes max price |
| `monthly_debts` | Same | **No** |
| `credit_score` | PMI band (586), conv gate (815), FHA tier (630), LLPA flag (1462) | **No** — a 739 and a 740 price differently |
| `own_funds` / `gift_funds` | Cash ceiling (750), elimination (835), `requiresGift` (847) | **No** |
| `va_funding_fee_exempt` | Waives the funding fee (656) | **Boolean only** — never the rating, condition, or award letter |
| `prior_homestead_*` | Portability (627–628) | **No** — exact values required |

Each satisfies your governing principle: exact values stored **only** where accuracy demands it.

## 20.3 Findings carried forward from Phase 1

**F-2 — retire `hws_clients`.** `property-tax.html:576` reads a localStorage client roster that nothing writes. If ever populated it becomes an unencrypted, unauthenticated list of client names on whatever machine the tool was used on. **This design supersedes it: client identity lives in `buyer_profile` behind RLS.** Recommend removing the read when the FL tool is next touched. *(Documented, not fixed.)*

**F-3 — share links must carry a token, not values.** The Comfort Calculator's `buildShareURL()` puts `annualIncome`, `monthlyIncome`, and `monthlyDebt` into query parameters copied to the clipboard. Those land in browser history, referrer headers, and any chat or email system in the path. **Design rule for any future BSE sharing: share an opaque token that resolves server-side under its own RLS policy. Never share values.**

## 20.4 Client-side security constraints

| Rule | Reason |
|---|---|
| **Anon key only in the browser** | The service-role key bypasses RLS entirely. It must never appear in a static file served from Netlify |
| **RLS enabled on every table before any data is written** | A table with RLS off is world-readable to any authenticated user |
| **`with check` on every policy, not just `using`** | `using` alone permits inserting rows owned by someone else |
| **No PII in URLs** | Per F-3 |
| **Strip the auth fragment after exchange** | Prevents the token persisting in history and referrers |

## 20.5 Is anything here that belongs in the LOS instead?

Reviewed field by field. **Nothing in this design belongs in the LOS.** Every stored borrower field is a direct calculation input or a workflow identifier. The three items closest to the line, and why they stay:

- **`dti_override_source`** — a free-text reference like "DU Approve/Eligible 2026-07-14." It is a note, not a findings document. It must never become an attachment.
- **`prior_homestead_market_value` / `_assessed_value`** — arguably loan-file data, but they are direct inputs to the portability calculation and have no substitute.
- **`va_funding_fee_exempt`** — the boolean is a calculation input. The underlying disability documentation is LOS data and is prohibited here.

The BSE remains a strategy tool. It is not an LOS, not a document repository, and not a replacement for the borrower loan file.

---
# 21. MIGRATION RISKS

Ranked by the likelihood of silently producing a wrong number.

| # | Risk | Cause | Mitigation |
|---|---|---|---|
| **M-1** | **Double unit conversion on restore** — **LOCKED BY L-13: must be resolved before any persistence or save/load functionality is implemented** | `applyState` firing `setUnit` / `setOfferConcUnit` / `setCounterUnit`, converting an already-correct value a second time | Restore writes DOM values **and** `unitState` directly, bypassing all handlers. **Dedicated regression test.** This is the single highest-risk item in the migration — it fails silently, with no error |
| **M-2** | **`gatherInputs` is not round-trippable** | It reads 32 DOM elements and derives inline (lines 1142–1200); its output cannot reconstruct the UI | Write `applyState(state)` as a true inverse **first**, and test round-trip equality on all 47 regression scenarios before anything else is built |
| **M-3** | **A second source of truth forming against the Engine** | Caching `result_summary` and later trusting it | `result_summary` is explicitly non-authoritative. On any disagreement the recomputation wins. Never read it into a calculation |
| **M-4** | **Blank credit score → 300** | `Math.max(300, Math.min(850, Math.round(num('score'))))` at line 1179 turns blank into 300, eliminating every program | `credit_score` is NOT NULL in the schema. The new parser must distinguish empty from zero (Section 16.4). **Do not change line 1179 in this phase** |
| **M-5** | **Mode inferred from a null price** | `shopping = rawBlank('price')` (1144) vs `hasPrice = inp.price>0` (2446) — two definitions (finding M-1 in Phase 1) | Explicit `analysis_mode` column. Migration must set it deliberately, not derive it |
| **M-6** | **Three-state cost fields collapsed to a number** | Persisting HOA/CDD/flood as a bare value loses "unknown" vs "confirmed none," destroying the confidence signal (1432–1434) | `*_status` column alongside every value. Value stays NULL in both zero cases |
| **M-7** | **Float drift on save/load** | Storing money as `float8` and round-tripping through JSON | `numeric(12,2)`. Parse to decimal at the boundary |
| **M-8** | **Autosave on the recalc path** | ~6 engine runs per keystroke (Section 12.4) | Debounced autosave, decoupled (Section 19.3) |
| **M-9** | **Assumption set updated in place** | A well-meaning `UPDATE` on a rate change silently rewrites every historical scenario | INSERT-only discipline. Consider revoking UPDATE on the table |
| **M-10** | **Offline capability lost** | Adding a CDN Supabase client to a file that has zero external dependencies today | Design an unauthenticated no-save mode (Section 19.5) |
| **M-11** | **Staging's 0.24 leaking in** | Copying from the suspect file during implementation | Live's **0.25** is seeded into `2026.07-baseline`. Any change is a new assumption set requiring your decision |
| **M-12** | **Persisting the manual concession split before C-9 is fixed** | The fields are near-inert; a saved value would misrepresent what produced the recommendation | Reserve the columns; do not surface the control until C-9 is addressed |
| **M-13** | **Floating `%` concession base** | `offerP > 0 ? offerP : listP` (1172) re-bases the moment an offer price is typed | `negotiation_round` stores `price` with the concession; resolve against that round's own price |
| **M-14** | **Homestead defaulting to true** | FL tool ships `chk-homestead` **checked** (line 405) | `homestead_intent` defaults NULL. Require an explicit answer before `fl_millage` runs |
| **M-15** | **Change log unusable if persisted** | Timestamps are `hour:minute` only; `seq` resets each page load | Not recommended for Phase 3. Would need ISO timestamps first |
| **M-16** | **Responsive layout debt discovered late** | Four-card layout and wide comparison tables; iPad and phone behavior unvalidated. **Raised in severity by L-12** — phone is now a full editing surface, not review-only | Validate on **iPad and phone** before Phase 3 scoping. Budget phone layout as first-class Phase 5–6 work |

---

# 22. OPEN QUESTIONS — ALL RESOLVED

**All six questions were dispositioned by Doug Smith on 2026-07-28. No open questions remain. Phase 2 is closed.**

### Q-1 — Which tax figure qualifies the buyer? — **RESOLVED / LOCKED**

**Decision:** Qualification PITI uses the **Projected Reassessed Tax (Qualifying Tax)**. The seller's current tax bill is **informational only** and never drives qualification. The post-homestead / stabilized figure is a **separate planning and display figure**. `qualifying_tax_basis` is **retained** to permit lender- or program-specific overrides.

Recorded as Decision **L-7**. Schema effect: `qualifying_tax_basis` gains a default of `projected_reassessed` and a constrained value set; all three FL figures remain stored.

### Q-2 — Buydown ratio: 0.25 or 0.24? — **RESOLVED / LOCKED**

**Decision: 0.25.** The Live production BSE is authoritative. Staging remains suspect and non-authoritative. Recorded as Decision **L-8**. `2026.07-baseline` seeds `buydown.pct_per_point = 0.25`, unchanged.

### Q-3 — Edit history on scenarios? — **RESOLVED / LOCKED**

**Decision: no.** No edit-history or revision table. The architecture preserves **scenario reproducibility**, not every historical edit. Recorded as Decision **L-9**. No schema change — this confirms the design as written.

### Q-4 — One operator or a future team? — **RESOLVED / LOCKED**

**Decision:** add a **nullable `organization_id`** to the architecture now. **Do not implement team functionality.** Recorded as Decision **L-10**. Schema effect: one nullable uuid column on all five buyer-owned tables, unused and unindexed at Phase 3.

### Q-5 — When is the Comfort Calculator retired? — **RESOLVED / LOCKED**

**Decision:** **not** merely when saved Shopping Plans exist. Retire only after the redesigned BSE Shopping Range has (a) **passed regression testing** and (b) been **validated in an actual buyer-call workflow**. Recorded as Decision **L-11**. This supersedes the prior recommendation and adds a live-use gate to the phase sequence in Section 23.

### Q-6 — Phone: full editing or review-only? — **RESOLVED / LOCKED**

**Decision: full responsive editing is required.** Phone access is **not** review-only. Core buyer and property inputs and the strategy calculations must remain usable from a phone. Recorded as Decision **L-12**. This supersedes the prior recommendation and materially expands responsive scope — see Sections 19.5 and 23.

### Supplemental lock — `applyState` / unit handling — **RESOLVED / LOCKED**

**Decision:** persist canonical values only. Restore canonical values directly. Unit toggles are **presentation state only** and must **never** mutate persisted canonical values. The `applyState` double-conversion risk (M-1) **must be resolved before any persistence or save/load functionality is implemented.** Recorded as Decision **L-13**. See Section 16.1 for the one precision point this raises.

---

# 23. RECOMMENDED PHASE 3 SCOPE

## Principle

**Phase 3 changes no numbers.** Every one of the 47 BSE and 11 FL regression scenarios must reproduce exactly. If a number moves, something is wrong — not improved.

## In scope

| # | Item | Deliverable |
|---|---|---|
| 1 | **Capture the regression baseline** | The Phase 1 Section 11 scenarios, as committed JSON. **Blocking prerequisite — there are no existing tests** |
| 2 | **Resolve the Staging file** | Merge or archive. Answer Q-2 |
| 3 | **Extract the Engine unchanged** | Lines 526–1060 into a module. **Zero logic changes.** Byte-comparable behavior |
| 4 | **Build the state object** | The `inp` shape as a serializable structure with `(value, unit)` pairs |
| 5 | **Write `applyState`** | The true inverse of `gatherInputs`. **Must bypass all unit handlers (M-1). LOCKED BY L-13 as a hard prerequisite to any persistence work — Phase 4 cannot begin until the round-trip identity test in item 7 passes** |
| 6 | **Refactor `gatherInputs`** | Consume the state object rather than the DOM |
| 7 | **Round-trip test** | `state → DOM → gatherInputs → state` must be identity on all 47 scenarios |
| 8 | **Fix the unit write-backs** | `setUnit`, `setOfferConcUnit`, `setCounterUnit` stop writing converted values |
| 9 | **Fix the N/A destruction** | `updateInlineHints` lines 1243–1246 → three-state |
| 10 | **Async boot with a loading state** | No default-buyer flash (C-3) |
| 11 | **Validate on iPad and phone** | Before Phase 4 is scoped (M-16). **L-12 makes phone a full editing surface**, so phone viability is a Phase 3 finding, not a Phase 6 discovery |

Items 8 and 9 **are** result-affecting in the specific sense that they stop destroying data — but they do not change any calculation given identical inputs. They are in scope because leaving them in place makes persistence unsafe: you would be saving corrupted values.

## Explicitly out of scope for Phase 3

Supabase of any kind. Authentication. RLS. Tables. FL tax integration. UI redesign. The information-hierarchy work. Stale-constant updates. The C-7 and C-8 corrections. Retiring the Comfort Calculator (gated by L-11 — regression pass **and** live buyer-call validation).

## Suggested phase sequence

| Phase | Content | Gate |
|---|---|---|
| **3** | State object, `applyState`, engine extraction, unit + N/A fixes, async boot | 100% regression parity |
| **4** | Supabase project, schema, RLS, magic-link auth, save/load. **No calculation changes** | 100% regression parity |
| **5** | Buyer Profile / Shopping Plan / Property / Scenario UI; negotiation rounds. **Phone-viable editing surface (L-12)** | 100% regression parity |
| **6** | Information hierarchy — the two-mode surface over the existing tools | 100% regression parity |
| **7** | Approved calculation changes, **one at a time, each separately approved**: stale constants → C-7 → C-8 → closing-cost model → **FL tax integration last (applies L-7)** | Each individually diffed |
| **—** | **Comfort Calculator retirement (L-11)** — gated on the redesigned BSE Shopping Range passing regression **and** being validated in a real buyer-call workflow. Not tied to a phase number; it happens when both gates clear | Both gates cleared |

Phases 3–6 change no numbers. Phase 7 changes numbers deliberately, one at a time, with a documented before and after.

---

# APPENDIX A — SAVED BUYER WORKFLOW DATA FLOW

Architecture only. No UI implementation.

## Buyer lifecycle

| Operation | Data flow |
|---|---|
| **CREATE BUYER** | INSERT `buyer_profile` (`owner_user_id = auth.uid()`, `status='active'`) → INSERT a default `shopping_plan` (`is_active=true`, `plan_label='Original Plan'`, `assumption_set_id = current`) in the same transaction. **A buyer always has exactly one active plan** |
| **SAVE BUYER** | UPDATE `buyer_profile` with optimistic concurrency on `updated_at`. Debounced 2s or explicit |
| **OPEN BUYER** | SELECT profile → active plan → properties → latest scenario per property → `applyState(resolve(...))` → `recalc()` |
| **UPDATE BUYER** | UPDATE in place. **Facts are corrected, not versioned** (Section 17) |
| **ARCHIVE BUYER** | `status='archived'`. **No cascade.** Children stay intact and reachable |

## Shopping Plan lifecycle

| Operation | Data flow |
|---|---|
| **CREATE PLAN** | INSERT with `is_active=true`; the partial unique index requires the prior plan be deactivated in the same transaction (`is_active=false`, `superseded_at=now()`) |
| **SAVE PLAN** | UPDATE in place **while no scenario references it**. Once referenced, editing is still permitted — but the honest option is a new plan. *(Recorded as a UI guardrail, not a database constraint.)* |
| **REVISE PLAN** | The $3,000 → $3,250 case: INSERT a new row, deactivate the old. Existing scenarios keep pointing at the old plan and remain reproducible |

## Property and Scenario lifecycle

| Operation | Data flow |
|---|---|
| **ADD PROPERTY** | INSERT `property` (identity only — no price) |
| **CREATE SCENARIO** | INSERT `property_scenario` with `shopping_plan_id = active plan`, `assumption_set_id = current set`, `engine_version = current`, `analysis_mode='property'`, assumption columns NULL (inherit) |
| **SAVE SCENARIO** | UPDATE; debounced. Refresh `result_summary` + `results_computed_at` |
| **OVERRIDE AN ASSUMPTION** | Write the value to the **scenario** column. **Never to the plan.** This is Decision L-1 in one sentence |
| **RECALCULATE WITH TODAY'S ASSUMPTIONS** | INSERT a new scenario, `parent_scenario_id` = original, new `assumption_set_id`. **Original untouched** (Section 11.3) |

## Offer and acceptance

| Operation | Data flow |
|---|---|
| **SAVE OFFER** | INSERT `negotiation_round` (`actor='buyer'`, `round_number = max+1`) |
| **SAVE COUNTER** | INSERT (`actor='seller'`, next `round_number`) |
| **MARK ACCEPTED STRUCTURE** | UPDATE that round `is_accepted=true`. Partial unique index permits at most one per scenario |
| **MARK ACCEPTED PROPERTY** | UPDATE scenario `is_accepted_property=true`, `status='under_contract'` |

## Your tree, realized

```
JOHN SMITH                          buyer_profile
├── Shopping Plan — Original        shopping_plan  is_active=true
│      target 3,000 · preferred down 150,000 · funds 200,000
├── 123 Main Street                 property
│      └── Scenario 1               property_scenario → shopping_plan(Original)
│            ├── round 1  buyer     negotiation_round
│            ├── round 2  seller    negotiation_round
│            └── round 3  buyer     negotiation_round  is_accepted=true
│                                   scenario.is_accepted_property=true
├── 456 Oak Drive  → Scenario 1
└── 789 Lake Court → Scenario 1
```

---

# REVIEW QUESTIONS — DIRECT ANSWERS

### 1. Can this architecture reproduce an old buyer/property scenario exactly enough to understand the recommendation made at the time?

**Yes, with one honest limit.** Inputs are stored; constants resolve through an immutable `assumption_set_id` that cannot change underneath the row; user overrides sit in `assumption_overrides`; and `engine_version` records which logic build ran. Decision thresholds and the buydown ratio are inside the snapshot, so the *recommendation* reproduces, not merely the arithmetic.

**The limit:** if you edit a saved scenario's inputs, the prior inputs are gone (Q-3). Reproducibility here means *"these inputs plus these assumptions produced this result,"* not *"here is every version this scenario ever had."*

### 2. Can a buyer's Shopping Plan remain unchanged while multiple properties use different actual tax/insurance/HOA assumptions?

**Yes — structurally, not just by convention.** Property Scenarios carry their own nullable assumption columns; NULL inherits, a value overrides. Resolution happens in memory and is never written back. Your exact example works: the plan holds `flat_rate 1.20%`; Property A holds `fl_millage` with Hillsborough millage; Property B holds `fl_millage` with different millage; the plan's 1.20% is never touched by either. This directly replaces finding C-4(c), where the "buyer-only" cards today silently absorb property HOA/CDD/flood.

### 3. Can the system later recalculate an old scenario using current assumptions without destroying the historical scenario?

**Yes.** Recalculation is an explicit action that INSERTs a new row with `parent_scenario_id` pointing at the original and the current `assumption_set_id`. The original is never updated. There is no automatic recalculation anywhere in the design — no cascade, no scheduled job, no trigger.

### 4. Does the architecture prevent display-unit toggles from corrupting persisted values?

**Yes, structurally.** `(value, unit)` is stored as entered and never converted at rest, so there is no round trip and nothing to drift. The `CHECK ((dp_target_value is null) = (dp_target_unit is null))` constraint makes a value-without-unit unstorable.

**One caveat, stated plainly:** the schema prevents *storing* corruption; it does not by itself prevent the application from *creating* it. The `applyState` restore path must bypass the toggle handlers (M-1). That is a code discipline, and it deserves its own regression test — it is the highest-risk item in the migration precisely because it fails silently.

### 5. Can the Florida tax engine be integrated without invalidating existing flat-rate scenarios?

**Yes.** `tax_method` is per-scenario, the engine dispatches on the stored value, and no migration rewrites it. A 2026 `flat_rate` scenario opened in 2028 still runs `flat_rate` v1 against its own snapshot. Conversion is explicit and produces a new row. The lookup-table discriminator also means adding a third method later requires no schema migration.

### 6. Does the model support multiple properties per buyer without becoming unnecessarily complex?

**Yes.** One FK from `property` to `buyer_profile`. Five buyer-owned tables in total. No many-to-many, no junction tables, no transaction entity. The complexity that does exist — the Shopping Plan table and negotiation rounds — is there because you asked for capabilities that flat columns cannot represent.

### 7. Does it support offer/counteroffer history without turning the BSE into a transaction-management system?

**Yes.** A round is a price, a concession with its unit, and who said it. No status machine, no dates, no parties, no documents, no deadlines. Seller net value is derived, not stored — which also means the C-8 correction will improve historical rounds automatically rather than freezing a wrong number into the record.

### 8. Is every stored borrower field actually required for strategy calculations or workflow identification?

**Yes.** Audited field by field in Section 20.2. Income, debts, credit score, and funds are exact because bucketing any of them changes the result — income and debts change DTI and therefore max price; a 739 versus a 740 credit score prices differently. `display_name` and `reference_code` are workflow identification. `va_funding_fee_exempt` is a calculation input stored as a bare boolean.

### 9. Is anything being stored that should remain only in the LOS?

**No.** The three closest calls — `dti_override_source` (a free-text findings reference, never an attachment), the prior-homestead values (direct portability inputs), and the VA exemption boolean (a fee input) — are each justified in Section 20.5. No document storage, no file upload, and no storage bucket appears anywhere in this design, and that absence should be treated as a standing constraint rather than an oversight.

### 10. What is the single biggest architectural risk remaining?

**`applyState` — the restore path — silently double-converting unit-bearing values.**

It is the biggest risk because of how it fails, not how likely it is. Every other item on the risk list announces itself: a broken query errors, a missing column errors, a failed auth blocks the screen. This one produces a plausible number. A buyer's down-payment target restores as 6.7% instead of 10%, every downstream figure recalculates cleanly from the wrong input, and nothing in the UI indicates anything happened. It would most likely be discovered when a client questions a figure — which is the worst possible discovery path.

The schema constraints reduce the blast radius but cannot eliminate it, because the corruption occurs in memory before anything is written. **Decision L-13 now makes the mitigation binding: this risk must be resolved before any persistence or save/load functionality is implemented — Phase 4 cannot begin until it is.** The mitigation is procedural and is non-negotiable in Phase 3: **restore writes DOM values and `unitState` directly, never through a handler**, and the round-trip identity test (`state → DOM → gatherInputs → state`) runs against all 47 regression scenarios as a gate, not as a spot check.

**Runner-up:** `gatherInputs` not being round-trippable (M-2). It is the largest piece of work in the migration and it sits on the hot path — but it fails loudly, which makes it far less dangerous.

---

## PHASE 2 COMPLIANCE STATEMENT

- **No production file was modified.** Verified: `git status --porcelain` on `Tools/Live` returns empty.
- **No calculation function was changed.** The Engine (lines 526–1060) and `property-tax.html` remain read-only.
- **No UI was redesigned.** No Supabase project, table, authentication, or RLS policy was created. No SQL was executed — the DDL in Section 18.4 is explanatory pseudocode explicitly marked do-not-execute.
- **No FL tax code was ported.** No `setUnit` change was implemented. Nothing was deployed.
- Every production constant cited was **re-verified against source** on 2026-07-28.
- The Staging file was **not** used as a calculation reference.
- Issues discovered during design were **documented, not fixed** — 16 migration risks recorded.
- **All six open questions were dispositioned by Doug Smith on 2026-07-28.** Decisions L-7 through L-13 are incorporated. No open questions remain.

## PHASE CLOSEOUT

| Phase | Scope | Status |
|---|---|---|
| **0** | Data governance, prohibited-data list, approved-field discovery | **COMPLETE** |
| **1** | Forensic audit of the production BSE, FL tax tool, and Comfort Calculator | **COMPLETE** — 54 findings documented, 0 remediated |
| **2** | Architecture decision lock and data model design | **COMPLETE** — 13 locked decisions, 6 questions resolved, 0 open |

**Phase 3 has not begun and will not begin without your explicit written approval.**

---

*Prepared for Doug Smith, President & Broker, CMA® · HomeWealth Solutions LLC · NMLS #2742458 · FL OFR Mortgage Broker License #MBR8082 · doug@homewealthsolutions.com · 813-733-7371*
