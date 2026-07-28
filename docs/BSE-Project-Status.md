# BUYER STRATEGY ENGINE — PROJECT STATUS
## Controlling Status Document

**HomeWealth Solutions LLC** · Company NMLS #2742458 · FL OFR Mortgage Broker License #MBR8082
Owner: Doug Smith, President & Broker, CMA®
Last updated: **2026-07-28** (Gate B)

> **This is the controlling status document for the Buyer Strategy Engine redesign.**
> Any new Cowork session working on the BSE should read this file first, then the two documents referenced below. Do not reconstruct prior phases from memory or summary — the full detail is on disk.

---

## 1. PHASE STATUS

| Phase | Scope | Status |
|---|---|---|
| **Phase 0** | Data governance, prohibited-data list, approved-field discovery | **COMPLETE** |
| **Phase 1** | Forensic audit of the production BSE, FL property-tax tool, and Comfort Calculator | **COMPLETE** — 54 findings documented, 0 remediated |
| **Phase 2** | Architecture decision lock and data model design | **COMPLETE / CLOSED** — 13 locked decisions (L-1…L-13), 6 questions resolved (Q-1…Q-6), 0 open |
| **Phase 3 — Gate A** | M-1 / `applyState` canonical unit handling | **COMPLETE / APPROVED** — see `BSE-Phase3-GateA-Report.md` |
| **Phase 3 — Gate B** | Numerical baseline + canonical application-state architecture | **COMPLETE** — see `BSE-Phase3-GateB-Report.md` |
| **Phase 3 — Gate C** | Supabase schema, auth, RLS, persistence | **NOT AUTHORIZED** |

Phases 0, 1, and 2 were audit and design only — no source was modified in any of them. Application source was first modified in **Gate A** (three unit-toggle functions plus an additive canonical-unit layer) and extended in **Gate B** (a purely additive canonical application-state layer). The calculation engine, lines 526–1060, is byte-identical to `540ccbe` throughout.

---

## 2. BASELINE INTEGRITY — VERIFY BEFORE ANY WORK

Any session beginning implementation work must verify these before touching anything. A mismatch on the production BSE is a **STOP** condition — report it, do not overwrite, do not auto-revert.

| File | Baseline MD5 |
|---|---|
| `Tools/Live/internal/buyer-strategy/index.html` *(production BSE)* | `8395ad3441b500f559d5c615ac7f5efa` |
| `Tools/Live/property-tax.html` *(FL property tax)* | `1cd00523ad5845942ec6e812538b6312` |
| `Tools/Live/buyer/comfort-calculator.html` *(Comfort Calculator)* | `772de6d1e3d6b3182049af6a7bcebedd` |
| `Tools/Staging/buyer-strategy-v2/index.html` *(suspect copy)* | `01830ac60b3ec9c1db4a73ce76201f2f` |

**Pre-Phase-3 git baseline: `540ccbe`** — "Live comma formatting on input with cursor-position restore", 2026-07-27, branch `main`. `main` still points here.

**Current work: branch `phase3/gate-b-canonical-state`.** The production BSE MD5 on that branch is `f8b2b9b51c06b021b4b1d3242b482979` (Gate A produced `d5c16fde3b9c57a14f26ab9bae1b38ec`); the table above remains the correct baseline for `main` and for the three untouched files.

Verification command:

```
cd ~/Tools/Live
git status --porcelain          # expect empty
git rev-parse --short HEAD      # expect 540ccbe
md5sum internal/buyer-strategy/index.html property-tax.html \
       buyer/comfort-calculator.html ../Staging/buyer-strategy-v2/index.html
```

---

## 3. AUTHORITATIVE SOURCES

| Role | Path | Status |
|---|---|---|
| **Production BSE — AUTHORITATIVE** | `Tools/Live/internal/buyer-strategy/index.html` | 2,886 lines. Git-tracked, deployed. The only calculation reference |
| **FL property tax — AUTHORITATIVE** | `Tools/Live/property-tax.html` | 821 lines. Standalone tool. Authoritative source for the corrected Florida methodology |
| **Comfort Calculator** | `Tools/Live/buyer/comfort-calculator.html` | Live. Production copy per `TOOL-MANIFEST.md` |
| **SUSPECT / NON-AUTHORITATIVE** | `Tools/Staging/buyer-strategy-v2/index.html` | **Never use as a calculation reference. Do not modify.** Outside git. Changes the buydown ratio to 0.24 and removes the elimination-reason list |

**Live is authoritative. Staging is suspect and non-authoritative.** This is not a preference — Staging silently changes a pricing constant at five sites and strips advisory output. Its disposition remains an open business decision for Doug.

---

## 4. NON-NEGOTIABLE SEQUENCING CONSTRAINTS

These are locked and carry forward into every future session.

1. **M-1 comes first.** `applyState` / canonical unit handling must be fixed and independently verified **before any persistence code is written**. A saved buyer profile restored through a display-unit conversion path can produce a valid-looking but wrong assumption, and the engine will then calculate correctly from the wrong input — silently. *(Locked as Decision L-13.)*

2. **FL tax integration is LAST** among approved calculation changes. Do not pull it forward. Shopping Range Mode continues to use flat-rate tax assumptions — this is mathematically required, not a convenience, because `maxPriceForScenario` solves closed-form and a millage-derived figure has no price to compute against in Shopping Mode.

