<!--
BUYER STRATEGY ENGINE — PHASE 3, GATE A REPORT
File: docs/BSE-Phase3-GateA-Report.md
Status: Gate A COMPLETE — stopped for Doug's review. Gate B NOT started.
Origin: Cowork session of 2026-07-28.
Companion documents: docs/BSE-Project-Status.md, docs/BSE-Phase0-1-Forensic-Audit.md,
docs/BSE-Phase2-Architecture.md
-->

# BUYER STRATEGY ENGINE — PHASE 3, GATE A
## M-1 / `applyState` Canonical Unit Restoration — Completion Report

**HomeWealth Solutions LLC** · Company NMLS #2742458 · FL OFR Mortgage Broker License #MBR8082
Prepared for: Doug Smith, President & Broker, CMA®
Date: **July 28, 2026**
Scope executed: locate controlling documentation → verify baseline → create branch → fix M-1 → test → regression check → report → **STOP**.
**Gate B was not started.** No Supabase, no persistence, no UI redesign, no FL tax integration, no Comfort Calculator change.

---

## 1. Final Phase 2 controlling document located

| Document | Location | MD5 | Provenance verified |
|---|---|---|---|
| Phase 2 architecture (controlling) | `~/Tools/Live/docs/BSE-Phase2-Architecture.md` | `dd7841f7e12f09d1a2409bb3458c5ee2` | Header: *"FINAL / CLOSED 2026-07-28. All 6 open questions dispositioned. 13 locked decisions L-1 through L-13."* Closeout section present; Phase 2 marked COMPLETE, 0 open |
| Phase 0/1 forensic audit | `~/Tools/Live/docs/BSE-Phase0-1-Forensic-Audit.md` | `f1e667c844e6a79b7de163d88c9398d7` | Header: *"FINAL. Phases 0 and 1 CLOSED 2026-07-28."* 54 findings, 0 remediated |
| Project status (read first) | `~/Tools/Live/docs/BSE-Project-Status.md` | `cddb090a55ec3cc081c4885ef132e435` | Last updated 2026-07-28; Gate A listed NOT YET IMPLEMENTED |

Only one candidate exists for each phase — no drafts, no competing versions. All three were read in full or in the sections that govern Gate A, and **none were modified**; the MD5s above are identical before and after this session.

**Locked decisions confirmed against the document, not against the brief:**

| Item | Confirmed in the Phase 2 document |
|---|---|
| Q-1 / L-7 | §2 L-7 and §22 Q-1 — qualification PITI uses Projected Reassessed (Qualifying) Tax; seller's current bill informational; stabilized/post-homestead is planning/display; `qualifying_tax_basis` retained for overrides |
| Q-2 / L-8 | §2 L-8 and §22 Q-2 — buydown ratio **0.25**, Live authoritative, Staging's 0.24 not adopted |
| Q-3 / L-9 | §2 L-9 — no edit-history/revision table |
| Q-4 / L-10 | §2 L-10 — nullable `organization_id` reserved, no team functionality built |
| Q-5 / L-11 | §2 L-11 — Comfort Calculator retirement gated on regression pass **and** real buyer-call validation |
| Q-6 / L-12 | §2 L-12 — full responsive editing on phone; phone is not review-only |
| L-13 / M-1 | §2 L-13, §16 and §21 — canonical values are the `(value, unit)` pair; toggles are presentation state; M-1 must be resolved before any persistence |
| Tax fields | §16.2 — `tax_rate_pct` / `tax_annual_amount` / `tax_input_unit` retained as three fields; **not consolidated** |

**Risk-numbering note honoured:** the audit's portability note maps Phase 1 finding **C-4(a)** (`setUnit` destructive write-back, lines 2807–2827) → Phase 2 risk **M-1**. Phase 2/3 numbering governs. The Phase 1 body's own "M-1" (two definitions of "has a price") is a different item, mapped to Phase 2 **M-5**, and was **not** touched.

---

## 2. Branch

