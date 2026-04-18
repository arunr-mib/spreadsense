from fastapi import FastAPI, Depends
from app.modules.auth.router import router as auth_router
from app.core.deps import get_current_user
from app.models.user import User

app = FastAPI(title="Financial Spreading Tool", version="0.1.0")
app.include_router(auth_router)


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/borrowers/")
async def borrowers_stub(_: User = Depends(get_current_user)):
    return []
