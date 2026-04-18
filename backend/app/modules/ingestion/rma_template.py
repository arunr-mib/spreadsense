"""
RMA field template — Income Statement, Balance Sheet, UCA Cash Flow.
Each field: {"key": str, "label": str, "computed": bool, "statement": "IS"|"BS"|"CF"}
COMPUTED_FIELDS: set of field keys whose values are derived — never manually editable.
"""
from typing import Optional

# Sign convention for cash flow fields:
# All values are stored as POSITIVE numbers representing absolute amounts.
# Directionality (inflow vs outflow) is handled by the compute functions.
# Specifically:
#   - capital_expenditures: positive = cash spent on capex (outflow)
#   - debt_repayment_principal: positive = cash paid to reduce debt (outflow)
# compute_period_values() negates these automatically where needed.

# ── Income Statement ────────────────────────────────────────────────────────
IS_FIELDS = [
    {"key": "net_sales",                   "label": "Net Sales",                      "computed": False, "statement": "IS"},
    {"key": "cost_of_goods_sold",          "label": "Cost of Goods Sold",             "computed": False, "statement": "IS"},
    {"key": "gross_profit",                "label": "Gross Profit",                   "computed": True,  "statement": "IS"},
    {"key": "sg_and_a",                    "label": "SG&A Expenses",                  "computed": False, "statement": "IS"},
    {"key": "other_operating_expenses",    "label": "Other Operating Expenses",       "computed": False, "statement": "IS"},
    {"key": "ebitda",                      "label": "EBITDA",                         "computed": True,  "statement": "IS"},
    {"key": "depreciation_and_amortization", "label": "Depreciation & Amortization", "computed": False, "statement": "IS"},
    {"key": "ebit",                        "label": "EBIT",                           "computed": True,  "statement": "IS"},
    {"key": "interest_expense",            "label": "Interest Expense",               "computed": False, "statement": "IS"},
    {"key": "pre_tax_income",              "label": "Pre-Tax Income",                 "computed": True,  "statement": "IS"},
    {"key": "income_tax",                  "label": "Income Tax Expense",             "computed": False, "statement": "IS"},
    {"key": "net_income",                  "label": "Net Income",                     "computed": True,  "statement": "IS"},
]

# ── Balance Sheet ────────────────────────────────────────────────────────────
BS_FIELDS = [
    # Assets
    {"key": "cash",                        "label": "Cash & Cash Equivalents",        "computed": False, "statement": "BS"},
    {"key": "accounts_receivable",         "label": "Accounts Receivable",            "computed": False, "statement": "BS"},
    {"key": "inventory",                   "label": "Inventory",                      "computed": False, "statement": "BS"},
    {"key": "other_current_assets",        "label": "Other Current Assets",           "computed": False, "statement": "BS"},
    {"key": "total_current_assets",        "label": "Total Current Assets",           "computed": True,  "statement": "BS"},
    {"key": "fixed_assets_net",            "label": "Fixed Assets (Net)",             "computed": False, "statement": "BS"},
    {"key": "other_long_term_assets",      "label": "Other Long-Term Assets",         "computed": False, "statement": "BS"},
    {"key": "total_assets",                "label": "Total Assets",                   "computed": True,  "statement": "BS"},
    # Liabilities & Equity
    {"key": "accounts_payable",            "label": "Accounts Payable",               "computed": False, "statement": "BS"},
    {"key": "accrued_liabilities",         "label": "Accrued Liabilities",            "computed": False, "statement": "BS"},
    {"key": "current_portion_ltd",         "label": "Current Portion of LTD",         "computed": False, "statement": "BS"},
    {"key": "other_current_liabilities",   "label": "Other Current Liabilities",      "computed": False, "statement": "BS"},
    {"key": "total_current_liabilities",   "label": "Total Current Liabilities",      "computed": True,  "statement": "BS"},
    {"key": "long_term_debt",              "label": "Long-Term Debt",                 "computed": False, "statement": "BS"},
    {"key": "other_long_term_liabilities", "label": "Other Long-Term Liabilities",    "computed": False, "statement": "BS"},
    {"key": "total_liabilities",           "label": "Total Liabilities",              "computed": True,  "statement": "BS"},
    {"key": "total_equity",                "label": "Total Equity",                   "computed": False, "statement": "BS"},
    {"key": "total_liabilities_and_equity","label": "Total Liabilities & Equity",     "computed": True,  "statement": "BS"},
]

