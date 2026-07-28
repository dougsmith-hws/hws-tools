#!/usr/bin/env python3
"""
BSE Gate B, Stage 1 — build the permanent expected-value baseline.

Reads the raw application capture, recomputes every derivable field with the
INDEPENDENT oracle (tests/oracle/reference_model.py), and writes a frozen
expected-value file with a per-field verification status:

  EXPECTED VALUE VERIFIED          — the oracle derived the same number from the
                                     documented specification, independently of
                                     the application source
  EXPECTED VALUE REQUIRES REVIEW   — audit §11.5 says it cannot be established
                                     statically (solver output, near-tie winner,
                                     rendered prose), so the captured value is
                                     recorded but NOT blessed as correct
  DISCREPANCY                      — the oracle and the application disagree on a
                                     field the specification does define

Usage: python3 build-expected-baseline.py <capture.json> <expected-out.json>
"""
import json, sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "oracle"))
import reference_model as ref

CAPTURE, OUT = sys.argv[1], sys.argv[2]
cap = json.load(open(CAPTURE))

REL, ABS = 1e-9, 1e-6

def close(a, b):
    if a is None and b is None: return True
    if a is None or b is None: return False
    if isinstance(a, bool) or isinstance(b, bool): return bool(a) == bool(b)
    if isinstance(a, str) or isinstance(b, str): return a == b
    if a == b: return True
    return abs(a - b) <= max(ABS, REL * max(abs(a), abs(b)))

# Fields the oracle derives from the documented specification.
VERIFIABLE = ["price", "down", "baseLoan", "ltv", "rate", "feePct", "financedFee", "loanAmount",
              "miRate", "monthlyMI", "pi", "taxes", "fixedEsc", "escrow", "piti", "closing",
              "cashToClose", "cashRemaining", "front", "back", "concLimitPct", "concLimit",
              "cancelMonth", "mipDropMonth", "mipLife", "maxPrice", "binding",
              "comfortPrice", "qualPrice",
              # promoted from REQUIRES REVIEW in Gate B.5 — now derived independently
              "miCostHorizon", "totalCostHorizon", "postCancelPITI"]

# audit §11.5 — not establishable statically. Captured, never blessed.
REVIEW_FIELDS = ["conc", "miMode",
                 "frontFlag", "requiresGift", "feeLabel", "label", "name"]

REVIEW_BLOCKS = {
    "bestOverall":  "pickBestOverall — audit §2.7: the comparator is non-transitive in near-tie windows and order-dependent by construction (§11.5).",
    "priorityPick": "priorityPick — same selection machinery as pickBestOverall.",
    "eliminated":   "Elimination strings are prose and are regex-parsed downstream (§11.5); wording is load-bearing and must be captured, not derived.",
    "rendered":     "All rendered prose and every Section 3 / Section 4 output, including both bisection solvers and optimalRestructure (§11.5).",
    "dpDimmed":     "Down-payment dimming is a display decision, not a documented calculation.",
}

def build_inp(app_inputs):
    """Economic inputs only — read from the application's own input object.
    These are inputs to the model, not results of it."""
    i = app_inputs
    return {
        "score": i["score"], "funds": i["funds"], "income": i["income"], "debts": i["debts"],
        "target": i["target"], "rate_conv": i["rates"]["conv"], "rate_fha": i["rates"]["fha"],
        "rate_va": i["rates"]["va"], "cc_pct": i["ccPct"], "cc_override": i.get("ccOverride", 0),
        "tax_rate": i["taxRate"], "tax_fixed": bool(i["taxFixed"]), "tax_monthly": i["taxMonthly"],
        "hoi": i["hoi"], "hoa": i["hoa"], "cdd": i["cdd"], "flood": i["flood"],
        "shopping": bool(i["shopping"]), "va_use": i["vaUse"], "va_exempt": bool(i["vaExempt"]),
    }

out_cases, summary = {}, {
    "verified_fields": 0, "review_fields": 0, "discrepancies": [], "not_executable": [],
    "cases_total": 0, "cases_with_scenarios": 0,
}

