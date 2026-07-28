# Buyer Strategy Engine — Gate A test harness

Regression + M-1 harness for Phase 3 Gate A (`applyState` canonical unit
restoration — Phase 1 finding **C-4a**, Phase 2 migration risk **M-1**, locked by
Phase 2 Decision **L-13**).

This is the first automated test asset in the repository. Phase 1 §11.1 recorded
that none existed.

## What it does

The harness drives the real application in headless Chromium. It does not stub,
mock, or re-implement any calculation.

| Part | Purpose |
|---|---|
| **A — Regression** | 37 scenarios run against the pre-change baseline **and** the patched file with identical economic inputs. `gatherInputs()` output and the rendered text of every output region must match exactly. |
| **B — M-1** | Capture → restore → recalculate identity, canonical-pair preservation, ten consecutive restore cycles, and repeated `%`/`$` toggling for all four dual-unit fields. |
| **C — Defect** | Reproduces the M-1 failure on the baseline file and demonstrates its absence on the patched file. Also records the baseline's repeated-toggle drift. |

Part A sets unit state by direct assignment on **both** files, so the two sides
receive identical economic inputs. Toggle-driven sequences are deliberately kept
out of Part A — the corrected drift behaviour is an intended difference and is
asserted in Parts B and C instead.

## Running it

Requires Node and Playwright's Chromium. Provide a copy of the pre-change
baseline (git `540ccbe`, md5 `8395ad3441b500f559d5c615ac7f5efa`) and the current
file:

```
git show 540ccbe:internal/buyer-strategy/index.html > /tmp/bse-baseline.html
node tests/m1-canonical-units.test.js /tmp/bse-baseline.html internal/buyer-strategy/index.html
```

Exit code 0 = all assertions passed. The suite prints one line per assertion and
a PASS/FAIL summary.

## Scope — what is NOT covered

Stated explicitly so coverage is never overclaimed:

- No scenario asserts an **expected value** captured from production. Part A
  proves *the patch changed nothing*; it is not the Phase 1 §11.3 regression
  baseline, which still has to be captured from the running application (47 BSE
  + 11 FL scenarios) before any further refactor.
- `monthToBalance` PMI cancellation months, both bisection solvers, and near-tie
  ordering are covered only in the sense that baseline and patched agree.
- `property-tax.html` and `comfort-calculator.html` are untouched by Gate A and
  are not exercised here.
- The change log, `concSplit` manual-allocation state, and the Gap Solver tab
  selection are not part of the captured state object (out of Gate A scope).

*HomeWealth Solutions LLC · Company NMLS #2742458 · FL OFR Mortgage Broker
License #MBR8082*
