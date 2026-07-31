# BUYER STRATEGY ENGINE — PROJECT STATUS
## Controlling Status Document

**HomeWealth Solutions LLC** · Company NMLS #2742458 · FL OFR Mortgage Broker License #MBR8082
Owner: Doug Smith, President & Broker, CMA®
Last updated: **2026-07-30** (Gate D code complete, preview verification blocked · Phase 4 Job 1 APPROVED · Phase 4 Job 2 Property Strategy CODE COMPLETE, awaiting manual testing)

> **This is the controlling status document for the Buyer Strategy Engine redesign.**
> Any new Cowork session working on the BSE should read this file first, then the two documents referenced below. Do not reconstruct prior phases from memory or summary — the full detail is on disk.

> ### WHAT IS AUTHORITATIVE FOR CURRENT APPLICATION STATE
>
> **The application source, this status document, the completed gate reports (A, B, B.5, B.75, C, C.5, C.5a, D, D.1), and the regression suites are authoritative.**
>
> **`docs/BSE-Phase2-Architecture.md` is NOT.** It predates Gates A–D and describes the data model *as designed*, before four gates of implementation reconciled it. It remains the correct reference for **why** a decision was made — the 13 locked decisions (L-1…L-13) and the 6 resolved questions still govern. It is **not** a reliable description of what the application or the schema does today. Where Phase 2 and a completed gate report disagree, **the gate report wins**. Where a gate report and the source disagree, **the source wins**.
>
> The same applies to `docs/BSE-Phase0-1-Forensic-Audit.md`: its formula documentation is what the independent test oracle was built from and is still authoritative for the *mathematics*, but its function inventory and line numbers describe the pre-Phase-3 file.

---

## 1. PHASE STATUS

| Phase | Scope | Status |
|---|---|---|
| **Phase 0** | Data governance, prohibited-data list, approved-field discovery | **COMPLETE** |
| **Phase 1** | Forensic audit of the production BSE, FL property-tax tool, and Comfort Calculator | **COMPLETE** — 54 findings documented, 0 remediated |
| **Phase 2** | Architecture decision lock and data model design | **COMPLETE / CLOSED** — 13 locked decisions (L-1…L-13), 6 questions resolved (Q-1…Q-6), 0 open. **Design rationale only — NOT a description of current application state.** See the authority note above |
| **Phase 3 — Gate A** | M-1 / `applyState` canonical unit handling | **COMPLETE / APPROVED** — see `BSE-Phase3-GateA-Report.md` |
| **Phase 3 — Gate B** | Numerical baseline + canonical application-state architecture | **COMPLETE** — see `BSE-Phase3-GateB-Report.md` |
| **Phase 3 — Gate B.5** | Pre-persistence hardening — C-4b, `gatherInputs()` cutover, review-field classification | **COMPLETE** — see `BSE-Phase3-GateB5-Report.md` |
| **Phase 3 — Gate B.75** | Persistence contract lock — legacy path removed, blank inheritance, pending fields reconciled, `result_summary` non-authoritative | **COMPLETE** — see `BSE-Phase3-GateB75-Report.md` |
| **Phase 3 — Gate C** | Supabase schema, auth, RLS, persistence | **COMPLETE / CLOSED** 2026-07-29 — nine manual validation tests against the live project, all PASS. See `BSE-Phase3-GateC-Report.md` §58a |
| **Phase 3 — Gate C.5** | Saved-buyer retrieval + save-status truthfulness | **COMPLETE / CLOSED** 2026-07-29 — retrieval, existing-record update, cross-user isolation and account-switch persistence verified live. See report §57d |
| **Phase 3 — Gate C.5a** | Auth-event binding stability | **COMPLETE / CLOSED** 2026-07-29 — `TOKEN_REFRESHED` no longer orphans the active buyer; differential proof and 16 pinned assertions. See report §57e |
| **Phase 3 — Gate D** | Production deployment readiness | **PARTIALLY READY — NOT CLOSED.** 500 assertions / 0 failures. Config validation, vendored Supabase client, session-expiry-mid-edit handling, error classification, BSE-scoped security headers, and a blocking responsive fix are all done and verified locally. **Preview verification is BLOCKED** — no route to Netlify from the session; re-confirmed at Gate D.1 (`git ls-remote` → 403 from proxy). HSTS resolved: host-only, no `includeSubDomains`, no `preload`. Production NOT deployed. See `BSE-Phase3-GateD-Report.md` |

