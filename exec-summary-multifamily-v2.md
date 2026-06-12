# Executive Summary — Multifamily Financing & Return Analysis V2

**Date:** 2026-06-11
**Status:** Built — pending deploy

---

## Current Objective

Replace the V1 Multi-Unit Investment Loan Comparison tool with a structured, advisor-first financing analysis tool that stays within the mortgage advisor lane and produces a client-ready deliverable.

---

## Key Decisions

- Tool answers three sequential questions: What does the property generate? → Can I qualify? → What does each structure return?
- Three focal metrics: Cap Rate (Section 1), DSCR (Section 2), Cash-on-Cash (Section 3)
- No deal scoring, no benchmark comparisons, no winner declaration
- IRR is informational — dynamic label ("IRR (X-Year Hold)"), inline disclaimer, client-provided appreciation assumption
- Rent Growth input is optional, client-provided, affects IRR only
- Client report replaces Monthly Mortgage Payment with Loan Amount; shows Annual NOI (not monthly) in Property Snapshot
- One HTML file, two views: Advisor Workspace (default) + Client-Facing Report (`?view=1` / print)

---

## Current Strategy

Advisor-first positioning: the tool computes and compares; the advisor interprets and recommends. Every design decision — section headers as questions, no verdict colors, inline disclaimers, "client-provided" labels — reinforces this boundary. The client report is a deliverable Doug hands across a desk or attaches to an email, not a calculator printout.

---

## Major Assets

| Asset | Location |
|---|---|
| V2 Tool (production HTML) | `buyer/multifamily-financing-analysis.html` |
| V2 Design Spec | `buyer/multifamily-v2-design-spec.md` |
| Hub (updated, 12 tools) | `index.html` |
| V1 (retained for now) | `buyer/multi-unit-investment-calculator.html` |

---

## Open Questions

- Retire V1 or keep both in hub?
- After live testing: any UX friction that warrants a V2.1?

---

## Next Actions

1. `cd ~/Tools/Live && git add . && git commit -m "Add Multifamily Financing & Return Analysis V2" && git push`
2. Verify live at `tools.homewealthsolutions.com/buyer/multifamily-financing-analysis.html`
3. Test share link and print/PDF in browser
4. Run 3–5 real investor scenarios; note friction
5. Decide V1 retirement

---

## Recommended Vault Locations

| Output | Vault Location |
|---|---|
| **Vault Commit** | `Projects/HomeWealth Solutions/Tools/Multifamily V2/vault-commit-multifamily-v2.md` |
| **Executive Summary** | `Projects/HomeWealth Solutions/Tools/Multifamily V2/exec-summary-multifamily-v2.md` |
| **Advisor Boundary Principle** | `Resources/Frameworks/advisor-boundary-principle.md` |
| **Client Report Design Pattern** | `Resources/SOPs/client-report-two-view-pattern.md` |
| **Design Spec** | `Projects/HomeWealth Solutions/Tools/Multifamily V2/multifamily-v2-design-spec.md` |