for cid, c in cap["cases"].items():
    summary["cases_total"] += 1
    if c.get("not_executable"):
        summary["not_executable"].append({"id": cid, "name": c.get("name"), "reason": c["not_executable"]})
        out_cases[cid] = {"id": cid, "name": c.get("name"), "status": "NOT EXECUTABLE",
                          "reason": c["not_executable"]}
        continue

    inp = build_inp(c["inputs"])
    rec = {"id": cid, "parent": c.get("parent"), "name": c.get("name"),
           "audit_note": c.get("audit_note"),
           "inputs_fingerprint": {k: c["inputs"][k] for k in
                                  ["shopping", "price", "score", "funds", "income", "debts", "target",
                                   "taxRate", "taxFixed", "taxMonthly", "hoi", "hoa", "cdd", "flood",
                                   "ccPct", "stayYears", "priority", "negotiationMode",
                                   "sellerConcession", "negotiatingRoom", "offerPrice"] if k in c["inputs"]},
           "unitState": c["unitState"], "domValues": c["domValues"],
           "scenarios": [], "review": {}}

    if c["scenarios"]:
        summary["cases_with_scenarios"] += 1

    for s in c["scenarios"]:
        family, dp = s["id"], s["dp"]
        mp = ref.max_price_for_scenario(family=family, dp_pct=dp, inp=inp)
        price = mp["maxPrice"] if inp["shopping"] else c["inputs"]["price"]
        o = ref.compute_scenario(price=price, family=family, dp_pct=dp, inp=inp)
        o.update({"maxPrice": mp["maxPrice"], "binding": mp["binding"],
                  "comfortPrice": mp["comfortPrice"], "qualPrice": mp["qualPrice"]})
        # Gate B.5: horizon costs and the post-cancellation payment are derived from
        # the documented §2.4 definitions, so they are no longer "requires review".
        hc = ref.horizon_costs(loan_amount=o["loanAmount"], rate=o["rate"],
                               monthly_mi=o["monthlyMI"], cancel_month=o["cancelMonth"],
                               financed_fee=o["financedFee"],
                               stay_years=c["inputs"]["stayYears"])
        o.update(hc)
        o["postCancelPITI"] = ref.post_cancel_piti(o["piti"], o["monthlyMI"], o["cancelMonth"])

        srec = {"scenarioKey": family + "@" + str(dp), "expected": {}, "status": {}}
        for f in VERIFIABLE:
            if f not in s:
                continue
            exp, act = o.get(f), s[f]
            if exp is None and act is None:
                srec["expected"][f] = None; srec["status"][f] = "EXPECTED VALUE VERIFIED"
                summary["verified_fields"] += 1; continue
            if close(exp, act):
                srec["expected"][f] = exp
                srec["status"][f] = "EXPECTED VALUE VERIFIED"
                summary["verified_fields"] += 1
            else:
                srec["expected"][f] = exp
                srec["status"][f] = "DISCREPANCY"
                srec.setdefault("actual", {})[f] = act
                summary["discrepancies"].append(
                    {"case": cid, "scenario": srec["scenarioKey"], "field": f,
                     "expected_oracle": exp, "actual_app": act,
                     "delta": (act - exp) if isinstance(exp, (int, float)) and isinstance(act, (int, float)) else None})
        for f in REVIEW_FIELDS:
            if f in s:
                srec["expected"][f] = s[f]
                srec["status"][f] = "EXPECTED VALUE REQUIRES REVIEW"
                summary["review_fields"] += 1
        rec["scenarios"].append(srec)

    for blk, why in REVIEW_BLOCKS.items():
        if blk in c and c[blk] not in (None, [], {}):
            rec["review"][blk] = {"captured": c[blk], "status": "EXPECTED VALUE REQUIRES REVIEW", "why": why}
            summary["review_fields"] += 1

    out_cases[cid] = rec

baseline = {
    "schema": "bse-expected-baseline/1",
    "produced_by": "tests/build-expected-baseline.py + tests/oracle/reference_model.py (independent implementation of docs/BSE-Phase0-1-Forensic-Audit.md §2.1-§2.5)",
    "app_under_capture": cap["app"],
    "verification_method": (
        "Expected values for every field the audit specifies were derived by an independent "
        "Python implementation of the documented formulas and compared to the application. "
        "Fields the audit §11.5 records as not establishable statically are captured and marked "
        "EXPECTED VALUE REQUIRES REVIEW — they are NOT blessed as correct."),
    "summary": summary,
    "cases": out_cases,
}
json.dump(baseline, open(OUT, "w"), indent=1)

print("cases:", summary["cases_total"],
      "| with scenarios:", summary["cases_with_scenarios"],
      "| not executable:", len(summary["not_executable"]))
print("VERIFIED fields:", summary["verified_fields"])
print("REVIEW fields:  ", summary["review_fields"])
print("DISCREPANCIES:  ", len(summary["discrepancies"]))
for d in summary["discrepancies"][:40]:
    print("   ", d["case"], d["scenario"], d["field"], "oracle=", d["expected_oracle"], "app=", d["actual_app"], "delta=", d["delta"])
