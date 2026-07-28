<!--
PERMANENT CONTROLLING DOCUMENT — BUYER STRATEGY ENGINE
File: docs/BSE-Phase0-1-Forensic-Audit.md
Status: FINAL. Phases 0 and 1 CLOSED 2026-07-28.
Origin: Produced in the Cowork session of 2026-07-28 by static forensic inspection.
Companion documents: docs/BSE-Phase2-Architecture.md, docs/BSE-Project-Status.md
Read BSE-Project-Status.md first.
-->

> ## PORTABILITY NOTE — READ FIRST
>
> This is the **complete, final Phase 0 / Phase 1 forensic audit**, preserved verbatim as closed on 2026-07-28. It is not a summary. It is the controlling reference for every calculation, constant, line number, and risk classification relied upon by Phase 2 and by all future implementation work.
>
> **Cross-reference to Phase 2 risk identifiers.** Phase 2 renamed several Phase 1 findings when it built the migration risk register. The most important mappings:
>
> | Phase 1 finding | Phase 2 risk ID | Subject |
> |---|---|---|
> | **C-4(a)** — `setUnit` destructive/lossy write-back (lines 2807–2827) | **M-1** | The `applyState` / unit-conversion risk. **This is the Phase 3 Gate A task and must be fixed before any persistence exists** |
> | C-4(b) — `updateInlineHints` destroys HOA/CDD/flood (lines 1243–1246) | M-6 | Three-state cost fields |
> | C-4(c) — buyer-only cards absorb property-level assumptions (line 1403) | — | Fixed by the Shopping Plan / Property Scenario split |
> | C-5 — Live vs Staging divergence, 0.25 vs 0.24 buydown ratio | M-11 | Live's **0.25** is authoritative |
> | M-1 *(Phase 1 numbering)* — two definitions of "has a price" | M-5 | Resolved by an explicit `analysis_mode` column |
> | C-9 — manual concession split is near-inert | M-12 | Reserve columns, do not surface the control |
> | C-8 — counteroffer delta omits `sellerConcession` | — | Deferred to Phase 7; derive rather than store seller net value |
>
> Note the collision: **"M-1" means the `setUnit` risk in Phase 2 numbering**, and something different in the Phase 1 body text at Section 8.3. Phase 2 and Phase 3 numbering governs.
>
> **Protected calculation functions.** BSE lines 526–1060 (the `Engine` IIFE) are read-only. `maxPriceForScenario` (line 722) and `computeScenario` (line 639) must retain their mirrored PITI assembly. See Sections 2 and 11.
>
> **No source file was modified in Phase 0 or Phase 1.** 54 findings documented, 0 remediated.

---

# BUYER STRATEGY ENGINE — PHASE 0 / PHASE 1
## Data Governance & Forensic Audit — Controlling Reference Document

**HomeWealth Solutions LLC** · Company NMLS #2742458 · FL OFR Mortgage Broker License #MBR8082
Prepared for: Doug Smith, President & Broker, CMA®
Audit date: **July 28, 2026**
Audit type: **Static source inspection only.** No file was modified, no server run, no dependency installed, no deployment made.

---

## AUDIT SCOPE — FILES INSPECTED

| Role | Path | Size | Last modified | Git |
|---|---|---|---|---|
| **Production BSE** | `Tools/Live/internal/buyer-strategy/index.html` | 179,593 B / 2,886 lines | 2026-07-16 | tracked, clean, commit `f006fd3` |
| **Suspect copy — NOT authoritative** | `Tools/Staging/buyer-strategy-v2/index.html` | 169,068 B | 2026-07-16 (later) | **untracked** |
| **FL property tax tool** | `Tools/Live/property-tax.html` | 34,160 B / 821 lines | 2026-07-27 | tracked, commits `9686d53`→`540ccbe` |
| **Comfort Calculator (prod)** | `Tools/Live/buyer/comfort-calculator.html` | 84,648 B / 1,657 lines | 2026-06-17 | tracked |
| Comfort Calculator (2nd copy) | `Tools/Live/buyer/comfort-calculator/index.html` | 83,014 B / 1,647 lines | 2026-06-17 | tracked |
| Support | `Tools/Live/client-tag.js`, `hws-session.js`, `netlify.toml`, `package.json` | — | — | tracked |

**Production version identification.** The production BSE is confirmed by four independent signals: it is the only BSE in the git repository; the working tree is clean; `TOOL-MANIFEST.md` names it as "Buyer Strategy Engine v2 (internal)"; and commit `f006fd3` is captioned "Buyer Strategy Engine — deploy 2026-07-16". It is served at `tools.homewealthsolutions.com/internal/buyer-strategy/`.

**Scope correction accepted before audit.** The audit brief stated the BSE "contains ... recently corrected Florida property-tax calculations." It does not. That work lives in a separate tool. Per your direction, both files were audited and the gap is documented in Section 3.

## GOVERNING SCOPE DIRECTIVES (client-confirmed)

These directives were confirmed by Doug Smith and govern this document.

1. **`Tools/Live/internal/buyer-strategy/index.html` is the authoritative production BSE.** Every calculation reference, line number, formula, and constant in this report is taken from that file.
2. **`Tools/Live/property-tax.html` is the authoritative Florida property-tax calculation engine**, audited separately in Section 3. It is a standalone tool, not a BSE component.
3. **No assumption is made that Florida tax logic is integrated into the BSE.** It is not. Both methodologies are documented exactly as they exist, independently, in Section 3.
4. **Integration of the corrected Florida property-tax methodology into the BSE is a FUTURE ARCHITECTURAL REQUIREMENT.** It is recorded as a requirement, not an open question, and not implemented in this phase. See Sections 9.2, 9.5, and 15.
5. **`Tools/Staging/buyer-strategy-v2/index.html` is a SUSPECT COPY ONLY.** It is **not authoritative for any calculation reference in this document**. Its divergences from Live are documented in finding C-5 for your review. Disposition is your decision after reviewing this audit.
6. **No file was modified.** Static inspection only.

---

# HIGH / CRITICAL RISK FINDINGS

Twelve findings rated HIGH or CRITICAL. Each was verified directly against the source file after discovery.

---

### C-1 — CRITICAL — The BSE contains no Florida property-tax logic at all

A case-insensitive search of all 2,886 lines of the production BSE for `millage`, `homestead`, `save our homes`, `portability`, and `assessed` returns **zero matches**.

The BSE's entire property-tax model is one input, `#taxRate`, defaulting to **1.20%**, with a `%` / `$` toggle:

```js
669:  const taxes = (inp.taxFixed && inp.taxMonthly!=null) ? inp.taxMonthly : price*inp.taxRate/100/12;
```

In `%` mode, tax is a flat percentage of purchase price. In `$` mode it is a fixed monthly escrow that does not vary with price. There is no just value, no assessed value, no taxable value, no exemption, no cap, no county millage.

The corrected Florida logic you are protecting is in `Tools/Live/property-tax.html` — a separate, standalone tool with no code, data, or link relationship to the BSE. Two tools presented to the same buyer will produce different tax figures for the same Florida property, and nothing in either tool discloses that.

**Consequence for the redesign:** "Protect the working Florida tax logic in the BSE" is not an achievable instruction, because it is not there. The real decision is whether the redesigned BSE absorbs `property-tax.html`'s engine, calls it, or continues to use a flat rate. That decision must be made before schema design, because it changes the field list materially (see Section 9).

---

### C-2 — CRITICAL — `property-tax.html` portability can drive the ad valorem tax to $0

**Documented only. Not modified. This is your designated-critical file.**

```js
627:      if (priorMkt > 0 && priorMkt > priorAss) {
628:        portabilityBenefit = Math.min(priorMkt - priorAss, 500000);
629:        portabilityBenefit = Math.min(portabilityBenefit, purchasePrice);
630:      }
632:    assessedAfterPort = Math.max(0, purchasePrice - portabilityBenefit);
```

The $500,000 statutory cap at line 628 is correct. The **upsizing** case is correct. The **downsizing** case is not implemented. Under FS 193.155(8)(b), when the new just value is less than the prior just value, the transferred benefit is proportional: `(new JV ÷ prior JV) × prior differential`. That formula does not appear anywhere in the file, and the code never compares `purchasePrice` to `priorMkt`, so it cannot detect downsizing. Line 629 substitutes a clamp to the purchase price.

**Reproducible failure.** Prior home market $800,000, prior assessed $300,000, new purchase $400,000, millage 18.2515, non-ad-valorem $814.60:

| Step | Statutory | Code |
|---|---|---|
| Differential | $500,000 | $500,000 |
| Ratio (400/800) | 0.50 | *not computed* |
| Transferred benefit | $250,000 | line 629 → $400,000 |
| Assessed after portability | $150,000 | **$0** |
| Ad valorem tax | ≈ $2,053 | **$0.00** |
| Card 3 total displayed | — | **$814.60/yr · $68/mo** |

A $400,000 Florida home displays a $68/month tax escrow. Downsizing retirees are a routine Tampa scenario, so this is reachable in normal use.

---

### C-3 — CRITICAL — The BSE has zero persistence, and a refresh silently restores a fictional buyer

Verified counts across the whole 2,886-line file:

| Mechanism | Hits |
|---|---|
| `localStorage` | **0** |
| `sessionStorage` | **0** |
| `document.cookie` | **0** |
| `indexedDB` | **0** |
| `URLSearchParams` / `location.search` | **0** |
| `history.pushState` | **0** |
| `fetch(` / `XMLHttpRequest` | **0** |
| `jsPDF` / `html2canvas` / export / download | **0** |
| `<script src=` (external dependency) | **0** |

| Event | Survives? |
|---|---|
| Recalculation in-page | Yes |
| Page refresh / F5 | **No** |
| Browser close and reopen | **No** |
| Computer restart | **No** |
| Different browser, same machine | **No** |
| **Different device** | **No** |

The aggravating factor is not the data loss — it is what replaces it. `init()` runs at parse time and restores the hardcoded HTML defaults:

```html
345: <input id="score"     value="740">
346: <input id="ownFunds"  value="40,000">
352: <input id="target"    value="3,200">
353: <input id="income"    value="9,500">
354: <input id="debts"     value="650">
```

A refreshed tab does not show an empty form. It shows a complete, plausible, **fictional buyer**. Anyone glancing at that screen — including you, mid-call — has no visual cue that the real client's numbers are gone.

---

### C-4 — CRITICAL — There is no buyer/property separation, and property inputs actively corrupt buyer inputs

This is the single most important architectural finding for your saved-Buyer-Profile vision. The BSE has no concept of buyer-level versus property-level data. Every value is a DOM input in one flat form, and three separate mechanisms let property data destroy buyer data.

**(a) `setUnit` rewrites the buyer's down-payment target using the property's list price.** Lines 2807–2827, verified verbatim:

```js
2810:  const fieldId = which==='dp' ? 'dpTarget' : 'taxRate';
2811:  const price = rawBlank('price') ? 0 : num('price');
2815:  if(raw!=null && raw>0 && price>0){
2817:      if(prev==='pct' && unit==='dollar') $('dpTarget').value = Math.round(raw/100*price).toLocaleString('en-US');
2818:      else if(prev==='dollar' && unit==='pct') $('dpTarget').value = +(raw/price*100).toFixed(2);
```

Sequence: buyer's target is 10% down → you enter list price $400,000 → you click `$` → **the buyer's target is permanently rewritten to `40,000`** → you move to a $600,000 property → the buyer now carries a stale 6.7% target derived from a house they walked away from. The original entry is not retained anywhere — not in a variable, not in a data attribute, not recoverable.

The conversion is also **lossy**: `Math.round` on the `%`→`$` leg, `.toFixed(2)` / `.toFixed(3)` on the `$`→`%` leg. A 3.375% target round-trips to 3.37% and drifts further with each toggle.

Worst case is Shopping Range Mode. The conversion is gated on `price>0` (line 2815), and Shopping Mode is defined by the price field being blank. So in Shopping Mode **no conversion runs** — only `unitState` changes, and the same digits are silently reinterpreted under the new unit. A tax entry of `1.2` meaning 1.2% becomes "$1.20 per year," which `gatherInputs` converts to `$0.10/month` of escrow. No warning.

**(b) `updateInlineHints` destroys HOA / CDD / flood entries at render time.** Lines 1243–1246, verified:

```js
1244:    const on=$(na).checked;
1245:    $(f).disabled=on;
1246:    if(on) $(f).value='0';
```

Ticking an N/A box overwrites the typed value with `'0'`. Un-ticking does not restore it. And because `gatherInputs` (line 2401) runs *before* `updateInlineHints` (line 2420) inside `recalc`, the numbers rendered in response to that tick were computed from the **old non-zero value** — the display is one cycle stale relative to the field.

**(c) The two headline "buyer-only" numbers are not buyer-only.** The code comments at lines 1343–1345 and 1400–1402 state that Comfort Purchase Price and Max Qualifying Price "never move when a specific list price is entered or removed." The implementation:

```js
1403:  const bpViable = Engine.run(Object.assign({}, inp, {shopping:true, price:0}), A_CONST).scenarios;
```

The override neutralises `shopping` and `price` only. It **retains** `taxFixed`, `taxMonthly`, `hoa`, `cdd`, `flood`, `hoi`, and `dpTarget` — all property-level — and every one of them feeds the max-price solver:

```js
735:    const taxFixedHere = inp.taxFixed && inp.taxMonthly!=null;
736:    const taxPer = taxFixedHere ? 0 : inp.taxRate/100/12;
737:    const k = pf*L1 + miPer + taxPer;
738:    const b = inp.hoi + inp.hoa + inp.cdd + inp.flood + (taxFixedHere ? inp.taxMonthly : 0);
```

Entering a condo's $340/month HOA permanently moves the buyer's stated shopping range. That is precisely the failure your Buyer Profile vision is designed to prevent, and it is happening today inside a single session.

---

### C-5 — CRITICAL — A suspect uncommitted BSE copy exists, and it silently changes a pricing constant

> **Status: SUSPECT COPY ONLY. Not authoritative. Not used as a calculation reference anywhere in this document.** Every formula, constant, and line number cited in this audit comes from the Live file. This finding documents divergences for your review only; disposition is your decision.

`Tools/Staging/buyer-strategy-v2/index.html` sits **outside the git repository**, is 10 KB smaller than the deployed file, and has a later modification time. Chronologically it appears to be **later work rather than an older restore** — it adds five functions that do not exist in Live (`advisorySnapshot`, `recSentenceHTML`, `offerStrategyBlockHTML`, `compareSummaryHTML`, `coRestructureSave`), adds roughly 30 net-new CSS classes, and leaves 11 functions orphaned — the signature of a fast refactor that stripped callers without cleaning up definitions.

**Being later in time confers no authority.** It is unversioned, unreviewed, undeployed, and it removes functionality (below). Treat the chronology as a fact about the file, not as an argument for adopting it.

`A_CONST` and `PROGRAMS` are byte-identical between the two. Exactly **one numeric constant differs** — and it is a pricing constant, changed consistently at all five computation sites:

| Site | Live | Staging |
|---|---|---|
| `applyConcession` | `round125(points*0.25)` | `round125(points*0.24)` |
| `concessionToCloseGap` ×2 | `/0.25`, `*0.25` | `/0.24`, `*0.24` |
| `additionalForPayment` ×2 | `/0.25` | `/0.24` |

That is the points-to-rate ratio: "1 point buys 0.25%" became "1 point buys 0.24%". Every buydown dollar figure, every break-even, and every "concession needed to hit target" number differs by roughly 4% between the two files. The consistency across all five sites indicates intent, not accident — but it is bundled invisibly inside what otherwise reads as a cosmetic refactor, it is unreviewed, and it is unversioned.

Staging also **removes the elimination-reason list** (`elimHTML` is orphaned), the confidence-level model, the LLPA warning, buydown break-even analysis, and most of the negotiation comparison table.

**Treatment for the redesign: Live is the source of truth. Staging is a suspect, non-authoritative copy that happens to live on disk.** The 0.25 vs 0.24 question is a business decision only you can make — Live's **0.25** is the authoritative value for the regression baseline (scenario R-29) and for every figure in this report until you decide otherwise.

---

### C-6 — HIGH — Comfort Calculator and BSE disagree by $115,338 on maximum purchase price at their own defaults

Sixteen dimensions compared. **Fifteen differ.** Worked example using each tool's shipped defaults, identical buyer ($114,000/yr income, $650 debts, $3,200 target, $40,000 cash, 6.75%, 30 years, 740 FICO):

| | Comfort Calculator | BSE | Δ |
|---|---|---|---|
| Max purchase price | **$524,047** | **$408,709** | **$115,338** |
| Recommended / comfort price | $399,080 | $408,709 | $9,629 |
| Implied down payment | $40,000 = 7.63% | $20,435 = 5.00% | — |
| Cash required to close | $56,386 | $32,083 | $24,303 |
| PMI at recommendation | $254.35/mo | $122.95/mo | $131.40/mo |
| Binding constraint disclosed | none | "Comfort Payment" | — |

