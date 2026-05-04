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
