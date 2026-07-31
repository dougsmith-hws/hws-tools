# BUYER STRATEGY ENGINE — PHASE 4 IMPLEMENTATION REPORT
## UI / Decision Support — Answer-First Redesign

**HomeWealth Solutions LLC** · Company NMLS #2742458 · FL OFR Mortgage Broker License #MBR8082
Owner: Doug Smith, President & Broker, CMA®
Date: 2026-07-29
Status: **CODE COMPLETE FOR THE APPROVED SUBSET — AWAITING MANUAL VALIDATION. NOT DEPLOYED.**

---

## 1. HEADLINE

| | |
|---|---|
| Application before | `99a82a680e74953782aa9c2ce1802fc4` (Gate D.1) |
| Application after | `fc9c194fd12a17306fbc9ad9d4a5f16b` |
| **Calculation engine** | **`a6e73d694b462cd10983f8ec59eb5f4f` — UNCHANGED, byte for byte** |
| 47-scenario numerical baseline | **68 / 68 executable cases pass.** 4,000 VERIFIED + 1,157 REVIEW fields, zero drift |
| Assertions before Phase 4 | 438 |
| Assertions now | **597** (+159: engine-freeze 12, dp-solver 55, answer-layer 104, minus overlap) |
| Failures | **0** |
| Regression in a previously verified numerical result | **None.** No STOP condition triggered |

Recalculation cost, measured in-browser: **1.8 ms** in Shopping Range, **2.8 ms** in Property Strategy including a full Fernando solve. The tool does not feel slower in a live call.

---

## 2. WHAT WAS BUILT

### 2.1 · The Fernando solver — `requiredDownForPayment()`

The core deliverable. Answers: *given this price and this target payment, how much down?*

- **Probes `Engine.computeScenario()` on every iteration.** It does not re-derive mortgage mathematics, and it does not invert the `k`/`b` coefficients out of `maxPriceForScenario()`, which would have been faster and would have created a second PITI implementation free to drift from the first.
- Bisects on the down-payment axis, then rounds the answer **up** to the nearest $100 and re-verifies. Rounding up can only lower the payment, so the constraint cannot break.
- Handles the PMI step function (95 / 90 / 85 / 80 LTV) and reports the "one step further" boundary — 20% down for conventional (PMI gone), 10% for FHA (MIP ends at month 132 rather than running for the life of the loan).
- **Says no honestly.** When escrow alone exceeds the target, it returns `feasible: false` with the floor and an explanation, instead of inventing a down payment.
- Reports cash sufficiency, DTI at the solved structure, loan-limit breach, and the revised concession cap (which moves with LTV).

**Fernando, verified end to end:** $461,000 · $3,000/mo target · 740 credit · $11,000 income · $400 debts · $200,000 funds →
**$92,700 down (20.1%), Conventional at 6.750%, PITI $2,999.79, cash to close $103,749, $96,251 left in reserve.**

**Regression coverage — 55 assertions.** The three that matter most:

| Assertion | Why it matters |
|---|---|
| **Round trip** | Feeding the solved down payment back into `Engine.computeScenario()` reproduces the reported payment to the cent. If the solver ever stops calling the engine, this fails |
| **Minimality** | One $100 step *less* down payment overshoots the target. Without this, a solver that always answered "put 100% down" would pass everything else |
| **Monotonicity** | PITI never rises as down payment rises, swept 0–60% in 2.5% steps. This is the property bisection depends on — asserted, not assumed |

Plus: all four PMI boundaries, program gating at credit 590 / 540 / VA on and off, the infeasible case, the already-under-target case, funds shortfall reporting, and side-effect freedom (`gatherInputs()` byte-identical before and after three solves).

### 2.2 · Job 1 — Shopping Range

Three figures, always visible, with the controlling one flagged:

- **Comfort Shopping Max** — what they should shop for at their comfort payment
- **Maximum Purchasing Power** — what they could qualify for at back-end DTI
- **Cash-Limited Buying Power** — shown *always*, labelled "not the limiting factor" when it is not. Part 1 found this was computed in two places and displayed in neither

Then one dark bar: **SHOP UP TO $X**, with a plain-English sentence naming what is controlling and what the next ceiling up is.

### 2.3 · Binding-constraint consolidation