`phase3/gate-a-m1-canonical-units` — created from `main`, HEAD confirmed on the branch before any tracked source was edited (`.git/HEAD` → `ref: refs/heads/phase3/gate-a-m1-canonical-units`).

## 3. Starting commit

`540ccbe` — *"Live comma formatting on input with cursor-position restore"*, branch `main`.

## 4. Baseline verification

Verified independently before any edit, and again after:

| Check | Expected | Found | Result |
|---|---|---|---|
| Production BSE MD5 | `8395ad3441b500f559d5c615ac7f5efa` | identical | PASS |
| Property Tax MD5 | `1cd00523ad5845942ec6e812538b6312` | identical | PASS |
| Comfort Calculator MD5 | `772de6d1e3d6b3182049af6a7bcebedd` | identical | PASS |
| Staging (suspect) MD5 | `01830ac60b3ec9c1db4a73ce76201f2f` | identical | PASS |
| `git status --porcelain` | empty | empty (only the expected untracked `docs/`) | PASS |
| `git rev-parse --short HEAD` | `540ccbe` | `540ccbe` | PASS |
| Branch | `main` | `main` | PASS |
| Stale git locks | none | none at start | PASS |
| Orphaned `phase3` branch | deleted | absent — only `main` + `origin/main` | PASS |

Your Terminal cleanup was confirmed independently, not taken on trust. No lock was deleted while in use: the only locks encountered were created by this session's own read-only `git status` calls, whose processes had already exited, and they were moved aside (not deleted — see §26).

## 5. Files changed

| File | Change |
|---|---|
| `internal/buyer-strategy/index.html` | **Modified.** +162 / −23 lines. MD5 `8395ad3441b500f559d5c615ac7f5efa` → `d5c16fde3b9c57a14f26ab9bae1b38ec` |
| `internal/buyer-strategy/tests/m1-canonical-units.test.js` | **Added.** Test harness (first automated test asset in the repository) |
| `internal/buyer-strategy/tests/README.md` | **Added.** How to run it; explicit statement of what it does not cover |
| `docs/BSE-Phase0-1-Forensic-Audit.md`, `docs/BSE-Phase2-Architecture.md`, `docs/BSE-Project-Status.md` | **Added to git tracking, contents unmodified** (MD5s in §1 unchanged). Flagged for your decision — see §26 |

No other file in the repository was touched.

## 6. Exact production functions changed

Three functions modified, all in the UI layer, none of them calculation functions:

| Function | Baseline lines | Change |
|---|---|---|
| `setUnit(which, unit)` | 2807–2827 | Converts from the canonical `(value, unit)` pair instead of from the digits currently displayed |
| `setOfferConcUnit(unit)` | 2612–2624 | Same |
| `setCounterUnit(unit)` | 2586–2594 | Same |

New code added (nothing pre-existing was rewritten to accommodate it):

`canonUnit` store · `CANON_KEYS` · `canonUnitNow()` · `canonSync()` · `canonWrite()` · `canonConvert()` · `canonSet()` · `BSE_STATE_VERSION` · `captureState()` · `applyState(state, opts)` · `window.BSEState` (test surface only — no storage, no network, no autosave).

## 7. M-1 failure path before the fix

The BSE had **no** state capture or restore at all (Phase 1 §5.1: zero on every persistence mechanism; §16.7 lists `applyState` as *new*). M-1 was therefore a latent defect that would materialise the moment restore code was written — which is exactly why L-13 sequences it ahead of persistence.

The failure path, precisely:

1. A restore writes a stored canonical value into the DOM — say `dpTarget = "87,400"` with `dp_target_unit = dollar`.
2. To position the toggle, it calls `setUnit('dp','dollar')` — the only API the baseline exposes.
3. `unitState.dp` is still its default `'pct'`, so the equality guard at line 2808 does **not** short-circuit.
4. Line 2817 reads the already-correct restored value as though it were a percentage and writes back `Math.round(raw/100*price)`.
5. The unit is then set. No error, no exception, no visible warning.

**Reproduced on the baseline file in Part C of the harness, at a $437,000 price:**

