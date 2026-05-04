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
