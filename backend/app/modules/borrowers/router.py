from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.modules.borrowers.schemas import BorrowerCreate, BorrowerRead, BorrowerUpdate
from app.modules.borrowers import service

router = APIRouter(prefix="/borrowers", tags=["borrowers"])


@router.post("/", response_model=BorrowerRead, status_code=201)
async def create(body: BorrowerCreate, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    return await service.create_borrower(body, user.id, db)


@router.get("/", response_model=list[BorrowerRead])
async def list_all(db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    return await service.list_borrowers(db)


@router.get("/{borrower_id}", response_model=BorrowerRead)
async def get_one(borrower_id: int, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    b = await service.get_borrower(borrower_id, db)
    if not b:
        raise HTTPException(status_code=404, detail="Borrower not found")
    return b


@router.patch("/{borrower_id}", response_model=BorrowerRead)
async def update(borrower_id: int, body: BorrowerUpdate, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    b = await service.get_borrower(borrower_id, db)
    if not b:
        raise HTTPException(status_code=404, detail="Borrower not found")
    return await service.update_borrower(b, body, db)
