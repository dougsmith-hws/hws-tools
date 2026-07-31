# Buyer Strategy Engine — test suites

Seventeen suites, **1,165 assertions**. All but one drive the real application in
headless Chromium; none stubs, mocks, or re-implements a calculation inside the
application. The only mock anywhere is the *network transport* in
`persistence-client.test.js` — the mapping and the orchestration it exercises are
the application's own code, running in the page. The exception is
`engine-freeze.test.js`, which is a static source check and needs no browser.

**Quick run:** `./run-all-tests.sh` from `internal/buyer-strategy/` executes every
suite. `persistence-db` is run when a PostgreSQL is reachable (export `PGHOST`
and `PGPORT` — see `supabase/README.md`) and skipped with a printed notice
otherwise, so a green run never silently omits it.

| Suite | File | Assertions | What it protects |
|---|---|---|---|
| **Engine freeze** | `engine-freeze.test.js` | 18 | **The protected calculation boundary.** Content hash of the `Engine` IIFE + seven structural invariants on `maxPriceForScenario()`. Replaces the old line-range expression of the freeze |
| **Permanent numerical regression** | `bse-regression.test.js` | 68 | The 47 audit scenarios against **fixed expected values**. The numerical contract |
| **Down-payment solver** | `dp-solver.test.js` | 55 | Phase 4 N-1 `requiredDownForPayment()`: round trip through `Engine.computeScenario()`, minimality, monotonicity, PMI boundaries, program gating, honest infeasibility |
| **Answer layer** | `answer-layer.test.js` | 104 | Phase 4 Job 1 + Job 2 answer layer, the revived buying-power panel, the debt lever, the goal bar, responsive behaviour |
| **Shopping authored inputs** | `shopping-dp-target.test.js` | 58 | Addendum A: a fixed-dollar down payment is held constant at every price; the three tax input modes |
| **Job 1 what-if** | `job1-whatif.test.js` | 66 | "How much down to stay at $X/mo?" and the three Shopping Range pins |
| **Job 1 closeout** | `job1-closeout.test.js` | 57 | Addendum B/C presentation: clipped collapse, `$/MO` default, blank-tax flag, the corrected Cash-Limited card |
| **Job 1 rate impact** | `job1-rate-impact.test.js` | 126 | Rate sensitivity: payment impact, shopping-power impact, custom-rate precision, sandboxing |
| **Job 2 property strategy** | `job2-property-strategy.test.js` | 177 | **Job 2.** Cases A–I of the Job 2 scope §16: achievable / cash-short / qualification-fail / already-under-target, debt payoff that helps and debt payoff that hurts, seller value, negotiation counter, and Job 1 non-interference. Plus: the banner and the binding constraint can never contradict each other, Accepted status round-trips, and the levers refresh without detaching the element that was clicked |
| **M-1 / canonical units** | `m1-canonical-units.test.js` | 80 | Gate A: restore never converts; repeated toggling never drifts |
| **Canonical application state** | `canonical-state.test.js` | 22 | Gate B: model ⇄ DOM ⇄ engine identity, L-1 inheritance, DTI resolution, assumption-set immutability, prohibited-data absence |
| **C-4b presentation integrity** | `c4b-presentation-integrity.test.js` | 64 | Gate B.5: what is rendered was computed from the values the model actually holds |
| **Model authority** | `model-authority.test.js` | 12 | Gate B.5/B.75: `BSEModel` is the only economic source of truth; no legacy DOM path survives |
| **Persistence contract** | `persistence-contract.test.js` | 40 | Gate B.75: blank ≠ zero, authored vs resolved, `result_summary` non-authoritative |
| **Cross-tool R-47** | `r47-cross-tool.test.js` | 4 | The documented $115,338 Comfort Calculator vs BSE gap (audit C-6) |
| **Persistence — client** | `persistence-client.test.js` | 136 | Gate C: save/load orchestration, debounce, single-flight, failure safety, status truthfulness, the pre-authentication path, Gate C.5 saved-buyer retrieval, auth-event binding stability, Gate D config validation / vendored dependency / session-expiry-mid-edit / offline honesty / responsive readiness. **No database required** |
| **Persistence — schema/RLS** | `persistence-db.test.js` | 78 | Gate C: the migrations, RLS enable+force, cross-user denial, constraint enforcement, canonical round-trip identity, the repeat-save strategy, the anonymous pre-auth surface, and **D12f — autosave of an ACCEPTED scenario, including a cleared counter price**. **Requires PostgreSQL** |

