<!--
BUYER STRATEGY ENGINE — PHASE 3, GATE C + GATE C.5 REPORT
File: docs/BSE-Phase3-GateC-Report.md
Status: CLOSED. Gate C and Gate C.5 formally closed by Doug Smith on 2026-07-29
        on the basis of the manual validation recorded in section 58a.
        Nothing deployed. Not merged to main.
Origin: Cowork session of 2026-07-28 / 2026-07-29.
-->

# BUYER STRATEGY ENGINE — PHASE 3, GATE C + GATE C.5
## Supabase + Auth + Persistence + Saved-Buyer Retrieval — CLOSEOUT REPORT

**HomeWealth Solutions LLC** · Company NMLS #2742458 · FL OFR Mortgage Broker License #MBR8082
Prepared for: Doug Smith, President & Broker, CMA®
Date: **July 29, 2026**

> ## GATE C AND GATE C.5 ARE CLOSED
>
> **Closed by Doug Smith on 2026-07-29** on the basis of nine manual validation
> tests against the live `hws-buyer-strategy` Supabase project, all PASS. The
> full record is §58a.
>
> **453 automated assertions, 0 failures**, re-run against the final committed
> application `4dec9aada934ee5bdb8fba83dc80d11b` at commit **`b0524b5`**.
>
> **Four defects were found and fixed** — §57a round writes, §57b the
> pre-authentication chicken-and-egg, §57d session teardown in a button handler,
> §57e a token refresh orphaning the active buyer. Each is pinned by a test that
> fails against the build that had it. A fifth issue was configuration, not code
> (§57c).
>
> **The calculation engine is byte-identical to the pre-Phase-3 baseline `540ccbe`.**
> All 3,449 lines of the approved Gate B.75 file survive in order; the change is
> two insertions with zero deletions.
>
> **Nothing was deployed. `main` was not merged or modified — it still points at
> `540ccbe`.** The three historical Gate C test workspaces remain in the database,
> untouched, per instruction.

---

## 1. Gate C branch

`phase3/gate-c-supabase-persistence`, created from the approved Gate B.75 HEAD and confirmed checked out before any file was written.

## 2. Starting commit

`98bfd3c` — verified independently: branch, HEAD, clean tree, no residual locks, all seven controlling documents present, `__legacyGatherInputsFromDom` absent, `RESULT_SUMMARY_AUTHORITATIVE = false` present, `negotiation_mode` / `offer_concession_value` present, engine region byte-identical, and all three protected MD5s unchanged.

## 3. Ending commit

`99472f5` — "Gate C — Supabase auth, RLS and cross-device persistence"; then the pre-authentication fix in §57b (`d7dbbcf` was the interim stop). The BSE application file is now **`4dec9aada934ee5bdb8fba83dc80d11b`**, up from Gate B.75's `90bcc96f62feb7f90c34c8407ddeacd0`. `main` still points at `540ccbe` and has not been touched.

## 4. Files changed

| File | Change |
|---|---|
| `internal/buyer-strategy/index.html` | **Modified — purely additive.** One 603-line block inserted before `init()`, plus two lines appended after `init()`. `diff` reports **zero deletions and zero modified lines** |
| `supabase/migrations/0001_bse_schema.sql` | Added — seven-table schema, constraints, indexes, RLS, triggers, grants |
| `supabase/migrations/0002_seed_reference_data.sql` | Added — tax methods + the immutable `2026.07-baseline` assumption set |
| `supabase/local-verify/00_auth_stub.sql` | Added — local-only `auth.uid()` / `auth.role()` so the migrations can be executed and RLS exercised on plain Postgres |
| `supabase/README.md` | Added |
| `supabase/mapping/canonical-to-db.js` | **Added, then deleted** — see §9. The now-empty `supabase/mapping/` directory could not be removed through the device bridge; git does not track directories, so this has no effect on the repository |
| `internal/buyer-strategy/tests/persistence-db.test.js` | Added — 74 assertions against a real PostgreSQL 16.13 database |
| `internal/buyer-strategy/tests/persistence-client.test.js` | Added — 89 assertions, no database and no network required |
| `internal/buyer-strategy/tests/README.md` | Updated — nine suites, 437 assertions, coverage limits restated |

