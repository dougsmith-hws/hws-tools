<!--
BUYER STRATEGY ENGINE — PHASE 3, GATE B.75 REPORT
File: docs/BSE-Phase3-GateB75-Report.md
Status: Gate B.75 COMPLETE — stopped for Doug's review. Gate C NOT started.
Origin: Cowork session of 2026-07-28.
-->

# BUYER STRATEGY ENGINE — PHASE 3, GATE B.75
## Persistence Contract Lock — Completion Report

**HomeWealth Solutions LLC** · Company NMLS #2742458 · FL OFR Mortgage Broker License #MBR8082
Prepared for: Doug Smith, President & Broker, CMA®
Date: **July 28, 2026**

Scope executed: verify Gate B.5 → branch → remove the legacy DOM path → prove one source of truth → implement blank inheritance → verify the intentional changes independently → reconcile the two pending fields → enforce `result_summary` as non-authoritative → prove recompute wins → full regression → report → **STOP**.

**Gate C was not started.** No Supabase, authentication, RLS, tables, cloud persistence, or save/load. No FL millage. No Comfort Calculator change. No UI redesign.

---

## 1. Gate B.75 branch

`phase3/gate-b75-persistence-contract`, created from the approved Gate B.5 HEAD and confirmed checked out before any tracked source was edited.

## 2. Starting Gate B.5 commit

`36bfa9a` — verified independently: branch, HEAD, clean tree, no residual locks, all six controlling documents present, harness present, M-1 and C-4b intact, and `gatherInputs()` confirmed already routing through `BSEModel`.

## 3. Ending commit

`7af4d88` — "Gate B.75 — persistence contract lock", followed by the report commit. Working tree clean at both points.

## 4. Files changed

| File | Change |
|---|---|
| `internal/buyer-strategy/index.html` | Modified. `1f4cde6c…` → `90bcc96f62feb7f90c34c8407ddeacd0` |
| `tests/persistence-contract.test.js` | **Added** — 40 assertions across the four contracts |
| `tests/edge-cases.json` | **Added** — the 33 edge cases lifted into a shared fixture |
| `tests/baseline/edge-inputs-baseline.json` | **Added** — frozen, oracle-verified edge-case expectations |
| `tests/model-authority.test.js` | Updated — the legacy-equivalence half retired with the function it compared against |

## 5. `__legacyGatherInputsFromDom` references before removal

Exactly two, both documented before deletion:

| Location | Kind |
|---|---|
| `index.html` — the function definition itself | **1 definition, 0 call sites in application code** |
| `tests/model-authority.test.js` — inside the `__econEq` probe | Test-only comparison |

No runtime behaviour depended on it, and no test used it as a hidden alternate path — the probe compared it against the model path rather than relying on it.

## 6. Confirmation the legacy function was removed

Removed in full — 3,668 bytes, brace-matched, including its "verification only" banner. `grep` for `__legacyGatherInputsFromDom` across the application source and the entire test tree returns **zero**. Test P1-1 asserts its absence from the shipped file on every run.

## 7. Confirmation no alternate DOM economic source remains

`index.html` contains exactly **one** `function gatherInputs(` definition, and its body is:

```js
return BSEModel.toInputs(BSEModel.capture());
```

Test P1-2 asserts both facts against the shipped source. There is no second gather path, and no production code reads an economic input from the DOM except `BSEModel.capture()`.

## 8. Tests proving `BSEModel` remains authoritative

| Test | What it proves |
|---|---|
| P1-1 / P1-2 | The legacy function is gone; exactly one `gatherInputs`, and it delegates |
| P1-3 | Interception: replacing `BSEModel.toInputs` changes what `gatherInputs()` returns, so the dependency is real |
| P1-4 | A raw DOM write that never reaches the model (`#income` poked to `99,999` with no event) cannot survive a canonical restore — the model's `9,500` wins |
| P1-5 | Capture uses the model; restore repopulates it before calculation |
| MA-1 … MA-9 | The Gate B.5 source-of-truth suite, still passing |

## 9. Blank rate behaviour before

Blank `#rateConv` → `num('rateConv')` → **0** → the engine priced a 30-year loan at 0.000%.

## 10. Blank rate behaviour after

