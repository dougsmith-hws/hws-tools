# BUYER STRATEGY ENGINE — PHASE 4 UI REDESIGN
## Part 1 Verification Report + Part 2 Scope Document

**HomeWealth Solutions LLC** · Company NMLS #2742458 · FL OFR Mortgage Broker License #MBR8082
Owner: Doug Smith, President & Broker, CMA®
Date: 2026-07-29
Status: **SCOPE ONLY — AWAITING APPROVAL. No source modified. No calculation function changed.**

---

## 0. SOURCE VERIFICATION

| Item | Value |
|---|---|
| File verified | `~/Tools/Live/internal/buyer-strategy/index.html` |
| MD5 | `99a82a680e74953782aa9c2ce1802fc4` |
| Lines | 4,361 |
| Matches | `BSE-Phase3-GateD-Report.md` §20.1 (Gate D.1 baseline re-verification) — **confirmed current** |
| Docs read | `BSE-Project-Status.md`, `BSE-Phase3-GateC-Report.md`, `BSE-Phase3-GateD-Report.md` |
| Docs deliberately NOT used as authority | `BSE-Phase2-Architecture.md` (predates Gates A–D, per session instruction) |

**Two documentation drifts, non-blocking, worth correcting when convenient:**

1. `BSE-Project-Status.md` §3 describes the production BSE as "2,886 lines." It is 4,361.
2. `BSE-Project-Status.md` §2 lists the current application MD5 as `4dec9aad…` at `b0524b5`. That is the **pre-Gate-D** hash (Gate D report §1–7). The file on disk is `99a82a68…`, which is the **post-Gate-D.1** hash and is correct. The status doc simply hasn't been updated past Gate D.1.

Neither is a defect. Neither is a STOP condition. Both would confuse the next session.

All line numbers below refer to `99a82a680e74953782aa9c2ce1802fc4`.

---

# PART 1 — ENGINE VERIFICATION

### Summary table

| # | Capability | Verdict |
|---|---|---|
| 1 | Comfort Shopping Max | **EXISTS** |
| 2 | Maximum Purchasing Power | **EXISTS** (DTI-binding identification partial by design) |
| 3 | Cash-Limited Buying Power | **PARTIAL** — computed twice, never displayed as a number |
| 4 | Binding Constraint Identification (shopping range) | **EXISTS** — but via two independent code paths |
| 5 | Required Down Payment to Hit Target Payment | **DOES NOT EXIST** |
| 6 | Debt Payoff — Shopping Range | **PARTIAL** — advisory string only; and it is dead code |
| 7 | Debt Payoff — Property Strategy | **PARTIAL** — advisory string only |
| 8 | Negotiable Seller Value | **EXISTS** — most complete subsystem in the tool |
| 9 | Binding Constraint at Property Level | **PARTIAL** — wrong semantic; facts exist, classifier does not |
| 10 | Negotiation Rounds | **PARTIAL** — persisted and wired, but hard-capped at 2 rounds |
| 11 | Buyer Goal Selection | **PARTIAL** — 4 of 5 goals exist as `buyer_priority`; per-property override is persisted but not authorable |

---

## 1. Comfort Shopping Max — **EXISTS**

| Element | Location |
|---|---|
| Solver | `maxPriceForScenario()` — line **722** |
| Comfort ceiling | line **761** — `comfortPrice = max(0, priceForPITI(inp.target))` |
| Closed-form basis | lines **737–739** — `k` = PITI per $1 of price, `b` = fixed monthly, `priceForPITI(P) = (P − b) / k` |
| Display | `buyingPowerCardsHTML()` line **1300**, card rendered at line **1313** as "Comfort Purchase Price" |
| Aggregation | line **1301** — max `comfortPrice` across the buyer-profile scenario set |

**Preferred down payment is honoured.** The buyer-profile set at line **1357** is produced by `Engine.run({…shopping:true, price:0})`, which carries `dpTarget` through, and `run()` line **851–854** removes non-matching down-payment tiers from `scenarios` (dimming them into `dpDimmed`). So when a preferred down payment is set, the comfort number reflects it. When none is set, the number reflects the lowest-down eligible tier, which is the correct advisor default.

**No new logic required for Job 1's first number.**

---

## 2. Maximum Purchasing Power — **EXISTS**

| Element | Location |
|---|---|
| Solver | `maxPriceForScenario()` line **722**, `qualPrice` at lines **762–764** |
| Formula | `priceForPITI((prog.ratios.back/100 × income) − debts)` |
| Display | line **1314** — "Max Qualifying Price," subtitle "Based on N% back-end DTI" |
| Ratios | `PROGRAMS` line **609** — Conv 28/45, FHA 31/43, VA 41/41 |

**"Which DTI constraint binds" is answered architecturally, not computed.** Lines **746–747** state the decision explicitly: *"Housing (front-end) ratio is advisory, not a qualifying ceiling — loans qualify on back-end DTI. We surface front-end as a flag, not a price cap."* Front-end is flagged at line **845** (`s.frontFlag`) and displayed as an amber advisory at line **1413**.

So: **back-end always binds; front-end never does.** That is a deliberate, documented modelling position, not a gap. The UI should state which back-end limit applies (43/45/41) and surface the front-end flag — it should not present front-end as a competing binding constraint. See Risk R6.

---

## 3. Cash-Limited Buying Power — **PARTIAL**

The number is computed in **two** places and displayed in **neither**.

| Computation | Location | Fate |
|---|---|---|
| As a price ceiling inside the solver | lines **749–750** — `cashDenom = dpFrac + (1−dpFrac)×ccPct/100`; `p = funds / cashDenom`, labelled `'Cash to Close'` | Competes for `binding` at 755–756; the price itself is discarded |
| As a standalone figure | lines **1306–1307** — same formula, returned as `C.cashPrice` | Passed to `constraintLineHTML()`, used only as a *label* candidate |