Ranked contributions to the gap, each isolated inside the Comfort Calculator's own formula:

1. **DTI default 49.99% vs BSE's program-set 45% conventional back-end — $65,893, or 57.1% of the entire gap.**
2. PMI 0.85% flat vs BSE's 740/95% table lookup of 0.38% — +$27,869 (Comfort is conservative here, partly offsetting #1)
3. Cash-to-close ceiling — **absent entirely in the Comfort Calculator**
4. HOI $200/mo vs $150/mo — +$6,950
5. Taxes flat $416.67/mo vs 1.20% of price — −$11,600 at this price level
6. Fixed-dollar down payment producing a 7.63% tier that matches no loan program

The direction matters more than the magnitude. At the Comfort Calculator's own $524,047 headline, BSE-style cash to close would be $54,521 against $40,000 of available funds — **the headline answer is $14,521 short of being fundable, sits above the conventional DTI limit, and rests on a down-payment percentage no program offers.** The tool flags none of it.

---

### C-7 — HIGH — Comfort Calculator strands borrowing power on any low-LTV scenario

Verified. `calcLoan` subtracts PMI capacity from the payment denominator **unconditionally**:

```js
821:  const pmiMonthly = (pmiRate || 0) / 100 / 12;
828:  return available / (pmtFactor + pmiMonthly);
```

But `calculate()` only charges PMI above 80% LTV:

```js
1098:  const comfortPMI = comfortLTV > 80 ? comfortLoan * (pmiRate / 100) / 12 : 0;
```

With $200,000 down, a $3,200 comfort target, taxes $5,000, HOI $2,400, rate 6.75%: the solved payment is **$2,945.65** against the buyer's stated $3,200 — **$254.35/month and roughly $39,215 of loan left unused.** Present in both deployed copies. The BSE has no analogue; its `miPer` is zero whenever `pmiBand` returns null.

---

### C-8 — HIGH — The Counteroffer Analyzer's headline delta omits the buyer's own concession ask, and the sign can flip

```js
2726:  const netVal = (list>0 && cp>0) ? ((list - cp) + cc) : null;
2727:  const change = (netVal!=null) ? (netVal - inp.negotiatingRoom) : null;
```

`inp.negotiatingRoom` is **only** the price gap. The explicit concession ask is a separate field, `inp.sellerConcession`. The file computes the correct total ask in three other places — including the label rendered directly above this panel:

```js
2609:    sub.textContent = (sc>0 && gap>0) ? 'total ask to seller '+money(gap+sc) : '';
2034:  const requested = (inp.negotiatingRoom||0) + Math.max(0,(inp.sellerConcession||0));
```

Line 2727 is the only place in the file that treats `negotiatingRoom` alone as "our ask."

**Failure case.** List $500,000; you offer $490,000 and ask $5,000 in concessions (true ask $15,000). Seller counters $495,000 with $2,000 → `netVal = $7,000`. Panel displays `−$3,000 vs. our ask` and `we requested $10,000`. True delta is **−$8,000** against a **$15,000** request. With a $12,000 counter the panel renders a green **`+$2,000`** when the seller actually came in **$3,000 short** — the tool tells you the seller over-delivered when they under-delivered.

---

### C-9 — HIGH — Manual concession split changes the display but not the recommendation

`#concBuydown` and `#concCosts` are never read by `gatherInputs`. They live only in the module object `concSplit` (line 1102), which is consumed at exactly one place — line 2205, inside the Gap Solver's comparison table. `pathOutcome` allocates exclusively via `optimalConcAlloc`.

So "Adjust split manually" visibly changes two fields and one table, while the negotiation panel and the program cards keep showing the **optimal** allocation. And `normalizeSplit(appliedConcTotal)` runs unconditionally at line 2429 — including when `auto === false` — so a manual split is silently re-clamped whenever the applied total changes.

---

### C-10 — HIGH — `property-tax.html` blends school and non-school millage 50/50, and treats the second exemption as a floor

Both documented only, not modified.

**(a) The 50/50 blend.** Lines 636–639:

```js
636:      schoolTaxable    = Math.max(0, assessedAfterPort - 25000);
637:      nonSchoolTaxable = Math.max(0, assessedAfterPort - 50000);
638:      const avgTaxable = (schoolTaxable + nonSchoolTaxable) / 2;
639:      homesteadAdVal   = avgTaxable * (millage / 1000);
```

The taxable values are split correctly; the **millage is not**. Averaging the two taxable values against one blended rate is arithmetically equivalent to assuming school levies are exactly 50% of total millage. In Florida they typically run 33–40%. The comment at line 635 acknowledges this as an approximation. At $500,000 and 18.2515 mills the code yields $8,441.32 against a true $8,386.56 at a 38% school share — **$54.76/yr overstated**, scaling as `(0.5 − schoolShare) × $25,000 × millage/1000`.

Related: the on-screen breakdown table (lines 772–777) shows two $25,000 exemption rows implying $50,000 of relief, then prints an ad-valorem total computed from the blend. **A borrower cannot reproduce the displayed total from the displayed rows.**

**(b) Second exemption as a floor.** Line 637 uses `assessedAfterPort − 50000`, correct only when assessed value ≥ $75,000. Below that it over-exempts. This is not academic here, because portability can push assessed value under $75,000 on an ordinary purchase — a $500,000 buy with a $450,000 transferred benefit yields assessed $50,000, computed taxable $12,500 against a correct blended ~$25,000, roughly **halving** the estimate.

---

### C-11 — HIGH — Program constants are two annual cycles stale, with no staleness indicator

```js
1134: const A_CONST = {
1135:   ufmip:1.75, fhaMipHigh:0.55, fhaMipLow:0.50,
1136:   vaFirst:2.15, vaSub:3.30,
1137:   fhaLimit:498257, confLimit:766550,
1138:   pmi:Engine.PMI
1139: };
```

- `confLimit: 766550` is the **2024** baseline conforming limit (2025 was $806,500).
- `fhaLimit: 498257` is the **2024 FHA national floor**. FHA limits are county-specific, and every Florida metro except the lowest-cost counties exceeds the floor — 2024 Miami-Dade/Broward/Palm Beach was $621,000, Monroe $929,200, Collier $684,250. The elimination message calls this value the "FHA county loan limit" while using the national floor.
- Rate defaults 6.750 / 6.250 / 6.125 are consistent with a mid-2024 sheet.

The loan-limit ternary is duplicated at five separate sites (`752`, `753`, `831`, `1354`, `1557`, `1592`) — any correction must be made in all of them.

---

### C-12 — HIGH — Two deployed Comfort Calculators, one of which silently ignores share links

Both `buyer/comfort-calculator.html` and `buyer/comfort-calculator/index.html` are live on Netlify and share one localStorage key (`hws_comfort_calc_v4`). Their calculation engines are byte-identical — but the directory copy has **no** `buildShareURL`, `copyShareLink`, or `applyURLParams`, and no Share button.

A share URL always points at the flat file (the base URL is hardcoded at line 1615). But if anyone reaches the pretty URL with query params attached, **the directory copy ignores them and loads that recipient's own localStorage instead** — two live URLs showing different numbers for the same link, with no error.

---

**Additional findings rated MEDIUM appear in Sections 5 and 12. No CRITICAL finding was remediated; all remain in the code exactly as found.**

---
# 1. EXECUTIVE SUMMARY OF EXISTING BSE ARCHITECTURE

The Buyer Strategy Engine v2 is a **single self-contained HTML file** — 2,886 lines, 179,593 bytes — with exactly one inline `<script>` block (line 526) and **no external dependencies of any kind**. No `<script src>`, no `<form>`, no `<iframe>`, no `<img>`, no CDN, no network call. It runs fully offline and has zero supply-chain surface. That property is genuinely valuable and will be lost the moment Supabase is added; it is worth naming as a deliberate trade rather than an accident.

## Layer map

| Lines | Layer | Character |
|---|---|---|
| 1–525 | CSS + HTML form markup | ~32 inputs, all `type="text"` / `number` / `checkbox` / `select` |
| **526–1060** | **`Engine` IIFE — pure math** | UI-independent, deterministic, no DOM access |
| 1062–1141 | UI helpers, module-level mutable state, `A_CONST` | 11 pieces of hidden state |
| **1142–1200** | **`gatherInputs()`** | The only bridge from DOM to model |
| 1202–1504 | Section 1 — Qualification Snapshot | |
| 1506–1776 | Negotiation Strategy Engine | |
| 1778–2020 | Section 2 — Recommendation cards | |
| 2022–2332 | Section 3 — Gap Solver | |
| 2337–2395 | Change log | in-memory only |
| **2400–2438** | **`recalc()` — master orchestrator** | |
| 2445–2750 | Section 4 — Offer Strategy / Counteroffer Analyzer | |
| 2743–2886 | Event wiring + `init()` | self-executes at parse time |

## Architectural characteristics that matter for the redesign

**The Engine is genuinely well-separated.** Lines 526–1060 contain no DOM references. Every function takes two argument objects — `inp` (buyer/property inputs) and `A` (assumption constants) — and returns plain data. This is the single best thing about the existing architecture and it is what makes the "preserve the calculation engine" goal realistic. The Engine could be lifted into a module essentially as-is.

**Everything above the Engine is not separated at all.** Output is generated by string concatenation into `innerHTML`. There is no component boundary, no state object, no re-render primitive. `gatherInputs()` reads ~32 DOM elements, applies unit conversions and derivations inline, and returns a computed object that is **not round-trippable** — you cannot save its output and restore the UI from it. That single fact is the largest piece of work in the persistence migration.

**Two argument objects flow through everything.** `A_CONST` (line 1134) holds UFMIP, FHA MIP rates, VA funding fees, loan limits, and a reference to the PMI table. It is a module constant with no UI. Every assumption you would want to version-stamp on a saved scenario lives here.

**Everything is 30-year fixed.** `const N = 360;` at line 533 is a module constant. There is no loan-term input anywhere. The two rate solvers at lines 2171 and 2557 hardcode `360` again rather than referencing `N`.

**Boot is synchronous.** The file ends with a bare `init();` that immediately calls `recalc()`. There is no async bootstrap, no loading state.

**Recalculation is expensive and unbatched.** `init` binds `recalc` to both `input` and `change` on every control, and `attachFormatting` adds a third on blur for ten dollar fields. Each `recalc` performs roughly **six full engine runs** — the primary `Engine.run`, three inside `analyzeNegotiation`→`eligibleAt`, one inside `recalcCounter`→`counterScenario`, plus up to two 60-iteration bisections and four more `counterScenario` calls in `optimalRestructure`. No debounce, no memoization. Correct, but it will not tolerate a network round-trip on the same path.

## Programs and coverage

Three program families: Conventional (min score 620, DTI 28/45), FHA (min score 500, DTI 31/43), VA (min score 0, DTI 41/41). Up to six scenarios generated: Conv 3% (FTHB only) / 5 / 10 / 20 / custom above 20.5%, FHA 3.5% (score ≥580) or FHA 10% (500–579), VA 0%.

Not implemented, and flagged as intended extension points in the header comment at lines 527–531: **USDA, jumbo, DPA, ARM, HECM, non-QM, second liens/HELOC, MCC, temporary buydowns (2-1 / 3-2-1), and any loan term other than 30 years.**

---

# 2. COMPLETE CALCULATION FUNCTION INVENTORY

Every function is listed. Risk level is the risk **if modified**. "Working" means it produces the result its code intends; suspected defects are noted and were not fixed.

## 2.1 Core Engine — amortization (lines 536–551)

| Function | Line | Purpose | Inputs | Outputs | Depends on | Used at | Working | Risk |
|---|---|---|---|---|---|---|---|---|
| `pmt` | 536 | Level-payment annuity, monthly P&I | annual %, months, PV | Number | — | 544, 661, 725, 954, 1515, 2171, 2182, 2557 | Yes | **Critical** |
| `balanceAfter` | 541 | Remaining principal after n payments | PV, rate, n, monthsPaid | Number | `pmt` | 548, 702, 1517 | Yes | **High** |
| `monthToBalance` | 547 | First month balance ≤ target | PV, rate, n, target | 1–360 or null | `balanceAfter` | 684 | Yes — linear scan, up to 360 iterations per conv scenario; hottest loop in the engine | Medium |
| `round125` | 551 | Snap rate delta to nearest 1/8 | Number | Number | — | 952, 2173, 2180 | Yes | Medium |

`monthToBalance` targets `price × 0.80` — 80% of **original purchase price**, matching the HPA automatic-termination rule. It does not model the 78% rule or midpoint-of-amortization.

## 2.2 Core Engine — mortgage insurance (lines 554–590)

| Function | Line | Purpose | Depends on | Used at | Risk |
|---|---|---|---|---|---|
| `scoreBucket` | 554 | FICO → PMI table row | — | 586 | **High** |
| `pmiBand` | 575 | LTV → PMI table column | — | 583 | **High** |
| `pmiRate` | 582 | Annual PMI % lookup | `pmiBand`, `scoreBucket` | 649, 732 | **Critical** |
| `fhaMipRate` | 588 | FHA annual MIP % | — | 653, 733 | **High** |

**Conventional PMI table, verbatim (lines 565–574), annual % of base loan:**

| FICO | a: LTV > 95 | b: 90–95 | c: 85–90 | d: 80.0001–85 | ≤ 80 |
|---|---|---|---|---|---|
| 760+ | 0.35 | 0.30 | 0.22 | 0.15 | 0 |
| 740–759 | 0.45 | 0.38 | 0.28 | 0.18 | 0 |
| 720–739 | 0.57 | 0.48 | 0.35 | 0.22 | 0 |
| 700–719 | 0.70 | 0.58 | 0.43 | 0.27 | 0 |
| 680–699 | 0.85 | 0.70 | 0.52 | 0.32 | 0 |
| 660–679 | 1.05 | 0.88 | 0.65 | 0.40 | 0 |
| 640–659 | 1.35 | 1.10 | 0.82 | 0.52 | 0 |
| <640 | 1.60 | 1.32 | 1.00 | 0.65 | 0 |

No DTI adjustment, no occupancy/property-type adjustment, no single-premium or lender-paid MI, no coverage-percentage input. UI disclaimer at line 396: "PMI rates are illustrative — actual lender quotes vary." `pmiBand` has **no upper bound** — an LTV of 105% still returns `'a'`.

**FHA MIP.** `fhaMipRate` is a two-value step: LTV > 95 → 0.55%, else 0.50%. No term split, no loan-size tiers. UFMIP is 1.75%, **always financed**, never paid in cash. Life-of-loan is keyed off the scenario's down-payment percent, not computed LTV: `if(sc.dp>=10){ mipDropMonth=132; mipLife=false; } else { mipLife=true; }` (line 654). MIP is computed on the UFMIP-inclusive loan; conventional PMI is computed on the base loan. That asymmetry is intentional and matches both programs' conventions.

**VA funding fee.** No dedicated function — inlined at lines 656, 726–728, and 1485.

| Condition | Fee % of base loan |
|---|---|
| `vaExempt === true` | 0.00 |
| First use (default) | 2.15 |
| Subsequent use | 3.30 |

Down-payment tiering (1.50% at 5–9.99%, 1.25% at 10%+) is absent, but unreachable — the VA module only ever emits a 0%-down scenario. No cash-out, IRRRL, or entitlement math. VA carries no monthly MI, correctly.

## 2.3 Core Engine — costs and limits (lines 593–606)

**`closingCost(baseLoan, inp, forceePct)` — line 593. Risk: High.**

```js
594:      if(!forceePct && !inp.shopping && inp.ccOverride>0) return inp.ccOverride;
595:      return baseLoan * inp.ccPct/100;
```

Default **3.00% of base loan** (`#ccPct`, line 389). A dollar override applies only in Specific Scenario Mode. Called from exactly one place, line 674.

Three documented defects: (1) `forceePct` is a typo of `forcePct` and is never passed — the branch is dead; (2) `maxPriceForScenario` does **not** call this function, re-deriving cash from `inp.ccPct` alone at line 749, so with a dollar override in play, `maxPrice`/`binding` are computed from the percentage while `cashToClose` uses the override — the two disagree; (3) closing costs are a single undifferentiated bucket with **no prepaids, no escrow reserves, no per-diem interest, no doc stamps or intangible tax**, so `cashToClose = down + closing` is systematically low against a real CD.

**`concessionLimitPct(id, ltv)` — line 599. Risk: High.**

| Program | LTV | Limit (% of purchase price) |
|---|---|---|
| FHA | any | 6 |
| VA | any | 4 |
| Conventional | > 90 | 3 |
| Conventional | 75–90 | 6 |
| Conventional | < 75 | 9 |

Two notes: the conventional boundary is `ltv>=75 → 6`, so at exactly 75.00% LTV the tool gives 6% where the agency grid gives 9% — a real off-by-boundary. And **occupancy is not modeled at all** — investment property's 2% cap does not exist; every scenario is treated as owner-occupied.

## 2.4 Core Engine — the payment engine

**`computeScenario(inp, A, prog, sc, price)` — line 639. Risk: CRITICAL.**