Blank → the authored value is **NULL**, and L-1 resolution inherits the assumption set: **conv 6.750, FHA 6.250, VA 6.125**. The default is read from `ASSUMPTION_SET.payload.rates_default` — one authoritative source, not hard-coded at the call sites.

## 11. Blank closing-cost behaviour before

Blank `#ccPct` → **0%** → closing costs of zero and an overstated cash-limited ceiling.

## 12. Blank closing-cost behaviour after

Blank → NULL → inherits `ASSUMPTION_SET.payload.costs.closing_cost_pct_default` = **3.00%**.

## 13. Exact inheritance hierarchy used

Phase 2 §7, unchanged from Gate B:

```
resolve(field) = property_scenario.field
              ?? shopping_plan.field
              ?? assumption_set.field
              ?? engine default
```

Resolution happens in memory at calculation time and is **never written back**. Test P2 proves the full chain: with a blank plan rate the scenario resolves 6.750; setting a scenario override of 5.875 wins; the plan's authored value stays `null` throughout.

## 14. Confirmation blank and explicit zero remain distinct

They are separate instructions and are tested separately.

| Input | Authored value in canonical state | Resolved for calculation |
|---|---|---|
| blank rate | `null` | 6.750 |
| explicit `0` rate | `0` | **0** — the authored zero wins |
| blank closing-cost % | `null` | 3.00 |
| explicit `0` closing-cost % | `0` | **0** |
| authored `7.125` / `2.5` | as authored | as authored |

The distinction survives a round trip: test P3 captures with both fields blank, restores, and confirms the authored values are still `null`, the resolved values are still 6.750 / 3.00, and the DOM fields are still empty. **The inherited default is never persisted as though the user authored it.**

## 15. Regression scenarios affected by blank inheritance

**None of the 47.** Every audit scenario supplies explicit rates and a 3% closing-cost percent, so the permanent numerical baseline is untouched — 68/68 with zero expected-value edits.

The change surfaces in the **33-case edge sweep**, where exactly **4 cases** moved:

| Edge case | Before → after |
|---|---|
| blank conventional rate | `rates.conv` 0 → **6.750** |
| all three rates blank | 0/0/0 → **6.750 / 6.250 / 6.125** |
| blank closing-cost percent | `ccPct` 0 → **3.00** |
| blank closing-cost percent with a $ override | `ccPct` 0 → **3.00** (the $ override still governs cash to close in specific mode) |

The other **29 edge cases are byte-identical**. Worked example — blank conventional rate, Conv 5%:

| | Before | After |
|---|---|---|
| PITI | $2,157.50 | **$3,200.00** |
| Cash to close | $40,000.00 | **$32,083.69** |
| Max price | $509,554 | **$408,709** |
| Binding constraint | Cash to Close | **Comfort Payment** |

The "before" numbers were a 0% mortgage. The "after" numbers are identical to the all-defaults case, which is oracle-verified as R-1.

## 16. Independent oracle verification of each intentional change

Every changed value was re-derived by `tests/oracle/reference_model.py` from the post-change inputs — **56 fields across the 4 cases** (PITI, cash to close, max price and binding constraint for each surviving program scenario). **All matched.** Only then was `tests/baseline/edge-inputs-baseline.json` updated, and the file records the four changes and their justification inline. No unrelated expected value was touched.

## 17. Final disposition — concession before an offer price

**Owner: Property Scenario. Fields: `offer_concession_value` + `offer_concession_unit`** — a canonical `(value, unit)` pair, as §16 requires.

Reasoning: the concession ask is an authored property-level intent that exists whether or not a price is on the table. Phase 2 §8 requires a `negotiation_round` to carry a `price`, so a round cannot hold a pre-price ask without inventing a fake price. The scenario owns the current authored pair; once an offer price exists, round 1 carries the same pair alongside the price. Gate C maps `offer_concession_*` to the scenario table and the round's copy to `negotiation_round`.

**Nothing is resolved against a price that does not exist.** `resolve()` now returns `concession_resolvable`, false when neither an offer price nor a list price exists. Test P4-4: a `2%` concession in Shopping Mode is retained as value 2, unit `percent`, `resolvable: false`, and contributes 0 to the engine — **retained, not converted to zero**.

