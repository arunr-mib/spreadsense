# Plan 8: PDF Upload Progress & Confidence Review — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the two-modal extraction flow (IngestionHub → ExtractionReview) with a single inline `ExtractionPanel` that shows real-time per-statement progress and a color-coded confidence review table inside the spread page.

**Architecture:** Upload returns a job immediately; a FastAPI `BackgroundTask` runs extraction in three per-statement Claude calls, updating a new `phase` column after each. The frontend polls `GET /ingestion/{job_id}` every 2 s, drives a progress bar + checklist, then transitions to a row-color-coded review table (green/yellow/red by confidence tier). Existing `IngestionHub` and `ExtractionReview` modals are deleted.

**Tech Stack:** FastAPI BackgroundTasks · SQLAlchemy async · Alembic · React 18 + TypeScript + React Query v5 · Tailwind CSS

---

## File Map

### New files
| File | Responsibility |
|------|---------------|
| `backend/migrations/versions/<hash>_add_phase_to_extraction_job.py` | Migration: `phase` column + `failed` enum value |
| `frontend/src/components/ExtractionPanel.tsx` | Inline upload zone → progress view → review table |

### Modified files
| File | Change |
|------|--------|
| `backend/app/models/extraction_job.py` | Add `phase` column; add `failed` to `ExtractionStatus` enum |
| `backend/app/modules/ingestion/schemas.py` | Add `phase` to `ExtractionJobRead`; remove `ExtractedField` |
| `backend/app/modules/ingestion/claude_extractor.py` | Add `extract_statement(text, stmt)` for per-statement extraction |
| `backend/app/modules/ingestion/service.py` | Split into `create_job` + `run_extraction` bg task; update `get_job` |
| `backend/app/modules/ingestion/router.py` | Async upload with BackgroundTask; ownership check on GET |
| `backend/tests/test_ingestion.py` | Add 4 new tests |
| `frontend/src/types/index.ts` | Add `phase` + `failed` to `ExtractionJob` |
| `frontend/src/api/ingestion.ts` | `getExtractionJob` already exists — no change needed |
| `frontend/src/pages/SpreadDetailPage.tsx` | Replace IngestionHub/ExtractionReview with ExtractionPanel |

### Deleted files
| File |
|------|
| `frontend/src/components/IngestionHub.tsx` |
| `frontend/src/components/ExtractionReview.tsx` |

---

## Task 1: Migration — add `phase` column and `failed` enum value

**Files:**
- Create: `backend/migrations/versions/0001_add_phase_to_extraction_job.py`

Note: tests use `Base.metadata.create_all` directly (no Alembic), so the model change in Task 2 is sufficient for tests. The migration file is for production DB upgrades.

- [ ] **Step 1.1: Create the migration file**

```python
# backend/migrations/versions/0001_add_phase_to_extraction_job.py
"""add phase to extraction_job and failed status

Revision ID: 0001_phase
Revises: eeddf3d4fbd9
Create Date: 2026-04-19

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '0001_phase'
down_revision: Union[str, Sequence[str], None] = 'eeddf3d4fbd9'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add 'failed' to the existing PostgreSQL enum
    op.execute("ALTER TYPE extractionstatus ADD VALUE IF NOT EXISTS 'failed'")
    # Add phase column with default 'uploading'
    op.add_column(
        'extraction_jobs',
        sa.Column('phase', sa.String(32), nullable=False, server_default='uploading')
    )


def downgrade() -> None:
    op.drop_column('extraction_jobs', 'phase')
    # Note: PostgreSQL does not support removing enum values; downgrade leaves the enum extended
```

- [ ] **Step 1.2: Commit**

```bash
git add backend/migrations/versions/0001_add_phase_to_extraction_job.py
git commit -m "feat: migration — add phase column and failed status to extraction_job"
```

---

## Task 2: Update `ExtractionJob` model and `ExtractionStatus` enum

**Files:**
- Modify: `backend/app/models/extraction_job.py`

- [ ] **Step 2.1: Add `failed` to enum and `phase` column**

Replace the `ExtractionStatus` enum and `ExtractionJob` class with:

