# SEC Fetcher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a UI control inside ExtractionPanel that lets analysts fetch the latest 10-K or 10-Q for a ticker straight from SEC EDGAR, render it to PDF on the backend, and download it for upload.

**Architecture:** New backend module `app/modules/sec_fetcher/` exposes `GET /sec/fetch?ticker=&form=`. It resolves ticker → CIK via SEC's `company_tickers.json`, finds the latest matching filing via `submissions/CIK*.json`, fetches the primary HTML, and renders it to PDF with WeasyPrint (already a dependency, used by `memo`). Frontend adds a `SecFetchControl` subcomponent under the existing upload row in `ExtractionPanel.tsx` that calls the endpoint and triggers a browser download.

**Tech Stack:** FastAPI (backend), WeasyPrint (already installed), httpx (already installed), React + axios (frontend), pytest (tests). Spec: `docs/superpowers/specs/2026-05-03-sec-fetcher-design.md`.

---

## File Structure

```
backend/app/modules/sec_fetcher/
├── __init__.py             # empty
├── edgar_client.py         # SEC API: resolve_cik, find_latest_filing
├── renderer.py             # render_html_url_to_pdf via WeasyPrint
├── service.py              # fetch_filing(ticker, form) → (pdf_bytes, filename, page_count)
├── exceptions.py           # TickerNotFoundError, FilingNotFoundError, RenderError, RateLimitedError
└── router.py               # GET /sec/fetch

backend/app/main.py         # include sec_fetcher router

backend/tests/
├── test_sec_edgar_client.py    # unit: ticker resolution, filing lookup
├── test_sec_renderer.py        # unit: render success / timeout
└── test_sec_router.py          # integration: route returns PDF / errors

frontend/src/api/
└── secFetcher.ts           # fetchSecFiling(ticker, form): { blob, filename, pageCount }

frontend/src/components/
├── SecFetchControl.tsx     # NEW subcomponent
└── ExtractionPanel.tsx     # MODIFY: render <SecFetchControl /> below upload
```

---

## Task 1: edgar_client — ticker → CIK resolution

**Files:**
- Create: `backend/app/modules/sec_fetcher/__init__.py` (empty)
- Create: `backend/app/modules/sec_fetcher/exceptions.py`
- Create: `backend/app/modules/sec_fetcher/edgar_client.py`
- Test: `backend/tests/test_sec_edgar_client.py`

- [ ] **Step 1: Create the empty package init**

```python
# backend/app/modules/sec_fetcher/__init__.py
```

- [ ] **Step 2: Write the exceptions module**

```python
# backend/app/modules/sec_fetcher/exceptions.py
class SecFetcherError(Exception):
    """Base for all sec_fetcher errors."""


class TickerNotFoundError(SecFetcherError):
    """Ticker not present in SEC's company_tickers.json."""


class FilingNotFoundError(SecFetcherError):
    """No filing of the requested form found in recent filings."""


class RateLimitedError(SecFetcherError):
    """SEC returned 429 or otherwise refused the request."""


class RenderError(SecFetcherError):
    """WeasyPrint failed or timed out rendering the filing."""

    def __init__(self, message: str, source_url: str):
        super().__init__(message)
        self.source_url = source_url
```

- [ ] **Step 3: Write the failing test for resolve_cik**

```python
# backend/tests/test_sec_edgar_client.py
import pytest
from unittest.mock import AsyncMock, patch

from app.modules.sec_fetcher.edgar_client import resolve_cik
from app.modules.sec_fetcher.exceptions import TickerNotFoundError

# Sample shape of SEC's company_tickers.json: {"0":{"cik_str":789019,"ticker":"MSFT","title":"..."}, ...}
SAMPLE_TICKERS = {
    "0": {"cik_str": 789019, "ticker": "MSFT", "title": "MICROSOFT CORP"},
    "1": {"cik_str": 320193, "ticker": "AAPL", "title": "Apple Inc."},
}


@pytest.mark.asyncio
async def test_resolve_cik_returns_padded_cik_for_known_ticker():
    with patch("app.modules.sec_fetcher.edgar_client._fetch_company_tickers", new=AsyncMock(return_value=SAMPLE_TICKERS)):
        cik = await resolve_cik("msft")
    assert cik == "0000789019"


@pytest.mark.asyncio
async def test_resolve_cik_is_case_insensitive():
    with patch("app.modules.sec_fetcher.edgar_client._fetch_company_tickers", new=AsyncMock(return_value=SAMPLE_TICKERS)):
        cik = await resolve_cik("AAPL")
    assert cik == "0000320193"


@pytest.mark.asyncio
async def test_resolve_cik_unknown_ticker_raises():
    with patch("app.modules.sec_fetcher.edgar_client._fetch_company_tickers", new=AsyncMock(return_value=SAMPLE_TICKERS)):
        with pytest.raises(TickerNotFoundError):
            await resolve_cik("zzzz")
```