This is the heart of the tool. Assembly, in order:

```
dpFrac    = sc.dp/100
down      = price × dpFrac
baseLoan  = price − down
ltv       = baseLoan/price × 100            ← always price-based; no appraised-value input exists
rate      = prog.rate(inp)                  ← per-program user input

conv: miRate = pmiRate(A, score, ltv);          loanAmount = baseLoan
fha:  financedFee = baseLoan × 1.75/100;        loanAmount = baseLoan + fee;  miRate = fhaMipRate
va:   financedFee = baseLoan × (0|2.15|3.30)/100; loanAmount = baseLoan + fee; no MI

pi        = pmt(rate, 360, loanAmount)
monthlyMI = conv ? baseLoan×miRate/100/12 : fha ? loanAmount×miRate/100/12 : 0
taxes     = taxFixed ? taxMonthly : price × taxRate/100/12      ← line 669
fixedEsc  = hoi + hoa + cdd + flood
escrow    = taxes + fixedEsc
PITI      = pi + monthlyMI + escrow

closing      = closingCost(baseLoan, inp)
cashToClose  = down + closing               ← financed fees excluded from cash
cashRemaining= funds − cashToClose

front = PITI / income × 100
back  = (PITI + debts) / income × 100
```

**The tax line, verbatim (lines 666–669):**

```js
666:  // Property tax: a confirmed annual-dollar entry on a specific deal is a fixed
667:  // monthly amount; otherwise it scales with price as a rate (always so in
668:  // Shopping Range Mode, where there is no price to divide a dollar against).
669:  const taxes = (inp.taxFixed && inp.taxMonthly!=null) ? inp.taxMonthly : price*inp.taxRate/100/12;
```

MI cancellation (lines 681–689): conventional solves the true 80%-of-price crossover month via `monthToBalance`; FHA uses `mipDropMonth` (132 or null).

Financing cost over the planned stay (lines 691–705): `totalCostHorizon = interestPaid + miCost + financedFee`. Principal is deliberately excluded as equity kept, not cost. This is the primary sort key for long holds.

Returns 39 named properties (full list: `id, label, name, color, dp, ratios, lowScore, price, down, baseLoan, loanAmount, ltv, rate, baseRate, financedFee, feePct, feeLabel, miRate, monthlyMI, miMode, mipLife, mipDropMonth, pi, escrow, taxes, fixedEsc, piti, closing, cashToClose, cashRemaining, front, back, cancelMonth, postCancelPITI, miCostHorizon, totalCostHorizon, concLimitPct, concLimit, conc`). Later mutated by `run` with `maxPrice, binding, comfortPrice, qualPrice, frontFlag, requiresGift, dpDimmed, dpNote`, and by `pickBestOverall` with `_gapMode, _reason`.

Used at 825, 1390, 1556, 1591, 2217, 2495, 2498.

## 2.5 Core Engine — the buying-power solver

**`maxPriceForScenario(inp, A, prog, sc)` — line 722. Risk: CRITICAL.**

**Closed-form, not iterative.** It linearizes PITI as `PITI = k·price + b` and inverts:

```js
729:      const L1 = (1-dpFrac)*(1+feeFrac);          // loanAmount per $1 price
737:      const k = pf*L1 + miPer + taxPer;           // PITI per $1 price
738:      const b = inp.hoi + inp.hoa + inp.cdd + inp.flood + (taxFixedHere ? inp.taxMonthly : 0);
739:      const priceForPITI = P => k>0 ? (P - b)/k : Infinity;
```

`k` and `b` mirror `computeScenario`'s PITI assembly exactly, including the conv-MI-on-baseLoan vs FHA-MI-on-loanAmount asymmetry. **This is why max price reproduces the payment, and it is the invariant any refactor must preserve.**

**Binds on the minimum of four ceilings:**

| Ceiling | Line | Formula |
|---|---|---|
| Comfort Payment | 742 | `priceForPITI(inp.target)` |
| Back-end DTI | 744 | `priceForPITI(ratios.back/100 × income − debts)` |
| Cash to Close | 750 | `funds ÷ (dpFrac + (1−dpFrac)×ccPct/100)` |
| Conforming / FHA Loan Limit | 752–753 | `limit ÷ (1−dpFrac)` |

Front-end ratio is **deliberately excluded** as a ceiling (comment at lines 746–747) and surfaced only as `s.frontFlag`. VA gets no loan-limit ceiling — treated as unlimited, matching post-2020 full entitlement.

Returns `{ maxPrice, binding, comfortPrice, qualPrice, k, b }`. Documented defects: ignores `ccOverride`; **seller concessions never enter the ceiling set**, so a concession can raise real affordability but never raises `maxPrice`; no reserve requirement, no minimum-borrower-contribution rule, no gift seasoning.

## 2.6 Buying power — where the three numbers live

| Concept | Source | Line |
|---|---|---|
| **Maximum Buying Power** | `maxPriceForScenario` → `maxPrice` (min of four ceilings) | 766 |
| **Comfort Buying Power** | `comfortPrice = priceForPITI(inp.target)` | 761 |
| **Max Qualifying Price** | `qualPrice = priceForPITI(back-end DTI capacity)` | 762–764 |
| **Cash-Limited Buying Power** | `funds ÷ cashDenom` — computed in **two** places | 749–750 **and** 1351–1353 |

Cash-limited buying power is duplicated: once inside the Engine as a ceiling, once in `buyingPowerCardsHTML` for display, plus a third variant in the dead helper `cashAtPrice` (1293). The display copy ignores `ccOverride`; the Engine copy also ignores it. They agree today by coincidence of both being wrong the same way.

Both headline cards are computed from a price-independent re-run at line 1403 — see finding C-4(c) for why that re-run is not actually price-independent.

## 2.7 Core Engine — orchestration and selection

| Function | Line | Purpose | Risk |
|---|---|---|---|
| `programEliminations` | 770 | Price-independent gating list | Low — **result is discarded at 1490; dead** |
| `dpMatches` | 788 | Down-payment target matcher, ±1% of price tolerance | Medium |
| `run` | 806 | Enumerate → gate → price → bucket all scenarios | **Critical** |
| `pickBestOverall` | 863 | The decision hierarchy | **High** |
| `reasonFor` | 925 | Prose justification string | Low |
| `applyConcession` | 946 | Consequences of a concession allocation | **High** |
| `optimalSplit` | 969 | Concession allocation | Low — **zero call sites; dead** |
| `priorityPick` | 979 | Priority-aware scenario pick | Medium — **duplicated at 1838** |
| `programCards` | 999 | Build the Section 2 family cards | **High** |

**`run` — line 806.** Returns `{scenarios, eliminated, dpDimmed}`. Specific-mode hard eliminations at lines 830–843: loan limit exceeded, cash to close short, back-end DTI exceeded. **These checks only run when `!inp.shopping`** — in Shopping Mode the same constraints are absorbed into `maxPrice` instead, so the elimination list is nearly empty in Shopping Mode. Intentional, but it means the two modes surface eligibility very differently.

**`pickBestOverall` — line 863.** Five stages:

1. **Cash-preservation filter** (870–879) — higher down-payment tiers survive only if priority is `payment` AND payment savings > **$150/mo** AND payback < **36 months**.
2. **$500 reserve floor** (884–885) — prefer scenarios leaving ≥ $500.
3. **Comfort pool / gap mode** (887–889) — if nothing clears the target payment, `gapMode = true`.
4. **Primary metric by planned stay** (896–899):
   - `stay ≤ 3` → maximize `cashRemaining`
   - `stay ≤ 7` → minimize `piti`
   - `stay > 7` → minimize `totalCostHorizon`
5. **Tiebreaker cascade** (904–916) — near-tie windows of **$250 cash / $50 payment / $2,500 financing cost**, then lower cash to close (>$2,000), then lower financing cost (>$2,500), then program rank **VA < Conv < FHA**.

The comparator is **not a strict weak ordering** — the `near` test is pairwise and non-transitive, so `Array.prototype.sort` can produce different winners depending on input order when three or more scenarios are near-tied.

**`applyConcession` — line 946.** Buydown pricing is an embedded rule, not a table: **1 point = 1% of loan = 0.25% rate reduction, linear and unbounded**, snapped to eighths by `round125`. There is no point-cost curve and no temporary-buydown structure. `total` uses the un-capped `costs` while `newCash` uses `costsAlloc` — allocating more to costs than actual closing costs counts against the concession limit while delivering zero benefit, silently. `over` is a flag only; callers must clamp.

## 2.8 UI layer — input gathering

**`gatherInputs()` — line 1142. Risk: CRITICAL.** Reads 32 DOM elements plus three pieces of module state. Full field table appears in Sections 6–8.

Coercion helpers (1067–1068): `num()` strips everything except digits, `.`, `-`, then `parseFloat(...) || 0`. **No clamping. Negatives pass through. `"1.2.3"` → `1.2`.**

Documented defects: blank score → `Math.max(300, 0)` → **300**, which reads as catastrophic credit rather than "unknown," eliminating every program; `dpTarget` is discarded when `≤ 0`, so a legitimate 0%-down VA intent is treated as no target; `"0"`, `"."`, `"-"` in `#price` all set `shopping = false` while `inp.price = 0`, putting the badge in "Specific Scenario" while Section 2 stays hidden — **two different definitions of "has a price"** (`rawBlank` at 1144 vs `> 0` at 2446).

## 2.9 UI layer — remaining functions

| Function | Line | Purpose | Risk | Status |
|---|---|---|---|---|
| `liveComma` | 1072 | Live comma formatting with cursor restore | Low | live |
| `normalizeSplit` / `renderSplitFields` | 1106 / 1116 | Manual concession split fields | Medium | live |
| `updateInlineHints` | 1203 | All `.sub` hints, mode badge, N/A field state | **High** (1243–1246) | live — destructive |
| `dpCreditFlag` | 1282 | >20% down with sub-620 credit flag | Low | live |
| `cashAtPrice` | 1293 | Cash needed at a price | Low | **dead** |
| `powerLabel` / `powerBadge` | 1294 / 1295 | Binding-constraint badges | Low | **dead** |
| `strategyOkCard` / `strategyActionsList` / `strategyActionsFor` | 1302–1308 | Coaching subsystem | Low | **dead — no caller constructs the required `ctx`** |
| `buyingPowerCardsHTML` | 1346 | The two headline cards | **High** | live |
| `constraintLineHTML` / `offerStatusHTML` | 1368 / 1383 | Limiting-factor lines | Medium | live |
| `renderSnapshot` | 1397 | Section 1 | **Critical** | live |
| `statHTML` | 1478 | Stat tile markup | Low | live |
| `maxLoanAt` | 1480 | Max loan at the ceiling price | Medium | live |
| `deriveBinding` | 1488 | Binding-constraint string | High | live |
| `elimHTML` | 1498 | Elimination-reason list | Medium | live |
| `financingCostAt` | 1514 | Interest + MI + fee over horizon | High | live |
| `eligibleAt` | 1522 | Full `Engine.run` at an arbitrary price | High | live |
| `mkOutcome` | 1528 | Outcome object builder | Low | live |
| `priorityAlloc` / `optimalConcAlloc` | 1537 / 1545 | Two competing allocation policies | Medium | both live |
| `pathOutcome` | 1550 | Evaluate one negotiation path | **Critical** | live |
| `pickPathWinner` | 1615 | Path tie-breaker cascade | **Critical** | live |
| `analyzeNegotiation` | 1635 | Negotiation orchestrator | **Critical** | live |
| `negotiationPanelHTML` / `offerActionSentence` | 1687 / 1750 | Negotiation output | High | live |
| `renderCards` | 1781 | Section 2 | High | live |
| `dpLabel` / `dpDimmedCardHTML` | 1813 / 1819 | Down-payment labels, dimmed cards | Low | live |
| `priorityScenario` | 1838 | **Byte-duplicate of `Engine.priorityPick`** | Medium | live |
| `bestPathForScenario` | 1853 | Path pick per scenario | High | live |
| `familyCardHTML` | 1882 | Program family card | High | live |
| `allocLabel` / `offerNoteText` | 1937 / 1947 | Card copy | Low | live |
| `familyGuide` / `soloGuide` / `familyTrade` | 1959 / 2004 / 2012 | Advisory prose | Low | live |
| `cap` | 2020 | Capitalize | Low | **dead** |
| `offerActive` / `offerConc` / `refAtListIgnoringCash` | 2028 / 2033 / 2044 | Gap Solver setup | High | live |
| `renderGapSolver` | 2052 | Section 3 orchestrator | High | live |
| `gsPaymentOffer` / `gsCashOffer` | 2087 / 2103 | Post-offer gap views | Medium | live |
| `gsPayment` | 2124 | Payment-gap remedies | High | live |
| `concessionToCloseGap` | 2165 | **Bisection solver** — concession needed to close the payment gap | High | live |
| `priceToHitTarget` | 2188 | `(target − b)/k` | Medium | live |
| `concessionVsPrice` | 2195 | Concession vs price-cut comparison table | High | live |
| `gsCash` / `gsDti` / `dtiPrice` | 2263 / 2295 / 2325 | Cash-gap and DTI-gap remedies | Medium–High | live |
| `sol` | 2332 | Solution-row markup | Low | live |
| `snapshotFields` / `fmtVal` / `logChanges` / `renderChangeLog` | 2351–2390 | Change log | Medium | live, in-memory only |
| `recalc` | 2400 | **Master orchestrator** | **Critical** | live |
| `renderPropertyStrategy` | 2445 | Mode gating | High | live |
| `counterConcTotal` / `counterScenario` / `evalStructure` | 2478 / 2488 / 2503 | Counteroffer core | High | live |
| `coMetric` | 2520 | Priority-driven ranking metric | Medium | live |
| `optimalRestructure` | 2528 | **The restructure optimizer** | **Critical** | live |
| `additionalForPayment` | 2549 | **Second bisection solver** | High | live |
| `renderOurOffer` / `renderNetVal` / `structureLabel` | 2564 / 2626 / 2637 | Counteroffer display | Medium | live |
| `coPanel1` / `coPanel2` / `coPanel3` | 2645 / 2668 / 2693 | Counteroffer panels | High | live |
| `coImprovement` / `coRestructureAsk` / `coRestructureBenefit` | 2662 / 2681 / 2687 | Counteroffer copy | Low | live |
| `recalcCounter` | 2719 | Section 4 orchestrator — **calls `gatherInputs()` again** | **Critical** | live |
| `setUnit` | 2807 | Unit toggle — **destructive write-back** | **High** | live |
| `setCounterUnit` / `setOfferConcUnit` | 2586 / 2612 | Same pattern, other fields | High | live |
| `attach*` × 6, `renderUnitToggles`, `init` | 2743–2861 | Wiring and bootstrap | Medium | live |

## 2.10 Two solvers that are iterative

Both the Gap Solver's `concessionToCloseGap` (2165) and the Counteroffer Analyzer's `additionalForPayment` (2549) are **bisection solvers** over the rate/buydown relationship. They are the only non-closed-form math in the tool, they hardcode `360` rather than referencing `N`, and they run on every recalculation when an offer is active. They are correct but they are the reason a keystroke costs six engine runs.

## 2.11 Dead code inventory

| Symbol | Line | Status |
|---|---|---|
| `optimalSplit` | 969 | Exported, zero call sites |
| `programEliminations` | 770 | Called at 1490, **result discarded** |
| `cashAtPrice` | 1293 | Only caller is itself dead |
| `powerLabel`, `powerBadge` | 1294, 1295 | Zero callers |
| `strategyOkCard`, `strategyActionsList`, `strategyActionsFor` | 1302–1308 | Zero callers; `ctx.secondary` has no producer anywhere |
| `cap` | 2020 | Zero callers |
| `loanLimitCeil` | 1355 | Returned, never consumed |
| `onlyPrograms`, `progElim` | 1490–1491 | Assigned, never used |
| `commonViable` | 1553 | Assigned, never used |
| `fam` | 1693 | Assigned, never used |
| `hasEligible` | 1683 | Returned, never read |
| `inp.appliedReduction` | 2411 | Written, never read |
| `reqGift` | 837 | Computed, never used |
| `headline.type==='allfit'` | 1680 | Unreachable branch |
| `'Available Programs'`, `'Credit Score'` | 1492, 1494 | Effectively unreachable |
| Dead parameters | 593, 770, 946 | `forceePct`, `A`, `A` |
| Unused Engine exports | 1056–1059 | `N`, `scoreBucket`, `pmiRate`, `pmiBand`, `fhaMipRate`, `monthToBalance`, `closingCost`, `concessionLimitPct`, `dpMatches`, `priorityPick`, `optimalSplit` |

**Documented, not removed.** Several of these (the coaching subsystem at 1291–1341 in particular) look like intentionally-parked work rather than rot.

## 2.12 Duplicated policy — four places one change must be made in five