| Restored canonical value | Value after the restore | |
|---|---|---|
| `dpTarget` `87,400` (dollar) | **`381,938,000`** | corrupted |
| `taxRate` `6,347` (dollar) | **`27,736,390`** | corrupted |

Secondary defect in the same family — cumulative rounding on repeated user toggling (`Math.round` on the `%`→`$` leg, `.toFixed(2)`/`.toFixed(3)` on the `$`→`%` leg). Baseline behaviour, captured:

```
dp  3.375%  ->$ ->% ->$ ->%    trail 14,749 / 3.38 / 14,771 / 3.38    final 3.38   (drifted)
tax 1.205%  ->$ ->% ->$ ->%    trail  5,266 / 1.205 / 5,266 / 1.205   final 1.205  (stable at this value)
conc 2.75%  ->$ ->% ->$ ->%    trail 11,798 / 2.75 / 11,798 / 2.75    final 2.75   (stable at this value)
```

The down-payment target drifts on both legs — the percentage degrades `3.375 → 3.38` and the dollar figure moves `14,749 → 14,771` on the second pass. Tax and concession happened to round-trip cleanly at these particular values; the structural exposure is identical.

## 8. Exact implementation

**Principle implemented, per §16.1:** the canonical value is the `(value, unit)` pair. The unit a value was *entered* in is part of the canonical value. The unit currently *displayed* is presentation state.

A module-level store holds the canonical pair for the four dual-unit fields (`dpTarget`, `taxRate`, `offerConc`, `counterConc`), plus `shown` — the exact string this module last wrote to that input.

- `canonSync(key)` — if the input's value differs from `shown`, the user has typed since the last programmatic write, so that typing becomes the new canonical pair in the unit currently on screen (§16.3: deliberate re-entry, not a silent conversion).
- `canonConvert(key, target, basis)` — a **pure** function. Converts *from* the canonical pair, never from the display. If `target` equals the canonical unit it returns the canonical value verbatim. Rounding is byte-for-byte the previous rule (`Math.round` for `%`→`$`; `toFixed(3)` for tax and `toFixed(2)` for the other three on `$`→`%`). Returns `null` when there is no positive value or no positive basis, in which case the digits on screen are left exactly as the baseline left them.
- `canonWrite(key, text)` — writes the display string and re-anchors `shown`. The canonical pair is untouched.
- `captureState()` — syncs all four canonical pairs, then records every `input`/`select` by id (checkboxes by `checked`, the `negMode` radio group by name), the four display units, and the four canonical pairs. Values are captured as the exact strings on screen, so a restore is byte-identical.
- `applyState(state, opts)` — restores in three ordered steps: (1) units by **direct assignment**, (2) field values written verbatim, (3) canonical pairs restored verbatim and re-anchored. Then `renderUnitToggles()` and, unless `{silent:true}`, `recalc()`.

## 9. `applyState` — before vs after

| | Before | After |
|---|---|---|
| Existence | Did not exist | `applyState(state, opts)` |
| Unit restoration | n/a — the only available route was `setUnit`, which converts | `unitState.dp` / `unitState.tax` / `offerConcUnit.v` / `counterUnit.v` assigned directly. **`setUnit`, `setOfferConcUnit` and `setCounterUnit` are never invoked on the restore leg** |
| Value restoration | n/a | Written verbatim to the DOM. No conversion, no re-formatting, no rounding |
| Canonical pair | n/a | Restored verbatim, so a later toggle converts from the stored intent, not from what happens to be on screen |
| Robustness | n/a | Accepts the captured `{value}`/`{checked}` record or a bare value, and never writes `undefined`/`null` into an input (this guard was added because the harness caught the failure mode) |

## 10. `setUnit` — before vs after

