<!--
BUYER STRATEGY ENGINE — PHASE 3, GATE C REPORT
File: docs/BSE-Phase3-GateC-Report.md
Status: Gate C INCOMPLETE — STOPPED at a genuine access limitation.
Origin: Cowork session of 2026-07-28.
-->

# BUYER STRATEGY ENGINE — PHASE 3, GATE C
## Supabase + Auth + Cross-Device Persistence — Progress Report and STOP

**HomeWealth Solutions LLC** · Company NMLS #2742458 · FL OFR Mortgage Broker License #MBR8082
Prepared for: Doug Smith, President & Broker, CMA®
Date: **July 28, 2026**

> ## GATE C IS NOT COMPLETE. THIS SESSION STOPPED AT A STOP CONDITION.
>
> **"Supabase cannot be safely configured."** There is no Supabase project, no credential, and no route to create one from this session. Everything that does not require the live backend was built and verified; everything that does is untouched. **No insecure workaround was substituted** — no service-role key was fabricated, no local shim was passed off as authentication, and nothing was deployed.
>
> §5 states exactly what access is missing and what I need from you.

---

## 1. Gate C branch

`phase3/gate-c-supabase-persistence`, created from the approved Gate B.75 HEAD and confirmed checked out before any file was written.

## 2. Starting commit

`98bfd3c` — verified independently: branch, HEAD, clean tree, no residual locks, all seven controlling documents present, `__legacyGatherInputsFromDom` absent, `RESULT_SUMMARY_AUTHORITATIVE = false` present, `negotiation_mode` / `offer_concession_value` present, engine region byte-identical, and all three protected MD5s unchanged.

## 3. Ending commit

`d4f7c31` — "Gate C partial — schema, mapping and local verification; stopped at Supabase access". The BSE application file is **byte-identical to Gate B.75**: `90bcc96f62feb7f90c34c8407ddeacd0`.

## 4. Files changed

| File | Change |
|---|---|
| `supabase/migrations/0001_bse_schema.sql` | **Added** — the seven-table schema, constraints, indexes, RLS, triggers, grants |
| `supabase/migrations/0002_seed_reference_data.sql` | **Added** — tax methods + the immutable `2026.07-baseline` assumption set |
| `supabase/mapping/canonical-to-db.js` | **Added** — pure canonical ↔ database mapping, no Supabase dependency |
| `supabase/local-verify/00_auth_stub.sql` | **Added** — local-only `auth.uid()` / `auth.role()` so the migrations can be executed and RLS exercised on plain Postgres |
| `supabase/README.md` | **Added** — how to apply, how to verify, what the schema enforces, secrets policy |
| `internal/buyer-strategy/tests/persistence-db.test.js` | **Added** — 52 assertions against a real PostgreSQL 16 database |
| `internal/buyer-strategy/index.html` | **NOT MODIFIED** |

## 5. Supabase project / configuration status — THE STOP POINT

**Not configured. Not reachable. Nothing was created.**

What I checked, and what I found:

| Route | Result |
|---|---|
| MCP connectors installed on the account | Canva, Google Drive, Microsoft 365, Todoist, Zapier. **No Supabase connector** |
| Network from the cloud container | `supabase.com` → **no route (HTTP 000)**. `api.supabase.com` → **no route**. `registry.npmjs.org` → 200. The sandbox allowlist does not include Supabase |
| Network from your Mac's Cowork VM | **No network access at all** — that environment is documented as offline |
| Credentials on disk | No `.env`, no `supabase/config.toml`, no project ref, no keys anywhere under `~/Tools` |
| `package.json` | `@netlify/blobs` only — no `@supabase/supabase-js` |

So I could not create a project, could not obtain a project URL or anon key, could not configure Auth, could not enable RLS on a real instance, and could not send a magic link.

### What I need from you

1. **A Supabase project** — create one at supabase.com (free tier is sufficient for Gate C), or tell me if one already exists.
2. **The project URL and the anon / publishable key.** These are the public client values and are safe to paste into a session and to commit in client config. Post them here or drop a `.env` into `~/Tools/Live/`.
3. **Never** the service-role key or the database password. If I ever appear to need one, that is a design error — say no.
4. **A route for me to reach it.** Even with keys, this session cannot reach `supabase.com` over the network. Two options:
   - run the Gate C continuation **on your computer** via the desktop app's "Run this task" picker — but note that VM is also offline, so this only helps if it has been changed since; or
   - apply `supabase/migrations/*.sql` yourself in the Supabase SQL editor (copy-paste, two files, in order) and paste back the result. The migrations are written to be run exactly that way.