| Policy | Locations |
|---|---|
| Priority-aware pick | `Engine.priorityPick` 979 **and** `priorityScenario` 1838 (byte-identical) |
| $150 / 36-month step-up rule | `pickBestOverall` 875–877 **and** `programCards` 1024–1026 **and** `gsPayment` 2147–2153 |
| Loan-limit ternary | 752–753, 831, 1354, 1557, 1592 |
| Concession allocation | `optimalSplit` 969 (dead), `priorityAlloc` 1537, `optimalConcAlloc` 1545 |
| Cash-limited price | `maxPriceForScenario` 749, `buyingPowerCardsHTML` 1352, `cashAtPrice` 1293 (dead) |

---
# 3. FLORIDA PROPERTY-TAX LOGIC DOCUMENTATION

**Two findings frame this section. First: the BSE has no Florida tax logic. Second: the tool that does have it is `property-tax.html`, and it is a single-year estimator, not a multi-year projection.**

## 3.1 What exists in the BSE — the complete tax model

| Element | Value |
|---|---|
| Inputs | One: `#taxRate` (line 400), default `1.20`, with a `%` / `$` unit toggle |
| `%` mode | `taxes = price × taxRate/100/12` (line 669) — flat percent of purchase price |
| `$` mode | `taxMonthly = taxRaw/12; taxFixed = true` (line 1160) — fixed monthly escrow, price-invariant |
| Validation | One guard: warns when `taxRate > 15` (lines 1222–1225) |
| Assessed value | Not modeled |
| Millage | Not modeled |
| Homestead | Not modeled |
| Save Our Homes | Not modeled |
| Portability | Not modeled |
| County variation | Not modeled |
| Confidence flag | The tool's own confidence heuristic (lines 1432–1434) counts only HOA/CDD/flood as unknowns. **Property tax is always treated as known.** |

CDD is a single flat monthly input (line 404) with no debt-vs-operating split.

Florida-specific consequences the BSE therefore omits: loss of the seller's Save Our Homes cap on transfer, the $50,000 homestead exemption and the school-millage carve-out, portability up to $500,000, the non-homestead 10% cap, county millage variation (roughly 1.0%–2.3% effective across Florida), and the year-of-purchase versus year-after distinction.

## 3.2 What exists in `property-tax.html` — full documentation

**Model shape.** Single-year, single-scenario. No year index, no loop, no growth rate, no array of years. Up to four result cards plus one breakdown table from one pass of `calculate()` (line 590).

```
Total tax = (taxable value × millage/1000) + non-ad-valorem (flat)
```

Only two scenarios are ever computed:
- `reassessTotal` (line 613) — full purchase price, no exemptions
- `homesteadTotal` (line 640) — purchase price less portability, less a blended $37,500-equivalent exemption

### Inputs

| DOM id | Label | Unit | Default | Required | Used in tax math |
|---|---|---|---|---|---|
| `client-input` | CLIENT | text | none | No | No |
| `prop-address` | PROPERTY | text | none | No | No |
| `purchase-price` | Purchase Price | whole $ | none | **Yes** | Yes |
| `current-bill` | Current Annual Tax Bill | $ w/ cents | none | No | Gates Cards 1 & 4 |
| `millage-rate` | Millage Rate (mills per $1,000) | mills | none | **Yes** | Yes |
| `non-ad-val` | Non-Ad Valorem Assessments (annual) | $/yr | none | No | Yes |
| `chk-homestead` | Buyer will file homestead exemption | bool | **checked** | — | Gates Card 3 |
| `chk-portability` | Applying SOH portability | bool | unchecked | — | Yes |
| `prior-market` | Prior Home — Market Value | whole $ | none | If portability | Yes |
| `prior-assessed` | Prior Home — Assessed Value (TRIM) | whole $ | none | If portability | Yes |

**No HTML validation anywhere** — no `required`, no `min`/`max`, no `type="number"`. Every input is `type="text"`.

**Notably absent inputs:** manual assessed/just-value override, separate school and non-school millage, seller's prior-year assessed value, closing/purchase date, county, senior/veteran/widow/disability exemption toggles.

### Functions

| Function | Line | Risk if modified |
|---|---|---|
| `parseDollar` | 455 | **Critical** — every dollar input |
| `parseNum` | 459 | **Critical** — millage |
| `calculate` | 590 | **Critical — this is the entire tax engine** |
| `sanitizeWhole` / `sanitizeCents` / `fmtDecimal` | 481 / 494 / 520 | Medium |
| `fmtWhole` / `fmtCents` / `dispExact` / `dispRound` / `dispMonthExact` / `dispMonthRound` | 526–554 | Low (display) |
| `toggleHomestead` / `togglePortability` | 559 / 564 | Medium |
| `clientSearch` / `selectClient` | 571 / 582 | Low (non-tax) |
| `_digitsBeforeIdx` / `_posAfterNDigits` / `toggleDD` | 467 / 471 / 796 | Low (cursor / nav) |

`calculate()` is invoked from nine places (field blurs, the millage `onchange`, the Calculate button, and both toggles). It is **not** called on `DOMContentLoaded`.

### The eleven documented questions, answered

**1. How purchase price is used.** Directly, 1:1, as the new just/assessed value. No sales-to-just-value ratio, no 15% cost-of-sale reduction, no county assessment ratio. Line 763 labels the row "Assessed value (purchase price)" explicitly.

**2. Assessed-value overrides.** **There are none.** No manual assessed or just-value input exists. `prior-assessed` is the prior home's value, used only in the portability subtraction. The only thing that modifies the price-derived assessed value is the portability benefit (line 632).

**3. Millage application.** Correct. Both computations use the `/1000` mills divisor (lines 612, 639). **Non-ad-valorem is handled correctly** — never multiplied by millage, never reduced by the exemption, added flat after the ad-valorem computation in both branches, displayed as its own section. A single blended millage is used; there is no school/non-school split input. Displayed to 4 decimals.

**4. Homestead exemption.** Lines 632–640, verbatim:

```js
632      assessedAfterPort = Math.max(0, purchasePrice - portabilityBenefit);
633      // FL exemption: first $25K applies to school + non-school portions;
634      // second $25K applies to non-school only.
635      // Using blended millage, we approximate with the average of both taxable values.
636      schoolTaxable    = Math.max(0, assessedAfterPort - 25000);
637      nonSchoolTaxable = Math.max(0, assessedAfterPort - 50000);
638      const avgTaxable = (schoolTaxable + nonSchoolTaxable) / 2;
639      homesteadAdVal   = avgTaxable * (millage / 1000);
```

**Does the code split school vs non-school millage? No.** It splits the taxable values but applies one blended rate to their arithmetic mean. See finding **C-10(a)** — the comment at line 635 shows this was a deliberate approximation, and it biases high in most Florida counties. Also see **C-10(b)** — line 637 is a floor, not a $50K–$75K band, over-exempting below $75,000 assessed. No senior, widow, blind, disability, veteran, or agricultural exemptions exist.

**5. Save Our Homes.** **The annual cap is not implemented at all.** No 3%, no CPI, no year-over-year growth, capped or uncapped. Searched for `3%`, `0.03`, `1.03`, `cpi`, `Math.pow`, and any year loop — zero hits. The string "SOH" appears only in prose and comments.

The one thing the model gets structurally right: `assessedAfterPort` starts at `purchasePrice`, so the property is reassessed to full just value with **no carryover of the seller's SOH differential**. That matches FS 193.155(3). It is correct by construction, not by explicit code.

**6. Portability.** $500,000 cap **enforced** (line 628). Homestead correctly required as a precondition (line 596). **Upsizing is correct.** **Downsizing is not implemented** — see finding **C-2**, which can zero the ad-valorem bill. Also absent: the 3-year lookback window for re-establishing homestead (no date fields exist), and split-benefit apportionment for multiple owners.

**7. Non-homestead 10% cap.** **Not handled.** No 10% cap, no `0.10`, no non-homestead assessment limitation anywhere. Investment and second-home buyers get the uncapped full-just-value figure with no cap modeling.

**8. First-year tax estimation.** **There is no distinct first-year calculation.** The model is year-agnostic. Card 1 is a pure passthrough of the user-entered current bill with no math applied. Card 2 applies the buyer's purchase price immediately with no year offset.

Under FS 192.042 / 193.155(3), the year-of-purchase bill is already fixed by the January 1 assessment on the **seller's** roll, including the seller's SOH cap and exemptions. Reassessment and the buyer's homestead first take effect the January 1 **following** the sale. Because there is no closing-date input, the tool cannot distinguish a February closing (nearly two years of pre-homestead bills) from a December closing (homestead effective ~3 weeks later). The January 1 / March 1 rule appears **only as static prose** in the info box at line 401. Seller exemption recapture is not modeled either.

There is an orphaned CSS class `.homestead-recovery` at lines 238–244 — styling exists for a recovery/timeline callout that no JavaScript ever emits. That looks like a planned feature that was not finished.

**9. Future-year tax estimation.** **None.** Zero years projected. No loop, no escalation table, no inflation or millage-growth input. Card 3's description calls itself "Estimated long-term taxes" but computes a single static year.

**10. Which functions perform these calculations.** All of it lives in `calculate()`, lines 590–792. There is no separation between calculation and rendering — the function computes and writes `#results-panel.innerHTML` in one pass.

**11. Which other parts depend on them.** **Nothing.** `property-tax.html` is a leaf. No other tool imports it, links to it with parameters, or reads its output. Conversely it reads two localStorage/sessionStorage keys that nothing in the repository writes (see Section 5).

### Additional documented items

**4% November early-payment discount: not applied.** No discount schedule of any kind. The FS 197.162 schedule (4% Nov / 3% Dec / 2% Jan / 1% Feb) is absent. Every figure is gross. Most servicers escrow to the November-discounted amount, so all monthly escrow figures here run roughly 4% high against what the servicer actually collects.

**Escrow logic: a bare division by 12.** No RESPA cushion, no initial/aggregate-adjustment deposit, no prepaid-at-closing figure, no shortage spread. Insurance is not part of the escrow figure at all, despite the tool being titled an "Escrow Planner."

**Hardcoded constants:**

| Value | Line | Meaning |
|---|---|---|
| `1000` | 612, 639 | Mills divisor (correct) |
| `500000` | 628 | Portability statutory cap |
| `25000` | 636 | First exemption band |
| `50000` | 637 | Second exemption threshold |
| `2` | 638 | The 50/50 school blend divisor |
| `25000` × 2 | 755–756 | Display-only exemption caps |
| `12` | 645, 646 | Months |
| `50` | 648, **706 (duplicated literal)** | Escrow flag threshold $/mo |
| `4` | 776 | Millage display precision |

### Do different sections calculate taxes differently?

**Yes — across tools, not within one.** Three different tax models are in production simultaneously:

| Tool | Tax model |
|---|---|
| BSE | 1.20% flat of purchase price, or a fixed monthly dollar |
| Comfort Calculator | $5,000/yr flat, **does not scale with price at all** |
| property-tax.html | Millage × taxable value, with homestead and portability |

Within `property-tax.html` itself, Card 2 and Card 3 use consistent formulas. Within the BSE, the tax treatment is consistent across all sections.

### Additional documented defects in `property-tax.html` (not fixed)

- Negative dollar amounts render as `$-123` instead of `-$123` (line 546 + 693); visible in the "Difference" column when homestead is unchecked and the reassessed bill is lower.
- Monthly × 12 does not equal the displayed annual — the two are rounded independently and can disagree by up to ~$6/yr.
- The millage sanitizer allows **multiple decimal points**: `18.25.15` is accepted and silently becomes `18.25`. There is no upper bound either — a fat-fingered `182.515` produces a 10× tax bill with no sanity warning, despite the field note reading "Do not estimate."
- Line 699 computes `hseClass` and never uses it; line 703 hardcodes green. **The homestead column always renders green even when the after-homestead figure is higher than the current escrow** — a misleading signal on a trade-up.
- Line 706 re-hardcodes `50` twice instead of using `escrowFlagThreshold`.
- Line 579 interpolates a client name unescaped into both an inline `onclick` and element text — an apostrophe breaks the handler and markup would execute. Currently unreachable because nothing writes `hws_clients`, but it is a live pattern. `client-tag.js` does this correctly via `textContent`.
- `calculate()` is never invoked on load, so the sessionStorage client prefill path always lands on the static empty state.

---

# 4. COMFORT PAYMENT CALCULATOR vs BUYER STRATEGY ENGINE — DISCREPANCY REPORT

**Production copy for this comparison: `Tools/Live/buyer/comfort-calculator.html`**, per TOOL-MANIFEST.md.

## 4.1 Duplicate-copy diff

`comfort-calculator.html` (A) vs `comfort-calculator/index.html` (B): 113 lines of diff across 4 hunks. **The calculation engines are byte-identical.** For the entire script block, `B_line = A_line + 9`. Every constant matches: `annualTaxes 5000`, `annualHOI 2400`, `pmiRate 0.85`, `dtiLimit 49.99%`, `termYears 30`, `lenderFees 895`, `govt = loanEst × 0.0055`, title breakpoints `0.00575 / 575 / 0.005`, `prepInt = dailyInt × 15`, `taxEsc = (taxes/12) × 3`, `reserves = monthlyPITI × 2`, `STORAGE_KEY = 'hws_comfort_calc_v4'`.

**Identical inputs produce identical numbers in both copies.** The divergences are feature-level, and finding **C-12** covers the live risk.

## 4.2 Comfort Calculator inventory

33 functions; 21 DOM inputs. The calculation core:

| Function | Line | Purpose |
|---|---|---|
| `pmt(annualRate, pv, termYears)` | 806 | P&I — **note the argument order differs from the BSE's `pmt`** |
| `calcLoan(targetPayment, annualRate, termYears, fixedMonthly, pmiRate)` | 817 | Inverse solve for max loan |
| `flTitleIns(price)` | 878 | FL promulgated owner's title |
| `updateCashEst()` | 881 | Itemized FL closing-cost estimate |
| `buildBudgetRanges(...)` | 964 | 3-row table at DTI 36 / selected / 50 |
| `buildFundsNeeded(...)` | 1006 | Duplicates `updateCashEst` math, adds 2-month reserves |
| `calculate()` | 1068 | Master |
| `buildDownImpact` / `buildRateSensitivity` | 1184 / 1209 | Sensitivity tables |
| `calcBuydown` | 1248 | Three options vs the comfort payment |
| `calcOfferStrategy` | 1358 | Seller contribution → points → rate |
| `buildCumTable` | 1454 | Cumulative net savings by year |

Key defaults: `annualIncome` blank, `monthlyDebt` blank, `comfortPayment` blank (± $100 steppers), `downPayment` blank (**absolute dollars only**), `rate` blank with no default, `termYears` **30 (user-variable)**, `annualTaxes` **$5,000/yr**, `annualHOI` **$2,400/yr**, `monthlyHOA` blank, `pmiRate` **0.85%**, `dtiLimit` **49.99%**.

## 4.3 Full discrepancy matrix

| # | Dimension | Comfort Calculator | BSE | Same? |
|---|---|---|---|---|
| 1 | **Property taxes** | Flat **$5,000/yr**, never scales with price (line 1083) | **1.20% of price**/yr, or fixed $/mo (line 669) | **DIFFERENT** |
| 2 | **Insurance** | **$2,400/yr** entered per year (line 458) | **$150/mo** entered per month (line 402) | **DIFFERENT** |
| 3 | **PMI** | Single flat **0.85%**, no bands, no credit input, **no cancellation logic** | 8×4 credit×LTV table, MI base = base loan, true 80% crossover solve | **DIFFERENT (structurally)** |
| 4 | **FHA MIP** | **Not implemented** — "FHA" appears once, as a button caption | UFMIP 1.75% financed, annual 0.55/0.50, life-of-loan modeling | **DIFFERENT** |
| 5 | **VA funding fee** | **Not implemented** | 2.15 / 3.30 / exempt, financed | **DIFFERENT** |
| 6 | **Closing costs** | Itemized FL build-up: doc stamps + intangible 0.55%, FL promulgated title, $895 lender fees, 15 days prepaid interest, 12 mo + 2 mo HOI, 3 mo tax escrow — **plus 2 months PITI reserves** | Blanket **3% of base loan**, no itemization, **no reserves** | **DIFFERENT** |
| 7 | **Down payment** | **Absolute dollars only**, no program minimum, LTV is an output | Always a **% of price** driven by the program module (0/3/3.5/5/10/20/custom) | **DIFFERENT (structural)** |
| 8 | **Interest rate** | **One rate, no default, blank on load** | **Three defaulted rates** — 6.750 conv / 6.250 FHA / 6.125 VA | **DIFFERENT** |
| 9 | **Loan term** | **User-variable** (`termYears`, default 30) | **Hardcoded 360 months** | **DIFFERENT** |
| 10 | **Program coverage** | **None** — program-agnostic | Conv / FHA / VA with eligibility gating and loan limits | **DIFFERENT** |
| 11 | **DTI** | Back-end only, **one user-set limit, default 49.99%**, quick buttons 36/43/50 | Per-program **45 / 43 / 41** back-end, front-end computed and flagged but never binding | **DIFFERENT** |
| 12 | **Cash to close** | `down + estCC + 2 months PITI reserves` | `down + closing` — reserves excluded, tested only as a $500/$1,000 warning floor | **DIFFERENT** |
| 13 | **Max purchase price** | **One constraint** (back-end DTI) + fixed $ down. No cash ceiling, no loan limit, no eligibility | **Minimum of four ceilings**, with the binding one named on screen | **DIFFERENT** |
| 14 | **Comfort payment** | Full PITI including MI | Full PITI including MI | **SAME definition** — but it is the *primary answer* in one tool and *one of four competing ceilings* in the other |
| 15 | **HOA / flood / CDD** | HOA only. **No flood field. No CDD field.** | Three separate monthly fields, each with an N/A confirmation checkbox feeding a confidence flag | **DIFFERENT** |
| 16 | **Rounding** | Display rounding; comfort payment **snapped to $100**; break-even months rounded up | Display rounding; buydown rates snapped to **1/8**; $0.50 / $250 comparison epsilons | **DIFFERENT in detail** |