## 18. Final disposition — negotiation mode before a round exists

**Owner: Property Scenario. Field: `negotiation_mode`** — first-class scenario state, not a placeholder. It is the advisor's current strategy for this property. Each `negotiation_round` keeps its own `negotiation_mode` as a snapshot of the mode in force when that round was authored, exactly as Phase 2 §8 specifies. No fake round is created to hold a selection.

## 19. Temporary / pending fields removed or renamed

| Gate B.5 name | Gate B.75 name | Status |
|---|---|---|
| `pending_negotiation_mode` | `negotiation_mode` | Renamed — first-class scenario state |
| `pending_concession_value` | `offer_concession_value` | Renamed — first-class scenario state |
| `pending_concession_unit` | `offer_concession_unit` | Renamed — first-class scenario state |

Test P4-1 asserts no `pending_` field name remains anywhere in the model.

## 20. Tests for both edge cases

| Test | Assertion |
|---|---|
| P4-2 | A concession authored with no offer price is kept as a canonical pair on the scenario, with zero rounds |
| P4-3 | It resolves against the list price when one exists and is flagged resolvable |
| P4-4 | A percentage with no price at all is retained and marked **not** resolvable — not zeroed, not lost |
| P4-5 | All four negotiation modes selected before any round survive as scenario state and reach the engine (4 assertions) |
| P4-6 | Once a price exists, the round carries price + concession and snapshots the mode, while the scenario keeps the authored pair |

## 21. Exact `result_summary` contract

> The authoritative historical record is **canonical inputs + assumption-set version + engine version**. The recommendation is always **recomputed** from those. `result_summary` exists only as a convenience cache for list views. It is never restored into canonical state, never feeds a calculation, and on any disagreement the recomputation wins.

Cached fields: `recommended_program`, `recommended_scenario_dp`, `piti`, `cash_to_close`, `binding_constraint`, `price`, `max_price`, `assumption_set_version`, `engine_version` — each stamped `cache_only: true, authoritative: false`.

## 22. Mechanical enforcement implemented

Three mechanisms, all in `BSEModel`:

1. **`apply()` deletes any incoming `result_summary`** before restoring. A cached summary structurally cannot enter canonical state.
2. **`buildResultSummary()`** always constructs the summary from a **fresh** `Engine.run` over `toInputs(capture())`. It never reads a stored value.
3. **`loadWithRecompute(saved)`** is the load contract: it strips the cache, applies canonical state, recomputes, and returns `{result_summary: recomputed, cache_discarded, cache_agreed_with_recompute, authoritative_source: 'recomputed'}`. The discarded cache is reported for observability and cannot win.

`BSEModel.RESULT_SUMMARY_AUTHORITATIVE` is exported as `false` so a future session cannot assume otherwise. **No database code was written.**

## 23. Stale-cache test and result

Test P5-2/P5-3/P5-4, on the R-12 regression shape (price $400,000, 20% down, $120,000 funds — a real scenario whose true winner is Conventional). The saved record carries a deliberately false cache:

```
cached:     recommended_program = fha,  piti = $2,000,  binding = "Nonsense"
recomputed: recommended_program = conv, piti = $1,255.14, binding = "Cash to Close"
```

`loadWithRecompute` returned the **recomputed Conventional result**, reported `cache_agreed_with_recompute: false`, and `result_summary` was absent from canonical state afterwards. A direct `Engine.run` on the restored state produced the same Conventional figures — the cache had no influence on the engine either.

## 24. Confirmation recomputation always wins

Confirmed by P5-2 through P5-5. The cache is discarded before restore, the summary is rebuilt from a fresh engine run, and disagreement is reported rather than silently accepted.

## 25. Confirmation cached `bestOverall` is non-authoritative

Confirmed. The cached winner is deleted on load and the recommendation is recomputed by `Engine.pickBestOverall` from restored canonical inputs. Recommendation logic was not rewritten and the Gate B.5 disposition stands: where Phase 2 documents a legitimate near-tie or hierarchy ambiguity, no attempt was made to force a "correct" winner. A historical cached winner can never drive a current calculation.

## 26–30. Suite results

