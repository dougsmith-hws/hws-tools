# BUYER STRATEGY ENGINE — JOB 2 CLOSEOUT REPORT
## Property Strategy — answer-first

**HomeWealth Solutions LLC** · Company NMLS #2742458 · FL OFR Mortgage Broker License #MBR8082
Owner: Doug Smith, President & Broker, CMA®
Date: 2026-07-30
Status: **CODE COMPLETE — AWAITING MANUAL TESTING. NOT DEPLOYED.**

---

## 1 · BASELINE BEFORE CHANGES

Verified from the source on disk before a line was touched, per §0.

| | |
|---|---|
| Application MD5 before | `f856348f21c700e6a56a62ec5595116d` |
| Application lines before | 6,586 |
| Calculation engine MD5 | `ff76f4057ba51cbbf1f87a70a7e770a5` — revision 2, 565 lines |
| Suites run | 16 (15 executable in the original environment + `persistence-db`) |
| Assertions | **910 green, 0 failures** with `persistence-db` skipped · **984** with it run |
| 47-scenario numerical baseline | 68 / 68 executable cases, zero drift |

**Job 1's approved outputs were confirmed intact before and after.** Comfort
Shopping Max `$484,259`, Maximum Purchasing Power `$674,670`, Cash-Limited Buying
Power `$1,816,667`, controlling constraint Comfort Payment, and Rate Impact at
6.750% base (+0.25% → +$56/mo / −$8,393; −0.25% → −$55/mo / +$8,742) all still
hold, and are now asserted a second time inside the new Job 2 suite as its
**first** section so a Job 1 regression cannot hide behind a Job 2 pass.

### 1.1 · Material discrepancies found while verifying — reported per §0

1. **`BSE-Project-Status.md` §2 and §3 are stale.** They record the application
   at `99a82a68…` and 4,361 lines. On disk it was `f856348f…` and 6,586 lines.
   The Phase 4 work and Addenda A–C landed after that section was last written.
   §4.4's engine table *is* current. Corrected in this pass.
2. **An undocumented Rate Impact addendum exists.** `job1-rate-impact.test.js`
   (126 assertions) and the Rate Impact feature are on disk and green, but the
   Implementation Report stops at Addendum C (903 assertions). The last two
   `job1-closeout` assertions and the Rate Impact suite account for the 910 found.
   Nothing is wrong — the report simply had not been extended. Noted, not changed.
3. **The regression suite could not run on the device at all.** `playwright` is
   not resolvable from `Tools/Live`, so all 15 browser suites failed with
   `MODULE_NOT_FOUND` when run through the Cowork device bridge. They were run in
   the session container instead, where Chromium and Playwright are present. This
   is an environment fact, not an application defect — but it means *"I ran the
   tests"* on that Mac needs `npm i -D playwright` in `Tools/Live` first.
4. **`reserves` and `custom` buyer goals are still not persistable.** The
   `#priority` select offers exactly `balanced, payment, cash, power`;
   `PRIORITY_LABEL` carries labels for `reserves` and `custom` but there is no
   option, no column value, and no `goal_value` to hold a reserve amount or a
   custom predicate. **Reported and NOT implemented**, per §3. The payment-goal
   workflow was not blocked on it. This is unchanged from Implementation Report
   §4.2 and still needs an additive migration.

### 1.2 · The §12 database question — now VERIFIED, in this session

PostgreSQL 16 turned out to be **present in the session container**
(`/usr/lib/postgresql/16`). A cluster was initialised, both migrations and the
local auth stub applied, and `persistence-db.test.js` run against the real
schema with RLS enabled and forced. That is the missing piece Implementation
Report §4.1 stopped on.

**Result: 74 / 0 on the pre-change application.** The specific findings:

- `bse_round_delete_guard` is a `BEFORE DELETE … FOR EACH ROW` trigger. A
  zero-row delete never fires it — **D12d** pins that.
- Repeated autosaves of a non-draft (`presented`) scenario therefore succeed with
  the shipped upsert strategy — **D12b**.
- A round that has genuinely been presented still cannot be withdrawn — **D12e**.

So marking a scenario accepted is safe for ordinary autosave. **One real hazard
remained**, which the guard's own semantics make obvious once it is stated: if
the officer marks the scenario accepted and then *clears a counter price that was
already saved*, capture emits one round, `highest` drops to 1, and the surplus
delete matches round 2 — a real row on a non-draft scenario. The guard fires and
**every subsequent autosave throws**. That is exactly the failure §12 was
protecting against.

