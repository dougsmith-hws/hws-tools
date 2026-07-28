<!--
BUYER STRATEGY ENGINE — PHASE 3, GATE B REPORT
File: docs/BSE-Phase3-GateB-Report.md
Status: Gate B COMPLETE — stopped for Doug's review. Gate C NOT started.
Origin: Cowork session of 2026-07-28.
Companion documents: docs/BSE-Project-Status.md, docs/BSE-Phase0-1-Forensic-Audit.md,
docs/BSE-Phase2-Architecture.md, docs/BSE-Phase3-GateA-Report.md
-->

# BUYER STRATEGY ENGINE — PHASE 3, GATE B
## Numerical Baseline + Canonical Application State — Completion Report

**HomeWealth Solutions LLC** · Company NMLS #2742458 · FL OFR Mortgage Broker License #MBR8082
Prepared for: Doug Smith, President & Broker, CMA®
Date: **July 28, 2026**

Scope executed: verify Gate A → create the Gate B branch → capture the 47-scenario numerical baseline → prove it → **Checkpoint B1** → implement canonical application state → re-run everything → report → **STOP**.

**Gate C was not started.** No Supabase, no authentication, no RLS, no database, no cloud persistence, no cross-device sync. No FL millage integration. No Comfort Calculator change. No UI redesign.

---

## 1. Gate B branch

`phase3/gate-b-canonical-state`, created from the approved Gate A HEAD and confirmed checked out (`.git/HEAD` → `ref: refs/heads/phase3/gate-b-canonical-state`) before any tracked source was edited. `main` was never touched and no Gate B change was added to the Gate A branch.

## 2. Starting Gate A commit

`6f440f3` — verified independently before starting: branch, HEAD, clean working tree, no residual git locks, all four controlling documents present, Gate A report present, and the three protected files unchanged (`1cd00523…`, `772de6d1…`, `01830ac6…`).

## 3. Ending commit

| Commit | Content |
|---|---|
| `f63953a` | Gate B Stage 1 — permanent 47-scenario numerical regression baseline. **No application file changed** |
| `5e99b68` | Gate B Stage 2 — canonical application state |

Working tree clean at both points.

## 4. Files changed

| File | Change |
|---|---|
| `internal/buyer-strategy/index.html` | **Modified in Stage 2 only.** MD5 `d5c16fde3b9c57a14f26ab9bae1b38ec` → `f8b2b9b51c06b021b4b1d3242b482979`. Purely additive |
| `internal/buyer-strategy/tests/scenarios/bse-regression-scenarios.json` | Added — the 47 audit scenarios |
| `internal/buyer-strategy/tests/oracle/reference_model.py` | Added — the independent reference model |
| `internal/buyer-strategy/tests/baseline/bse-expected-baseline.json` | Added — the frozen expected values |
| `internal/buyer-strategy/tests/bse-regression.test.js` | Added — the permanent suite |
| `internal/buyer-strategy/tests/canonical-state.test.js` | Added — Gate B state tests |
| `internal/buyer-strategy/tests/r47-cross-tool.test.js` | Added — the cross-tool scenario |
| `internal/buyer-strategy/tests/capture-engine-output.js`, `tests/build-expected-baseline.py`, `tests/lib/app-harness.js` | Added — baseline production tooling |
| `internal/buyer-strategy/tests/README.md` | Updated — all four suites, how to run, and what is not covered |

Nothing else in the repository was touched.

## 5. Checkpoint B1 results

| Measure | Result |
|---|---|
| Audit scenarios accounted for | **47 / 47** (R-1 … R-47) |
| Executable units after expanding sub-cases | 69 |
| Executed | **68** |
| Passing against independently derived expected values | **68** |
| Failing | **0** |
| Not executable | **1** (R-13d) |
| Fields `EXPECTED VALUE VERIFIED` | **3,625** |
| Fields `EXPECTED VALUE REQUIRES REVIEW` | **1,532** |
| Discrepancies between the oracle and the application | **0** |
| Page errors | 0 |