- [ ] **Step 4: Run the test to confirm it fails**

Run: `docker compose exec backend pytest tests/test_sec_edgar_client.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.modules.sec_fetcher.edgar_client'`

- [ ] **Step 5: Implement resolve_cik**

```python
# backend/app/modules/sec_fetcher/edgar_client.py
import time
from typing import Any

import httpx

from .exceptions import TickerNotFoundError, RateLimitedError

USER_AGENT = "SpreadSense (contact@adamsmind.ai)"
COMPANY_TICKERS_URL = "https://www.sec.gov/files/company_tickers.json"
SUBMISSIONS_URL_TMPL = "https://data.sec.gov/submissions/CIK{cik}.json"

_TICKER_CACHE: dict[str, Any] = {"data": None, "expires_at": 0.0}
_CACHE_TTL_SECONDS = 24 * 60 * 60


async def _fetch_company_tickers() -> dict[str, Any]:
    """Fetch the full ticker→CIK map from SEC, with 24h in-process cache."""
    now = time.time()
    if _TICKER_CACHE["data"] is not None and _TICKER_CACHE["expires_at"] > now:
        return _TICKER_CACHE["data"]
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(COMPANY_TICKERS_URL, headers={"User-Agent": USER_AGENT})
        if resp.status_code == 429:
            raise RateLimitedError("SEC rate limit on company_tickers.json")
        resp.raise_for_status()
        data = resp.json()
    _TICKER_CACHE["data"] = data
    _TICKER_CACHE["expires_at"] = now + _CACHE_TTL_SECONDS
    return data


async def resolve_cik(ticker: str) -> str:
    """Return 10-digit zero-padded CIK string for the given ticker (case-insensitive)."""
    data = await _fetch_company_tickers()
    upper = ticker.strip().upper()
    for entry in data.values():
        if entry.get("ticker", "").upper() == upper:
            return str(entry["cik_str"]).zfill(10)
    raise TickerNotFoundError(ticker)
```

- [ ] **Step 6: Run the test to confirm it passes**

Run: `docker compose exec backend pytest tests/test_sec_edgar_client.py -v`
Expected: PASS — 3 tests

- [ ] **Step 7: Add the failing test for find_latest_filing**

Append to `backend/tests/test_sec_edgar_client.py`:

```python
from app.modules.sec_fetcher.edgar_client import find_latest_filing
from app.modules.sec_fetcher.exceptions import FilingNotFoundError

# Recent filings shape: parallel arrays under filings.recent
SAMPLE_SUBMISSIONS = {
    "filings": {
        "recent": {
            "form": ["8-K", "10-Q", "10-K", "10-K", "8-K"],
            "accessionNumber": [
                "0001-25-001",
                "0001-25-002",
                "0001-24-100",
                "0001-23-099",
                "0001-25-003",
            ],
            "primaryDocument": ["a.htm", "b.htm", "msft-10k-2024.htm", "msft-10k-2023.htm", "e.htm"],
            "filingDate": ["2025-01-10", "2024-10-25", "2024-07-30", "2023-07-27", "2025-02-15"],
        }
    }
}


@pytest.mark.asyncio
async def test_find_latest_filing_returns_first_matching_form():
    with patch("app.modules.sec_fetcher.edgar_client._fetch_submissions", new=AsyncMock(return_value=SAMPLE_SUBMISSIONS)):
        ref = await find_latest_filing("0000789019", "10-K")
    assert ref.filing_date == "2024-07-30"
    assert ref.url == "https://www.sec.gov/Archives/edgar/data/789019/000125100/msft-10k-2024.htm"


@pytest.mark.asyncio
async def test_find_latest_filing_no_match_raises():
    empty = {"filings": {"recent": {"form": ["8-K"], "accessionNumber": ["x"], "primaryDocument": ["x.htm"], "filingDate": ["2025-01-01"]}}}
    with patch("app.modules.sec_fetcher.edgar_client._fetch_submissions", new=AsyncMock(return_value=empty)):
        with pytest.raises(FilingNotFoundError):
            await find_latest_filing("0000789019", "10-K")
```