The full application diff:

```
3395a3396,4146      (the persistence block)
3423a4175,4176      (the boot call)
```

Verified line by line: **every single line of the Gate B.75 file still appears, in
order, in the current file.** Nothing was deleted, reordered or rewritten.

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
| Project URL + publishable key | `https://oxvtuvoguulphgycgixg.supabase.co` — embedded in the client with the publishable key; both are **public** values. The first URL supplied was 19 characters and did not resolve; see §57c |
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

**`tests/persistence-db.test.js` — 74 assertions, 74 pass**, against a real PostgreSQL 16.13 database built from the migrations: schema and RLS presence (3), cross-user denial (6), authored NULL and explicit zero (4), 13 canonical round trips, 13 `result_summary`-absent checks, 13 stale-cache recompute checks, pair-split refusal (2), three-state refusal, round-price refusal (2), `fl_millage`-without-closing-date refusal, soft-delete guard, **repeat-save write strategy (5 — see §57a)**, **anonymous pre-authentication surface (4 — see §57b)**, assumption-set immutability.

**`tests/persistence-client.test.js` — 73 assertions, 73 pass**, no database and no network. A mock transport is injected through a testing hook; everything it exercises is the application's own code.

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
| P10 (9) | The pre-authentication path: a null transport is never dereferenced, no raw internal error reaches the user, a sign-in failure is not labelled a save failure, and the assumption set is read lazily — see §57b |
| P11 (23) | Gate C.5 — saved-buyer retrieval, record identity across repeated saves, cross-user isolation, and status-chip truthfulness |
| P12 (16) | Gate C.5a — a token refresh must not orphan the active buyer (§57e) |
| P-ERR (1) | No JavaScript errors anywhere in the suite |

## 46–47. Total assertions and failures

**453 assertions · 0 failures** (290 existing + 74 database + 89 client).

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

## 57a. A defect found and fixed during Gate C — read this one

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

## 57b. The defect your first live sign-in found

You clicked **Email me a link** and got:

```
Save failed — Cannot read properties of null (reading 'signIn')
```

Nothing about that message is accurate. Nothing was being saved, and the real
problem was two steps upstream. Three defects in one chain:

**1. The root cause — a chicken-and-egg on the pre-authentication path.**
`boot()` read `program_assumption_set` to cache the current assumption set.
That table is granted to the `authenticated` role only — deliberately, and
correctly. But at boot **nobody is signed in yet**, so the browser is the
`anon` role. Reproduced against the real schema:

```
ERROR: permission denied for table program_assumption_set
```

**You could not sign in, because signing in required already being signed in.**

**2. A working transport was thrown away.** That denied read landed in `boot()`'s
catch, which treats any failure as *the library never loaded* and sets the
transport to `null`. The Supabase client was fine. One optional lookup failed
and took the whole thing down with it.

**3. A raw internal error reached you.** The sign-in handler then called
`db.signIn(email)` on that null transport, and the resulting `TypeError` was
caught by a handler that labels everything *Save failed*.

### The fix

- **`boot()` now awaits exactly one thing: `getSession()`**, which reads local
  storage and touches no privileged table. Sign-in can never again depend on a
  privileged read.
- **The assumption set is resolved lazily**, on the first save, once a session
  exists — and `ensureCtx()` backfills it so the NOT NULL column is still
  satisfied. It is also cleared on every auth change, so a second user
  re-resolves rather than inheriting the first user's value.
- **The sign-in handler no longer dereferences a null transport.** If there is
  no transport it says *Not connected*, with the tooltip "Saving is unavailable
  — the tool is working normally and nothing has been lost."
- **A sign-in failure is now its own state.** It reads *Sign-in failed — <reason>*,
  not *Save failed*. Telling someone their work failed to save when it never
  left their screen is the kind of message that makes people stop trusting a tool.

