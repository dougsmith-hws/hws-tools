# Multifamily Financing & Return Analysis — V2 Design Specification
**HomeWealth Solutions LLC**
Prepared: 2026-06-11

---

## Positioning

**Tool name:** Multifamily Financing & Return Analysis
**Purpose:** Help investors understand how different financing structures affect qualification, cash required to close, monthly cash flow, cash-on-cash return, and long-term return.

**Explicitly out of scope:**
- Whether the property is a good investment
- Whether the client should purchase it
- Whether a cap rate is attractive relative to the market
- Investment recommendations of any kind

*The tool computes and compares. The advisor interprets and recommends.*

---

## 1. Page Layout

```
┌─────────────────────────────────────────────────────────┐
│ HEADER (sticky)                                         │
│ Left: HWS logo + brand                                  │
│ Center: "Prepared for [Client]" · "[Property Address]"  │
│ Right: ↗ Share with Client · Print/PDF · ← Hub          │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ SUMMARY STRIP — 3 focal metric tiles (read-only)        │
│ [Cap Rate: X.X%] [DSCR by scenario] [CoC by scenario]   │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ SECTION 1 — What does this property generate?           │
│ Inputs (left panel) + Computed outputs (right panel)    │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ SECTION 2 — Can I qualify, and what does it cost?       │
│ 3-scenario input cards + qualification comparison table │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ SECTION 3 — What does each financing structure return?  │
│ Return comparison table including exit analysis         │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ COMPLIANCE FOOTER                                       │
└─────────────────────────────────────────────────────────┘
```

**General layout notes:**
- Max content width: 1100px centered
- Inputs use a two-column card grid within each section (inputs left, outputs right where applicable)
- On mobile, columns stack vertically
- Section headers are phrased as questions (see Section Order below)
- No separate "Exit Analysis" section — exit analysis lives inside Section 3

---

## 2. Section Order

### Section 1 — "What does this property generate?"

**Inputs:**

| Field | Default | Notes |
|-------|---------|-------|
| Purchase Price | $500,000 | |
| Number of Units | 4 | +/− controls |
| Rent Per Unit / Month | $1,200 | Hint shows total |
| Vacancy Rate | 5% | |
| Expenses Per Unit / Month | $300 | Hint shows total; tooltip: taxes, insurance, maintenance, mgmt |
| Holding Period | 120 months | Hint shows years |
| Annual Appreciation Rate | 4% | **Labeled: "Client-Provided Assumption"** |
| Selling Costs | 7% | |

**Computed outputs (displayed prominently alongside inputs):**

| Output | Formula | Display |
|--------|---------|---------|
| Gross Monthly Rent | Units × Rent/Unit | |
| Vacancy Loss | Gross Rent × Vacancy % | shown as deduction |
| Effective Gross Income | Gross Rent − Vacancy | |
| Monthly Operating Expenses | Units × Exp/Unit | |
| **Net Operating Income (NOI)** | EGI − Expenses | **Hero output of this section** |
| **Cap Rate** | NOI × 12 ÷ Purchase Price | With one-line definition only |

**Cap Rate display rule:** Show the number and one line of definition: *"Net Operating Income ÷ Purchase Price — measures the property's income return independent of financing."* No market comparison, no benchmark color-coding, no qualitative label.

---

### Section 2 — "Can I qualify, and what does it cost to close?"

**Inputs:** Three financing scenario cards (same as current tool)
- Scenario 1: Cash (closing costs only)
- Scenario 2: Configurable (editable name, down %, rate, term, points, closing costs)
- Scenario 3: Configurable (same fields)

**Qualification Comparison Table:**

| Metric | Cash | [Scenario 2] | [Scenario 3] |
|--------|------|--------------|--------------|
| Purchase Price | | | |
| Down Payment | | | |
| Loan Amount | | | |
| Interest Rate | — | | |
| Loan Term | — | | |
| Points + Closing Costs | | | |
| **Cash Needed to Close** | | | |
| **Monthly Mortgage Payment** | — | | |
| **DSCR** | — | | |

**DSCR display rules:**
- Displayed as the bottom row of the table with larger, bolder font
- Color-coded: green ≥ 1.25 / yellow 1.00–1.24 / red < 1.00
- Reference line below the table (not inside it):
  *"Typical conventional investment property minimum: 1.25x. Portfolio lenders may vary. Actual qualification depends on borrower profile, property type, and lender guidelines. This is not a qualification determination."*