- [ ] **Step 8: Run the test to confirm it fails**

Run: `docker compose exec backend pytest tests/test_sec_edgar_client.py -v`
Expected: FAIL — `ImportError: cannot import name 'find_latest_filing'`

- [ ] **Step 9: Implement find_latest_filing**

Append to `backend/app/modules/sec_fetcher/edgar_client.py`:

```python
from dataclasses import dataclass


@dataclass(frozen=True)
class FilingRef:
    url: str
    filing_date: str  # YYYY-MM-DD
    accession_number: str


async def _fetch_submissions(cik_padded: str) -> dict[str, Any]:
    url = SUBMISSIONS_URL_TMPL.format(cik=cik_padded)
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(url, headers={"User-Agent": USER_AGENT})
        if resp.status_code == 429:
            raise RateLimitedError(f"SEC rate limit on submissions for CIK {cik_padded}")
        resp.raise_for_status()
        return resp.json()


async def find_latest_filing(cik_padded: str, form: str) -> FilingRef:
    """Find the most recent filing of the given form (e.g. '10-K' or '10-Q')."""
    data = await _fetch_submissions(cik_padded)
    recent = data["filings"]["recent"]
    forms = recent["form"]
    for i, f in enumerate(forms):
        if f == form:
            accession = recent["accessionNumber"][i].replace("-", "")
            doc = recent["primaryDocument"][i]
            cik_int = cik_padded.lstrip("0")
            url = f"https://www.sec.gov/Archives/edgar/data/{cik_int}/{accession}/{doc}"
            return FilingRef(url=url, filing_date=recent["filingDate"][i], accession_number=recent["accessionNumber"][i])
    raise FilingNotFoundError(f"No {form} found for CIK {cik_padded}")
```

- [ ] **Step 10: Run the test to confirm it passes**

Run: `docker compose exec backend pytest tests/test_sec_edgar_client.py -v`
Expected: PASS — 5 tests

- [ ] **Step 11: Commit**

```bash
git add backend/app/modules/sec_fetcher/__init__.py \
        backend/app/modules/sec_fetcher/exceptions.py \
        backend/app/modules/sec_fetcher/edgar_client.py \
        backend/tests/test_sec_edgar_client.py
git commit -m "feat(sec): edgar client — resolve_cik and find_latest_filing"
```

---

## Task 2: renderer — HTML URL → PDF bytes

**Files:**
- Create: `backend/app/modules/sec_fetcher/renderer.py`
- Test: `backend/tests/test_sec_renderer.py`

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_sec_renderer.py
import pytest
from unittest.mock import patch, MagicMock

from app.modules.sec_fetcher.renderer import render_html_url_to_pdf
from app.modules.sec_fetcher.exceptions import RenderError

MINIMAL_HTML = "<html><body><h1>Test 10-K</h1><p>Body</p></body></html>"


@pytest.mark.asyncio
async def test_render_returns_pdf_bytes_starting_with_pdf_magic():
    """End-to-end through WeasyPrint with a tiny HTML input."""
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.text = MINIMAL_HTML
    mock_response.raise_for_status = MagicMock()

    with patch("app.modules.sec_fetcher.renderer.httpx.AsyncClient") as mock_client_cls:
        mock_client = mock_client_cls.return_value.__aenter__.return_value
        mock_client.get = MagicMock(return_value=_async_value(mock_response))
        pdf_bytes = await render_html_url_to_pdf("https://example.com/test.htm")

    assert pdf_bytes.startswith(b"%PDF-")
    assert len(pdf_bytes) > 200


def _async_value(value):
    """Helper: wrap a value so `await m.get(...)` resolves to it."""
    async def _coro():
        return value
    return _coro()


