from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from fastapi import HTTPException

from app.config import settings
from app.models.borrower import Borrower
from app.models.spread import Spread
from app.models.spread_period import SpreadPeriod
from app.models.spread_line_item import SpreadLineItem
from app.models.narrative_version import NarrativeVersion
from app.models.user import User, UserRole
from app.modules.narrative.schemas import NarrativeVersionRead


async def _get_spread(spread_id: int, user: User, db: AsyncSession) -> Spread:
    """Load a spread with ownership check. Returns 404 if not found or not owned."""
    query = select(Spread).where(Spread.id == spread_id)
    if user.role == UserRole.analyst:
        query = query.where(Spread.created_by == user.id)
    result = await db.execute(query)
    spread = result.scalar_one_or_none()
    if not spread:
        raise HTTPException(status_code=404, detail="Spread not found")
    return spread


async def _next_version(spread_id: int, db: AsyncSession) -> int:
    """Compute MAX(version)+1 for the spread, using row-level lock to prevent races."""
    # Lock the spread row first to prevent concurrent generate calls racing
    await db.execute(
        select(Spread).where(Spread.id == spread_id).with_for_update()
    )
    result = await db.execute(
        select(func.max(NarrativeVersion.version)).where(
            NarrativeVersion.spread_id == spread_id
        )
    )
    max_ver = result.scalar()
    return (max_ver or 0) + 1


def _build_narrative_row(
    narrative: NarrativeVersion, full_name: str
) -> NarrativeVersionRead:
    return NarrativeVersionRead(
        id=narrative.id,
        spread_id=narrative.spread_id,
        version=narrative.version,
        content=narrative.content,
        created_by=narrative.created_by,
        created_by_name=full_name,
        created_at=narrative.created_at,
    )


async def get_latest(
    spread_id: int, user: User, db: AsyncSession
) -> NarrativeVersionRead:
    """Return the latest narrative version or 404."""
    await _get_spread(spread_id, user, db)

    result = await db.execute(
        select(NarrativeVersion, User.full_name)
        .join(User, NarrativeVersion.created_by == User.id)
        .where(NarrativeVersion.spread_id == spread_id)
        .order_by(NarrativeVersion.version.desc())
        .limit(1)
    )
    row = result.first()
    if not row:
        raise HTTPException(status_code=404, detail="No narrative found")
    narrative, full_name = row
    return _build_narrative_row(narrative, full_name)


async def list_versions(
    spread_id: int, user: User, db: AsyncSession
) -> list[NarrativeVersionRead]:
    """Return all narrative versions DESC."""
    await _get_spread(spread_id, user, db)

    result = await db.execute(
        select(NarrativeVersion, User.full_name)
        .join(User, NarrativeVersion.created_by == User.id)
        .where(NarrativeVersion.spread_id == spread_id)
        .order_by(NarrativeVersion.version.desc())
    )
    rows = result.all()
    return [_build_narrative_row(narrative, full_name) for narrative, full_name in rows]


async def save(
    spread_id: int, content: str, user: User, db: AsyncSession
) -> NarrativeVersionRead:
    """Append-only save — creates a new version record."""
    await _get_spread(spread_id, user, db)
    version = await _next_version(spread_id, db)

    narrative = NarrativeVersion(
        spread_id=spread_id,
        content=content,
        version=version,
        created_by=user.id,
    )
    db.add(narrative)
    await db.flush()
    await db.refresh(narrative)

    return _build_narrative_row(narrative, user.full_name)


async def _claude_generate(prompt: str) -> str:
    """Isolated async function calling Anthropic API — isolated for testability."""
    import anthropic
    from app.config import settings
    client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
    message = await client.messages.create(
        model="claude-opus-4-5",
        max_tokens=4096,
        messages=[{"role": "user", "content": prompt}],
    )
    return message.content[0].text


async def generate(
    spread_id: int, user: User, db: AsyncSession
) -> NarrativeVersionRead:
    """Validate IS data exists, build prompt, call Claude, save version."""
    spread = await _get_spread(spread_id, user, db)

    # Load borrower for the prompt
    borrower_result = await db.execute(
        select(Borrower).where(Borrower.id == spread.borrower_id)
    )
    borrower = borrower_result.scalar_one_or_none()

    # Validate that IS line items exist for this spread
    result = await db.execute(
        select(SpreadLineItem)
        .join(SpreadPeriod, SpreadLineItem.spread_period_id == SpreadPeriod.id)
        .where(
            SpreadPeriod.spread_id == spread_id,
            SpreadLineItem.statement == "IS",
        )
        .limit(1)
    )
    is_item = result.scalar_one_or_none()
    if not is_item:
        raise HTTPException(
            status_code=422,
            detail="No Income Statement line items found for this spread",
        )

    # Load all SpreadPeriod records for the spread, ordered by fiscal_year
    periods_result = await db.execute(
        select(SpreadPeriod)
        .where(SpreadPeriod.spread_id == spread_id)
        .order_by(SpreadPeriod.fiscal_year)
    )
    periods = periods_result.scalars().all()

    # For each period, load ALL SpreadLineItem records (not just IS)
    period_summaries: list[str] = []
    for period in periods:
        items_result = await db.execute(
            select(SpreadLineItem)
            .where(SpreadLineItem.spread_period_id == period.id)
            .order_by(SpreadLineItem.statement, SpreadLineItem.rma_field_key)
        )
        items = items_result.scalars().all()

        # Group line items by statement
        by_statement: dict[str, list[str]] = {}
        for item in items:
            by_statement.setdefault(item.statement, [])
            by_statement[item.statement].append(
                f"    {item.rma_field_key}: {item.value}"
            )

        statement_blocks = "\n".join(
            f"  {stmt}:\n" + "\n".join(lines)
            for stmt, lines in sorted(by_statement.items())
        )
        period_summaries.append(
            f"Fiscal Year {period.fiscal_year}:\n{statement_blocks}"
        )

    borrower_name = borrower.name if borrower else "Unknown Borrower"

    prompt = f"""You are a senior commercial credit analyst writing a credit memo narrative.

BORROWER: {borrower_name}
DEAL: {spread.deal_name}

FINANCIAL DATA (USD, raw field values):
{chr(10).join(period_summaries)}

Write a professional credit memo narrative with these sections (use bold markdown headings):
**Company Overview & Revenue Trends**
**Profitability Analysis**
**Leverage & Coverage Assessment**
**Liquidity Position**
**UCA Cash Flow Quality**
**Key Credit Considerations**

Be specific with numbers. Reference actual values from the data. Be concise but thorough."""

    content = await _claude_generate(prompt)
    return await save(spread_id, content, user, db)
