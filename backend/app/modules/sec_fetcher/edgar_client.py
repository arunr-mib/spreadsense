import time
from dataclasses import dataclass
from typing import Any

import httpx

from .exceptions import TickerNotFoundError, RateLimitedError, FilingNotFoundError

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
    """Find the most recent filing of the given form (e.g. '10-K' or '10-Q').

    Relies on SEC's documented contract that ``filings.recent`` is sorted
    most-recent-first (descending by filing date). Returns the first matching
    entry rather than re-sorting by date — this is intentional and matches
    SEC EDGAR's API behavior.
    """
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
