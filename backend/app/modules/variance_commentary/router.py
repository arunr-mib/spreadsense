from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.database import get_db
from app.models.user import User
from app.modules.variance_commentary import service
from app.modules.variance_commentary.schemas import VarianceCommentaryResponse

router = APIRouter(tags=["variance-commentary"])


@router.post(
    "/spreads/{spread_id}/variance-commentary",
    response_model=VarianceCommentaryResponse,
)
async def generate(
    spread_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> VarianceCommentaryResponse:
    return await service.generate_variance_commentary(spread_id, user, db)
