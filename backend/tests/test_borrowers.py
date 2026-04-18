import pytest


@pytest.fixture
async def analyst_user(db):
    from app.models.user import User, UserRole
    from app.core.security import hash_password
    user = User(email="analyst_b@bank.com", full_name="Test Analyst",
                hashed_password=hash_password("password123"), role=UserRole.analyst)
    db.add(user)
    await db.flush()
    await db.refresh(user)
    return user


@pytest.fixture
async def auth_headers(client, analyst_user):
    resp = await client.post("/auth/login", json={"email": "analyst_b@bank.com", "password": "password123"})
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


async def test_create_borrower(client, auth_headers):
    resp = await client.post("/borrowers/", json={
        "name": "Acme Corp", "tax_id": "12-3456789",
        "sic_code": "3599", "fiscal_year_end_month": 12, "industry": "Manufacturing"
    }, headers=auth_headers)
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "Acme Corp"
    assert "id" in data


async def test_list_borrowers(client, auth_headers):
    await client.post("/borrowers/", json={"name": "Borrower A", "fiscal_year_end_month": 12}, headers=auth_headers)
    await client.post("/borrowers/", json={"name": "Borrower B", "fiscal_year_end_month": 6}, headers=auth_headers)
    resp = await client.get("/borrowers/", headers=auth_headers)
    assert resp.status_code == 200
    assert len(resp.json()) >= 2


async def test_get_borrower(client, auth_headers):
    create = await client.post("/borrowers/", json={"name": "Target Corp", "fiscal_year_end_month": 12}, headers=auth_headers)
    bid = create.json()["id"]
    resp = await client.get(f"/borrowers/{bid}", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["name"] == "Target Corp"


async def test_update_borrower(client, auth_headers):
    create = await client.post("/borrowers/", json={"name": "Old Name", "fiscal_year_end_month": 12}, headers=auth_headers)
    bid = create.json()["id"]
    resp = await client.patch(f"/borrowers/{bid}", json={"name": "New Name"}, headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["name"] == "New Name"


async def test_unauthenticated_borrower_access(client):
    resp = await client.get("/borrowers/")
    assert resp.status_code == 401


async def test_get_nonexistent_borrower(client, auth_headers):
    resp = await client.get("/borrowers/99999", headers=auth_headers)
    assert resp.status_code == 404
