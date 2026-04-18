from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.borrower import Borrower
from app.modules.borrowers.schemas import BorrowerCreate, BorrowerUpdate


async def create_borrower(data: BorrowerCreate, user_id: int, db: AsyncSession) -> Borrower:
    borrower = Borrower(**data.model_dump(), created_by=user_id)
    db.add(borrower)
    await db.flush()
    await db.refresh(borrower)
    return borrower


async def list_borrowers(db: AsyncSession) -> list[Borrower]:
    result = await db.execute(select(Borrower).order_by(Borrower.name))
    return list(result.scalars().all())


async def get_borrower(borrower_id: int, db: AsyncSession) -> Optional[Borrower]:
    result = await db.execute(select(Borrower).where(Borrower.id == borrower_id))
    return result.scalar_one_or_none()


async def update_borrower(borrower: Borrower, data: BorrowerUpdate, db: AsyncSession) -> Borrower:
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(borrower, field, value)
    await db.flush()
    await db.refresh(borrower)
    return borrower