| Suite | Result |
|---|---|
| Permanent numerical regression (68 executable units) | **68 / 68**, 0 fail, 1 not executable · 4,000 verified + 1,157 review fields |
| Gate A M-1 | **80 / 80** |
| Gate B canonical state | **22 / 22** |
| Gate B.5 C-4b presentation integrity | **64 / 64** |
| Gate B.5 model authority (incl. 33-case edge sweep) | **12 / 12** |
| Cross-tool R-47 | **4 / 4** |

## 31. New Gate B.75 tests

`tests/persistence-contract.test.js` — **40 assertions, 40 pass**: P1 one source of truth (5), P2/P3 blank inheritance and authored-vs-resolved (18), edge sweep against the frozen baseline (1 covering all 33), P4 reconciled scenario fields (9), P5 `result_summary` non-authority (6), plus a no-JS-errors check.

## 32 & 33. Total assertions and failures

**290 assertions · 0 failures.**

## 34. Confirmation calculation mathematics not changed

Confirmed. 40 calculation, negotiation, gap-solver, counteroffer and rendering functions extracted and byte-compared against the Gate B.5 file: **none changed**. Against the pre-Phase-3 baseline `540ccbe`, only three differ across the whole of Phase 3 — `setUnit` (Gate A), `updateInlineHints` (Gate B.5) and `gatherInputs` (Gate B.5) — none of which is a calculation formula. The `Engine` IIFE (lines 526–1060) is byte-identical across `540ccbe`, A, B, B.5 and B.75: MD5 `014e065f005530b2ab25de810e46510b`.

## 35. Confirmation `maxPriceForScenario` not changed

Confirmed. Byte-identical to `540ccbe`.

## 36. Confirmation buydown ratio remains 0.25

Confirmed at all five engine sites and in the frozen `2026.07-baseline` assumption set. Staging's 0.24 was not adopted or referenced.

## 37. Confirmation FL tax not integrated

Confirmed. No millage, assessed value, homestead, Save Our Homes or portability logic. Shopping Range remains flat-rate. `qualifying_tax_basis` is carried and consumed by nothing.

## 38–40. Protected file MD5s

| File | MD5 | Status |
|---|---|---|
| `Tools/Live/property-tax.html` | `1cd00523ad5845942ec6e812538b6312` | unchanged |
| `Tools/Live/buyer/comfort-calculator.html` | `772de6d1e3d6b3182049af6a7bcebedd` | unchanged |
| `Tools/Staging/buyer-strategy-v2/index.html` | `01830ac60b3ec9c1db4a73ce76201f2f` | unchanged |

Production BSE: `90bcc96f62feb7f90c34c8407ddeacd0`.

## 41. Current git status

Clean — no modified, staged, or untracked files.

## 42. Current branch

`phase3/gate-b75-persistence-contract`

## 43. Known limitations

1. **A blank insurance, target, income or debts field still resolves to 0**, not to a default — the assumption set defines no default for them, and inventing one would be a calculation decision. Only rates and the closing-cost percent have assumption-set defaults, and only those two inherit.
2. **`num()` still coerces** (M-4): a blank credit score still becomes 300. Unchanged and still a Gate C item.
3. **The floating `%` concession base (M-13) is unchanged.** `concession_resolvable` now makes the *unresolvable* state explicit, but the re-basing behaviour when a price appears later is untouched.
4. **Shopping-Mode unit reinterpretation is unchanged** — the other half of C-4a.
5. **PMI band `c` (85–90) is still unreachable** — no 15%-down tier exists.
6. **`BSEModel.capture()` still runs on every `recalc()`**, roughly six times per keystroke. Correct but unbatched; the natural home for M-8's debounce at Gate C.
7. **1,157 review fields remain change-detected rather than independently verified** — rendered prose, elimination wording, `bestOverall` selection. The Gate B.5 disposition stands.
8. **No human validation.** Headless only — no click-through, no iPad or phone check, no live buyer call.
9. **The git device-bridge lock limitation persists.**

## 44. Remaining persistence-contract ambiguity