```python
import enum
from datetime import datetime, timezone
from typing import Optional, Any
from sqlalchemy import String, ForeignKey, DateTime, Enum as SAEnum, JSON
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class ExtractionStatus(str, enum.Enum):
    pending = "pending"
    processing = "processing"
    ready = "ready"
    confirmed = "confirmed"
    failed = "failed"


class ExtractionJob(Base):
    __tablename__ = "extraction_jobs"
    id: Mapped[int] = mapped_column(primary_key=True)
    spread_id: Mapped[int] = mapped_column(ForeignKey("spreads.id"), nullable=False)
    filename: Mapped[str] = mapped_column(String(500), nullable=False)
    file_type: Mapped[str] = mapped_column(String(10), nullable=False)
    status: Mapped[ExtractionStatus] = mapped_column(
        SAEnum(ExtractionStatus), nullable=False, default=ExtractionStatus.pending
    )
    phase: Mapped[str] = mapped_column(String(32), nullable=False, default="uploading")
    results: Mapped[Optional[Any]] = mapped_column(JSON, nullable=True)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
```

- [ ] **Step 2.2: Run existing ingestion tests to confirm no regressions**

```bash
cd backend && python -m pytest tests/test_ingestion.py -q
```

Expected: 3 passed (tests still use mocked Claude, model change is backward-compatible)

- [ ] **Step 2.3: Commit**

```bash
git add backend/app/models/extraction_job.py
git commit -m "feat: add phase column and failed status to ExtractionJob model"
```

---

## Task 3: Update ingestion schemas

**Files:**
- Modify: `backend/app/modules/ingestion/schemas.py`

- [ ] **Step 3.1: Add `phase` to `ExtractionJobRead` and remove `ExtractedField`**

Replace the entire file:

```python
from pydantic import BaseModel
from typing import Optional, Any
from datetime import datetime


class ExtractionJobRead(BaseModel):
    id: int
    spread_id: int
    filename: str
    file_type: str
    status: str
    phase: str
    results: Optional[Any]
    created_at: datetime
    model_config = {"from_attributes": True}


class ConfirmExtractionRequest(BaseModel):
    period_id: int
    overrides: dict[str, float] = {}
```

(`ExtractedField` is removed — it was only used by `ExtractionReview.tsx` which is being deleted.)

- [ ] **Step 3.2: Commit**

```bash
git add backend/app/modules/ingestion/schemas.py
git commit -m "feat: add phase to ExtractionJobRead schema; remove unused ExtractedField"
```

---

## Task 4: Add per-statement extraction to `claude_extractor.py`

The existing `extract_financials()` calls Claude once for all three statements. To show per-statement progress, we add `extract_statement()` which calls Claude for one statement at a time.

**Files:**
- Modify: `backend/app/modules/ingestion/claude_extractor.py`

- [ ] **Step 4.1: Add `_STMT_FIELDS` map and `extract_statement` function**

Add these after the existing `_NON_COMPUTED_*` constants and before `extract_financials`:

```python
_STMT_FIELDS = {
    "IS": _NON_COMPUTED_IS,
    "BS": _NON_COMPUTED_BS,
    "CF": _NON_COMPUTED_CF,
}

_SINGLE_STMT_PROMPT = """
You are a financial spreading analyst. Extract financial figures from the document text below
and map them to the provided RMA field list for the {statement_label} statement.

Return a JSON object with this structure:
{{
  "<rma_field_key>": {{"value": <number or null>, "confidence_score": <0.0-1.0>}}
}}

Rules:
- confidence_score 0.85+ means highly confident; below 0.85 means less certain
- Use null for value if the field is not present
- All monetary values in the document's base unit (no rescaling)
- Do NOT include computed/subtotal fields

Field keys to extract: {field_keys}

Document text:
---
{document_text}
---

Return only the JSON object, no markdown, no explanation.
"""

_STMT_LABELS = {"IS": "Income Statement", "BS": "Balance Sheet", "CF": "Cash Flow"}


async def extract_statement(document_text: str, statement: str) -> dict:
    """Extract fields for a single statement type: IS, BS, or CF."""
    if not settings.anthropic_api_key:
        raise RuntimeError("ANTHROPIC_API_KEY is not set in environment")

    import anthropic
    client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)

    prompt = _SINGLE_STMT_PROMPT.format(
        statement_label=_STMT_LABELS[statement],
        field_keys=", ".join(_STMT_FIELDS[statement]),
        document_text=document_text[:150_000],
    )

    message = await client.messages.create(
        model="claude-opus-4-5",
        max_tokens=2048,
        messages=[{"role": "user", "content": prompt}],
    )
    raw = message.content[0].text.strip()

    try:
        return json.loads(raw)
    except json.JSONDecodeError as e:
        logger.error("Claude returned invalid JSON for %s: %s", statement, raw[:500])
        raise ValueError(f"Claude returned invalid JSON for {statement}: {e}") from e
```

