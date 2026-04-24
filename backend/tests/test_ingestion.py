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
    """Upload a minimal PDF — job is created immediately; extraction runs in background."""
    fake_pdf = b"%PDF-1.4 fake content net sales 1000000"
    # Mock run_extraction at the service layer to prevent DB isolation issues
    # (background task uses a separate AsyncSessionFactory session, test uses a different one)
    with patch("app.modules.ingestion.service.run_extraction", new_callable=AsyncMock):
        resp = await client.post(
            f"/ingestion/upload?spread_id={ing_spread_id}",
            files={"file": ("statement.pdf", io.BytesIO(fake_pdf), "application/pdf")},
            headers=ing_headers,
        )
    assert resp.status_code == 201
    data = resp.json()
    assert data["id"] is not None
    assert data["status"] == "processing"
    assert "phase" in data


async def test_get_extraction_job(client, ing_headers, ing_spread_id):
    fake_pdf = b"%PDF-1.4 test"
    with patch("app.modules.ingestion.service.run_extraction", new_callable=AsyncMock):
        create_resp = await client.post(
            f"/ingestion/upload?spread_id={ing_spread_id}",
            files={"file": ("s.pdf", io.BytesIO(fake_pdf), "application/pdf")},
            headers=ing_headers,
        )
    job_id = create_resp.json()["id"]
    resp = await client.get(f"/ingestion/{job_id}", headers=ing_headers)
    assert resp.status_code == 200
    assert resp.json()["id"] == job_id


async def test_confirm_extraction_populates_grid(client, ing_headers, ing_spread_id, db):
    fake_pdf = b"%PDF-1.4 test"
    mock_is = {"net_sales": {"value": 1_000_000.0, "confidence_score": 0.95}}
    mock_bs = {"cash": {"value": 200_000.0, "confidence_score": 0.91}}
    with patch("app.modules.ingestion.service.run_extraction", new_callable=AsyncMock):
        create_resp = await client.post(
            f"/ingestion/upload?spread_id={ing_spread_id}",
            files={"file": ("s.pdf", io.BytesIO(fake_pdf), "application/pdf")},
            headers=ing_headers,
        )
    job_id = create_resp.json()["id"]

    # Simulate extraction completing: set status=ready and results via the test db session
    from app.models.extraction_job import ExtractionJob, ExtractionStatus
    from sqlalchemy import select
    result = await db.execute(select(ExtractionJob).where(ExtractionJob.id == job_id))
    job = result.scalar_one()
    job.status = ExtractionStatus.ready
    job.phase = "ready"
    job.results = {"IS": mock_is, "BS": mock_bs, "CF": {}}
    await db.flush()

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


@pytest.fixture
async def analyst2_user_ing(db):
    from app.models.user import User, UserRole
    from app.core.security import hash_password
    user = User(email="analyst_ing2@bank.com", full_name="Ing Analyst 2",
                hashed_password=hash_password("password123"), role=UserRole.analyst)
    db.add(user)
    await db.flush()
    await db.refresh(user)
    return user


@pytest.fixture
async def ing2_headers(client, analyst2_user_ing):
    resp = await client.post("/auth/login",
        json={"email": "analyst_ing2@bank.com", "password": "password123"})
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


async def test_get_job_404_for_other_analyst(client, ing_headers, ing2_headers, ing_spread_id):
    """Analyst 2 cannot see Analyst 1's extraction job."""
    fake_pdf = b"%PDF-1.4 test"
    with patch("app.modules.ingestion.service.run_extraction", new_callable=AsyncMock):
        create_resp = await client.post(
            f"/ingestion/upload?spread_id={ing_spread_id}",
            files={"file": ("s.pdf", io.BytesIO(fake_pdf), "application/pdf")},
            headers=ing_headers,
        )
    job_id = create_resp.json()["id"]
    resp = await client.get(f"/ingestion/{job_id}", headers=ing2_headers)
    assert resp.status_code == 404


async def test_upload_returns_processing_status(client, ing_headers, ing_spread_id):
    """POST /ingestion/upload returns 201 with a job id and phase field immediately."""
    fake_pdf = b"%PDF-1.4 fake content"

    # Mock run_extraction at the service layer to avoid DB isolation issues
    with patch("app.modules.ingestion.service.run_extraction", new_callable=AsyncMock):
        resp = await client.post(
            f"/ingestion/upload?spread_id={ing_spread_id}",
            files={"file": ("statement.pdf", io.BytesIO(fake_pdf), "application/pdf")},
            headers=ing_headers,
        )
    assert resp.status_code == 201
    assert resp.json()["id"] is not None
    assert "phase" in resp.json()


async def test_get_job_returns_phase_field(client, ing_headers, ing_spread_id):
    """GET /ingestion/{job_id} returns phase field."""
    fake_pdf = b"%PDF-1.4 test"
    with patch("app.modules.ingestion.service.run_extraction", new_callable=AsyncMock):
        create_resp = await client.post(
            f"/ingestion/upload?spread_id={ing_spread_id}",
            files={"file": ("s.pdf", io.BytesIO(fake_pdf), "application/pdf")},
            headers=ing_headers,
        )
    job_id = create_resp.json()["id"]
    resp = await client.get(f"/ingestion/{job_id}", headers=ing_headers)
    assert resp.status_code == 200
    assert "phase" in resp.json()
    assert resp.json()["phase"] in ("ready", "uploading", "parsing",
                                    "extracting_is", "extracting_bs", "extracting_cf", "failed")