**Fifteen of sixteen dimensions differ. One matches in definition but not in role.**

## 4.4 Would identical inputs produce identical outputs?

## NO.

The worked example, the $115,338 gap, and the ranked attribution are in finding **C-6**. The three points worth restating for the record:

1. **The largest single driver is a defaults choice, not a formula error** — 49.99% vs 45% DTI accounts for 57.1% of the gap and is a one-line change in either tool. It is the first thing to decide.
2. **The Comfort Calculator's headline is not fundable.** At its own $524,047 max price, BSE-style cash to close is $54,521 against $40,000 of funds. It applies no cash constraint at all.
3. **The two tools also disagree in the Florida-specific direction.** The Comfort Calculator's flat $5,000/yr tax and absence of CDD and flood fields understate a typical Tampa-area payment by a meaningful margin — a $300/mo combined CDD+flood omission alone overstates its max price by roughly $41,700.

## 4.5 Cross-tool contamination risk

`saveInputs()` writes a second localStorage key, `hws_shared_scenario` (lines 1538–1550), carrying `rate`, `termYears`, `downPayment`, `annualTaxes`, `annualHOI`, `pmiRate`, plus the computed `comfortPrice` and `maxPrice`. The comment says it exists "so Closing Cost Estimator can sync."

**Nothing in the repository reads that key.** But any tool that ever does will inherit every assumption divergence in the table above. This is a latent contamination channel that should be closed or made explicit before the migration, not after.

**The tools were not merged. This is a discrepancy report only, as instructed.**

---
# 5. CURRENT PERSISTENCE / STATE-MANAGEMENT AUDIT

## 5.1 Mechanism sweep — all seven files

Counts are raw occurrences. Every mechanism is reported for every file; a zero is an explicit finding, not an omission.

| Mechanism | BSE (Live) | BSE (Staging) | property-tax | cc.html | cc/index | client-tag.js | hws-session.js |
|---|---|---|---|---|---|---|---|
| `localStorage` | **0** | **0** | 1 (read) | 4 | 4 | **0** | **0** |
| `sessionStorage` | **0** | **0** | 1 (read) | **0** | **0** | **0** | **0** |
| `document.cookie` | **0** | **0** | **0** | **0** | **0** | **0** | **0** |
| `indexedDB` / `openDatabase` / `caches` | **0** | **0** | **0** | **0** | **0** | **0** | **0** |
| `URLSearchParams` | **0** | **0** | **0** | 3 | **0** | 1 | **0** |
| `location.search` | **0** | **0** | **0** | 2 | **0** | 1 | **0** |
| `location.hash` | **0** | **0** | **0** | **0** | **0** | **0** | **0** |
| `history.pushState` / `replaceState` | **0** | **0** | **0** | **0** | **0** | **0** | **0** |
| `fetch(` / `XMLHttpRequest` / `sendBeacon` | **0** | **0** | **0** | **0** | **0** | **0** | **0** |
| `navigator.clipboard` | **0** | **0** | **0** | 1 | **0** | **0** | **0** |
| `window.print` | **0** | **0** | **0** | 2 | 1 | **0** | **0** |
| `html2canvas` / `jsPDF` | **0** | **0** | **0** | **0** | **0** | **0** | **0** |
| `<script src=` | **0** | **0** | 2 | 1 | 1 | — | — |
| `form action=` / Netlify forms or functions | **0** | **0** | **0** | **0** | **0** | **0** | **0** |
| `@netlify/blobs` | **0** | **0** | **0** | **0** | **0** | **0** | **0** |

**The BSE scores zero on every mechanism.** It has exactly one inline `<script>` tag, no `<form>`, no `<iframe>`, no `<img>`, and `grep -c 'JSON'` returns 0 — there is no serialization code of any kind in the file. The only `history` reference is a navigational `history.back()` on the Hub button at line 2866.

## 5.2 BSE survival matrix

| Event | Survives? | Why |
|---|---|---|
| Recalculation in-page | **Yes** | `recalc()` re-reads the DOM and re-renders; it never clears inputs. Module state (`unitState`, `offerConcUnit`, `counterUnit`, `concSplit`, `gapSel`, `changeLog`) also persists in-session |
| Page refresh / F5 | **No** | No storage read at startup; `init()` performs no restoration |
| Browser close and reopen | **No** | Nothing was ever written |
| Computer restart | **No** | Nothing was ever written |
| Different browser, same machine | **No** | Nothing was ever written |
| **Different device** | **No** | No network I/O of any kind exists |

`hws-session.js` is a 4-line comment-only no-op stub, and **the BSE does not load it** (zero `<script src>` tags). The question is moot in both directions.

See finding **C-3** for the aggravating detail: a refresh restores a plausible fictional buyer rather than an empty form.

## 5.3 Existing save / scenario functionality

**In the BSE: none that persists.** No save, no load, no export, no import, no share link, no print, no download, no PDF. The complete button inventory is four unit toggles, two split-mode buttons, three Gap Solver tabs, and a `history.back()` Hub link.

**The change log is purely in-memory.** Module state at line 2349:

```js
2349: let prevSnapshot=null, changeLog=[], firstCalcDone=false, seq=0;
```

`snapshotFields()` (2351) reads `FIELD_LABELS` keys into a plain object held only in closure. `logChanges()` (2375) diffs and unshifts onto the in-memory array — no `setItem`, no `fetch`, no serialization. `renderChangeLog()` (2390) caps the display at 5 entries. The markup itself concedes the scope: line 413 hardcodes "no changes yet this session."

Three problems for any future persistence of this log:

1. **Entries are destroyed on refresh.** It is an audit trail that cannot be audited after the fact.
2. **Timestamps are `toLocaleTimeString` with hour and minute only** — no date, no timezone, no epoch. Even if the array were persisted verbatim, entries could not be ordered across days or devices. This must be rewritten to ISO timestamps.
3. **`seq` resets to 0 on every page load**, so it cannot serve as a version counter either.

Two confirmed bugs in the log, documented not fixed:

- **`logChanges()` runs twice per `recalc()`, and the second call is the no-op.** `recalcCounter()` at line 2435 calls `logChanges()` internally (line 2732 or 2739), so by the time `recalc` reaches line 2437 the diff is already done and `prevSnapshot` already advanced. The log's actual authorship lives in Section 4. Anyone reordering `recalcCounter` after `logChanges` would silently break the log by one cycle.
- **`updateInlineHints` at line 2420 mutates logged fields before the snapshot.** `hoa`, `cdd`, `flood`, `hoaNA`, `cddNA`, `floodNA` are all six in `FIELD_LABELS`, so ticking one N/A box produces **two** log entries for one user action — and destroys the original value (finding C-4b).

**Elsewhere in the suite:** the Comfort Calculator is the only tool with real persistence — `saveInputs()` / `loadSaved()` / `clearAll()` on `localStorage`, plus `buildShareURL()` / `copyShareLink()` / `applyURLParams()` for state-in-URL sharing. It is the nearest prior art and the pattern most likely to be generalized, but note it is **single-slot**: `STORAGE_KEY` is a constant, so there is exactly one saved scenario per browser and saving overwrites it. `totalCash` and the closing-costs-included toggle are in neither `CALC_FIELDS` nor `BD_FIELDS`, so they are never saved, never shared, and never restored.

## 5.4 Three phantom integration points

All three look like working infrastructure at a glance. None of them are.

| Key | Read at | Written by |
|---|---|---|
| `hws_clients` | `property-tax.html:576` | **nothing** |
| `hws_session` | `property-tax.html:811` | **nothing** — its writer was `hws-session.js`, now a no-op stub |
| `hws_shared_scenario` | **nothing** | `comfort-calculator.html:1549` and its duplicate |

Plus `@netlify/blobs@^8.1.0` is declared in `package.json` and **imported by nothing** — there are no Netlify Functions and no `fetch()` anywhere in the tree.

And `netlify.toml` carries a short-link route to a file that does not exist:

```toml
[[redirects]]
  from = "/r/:id"
  to = "/buyer/strategy-builder.html?id=:id"
  status = 200
```

`find` for `*strategy-builder*` under `Live/` returns zero matches. This is the only artifact in the repository that anticipates server-side scenario IDs, and it points at nothing. Someone previously started a server-persistence path and abandoned it. **Do not assume any of these four represent working infrastructure to build on.**

## 5.5 Hidden state that is not in the DOM

Eleven pieces of live mutable state, none of which appear as a form value and none of which are persisted:

| Variable | Line | Kind | Why it matters |
|---|---|---|---|
| `unitState` | 1091 | `const` object, mutated at 2824 | **Governs the interpretation of `#dpTarget` and `#taxRate`** |
| `offerConcUnit` | 1093 | `const` object, mutated at 2623 | Governs `#offerConc` |
| `counterUnit` | 2475 | `const` object, mutated at 2593 | Governs `#counterConc` |
| `concSplit` | 1102 | `const` object, mutated at 8 sites | Manual concession split |
| `appliedConcTotal` | 1104 | `let` | Concession deployed this cycle |
| `gapSel` | 1086 | `let` | Gap Solver tab |
| `prevSnapshot`, `changeLog`, `firstCalcDone`, `seq` | 2349 | `let` × 4 | Change log |

**Four of these — `unitState.dp`, `unitState.tax`, `offerConcUnit.v`, `counterUnit.v` — change the *meaning* of a DOM input's digits without changing the digits.** `dpTarget = "20"` is meaningless without `unitState.dp`: it is either 20% or $20.

Critically, **none of the four appear in `FIELD_LABELS`**, the key set that `snapshotFields()` iterates. So even the existing in-memory snapshot is lossy. Any Supabase row must persist all four alongside the field values — and `setUnit()`, which mutates the displayed value on toggle, must not fire during restore, or restored numbers will be **double-converted**. This is a subtle, high-probability data-corruption path in the migration.

---

# 6. PROPOSED BUYER PROFILE FIELD CLASSIFICATION

Derived from the actual production code, not from the example list in the brief. `BSE` = exists in the Buyer Strategy Engine; `CC` = Comfort Calculator; `PT` = property-tax.html.

**Definition applied:** a field belongs to the Buyer Profile if it describes the borrower, follows them from pre-approval through contract, and would be re-entered identically for every property they consider.

| Field | Source id | Tool | Description | Calculations using it | Sensitive? |
|---|---|---|---|---|---|
| Buyer name / identifier | *(does not exist in BSE)* | — | **No buyer identity field exists anywhere in the BSE.** `property-tax.html` has `client-input`, unused in math | none | No |
| Qualifying income (monthly gross) | `income` | BSE | Monthly gross | `computeScenario` front/back DTI (678–679); `maxPriceForScenario` DTI ceiling (744); `run` DTI elimination (840); `gsDti` | **Yes** |
| Monthly debts | `debts` | BSE | Non-housing monthly obligations | Same as income | **Yes** |
| Credit score | `score` | BSE | FICO, clamped 300–850 | `pmiRate` via `scoreBucket` (586); conv min-score gate (815); FHA tier selection (630); LLPA warning (1462); `dpCreditFlag` | **Yes** |
| Own funds | `ownFunds` | BSE | Buyer's own cash | `funds = own + gift` (1180) → cash-to-close ceiling (750), elimination (835), `requiresGift` (847) | **Yes** |
| Gift funds | `gift` | BSE | Gift portion | Same | **Yes** |
| Target / comfort payment | `target` | BSE | Target PITI, default 3,200 | **Comfort Payment ceiling** (742); comfort pool (887); every gap calculation | No |
| Preferred down payment | `dpTarget` + `unitState.dp` | BSE | % or $ target | `dpMatches` (788) card dimming; conv custom tier above 20.5% (620) | No |
| Planned stay | `stay` | BSE | 2/3/5/7/10/15/20/30 years | `horizon` (692); `miCostHorizon`; `totalCostHorizon`; **`pickBestOverall` regime switch** (896–899); `financingCostAt`; buydown break-even | No |
| Buyer priority | `priority` | BSE | balanced / payment / cash / power | `priorityPick` (979); `priorityScenario` (1838); `pickPathWinner` (1620); `priorityAlloc` (1537); step-up filters; `coMetric` (2520) | No |
| First-time buyer | `tgFthb` | BSE | Boolean | Unlocks Conv 3% (614); gates a Conv 3% elimination (776) | No |
| VA eligible | `tgVa` | BSE | Boolean | Gates the entire VA program (779, 812) | No |
| VA use | `vaUse` | BSE | first / subsequent | Funding fee 2.15 vs 3.30 (656, 727, 1485) | No |
| VA exemption | `vaExempt` | BSE | Disability exemption | Waives the funding fee | **Yes** — health-adjacent |
| **Annual income** | `annualIncome` / `monthlyIncome` | CC | Two-way synced pair | CC only | **Yes** |
| **DTI limit** | `dtiLimit` | CC | User-set, default 49.99% | CC max housing (1082) — **see C-6** | No |

**Notes for your review.**

- **There is no buyer identity field in the BSE.** Adding one is the single smallest change that unlocks the Buyer Profile concept, and it is purely additive — no calculation reads it.
- **`unitState.dp` must travel with `dpTarget`.** Storing the number alone is not sufficient and will silently corrupt on restore.
- **Income, debts, credit score, and funds are exact values by necessity**, exactly as your governing principle allows: bucketing income would change DTI, and bucketing credit would change PMI pricing, program eligibility, and the LLPA flag. Recommend storing them exact and protecting them with RLS rather than degrading them.
- **The Comfort Calculator's DTI limit is a buyer-level field there and a program constant in the BSE.** If the BSE absorbs the Comfort Calculator, this is a genuine conflict requiring your decision, not a merge detail.

---

# 7. PROPOSED PROPERTY SCENARIO FIELD CLASSIFICATION

**Definition applied:** a field belongs to the Property Scenario if it describes one specific property or one specific offer on it, and would differ between two houses the same buyer is comparing.

| Field | Source id | Tool | Description | Calculations using it | Sensitive? |
|---|---|---|---|---|---|
| Property address | *(does not exist in BSE)* | PT only | `prop-address`, unused in math | none | No |
| List price | `price` | BSE | **Also the mode switch** — blank = Shopping Range | `run` (823); every downstream price calculation; `shopping` (1144) | No |
| Property taxes | `taxRate` + `unitState.tax` | BSE | % of price or fixed $/yr | `computeScenario` (669); `maxPriceForScenario` `k`/`b` (736, 738) | No |
| Homeowners insurance | `hoi` | BSE | $/mo | `fixedEsc` (670); `b` (738) | No |
| HOA | `hoa` + `hoaNA` | BSE | $/mo + N/A confirmation | Same; confidence flag (1433) | No |
| CDD | `cdd` + `cddNA` | BSE | $/mo + N/A confirmation | Same | No |
| Flood insurance | `flood` + `floodNA` | BSE | $/mo + N/A confirmation | Same | No |
| Offer price | `offerPrice` | BSE | Buyer's offer | `negotiatingRoom` (1168); concession base (1172) | No |
| Seller concession ask | `offerConc` + `offerConcUnit.v` | BSE | $ or % of offer/list | `sellerConcession` (1173); every negotiation path | No |
| Negotiation mode | `negMode` radios | BSE | compare / reduction / concession / split | `recalc` applied-path selection (2409) | No |
| Manual buydown split | `concBuydown` | BSE | $ to rate buydown | **Only `concessionVsPrice` (2205)** — see C-9 | No |
| Manual costs split | `concCosts` | BSE | $ to closing costs | Same | No |
| Counter price | `counterPrice` | BSE | Seller's counter | `netVal` (2726); `counterScenario` | No |
| Counter concession | `counterConc` + `counterUnit.v` | BSE | $ or % | `counterConcTotal` (2478); `netVal` | No |
| Counter loan type | `counterLoan` | BSE | Manual program override | `counterScenario` (2490) | No |
| Closing cost override | `ccOverride` | BSE | $ absolute; **ignored in Shopping Mode** | `closingCost` (594) — but **not** `maxPriceForScenario` | No |
| Current annual tax bill | `current-bill` | PT | Seller's current bill | Cards 1 & 4 | No |
| Millage rate | `millage-rate` | PT | Mills per $1,000 | The entire PT engine | No |
| Non-ad-valorem assessments | `non-ad-val` | PT | $/yr flat | Added after ad valorem | No |