**I did not widen the grant.** Letting `anon` read reference tables would have
made the error go away and made your security surface larger. The client had
the ordering wrong; the schema was right.

### Why the tests missed it

`persistence-db.test.js` always set the role to `authenticated` — it was testing
the owner path. `persistence-client.test.js` injected a mock transport that
never failed. **The anonymous boot path against a real backend was the one
combination neither suite exercised.** That gap is now closed from both sides:

| Test | What it pins |
|---|---|
| **D13a** (2) | `anon` is denied the assumption set *and* buyer data — the grant stays tight |
| **D13b** (2) | `boot()` contains no privileged read and awaits only `getSession()` |
| **P10** (9) | A null transport is never dereferenced; no raw internal error reaches the user; a sign-in failure is never labelled a save failure; the assumption set is read only after a session exists |

Both D13b assertions **fail against the previous build and pass against this
one**, and P10 reproduces your error message character-for-character:

```
FAIL  P10 the chip never shows a raw internal error to the user
      Save failed — Cannot read properties of null (reading 'signIn')
```

That is the regression pinned by the exact symptom you reported.

## 57c. The second sign-in attempt — a configuration error, not a defect

The retest returned:

```
Sign-in failed — Failed to fetch
```

That message is the §57b fix working. The chip read *Sign in to save* first,
which means the library loaded, the transport was created and `getSession()`
succeeded — and the failure was correctly reported as a **sign-in** failure with
its real reason, not as a phantom save failure with a TypeError. The new
diagnostics pointed at the right layer immediately.

**The cause was in the configuration, not the code.** The project URL originally
supplied was:

```
https://oxvtuvoqulphgycgixg.supabase.co     19 characters — no DNS record
https://oxvtuvoguulphgycgixg.supabase.co    20 characters — resolves
```

A Supabase project ref is exactly 20 characters. The first had a character
dropped in transcription (`...voq...` for `...vogu...`), so the hostname did not
exist, the browser's `fetch` never reached a server, and it rejected with
`Failed to fetch`. Confirmed by DNS: `supabase.co` resolved normally from the
same resolver while the configured host returned no record at all; the corrected
host resolves to Cloudflare.

**No code changed.** One string constant was corrected and the full suite re-run:
**414 assertions, 0 failures.** The application diff against Gate B.75 is
unchanged at two insertions, zero deletions, and the engine region is still
byte-identical to `540ccbe`.

**Not yet done, deliberately.** A boot-time sanity check on the project URL —
so a malformed value says *"Project URL looks wrong — check Settings → API"*
instead of leaving an opaque `Failed to fetch` — was proposed and **not built**,
because it is outside what was authorized. It is a one-line guard and a test
whenever you want it.

## 57d. GATE C.5 — Saved Buyer Retrieval

`load()` and `listBuyers()` were implemented and tested in Gate C, but **nothing
in the interface called them.** §59 limitation 5 recorded that; §58 then asked
you to verify cross-device restore anyway. Those two statements contradicted each
other, and the §58 version was wrong. Gate C.5 closes the gap.

### What was added

A compact control group in the existing top-right bar, visible only when signed in:

| Control | Behaviour |
|---|---|
| **Current-buyer marker** | Shows the buyer you are working on, highlighted, or a grey *New buyer* when nothing is bound |
| **Buyer name field** | Names the record. Feeds `display_name` on the next save; a rename updates the same record |
| **Open saved buyer…** | Populated from `listBuyers()`. Selecting an entry calls the existing `load(id)` |

Selecting a buyer goes through the **same `load()` the Gate C tests already
exercise**: restore canonical state from authored values, then run a fresh engine
computation. A stored `result_summary` is still never trusted (P11e poisons one
and proves the poison is inert). After a load the context rebinds to that
record's ids, so every later save and autosave updates it rather than creating a
duplicate — P11d runs three autosaves plus two manual saves and asserts exactly
one row of each type still exists, with unchanged ids.