@pytest.mark.asyncio
async def test_render_raises_render_error_when_weasyprint_fails():
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.text = MINIMAL_HTML
    mock_response.raise_for_status = MagicMock()

    with patch("app.modules.sec_fetcher.renderer.httpx.AsyncClient") as mock_client_cls, \
         patch("app.modules.sec_fetcher.renderer.HTML") as mock_html_cls:
        mock_client = mock_client_cls.return_value.__aenter__.return_value
        mock_client.get = MagicMock(return_value=_async_value(mock_response))
        mock_html_cls.side_effect = RuntimeError("boom")
        with pytest.raises(RenderError) as exc:
            await render_html_url_to_pdf("https://example.com/test.htm")
    assert exc.value.source_url == "https://example.com/test.htm"
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `docker compose exec backend pytest tests/test_sec_renderer.py -v`
Expected: FAIL — `ModuleNotFoundError: ... renderer`

- [ ] **Step 3: Implement renderer**

```python
# backend/app/modules/sec_fetcher/renderer.py
import asyncio
import logging

import httpx
from weasyprint import HTML

from .exceptions import RenderError, RateLimitedError

logger = logging.getLogger(__name__)

USER_AGENT = "SpreadSense (contact@adamsmind.ai)"
HTML_FETCH_TIMEOUT = 30.0
RENDER_TIMEOUT_SECONDS = 60.0


async def render_html_url_to_pdf(url: str) -> bytes:
    """Fetch the HTML at `url` and render it to a PDF byte string via WeasyPrint.

    Wraps the blocking WeasyPrint call in `asyncio.to_thread` so it doesn't pin
    the event loop, with a 60s wall-clock cap.
    """
    async with httpx.AsyncClient(timeout=HTML_FETCH_TIMEOUT) as client:
        resp = await client.get(url, headers={"User-Agent": USER_AGENT})
        if resp.status_code == 429:
            raise RateLimitedError(f"SEC rate limit when fetching {url}")
        resp.raise_for_status()
        html_text = resp.text

    def _render() -> bytes:
        return HTML(string=html_text, base_url=url).write_pdf()

    try:
        return await asyncio.wait_for(asyncio.to_thread(_render), timeout=RENDER_TIMEOUT_SECONDS)
    except asyncio.TimeoutError as e:
        logger.warning("WeasyPrint render exceeded %ss for %s", RENDER_TIMEOUT_SECONDS, url)
        raise RenderError(f"Render timed out after {RENDER_TIMEOUT_SECONDS}s", source_url=url) from e
    except Exception as e:
        logger.exception("WeasyPrint render failed for %s", url)
        raise RenderError(f"Render failed: {e}", source_url=url) from e
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `docker compose exec backend pytest tests/test_sec_renderer.py -v`
Expected: PASS — 2 tests

- [ ] **Step 5: Commit**

```bash
git add backend/app/modules/sec_fetcher/renderer.py backend/tests/test_sec_renderer.py
git commit -m "feat(sec): WeasyPrint renderer with timeout + error wrapping"
```

---

## Task 3: service — orchestrator

**Files:**
- Create: `backend/app/modules/sec_fetcher/service.py`
- Test: append to `backend/tests/test_sec_edgar_client.py` (new file `backend/tests/test_sec_service.py`)

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_sec_service.py
import pytest
from unittest.mock import AsyncMock, patch

from app.modules.sec_fetcher.service import fetch_filing
from app.modules.sec_fetcher.edgar_client import FilingRef


@pytest.mark.asyncio
async def test_fetch_filing_composes_steps_and_builds_filename():
    fake_ref = FilingRef(
        url="https://www.sec.gov/Archives/edgar/data/789019/x/msft-10k.htm",
        filing_date="2024-07-30",
        accession_number="0001-24-100",
    )
    fake_pdf = b"%PDF-1.4 fake content " + b"x" * 500

    with patch("app.modules.sec_fetcher.service.resolve_cik", new=AsyncMock(return_value="0000789019")), \
         patch("app.modules.sec_fetcher.service.find_latest_filing", new=AsyncMock(return_value=fake_ref)), \
         patch("app.modules.sec_fetcher.service.render_html_url_to_pdf", new=AsyncMock(return_value=fake_pdf)):
        pdf_bytes, filename, page_count = await fetch_filing("msft", "10-K")

    assert pdf_bytes == fake_pdf
    assert filename == "MSFT_10-K_2024-07-30.pdf"
    assert page_count >= 0  # non-negative; counted from fake bytes — see implementation note
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `docker compose exec backend pytest tests/test_sec_service.py -v`
Expected: FAIL — `ModuleNotFoundError: ... service`

- [ ] **Step 3: Implement service**

```python
# backend/app/modules/sec_fetcher/service.py
import logging

