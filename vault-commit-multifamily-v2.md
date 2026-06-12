# Multifamily Financing & Return Analysis — V2

**Date:** 2026-06-11
**Session type:** Product strategy + build

---

## Final Decisions

- **Tool name:** Multifamily Financing & Return Analysis (not "Multi-Unit Investment Loan Comparison," not "Acquisition Tool")
- **Positioning:** Mortgage advisor lane only — tool computes and compares; advisor interprets and recommends
- **File:** `buyer/multifamily-financing-analysis.html`
- **Architecture:** Single HTML file, two views — Advisor Workspace (default) + Client-Facing Report (`?view=1` and `@media print`)
- **Three-section structure:** Each section answers a question:
  - Section 1 — "What does this property generate?" → NOI + Cap Rate
  - Section 2 — "Can I qualify, and what does it cost to close?" → DSCR (focal metric)
  - Section 3 — "What does each financing structure return?" → Cash-on-Cash (focal metric) + IRR
- **No single hero metric** — one focal metric per section, not one tool-wide headline
- **DSCR color coding:** ≥1.25 green / 1.00–1.24 yellow / <1.00 red — threshold reference below table, not inside it
- **IRR label:** Dynamic — "IRR (X-Year Hold) *" — populated from holding period input
- **Cap Rate display:** Number + one-line definition only. No benchmark, no color coding, no qualitative label
- **IRR inline disclaimer:** Appears directly under the IRR row in Section 3, not only in the footer
- **No winner declaration:** No badge, color combination, or label implies a recommended scenario
- **Rent Growth input:** Optional, labeled "Client-Provided." Affects IRR only — Year-1 CoC and cash flow unaffected
- **Appreciation + Rent Growth:** Grouped under "Long-Term Assumptions — Client-Provided" in Section 1
- **Client report table rows (final order):** Cash Needed to Close / Loan Amount / DSCR / Monthly Cash Flow / Cash-on-Cash Return / IRR (X-Year Hold)
- **Client report Property Snapshot:** Purchase Price / Units / Gross Monthly Rent / Annual NOI / Cap Rate
- **Projected Sale Price in assumptions:** Included in client report assumptions section to make appreciation tangible
- **DSCR label in client report:** "DSCR (Debt Service Coverage Ratio)" — no thresholds, no context, no qualification language
- **Share URL hardcoded:** `https://tools.homewealthsolutions.com/buyer/multifamily-financing-analysis.html`
- **Hub updated:** 12 Tools Live; new card added to Buyer Tools section

---

## Strategy Reasoning

**Why Option A (Property → Financing) over Option B (Financing → Investment):**
The question an investor needs answered in sequence is: (1) What does this property generate independent of financing? (2) Can I qualify and what does it cost? (3) What does each structure return? Option B answers the wrong first question. Option A matches how a mortgage advisor actually guides the conversation.

**Why "Financing & Return Analysis" not "Acquisition Tool":**
An acquisition tool implies investment evaluation — deal scoring, cap rate benchmarks, buy/don't-buy signals. That's outside the mortgage advisor lane and creates compliance exposure. The tool computes and compares financing structures. The advisor interprets and recommends. Keeping those roles distinct is the core of the advisor-first positioning.

**Why three focal metrics instead of one:**
Each section has a different audience question. NOI/Cap Rate answers "what does the asset produce?" DSCR answers "can I get a loan?" CoC answers "what do I earn on my cash?" IRR answers "what's my total return at exit?" Forcing a single hero flattens the narrative and implies the tool is making a judgment. Three section-level metrics preserve clarity without declaring a winner.

**Why Loan Amount instead of Monthly Mortgage Payment in client report:**
Investors think in terms of leverage and equity — loan amount conveys how much they're borrowing and how much they put down. Monthly payment is already reflected in DSCR, Monthly Cash Flow, and CoC. Loan amount makes the capital structure explicit at a glance.

**Why Annual NOI in Property Snapshot:**
Cap Rate = Annual NOI ÷ Purchase Price. Showing Monthly NOI in the snapshot while the cap rate uses annual NOI creates a language mismatch. Both figures should speak the same unit.

**Why IRR inline disclaimer instead of footer-only:**
Clients read tables, not footnotes. A client who sees a 22% IRR and doesn't see the "client-provided appreciation assumption" caveat until the footer may misread the number as a guarantee. Inline placement ensures the caveat lands at the moment the client reads the number.

**Why rent growth as optional vs. default:**
A flat-rent IRR on a 10-year hold is a misleading number — it understates return for any client who expects even modest rent increases. Making rent growth optional with a visible 0% default makes the assumption explicit rather than hidden, without forcing clients to engage with it if they prefer simplicity.

---

## Final Assets

