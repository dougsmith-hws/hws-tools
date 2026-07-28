#!/usr/bin/env python3
"""
BUYER STRATEGY ENGINE — INDEPENDENT REFERENCE MODEL (the "oracle")
Phase 3 Gate B, Stage 1.

Purpose
-------
Produce EXPECTED numerical values for the 47 regression scenarios WITHOUT
executing, importing, transcribing or consulting the application's JavaScript.

Every formula below is implemented from the prose and tables in
`docs/BSE-Phase0-1-Forensic-Audit.md` — §2.1 amortization, §2.2 mortgage
insurance (the verbatim PMI table, FHA MIP step, VA funding-fee table),
§2.3 costs and limits, §2.4 the payment-engine assembly, §2.5 the closed-form
buying-power solver — not from `index.html`.

This is what makes the regression suite non-circular: the expected values are
an independent second implementation of the documented specification, and the
suite then asserts the application against them. Where the audit states a value
CANNOT be established statically (§11.5), this model does not fabricate one —
it returns None and the field is classified EXPECTED VALUE REQUIRES REVIEW.

The oracle takes, per scenario the application emits: price, program family,
down-payment percent, and the scenario's economic inputs. It independently
derives everything else, including the interest rate and the financed fee.
"""

from __future__ import annotations

N_MONTHS = 360  # audit §1: "Everything is 30-year fixed. const N = 360."

# ---------------------------------------------------------------- §2.1 amortization

def pmt(annual_pct: float, months: int, pv: float) -> float:
    """Level-payment annuity, monthly P&I."""
    r = annual_pct / 100.0 / 12.0
    if r == 0:
        return pv / months
    return pv * r / (1 - (1 + r) ** (-months))


def balance_after(pv: float, annual_pct: float, months: int, months_paid: int) -> float:
    """Remaining principal after n payments."""
    r = annual_pct / 100.0 / 12.0
    p = pmt(annual_pct, months, pv)
    if r == 0:
        return pv - p * months_paid
    g = (1 + r) ** months_paid
    return pv * g - p * (g - 1) / r


def month_to_balance(pv: float, annual_pct: float, months: int, target: float):
    """First month at which the balance is <= target; None if never."""
    for m in range(1, months + 1):
        if balance_after(pv, annual_pct, months, m) <= target:
            return m
    return None


# ---------------------------------------------------------------- §2.2 mortgage insurance

# Conventional PMI table, transcribed from audit §2.2 (annual % of BASE loan).
PMI_TABLE = {
    "760+":    {"a": 0.35, "b": 0.30, "c": 0.22, "d": 0.15},
    "740-759": {"a": 0.45, "b": 0.38, "c": 0.28, "d": 0.18},
    "720-739": {"a": 0.57, "b": 0.48, "c": 0.35, "d": 0.22},
    "700-719": {"a": 0.70, "b": 0.58, "c": 0.43, "d": 0.27},
    "680-699": {"a": 0.85, "b": 0.70, "c": 0.52, "d": 0.32},
    "660-679": {"a": 1.05, "b": 0.88, "c": 0.65, "d": 0.40},
    "640-659": {"a": 1.35, "b": 1.10, "c": 0.82, "d": 0.52},
    "<640":    {"a": 1.60, "b": 1.32, "c": 1.00, "d": 0.65},
}


def score_bucket(score: float) -> str:
    if score >= 760: return "760+"
    if score >= 740: return "740-759"
    if score >= 720: return "720-739"
    if score >= 700: return "700-719"
    if score >= 680: return "680-699"
    if score >= 660: return "660-679"
    if score >= 640: return "640-659"
    return "<640"


def pmi_band(ltv: float):
    """audit §2.2: a: LTV > 95 | b: 90-95 | c: 85-90 | d: 80.0001-85 | <= 80: none.
    The audit records an explicit 80.0001 epsilon at the bottom edge."""
    if ltv > 95: return "a"
    if ltv > 90: return "b"
    if ltv > 85: return "c"
    if ltv > 80.0001: return "d"
    return None


def pmi_rate(score: float, ltv: float) -> float:
    band = pmi_band(ltv)
    if band is None:
        return 0.0
    return PMI_TABLE[score_bucket(score)][band]


def fha_mip_rate(ltv: float) -> float:
    """audit §2.2: two-value step — LTV > 95 -> 0.55, else 0.50."""
    return 0.55 if ltv > 95 else 0.50


FHA_UFMIP_PCT = 1.75      # always financed
VA_FEE_FIRST = 2.15
VA_FEE_SUB = 3.30
VA_FEE_EXEMPT = 0.00