| **Phase 4 — Job 2 · Property Strategy** | Answer-first property analysis: buyer goal, feasibility verdict, required down payment, constraint classification, property-level debt payoff, goal-first seller value, property rate intelligence, Accepted status | **CODE COMPLETE — AWAITING MANUAL TESTING, NOT DEPLOYED.** 1,165 assertions / 0 failures across 17 suites, `persistence-db` now RUN rather than skipped. Calculation engine byte-identical. Every Job 1 pin unchanged. Five defects found and fixed. See `BSE-Job2-Property-Strategy-Report.md` |

| **Phase 4 — UI / Decision Support** | Answer-first redesign around two jobs: Shopping Range and Property Strategy. Fernando required-down-payment solver, debt-payoff lever, consolidated binding-constraint presentation, revived buying-power panel | **CODE COMPLETE for the approved subset — AWAITING MANUAL VALIDATION, NOT DEPLOYED.** 597 assertions / 0 failures. Calculation engine byte-identical. Five items deferred pending a PostgreSQL session — see `BSE-Phase4-Implementation-Report.md` §4. Scope: `BSE-Phase4-UI-Redesign-Scope.md` |

Phases 0, 1, and 2 were audit and design only — no source was modified in any of them. Application source was first modified in **Gate A** (three unit-toggle functions plus an additive canonical-unit layer) and extended in **Gate B** (a purely additive canonical application-state layer). The calculation engine, lines 526–1060, is byte-identical to `540ccbe` throughout.

---

## 2. BASELINE INTEGRITY — VERIFY BEFORE ANY WORK

Any session beginning implementation work must verify these before touching anything. A mismatch on the production BSE is a **STOP** condition — report it, do not overwrite, do not auto-revert.

| File | Baseline MD5 |
|---|---|
| `Tools/Live/internal/buyer-strategy/index.html` *(production BSE)* | `8395ad3441b500f559d5c615ac7f5efa` |
| `Tools/Live/property-tax.html` *(FL property tax)* | `1cd00523ad5845942ec6e812538b6312` |
| `Tools/Live/buyer/comfort-calculator.html` *(Comfort Calculator)* | `772de6d1e3d6b3182049af6a7bcebedd` |
| `Tools/Staging/buyer-strategy-v2/index.html` *(suspect copy)* | `01830ac60b3ec9c1db4a73ce76201f2f` |

**Pre-Phase-3 git baseline: `540ccbe`** — "Live comma formatting on input with cursor-position restore", 2026-07-27, branch `main`. `main` still points here.

**Current work: branch `phase3/gate-c-supabase-persistence`.** Gate C's change is **two insertions with zero deletions** — `diff` against Gate B.75 reports `3395a3396,4146` and `3423a4175,4176` and nothing else. The table above remains the correct baseline for `main` and for the three untouched files.

### Application MD5 by gate — the current value is the LAST row

| Gate | Application MD5 | Note |
|---|---|---|
| Pre-Phase-3 (`540ccbe`, `main`) | `8395ad3441b500f559d5c615ac7f5efa` | The baseline table above. `main` still points here |
| Gate A | `d5c16fde…` | |
| Gate B | `f8b2b9b5…` | |
| Gate B.5 | `1f4cde6c…` | |
| Gate B.75 | `90bcc96f…` | |
| Gate C (commit `b0524b5`) | `4dec9aada934ee5bdb8fba83dc80d11b` | Recorded in `BSE-Phase3-GateD-Report.md` §1–7 |
| Gate D.1 | `99a82a680e74953782aa9c2ce1802fc4` | Verified in `BSE-Phase3-GateD-Report.md` §20.1 |
| Phase 4 (answer layer, Fernando solver, debt lever, goal bar) | `fc9c194fd12a17306fbc9ad9d4a5f16b` | `BSE-Phase4-Implementation-Report.md` §1 |
| Phase 4 Addenda A–C + Rate Impact (Job 1 complete) | `f856348f21c700e6a56a62ec5595116d` | 6,586 lines. The Job 2 entry baseline, re-verified from disk 2026-07-30 |
| **Job 2 — Property Strategy · CURRENT** | **`1a620ca97a898d654ce8f80541d26aa6`** | **7,264 lines. `BSE-Job2-Property-Strategy-Report.md`. This is the file on disk today** |

