<!--
BUYER STRATEGY ENGINE — PHASE 3, GATE C REPORT
File: docs/BSE-Phase3-GateC-Report.md
Status: Gate C code-complete and verified. STOPPED before live-auth verification
        and before any deployment, per authorization.
Origin: Cowork session of 2026-07-28.
-->

# BUYER STRATEGY ENGINE — PHASE 3, GATE C
## Supabase + Auth + Cross-Device Persistence — Report

**HomeWealth Solutions LLC** · Company NMLS #2742458 · FL OFR Mortgage Broker License #MBR8082
Prepared for: Doug Smith, President & Broker, CMA®
Date: **July 28, 2026**

> ## STATUS
>
> **Built, tested and committed: 401 assertions, 0 failures.** The schema and RLS are live in the `hws-buyer-strategy` Supabase project. The client persistence layer is implemented, and every part of it that can be proven without a live inbox has been proven.
>
> **Three things remain, and all three require you, not me** — a magic-link sign-in, a genuine second device, and a second Supabase account. They need a human with an email inbox. §58 is the exact procedure.
>
> **Nothing was deployed.** No production, no preview, no Netlify. The tool runs from `localhost:8080` for testing only.

---

## 1. Gate C branch

`phase3/gate-c-supabase-persistence`, created from the approved Gate B.75 HEAD and confirmed checked out before any file was written.

## 2. Starting commit

`98bfd3c` — verified independently: branch, HEAD, clean tree, no residual locks, all seven controlling documents present, `__legacyGatherInputsFromDom` absent, `RESULT_SUMMARY_AUTHORITATIVE = false` present, `negotiation_mode` / `offer_concession_value` present, engine region byte-identical, and all three protected MD5s unchanged.

## 3. Ending commit

`d7dbbcf` was the interim stop. This report covers the work through the Gate C completion commit on the same branch. The BSE application file is now **`5a34444d249c40558d925e0c4cb76f08`**, up from Gate B.75's `90bcc96f62feb7f90c34c8407ddeacd0`.

## 4. Files changed

| File | Change |
|---|---|
| `internal/buyer-strategy/index.html` | **Modified — purely additive.** One 571-line block inserted before `init()`, plus two lines appended after `init()`. `diff` reports **zero deletions and zero modified lines** |
| `supabase/migrations/0001_bse_schema.sql` | Added — seven-table schema, constraints, indexes, RLS, triggers, grants |
| `supabase/migrations/0002_seed_reference_data.sql` | Added — tax methods + the immutable `2026.07-baseline` assumption set |
| `supabase/local-verify/00_auth_stub.sql` | Added — local-only `auth.uid()` / `auth.role()` so the migrations can be executed and RLS exercised on plain Postgres |
| `supabase/README.md` | Added |
| `supabase/mapping/canonical-to-db.js` | **Added, then deleted** — see §9 |
| `internal/buyer-strategy/tests/persistence-db.test.js` | Added — 70 assertions against a real PostgreSQL 16.13 database |
| `internal/buyer-strategy/tests/persistence-client.test.js` | Added — 41 assertions, no database and no network required |
| `internal/buyer-strategy/tests/README.md` | Updated — nine suites, 401 assertions, coverage limits restated |

The full application diff:

```
3395a3396,3966      (the persistence block)
3423a3995,3996      (the boot call)
```

Two insertions. Nothing removed, nothing rewritten. That is the strongest available statement that no calculation changed.

## 5. Supabase project / configuration status

**Configured and live.**

| Item | Status |
|---|---|
| Project `hws-buyer-strategy` | Created by Doug |
| `0001_bse_schema.sql` | Applied — *Success. No rows returned.* |
| `0002_seed_reference_data.sql` | Applied — *Success. No rows returned.* |
| Seven post-migration verification checks | **7 of 7 PASS** — tables 7/7; RLS enabled+forced 5/5; owner policies 5/5; pair-intact constraints 3/3; round price NOT NULL; assumption set `2026.07-baseline` with buydown `0.25`; tax methods `fl_millage=false`, `flat_rate=true` |
| Email (magic-link) authentication | Enabled |
| Site URL / redirect | `http://localhost:8080` and `http://localhost:8080/**` |
| Project URL + publishable key | Supplied and embedded in the client — both are **public** values |
| Service-role key / database password | **Never requested, never received, never present anywhere** |

## 6. Auth implementation