def va_fee_pct(exempt: bool, use: str) -> float:
    if exempt: return VA_FEE_EXEMPT
    return VA_FEE_SUB if use == "sub" else VA_FEE_FIRST


# ---------------------------------------------------------------- §2.3 costs and limits

FHA_LIMIT = 498257
CONF_LIMIT = 766550


def closing_cost(base_loan: float, cc_pct: float, cc_override: float, shopping: bool) -> float:
    """audit §2.3: a dollar override applies only in Specific Scenario Mode."""
    if (not shopping) and cc_override > 0:
        return cc_override
    return base_loan * cc_pct / 100.0


def concession_limit_pct(family: str, ltv: float) -> float:
    """audit §2.3 table. Conventional boundary is `ltv >= 75 -> 6`."""
    if family == "fha": return 6.0
    if family == "va": return 4.0
    if ltv > 90: return 3.0
    if ltv >= 75: return 6.0
    return 9.0


# ---------------------------------------------------------------- §2.4 the payment engine

def compute_scenario(*, price: float, family: str, dp_pct: float, inp: dict) -> dict:
    """Independent re-implementation of the assembly documented in audit §2.4."""
    dp_frac = dp_pct / 100.0
    down = price * dp_frac
    base_loan = price - down
    ltv = (base_loan / price * 100.0) if price > 0 else 0.0

    if family == "conv":
        rate = inp["rate_conv"]
        fee_pct = 0.0
        financed_fee = 0.0
        loan_amount = base_loan
        mi_rate = pmi_rate(inp["score"], ltv)
        monthly_mi = base_loan * mi_rate / 100.0 / 12.0
    elif family == "fha":
        rate = inp["rate_fha"]
        fee_pct = FHA_UFMIP_PCT
        financed_fee = base_loan * FHA_UFMIP_PCT / 100.0
        loan_amount = base_loan + financed_fee
        mi_rate = fha_mip_rate(ltv)
        monthly_mi = loan_amount * mi_rate / 100.0 / 12.0
    elif family == "va":
        rate = inp["rate_va"]
        fee_pct = va_fee_pct(inp["va_exempt"], inp["va_use"])
        financed_fee = base_loan * fee_pct / 100.0
        loan_amount = base_loan + financed_fee
        mi_rate = 0.0
        monthly_mi = 0.0
    else:
        raise ValueError("unknown family " + family)

    pi = pmt(rate, N_MONTHS, loan_amount)
    taxes = inp["tax_monthly"] if inp["tax_fixed"] else price * inp["tax_rate"] / 100.0 / 12.0
    fixed_esc = inp["hoi"] + inp["hoa"] + inp["cdd"] + inp["flood"]
    escrow = taxes + fixed_esc
    piti = pi + monthly_mi + escrow

    closing = closing_cost(base_loan, inp["cc_pct"], inp["cc_override"], inp["shopping"])
    cash_to_close = down + closing
    cash_remaining = inp["funds"] - cash_to_close

    front = piti / inp["income"] * 100.0 if inp["income"] else 0.0
    back = (piti + inp["debts"]) / inp["income"] * 100.0 if inp["income"] else 0.0

    conc_limit_pct = concession_limit_pct(family, ltv)

    # MI cancellation — audit §2.1/§2.4: conventional solves the true 80%-of-PRICE
    # crossover; FHA uses a fixed drop month keyed off the down-payment percent.
    cancel_month = None
    mip_drop_month = None
    mip_life = False
    if family == "conv" and mi_rate > 0 and price > 0:
        cancel_month = month_to_balance(loan_amount, rate, N_MONTHS, price * 0.80)
    if family == "fha":
        if dp_pct >= 10:
            mip_drop_month = 132
            mip_life = False
        else:
            mip_life = True
        # audit §2.4: "conventional solves the true 80%-of-price crossover month via
        # monthToBalance; FHA uses mipDropMonth (132 or null)" — so for FHA the
        # cancellation month IS the drop month.
        cancel_month = mip_drop_month

    return {
        "price": price, "dp": dp_pct, "down": down, "baseLoan": base_loan,
        "ltv": ltv, "rate": rate, "feePct": fee_pct, "financedFee": financed_fee,
        "loanAmount": loan_amount, "miRate": mi_rate, "monthlyMI": monthly_mi,
        "pi": pi, "taxes": taxes, "fixedEsc": fixed_esc, "escrow": escrow, "piti": piti,
        "closing": closing, "cashToClose": cash_to_close, "cashRemaining": cash_remaining,
        "front": front, "back": back,
        "concLimitPct": conc_limit_pct, "concLimit": price * conc_limit_pct / 100.0,
        "cancelMonth": cancel_month, "mipDropMonth": mip_drop_month, "mipLife": mip_life,
    }