1. **Round-versus-scenario concession precedence.** Today both hold the same pair because both derive from one input. Once Gate C can author multiple rounds, the rule "the scenario holds the current ask, each round holds its own historical ask" needs to be enforced in the UI, not just in the model.
2. **`negotiation_round.price` is still required.** The scenario now holds a pre-price ask, so nothing is lost — but Gate C should decide explicitly whether a round may ever exist without a price, or whether round creation is always gated on one.
3. **`result_summary` staleness has no timestamp comparison.** `loadWithRecompute` reports agreement or disagreement; it does not reason about *why* (a newer assumption set versus a genuine mismatch). With `assumption_set_version` and `engine_version` already on the summary, that check is cheap to add when persistence exists.
4. **No schema-level guard yet** that a future writer cannot persist a resolved value into an authored column. The model keeps them distinct; the database will need a constraint or a mapping convention to keep it that way.

## 45. What should block or shape Gate C

1. **Map authored NULL to database NULL, deliberately.** The whole blank-inheritance contract depends on it. A resolved default written into an authored column would silently freeze today's 6.750 into a buyer's record forever.
2. **Enforce the non-authoritative `result_summary` rule at the persistence boundary too** — the model enforces it now; the writer must not reintroduce it.
3. **Decide the round-price question** (§44 item 2) before the negotiation UI is built.
4. **Debounce autosave off the `recalc` path** (M-8), now more relevant given the capture on every recalculation.
5. **`analysis_mode` must be set deliberately on migration** (M-5), never derived from a null price.
6. **Adding a Supabase client costs the offline property** (M-10) — name the trade before making it.
7. **Run Gate C on the computer, not in a cloud session.**
8. **Phone viability is still unvalidated** (M-16 / L-12).

---

## GATE C READINESS — against the stated standard

| Requirement | Status |
|---|---|
| M-1 remains resolved | **Yes** — 80 / 80 |
| C-4b remains resolved | **Yes** — 64 / 64 |
| `BSEModel` is the sole authoritative economic state | **Yes** — P1-3, P1-4 |
| `__legacyGatherInputsFromDom` is gone | **Yes** — asserted against the shipped source |
| No alternate DOM-only economic path exists | **Yes** — one `gatherInputs`, and it delegates |
| Blank authored values inherit defaults correctly | **Yes** — rates and closing-cost percent |
| Explicit zero remains distinct from blank | **Yes** — tested both ways, and across a round trip |
| Concession-before-price represented without loss | **Yes** — canonical pair + `concession_resolvable` |
| Negotiation-mode-before-round represented without loss | **Yes** — first-class scenario state |
| Temporary pending fields reconciled | **Yes** — renamed, ownership explicit, no `pending_` remains |
| `result_summary` mechanically non-authoritative | **Yes** — stripped on apply, rebuilt on load, exported as `false` |
| Recompute always wins | **Yes** — stale-cache test |
| Permanent regression green except verified intentional changes | **Yes** — 68/68; the 4 intentional changes are in the edge sweep, oracle-verified |
| No protected calculation mathematics changed | **Yes** — engine byte-identical |
| No unresolved issue could cause Supabase to persist incorrect or ambiguous state | **Yes**, subject to the four items in §44 |

---

## GATE B.75 COMPLIANCE STATEMENT

- The Gate B.5 baseline was verified independently before any work began.
- The legacy DOM reader was inventoried, confirmed callerless, then removed; its absence is asserted on every run.
- Blank inheritance follows the locked Phase 2 hierarchy, reads its defaults from the assumption set alone, and preserves the authored-versus-resolved distinction.
- The four intentional numerical changes were identified, shown before and after, traced to the inherited assumption, and **independently re-derived by the oracle before any expected value was updated**. No unrelated expected value changed.
- Both pending fields were reconciled into first-class Property Scenario state with explicit ownership and an obvious Gate C mapping.
- `result_summary` is mechanically non-authoritative, proven with a deliberately false cache on a real regression scenario.
- No calculation function, program constant, recommendation logic or `maxPriceForScenario` was modified.
- `property-tax.html`, `buyer/comfort-calculator.html` and the Staging BSE are unchanged and were not used as references.
- **Gate C has not begun.**

---

*Prepared for Doug Smith, President & Broker, CMA® · HomeWealth Solutions LLC · NMLS #2742458 · FL OFR Mortgage Broker License #MBR8082 · doug@homewealthsolutions.com · 813-733-7371*