**Notes for your review.**

- **`ccOverride` is genuinely ambiguous.** It is a property-specific figure taken off a real Closing Disclosure, but it is also an assumption override. Classified as property-level here. Flagged in Section 8.
- **The manual split fields are property-level but currently near-inert** (C-9). If the redesign fixes that, they become real property-scenario data. If not, persisting them stores a value the engine ignores.
- **`price` doing double duty as the mode switch is a structural problem.** A saved Property Scenario with a blank price is indistinguishable from a Shopping Plan. Recommend an explicit mode field on the record rather than inferring from a null price.

---

# 8. SYSTEM / MARKET ASSUMPTION CLASSIFICATION

Values that belong to neither the buyer nor the property.

| Field | Source | Current form | Recommended home |
|---|---|---|---|
| Conventional rate | `rateConv`, default 6.750 | User-editable input | **App config + scenario snapshot.** Default from config; freeze the used value onto each saved scenario |
| FHA rate | `rateFha`, default 6.250 | User-editable input | Same |
| VA rate | `rateVa`, default 6.125 | User-editable input | Same |
| Closing-cost % | `ccPct`, default 3 | User-editable input | **App config + scenario snapshot** |
| PMI rate table | `Engine.PMI` (565–574) | Hardcoded, no UI | **App config + snapshot.** Versioned |
| FHA UFMIP 1.75% | `A_CONST` | Hardcoded | **App config + snapshot** |
| FHA annual MIP 0.55 / 0.50 | `A_CONST` | Hardcoded | **App config + snapshot** |
| FHA MIP drop month 132 | line 654 | Hardcoded literal | **App config** |
| VA funding fee 2.15 / 3.30 | `A_CONST` | Hardcoded | **App config + snapshot** |
| Conforming loan limit 766,550 | `A_CONST` | Hardcoded, **2024 vintage** | **App config, annually versioned** |
| FHA loan limit 498,257 | `A_CONST` | Hardcoded, **2024 national floor** | **App config, and it should become county-aware** |
| Program DTI ratios 45 / 43 / 41 | `PROGRAMS` (610, 628, 632) | Hardcoded | **App config + snapshot** |
| Program min scores 620 / 500 / 0 | `PROGRAMS` | Hardcoded | **App config** |
| Concession limits 6 / 4 / 3 / 6 / 9 | `concessionLimitPct` (599) | Hardcoded function | **App config + snapshot** |
| Buydown ratio 0.25%/point | line 952 | Hardcoded — **0.24 in Staging** | **App config + snapshot.** See C-5 |
| Loan term 360 months | `N` (533) | Hardcoded module constant | **App config**, and a candidate to become a buyer-level or scenario-level field |
| Cash-preservation thresholds $150 / 36 mo | 875–877 | Hardcoded, duplicated 3× | **App config** |
| Reserve floor $500 / warning $1,000 | 884, 1832 | Hardcoded | **App config** |
| Near-tie windows $250 / $50 / $2,500 | 900–902 | Hardcoded | **App config** |
| Escrow flag threshold $50/mo | PT 648 | Hardcoded, duplicated | **App config** |
| Homestead $25,000 / $50,000 | PT 636–637 | Hardcoded | **App config** — statutory, changes rarely |
| Portability cap $500,000 | PT 628 | Hardcoded | **App config** — statutory |

## The snapshot recommendation, stated plainly

**Every one of these should be written to app configuration for defaults, and simultaneously frozen onto each saved scenario at the moment it is calculated.**

The reason is specific to your business, not generic good practice. You will reopen a buyer's file weeks after you built it. If the scenario reads its rates and its PMI table live from config, the numbers you showed that client in September will silently change in October when you update the rate board — and you will have no record of what you actually presented. A frozen assumption snapshot on each scenario is also what makes regression testing possible at all, and it is what lets you answer "what did we quote them?" defensibly.

Cost: one JSON column per scenario. Recommend storing it as a versioned assumptions blob with a `assumptions_version` tag, so a future engine change can detect and flag stale scenarios rather than silently recomputing them.

## Fields that could reasonably belong to more than one group

| Field | Tension | Recommendation |
|---|---|---|
| **Property tax rate** | Property-specific in reality (county millage, homestead status), but functions as a buyer-level default in Shopping Mode where no property exists | **Both.** A buyer-level shopping default plus a property-level actual. This is the field most likely to cause the C-4(c) contamination if it stays single-valued |
| **HOI / HOA / CDD / flood** | Property-specific, but the buyer needs shopping-range defaults | **Both**, same pattern. This is exactly the contamination path in C-4(c) |
| **Closing cost %** | System assumption; `ccOverride` is property-specific | Split: `ccPct` = system, `ccOverride` = property |
| **Interest rates** | Market assumption, but locked per-buyer at some point in the transaction | System default → snapshot at scenario creation → optionally a buyer-level locked rate after lock |
| **DTI limit** | Program constant in the BSE, buyer-level input in the Comfort Calculator | **Requires your decision.** See C-6 |
| **Loan term** | System constant today (360), but a real product choice | Should become scenario-level if 15-year is ever supported |
| **Buyer priority / planned stay** | Buyer-level, but can legitimately change per property | Buyer-level with a per-scenario override |

---
# 9. PROPOSED PERSISTENT-STORAGE FIELD LIST — FOR YOUR REVIEW

> ## ⚠ NOT APPROVED. NOT A SCHEMA.
> This is a proposal derived from the production code, presented for your review as required. **No database, table, column, project, or credential was created.** Nothing here is implemented. Your written approval is required before any schema work begins.

## 9.1 BUYER PROFILE — proposed stored fields

| # | Field | Store? | Why it must be stored | Sensitive? |
|---|---|---|---|---|
| 1 | Buyer identifier / display name | **Yes** | Nothing today identifies a buyer; the entire Profile concept depends on it. **Net-new field** | No |
| 2 | Qualifying monthly income | **Yes** | Exact value required — bucketing changes DTI and therefore max price | **Yes** |
| 3 | Monthly non-housing debts | **Yes** | Same | **Yes** |
| 4 | Credit score | **Yes** | Exact value required — bucketing changes PMI pricing, program eligibility, and the LLPA flag | **Yes** |
| 5 | Own funds | **Yes** | Drives the cash-to-close ceiling and eliminations | **Yes** |
| 6 | Gift funds | **Yes** | Separate from own funds for `requiresGift` | **Yes** |
| 7 | Target / comfort payment | **Yes** | The buyer's stated goal; must follow them through the transaction | No |
| 8 | Preferred down payment — value | **Yes** | The buyer's stated goal | No |
| 9 | Preferred down payment — **unit** (`unitState.dp`) | **Yes** | **Mandatory.** The value is meaningless without it | No |
| 10 | Planned stay (years) | **Yes** | Switches the entire recommendation regime | No |
| 11 | Buyer priority | **Yes** | Drives six separate decision points | No |
| 12 | First-time buyer flag | **Yes** | Unlocks Conv 3% | No |
| 13 | VA eligible flag | **Yes** | Gates the whole VA program | No |
| 14 | VA use (first / subsequent) | **Yes** | Changes the funding fee | No |
| 15 | VA disability exemption | **Yes** | Waives the funding fee | **Yes — health-adjacent. Store the boolean only. Never a reason, rating, or supporting document** |
| 16 | Shopping-default tax rate + unit | **Possibly** | Only if you separate buyer defaults from property actuals — recommended, see C-4(c) | No |
| 17 | Shopping-default HOI / HOA / CDD / flood | **Possibly** | Same | No |
| 18 | Created / updated timestamps | **Yes** | Net-new. Nothing today has a timestamp usable across days | No |
| 19 | Owner user id | **Yes** | Net-new. **Required for RLS** | No |

## 9.2 PROPERTY SCENARIO — proposed stored fields

| # | Field | Store? | Why | Sensitive? |
|---|---|---|---|---|
| 20 | Scenario id (UUID) | **Yes** | Net-new. Nothing today has identity | No |
| 21 | Parent buyer id | **Yes** | Net-new. The Profile → Scenario relationship | No |
| 22 | Scenario label / property address | **Yes** | "123 Main Street." Net-new in the BSE | No |
| 23 | **Explicit mode** (shopping plan vs property) | **Yes** | Net-new. **Do not infer from a null price** — see Section 7 | No |
| 24 | List price | **Yes** | The property | No |
| 25 | Property tax value + **unit** | **Yes** | Unit is mandatory for the same reason as #9 | No |
| 26 | HOI ($/mo) | **Yes** | | No |
| 27 | HOA ($/mo) + N/A confirmed flag | **Yes** | The N/A flag is real data — it feeds the confidence signal | No |
| 28 | CDD ($/mo) + N/A confirmed flag | **Yes** | | No |
| 29 | Flood ($/mo) + N/A confirmed flag | **Yes** | | No |
| 30 | Offer price | **Yes** | | No |
| 31 | Seller concession ask + **unit** | **Yes** | Unit mandatory | No |
| 32 | Negotiation mode | **Yes** | | No |
| 33 | Manual split buydown / costs + auto flag | **Possibly** | Only meaningful if C-9 is addressed; otherwise this stores a value the engine ignores | No |
| 34 | Counter price | **Yes** | | No |
| 35 | Counter concession + **unit** | **Yes** | Unit mandatory | No |
| 36 | Counter loan type override | **Yes** | | No |
| 37 | Closing cost override ($) | **Yes** | Property-specific figure from an actual CD | No |
| 38 | Millage rate | **Yes — future requirement** | Required by the FL tax engine (`property-tax.html:592`). Reserved now; populated when integration occurs | No |
| 39 | Non-ad-valorem assessments | **Yes — future requirement** | Required by the FL tax engine (line 593). Reserved now | No |
| 40 | Seller's current annual tax bill | **Yes — future requirement** | The only proxy for the seller's Jan-1 assessed value; gates the escrow comparison. Reserved now | No |
| 41 | Homestead intent flag | **Yes — future requirement** | Gates the entire exemption branch (line 595). Reserved now | No |
| 42 | Portability: prior market / prior assessed | **Yes — future requirement** | Required for the portability branch (625–626). **Note: these describe a property the buyer previously owned — arguably BUYER-level, not property-level.** Flagged in Section 8 | No |
| 42a | Closing / occupancy date | **Yes — future requirement** | **Does not exist in either tool today.** Without it the first-year vs following-year bill cannot be modeled at all (Section 3, item 8). Net-new | No |
| 43 | Status (shopping / offered / countered / accepted) | **Yes** | Net-new. Required for the "Accepted Property" concept | No |
| 44 | Created / updated timestamps | **Yes** | Net-new | No |

## 9.3 ASSUMPTIONS SNAPSHOT — proposed per-scenario

| # | Field | Store? | Why |
|---|---|---|---|
| 45 | Rates used (conv / FHA / VA) | **Yes** | So a reopened scenario shows what you actually quoted |
| 46 | Closing cost % used | **Yes** | Same |
| 47 | PMI table version or contents | **Yes** | Same |
| 48 | UFMIP / FHA MIP / VA fee values used | **Yes** | Same |
| 49 | Loan limits used | **Yes** | Same — and these change annually |
| 50 | Program DTI ratios used | **Yes** | Same |
| 51 | Concession limit table used | **Yes** | Same |
| 52 | Buydown ratio used (0.25 or 0.24) | **Yes** | **Directly relevant to C-5** |
| 53 | Loan term used | **Yes** | Currently always 360 |
| 54 | `assumptions_version` tag | **Yes** | Lets a future engine flag stale scenarios instead of silently recomputing |

## 9.4 Summary counts

| Category | Fields | Of which sensitive financial | Of which net-new |
|---|---|---|---|
| Buyer Profile | 19 | 7 | 4 |
| Property Scenario | 25 | 0 | 7 |
| Assumptions Snapshot | 10 | 0 | 10 |
| **Total** | **54** | **7** | **21** |

**Twenty-one of fifty-four proposed fields do not exist in the current application in any form.** That is the real scope of the persistence work — it is not "save what's on screen," it is "invent an identity and versioning model that has never existed."

## 9.5 Decisions

### Settled by you — recorded as a requirement

**FL tax integration into the BSE is a FUTURE ARCHITECTURAL REQUIREMENT.** Not implemented in this phase. Schema consequences, recorded now so the design does not have to be reopened later:

- Fields **38–42 plus 42a are reserved** at Property Scenario level. Reserving the columns now costs nothing; retrofitting them after scenarios exist costs a migration.
- The `taxRate` + `taxRate_unit` pair (field 25) must be designed as **one of two possible tax methods**, not as the only one. Recommend an explicit `tax_method` discriminator (`flat_rate` | `fl_millage`) on the scenario from day one, so existing scenarios remain reproducible after integration rather than being silently recomputed under a different model.
- The assumptions snapshot (Section 9.3) must carry the tax method and its constants, or **no pre-integration scenario will be reproducible afterward**. This is the single most important schema consequence of the decision.
- Integration is a **result-changing** change affecting every payment, max price, and cash-to-close figure for every Florida property (Section 14, rank 10). It belongs in Phase 6 with its own regression pass, not bundled into persistence.

### Still open — two decisions before schema work

1. **Buyer-level tax/HOI/HOA/CDD/flood shopping defaults — separate from property actuals, or single-valued?** Separating them fixes C-4(c). Keeping them single-valued means the buyer's shopping range keeps moving when you evaluate a condo. This decision also determines whether field 42 (prior home values) sits at buyer or property level.
2. **Does the DTI limit become a buyer-level input (Comfort Calculator behavior) or stay a program constant (BSE behavior)?** This is the single largest driver of the $115,338 gap.

---

# 10. CONFIRMED PROHIBITED-DATA LIST

The BSE must never be designed to store:

- Social Security numbers
- Dates of birth
- Driver's license numbers
- Government identification numbers
- Bank account numbers
- Credit card numbers
- Login credentials or passwords
- Copies of credit reports
- Bank statements
- Paystubs
- W-2s
- Tax returns
- Asset statements
- Income documentation
- Identification documents
- Uploaded borrower documents of any kind
- Full URLA / 1003 data, unless a specific individual field is independently required by the strategy calculations

## 10.1 Audit result — clean

**No prohibited-data storage was found in any audited file.** Specifically confirmed absent across all seven files:

| Check | Result |
|---|---|
| File upload inputs (`type="file"`) | **Zero** in every file |
| `<form>` elements | **Zero** in every file |
| Network transmission (`fetch`, `XHR`, `sendBeacon`, WebSocket) | **Zero** in every file |
| SSN / DOB / license / account-number fields | **Zero** |
| Document repository or attachment logic | **Zero** |
| Credential handling | **Zero** |

The BSE stores nothing at all (Section 5), so it cannot currently store prohibited data. The Comfort Calculator writes only the 19 numeric field values listed in Section 4. `property-tax.html` writes nothing.

## 10.2 Three items flagged for your attention — not violations, but adjacent

**F-1 — VA disability exemption is health-adjacent data.** `#vaExempt` (line 376) is a boolean that indicates the borrower has a service-connected disability rating. It is required by the calculation (it waives the funding fee), so it qualifies as an approved exact input. **Recommendation: store the boolean only.** Never store the rating percentage, the condition, the VA award letter, or any supporting documentation. Treat this field as sensitive under RLS.

**F-2 — the `hws_clients` localStorage key implies a client roster that does not exist yet.** `property-tax.html:576` reads it; nothing writes it. If a future tool starts populating it, it becomes an unencrypted, unauthenticated, browser-local list of client names on whatever machine the tool was used on — including a machine that is not yours. **Recommendation: retire this key rather than implement it.** Client identity belongs in Supabase behind RLS, not in localStorage.

**F-3 — the Comfort Calculator's share link encodes income and debts into a URL.** `buildShareURL()` puts `annualIncome`, `monthlyIncome`, and `monthlyDebt` into query parameters that are then copied to the clipboard and sent to a client or agent. Those values land in browser history, referrer headers, and any chat or email system the link passes through. This is not prohibited data, but it is **sensitive financial data traveling in cleartext through third-party systems**, and it is the pattern most likely to be carried forward into the redesign. **Recommendation: when share links are rebuilt on Supabase, share a token that resolves server-side, not the values themselves.**

## 10.3 Standing rule going forward

The Buyer Strategy Engine is a **strategy tool**, not a Loan Origination System, a document repository, a credit-report repository, or a replacement for the borrower loan file. Any future feature request that would require storing an item from the list above should be treated as belonging in the LOS, not here.

---

# 11. REGRESSION-TEST BASELINE / SCENARIO LIST

**No test environment was created and no test was run, as instructed.** This section identifies what must be captured, and states clearly which expected values could be derived statically and which cannot.

## 11.1 Existing test assets

**There are none.** No test file, no fixture, no assertion, no expected-output file, and no `console.assert` exists anywhere in `Tools/Live` or `Tools/Staging`. The `package.json` declares no test script. **The regression baseline must be captured from the running production application before any refactor begins.** This is the single highest-priority action item.

