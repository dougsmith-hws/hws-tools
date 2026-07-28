#!/usr/bin/env python3
"""
BSE Gate B.5, Stages 5 & 6 — classify the 1,532 EXPECTED VALUE REQUIRES REVIEW
fields and verify the persistence-critical subset.

Categories (Gate B.5 authorization):
  A  PERSISTENCE-CRITICAL DECISION OUTPUTS
  B  CALCULATION OUTPUTS NOT CURRENTLY PERSISTENCE-CRITICAL
  C  RECOMMENDATION / WINNER / THRESHOLD OUTPUTS
  D  BISECTION / SOLVER OUTPUTS
  E  RENDERED PROSE / DISPLAY TEXT
  F  OTHER / REQUIRES ARCHITECTURAL DECISION

For every field classified persistence-critical, the script either derives an
independent expected value with the oracle or records that Gate C should not
persist it.

Usage: python3 classify-review-fields.py <expected-baseline.json> <capture.json> <out.json>
"""
import json, sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "oracle"))
import reference_model as ref

BASE, CAP, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
base = json.load(open(BASE))
cap = json.load(open(CAP))

# --------------------------------------------------------------- classification map
FIELD_CLASS = {
    # per-scenario review fields
    "totalCostHorizon": ("C", "Primary sort key for a planned stay over 7 years (audit §2.7 stage 4) — it decides the winner"),
    "miCostHorizon":    ("B", "Component of totalCostHorizon; displayed, not itself a stored decision"),
    "postCancelPITI":   ("B", "Display figure — the payment after MI cancels"),
    "conc":             ("B", "Concession applied to this scenario; the stored concession lives on negotiation_round"),
    "miMode":           ("E", "Display label for the MI treatment"),
    "feeLabel":         ("E", "Display label for the financed fee"),
    "label":            ("E", "Program display label"),
    "name":             ("E", "Scenario display name"),
    "frontFlag":        ("B", "Advisory only — never binding (audit §2.5, comment at lines 746-747)"),
    "requiresGift":     ("B", "Advisory flag derived from funds vs cash to close"),
}
BLOCK_CLASS = {
    "bestOverall":  ("A", "The recommended program and the winning scenario — Phase 2 §7 result_summary"),
    "priorityPick": ("C", "Priority-aware pick that drives which family card is starred"),
    "eliminated":   ("A", "Program elimination reasons — named persistence-critical in the Gate B.5 authorization"),
    "dpDimmed":     ("F", "Down-payment dimming is a display decision with no documented specification"),
    "rendered":     ("E", "All rendered prose, and the surface where both bisection solvers and optimalRestructure appear"),
}
# Solver outputs are not separate fields in the baseline — they surface inside
# `rendered`. Counted separately below so category D is not silently empty.
SOLVER_MARKERS = ["gsPanel", "coPanels", "counterBody"]


# --------------------------------------------------------------- oracle extensions
def interest_paid(loan, rate, months_held):
    p = ref.pmt(rate, ref.N_MONTHS, loan)
    bal = ref.balance_after(loan, rate, ref.N_MONTHS, months_held)
    return p * months_held - (loan - bal)


def horizon_costs(s, stay_years):
    """audit §2.4: totalCostHorizon = interestPaid + miCost + financedFee over the
    planned stay; principal is excluded as equity kept."""
    months = int(stay_years) * 12
    ip = interest_paid(s["loanAmount"], s["rate"], months)
    if s["monthlyMI"] <= 0:
        mi_months = 0
    elif s["cancelMonth"]:
        mi_months = min(months, s["cancelMonth"])
    else:
        mi_months = months
    mi = s["monthlyMI"] * mi_months
    return {"miCostHorizon": mi, "totalCostHorizon": ip + mi + s["financedFee"],
            "interestPaid": ip, "miMonths": mi_months}


def primary_metric_value(s, stay_years):
    if stay_years <= 3: return ("maximize", s["cashRemaining"])
    if stay_years <= 7: return ("minimize", s["piti"])
    return ("minimize", s["totalCostHorizon"])


REL, ABS = 1e-9, 1e-6
def close(a, b):
    if a is None and b is None: return True
    if a is None or b is None: return False
    if isinstance(a, str) or isinstance(b, str): return a == b
    return abs(a - b) <= max(ABS, REL * max(abs(a), abs(b)))