**No blocking discrepancy was found, so Stage 2 proceeded** — as your authorization permits without pausing.

One oracle correction was made during B1 and is recorded for transparency: the reference model initially produced `cancelMonth = null` for the FHA 10% tier while the application returned `132`. Re-reading audit §2.4 — *"conventional solves the true 80%-of-price crossover month via `monthToBalance`; FHA uses `mipDropMonth` (132 or null)"* — the application is right and the oracle was incomplete. **This was a gap in my reading of the specification, not an application defect**, and it is the only case where the two ever disagreed.

## 6. Location of the permanent regression suite

```
internal/buyer-strategy/tests/
├── README.md                              how to run all four suites; coverage limits
├── scenarios/bse-regression-scenarios.json  the 47 audit scenarios
├── oracle/reference_model.py              INDEPENDENT implementation of the documented formulas
├── baseline/bse-expected-baseline.json     the FROZEN expected values (the contract)
├── bse-regression.test.js                 the permanent numerical suite
├── r47-cross-tool.test.js                 R-47, Comfort Calculator parity
├── m1-canonical-units.test.js             Gate A
├── canonical-state.test.js                Gate B
├── capture-engine-output.js               capture tooling (baseline rebuild only)
├── build-expected-baseline.py             oracle comparison + baseline writer
└── lib/app-harness.js                     shared scenario driver
```

Run:

```bash
node tests/bse-regression.test.js index.html
node tests/r47-cross-tool.test.js index.html ../../buyer/comfort-calculator.html
node tests/canonical-state.test.js index.html
git show 540ccbe:internal/buyer-strategy/index.html > /tmp/bse-baseline.html
node tests/m1-canonical-units.test.js /tmp/bse-baseline.html index.html
```

Every failure prints the scenario id, the scenario key (`conv@5`, `fha@3.5`, `va@0`), the field, the expected value and the actual value.

## 7. Exact number of regression scenarios

**47 audit scenarios**, expanded to **69 executable units** because four of them (R-13, R-14, R-38, R-45) are defined in the audit as multi-case scenarios — R-14 alone is fourteen credit-boundary runs. 68 execute; R-13d does not (see §10).

The set was not reduced. It is not the 37-scenario Gate A differential set; that suite still exists and still runs, but it proves a different thing.

## 8. Expected-value verification method

The requirement was to avoid a circular test. The method:

1. **`tests/oracle/reference_model.py` is a second, independent implementation** of the formulas documented in `docs/BSE-Phase0-1-Forensic-Audit.md` §2.1 (amortization), §2.2 (the verbatim PMI table, the FHA MIP step, the VA funding-fee table), §2.3 (closing costs, concession limits), §2.4 (the payment-engine assembly) and §2.5 (the closed-form buying-power solver). It was written from the audit's prose and tables. It does not read, import, or transcribe `index.html`.
2. For every scenario the application emits, the oracle **independently derives** price, down payment, base loan, LTV, rate, fee percent, financed fee, loan amount, MI rate, monthly MI, P&I, taxes, fixed escrow, escrow, PITI, closing costs, cash to close, cash remaining, front and back DTI, concession limit, cancellation month, `maxPrice`, the binding constraint, comfort price and qualifying price — **including the interest rate and the financed fee**, so nothing is taken from the application except the inputs.
3. Agreement → `EXPECTED VALUE VERIFIED`. Disagreement → `DISCREPANCY`, reported, never silently blessed.
4. Where audit §11.5 states a value **cannot be established statically** — both bisection solvers, near-tie winners from `pickBestOverall` / `pickPathWinner`, `optimalRestructure`'s split, all rendered prose, elimination strings, the change log — the oracle **refuses to produce a value**. Those are recorded as `EXPECTED VALUE REQUIRES REVIEW` and function only as change detectors.
5. The result was frozen to `tests/baseline/bse-expected-baseline.json`. **The suite never recomputes; it compares against the frozen file.**

**Two independent corroborations that the chain is faithful:**

