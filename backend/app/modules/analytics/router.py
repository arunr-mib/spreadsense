from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.modules.analytics import service
from app.modules.analytics.schemas import SpreadAnalyticsRead

router = APIRouter(tags=["analytics"])


@router.get("/spreads/{spread_id}/analytics", response_model=SpreadAnalyticsRead)
async def get_analytics(
    spread_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return await service.get_analytics(spread_id, db)