### Tool
- **`/Users/dougsmith/Tools/Live/buyer/multifamily-financing-analysis.html`** — Production-ready V2 (1,596 lines)
  - Advisor Workspace: sticky header, 3-tile summary strip, 3 sections, compliance footer
  - Client-Facing Report: header band, property snapshot, financing comparison table, assumptions grid, compliance footer
  - JS: `pmt()`, `remainingBalance()`, `calcIRR()` (Newton-Raphson), `computeScenario()` with rent growth support, `buildShareURL()`, `enterClientView()`, `applyParamsAndRun()`

### Design Spec
- **`/Users/dougsmith/Tools/Live/buyer/multifamily-v2-design-spec.md`** — Full written spec (302 lines)
  - Page layout, section order, table structure, metrics to add/remove, UX improvement rationale

### Advisor Boundary Principle (reusable framing)
> *The tool computes and compares. The advisor interprets and recommends.*

This framing resolves every "should the tool show X?" question. If showing X requires the tool to evaluate the deal, it's outside the lane. If showing X helps the client understand the financing structure, it belongs.

### Client Report Design Pattern (reusable)
One HTML file, two views:
- Advisor workspace = calculator with full inputs
- Client report = hidden `div` populated by same JS, revealed by `?view=1` + `@media print`
- Client sees: analysis only — no inputs, no advisor controls
- Banner in client view: contact info + "Save as PDF" button
- Print from advisor view: full compliance-safe report without input cards

---

## Brainstorm Insights Worth Preserving

**On positioning:** The tool's name does half the positioning work. "Investment Analysis Tool" implies the tool is evaluating the deal. "Financing & Return Analysis" implies the tool is presenting options. Title = positioning.

**On IRR:** IRR is a powerful number that can mislead. The safest IRR is one with a visible assumption, a dynamic label that communicates the hold period, and a disclaimer at the point of reading — not buried in the footer. Treat IRR as informational, not evaluative.

**On DSCR thresholds:** DSCR is the most significant gap in the V1 tool. It's the metric lenders actually use to qualify the loan, and it's invisible in V1. But the threshold reference ("1.25x minimum") should live below the table, not inside it — inside the table implies the tool is qualifying the loan. Below the table, it's context.

**On rent growth:** A flat-rent IRR on a 10+ year hold is quietly misleading. The right default isn't "assume growth" — it's "show the assumption explicitly." Making it a labeled client-provided input is better than either assuming growth or silently assuming none.

**On client report design:** The biggest upgrade over V1 wasn't the calculations — it was making the client report look like a prepared advisor deliverable instead of a calculator printout. Property Snapshot + Financing Comparison + Assumptions + Disclosure = a document you'd hand across a desk or attach to an email.

**On the advisor's fourth question:** The tool answers three questions. The advisor answers the fourth: "Which structure makes sense for you?" The section headers set this up implicitly — the advisor is positioned as the person who synthesizes the three answers into a recommendation.

---

## Dead Ends / Rejected Ideas

**Option B structure (Financing → Investment):** Rejected because it leads with scenario cards before the client knows what the property generates, making the inputs feel unanchored. The advisor answers "can I afford this?" before "is this property worth financing?" Wrong sequence.

**Single hero metric for the whole tool:** Rejected. No single metric (CoC, IRR, DSCR) answers all three questions. Elevating one creates a false hierarchy and implies the tool is making a judgment about which metric matters most.

**Acquisition scorecard / deal scoring:** Rejected entirely. Scoring whether a deal is "good" is investment advisory territory. The tool presents metrics without commentary. Cap Rate has a one-line definition and no benchmark. DSCR has a threshold reference with a disclaimer. Neither implies a verdict.

**Monthly NOI in client report Property Snapshot:** Replaced with Annual NOI. Monthly was inconsistent with Cap Rate calculation (which uses annual).

**Monthly Mortgage Payment in client report:** Replaced with Loan Amount. Payment is already reflected in DSCR, Cash Flow, and CoC. Loan Amount makes leverage explicit.

**"Investment Analysis Tool" banner label:** Removed from V2. Inconsistent with financing-first positioning.

**Separate Exit Analysis section:** Eliminated. Exit analysis lives inside Section 3 as a subsection, keeping the three-question narrative intact.

**Gross Rent Schedule (V1 bottom table):** Removed from primary flow. Could be added as a collapsible reference section if needed, but not in the main narrative.

---

## Next Actions

- [ ] Push to Netlify: `cd ~/Tools/Live && git add . && git commit -m "Add Multifamily Financing & Return Analysis V2" && git push`
- [ ] Test live URL: `https://tools.homewealthsolutions.com/buyer/multifamily-financing-analysis.html`
- [ ] Test share link: enter a scenario, click "Share with Client," open the link in a new tab
- [ ] Test print / PDF: open advisor workspace, click Print, verify client report renders
- [ ] Run 3–5 real investor scenarios and note any friction points
- [ ] Decide whether to retire V1 (`multi-unit-investment-calculator.html`) or keep both in hub
- [ ] If V1 is retired, update hub card to point to V2 and remove old card