**Suppression rule.** `constraintLineHTML()` line **1325** adds cash as a candidate *only* when `cash <= comfort + 1`. The stated rationale (line 1320) is sound — "ample cash is not a constraint" — but the consequence is that a buyer with plenty of cash never sees their cash-limited ceiling at all, even as context.

**What's needed:** presentation wiring only. The math exists and is already consistent with `maxPriceForScenario`. **No new calculation.** Risk: LOW.

---

## 4. Binding Constraint Identification (shopping range) — **EXISTS**, via two paths

| Path | Location | Candidates | Scope |
|---|---|---|---|
| A — solver | `maxPriceForScenario()` lines **741–756** | Comfort Payment · Back-end DTI · Cash to Close · Conforming/FHA Loan Limit | Per scenario |
| B — display | `constraintLineHTML()` lines **1322–1333** | comfort · dti · cash (cash suppressed unless ≤ comfort) | Cross-program maxima |
| C — wrapper | `deriveBinding()` line **1442** | returns `top.binding` (Path A) with a credit-score override at 1447–1449 | Specific Scenario Mode only (called at line 1385) |

**Finding — flagging this because it will bite during the redesign.** Paths A and B are independent implementations that answer the same question with different inputs and different labels. Path A is per-scenario and includes loan limits. Path B is computed from cross-program maxima, excludes loan limits, and suppresses cash. They agree in most cases. They are not guaranteed to. Path A says `'Back-end DTI'`; Path B says `'DTI'`.

The redesign should present **one** binding-constraint answer. That consolidation must happen **presentation-side**. Changing `maxPriceForScenario`'s ceiling list to match the display is a calculation change to a protected, explicitly-frozen function. See Risk R2 and R3.

---

## 5. Required Down Payment to Hit Target Payment (the Fernando question) — **DOES NOT EXIST**

No function in the file solves for down payment. Every existing solver holds down payment fixed and solves a different variable:

| Function | Line | Solves for | Holds fixed |
|---|---|---|---|
| `priceToHitTarget()` | **2142** | **price** to reach target PITI | dp, program |
| `dtiPrice()` | **2279** | **price** to reach the back-end limit | dp, program |
| `concessionToCloseGap()` | **2119** | **concession $** to reach target PITI via buydown | dp, price |
| `additionalForPayment()` | **2503** | **additional buydown $** to reach target PITI | dp, price |
| `maxPriceForScenario()` | **722** | **max price** under four ceilings | dp, program |

The down-payment axis is only ever an *input* — supplied by `PROGRAMS[].scenarios()` (line **612**) as a fixed tier set (3/5/10/20, 3.5, 0), plus one custom tier above 20.5% derived from `dpTarget` (lines **617–624**).

**Fernando's question — "$461,000 house, needs payment at or under $3,000/mo, how much do I have to put down?" — cannot be answered by the current engine.** It requires a new solver. See §2 / N-1.

**It does not require changing protected code.** The new function calls `Engine.computeScenario()` and inspects the result. That is the same pattern `pathOutcome()` (1510) and `evalStructure()` (2458) already use.

---

## 6. Debt Payoff — Shopping Range — **PARTIAL, and currently dead code**

| Element | Location |
|---|---|
| Computation | `strategyActionsFor()` lines **1274–1279** — `debtCut = mp.k × inc`, where `inc` is the qualifying-price increase sought |
| Output | Two advisory strings: *"Eliminate $X/mo in monthly debt — raises qualifying to $Y"* / *"Reduce monthly debt… debt alone won't fully close it"* |

**What exists:** a correct closed-form inversion of the price-per-dollar-of-payment coefficient. Given a target price increase, it returns the monthly debt reduction required. That is real, useful math.

**What does not exist:**

- No re-run of the engine with reduced debts. The advisory tells you the number; nothing recomputes purchasing power from it.
- No modelling of the **cash cost** of the payoff. Paying a debt off at closing consumes funds, which moves the cash ceiling at line **749–750** in the opposite direction. Today that interaction is invisible.
- No debt **list**. `inp.debts` is a single scalar (`buyer_profile.monthly_debts`, line **2985**). You cannot select *which* debts to pay off, because the engine has never known there is more than one.
- No before/at-closing timing distinction.

**Additional finding — this code never runs.** `strategyActionsFor` (1262), `strategyOkCard` (1256), `strategyActionsList` (1257), and `powerBadge` (1249) are **defined and never called**. Verified: one reference each, the definition itself. `cashAtPrice` (1247) and `powerLabel` (1248) are called only from inside that dead cluster. `Engine.optimalSplit` (969) is likewise exported and never invoked.

The block comment at line **1245** describes a *"Four-card buying-power panel: Comfort, Maximum (DTI), Cash, and a coaching Strategy Opportunity card."* `buyingPowerCardsHTML()` returns **two** cards (lines 1312–1316). A four-card design was written and then reduced to two; the supporting functions were left in place.

**This is a scope opportunity and a trap at the same time.** ~50 lines of ordered, profile-filtered strategy guidance already exist for Cash / DTI / Comfort Payment / Loan Limit constraints — very close to what Job 1's "buying power constraint explanation" and Job 2 Step 3 need. But it has never executed, and it has a latent defect: `strategyActionsFor` destructures `secondary` at line **1263** and reads `ctx.highestComfort` at **1288**, while `buyingPowerCardsHTML` returns neither. Reviving it as-is produces `NaN` in dollar amounts. See Risk R1.

---

## 7. Debt Payoff — Property Strategy — **PARTIAL**, same shape, narrower

| Element | Location |
|---|---|
| Computation | `gsDti()` line **2260** — `debtCut = max(0, (piti + debts) − ratios.back/100 × income)` |
| Output | Line **2262**: *"Eliminating $X/mo in debt brings back-end DTI to N% and opens [scenario]"* — or line **2264**, the "even removing all debt isn't enough" branch |

