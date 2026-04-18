from typing import Literal

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.modules.spreading import service
from app.modules.spreading.schemas import (
    SpreadPeriodCreate, SpreadPeriodRead,
    SpreadLineItemRead, LineItemUpdate,
    BalanceSheetValidationResponse,
)

router = APIRouter(tags=["spreading"])


@router.post("/spreads/{spread_id}/periods", response_model=SpreadPeriodRead,
             status_code=status.HTTP_201_CREATED)
async def create_period(spread_id: int, body: SpreadPeriodCreate,
                        db: AsyncSession = Depends(get_db),
                        _: User = Depends(get_current_user)):
    return await service.create_period(spread_id, body, db)


@router.get("/spreads/{spread_id}/periods", response_model=list[SpreadPeriodRead])
async def list_periods(spread_id: int,
                       db: AsyncSession = Depends(get_db),
                       _: User = Depends(get_current_user)):
    return await service.list_periods(spread_id, db)


@router.get("/spreads/{spread_id}/periods/{period_id}/line-items",
            response_model=list[SpreadLineItemRead])
async def get_line_items(spread_id: int, period_id: int,
                         statement: Literal["IS", "BS", "CF"],
                         db: AsyncSession = Depends(get_db),
                         _: User = Depends(get_current_user)):
    return await service.get_line_items(period_id, statement, db)


@router.put("/spreads/{spread_id}/periods/{period_id}/line-items/{field_key}",
            response_model=SpreadLineItemRead)
async def upsert_line_item(spread_id: int, period_id: int, field_key: str,
                           body: LineItemUpdate,
                           db: AsyncSession = Depends(get_db),
                           user: User = Depends(get_current_user)):
    return await service.upsert_line_item(period_id, field_key, body, user, db)


@router.get("/spreads/{spread_id}/validate",
            response_model=BalanceSheetValidationResponse)
async def validate_bs(spread_id: int,
                      db: AsyncSession = Depends(get_db),
                      _: User = Depends(get_current_user)):
    return await service.validate_spread_bs(spread_id, db)