| | Before (2807–2827) | After |
|---|---|---|
| Conversion source | The digits currently in the input — which after one toggle are an already-converted, already-rounded number | The canonical `(value, unit)` pair |
| Return to the original unit | Re-converts and re-rounds → cumulative drift | Writes the canonical value verbatim → exact |
| Write-back to the DOM | Yes | Yes (display only). The canonical pair is never overwritten by a toggle |
| Guard when no price / no value | Leaves digits, flips unit | **Unchanged** — identical behaviour, including the Shopping-Mode reinterpretation, which is deliberately out of Gate A scope |
| Rounding rules | `Math.round`, `toFixed(2)` (dp), `toFixed(3)` (tax) | Identical |
| Trailing calls | `renderUnitToggles(); recalc();` | Identical |

`setOfferConcUnit` and `setCounterUnit` changed in exactly the same shape, against the offer-price/list-price base and the counter price respectively.

## 11. Canonical restore flow after the fix

```
stored state
  ├─ units      { dp, tax, offerConc, counterConc }   ──► assigned directly
  ├─ fields     { id: value|checked, ... }            ──► written verbatim to the DOM
  └─ canonical  { key: {value, unit}, ... }           ──► restored verbatim, then anchored
                                                           to what is on screen
                              │
                              ▼
                    renderUnitToggles()      (chrome only — positions the toggle
                              │               from the restored unit)
                              ▼
                          recalc()           (unchanged; gatherInputs still reads
                                              the DOM + unit state exactly as before)
```

Worked example, verified in the harness: stored `dp_target_value = 20`, `dp_target_unit = percent` restores as value `20`, unit `percent`, display `20%`. No toggle fires, no conversion runs, no rounded value is written back.

## 12. Test harness added

| File | Purpose |
|---|---|
| `internal/buyer-strategy/tests/m1-canonical-units.test.js` | Drives the real application in headless Chromium via Playwright. No calculation is stubbed, mocked, or re-implemented |
| `internal/buyer-strategy/tests/README.md` | How to run it, and an explicit list of what it does **not** cover |

Run with:

```
git show 540ccbe:internal/buyer-strategy/index.html > /tmp/bse-baseline.html
node tests/m1-canonical-units.test.js /tmp/bse-baseline.html internal/buyer-strategy/index.html
```

Production code was **not** restructured to make it testable — the harness attaches to the file as it ships.

## 13. Automated tests performed and results

**80 assertions, 80 pass, 0 fail.** Executed against the exact file now on disk (harness input MD5 `d5c16fde3b9c57a14f26ab9bae1b38ec`, matching the committed file).

**Part B — M-1 behaviour (patched file).** For each of the eight canonical cases — down payment in `%`, down payment in `$`, tax in `%`, tax in annual `$`, seller concession in `%`, seller concession in `$`, counter concession in `%`, counter concession in `$` — three assertions:

1. capture → restore returns the identical DOM value **and** unit;
2. capture → restore → **recalculate** returns identical rendered output across every output region;
3. the canonical pair survives the round trip.

The restore in every case is performed **into a deliberately contaminated session**: all four units flipped to the opposite value and all four fields blanked first, so a restore that silently relied on the pre-existing unit state would fail.

Also asserted:

- **Ten consecutive restore cycles** from one captured state — DOM, units and rendered output identical on every cycle.
- **Repeated unit switching, 4 toggles deep**, on all eight cases (`% → $ → % → $ → %` and `$ → % → $ → % → $`), using drift-exposing values `3.375`, `87,400`, `1.205`, `6,347`, `2.75`, `11,798`, `1.375`, `5,954` at a $437,000 price. Every field returns to its exact starting value.
- No JavaScript errors on any page load or interaction.

**Part C — the defect.** The M-1 failure path reproduced on the baseline file (figures in §7) and demonstrated absent on the patched file, including that the engine then reads the restored values correctly (`dpTarget.isPct === false`, `dollar === 87400`; `taxFixed === true`, `taxMonthly === 6347/12`).

## 14. Manual verification performed and results

