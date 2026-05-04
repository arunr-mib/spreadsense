import logging
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
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
            "Access-Control-Expose-Headers": "Content-Disposition, X-PDF-Pages",
        },
    )