The fix is one condition, in the direction of doing less: the surplus-round
delete is now issued only while the scenario is still a draft. It is pinned four
ways in **D12f**, including a mutation proof that removing the guard reproduces
the rejection, and a source assertion that the application actually contains it.

Accepted status was therefore implemented. Had the verification not been
possible, it would have been reported deferred.

---

## 2 · EXACT UI ADDED

Job 2 now reads **PROPERTY → GOAL → VERDICT → ANSWER → (why it fails) → how else**.

**Above the fold, in order:**

| Element | Content |
|---|---|
| `PROPERTY` | the list price, which is the reference price for all Job 2 analysis |
| `GOAL` | the active buyer goal, from `buyer_priority` — no parallel concept |
| **`GOAL ACHIEVABLE` / `GOAL ALREADY ACHIEVED` / `GOAL NOT ACHIEVABLE WITH CURRENT STRUCTURE`** | a prominent banner that commits to a verdict, plus **one plain-English sentence that may be the whole conversation** |
| `REQUIRED DOWN PAYMENT` | the dollar answer, the percentage, and the sentence *"To hit $3,000/mo, the buyer needs down $169,900 — 34.0% of the price"* |
| Six rows | Planned down · Additional needed · Estimated PITI · Estimated cash to close · Available funds · **Reserve after close** (or *Additional cash needed*) |
| Three checks | ✓/✗ Payment target achieved · Qualification achieved · Available funds sufficient |
| Context lines | the one-step-further PMI/MIP boundary, solver notes, other programs that also reach the target |
| Property fit | unchanged three independent cards, still naming the structure it was evaluated at |
| Tradeoff | unchanged, now suppressed when the two structures do not materially differ |
| Binding constraint | unchanged vocabulary; reads *"None … Goal already achieved — anything below is optimisation only"* when nothing blocks |
| `WHAT MOVES IT — <constraint>` | unchanged, and still only the strategies relevant to that one constraint |

**Below that, a new secondary area — `HOW ELSE COULD WE STRUCTURE IT?`** Every
item is a collapsed lever, so a successful answer is never buried:

1. **Best use of the $X negotiable seller value** — goal-first ranking of the
   existing engine's three paths, with its recommendation restated in terms of
   the buyer's goal, unused negotiation value called out, and a pointer to the
   untouched three-way comparison in Section 2b.
2. **Debt payoff at this property** — the same itemised list and at-closing /
   before-closing choice as Job 1, asked against this house.
3. **Every other eligible structure on this property** — payment, cash, DTI and
   target gap per alternative.
4. **What rate would make this property work?** — the solved rate that reaches
   the target, what it costs in points against the concession cap, and a
   seven-row sensitivity table at this price and this down payment.
5. The existing one-line negotiation summary and Section 2b pointer.

**Then:** an `Accepted — this is the current working structure` toggle.

Nothing was removed from below the fold. Section 1, 2a Recommendation Engine,
2b Offer Strategy & Negotiation, 2c Gap Solver and 2d Counter Offer Analyzer all
render exactly as before, and that is asserted.

---

## 3 · EXISTING FUNCTIONS REUSED

No mortgage mathematics was reimplemented. §17 was followed literally.

| Reused | For |
|---|---|
| `requiredDownForPayment()` / `requiredDownForProgram()` / `dpDescribe()` | the entire payment-goal answer. **No second down-payment solver was written** |
| `dpScenarioAt()` → `Engine.computeScenario()` | every rate probe |
| `Engine.computeScenario()` | the round-trip assertion that the reported payment is the engine's payment |
| `engineRun()` | every property-mode scenario set, including the payoff comparison |
| `Engine.run()`, `Engine.pickBestOverall()`, `priorityScenario()` | the default structure and the alternatives list |
| `debtAdjustedInputs()` | the payoff input transform, at closing and before closing |
| `analyzeNegotiation()`, `pathOutcome()`, `optimalConcAlloc()`, `priorityAlloc()`, `pickPathWinner()`, `offerActionSentence()`, `financingCostAt()` | all seller-value analysis. The negotiation engine was **not** rewritten |
| `concessionToCloseGap()` | "what rate would make this property work", and the concession that buys it |
| `priceToHitTarget()`, `dtiPrice()` | the price-reduction strategies |
| `bindingAtProperty()` | the constraint classifier, **unchanged**, still authoritative when there is no payment goal or the goal is met |
| `propertyFitHTML()`, `fitCard()`, `wiRow()`, `wiCheck()`, `abRow()`, `strategyActionsList()`, `powerSnapshot()`, `plannedDownAt`-free `money()`/`esc()` | presentation |
| `RATE_DELTAS`, `riRate()` | the property rate table reuses Job 1's deltas and rate formatting |