Supabase Auth via `@supabase/supabase-js@2`, loaded lazily as an ES module from `esm.sh` at boot. No custom authentication was written — no password handling, no token minting, no session forgery. The client calls exactly four auth methods: `getSession`, `signInWithOtp`, `signOut`, `onAuthStateChange`.

The interface is a single fixed bar in the top-right corner: a status chip, an email field, **Email me a link**, **Save**, and **Sign out**. Signed out shows the email field and the sign-in button; signed in shows Save and Sign out.

## 7. Magic-link behaviour

`signInWithOtp({ email, options: { emailRedirectTo: window.location.origin + window.location.pathname } })`. The callback returns to the same page, `onAuthStateChange` fires, the session is adopted, the record binding is cleared, and the chip moves from *Sign in to save* to *Saved*.

Session persistence across reload and expiry handling are delegated entirely to the Supabase client's own storage and refresh logic. **Verified only by code inspection**, not by execution — see §58.

## 8. Database tables

All seven Phase 2 tables, live in Supabase and exercised on real PostgreSQL 16.13 on every test run:

`buyer_profile` · `shopping_plan` · `property` · `property_scenario` · `negotiation_round` (five buyer-owned) · `program_assumption_set` · `tax_method` (two reference).

The schema was not collapsed or redesigned. Where Phase 2 §18.4 gave illustrative DDL, this is that DDL made executable, plus the constraints Phase 2 described in prose.

## 9. Canonical → database mapping

**The mapping lives in the application**, inside `BSEPersistence` in `index.html`. This is a change from the interim commit, and it is deliberate.

The interim version put the mapping in `supabase/mapping/canonical-to-db.js` and had the test import the Node module. That is a **second source of truth** — the exact defect Gate B.5 removed when it deleted `__legacyGatherInputsFromDom()`. A mapping that the tests exercise but the browser does not is a mapping that can drift from the one that actually writes to your buyers' records.

So `canonical-to-db.js` was **deleted**, and `persistence-db.test.js` now calls `BSEPersistence.__serializeRows` and `__deserializeRows` **inside the page**. The same code that talks to Supabase is the code under test, byte for byte.

Every persisted field, by table:

**`buyer_profile`** (owner: `owner_user_id`) — `display_name` text NOT NULL · `reference_code` text NULL · `qualifying_income_monthly` numeric(12,2) NOT NULL · `monthly_debts` numeric(12,2) NOT NULL · `credit_score` smallint NULL · `own_funds` / `gift_funds` numeric(12,2) NOT NULL · `is_first_time_buyer` / `va_eligible` / `va_funding_fee_exempt` boolean NOT NULL · `va_use` text NULL · `dti_override_enabled` boolean NOT NULL, `dti_override_front` / `_back` numeric(5,2) NULL, `dti_override_source` text NULL · `homestead_intent` boolean NULL · `prior_homestead_market_value` / `_assessed_value` numeric(12,2) NULL · `portability_eligible` boolean NOT NULL · `status` text NOT NULL · `organization_id` uuid NULL.

**`shopping_plan`** — `target_payment` numeric(12,2) NOT NULL · `dp_target_value` numeric(12,2) NULL + `dp_target_unit` text NULL *(pair)* · `planned_stay_years` smallint · `buyer_priority` text · `tax_method` text NOT NULL → `tax_method(code)` · `tax_rate_pct` numeric(7,4) NULL · `tax_annual_amount` numeric(12,2) NULL · `tax_input_unit` text NOT NULL · `hoi_monthly` numeric(10,2) NULL · `hoa/cdd/flood_monthly` numeric(10,2) NULL + `_status` text NOT NULL *(three-state)* · **`rate_conv` / `rate_fha` / `rate_va` numeric(6,3) NULL** · **`closing_cost_pct` numeric(5,2) NULL** · `assumption_set_id` uuid NOT NULL · `is_active` boolean · `superseded_at` timestamptz NULL.

**`property`** — `label` text NOT NULL · address parts, `state` char(2) default `FL`, `county`, `property_type`, `mls_number`, `status`.

