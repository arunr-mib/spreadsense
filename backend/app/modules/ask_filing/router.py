from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.database import get_db
from app.models.user import User
from app.modules.ask_filing import service
from app.modules.ask_filing.schemas import AskRequest, AskResponse

router = APIRouter(tags=["ask-filing"])


@router.post(
    "/spreads/{spread_id}/ask",
    response_model=AskResponse,
)
async def ask_filing(
    spread_id: int,
    body: AskRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> AskResponse:
    return await service.ask(spread_id, body.question, user, db)