| Check | Method | Result |
|---|---|---|
| Engine IIFE (lines 526–1060) unchanged | MD5 of the extracted line range, baseline vs shipped | Byte-identical (`2cb59452906359bf8d7acd897185c454`) |
| 45 named functions unchanged | Balanced-brace extraction of each function body, baseline vs shipped, byte comparison | 45 / 45 identical; only `setUnit`, `setOfferConcUnit`, `setCounterUnit` differ |
| Program constants unchanged | Occurrence count of `ufmip:1.75`, `fhaMipHigh:0.55`, `fhaMipLow:0.50`, `vaFirst:2.15`, `vaSub:3.30`, `fhaLimit:498257`, `confLimit:766550`, and the buydown ratio `0.25` (6 sites) | Identical in both files |
| JavaScript validity | `node --check` on the extracted script block | Clean |
| Shipped file is the tested file | MD5 of the file on your disk vs the harness input | Identical |
| Protected files | MD5 after all work | All three unchanged |

**Not manually exercised in a browser by a human.** No click-through session, no iPad or phone check, no real buyer-call validation.

## 15. Regression results

37 scenarios run against the pre-change baseline **and** the patched file with identical economic inputs. For each: `gatherInputs()` output plus the rendered text of `modeBadge`, `snapBody`, `cardsBody`, `gsPanel`, `negMount`, `propFull`, `coPanels`, `coNetVal`, `counterBody`, `stPay`, `stCash`, `stDti`. **All 37 identical. Zero differences.**

| Area | Classification | Scenarios |
|---|---|---|
| Shopping Range | **AUTOMATED TESTED** (differential) | A-01, A-08…A-11, A-18, A-29…A-33 |
| Conventional | **AUTOMATED TESTED** (differential) | A-02, A-12…A-15 |
| FHA | **AUTOMATED TESTED** (differential) | A-03, A-04 |
| VA | **AUTOMATED TESTED** (differential) | A-05…A-07 |
| Maximum Buying Power | **AUTOMATED TESTED** (differential) | A-08 |
| Comfort Buying Power | **AUTOMATED TESTED** (differential) | A-09 |
| Cash-Limited Buying Power | **AUTOMATED TESTED** (differential) | A-10 |
| PMI | **AUTOMATED TESTED** (differential) | A-12, A-13, A-14 |
| FHA MIP | **AUTOMATED TESTED** (differential) | A-03, A-04 |
| VA funding fee | **AUTOMATED TESTED** (differential) | A-05, A-06, A-07 |
| DTI | **AUTOMATED TESTED** (differential) | A-11 |
| Cash-to-close | **AUTOMATED TESTED** (differential) | every priced scenario |
| Closing costs | **AUTOMATED TESTED** (differential) | A-19 |
| Seller concessions | **AUTOMATED TESTED** (differential) | A-21…A-25, A-37 |
| Gap Solver | **AUTOMATED TESTED** (differential) | A-26, A-27, A-28 |
| Recommendation Engine | **AUTOMATED TESTED** (differential) | A-29…A-33 |
| Offer Strategy | **AUTOMATED TESTED** (differential) | A-21…A-24 |
| Counter Offer Analyzer | **AUTOMATED TESTED** (differential) | A-34, A-35, A-36 |
| Existing flat-rate property-tax behaviour | **AUTOMATED TESTED** (differential) | A-16, A-17, A-18 |
| Buydown ratio 0.25 | **AUTOMATED TESTED** (differential) + constant count verified | A-37 |

**Read "differential" strictly.** These prove *the change altered nothing*. They do **not** prove any number is correct, because no expected value captured from the running production application exists to compare against. Phase 1 §11.1 recorded that no regression baseline exists, and Phase 2 §23 item 1 makes capturing it (47 BSE + 11 FL scenarios) a blocking prerequisite. **That capture is still outstanding** — Gate A did not perform it and was not authorised to.

## 16. Not tested, and why