Same limitations as item 6: advisory text, no re-run, no cash cost, no debt selection, no timing. Additionally, this path only fires when DTI is *already breached* (`gsDti` early-returns at 2254 when within guidelines) — so it cannot be used proactively to show what payoff would unlock on a property that already qualifies.

Unlike item 6, this code **is** live — `gsDti` is reached from `renderGapSolver()` line **2036**.

---

## 8. Negotiable Seller Value — **EXISTS**. Do not rebuild any of it.

This is the most complete subsystem in the tool.

| Element | Location | Function |
|---|---|---|
| `analyzeNegotiation()` | **1589** | Orchestrator. Evaluates three deployments × all eligible loan scenarios |
| `pathOutcome()` | **1504** | Computes one deployment for one scenario — `reduction` (1508), `concession` (1527), `split` (1543) |
| `optimalConcAlloc()` | **1499** | Closing costs first, then every remaining dollar to buydown. Deliberately priority-independent |
| `priorityAlloc()` | **1491** | Priority-driven allocation — payment → 100% buydown; cash/balanced/power → 100% costs |
| `pickPathWinner()` | **1569** | Ranked tiebreaker cascades per priority, lines 1574–1579, with tolerances |
| `pickBestOverall()` | **863** | Full decision hierarchy — cash preservation, reserve floor, comfort filter, stay-length metric, three-tier tiebreaker |
| `optimalRestructure()` | **2482** | Same question for a *seller counter*: redistribute the same net seller value across R/C |
| `additionalForPayment()` | **2503** | How much more seller value is needed |

**Unused Negotiation Value is already first-class.** Every outcome carries `unused` (lines 1515, 1530, 1549). It is rendered as its own table row with `pos`/`zero` styling at line **1691**, and it is a formal tiebreaker at line **1583**. The `'unlock'` headline type (1625, 1657) exists specifically to say *"switching to program X deploys $Y that program Z leaves on the table."*

**Requirement satisfied:** "Do not invent new optimization logic. Preserve Unused Negotiation Value display." Both are already true. The redesign's job here is **relocation and framing**, nothing else.

---

## 9. Binding Constraint at Property Level — **PARTIAL — semantic mismatch**

**`deriveBinding()` is called in Specific Scenario Mode** (line **1385**) — so the literal answer to "does it handle property level" is yes, it runs there.

**But it does not answer the property-level question.** `deriveBinding` returns `top.binding`, which comes from `maxPriceForScenario()` — the ceiling that caps the buyer's *achievable price*. It is computed from income, debts, funds and target, and is **independent of the entered list price**. Displayed at line **1394** next to "Achievable Price" (1391), it is internally coherent: it explains that number. It does not explain what is stopping this buyer **on this house**.

**All five property-level constraint facts already exist — scattered across four render paths:**

| Constraint | Where the fact lives |
|---|---|
| Payment | `gsPayment()` **2079** — `gap = best.piti − inp.target` |
| Cash | `gsCash()` **2220** — `s.cashToClose > inp.funds` |
| Qualification | `gsDti()` **2250–2252** — `back > ratios.back` / `front > ratios.front`; eliminations at **840** |
| Program | `run()` **830–842** — loan limit, credit, FTHB, cash eliminations → `elimHTML()` **1452** |
| Concession limit | `applyConcession().over` **958**; displayed `coPanel1()` **2611** |
| No constraint / optimization | `offerStatusHTML()` **1339** — the "within comfort range and qualifies" branch |

**What's missing is a classifier, not math.** A function that reads facts already produced and returns a single ranked answer. New logic, but **zero calculation risk**. See §2 / N-2.

---

## 10. Negotiation Rounds — **PARTIAL**

**Confirmed wired to saved scenarios post-Gate C.**

| Element | Location |
|---|---|
| Capture | `captureNegotiationRounds()` line **3098** |
| Schema | `negotiation_round` — Gate C report §111, §133: `round_number` · `actor` · `price` (CHECK > 0) · `concession_value`/`_unit` pair · `negotiation_mode` · `loan_program_override` · `manual_split_*` · `is_accepted` · `result_summary` (cache only) |
| Write strategy | **Upsert on natural key `(property_scenario_id, round_number)`** — Gate C §363. Round identity is stable across saves; a round the buyer was shown keeps its database id permanently |
| Round-trip proof | Gate C §182 — 13 round-trip cases, canonical A → DB → canonical B identity |
| Restore | `toInputs()` lines **3252–3264** — buyer round is the authoritative concession source once one exists |

**Confirmed: same engine, new inputs.** `counterScenario()` (2442) → `evalStructure()` (2457) → `Engine.computeScenario` / `Engine.pickBestOverall` / `Engine.applyConcession`. There is no separate counter-offer math. That requirement is already met.

**Two real limitations:**

1. **Exactly two rounds, hard-coded.** Lines **3100–3125**: round 1 is the buyer offer read from `offerPrice`; round 2 is the seller counter read from `counterPrice`. There is no round 3. A second seller counter overwrites the first — the DOM has one `counterPrice` field. **The schema supports unlimited rounds; the capture function and the UI do not.**

2. **"Does this still accomplish the buyer's goal" is hard-coded to payment + cash.** `coPanel3()` line **2649**: `meets = e => e.piti <= inp.target + 0.5 && e.cash <= inp.funds + 0.5`. It is not goal-aware. A buyer whose goal is "preserve $40,000 in reserves" or "maximize purchase price" gets the wrong verdict.

---

## 11. Buyer Goal Selection — **PARTIAL**

**Four of your five goals already exist**, as `buyer_priority`.

