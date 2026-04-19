import pytest
from decimal import Decimal


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture
async def p6_analyst(db):
    from app.models.user import User, UserRole
    from app.core.security import hash_password
    user = User(email="p6_analyst@bank.com", full_name="Ana P6",
                hashed_password=hash_password("password123"), role=UserRole.analyst)
    db.add(user)
    await db.flush()
    await db.refresh(user)
    return user


@pytest.fixture
async def p6_sr(db):
    from app.models.user import User, UserRole
    from app.core.security import hash_password
    user = User(email="p6_sr@bank.com", full_name="James P6",
                hashed_password=hash_password("password123"), role=UserRole.sr_credit_analyst)
    db.add(user)
    await db.flush()
    await db.refresh(user)
    return user


@pytest.fixture
async def p6_borrower(db, p6_analyst):
    from app.models.borrower import Borrower
    b = Borrower(name="Acme P6 Corp", fiscal_year_end_month=12, created_by=p6_analyst.id)
    db.add(b)
    await db.flush()
    await db.refresh(b)
    return b


@pytest.fixture
async def p6_spread(db, p6_analyst, p6_borrower):
    from app.models.spread import Spread, SpreadStatus
    s = Spread(deal_name="P6 Term Loan", borrower_id=p6_borrower.id,
               created_by=p6_analyst.id, status=SpreadStatus.draft)
    db.add(s)
    await db.flush()
    await db.refresh(s)
    return s


@pytest.fixture
async def p6_sr_headers(client, p6_sr):
    resp = await client.post("/auth/login", json={"email": "p6_sr@bank.com", "password": "password123"})
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


@pytest.fixture
async def p6_analyst_headers(client, p6_analyst):
    resp = await client.post("/auth/login", json={"email": "p6_analyst@bank.com", "password": "password123"})
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


# ── Tests ─────────────────────────────────────────────────────────────────────

async def test_sr_can_access_summary(client, p6_sr_headers, p6_spread):
    resp = await client.get("/portfolio/summary", headers=p6_sr_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "status_counts" in data
    assert data["status_counts"]["total"] >= 1
    assert data["status_counts"]["draft"] >= 1
    assert "breach_alerts" in data
    assert "spread_summaries" in data


async def test_analyst_cannot_access_summary(client, p6_analyst_headers, p6_spread):
    resp = await client.get("/portfolio/summary", headers=p6_analyst_headers)
    assert resp.status_code == 403


async def test_breach_alerts_populated(client, p6_sr_headers, p6_spread, db):
    """Spread with a DSCR breach (value < 1.20 minimum) appears in breach_alerts."""
    from app.models.spread_period import SpreadPeriod, PeriodType
    from app.models.spread_line_item import SpreadLineItem

    period = SpreadPeriod(spread_id=p6_spread.id, fiscal_year=2024,
                          period_type=PeriodType.actual, locked=False)
    db.add(period)
    await db.flush()
    await db.refresh(period)

    # uca_cfads and total_debt_service are computed from raw inputs.
    # cf_net_income=130k, no d&a, capex=50k → uca_cfads=80k
    # debt_repayment_principal=200k → total_debt_service=200k
    # DSCR = 80k / 200k = 0.40 → breach (< 1.20)
    items = [
        SpreadLineItem(spread_period_id=period.id, statement="CF",
                       rma_field_key="cf_net_income", value=Decimal("130000")),
        SpreadLineItem(spread_period_id=period.id, statement="CF",
                       rma_field_key="capital_expenditures", value=Decimal("50000")),
        SpreadLineItem(spread_period_id=period.id, statement="CF",
                       rma_field_key="debt_repayment_principal", value=Decimal("200000")),
    ]
    for item in items:
        db.add(item)
    await db.flush()

    resp = await client.get("/portfolio/summary", headers=p6_sr_headers)
    assert resp.status_code == 200
    alerts = resp.json()["breach_alerts"]
    dscr_breaches = [a for a in alerts if a["ratio_name"] == "dscr" and a["severity"] == "breach"]
    assert len(dscr_breaches) >= 1
    breach = dscr_breaches[0]
    assert breach["direction"] == "min"
    assert breach["threshold"] == 1.20
    assert breach["spread_id"] == p6_spread.id


async def test_near_threshold_included(client, p6_sr_headers, p6_spread, db):
    """Spread near-threshold (DSCR between 1.20 and 1.32) appears with severity near_threshold."""
    from app.models.spread_period import SpreadPeriod, PeriodType
    from app.models.spread_line_item import SpreadLineItem

    period = SpreadPeriod(spread_id=p6_spread.id, fiscal_year=2023,
                          period_type=PeriodType.actual, locked=False)
    db.add(period)
    await db.flush()
    await db.refresh(period)

    # uca_cfads = ncfo - capex; cf_net_income=125k, no capex → cfads=125k
    # debt_repayment_principal=100k → total_debt_service=100k
    # DSCR = 125k/100k = 1.25 → near_threshold (1.20 < 1.25 <= 1.32)
    items = [
        SpreadLineItem(spread_period_id=period.id, statement="CF",
                       rma_field_key="cf_net_income", value=Decimal("125000")),
        SpreadLineItem(spread_period_id=period.id, statement="CF",
                       rma_field_key="debt_repayment_principal", value=Decimal("100000")),
    ]
    for item in items:
        db.add(item)
    await db.flush()

    resp = await client.get("/portfolio/summary", headers=p6_sr_headers)
    assert resp.status_code == 200
    alerts = resp.json()["breach_alerts"]
    near = [a for a in alerts if a["ratio_name"] == "dscr" and a["severity"] == "near_threshold"]
    assert len(near) >= 1


async def test_empty_portfolio(client, p6_sr_headers):
    """No spreads created → zero counts, empty arrays."""
    resp = await client.get("/portfolio/summary", headers=p6_sr_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["status_counts"]["total"] == 0
    assert data["breach_alerts"] == []
    assert data["spread_summaries"] == []


async def test_spread_summary_names_resolved(client, p6_sr_headers, p6_spread, p6_borrower, p6_analyst):
    """spread_summaries[0].borrower_name and analyst_name match fixture data."""
    resp = await client.get("/portfolio/summary", headers=p6_sr_headers)
    assert resp.status_code == 200
    summaries = resp.json()["spread_summaries"]
    assert len(summaries) >= 1
    summary = next(s for s in summaries if s["id"] == p6_spread.id)
    assert summary["borrower_name"] == p6_borrower.name
    assert summary["analyst_name"] == p6_analyst.full_name