| Item | Status | Why |
|---|---|---|
| Phase 1 §11.3 expected-value baseline (47 scenarios) | **NOT TESTED** | Requires capturing values from the running production app and committing them as JSON. Blocking prerequisite for Phase 3 proper; out of Gate A's authorisation |
| FL property-tax scenarios T-1…T-11 | **NOT TESTED** | `property-tax.html` untouched; FL integration not authorised |
| Comfort Calculator | **NOT TESTED** | Untouched; retirement gated by L-11 |
| `monthToBalance` PMI cancellation months, both bisection solvers, near-tie ordering | **NOT TESTED** individually | Phase 1 §11.5: not derivable statically. Covered only in the sense that baseline and patched agree |
| Real browser click-through / buyer-call validation | **NOT TESTED** | Headless only. L-11's live-use gate is unaffected |
| iPad and phone responsive behaviour (M-16 / L-12) | **NOT TESTED** | Explicitly a Phase 3 scoping item, not Gate A |
| Change log, `concSplit` manual allocation, `gapSel`, `appliedConcTotal` | **NOT TESTED / not captured** | Phase 1 §5.5 lists 11 pieces of hidden state; Gate A's canonical model covers the four unit-bearing ones only. See §26 |
| Shopping-Mode unit reinterpretation (C-4a, third paragraph) | **NOT CHANGED, NOT TESTED as corrected** | Preserved byte-for-byte. Correcting it changes user-facing behaviour and is not M-1 |

## 17. Unexpected output differences

**None.** All 37 regression scenarios matched exactly.

Two **intended** behavioural differences, both inside the authorised M-1 correction:

1. **Restore no longer converts.** Previously there was no restore path; the only way to position a toggle converted the value. Now `applyState` restores canonical values directly.
2. **Repeated toggling no longer drifts.** Toggling away from and back to the unit a value was entered in now returns that exact value. Observed effect on the baseline was `dp 3.375% → 3.38%` and `$14,749 → $14,771`; that no longer happens. A single conversion produces the identical string it produced before.

## 18. Confirmation — calculation functions not changed

Confirmed. The `Engine` IIFE covering lines 526–1060 is byte-identical between `540ccbe` and the current file (MD5 `2cb59452906359bf8d7acd897185c454` on both). `computeScenario`, `monthToBalance`, `pickBestOverall`, `priorityPick`, `applyConcession`, `round125`, `gatherInputs`, `recalc`, `recalcCounter`, `analyzeNegotiation`, `optimalRestructure`, `concessionToCloseGap`, `additionalForPayment`, `pathOutcome`, `pickPathWinner` and 30 further functions were extracted and compared byte-for-byte: all identical. No formula, no program constant, no recommendation logic changed.

## 19. Confirmation — `maxPriceForScenario` not changed

Confirmed. Byte-identical. Its mirrored PITI assembly against `computeScenario` (Phase 1 §11.2) is intact.

## 20. Confirmation — FL Property Tax tool untouched

Confirmed. `~/Tools/Live/property-tax.html` MD5 `1cd00523ad5845942ec6e812538b6312` — unchanged. No FL tax logic was ported, referenced, or integrated.

## 21. Confirmation — Comfort Calculator untouched

Confirmed. `~/Tools/Live/buyer/comfort-calculator.html` MD5 `772de6d1e3d6b3182049af6a7bcebedd` — unchanged. No retirement step taken.

## 22. Confirmation — Staging untouched and not treated as authoritative

Confirmed. `~/Tools/Staging/buyer-strategy-v2/index.html` MD5 `01830ac60b3ec9c1db4a73ce76201f2f` — unchanged. It was never opened as a calculation reference and nothing was copied from it. The buydown ratio remains **0.25** at all six occurrences in Live, per L-8.

## 23. Current git status

Clean — no modified, staged, or untracked files in `~/Tools/Live`.

## 24. Current branch

`phase3/gate-a-m1-canonical-units`

## 25. Current commit / working-tree state

`309bdb4` — *"Phase 3 Gate A — M-1: canonical (value, unit) restoration"*, parent `540ccbe`. 6 files changed, +4,135 / −23 (the bulk being the three controlling documents). Working tree clean. `main` still points at `540ccbe` and was not modified. Nothing was pushed.

## 26. Findings that should affect Gate B