- **R-47 reproduces the audit's published C-6 figures to the dollar** — Comfort Calculator max price **$524,047**, comfort price **$399,080**, BSE max price **$408,709**, gap **$115,338**. Those numbers were established in the Phase 1 audit before this suite existed.
- **Mutation testing proves the suite has teeth.** Changing the buydown ratio from `0.25` to Staging's `0.24` at all five sites fails **14** scenarios. Changing a single PMI table cell (`740–759`, band `b`, `0.38 → 0.39`) fails **44**.

## 9. 47-scenario results

**68 / 68 executable cases pass. 0 fail. 1 not executable.** 3,625 independently verified fields and 1,532 review fields checked on every run.

Coverage by area, all differential **and** value-verified against the oracle: Shopping Range · Maximum Buying Power · Comfort Buying Power · Cash-Limited Buying Power · Conventional (3/5/10/20/custom) · FHA 3.5% and 10% tiers · VA first / subsequent / exempt · P&I · property taxes in both % and annual-$ modes · HOI · flood · HOA · CDD · PMI table and all four credit-bucket boundaries · FHA MIP and UFMIP · VA funding fee · total PITI · down payment · closing costs · cash to close · seller concessions · available-funds constraint · DTI · program eligibility · elimination reasons · Gap Solver (payment, cash, DTI) · Recommendation Engine · Best Overall · buyer priority ×4 · planned-stay regime switches · Offer Strategy · Counter Offer Analyzer · buydown at 0.25 · negotiation paths · decision thresholds.

## 10. Scenarios requiring review

**Not executable — 1**

| Scenario | Reason |
|---|---|
| **R-13d** — PMI band boundary at LTV 85.00 | The engine enumerates Conv 3 / 5 / 10 / 20 plus a custom tier only above 20.5% down. A 15%-down scenario cannot be produced through the UI, so **PMI band `c` (85–90) is unreachable end-to-end** and its four table cells are never exercised. Recorded as a permanent coverage gap, not a defect |

**Executed but producing no program scenarios — 6.** In each the elimination *is* the documented behaviour: R-5 (score 480, below the FHA floor), R-31 and R-32 (Gap Solver cases where every program is eliminated), R-41 (blank score coerced to 300), R-42 (price `"0"`), R-44 (the stale down-payment target against a $600,000 property).

**Viability adjustments — 11.** Eleven scenarios needed funds or income raised so the tier under test was not eliminated before it could be measured — R-4, R-6, R-7, R-8, R-9, R-12, R-13b, R-13c, R-34, R-35, R-36. The audit specifies the tier for these, not the funding. Each records a `viability_adjustment` string stating exactly what changed and why. No other input was altered.

**`EXPECTED VALUE REQUIRES REVIEW` — 1,532 fields.** These are recorded, not blessed: `totalCostHorizon`, `miCostHorizon`, `postCancelPITI`, `conc`, `frontFlag`, `requiresGift` and the label strings per scenario, plus per case the `bestOverall` selection, the `priorityPick`, the elimination list, `dpDimmed`, and all rendered output — which is where both bisection solvers and `optimalRestructure` surface. **If you want these promoted to verified, that is a separate piece of work: it needs either a documented specification for each or your sign-off on the current values.**

**Two audit expectations that Gate A legitimately superseded**, recorded in the scenario file rather than silently changed: R-17 (tax unit round-trip) and R-44 (dpTarget corruption) were written to capture C-4a's lossy drift. Gate A removed the drift with your approval, so the post-Gate-A values are the contract from here.

## 11. Gate A M-1 test results

**80 / 80 pass**, unchanged. Restore still never converts; repeated toggling still never drifts; the baseline defect still reproduces on the pre-Gate-A file (`$87,400 → $381,938,000`) and still does not on the current file.

## 12. Canonical application-state architecture implemented

A single additive layer, `BSEModel`, implementing the Phase 2 architecture with Phase 2's field names:

