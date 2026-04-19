from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.modules.portfolio import service
from app.modules.portfolio.schemas import PortfolioSummary

router = APIRouter(tags=["portfolio"])


@router.get("/portfolio/summary", response_model=PortfolioSummary)
async def get_portfolio_summary(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await service.get_portfolio_summary(user, db)