**A judgment call, stated plainly:** the buyer name field was not in your scope
list. I added it because without it every record is named `Buyer 2026-07-29` and
retrieval is unusable — the objective was "retrieve a previously saved buyer,"
and a list of identical names does not meet it. It is three lines of markup and
one handler. Say the word and I will take it out.

### The status chip now only claims what it can prove

| State | Chip | When |
|---|---|---|
| `unsaved` | **Not saved** | Authenticated, nothing written yet |
| `dirty` | **Unsaved changes** | Local edits not yet written |
| `saving` | **Saving…** | A write is genuinely in flight |
| `saved` | **Saved** | A write succeeded, **or** a buyer loaded and unchanged since |

Signing in no longer says *Saved*, and typing revokes the claim immediately
rather than leaving it stale for 1.5 seconds.

### A third defect, found by the new tests

`P11g` failed on the first run. Session teardown — clearing the buyer list, the
name field and the current-buyer marker — lived **only in the Sign out button's
click handler.** Any other way a session ends (an expired token, a failed
refresh, `onAuthChange` firing with null) left the previous user's **buyer names
sitting on screen.**

RLS would still have refused to open those records, so this was not a data
breach. But on a shared workstation the next person would see a list of your
clients' names, and in this business a client list is not nothing.

Teardown now lives in `endSessionUI()`, called on every path that ends a session
— the button, `onAuthChange`, and transport replacement — rather than in one
button's handler.

### Scope discipline

No calculation, qualification, recommendation or scoring logic was touched. No
schema or RLS change. No borrower login, no sharing, no deployment, no merge.
The application diff against Gate B.75 is still **two insertions with zero
deletions**, and every Gate B.75 line was verified to survive in order.

## 57e. GATE C.5a — a token refresh must not orphan the active buyer

Doug's live `property_scenario` table showed four rows where he expected one.
The query settled that question: **four distinct `buyer_profile_id` values, one
scenario each.** Three were historical records from earlier Gate C sessions, and
the Gate C.5 autosave had correctly updated Test Sample's existing scenario to
$460,000 without duplicating anything. **No duplication had occurred.**

But reading the code to answer the question surfaced a defect that simply had
not been triggered yet.

### The defect

Both Gate C and Gate C.5 tore down the active binding on **every** Supabase auth
event:

```js
db.onAuthChange(s2 => { session = s2; endSessionUI(); ... });
```

`onAuthStateChange` fires for `INITIAL_SESSION`, `SIGNED_IN`, **`TOKEN_REFRESHED`**,
`USER_UPDATED` and `SIGNED_OUT`. Only the last of those — and a switch to a
genuinely different user — ends a working session. `TOKEN_REFRESHED` fires on a
timer and on tab focus, **while the officer is sitting there working.**

When it fired, `ctx` went null. The next autosave then minted fresh UUIDs and
wrote a **whole new buyer / plan / property / scenario set**, while the screen
still showed the buyer they believed they were editing. Gate C.5 made the visible
symptom worse: `endSessionUI()` also blanked the buyer-name field and reset the
marker to *New buyer* mid-session.

**What it would have cost.** Not lost data — the old record stays. Something
worse in this business: a buyer's file silently forking in two. Half the
negotiation history under one record, half under another, with no indication
which is current. The longer a session ran, the more forks. An officer working a
single file across a morning could have ended up with four versions of the same
buyer and no way to tell them apart.

### The fix

Compare the user. Same user means keep working — adopt the refreshed credentials
and touch nothing else:

```js
function handleAuthChange(s2){
  const prevUser = session && session.user ? session.user.id : null;
  const nextUser = s2 && s2.user ? s2.user.id : null;
  session = s2;                                   // always adopt the new token
  if(nextUser && nextUser === prevUser) return;   // same officer, same buyer
  endSessionUI();
  setState(nextUser ? 'unsaved' : 'signed-out');
  if(nextUser) refreshBuyerList();
}
```

Sign-out and a different user still end the session, exactly as before.