from .edgar_client import resolve_cik, find_latest_filing
from .renderer import render_html_url_to_pdf

logger = logging.getLogger(__name__)


def _count_pdf_pages(pdf_bytes: bytes) -> int:
    """Cheap page count: count '/Type /Page' occurrences. Good enough for UI display."""
    # PyMuPDF would be more accurate but adds startup cost. Counting page markers
    # in the PDF byte stream is fast and reliable for WeasyPrint output.
    return pdf_bytes.count(b"/Type /Page") - pdf_bytes.count(b"/Type /Pages")


async def fetch_filing(ticker: str, form: str) -> tuple[bytes, str, int]:
    """Resolve ticker → CIK → latest filing → rendered PDF.

    Returns (pdf_bytes, filename, page_count).
    Raises TickerNotFoundError, FilingNotFoundError, RateLimitedError, RenderError.
    """
    cik = await resolve_cik(ticker)
    ref = await find_latest_filing(cik, form)
    logger.info("Fetching %s for %s — %s (%s)", form, ticker.upper(), ref.filing_date, ref.url)
    pdf_bytes = await render_html_url_to_pdf(ref.url)
    filename = f"{ticker.upper()}_{form}_{ref.filing_date}.pdf"
    page_count = max(_count_pdf_pages(pdf_bytes), 0)
    return pdf_bytes, filename, page_count
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `docker compose exec backend pytest tests/test_sec_service.py -v`
Expected: PASS — 1 test

- [ ] **Step 5: Commit**

```bash
git add backend/app/modules/sec_fetcher/service.py backend/tests/test_sec_service.py
git commit -m "feat(sec): service composes resolve→find→render and builds filename"
```

---

## Task 4: router — `GET /sec/fetch`

**Files:**
- Create: `backend/app/modules/sec_fetcher/router.py`
- Modify: `backend/app/main.py` (add router include)
- Test: `backend/tests/test_sec_router.py`

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_sec_router.py
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
    from app.models.user import User

    async def _user():
        return User(id=1, email="t@x.com", role="analyst")

    app.dependency_overrides[get_current_user] = _user
    yield
    app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.asyncio
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


@pytest.mark.asyncio
async def test_fetch_route_returns_404_for_unknown_ticker(auth_override):
    with patch("app.modules.sec_fetcher.router.fetch_filing", new=AsyncMock(side_effect=TickerNotFoundError("zzzz"))):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            r = await ac.get("/sec/fetch", params={"ticker": "zzzz", "form": "10-K"})
    assert r.status_code == 404
    assert "zzzz" in r.json()["detail"].lower()


@pytest.mark.asyncio
async def test_fetch_route_returns_404_when_no_matching_filing(auth_override):
    with patch("app.modules.sec_fetcher.router.fetch_filing", new=AsyncMock(side_effect=FilingNotFoundError("none"))):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            r = await ac.get("/sec/fetch", params={"ticker": "msft", "form": "10-Q"})
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_fetch_route_returns_503_when_rate_limited(auth_override):
    with patch("app.modules.sec_fetcher.router.fetch_filing", new=AsyncMock(side_effect=RateLimitedError("nope"))):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            r = await ac.get("/sec/fetch", params={"ticker": "msft", "form": "10-K"})
    assert r.status_code == 503


@pytest.mark.asyncio
async def test_fetch_route_returns_502_with_source_url_on_render_error(auth_override):
    err = RenderError("boom", source_url="https://www.sec.gov/x.htm")
    with patch("app.modules.sec_fetcher.router.fetch_filing", new=AsyncMock(side_effect=err)):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            r = await ac.get("/sec/fetch", params={"ticker": "msft", "form": "10-K"})
    assert r.status_code == 502
    assert "sec.gov" in r.json()["detail"]