5. **A hosted callback URL** for magic-link testing. Netlify already serves `tools.homewealthsolutions.com`; a Netlify **preview/branch deploy** would be the safe non-production target. That is a deployment decision I am not authorized to make.

Item 4 is the real blocker. Items 1–3 alone are not enough while the network path is closed.

## 6–7. Auth implementation / magic-link behaviour

**Not implemented.** Supabase Auth, magic-link email login, session persistence across reload, and expired-session handling all require a live project. No custom authentication was written — the authorization forbids it and I did not.

## 8. Database tables

All seven Phase 2 tables are defined in `0001_bse_schema.sql` and **were created and exercised on a real PostgreSQL 16.13 instance**:

`buyer_profile` · `shopping_plan` · `property` · `property_scenario` · `negotiation_round` (five buyer-owned) · `program_assumption_set` · `tax_method` (two reference).

The schema was not collapsed or redesigned. Where Phase 2 §18.4 gave illustrative DDL, this is that DDL made executable, plus the constraints Phase 2 described in prose.

## 9. Canonical → database mapping

Implemented in `supabase/mapping/canonical-to-db.js` as pure functions. Every persisted field, by table:

**`buyer_profile`** (owner: `owner_user_id`) — `display_name` text NOT NULL · `reference_code` text NULL · `qualifying_income_monthly` numeric(12,2) NOT NULL · `monthly_debts` numeric(12,2) NOT NULL · `credit_score` smallint NULL · `own_funds` / `gift_funds` numeric(12,2) NOT NULL · `is_first_time_buyer` / `va_eligible` / `va_funding_fee_exempt` boolean NOT NULL · `va_use` text NULL · `dti_override_enabled` boolean NOT NULL, `dti_override_front` / `_back` numeric(5,2) NULL, `dti_override_source` text NULL · `homestead_intent` boolean NULL · `prior_homestead_market_value` / `_assessed_value` numeric(12,2) NULL · `portability_eligible` boolean NOT NULL · `status` text NOT NULL · `organization_id` uuid NULL.

**`shopping_plan`** — `target_payment` numeric(12,2) NOT NULL · `dp_target_value` numeric(12,2) NULL + `dp_target_unit` text NULL *(pair)* · `planned_stay_years` smallint · `buyer_priority` text · `tax_method` text NOT NULL → `tax_method(code)` · `tax_rate_pct` numeric(7,4) NULL · `tax_annual_amount` numeric(12,2) NULL · `tax_input_unit` text NOT NULL · `hoi_monthly` numeric(10,2) NULL · `hoa/cdd/flood_monthly` numeric(10,2) NULL + `_status` text NOT NULL *(three-state)* · **`rate_conv` / `rate_fha` / `rate_va` numeric(6,3) NULL** · **`closing_cost_pct` numeric(5,2) NULL** · `assumption_set_id` uuid NOT NULL · `is_active` boolean · `superseded_at` timestamptz NULL.

**`property`** — `label` text NOT NULL · address parts, `state` char(2) default `FL`, `county`, `property_type`, `mls_number`, `status`.

**`property_scenario`** — `analysis_mode` text NOT NULL (`shopping|property`) · `list_price` numeric(12,2) NULL · every assumption override column NULLABLE (NULL = inherit) · `closing_cost_override_amount` · `dp_target_value/unit` *(pair)* · `dti_override_*` · **`negotiation_mode` text NOT NULL**, **`offer_concession_value` numeric(12,2) NULL + `offer_concession_unit` text NULL** *(pair)* · `closing_date` / `occupancy_date` date NULL · `tax_method` / `tax_method_version` / `tax_inputs` / `tax_outputs` · `qualifying_tax_basis` text NOT NULL default `projected_reassessed` · `assumption_set_id` NOT NULL, `assumption_overrides` jsonb, `engine_version` text NOT NULL, `resolved_inputs` jsonb · **`result_summary` jsonb NULL — cache only** · `status`, `is_accepted_property`.