`tests/manual-capture-job2.js` is not a suite and is not run by `run-all-tests.sh`.
It drives the pinned buyer profile through Job 1 and five Job 2 cases and prints
the rendered answer text plus screenshots, for manual review.

## Running them

Requires Node and Playwright's Chromium. From `internal/buyer-strategy/`:

```bash
# 0 — protected calculation boundary (static; no browser needed)
node tests/engine-freeze.test.js index.html

# 1 — permanent numerical regression (47 scenarios vs frozen expected values)
node tests/bse-regression.test.js index.html

# 2 — cross-tool R-47 (Comfort Calculator is opened READ-ONLY)
node tests/r47-cross-tool.test.js index.html ../../buyer/comfort-calculator.html

# 3 — Gate A M-1 suite (needs the pre-Phase-3 baseline for the differential half)
git show 540ccbe:internal/buyer-strategy/index.html > /tmp/bse-baseline.html
node tests/m1-canonical-units.test.js /tmp/bse-baseline.html index.html

# 4-7 — Gate B / B.5 / B.75
node tests/canonical-state.test.js index.html
node tests/c4b-presentation-integrity.test.js index.html
node tests/model-authority.test.js index.html
node tests/persistence-contract.test.js index.html

# 8 — Gate C client orchestration (no database, no network)
node tests/persistence-client.test.js index.html

# 9 — Gate C schema and RLS (needs a local PostgreSQL — see supabase/README.md)
PGHOST=/tmp/pgsock PGPORT=5433 node tests/persistence-db.test.js index.html

# 10 — Phase 4 answer layer, the solver, and the two jobs
node tests/dp-solver.test.js index.html
node tests/answer-layer.test.js index.html
node tests/shopping-dp-target.test.js index.html
node tests/job1-whatif.test.js index.html
node tests/job1-closeout.test.js index.html
node tests/job1-rate-impact.test.js index.html
node tests/job2-property-strategy.test.js index.html

# manual review only — prints the rendered Job 2 answers and writes screenshots
node tests/manual-capture-job2.js index.html
```

Exit code 0 = pass. Every failure names the scenario and the field.

## How the expected values were established — read this before trusting a green run

The regression suite compares the application to **fixed values in
`tests/baseline/bse-expected-baseline.json`**. It never recomputes them.

Those values were produced by `tests/oracle/reference_model.py` — a second,
independent implementation of the formulas documented in
`docs/BSE-Phase0-1-Forensic-Audit.md` §2.1–§2.5, written from the audit's prose
and tables, **not** from `index.html`. That is what makes the suite
non-circular: it is not the engine agreeing with itself.

Each field carries a status:

| Status | Meaning |
|---|---|
| `EXPECTED VALUE VERIFIED` | The oracle derived the same number independently. A mismatch is a calculation regression |
| `EXPECTED VALUE REQUIRES REVIEW` | Audit §11.5 records it as not establishable statically — both bisection solvers, near-tie winners, `optimalRestructure`'s split, all rendered prose. The recorded value is a **change detector only**, never a correctness claim |

### The suite has teeth — proved by mutation

