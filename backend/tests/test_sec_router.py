import pytest
from unittest.mock import AsyncMock, patch
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.modules.sec_fetcher.exceptions import (
    TickerNotFoundError,
    FilingNotFoundError,
    RateLimitedError,
    RenderError,
)


@pytest.fixture
def auth_override():
    """Bypass auth for these tests."""
    from app.core.deps import get_current_user
    from app.models.user import User, UserRole

    async def _user():
        return User(id=1, email="t@x.com", full_name="Test User", hashed_password="x", role=UserRole.analyst, is_active=True)

    app.dependency_overrides[get_current_user] = _user
    yield
    app.dependency_overrides.pop(get_current_user, None)


async def test_fetch_route_returns_pdf_with_filename_header(auth_override):
    fake = (b"%PDF-1.4 hello", "MSFT_10-K_2024-07-30.pdf", 187)
    with patch("app.modules.sec_fetcher.router.fetch_filing", new=AsyncMock(return_value=fake)):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            r = await ac.get("/sec/fetch", params={"ticker": "msft", "form": "10-K"})
    assert r.status_code == 200
    assert r.headers["content-type"] == "application/pdf"
    assert "MSFT_10-K_2024-07-30.pdf" in r.headers["content-disposition"]
    assert r.headers["x-pdf-pages"] == "187"
    assert r.content.startswith(b"%PDF-")


async def test_fetch_route_returns_404_for_unknown_ticker(auth_override):
    with patch("app.modules.sec_fetcher.router.fetch_filing", new=AsyncMock(side_effect=TickerNotFoundError("zzzz"))):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            r = await ac.get("/sec/fetch", params={"ticker": "zzzz", "form": "10-K"})
    assert r.status_code == 404
    assert "zzzz" in r.json()["detail"].lower()


async def test_fetch_route_returns_404_when_no_matching_filing(auth_override):
    with patch("app.modules.sec_fetcher.router.fetch_filing", new=AsyncMock(side_effect=FilingNotFoundError("none"))):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            r = await ac.get("/sec/fetch", params={"ticker": "msft", "form": "10-Q"})
    assert r.status_code == 404


async def test_fetch_route_returns_503_when_rate_limited(auth_override):
    with patch("app.modules.sec_fetcher.router.fetch_filing", new=AsyncMock(side_effect=RateLimitedError("nope"))):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            r = await ac.get("/sec/fetch", params={"ticker": "msft", "form": "10-K"})
    assert r.status_code == 503


async def test_fetch_route_returns_502_with_source_url_on_render_error(auth_override):
    err = RenderError("boom", source_url="https://www.sec.gov/x.htm")
    with patch("app.modules.sec_fetcher.router.fetch_filing", new=AsyncMock(side_effect=err)):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            r = await ac.get("/sec/fetch", params={"ticker": "msft", "form": "10-K"})
    assert r.status_code == 502
    assert "sec.gov" in r.json()["detail"]


async def test_fetch_route_rejects_invalid_form(auth_override):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        r = await ac.get("/sec/fetch", params={"ticker": "msft", "form": "8-K"})
    assert r.status_code == 422
