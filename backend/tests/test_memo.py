from __future__ import annotations

import pytest
from app.models.user import User, UserRole
from app.models.borrower import Borrower
from app.models.spread import Spread, SpreadStatus
from app.core.security import hash_password


@pytest.fixture
async def memo_user(db):
    u = User(email="memo@bank.com", full_name="Memo User",
             hashed_password=hash_password("pass123"), role=UserRole.analyst)
    db.add(u)
    await db.flush()
    await db.refresh(u)
    return u


@pytest.fixture
async def memo_headers(client, memo_user):
    resp = await client.post("/auth/login",
        json={"email": "memo@bank.com", "password": "pass123"})
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


@pytest.fixture
async def memo_spread(db, memo_user):
    b = Borrower(name="MemoCo", fiscal_year_end_month=12, created_by=memo_user.id)
    db.add(b)
    await db.flush()
    spread = Spread(borrower_id=b.id, deal_name="Memo Deal",
                    status=SpreadStatus.draft, created_by=memo_user.id)
    db.add(spread)
    await db.flush()
    await db.refresh(spread)
    return spread


async def test_get_meta_returns_empty_when_none(client, memo_headers, memo_spread):
    """GET /memo/meta returns {} (not 404) when no row exists."""
    resp = await client.get(f"/spreads/{memo_spread.id}/memo/meta",
                            headers=memo_headers)
    assert resp.status_code == 200
    assert resp.json() == {}


async def test_upsert_meta_creates_on_first_save(client, memo_headers, memo_spread):
    payload = {
        "recommendation": "approve",
        "risk_rating": "pass",
        "facility_amount": 2_500_000,
        "facility_type": "term_loan",
    }
    resp = await client.put(f"/spreads/{memo_spread.id}/memo/meta",
                            json=payload, headers=memo_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["recommendation"] == "approve"
    assert data["risk_rating"] == "pass"
    assert data["facility_amount"] == 2_500_000
    assert data["spread_id"] == memo_spread.id


async def test_upsert_meta_updates_on_second_save(client, memo_headers, memo_spread):
    await client.put(f"/spreads/{memo_spread.id}/memo/meta",
                     json={"recommendation": "approve"}, headers=memo_headers)
    resp = await client.put(f"/spreads/{memo_spread.id}/memo/meta",
                            json={"recommendation": "decline"}, headers=memo_headers)
    assert resp.status_code == 200
    assert resp.json()["recommendation"] == "decline"


async def test_meta_cross_user_access_denied(client, db, memo_spread):
    """Analyst cannot access another analyst's spread memo — returns 404."""
    other = User(email="other_memo@bank.com", full_name="Other",
                 hashed_password=hash_password("pass456"), role=UserRole.analyst)
    db.add(other)
    await db.flush()
    resp = await client.post("/auth/login",
        json={"email": "other_memo@bank.com", "password": "pass456"})
    other_headers = {"Authorization": f"Bearer {resp.json()['access_token']}"}
    resp = await client.get(f"/spreads/{memo_spread.id}/memo/meta",
                            headers=other_headers)
    assert resp.status_code == 404