| Layer | Phase 2 | Implemented as |
|---|---|---|
| Buyer Profile | §4 | `captureBuyerProfile()` |
| Shopping Plan | §5 | `captureShoppingPlan()` |
| Property | §6 | `captureProperty()` |
| Property Scenario | §7 | `capturePropertyScenario()` |
| Offer / negotiation | §8 | `captureNegotiationRounds()` |
| System / program assumptions | §9 | `ASSUMPTION_SET`, frozen |
| Temporary UI state | — | `captureUiState()`, held separately |

Inheritance is Phase 2's rule exactly: `resolve(field) = property_scenario.field ?? shopping_plan.field ?? assumption_set.field ?? engine default`, computed **in memory and never written back** (L-1). No second data model was invented.

## 13. Exact functions added

`ASSUMPTION_SET` (frozen constant) · `BSE_ENGINE_VERSION` · `BSE_MODEL_SCHEMA` · `BSEModel` module exposing `capture()`, `apply()`, `resolve()`, `toInputs()`, `resolveDti()`, `assumptionSet`, and internally `costField()`, `costValue()`, `captureBuyerProfile()`, `captureShoppingPlan()`, `captureProperty()`, `capturePropertyScenario()`, `captureNegotiationRounds()`, `captureUiState()`, `pick()` · `window.BSEModel`.

## 14. Exact functions modified

**None.** Stage 2 is a single insertion.

Verified mechanically: 60+ named functions were extracted by balanced-brace parsing from the Gate A file and the shipped file and compared byte-for-byte — **zero differ**. Against the pre-Phase-3 baseline `540ccbe`, the only functions that differ are Gate A's three (`setUnit`, `setOfferConcUnit`, `setCounterUnit`).

## 15. Buyer Profile state implementation

Phase 2 §4 fields: `qualifying_income_monthly`, `monthly_debts`, `credit_score`, `own_funds`, `gift_funds`, `is_first_time_buyer`, `va_eligible`, `va_use`, `va_funding_fee_exempt`, the four `dti_override_*` fields, the four buyer-level FL fields (`homestead_intent`, `prior_homestead_market_value`, `prior_homestead_assessed_value`, `portability_eligible` — carried, never calculated with), `display_name`, `reference_code`, `status`.

`va_funding_fee_exempt` is a **boolean only** — no rating, condition, or award data. Prohibited-data absence is asserted by test C8 against a banned-token list (SSN, DOB, government ID, bank account, routing, credit report, paystub, W-2, tax return, bank statement, asset statement, document URL, URLA/1003).

## 16. Shopping Plan state implementation

Phase 2 §5 fields, including the canonical pairs and the three-state cost fields: `target_payment`, `dp_target_value` + `dp_target_unit`, `planned_stay_years`, `buyer_priority`, `tax_method` (**always `flat_rate`** — L-1 / §13.5), `tax_rate_pct`, `tax_annual_amount`, `tax_input_unit`, `hoi_monthly`, `hoa_monthly`/`hoa_status`, `cdd_monthly`/`cdd_status`, `flood_monthly`/`flood_status`, `rate_conv`/`rate_fha`/`rate_va`, `closing_cost_pct`, `assumption_set_version`.

Cost fields are genuinely three-valued (`unknown` | `confirmed_none` | `known`) with the value NULL in both zero cases, so **a status change has nothing to overwrite** — the C-4b destruction is structurally impossible *in the model*. The DOM-level destruction in `updateInlineHints` is untouched and remains open (see §34).

Shopping Range continues to use flat-rate tax assumptions. `maxPriceForScenario` was not modified.

## 17. Property / Property Scenario state

Property (§6) is captured thin: label, address parts, `state` defaulting to `FL`, `county`, `property_type`, `mls_number`, `status`.

Property Scenario (§7) carries `analysis_mode` (**explicit — `shopping` | `property`, never inferred downstream from a null price**, addressing M-5), `list_price`, `closing_cost_override_amount`, `qualifying_tax_basis` defaulting to `projected_reassessed` (L-7), `tax_method` / `tax_inputs` / `tax_outputs` / `tax_method_version` as **carried discriminator fields only**, `closing_date`, `occupancy_date`, `assumption_set_version`, `engine_version`, `status`, `is_accepted_property`, and the full set of nullable override columns.

