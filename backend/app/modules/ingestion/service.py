import logging
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_
from fastapi import HTTPException, status
from fastapi import UploadFile

from app.database import AsyncSessionFactory
from app.models.extraction_job import ExtractionJob, ExtractionStatus
from app.models.spread import Spread
from app.models.spread_line_item import SpreadLineItem
from app.models.user import User, UserRole
from app.modules.ingestion.extractor import extract_text, detect_file_type
import app.modules.ingestion.claude_extractor as _claude_extractor
from app.modules.ingestion.rma_template import COMPUTED_FIELDS

logger = logging.getLogger(__name__)


async def create_job(
    file: UploadFile,
    file_bytes: bytes,
    spread_id: int,
    user: User,
    db: AsyncSession,
) -> ExtractionJob:
    """Validate file and create ExtractionJob immediately. Extraction runs separately."""
    filename = file.filename or "upload"
    file_type = detect_file_type(filename)

    job = ExtractionJob(
        spread_id=spread_id,
        filename=filename,
        file_type=file_type,
        status=ExtractionStatus.processing,
        phase="uploading",
        created_by=user.id,
    )
    db.add(job)
    await db.flush()
    await db.refresh(job)
    # Commit immediately so the background task can find the job via its own session
    await db.commit()
    return job


async def run_extraction(job_id: int, file_bytes: bytes) -> None:
    """Background task: extract IS/BS/CF from file_bytes, updating phase after each step."""
    async with AsyncSessionFactory() as session:
        try:
            job = await session.get(ExtractionJob, job_id)
            if not job:
                logger.error("run_extraction: job %s not found", job_id)
                return

            job.phase = "parsing"
            await session.commit()
            text = extract_text(file_bytes, job.file_type)
            logger.warning(
                "Extracted %d chars from %s (job %s) — first 200: %s",
                len(text), job.file_type, job_id, repr(text[:200]),
            )
            if len(text.strip()) < 200:
                raise ValueError(
                    f"PDF text extraction yielded only {len(text)} chars — "
                    "file may be image-based or corrupt"
                )

            job.phase = "extracting_is"
            await session.commit()
            is_fields = await _claude_extractor.extract_statement(text, "IS")

            job.phase = "extracting_bs"
            await session.commit()
            bs_fields = await _claude_extractor.extract_statement(text, "BS")

            job.phase = "extracting_cf"
            await session.commit()
            cf_fields = await _claude_extractor.extract_statement(text, "CF")

            job.results = {"IS": is_fields, "BS": bs_fields, "CF": cf_fields}
            # Persist text so Ask-the-Filing can answer free-text questions
            # against the same document later. Cap at ~2MB worth (most 10-Ks
            # land at 300-500K chars; 2M is room for huge audited files).
            job.extracted_text = text[:2_000_000]
            job.status = ExtractionStatus.ready
            job.phase = "ready"
            await session.commit()

        except Exception as exc:
            logger.error("Extraction failed for job %s: %s", job_id, exc)
            try:
                async with AsyncSessionFactory() as recovery_session:
                    j = await recovery_session.get(ExtractionJob, job_id)
                    if j:
                        j.status = ExtractionStatus.failed
                        j.phase = "failed"
                        await recovery_session.commit()
            except Exception:
                logger.exception("Failed to mark job %s as failed", job_id)


async def get_job(job_id: int, user: User, db: AsyncSession) -> Optional[ExtractionJob]:
    """Return job if visible to user (analysts see own spread's jobs only)."""
    result = await db.execute(
        select(ExtractionJob)
        .join(Spread, ExtractionJob.spread_id == Spread.id)
        .where(ExtractionJob.id == job_id)
        .where(
            or_(
                user.role != UserRole.analyst,
                Spread.created_by == user.id,
            )
        )
    )
    return result.scalar_one_or_none()


async def confirm_extraction(
    job_id: int,
    period_id: int,
    overrides: dict[str, float],
    user: User,
    db: AsyncSession,
) -> ExtractionJob:
    """Write extracted fields into the spread grid, applying analyst overrides."""
    job = await get_job(job_id, user, db)
    if not job:
        raise HTTPException(status_code=404, detail="Extraction job not found")
    if job.status not in (ExtractionStatus.ready,):
        raise HTTPException(status_code=400, detail=f"Job is not ready (status: {job.status})")

    results = job.results or {}

    for statement, fields in results.items():
        for field_key, extraction in fields.items():
            if field_key in COMPUTED_FIELDS:
                continue
            composite_key = f"{statement}.{field_key}"
            value = overrides.get(composite_key, extraction.get("value"))
            confidence = extraction.get("confidence_score", 0.0)
            if value is None:
                continue

            existing = await db.execute(
                select(SpreadLineItem).where(
                    SpreadLineItem.spread_period_id == period_id,
                    SpreadLineItem.rma_field_key == field_key,
                )
            )
            row = existing.scalar_one_or_none()
            source = job.file_type

            if row:
                row.value = value
                row.source = source
                row.confidence_score = confidence
            else:
                row = SpreadLineItem(
                    spread_period_id=period_id,
                    statement=statement,
                    rma_field_key=field_key,
                    value=value,
                    source=source,
                    confidence_score=confidence,
                )
                db.add(row)

    job.status = ExtractionStatus.confirmed
    await db.flush()
    await db.refresh(job)
    return job
