from fastapi import APIRouter, Depends, UploadFile, File, Query, status, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.modules.ingestion import service
from app.modules.ingestion.schemas import ExtractionJobRead, ConfirmExtractionRequest

router = APIRouter(prefix="/ingestion", tags=["ingestion"])

# "doc" (Word 97) and "xls" (BIFF) omitted — python-docx/openpyxl cannot parse legacy binary formats
ALLOWED_EXTENSIONS = {"pdf", "docx", "xlsx"}
MAX_BYTES = 50 * 1024 * 1024  # 50 MB


@router.post("/upload", response_model=ExtractionJobRead, status_code=status.HTTP_201_CREATED)
async def upload(
    spread_id: int = Query(...),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # Validate file extension
    filename = file.filename or "upload"
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=422, detail=f"Unsupported file type: .{ext}")

    content = await file.read()
    if len(content) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="File too large (max 50 MB)")

    job = await service.create_job(file, content, spread_id, user, db)
    # Run extraction inline (synchronously) until Task 6 replaces this router
    # with BackgroundTasks. Using the same db session preserves test isolation.
    from app.modules.ingestion.extractor import extract_text
    import app.modules.ingestion.claude_extractor as _claude_extractor
    try:
        job.phase = "parsing"
        text = extract_text(content, job.file_type)
        job.phase = "extracting_is"
        is_fields = await _claude_extractor.extract_statement(text, "IS")
        job.phase = "extracting_bs"
        bs_fields = await _claude_extractor.extract_statement(text, "BS")
        job.phase = "extracting_cf"
        cf_fields = await _claude_extractor.extract_statement(text, "CF")
        job.results = {"IS": is_fields, "BS": bs_fields, "CF": cf_fields}
        job.status = "ready"
        job.phase = "ready"
    except Exception as exc:
        import logging
        logging.getLogger(__name__).error("Extraction failed for job %s: %s", job.id, exc)
        job.status = "failed"
        job.phase = "failed"
    await db.flush()
    await db.refresh(job)
    return job


@router.get("/{job_id}", response_model=ExtractionJobRead)
async def get_job(job_id: int, db: AsyncSession = Depends(get_db),
                  user: User = Depends(get_current_user)):
    job = await service.get_job(job_id, user, db)
    if not job:
        raise HTTPException(status_code=404, detail="Extraction job not found")
    return job


@router.post("/{job_id}/confirm", response_model=ExtractionJobRead)
async def confirm(job_id: int, body: ConfirmExtractionRequest,
                  db: AsyncSession = Depends(get_db),
                  user: User = Depends(get_current_user)):
    return await service.confirm_extraction(job_id, body.period_id, body.overrides, user, db)
