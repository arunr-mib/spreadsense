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
    assert page_count >= 0  # non-negative; counted from fake bytes