3. **Comfort Calculator retirement is gated** on BOTH: (a) the redesigned BSE Shopping Range passing regression testing, AND (b) successful validation in an actual buyer-call workflow. Phase completion alone does not authorize retirement. *(Locked as Decision L-11.)*

4. **The calculation engine is protected.** Lines 526–1060 of the BSE are read-only. Same inputs → same calculations → same outputs. If any requirement appears to need a mathematical change, STOP and get separate approval.

5. **`maxPriceForScenario` must not be modified.** It mirrors `computeScenario`'s PITI assembly exactly; breaking that mirror makes every number in the tool internally inconsistent.

6. ~~**No regression baseline exists yet.**~~ **Discharged in Gate B, Stage 1.** The permanent 47-scenario numerical baseline lives at `internal/buyer-strategy/tests/baseline/bse-expected-baseline.json`, with expected values established by an independent implementation of the documented formulas (`tests/oracle/reference_model.py`), not by the engine. 3,625 fields are `EXPECTED VALUE VERIFIED`; 1,532 are `EXPECTED VALUE REQUIRES REVIEW` per audit §11.5. Run it before and after any code change.

---

## 5. CONTROLLING DOCUMENTATION

| Document | Contents |
|---|---|
| `docs/BSE-Phase0-1-Forensic-Audit.md` | Complete Phase 0/1 forensic audit: function inventory, all 54 findings with risk classifications, regression baseline scenarios, protected functions, Live vs Staging divergence, FL property-tax findings, persistence audit, field classifications |
| `docs/BSE-Phase2-Architecture.md` | Complete Phase 2 architecture: 7-table model, all schemas and field definitions, DDL, assumption-set and reproducibility design, tax method architecture, `qualifying_tax_basis`, closing/occupancy dates, DTI override, `organization_id`, canonical-value design, all 13 locked decisions, all 6 resolved questions, migration risks, phase sequencing |
| `docs/BSE-Phase3-GateA-Report.md` | Gate A completion report — M-1 failure path, the fix, tests, regression results, Gate B findings |
| `docs/BSE-Phase3-GateB-Report.md` | Gate B completion report — Checkpoint B1, the permanent baseline and how its expected values were established, the canonical state layer, limitations, Gate C findings |
| `docs/BSE-Project-Status.md` | This file |

---

## 6. KNOWN ENVIRONMENT ISSUE — BLOCKS PHASE 3 IN CLOUD SESSIONS

**Git write operations fail in `Tools/Live` when the folder is reached through the Cowork device bridge.** The mount permits file creation but refuses `unlink`, so git can create a `.lock` file and never remove it. Every operation requiring a lock lifecycle fails.

Observed 2026-07-28 while attempting to create the Phase 3 branch:

```
git checkout -b phase3/gate-a-m1-canonical-units
→ error: Unable to create '.git/HEAD.lock': File exists.
  fatal: unable to update HEAD
```

Stale locks present at that time — note two **predate** the session:

| Lock | mtime |
|---|---|
| `.git/HEAD.lock` | 2026-07-28 00:55 *(pre-existing, from Doug's own earlier git activity)* |
| `.git/objects/maintenance.lock` | 2026-06-05 18:48 *(long stale)* |
| `.git/index.lock` | 2026-07-28 13:10 *(created by read-only `git status` calls)* |

**Side effect to clean up:** an orphaned branch ref `refs/heads/phase3/gate-a-m1-canonical-units` was created pointing at `540ccbe`, but HEAD was never switched. The working tree remained on `main` and no tracked file was touched.

**Remediation (run locally in Terminal, after confirming no git process is actually running):**

```
cd ~/Tools/Live
rm -f .git/HEAD.lock .git/index.lock .git/objects/maintenance.lock
git branch -D phase3/gate-a-m1-canonical-units
git status && git rev-parse --short HEAD    # expect clean, 540ccbe
```

**Status 2026-07-28:** still true, and worked around in Gates A and B by moving each stale lock and `tmp_obj_*` file into `Tools/_to_delete/stale-git-locks/` immediately before every git call, after confirming no git process was live. It held for four commits but it is fragile.

**Recommendation for Gate C:** run the task **on the computer** rather than in the cloud. In the Claude desktop app, the "Run this task" picker at the top right when starting a new Cowork task selects where it runs. Gates A, B, and C all require repeated commits, and this restriction will block every one of them from a cloud session.

Also note: `Tools/_to_delete/phase3-cleanup-20260728/` contains a zero-byte probe artifact that could not be deleted through the bridge. Safe to delete that folder.

---

## 7. IMMEDIATE NEXT ACTION

**Gate B is complete and stopped for review.** Nothing further is authorized without Doug's written approval.

Before any Gate C work is authorized, the Gate B report's §35 items should be settled — in particular:

1. Fix `updateInlineHints` (C-4b / M-6) **before** persistence. The canonical model cannot be corrupted; the DOM still can, and persistence saves what the DOM holds.
2. Decide the 1,532 `EXPECTED VALUE REQUIRES REVIEW` fields — specify them or sign off on the recorded values before they become historical records.
3. Do the `gatherInputs()` cutover to the canonical model **before** Supabase, not after. The equivalence test makes it safe now.
4. Run Gate C on the computer, not in a cloud session (Section 6).

To run the suites, see `internal/buyer-strategy/tests/README.md`.

---

*HomeWealth Solutions LLC · doug@homewealthsolutions.com · 813-733-7371 · homewealthsolutions.com*