Every override column captures as NULL today, because the current single-form UI has no surface for authoring a property-level override distinct from the plan. **The inheritance mechanism is real and tested** — test C5 authors a scenario-level tax rate, HOI and HOA in the model, proves they win, proves they reach the engine input, and proves the Shopping Plan is not written back. Building the authoring surface is later-phase UI work.

## 18. Offer / Negotiation state

Phase 2 §8 `negotiation_round` rows are derived from the form: a buyer round when an offer price exists (price, `concession_value` + `concession_unit`, `negotiation_mode`, manual-split fields, `is_accepted`) and a seller round when a counter price exists (price, concession pair, `loan_program_override` from `#counterLoan`).

Per M-12 and finding C-9, `manual_split_buydown` / `manual_split_costs` are **reserved and captured, not treated as authoritative**, and are NULL whenever the split is in automatic mode.

## 19. Assumption-set representation

`ASSUMPTION_SET` is `Object.freeze`d at every level, labelled **`2026.07-baseline`**, `effective_from` 2026-07-28, `is_current` true, with the Phase 2 §9.2 payload verbatim: term 360 · program min scores and DTI ratios (620/28/45, 500/31/43, 0/41/41) · FHA UFMIP 1.75, annual 0.55/0.50, drop month 132 · VA 2.15/3.30 · PMI LTV band definitions · conforming 766,550 and FHA floor 498,257 with `fha_limit_is_county_specific: false` · concession limits · closing-cost default 3.00 · rate defaults 6.750/6.250/6.125 · **buydown `pct_per_point: 0.25`** with `rate_rounding: 0.125` · the nine decision thresholds (150/36, 500, 1000, 250/50/2500, 2000/2500) · flat tax default 1.20.

Test C7 attempts to write `0.24` into the buydown ratio and asserts it stays `0.25`.

## 20. DTI override representation

`resolveDti(family, model)` implements §15: **program default → buyer-level override → scenario-level override**, returning `{front, back, source}`. Test C6 asserts the defaults are the audited production values, that a buyer override supersedes them, and that a scenario override supersedes the buyer override.

This is architectural capability only. **Nothing consumes it yet** — the Engine still uses its own `PROGRAMS` ratios and **no DTI mathematics changed**. Wiring it in would change qualification numbers and is not authorized.

## 21. `applyState` behaviour after Gate B

Unchanged from Gate A. `BSEModel.apply()` delegates to it rather than reimplementing restore, so the M-1 guarantee is preserved by construction: units are assigned directly, values are written verbatim, canonical pairs are restored verbatim, and **no unit toggle handler is ever invoked on the restore leg**. Presentation state (`gap_tab`, collapsed sections, manual-split visibility) is applied afterwards and cannot alter an economic field — asserted by test C9, which changes UI state and shows every economic field byte-identical.

## 22. Unit handling after Gate B

Unchanged. The canonical pair is still `(value, unit)`: `dp_target_value` + `dp_target_unit`, `concession_value` + `concession_unit`, and tax as `tax_rate_pct` / `tax_annual_amount` / `tax_input_unit` — **the three tax fields were not consolidated**. User-initiated toggles still convert from the canonical pair, so repeated switching still cannot drift. Test C10 restores `$87,400` and `$6,347` into a contaminated session and confirms both survive unconverted and reach the engine correctly.

## 23. New canonical-state tests

`tests/canonical-state.test.js` — 22 assertions:

| Id | Assertion |
|---|---|
| C1 | DOM → canonical model → engine input is lossless on all 68 scenarios (deep equality against `gatherInputs()`) |
| C2 | canonical model → `Engine.run` matches the live DOM run on all 68 scenarios |
| C3 | canonical model → DOM → calculation reproduces every rendered output, restoring into a contaminated session |
| C4 | three consecutive capture/restore cycles are stable on all 68 |
| C5 | L-1 inheritance: a scenario override wins, reaches the engine, and never writes back to the plan (4 assertions) |
| C6 | §15 DTI resolution chain (3 assertions) |
| C7 | assumption set immutable, `2026.07-baseline`, buydown 0.25 resisted a write to 0.24, constants verbatim (3 assertions) |
| C8 | no prohibited borrower data anywhere in the model; VA exemption is a boolean only (2 assertions) |
| C9 | presentation-state changes leave every economic field untouched — and the test is not vacuous |
| C10 | M-1 still holds after Gate B (2 assertions) |
| C11 | representative Buyer Profile and Shopping Plan edits flow through to the engine input |
| C12 | no JavaScript errors during any canonical-state operation |