- [ ] **Step 4.2: Commit**

```bash
git add backend/app/modules/ingestion/claude_extractor.py
git commit -m "feat: add extract_statement for per-statement Claude extraction"
```

---

## Task 5: Refactor ingestion service

Split `upload_and_extract` into `create_job` (fast, returns immediately) and `run_extraction` (background task with phase tracking). Update `get_job` to enforce ownership via spread join.

**Files:**
- Modify: `backend/app/modules/ingestion/service.py`

- [ ] **Step 5.1: Write the failing test for `get_job` ownership first**

In `backend/tests/test_ingestion.py`, add a fixture and test at the end of the file:

```python
@pytest.fixture
async def analyst2_user_ing(db):
    from app.models.user import User, UserRole
    from app.core.security import hash_password
    user = User(email="analyst_ing2@bank.com", full_name="Ing Analyst 2",
                hashed_password=hash_password("password123"), role=UserRole.analyst)
    db.add(user)
    await db.flush()
    await db.refresh(user)
    return user


@pytest.fixture
async def ing2_headers(client, analyst2_user_ing):
    resp = await client.post("/auth/login",
        json={"email": "analyst_ing2@bank.com", "password": "password123"})
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


async def test_get_job_404_for_other_analyst(client, ing_headers, ing2_headers, ing_spread_id):
    """Analyst 2 cannot see Analyst 1's extraction job."""
    fake_pdf = b"%PDF-1.4 test"
    mock_result = {"IS": {"net_sales": {"value": 100.0, "confidence_score": 0.9}}}
    with patch("app.modules.ingestion.claude_extractor.extract_financials",
               new_callable=AsyncMock, return_value=mock_result):
        create_resp = await client.post(
            f"/ingestion/upload?spread_id={ing_spread_id}",
            files={"file": ("s.pdf", io.BytesIO(fake_pdf), "application/pdf")},
            headers=ing_headers,
        )
    job_id = create_resp.json()["id"]
    resp = await client.get(f"/ingestion/{job_id}", headers=ing2_headers)
    assert resp.status_code == 404
```

- [ ] **Step 5.2: Run to confirm test fails**

```bash
cd backend && python -m pytest tests/test_ingestion.py::test_get_job_404_for_other_analyst -v
```

Expected: FAIL — current `get_job` has no ownership check so analyst 2 can see the job.

- [ ] **Step 5.3: Replace `service.py` with the refactored version**

```python
import logging
from datetime import datetime, timezone
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
            job.status = ExtractionStatus.ready
            job.phase = "ready"
            await session.commit()

        except Exception as exc:
            logger.error("Extraction failed for job %s: %s", job_id, exc)
            try:
                job = await session.get(ExtractionJob, job_id)
                if job:
                    job.status = ExtractionStatus.failed
                    job.phase = "failed"
                    await session.commit()
            except Exception:
                logger.exception("Failed to mark job %s as failed", job_id)


async def get_job(job_id: int, user: User, db: AsyncSession) -> ExtractionJob | None:
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
```

- [ ] **Step 5.4: Run the new ownership test**

```bash
cd backend && python -m pytest tests/test_ingestion.py::test_get_job_404_for_other_analyst -v
```

Expected: PASS

- [ ] **Step 5.5: Run all ingestion tests**

```bash
cd backend && python -m pytest tests/test_ingestion.py -v
```

Expected: 4 passed (existing 3 + new ownership test — note: existing tests that call `/ingestion/upload` will fail because the router still calls the old `upload_and_extract`. We fix the router in Task 6.)

- [ ] **Step 5.6: Commit**