- DSCR formula shown on hover/tooltip: *"Annual NOI ÷ Annual Debt Service"*
- Cash scenario shows "—" for DSCR (no debt service)

---

### Section 3 — "What does each financing structure return?"

Single comparison table. No separate exit section.

**Cash Flow subsection:**

| Metric | Cash | [Scenario 2] | [Scenario 3] |
|--------|------|--------------|--------------|
| Gross Monthly Rent | | | |
| Vacancy Loss | | | |
| Effective Gross Income | | | |
| Operating Expenses | | | |
| Mortgage Payment | — | | |
| **Monthly Cash Flow** | | | |
| Annual Cash Flow | | | |
| **Cash-on-Cash Return** ← FOCAL | | | |

**Exit Analysis subsection** (within same table, separated by a subheader row):

| Metric | Cash | [Scenario 2] | [Scenario 3] |
|--------|------|--------------|--------------|
| Projected Sale Price | | | |
| Selling Costs | | | |
| Remaining Loan Balance | — | | |
| **Net Proceeds** | | | |
| **IRR** * | | | |

*\* Based on [X]% annual appreciation — client-provided assumption. Appreciation is not guaranteed and actual results will vary. This is not an investment recommendation.*

**Cash-on-Cash Return display rules:**
- Focal metric of this section — displayed larger, color-coded green (positive) / red (negative)
- No benchmark comparison or market reference

**IRR display rules:**
- Shown as summary metric at end of table — not positioned as the headline
- Asterisk links to appreciation assumption from Section 1
- Inline disclaimer directly below the IRR row (not just in the footer)

---

## 3. Summary Tiles

Three tiles in a horizontal row between the header and Section 1. These are **orientation anchors**, not verdicts.

**Tile 1 — Property Income**
- NOI: $X,XXX/mo
- Cap Rate: X.X%
- Single value (same regardless of scenario)
- No color coding

**Tile 2 — Financing Qualification**
- Three mini-columns, one per scenario
- Each shows: Scenario Name / DSCR / Cash-to-Close
- DSCR color-coded green/yellow/red
- This is the only place color-coding appears in the tiles

**Tile 3 — Return by Scenario**
- Three mini-columns, one per scenario
- Each shows: Scenario Name / Cash-on-Cash / IRR*
- Cash-on-Cash color-coded green (positive) / red (negative)
- IRR asterisked

---

## 4. Table Structure

### Two tables, not four.

**Table A — Section 2: Qualification**
Rows: Purchase Price, Down Payment, Loan Amount, Rate, Term, Points + Costs, Cash-to-Close, Payment, DSCR
Columns: Metric label + Cash + Scenario 2 + Scenario 3
DSCR is the final, visually distinct row.

**Table B — Section 3: Return**
Rows: Two subheader groups (Cash Flow / Exit Analysis) with the metrics listed above.
Columns: Metric label + Cash + Scenario 2 + Scenario 3
Cash-on-Cash is the focal metric of the cash flow group.
IRR is the final row of the exit group with inline disclaimer.

**Shared column design rules:**
- Scenario names are editable (inline text input in the column header)
- Same scenario name appears as the column header in both Table A and Table B
- Negative cash flows shown in parentheses: (X,XXX)
- Positive cash flows shown in green, negative in red

---

## 5. Metrics to Add

| Metric | Section | Rationale |
|--------|---------|-----------|
| NOI | 1 | Required for DSCR; also property context |
| Cap Rate | 1 | Standard informational metric; no commentary |
| DSCR | 2 | Most significant gap; primary Section 2 focal metric |
| Loan Amount (explicit) | 2 | Currently implied; should be displayed |

### Flagged for decision: Rent Growth Rate

The current tool assumes flat rents for the entire holding period. This meaningfully understates IRR on any hold longer than 3–4 years — a client keeping a property for 10 years at 3% annual rent growth ends the period with ~35% higher rents than year 1.

**Recommendation:** Add an optional Section 1 input — *"Annual Rent Growth — Client-Provided Assumption (default: 0%)"* — that scales effective rent over the holding period for the IRR calculation only. Year-1 cash flow and CoC are unaffected. The annual rent growth assumption uses the same "client-provided" labeling as appreciation.

