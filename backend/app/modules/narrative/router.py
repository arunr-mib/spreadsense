from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.modules.narrative import service
from app.modules.narrative.schemas import NarrativeVersionRead, NarrativeSaveRequest

router = APIRouter(tags=["narrative"])


@router.get("/spreads/{spread_id}/narrative", response_model=NarrativeVersionRead)
async def get_latest(
    spread_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await service.get_latest(spread_id, user, db)


@router.post(
    "/spreads/{spread_id}/narrative/generate",
    response_model=NarrativeVersionRead,
    status_code=201,
)
async def generate(
    spread_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await service.generate(spread_id, user, db)


@router.post(
    "/spreads/{spread_id}/narrative",
    response_model=NarrativeVersionRead,
    status_code=201,
)
async def save(
    spread_id: int,
    body: NarrativeSaveRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await service.save(spread_id, body.content, user, db)


@router.get(
    "/spreads/{spread_id}/narrative/versions",
    response_model=list[NarrativeVersionRead],
)
async def list_versions(
    spread_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await service.list_versions(spread_id, user, db)
