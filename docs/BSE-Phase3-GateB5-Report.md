<!--
BUYER STRATEGY ENGINE — PHASE 3, GATE B.5 REPORT
File: docs/BSE-Phase3-GateB5-Report.md
Status: Gate B.5 COMPLETE — stopped for Doug's review. Gate C NOT started.
Origin: Cowork session of 2026-07-28.
Companion documents: BSE-Project-Status.md, BSE-Phase0-1-Forensic-Audit.md,
BSE-Phase2-Architecture.md, BSE-Phase3-GateA-Report.md, BSE-Phase3-GateB-Report.md
-->

# BUYER STRATEGY ENGINE — PHASE 3, GATE B.5
## Pre-Persistence Hardening — Completion Report

**HomeWealth Solutions LLC** · Company NMLS #2742458 · FL OFR Mortgage Broker License #MBR8082
Prepared for: Doug Smith, President & Broker, CMA®
Date: **July 28, 2026**

Scope executed: verify Gate B → branch → fix C-4b → prove it → cut `gatherInputs()` over to `BSEModel` → prove model authority → classify the 1,532 review fields → verify or disposition the persistence-critical subset → define a safe `result_summary` → full regression → report → **STOP**.

**Gate C was not started.** No Supabase, authentication, RLS, database, cloud persistence, save/load, or `result_summary` caching. No FL millage. No Comfort Calculator change. No UI redesign.

---

## 1. Gate B.5 branch

`phase3/gate-b5-pre-persistence-hardening`, created from the approved Gate B HEAD and confirmed checked out before any tracked source was edited.

## 2. Starting Gate B commit

`c356587` — verified independently: branch, HEAD, clean tree, no residual locks, all five controlling documents present, the regression harness and oracle present, `BSEModel` present in source, Gate A M-1 suite intact, and the three protected MD5s unchanged.

## 3. Ending commit

`dadc5a2` — "Gate B.5 — C-4b fix + gatherInputs cutover to BSEModel". Working tree clean.

## 4. Files changed

| File | Change |
|---|---|
| `internal/buyer-strategy/index.html` | Modified. `f8b2b9b5…` → `1f4cde6c104c5d77db5634eac0efff05` |
| `tests/c4b-presentation-integrity.test.js` | **Added** — 64 assertions |
| `tests/model-authority.test.js` | **Added** — 12 assertions incl. a 33-case edge sweep |
| `tests/classify-review-fields.py` | **Added** — Stage 5/6 classification and verification |
| `tests/oracle/reference_model.py` | Extended — `interest_paid`, `horizon_costs`, `post_cancel_piti` |
| `tests/build-expected-baseline.py` | Extended — promotes the three horizon/post-cancel fields to VERIFIED |
| `tests/baseline/bse-expected-baseline.json` | Revised — R-43 rendered block; 375 fields promoted |
| `tests/scenarios/bse-regression-scenarios.json` | R-43 annotated as resolved |

## 5. C-4b failure path before the fix

`recalc()` called `gatherInputs()` at its first line and `updateInlineHints()` roughly twenty lines later. `updateInlineHints` contained:

```js
const on=$(na).checked;
$(f).disabled=on;
if(on) $(f).value='0';     // <- presentation mutating an economic input
```

So with a typed HOA and the N/A box ticked, the sequence was: `gatherInputs` reads **$250** → the engine runs and the whole page renders from $250 → `updateInlineHints` then overwrites the field with `'0'`. The screen showed numbers derived from an assumption the DOM no longer held, and every subsequent read used 0. The typed value was gone permanently — un-ticking did not restore it.

For persistence this is the dangerous shape: a capture takes the DOM (`0`), a restore replays `0`, and the restored result differs from what was on screen when the advisor made the call. Supabase would have faithfully saved the wrong economic assumption.

## 6. R-43 reproduction before the fix

Captured on the Gate B file, price $400,000, HOA $250, N/A ticked:

| | Before the fix |
|---|---|
| DOM `#hoa` after render | `0` |
| Value the render used | **$250** |
| FHA 3.5% card | **$3,398/mo PITI, +$198/mo over target** |
| Gap Solver | *"PAYMENT IS TOO HIGH… a seller concession of **$11,783** applied to a rate buydown buys 3.00 pts → 6.250%→5.500%"* |
| Engine's own scenario objects | computed with HOA 0 |

