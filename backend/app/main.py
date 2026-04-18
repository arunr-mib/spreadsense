from fastapi import FastAPI
from app.modules.auth.router import router as auth_router
from app.modules.borrowers.router import router as borrowers_router
from app.modules.spreads.router import router as spreads_router
from app.modules.spreading.router import router as spreading_router
from app.modules.ingestion.router import router as ingestion_router
from app.modules.analytics.router import router as analytics_router

app = FastAPI(title="SpreadSense", version="0.1.0")
app.include_router(auth_router)
app.include_router(borrowers_router)
app.include_router(spreads_router)
app.include_router(spreading_router)
app.include_router(ingestion_router)
app.include_router(analytics_router)


@app.get("/health")
async def health():
    return {"status": "ok"}