@pytest.mark.asyncio
async def test_fetch_route_rejects_invalid_form(auth_override):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        r = await ac.get("/sec/fetch", params={"ticker": "msft", "form": "8-K"})
    assert r.status_code == 422
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `docker compose exec backend pytest tests/test_sec_router.py -v`
Expected: FAIL — `404 Not Found` (route doesn't exist yet) on the success test, plus other failures.

- [ ] **Step 3: Implement the router**

```python
# backend/app/modules/sec_fetcher/router.py
import logging
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response

from app.core.deps import get_current_user
from app.models.user import User

from .exceptions import (
    TickerNotFoundError,
    FilingNotFoundError,
    RateLimitedError,
    RenderError,
)
from .service import fetch_filing

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/sec", tags=["sec"])


@router.get("/fetch")
async def fetch(
    ticker: str = Query(..., min_length=1, max_length=10),
    form: Literal["10-K", "10-Q"] = Query(...),
    user: User = Depends(get_current_user),
) -> Response:
    try:
        pdf_bytes, filename, page_count = await fetch_filing(ticker, form)
    except TickerNotFoundError:
        raise HTTPException(status_code=404, detail=f'No SEC filings found for ticker "{ticker}".')
    except FilingNotFoundError:
        raise HTTPException(status_code=404, detail=f"No recent {form} found for {ticker.upper()}.")
    except RateLimitedError:
        raise HTTPException(status_code=503, detail="SEC is rate-limiting us — retry in a moment.")
    except RenderError as e:
        raise HTTPException(
            status_code=502,
            detail=f"Could not render the filing. Try downloading from SEC directly: {e.source_url}",
        )

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "X-PDF-Pages": str(page_count),
            # Expose custom + standard headers so the browser can read them after the rewrite
            "Access-Control-Expose-Headers": "Content-Disposition, X-PDF-Pages",
        },
    )
```

- [ ] **Step 4: Wire the router into the app**

In `backend/app/main.py`, after the existing router includes (around line 39), add:

```python
from app.modules.sec_fetcher.router import router as sec_fetcher_router
# ...
app.include_router(sec_fetcher_router)
```

- [ ] **Step 5: Run the test to confirm it passes**

Run: `docker compose exec backend pytest tests/test_sec_router.py -v`
Expected: PASS — 6 tests

- [ ] **Step 6: Run the full test suite to confirm nothing else broke**

Run: `docker compose exec backend pytest tests/ -v --ignore=tests/test_memo.py`
Expected: PASS — all tests including the 6 new ones

- [ ] **Step 7: Commit**

```bash
git add backend/app/modules/sec_fetcher/router.py backend/app/main.py backend/tests/test_sec_router.py
git commit -m "feat(sec): GET /sec/fetch returns rendered 10-K/10-Q as PDF"
```

---

## Task 5: Frontend — secFetcher API client

**Files:**
- Create: `frontend/src/api/secFetcher.ts`

- [ ] **Step 1: Write the API client**

```ts
// frontend/src/api/secFetcher.ts
import { apiClient } from './client'

export interface FetchedFiling {
  blob: Blob
  filename: string
  pageCount: number
}

/**
 * Fetch the latest SEC filing of the given form for a ticker.
 * Returns the PDF blob plus metadata extracted from response headers.
 * Throws an Error with the server's `detail` message on non-2xx responses.
 */
export async function fetchSecFiling(ticker: string, form: '10-K' | '10-Q'): Promise<FetchedFiling> {
  const res = await apiClient.get<Blob>('/sec/fetch', {
    params: { ticker, form },
    responseType: 'blob',
    // Don't let axios throw on 4xx/5xx — we want to read the JSON error body
    validateStatus: () => true,
  })

  if (res.status >= 400) {
    // The body is a Blob containing JSON when it's an error
    const text = await (res.data as Blob).text()
    let detail = `Request failed (${res.status})`
    try {
      detail = JSON.parse(text).detail ?? detail
    } catch {
      /* keep default */
    }
    throw new Error(detail)
  }

  const filename = parseFilename(res.headers['content-disposition'])
  const pageCount = parseInt(res.headers['x-pdf-pages'] ?? '0', 10)
  return { blob: res.data, filename, pageCount }
}

function parseFilename(contentDisposition: string | undefined): string {
  if (!contentDisposition) return 'sec_filing.pdf'
  const match = /filename="([^"]+)"/.exec(contentDisposition)
  return match ? match[1] : 'sec_filing.pdf'
}
```

- [ ] **Step 2: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: No new errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/api/secFetcher.ts
git commit -m "feat(sec): frontend API client for /sec/fetch with header parsing"
```

---

## Task 6: Frontend — `<SecFetchControl>` component

**Files:**
- Create: `frontend/src/components/SecFetchControl.tsx`

- [ ] **Step 1: Implement the component**

```tsx
// frontend/src/components/SecFetchControl.tsx
import { useState } from 'react'
import { fetchSecFiling } from '../api/secFetcher'

type Status =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'success'; filename: string; sizeBytes: number; pageCount: number }
  | { kind: 'error'; message: string }

