import asyncio
import logging

import httpx
from weasyprint import HTML

from .exceptions import RenderError, RateLimitedError

logger = logging.getLogger(__name__)

USER_AGENT = "SpreadSense (contact@adamsmind.ai)"
HTML_FETCH_TIMEOUT = 30.0
# 10-K filings can run 100+ pages. Empirically: AAPL 10-Q (~30pp) renders in ~16s
# on Railway, and MSFT 10-K (~137pp) overran the previous 60s cap. 180s gives
# headroom for the largest filings without holding workers indefinitely.
RENDER_TIMEOUT_SECONDS = 180.0


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