### Proof, both directions

A differential run against the committed Gate C.5 build (`c8ec788`) and this one,
each given a saved buyer, one token refresh, and one autosave:

```
BEFORE fix (committed c8ec788)  buyer_profile rows after refresh+autosave: 2   binding preserved: false
AFTER  fix (this build)         buyer_profile rows after refresh+autosave: 1   binding preserved: true
```

**P12 — 16 new assertions**, and they discriminate: the committed build scores
**73 pass / 15 fail**; this build scores **89 / 0**.

| Group | Proves |
|---|---|
| P12a (5) | A token refresh leaves the binding, the marker, the name field, the buyer list, the chip and the officer's inputs untouched |
| P12b (3) | The autosave *after* a refresh creates **no** new records and writes to the same four ids |
| P12c (2) | Five consecutive same-user events, including a `USER_UPDATED`-shaped one, still yield exactly one buyer |
| P12d (2) | A switch to a different user **does** end the session and clear the list |
| P12e (2) | A sign-out **does** end the session, and the tool still calculates afterwards |

One test premise of my own was wrong and got corrected: P12e originally asserted
that a recommendation still existed after sign-out. By that point the scenario is
$523,500 on $9,500 income, where eliminating every program is the **correct**
engine behaviour. The assertion now checks that the engine still runs and returns
a summary, which is what it was always meant to check.

### Scope

One function changed, plus a test hook that now registers the real handler so the
suite exercises the registered path rather than a test-only shim. No calculation,
qualification, recommendation or scoring change. No schema or RLS change. The
historical test rows were **not** deleted, per instruction.

## 58a. MANUAL VALIDATION — COMPLETE, ALL PASS

Performed by Doug Smith against the live `hws-buyer-strategy` Supabase project at
`http://localhost:8080`, 2026-07-28 / 2026-07-29. **Nine tests, all PASS.** These
are live-system results, not test-harness results.

### 1. Magic-link authentication — **PASS**

Email magic link arrived; authentication completed; the BSE recognised the
authenticated user.

### 2. Manual persistence — **PASS**

| Check | Result |
|---|---|
| `buyer_profile` row created | PASS |
| `shopping_plan` row created | PASS |
| `property` row created | PASS |
| `property_scenario` row created | PASS |
| Relationships verified in Table Editor | PASS |
| `result_summary` populated | PASS |
| `resolved_inputs` remained NULL as designed | PASS |
| `engine_version` = `bse-2.0.0` | PASS |
| `status` = `draft` | PASS |

`resolved_inputs` staying NULL is the live confirmation of the Gate B.75 rule
that a resolved default is never written into an authored record.

### 3. Autosave — **PASS**

Editing an input produced *Unsaved changes* → *Saving…* → *Saved* with no click.

### 4. Saved-buyer retrieval — **PASS**

`Test Sample` appeared in **Open saved buyer…**. Closing and reopening the
browser, then loading `Test Sample`, restored the saved inputs, and the
calculation engine recomputed the scenario after loading.

This is the live confirmation that **load recomputes rather than trusting the
stored `result_summary`**.

### 5. Existing-record update — **PASS**

`Test Sample` was changed $450,000 → $460,000 → $470,000. Autosave completed.
Reloading restored $470,000. **The existing buyer remained the active record**
rather than a new buyer being created.

### 6. Duplicate investigation — **PASS / NO GATE C.5 DUPLICATION**

Supabase initially showed four `property_scenario` rows. The diagnostic query
resolved it definitively:

| Rows | Origin | Disposition |
|---|---|---|
| **Three** — distinct `buyer_profile_id`, one scenario each, `analysis_mode = shopping`, `list_price` NULL | **Historical Gate C test workspaces.** Created during earlier Gate C manual sessions, when each fresh sign-in or reload legitimately produced a new workspace (the documented pre-Gate-C.5 behaviour, §59 item 5) | **Left untouched**, per instruction |
| **One** — `Test Sample`, `analysis_mode = property`, `list_price` populated | **The live Gate C.5 record.** Exactly one scenario; autosave updated it in place to $460,000 and later $470,000 | Active |