| Your goal | Existing `buyer_priority` | Label (line **2326**) |
|---|---|---|
| Keep payment at or under $X/mo | `payment` + the always-present `target` | "Lowest Monthly Payment" |
| Minimize cash to close | `cash` | "Lowest Cash to Close" |
| Maximize purchase price within qualification | `power` | "Maximum Buying Power" |
| *(default)* | `balanced` | "Balanced" |
| **Preserve $X in reserves** | **— none —** | — |
| **Custom** | **— none —** | — |

`buyer_priority` genuinely drives optimization — it is not decorative. Consumers: `priorityPick()` **979**, `priorityScenario()` **1792**, `pickPathWinner()` **1574–1579**, `priorityAlloc()` **1491**, `coMetric()` **2474**, `concessionVsPrice()` **2182–2199**, `coImprovement()` **2618**, `pickBestOverall()` **874**, `gsPayment()` **2103**.

**So the answer to "is payment target the only optimization target" is: no.** Minimize-cash and maximize-purchase-price are already selectable and already change the recommendation.

**What does not exist:**

- **Reserves as a goal.** The only reserve logic is a hard-coded $500 floor in `pickBestOverall()` line **884** ("a scenario that leaves under $500 after closing… is not something an advisor would lead with"). There is no authorable reserve target.
- **Custom goal.** No free-form goal.
- **Target payment as a goal distinct from priority.** `inp.target` is always present and always acts as the comfort ceiling regardless of priority — `pickBestOverall` line **887** filters on it in every mode. Payment target is a *constraint*, priority is an *objective*, and today they are separate axes that both always apply. Your Job 2 Step 1 treats "keep payment under $X" as one selectable goal among five. **These are not the same model.** See §2 / N-4 and Recommendation A.

**The single most important finding in this report:**

> **Per-property goal override is already persisted, already resolved, and already tested. It is not authorable only because there is no UI for it.**

`property_scenario` carries `buyer_priority`, `target_payment`, `dp_target_value`/`_unit`, and `planned_stay_years` as NULL-means-inherit columns (Gate C §131). `resolve()` lines **3177–3181** already falls through scenario → shopping plan via `pick()`. `capturePropertyScenario()` writes them as NULL at lines **3066–3068** with an explicit comment (lines **3047–3051**):

> *"Every assumption column is NULL = inherit. The current single-form UI has no surface for authoring a property-level override distinct from the plan… The mechanism is real and tested; the authoring UI is later-phase work."*

**This UI phase is that later phase. No migration is required for the four goals that already exist.**

---

## STOP-CONDITION CHECK

The session instruction: *"If Part 1 reveals that a required output does not exist and building it would require changing protected calculation functions, STOP and report."*

**No STOP condition is triggered.**

| Missing capability | Requires changing lines 526–1060? |
|---|---|
| N-1 Required down payment | **No** — calls `computeScenario()`, does not modify it |
| N-2 Property-level binding classifier | **No** — reads existing outputs |
| N-3 Debt payoff modelling | **No** — builds a modified input object and calls `Engine.run()` unchanged |
| N-4 Goal-aware `goalMet` | **No** — replaces `coPanel3()`'s local `meets()` at line 2649, outside the protected block |
| Cash-limited buying power display | **No** — already computed |
| Consolidated binding language | **No, IF done presentation-side.** **YES if done inside `maxPriceForScenario`** — do not do that |

The protected block ends at line **1060**. Every new function lands in the UI layer (1062+), where `pathOutcome()`, `evalStructure()` and `optimalRestructure()` already establish the pattern: **the engine is a pure function of its inputs; a new scenario is a different input, not a different engine.**

---

# PART 2 — UI SCOPE DOCUMENT

## §1. Verification results

See Part 1. Condensed:

- **Exists, reuse as-is:** Comfort Shopping Max · Maximum Purchasing Power · shopping-range binding constraint · the entire negotiable-seller-value subsystem including Unused Negotiation Value · negotiation-round persistence · three of five buyer goals.
- **Partial, needs presentation only:** Cash-Limited Buying Power (computed, never shown) · binding-constraint consolidation (two paths, must merge display-side only).
- **Partial, needs new non-calculation logic:** property-level binding classification · goal-aware "does this still work" test · rounds 3+.
- **Does not exist:** required down payment for a target payment (the Fernando question) · debt-payoff scenario modelling · reserves-as-a-goal · a debt list.

---

## §2. New functions required

All four live in the UI layer, above line 1060 in protection terms but below it in file position. **None modifies a calculation function.**

### N-1 · `requiredDownForPayment(inp, programId, price, targetPayment)` — **RISK: MEDIUM**

*Answers the Fernando question.*

**Inputs:** resolved engine inputs · program family (`conv`/`fha`/`va`) · fixed purchase price · target monthly payment.

**Outputs:** `{ dpDollar, dpPct, ltv, resultingPITI, cashToClose, feasible, gapVsFunds, bandNote }`

**Method:** bisection on down-payment fraction across the program's legal range, calling `Engine.computeScenario(inp, A_CONST, PROGRAMS[id], {dp, name}, price)` at each step and reading `.piti`. Return the minimum dp where `piti <= target`.

**Why MEDIUM and not LOW — three real hazards:**

1. **PITI is not smooth in dp.** It steps down discontinuously at PMI band boundaries (`pmiBand()` line **575**: >95, >90, >85, >80) and again at 80% LTV where PMI vanishes entirely. A naïve bisection can return a dp that is *inside* a band when a slightly larger dp crossing to the next band is materially cheaper. The solver must snap up to the next band boundary and compare.
2. **The temptation to re-derive.** It would be faster to invert the `k`/`b` coefficients from `maxPriceForScenario`. **Do not.** That breaks the documented `computeScenario` mirror (Project Status §4.5). The solver must call `computeScenario` on every probe, even though it is slower.
3. **Infeasibility must be explicit.** If escrow alone (taxes + HOI + HOA + CDD + flood) exceeds the target, no down payment reaches it — even 100% down. Return `feasible: false` with the floor PITI so the UI can say *"$3,000 is unreachable on this property; escrow alone is $3,140/mo"* rather than showing a nonsense down payment.