Part 1 found two independent calculations that could disagree. **`maxPriceForScenario()` was not touched.** A new presentation-layer function, `powerCeilings()`, produces the single answer the advisor reads, ranking comfort / DTI / cash / loan limit and naming the lowest. Section 1's legacy limiting-factor line is left exactly as it was, below the fold, so the frozen render captures stay valid.

### 2.4 · The revived buying-power panel

`strategyActionsFor`, `strategyOkCard`, `strategyActionsList` and `powerBadge` were defined in the application and **called from nowhere**. They had never executed.

The defect was real: `strategyActionsFor` destructures a `secondary` that no caller supplied, so every dollar figure derived from it would have rendered as **NaN**. `secondary` is now defined as **the second-lowest ceiling** — the price the buyer reaches once the controlling constraint clears — which is exactly what both consumers mean ("a gift of $X more reaches $Y", "eliminating $X/mo of debt raises qualifying to $Y").

**It was not trusted because it existed.** A 12-profile sweep drives every branch — cash-bound, DTI-bound, comfort-bound, loan-limit-bound, FHA-only, low-credit FHA 10%, VA, FTHB/DPA, gift-funded, dollar down-payment target, full HOA/CDD/flood — and asserts no `NaN`, `undefined`, `Infinity` or `[object Object]` ever reaches the screen, in the answer layer or the goal bar.

### 2.5 · Debt payoff lever

Itemise debts, tick the ones to pay off, choose **at closing** or **before closing**.

Built on the rule that the engine is a pure function of its inputs: a payoff scenario is a **different input**, not a different engine. `Engine.run()` is called unchanged with `debts` reduced and — when paid at closing — `funds` reduced by the balance.

**It is allowed to tell you not to do it.** Worked example now in the suite: $45,000 funds, $16,000 income, a $450/mo car loan with a $32,000 balance. Paying it off at closing raises max qualifying by $72,712 **and drops what the buyer can actually buy by $148,808**, because cash becomes the binding constraint. The tool says, in those words:

> **Do not pay this off at closing.** Freeing $450/mo of debt improves qualifying, but spending $18,000 of cash drops what they can actually buy by $148,808… Cash becomes the binding constraint. Paying it off *before* closing from other funds avoids this.

A change of binding constraint is called out explicitly. Every result carries the guideline caveat: the tool models the **mathematical** impact and declines to reproduce AUS or program-specific debt-exclusion rules.

### 2.6 · Job 2 — Property Strategy

Answer first, in this order: **goal → answer → fit → tradeoff → binding constraint → strategies → negotiation summary.**

**One presentation defect was found and fixed during build.** The first working version showed "Verdict: Feasible" and "⚠️ $606/mo above comfort target" on the same screen. Both were correct — but they described *different structures*: the answer at 20.1% down, the fit at the default lowest-cash structure. Fit and binding constraint are now evaluated against **the same structure the answer proposes**, the structure is named on screen, and the difference is stated as a one-line tradeoff:

> If the buyer would rather keep cash, **FHA 3.5%** needs only **$29,481** to close — $74,268 less — but the payment is **$3,606/mo**, $606/mo above the $3,000 target. The goal structure buys $606/mo of payment for $74,268 of cash.

**Property fit evaluates three things independently**, exactly as instructed. A comfort miss is rendered amber, labelled *"This is a preference, not a qualification limit"*, and never reads as "cannot buy." Asserted in the suite.

**Binding constraint at property level (N-2)** classifies payment / cash / qualification / program / none. Two real bugs were caught by the tests and fixed rather than tested around:

1. `run()` pushes *"VA eligibility not indicated"* whenever the VA toggle is off and *"First-time homebuyer required"* whenever the buyer is not a FTHB. Both are permanent background noise, and classifying on the raw reason list reported "program limitation" for very nearly every case. They are now filtered out first.
2. Ranking is now by the **smallest change that unblocks something**: a program blocked only for cash is a cash problem, not a program problem, even when a different program is simultaneously over its loan limit.

**Strategies appear only when something is blocking the goal**, and only the ones relevant to that constraint. Every figure comes from a function that already existed and was already exercised by the Gap Solver — `concessionToCloseGap`, `priceToHitTarget`, `dtiPrice`, plus the new solver for the additional-down-payment option.

**The negotiation engine was not rewritten.** Job 2 shows a one-line summary using the existing `analyzeNegotiation()` / `offerActionSentence()`, including unused negotiation value when a structure cannot absorb it all, and points to the full three-way comparison in Section 2b, which is untouched.