All four rows belonged to **four distinct `buyer_profile_id` values**, and no
buyer held more than one scenario. **Gate C.5 created no duplicates.**

### 7. Auth-event binding defect — **FOUND, FIXED, VALIDATED**

Investigating item 6 surfaced a latent defect that had not yet fired in
production use — §57e. A `TOKEN_REFRESHED` event for the *same* user was tearing
down the active binding, so the next autosave would have written a whole new
record set.

- Differential testing proved the pre-fix build forked a buyer after a token
  refresh: **2 rows before the fix, 1 after**, under identical conditions.
- 16 new assertions (P12) prove same-user auth events preserve the binding. They
  discriminate: the pre-fix build scores 73 pass / 15 fail.
- Fixed in commit **`b0524b5`**.
- **Post-fix manual validation passed** — autosave and reload of `Test Sample`
  at $470,000.

### 8. Cross-user security / RLS — **PASS**

Signed out of the original account and signed in with a different email address.
**Open saved buyer…** contained no `Test Sample` record. The second user could
not see the first user's saved buyer.

This closes §38 with live end-to-end evidence through Supabase Auth and
PostgREST, not just database-layer evidence.

### 9. Account-switch persistence — **PASS**

After confirming the second account could not see `Test Sample`, signed out of
the second account and signed back into the **original** account. `Test Sample`
was **still saved and still accessible**.

This is the other half of item 8, and it matters more than it first looks. RLS
denial and session teardown are supposed to change *what you can see*, never
*what exists*. This test separates the two:

- `endSessionUI()` clears the binding, the buyer list, the name field and the
  marker on sign-out (§57d). This confirms that teardown is **presentation only**
  — it did not delete, archive, orphan or reassign the record.
- The RLS policies hide another user's rows rather than destroying them. The
  first officer's buyer survived a full sign-out → different-user session →
  sign-in cycle intact.

Together, items 8 and 9 establish the full property: **your buyers are invisible
to everyone else and still there for you.** Either half alone would have been an
incomplete result — item 8 passing while item 9 failed would have meant data
loss dressed up as security.

## 58b. Deferred manual checks

Two Gate C items were never blocking and remain unrun. Neither affects closeout.

**Network failure.** Signed in, wi-fi off, change an input, wait two seconds.
Expected: *Save failed — …* in red, with your numbers and the recommendation
still on screen. Proven by test (P5), not yet live.

**The offline promise (M-10).** Cold start with wi-fi off. Expected: the tool
calculates normally and reads *Not connected*. Proven by test (P1), not yet live.

## 58c. Final automated verification at closeout

Re-run against the final committed application
`4dec9aada934ee5bdb8fba83dc80d11b` (commit `b0524b5`), confirmed identical to the
committed git object:

| # | Suite | Result |
|---|---|---|
| 1 | Permanent numerical regression (47 audit scenarios) | **68 / 68**, 1 not executable |
| 2 | Gate A — M-1 canonical units | **80 / 80** |
| 3 | Gate B — canonical application state | **22 / 22** |
| 4 | Gate B.5 — C-4b presentation integrity | **64 / 64** |
| 5 | Gate B.5 — model authority | **12 / 12** |
| 6 | Gate B.75 — persistence contract | **40 / 40** |
| 7 | Cross-tool R-47 | **4 / 4** |
| 8 | Gate C / C.5 / C.5a — client orchestration | **89 / 89** |
| 9 | Gate C — schema and RLS on PostgreSQL 16.13 | **74 / 74** |
| | **TOTAL** | **453 assertions · 0 failures** |

**Protected calculation engine — unchanged:**

```
pre-Phase-3 baseline (540ccbe)   96e6bea541a19e1ac3ec3f82cd45525c
Gate B.75 approved               96e6bea541a19e1ac3ec3f82cd45525c
FINAL committed (b0524b5)        96e6bea541a19e1ac3ec3f82cd45525c
```