**Also required:** `concLimitPct()` (line **599**) varies with LTV on conventional (>90 → 3%, 75–90 → 6%, <75 → 9%). A large required down payment changes the seller-concession ceiling. The Fernando answer must surface that, because it changes what Step 3 can do next.

**Test obligation:** round-trip. Solve dp → `computeScenario` at that dp → assert `piti <= target`; then assert `computeScenario` at (dp − $1,000) gives `piti > target`. Plus band-crossing cases at each of the four PMI boundaries, plus the infeasible case.

---

### N-2 · `bindingAtProperty(inp, res, goal)` — **RISK: LOW**

*Property-level constraint classifier.*

**Inputs:** resolved inputs · the `Engine.run()` result at the entered price · the active goal.

**Outputs:** `{ kind, detail, magnitude, secondary[] }` where `kind ∈ { payment, cash, qualification, program, concession_limit, none }`.

**Method:** pure classification over facts already produced (item 9 table). Ranking rule: a hard elimination (`program`) outranks a shortfall (`cash`, `qualification`), which outranks a goal miss (`payment`), which outranks `none`. `none` returns the optimization-opportunity state.

**Zero calculation risk.** Reads outputs, computes nothing new. This is the function that makes Job 2 Step 3 possible.

---

### N-3 · `debtPayoffImpact(inp, selectedDebts, timing)` — **RISK: MEDIUM-LOW (code) / HIGH (modelling)**

*Serves both item 6 and item 7 — one function, two contexts.*

**Inputs:** resolved inputs · selected debts `[{id, label, monthlyPayment, balance, type}]` · `timing ∈ { before_closing, at_closing }`.

**Outputs:** before/after pairs for `{ maxPrice, binding, qualPrice, comfortPrice, piti, cashToClose, cashRemaining }` plus deltas.

**Method:** construct a modified input object — `debts −= Σ monthlyPayment`; if `at_closing`, `funds −= Σ balance` — then call `Engine.run()` and `maxPriceForScenario()` **unchanged**. Identical in shape to what `pathOutcome()` line **1510** already does with price.

**Code risk is low. Modelling risk is high, and it is yours, not the code's.** Three decisions I need from you before this can be built:

1. **Does an at-closing payoff reduce available funds, or is it treated as a closing-cost line?** Materially different: reducing `funds` moves the cash ceiling at line **749–750** and can trigger the cash-elimination test at line **835**.
2. **Guideline treatment.** Conventional and FHA differ on installment debts with fewer than ten payments remaining, and on paying down versus closing revolving accounts. Does the tool model the guideline, or does it model the arithmetic and flag "verify with lender"? **My recommendation: model the arithmetic, flag the guideline.** That is consistent with how the tool already handles LLPA (line **1416**) and DPA (line **1374**) — compute, then flag for verification. It also keeps the tool compliance-safe.
3. **Can a payoff reduce purchasing power?** Yes — at-closing payoff trades DTI capacity for cash capacity. **The UI must show both directions.** A debt-payoff lever that only ever shows a number going up is misleading, and on a payment-and-cash-constrained buyer it will be wrong.

**Blocked on a new persistence entity.** See §5.

---

### N-4 · `goalMet(inp, outcome, goal)` — **RISK: LOW, but it replaces live behavior**

*Generalizes the hard-coded test at line 2649.*

**Inputs:** inputs · an evaluated structure (from `evalStructure()` or `pathOutcome()`) · the active goal.

**Outputs:** `{ met, shortfallKind, shortfallAmount, explanation }`.

**Method:** switch on goal type. Payment → `piti <= target`. Cash → `cashToClose <= funds` (and, when a cash goal is set, minimize). Reserves → `cashRemaining >= reserveTarget`. Max price → `price <= qualPrice` and no elimination. Custom → the authored predicate.

**Constraint:** when the goal is the current implied default (payment ≤ target **and** cash ≤ funds), `goalMet` must return **exactly** what line 2649 returns today. Prove it with a differential test before switching the call site.

---

## §3. UI changes — screen by screen, plain language, no code

### 3.1 · Persistent Buyer Goal Bar — **NEW, always visible**

A slim bar pinned above all content, present in every mode and at every stage.

Contents: buyer name · active goal (goal type and its value, e.g. "Payment ≤ $3,000/mo") · preferred down payment · available funds.

Behaviour: reads **resolved** values, so on a property screen with a scenario-level override it shows the override and marks it as such ("goal set for this property"). Values are display-only here; clicking opens the relevant input.

**Constraint:** this bar re-renders on every recalculation. It must not become a path by which Section 4 (Counter Offer) inputs re-trigger Sections 1–3. That isolation is deliberate (comment at line **2697**) and must survive. See Risk R8.

---

### 3.2 · Job 1 — Shopping Range screen

**Above the fold, in order:**

1. **Two primary numbers, side by side, large.** Comfort Shopping Max and Maximum Purchasing Power. Both already computed (§1, §2 of Part 1).
2. **Controlling-constraint statement, directly beneath.** One sentence naming which of the two is actually controlling and why, in the existing language. Sourced from the consolidated binding path (see Risk R2 — presentation-side only).
3. **Cash-Limited Buying Power as a third figure.** Displayed always, not only when it is the binding constraint. When it is not controlling it reads as context ("cash supports up to $X — not the limiting factor here"). New display, existing math.
4. **Debt Payoff Lever.** Collapsed by default. Expanded: the buyer's debts as a selectable list, a before/at-closing toggle, and the resulting change to both purchasing-power numbers **and** to cash-limited buying power. Requires N-3 and the new debt entity.

**Below the fold, expandable, unchanged in content:**