### 2.7 · Persistent buyer goal bar

Sticky, every stage: buyer name, active goal, target payment, preferred down payment, available funds, and current mode. Display-only — it reads resolved values and never writes one back.

### 2.8 · Information hierarchy

Nothing was removed. The answer layer sits above the existing analysis; Sections 1 and 2 keep every output, every render function and every element id. Sections were deliberately **not** default-collapsed: `.section.collapsed>.sec-body{display:none}` blanks `innerText`, which would have destroyed the frozen render captures the regression suite depends on.

### 2.9 · Engine freeze, now mechanical

`BSE-Project-Status.md` §4.4 froze "lines 526–1060." That stopped being usable the moment Phase 4 inserted markup above the `<script>` tag. The boundary is now the `const Engine = (function(){ … })();` IIFE, located by **marker** and hashed by `tests/engine-freeze.test.js`, plus seven structural invariants on `maxPriceForScenario()` by name — including that front-end DTI is still **not** a price ceiling.

Extracting the same marker range from the pre-Phase-3 baseline `540ccbe` produces **the identical hash**, independently confirming the standing claim that the engine survived Gates A through D byte for byte. The suite is mutation-proved: flipping the buydown ratio `0.25 → 0.24` fails it immediately.

---

## 3. TEST RESULTS

```
  engine-freeze (protected calc)     PASS 12    FAIL 0
  bse-regression (47 scenarios)      68/68 executable cases, 0 failing
  dp-solver (Fernando, N-1)          PASS 55    FAIL 0
  answer-layer (Job 1 + Job 2)       PASS 104   FAIL 0
  m1-canonical-units                 PASS 80    FAIL 0
  canonical-state                    PASS 22    FAIL 0
  c4b-presentation-integrity         PASS 64    FAIL 0
  model-authority                    PASS 12    FAIL 0
  persistence-contract               PASS 40    FAIL 0
  persistence-client                 PASS 136   FAIL 0
  r47-cross-tool                     PASS 4     FAIL 0
  persistence-db                     SKIPPED — requires PostgreSQL; schema and RLS untouched
```

Run everything with `internal/buyer-strategy/run-all-tests.sh`.

Responsive re-verified at 375 / 430 / 768 / 1440 px: no sideways scroll, goal bar and answer layer both fit. Interaction verified: typing in a debt field never loses focus, the lever stays open across timing changes, rows add and remove cleanly, no JavaScript errors.

---

## 4. WHAT WAS **NOT** BUILT, AND WHY

### 4.1 · STOP — Accepted / Contract marking

**Not implemented. This is a reported stop, not an omission.**

The columns exist (`property_scenario.status`, `.is_accepted_property`) and already flow through serialize and deserialize. The blocker is in `save()`:

```js
const { error: delErr } = await client.from('negotiation_round')
  .delete().eq('property_scenario_id', rows.property_scenario.id).gt('round_number', highest);
if(delErr) throw delErr;
```

That surplus-round delete runs on **every** save. The application's own comment records a database guard, `bse_round_delete_guard`, that **refuses negotiation-round deletes once the scenario leaves `'draft'`**. In the normal case the delete matches zero rows and the guard never fires — but whether it rejects the *statement* or only the *affected rows* determines whether marking a scenario accepted makes every subsequent autosave throw.

That cannot be resolved without PostgreSQL, which this session does not have. Shipping it blind risks autosave failing on exactly the deals that matter most — accepted ones — discovered live. Per your stop conditions, I stopped.

**To unblock:** run `persistence-db.test.js` against a local PostgreSQL, confirm the guard's behaviour on a zero-row delete against a non-draft scenario, and I will wire the toggle. It is roughly an hour of work once that is known.

### 4.2 · `reserves` and `custom` goals — deferred

The other four `buyer_priority` values are live and drive the Job 2 answer (verified in the suite: switching to *Lowest cash to close* or *Maximum purchasing power* changes the answer block). `reserves` needs a reserve **amount**, and `custom` needs a stored predicate — both are new authored economic values, which means an additive migration (`goal_type`, `goal_value`) plus `persistence-db` verification I cannot run. Same reason as 4.1.

### 4.3 · Per-property goal override — deferred