**The tool proposed an $11,783 seller concession to close a $198/mo gap that did not exist.** That is the concrete cost of the defect, and it was visible before persistence was ever introduced.

## 7. Exact C-4b implementation

Smallest correction consistent with the canonical architecture — two edits, no formula change:

1. **`updateInlineHints` became presentation-only.** The `if(on) $(f).value='0';` write was removed. The field is still disabled and relabelled "Confirmed N/A"; the typed value survives.
2. **The N/A confirmation became the authoritative economic statement** in `gatherInputs`:

```js
hoa:   $('hoaNA').checked   ? 0 : num('hoa'),
cdd:   $('cddNA').checked   ? 0 : num('cdd'),
flood: $('floodNA').checked ? 0 : num('flood'),
```

This is where the destroyed `'0'` used to come from. The canonical model already modelled this correctly — `costField()` returns `{monthly: null, status: 'confirmed_none'}` — so the DOM path was brought in line with the model rather than the other way round.

Direction is now **canonical economic state → calculation → presentation**, never presentation → silent mutation.

## 8. Exact functions changed for C-4b

`updateInlineHints` and `gatherInputs`. Nothing else.

## 9. C-4b test results

`tests/c4b-presentation-integrity.test.js` — **64 assertions, 64 pass**:

- **Render idempotence across all 68 scenarios.** Two consecutive `recalc()` calls with no input change must produce byte-identical output, economic inputs and DOM. Under the defect this failed; it is the general detector for "presentation mutated something".
- **11 field cases** — HOA / CDD / flood with N/A both ways, insurance, tax as % , a tax rate above the 15% warning threshold, down-payment target, seller concession. Each asserts: the DOM still holds what was typed after render + hints; the calculation used the intended value; capture → restore → recalculate preserves both the economic inputs and the rendered result; the DOM survives the round trip.
- **N/A reversibility** for all three fields: ticking zeroes the economics without destroying the value; un-ticking restores it — behaviour that was impossible before.

**The suite has teeth:** run against the pre-fix Gate B file it produces **15 failures**; against the fixed file, 0.

## 10. R-43 after the fix

| | After |
|---|---|
| DOM `#hoa` | **`250`** — preserved |
| Economic contribution | **0** — the N/A confirmation governs |
| FHA 3.5% card | **$3,148/mo, −$52/mo under target ✓** |
| Gap Solver | *"FHA 3.5% already lands at $3,148/mo — at or under the $3,200 comfort target. No payment gap to solve."* |
| Capture → restore | **Exact.** The Gate B model-level exception is withdrawn |

The frozen baseline's R-43 `rendered` block was updated and the change is recorded in `baseline_revisions` inside the baseline file itself. **No `EXPECTED VALUE VERIFIED` field changed in any case** — the correction touched only a rendered block that had been internally inconsistent.

## 11. `gatherInputs()` before the cutover

Read 32 DOM elements directly and derived inline: the dp-target object, the tax mode, the concession base, the negotiating room. The DOM was the authoritative economic source; `BSEModel` was a parallel representation proven lossless but not in the live path.

## 12. `gatherInputs()` after the cutover

```js
function gatherInputs(){
  // UI -> canonical model -> L-1 resolution -> engine input.
  // BSEModel is the authoritative economic state; the DOM is an interface.
  return BSEModel.toInputs(BSEModel.capture());
}
```

The previous body is retained as `__legacyGatherInputsFromDom()`, marked **verification only**, with **zero callers in the application**. It exists so the cutover can be proved equivalent and is scheduled for deletion at Gate C.

## 13. Exact `BSEModel` source-of-truth flow

```
user edits an input
        ↓
BSEModel.capture()          Buyer Profile · Shopping Plan · Property ·
        ↓                   Property Scenario · negotiation rounds ·
BSEModel.resolve()          UI state (separate) · canonical (value, unit) pairs
        ↓                   L-1: scenario ?? plan ?? assumption set ?? default
BSEModel.toInputs()             — in memory, never written back
        ↓
gatherInputs()  →  Engine.run()  →  render  →  inline hints (presentation only)
```

Restore runs the same path in reverse: `BSEModel.apply()` → `applyState()` (Gate A, no toggle handlers) → UI derived from canonical state → `recalc()`.

