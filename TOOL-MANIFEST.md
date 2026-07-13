# HWS Tools — Manifest
*Live tools deployed via GitHub → Netlify (tools.homewealthsolutions.com)*

| Tool | File | Channel | Description | Last updated |
|------|------|---------|-------------|--------------|
| Strategy Builder | `buyer/strategy-builder.html` | buyer | Mobile pre-offer scenario + advisory tool (down-payment options, buydown vs. price-cut by hold, VA/FTHB cards, CD-based closing costs, buyer-agent % toggle). Shareable links: encodes inputs in URL, recipient sees results instantly. | 2026-05-30 |
| Closing Cost | `buyer/closing-cost.html` | buyer | Buyer closing cost estimator. | — |
| Blended Rate | `buyer/blended-rate.html` | buyer | Blended-rate calculator. | — |
| Comfort Calculator | `buyer/comfort-calculator.html` | buyer | Affordability/comfort calculator. | — |
| Debt Consolidation | `buyer/debt-consolidation.html` | buyer | Debt consolidation calculator. | — |
| Tax Calc | `buyer/tax-calc.html` | buyer | Tax calculator. | — |
| Multi-Unit Investment Calculator | `buyer/multi-unit-investment-calculator.html` | buyer | Multi-unit investment property loan comparison. Fillable unit count scales rent/expenses. Compares Cash vs. 2 financing scenarios across monthly cash flow, cash-to-close, cash-on-cash return, and IRR. Rent schedule table included. | 2026-06-11 |
| Flyer Generator | `realtor/flyer-generator.html` | realtor | Agent-forward co-branded listing payment-scenario flyer. | — |
| Realtor Planning | `realtor/realtor-planning.html` | realtor | Realtor business planning calculator. | — |
| Rate Board | `internal/rate-board.html` | internal | Doug's internal rate board. | — |
| Buyer Strategy Engine | `internal/buyer-strategy/index.html` | internal | Internal LO decision tool — Conv/FHA/VA scenarios, strategy ladder, concession split, DTI/LLPA flags. Modular engine. | 2026-07-13 |
*Conventions: one version per tool, one location. Archive old versions to `~/Tools/Archive/` with a date suffix before editing. Buyer tools are shared across all channels.*

**Share Pattern (all buyer tools, added 2026-06-11):** Every buyer tool now includes `buildShareURL()`, `copyShareLink()`, and `applyParamsAndRun()`/`applyURLParams()`. Clicking "↗ Share with Client" copies a URL with all inputs encoded as query params + `&view=1`. Recipients open to pre-filled results in client view (inputs hidden, PDF save button shown).
