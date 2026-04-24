from fastapi import APIRouter, BackgroundTasks, Depends, UploadFile, File, Query, status, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.modules.ingestion import service
from app.modules.ingestion.schemas import ExtractionJobRead, ConfirmExtractionRequest

router = APIRouter(prefix="/ingestion", tags=["ingestion"])

ALLOWED_EXTENSIONS = {"pdf", "docx", "xlsx"}
MAX_BYTES = 50 * 1024 * 1024  # 50 MB


@router.post("/upload", response_model=ExtractionJobRead, status_code=status.HTTP_201_CREATED)
async def upload(
    spread_id: int = Query(...),
    file: UploadFile = File(...),
    background_tasks: BackgroundTasks = ...,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    filename = file.filename or "upload"
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=422, detail=f"Unsupported file type: .{ext}")

    file_bytes = await file.read()
    if len(file_bytes) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="File too large (max 50 MB)")

    job = await service.create_job(file, file_bytes, spread_id, user, db)
    background_tasks.add_task(service.run_extraction, job.id, file_bytes)
    return job


@router.get("/{job_id}", response_model=ExtractionJobRead)
async def get_job(
    job_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    job = await service.get_job(job_id, user, db)
    if not job:
        raise HTTPException(status_code=404, detail="Extraction job not found")
    return job


@router.post("/{job_id}/confirm", response_model=ExtractionJobRead)
async def confirm(
    job_id: int,
    body: ConfirmExtractionRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await service.confirm_extraction(job_id, body.period_id, body.overrides, user, db)