`property_scenario.buyer_priority` and `.target_payment` exist as NULL-means-inherit and `resolve()` already falls through scenario → plan. Authoring them means `capturePropertyScenario()` stops writing NULL, which changes the canonical round trip. The client-side contract tests would cover most of it, but not the database half.

### 4.4 · Negotiation rounds 3+ — deferred

`captureNegotiationRounds()` hard-caps at two rounds (buyer offer, seller counter) and there is one `counterPrice` field. The schema supports unlimited rounds and upserts on `(property_scenario_id, round_number)`. Existing two-round behaviour is **preserved and passing**. Extending it is UI plus capture work with no migration — but it touches the same save path as 4.1 and is better done alongside it.

### 4.5 · Debt itemisation is session-scoped

`buyer_profile.monthly_debts` remains the single persisted authority and its meaning is unchanged — critical, because the 47-scenario baseline was built against it. The itemised list is a live-conversation lever that does not persist with the buyer. Persisting it is one buyer-owned table (`buyer_debt`) with an RLS policy mirroring `buyer_profile`, and it belongs with the other database work above.

### 4.6 · Untouched by instruction

FL property-tax integration · Comfort Calculator retirement · multi-property · ARIVE integration · Supabase architecture, RLS and persistence design · calculation-function extraction out of `index.html` · any refactoring not required by the approved functionality.

---

## 5. RECOMMENDED NEXT STEPS

1. **Manual validation.** Open the tool and run a real buyer through both jobs. Nothing here has been in front of a human yet.
2. **One PostgreSQL session** unblocks 4.1 through 4.5 as a single coherent batch. They all touch the same save path, and doing them together means verifying it once rather than four times.
3. **Do not deploy until Gate D closes.** Phase 4 does not depend on the Netlify preview, but it must not go to production ahead of it.

---

## 6. FILES CHANGED

| File | Change |
|---|---|
| `internal/buyer-strategy/index.html` | Answer layer (CSS, markup, render), Fernando solver, `powerCeilings`, `bindingAtProperty`, debt payoff lever, goal bar. **Engine IIFE untouched** |
| `internal/buyer-strategy/tests/engine-freeze.test.js` | **New** — mechanical protected-boundary enforcement |
| `internal/buyer-strategy/tests/dp-solver.test.js` | **New** — 55 assertions on the Fernando solver |
| `internal/buyer-strategy/tests/answer-layer.test.js` | **New** — 104 assertions on Job 1, Job 2, debt lever, revived code |
| `internal/buyer-strategy/tests/README.md` | Updated — new suites, engine-freeze rationale |
| `internal/buyer-strategy/run-all-tests.sh` | **New** — one-command regression runner |
| `docs/BSE-Project-Status.md` | Corrected: line count, post-Gate-D.1 MD5, Phase 2 authority, Phase 4 entry baseline |
| `docs/BSE-Phase4-UI-Redesign-Scope.md` | **New** — the approved scope |
| `docs/BSE-Phase4-Implementation-Report.md` | **New** — this document |

**Not touched:** every migration, every RLS policy, `property-tax.html`, the Comfort Calculator, the Staging BSE, every frozen expected value, and the calculation engine.

---

## 7. HOUSEKEEPING

This session created `Tools/Live/_cowork-tmp/` (the extracted `540ccbe` baseline needed by the M-1 differential suite, plus a moved stale git lock). The device bridge cannot delete. Remove it yourself:

```
cd ~/Tools/Live && rm -rf _cowork-tmp
```

Regenerate the baseline any time with:

```
git cat-file -p 540ccbe:internal/buyer-strategy/index.html > /tmp/bse-baseline.html
```

`git cat-file` is read-only plumbing and takes no lock, so it works through the bridge where `checkout` and `commit` do not.

---

# ADDENDUM — SHOPPING RANGE AUTHORED-INPUT CORRECTION
### 2026-07-29 · requested after the first manual retest

## A1 · Arive reconciliation — run BEFORE any code change

| Component | Arive | BSE | Difference |
|---|---|---|---|
| P&I | $2,269.44 | $2,269.4447 | half a cent, display rounding |
| Taxes | $582.26 | $582.26 | exact |
| Insurance | $250.00 | $250.00 | exact |
| MI | $0.00 | $0.00 | exact (LTV 69.994%) |
| HOA / CDD / flood | $0.00 | $0.00 | exact |
| **TOTAL PITI** | **$3,101.70** | **$3,101.70** | **exact** |