**Application diff versus the approved Gate B.75 file:** two insertions,
**zero** lines removed or changed. All **3,449** Gate B.75 lines verified present,
in order.

**Protected files unchanged:** `property-tax.html` `1cd00523…`,
`buyer/comfort-calculator.html` `772de6d1…`, Staging BSE `01830ac6…`.

**Schema and RLS unchanged during Gate C.5, C.5a and closeout:**
`supabase/migrations/` was last modified at commit `d7dbbcf` (Gate C) and has not
been touched since.

**Secrets scan:** clean. No service-role key, database password or connection
string anywhere in the repository or documentation.

## 59. Known limitations and deferred items

Carried forward into whatever comes next. None of these blocked closeout.

**Retrieval**

1. **The buyer picker is a flat list.** Every active buyer, by name, with no
   search, sort, paging or archive control. It will get unwieldy past a few dozen
   records.
2. **No "new buyer" button.** Starting a fresh workspace means reloading the page
   or signing out and back in.
3. **A buyer saved before Gate C.5 carries an auto-generated `Buyer <date time>`
   label.** Open it, type a name, and the next save renames that same record.
4. **Three historical Gate C test workspaces remain in the database**, deliberately
   untouched. They are shopping-mode, `list_price` NULL, and are distinguishable
   from real records by that shape alone. Deleting them is a one-statement job
   whenever you want it.

**Persistence**

5. **The Supabase library loads from a public CDN (`esm.sh`) at runtime.** A CDN
   outage means no-save mode, not a broken tool — but it is an external
   dependency. Vendoring it is a reasonable future change.
6. **No offline queue.** A save attempted while offline fails, says so, and
   retries only when the user edits again or presses Save. Deliberate: a silent
   offline queue can resurrect stale numbers.
7. **`numeric` returns as a string from PostgREST.** The deserializer parses every
   numeric column explicitly. Any future code path that skips that will silently
   compare `"6.750"` to `6.75`.
8. **Session expiry behaviour is inspection-only.** Token refresh is now proven
   safe (§57e), but what the officer sees when a session genuinely expires
   mid-edit has not been exercised live.
9. **Two manual checks deferred** — live network-failure behaviour and the live
   offline cold start (§58b). Both are proven by test.

**Carried forward unchanged from earlier gates**

10. `num()` coercion (M-4) · the floating `%` concession base (M-13) ·
    Shopping-Mode unit reinterpretation · PMI band `c` unreachable end-to-end ·
    `BSEModel.capture()` on every `recalc()` · 1,157 REQUIRES-REVIEW baseline
    fields that are change detectors, not correctness claims · R-13d not
    executable through the UI · FL property tax **not** integrated · the
    Comfort Calculator **not** retired · no iPad or phone validation · no live
    buyer call · the git device-bridge lock limitation.

## 60. Gate C and Gate C.5 — CLOSED

**Closed by Doug Smith on 2026-07-29**, on the authority of the manual validation
in §58a.

| Requirement | Status |
|---|---|
| Supabase schema exists and is reproducible | **MET** — live, and re-verified on real PostgreSQL every test run |
| Authentication works | **MET — verified live** |
| RLS is active and tested | **MET — verified live end to end** (§58a item 8) plus database-layer proof |
| Buyer Profile / Shopping Plan / Property / Scenario persist | **MET — verified live** |
| Authored NULL survives round trip | **MET** |
| Explicit zero survives round trip | **MET** |
| Canonical (value, unit) pairs survive round trip | **MET** — enforced by CHECK constraints, rebuilt from authored values on load |
| `result_summary` remains non-authoritative | **MET** — three code boundaries; `resolved_inputs` NULL confirmed live |
| Load always recomputes | **MET — verified live** (§58a item 4) |
| Saved buyers can be retrieved | **MET — verified live** (§58a item 4) |
| Editing a loaded buyer updates it, no duplicates | **MET — verified live** (§58a items 5, 6) |
| Same-user auth events preserve the binding | **MET** — fixed and pinned (§57e), post-fix validation passed |
| Same-user cross-session access works | **MET — verified live** (browser closed and reopened) |
| Different-user access is denied | **MET — verified live** (§58a item 8) |
| Denial hides data without destroying it | **MET — verified live** (§58a item 9) — the original account's buyer survived a full account-switch cycle |
| Autosave cannot overwrite newer state | **MET** — single-flight with queued latest |
| Network failure fails safely | **MET by test.** Live check deferred (§58b) |
| Save status is truthful | **MET** — Gate C.5 (§57d) |
| Regression suite green | **MET** — 453 / 453 |
| No privileged secrets exposed or committed | **MET** — repository-wide scan clean |
| Calculation mathematics unchanged | **MET** — engine byte-identical to `540ccbe`; two insertions, zero deletions; all 3,449 Gate B.75 lines present in order |

