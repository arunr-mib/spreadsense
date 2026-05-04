import pytest
from unittest.mock import patch, MagicMock

from app.modules.sec_fetcher.renderer import render_html_url_to_pdf
from app.modules.sec_fetcher.exceptions import RenderError

MINIMAL_HTML = "<html><body><h1>Test 10-K</h1><p>Body</p></body></html>"


def _async_value(value):
    """Helper: wrap a value so `await m.get(...)` resolves to it."""
    async def _coro():
        return value
    return _coro()


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