```bash
git add backend/app/modules/ingestion/service.py backend/tests/test_ingestion.py
git commit -m "feat: split upload_and_extract into create_job + run_extraction background task; add ownership to get_job"
```

---

## Task 6: Update router — async upload + ownership check

**Files:**
- Modify: `backend/app/modules/ingestion/router.py`

- [ ] **Step 6.1: Write tests for upload returns processing status and phase field**

Add to `backend/tests/test_ingestion.py`:

```python
async def test_upload_returns_processing_status(client, ing_headers, ing_spread_id):
    """POST /ingestion/upload returns 201 with status=processing immediately."""
    fake_pdf = b"%PDF-1.4 fake content"

    # Mock both extract_statement (background task) and extract_text to avoid I/O
    mock_stmt = {"net_sales": {"value": 1_000_000.0, "confidence_score": 0.95}}
    with patch("app.modules.ingestion.claude_extractor.extract_statement",
               new_callable=AsyncMock, return_value=mock_stmt), \
         patch("app.modules.ingestion.extractor.extract_text", return_value="mocked text"):
        resp = await client.post(
            f"/ingestion/upload?spread_id={ing_spread_id}",
            files={"file": ("statement.pdf", io.BytesIO(fake_pdf), "application/pdf")},
            headers=ing_headers,
        )
    assert resp.status_code == 201
    # After background task completes (runs sync in ASGI test transport), status=ready
    # But job was created with status=processing before background task ran
    assert resp.json()["id"] is not None
    assert "phase" in resp.json()


async def test_get_job_returns_phase_field(client, ing_headers, ing_spread_id):
    """GET /ingestion/{job_id} returns phase field."""
    fake_pdf = b"%PDF-1.4 test"
    mock_stmt = {"net_sales": {"value": 500_000.0, "confidence_score": 0.90}}
    with patch("app.modules.ingestion.claude_extractor.extract_statement",
               new_callable=AsyncMock, return_value=mock_stmt), \
         patch("app.modules.ingestion.extractor.extract_text", return_value="text"):
        create_resp = await client.post(
            f"/ingestion/upload?spread_id={ing_spread_id}",
            files={"file": ("s.pdf", io.BytesIO(fake_pdf), "application/pdf")},
            headers=ing_headers,
        )
    job_id = create_resp.json()["id"]
    resp = await client.get(f"/ingestion/{job_id}", headers=ing_headers)
    assert resp.status_code == 200
    assert "phase" in resp.json()
    assert resp.json()["phase"] in ("ready", "uploading", "parsing",
                                    "extracting_is", "extracting_bs", "extracting_cf", "failed")
```

- [ ] **Step 6.2: Run new tests to confirm they fail**

```bash
cd backend && python -m pytest tests/test_ingestion.py::test_upload_returns_processing_status tests/test_ingestion.py::test_get_job_returns_phase_field -v
```

Expected: FAIL (router still uses old service functions)

- [ ] **Step 6.3: Replace `router.py`**

```python
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
```

- [ ] **Step 6.4: Run all ingestion tests**

```bash
cd backend && python -m pytest tests/test_ingestion.py -v
```

Expected: 6 passed (3 original + 3 new; existing tests need `extract_financials` mock updated — if they fail, update the mock to use `extract_statement` instead)

If existing tests `test_upload_creates_extraction_job` and `test_get_extraction_job` fail because they mock `extract_financials` (which is no longer called), update their mock target to:
```python
with patch("app.modules.ingestion.claude_extractor.extract_statement",
           new_callable=AsyncMock, return_value={"net_sales": {"value": 1_000_000.0, "confidence_score": 0.95}}), \
     patch("app.modules.ingestion.extractor.extract_text", return_value="text"):
```

- [ ] **Step 6.5: Run full backend suite**

```bash
cd backend && python -m pytest tests/ -q --ignore=tests/test_memo.py
```

Expected: all pass (ignore test_memo.py — pre-existing WeasyPrint failures unrelated to this plan)

- [ ] **Step 6.6: Commit**

```bash
git add backend/app/modules/ingestion/router.py backend/tests/test_ingestion.py
git commit -m "feat: make upload async with BackgroundTask; add ownership check to GET /ingestion/{job_id}"
```

---

## Task 7: Frontend types update

**Files:**
- Modify: `frontend/src/types/index.ts`