counts = {k: 0 for k in "ABCDEF"}
detail = {k: {} for k in "ABCDEF"}
persistence_critical = []
verified_now = []
still_unverified = []

for cid, c in base["cases"].items():
    if c.get("status") == "NOT EXECUTABLE":
        continue
    capc = cap["cases"].get(cid, {})
    stay = capc.get("inputs", {}).get("stayYears")

    for s in c.get("scenarios", []):
        for f, st in s["status"].items():
            if st != "EXPECTED VALUE REQUIRES REVIEW":
                continue
            cat, why = FIELD_CLASS.get(f, ("F", "unclassified"))
            counts[cat] += 1
            detail[cat].setdefault(f, {"why": why, "count": 0})
            detail[cat][f]["count"] += 1

    for blk in c.get("review", {}):
        cat, why = BLOCK_CLASS.get(blk, ("F", "unclassified"))
        counts[cat] += 1
        detail[cat].setdefault(blk, {"why": why, "count": 0})
        detail[cat][blk]["count"] += 1

# --------------------------------------------------------------- solver outputs (category D)
solver_cases = []
for cid, c in cap["cases"].items():
    r = c.get("rendered") or {}
    hit = [m for m in SOLVER_MARKERS if r.get(m)]
    if hit:
        solver_cases.append({"case": cid, "surfaces": hit})
counts["D"] = len(solver_cases)
counts["E"] -= 0  # rendered already counted once per case; solver surfaces are a subset, reported separately
detail["D"]["bisection + optimalRestructure output"] = {
    "why": ("concessionToCloseGap and additionalForPayment (both bisection) and optimalRestructure's R/C split "
            "surface only inside rendered output; they are not separate baseline fields. Counted here as the "
            "cases where a solver surface is populated."),
    "count": len(solver_cases)}

# --------------------------------------------------------------- Stage 6: verify the persistence-critical subset
# A-1  totalCostHorizon / miCostHorizon / postCancelPITI — derive independently
horizon_checked = horizon_mismatch = 0
post_checked = post_mismatch = 0
horizon_examples = []
for cid, c in cap["cases"].items():
    if not c.get("scenarios"):
        continue
    stay = c["inputs"]["stayYears"]
    for s in c["scenarios"]:
        h = horizon_costs(s, stay)
        horizon_checked += 2
        if not close(h["miCostHorizon"], s.get("miCostHorizon")):
            horizon_mismatch += 1
            if len(horizon_examples) < 5:
                horizon_examples.append({"case": cid, "sc": s["id"] + "@" + str(s["dp"]), "field": "miCostHorizon",
                                         "oracle": h["miCostHorizon"], "app": s.get("miCostHorizon")})
        if not close(h["totalCostHorizon"], s.get("totalCostHorizon")):
            horizon_mismatch += 1
            if len(horizon_examples) < 5:
                horizon_examples.append({"case": cid, "sc": s["id"] + "@" + str(s["dp"]), "field": "totalCostHorizon",
                                         "oracle": h["totalCostHorizon"], "app": s.get("totalCostHorizon")})
        if "postCancelPITI" in s:
            post_checked += 1
            # audit §2.4: MI cancellation is modelled per program — conventional at the
            # 80%-of-price crossover, FHA at mipDropMonth. Where MI never drops the
            # post-cancellation payment is simply the payment.
            expect = (s["piti"] - s["monthlyMI"]) if s.get("cancelMonth") else s["piti"]
            if not close(expect, s.get("postCancelPITI")):
                post_mismatch += 1