# ── UCA Cash Flow ────────────────────────────────────────────────────────────
CF_FIELDS = [
    {"key": "cf_net_income",               "label": "Net Income",                     "computed": False, "statement": "CF"},
    {"key": "add_depreciation_amortization","label": "Add: Depreciation & Amortization","computed": False, "statement": "CF"},
    {"key": "add_other_non_cash",          "label": "Add: Other Non-Cash Items",      "computed": False, "statement": "CF"},
    {"key": "change_accounts_receivable",  "label": "Change in Accounts Receivable",  "computed": False, "statement": "CF"},
    {"key": "change_inventory",            "label": "Change in Inventory",            "computed": False, "statement": "CF"},
    {"key": "change_accounts_payable",     "label": "Change in Accounts Payable",     "computed": False, "statement": "CF"},
    {"key": "change_other_working_capital","label": "Change in Other Working Capital", "computed": False, "statement": "CF"},
    {"key": "net_cash_from_operations",    "label": "Net Cash from Operations",       "computed": True,  "statement": "CF"},
    {"key": "capital_expenditures",        "label": "Capital Expenditures",           "computed": False, "statement": "CF"},
    {"key": "other_investing",             "label": "Other Investing Activities",      "computed": False, "statement": "CF"},
    {"key": "net_cash_from_investing",     "label": "Net Cash from Investing",        "computed": True,  "statement": "CF"},
    {"key": "debt_proceeds",               "label": "Debt Proceeds",                  "computed": False, "statement": "CF"},
    {"key": "debt_repayment_principal",    "label": "Debt Repayment (Principal)",     "computed": False, "statement": "CF"},
    {"key": "dividends_distributions",     "label": "Dividends / Distributions",      "computed": False, "statement": "CF"},
    {"key": "other_financing",             "label": "Other Financing Activities",      "computed": False, "statement": "CF"},
    {"key": "net_cash_from_financing",     "label": "Net Cash from Financing",        "computed": True,  "statement": "CF"},
    {"key": "net_change_in_cash",          "label": "Net Change in Cash",             "computed": True,  "statement": "CF"},
    # Cross-statement computed — components come from IS + BS
    {"key": "total_debt_service",          "label": "Total Debt Service",             "computed": True,  "statement": "CF"},
    {"key": "uca_cfads",                   "label": "UCA CFADS",                      "computed": True,  "statement": "CF"},
]

# Fast lookup sets
COMPUTED_FIELDS: set = {
    f["key"] for f in IS_FIELDS + BS_FIELDS + CF_FIELDS if f["computed"]
}
ALL_FIELD_KEYS: set = {
    f["key"] for f in IS_FIELDS + BS_FIELDS + CF_FIELDS
}

def neg(v: Optional[float]) -> Optional[float]:
    return -v if v is not None else None


def _get(values: dict, key: str) -> Optional[float]:
    """Return value or None if missing/None."""
    v = values.get(key)
    return float(v) if v is not None else None


def _sum(*vals: Optional[float]) -> Optional[float]:
    """Sum, returning None if ALL inputs are None; treats individual None as 0."""
    if all(v is None for v in vals):
        return None
    return sum(v or 0.0 for v in vals)