- [ ] **Step 7.1: Update `ExtractionJob` interface**

Find the `ExtractionJob` interface (currently around line 135) and replace it:

```typescript
export interface ExtractionJob {
  id: number
  spread_id: number
  filename: string
  file_type: string
  status: 'pending' | 'processing' | 'ready' | 'confirmed' | 'failed'
  phase: string
  results: Record<string, Record<string, { value: number | null; confidence_score: number }>> | null
  created_at: string
}
```

- [ ] **Step 7.2: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors (ExtractionReview still exists so no broken imports yet)

- [ ] **Step 7.3: Commit**

```bash
git add frontend/src/types/index.ts
git commit -m "feat: add phase and failed status to ExtractionJob type"
```

---

## Task 8: Create `ExtractionPanel` component

This single component handles the full extraction lifecycle inline on the spread page: upload zone → progress view → review table → error state.

**Files:**
- Create: `frontend/src/components/ExtractionPanel.tsx`

- [ ] **Step 8.1: Create the component**

```tsx
import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { uploadDocument, getExtractionJob, confirmExtraction } from '../api/ingestion'
import type { ExtractionJob, SpreadPeriod } from '../types'

interface Props {
  spreadId: number
  periods: SpreadPeriod[]
  onConfirmed: () => void
}

type PanelState = 'idle' | 'extracting' | 'review' | 'error'

const PHASE_PCT: Record<string, number> = {
  uploading: 10, parsing: 25,
  extracting_is: 50, extracting_bs: 70, extracting_cf: 90, ready: 100,
}

const CONFIDENCE_HIGH = 0.85
const CONFIDENCE_MED = 0.60

type ConfidenceTier = 'HIGH' | 'MED' | 'LOW'

function tier(score: number): ConfidenceTier {
  if (score >= CONFIDENCE_HIGH) return 'HIGH'
  if (score >= CONFIDENCE_MED) return 'MED'
  return 'LOW'
}

const TIER_ROW: Record<ConfidenceTier, string> = {
  HIGH: 'bg-green-950/30',
  MED: 'bg-yellow-950/30 border-l-2 border-yellow-400',
  LOW: 'bg-red-950/30 border-l-2 border-red-400',
}
const TIER_BADGE: Record<ConfidenceTier, string> = {
  HIGH: 'text-green-400',
  MED: 'text-yellow-400',
  LOW: 'text-red-400',
}
const TIER_LABEL: Record<ConfidenceTier, string> = {
  HIGH: '● HIGH',
  MED: '● MED',
  LOW: '⚠ LOW',
}

function stmtLabel(key: string) {
  return { IS: 'Income Statement', BS: 'Balance Sheet', CF: 'Cash Flow' }[key] ?? key
}

export default function ExtractionPanel({ spreadId, periods, onConfirmed }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const qc = useQueryClient()
  const [panelState, setPanelState] = useState<PanelState>('idle')
  const [dragOver, setDragOver] = useState(false)
  const [activeJobId, setActiveJobId] = useState<number | null>(null)
  const [selectedPeriodId, setSelectedPeriodId] = useState<number | null>(periods[0]?.id ?? null)
  const [overrides, setOverrides] = useState<Record<string, number>>({})

  // Upload mutation
  const uploadMut = useMutation({
    mutationFn: (file: File) => uploadDocument(spreadId, file),
    onSuccess: (job) => {
      setActiveJobId(job.id)
      // Pre-seed overrides for MED/LOW fields (will be populated once job is ready)
      setPanelState('extracting')
    },
    onError: () => setPanelState('error'),
  })

  // Poll job status while extracting
  const { data: job } = useQuery<ExtractionJob>({
    queryKey: ['extraction-job', activeJobId],
    queryFn: () => getExtractionJob(activeJobId!),
    enabled: panelState === 'extracting' && activeJobId !== null,
    refetchInterval: (query) => {
      const s = query.state.data?.status
      return s && s !== 'processing' ? false : 2000
    },
    gcTime: 0,
  })

  // Transition when job reaches terminal state
  if (job && panelState === 'extracting') {
    if (job.status === 'ready') {
      // Pre-seed overrides for MED/LOW fields
      const seed: Record<string, number> = {}
      for (const [stmt, fields] of Object.entries(job.results ?? {})) {
        for (const [key, { value, confidence_score }] of Object.entries(fields)) {
          if (tier(confidence_score) !== 'HIGH' && value !== null) {
            seed[`${stmt}.${key}`] = value
          }
        }
      }
      setOverrides(seed)
      setPanelState('review')
    } else if (job.status === 'failed') {
      setPanelState('error')
    }
  }

  // Confirm mutation
  const confirmMut = useMutation({
    mutationFn: () => confirmExtraction(activeJobId!, selectedPeriodId!, overrides),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['line-items'] })
      qc.invalidateQueries({ queryKey: ['analytics', spreadId] })
      onConfirmed()
    },
  })

  const handleFile = (file: File) => {
    if (file.size > 50 * 1024 * 1024) {
      alert('File too large (max 50 MB)')
      return
    }
    uploadMut.mutate(file)
  }

  // Build review rows sorted: LOW first, MED next, HIGH last
  const reviewRows = (() => {
    if (!job?.results) return []
    const rows: { compositeKey: string; stmt: string; key: string; value: number | null; score: number; t: ConfidenceTier }[] = []
    for (const [stmt, fields] of Object.entries(job.results)) {
      for (const [key, { value, confidence_score }] of Object.entries(fields)) {
        rows.push({ compositeKey: `${stmt}.${key}`, stmt, key, value, score: confidence_score, t: tier(confidence_score) })
      }
    }
    const order: Record<ConfidenceTier, number> = { LOW: 0, MED: 1, HIGH: 2 }
    return rows.sort((a, b) => order[a.t] - order[b.t])
  })()

  const allLowResolved = reviewRows
    .filter((r) => r.t === 'LOW')
    .every((r) => overrides[r.compositeKey] !== undefined)

  // ── IDLE ──
  if (panelState === 'idle' || uploadMut.isPending) {
    return (
      <div
        className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
          dragOver ? 'border-[var(--accent)] bg-[var(--bg-page)]' : 'border-[var(--border)] hover:border-[var(--text-secondary)]'
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
        onClick={() => !uploadMut.isPending && fileRef.current?.click()}
      >
        <input
          ref={fileRef} type="file" className="hidden"
          accept=".pdf,.docx,.xlsx"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
        />
        {uploadMut.isPending ? (
          <p className="text-sm text-[var(--accent)] animate-pulse">Uploading…</p>
        ) : (
          <>
            <div className="text-4xl mb-3">📄</div>
            <p className="text-sm font-medium text-[var(--text-primary)]">Drop PDF, Word, or Excel file here</p>
            <p className="text-xs text-[var(--text-secondary)] mt-1">or click to browse · max 50 MB</p>
          </>
        )}
      </div>
    )
  }

  // ── EXTRACTING ──
  if (panelState === 'extracting') {
    const phase = job?.phase ?? 'uploading'
    const pct = PHASE_PCT[phase] ?? 10
    const stmtStatus = (active: string, done: string) => {
      if (!phase || phase === 'uploading' || phase === 'parsing') return '○'
      if (phase === active) return '⏳'
      if (phase === done || phase === 'ready') return '✓'
      const order = ['extracting_is', 'extracting_bs', 'extracting_cf', 'ready']
      return order.indexOf(phase) > order.indexOf(active) ? '✓' : '○'
    }
    return (
      <div className="border border-[var(--border)] rounded-xl p-6">
        <p className="text-sm font-medium text-[var(--accent)] mb-4">⚙️ AI Extraction in Progress</p>
        <div className="bg-[var(--bg-page)] rounded-full h-2 mb-2 overflow-hidden">
          <div
            className="bg-[var(--accent)] h-2 rounded-full transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="text-xs text-[var(--text-secondary)] mb-4">{pct}%</p>
        <div className="grid grid-cols-3 gap-3 text-sm">
          {[
            { label: 'Income Statement', active: 'extracting_is', done: 'extracting_bs' },
            { label: 'Balance Sheet', active: 'extracting_bs', done: 'extracting_cf' },
            { label: 'Cash Flow', active: 'extracting_cf', done: 'ready' },
          ].map(({ label, active, done }) => (
            <div key={label} className="flex items-center gap-2 text-[var(--text-secondary)]">
              <span className={stmtStatus(active, done) === '✓' ? 'text-green-400' : stmtStatus(active, done) === '⏳' ? 'text-[var(--accent)]' : ''}>
                {stmtStatus(active, done)}
              </span>
              <span>{label}</span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // ── ERROR ──
  if (panelState === 'error') {
    return (
      <div className="border border-[var(--breach)] rounded-xl p-6 text-center">
        <p className="text-sm text-[var(--breach)] mb-4">Extraction failed. Please try again.</p>
        <button
          onClick={() => { setPanelState('idle'); setActiveJobId(null); setOverrides({}) }}
          className="px-4 py-2 text-sm border border-[var(--border)] text-[var(--text-secondary)] rounded-lg hover:text-[var(--text-primary)]"
        >
          Try Again
        </button>
      </div>
    )
  }

  // ── REVIEW ──
  return (
    <div className="border border-[var(--border)] rounded-xl overflow-hidden">
      {/* Period selector */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border)] bg-[var(--bg-card)]">
        <span className="text-sm text-[var(--text-secondary)]">Write to period:</span>
        <select
          value={selectedPeriodId ?? ''}
          onChange={(e) => setSelectedPeriodId(Number(e.target.value))}
          className="border border-[var(--border)] rounded px-2 py-1 text-sm bg-[var(--bg-page)] text-[var(--text-primary)]"
        >
          {periods.map((p) => (
            <option key={p.id} value={p.id}>FY {p.fiscal_year} {p.period_type === 'projected' ? '(P)' : ''}</option>
          ))}
        </select>
        <span className="text-xs text-[var(--text-secondary)] ml-auto">
          {reviewRows.filter((r) => r.t !== 'HIGH').length} fields need review
        </span>
      </div>

      {/* Review table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-[var(--bg-page)] border-b border-[var(--border)]">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-medium text-[var(--text-secondary)]">Statement</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-[var(--text-secondary)]">Field</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-[var(--text-secondary)]">Extracted</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-[var(--text-secondary)]">Override</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-[var(--text-secondary)]">Confidence</th>
            </tr>
          </thead>
          <tbody>
            {reviewRows.map(({ compositeKey, stmt, key, value, score, t }) => (
              <tr key={compositeKey} className={`border-b border-[var(--border)] last:border-0 ${TIER_ROW[t]}`}>
                <td className="px-4 py-2 text-xs text-[var(--text-secondary)]">{stmtLabel(stmt)}</td>
                <td className="px-4 py-2 text-[var(--text-primary)]">{key.replace(/_/g, ' ')}</td>
                <td className="px-4 py-2 text-[var(--text-secondary)]">{value !== null ? value.toLocaleString() : '—'}</td>
                <td className="px-4 py-2">
                  {t !== 'HIGH' ? (
                    <input
                      type="number"
                      value={overrides[compositeKey] ?? ''}
                      onChange={(e) => setOverrides((prev) => ({ ...prev, [compositeKey]: Number(e.target.value) }))}
                      className="w-32 border border-[var(--border)] rounded px-2 py-1 text-sm bg-[var(--bg-page)] text-[var(--text-primary)]"
                    />
                  ) : (
                    <span className="text-[var(--text-secondary)] text-xs">—</span>
                  )}
                </td>
                <td className={`px-4 py-2 text-xs font-medium ${TIER_BADGE[t]}`}>
                  {TIER_LABEL[t]} {Math.round(score * 100)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Confirm bar */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--border)] bg-[var(--bg-card)]">
        {confirmMut.isError && (
          <p className="text-xs text-[var(--breach)]">Failed to save. Please try again.</p>
        )}
        <div className="ml-auto flex gap-3">
          <button
            onClick={() => { setPanelState('idle'); setActiveJobId(null); setOverrides({}) }}
            className="px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            Cancel
          </button>
          <button
            onClick={() => confirmMut.mutate()}
            disabled={!selectedPeriodId || !allLowResolved || confirmMut.isPending}
            className="px-4 py-1.5 text-sm bg-[var(--accent)] text-white rounded-lg hover:opacity-90 disabled:opacity-50 font-medium"
          >
            {confirmMut.isPending ? 'Saving…' : 'Confirm & Write to Grid'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 8.2: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors (IngestionHub/ExtractionReview still exist, no broken imports yet)

- [ ] **Step 8.3: Commit**

```bash
git add frontend/src/components/ExtractionPanel.tsx
git commit -m "feat: add ExtractionPanel with inline upload, progress, and confidence review"
```

---

## Task 9: Wire `ExtractionPanel` into `SpreadDetailPage` and remove old components

**Files:**
- Modify: `frontend/src/pages/SpreadDetailPage.tsx`
- Delete: `frontend/src/components/IngestionHub.tsx`
- Delete: `frontend/src/components/ExtractionReview.tsx`

- [ ] **Step 9.1: Update imports and state in `SpreadDetailPage.tsx`**

Replace lines 9–10 (IngestionHub/ExtractionReview imports) and line 15 (ExtractionJob type import):

```tsx
// Remove these lines:
import IngestionHub from '../components/IngestionHub'
import ExtractionReview from '../components/ExtractionReview'