| Mutation | Scenarios that fail |
|---|---|
| Buydown ratio `0.25` → `0.24` (Staging's value) at all five sites | **14** |
| One PMI table cell, `740–759 / band b`, `0.38` → `0.39` | **44** |
| Buydown ratio `0.25` → `0.24` (any single site) | `engine-freeze` fails immediately |

A green run therefore means something.

## The engine freeze — why it is a hash and not a line range

`BSE-Project-Status.md` §4.4 froze "lines 526–1060." That expression stopped
being usable the moment Phase 4 began inserting markup above the `<script>` tag,
because every line number below the insertion shifts.

`engine-freeze.test.js` locates the engine by **marker** — `const Engine =
(function(){` through the first column-zero `})();` — and hashes the 529 lines
between them. The frozen value is `a6e73d694b462cd10983f8ec59eb5f4f`.

Extracting the same marker range from the pre-Phase-3 baseline `540ccbe` (MD5
`8395ad34…`) produces **the identical hash**, which independently confirms the
standing claim that the calculation engine survived Gates A through D byte for
byte.

**A failure in this suite is a STOP condition. Do not update the hash to make it
pass.** Revert the edit, or obtain written approval for a calculation change and
re-baseline the numerical suite as well.

## Rebuilding the baseline

Only when a calculation change has been separately approved in writing.

```bash
node tests/capture-engine-output.js index.html /tmp/capture.json
python3 tests/build-expected-baseline.py /tmp/capture.json tests/baseline/bse-expected-baseline.json
```

`build-expected-baseline.py` refuses to bless anything: it recomputes with the
oracle and reports a `DISCREPANCY` for any field where the two disagree.

## Coverage and its limits — stated so it is never overclaimed

**Covered.** Shopping Range · Maximum / Comfort / Cash-Limited Buying Power ·
Conventional, FHA and VA scenarios · P&I · taxes (flat rate, % and annual $) ·
HOI, HOA, CDD, flood · PMI table and bands · FHA MIP and UFMIP · VA funding fee ·
PITI · down payment · closing costs · cash to close · seller concessions ·
available-funds constraint · DTI · program eligibility and elimination strings ·
Gap Solver · Recommendation Engine · Best Overall · Offer Strategy · Counteroffer
Analyzer · buydown at 0.25 · negotiation paths · decision thresholds.

**Not covered.**

- **R-13d (LTV 85.00) is not executable.** The engine enumerates Conv 3/5/10/20
  plus a custom tier only above 20.5% down, so a 15%-down scenario cannot be
  produced through the UI and PMI band `c` (85–90) is unreachable end-to-end.
- **Six cases legitimately produce no scenarios** — R-5 (score 480), R-31, R-32
  (Gap Solver cases where every program is eliminated), R-41 (blank score → 300),
  R-42 (price `0`), R-44 (stale dp target). That elimination *is* the documented
  behaviour under test.
- **Eleven scenarios needed a viability adjustment** — funds or income raised so
  the tier under test is not eliminated before it can be measured. Each one
  records a `viability_adjustment` string saying exactly what changed and why.
- **`property-tax.html` scenarios T-1…T-11 are not run.** FL tax is not
  integrated and the tool is out of scope.
- **No human click-through, no iPad or phone validation, no live buyer call.**
- **Supabase Auth itself is not covered.** `persistence-client.test.js` proves the
  orchestration around the transport; `persistence-db.test.js` proves the schema
  and RLS on real Postgres. Neither can prove that a magic-link email is
  delivered, that the returned JWT is valid, or that Supabase's PostgREST layer
  applies the same policies — those require a live project and a human inbox, and
  are covered by the manual procedure in
  `docs/BSE-Phase3-GateC-Report.md` §58.
- **R-43 diverges on restore by design** — `gatherInputs()` runs before
  `updateInlineHints()` inside `recalc()`, so its captured render was computed
  from a value the DOM no longer held (finding C-4b). Canonical-state identity is
  asserted at the model level for that scenario instead.

*HomeWealth Solutions LLC · Company NMLS #2742458 · FL OFR Mortgage Broker
License #MBR8082*