- Program comparison — `programCards()` **999**, `renderCards()` **1735**
- Full DTI breakdown — existing per-scenario `front`/`back` and the front-end advisory at **1413**
- Cash-to-close detail — `computeScenario()` fields, already rendered
- Buying-power constraint explanation — **the revived strategy-action layer** (lines 1245–1295), after the `secondary` defect is fixed. See Risk R1.

---

### 3.3 · Job 2 — Property Strategy screen

**Step 1 — Buyer Goal for this property.** A goal selector appearing immediately when a list price is entered. Five options: payment ceiling · minimize cash · preserve $X reserves · maximize price within qualification · custom. Default pulled from the buyer profile / shopping plan; override saved to the property scenario. Overridden state is visually distinct from inherited state — the advisor must always be able to see which is which.

**Step 2 — Answer the goal immediately.** A single block, above everything else:

```
PROPERTY: $461,000
GOAL: Payment at or under $3,000/mo
TO HIT $3,000: Required down payment $XXX,XXX (XX.X% — LTV XX%)
AVAILABLE FUNDS: $200,000
→ FEASIBLE  /  NOT FEASIBLE — short by $XX,XXX
```

Powered by N-1 when the goal is a payment ceiling. Each other goal type gets its own one-line answer using existing outputs — minimize cash reads `cashToClose` from the lowest-cash eligible scenario; maximize price reads `qualPrice`; reserves reads `cashRemaining`.

If feasible: show the structure and stop. Nothing further is displayed by default.

**Step 3 — Strategy layer, only when not feasible.** Opens with the binding constraint from N-2, stated in one line. Then only the strategies relevant to that constraint: seller concession / rate buydown · price reduction · additional down payment · debt payoff at closing · program switch · combinations. Every one of these already has a computation behind it (Part 1 §8, §9) except debt payoff (N-3).

When negotiable seller value exists, the existing negotiation subsystem renders here unchanged — `analyzeNegotiation()` → `negotiationPanelHTML()`. **Including the Unused Negotiation Value row.** No new optimization logic.

**Step 4 — Negotiation rounds.** A round list rather than a single counter field. Each round: actor, price, concession, and a goal verdict from N-4 — *"Does this still accomplish the buyer's goal?"* Same engine, new inputs. Adding a round appends; it does not overwrite. Requires the capture rewrite (§5).

**Step 5 — Accepted / Contract.** A status control marking the scenario accepted. History preserved, all fields remain editable, **no immutable lock**. Serves as the working handoff reference to Arive.

---

### 3.4 · What moves below the fold

Moved down, not out. Every one of these keeps its current rendering function and its current output:

| Output | Render function | Line |
|---|---|---|
| Full program comparison (Conv/FHA/VA) | `renderCards()` / `programCards()` | 1735 / 999 |
| Full DTI breakdown | within `renderSnapshot()` | 1351 |
| Full cash-to-close detail | within `renderCards()` / `familyCardHTML()` | 1836 |
| Counter Offer Analyzer detail | `coPanel1/2/3` | 2600 / 2623 / 2648 |
| Loan comparison analysis | `familyCardHTML()` / `familyGuide()` | 1836 / 1913 |
| Financing cost analysis | `financingCostAt()` consumers | 1468 |
| Gap Solver tabs | `renderGapSolver()` | 2006 |
| Elimination reasons | `elimHTML()` | 1452 |

---

## §4. Existing functions needing new call sites or different wiring

| Function | Line | Change |
|---|---|---|
| `buyingPowerCardsHTML()` | **1300** | Return and render `cashPrice` as a third displayed figure. Already computed at 1306–1307 — currently returned and discarded |
| `constraintLineHTML()` | **1322** | Becomes the single binding-constraint presenter for both modes. Relax the cash suppression at line 1325 so cash shows as context |
| `deriveBinding()` | **1442** | Keep for the "Achievable Price" explanation. **Do not repurpose** — N-2 answers the property question. Two questions, two functions |
| `strategyActionsFor()` + cluster | **1245–1295** | Revive as the below-the-fold constraint explanation. **Fix the `secondary` defect first** |
| `Engine.optimalSplit()` | **969** | Currently exported and never called. Decide: wire it, or document it as intentionally reserved. Leaving dead exported code in a protected block invites a future session to "fix" it |
| `coPanel3()` | **2648** | Replace the local `meets()` (2649) with N-4 |
| `captureNegotiationRounds()` | **3098** | Rewrite for N rounds. Schema already supports it |
| `capturePropertyScenario()` | **3053** | Stop hard-coding `buyer_priority` / `target_payment` / `dp_target_*` / `planned_stay_years` to NULL (3066–3068). Read from the goal control |
| `renderPropertyStrategy()` | **2399** | Becomes the Job 2 orchestrator — currently just a show/hide wrapper |
| `renderSnapshot()` | **1351** | Split. Job 1 above-fold vs the detail block it currently emits as one string |

---

## §5. Persistence changes

### Requires NO migration — schema and resolution already exist

| Need | Existing support |
|---|---|
| Per-property goal for the four existing priorities | `property_scenario.buyer_priority` · `.target_payment` · `.dp_target_value`/`_unit` · `.planned_stay_years`, all NULL=inherit. Resolved at **3177–3181** |
| Negotiation rounds 3, 4, 5… | `negotiation_round.round_number` is a plain smallint; upsert on `(property_scenario_id, round_number)` (Gate C §363). Only the capture function caps it |
| Accepted / contract status | `property_scenario.is_accepted_property` + `.status`; `negotiation_round.is_accepted`. All present, all round-tripped |
| Per-scenario negotiation mode and concession pair | `negotiation_mode` NOT NULL · `offer_concession_value`/`_unit` pair. Present since Gate B.75 |

**This is the largest single finding for scope: the per-property goal work is a UI task, not a data task.**