`Engine.pmt()` was also checked against an independently written amortization formula on the same $349,900 / 6.750% / 360 loan: **identical to 6 decimal places.**

**There is no mortgage-mathematics defect.** BSE and Arive agree on the forward calculation. Every problem observed was input-mode handling, which is what the rest of this addendum fixes.

## A2 · Root cause

Two distinct defects, both in how an authored input was handled — neither in the engine.

**A2.1 — the down payment was being converted.** `Engine.maxPriceForScenario()` is closed-form and assumes the down payment is a fixed FRACTION of price: its `k` coefficient is PITI per $1 of price with `dpFrac` constant. That is exactly right in percent mode and exactly wrong in dollar mode. The earlier fix worked around it by solving a preliminary price, computing that $150,000 was 26.5% there, then solving every other ceiling with 26.5%. That silently replaced the advisor's assumption, and left the three buying-power cards each describing a slightly different down payment.

**A2.2 — the tax field had only one dollar mode, and it was annual.** Entering `582` while the toggle read `$` meant $582 per YEAR — about $49/month — when the number in hand from Arive was $582.26 per MONTH. The value was interpreted correctly and was still the wrong assumption.

## A3 · Changes made

| Layer | Change |
|---|---|
| **Shopping Range solver** *(new)* | `fixedDollarShoppingRun()` — bisects on PRICE with the authored dollars held constant, calling `Engine.computeScenario()` at every probe. Solves comfort, DTI, cash and loan-limit ceilings independently, all with the same fixed dollars |
| **Dispatcher** *(new)* | `engineRun()` — percent mode and specific-price mode go straight to the protected `Engine.run()`; only Shopping-Range-with-authored-dollars uses the new solver |
| **Input resolution** | `resolveShoppingDpTarget()` **deleted**. There is no longer any transformation: the authored input IS the engine input |
| **Tax input** | Three authored modes — `%` · `$/MO` · `$/YR`. `$/MO` is a third DISPLAY of the same canonical annual amount, so `tax_input_unit` gains no new value and no migration is required |
| **Presentation** | Both explanatory warnings removed. The input now states its own assumption: *"$582.26/mo = $6,987.12/yr — fixed at every price"*, *"$150,000 — fixed at every price"* |
| **Layout** | Fields carrying a unit toggle span two grid columns and stack the toggle below the value under 520px — the three-way tax toggle was squeezing the input to zero width |

**No engine change.** The `Engine` IIFE hash is unchanged from revision 2.

## A4 · Before / after

| | Before | After |
|---|---|---|
| $150,000 down, Shopping Range | zero scenarios, then (after the first fix) 26.5% substituted | $150,000 held fixed at every probe |
| Comfort Shopping Max | $566,513 — solved at a substituted percentage | **$484,219.30** — solved with $150,000 down |
| Down payment at that price | 26.5% of whatever price came out | **exactly $150,000** |
| Round-trip PITI | not asserted | **exactly $3,000.00** |
| $582.26 typed in `$` mode | read as $582/yr ≈ $49/mo | **$582.26/mo**, fixed at every price |
| On-screen explanation | two warnings about conversions | none — the input states the assumption |

## A5 · Intentional baseline changes

**None.** The 47-scenario numerical baseline is byte-identical: 68/68 executable cases, 4,000 VERIFIED and 1,157 REVIEW fields, zero drift. The M-1 canonical-unit suite is also unchanged at 80/80 despite the third tax display mode, because `%` ↔ `$/YR` conversion behaviour was left exactly as it was.

## A6 · Recommendation — default tax mode

**Yes, `$/MO` should become the default.** It is the unit Arive reports, the unit an escrow figure is quoted in, and the unit that makes a side-by-side reconciliation immediate. `%` is the right default only when there is no property yet and the tax genuinely should scale.

Not changed in this pass, because the default is `%` today and flipping it would change the initial state of a fresh page — a one-line change (`const unitState = { dp:'pct', tax:'pct' }`) that should be made deliberately and re-baselined, not slipped in with a defect fix. Say the word.

---

# ADDENDUM B — JOB 1 CLOSEOUT
### 2026-07-29 · presentation cleanup only

## B1 · Changes made — all presentation

