from __future__ import annotations

import os
from datetime import datetime, timezone

from typing import Optional

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.credit_memo_meta import CreditMemoMeta
from app.models.spread import Spread
from app.models.user import User, UserRole
from app.modules.memo.schemas import CreditMemoMetaWrite

# IS and CF fields to pull for the PDF financial tables
IS_KEY_FIELDS = frozenset([
    "net_sales", "gross_profit", "ebitda", "ebit",
    "interest_expense", "net_income",
])
CF_KEY_FIELDS = frozenset([
    "cf_net_income", "add_depreciation_amortization",
    "capital_expenditures", "uca_cfads", "total_debt_service",
])

TEMPLATE_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "templates")


async def _get_spread(spread_id: int, user: User, db: AsyncSession) -> Spread:
    """Ownership-enforced spread lookup. Analysts see only their own spreads."""
    query = select(Spread).where(Spread.id == spread_id)
    if user.role == UserRole.analyst:
        query = query.where(Spread.created_by == user.id)
    result = await db.execute(query)
    spread = result.scalar_one_or_none()
    if not spread:
        raise HTTPException(status_code=404, detail="Spread not found")
    return spread


async def get_meta(
    spread_id: int, user: User, db: AsyncSession
) -> Optional[CreditMemoMeta]:
    await _get_spread(spread_id, user, db)
    result = await db.execute(
        select(CreditMemoMeta).where(CreditMemoMeta.spread_id == spread_id)
    )
    return result.scalar_one_or_none()


async def upsert_meta(
    spread_id: int, data: CreditMemoMetaWrite, user: User, db: AsyncSession
) -> CreditMemoMeta:
    await _get_spread(spread_id, user, db)
    result = await db.execute(
        select(CreditMemoMeta).where(CreditMemoMeta.spread_id == spread_id)
    )
    meta = result.scalar_one_or_none()
    if meta is None:
        meta = CreditMemoMeta(
            spread_id=spread_id,
            updated_at=datetime.now(timezone.utc),
            **data.model_dump(),
        )
        db.add(meta)
    else:
        for key, val in data.model_dump().items():
            setattr(meta, key, val)
        meta.updated_at = datetime.now(timezone.utc)
    await db.flush()
    await db.refresh(meta)
    return meta


async def build_memo_context(
    spread_id: int, user: User, db: AsyncSession
) -> dict:
    """Assemble full template context from DB — spread, borrower, meta, periods, narrative."""
    from app.models.borrower import Borrower
    from app.models.loan_type import LoanType
    from app.models.spread_period import SpreadPeriod
    from app.models.spread_line_item import SpreadLineItem
    from app.models.narrative_version import NarrativeVersion
    from app.modules.analytics.service import _compute_ratios, DEFAULT_THRESHOLDS

    spread = await _get_spread(spread_id, user, db)

    # Borrower
    borrower = (await db.execute(
        select(Borrower).where(Borrower.id == spread.borrower_id)
    )).scalar_one()

    # Meta (may be None)
    meta = (await db.execute(
        select(CreditMemoMeta).where(CreditMemoMeta.spread_id == spread_id)
    )).scalar_one_or_none()

    # Loan type (for covenants section)
    loan_type = None
    if spread.loan_type_id:
        loan_type = (await db.execute(
            select(LoanType).where(LoanType.id == spread.loan_type_id)
        )).scalar_one_or_none()

    # Periods + line items
    periods = list((await db.execute(
        select(SpreadPeriod)
        .where(SpreadPeriod.spread_id == spread_id)
        .order_by(SpreadPeriod.fiscal_year)
    )).scalars().all())

    period_data = []
    for period in periods:
        # IS key lines for the financial table
        is_items = (await db.execute(
            select(SpreadLineItem).where(
                SpreadLineItem.spread_period_id == period.id,
                SpreadLineItem.statement == "IS",
                SpreadLineItem.rma_field_key.in_(IS_KEY_FIELDS),
            )
        )).scalars().all()
        is_lines = {i.rma_field_key: float(i.value)
                    for i in is_items if i.value is not None}

        # CF key lines for the financial table
        cf_items = (await db.execute(
            select(SpreadLineItem).where(
                SpreadLineItem.spread_period_id == period.id,
                SpreadLineItem.statement == "CF",
                SpreadLineItem.rma_field_key.in_(CF_KEY_FIELDS),
            )
        )).scalars().all()
        cf_lines = {i.rma_field_key: float(i.value)
                    for i in cf_items if i.value is not None}

        # All items for ratio computation (reuses analytics logic)
        all_items = list((await db.execute(
            select(SpreadLineItem).where(SpreadLineItem.spread_period_id == period.id)
        )).scalars().all())
        is_raw = {i.rma_field_key: float(i.value) for i in all_items
                  if i.statement == "IS" and i.value is not None}
        bs_raw = {i.rma_field_key: float(i.value) for i in all_items
                  if i.statement == "BS" and i.value is not None}
        cf_raw = {i.rma_field_key: float(i.value) for i in all_items
                  if i.statement == "CF" and i.value is not None}

        ratios, breaches, near = _compute_ratios(is_raw, bs_raw, cf_raw, dict(DEFAULT_THRESHOLDS))
        period_data.append({
            "fiscal_year": period.fiscal_year,
            "period_type": period.period_type.value
                if hasattr(period.period_type, "value") else str(period.period_type),
            "is_lines": is_lines,
            "cf_lines": cf_lines,
            "ratios": ratios,
            "breaches": breaches,
            "near_threshold": near,
        })

    # Latest narrative
    narrative = (await db.execute(
        select(NarrativeVersion)
        .where(NarrativeVersion.spread_id == spread_id)
        .order_by(NarrativeVersion.version.desc())
        .limit(1)
    )).scalar_one_or_none()

    return {
        "borrower_name": borrower.name,
        "deal_name": spread.deal_name,
        "meta": meta,
        "loan_type": loan_type,
        "periods": period_data,
        "narrative_content": narrative.content if narrative else None,
        "generated_at": datetime.now(timezone.utc).strftime("%B %d, %Y"),
    }


async def render_pdf(spread_id: int, user: User, db: AsyncSession) -> bytes:
    """Build context, render Jinja2 template, return WeasyPrint PDF bytes."""
    # On macOS, homebrew libs are not on the default dyld search path.
    # Setting DYLD_LIBRARY_PATH before dlopen (which happens on first import)
    # allows cffi to locate libgobject, libpango, etc.
    import os
    if os.path.isdir("/opt/homebrew/lib"):
        os.environ.setdefault("DYLD_LIBRARY_PATH", "/opt/homebrew/lib")
    import weasyprint
    from jinja2 import Environment, FileSystemLoader

    context = await build_memo_context(spread_id, user, db)
    env = Environment(loader=FileSystemLoader(TEMPLATE_DIR))
    template = env.get_template("credit_memo.html")
    html = template.render(**context)
    return weasyprint.HTML(string=html).write_pdf()