**`property_scenario`** — `analysis_mode` text NOT NULL (`shopping|property`) · `list_price` numeric(12,2) NULL · every assumption override column NULLABLE (NULL = inherit) · `closing_cost_override_amount` · `dp_target_value/unit` *(pair)* · `dti_override_*` · **`negotiation_mode` text NOT NULL**, **`offer_concession_value` numeric(12,2) NULL + `offer_concession_unit` text NULL** *(pair)* · `closing_date` / `occupancy_date` date NULL · `tax_method` / `tax_method_version` / `tax_inputs` / `tax_outputs` · `qualifying_tax_basis` text NOT NULL default `projected_reassessed` · `assumption_set_id` NOT NULL, `assumption_overrides` jsonb, `engine_version` text NOT NULL, `resolved_inputs` jsonb — **written as NULL, always** · **`result_summary` jsonb NULL — cache only** · `status`, `is_accepted_property`.

**`negotiation_round`** — `round_number` smallint NOT NULL · `actor` text NOT NULL · **`price` numeric(12,2) NOT NULL, CHECK > 0** · `concession_value` + `concession_unit` *(pair)* · `negotiation_mode` (buyer rounds only) · `loan_program_override` · `manual_split_*` (reserved, M-12) · `is_accepted` · `result_summary` jsonb — cache only.

No DOM presentation state is persisted as economic truth. The Gate A `presentation` payload is **reconstructed from the authored values on load**, never stored as display strings — see §45, test P8.

## 10. `organization_id`

Nullable `uuid` on all five buyer-owned tables. Unused, unindexed, referenced by no policy. **No team functionality of any kind** — no organization UI, invitations, roles, sharing or permissions. RLS remains owner-based (L-10).

## 11–12. Assumption set and versioning

