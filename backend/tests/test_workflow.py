import pytest


@pytest.fixture
async def analyst_user(db):
    from app.models.user import User, UserRole
    from app.core.security import hash_password
    user = User(email="wf_analyst@bank.com", full_name="WF Analyst",
                hashed_password=hash_password("password123"), role=UserRole.analyst)
    db.add(user)
    await db.flush()
    await db.refresh(user)
    return user


@pytest.fixture
async def analyst2_user(db):
    from app.models.user import User, UserRole
    from app.core.security import hash_password
    user = User(email="wf_analyst2@bank.com", full_name="WF Analyst 2",
                hashed_password=hash_password("password123"), role=UserRole.analyst)
    db.add(user)
    await db.flush()
    await db.refresh(user)
    return user


@pytest.fixture
async def sr_user(db):
    from app.models.user import User, UserRole
    from app.core.security import hash_password
    user = User(email="wf_sr@bank.com", full_name="WF Senior",
                hashed_password=hash_password("password123"), role=UserRole.sr_credit_analyst)
    db.add(user)
    await db.flush()
    await db.refresh(user)
    return user


@pytest.fixture
async def analyst_headers(client, analyst_user):
    resp = await client.post("/auth/login", json={"email": "wf_analyst@bank.com", "password": "password123"})
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


@pytest.fixture
async def analyst2_headers(client, analyst2_user):
    resp = await client.post("/auth/login", json={"email": "wf_analyst2@bank.com", "password": "password123"})
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


@pytest.fixture
async def sr_headers(client, sr_user):
    resp = await client.post("/auth/login", json={"email": "wf_sr@bank.com", "password": "password123"})
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


@pytest.fixture
async def spread_id(client, analyst_user, analyst_headers):
    borrow_resp = await client.post("/borrowers/", json={"name": "WF Corp", "fiscal_year_end_month": 12}, headers=analyst_headers)
    borrower_id = borrow_resp.json()["id"]
    resp = await client.post("/spreads/", json={"borrower_id": borrower_id, "deal_name": "WF Deal"}, headers=analyst_headers)
    return resp.json()["id"]


async def test_analyst_can_submit_own_spread(client, spread_id, analyst_headers):
    resp = await client.patch(f"/spreads/{spread_id}/status", json={"status": "completed"}, headers=analyst_headers)
    assert resp.status_code == 200
    assert resp.json()["status"] == "completed"


async def test_analyst_cannot_submit_others_spread(client, spread_id, analyst2_headers):
    # analyst2 cannot see analyst's spread at all → 404
    resp = await client.patch(f"/spreads/{spread_id}/status", json={"status": "completed"}, headers=analyst2_headers)
    assert resp.status_code == 404


async def test_analyst_cannot_mark_reviewed(client, spread_id, analyst_headers, sr_user):
    # Submit first
    await client.patch(f"/spreads/{spread_id}/status", json={"status": "completed"}, headers=analyst_headers)
    # Analyst tries to mark reviewed → 403
    resp = await client.patch(f"/spreads/{spread_id}/status", json={"status": "reviewed"}, headers=analyst_headers)
    assert resp.status_code == 403


async def test_sr_can_mark_reviewed(client, spread_id, analyst_headers, sr_headers):
    await client.patch(f"/spreads/{spread_id}/status", json={"status": "completed"}, headers=analyst_headers)
    resp = await client.patch(f"/spreads/{spread_id}/status", json={"status": "reviewed"}, headers=sr_headers)
    assert resp.status_code == 200
    assert resp.json()["status"] == "reviewed"


async def test_invalid_transition_rejected(client, spread_id, sr_headers):
    # Sr tries draft → reviewed directly (skipping completed) → 403
    resp = await client.patch(f"/spreads/{spread_id}/status", json={"status": "reviewed"}, headers=sr_headers)
    assert resp.status_code == 403


async def test_owner_analyst_can_reopen_completed_to_draft(client, spread_id, analyst_headers):
    """Owner can send a completed spread back to draft for further edits."""
    await client.patch(f"/spreads/{spread_id}/status", json={"status": "completed"}, headers=analyst_headers)
    resp = await client.patch(f"/spreads/{spread_id}/status", json={"status": "draft"}, headers=analyst_headers)
    assert resp.status_code == 200
    assert resp.json()["status"] == "draft"


async def test_reviewer_can_reopen_completed_to_draft(client, spread_id, analyst_headers, sr_headers):
    """Reviewer can return a completed spread to draft (reject for changes)."""
    await client.patch(f"/spreads/{spread_id}/status", json={"status": "completed"}, headers=analyst_headers)
    resp = await client.patch(f"/spreads/{spread_id}/status", json={"status": "draft"}, headers=sr_headers)
    assert resp.status_code == 200
    assert resp.json()["status"] == "draft"


async def test_reviewed_cannot_rollback_to_draft(client, spread_id, analyst_headers, sr_headers):
    """Reopen is only from completed, not from reviewed (already signed off)."""
    await client.patch(f"/spreads/{spread_id}/status", json={"status": "completed"}, headers=analyst_headers)
    await client.patch(f"/spreads/{spread_id}/status", json={"status": "reviewed"}, headers=sr_headers)
    resp = await client.patch(f"/spreads/{spread_id}/status", json={"status": "draft"}, headers=sr_headers)
    assert resp.status_code == 403


async def test_non_owner_analyst_cannot_reopen(client, spread_id, analyst_headers, analyst2_headers):
    """A different analyst should not be able to reopen another analyst's spread."""
    await client.patch(f"/spreads/{spread_id}/status", json={"status": "completed"}, headers=analyst_headers)
    resp = await client.patch(f"/spreads/{spread_id}/status", json={"status": "draft"}, headers=analyst2_headers)
    assert resp.status_code == 404


async def test_history_returns_transitions(client, spread_id, analyst_headers, sr_headers):
    await client.patch(f"/spreads/{spread_id}/status", json={"status": "completed"}, headers=analyst_headers)
    await client.patch(f"/spreads/{spread_id}/status", json={"status": "reviewed"}, headers=sr_headers)
    resp = await client.get(f"/spreads/{spread_id}/history", headers=analyst_headers)
    assert resp.status_code == 200
    history = resp.json()
    assert len(history) == 2
    assert history[0]["old_status"] == "draft"
    assert history[0]["new_status"] == "completed"
    assert history[1]["old_status"] == "completed"
    assert history[1]["new_status"] == "reviewed"
    assert history[1]["changed_by_name"] == "WF Senior"


async def test_history_empty_for_fresh_spread(client, spread_id, analyst_headers):
    resp = await client.get(f"/spreads/{spread_id}/history", headers=analyst_headers)
    assert resp.status_code == 200
    assert resp.json() == []


async def test_status_filter_on_list(client, analyst_headers, analyst_user):
    borrow_resp = await client.post("/borrowers/", json={"name": "Filter Corp", "fiscal_year_end_month": 12}, headers=analyst_headers)
    borrower_id = borrow_resp.json()["id"]
    s1 = (await client.post("/spreads/", json={"borrower_id": borrower_id, "deal_name": "S1"}, headers=analyst_headers)).json()["id"]
    s2 = (await client.post("/spreads/", json={"borrower_id": borrower_id, "deal_name": "S2"}, headers=analyst_headers)).json()["id"]

    # Submit s1 only
    await client.patch(f"/spreads/{s1}/status", json={"status": "completed"}, headers=analyst_headers)

    resp = await client.get("/spreads/?status=completed", headers=analyst_headers)
    assert resp.status_code == 200
    ids = [s["id"] for s in resp.json()]
    assert s1 in ids
    assert s2 not in ids
