from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.borrower import Borrower
from app.models.spread import Spread
from app.models.spread_line_item import SpreadLineItem
from app.models.spread_period import SpreadPeriod
from app.models.user import User, UserRole
from app.modules.variance_commentary.schemas import (
    VarianceBullet,
    VarianceCommentaryResponse,
)

logger = logging.getLogger(__name__)

VALID_CATEGORIES = {
    "revenue",
    "margins",
    "liquidity",
    "leverage",
    "working_capital",
    "watch",
}

# Sonnet 4.5 was tested and produced excellent credit-narrative quality
# (DSO expansion, interest coverage delta, quality-of-earnings flags) at
# ~10-12s latency on a 30-line-item prompt. Opus adds 5s with no
# observable quality lift; Haiku risks losing the skeptical-analyst
# voice on multi-step ratio reasoning. Extractor stays on Opus.
MODEL_NAME = "claude-sonnet-4-5"


async def _get_spread(spread_id: int, user: User, db: AsyncSession) -> Spread:
    query = select(Spread).where(Spread.id == spread_id)
    if user.role == UserRole.analyst:
        query = query.where(Spread.created_by == user.id)
    result = await db.execute(query)
    spread = result.scalar_one_or_none()
    if not spread:
        raise HTTPException(status_code=404, detail="Spread not found")
    return spread


async def _load_periods_with_data(
    spread_id: int, db: AsyncSession
) -> list[tuple[SpreadPeriod, list[SpreadLineItem]]]:
    """Return (period, line_items) tuples for periods that have any line items,
    ordered by fiscal_year ascending."""
    periods_result = await db.execute(
        select(SpreadPeriod)
        .where(SpreadPeriod.spread_id == spread_id)
        .order_by(SpreadPeriod.fiscal_year)
    )
    periods = periods_result.scalars().all()

    out: list[tuple[SpreadPeriod, list[SpreadLineItem]]] = []
    for period in periods:
        items_result = await db.execute(
            select(SpreadLineItem)
            .where(SpreadLineItem.spread_period_id == period.id)
            .order_by(SpreadLineItem.statement, SpreadLineItem.rma_field_key)
        )
        items = items_result.scalars().all()
        if items:
            out.append((period, list(items)))
    return out


def _format_period_block(
    period: SpreadPeriod, items: list[SpreadLineItem]
) -> str:
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
    return f"Fiscal Year {period.fiscal_year}:\n{statement_blocks}"


def _build_prompt(borrower_name: str, deal_name: str, blocks: list[str]) -> str:
    return f"""You are a senior commercial credit analyst preparing brief notes for a credit committee.

BORROWER: {borrower_name}
DEAL: {deal_name}

FINANCIAL DATA (USD, raw field values, two periods):
{chr(10).join(blocks)}

Identify the 4 to 6 most material variances between the two periods. Be specific with numbers (cite actual values, percent change). Be skeptical — surface what could be hidden under the surface (for example: AR rising faster than revenue suggests collection risk; cash flowing out despite reported net income suggests aggressive recognition or working-capital strain; margin compression on flat costs suggests pricing pressure). End with exactly one forward-looking "Watch:" bullet on what could matter for credit risk in the next quarter.

Return ONLY valid JSON in this exact shape, no preamble, no code fences:
{{
  "bullets": [
    {{"text": "Net sales fell 12% YoY ($3.22B to $2.84B)...", "category": "revenue"}},
    ...
  ]
}}

Each bullet's "category" must be one of: revenue, margins, liquidity, leverage, working_capital, watch. The final "Watch:" bullet must use category "watch". Use plain language. No bullets points or markdown formatting inside text — just sentences.
"""


def _parse_response(raw: str) -> list[VarianceBullet]:
    """Parse Claude's JSON response. Strip code fences if present, validate categories."""
    text = raw.strip()
    # Strip ```json ... ``` fences if Claude added them despite instruction
    fence_match = re.match(r"^```(?:json)?\s*\n(.*?)\n```\s*$", text, re.DOTALL)
    if fence_match:
        text = fence_match.group(1)

    try:
        parsed = json.loads(text)
    except json.JSONDecodeError as e:
        logger.warning("Variance commentary: invalid JSON from Claude: %s", text[:300])
        raise HTTPException(
            status_code=502,
            detail="Variance commentary generation failed (invalid response format). Try again.",
        ) from e

    bullets_raw = parsed.get("bullets")
    if not isinstance(bullets_raw, list) or not bullets_raw:
        raise HTTPException(
            status_code=502,
            detail="Variance commentary generation returned no bullets. Try again.",
        )

    bullets: list[VarianceBullet] = []
    for b in bullets_raw:
        if not isinstance(b, dict):
            continue
        text_val = b.get("text")
        cat_val = b.get("category")
        if not isinstance(text_val, str) or not text_val.strip():
            continue
        if cat_val not in VALID_CATEGORIES:
            cat_val = "watch"  # graceful fallback
        bullets.append(VarianceBullet(text=text_val.strip(), category=cat_val))

    if not bullets:
        raise HTTPException(
            status_code=502,
            detail="Variance commentary returned no usable bullets. Try again.",
        )
    return bullets


async def _claude_generate(prompt: str) -> str:
    """Call Anthropic API. Isolated for testability."""
    import anthropic

    client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
    message = await client.messages.create(
        model=MODEL_NAME,
        max_tokens=2048,
        messages=[{"role": "user", "content": prompt}],
    )
    return message.content[0].text


async def generate_variance_commentary(
    spread_id: int, user: User, db: AsyncSession
) -> VarianceCommentaryResponse:
    spread = await _get_spread(spread_id, user, db)

    borrower_result = await db.execute(
        select(Borrower).where(Borrower.id == spread.borrower_id)
    )
    borrower = borrower_result.scalar_one_or_none()
    borrower_name = borrower.name if borrower else "Unknown Borrower"

    periods_with_data = await _load_periods_with_data(spread_id, db)
    if len(periods_with_data) < 2:
        raise HTTPException(
            status_code=422,
            detail="Variance commentary requires at least two periods with line-item data.",
        )

    # Use the two most recent periods (last two after fiscal_year ascending order)
    selected = periods_with_data[-2:]
    blocks = [_format_period_block(p, items) for (p, items) in selected]
    period_labels = [f"FY{p.fiscal_year}" for (p, _) in selected]

    prompt = _build_prompt(borrower_name, spread.deal_name, blocks)
    raw = await _claude_generate(prompt)
    bullets = _parse_response(raw)

    return VarianceCommentaryResponse(
        bullets=bullets,
        periods_analyzed=period_labels,
        generated_at=datetime.now(timezone.utc),
    )
