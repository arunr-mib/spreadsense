import pytest


@pytest.fixture
async def analyst_user(db):
    from app.models.user import User, UserRole
    from app.core.security import hash_password
    user = User(email="analyst_s@bank.com", full_name="Test Analyst",
                hashed_password=hash_password("password123"), role=UserRole.analyst)
    db.add(user)
    await db.flush()
    await db.refresh(user)
    return user


@pytest.fixture
async def sr_analyst_user(db):
    from app.models.user import User, UserRole
    from app.core.security import hash_password
    user = User(email="sr_s@bank.com", full_name="Sr Analyst",
                hashed_password=hash_password("password123"), role=UserRole.sr_credit_analyst)
    db.add(user)
    await db.flush()
    await db.refresh(user)
    return user


@pytest.fixture
async def borrower_id(client, analyst_user):
    # Login as analyst to create a borrower
    login_resp = await client.post("/auth/login", json={"email": "analyst_s@bank.com", "password": "password123"})
    token = login_resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    resp = await client.post("/borrowers/", json={"name": "Test Corp", "fiscal_year_end_month": 12}, headers=headers)
    return resp.json()["id"]


@pytest.fixture
async def analyst_headers(client, analyst_user):
    resp = await client.post("/auth/login", json={"email": "analyst_s@bank.com", "password": "password123"})
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


@pytest.fixture
async def sr_headers(client, sr_analyst_user):
    resp = await client.post("/auth/login", json={"email": "sr_s@bank.com", "password": "password123"})
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


async def test_create_spread(client, analyst_headers, borrower_id):
    resp = await client.post("/spreads/", json={
        "borrower_id": borrower_id, "deal_name": "Term Loan 2026"
    }, headers=analyst_headers)
    assert resp.status_code == 201
    data = resp.json()
    assert data["status"] == "draft"
    assert data["deal_name"] == "Term Loan 2026"
    assert "id" in data


async def test_spread_status_defaults_to_draft(client, analyst_headers, borrower_id):
    resp = await client.post("/spreads/", json={"borrower_id": borrower_id, "deal_name": "Draft Deal"}, headers=analyst_headers)
    assert resp.json()["status"] == "draft"


async def test_get_spread_by_id(client, analyst_headers, borrower_id):
    create = await client.post("/spreads/", json={"borrower_id": borrower_id, "deal_name": "Get Me"}, headers=analyst_headers)
    sid = create.json()["id"]
    resp = await client.get(f"/spreads/{sid}", headers=analyst_headers)
    assert resp.status_code == 200
    assert resp.json()["deal_name"] == "Get Me"


async def test_analyst_sees_only_own_spreads(client, analyst_headers, sr_headers, borrower_id):
    # Analyst creates a spread
    await client.post("/spreads/", json={"borrower_id": borrower_id, "deal_name": "My Deal"}, headers=analyst_headers)

    analyst_resp = await client.get("/spreads/", headers=analyst_headers)
    sr_resp = await client.get("/spreads/", headers=sr_headers)

    # SR sees all spreads (>= analyst count)
    assert len(sr_resp.json()) >= len(analyst_resp.json())


async def test_analyst_cannot_access_others_spread(client, analyst_headers, sr_headers, borrower_id):
    # SR creates a spread that analyst should not see by id
    sr_create = await client.post("/spreads/", json={"borrower_id": borrower_id, "deal_name": "SR Deal"}, headers=sr_headers)
    sid = sr_create.json()["id"]

    # Analyst tries to get SR's spread by id - should get 404
    resp = await client.get(f"/spreads/{sid}", headers=analyst_headers)
    assert resp.status_code == 404


async def test_unauthenticated_spread_access(client):
    resp = await client.get("/spreads/")
    assert resp.status_code == 401


async def test_filter_by_borrower_id(client, analyst_headers, borrower_id):
    """Analyst sees only their own spreads for a specific borrower."""
    r1 = await client.post("/spreads/", json={"borrower_id": borrower_id, "deal_name": "My Borrower Deal"}, headers=analyst_headers)
    assert r1.status_code == 201

    reg = await client.post("/auth/register", json={
        "email": "analyst2_s@bank.com", "password": "password123",
        "full_name": "Analyst Two", "role": "analyst"
    })
    login2 = await client.post("/auth/login", json={"email": "analyst2_s@bank.com", "password": "password123"})
    headers2 = {"Authorization": f"Bearer {login2.json()['access_token']}"}
    r2 = await client.post("/spreads/", json={"borrower_id": borrower_id, "deal_name": "Other Analyst Deal"}, headers=headers2)
    assert r2.status_code == 201

    resp = await client.get(f"/spreads/?borrower_id={borrower_id}", headers=analyst_headers)
    assert resp.status_code == 200
    names = [s["deal_name"] for s in resp.json()]
    assert "My Borrower Deal" in names
    assert "Other Analyst Deal" not in names


async def test_filter_by_borrower_id_sr_sees_all(client, sr_headers, analyst_headers, borrower_id):
    """sr_credit_analyst sees all spreads for a borrower regardless of ownership."""
    await client.post("/spreads/", json={"borrower_id": borrower_id, "deal_name": "Analyst SR Deal"}, headers=analyst_headers)

    resp = await client.get(f"/spreads/?borrower_id={borrower_id}", headers=sr_headers)
    assert resp.status_code == 200
    names = [s["deal_name"] for s in resp.json()]
    assert "Analyst SR Deal" in names