## 24. Post-implementation regression results

Run against the exact file now on disk (MD5 `f8b2b9b51c06b021b4b1d3242b482979`):

| Suite | Result |
|---|---|
| Permanent 47-scenario numerical regression | **68 / 68 pass**, 0 fail, 1 not executable |
| Gate A M-1 / canonical units | **80 / 80 pass** |
| Canonical application state | **22 / 22 pass** |
| R-47 cross-tool | **4 / 4 pass** |
| **Total** | **174 assertions, 0 failures** |

**No protected output changed.** No expected value was adjusted to make anything green, and the engine was not modified to make anything green.

## 25. Confirmation — calculation mathematics not changed

Confirmed. The `Engine` IIFE (lines 526–1060) is byte-identical across `540ccbe`, Gate A and Gate B — MD5 `014e065f005530b2ab25de810e46510b` at all three points. `computeScenario`, `pmt`, `balanceAfter`, `monthToBalance`, `round125`, `scoreBucket`, `pmiRate`, `pmiBand`, `fhaMipRate`, `closingCost`, `concessionLimitPct`, `run`, `pickBestOverall`, `applyConcession`, `priorityPick`, `programCards`, `gatherInputs`, `recalc`, `recalcCounter` and every negotiation, gap-solver and counteroffer function are unchanged.

## 26. Confirmation — `maxPriceForScenario` not changed

Confirmed. Byte-identical to `540ccbe`. Its mirrored PITI assembly against `computeScenario` is intact, and the oracle independently reproduces its four ceilings and binding-constraint selection on every scenario.

## 27. Confirmation — buydown ratio remains 0.25

Confirmed at all five computation sites in the engine, and recorded as `0.25` in the frozen assumption set. Staging's `0.24` was not adopted, not referenced, and not copied. The mutation test demonstrates the suite would catch it: `0.24` fails 14 scenarios.

## 28. Confirmation — FL Property Tax not integrated

Confirmed. No millage, assessed value, homestead, Save Our Homes or portability logic entered the BSE. `tax_method` is carried as a discriminator only; Shopping Plans are `flat_rate`; `qualifying_tax_basis` is stored and consumed by nothing.

## 29. Confirmation — Property Tax tool unchanged

Confirmed. `~/Tools/Live/property-tax.html` MD5 `1cd00523ad5845942ec6e812538b6312`.

## 30. Confirmation — Comfort Calculator unchanged

Confirmed. `~/Tools/Live/buyer/comfort-calculator.html` MD5 `772de6d1e3d6b3182049af6a7bcebedd`. R-47 opens a **copy**, read-only, and drives only its inputs. Not retired; the L-11 gate is untouched and Gate B completion does not satisfy it.

## 31. Confirmation — Staging unchanged and non-authoritative

Confirmed. `~/Tools/Staging/buyer-strategy-v2/index.html` MD5 `01830ac60b3ec9c1db4a73ce76201f2f`. It was never opened as a reference and nothing was copied from it.

## 32. Current git status

Clean — no modified, staged, or untracked files.

## 33. Current branch

`phase3/gate-b-canonical-state`

## 34. Known limitations

