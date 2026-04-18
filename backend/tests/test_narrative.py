import pytest
from unittest.mock import patch, AsyncMock
from app.models.user import User, UserRole
from app.models.borrower import Borrower
from app.models.spread import Spread, SpreadStatus
from app.models.spread_period import SpreadPeriod, PeriodType
from app.models.spread_line_item import SpreadLineItem
from app.core.security import hash_password


@pytest.fixture
async def narr_user(db):
    u = User(email="narr@bank.com", full_name="Narr Analyst",
             hashed_password=hash_password("pass123"), role=UserRole.analyst)
    db.add(u)
    await db.flush()
    await db.refresh(u)
    return u


@pytest.fixture
async def narr_headers(client, narr_user):
    resp = await client.post("/auth/login", json={"email": "narr@bank.com", "password": "pass123"})
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


@pytest.fixture
async def narr_spread(db, narr_user):
    b = Borrower(name="NarrCo", fiscal_year_end_month=12, created_by=narr_user.id)
    db.add(b)
    await db.flush()
    s = Spread(borrower_id=b.id, deal_name="Narr Deal", status=SpreadStatus.draft, created_by=narr_user.id)
    db.add(s)
    await db.flush()
    await db.refresh(s)
    return s


@pytest.fixture
async def narr_spread_with_period(db, narr_spread, narr_user):
    p = SpreadPeriod(spread_id=narr_spread.id, fiscal_year=2023, period_type=PeriodType.actual)
    db.add(p)
    await db.flush()
    db.add(SpreadLineItem(spread_period_id=p.id, statement="IS",
                          rma_field_key="net_sales", value=1_000_000, source="manual"))
    await db.flush()
    return narr_spread


MOCK_NARRATIVE = "**Company Overview**\nNarrCo is a test company.\n\n**Profitability**\nRevenue strong."


async def test_get_narrative_404_when_none(client, narr_headers, narr_spread):
    resp = await client.get(f"/spreads/{narr_spread.id}/narrative", headers=narr_headers)
    assert resp.status_code == 404


async def test_generate_narrative_creates_version_1(client, narr_headers, narr_spread_with_period):
    with patch("app.modules.narrative.service._claude_generate",
               new_callable=AsyncMock, return_value=MOCK_NARRATIVE):
        resp = await client.post(f"/spreads/{narr_spread_with_period.id}/narrative/generate", headers=narr_headers)
    assert resp.status_code == 201
    data = resp.json()
    assert data["version"] == 1
    assert data["content"] == MOCK_NARRATIVE
    assert data["created_by_name"] == "Narr Analyst"


async def test_generate_422_when_no_is_period(client, narr_headers, narr_spread):
    with patch("app.modules.narrative.service._claude_generate",
               new_callable=AsyncMock, return_value=MOCK_NARRATIVE):
        resp = await client.post(f"/spreads/{narr_spread.id}/narrative/generate", headers=narr_headers)
    assert resp.status_code == 422


async def test_generate_creates_incremental_versions(client, narr_headers, narr_spread_with_period):
    with patch("app.modules.narrative.service._claude_generate",
               new_callable=AsyncMock, return_value=MOCK_NARRATIVE):
        r1 = await client.post(f"/spreads/{narr_spread_with_period.id}/narrative/generate", headers=narr_headers)
        r2 = await client.post(f"/spreads/{narr_spread_with_period.id}/narrative/generate", headers=narr_headers)
    assert r1.json()["version"] == 1
    assert r2.json()["version"] == 2


async def test_save_creates_new_version(client, narr_headers, narr_spread_with_period):
    with patch("app.modules.narrative.service._claude_generate",
               new_callable=AsyncMock, return_value=MOCK_NARRATIVE):
        await client.post(f"/spreads/{narr_spread_with_period.id}/narrative/generate", headers=narr_headers)
    resp = await client.post(f"/spreads/{narr_spread_with_period.id}/narrative",
                             json={"content": "Edited content by analyst."}, headers=narr_headers)
    assert resp.status_code == 201
    assert resp.json()["version"] == 2
    assert resp.json()["content"] == "Edited content by analyst."


async def test_get_latest_narrative(client, narr_headers, narr_spread_with_period):
    with patch("app.modules.narrative.service._claude_generate",
               new_callable=AsyncMock, return_value=MOCK_NARRATIVE):
        await client.post(f"/spreads/{narr_spread_with_period.id}/narrative/generate", headers=narr_headers)
    resp = await client.get(f"/spreads/{narr_spread_with_period.id}/narrative", headers=narr_headers)
    assert resp.status_code == 200
    assert resp.json()["version"] == 1
    assert resp.json()["created_by_name"] == "Narr Analyst"


async def test_version_list_descending(client, narr_headers, narr_spread_with_period):
    with patch("app.modules.narrative.service._claude_generate",
               new_callable=AsyncMock, return_value=MOCK_NARRATIVE):
        await client.post(f"/spreads/{narr_spread_with_period.id}/narrative/generate", headers=narr_headers)
        await client.post(f"/spreads/{narr_spread_with_period.id}/narrative/generate", headers=narr_headers)
    resp = await client.get(f"/spreads/{narr_spread_with_period.id}/narrative/versions", headers=narr_headers)
    assert resp.status_code == 200
    versions = resp.json()
    assert len(versions) == 2
    assert versions[0]["version"] == 2
    assert versions[1]["version"] == 1


async def test_analyst_cannot_access_other_users_narrative(client, db, narr_spread_with_period):
    """Analyst cannot access another analyst's spread narrative — returns 404."""
    from app.core.security import hash_password
    other = User(email="other_narr@bank.com", full_name="Other Analyst",
                 hashed_password=hash_password("pass456"), role=UserRole.analyst)
    db.add(other)
    await db.flush()
    resp = await client.post("/auth/login", json={"email": "other_narr@bank.com", "password": "pass456"})
    other_headers = {"Authorization": f"Bearer {resp.json()['access_token']}"}
    resp = await client.get(f"/spreads/{narr_spread_with_period.id}/narrative", headers=other_headers)
    assert resp.status_code == 404