This stays firmly within the mortgage advisor lane: it doesn't evaluate the investment, it makes the long-term cash flow projection more accurate. A flat-rent IRR on a 10-year hold is a misleading number, and including a visible 0% default makes the assumption explicit rather than hidden.

**Doug's call.** If added, both appreciation and rent growth should appear together in Section 1 under a clearly labeled "Long-Term Assumptions" group.

---

## 6. Metrics to Remove or Relocate

| Item | Action | Reason |
|------|--------|--------|
| "Investment Analysis Tool" banner label | Remove | Inconsistent with Financing & Return Analysis positioning |
| Gross Rent Schedule (current bottom table) | Relocate or remove | Useful sanity check but not part of the 3-section narrative. Option: collapsible "Reference" section at the bottom, below the compliance footer. Not in the primary flow. |
| Current summary tiles (Cash Flow / Cash-to-Close / IRR) | Replace | Replaced by the new 3-tile Summary Strip |
| Separate Results Summary section | Eliminate | Consolidated into Section 2 and Section 3 tables |
| Any narrative output labels calling IRR "strong" or cap rate "consistent with market" | Not currently in tool — explicitly exclude from V2 | Compliance with advisor boundary |

---

## 7. UX Improvements Supporting Advisor-First Philosophy

**Section headers as questions**
Each section header reads as a question, not a label. This is both a UX and positioning decision — it frames the tool as a guided analysis, not a data dump, and implicitly positions the advisor as the person answering the fourth question.

**Scenario names as persistent column headers**
Editable scenario names appear as column headers in both the Section 2 and Section 3 tables. A client can follow "25% Down" through qualification and return analysis without re-reading input cards. Reduces cognitive load; keeps the financing comparison coherent.

**Appreciation and rent growth grouped under "Long-Term Assumptions"**
Separating these from the operating inputs makes their status clear: they are not facts, they are planning assumptions. Clients and advisors should consciously choose them, not accept defaults blindly.

**DSCR threshold reference below the table (not inside it)**
The threshold line ("Typical conventional minimum: 1.25x") lives below the qualification table, not as a row within it. This keeps it contextual rather than appearing as a tool judgment. Paired with the disclaimer about actual qualification depending on borrower profile.

**IRR inline disclaimer**
The appreciation assumption disclaimer appears directly under the IRR row in Section 3, not only in the compliance footer. Clients reading the table see the caveat at the moment they're reading the number — not in footnote text they'll skip.

**Client view (shared link)**
When opened via share link (`?view=1`):
- Hide: all input cards, section input fields, Share button, Hub button
- Show: Summary Strip, Section 2 table, Section 3 table, compliance footer
- Add banner: *"Financing analysis prepared by HomeWealth Solutions · Contact Doug Smith to discuss your options · 813-733-7371"*
- Client sees analysis only — not inputs. Inputs live in the advisor's conversation, not the report.

**Print layout**
Print hides: all input cards, header action buttons, Hub button
Print shows: property address + client name + date header, Summary Strip, Section 2 table, Section 3 table, full compliance footer
Result: a clean one or two-page report Doug can hand across a desk or attach to an email.

**No winner declaration**
No row, tile, badge, or color combination should imply one scenario is recommended. The color-coding on DSCR signals qualification threshold (fact-based). The color-coding on cash flow signals positive/negative (math-based). Neither implies a recommendation.

---

## Summary: What Changes from V1

| Element | V1 | V2 |
|---------|----|----|
| Positioning | Multi-Unit Investment Loan Comparison | Multifamily Financing & Return Analysis |
| Structure | Units banner + inputs + 3 scenario cards + results table | 3 sequential sections answering 3 questions |
| Key missing metrics | NOI, Cap Rate, DSCR | All added |
| IRR placement | Summary tile + results table | Section 3 table, final row, with inline disclaimer |
| Cash-on-Cash | Results table row | Focal metric of Section 3 |
| DSCR | Absent | Focal metric of Section 2 |
| Cap Rate | Absent | Section 1 output, no commentary |
| Exit analysis | Separate section | Integrated into Section 3 |
| Summary tiles | Cash Flow / Cash-to-Close / IRR | NOI+Cap Rate / DSCR+CTC / CoC+IRR |
| Winner declaration | None | None (maintained) |
| Advisor boundary | Implicit | Explicit in design, headers, and disclaimers |

---

*Design specification only — no code changes. Awaiting approval before building.*