| # | Change |
|---|---|
| 1 | The what-if control is now labelled **"How much down to stay at $3,000/mo?"**, reading the buyer's live target payment. It re-reads on every recalculation |
| 2 | **Qualification Snapshot** and **Property Strategy** are **collapsed by default**. Headers renamed to *"supporting detail — DTI, eliminations, diagnostics"* and *"supporting detail — activates with a list price"* |
| 3 | The collapse mechanism changed from `display:none` to **clipping** (`max-height:0; overflow:hidden`), plus the `inert` attribute. See B2 |
| 4 | **`$/MO` is the new-session default property-tax mode**, and the tax field now ships **empty** with an `e.g. 582` placeholder |
| 5 | A **blank property tax is flagged** on the answer layer. See B4 |
| 6 | Two test suites now pin their intended tax unit and PITI assumptions instead of inheriting application defaults |

**No calculation logic changed.** `requiredDownForPayment()`, `fixedDollarShoppingRun()`, `powerCeilings()`, `Engine.computeScenario()` and `maxPriceForScenario()` are all untouched.

## B2 · Why collapse had to be clipped, not `display:none`

Collapsing the two sections with the existing `display:none` rule **failed all 68 regression cases**. `display:none` removes content from `innerText`, which blanks every frozen render capture the 47-scenario suite compares against — a total baseline failure for purely presentational reasons, which would have buried any real regression in noise.

Clipping keeps the content rendered and therefore still verifiable, while being genuinely collapsed: the section body measures **0px** and only the clickable header shows. `inert` is applied alongside the class so clipped inputs stay out of the tab order — and is applied **at load**, not only on the first click, since both sections now ship collapsed.

Both halves are asserted in `job1-closeout.test.js`: body height 0, header visible, `innerText` still populated, `inert` present, and expand/re-collapse round-tripping correctly.

## B3 · Two test suites were silently depending on a UI default

Changing the default tax mode broke **34 assertions in `m1-canonical-units`** and **2 in `r47-cross-tool`** — neither because application behaviour moved.

Both suites set a `taxRate` value but never set the tax **unit**, inheriting whichever mode the application defaulted to. `m1` additionally compares the pre-Phase-3 baseline file against the file under test, so once the two files' *field* defaults diverged (baseline `1.20`, current empty) every case differed on an input the test never pinned.

Both now pin their intent explicitly — `m1` pins the tax unit **and** the PITI field values to what the baseline shipped with; `r47` pins the 1.20% / $150 assumptions the documented C-6 comparison depends on. Both pass with **unchanged expected values**, which is the proof that nothing about the behaviour under test moved.

## B4 · A defect found during closeout — blank property tax

A blank or unit-mismatched property tax **silently overstates every Shopping Range figure**. On the verified profile, Comfort Shopping Max reads **$573,991 with no tax entered against $484,259 with $582/mo — roughly $90,000 of phantom purchasing power**, with nothing on screen revealing it. This predates Phase 4 and applies to `%` mode too.

It also made `$/MO` unsafe as a default while the field still shipped `1.20`: that value would have meant **$1.20/mo**, giving a $573,806 figure that looks entirely plausible.

Two mitigations: the tax field ships **empty**, and the answer layer carries an explicit amber flag — *"Property tax has not been entered. Every figure above assumes zero property tax and is therefore overstated."* This is a **missing required assumption**, categorically different from the explanatory warnings removed in Addendum A, which described legitimate assumptions.

## B5 · The pinned $499,900 case — a transcription difference

The manual run reproduces **exactly**, but at **6.875%** conventional, not the 6.750% listed alongside it in the same message:

| | Manual run | BSE at 6.875% | BSE at 6.750% |
|---|---|---|---|
| Required down | $169,900 | **$169,900** | $165,700 |
| Additional needed | $19,900 | **$19,900** | $15,700 |
| Estimated PITI | $3,000 | **$3,000** | $3,000 |
| Cash to close | $179,800 | **$179,800** | $175,726 |
| Remaining reserve | $20,200 | **$20,200** | $24,274 |
| Loan amount | — | $330,000 | $334,200 |

Three input sets reproduce the manual figures — tax $609/mo, or insurance $277/mo, or **rate 6.875%**. The third is almost certainly it: the stated tax ($582/mo) and insurance ($250/mo) match exactly, and the rate is the only free variable left.