# ---------------------------------------------------------------- §2.5 buying-power solver

RATIOS = {  # audit §2.2/L-2: the audited production values
    "conv": {"front": 28.0, "back": 45.0, "low_score": 620},
    "fha":  {"front": 31.0, "back": 43.0, "low_score": 500},
    "va":   {"front": 41.0, "back": 41.0, "low_score": 0},
}


def max_price_for_scenario(*, family: str, dp_pct: float, inp: dict) -> dict:
    """Independent re-implementation of the closed form documented in audit §2.5."""
    dp_frac = dp_pct / 100.0
    ltv = (1 - dp_frac) * 100.0

    if family == "conv":
        rate = inp["rate_conv"]; fee_frac = 0.0
        mi_rate = pmi_rate(inp["score"], ltv)
        mi_per = (1 - dp_frac) * mi_rate / 100.0 / 12.0          # MI on the BASE loan
    elif family == "fha":
        rate = inp["rate_fha"]; fee_frac = FHA_UFMIP_PCT / 100.0
        mi_rate = fha_mip_rate(ltv)
        mi_per = (1 - dp_frac) * (1 + fee_frac) * mi_rate / 100.0 / 12.0   # MI on the LOAN amount
    else:
        rate = inp["rate_va"]; fee_frac = va_fee_pct(inp["va_exempt"], inp["va_use"]) / 100.0
        mi_rate = 0.0; mi_per = 0.0

    l1 = (1 - dp_frac) * (1 + fee_frac)          # loanAmount per $1 of price
    pf = pmt(rate, N_MONTHS, 1.0)                 # payment per $1 of loanAmount
    tax_fixed_here = inp["tax_fixed"] and inp["tax_monthly"] is not None
    tax_per = 0.0 if tax_fixed_here else inp["tax_rate"] / 100.0 / 12.0

    k = pf * l1 + mi_per + tax_per
    b = inp["hoi"] + inp["hoa"] + inp["cdd"] + inp["flood"] + (inp["tax_monthly"] if tax_fixed_here else 0.0)

    def price_for_piti(p):
        return (p - b) / k if k > 0 else float("inf")

    comfort_price = price_for_piti(inp["target"])
    back_cap = RATIOS[family]["back"] / 100.0 * inp["income"] - inp["debts"]
    qual_price = price_for_piti(back_cap)
    cash_price = inp["funds"] / (dp_frac + (1 - dp_frac) * inp["cc_pct"] / 100.0)

    ceilings = [("Comfort Payment", comfort_price),
                ("Back-end DTI", qual_price),
                ("Cash to Close", cash_price)]
    if family == "conv":
        ceilings.append(("Conforming Loan Limit", CONF_LIMIT / (1 - dp_frac)))
    elif family == "fha":
        ceilings.append(("FHA Loan Limit", FHA_LIMIT / (1 - dp_frac)))
    # VA: no loan-limit ceiling (audit §2.5 — full entitlement)

    binding, max_price = min(ceilings, key=lambda t: t[1])
    return {"maxPrice": max_price, "binding": binding,
            "comfortPrice": comfort_price, "qualPrice": qual_price, "k": k, "b": b}


# ---------------------------------------------------------------- what cannot be derived

# audit §11.5 — "Cannot be established statically ... must be captured from the
# running application". The oracle deliberately refuses to produce these, so no
# field of this kind can be silently blessed as verified.
NOT_STATICALLY_DERIVABLE = {
    "bisection_solver_result",   # concessionToCloseGap, additionalForPayment
    "near_tie_winner",           # pickBestOverall / pickPathWinner in a near-tie window
    "optimal_restructure_split",
    "rendered_prose",
    "change_log",
}

# Near-tie windows, audit §2.7 stage 5 — used to decide whether a recommendation
# winner is unambiguous (VERIFIED) or inside the non-transitive window (REVIEW).
NEAR_TIE = {"cash": 250.0, "payment": 50.0, "financing": 2500.0}
CASH_PRESERVE = {"min_payment_saving": 150.0, "max_payback_months": 36}
RESERVE_FLOOR = 500.0
BUYDOWN_PCT_PER_POINT = 0.25   # L-8 — Live is authoritative; Staging's 0.24 is not adopted


def primary_metric(stay_years: float) -> str:
    """audit §2.7 stage 4."""
    if stay_years <= 3: return "maximize:cashRemaining"
    if stay_years <= 7: return "minimize:piti"
    return "minimize:totalCostHorizon"
