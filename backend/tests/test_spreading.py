# backend/tests/test_spreading.py
from app.modules.ingestion.rma_template import (
    IS_FIELDS, BS_FIELDS, CF_FIELDS,
    COMPUTED_FIELDS, compute_period_values,
    ALL_FIELD_KEYS,
)

def test_all_statements_have_fields():
    assert len(IS_FIELDS) >= 12
    assert len(BS_FIELDS) >= 18
    assert len(CF_FIELDS) >= 19

def test_computed_fields_are_subset_of_all_fields():
    all_keys = {f["key"] for f in IS_FIELDS + BS_FIELDS + CF_FIELDS}
    for key in COMPUTED_FIELDS:
        assert key in all_keys, f"Computed field {key} not in field list"

def test_gross_profit_computation():
    values = {"net_sales": 1_000_000.0, "cost_of_goods_sold": 600_000.0}
    result = compute_period_values("IS", values)
    assert result["gross_profit"] == 400_000.0

def test_balance_sheet_validation_passes():
    from app.modules.ingestion.rma_template import validate_balance_sheet
    values = {
        "total_assets": 500_000.0,
        "total_liabilities_and_equity": 500_000.0,
    }
    assert validate_balance_sheet(values) is True

def test_balance_sheet_validation_fails():
    from app.modules.ingestion.rma_template import validate_balance_sheet
    values = {
        "total_assets": 500_000.0,
        "total_liabilities_and_equity": 499_000.0,
    }
    assert validate_balance_sheet(values) is False