**`maxPriceForScenario()` was not touched. The `Engine` IIFE was not touched.**

---

## 4 · NEW NON-ENGINE HELPERS

All presentation-layer. The only arithmetic is subtracting two figures the engine
already produced, and resolving an authored down-payment preference into dollars.

| Function | What it does |
|---|---|
| `job2Goal(inp)` | the goal, from `buyer_priority`. `balanced` and `payment` both resolve to the payment target, as before |
| `plannedDownAt(inp, price)` | the authored down-payment preference in dollars at this price |
| `paymentGoalStatus(inp, sol)` | reads the solver: `yes` / `no` / `hard` / `unknown`, plus the three independent tests |
| `goalConstraint(inp, st)` | **why the GOAL fails**, in `bindingAtProperty()`'s own vocabulary |
| `goalStatusHTML()` | the banner |
| `job2PaymentAnswerHTML()` | the answer block, rows and checks |
| `job2PaymentSentence()` | the one sentence |
| `propertyGoalSnapshot(inp)` | goal feasibility + cash + DTI + reserve at one input set, for before/after comparison |
| `propDebtLeverHTML()` / `propDebtOutHTML()` | the property-level payoff lever and its verdict |
| `job2SellerValueHTML()` | goal-first presentation of `analyzeNegotiation()` |
| `propRateAt()` | one rate probe, via `dpScenarioAt()` |
| `job2RateHTML()` / `job2RateBody()` / `refreshPropRate()` | the property rate lever |
| `job2AltProgramHTML()` | the alternatives list |
| `acceptBarHTML()` / `acceptLabel()` / `acceptNote()` / `refreshAcceptBar()` | Accepted status UI |
| `markDirty()` | one-line bridge to `BSEPersistence.scheduleSave()` |

**Removed:** `answerPaymentTarget()`. It was fully superseded and is deleted
rather than left uncalled — Phase 4 §2.4 already found four functions defined and
called from nowhere, one of which was silently broken.

---

## 5 · THE PINNED $499,900 EXAMPLE

Verified profile (credit 788 · funds $200,000 · planned down $150,000 · target
$3,000/mo · income $9,500 · debts $40 · tax $582/mo · HOI $250) at **6.875%**
conventional, the rate Addendum B5 identified:

```
PROPERTY   $499,900
GOAL       Keep the payment at or under $3,000/mo (total PITI)

✅ GOAL ACHIEVABLE
This property can be kept at $3,000/mo with $169,900 down. The buyer has
sufficient funds and would retain approximately $20,200 after closing.

REQUIRED DOWN PAYMENT
$169,900   34.0% down
To hit $3,000/mo, the buyer needs down $169,900 — 34.0% of the price.
Conventional at 6.875%, with no monthly mortgage insurance.

PLANNED DOWN             $150,000
ADDITIONAL NEEDED         $19,900
ESTIMATED PITI             $3,000/mo
ESTIMATED CASH TO CLOSE  $179,800
AVAILABLE FUNDS          $200,000
RESERVE AFTER CLOSE       $20,200

✓ Payment target achieved        $3,000/mo against a $3,000 target
✓ Qualification achieved         back-end DTI 32.0% against a 45% limit
✓ Available funds sufficient     $179,800 to close against $200,000 available

BINDING CONSTRAINT  None
```

That is your §4 example, figure for figure. Every one of those numbers is pinned
in `job2-property-strategy.test.js`, and the payment and cash to close are
additionally asserted to round-trip through `Engine.computeScenario()` to the
cent.

---

## 6 · FEASIBILITY LOGIC

Three independent tests, read off the solver, never collapsed into one:

