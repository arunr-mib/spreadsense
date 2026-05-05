"""QuickBooks Online connector — DEMO STUB.

Real OAuth + sandbox integration is roadmap. Today this returns a
fixed, realistic SMB trial balance for "Acme Manufacturing Inc" so
the demo flow looks end-to-end without OAuth fragility.

When the real connector ships, this module is replaced wholesale; the
router contract (POST /quickbooks/import) stays the same.
"""
from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.spread import Spread
from app.models.spread_line_item import SpreadLineItem
from app.models.spread_period import SpreadPeriod
from app.models.user import User, UserRole

DEMO_COMPANY_NAME = "Acme Manufacturing Inc (Demo Sandbox)"

# Realistic mid-market manufacturer: $4.25M revenue, 32% gross margin,
# ~50 day DSO, modest leverage. Balance sheet ties (assets = liab + equity).
DEMO_TRIAL_BALANCE: dict[str, dict[str, float]] = {
    "IS": {
        "net_sales": 4_250_000,
        "cost_of_goods_sold": 2_890_000,
        "sg_and_a": 720_000,
        "other_operating_expenses": 0,
        "depreciation_and_amortization": 180_000,
        "interest_expense": 85_000,
        "income_tax": 94_000,
    },
    "BS": {
        "cash": 185_000,
        "accounts_receivable": 620_000,
        "inventory": 890_000,
        "other_current_assets": 45_000,
        "fixed_assets_net": 1_420_000,
        "other_long_term_assets": 135_000,
        "accounts_payable": 410_000,
        "accrued_liabilities": 185_000,
        "other_current_liabilities": 95_000,
        "other_long_term_liabilities": 850_000,
        "total_equity": 1_755_000,
    },
    "CF": {
        "cf_net_income": 281_000,
        "add_depreciation_amortization": 180_000,
        "add_other_non_cash": 0,
        "change_accounts_receivable": -45_000,
        "change_accounts_payable": 20_000,
        "change_other_working_capital": -15_000,
        "capital_expenditures": -210_000,
        "other_investing": 0,
        "other_financing": -120_000,
    },
}


async def import_demo_trial_balance(
    spread_id: int, period_id: int, user: User, db: AsyncSession
) -> dict:
    """Write the demo QuickBooks trial balance into the given period.

    Returns a summary of what was imported.
    """
    # Ownership check on spread
    spread_q = select(Spread).where(Spread.id == spread_id)
    if user.role == UserRole.analyst:
        spread_q = spread_q.where(Spread.created_by == user.id)
    spread = (await db.execute(spread_q)).scalar_one_or_none()
    if not spread:
        raise HTTPException(status_code=404, detail="Spread not found")

    # Period must belong to this spread
    period = (
        await db.execute(
            select(SpreadPeriod).where(
                SpreadPeriod.id == period_id,
                SpreadPeriod.spread_id == spread_id,
            )
        )
    ).scalar_one_or_none()
    if not period:
        raise HTTPException(status_code=404, detail="Period not found on this spread")

    # Upsert each line item directly (bypass spreading.service.upsert_line_item
    # because we want bulk insert without optimistic-lock checks for a fresh
    # connector import).
    fields_written = 0
    for statement, fields in DEMO_TRIAL_BALANCE.items():
        for field_key, value in fields.items():
            existing = (
                await db.execute(
                    select(SpreadLineItem).where(
                        SpreadLineItem.spread_period_id == period_id,
                        SpreadLineItem.rma_field_key == field_key,
                    )
                )
            ).scalar_one_or_none()
            if existing:
                existing.value = value
                existing.source = "quickbooks"
                existing.confidence_score = 1.0
            else:
                db.add(
                    SpreadLineItem(
                        spread_period_id=period_id,
                        statement=statement,
                        rma_field_key=field_key,
                        value=value,
                        source="quickbooks",
                        confidence_score=1.0,
                    )
                )
            fields_written += 1
    await db.flush()

    return {
        "company": DEMO_COMPANY_NAME,
        "fiscal_year": period.fiscal_year,
        "fields_imported": fields_written,
        "source": "quickbooks_demo",
    }