**Correction (2026-07-30):** this section previously named `99a82a68…` as the current application MD5 and the application as 4,361 lines. Both were pre-Phase-4 values — Phase 4, Addenda A–C, the Rate Impact work and Job 2 all landed afterwards. The row marked CURRENT above is the file on disk. §4.4's engine table was already correct and is unchanged.

**Correction (2026-07-29):** this section previously named `4dec9aad…` as the current application MD5. That is the **pre-Gate-D** value. Gate D modified `index.html` (§10 config validation, §11 vendored loader, §13 session-expiry handling, §17 error classification, §18 responsive fix), producing `99a82a68…`. Working-tree and git object were verified identical at Gate D.1. Any session verifying baseline integrity should expect `99a82a68…`, not `4dec9aad…`.

Verification command:

```
cd ~/Tools/Live
git status --porcelain          # expect empty
git rev-parse --short HEAD      # expect 540ccbe
md5sum internal/buyer-strategy/index.html property-tax.html \
       buyer/comfort-calculator.html ../Staging/buyer-strategy-v2/index.html
```

---

## 3. AUTHORITATIVE SOURCES

| Role | Path | Status |
|---|---|---|
| **Production BSE — AUTHORITATIVE** | `Tools/Live/internal/buyer-strategy/index.html` | **7,264 lines** (2,886 pre-Phase-3; 4,361 after Gates A–D; Phase 4 added the answer layer, the Fernando solver, Rate Impact, and Job 2 Property Strategy). Git-tracked. The only calculation reference |
| **FL property tax — AUTHORITATIVE** | `Tools/Live/property-tax.html` | 821 lines. Standalone tool. Authoritative source for the corrected Florida methodology |
| **Comfort Calculator** | `Tools/Live/buyer/comfort-calculator.html` | Live. Production copy per `TOOL-MANIFEST.md` |
| **SUSPECT / NON-AUTHORITATIVE** | `Tools/Staging/buyer-strategy-v2/index.html` | **Never use as a calculation reference. Do not modify.** Outside git. Changes the buydown ratio to 0.24 and removes the elimination-reason list |

**Live is authoritative. Staging is suspect and non-authoritative.** This is not a preference — Staging silently changes a pricing constant at five sites and strips advisory output. Its disposition remains an open business decision for Doug.

---

## 4. NON-NEGOTIABLE SEQUENCING CONSTRAINTS

These are locked and carry forward into every future session.

1. **M-1 comes first.** `applyState` / canonical unit handling must be fixed and independently verified **before any persistence code is written**. A saved buyer profile restored through a display-unit conversion path can produce a valid-looking but wrong assumption, and the engine will then calculate correctly from the wrong input — silently. *(Locked as Decision L-13.)*

2. **FL tax integration is LAST** among approved calculation changes. Do not pull it forward. Shopping Range Mode continues to use flat-rate tax assumptions — this is mathematically required, not a convenience, because `maxPriceForScenario` solves closed-form and a millage-derived figure has no price to compute against in Shopping Mode.

3. **Comfort Calculator retirement is gated** on BOTH: (a) the redesigned BSE Shopping Range passing regression testing, AND (b) successful validation in an actual buyer-call workflow. Phase completion alone does not authorize retirement. *(Locked as Decision L-11.)*

