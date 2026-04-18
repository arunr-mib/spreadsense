from fastapi import FastAPI
from app.modules.auth.router import router as auth_router
from app.modules.borrowers.router import router as borrowers_router
from app.modules.spreads.router import router as spreads_router

app = FastAPI(title="Financial Spreading Tool", version="0.1.0")
app.include_router(auth_router)
app.include_router(borrowers_router)
app.include_router(spreads_router)


@app.get("/health")
async def health():
    return {"status": "ok"}