## 11.2 The invariant that must hold

Before anything else, the redesign must preserve this relationship, which is currently guaranteed by construction:

> `maxPriceForScenario`'s `k` and `b` (lines 737–738) mirror `computeScenario`'s PITI assembly exactly, including the conventional-MI-on-base-loan vs FHA-MI-on-loan-amount asymmetry.

**Test:** for every scenario, `computeScenario(price = maxPrice).piti` must equal the binding ceiling's payment to within a cent. If that breaks, max price stops reproducing the payment and every number in the tool becomes internally inconsistent. This deserves an automated assertion, not a manual check.

## 11.3 Baseline scenarios to capture

All scenarios use the shipped defaults unless stated: score 740, own funds $40,000, gift $0, target $3,200, income $9,500/mo, debts $650, stay 7 years, priority balanced, rates 6.750 / 6.250 / 6.125, ccPct 3%, tax 1.20%, HOI $150, HOA/CDD/flood 0 with N/A checked.

| # | Scenario | Setup | Capture |
|---|---|---|---|
| **R-1** | Conventional baseline, Shopping Mode | defaults, price blank | Comfort Purchase Price, Max Qualifying Price, all program cards: price, P&I, MI, taxes, PITI, cash to close, binding constraint |
| **R-2** | Conventional, Specific Mode | price $400,000 | Same, plus eliminations |
| **R-3** | FHA 3.5% | score 660, FTHB on | FHA card in full, UFMIP, financed loan, MIP life-of-loan flag |
| **R-4** | FHA 10% tier | score 540 | Confirms `mipDropMonth = 132`, `mipLife = false` |
| **R-5** | FHA below floor | score 480 | Elimination reason text (regex-parsed downstream) |
| **R-6** | VA first use | VA on, score 700 | Funding fee 2.15%, zero MI, no loan-limit ceiling |
| **R-7** | VA subsequent use | VA on, `vaUse = sub` | Funding fee 3.30% |
| **R-8** | VA exempt | VA on, `vaExempt` checked | Funding fee 0 |
| **R-9** | High down payment | dpTarget 25%, price $500,000 | Custom Conv tier above 20.5%, PMI = 0, concession limit 9% |
| **R-10** | Low down payment / max PMI | Conv 3%, FTHB on, score 640 | PMI band `a` = 1.35% |
| **R-11** | PMI cancellation | Conv 5%, price $400,000 | `cancelMonth`, `postCancelPITI`, `miCostHorizon` |
| **R-12** | No PMI | Conv 20% | PMI = 0, `cancelMonth = null` |
| **R-13** | **PMI band boundaries** | LTV exactly 80.00, 85, 90, 95 | Confirms the `80.0001` epsilon and each band edge |
| **R-14** | **Credit bucket boundaries** | score 639/640, 659/660, 679/680, 699/700, 719/720, 739/740, 759/760 | Confirms all eight `scoreBucket` edges |
| **R-15** | Tax as % | tax 1.20%, price $450,000 | `taxes = price × 1.20/100/12` |
| **R-16** | **Tax as $ (fixed escrow)** | tax toggle `$`, $6,000/yr, price $450,000 | `taxFixed = true`, price-invariant tax, and `taxPer = 0` in the max-price solver |
| **R-17** | **Tax unit toggle round-trip** | 1.20% → `$` → `%` at price $437,000 | **Documents the C-4(a) lossy conversion.** Capture the actual drift |
| **R-18** | **Tax unit toggle in Shopping Mode** | price blank, tax 1.2, toggle to `$` | **Documents the silent reinterpretation.** Expect escrow to collapse to ~$0.10/mo |
| **R-19** | Cash-limited binding | own funds $15,000, price blank | `binding = 'Cash to Close'` on every scenario |
| **R-20** | DTI-limited binding | income $6,000, debts $1,500 | `binding = 'Back-end DTI'` |
| **R-21** | Loan-limit binding | income $30,000, funds $400,000 | `binding = 'Conforming Loan Limit'` / `'FHA Loan Limit'` |
| **R-22** | Seller concession — concession path | price $450,000, offer $440,000, mode `concession` | Full path outcome, `over` flag, allocation |
| **R-23** | Seller concession — reduction path | same, mode `reduction` | Full path outcome |
| **R-24** | Seller concession — split path | same, mode `split` | Full path outcome |
| **R-25** | Seller concession — compare | same, mode `compare` | `recommendedPathKey` and the full comparison table |
| **R-26** | **Concession over limit** | Conv 95% LTV, concession 5% (limit 3%) | `over = true` and the warning copy |
| **R-27** | **Explicit concession + price gap together** | offer below list AND `offerConc` > 0 | **Documents C-8.** Capture the displayed "change from our offer" and the true value |
| **R-28** | Rate buydown | concession to buydown, price $450,000 | Points, `round125` reduction, new rate, new P&I, break-even |
| **R-29** | **Buydown ratio** | same as R-28 | **Capture at 0.25. This is the C-5 comparison point against Staging's 0.24** |
| **R-30** | Gap Solver — payment | target $2,500, price $450,000 | All remedies, the bisection result, the concession-vs-price table |
| **R-31** | Gap Solver — cash | own funds $10,000, price $400,000 | All remedies |
| **R-32** | Gap Solver — DTI | income $6,500, debts $1,800 | All remedies, `dtiPrice` |
| **R-33** | **Gap Solver bisection convergence** | a case requiring a large buydown | Iteration count and final rate; confirms termination |
| **R-34** | Offer Strategy | price $500,000, offer $485,000, concession $8,000 | Full Section 4 output |
| **R-35** | Counteroffer — accept as-structured | counter $492,000, counter conc $4,000 | `netVal`, `change`, all three panels |
| **R-36** | Counteroffer — restructure wins | a case where `optimalRestructure` differs | Optimal R/C split, the ask, the benefit |
| **R-37** | **Counteroffer with a prior concession ask** | R-27 setup, then a counter | **Documents C-8's sign flip.** Capture the green/red indicator |
| **R-38** | Buyer priority × 4 | run R-1 at balanced / payment / cash / power | Which card is starred, which path wins |
| **R-39** | **Planned stay regime switch** | run R-1 at stay 3, 7, and 10 | **Confirms the 3→5 and 7→10 discontinuities.** The recommended program can flip |
| **R-40** | Near-tie ordering | three scenarios inside the $50 PITI window | **Documents the non-transitive comparator.** Capture the winner |
| **R-41** | Blank credit score | clear `#score` | **Documents the 300 coercion** and the resulting total elimination |
| **R-42** | Price = "0" | enter `0` in price | **Documents M-1** — badge says "Specific Scenario," Section 2 stays hidden |
| **R-43** | N/A checkbox destruction | enter HOA $250, tick HOA N/A | **Documents C-4(b)** — capture both the one-cycle-stale render and the destroyed value |
| **R-44** | dpTarget corruption | 10% target, price $400,000, toggle to `$`, change price to $600,000 | **Documents C-4(a)** — capture the stale $40,000 |
| **R-45** | HOA contamination of buyer cards | R-1, note Comfort Price; add HOA $340; re-note | **Documents C-4(c)** — the "buyer-only" number moves |
| **R-46** | Manual concession split | R-22, then set a manual split | **Documents C-9** — cards unchanged, Gap Solver table changes |
| **R-47** | **Comfort Calculator parity** | the C-6 worked inputs in both tools | The $115,338 gap, as the documented starting delta |

## 11.4 Florida property-tax baselines (`property-tax.html`)

| # | Scenario | Setup | Capture |
|---|---|---|---|
| **T-1** | No homestead | $500,000, 18.2515 mills, non-ad-val $814.60 | Card 2 total and monthly |
| **T-2** | Homestead, no portability | same + homestead | Card 3 total; confirms the effective $37,500 blended exemption |
| **T-3** | **Portability upsizing** | prior mkt $400,000, prior assessed $250,000, buy $600,000 | Benefit $150,000; assessed $450,000 |
| **T-4** | **Portability at the cap** | prior mkt $1,200,000, prior assessed $600,000, buy $900,000 | Benefit capped at $500,000 |
| **T-5** | **Portability downsizing** | prior mkt $800,000, prior assessed $300,000, buy $400,000 | **Documents C-2.** Expect ad valorem $0 and Card 3 = $814.60/yr |
| **T-6** | **Assessed below $75,000** | a case where portability drives assessed to $50,000 | **Documents C-10(b)** — roughly halved estimate |
| **T-7** | **School-blend error** | $500,000 at 18.2515 mills | **Documents C-10(a)** — capture $8,441.32 against a 38%-school true value of $8,386.56 |
| **T-8** | Breakdown table reconciliation | any homestead case | **Documents C-10** — the rows do not sum to the printed total |
| **T-9** | Escrow comparison | current bill $6,987.09 | Card 4, all three columns |
| **T-10** | Negative escrow delta | reassessed below current, homestead off | **Documents the `$-123` formatting** and the always-green column |
| **T-11** | Millage with two decimals | enter `18.25.15` | **Documents the silent truncation to 18.25** |

## 11.5 What can and cannot be established statically

**Can be derived by hand from the quoted formulas** — I have verified the arithmetic for the C-6 worked example, the C-2 downsizing case, and the C-10 school-blend case:

- Any single `computeScenario` output, given the inputs
- Any `maxPriceForScenario` ceiling
- PMI and MIP lookups
- Concession limits
- `property-tax.html` Cards 2 and 3
- The Comfort Calculator's `calcLoan` and `calculate` outputs

**Cannot be established statically — must be captured from the running application:**

- `monthToBalance` PMI cancellation months (a 360-iteration loop)
- Both bisection solvers' converged results (`concessionToCloseGap`, `additionalForPayment`)
- `pickBestOverall` and `pickPathWinner` winners in near-tie cases — **order-dependent by construction**, so these must be captured, not computed
- `optimalRestructure`'s chosen R/C split
- All rendered prose (elimination reasons, guides, headlines) — and note that `programCards` **regex-parses** elimination strings at lines 1032–1037, so the exact wording is load-bearing and must be captured verbatim
- Any output involving the change log
- Everything in Section 4, which depends on `recalcCounter`'s second `gatherInputs()` call

## 11.6 Capture method

Run each scenario in the current production BSE, and for each record: every input, every displayed number in all four sections, every prose string verbatim, the binding constraint, and the recommended card and path. Store as structured JSON, one file per scenario, committed to the repository alongside the code.

**The rule going forward: the redesigned application must reproduce every captured value exactly, unless a specific calculation change has been separately identified, explained, and approved by you in writing.**

---
# 12. TECHNICAL AND ARCHITECTURAL RISKS

Findings discovered during the audit that were **documented and not fixed**, per the audit-only rule. The HIGH and CRITICAL items are in the opening section; this section collects the MEDIUM findings and the structural concerns.

## 12.1 Multiple competing sources of truth

| # | Duplication | Locations | Risk |
|---|---|---|---|
| 1 | **Two BSE files** | Live (tracked, **authoritative**) vs Staging (untracked, suspect, 0.24 buydown ratio) | **Critical — C-5** |
| 2 | **Two deployed Comfort Calculators** | flat file vs directory copy, one lacking share | **High — C-12** |
| 3 | **Three tax models in production** | BSE 1.20% flat, CC $5,000 flat, PT millage-based | **Critical — C-1** |
| 4 | **Two closing-cost models inside the BSE** | `computeScenario` honors `ccOverride`; `maxPriceForScenario`, `cashAtPrice`, `buyingPowerCardsHTML` use `ccPct` only | Medium — max price and cash to close disagree whenever an override is entered |
| 5 | **Two priority-pick implementations** | `Engine.priorityPick` 979 and `priorityScenario` 1838, byte-identical | Medium — the starred card and the Gap Solver's reference scenario can desynchronize |
| 6 | **Three copies of the $150 / 36-month rule** | 875–877, 1024–1026, 2147–2153 | Medium |
| 7 | **Five copies of the loan-limit ternary** | 752, 753, 831, 1354, 1557, 1592 | Medium — annual limit updates must touch five sites |
| 8 | **Three concession-allocation policies** | `optimalSplit` (dead), `priorityAlloc`, `optimalConcAlloc` — the live two have **different policies** | Medium |
| 9 | **Two definitions of "has a price"** | `rawBlank('price')` at 1144 vs `inp.price > 0` at 2446 | Medium — M-1 |
| 10 | **Two elimination lists** | `Engine.programEliminations` (discarded) and `run`'s inline gating. They **disagree** on names in the 500–579 score window | Low — the discarded one is unused |

## 12.2 State-mutation hazards

| # | Finding | Lines | Severity |
|---|---|---|---|
| 11 | `setUnit` destructively rewrites `#dpTarget` / `#taxRate` using the property price; lossy; silently reinterprets in Shopping Mode | 2807–2827 | **Critical — C-4a** |
| 12 | `updateInlineHints` overwrites HOA/CDD/flood with `'0'` at render time, one cycle stale | 1243–1246 | **Critical — C-4b** |
| 13 | The "buyer-only" cards retain property-level tax/HOI/HOA/CDD/flood | 1403, 735–738 | **Critical — C-4c** |
| 14 | `setOfferConcUnit` re-bases a `%` concession the instant an offer price is typed, without converting the stored digits | 2612–2624 | Medium |
| 15 | `setCounterUnit` — same pattern for `#counterConc` | 2586–2593 | Medium |
| 16 | `recalc` mutates `inp` **after** `Engine.run` already consumed it; every renderer gets a mutated `inp` alongside a `res` computed from the unmutated one | 2402 vs 2408–2417 | Low today, real temporal-coupling trap |
| 17 | `recalcCounter` calls `gatherInputs()` **again**, producing a fresh object with `appliedPath = null`, `concessionOn = false`. Section 4 evaluates the counter against a buyer with **no offer strategy applied**, while Sections 1–3 evaluate against one that does. Undocumented | 2720 | Medium |
| 18 | `pickBestOverall` writes `_gapMode` / `_reason` onto shared scenario objects, and is called on overlapping subsets four times per render | 919–921 | Medium — `_reason` reflects whichever call ran last |
| 19 | `concSplit` is clobbered every recalc, and `normalizeSplit` runs unconditionally — a manual split is silently re-clamped | 2425–2429 | Medium — C-9 |
| 20 | `appliedConcTotal` is a module global read back by the split handlers rather than passed as a parameter | 1104, 2418, 2780–2783 | Medium |
| 21 | A null `neg` silently discards the user's concession — Section 3 shows a live concession analysis while Section 2 shows nothing and the split UI shows $0 | 2408, 1642 | Medium |

## 12.3 Correctness findings (documented, not fixed)

| # | Finding | Location | Severity |
|---|---|---|---|
| 22 | Counteroffer "change from our offer" omits `sellerConcession`; the sign can flip | BSE 2727 | **High — C-8** |
| 23 | Comfort Calculator strands borrowing power below 80% LTV | CC 817–828 vs 1098 | **High — C-7** |
| 24 | FL portability downsizing absent; can zero the ad-valorem bill | PT 627–632 | **Critical — C-2** |
| 25 | FL school/non-school millage blended 50/50 | PT 636–639 | **High — C-10a** |
| 26 | FL second exemption implemented as a floor, wrong below $75,000 assessed | PT 637 | **High — C-10b** |
| 27 | FL breakdown table does not reconcile to its own total | PT 772–777 | Medium |
| 28 | FL: no SOH annual cap, no multi-year projection, despite Card 3 being labeled "long-term" | PT — absent | Medium |
| 29 | FL: no non-homestead 10% cap | PT — absent | Medium |
| 30 | FL: no 4% November discount — all escrow figures run ~4% high vs what servicers collect | PT — absent | Medium |
| 31 | FL: no first-year vs following-year distinction; no closing-date input | PT — absent | **High — see Section 3** |
| 32 | FL: millage accepts multiple decimals and silently truncates; no upper bound | PT 520 | Medium |
| 33 | FL: homestead escrow column always renders green; `hseClass` computed and discarded | PT 699–703 | Medium |
| 34 | BSE: `pickBestOverall`'s comparator is non-transitive; sort results are order-dependent with 3+ near-tied scenarios | 894–917 | Medium |
| 35 | BSE: conventional concession limit boundary is `>=75` where the agency grid is `>75` | 604 | Low |
| 36 | BSE: occupancy is not modeled — investment property's 2% concession cap does not exist | 599 | Medium |
| 37 | BSE: `cashToClose` omits prepaids, escrow reserves, and per-diem interest — systematically low vs a real CD | 674–675 | Medium |
| 38 | BSE: seller concessions never enter the max-price ceiling set | 741–753 | Medium |
| 39 | BSE: blank credit score coerces to **300**, eliminating every program | 1179 | Medium |
| 40 | BSE: `dpTarget` of 0 is discarded, so a legitimate 0%-down VA intent reads as "no target" | 1149 | Medium |
| 41 | BSE: `pmiBand` has no upper bound — LTV 105% prices as 97% | 575–581 | Low |
| 42 | BSE: `programCards` **regex-parses** human-readable elimination strings to build its notes; any wording change silently degrades them to "is not eligible" | 1032–1037 | Medium |
| 43 | BSE: only `skipped[0]` is reported when multiple conv tiers were skipped | 1031 | Low |
| 44 | BSE: `reasonFor` claims "avoids FHA life-of-loan MIP" whenever any FHA scenario is in the pool, regardless of whether it actually has `mipLife` | 929 | Low |
| 45 | BSE: `reasonFor` branches at `stay>=8` while `pickBestOverall` switches regime at `stay>7` — consistent only by accident of the dropdown options | 929 vs 899 | Low |
| 46 | BSE: `maxLoanAt` uses `s.maxPrice` (the ceiling) not `s.price` (the deal on the table); internally consistent but easy to misread on a client call | 1480–1485 | Medium |
| 47 | BSE: `buyingPowerCardsHTML` falls back to a hardcoded `45` back-end rather than the program's actual ratio | 1356 | Low |
| 48 | BSE: `dpMatches` tolerance is ±1% of price — at $500,000 a "5% down" target matches 4.0%–6.0%. In Shopping Mode each scenario is judged against a **different** price | 792 | Medium |
| 49 | BSE: `fmtVal` formats the OLD value using the NEW unit, polluting the change log with a false entry on every unit toggle | 2360 | Medium |
| 50 | CC: `applyURLParams` returns false unless a `CALC_FIELDS` key is present, so a buydown-only URL silently mixes URL intent with the recipient's stored session | CC 1630 | Medium |
| 51 | CC: share URL base is hardcoded to the production domain — links break on any preview deploy | CC 1615 | Low |
| 52 | CC: `totalCash` and the closing-costs-included toggle are saved, shared, and restored **nowhere** | CC 1525–1527 | Medium |
| 53 | CC: `r_dti` uses `comfortTotal` while `r_comfortDTI` uses the raw input — the two cards disagree on screen when the comfort payment is DTI-capped | CC 1113 vs 1117 | Medium |
| 54 | PT: client name interpolated unescaped into an inline `onclick` — currently unreachable, but a live pattern | PT 579 | Medium |