| Test | Source |
|---|---|
| Payment | `r.piti <= target + 0.5` |
| Qualification | `r.dtiOk && !r.overLoanLimit && r.eligible` |
| Funds | `r.fundsSufficient` |

`GOAL ACHIEVABLE` requires all three. `GOAL ALREADY ACHIEVED` additionally
requires the solver to report the target is met at the program minimum, in which
case the screen says **"No additional down payment is required"** and no
additional-down strategy is offered. `GOAL NOT ACHIEVABLE WITH CURRENT
STRUCTURE` names which test failed, and the constraint is classified as
**Payment · Cash to close · Qualification (DTI) · Program**, or *"Goal already
achieved — optimisation only"*.

**A payment target that is reachable but does not qualify is never labelled
achievable.** Nor is one the buyer cannot fund — that case says, in words, that
the target is achievable *mathematically* and the buyer does not have the cash to
execute it, and reports the shortfall.

**The banner and the binding constraint can no longer contradict each other.**
That is asserted across a six-case matrix: a positive verdict never shows a
blocking constraint, and a negative verdict always names one. This mattered —
see §15.

---

## 7 · DEBT-PAYOFF BEHAVIOUR

Reuses `debtAdjustedInputs()` and asks the property question. **Before closing**
removes the monthly debt and treats the cash as already spent; **at closing**
removes the monthly debt *and* reduces available funds by the balance.

The verdict weighs **both** DTI and cash, and is allowed to say no:

- goal not achievable → achievable: *"Yes — this makes the property work."*
- goal achievable → not achievable: **"Do not pay this off at closing"**, naming
  the cash spent, and pointing at paying it before closing instead.
- neither: *"not enough on its own"*, and it says whether the blocking constraint
  changed.
- achievable either way but the reserve drops: *"There is no goal reason to do it
  at closing"* — DTI improvement alone is never treated as a reason.

Every result carries: **"Verify debt treatment with lender guidelines/AUS."** No
AUS or program-specific exclusion rule is simulated. Debt itemisation remains
session-scoped; `buyer_profile.monthly_debts` is still the single persisted
authority, so the 47-scenario baseline is unaffected.

---

## 8 · SELLER-VALUE BEHAVIOUR

`analyzeNegotiation()` is called, not replaced. `pickBestOverall()`,
`optimalConcAlloc()`, the financing-cost analysis and Unused Negotiation Value
are all preserved, and the full three-way table in Section 2b is untouched.

The panel ranks the paths by the buyer's goal — payment, cash to close, or
contract price — flags the winner, reports unused value, and states the existing
engine's recommendation sentence with the goal named as the reason. It also says
plainly that these are the negotiation engine's own best structures per path,
which are not necessarily the structure the answer above proposes.

**One defect fixed here.** The panel was gated on `neg.room > 0` — the requested
*price adjustment* only. An offer written **at list price with a seller
concession attached** therefore produced *"Negotiable seller value — $0"* and no
panel at all, which is the most common structure of all. Negotiable seller value
is now `negotiatingRoom + sellerConcession`, matching what `pathOutcome()`
actually deploys, and the header itemises the two parts. When there is no price
adjustment the three paths are identical arithmetic, so one row is shown instead
of three copies.

---

## 9 · NEGOTIATION ROUNDS

Verified before changing anything, and **not changed**. `captureNegotiationRounds()`
still emits round 1 (buyer) and round 2 (seller counter) and still caps at two.
Rounds are still upserted on `(property_scenario_id, round_number)` and never
delete-and-reinserted. Round identity is stable across saves.

A seller counter is handled the way §11 asks: updated property terms rerun **the
same** Property Strategy engine against the same goal test — no separate Counter
Offer Analyzer workflow was created. Asserted: at $479,900 the same buyer needs
materially less down than at $499,900, the counter price becomes the reference
price on screen, and both rounds persist with the counter at round 2.

**Rounds 3+ remain deferred**, unchanged from Implementation Report §4.4. That is
UI plus capture work with no migration; it was not in this scope.

---

## 10 · ACCEPTED-STATUS STATUS

**Implemented**, on the authority of the verification in §1.2 — and only because
of it.

- Toggle in the answer layer: `Accepted — this is the current working structure`.
- Persists as `property_scenario.status = 'under_contract'` +
  `is_accepted_property = true`; `'draft'` + `false` otherwise. Both values are
  inside the schema's existing `CHECK`; **no migration**.