**`negotiation_round`** — `round_number` smallint NOT NULL · `actor` text NOT NULL · **`price` numeric(12,2) NOT NULL, CHECK > 0** · `concession_value` + `concession_unit` *(pair)* · `negotiation_mode` (buyer rounds only) · `loan_program_override` · `manual_split_*` (reserved, M-12) · `is_accepted` · `result_summary` jsonb — cache only.

No DOM presentation state is persisted as economic truth. The Gate A `presentation` payload is reconstructed from the authored values on load, not stored as display strings.

## 10. `organization_id`

Nullable `uuid` on all five buyer-owned tables. Unused, unindexed, referenced by no policy. **No team functionality of any kind** — no organization UI, invitations, roles, sharing or permissions. RLS remains owner-based (L-10).

## 11–12. Assumption set and versioning

`program_assumption_set` holds `version_label` (unique), `effective_from`, `is_current`, `payload` jsonb, `notes`. `2026.07-baseline` is seeded with the audited payload verbatim — **buydown `pct_per_point: 0.25`** (L-8; Staging's 0.24 not adopted), the PMI table, MI and VA constants, loan limits, rate defaults and the nine decision thresholds.

Immutability is enforced in the database: a `BEFORE UPDATE OR DELETE` trigger raises *"program_assumption_set is INSERT-only — create a new version instead"* (M-9). A partial unique index enforces exactly one `is_current` row. Reproducibility metadata — `engine_version`, `assumption_set_id`, `tax_method`, `tax_method_version`, `shopping_plan_id` — is carried on `property_scenario`.

## 13. RLS policies

Enabled **and forced** on all five buyer-owned tables:

```sql
create policy <table>_owner_all on <table>
  for all using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
```

Reference tables are readable by `authenticated` and writable by nobody. `owner_user_id` is denormalised onto every table so no policy needs a join. Table privileges are granted to `authenticated` only — security comes from auth + RLS, never from frontend filtering.

## 14. RLS test results

Executed on real PostgreSQL with `force row level security` and the policies above, using two users and Supabase's own `request.jwt.claim.sub` mechanism:

| Assertion | Result |
|---|---|
| RLS enabled AND forced on all five tables | **PASS** |
| User B cannot `SELECT` user A's buyer | **PASS** — 0 rows |
| User B cannot `UPDATE` it | **PASS** — 0 rows affected |
| User B cannot `DELETE` it | **PASS** — 0 rows affected |
| User B cannot `INSERT` a row owned by user A | **PASS** — blocked by `WITH CHECK` |
| User B sees zero of user A's rows in an unfiltered count | **PASS** |
| User A still sees their own record | **PASS** |

## 15. Cross-user denial result

**Denied on every operation**, as above. This is real Postgres RLS with the real policy text — the only substitution is the `auth.uid()` function body, which reads the same GUC Supabase populates from the JWT.

## 16–20. Entity persistence

All five buyer-owned entities were written, read back, and reconstructed into the application across **13 round-trip cases**. `negotiation_round` rows are emitted only when a price exists; scenario-level negotiation intent persists without one.

## 21. Authored NULL behaviour

A blank rate and a blank closing-cost percent are written as **SQL NULL**, not as the resolved 6.750 / 3.00. Verified by reading the column back: `rate_conv IS NULL`, `closing_cost_pct IS NULL`. On load they restore as `null` in canonical state and resolve through the assumption set at calculation time. **The resolved default is never written to an authored column** — the mapping module never calls `resolve()`.

## 22. Explicit zero behaviour

An authored `0` is stored as `0` and read back as `0`, distinct from NULL, and beats the default on resolution.

## 23–24. Blank-rate and blank-closing-cost round trips

**PASS** both. Canonical A → database → canonical B is identity for authored state, and the recomputed engine result matches.

## 25. Concession-before-price round trip

**PASS.** `offer_concession_value = 5000`, `offer_concession_unit = 'amount'` on the scenario, **zero negotiation rounds created**. A `2%` concession with no price at all round-trips as `(2, percent)` — retained, not zeroed.

## 26. Negotiation-mode-before-round round trip

**PASS.** `negotiation_mode = 'reduction'` persists on the scenario with no round. With an offer and counter present, both rounds persist with their prices, the buyer round carries the mode, and the seller round's mode is NULL per §8.

## 27–33. Manual save, load/recompute, autosave, debounce, stale-write, save status, network failure

**Not implemented.** These are client-side behaviours that must be built against the real Supabase client and proven against a live backend. Building them now against a stub would produce untested code and would violate the gate's own sequencing ("do not build autosave before explicit save/load is proven"). The **serialization half** — what a save writes and what a load reconstructs — is implemented and proven; the transport half is not.

## 34. `result_summary` persistence contract

Locked in the schema and the mapping:

- `result_summary` is `jsonb NULL` on `property_scenario` and `negotiation_round`.
- The mapping writes it **only** from a separate `resultSummaryCache` argument — never from canonical state.
- `deserialize()` **does not return it into canonical state at all**; the reconstructed model has no `result_summary` key.
- The application layer already strips it on `apply()` and rebuilds it from a fresh engine run (Gate B.75).

## 35. Stale-cache test

A deliberately false cache — `recommended_program: 'fha'`, `piti: 1`, `binding_constraint: 'Nonsense'`, `assumption_set_version: 'bogus'` — was stored alongside **every one of the 13 scenarios**. On load, all 13 recomputed to the correct program, PITI and `2026.07-baseline`, and the cache never entered canonical state.

## 36. Confirmation recomputation always wins

Confirmed at both boundaries: the mapping refuses to return a cache into canonical state, and the application recomputes on load. 13 of 13 cases.

## 37. Cross-session / cross-device result

**Not proven.** Requires Supabase Auth. The *data* half is proven — canonical state written by one connection is read back and reconstructed identically by another — but that is not the same as an authenticated user on a second device, and I am not going to present it as if it were.

## 38. Cross-user isolation result

**Proven at the database layer** (§14). Not proven end-to-end through Supabase Auth.

## 39–44. Existing suite results

The application file was not modified, so every existing suite runs against the identical binary:

| Suite | Result |
|---|---|
| Permanent numerical regression (68 executable units) | **68 / 68**, 1 not executable · 4,000 verified + 1,157 review fields |
| Gate A M-1 | **80 / 80** |
| Gate B canonical state | **22 / 22** |
| Gate B.5 C-4b presentation integrity | **64 / 64** |
| Gate B.5 model authority (33-case edge sweep) | **12 / 12** |
| Gate B.75 persistence contract | **40 / 40** |
| Cross-tool R-47 | **4 / 4** |

## 45. New Gate C tests

`tests/persistence-db.test.js` — **52 assertions, 52 pass**, against a real PostgreSQL 16.13 database built from the migrations: schema and RLS presence, cross-user denial (6), authored NULL and explicit zero (4), 13 canonical round trips, 13 stale-cache recompute checks, pair-split refusal (2), three-state refusal, round-price refusal (2), `fl_millage`-without-closing-date refusal, soft-delete guard, assumption-set immutability.

## 46–47. Total assertions and failures

**342 assertions · 0 failures** (290 existing + 52 new).

## 48. Confirmation calculation mathematics unchanged

Confirmed trivially and strongly: `internal/buyer-strategy/index.html` is **byte-identical** to Gate B.75 (`90bcc96f62feb7f90c34c8407ddeacd0`). The `Engine` IIFE remains byte-identical to `540ccbe`.

## 49. Confirmation `maxPriceForScenario` unchanged

Confirmed — the file was not touched.

## 50. Confirmation buydown ratio = 0.25

Confirmed in the engine, in the application's frozen assumption set, and now in the seeded database payload.

## 51. Confirmation FL tax NOT integrated

Confirmed. `fl_millage` exists as an **inactive** `tax_method` row and as a `CHECK` that it cannot be used without a closing date. No millage, assessed value, homestead, Save Our Homes or portability logic anywhere. Shopping plans are `flat_rate` by default.

## 52–54. Protected file MD5s

| File | MD5 | Status |
|---|---|---|
| `Tools/Live/property-tax.html` | `1cd00523ad5845942ec6e812538b6312` | unchanged |
| `Tools/Live/buyer/comfort-calculator.html` | `772de6d1e3d6b3182049af6a7bcebedd` | unchanged |
| `Tools/Staging/buyer-strategy-v2/index.html` | `01830ac60b3ec9c1db4a73ce76201f2f` | unchanged |

## 55. Git status

Clean.

## 56. Current branch

`phase3/gate-c-supabase-persistence`

## 57. Uncommitted / configuration work

None uncommitted. **All Supabase-side configuration is outstanding**: project creation, Auth settings, redirect URLs, applying the migrations, and the client keys. No secret exists in the repository, in the documentation, or in this session.

## 58. Known limitations

1. **No Supabase project exists.** Everything in §6–7, §27–33 and §37 is blocked on it.
2. **RLS is proven on PostgreSQL 16, not on Supabase.** The policy text is what will ship; only `auth.uid()`'s body was supplied locally. It reads the same `request.jwt.claim.sub` setting Supabase populates.
3. **`local-verify/00_auth_stub.sql` must never be applied to Supabase** — it is labelled accordingly in the file and the README.
4. **The client persistence layer does not exist yet** — no `@supabase/supabase-js`, no save/load UI, no autosave, no save-status indicator.
5. **The mapping is Node-side today.** It is a pure CommonJS module with no browser wrapper; the browser client will need a small ESM/global shim.
6. **Numeric round-trip relies on explicit parsing.** `numeric` returns as a string from `pg`; the mapping parses it back. A future client must do the same or it will silently compare `"6.750"` to `6.75`.
7. **No offline-first behaviour**, by design.
8. Carried forward and unchanged: `num()` coercion (M-4), the floating `%` concession base (M-13), Shopping-Mode unit reinterpretation, PMI band `c` unreachable, `BSEModel.capture()` on every `recalc()`, 1,157 review fields, no human validation, and the git device-bridge lock limitation.

## 59. What blocks the next step

Exactly one thing: **a reachable Supabase project**. See §5 for the five items and which of them actually matter.

Secondary, once that exists: the Netlify preview target for magic-link callbacks needs your authorization, since it is a deployment.

## 60. Is Gate C ready for approval?

**No.** Measured against the stated completion standard:

| Requirement | Status |
|---|---|
| Supabase schema exists and is reproducible | **Met** — as repository artifacts, verified on real Postgres |
| Authentication works | **Not met** — blocked |
| RLS is active and tested | **Partly** — policies written and tested on Postgres; not active on Supabase |
| Buyer Profiles / Shopping Plans / Property / Scenario persist | **Met at the data layer**, not through a live backend |
| Authored NULL survives round trip | **Met** |
| Explicit zero survives round trip | **Met** |
| Canonical value/unit pairs survive round trip | **Met** — and are enforced by CHECK constraints |
| `result_summary` remains non-authoritative | **Met** at both boundaries |
| Load always recomputes | **Met** |
| Same-user cross-session access works | **Not met** — blocked |
| Different-user access is denied | **Met at the database layer** |
| Autosave cannot overwrite newer state | **Not met** — not built |
| Network failure fails safely | **Not met** — not built |
| Regression suite green | **Met** — 342 / 342 |
| No privileged secrets exposed or committed | **Met** — none exist |
| Calculation mathematics unchanged | **Met** — file byte-identical |

Roughly the schema-and-contract half of Gate C is done and verified. The auth-and-transport half has not started and cannot until §5 is resolved.

---

## GATE C COMPLIANCE STATEMENT

- The Gate B.75 baseline was verified independently before any work began.
- The Phase 2 seven-table architecture was implemented as specified — not collapsed, not redesigned.
- Every locked decision from Gates A through B.75 is now enforced by the database as well as the application: unsplittable `(value, unit)` pairs, authored NULL versus authored zero, three-state cost fields, a round requiring a price, scenario-level negotiation intent without one, immutable assumption sets, and `result_summary` as cache only.
- No calculation function was modified. The application file is byte-identical to Gate B.75.
- `property-tax.html`, `buyer/comfort-calculator.html` and the Staging BSE are unchanged.
- No FL millage was integrated. The Comfort Calculator was not touched.
- **No secret of any kind was created, requested, committed, or written into documentation.**
- Nothing was deployed.
- **Work stopped at the stop condition rather than improvising around it.**

---

*Prepared for Doug Smith, President & Broker, CMA® · HomeWealth Solutions LLC · NMLS #2742458 · FL OFR Mortgage Broker License #MBR8082 · doug@homewealthsolutions.com · 813-733-7371*
