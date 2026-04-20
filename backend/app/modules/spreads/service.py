from datetime import datetime, timezone
from typing import List, Optional
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.audit_log import AuditLog
from app.models.spread import Spread
from app.models.user import User, UserRole
from app.modules.spreads.schemas import AuditEntry, SpreadCreate

ALLOWED_TRANSITIONS: dict[str, list[tuple[str, set[UserRole]]]] = {
    "draft":     [("completed", {UserRole.analyst})],
    "completed": [("reviewed",  {UserRole.sr_credit_analyst, UserRole.admin})],
    "reviewed":  [("exported",  {UserRole.analyst, UserRole.sr_credit_analyst, UserRole.admin})],
}


async def create_spread(data: SpreadCreate, user: User, db: AsyncSession) -> Spread:
    spread = Spread(**data.model_dump(), created_by=user.id)
    db.add(spread)
    await db.flush()
    await db.refresh(spread)
    return spread


async def update_status(spread_id: int, new_status: str, user: User, db: AsyncSession) -> Spread:
    spread = await get_spread(spread_id, user, db)
    if not spread:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Spread not found")

    allowed = ALLOWED_TRANSITIONS.get(spread.status, [])
    permitted = any(new_status == target and user.role in roles for target, roles in allowed)
    if not permitted:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Transition not permitted")

    old_status = spread.status
    spread.status = new_status
    spread.updated_at = datetime.now(timezone.utc)

    audit = AuditLog(
        spread_id=spread.id,
        user_id=user.id,
        action="status_change",
        entity="Spread",
        entity_id=spread.id,
        old_value={"status": old_status},
        new_value={"status": new_status},
    )
    db.add(audit)
    await db.flush()
    await db.refresh(spread)
    return spread


async def get_history(spread_id: int, user: User, db: AsyncSession) -> List[AuditEntry]:
    spread = await get_spread(spread_id, user, db)
    if not spread:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Spread not found")

    result = await db.execute(
        select(AuditLog, User)
        .join(User, AuditLog.user_id == User.id)
        .where(
            AuditLog.entity == "Spread",
            AuditLog.entity_id == spread_id,
            AuditLog.action == "status_change",
        )
        .order_by(AuditLog.timestamp.asc())
    )
    rows = result.all()
    return [
        AuditEntry(
            id=log.id,
            old_status=log.old_value["status"],
            new_status=log.new_value["status"],
            changed_by_name=u.full_name,
            timestamp=log.timestamp,
        )
        for log, u in rows
    ]


async def list_spreads(
    user: User,
    db: AsyncSession,
    borrower_id: Optional[int] = None,
    status_filter: Optional[str] = None,
) -> List[Spread]:
    query = select(Spread).order_by(Spread.updated_at.desc())
    if user.role == UserRole.analyst:
        query = query.where(Spread.created_by == user.id)
    if borrower_id is not None:
        query = query.where(Spread.borrower_id == borrower_id)
    if status_filter is not None:
        query = query.where(Spread.status == status_filter)
    result = await db.execute(query)
    return list(result.scalars().all())


async def get_spread(spread_id: int, user: User, db: AsyncSession) -> Optional[Spread]:
    query = select(Spread).where(Spread.id == spread_id)
    if user.role == UserRole.analyst:
        query = query.where(Spread.created_by == user.id)
    result = await db.execute(query)
    return result.scalar_one_or_none()