- Restored on load from `is_accepted_property`, before `BSEModel.apply()`.
- **Not immutable.** Every field stays editable, and the screen says so. Round
  history is preserved. There is no Arive handoff.
- `save()` now issues the surplus-round delete **only while the scenario is a
  draft** — see §1.2. This is the only save-path change, and it does strictly
  less work than before.

Pinned in `job2-property-strategy.test.js` (8 assertions: draft/accepted
serialisation, round history preserved, the bar reflects state, fields still
editable after acceptance, the marking survives the edit, and the toggle works on
a real click) and in `persistence-db.test.js` **D12f** (4 assertions against real
PostgreSQL, including the mutation proof).

---

## 11 · JOB 1 REGRESSION

**Unchanged. Every approved pin holds.**

| Pin | Value | Result |
|---|---|---|
| Comfort Shopping Max | $484,259 | unchanged |
| Maximum Purchasing Power | $674,670 | unchanged |
| Cash-Limited Buying Power | $1,816,667 | unchanged |
| Controlling constraint | Comfort Payment | unchanged |
| Rate Impact +0.25% | +$56/mo · −$8,393 buying power | unchanged |
| Rate Impact −0.25% | −$55/mo · +$8,742 buying power | unchanged |

Also asserted: Shopping Range still activates on a blank list price; all three
cards, the what-if, Rate Impact and the debt lever all still render; no Job 2
block leaks into Job 1; and Job 1 renders with no NaN. `job1-whatif` (66),
`job1-closeout` (57), `job1-rate-impact` (126) and `shopping-dp-target` (58) all
pass with **unchanged expected values** — no pin was rebaselined in this pass.

**No intentional pin changes. None.**

---

## 12 · FULL ASSERTION COUNT

```
  engine-freeze (protected calc)     PASS  18   FAIL 0
  bse-regression (47 scenarios)      68 / 68 executable cases, 0 failing
  dp-solver (Fernando, N-1)          PASS  55   FAIL 0
  answer-layer (Job 1 + Job 2)       PASS 104   FAIL 0
  shopping authored inputs           PASS  58   FAIL 0
  job1 what-if (required down)       PASS  66   FAIL 0
  job1 closeout (presentation)       PASS  57   FAIL 0
  job1 rate impact                   PASS 126   FAIL 0
  job2 property strategy             PASS 177   FAIL 0   <-- new
  m1-canonical-units                 PASS  80   FAIL 0
  canonical-state                    PASS  22   FAIL 0
  c4b-presentation-integrity         PASS  64   FAIL 0
  model-authority                    PASS  12   FAIL 0
  persistence-contract               PASS  40   FAIL 0
  persistence-client                 PASS 136   FAIL 0
  r47-cross-tool                     PASS   4   FAIL 0
  persistence-db (schema/RLS)        PASS  78   FAIL 0   <-- now RUN, not skipped
                                     1,165 assertions, 0 failures
```

Before: 910 with `persistence-db` skipped, 984 with it run.
After: **1,165, 0 failures.** `answer-layer`'s 104 Job 2 assertions all pass
**unchanged** — the redesign kept every pinned string, so none was rebaselined.

`run-all-tests.sh` now runs `persistence-db` whenever a PostgreSQL is reachable
and prints an explicit SKIPPED notice when it is not, so a green run can no
longer quietly omit it.

---

## 13 · ENGINE HASH BEFORE / AFTER

| | |
|---|---|
| Engine IIFE MD5 before | `ff76f4057ba51cbbf1f87a70a7e770a5` |
| Engine IIFE MD5 after | **`ff76f4057ba51cbbf1f87a70a7e770a5` — identical** |
| Engine IIFE lines | 565 before, 565 after |
| `maxPriceForScenario()` | untouched; all seven structural invariants pass |
| 47-scenario numerical baseline | byte-identical, zero drift |

---

## 14 · APPLICATION HASH

| | |
|---|---|
| Before | `f856348f21c700e6a56a62ec5595116d` — 6,586 lines |
| After | **`1a620ca97a898d654ce8f80541d26aa6`** — 7,264 lines |

---

## 15 · DEFECTS DISCOVERED

Five, all found by building or testing this work. Four fixed; one is
environmental.