**Both rates are pinned in the regression suite**, so whichever was on screen is locked. Worth confirming which rate is the intended assumption.

## B6 · Test results

```
  engine-freeze (protected calc)     PASS 18    FAIL 0
  bse-regression (47 scenarios)      68/68 executable cases, 0 failing
  dp-solver (Fernando, N-1)          PASS 55    FAIL 0
  answer-layer (Job 1 + Job 2)       PASS 104   FAIL 0
  shopping authored inputs           PASS 58    FAIL 0
  job1 what-if (required down)       PASS 66    FAIL 0
  job1 closeout (presentation)       PASS 55    FAIL 0   <-- new
  m1-canonical-units                 PASS 80    FAIL 0
  canonical-state                    PASS 22    FAIL 0
  c4b-presentation-integrity         PASS 64    FAIL 0
  model-authority                    PASS 12    FAIL 0
  persistence-contract               PASS 40    FAIL 0
  persistence-client                 PASS 136   FAIL 0
  r47-cross-tool                     PASS 4     FAIL 0
  persistence-db                     SKIPPED — requires PostgreSQL
                                     833 assertions, 0 failures
```

**Engine hash before and after: `ff76f4057ba51cbbf1f87a70a7e770a5` — unchanged.**
The 47-scenario baseline is byte-identical: 4,000 VERIFIED + 1,157 REVIEW fields, zero drift.

## B7 · Job 1 status

**Complete, subject to confirming the 6.875% / 6.750% question in B5.** Everything asked for is built, manually validated, and pinned by regression. Job 2 has not been started.

---

# ADDENDUM C — CASH-LIMITED BUYING POWER CARD
### 2026-07-29 · approved wiring correction

## C1 · The defect

The headline card and the binding-constraint logic were computing **two different numbers** for one figure:

| | Value on the verified profile | How it was derived |
|---|---|---|
| The **card** (`snap.cash` ← `C.cashPrice`) | $605,219 | Treated the authored $150,000 as a **percentage** (31%) of whatever price came out |
| The **constraint logic** (`powerCeilings`) | $1,816,667 | Held the **authored dollars** fixed |

Arithmetic settles it: `$150,000 + ($200,000 − $150,000) ÷ 3% = $1,816,667`. With a fixed-dollar down payment the down payment does **not** grow with price — only closing costs do — so cash genuinely stops constraining, and the card should say so.

The card was still computing under the percentage assumption removed in Addendum A. That fix corrected the constraint path and missed the card.

## C2 · Why it was more than cosmetic

On a genuinely cash-tight buyer the two figures **contradicted each other on screen**. Same profile with $158,000 of funds instead of $200,000:

| | Old card | Corrected |
|---|---|---|
| Cash-Limited Buying Power | $477,835 — *"not the limiting factor"* | **$416,667 — "this is the limit"** |
| SHOP UP TO | $416,667 (Cash to Close) | $416,667 (Cash to Close) |

The old card showed a ceiling **$61,000 above** the price the bar said the buyer was capped at, and labelled it non-binding while the bar named cash as controlling.

## C3 · The change

`powerCeilings()` already computed the authored-mode ceiling. It now **returns** it (`cashCeil`, `limitCeil`), and `powerSnapshot()` feeds the card from that same value. One calculation, two consumers.

**No engine change. No cash calculation change.** Only the wiring that fed the card. Engine hash unchanged at `ff76f4057ba51cbbf1f87a70a7e770a5`.

Percent mode is unaffected — `powerCeilings` already used `C.cashPrice` there, which is correct when the down payment genuinely is a percentage.

## C4 · Intentional pin change

| Figure | Before | After |
|---|---|---|
| Comfort Shopping Max | $484,259 | **$484,259 — unchanged** |
| Maximum Purchasing Power | $674,670 | **$674,670 — unchanged** |
| Cash-Limited Buying Power | $605,219 | **$1,816,667 — corrected** |
| Controlling | Comfort Payment | **Comfort Payment — unchanged** |

Pins updated in `job1-closeout.test.js` and `job1-whatif.test.js`, each carrying the reason inline. Two new assertions prevent the divergence recurring: the card, the solver and the constraint ceiling must be the same value, and it must equal the hand arithmetic.

## C5 · Regression

**903 assertions, 0 failures** across 16 suites. The 47-scenario baseline is byte-identical. Rate Impact results unchanged — its rows never used the card figure.