## 12.4 Performance

**Roughly six full engine runs per keystroke**, with no debounce, no `requestAnimationFrame` batching, and no memoization. Sources: the primary `Engine.run`; three inside `analyzeNegotiation` → `eligibleAt`; one inside `recalcCounter` → `counterScenario`; four more `counterScenario` calls in `optimalRestructure`; plus up to two 60-iteration bisections. `init` binds `recalc` to both `input` and `change` on every control, and `attachFormatting` adds a third on blur for ten dollar fields — so a blur after typing can fire `recalc` three times.

This is acceptable today because everything is local and synchronous. **It will not survive a network round-trip on the same path.** Autosave-on-keystroke against Supabase is not viable with this architecture without debouncing and decoupling.

## 12.5 Structural concerns for the redesign

1. **No data model exists.** `gatherInputs()` is the only "model," and it is a one-way transient derivation — not round-trippable. A genuine `state → DOM` / `DOM → state` pair must be written from scratch, and `gatherInputs` must be refactored to consume that state object rather than the DOM. **This is the largest single piece of work and it touches the hot path.**
2. **No scenario identity, no versioning, no usable timestamps.** Nothing has an id, name, `created_at`, or revision. Change-log entries carry hour and minute only.
3. **Output is HTML string concatenation.** No component boundary, no re-render primitive. Any post-login state load means calling `recalc()` and repainting the whole page.
4. **Everything is in global scope and `init()` self-executes at parse time.** Incompatible with "authenticate, then load, then render."
5. **Unit state lives outside the DOM values.** See Section 5.5 — the highest-probability data-corruption path in the migration.
6. **The Engine is clean and should be preserved as-is.** Lines 526–1060 have no DOM dependency and can be lifted into a module with essentially no changes. **This is the asset the whole redesign should be built around.**

---

# 13. RISKS FOR FUTURE SUPABASE PERSISTENCE, AUTH, RLS, AND CROSS-DEVICE ACCESS

Grounded in what was actually observed. Nothing here was implemented.

## 13.1 Adding the client library costs the offline property

The BSE currently has **zero** `<script src>` tags and one inline script. Adding Supabase means either `<script type="module">` with a CDN ESM import — which forces the inline script into module scope and **breaks the current global-scope contract** that all the `onclick=` handlers depend on — or a UMD bundle tag.

Either way, a suite that today works fully offline with **zero supply-chain surface** acquires a third-party runtime dependency. For an internal underwriting tool used in a client meeting on a hotel wifi, that is a real trade, not a formality. **Recommendation: name it explicitly and decide it deliberately.**

## 13.2 Async boot vs the synchronous default-buyer flash

The file ends with a bare `init();` that immediately calls `recalc()`. Supabase auth and loading are asynchronous. Without an explicit loading state, the tool will **flash the hardcoded default buyer** — 740 score, $9,500 income, $40,000 funds — before the real data lands. Because those defaults look like plausible client data (finding C-3), that flash is actively dangerous on a screen-share, not merely ugly.

**Requirement: a gated boot with an explicit loading state, and defaults that are visibly empty rather than plausibly populated.**

## 13.3 Unit state must be restored without firing the converters

`unitState.dp`, `unitState.tax`, `offerConcUnit.v`, and `counterUnit.v` change the meaning of a DOM input's digits without changing the digits. They are not in `FIELD_LABELS`, so even the existing snapshot is lossy.

On restore, the value and the unit must be written together, and `setUnit()` / `setOfferConcUnit()` / `setCounterUnit()` **must not fire**, or the restored numbers will be **double-converted**. This is the highest-probability silent data-corruption path in the entire migration, and it will not surface as an error — it will surface as a buyer's down-payment target quietly being wrong.

## 13.4 Magic-link auth on a static Netlify site

Two specific obstacles were observed:

1. **Supabase magic links return tokens in the URL fragment.** The BSE has **zero** `location.hash` handling and the entire suite has **zero** `history.replaceState` — the standard way to strip the token from the address bar. Both are net-new.
2. **`netlify.toml` already contains a force-301 on the apex and a `/r/:id` rewrite pointing at `/buyer/strategy-builder.html`, a file that does not exist.** Every Supabase redirect URL must be registered in the project allow-list, and that dangling route occupies the short-link namespace. **Resolve the dead route before layering auth-aware routing on top, or you will be debugging two redirect systems simultaneously.**

## 13.5 Sharing collides with RLS

`client-tag.js` reads `?client=`, and the Comfort Calculator's `buildShareURL()` encodes the entire scenario into query params, with `?view=1` stripping the UI to a client-facing read-only view. **That is unauthenticated sharing by construction** — the recipient needs no account.

Under RLS a shared link must either remain an anonymous state-in-URL link, bypassing Supabase entirely (leaving **two persistence models coexisting**), or become a real row requiring an anon-readable share token with its own policy. **This decision needs to be made deliberately; the current code will not tell you which was intended.** See also finding F-3 in Section 10 — the current share links carry income and debts in cleartext.

## 13.6 Duplicate deployed copies will diverge under a shared backend

The two Comfort Calculators today quietly share one localStorage slot. Point both at one Supabase table and you get **two URLs writing the same rows with different feature sets** — the directory copy would load a scenario it has no UI to share. **Consolidate to one file with a redirect before migrating, not after.** The same hazard applies to Live vs Staging BSE if both are ever deployed.

## 13.7 Cross-device specifics

Your stated devices are office computer, laptop, iPad, and possibly phone. Three observations:

1. **The BSE has no responsive breakpoints below the desktop layout that were tested during this audit.** Cross-device access is not only a persistence question — the four-card program layout and the negotiation comparison table are wide. This should be validated on iPad before the persistence work is scoped, because it may change the UI work substantially.
2. **iPad Safari partitions and evicts storage aggressively.** This is an argument in favor of the cloud-first design you have already chosen, and against any localStorage fallback for anything that matters.
3. **No concurrency model exists.** If you open the same buyer on the laptop and the iPad, nothing today would detect or resolve the conflict. Recommend a simple `updated_at` optimistic-concurrency check with a visible "this was changed elsewhere" prompt, rather than silent last-write-wins.

## 13.8 Ownership — confirmed, and nothing was created

Per your direction and confirmed for the record:

- No Supabase project, table, policy, or credential was created.
- No account of any kind was created.
- No infrastructure was provisioned.
- No file was modified. All source files remain byte-identical to the state found.
- No dependency was installed and nothing was deployed.

HomeWealth Solutions LLC owns the Netlify application, the GitHub repository, and will own the Supabase project, the database, and all credentials. Development access should be scoped to specifically approved work.

---

# 14. WHAT COULD MAKE THE REDESIGN DANGEROUS, DIFFICULT, OR RESULT-CHANGING

Ranked by the likelihood of silently changing a number a client already saw.

| Rank | Hazard | Why it changes results |
|---|---|---|
| 1 | **Staging's 0.24 buydown ratio** | If Staging is ever treated as the base, **every buydown figure moves ~4%** with no visible signal. Live is 0.25 |
| 2 | **Unit state restored without its value, or with the converters firing** | Silent double-conversion of `dpTarget`, `taxRate`, `offerConc`, `counterConc`. Wrong numbers, no error |
| 3 | **Breaking the `k`/`b` mirror in `maxPriceForScenario`** | Max price stops reproducing the payment. Every number becomes internally inconsistent. **This is the invariant to protect above all others** |
| 4 | **Refactoring `pickBestOverall`'s comparator** | It is non-transitive by construction. Any "cleanup" to make it a proper comparator **will change which program is recommended** in near-tie cases — legitimately, but differently from today |
| 5 | **Rewording elimination messages** | `programCards` regex-parses them at 1032–1037. A wording change silently degrades card notes to "is not eligible" |
| 6 | **Deduplicating the loan-limit ternary or the $150/36-month rule** | Five and three copies respectively. Missing one produces an inconsistency that only shows on specific inputs |
| 7 | **Consolidating the two closing-cost models** | `computeScenario` honors `ccOverride`, `maxPriceForScenario` does not. Making them agree **will change max price** wherever an override is entered — arguably a fix, but it is a result change requiring approval |
| 8 | **Fixing C-4(c) — the buyer-card contamination** | Correcting it **will change the two headline numbers** for any buyer whose scenario carries a property HOA. This is the right fix and it must be approved as a result change |
| 9 | **Fixing C-8 — the counteroffer delta** | Correcting it **will change a displayed figure and can flip its color**. Right fix, still a result change |
| 10 | **Absorbing the FL tax engine into the BSE** | Every payment, every max price, every cash-to-close figure moves for every Florida property. This is the largest possible result change in the entire project |
| 11 | **Updating the stale constants** (2025/2026 loan limits, current rates) | Necessary, but it **will change results**. Do it as its own approved change with its own regression pass, not bundled into the migration |
| 12 | **Reviving dead code** | The coaching subsystem at 1291–1341 keys on `why==='DTI'`, a string the engine **never produces** (it emits `'Back-end DTI'`). Reviving it would silently produce an unreachable branch |
| 13 | **`programEliminations` being wired back in** | It disagrees with `run`'s inline gating in the 500–579 score window |
| 14 | **`recalcCounter`'s second `gatherInputs()`** | Section 4 deliberately evaluates against an un-applied buyer profile. "Fixing" that to share one `inp` **would change every counteroffer result** |
| 15 | **Async persistence on the recalc path** | Six engine runs per keystroke. Adding a network call here degrades the tool badly. Persistence must be debounced and decoupled from `recalc` |
| 16 | **`optimalSplit` vs `optimalConcAlloc`** | The dead function has a **different allocation policy** than the live one. Reviving the wrong one changes every concession recommendation |
| 17 | **`N = 360` hardcoded in three places** | 533, 2171, 2557. Adding loan-term support requires all three plus the Comfort Calculator's separate `termYears` model |
| 18 | **The Comfort Calculator's `pmt` has a different argument order** than the BSE's | `pmt(rate, pv, years)` vs `pmt(rate, months, pv)`. Any merge that copies call sites will produce silently wrong numbers |

---

# 15. RECOMMENDED NEXT STEP AFTER THIS AUDIT

**Do not start Phase 2 with Supabase.** Four things need to happen first, and three of them are decisions from you rather than work.

## Step 1 — Resolve the two competing BSE files (blocking, ~1 hour)

Until this is settled there is no stable thing to migrate. Decide: does Staging's condensation ship, and is the buydown ratio 0.25 or 0.24? Then either merge Staging into the repository properly or archive it with a date suffix. **Nothing else should start while two files claim to be the BSE.**

## Step 2 — Capture the regression baseline (blocking, ~1 day)

Section 11 lists 47 BSE scenarios and 11 property-tax scenarios. There are no existing tests, so this is the only record of what the tool does today. Capture it from the **current production Live file**, store it as JSON in the repository, and commit it before a single line changes.

Do this second, not first, so the baseline is captured against the file you settled in Step 1.

## Step 3 — Make two remaining decisions (blocking, decisions only)

**Already settled by you:** FL tax integration is a future architectural requirement. Recorded in Section 9.5 with its schema consequences. Scheduled in Phase 6. Nothing further is needed from you on that point — but note the one thing it obligates the Phase 3 schema to do: carry a `tax_method` discriminator and a tax-method assumptions snapshot from day one, or pre-integration scenarios become unreproducible the moment integration lands.

Two decisions remain, and neither can be inferred from the code:

1. **Do buyer-level shopping defaults get separated from property-level actuals** for tax, HOI, HOA, CDD, and flood? My recommendation: **yes.** This is what fixes C-4(c), and it is the concrete mechanism behind the Buyer Profile vision. Without it, "buyer assumptions don't get overwritten by property assumptions" cannot be delivered. It also becomes more important once FL integration lands, because a buyer's shopping-range tax assumption and a specific property's millage-derived tax are then unmistakably different quantities.
2. **Does the DTI limit become a buyer-level input or stay a program constant?** My recommendation: **stay a program constant in the BSE, and retire the Comfort Calculator's 49.99% default.** It is the single largest driver of the $115,338 gap, and a user-settable DTI ceiling on an advisory tool invites a number you cannot defend.

## Step 4 — Then approve the field list, and only then build

Section 9's 54 fields are a proposal. Once Steps 1–3 are settled, the list will be shorter and more certain. Approve it in writing, then schema work can begin.

## What I recommend deferring, and why

**The two counteroffer and comfort-calculator correctness bugs (C-7, C-8) are tempting quick fixes. Do not fix them yet.** Both change displayed numbers. Fixing them before the baseline is captured means you lose the ability to prove the redesign preserved everything else. Capture first, then fix them as an explicit, approved, single-purpose change with its own regression run.

**The `property-tax.html` portability bug (C-2) is the one exception worth considering.** It can display a $68/month tax figure on a $400,000 home. That is a number you could put in front of a client. It is in a separate tool that the BSE does not depend on, so fixing it does not touch the migration path. **My recommendation: treat it as its own small, separately-approved fix with baselines T-3, T-4, and T-5 captured before and after — not as part of this project.** I did not change it.

## Suggested phase order after approval

| Phase | Content | Gate |
|---|---|---|
| **2** | Extract the Engine (526–1060) into a module unchanged; build the round-trippable state object; `state → DOM` and `DOM → state` | Regression suite passes 100% |
| **3** | Supabase project, schema, RLS, magic-link auth. **No calculation changes.** Schema must reserve the FL tax fields (38–42a) and carry a `tax_method` discriminator + tax assumptions snapshot, per Section 9.5 | Regression suite passes 100% |
| **4** | Buyer Profile / Property Scenario UI. Save, load, list, the shopping-plan-vs-property distinction | Regression suite passes 100% |
| **5** | Information hierarchy — the two-mode simplified surface over the existing analysis tools | Regression suite passes 100% |
| **6** | Approved calculation changes, each with its own regression pass and its own approval: stale constants (2025/2026 loan limits, current rates) → C-7 → C-8 → the closing-cost model → **FL property-tax integration (the confirmed architectural requirement) last, as the largest result change** | Each individually approved and diffed |

Phases 2 through 5 should not change a single number. Phase 6 is where numbers change, deliberately, one at a time, with a documented before and after.

---

## AUDIT-ONLY COMPLIANCE STATEMENT

- **No source file was modified.** All files remain byte-identical to the state found. Verified by `git status --porcelain` returning empty on `Tools/Live`.
- **No local server was run.** No dependency was installed. Nothing was deployed.
- **No Supabase project, table, RLS policy, authentication, account, or credential was created.**
- **No calculation logic was changed.** No refactoring, no cleanup, no "quick fixes."
- **No UI was redesigned.** The tools were not merged.
- Fifty-four findings were documented. **Zero were remediated.**
- Every finding rated HIGH or CRITICAL was independently verified against the source file after discovery.

**Phase 2 has not begun and will not begin without your explicit written approval.**

---

*Prepared for Doug Smith, President & Broker, CMA® · HomeWealth Solutions LLC · NMLS #2742458 · FL OFR Mortgage Broker License #MBR8082 · doug@homewealthsolutions.com · 813-733-7371*
