from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from fastapi import HTTPException

from app.models.spread import Spread
from app.models.spread_period import SpreadPeriod
from app.models.spread_line_item import SpreadLineItem
from app.models.loan_type import LoanType
from app.modules.ingestion.rma_template import (
    compute_period_values, compute_cross_statement, _get,
)
from app.modules.analytics.schemas import SpreadAnalyticsRead, PeriodAnalytics, RatioSet

# Default thresholds — all 4 threshold ratios
_DEFAULTS = {
    "dscr_min": 1.20,
    "leverage_max": 4.50,
    "current_ratio_min": 1.50,
    "interest_coverage_min": 2.00,
}


def _safe_div(num: float | None, den: float | None) -> float | None:
    if num is None or den is None or den == 0:
        return None
    return num / den


def _compute_ratios(
    is_raw: dict, bs_raw: dict, cf_raw: dict, thresholds: dict
) -> tuple[dict, list[str], list[str]]:
    """Return (ratios_dict, breaches, near_threshold) for one period."""
    is_comp = compute_period_values("IS", is_raw)
    bs_comp = compute_period_values("BS", bs_raw)
    cross = compute_cross_statement(is_raw, bs_raw, cf_raw)

    # Merged lookup — raw values take priority; computed fill gaps
    vals = {**is_raw, **is_comp, **bs_raw, **bs_comp, **cf_raw, **cross}

    # Leverage numerator: sum long_term_debt + current_portion_ltd
    ltd = _get(vals, "long_term_debt")
    cpltd = _get(vals, "current_portion_ltd")
    ebitda = _get(vals, "ebitda")
    if (ltd is not None or cpltd is not None) and ebitda is not None and ebitda != 0:
        leverage = ((ltd or 0.0) + (cpltd or 0.0)) / ebitda
    else:
        leverage = None

    ratios = {
        "dscr": _safe_div(_get(vals, "uca_cfads"), _get(vals, "total_debt_service")),
        "leverage": leverage,
        "current_ratio": _safe_div(_get(vals, "total_current_assets"),
                                   _get(vals, "total_current_liabilities")),
        "interest_coverage": _safe_div(_get(vals, "ebit"), _get(vals, "interest_expense")),
        "ebitda_margin": _safe_div(_get(vals, "ebitda"), _get(vals, "net_sales")),
        "gross_margin": _safe_div(_get(vals, "gross_profit"), _get(vals, "net_sales")),
        "net_profit_margin": _safe_div(_get(vals, "net_income"), _get(vals, "net_sales")),
        "return_on_assets": _safe_div(_get(vals, "net_income"), _get(vals, "total_assets")),
    }

    breaches: list[str] = []
    near: list[str] = []

    # DSCR — higher is better, min threshold
    if ratios["dscr"] is not None:
        mn = thresholds["dscr_min"]
        if ratios["dscr"] < mn:
            breaches.append("dscr")
        elif ratios["dscr"] <= mn * 1.10:
            near.append("dscr")

    # Leverage — lower is better, max threshold
    if ratios["leverage"] is not None:
        mx = thresholds["leverage_max"]
        if ratios["leverage"] > mx:
            breaches.append("leverage")
        elif ratios["leverage"] >= mx * 0.90:
            near.append("leverage")

    # Current ratio — higher is better, min threshold
    if ratios["current_ratio"] is not None:
        mn = thresholds["current_ratio_min"]
        if ratios["current_ratio"] < mn:
            breaches.append("current_ratio")
        elif ratios["current_ratio"] <= mn * 1.10:
            near.append("current_ratio")

    # Interest coverage — higher is better, min threshold
    if ratios["interest_coverage"] is not None:
        mn = thresholds["interest_coverage_min"]
        if ratios["interest_coverage"] < mn:
            breaches.append("interest_coverage")
        elif ratios["interest_coverage"] <= mn * 1.10:
            near.append("interest_coverage")

    return ratios, breaches, near


async def get_analytics(spread_id: int, db: AsyncSession) -> SpreadAnalyticsRead:
    # Verify spread exists
    spread_result = await db.execute(select(Spread).where(Spread.id == spread_id))
    spread = spread_result.scalar_one_or_none()
    if not spread:
        raise HTTPException(status_code=404, detail="Spread not found")

    # Build thresholds — override defaults from loan type if set
    thresholds = dict(_DEFAULTS)
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

    # Load periods ordered by fiscal year
    periods_result = await db.execute(
        select(SpreadPeriod)
        .where(SpreadPeriod.spread_id == spread_id)
        .order_by(SpreadPeriod.fiscal_year)
    )
    periods = list(periods_result.scalars().all())

    period_analytics = []
    for period in periods:
        li_result = await db.execute(
            select(SpreadLineItem).where(SpreadLineItem.spread_period_id == period.id)
        )
        items = list(li_result.scalars().all())

        is_raw = {i.rma_field_key: float(i.value) for i in items
                  if i.statement == "IS" and i.value is not None}
        bs_raw = {i.rma_field_key: float(i.value) for i in items
                  if i.statement == "BS" and i.value is not None}
        cf_raw = {i.rma_field_key: float(i.value) for i in items
                  if i.statement == "CF" and i.value is not None}

        ratios, breaches, near = _compute_ratios(is_raw, bs_raw, cf_raw, thresholds)

        period_analytics.append(PeriodAnalytics(
            period_id=period.id,
            fiscal_year=period.fiscal_year,
            period_type=period.period_type.value
                if hasattr(period.period_type, "value") else str(period.period_type),
            ratios=RatioSet(**ratios),
            breaches=breaches,
            near_threshold=near,
        ))

    return SpreadAnalyticsRead(spread_id=spread_id, periods=period_analytics)
