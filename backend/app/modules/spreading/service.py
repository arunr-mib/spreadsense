from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from fastapi import HTTPException, status

from app.models.spread_period import SpreadPeriod, PeriodType
from app.models.spread_line_item import SpreadLineItem
from app.models.adjustment import Adjustment
from app.models.user import User
from app.modules.ingestion.rma_template import (
    IS_FIELDS, BS_FIELDS, CF_FIELDS,
    COMPUTED_FIELDS, compute_period_values,
    validate_balance_sheet, _get,
)
from app.modules.spreading.schemas import (
    SpreadPeriodCreate, LineItemUpdate, SpreadLineItemRead,
    BalanceSheetValidationPeriod, BalanceSheetValidationResponse,
    AdjustmentCreate,
)

STATEMENT_FIELDS = {"IS": IS_FIELDS, "BS": BS_FIELDS, "CF": CF_FIELDS}


async def create_period(spread_id: int, data: SpreadPeriodCreate, db: AsyncSession) -> SpreadPeriod:
    # Check for duplicate
    existing = await db.execute(
        select(SpreadPeriod).where(
            SpreadPeriod.spread_id == spread_id,
            SpreadPeriod.fiscal_year == data.fiscal_year,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                            detail=f"Period for fiscal year {data.fiscal_year} already exists")
    period = SpreadPeriod(
        spread_id=spread_id,
        fiscal_year=data.fiscal_year,
        period_type=PeriodType(data.period_type),
    )
    db.add(period)
    await db.flush()
    await db.refresh(period)
    return period


async def list_periods(spread_id: int, db: AsyncSession) -> list[SpreadPeriod]:
    result = await db.execute(
        select(SpreadPeriod)
        .where(SpreadPeriod.spread_id == spread_id)
        .order_by(SpreadPeriod.fiscal_year)
    )
    return list(result.scalars().all())


async def get_line_items(period_id: int, statement: str, db: AsyncSession) -> list[SpreadLineItemRead]:
    """Return all fields for a statement, merging DB values with computed subtotals."""
    fields = STATEMENT_FIELDS.get(statement, [])

    # Load stored line items for this period + statement
    result = await db.execute(
        select(SpreadLineItem).where(
            SpreadLineItem.spread_period_id == period_id,
            SpreadLineItem.statement == statement,
        )
    )
    stored = {row.rma_field_key: row for row in result.scalars().all()}

    # Build raw values dict for computation
    raw_values = {key: stored[key].value for key in stored if stored[key].value is not None}

    # Compute subtotals
    computed_values = compute_period_values(statement, raw_values)

    items = []
    for field in fields:
        key = field["key"]
        is_computed = field["computed"]
        if is_computed:
            val = computed_values.get(key)
            items.append(SpreadLineItemRead(
                id=None,
                spread_period_id=period_id,
                statement=statement,
                rma_field_key=key,
                label=field["label"],
                value=val,
                computed=True,
            ))
        else:
            row = stored.get(key)
            items.append(SpreadLineItemRead(
                id=row.id if row else None,
                spread_period_id=period_id,
                statement=statement,
                rma_field_key=key,
                label=field["label"],
                value=row.value if row else None,
                computed=False,
                source=row.source if row else None,
                confidence_score=row.confidence_score if row else None,
                updated_at=row.updated_at if row else None,
            ))
    return items


async def upsert_line_item(
    period_id: int,
    field_key: str,
    data: LineItemUpdate,
    user: User,
    db: AsyncSession,
) -> SpreadLineItemRead:
    # Reject computed fields
    if field_key in COMPUTED_FIELDS:
        raise HTTPException(status_code=422, detail=f"'{field_key}' is a computed field — cannot be set directly")

    # Determine statement from field key
    statement = _field_statement(field_key)
    if not statement:
        raise HTTPException(status_code=404, detail=f"Unknown field key: {field_key}")

    # Load existing
    result = await db.execute(
        select(SpreadLineItem).where(
            SpreadLineItem.spread_period_id == period_id,
            SpreadLineItem.rma_field_key == field_key,
        )
    )
    row = result.scalar_one_or_none()

    # Optimistic lock check
    if row and data.updated_at and row.updated_at and row.updated_at > data.updated_at:
        raise HTTPException(status_code=409, detail="Data has changed — please refresh")

    if row:
        row.value = data.value
        row.source = "manual"
    else:
        row = SpreadLineItem(
            spread_period_id=period_id,
            statement=statement,
            rma_field_key=field_key,
            value=data.value,
            source="manual",
        )
        db.add(row)

    await db.flush()
    await db.refresh(row)

    field_def = next(f for f in STATEMENT_FIELDS[statement] if f["key"] == field_key)
    return SpreadLineItemRead(
        id=row.id,
        spread_period_id=period_id,
        statement=statement,
        rma_field_key=field_key,
        label=field_def["label"],
        value=row.value,
        computed=False,
        source=row.source,
        updated_at=row.updated_at,
    )


async def validate_spread_bs(spread_id: int, db: AsyncSession) -> BalanceSheetValidationResponse:
    periods = await list_periods(spread_id, db)
    results = []
    all_ok = True
    for period in periods:
        items = await get_line_items(period.id, "BS", db)
        vals = {i.rma_field_key: i.value for i in items}
        ta  = _get(vals, "total_assets")
        tle = _get(vals, "total_liabilities_and_equity")
        diff = abs(ta - tle) if (ta is not None and tle is not None) else None
        balanced = validate_balance_sheet(vals)
        if not balanced:
            all_ok = False
        results.append(BalanceSheetValidationPeriod(
            period_id=period.id,
            fiscal_year=period.fiscal_year,
            balanced=balanced,
            total_assets=ta,
            total_liabilities_and_equity=tle,
            difference=diff,
        ))
    return BalanceSheetValidationResponse(spread_id=spread_id, all_balanced=all_ok, periods=results)


def _field_statement(key: str) -> Optional[str]:
    for stmt, fields in STATEMENT_FIELDS.items():
        if any(f["key"] == key for f in fields):
            return stmt
    return None


async def create_adjustment(period_id: int, data: AdjustmentCreate,
                             user: User, db: AsyncSession) -> Adjustment:
    adj = Adjustment(
        spread_line_item_id=data.spread_line_item_id,
        delta=data.delta,
        reason=data.reason,
        created_by=user.id,
    )
    db.add(adj)
    await db.flush()
    await db.refresh(adj)
    return adj


async def list_adjustments(period_id: int, db: AsyncSession) -> list[Adjustment]:
    result = await db.execute(
        select(Adjustment)
        .join(SpreadLineItem, Adjustment.spread_line_item_id == SpreadLineItem.id)
        .where(SpreadLineItem.spread_period_id == period_id)
        .order_by(Adjustment.created_at)
    )
    return list(result.scalars().all())