## 14. Functions changed for the cutover

`gatherInputs` (replaced by the resolver; old body renamed), `captureShoppingPlan` (blank-input normalisation preserved), `capturePropertyScenario` (two pending fields added), `toInputs` (concession source and negotiation-mode fallback).

**What moved, and what stayed** — as required:

| Behaviour | Where it lives now |
|---|---|
| Unit interpretation, three-state costs, L-1 inheritance | **Moved** into `BSEModel` |
| dp-target object shape, tax mode derivation, concession base, negotiating room, score clamp, `funds = own + gift` | **Preserved** in `toInputs`, identical arithmetic |
| Blank rate / blank closing-cost percent → **0**, not "inherit the assumption set" | **Preserved deliberately.** The architecture would have a blank field inherit 6.750 / 3.00; adopting that is a real improvement and a behaviour change, so it belongs to Gate C with its own approval, not to a cutover that must be numerically neutral |
| A concession entered **before** any offer price | New `pending_concession_value` / `pending_concession_unit` on the Property Scenario. Phase 2 §8 requires a `negotiation_round` to carry a price, so the pre-round entry is held here and superseded by round 1 the moment an offer price exists. **Gate C should reconcile this with the round schema** |
| Negotiation mode selected before any round exists | New `pending_negotiation_mode`, same reasoning |

The last two were **found by the edge sweep, not by the 47 scenarios**: with a list price and a concession but no offer price, the model returned `sellerConcession = 0` while the DOM reader returned `$5,000`. Caught before the cutover shipped.

## 15. Confirmation the DOM is no longer authoritative

`gatherInputs()` contains no DOM read. Proved by interception in test MA-1: temporarily replacing `BSEModel.toInputs` makes `gatherInputs()` return the replacement's marker, so the dependency is real rather than incidental. The DOM is read only by `BSEModel.capture()`, which is the single point where the interface is converted into canonical state.

## 16. Capture / restore flow

`BSEModel.capture()` records canonical `(value, unit)` pairs, three-state cost fields, and an explicit `analysis_mode` — not display strings. Test MA-4 asserts a $87,400 dollar-unit down payment, a $6,347 annual-dollar tax entry and a `confirmed_none` HOA are all captured in canonical form.

`BSEModel.apply()` repopulates the model first, then derives the interface from it — units, values and N/A state. Test MA-5 wipes the entire interface, restores, and finds the model, the economic inputs, the rendered output, the unit toggles and the DOM values all identical.

## 17. Inheritance test results