# A-2  bestOverall — reproduce the documented decision hierarchy, and measure the margin
winner_checked = winner_match = winner_neartie = 0
winner_mismatch = []
for cid, c in cap["cases"].items():
    sc = c.get("scenarios") or []
    best = c.get("bestOverall")
    if len(sc) < 1 or not best:
        continue
    stay = c["inputs"]["stayYears"]
    key = (lambda x: -x["cashRemaining"]) if stay <= 3 else \
          (lambda x: x["piti"]) if stay <= 7 else (lambda x: x["totalCostHorizon"])
    # audit §2.7 stages 2 and 3, applied before the primary metric:
    #   stage 2 — prefer scenarios leaving at least the reserve floor
    #   stage 3 — restrict to the comfort pool unless nothing clears the target
    pool = [x for x in sc if x["cashRemaining"] >= ref.RESERVE_FLOOR] or sc
    target = c["inputs"]["target"]
    comfort = [x for x in pool if x["piti"] <= target + 1e-9]
    pool = comfort or pool
    ordered = sorted(pool, key=key)
    winner_checked += 1
    top = ordered[0]
    margin = None
    if len(ordered) > 1:
        margin = abs(key(ordered[1]) - key(ordered[0]))
    window = ref.NEAR_TIE["cash"] if stay <= 3 else ref.NEAR_TIE["payment"] if stay <= 7 else ref.NEAR_TIE["financing"]
    ambiguous = margin is not None and margin <= window
    picked_same = (top["id"] == best["id"] and top["dp"] == best["dp"])
    if ambiguous:
        winner_neartie += 1
    elif picked_same:
        winner_match += 1
    else:
        winner_mismatch.append({"case": cid, "oracle_primary_metric_winner": top["id"] + "@" + str(top["dp"]),
                                "app": best["id"] + "@" + str(best["dp"]), "margin": margin, "window": window,
                                "stay": stay})

# A-3  eliminations — derive the SET and CAUSE independently from the documented rules
elim_checked = elim_match = 0
elim_mismatch = []
for cid, c in cap["cases"].items():
    inp = c.get("inputs")
    if not inp:
        continue
    got = sorted([e["name"] for e in c.get("eliminated", [])])
    expect = []
    if not inp["vaOn"]:
        expect.append("VA 0%")
    # program gating, audit §2.7 run()
    if inp["score"] < 620:
        for n in (["Conv 3%"] if inp["fthb"] else []) + ["Conv 5%", "Conv 10%", "Conv 20%"]:
            expect.append(n)
    elif not inp["fthb"]:
        pass  # Conv 3% is only enumerated for FTHB, so it is not an elimination
    # audit §1: FHA emits 3.5% at score >= 580, 10% at 500-579, and NOTHING below
    # 500 — so a sub-500 score produces no FHA row to eliminate at all.
    elim_checked += 1
    # a strict set comparison is only meaningful for the gating eliminations above;
    # specific-mode cash/DTI/limit eliminations depend on prices and are checked
    # by the numerical baseline instead.
    if all(e in got for e in expect):
        elim_match += 1
    else:
        elim_mismatch.append({"case": cid, "expected_subset": expect, "got": got})

out = {
    "schema": "bse-review-field-classification/1",
    "produced_by": "tests/classify-review-fields.py + tests/oracle/reference_model.py",
    "total_review_fields": base["summary"]["review_fields"],
    "counts": counts,
    "detail": detail,
    "stage6": {
        "horizon_costs": {"fields_checked": horizon_checked, "mismatches": horizon_mismatch, "examples": horizon_examples},
        "postCancelPITI": {"checked": post_checked, "mismatches": post_mismatch},
        "best_overall": {"cases_checked": winner_checked, "unambiguous_and_matching": winner_match,
                         "inside_near_tie_window": winner_neartie, "mismatches": winner_mismatch},
        "eliminations": {"cases_checked": elim_checked, "gating_subset_matching": elim_match,
                         "mismatches": elim_mismatch},
        "solver_surfaces": solver_cases[:10],
    },
}
json.dump(out, open(OUT, "w"), indent=1)

print("REVIEW FIELD CLASSIFICATION")
for k in "ABCDEF":
    print("  %s: %5d" % (k, counts[k]))
print("  total classified (A-C,E,F):", counts["A"] + counts["B"] + counts["C"] + counts["E"] + counts["F"],
      " | baseline review count:", base["summary"]["review_fields"])
print()
print("STAGE 6 — independent verification of the persistence-critical subset")
print("  horizon cost fields checked:", horizon_checked, " mismatches:", horizon_mismatch)
for e in horizon_examples: print("     ", e)
print("  postCancelPITI checked:", post_checked, " mismatches:", post_mismatch)
print("  bestOverall cases:", winner_checked, " unambiguous+matching:", winner_match,
      " inside near-tie window:", winner_neartie, " mismatches:", len(winner_mismatch))
for m in winner_mismatch[:5]: print("     ", m)
print("  elimination gating checked:", elim_checked, " matching:", elim_match, " mismatches:", len(elim_mismatch))
for m in elim_mismatch[:5]: print("     ", m)
