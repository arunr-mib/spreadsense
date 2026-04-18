import pytest
from app.models.user import User, UserRole
from app.models.borrower import Borrower
from app.models.spread import Spread, SpreadStatus
from app.models.spread_period import SpreadPeriod, PeriodType
from app.models.spread_line_item import SpreadLineItem
from app.core.security import hash_password


@pytest.fixture
async def ana_user(db):
    u = User(email="ana@bank.com", full_name="Ana Analyst",
             hashed_password=hash_password("pass123"), role=UserRole.analyst)
    db.add(u)
    await db.flush()
    await db.refresh(u)
    return u


@pytest.fixture
async def ana_headers(client, ana_user):
    resp = await client.post("/auth/login",
        json={"email": "ana@bank.com", "password": "pass123"})
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


@pytest.fixture
async def analytics_spread(db, ana_user):
    """Spread with one FY2023 period fully populated with known values."""
    b = Borrower(name="AnalyticsCo", fiscal_year_end_month=12, created_by=ana_user.id)
    db.add(b)
    await db.flush()

    spread = Spread(borrower_id=b.id, deal_name="Analytics Deal",
                    status=SpreadStatus.draft, created_by=ana_user.id)
    db.add(spread)
    await db.flush()

    period = SpreadPeriod(spread_id=spread.id, fiscal_year=2023, period_type=PeriodType.actual)
    db.add(period)
    await db.flush()

    # IS — yields: gross_profit=400k, ebitda=250k, ebit=220k, net_income=130k
    is_items = [
        ("net_sales", 1_000_000), ("cost_of_goods_sold", 600_000),
        ("sg_and_a", 100_000), ("other_operating_expenses", 50_000),
        ("depreciation_and_amortization", 30_000),
        ("interest_expense", 50_000), ("income_tax", 40_000),
    ]
    # BS — yields: tca=700k, ta=1.2M, tcl=300k, total_liab=700k, tle=1.2M
    bs_items = [
        ("cash", 200_000), ("accounts_receivable", 300_000),
        ("inventory", 150_000), ("other_current_assets", 50_000),
        ("fixed_assets_net", 500_000), ("other_long_term_assets", 0),
        ("accounts_payable", 100_000), ("accrued_liabilities", 50_000),
        ("current_portion_ltd", 100_000), ("other_current_liabilities", 50_000),
        ("long_term_debt", 400_000), ("other_long_term_liabilities", 0),
        ("total_equity", 500_000),
    ]
    # CF — yields: ncfo=160k, total_ds=250k, cfads=110k
    cf_items = [
        ("cf_net_income", 130_000), ("add_depreciation_amortization", 30_000),
        ("capital_expenditures", 50_000), ("debt_repayment_principal", 100_000),
    ]
    for key, val in is_items:
        db.add(SpreadLineItem(spread_period_id=period.id, statement="IS",
                              rma_field_key=key, value=val, source="manual"))
    for key, val in bs_items:
        db.add(SpreadLineItem(spread_period_id=period.id, statement="BS",
                              rma_field_key=key, value=val, source="manual"))
    for key, val in cf_items:
        db.add(SpreadLineItem(spread_period_id=period.id, statement="CF",
                              rma_field_key=key, value=val, source="manual"))
    await db.flush()
    await db.refresh(spread)
    return spread


async def test_analytics_returns_all_ratios(client, ana_headers, analytics_spread):
    resp = await client.get(f"/spreads/{analytics_spread.id}/analytics",
                            headers=ana_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["spread_id"] == analytics_spread.id
    assert len(data["periods"]) == 1
    ratios = data["periods"][0]["ratios"]
    # All 8 ratio keys present
    for key in ["dscr", "leverage", "current_ratio", "interest_coverage",
                "ebitda_margin", "gross_margin", "net_profit_margin", "return_on_assets"]:
        assert key in ratios


async def test_analytics_ratio_values_correct(client, ana_headers, analytics_spread):
    resp = await client.get(f"/spreads/{analytics_spread.id}/analytics",
                            headers=ana_headers)
    ratios = resp.json()["periods"][0]["ratios"]
    # cfads=110k, total_ds=250k → DSCR=0.44
    assert abs(ratios["dscr"] - 0.44) < 0.01
    # (400k + 100k) / 250k = 2.0
    assert abs(ratios["leverage"] - 2.0) < 0.01
    # 700k / 300k = 2.33
    assert abs(ratios["current_ratio"] - 2.33) < 0.01
    # 220k / 50k = 4.4
    assert abs(ratios["interest_coverage"] - 4.4) < 0.01
    # 250k / 1M = 0.25
    assert abs(ratios["ebitda_margin"] - 0.25) < 0.01
    # 400k / 1M = 0.40
    assert abs(ratios["gross_margin"] - 0.40) < 0.01
    # 130k / 1M = 0.13
    assert abs(ratios["net_profit_margin"] - 0.13) < 0.01
    # 130k / 1.2M ≈ 0.1083
    assert abs(ratios["return_on_assets"] - 0.1083) < 0.001


async def test_analytics_breach_detected(client, ana_headers, analytics_spread):
    resp = await client.get(f"/spreads/{analytics_spread.id}/analytics",
                            headers=ana_headers)
    period = resp.json()["periods"][0]
    # DSCR=0.44 < 1.20 min → breach
    assert "dscr" in period["breaches"]
    # leverage=2.0 < 4.50 max → no breach
    assert "leverage" not in period["breaches"]


async def test_analytics_null_when_missing_inputs(client, ana_headers, db, ana_user):
    """Spread with no line items → all ratios null."""
    b = Borrower(name="EmptyCo", fiscal_year_end_month=12, created_by=ana_user.id)
    db.add(b)
    await db.flush()
    spread = Spread(borrower_id=b.id, deal_name="Empty", status=SpreadStatus.draft,
                    created_by=ana_user.id)
    db.add(spread)
    await db.flush()
    period = SpreadPeriod(spread_id=spread.id, fiscal_year=2023, period_type=PeriodType.actual)
    db.add(period)
    await db.flush()

    resp = await client.get(f"/spreads/{spread.id}/analytics", headers=ana_headers)
    assert resp.status_code == 200
    ratios = resp.json()["periods"][0]["ratios"]
    assert all(v is None for v in ratios.values())


async def test_analytics_near_threshold_flagged(client, ana_headers, analytics_spread):
    resp = await client.get(f"/spreads/{analytics_spread.id}/analytics",
                            headers=ana_headers)
    period = resp.json()["periods"][0]
    # near_threshold key must exist
    assert "near_threshold" in period
    # leverage=2.0, max=4.50, amber zone 4.05–4.50 → not near
    assert "leverage" not in period["near_threshold"]


async def test_analytics_cross_user_access_denied(client, db, analytics_spread):
    """Analyst cannot access another analyst's spread analytics — returns 404."""
    from app.core.security import hash_password
    other = User(email="other@bank.com", full_name="Other Analyst",
                 hashed_password=hash_password("pass456"), role=UserRole.analyst)
    db.add(other)
    await db.flush()

    resp = await client.post("/auth/login",
        json={"email": "other@bank.com", "password": "pass456"})
    other_headers = {"Authorization": f"Bearer {resp.json()['access_token']}"}

    resp = await client.get(f"/spreads/{analytics_spread.id}/analytics",
                            headers=other_headers)
    assert resp.status_code == 404
