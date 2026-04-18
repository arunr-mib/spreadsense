# backend/tests/test_ingestion.py
import pytest
import io
from unittest.mock import patch, AsyncMock


@pytest.fixture
async def analyst_user_ing(db):
    from app.models.user import User, UserRole
    from app.core.security import hash_password
    user = User(email="analyst_ing@bank.com", full_name="Ing Analyst",
                hashed_password=hash_password("password123"), role=UserRole.analyst)
    db.add(user)
    await db.flush()
    await db.refresh(user)
    return user


@pytest.fixture
async def ing_headers(client, analyst_user_ing):
    resp = await client.post("/auth/login",
        json={"email": "analyst_ing@bank.com", "password": "password123"})
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


@pytest.fixture
async def ing_spread_id(client, ing_headers, analyst_user_ing, db):
    from app.models.borrower import Borrower
    b = Borrower(name="Ing Corp", fiscal_year_end_month=12, created_by=analyst_user_ing.id)
    db.add(b)
    await db.flush()
    await db.refresh(b)
    resp = await client.post("/spreads/",
        json={"borrower_id": b.id, "deal_name": "Ing Deal"}, headers=ing_headers)
    return resp.json()["id"]


async def test_upload_creates_extraction_job(client, ing_headers, ing_spread_id):
    """Upload a minimal PDF (bytes) — Claude call is mocked."""
    fake_pdf = b"%PDF-1.4 fake content net sales 1000000"
    mock_result = {
        "IS": {
            "net_sales": {"value": 1_000_000.0, "confidence_score": 0.95},
            "cost_of_goods_sold": {"value": 600_000.0, "confidence_score": 0.88},
            "interest_expense": {"value": 50_000.0, "confidence_score": 0.60},
        }
    }
    with patch("app.modules.ingestion.claude_extractor.extract_financials",
               new_callable=AsyncMock, return_value=mock_result):
        resp = await client.post(
            f"/ingestion/upload?spread_id={ing_spread_id}",
            files={"file": ("statement.pdf", io.BytesIO(fake_pdf), "application/pdf")},
            headers=ing_headers,
        )
    assert resp.status_code == 201
    data = resp.json()
    assert data["status"] == "ready"
    assert "IS" in data["results"]
    assert data["results"]["IS"]["net_sales"]["confidence_score"] == 0.95


async def test_get_extraction_job(client, ing_headers, ing_spread_id):
    fake_pdf = b"%PDF-1.4 test"
    mock_result = {"IS": {"net_sales": {"value": 500_000.0, "confidence_score": 0.90}}}
    with patch("app.modules.ingestion.claude_extractor.extract_financials",
               new_callable=AsyncMock, return_value=mock_result):
        create_resp = await client.post(
            f"/ingestion/upload?spread_id={ing_spread_id}",
            files={"file": ("s.pdf", io.BytesIO(fake_pdf), "application/pdf")},
            headers=ing_headers,
        )
    job_id = create_resp.json()["id"]
    resp = await client.get(f"/ingestion/{job_id}", headers=ing_headers)
    assert resp.status_code == 200
    assert resp.json()["id"] == job_id


async def test_confirm_extraction_populates_grid(client, ing_headers, ing_spread_id):
    fake_pdf = b"%PDF-1.4 test"
    mock_result = {
        "IS": {
            "net_sales": {"value": 1_000_000.0, "confidence_score": 0.95},
        },
        "BS": {
            "cash": {"value": 200_000.0, "confidence_score": 0.91},
        },
    }
    with patch("app.modules.ingestion.claude_extractor.extract_financials",
               new_callable=AsyncMock, return_value=mock_result):
        create_resp = await client.post(
            f"/ingestion/upload?spread_id={ing_spread_id}",
            files={"file": ("s.pdf", io.BytesIO(fake_pdf), "application/pdf")},
            headers=ing_headers,
        )
    job_id = create_resp.json()["id"]

    # Create a period to populate
    period_resp = await client.post(
        f"/spreads/{ing_spread_id}/periods",
        json={"fiscal_year": 2023, "period_type": "actual"},
        headers=ing_headers,
    )
    period_id = period_resp.json()["id"]

    confirm_resp = await client.post(
        f"/ingestion/{job_id}/confirm",
        json={"period_id": period_id, "overrides": {}},
        headers=ing_headers,
    )
    assert confirm_resp.status_code == 200
    assert confirm_resp.json()["status"] == "confirmed"
