from typing import List, Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.spread import Spread
from app.models.user import User, UserRole
from app.modules.spreads.schemas import SpreadCreate


async def create_spread(data: SpreadCreate, user: User, db: AsyncSession) -> Spread:
    spread = Spread(**data.model_dump(), created_by=user.id)
    db.add(spread)
    await db.flush()
    await db.refresh(spread)
    return spread


async def list_spreads(
    user: User,
    db: AsyncSession,
    borrower_id: Optional[int] = None,
) -> List[Spread]:
    query = select(Spread).order_by(Spread.updated_at.desc())
    if user.role == UserRole.analyst:
        query = query.where(Spread.created_by == user.id)
    if borrower_id is not None:
        query = query.where(Spread.borrower_id == borrower_id)
    result = await db.execute(query)
    return list(result.scalars().all())


async def get_spread(spread_id: int, user: User, db: AsyncSession) -> Optional[Spread]:
    query = select(Spread).where(Spread.id == spread_id)
    if user.role == UserRole.analyst:
        query = query.where(Spread.created_by == user.id)
    result = await db.execute(query)
    return result.scalar_one_or_none()
