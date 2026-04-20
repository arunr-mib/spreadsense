from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.database import get_db
from app.models.user import User
from app.modules.spreads import service
from app.modules.spreads.schemas import AuditEntry, SpreadCreate, SpreadRead, SpreadStatusUpdate

router = APIRouter(prefix="/spreads", tags=["spreads"])


@router.post("/", response_model=SpreadRead, status_code=status.HTTP_201_CREATED)
async def create_spread(
    body: SpreadCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await service.create_spread(body, user, db)


@router.get("/", response_model=list[SpreadRead])
async def list_spreads(
    borrower_id: Optional[int] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await service.list_spreads(user, db, borrower_id=borrower_id, status_filter=status_filter)


@router.get("/{spread_id}/history", response_model=list[AuditEntry])
async def get_history(
    spread_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await service.get_history(spread_id, user, db)


@router.patch("/{spread_id}/status", response_model=SpreadRead)
async def update_status(
    spread_id: int,
    body: SpreadStatusUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await service.update_status(spread_id, body.status, user, db)


@router.get("/{spread_id}", response_model=SpreadRead)
async def get_spread(
    spread_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    spread = await service.get_spread(spread_id, user, db)
    if not spread:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Spread not found")
    return spread
