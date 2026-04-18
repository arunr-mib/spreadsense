from __future__ import annotations

from datetime import date as date_type

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.modules.memo import service
from app.modules.memo.schemas import CreditMemoMetaRead, CreditMemoMetaWrite

router = APIRouter(tags=["memo"])


@router.get("/spreads/{spread_id}/memo/meta")
async def get_meta(
    spread_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Returns the meta row if it exists, or {} if not yet created."""
    meta = await service.get_meta(spread_id, user, db)
    if meta is None:
        return {}
    return CreditMemoMetaRead.model_validate(meta)


@router.put("/spreads/{spread_id}/memo/meta", response_model=CreditMemoMetaRead)
async def upsert_meta(
    spread_id: int,
    body: CreditMemoMetaWrite,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await service.upsert_meta(spread_id, body, user, db)


@router.get("/spreads/{spread_id}/memo/pdf")
async def export_pdf(
    spread_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    pdf_bytes = await service.render_pdf(spread_id, user, db)
    filename = f"credit_memo_{spread_id}_{date_type.today().isoformat()}.pdf"
    return StreamingResponse(
        iter([pdf_bytes]),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