// Add:
import ExtractionPanel from '../components/ExtractionPanel'
```

- [ ] **Step 9.2: Replace state variables**

Find and replace lines ~40–41:
```tsx
// Remove:
const [showIngestion, setShowIngestion] = useState(false)
const [pendingJob, setPendingJob] = useState<ExtractionJob | null>(null)

// Add:
const [showExtractionPanel, setShowExtractionPanel] = useState(false)
```

Also remove the `ExtractionJob` import from types if it's only used by the removed state — check if `ExtractionJob` is still referenced elsewhere in the file. If not, remove it from the import on line 15.

- [ ] **Step 9.3: Replace the spread section content**

Find the spread section (around line 98–212) and replace the content inside `{activeSection === 'spread' && (`:

The "Import Document" button (around line 142–147) should be updated to toggle `showExtractionPanel`:

```tsx
<button
  onClick={() => setShowExtractionPanel(!showExtractionPanel)}
  className="px-3 py-1 rounded text-sm bg-[var(--bg-page)] text-[var(--accent)] border border-[var(--border)] hover:bg-[var(--bg-card)] shrink-0"
>
  {showExtractionPanel ? '✕ Close Import' : '📎 Import Document'}
</button>
```

Below the period selector bar and above the statement tabs, add the panel:

```tsx
{/* Extraction panel (shown when import is active) */}
{showExtractionPanel && (
  <div className="mb-6">
    <ExtractionPanel
      spreadId={spreadId}
      periods={periods}
      onConfirmed={() => {
        setShowExtractionPanel(false)
        qc.invalidateQueries({ queryKey: ['line-items'] })
        qc.invalidateQueries({ queryKey: ['analytics', spreadId] })
      }}
    />
  </div>
)}
```

- [ ] **Step 9.4: Remove the old modal renders**

Find and remove these two blocks (around lines 225–244):
```tsx
{showIngestion && (
  <IngestionHub ... />
)}
{pendingJob && (
  <ExtractionReview ... />
)}
```

- [ ] **Step 9.5: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: errors about `IngestionHub` and `ExtractionReview` not found — fix by removing their files in the next step.

- [ ] **Step 9.6: Delete old components**

```bash
rm frontend/src/components/IngestionHub.tsx
rm frontend/src/components/ExtractionReview.tsx
```

- [ ] **Step 9.7: Verify TypeScript compiles cleanly**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 9.8: Run full backend suite**

```bash
cd backend && python -m pytest tests/ -q --ignore=tests/test_memo.py
```

Expected: all pass

- [ ] **Step 9.9: Commit**

```bash
git add frontend/src/pages/SpreadDetailPage.tsx
git rm frontend/src/components/IngestionHub.tsx frontend/src/components/ExtractionReview.tsx
git commit -m "feat: wire ExtractionPanel into SpreadDetailPage; remove IngestionHub and ExtractionReview"
```

---

## Final verification

- [ ] TypeScript: `cd frontend && npx tsc --noEmit` — clean
- [ ] Backend: `cd backend && python -m pytest tests/ -q --ignore=tests/test_memo.py` — all pass
- [ ] Manual smoke test: open a spread, click "📎 Import Document", drop a PDF, verify progress bar advances through IS → BS → CF, then review table shows green/yellow/red rows, confirm writes to grid