### Requires migration

| Need | Change | Size |
|---|---|---|
| Reserves goal · custom goal | Add `goal_type` (text) + `goal_value` (numeric NULL) to `property_scenario` **and** `shopping_plan`. NULL=inherit, same pattern as every other override column | Small — two additive nullable columns, no backfill, no RLS change |
| Debt list | **New table `buyer_debt`** — buyer-owned: `buyer_profile_id` FK · `label` · `debt_type` · `monthly_payment` · `balance` · `include_in_dti` · `sort_order`. RLS policy mirroring `buyer_profile` | Medium — new entity, new RLS policy, new round-trip test case, capture/serialize/deserialize additions |
| Debt payoff selection per scenario | `property_scenario.debt_payoff_selection` jsonb (debt ids + timing), or a join table | Small if jsonb |

**Compatibility constraint on the debt list.** `buyer_profile.monthly_debts` (line **2985**) is the field the engine consumes and the 47-scenario baseline was built against. The debt list must **derive** `monthly_debts` as the sum of included debts, and a buyer with no itemized debts must continue to produce the identical scalar. **`inp.debts` must not change meaning.** If it does, every baseline expectation moves.

---

## §6. Risk assessment — what could change existing calculation results

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| **R1** | **Reviving the dead strategy cluster.** `strategyActionsFor` (1262) destructures `secondary` and reads `ctx.highestComfort` (1288); `buyingPowerCardsHTML` supplies neither. It has never executed. Reviving as-is renders `NaN` in dollar figures | **High** — wrong displayed numbers are the worst failure mode in an advisor tool | Define `secondary` explicitly (it appears intended as "the next reachable price ceiling"). Unit-test every branch — Cash, DTI, Comfort Payment, Loan Limit — before it renders to anyone |
| **R2** | **Two independent binding calculations.** `maxPriceForScenario().binding` (per-scenario, four candidates) vs `constraintLineHTML` (cross-program maxima, three candidates, cash suppressed). Consolidating inside the solver is a protected-code change | **High** | Consolidate **presentation-side only**. Do not touch lines 741–756 |
| **R3** | **Re-deriving PITI in a new solver.** N-1 could invert `k`/`b` instead of calling `computeScenario`. That breaks the mirror the whole tool's internal consistency rests on (Project Status §4.5) | **High** | Hard rule: every new solver calls `computeScenario` / `maxPriceForScenario`. Never reimplements. Code review gate |
| **R4** | **Per-property goal changes what the engine optimizes.** Once scenario `buyer_priority` is authorable, `priorityPick`, `pickPathWinner`, `priorityAlloc`, `coMetric`, `concessionVsPrice`, `pickBestOverall` all change behavior for that scenario. Intended — but a saved buyer reopened after this change could display a different recommendation | **Medium** | Re-run the 47-scenario baseline with all scenario overrides NULL and prove byte-identical output. Then add a separate override-case set |
| **R5** | **Debt payoff and the cash ceiling.** At-closing payoff reduces `funds`, moving the cash ceiling (749–750) and the elimination test (835). Purchasing power can go **down** | **Medium** | UI shows both directions. Never present a payoff as a one-way gain |
| **R6** | **Promoting front-end DTI.** "Which DTI constraint binds" could be read as a mandate to make front-end a ceiling. Lines 746–747 explicitly reject that | **Medium** | Front-end stays a flag (845, 1413). Back-end stays the only price cap |
| **R7** | **DOM relocation breaking render paths.** `renderSnapshot`, `renderCards`, `renderGapSolver`, `recalcCounter` write into fixed ids (`snapBody`, `cardsBody`, `gsPanel`, `coPanels`). Moving containers is safe; renaming or removing one fails silently with no error | **Medium** | Move containers, never rename ids. Run `c4b-presentation-integrity.test.js` and the 47-scenario baseline after every DOM change |
| **R8** | **Goal bar breaking Section 4 isolation.** `recalcCounter` is deliberately isolated from Sections 1–3 (comment at 2697). A globally re-rendering bar could create a back-channel | **Medium** | The bar reads state; it never triggers `recalc()`. Assert the isolation in test |
| **R9** | **`monthly_debts` changing meaning.** If the debt list becomes authoritative in a way that alters the scalar the engine consumes, every baseline expectation shifts | **High if mishandled** | `monthly_debts` is derived as the sum of included debts; a buyer with no itemized debts produces the identical scalar. Prove with the baseline |
| **R10** | **N-1 band-crossing.** A dp solve landing inside a PMI band can return a worse answer than the next boundary up | **Medium** | Snap to boundary and compare. Test all four boundaries plus the 80% LTV PMI cliff |

**Regression obligation for every step:** the 47-scenario numerical baseline (`tests/baseline/bse-expected-baseline.json`), before and after. Any change to a `EXPECTED VALUE VERIFIED` field is a STOP.

---

## §7. Recommended implementation sequence

Ordered so that everything with zero calculation risk ships and is verified before anything with non-zero risk starts.

