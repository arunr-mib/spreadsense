import pytest
from httpx import AsyncClient


@pytest.fixture
async def analyst_user(db):
    from app.models.user import User, UserRole
    from app.core.security import hash_password
    user = User(email="analyst@bank.com", full_name="Test Analyst",
                hashed_password=hash_password("password123"), role=UserRole.analyst)
    db.add(user)
    await db.flush()
    await db.refresh(user)
    return user


@pytest.fixture
async def sr_analyst_user(db):
    from app.models.user import User, UserRole
    from app.core.security import hash_password
    user = User(email="sr@bank.com", full_name="Sr Analyst",
                hashed_password=hash_password("password123"), role=UserRole.sr_credit_analyst)
    db.add(user)
    await db.flush()
    await db.refresh(user)
    return user


async def test_login_success(client, analyst_user):
    resp = await client.post("/auth/login", json={"email": "analyst@bank.com", "password": "password123"})
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert data["role"] == "analyst"


async def test_login_wrong_password(client, analyst_user):
    resp = await client.post("/auth/login", json={"email": "analyst@bank.com", "password": "wrong"})
    assert resp.status_code == 401


async def test_protected_route_no_token(client):
    resp = await client.get("/borrowers/")
    assert resp.status_code == 401


async def test_protected_route_with_token(client, analyst_user):
    login = await client.post("/auth/login", json={"email": "analyst@bank.com", "password": "password123"})
    token = login.json()["access_token"]
    resp = await client.get("/borrowers/", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200


async def test_analyst_cannot_see_other_users_spreads(client, analyst_user, sr_analyst_user):
    sr_login = await client.post("/auth/login", json={"email": "sr@bank.com", "password": "password123"})
    assert sr_login.json()["role"] == "sr_credit_analyst"
    analyst_login = await client.post("/auth/login", json={"email": "analyst@bank.com", "password": "password123"})
    assert analyst_login.json()["role"] == "analyst"
