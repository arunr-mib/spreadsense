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


import pytest

@pytest.fixture
async def analyst_user_sp(db):
    from app.models.user import User, UserRole
    from app.core.security import hash_password
    user = User(email="analyst_sp@bank.com", full_name="Grid Analyst",
                hashed_password=hash_password("password123"), role=UserRole.analyst)
    db.add(user)
    await db.flush()
    await db.refresh(user)
    return user

@pytest.fixture
async def sp_headers(client, analyst_user_sp):
    resp = await client.post("/auth/login",
        json={"email": "analyst_sp@bank.com", "password": "password123"})
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}

@pytest.fixture
async def spread_id(client, sp_headers, analyst_user_sp, db):
    from app.models.borrower import Borrower
    b = Borrower(name="Grid Corp", fiscal_year_end_month=12, created_by=analyst_user_sp.id)
    db.add(b)
    await db.flush()
    await db.refresh(b)
    resp = await client.post("/spreads/",
        json={"borrower_id": b.id, "deal_name": "Grid Deal"}, headers=sp_headers)
    return resp.json()["id"]

async def test_create_period(client, sp_headers, spread_id):
    resp = await client.post(f"/spreads/{spread_id}/periods",
        json={"fiscal_year": 2023, "period_type": "actual"}, headers=sp_headers)
    assert resp.status_code == 201
    assert resp.json()["fiscal_year"] == 2023

async def test_list_periods(client, sp_headers, spread_id):
    await client.post(f"/spreads/{spread_id}/periods",
        json={"fiscal_year": 2022, "period_type": "actual"}, headers=sp_headers)
    await client.post(f"/spreads/{spread_id}/periods",
        json={"fiscal_year": 2023, "period_type": "actual"}, headers=sp_headers)
    resp = await client.get(f"/spreads/{spread_id}/periods", headers=sp_headers)
    assert resp.status_code == 200
    assert len(resp.json()) == 2

async def test_duplicate_period_rejected(client, sp_headers, spread_id):
    await client.post(f"/spreads/{spread_id}/periods",
        json={"fiscal_year": 2023, "period_type": "actual"}, headers=sp_headers)
    resp = await client.post(f"/spreads/{spread_id}/periods",
        json={"fiscal_year": 2023, "period_type": "actual"}, headers=sp_headers)
    assert resp.status_code == 409

async def test_upsert_line_item(client, sp_headers, spread_id):
    period = await client.post(f"/spreads/{spread_id}/periods",
        json={"fiscal_year": 2023, "period_type": "actual"}, headers=sp_headers)
    pid = period.json()["id"]
    resp = await client.put(
        f"/spreads/{spread_id}/periods/{pid}/line-items/net_sales",
        json={"value": 1_000_000.0, "updated_at": None},
        headers=sp_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["rma_field_key"] == "net_sales"
    assert resp.json()["value"] == 1_000_000.0

async def test_computed_field_write_rejected(client, sp_headers, spread_id):
    period = await client.post(f"/spreads/{spread_id}/periods",
        json={"fiscal_year": 2023, "period_type": "actual"}, headers=sp_headers)
    pid = period.json()["id"]
    resp = await client.put(
        f"/spreads/{spread_id}/periods/{pid}/line-items/gross_profit",
        json={"value": 500_000.0, "updated_at": None},
        headers=sp_headers,
    )
    assert resp.status_code == 422  # computed — cannot write directly

async def test_get_line_items_includes_computed(client, sp_headers, spread_id):
    period = await client.post(f"/spreads/{spread_id}/periods",
        json={"fiscal_year": 2023, "period_type": "actual"}, headers=sp_headers)
    pid = period.json()["id"]
    await client.put(
        f"/spreads/{spread_id}/periods/{pid}/line-items/net_sales",
        json={"value": 1_000_000.0, "updated_at": None}, headers=sp_headers)
    await client.put(
        f"/spreads/{spread_id}/periods/{pid}/line-items/cost_of_goods_sold",
        json={"value": 600_000.0, "updated_at": None}, headers=sp_headers)
    resp = await client.get(
        f"/spreads/{spread_id}/periods/{pid}/line-items?statement=IS",
        headers=sp_headers)
    assert resp.status_code == 200
    items = {i["rma_field_key"]: i["value"] for i in resp.json()}
    assert items["gross_profit"] == 400_000.0  # computed

async def test_balance_sheet_validation(client, sp_headers, spread_id):
    period = await client.post(f"/spreads/{spread_id}/periods",
        json={"fiscal_year": 2023, "period_type": "actual"}, headers=sp_headers)
    pid = period.json()["id"]
    for key, val in [("cash", 200_000.0), ("accounts_receivable", 200_000.0),
                     ("fixed_assets_net", 100_000.0)]:
        await client.put(
            f"/spreads/{spread_id}/periods/{pid}/line-items/{key}",
            json={"value": val, "updated_at": None}, headers=sp_headers)
    for key, val in [("long_term_debt", 300_000.0), ("total_equity", 200_000.0)]:
        await client.put(
            f"/spreads/{spread_id}/periods/{pid}/line-items/{key}",
            json={"value": val, "updated_at": None}, headers=sp_headers)
    resp = await client.get(f"/spreads/{spread_id}/validate", headers=sp_headers)
    assert resp.status_code == 200
    assert "balanced" in resp.json() or "periods" in resp.json()


async def test_create_adjustment(client, sp_headers, spread_id):
    period = await client.post(f"/spreads/{spread_id}/periods",
        json={"fiscal_year": 2024, "period_type": "actual"}, headers=sp_headers)
    pid = period.json()["id"]
    # First create a line item to adjust
    await client.put(f"/spreads/{spread_id}/periods/{pid}/line-items/net_sales",
        json={"value": 1_000_000.0, "updated_at": None}, headers=sp_headers)
    # Find the line item id via GET
    items = await client.get(
        f"/spreads/{spread_id}/periods/{pid}/line-items?statement=IS", headers=sp_headers)
    net_sales_id = next(i["id"] for i in items.json()
                        if i["rma_field_key"] == "net_sales" and i["id"])

    resp = await client.post(
        f"/spreads/{spread_id}/periods/{pid}/adjustments",
        json={"spread_line_item_id": net_sales_id, "delta": 50_000.0,
              "reason": "Add intercompany revenue"},
        headers=sp_headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["delta"] == 50_000.0
    assert data["reason"] == "Add intercompany revenue"

async def test_adjustment_requires_reason(client, sp_headers, spread_id):
    period = await client.post(f"/spreads/{spread_id}/periods",
        json={"fiscal_year": 2025, "period_type": "actual"}, headers=sp_headers)
    pid = period.json()["id"]
    resp = await client.post(
        f"/spreads/{spread_id}/periods/{pid}/adjustments",
        json={"spread_line_item_id": 1, "delta": 10.0, "reason": ""},
        headers=sp_headers,
    )
    assert resp.status_code == 422  # empty reason rejected

async def test_list_adjustments(client, sp_headers, spread_id):
    period = await client.post(f"/spreads/{spread_id}/periods",
        json={"fiscal_year": 2026, "period_type": "projected"}, headers=sp_headers)
    pid = period.json()["id"]
    resp = await client.get(
        f"/spreads/{spread_id}/periods/{pid}/adjustments", headers=sp_headers)
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)