Test MA-6/MA-7 (and Gate B's C5, still passing): a Property Scenario override of tax rate, target payment, buyer priority and HOA resolves correctly and reaches the engine, while the Shopping Plan and Buyer Profile are **byte-identical before and after** — L-1 holds through the cutover.

## 18. Unit handling test results

Gate A suite: **80 / 80**. Test MA-9: three full round trips on three fields (`3.375%`, `1.205%`, `2.75%` at a $437,000 price) produce **zero drift**. Test C10 (Gate B suite): restore into a contaminated session preserves `$87,400` and `$6,347` unconverted. The canonical pairs are unchanged — `dp_target_value` + `dp_target_unit`, `concession_value` + `concession_unit`, and tax as `tax_rate_pct` / `tax_annual_amount` / `tax_input_unit`, **not consolidated**.

## 19. Numerical regression results

**68 / 68 executable cases pass. 0 fail. 1 not executable (R-13d).** Now checking **4,000 `EXPECTED VALUE VERIFIED` fields** and 1,157 review fields per run.

## 20. Gate A M-1 results

**80 / 80 pass.**

## 21. Gate B canonical-state results

**22 / 22 pass.**

## 22. Cross-tool results

**4 / 4 pass.** R-47 still reproduces the audit's published C-6 figures exactly: $524,047 / $399,080 / $408,709 / $115,338.

## 23. New Gate B.5 test results

| Suite | Result |
|---|---|
| `c4b-presentation-integrity.test.js` | **64 / 64** |
| `model-authority.test.js` | **12 / 12**, including 68 scenarios and 33 edge cases |

## 24. Total assertions and failures

| Suite | Assertions |
|---|---|
| Permanent numerical regression | 68 cases (4,000 verified + 1,157 review fields) |
| C-4b presentation integrity | 64 |
| Canonical application state | 22 |
| BSEModel source of truth | 12 |
| Gate A M-1 | 80 |
| R-47 cross-tool | 4 |
| **Total** | **250 assertions · 0 failures** |

## 25 & 26. Classification of the 1,532 review fields

| Cat | Meaning | Count | Contents |
|---|---|---|---|
| **A** | Persistence-critical decision outputs | **130** | `bestOverall` (62 cases), `eliminated` (68 cases) |
| **B** | Calculation outputs not currently persistence-critical | **625** | `miCostHorizon` 125, `postCancelPITI` 125, `conc`, `frontFlag`, `requiresGift` |
| **C** | Recommendation / winner / threshold outputs | **187** | `totalCostHorizon` 125 (the primary sort key above a 7-year stay), `priorityPick` 62 |
| **D** | Bisection / solver outputs | **68** | `concessionToCloseGap`, `additionalForPayment`, `optimalRestructure` — **a subset of E, not a separate 68.** They have no baseline field of their own; they surface only inside rendered output, so this is the count of cases where a solver surface is populated |
| **E** | Rendered prose / display text | **568** | the `rendered` block per case (62), plus `miMode`, `feeLabel`, `label`, `name` |
| **F** | Other / requires an architectural decision | **22** | `dpDimmed` — a display decision with no documented specification |

A + B + C + E + F = **1,532**. D overlaps E and is reported separately so the category is not silently empty.

## 27. Persistence-critical fields identified

Using Phase 2 §7 as controlling — `result_summary` is *"Recommended program, PITI, cash to close, binding constraint"*:

| Field | Category | Why |
|---|---|---|
| `bestOverall` (recommended program / winning scenario) | A | It *is* the stored recommendation |
| `eliminated` (program elimination reasons) | A | Named persistence-critical in the authorization; regex-parsed downstream |
| `totalCostHorizon` | C | Decides the winner above a 7-year stay |
| `priorityPick` | C | Drives which family card is starred |
| `piti`, `cashToClose`, `binding`, `maxPrice`, `price` | — | Already `EXPECTED VALUE VERIFIED` since Gate B |

## 28. Persistence-critical fields verified in this gate

| Field | Method | Result |
|---|---|---|
| `totalCostHorizon` | Oracle now derives it from the audit §2.4 definition — interest paid + MI cost + financed fee over the planned stay, principal excluded | **125 / 125 match. Promoted to VERIFIED** |
| `miCostHorizon` | Same derivation | **125 / 125 match. Promoted to VERIFIED** |
| `postCancelPITI` | Derived from the documented per-program MI-cancellation rule: `piti − monthlyMI` where MI drops, `piti` where it never does | **125 / 125 match. Promoted to VERIFIED** |
| `eliminated` — the gating set | Derived independently from the documented rules (VA gated by the toggle; Conv below 620; Conv 3% requires FTHB; FHA emits nothing below 500) | **68 / 68 cases match** |

The baseline moved from **3,625 verified / 1,532 review** to **4,000 verified / 1,157 review**, with **0 discrepancies**. No expected value changed numerically; the three promoted fields now carry the oracle's derived value instead of the captured one.

## 29. Persistence-critical fields still unverified — and the disposition

**`bestOverall` and `priorityPick` cannot be fully derived independently, and should not be persisted as authoritative.**

I implemented the documented decision hierarchy as far as it is specified — the reserve-preference floor, the comfort pool, and the primary metric by planned stay. Of 62 cases: **40 unambiguous and matching, 19 inside the documented near-tie window** (where audit §2.7 records the comparator as non-transitive and order-dependent, so no single "correct" winner exists), and **3 that depend on stage 1's cash-preservation payback computation and stage 5's tiebreak cascade** — neither specified precisely enough in the audit to reimplement without reading the engine's own code, which would make the check circular.

**This is not a blocker, because Phase 2 already resolved it.** §7 states program scenario results *"are regenerated by the Engine from the stored inputs on every open"* and `result_summary` is *"explicitly non-authoritative — if it ever disagrees with a recomputation, the recomputation wins"*, which is migration risk **M-3**. So the selection is safe to cache **provided Gate C never reads it back into a calculation**. Every number the selection is made from is now verified.

## 30 & 31. Proposed `result_summary` field set and its verification status

Readiness decision only — nothing was implemented.

| Field | Source | Status |
|---|---|---|
| `recommended_program` | `bestOverall.id` | **DERIVED FROM VERIFIED VALUES** — selection logic not independently reproducible; safe only as a non-authoritative cache |
| `recommended_scenario_dp` | `bestOverall.dp` | Same |
| `piti` | scenario | **VERIFIED** |
| `cash_to_close` | scenario | **VERIFIED** |
| `binding_constraint` | scenario | **VERIFIED** |
| `price` / `max_price` | scenario | **VERIFIED** |
| `computed_at`, `assumption_set_version`, `engine_version` | metadata | **VERIFIED** (provenance, not a calculation) |
| Elimination **reason strings** | `eliminated[].reason` | **NOT SAFE TO PERSIST YET** — prose, regex-parsed downstream. Persist the structured cause and the program id; regenerate the sentence |
| Any Gap Solver or Counteroffer figure | rendered | **NOT SAFE TO PERSIST YET** — see §32 |
| Rendered prose of any kind | rendered | **NOT SAFE TO PERSIST YET** — see §33 |

Rule to carry into Gate C: `result_summary` is a list-view cache. It is written on save, never read into a calculation, and is discarded on any disagreement with a recomputation.

## 32. Recommendation for solver outputs

**Persist neither the bisection internals nor `optimalRestructure`'s split.** Persist the canonical inputs and the `assumption_set_id`, and recompute — which is exactly Phase 2 §11's reproducibility architecture. The solvers are deterministic given inputs plus assumption set, so storing their internals adds a second source of truth (M-3) and buys nothing. If a headline solver *result* is ever needed for a list view, it belongs in `result_summary` under the same non-authoritative rule.

## 33. Recommendation for rendered prose

**Do not persist prose.** Persist the structured decision fields and regenerate the sentence. Two reasons beyond Phase 2's general preference: the elimination strings are regex-parsed downstream, so stored wording would become a compatibility surface; and prose regenerated from stored inputs stays correct when copy changes, whereas stored prose silently becomes historical fiction.

## 34. Confirmation — calculation mathematics not changed

Confirmed. 41 named calculation, negotiation, gap-solver and counteroffer functions extracted and byte-compared against the Gate B file: **none changed**. The `Engine` IIFE (lines 526–1060) is byte-identical across `540ccbe`, Gate A, Gate B and Gate B.5 — MD5 `014e065f005530b2ab25de810e46510b` at all four points. The only functions modified in this gate are `updateInlineHints`, `gatherInputs`, and three `BSEModel` capture/resolve helpers.

## 35. Confirmation — `maxPriceForScenario` not changed

Confirmed. Byte-identical to `540ccbe`.

## 36. Confirmation — buydown ratio remains 0.25

Confirmed at all five engine sites and in the frozen `2026.07-baseline` assumption set. Staging's 0.24 was not adopted or referenced.

## 37. Confirmation — FL tax not integrated

Confirmed. No millage, assessed value, homestead, Save Our Homes or portability logic. `tax_method` remains a carried discriminator; Shopping Plans stay `flat_rate`; `qualifying_tax_basis` is stored and consumed by nothing.

## 38–40. Protected file MD5s

| File | MD5 | Status |
|---|---|---|
| `Tools/Live/property-tax.html` | `1cd00523ad5845942ec6e812538b6312` | unchanged |
| `Tools/Live/buyer/comfort-calculator.html` | `772de6d1e3d6b3182049af6a7bcebedd` | unchanged |
| `Tools/Staging/buyer-strategy-v2/index.html` | `01830ac60b3ec9c1db4a73ce76201f2f` | unchanged |

Production BSE: `1f4cde6c104c5d77db5634eac0efff05`.

## 41. Current git status

Clean — no modified, staged, or untracked files.

## 42. Current branch

`phase3/gate-b5-pre-persistence-hardening`

## 43. Known limitations

1. **`__legacyGatherInputsFromDom()` still exists.** Read-only, zero callers, retained solely for the equivalence proof. It must be deleted at Gate C, and its equivalence tests retired with it.
2. **Blank rate / blank closing-cost percent still resolve to 0**, not to the assumption-set default. Behaviour-preserving on purpose; a Gate C decision.
3. **`pending_concession_value` / `pending_negotiation_mode` are Gate B.5 additions** not in the Phase 2 schema. They exist because the UI can express a concession or a mode before a `negotiation_round` exists. Gate C must reconcile them with §8.
4. **`bestOverall` / `priorityPick` remain independently underivable** (§29). Safe only as a non-authoritative cache.
5. **PMI band `c` (85–90) is still unreachable** — no 15%-down tier exists.
6. **`num()` still coerces** (M-4): a blank credit score still becomes 300.
7. **The floating `%` concession base (M-13) is unchanged.**
8. **Shopping-Mode unit reinterpretation is unchanged** — the other half of C-4a.
9. **A full `BSEModel.capture()` now runs on every `recalc()`**, which the audit measured at roughly six engine runs per keystroke. No debounce was added; it is additional DOM scanning on an already-unbatched path. Not a correctness issue, but it is the natural place for M-8's debounce work at Gate C.
10. **No human validation.** Headless only — no click-through, no iPad or phone check, no live buyer call.
11. **The git device-bridge lock limitation persists.**

## 44. What should block or shape Gate C

1. **Delete the legacy reader** as the first Gate C commit, once its equivalence tests have run one final time.
2. **Enforce the non-authoritative rule mechanically.** `result_summary` should be written on save and never read into a calculation. Consider a naming convention or a lint rule so a future session cannot quietly start trusting it (M-3).
3. **Decide the blank-input inheritance question** (§43 item 2) before persistence, not after — once blanks are saved, the semantics of a stored NULL matter.
4. **Reconcile the two pending fields** with the `negotiation_round` schema.
5. **Debounce autosave off the `recalc` path** (M-8), now more relevant given item 9.
6. **`analysis_mode` must be set deliberately on migration** (M-5), never derived from a null price. The model now carries it explicitly.
7. **Adding a Supabase client costs the offline property** (M-10) — a deliberate trade worth naming before it is made.
8. **Run Gate C on the computer, not in a cloud session.**
9. **Phone viability is still unvalidated** (M-16 / L-12).

---

## GATE C READINESS — against the stated standard

| Requirement | Status |
|---|---|
| C-4b resolved | **Yes** — 64 assertions, 15 failures on the pre-fix file |
| M-1 remains resolved | **Yes** — 80 / 80 |
| `BSEModel` is the authoritative economic source | **Yes** — proved by interception |
| `gatherInputs()` consumes canonical model state | **Yes** — equivalent on 68 scenarios and 33 edge cases |
| DOM presentation cannot silently corrupt canonical state | **Yes** — render idempotence across all 68 |
| Numerical regression green | **Yes** — 68 / 68, 4,000 verified fields |
| Persistence-critical review fields verified or removed from scope | **Yes** — 375 promoted to VERIFIED; the selection fields explicitly scoped as non-authoritative cache |
| `result_summary` has a defined, safe field set | **Yes** — §30, readiness decision only |
| No protected calculation mathematics changed | **Yes** — engine byte-identical |
| No unresolved issue could cause Supabase to persist incorrect economic state | **Yes**, subject to the four Gate C items in §44 |

---

## GATE B.5 COMPLIANCE STATEMENT

- The Gate B baseline was verified independently before any work began.
- C-4b was documented, reproduced, fixed with the smallest correction, and proved with a suite that fails on the pre-fix file.
- The `gatherInputs()` cutover is numerically neutral and was proved on the 47 scenarios **and** on 33 edge cases outside them, which is where its two real defects were caught.
- No calculation function, program constant, recommendation logic or `maxPriceForScenario` was modified.
- No expected value was adjusted to make a suite pass. The one baseline revision — R-43's rendered block — is recorded inside the baseline file with its justification, and no verified field changed.
- `property-tax.html`, `buyer/comfort-calculator.html` and the Staging BSE are unchanged and were not used as references.
- No Supabase, authentication, RLS, persistence, save/load, `result_summary` caching, FL millage integration, Comfort Calculator change or UI redesign was performed or started.
- **Gate C has not begun.**

---

*Prepared for Doug Smith, President & Broker, CMA® · HomeWealth Solutions LLC · NMLS #2742458 · FL OFR Mortgage Broker License #MBR8082 · doug@homewealthsolutions.com · 813-733-7371*
