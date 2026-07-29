# Buyer Strategy Engine — test suites

Nine suites, **500 assertions**. All drive the real application in headless
Chromium; none stubs, mocks, or re-implements a calculation inside the
application. The only mock anywhere is the *network transport* in
`persistence-client.test.js` — the mapping and the orchestration it exercises are
the application's own code, running in the page.

| Suite | File | Assertions | What it protects |
|---|---|---|---|
| **Permanent numerical regression** | `bse-regression.test.js` | 68 | The 47 audit scenarios against **fixed expected values**. The numerical contract |
| **M-1 / canonical units** | `m1-canonical-units.test.js` | 80 | Gate A: restore never converts; repeated toggling never drifts |
| **Canonical application state** | `canonical-state.test.js` | 22 | Gate B: model ⇄ DOM ⇄ engine identity, L-1 inheritance, DTI resolution, assumption-set immutability, prohibited-data absence |
| **C-4b presentation integrity** | `c4b-presentation-integrity.test.js` | 64 | Gate B.5: what is rendered was computed from the values the model actually holds |
| **Model authority** | `model-authority.test.js` | 12 | Gate B.5/B.75: `BSEModel` is the only economic source of truth; no legacy DOM path survives |
| **Persistence contract** | `persistence-contract.test.js` | 40 | Gate B.75: blank ≠ zero, authored vs resolved, `result_summary` non-authoritative |
| **Cross-tool R-47** | `r47-cross-tool.test.js` | 4 | The documented $115,338 Comfort Calculator vs BSE gap (audit C-6) |
| **Persistence — client** | `persistence-client.test.js` | 136 | Gate C: save/load orchestration, debounce, single-flight, failure safety, status truthfulness, the pre-authentication path, Gate C.5 saved-buyer retrieval, auth-event binding stability, Gate D config validation / vendored dependency / session-expiry-mid-edit / offline honesty / responsive readiness. **No database required** |
| **Persistence — schema/RLS** | `persistence-db.test.js` | 74 | Gate C: the migrations, RLS enable+force, cross-user denial, constraint enforcement, canonical round-trip identity, repeat-save strategy, anonymous pre-auth surface. **Requires PostgreSQL** |

## Running them

Requires Node and Playwright's Chromium. From `internal/buyer-strategy/`:

```bash
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

A green run therefore means something.

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