| Step | Work | Migration | New math | Baseline expectation |
|---|---|---|---|---|
| **0** | Approve this scope. Resolve the two modelling decisions in N-3 and Recommendation A below | — | — | — |
| **1** | Record baseline: md5, 47-scenario run, full test-suite pass counts. No code | — | — | Snapshot |
| **2** | **Presentation-only phase.** Cash-limited buying power as a third figure · consolidated binding language · move existing panels below the fold · persistent goal bar (read-only) | No | No | **Byte-identical** |
| **3** | Revive the strategy-action cluster with the `secondary` defect fixed. Below-the-fold constraint explanation | No | No | Byte-identical |
| **4** | **N-2 `bindingAtProperty`** + property-level constraint display (Job 2 Step 3 header) | No | Classification only | Byte-identical |
| **5** | **N-1 `requiredDownForPayment`** + Job 2 Step 2 answer block. **The Fernando deliverable** | No | Yes — new solver | Byte-identical + new N-1 cases |
| **6** | Per-property goal authoring for the four existing priorities. Stop NULLing 3066–3068 | No | No | Byte-identical with overrides NULL, then new override set |
| **7** | `goal_type` / `goal_value` migration · reserves + custom goals · **N-4 `goalMet`** · replace `coPanel3` `meets()` | Small | Yes — N-4 | Differential proof that default-goal behavior is unchanged |
| **8** | Negotiation rounds 3+ — rewrite `captureNegotiationRounds`, rounds UI, per-round goal verdict | No | No | New round-trip cases |
| **9** | Accepted / Contract status (Step 5) | No | No | New round-trip case |
| **10** | **`buyer_debt` table + N-3 debt payoff**, both contexts. Last, because it is the only item needing a new entity, new RLS, and a business decision | Medium | Yes — N-3 | Prove `monthly_debts` derivation is identical for non-itemized buyers |

**Why this order:** steps 2–4 deliver most of the visible redesign with zero risk to a single calculated number, which means Job 1 can be in front of buyers early. Step 5 is the single highest-value new capability (Fernando) and is isolated. Everything requiring a migration is pushed behind everything that does not.

---

## §8. Explicitly NOT in scope for this UI phase

**Protected — untouchable:**

1. Any change to lines **526–1060** (the calculation engine).
2. Any change to `maxPriceForScenario()` — named separately because consolidating binding-constraint language will tempt it.
3. Any change to `computeScenario()`'s PITI assembly, the PMI/MIP tables, `concessionLimitPct`, or the buydown ratio (0.25 per point, line 952 — note the Staging copy's 0.24 remains non-authoritative and out of scope).

**Deferred by prior lock:**

4. FL property-tax / millage integration — locked LAST among approved calculation changes (Project Status §4.2).
5. Comfort Calculator retirement — gated on regression pass **and** live buyer-call validation (Decision L-11).

**Deferred by this scope:**

6. **Multiple properties per buyer, and multiple scenarios per property.** The schema supports both; `captureProperty()` (3041) and `capturePropertyScenario()` (3053) hard-code one of each with a literal `'Scenario 1'`. **Flagging this as the most likely thing to bite you** — see Recommendation B.
7. Arive integration or export of any kind. Step 5 produces a working reference an advisor reads; it does not push data.
8. Immutable contract lock — explicitly excluded per session instruction.
9. Jumbo, ARM, temporary/2-1 buydowns, or any program module beyond Conv/FHA/VA.
10. LLPA pricing accuracy. Line **1416** flags it as advisory; it remains unmodeled.
11. Resolving the 1,157 `EXPECTED VALUE REQUIRES REVIEW` baseline fields.
12. Gate D deployment blockers — Netlify preview verification (§21), production deploy, `404.html`, HSTS `includeSubDomains`, `/node_modules/*` exposure.
13. `'unsafe-inline'` CSP removal / extracting the application script to an external file. That is a structural change, not a UI change.
14. Carried-forward known issues: `num()` coercion (M-4), floating `%` concession base (M-13), unreachable PMI band `c`.

---

## §9. Recommendations — flagged proactively

### A. Do not build "buyer goal" as a second concept alongside "buyer priority." Extend the one you have.

`buyer_priority` already **is** a goal selector: it already carries three of your five goals, it already drives eight separate decision paths, and it is already persisted at both plan and scenario level with working inheritance.

If you add a parallel "goal" concept, you will have two fields that can disagree — a buyer whose priority is `cash` and whose goal is "keep payment under $3,000" will get a recommendation optimized for cash and a verdict measured on payment, and no part of the UI will explain the contradiction.

**Recommendation:** extend `buyer_priority` into the goal model. Add `reserves` and `custom` as values. Keep `target_payment` as what it is today — a constraint that always applies — and let the goal decide what gets *optimized* subject to it. That is a smaller change, it preserves every existing decision path, and it cannot produce a self-contradicting screen.

**This is the one design decision in this scope I would push back on if you disagree**, because getting it wrong is expensive to unwind after per-property overrides ship in step 6.

### B. One property and one scenario per buyer is the real ceiling on Job 2.

Job 2 is "once they find a house." Buyers look at houses, plural, and the advisor's value is often the comparison. Today `captureProperty()` writes an all-NULL property and `capturePropertyScenario()` writes a literal `'Scenario 1'`.

I have left this out of scope because it is a data-layer expansion, not a UI redesign, and it is not required for the Fernando deliverable. But the redesigned Job 2 screen will immediately make its absence obvious. **Recommend scoping it as the next phase, and designing the Job 2 screen now so a property selector can drop in without a re-layout.**

### C. `inp.debts` as a scalar blocks both debt-payoff items. One entity, two features.

Items 6 and 7 look like separate work. They are the same missing entity. Build `buyer_debt` once and both contexts light up from the same N-3 function. That is why they are a single step 10 rather than two.

### D. Decide the fate of the dead code deliberately.

`strategyActionsFor`, `strategyOkCard`, `strategyActionsList`, `powerBadge`, and `Engine.optimalSplit` are all defined and never called. Either wire them (steps 3 and 4 do this for the first four) or document them as intentionally reserved. Dead code inside and adjacent to a protected block is an invitation for a future session to "clean it up" and change something that matters.

---

## §10. Stop point

This document is scope only. No source file was modified. No calculation function was changed. No implementation code was written.

**Awaiting approval on:**

1. This scope as written.
2. Recommendation A — extend `buyer_priority` vs. build a parallel goal concept.
3. The three N-3 modelling decisions: at-closing payoff treatment of funds · guideline modelling vs. flag-for-verification · confirmation that purchasing power may be shown decreasing.
4. Recommendation B — whether multi-property is the next phase.
