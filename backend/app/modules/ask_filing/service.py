"""Ask-the-Filing: free-text Q&A grounded in the most-recent extracted document
text for a given spread.

Uses the same Sonnet model as variance commentary for the speed/quality
trade-off. Returns a single answer + a hint at where it came from in the
document (e.g., 'Item 1A — Risk Factors'), no full citation system in v1.
"""
from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.extraction_job import ExtractionJob, ExtractionStatus
from app.models.spread import Spread
from app.models.user import User, UserRole
from app.modules.ask_filing.schemas import AskResponse

logger = logging.getLogger(__name__)

MODEL_NAME = "claude-sonnet-4-5"

# How much of the document to send to Claude. 10-K extractions land around
# 400K chars; that's roughly 100K tokens, well within Sonnet's context.
# Cap at 600K (~150K tokens) to leave room for the system prompt + answer.
MAX_TEXT_CHARS = 600_000


async def _get_spread(spread_id: int, user: User, db: AsyncSession) -> Spread:
    q = select(Spread).where(Spread.id == spread_id)
    if user.role == UserRole.analyst:
        q = q.where(Spread.created_by == user.id)
    spread = (await db.execute(q)).scalar_one_or_none()
    if not spread:
        raise HTTPException(status_code=404, detail="Spread not found")
    return spread


async def _latest_text_job(
    spread_id: int, db: AsyncSession
) -> ExtractionJob | None:
    """Return the most recent extraction job for the spread that has
    extracted_text persisted."""
    q = (
        select(ExtractionJob)
        .where(
            ExtractionJob.spread_id == spread_id,
            ExtractionJob.status.in_(
                [ExtractionStatus.ready, ExtractionStatus.confirmed]
            ),
            ExtractionJob.extracted_text.isnot(None),
        )
        .order_by(ExtractionJob.created_at.desc())
        .limit(1)
    )
    return (await db.execute(q)).scalar_one_or_none()


def _build_prompt(question: str, document_text: str, filename: str) -> str:
    return f"""You are a senior commercial credit analyst answering a question
strictly from the provided source document. The document is the borrower's
{filename}.

RULES:
- Answer ONLY using information in the document below. Do not use prior
  knowledge or speculation.
- Be specific. Cite numbers when available.
- If the answer isn't in the document, say so explicitly.
- Keep the answer to 2-5 sentences unless the question genuinely requires
  more (e.g. a list).
- End with a brief "Source:" line indicating roughly where in the document
  the answer came from (e.g. "Source: Item 1A — Risk Factors", "Source: Note
  7 — Long-term Debt", "Source: MD&A — Liquidity and Capital Resources").
  If you can't tell, say "Source: not specifically located".

Return ONLY valid JSON, no preamble, no code fences:
{{
  "answer": "...the 2-5 sentence answer...",
  "source_hint": "Item 1A — Risk Factors"
}}

QUESTION: {question}

DOCUMENT (truncated to most relevant section):
{document_text}
"""


def _parse_response(raw: str) -> tuple[str, str | None]:
    text = raw.strip()
    fence = re.match(r"^```(?:json)?\s*\n(.*?)\n```\s*$", text, re.DOTALL)
    if fence:
        text = fence.group(1)
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError as e:
        logger.warning("Ask-the-Filing: invalid JSON from Claude: %s", text[:300])
        raise HTTPException(
            status_code=502,
            detail="Could not parse the answer. Try rephrasing your question.",
        ) from e
    answer = parsed.get("answer")
    source_hint = parsed.get("source_hint")
    if not isinstance(answer, str) or not answer.strip():
        raise HTTPException(
            status_code=502,
            detail="The answer was empty. Try rephrasing your question.",
        )
    return answer.strip(), (source_hint.strip() if isinstance(source_hint, str) else None)


async def _claude_generate(prompt: str) -> str:
    import anthropic

    client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
    message = await client.messages.create(
        model=MODEL_NAME,
        max_tokens=1024,
        messages=[{"role": "user", "content": prompt}],
    )
    return message.content[0].text


async def ask(
    spread_id: int, question: str, user: User, db: AsyncSession
) -> AskResponse:
    await _get_spread(spread_id, user, db)
    job = await _latest_text_job(spread_id, db)
    if not job:
        raise HTTPException(
            status_code=422,
            detail=(
                "No extracted document found for this spread. Upload a "
                "filing first (PDF, SEC fetch, or QuickBooks)."
            ),
        )
    text = (job.extracted_text or "")[:MAX_TEXT_CHARS]
    prompt = _build_prompt(question.strip(), text, job.filename)
    raw = await _claude_generate(prompt)
    answer, source_hint = _parse_response(raw)
    return AskResponse(
        answer=answer,
        source_hint=source_hint,
        filename=job.filename,
        answered_at=datetime.now(timezone.utc),
    )
