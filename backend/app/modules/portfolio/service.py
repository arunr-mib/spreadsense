from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from fastapi import HTTPException, status

from app.models.spread import Spread
from app.models.borrower import Borrower
from app.models.user import User, UserRole
from app.models.loan_type import LoanType
from app.modules.portfolio.schemas import (
    PortfolioSummary, StatusCounts, BreachAlert, SpreadSummary,
)
from app.modules.analytics.service import DEFAULT_THRESHOLDS

# Maps ratio name → (threshold key in DEFAULT_THRESHOLDS, direction)
_RATIO_META = {
    "dscr":               ("dscr_min",               "min"),
    "current_ratio":      ("current_ratio_min",       "min"),
    "interest_coverage":  ("interest_coverage_min",   "min"),
    "leverage":           ("leverage_max",             "max"),
}


async def _effective_thresholds(spread: Spread, db: AsyncSession) -> dict:
    """Return threshold dict for this spread, applying loan-type overrides."""
    thresholds = dict(DEFAULT_THRESHOLDS)
    if spread.loan_type_id:
        lt_result = await db.execute(
            select(LoanType).where(LoanType.id == spread.loan_type_id)
        )
        lt = lt_result.scalar_one_or_none()
        if lt:
            if lt.dscr_min is not None:
                thresholds["dscr_min"] = float(lt.dscr_min)
            if lt.leverage_max is not None:
                thresholds["leverage_max"] = float(lt.leverage_max)
            if lt.current_ratio_min is not None:
                thresholds["current_ratio_min"] = float(lt.current_ratio_min)
            if lt.interest_coverage_min is not None:
                thresholds["interest_coverage_min"] = float(lt.interest_coverage_min)
    return thresholds


async def get_portfolio_summary(user: User, db: AsyncSession) -> PortfolioSummary:
    if user.role not in (UserRole.sr_credit_analyst, UserRole.admin):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    result = await db.execute(
        select(Spread, Borrower, User)
        .join(Borrower, Spread.borrower_id == Borrower.id)
        .join(User, Spread.created_by == User.id)
        .order_by(Spread.updated_at.desc())
    )
    rows = result.all()

    counts: dict = {"draft": 0, "completed": 0, "reviewed": 0, "exported": 0}
    for spread, _, __ in rows:
        key = spread.status.value if hasattr(spread.status, "value") else spread.status
        if key in counts:
            counts[key] += 1

    status_counts = StatusCounts(
        **counts,
        total=sum(counts.values()),
    )

    breach_alerts: list[BreachAlert] = []
    spread_summaries: list[SpreadSummary] = []

    for spread, borrower, analyst in rows:
        from app.modules.analytics.service import get_analytics
        try:
            analytics = await get_analytics(spread.id, user, db)
        except HTTPException:
            analytics = None

        alert_count = 0
        if analytics and analytics.periods:
            actual = [p for p in analytics.periods if p.period_type == "actual"]
            period = actual[-1] if actual else analytics.periods[-1]

            thresholds = await _effective_thresholds(spread, db)

            for ratio_name in period.breaches:
                meta = _RATIO_META.get(ratio_name)
                if meta:
                    threshold_key, direction = meta
                    ratio_value = getattr(period.ratios, ratio_name, None)
                    breach_alerts.append(BreachAlert(
                        spread_id=spread.id,
                        deal_name=spread.deal_name,
                        borrower_name=borrower.name,
                        ratio_name=ratio_name,
                        value=ratio_value,
                        threshold=thresholds[threshold_key],
                        direction=direction,
                        severity="breach",
                    ))
                    alert_count += 1

            for ratio_name in period.near_threshold:
                meta = _RATIO_META.get(ratio_name)
                if meta:
                    threshold_key, direction = meta
                    ratio_value = getattr(period.ratios, ratio_name, None)
                    breach_alerts.append(BreachAlert(
                        spread_id=spread.id,
                        deal_name=spread.deal_name,
                        borrower_name=borrower.name,
                        ratio_name=ratio_name,
                        value=ratio_value,
                        threshold=thresholds[threshold_key],
                        direction=direction,
                        severity="near_threshold",
                    ))
                    alert_count += 1

        spread_summaries.append(SpreadSummary(
            id=spread.id,
            deal_name=spread.deal_name,
            borrower_name=borrower.name,
            status=spread.status.value if hasattr(spread.status, "value") else spread.status,
            analyst_name=analyst.full_name,
            alert_count=alert_count,
            updated_at=spread.updated_at,
        ))

    breach_alerts.sort(key=lambda a: (0 if a.severity == "breach" else 1, a.deal_name))

    return PortfolioSummary(
        status_counts=status_counts,
        breach_alerts=breach_alerts,
        spread_summaries=spread_summaries,
    )
