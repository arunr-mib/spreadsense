import logging

# Ensure app loggers emit INFO+ to stdout alongside uvicorn's output.
# basicConfig is a no-op once uvicorn has set up handlers, so we attach our own.
_app_handler = logging.StreamHandler()
_app_handler.setLevel(logging.INFO)
_app_handler.setFormatter(logging.Formatter("%(levelname)s:     %(name)s - %(message)s"))
for _name in ("app.modules.ingestion.service", "app.modules.ingestion.claude_extractor"):
    _log = logging.getLogger(_name)
    _log.setLevel(logging.INFO)
    _log.addHandler(_app_handler)
    _log.propagate = False  # avoid duplicate output via uvicorn root

from fastapi import FastAPI
from app.modules.auth.router import router as auth_router
from app.modules.borrowers.router import router as borrowers_router
from app.modules.spreads.router import router as spreads_router
from app.modules.spreading.router import router as spreading_router
from app.modules.ingestion.router import router as ingestion_router
from app.modules.analytics.router import router as analytics_router
from app.modules.narrative.router import router as narrative_router
from app.modules.memo.router import router as memo_router
from app.modules.portfolio.router import router as portfolio_router

# redirect_slashes=False prevents FastAPI from issuing 307 redirects for
# trailing-slash mismatches. In production those redirects sent absolute
# URLs that exposed the Railway backend hostname and broke HTTPS upgrade.
# Frontend already calls every endpoint with the canonical (trailing-slash)
# URL, so disabling auto-redirect here is safe.
app = FastAPI(title="SpreadSense", version="0.1.0", redirect_slashes=False)
app.include_router(auth_router)
app.include_router(borrowers_router)
app.include_router(spreads_router)
app.include_router(spreading_router)
app.include_router(ingestion_router)
app.include_router(analytics_router)
app.include_router(narrative_router)
app.include_router(memo_router)
app.include_router(portfolio_router)


@app.get("/health")
async def health():
    return {"status": "ok"}