### Commit history

| Commit | Content |
|---|---|
| `98bfd3c` | Gate B.75 baseline (starting point) |
| `d7dbbcf` | Gate C partial — schema, migrations, local verification |
| `99472f5` | Gate C — auth, RLS, persistence |
| `80e695c` | Gate C report — commit hash recorded |
| `e71c26d` | Gate C fix — sign-in must not depend on a privileged read (§57b) |
| `a06d690` | Gate C — corrected Supabase project URL (§57c) |
| `c8ec788` | Gate C.5 — saved buyer retrieval (§57d) |
| `b0524b5` | Gate C.5a — token refresh must not orphan the active buyer (§57e) |
| *this commit* | Documentation closeout |

Branch `phase3/gate-c-supabase-persistence`. **`main` remains `540ccbe`, not
merged, not modified.**

## GATE C / GATE C.5 COMPLIANCE STATEMENT

- The Gate B.75 baseline was verified before any file was written, and the patch script **refuses to run** against any other input hash.
- The Phase 2 seven-table architecture was implemented as specified — not collapsed, not redesigned.
- Every locked decision from Gates A through B.75 is now enforced by the database as well as the application: unsplittable `(value, unit)` pairs, authored NULL versus authored zero, three-state cost fields, a round requiring a price, scenario-level negotiation intent without one, immutable assumption sets, and `result_summary` as cache only.
- No calculation function was modified. The change is two insertions with zero deletions, and the engine region is byte-identical to the pre-Phase-3 baseline.
- Persistence never runs from `recalc()`, and that is asserted, not asserted-about.
- `property-tax.html`, `buyer/comfort-calculator.html` and the Staging BSE are unchanged.
- No FL millage was integrated. The Comfort Calculator was not touched.
- **No secret of any kind was created, requested, committed, or written into documentation.** A repository-wide scan for service-role keys, database passwords and connection strings returns nothing.
- **Nothing was deployed.** No production, no preview, no Netlify. `localhost:8080` only.
- **Four real defects were found and fixed** — the round write strategy (§57a), the pre-authentication chicken-and-egg (§57b), session teardown living in a button handler (§57d), and a token refresh orphaning the active buyer (§57e). Each was reproduced first, then fixed, then pinned with a test that fails against the build that had it. A fifth issue was configuration, not code (§57c).
- The security surface was **not** widened to make an error message disappear. The schema was right; the client's ordering was wrong, and the client was what changed.
- Gate C.5 and C.5a stayed inside their stated scope: no calculation, qualification, recommendation, scoring, tax or financing change; no schema or RLS change; no borrower login; no sharing; no deployment; no merge. The one addition beyond the written scope — a buyer name field — is called out in §57d rather than slipped in.
- **Closeout changed documentation only.** No application file, migration, RLS policy or test was modified during closeout; the application md5 is identical before and after.
- The three historical test workspaces were **left in place**, as instructed.

---

*Prepared for Doug Smith, President & Broker, CMA® · HomeWealth Solutions LLC · NMLS #2742458 · FL OFR Mortgage Broker License #MBR8082 · doug@homewealthsolutions.com · 813-733-7371*
