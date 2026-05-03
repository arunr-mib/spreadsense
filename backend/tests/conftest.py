import asyncio

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from app.main import app as fastapi_app
from app.database import Base, get_db
import app.models  # noqa: F401 — ensure all models are registered with Base

import os
# Use a dedicated test database so tests never touch production data.
# Inside the container: postgres:5432/fst_test_db
# From the host (for IDE runners): localhost:5434/fst_test_db
TEST_DB_URL = os.getenv(
    "TEST_DATABASE_URL",
    "postgresql+asyncpg://fst_user:fst_pass@postgres:5432/fst_test_db",
)


@pytest.fixture(scope="session")
def event_loop():
    """Use a single event loop for the entire session to avoid cross-loop asyncpg errors."""
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture(scope="session")
async def engine():
    _engine = create_async_engine(TEST_DB_URL, echo=False)
    async with _engine.begin() as conn:
        # Drop all first to ensure a clean slate (handles interrupted prior runs)
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    yield _engine
    async with _engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await _engine.dispose()


@pytest_asyncio.fixture
async def db(engine):
    """Per-test session wrapped in a connection-level transaction.

    Using join_transaction_mode="create_savepoint" means any session.commit()
    calls inside application code (e.g. service.create_job) release a savepoint
    rather than committing to disk. The outer connection transaction is always
    rolled back at teardown, giving true per-test isolation.
    """
    async with engine.connect() as conn:
        await conn.begin()
        session = AsyncSession(
            bind=conn,
            expire_on_commit=False,
            join_transaction_mode="create_savepoint",
        )
        try:
            yield session
        finally:
            await session.close()
            await conn.rollback()


@pytest_asyncio.fixture
async def client(db):
    """HTTP test client that shares the same DB session as the db fixture."""

    async def override_get_db():
        yield db

    fastapi_app.dependency_overrides[get_db] = override_get_db
    async with AsyncClient(transport=ASGITransport(app=fastapi_app), base_url="http://test") as c:
        yield c
    fastapi_app.dependency_overrides.clear()