def compute_period_values(statement: str, values: dict) -> dict:
    """
    Given a dict of {field_key: value} for one statement and one period,
    compute and return all derived subtotals for that statement.
    Returns a dict of computed field keys -> computed values (None if inputs missing).
    Cross-statement fields (total_debt_service, uca_cfads) require is_values + bs_values;
    call compute_cross_statement() separately for those.
    """
    out = {}
    v = values  # shorthand

    if statement == "IS":
        out["gross_profit"]    = _sum(_get(v, "net_sales"), neg(_get(v, "cost_of_goods_sold")))
        gp = out["gross_profit"]
        out["ebitda"]          = _sum(gp, neg(_get(v, "sg_and_a")), neg(_get(v, "other_operating_expenses")))
        out["ebit"]            = _sum(out["ebitda"], neg(_get(v, "depreciation_and_amortization")))
        out["pre_tax_income"]  = _sum(out["ebit"], neg(_get(v, "interest_expense")))
        out["net_income"]      = _sum(out["pre_tax_income"], neg(_get(v, "income_tax")))

    elif statement == "BS":
        out["total_current_assets"] = _sum(
            _get(v, "cash"), _get(v, "accounts_receivable"),
            _get(v, "inventory"), _get(v, "other_current_assets"),
        )
        out["total_assets"] = _sum(
            out["total_current_assets"], _get(v, "fixed_assets_net"), _get(v, "other_long_term_assets"),
        )
        out["total_current_liabilities"] = _sum(
            _get(v, "accounts_payable"), _get(v, "accrued_liabilities"),
            _get(v, "current_portion_ltd"), _get(v, "other_current_liabilities"),
        )
        out["total_liabilities"] = _sum(
            out["total_current_liabilities"], _get(v, "long_term_debt"), _get(v, "other_long_term_liabilities"),
        )
        out["total_liabilities_and_equity"] = _sum(out["total_liabilities"], _get(v, "total_equity"))

    elif statement == "CF":
        out["net_cash_from_operations"] = _sum(
            _get(v, "cf_net_income"), _get(v, "add_depreciation_amortization"),
            _get(v, "add_other_non_cash"), _get(v, "change_accounts_receivable"),
            _get(v, "change_inventory"), _get(v, "change_accounts_payable"),
            _get(v, "change_other_working_capital"),
        )
        out["net_cash_from_investing"] = _sum(_get(v, "capital_expenditures"), _get(v, "other_investing"))
        out["net_cash_from_financing"] = _sum(
            _get(v, "debt_proceeds"), _get(v, "debt_repayment_principal"),
            _get(v, "dividends_distributions"), _get(v, "other_financing"),
        )
        out["net_change_in_cash"] = _sum(
            out["net_cash_from_operations"], out["net_cash_from_investing"], out["net_cash_from_financing"],
        )

    return {k: val for k, val in out.items() if val is not None}


def compute_cross_statement(is_values: dict, bs_values: dict, cf_values: dict) -> dict:
    """
    Compute total_debt_service and uca_cfads — require values from multiple statements.
    is_values / bs_values / cf_values are the raw (non-computed) values for one period.
    Returns {total_debt_service: float|None, uca_cfads: float|None}

    Sign convention: capital_expenditures and debt_repayment_principal are stored as
    positive values representing absolute cash outflows. neg() is applied here to
    correctly subtract capex when computing uca_cfads (ncfo - capex).
    """
    interest   = _get(is_values, "interest_expense")
    cpltd      = _get(bs_values, "current_portion_ltd")
    repayment  = _get(cf_values, "debt_repayment_principal")
    total_ds   = _sum(interest, cpltd, repayment)

    # Need net_cash_from_operations — compute it first
    cf_computed = compute_period_values("CF", cf_values)
    ncfo   = cf_computed.get("net_cash_from_operations")
    capex  = _get(cf_values, "capital_expenditures")
    cfads  = _sum(ncfo, neg(capex)) if (ncfo is not None or capex is not None) else None

    return {"total_debt_service": total_ds, "uca_cfads": cfads}


def validate_balance_sheet(values: dict, tolerance: float = 0.01) -> bool:
    """
    Returns True if Total Assets ~= Total Liabilities & Equity (within $0.01 rounding tolerance).
    Returns True (passes) if either value is missing — only validate when both are present.
    """
    ta  = _get(values, "total_assets")
    tle = _get(values, "total_liabilities_and_equity")
    if ta is None or tle is None:
        return True
    return abs(ta - tle) <= tolerance