1. **The device-bridge git limitation is real and recurring.** The mount permits file creation but refuses `unlink`, so every git command that takes a lock leaves an orphan `.lock`, and `git add`/`commit` also leaves `tmp_obj_*` files in `.git/objects`. Gate A worked around it by moving each stale lock into `Tools/_to_delete/stale-git-locks/` immediately before each git call, having confirmed no git process was live. It worked, but it is fragile and it will scale badly across Gate B's many commits. **Recommendation: run Gate B on the computer** rather than in a cloud session — in the desktop app, the "Run this task" picker at the top right when starting a task. `Tools/_to_delete/` now holds the swept locks and temp objects and is safe to delete.

2. **`applyState` is the inverse of the DOM, not of `gatherInputs`. M-2 is still open.** `gatherInputs` still reads 32 DOM elements and derives inline. Gate A made restore safe; it did not make `gatherInputs` round-trippable. Phase 2 §23 items 4, 6 and 7 remain.

3. **Only four of the eleven hidden-state items are captured.** `unitState.dp`, `unitState.tax`, `offerConcUnit.v`, `counterUnit.v` are covered. `concSplit`, `appliedConcTotal`, `gapSel`, `prevSnapshot`, `changeLog`, `firstCalcDone` and `seq` are not. Before persistence, Gate B must decide which of those belong in a saved scenario — in particular `concSplit`, which is a manual allocation the advisor chose (M-12 says reserve the columns and do not surface the control until C-9 is fixed).

4. **The floating `%` concession base (M-13) is untouched and now more visible.** A concession captured as `2.75%` before an offer price exists will still re-base the moment an offer price is typed. The canonical pair is preserved faithfully; the *resolved dollar amount* still depends on when the basis appeared. Phase 2's fix — storing `price` on the `negotiation_round` alongside the concession — remains required.

5. **Shopping-Mode unit reinterpretation is preserved deliberately.** With the price blank, toggling still flips the unit without converting, so `1.2` meaning 1.2% silently becomes "$1.20/yr". That is the other half of C-4a. Correcting it changes existing user-facing behaviour and needs its own approval; it should be scoped explicitly in Gate B alongside the three-state work.

6. **`num()` (M-4) and `updateInlineHints` (M-6 / C-4b) are unchanged.** Capturing HOA/CDD/flood today captures whatever `updateInlineHints` already overwrote with `'0'`, and a blank credit score still coerces to 300. Persisting state on top of either would save a corrupted value. Both are Phase 3 items 8 and 9 in Phase 2 §23 and should land before Gate C.

7. **`window.BSEState` is a test surface only.** No storage, no network, no autosave. Gate B should keep two contracts when it replaces it: `applyState` must never invoke a unit handler, and autosave must stay off the `recalc` path (M-8).

8. **The expected-value regression baseline is still not captured.** Phase 2 §23 makes it item 1 and blocking. Gate A's harness is differential only. Recommend capturing the 47 BSE scenarios as committed JSON as the first action of Gate B, before any further refactor — otherwise every later gate inherits the same "we only know it didn't change" limitation.

9. **One decision taken that you did not explicitly authorise:** the three controlling documents in `docs/` were committed to the branch. Their contents are unmodified (MD5s in §1 are identical before and after). This was done so the branch carries its own governing documentation and the working tree is clean. If you would rather they stay untracked, `git rm --cached docs/*.md` reverses it without touching the files.

---

## GATE A COMPLIANCE STATEMENT

- The controlling Phase 2 architecture was located, read, and verified against its own provenance header and closeout section — not against the session brief.
- All four authoritative MD5s and the git baseline were verified independently before any edit.
- The only behavioural correction implemented is M-1.
- No calculation function, program constant, recommendation logic, or `maxPriceForScenario` was modified.
- `property-tax.html`, `buyer/comfort-calculator.html`, and the Staging BSE were not modified and were not used as references.
- No Supabase, persistence, authentication, UI redesign, FL tax integration, or Comfort Calculator retirement work was performed or started.
- **Gate B has not begun.**

---

*Prepared for Doug Smith, President & Broker, CMA® · HomeWealth Solutions LLC · NMLS #2742458 · FL OFR Mortgage Broker License #MBR8082 · doug@homewealthsolutions.com · 813-733-7371*