4. **The calculation engine is protected.** Same inputs → same calculations → same outputs. If any requirement appears to need a mathematical change, STOP and get separate approval.

   **The boundary is no longer expressed as a line range.** "Lines 526–1060" was correct until Phase 4 began inserting markup above the `<script>` tag, which shifts every line number below it. The boundary is now the **`const Engine = (function(){` … `})();` IIFE**, located by marker and enforced mechanically by `tests/engine-freeze.test.js`:

   | Rev | Engine MD5 | Lines | Authority |
   |---|---|---|---|
   | 1 | `a6e73d694b462cd10983f8ec59eb5f4f` | 529 | Pre-Phase-3 `540ccbe`; unchanged through Gates A–D |
   | **2 — CURRENT** | **`ff76f4057ba51cbbf1f87a70a7e770a5`** | **565** | **Phase 4 "Hole 2", approved in writing by Doug Smith, 2026-07-29** |

   A failure in that suite is a **STOP condition and is not fixed by updating the hash.** It is fixed by reverting the edit, or by obtaining written approval for a calculation change and re-baselining the numerical suite as well. The suite is mutation-proved: flipping the buydown ratio `0.25 → 0.24` fails it.

   **Revision 2 — the only approved engine change since the freeze.** Confined to `PROGRAMS.conv.scenarios()`. Previously only a down payment above 20.5% produced a conventional tier, so an authored 15% matched none of 5 / 10 / 20 inside `dpMatches()`'s ±1-point window, every conventional tier dimmed, and the buyer got no eligible scenario at all. An explicitly authored **percent** at or above the conventional minimum (3% first-time buyer, 5% otherwise) now generates its own tier. `computeScenario()`, `maxPriceForScenario()`, the PMI table, MIP and VA fee logic, `concessionLimitPct()`, `pickBestOverall()` and `applyConcession()` are all untouched, as are FHA and VA scenario generation. **The 47-scenario numerical baseline is byte-identical across the change** — 68/68 cases, 4,000 VERIFIED and 1,157 REVIEW fields, zero drift. That is the evidence it is additive. `engine-freeze.test.js` additionally asserts the new rule is present and still narrow.

5. **`maxPriceForScenario` must not be modified.** It mirrors `computeScenario`'s PITI assembly exactly; breaking that mirror makes every number in the tool internally inconsistent. `engine-freeze.test.js` additionally asserts seven structural invariants on this function by name — the comfort ceiling, the back-end DTI ceiling, the cash denominator, the `k` and `b` coefficients, and the deliberate **absence** of a front-end ratio ceiling.

   **Corollary for new solvers (Phase 4):** any function that needs a PITI figure must obtain it by *calling* `computeScenario()` or `maxPriceForScenario()`. Re-deriving the mathematics independently — even correctly — breaks the mirror and is prohibited.

6. ~~**No regression baseline exists yet.**~~ **Discharged in Gate B, Stage 1.** The permanent 47-scenario numerical baseline lives at `internal/buyer-strategy/tests/baseline/bse-expected-baseline.json`, with expected values established by an independent implementation of the documented formulas (`tests/oracle/reference_model.py`), not by the engine. **4,000** fields are `EXPECTED VALUE VERIFIED`; **1,157** are `EXPECTED VALUE REQUIRES REVIEW` (Gate B.5 promoted 375 after deriving horizon costs and the post-cancellation payment independently). Run it before and after any code change.

---

## 5. CONTROLLING DOCUMENTATION

| Document | Contents |
|---|---|
| `docs/BSE-Job2-Property-Strategy-Report.md` | **Job 2 closeout report — current work.** The verified entry baseline, the answer-first UI, functions reused vs added, the pinned $499,900 example, feasibility logic, debt-payoff and seller-value behaviour, negotiation-round status, the Accepted-status verification that unblocked it, the five defects found, and what is still deferred |
| `docs/BSE-Phase4-Implementation-Report.md` | **Phase 4 completion report — read with the scope.** What was built, the two classifier bugs found and fixed, the `secondary`/NaN defect in the revived code, the Accepted/Contract STOP, and the five deferred items |
| `docs/BSE-Phase4-UI-Redesign-Scope.md` | **Phase 4 scope — current work.** Part 1 engine verification (11 capabilities, verdict + line numbers), new functions with risk levels, screen-by-screen UI scope, persistence deltas, 10-item risk register, implementation sequence, explicit out-of-scope list |
| `docs/BSE-Phase0-1-Forensic-Audit.md` | Complete Phase 0/1 forensic audit: function inventory, all 54 findings with risk classifications, regression baseline scenarios, protected functions, Live vs Staging divergence, FL property-tax findings, persistence audit, field classifications. **Formulas authoritative; line numbers and function inventory describe the pre-Phase-3 file** |
| `docs/BSE-Phase2-Architecture.md` | Complete Phase 2 architecture: 7-table model, all schemas and field definitions, DDL, assumption-set and reproducibility design, tax method architecture, `qualifying_tax_basis`, closing/occupancy dates, DTI override, `organization_id`, canonical-value design, all 13 locked decisions, all 6 resolved questions, migration risks, phase sequencing. **DESIGN RATIONALE ONLY — superseded as a state description by Gates A–D. Decisions L-1…L-13 still govern** |
| `docs/BSE-Phase3-GateA-Report.md` | Gate A completion report — M-1 failure path, the fix, tests, regression results, Gate B findings |
| `docs/BSE-Phase3-GateC-Report.md` | **Gate C + Gate C.5 closeout report** — schema, RLS, auth, persistence, saved-buyer retrieval, the four defects found and fixed, the full manual validation record (§58a), and the final automated verification (§58c) |
| `docs/BSE-Phase3-GateB75-Report.md` | Gate B.75 completion report — the locked persistence contract: one source of truth, blank inheritance, reconciled scenario fields, `result_summary` cache-only |
| `docs/BSE-Phase3-GateB5-Report.md` | Gate B.5 completion report — the C-4b failure path and fix, the `gatherInputs()` cutover, the 1,532-field classification, the safe `result_summary` set, Gate C readiness |
| `docs/BSE-Phase3-GateB-Report.md` | Gate B completion report — Checkpoint B1, the permanent baseline and how its expected values were established, the canonical state layer, limitations, Gate C findings |
| `docs/BSE-Project-Status.md` | This file |