**15.1 · The banner and the binding constraint described different structures.**
The most serious. `bindingAtProperty()` answers *"what is stopping this buyer on
this house as structured."* When a payment goal needs a different structure, that
is a different question, and the screen could read **"achievable mathematically,
short $119,800 in cash"** in the banner while the binding constraint said
**"Comfort payment — $1,071/mo above target"** about the default FHA structure.
Both were true and they were about different things. This is the same defect class
Phase 4 §2.6 fixed once already. Fixed with `goalConstraint()`, which classifies
the *goal's* blocker and hands the goal structure to the strategy router, so cash
strategies are measured against the cash gap that actually exists.
`bindingAtProperty()` is unchanged and still governs elsewhere.

**15.2 · "No eligible structure" was reported when the solver had found one.**
When nothing was viable at the authored down payment, the property-fit block read
*"❌ No eligible structure — every program is eliminated at this price"* while the
answer above said the payment target was reachable and the funds sufficient. The
fit block now falls back to the goal structure, showing whichever of its three
tests is failing.

**15.3 · A price-reduction strategy could recommend reducing the price to $0.**
Pre-existing. Both `priceToHitTarget()` and `dtiPrice()` can return a
non-positive price when the target is unreachable at any price, and the unguarded
strategy printed *"Price reduction — $749,404 off (to $0)"*. Now guarded, and the
DTI branch says the honest thing instead: the debt load alone exceeds the
threshold at any purchase price.

**15.4 · Negotiable seller value was blind to a concession written at list
price.** See §8. `neg.room` alone hid the panel and reported `$0` of seller value
whenever the offer was at list with a concession attached.

**15.5 · Clicking a Job 2 lever detached the element mid-event.** Caught by an
interaction test: refreshing the whole answer body from inside the `toggle`
handler removed the `<summary>` that had just been clicked, and every subsequent
click on the answer layer failed with *"element was detached from the DOM."* Both
Job 2 levers now refresh only their own body, and the accept bar is mutated in
place rather than replaced — otherwise the checkbox still dispatching the change
event would be destroyed. Pinned by real `click()` and `fill()` assertions,
including that typing in a debt field never loses focus.

**15.6 · Environmental: the regression suite cannot run on the Mac as
configured.** See §1.1 item 3.

Two cosmetic fixes not worth numbering: the tradeoff line no longer fires on a
name-only difference between two identical structures ("$0 less"), and the debt
strategy no longer tells you to use a lever in Shopping Range now that there is
one at the property.

---

## 16 · DEFERRED, AND WHY

1. **`reserves` and `custom` buyer goals.** Reported, not implemented, per §3.
   Both are new authored economic values needing an additive migration
   (`goal_type`, `goal_value`) plus a reserve amount or a stored predicate. The
   enum, the select and the save path are unchanged, and that is asserted.
2. **Per-property goal override.** `property_scenario.buyer_priority` and
   `.target_payment` still capture as NULL and still inherit through `resolve()`.
   Authoring them changes the canonical round trip. Out of this scope.
3. **Negotiation rounds 3+.** Still capped at two. See §9.
4. **Persisted debt itemisation.** Still session-scoped. See §7.
5. **FL property tax, Comfort Calculator retirement, multi-property, Arive.**
   Untouched by instruction.
6. **Deployment.** Nothing deployed. Gate D is still not closed and the Netlify
   preview is still unverified. Job 2 does not depend on either.

---

## 17 · WHAT I RECOMMEND YOU DO NEXT

**Manual-test this.** Run the pinned buyer, then a real one, through both jobs.
`node tests/manual-capture-job2.js index.html` prints the rendered answer for
Job 1 and five Job 2 cases and writes two screenshots, if you want a quick look
before opening the tool.

**Confirm the 6.875% / 6.750% question from Addendum B5.** It is still open. Your
hand-verified $499,900 figures reproduce exactly at 6.875%; the message alongside
them said 6.750%. Both rates are pinned, so whichever is intended is locked — but
one of them is wrong in the notes.

**One thing worth deciding.** The tests can now be run end to end, database
included, but only in a cloud session — Playwright is not installed in
`Tools/Live`. `npm i -D playwright pg && npx playwright install chromium` on the
Mac would make the full suite runnable locally, which matters more now that
`persistence-db` is part of the routine run rather than a special occasion.

---

*HomeWealth Solutions LLC · doug@homewealthsolutions.com · 813-733-7371 · homewealthsolutions.com*
