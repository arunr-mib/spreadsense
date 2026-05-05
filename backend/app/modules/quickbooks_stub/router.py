from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.database import get_db
from app.models.user import User
from app.modules.quickbooks_stub.service import (
    DEMO_COMPANY_NAME,
    import_demo_trial_balance,
)

router = APIRouter(prefix="/quickbooks", tags=["quickbooks"])


@router.get("/sandbox-info")
async def sandbox_info(_: User = Depends(get_current_user)) -> dict:
    """Returns the demo company info so the UI can show what it will connect to.

    DEMO STUB — replaced by real OAuth resource lookup when integration ships.
    """
    return {"company": DEMO_COMPANY_NAME, "source": "demo_sandbox"}


@router.post("/spreads/{spread_id}/periods/{period_id}/import")
async def import_trial_balance(
    spread_id: int,
    period_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    """Import the demo trial balance into the given period.

    DEMO STUB — replaced by real QBO trial-balance API call when integration ships.
    """
    return await import_demo_trial_balance(spread_id, period_id, user, db)