`program_assumption_set` holds `version_label` (unique), `effective_from`, `is_current`, `payload` jsonb, `notes`. `2026.07-baseline` is seeded with the audited payload verbatim — **buydown `pct_per_point: 0.25`** (L-8; Staging's 0.24 not adopted), the PMI table, MI and VA constants, loan limits, rate defaults and the nine decision thresholds. Confirmed present and current in the live project.

Immutability is enforced in the database: a `BEFORE UPDATE OR DELETE` trigger raises *"program_assumption_set is INSERT-only — create a new version instead"* (M-9). A partial unique index enforces exactly one `is_current` row. Reproducibility metadata — `engine_version`, `assumption_set_id`, `tax_method`, `tax_method_version`, `shopping_plan_id` — is carried on `property_scenario`.

## 13. RLS policies

Enabled **and forced** on all five buyer-owned tables:

```sql
create policy <table>_owner_all on <table>
  for all using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
```

Reference tables are readable by `authenticated` and writable by nobody. `owner_user_id` is denormalised onto every table so no policy needs a join. Table privileges are granted to `authenticated` only — security comes from auth + RLS, never from frontend filtering.

The client reinforces this rather than relying on it: every row it writes takes `owner_user_id` from the **session**, never from anything the page holds (§45, test P2).

## 14. RLS test results

Executed on real PostgreSQL with `force row level security` and the shipping policy text, using two users and Supabase's own `request.jwt.claim.sub` mechanism:

| Assertion | Result |
|---|---|
| RLS enabled AND forced on all five tables | **PASS** |
| User B cannot `SELECT` user A's buyer | **PASS** — 0 rows |
| User B cannot `UPDATE` it | **PASS** — 0 rows affected |
| User B cannot `DELETE` it | **PASS** — 0 rows affected |
| User B cannot `INSERT` a row owned by user A | **PASS** — blocked by `WITH CHECK` |
| User B sees zero of user A's rows in an unfiltered count | **PASS** |
| User A still sees their own record | **PASS** |

The same policies are confirmed enabled and forced in the live project by the seven post-migration checks (§5).

## 15. Cross-user denial result

**Denied on every operation**, as above. This is real Postgres RLS with the real policy text — the only substitution is the `auth.uid()` function body, which reads the same GUC Supabase populates from the JWT. End-to-end denial through Supabase Auth is §58, item 3.

## 16–20. Entity persistence

All five buyer-owned entities are written, read back, and reconstructed into the application across **13 round-trip cases**, each asserting canonical A → database → canonical B identity for authored state. `negotiation_round` rows are emitted only when a price exists; scenario-level negotiation intent persists without one.

## 21. Authored NULL behaviour

A blank rate and a blank closing-cost percent are written as **SQL NULL**, not as the resolved 6.750 / 3.00. Verified by reading the column back: `rate_conv IS NULL`, `closing_cost_pct IS NULL`. On load they restore as `null` in canonical state and resolve through the assumption set at calculation time. **The resolved default is never written to an authored column** — the persistence layer never calls `resolve()`, and `resolved_inputs` is written as NULL unconditionally.

## 22. Explicit zero behaviour

An authored `0` is stored as `0` and read back as `0`, distinct from NULL, and beats the default on resolution.

## 23–24. Blank-rate and blank-closing-cost round trips

**PASS** both, at the database and through a full application restore.

## 25. Concession-before-price round trip

**PASS.** `offer_concession_value = 5000`, `offer_concession_unit = 'amount'` on the scenario, **zero negotiation rounds created**. A `2%` concession with no price at all round-trips as `(2, percent)` — retained, not zeroed.

## 26. Negotiation-mode-before-round round trip

**PASS.** `negotiation_mode = 'reduction'` persists on the scenario with no round. With an offer and counter present, both rounds persist with their prices, the buyer round carries the mode, and the seller round's mode is NULL per §8.

## 27. Manual save

**Implemented and proven.** The **Save** button calls `saveNow()`, which captures canonical state, recomputes the summary separately, serialises, and writes parents-then-children. One click produces exactly one coherent row set with correct foreign keys and the session's user as owner on every row. A second save reuses the same record ids rather than creating a duplicate buyer.

## 28. Load and recompute

**Implemented and proven.** `load(buyerProfileId)` reads the row set, rebuilds the presentation payload from authored values, applies the canonical model, and then runs a **fresh engine computation**. It returns `authoritative_source: 'recomputed'` and reports what the discarded cache said. Test P6 wipes the live inputs before loading and confirms the authored price is restored and the recomputed answer matches what the engine produced before the save.

## 29. Autosave

**Implemented and proven.** Listeners are attached to `input` and `change` on every field, **separately from `recalc()`**, at boot and before any network work. Each event schedules a debounced save. A user edit recalculates immediately; the save happens later and independently.

## 30. Debounce

**1500 ms.** Test P3 fires eight rapid edits inside one window: **zero writes during the burst, exactly one write after it settles, carrying the last value typed, not the first.**

## 31. Stale-write protection

**Implemented and proven.** Saves are **single-flight with a queued latest**. If a save is requested while one is in flight, the request is queued; when the in-flight write returns, the **newest** canonical state is captured and written. A monotonic client revision counter records which snapshot won.

Test P4 stalls the first write for 500 ms, changes the price mid-flight, and requests a second save. Result: two writes, in order, `400000` then `600000` — **an older snapshot cannot land on top of a newer one.**

## 32. Save status

**Implemented and proven.** A status chip reports five states truthfully:

| State | Chip |
|---|---|
| No library / no network | *Not connected* |
| Transport present, signed out | *Sign in to save* |
| Signed in, nothing pending | *Saved* |
| Write genuinely in flight | *Saving…* |
| Write failed | *Save failed — <reason>*, in red, with the tooltip "Your work is still here. Fix the connection and press Save." |

Test P7 asserts each of these against the actual DOM text, including that *Saving…* is only shown while a write is truly open and *Saved* only after it returned.

## 33. Network failure

**Implemented and proven.** A failing save returns `{ ok: false, error }` — it does not throw at the user. Test P5 confirms that after a failure the buyer's canonical state is **byte-identical**, the displayed recommendation is unchanged, their typed input is still on screen, the chip names the reason, and a retry succeeds and clears the error.

## 34. `result_summary` persistence contract

Locked in the schema, the client, and the tests:

- `result_summary` is `jsonb NULL` on `property_scenario` and `negotiation_round`.
- `serializeRows` writes it **only** from a separate `resultSummaryCache` argument, never from canonical state, and stamps `cache_only: true`, `authoritative: false`.
- `deserializeRows` **does not return it at all**. Test D10 asserts the reconstructed model has no `result_summary` key — not a null one, none.
- `load()` recomputes from a fresh engine run and returns the recompute.
- The application layer already strips it on `apply()` (Gate B.75).

## 35. Stale-cache test

A deliberately false cache — `recommended_program: 'fha'`, `piti: 1`, `binding_constraint: 'Nonsense'`, `assumption_set_version: 'bogus'` — is stored alongside **every one of the 13 database scenarios**. All 13 recompute to the correct program, PITI and `2026.07-baseline`.

Test P6 does the same through the real client path with a poisoned `'va'` cache and asserts the poison did not become the answer, and that `load()` reports `cache_agreed_with_recompute: false`.

## 36. Confirmation recomputation always wins

Confirmed at three boundaries: the schema stores the cache in an isolated column, `deserializeRows` refuses to return it, and `load()` recomputes. 13 of 13 database cases, plus the client-path test.

## 37. Cross-session / cross-device result

**Not proven, and I will not present it as proven.** The data half is proven — canonical state written by one connection is read back and reconstructed identically by another, and the client's save/load orchestration is proven against a mock transport. Neither is the same as you signing in on a second device. §58, item 2.

## 38. Cross-user isolation result

**Proven at the database layer** (§14) and reinforced in the client (§13). **Not proven end-to-end through Supabase Auth** — that needs a second real account. §58, item 3.

## 39–44. Existing suite results

Every pre-Gate-C suite, run against the patched file:

| Suite | Result |
|---|---|
| Permanent numerical regression (68 executable units) | **68 / 68**, 1 not executable · 4,000 verified + 1,157 review fields |
| Gate A M-1 | **80 / 80** |
| Gate B canonical state | **22 / 22** |
| Gate B.5 C-4b presentation integrity | **64 / 64** |
| Gate B.5 model authority (33-case edge sweep) | **12 / 12** |
| Gate B.75 persistence contract | **40 / 40** |
| Cross-tool R-47 | **4 / 4** |

Not one number moved.

## 45. New Gate C tests

**`tests/persistence-db.test.js` — 70 assertions, 70 pass**, against a real PostgreSQL 16.13 database built from the migrations: schema and RLS presence (3), cross-user denial (6), authored NULL and explicit zero (4), 13 canonical round trips, 13 `result_summary`-absent checks, 13 stale-cache recompute checks, pair-split refusal (2), three-state refusal, round-price refusal (2), `fl_millage`-without-closing-date refusal, soft-delete guard, **repeat-save write strategy (5 — see §57)**, assumption-set immutability.

**`tests/persistence-client.test.js` — 41 assertions, 41 pass**, no database and no network. A mock transport is injected through a testing hook; everything it exercises is the application's own code.

| Group | Proves |
|---|---|
| P1 (4) | No library or no account → the tool still calculates. Saves are refused, not thrown (M-10) |
| P2 (6) | A manual save writes one coherent row set; **owner comes from the session**; foreign keys are internally consistent; the cache is stamped non-authoritative; `resolved_inputs` stays NULL; a second save reuses the same ids |
| P3 (4) | Debounce collapses a burst to one write carrying the **last** value; **`recalc()` alone never persists** (M-8) |
| P4 (3) | Single-flight with queued latest; the newer snapshot lands last; the revision counter agrees |
| P5 (6) | A failed save leaves canonical state, the recommendation and the buyer's typed input untouched, names the reason, and recovers on retry |
| P6 (5) | Load restores authored values, recomputes, and a poisoned cache is inert and reported |
| P7 (4) | Every save-status chip state is truthful |
| P8 (5) | The presentation payload is rebuilt from **authored** values — `(3.375, pct)`, `(1.205, pct)`, `(2.75, pct)` — so restore cannot double-convert (M-1) |
| P9 (3) | Signing out clears the record binding but **not the buyer's work on screen** |
| P-ERR (1) | No JavaScript errors anywhere in the suite |

## 46–47. Total assertions and failures

**401 assertions · 0 failures** (290 existing + 70 database + 41 client).

## 48. Confirmation calculation mathematics unchanged

Confirmed three independent ways:

1. `diff` against Gate B.75 reports **two insertions, zero deletions, zero modifications**.
2. The `Engine` IIFE region hashes to `96e6bea541a19e1ac3ec3f82cd45525c` — **byte-identical to the pre-Phase-3 baseline `540ccbe`**, unchanged through Gates A, B, B.5, B.75 and C.
3. All 290 pre-existing assertions produce identical values.

## 49. Confirmation `maxPriceForScenario` unchanged

Confirmed — inside the byte-identical engine region.

## 50. Confirmation buydown ratio = 0.25

Confirmed in the engine, in the application's frozen assumption set, in the seeded database payload, and in the live project's verification check.

## 51. Confirmation FL tax NOT integrated

Confirmed. `fl_millage` exists as an **inactive** `tax_method` row and as a `CHECK` that it cannot be used without a closing date. No millage, assessed value, homestead, Save Our Homes or portability logic anywhere. Shopping plans are `flat_rate` by default. The live project's check confirms `fl_millage=false`, `flat_rate=true`.

## 52–54. Protected file MD5s

| File | MD5 | Status |
|---|---|---|
| `Tools/Live/property-tax.html` | `1cd00523ad5845942ec6e812538b6312` | unchanged |
| `Tools/Live/buyer/comfort-calculator.html` | `772de6d1e3d6b3182049af6a7bcebedd` | unchanged |
| `Tools/Staging/buyer-strategy-v2/index.html` | `01830ac60b3ec9c1db4a73ce76201f2f` | unchanged |

## 55. Git status

Clean, all Gate C work committed on the branch.

## 56. Current branch

`phase3/gate-c-supabase-persistence`. **Not merged to `main`. Not deployed.**

## 57. A defect found and fixed during Gate C — read this one

The first version of the client wrote negotiation rounds by **deleting every round for the scenario and re-inserting them**. That is a common and normally harmless pattern. Against this schema it is not.

`bse_round_delete_guard` — the Phase 2 §18.6 soft-delete rule, *nothing a client was shown is hard-deletable* — refuses to delete a round once the parent scenario leaves `draft`. I proved this against the real database before shipping it:

```
ERROR: negotiation_round may only be deleted while the parent scenario is
       draft (status=presented)
```

**What that would have cost you.** The moment you marked a scenario as presented to a buyer, every subsequent autosave would have thrown. Not just the rounds — the whole save, because the transport raises on the first error. The buyer would keep negotiating, you would keep typing, the chip would sit on *Save failed*, and nothing would persist for the rest of that file. The one buyer whose data matters most — the one actually in negotiation — is exactly the one who would have lost it.

**The fix.** Rounds are now **upserted on the natural key `(property_scenario_id, round_number)`**. Nothing is deleted except genuinely surplus rounds, and that delete is confined to `round_number > highest`, which matches zero rows in the normal case so the guard never fires. Round identity is now stable across saves — a round a buyer was shown keeps its database id forever.

Five assertions pin this permanently (D12a–e), including **D12a, which asserts the old strategy still fails** so the regression cannot silently return.

A second, smaller ordering defect was found the same way: `attachAutosave()` ran only on the successful boot path, and boot's failure handler could clobber a transport installed while it was still waiting on the CDN. Autosave listeners now attach unconditionally before any network work — `scheduleSave()` is inert without a session, so this is safe — and boot no longer publishes or resets a transport it did not create. Whether a buyer's edits are eligible for autosave must not depend on how long a CDN took to answer.

## 58. What is NOT proven, and exactly what you need to do

Everything below needs a human with an email inbox and a second device. I cannot do any of it, and I did not pretend to.

**Serve the tool** — the redirect URL is registered for `http://localhost:8080`, so it must be served from that exact origin, not opened as a file:

```bash
cd ~/Tools/Live/internal/buyer-strategy
python3 -m http.server 8080
```

Then open `http://localhost:8080/index.html`.

**Test 1 — magic-link sign-in.** Chip should read *Sign in to save*. Enter your email, click **Email me a link**, open the link from your inbox. Expected: you land back on the tool and the chip changes to *Saved*.
*Report:* did the email arrive, did the link return you to the tool, and what does the chip say?

**Test 2 — cross-session and cross-device.** Signed in, fill in a buyer — price, income, debts, funds, score — and click **Save**. Then type a few more changes and wait two seconds without clicking anything; the chip should go *Saving…* → *Saved* on its own. Now close the tab entirely, reopen `http://localhost:8080/index.html`, and confirm you are still signed in. Then do the same on a **second device**, signing in with the same email.
*Report:* did the session survive the reload, and did the second device see the same buyer?

**Test 3 — cross-user denial.** Sign out. Sign in with a **different** email address — a second account. Expected: you see none of the first account's buyers.
*Report:* what did the second account see? Anything other than "nothing" is a security finding and I need to know immediately.

**Test 4 — network failure.** Signed in, turn off wi-fi, change the price, wait two seconds. Expected: the chip reads *Save failed — …* in red, and **your numbers stay on screen and the recommendation stays correct**. Turn wi-fi back on and click **Save**. Expected: *Saved*.
*Report:* did anything disappear or change at the moment the save failed?

**Test 5 — the offline promise (M-10).** Open the tool with wi-fi off from a cold start. Expected: it calculates normally and the chip reads *Not connected*. The tool must never require an account to do its job.

Until you have run these, treat §6, §7, §37 and §38 as **unverified**.

## 59. Known limitations

1. **Supabase Auth is verified by inspection only.** Magic-link delivery, JWT validity, session persistence across reload, and expiry handling are §58.
2. **RLS is proven on PostgreSQL 16, and confirmed enabled+forced on Supabase, but end-to-end denial through PostgREST is not proven.** §58, item 3.
3. **`local-verify/00_auth_stub.sql` must never be applied to Supabase** — labelled in the file and the README.
4. **The Supabase library loads from a public CDN (`esm.sh`) at runtime.** A CDN outage means no-save mode, not a broken tool — but it is an external dependency you should know about. Vendoring it is a reasonable future change.
5. **One buyer per browser binding.** `listBuyers()` exists in the transport but there is no buyer-picker UI, so a signed-in user's saves bind to one record set per session until they load a specific buyer by id. A buyer list is the obvious next increment.
6. **No offline queue.** A save attempted while offline fails, says so, and is retried only when the user edits again or clicks Save. Deliberate — a silent offline queue can resurrect stale numbers.
7. **`numeric` returns as a string.** The deserializer parses every numeric column explicitly. Any future code path that skips that will silently compare `"6.750"` to `6.75`.
8. Carried forward and unchanged: `num()` coercion (M-4), the floating `%` concession base (M-13), Shopping-Mode unit reinterpretation, PMI band `c` unreachable, `BSEModel.capture()` on every `recalc()`, 1,157 review fields, no human validation, and the git device-bridge lock limitation.

## 60. Is Gate C ready for approval?

**The code is done and tested. Approval should wait until you have run the five tests in §58.**

| Requirement | Status |
|---|---|
| Supabase schema exists and is reproducible | **Met** — live, and re-verified on real Postgres every test run |
| Authentication works | **Implemented; awaiting your §58 test 1** |
| RLS is active and tested | **Met** at the database layer, live and local. End-to-end awaits §58 test 3 |
| Buyer Profiles / Shopping Plans / Property / Scenario persist | **Met** |
| Authored NULL survives round trip | **Met** |
| Explicit zero survives round trip | **Met** |
| Canonical value/unit pairs survive round trip | **Met** — enforced by CHECK constraints, and rebuilt from authored values on load |
| `result_summary` remains non-authoritative | **Met** at three boundaries |
| Load always recomputes | **Met** |
| Same-user cross-session access works | **Implemented; awaiting your §58 test 2** |
| Different-user access is denied | **Met at the database layer; awaiting your §58 test 3** |
| Autosave cannot overwrite newer state | **Met** — single-flight with queued latest, proven |
| Network failure fails safely | **Met** — proven |
| Regression suite green | **Met** — 401 / 401 |
| No privileged secrets exposed or committed | **Met** — repository-wide scan clean; only the public URL and publishable key appear |
| Calculation mathematics unchanged | **Met** — two insertions, zero deletions; engine region byte-identical to `540ccbe` |

---

## GATE C COMPLIANCE STATEMENT

- The Gate B.75 baseline was verified before any file was written, and the patch script **refuses to run** against any other input hash.
- The Phase 2 seven-table architecture was implemented as specified — not collapsed, not redesigned.
- Every locked decision from Gates A through B.75 is now enforced by the database as well as the application: unsplittable `(value, unit)` pairs, authored NULL versus authored zero, three-state cost fields, a round requiring a price, scenario-level negotiation intent without one, immutable assumption sets, and `result_summary` as cache only.
- No calculation function was modified. The change is two insertions with zero deletions, and the engine region is byte-identical to the pre-Phase-3 baseline.
- Persistence never runs from `recalc()`, and that is asserted, not asserted-about.
- `property-tax.html`, `buyer/comfort-calculator.html` and the Staging BSE are unchanged.
- No FL millage was integrated. The Comfort Calculator was not touched.
- **No secret of any kind was created, requested, committed, or written into documentation.** A repository-wide scan for service-role keys, database passwords and connection strings returns nothing.
- **Nothing was deployed.** No production, no preview, no Netlify. `localhost:8080` only.
- A real defect was found before shipping, proved against the real database, fixed, and pinned with a test that asserts the broken version stays broken.
- Work stopped here because the next three things require you.

---

*Prepared for Doug Smith, President & Broker, CMA® · HomeWealth Solutions LLC · NMLS #2742458 · FL OFR Mortgage Broker License #MBR8082 · doug@homewealthsolutions.com · 813-733-7371*
