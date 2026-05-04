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
    assert ref.url == "https://www.sec.gov/Archives/edgar/data/789019/000124100/msft-10k-2024.htm"


@pytest.mark.asyncio
async def test_find_latest_filing_no_match_raises():
    empty = {"filings": {"recent": {"form": ["8-K"], "accessionNumber": ["x"], "primaryDocument": ["x.htm"], "filingDate": ["2025-01-01"]}}}
    with patch("app.modules.sec_fetcher.edgar_client._fetch_submissions", new=AsyncMock(return_value=empty)):
        with pytest.raises(FilingNotFoundError):
            await find_latest_filing("0000789019", "10-K")