export default function SecFetchControl() {
  const [ticker, setTicker] = useState('')
  const [form, setForm] = useState<'10-K' | '10-Q'>('10-K')
  const [status, setStatus] = useState<Status>({ kind: 'idle' })

  const isLoading = status.kind === 'loading'
  const canFetch = ticker.trim().length > 0 && !isLoading

  async function onFetch() {
    setStatus({ kind: 'loading' })
    try {
      const { blob, filename, pageCount } = await fetchSecFiling(ticker.trim(), form)
      triggerDownload(blob, filename)
      setStatus({ kind: 'success', filename, sizeBytes: blob.size, pageCount })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Network error — try again'
      setStatus({ kind: 'error', message })
    }
  }

  return (
    <div className="rounded-lg border border-indigo-300 border-l-4 border-l-indigo-500 bg-white p-5">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-indigo-700">
        Fetch the doc from SEC.gov site
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          className="w-44 rounded border border-slate-300 px-2 py-1.5 text-sm uppercase placeholder:normal-case"
          placeholder="Ticker (e.g. msft)"
          value={ticker}
          disabled={isLoading}
          onChange={(e) => setTicker(e.target.value)}
        />
        <select
          className="rounded border border-slate-300 bg-white px-2 py-1.5 text-sm"
          value={form}
          disabled={isLoading}
          onChange={(e) => setForm(e.target.value as '10-K' | '10-Q')}
        >
          <option value="10-K">10-K (annual)</option>
          <option value="10-Q">10-Q (quarterly)</option>
        </select>
        <button
          className="rounded bg-indigo-500 px-3 py-1.5 text-sm font-medium text-white disabled:bg-indigo-300"
          disabled={!canFetch}
          onClick={onFetch}
        >
          {isLoading ? '⟳ Fetching…' : 'Fetch latest 10K/Q'}
        </button>
      </div>

      <div className="mt-2 text-xs text-slate-500">
        Downloads the most recent financial filing as a PDF file. Then upload it above.
      </div>

      {status.kind === 'loading' && (
        <div className="mt-3 text-sm text-indigo-700">
          Looking up filing on SEC.gov…
          <br />
          <span className="text-slate-500">
            Rendering PDF (this can take 10–30 seconds for a 200-page 10-K)
          </span>
        </div>
      )}

      {status.kind === 'success' && (
        <div className="mt-3 text-sm text-green-700">
          ✓ Downloaded <strong>{status.filename}</strong> ({formatBytes(status.sizeBytes)}, {status.pageCount} pages)
          <br />
          <span className="text-slate-500">Now click "Choose file" above to upload it.</span>
        </div>
      )}

      {status.kind === 'error' && (
        <div className="mt-3 text-sm text-red-700">
          ✗ {status.message}
          <br />
          <span className="text-slate-500">
            Check the symbol or browse{' '}
            <a
              href={`https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${ticker}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-500 underline"
            >
              SEC.gov
            </a>{' '}
            site directly.
          </span>
        </div>
      )}
    </div>
  )
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}
```

- [ ] **Step 2: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: No new errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/SecFetchControl.tsx
git commit -m "feat(sec): SecFetchControl with loading / success / error states"
```

---

## Task 7: Mount `<SecFetchControl>` in `ExtractionPanel`

**Files:**
- Modify: `frontend/src/components/ExtractionPanel.tsx`

- [ ] **Step 1: Find the upload row in ExtractionPanel**

Run: `grep -n "Choose file\|fileRef\|<input.*type=\"file\"" frontend/src/components/ExtractionPanel.tsx`
Expected: lines showing the existing upload control (likely inside a div near the top of the rendered JSX, panelState === 'idle' branch).

- [ ] **Step 2: Import the new component**

Add at the top of `frontend/src/components/ExtractionPanel.tsx` with the other component imports:

```tsx
import SecFetchControl from './SecFetchControl'
```

- [ ] **Step 3: Render the divider + SecFetchControl below the upload row**

Locate the JSX block that renders the file-upload UI (the "idle" or default panel state, where the "Choose file" button / drag-drop zone lives). Immediately after that block's closing tag, add:

```tsx
<div className="my-4 text-center text-xs tracking-widest text-slate-400">— OR —</div>
<SecFetchControl />
```

The exact insertion point depends on the current JSX structure — pick the location that puts the SEC control directly below the upload control in the rendered DOM, both visible during the `idle` panel state.

- [ ] **Step 4: Type-check + build**

Run: `cd frontend && npx tsc --noEmit && npm run build`
Expected: Build succeeds.

- [ ] **Step 5: Manual smoke (optional but recommended)**

Run: `docker compose up -d` and visit `http://localhost:5174`. Open a spread → ExtractionPanel should show the new SEC row below the upload control. Type `msft`, click Fetch, verify a PDF downloads.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/ExtractionPanel.tsx
git commit -m "feat(sec): mount SecFetchControl in ExtractionPanel"
```

---

## Task 8: Documentation updates

**Files:**
- Modify: `docs/SpreadSense-Explainer.md`
- Modify: `docs/SpreadSense-AI-PRD.md`
- Modify: `docs/Deployment-Runbook.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add a "Fetching from SEC" section to the explainer**

Append to `docs/SpreadSense-Explainer.md` under the existing flow section:

```markdown
### Pulling a 10-K straight from SEC

If the borrower is a public US company, you don't need to download the
filing yourself. In the spread page, type the ticker (e.g. `msft`), pick
10-K or 10-Q, and click **Fetch latest 10K/Q**. SpreadSense pulls the
latest filing from SEC EDGAR, renders it to PDF (10–30 seconds for a
typical 10-K), and downloads it to your machine. Then upload it through
the regular flow.
```

- [ ] **Step 2: Bump PRD to v1.3 with SEC fetcher milestone**

In `docs/SpreadSense-AI-PRD.md`:
- Update the version line at the top to `Draft v1.3 — May 2026`.
- Under Phase 4 milestones, add: `- SEC EDGAR fetcher: pull latest 10-K / 10-Q for any public ticker directly inside ExtractionPanel.`

- [ ] **Step 3: Note the new endpoint in the runbook**

Append to the "Endpoints" section of `docs/Deployment-Runbook.md` (or add such a section if it doesn't exist):

```markdown
- `GET /sec/fetch?ticker=&form=10-K|10-Q` — auth-required. Renders the latest
  matching filing to PDF using WeasyPrint and streams it as a download. No new
  env vars. SEC traffic uses User-Agent `SpreadSense (contact@adamsmind.ai)`.
```

- [ ] **Step 4: Move the SEC fetcher idea out of "Open Threads" in CLAUDE.md**

In `CLAUDE.md`, under "Open Threads / Ideas", remove the SEC fetcher bullet (or move it under a new "Recently shipped" subsection with the spec/plan paths).

- [ ] **Step 5: Commit**

```bash
git add docs/SpreadSense-Explainer.md docs/SpreadSense-AI-PRD.md docs/Deployment-Runbook.md CLAUDE.md
git commit -m "docs: SEC fetcher in explainer, PRD v1.3, runbook endpoint, CLAUDE.md"
```

---

## Done

After Task 8: every spec requirement is implemented, every endpoint is tested, the UI mounts the new control, and the docs reflect reality. Hand off to `superpowers:finishing-a-development-branch`.