1. **`gatherInputs()` still reads the DOM.** The canonical model is proven complete and lossless (C1/C2 on all 68 scenarios), but the live path is still DOM → `gatherInputs()` → Engine. Cutting the engine over to consume the model is Phase 2 §23 item 6; it would change the live input path and was not part of the minimum change. The equivalence test is already in place as the safety net for that cutover.
2. **PMI band `c` (85–90) is unreachable.** No 15%-down tier exists, so four PMI table cells can never be exercised through the UI.
3. **1,532 fields are recorded but not independently verified.** Both bisection solvers, near-tie winners, `optimalRestructure`'s split and all rendered prose. They detect change; they do not assert correctness.
4. **No property-level override authoring surface.** The inheritance mechanism is implemented and tested, but nothing in the current UI can author a Property Scenario override, so every override column captures NULL in normal use.
5. **DTI override is not wired to the engine.** Resolution exists and is tested; the Engine still uses its own ratios.
6. **`updateInlineHints` still overwrites HOA / CDD / flood with `'0'` at render time** (C-4b). The model is immune; the DOM is not. R-43 is the visible consequence: its pre-restore render was computed from a value the DOM no longer held, so a restore produces a different — and more correct — result. Canonical-state identity is asserted at the model level for that one scenario.
7. **`num()` still coerces** (M-4): a blank credit score still becomes 300.
8. **The floating `%` concession base (M-13) is unchanged.** A percentage concession still re-bases when an offer price is typed.
9. **Shopping-Mode unit reinterpretation is unchanged** (the other half of C-4a): with the price blank, toggling flips the unit without converting.
10. **No human validation.** Headless only — no click-through, no iPad or phone check, no live buyer call.
11. **The git device-bridge limitation persists.** Every git command leaves an orphan `.lock` and `tmp_obj_*` files the mount will not let git unlink; each call swept them into `Tools/_to_delete/stale-git-locks/` first.

## 35. What should block or shape Gate C

1. **Fix `updateInlineHints` (C-4b / M-6) before persistence.** The model cannot be corrupted, but the DOM still can, and persistence saves what the DOM holds. This is the highest-value remaining item and it is already in Phase 2 §23 as item 9.
2. **Decide the 1,532 review fields.** Persistence will cache `result_summary` from values that are currently only change-detected. Either specify them or sign off on the recorded values before they become historical records.
3. **Do the `gatherInputs()` cutover before Supabase, not after.** Adding save/load on top of a DOM-read input path means persistence and the input model can drift. The equivalence test makes the cutover safe now; it will be harder later.
4. **Wire the DTI override deliberately, with its own approval.** It changes qualification numbers the moment it is consumed. It belongs in the Phase 7 "one approved calculation change at a time" sequence, not slipped into a persistence gate.
5. **Autosave must stay off the `recalc` path** (M-8) — roughly six engine runs per keystroke.
6. **Adding a Supabase client costs the offline property** (M-10). The BSE has zero external dependencies today; that is worth naming as a deliberate trade before it is lost.
7. **`analysis_mode` must be set deliberately on migration** (M-5), never derived from a null price.
8. **Run Gate C on the computer, not in a cloud session.** Gate C is commit-heavy and the lock limitation will be a constant tax.
9. **Phone viability is still unvalidated** (M-16 / L-12), and L-12 made it a full editing surface. It remains a Phase 3 finding that has not been discharged.

---

## GATE B COMPLIANCE STATEMENT

- The Gate A branch, commit, documentation and authoritative baselines were verified independently before any work began.
- The 47 audit scenarios were located in the controlling documentation and used as written; none was invented, replaced, merged or dropped.
- Expected values were established by an independent implementation of the documented specification, and every field the audit says cannot be established statically is flagged rather than blessed.
- No calculation function, program constant, recommendation logic or `maxPriceForScenario` was modified. Stage 2 modified no existing function at all.
- `property-tax.html`, `buyer/comfort-calculator.html` and the Staging BSE are unchanged and were not used as references.
- No Supabase, authentication, RLS, database, cloud persistence, FL millage integration, Comfort Calculator retirement or UI redesign was performed or started.
- **Gate C has not begun.**

---

*Prepared for Doug Smith, President & Broker, CMA® · HomeWealth Solutions LLC · NMLS #2742458 · FL OFR Mortgage Broker License #MBR8082 · doug@homewealthsolutions.com · 813-733-7371*
