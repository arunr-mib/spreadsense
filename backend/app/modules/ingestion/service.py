import logging
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from fastapi import HTTPException, status

from app.models.extraction_job import ExtractionJob, ExtractionStatus
from app.models.spread_line_item import SpreadLineItem
from app.models.user import User
from app.modules.ingestion.extractor import extract_text, detect_file_type
import app.modules.ingestion.claude_extractor as _claude_extractor
from app.modules.ingestion.rma_template import COMPUTED_FIELDS

logger = logging.getLogger(__name__)


async def upload_and_extract(
    spread_id: int,
    filename: str,
    content: bytes,
    user: User,
    db: AsyncSession,
) -> ExtractionJob:
    """Upload file, run Claude extraction, return ExtractionJob with results."""
    file_type = detect_file_type(filename)

    job = ExtractionJob(
        spread_id=spread_id,
        filename=filename,
        file_type=file_type,
        status=ExtractionStatus.processing,
        created_by=user.id,
    )
    db.add(job)
    await db.flush()
    await db.refresh(job)

    try:
        document_text = extract_text(content, file_type)
        results = await _claude_extractor.extract_financials(document_text)
        job.status = ExtractionStatus.ready
        job.results = results
    except Exception as e:
        logger.error("Extraction failed for job %s: %s", job.id, e)
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Extraction failed: {e}",
        )

    await db.flush()
    await db.refresh(job)
    return job


async def get_job(job_id: int, db: AsyncSession) -> ExtractionJob:
    result = await db.execute(select(ExtractionJob).where(ExtractionJob.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Extraction job not found")
    return job


async def confirm_extraction(
    job_id: int,
    period_id: int,
    overrides: dict[str, float],
    user: User,
    db: AsyncSession,
) -> ExtractionJob:
    """Write all extracted fields into the grid, applying analyst overrides where provided.

    overrides keys are "STMT.field_key" (e.g. "IS.net_sales"); values replace Claude's extracted value.
    """
    job = await get_job(job_id, db)
    if job.status not in (ExtractionStatus.ready,):
        raise HTTPException(status_code=400, detail=f"Job is not ready (status: {job.status})")

    results = job.results or {}

    for statement, fields in results.items():
        for field_key, extraction in fields.items():
            if field_key in COMPUTED_FIELDS:
                continue
            composite_key = f"{statement}.{field_key}"
            # Apply analyst override if present, otherwise use Claude's extracted value
            if composite_key in overrides:
                value = overrides[composite_key]
            else:
                value = extraction.get("value")
            confidence = extraction.get("confidence_score", 0.0)
            if value is None:
                continue

            # Upsert line item
            existing = await db.execute(
                select(SpreadLineItem).where(
                    SpreadLineItem.spread_period_id == period_id,
                    SpreadLineItem.rma_field_key == field_key,
                )
            )
            row = existing.scalar_one_or_none()
            source = job.file_type  # "pdf" | "xlsx" | "docx"

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