---

## 6. KNOWN ENVIRONMENT ISSUE — BLOCKS PHASE 3 IN CLOUD SESSIONS

**Git write operations fail in `Tools/Live` when the folder is reached through the Cowork device bridge.** The mount permits file creation but refuses `unlink`, so git can create a `.lock` file and never remove it. Every operation requiring a lock lifecycle fails.

Observed 2026-07-28 while attempting to create the Phase 3 branch:

```
git checkout -b phase3/gate-a-m1-canonical-units
→ error: Unable to create '.git/HEAD.lock': File exists.
  fatal: unable to update HEAD
```

Stale locks present at that time — note two **predate** the session:

| Lock | mtime |
|---|---|
| `.git/HEAD.lock` | 2026-07-28 00:55 *(pre-existing, from Doug's own earlier git activity)* |
| `.git/objects/maintenance.lock` | 2026-06-05 18:48 *(long stale)* |
| `.git/index.lock` | 2026-07-28 13:10 *(created by read-only `git status` calls)* |

**Side effect to clean up:** an orphaned branch ref `refs/heads/phase3/gate-a-m1-canonical-units` was created pointing at `540ccbe`, but HEAD was never switched. The working tree remained on `main` and no tracked file was touched.

**Remediation (run locally in Terminal, after confirming no git process is actually running):**

```
cd ~/Tools/Live
rm -f .git/HEAD.lock .git/index.lock .git/objects/maintenance.lock
git branch -D phase3/gate-a-m1-canonical-units
git status && git rev-parse --short HEAD    # expect clean, 540ccbe
```

**Status 2026-07-28:** still true, and worked around in Gates A and B by moving each stale lock and `tmp_obj_*` file into `Tools/_to_delete/stale-git-locks/` immediately before every git call, after confirming no git process was live. It held for four commits but it is fragile.

**Recommendation for Gate C:** run the task **on the computer** rather than in the cloud. In the Claude desktop app, the "Run this task" picker at the top right when starting a new Cowork task selects where it runs. Gates A, B, and C all require repeated commits, and this restriction will block every one of them from a cloud session.

**Update 2026-07-29 (Phase 4).** Two refinements to the above, both confirmed live this session:

1. **Read-only git plumbing works fine through the bridge.** `git cat-file -p <rev>:<path>` and `git status --porcelain` both completed without creating or requiring a lock. The pre-Phase-3 baseline was extracted this way and verified at MD5 `8395ad34…`, matching §2 exactly. It is only lock-taking operations — `checkout`, `commit`, `branch`, `add` — that fail.
2. **The bridge cannot delete.** `rm` on a mounted file returns "Operation not permitted." Scratch files created inside `Tools/Live` must be moved to a folder you delete yourself.

**Update 2026-07-30 (Job 2).** Two further environment facts, both confirmed live:

1. **The regression suite cannot run in `Tools/Live` as the Mac is configured.** `playwright` is not resolvable from that directory, so all fifteen browser suites fail immediately with `MODULE_NOT_FOUND`. They were run in the session container instead, where Chromium and Playwright are present. To run them locally: `cd ~/Tools/Live && npm i -D playwright pg && npx playwright install chromium`.
2. **`persistence-db.test.js` no longer needs a special occasion.** PostgreSQL 16 is present in the Cowork session container at `/usr/lib/postgresql/16`. A cluster can be initialised, both migrations plus `supabase/local-verify/00_auth_stub.sql` applied, and the suite run against the real schema with RLS forced. That is how the §12 negotiation-round delete-guard question was finally answered — see `BSE-Job2-Property-Strategy-Report.md` §1.2. `run-all-tests.sh` now runs the suite whenever a PostgreSQL is reachable and prints an explicit SKIPPED notice when it is not.

**Scratch folder to remove:** this session created `Tools/Live/_cowork-tmp/` holding `bse-baseline-540ccbe.html` (the extracted `540ccbe` baseline, needed to run the M-1 differential suite). It is untracked and safe to delete:

```
cd ~/Tools/Live && rm -rf _cowork-tmp
```

Also note: `Tools/_to_delete/phase3-cleanup-20260728/` contains a zero-byte probe artifact that could not be deleted through the bridge. Safe to delete that folder.

---

## 7. IMMEDIATE NEXT ACTION

**Gate C, Gate C.5 and Gate C.5a are CLOSED** as of 2026-07-29, on the authority
of nine manual validation tests against the live Supabase project — all PASS.
The full record is `BSE-Phase3-GateC-Report.md` §58a.

**Final state**

| | |
|---|---|
| Branch | `phase3/gate-c-supabase-persistence` |
| HEAD | `b0524b5` (application) + the closeout documentation commit |
| Application at Gate C | `4dec9aada934ee5bdb8fba83dc80d11b` |
| **Application now (Gate D.1)** | **`99a82a680e74953782aa9c2ce1802fc4`** |
| `main` | **`540ccbe` — not merged, not modified** |
| Automated at Gate C closeout | **453 assertions, 0 failures** across nine suites |
| Calculation engine | **byte-identical to `540ccbe`** — `96e6bea541a19e1ac3ec3f82cd45525c` over the Gate C line range |
| Deployed | **Nothing.** `localhost:8080` only |

### Phase 4 entry baseline — re-verified from scratch 2026-07-29

Before a single line of Phase 4 work, every runnable suite was executed against the Gate D.1 application:

| Suite | Result |
|---|---|
| `engine-freeze` *(new this phase)* | **PASS 12 / FAIL 0** |
| `bse-regression` — 47 audit scenarios | **68 / 68 executable cases.** 4,000 VERIFIED fields + 1,157 REVIEW fields |
| `m1-canonical-units` | **PASS 80 / FAIL 0** |
| `canonical-state` | **PASS 22 / FAIL 0** |
| `c4b-presentation-integrity` | **PASS 64 / FAIL 0** |
| `model-authority` | **PASS 12 / FAIL 0** |
| `persistence-contract` | **PASS 40 / FAIL 0** |
| `persistence-client` | **PASS 136 / FAIL 0** |
| `r47-cross-tool` | **PASS 4 / FAIL 0** |
| `persistence-db` | **NOT RUN** — requires PostgreSQL. Schema and RLS are untouched in Phase 4 |
| | **438 assertions green, 0 failures** |

**Independent confirmation of the §4.4 freeze claim.** Extracting the `const Engine = (function(){` … `})();` IIFE by marker from *both* the pre-Phase-3 baseline (`540ccbe`, MD5 `8395ad34…`) and the current Gate D.1 application yields the **same 529 lines and the same MD5 `a6e73d694b462cd10983f8ec59eb5f4f`**. The calculation engine has survived Gates A, B, B.5, B.75, C, C.5, C.5a and D **byte for byte**. That is now asserted mechanically on every run, not just claimed.

A convenience runner for all eight non-database suites lives at `internal/buyer-strategy/run-all-tests.sh`. The M-1 differential half needs the `540ccbe` baseline at `/tmp/bse-baseline.html`:

```
cd ~/Tools/Live && git cat-file -p 540ccbe:internal/buyer-strategy/index.html > /tmp/bse-baseline.html
```

**Phase 4 does not depend on either Gate D action.** The UI work is local, runs against `file://`, and is verified by the suites above. It must not be deployed until Gate D closes, but it does not wait on it.

**Gate D is IN PROGRESS and is NOT closed.** Two actions are needed, both yours:

1. **Create the Netlify preview.** `git push -u origin phase3/gate-d-deployment-readiness`
   — pushing a non-production branch does not deploy to production, since Netlify
   production-deploys only from `main`. Then confirm branch deploys are enabled and
   send me the preview URL. Gate D report §21.
   The Netlify site is **`hws-tools`** (established at Gate D.1 from the CNAME), so
   the expected preview host is
   `https://phase3-gate-d-deployment-readiness--hws-tools.netlify.app`.
2. **Add the preview URL to Supabase → Authentication → Redirect URLs** before
   signing in on it, or magic links will not return. Report §9.

**Production deployment is NOT authorized and has not happened.** The full
checklist is Gate D report §24; the rollback plan is §25.

**Read Gate D report §12.1 before merging anything.** The repository root is the
public web root — verified live — so merging this branch as-is would have
published `docs/` and `supabase/` to the open web, including the full text of
every RLS policy. Blocking rules are now in `netlify.toml`; they affect only
paths that do not exist in `main` today.

**Deferred, carried forward** — none of these blocked closeout:

1. Live network-failure and offline cold-start checks (proven by test, not yet live).
2. The three historical Gate C test workspaces remain in the database, untouched
   and deliberately so. They are shopping-mode with `list_price` NULL; the live
   record `Test Sample` is property-mode with a price. A one-statement cleanup
   when wanted.
3. The buyer picker is a flat list — no search, sort, paging or archive, and no
   "new buyer" button.
4. The Supabase library loads from a public CDN at runtime; vendoring it removes
   an external dependency.
5. Session-expiry behaviour mid-edit is inspection-only. Token refresh is proven
   safe; genuine expiry is not.
6. FL property tax is **not** integrated. The Comfort Calculator is **not**
   retired. Both remain out of scope and untouched.

**Locked decisions, now enforced by the database as well as the application:**

1. **BSEModel is the sole authoritative economic state.** The DOM is an interface.
   One `gatherInputs()`, delegating to the model. The canonical↔row mapping lives
   in the application and the tests call it inside the page — no second source of
   truth.
2. **Blank ≠ zero.** A blank authored value is NULL and inherits per L-1. An
   explicit 0 is an authored zero and wins. The resolved default is never written
   back; `resolved_inputs` is persisted as NULL — confirmed live.
3. **Concession-before-price and mode-before-round are first-class Property
   Scenario state.** A `negotiation_round` requires a price; negotiation intent
   does not.
4. **`result_summary` is cache-only and mechanically non-authoritative.** Stripped
   on restore, never returned into canonical state, always rebuilt from a fresh
   engine run — confirmed live by retrieval recomputing the scenario.
5. **Persistence never runs from `recalc()`.** Autosave listens on its own
   handlers, debounced 1500 ms, single-flight with a queued latest snapshot.
6. **Only a sign-out or a genuinely different user ends a working session.** A
   token refresh preserves the active buyer binding (Gate C.5a).
7. **Session teardown is presentation only.** Signing out clears the binding, the
   buyer list, the name field and the marker — it does not delete, archive or
   orphan any record. Verified live by signing into a second account and back
   into the first, with the original buyer intact.
8. **A workspace may only ever be saved by the account that authored it.**
   `workspaceOwner` is checked on every save and every autosave; a different
   signed-in user is refused outright (Gate D §13). A session that ends mid-edit
   parks the buyer binding rather than destroying it, and hands it back only to
   the same user id.
9. **The Supabase client is vendored, pinned and served from our own origin.**
   No CDN is contacted at runtime (Gate D §11).

To run the suites, see `internal/buyer-strategy/tests/README.md`.

---

*HomeWealth Solutions LLC · doug@homewealthsolutions.com · 813-733-7371 · homewealthsolutions.com*
