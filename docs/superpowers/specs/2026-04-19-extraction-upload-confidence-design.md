# SpreadSense Plan 8: PDF Upload Progress & Confidence Review — Design Spec

**Date:** 2026-04-19
**Last Updated:** 2026-04-21
**Status:** Implemented

---

## Goal

Replace the existing two-modal extraction flow (IngestionHub → ExtractionReview) with a single inline `ExtractionPanel` component that shows real-time extraction progress and a color-coded confidence review table — all within the spread detail page, no modals.

---

## Architecture Overview

Two areas of change:

1. **Backend** — make extraction async: `POST /ingestion/upload` returns immediately with a job, a FastAPI `BackgroundTask` runs the extraction pipeline, and the existing `GET /ingestion/{job_id}` endpoint gains an ownership check. A `phase` column on `ExtractionJob` tracks progress through the pipeline stages. The `ExtractionStatus` enum gains a `failed` value.

2. **Frontend** — replace `IngestionHub` + `ExtractionReview` with a single `ExtractionPanel` component that renders inline in the Spread section tab area. Four internal states: `idle → uploading → extracting → review` (plus `error`).

No new modules, no Celery, no Redis. FastAPI's built-in `BackgroundTasks` is sufficient since extraction is a single async function per job.

---

## Backend

### Model change: `ExtractionJob`

Add `phase: str` column to `backend/app/models/extraction_job.py`:

```python
phase: Mapped[str] = mapped_column(String(32), nullable=False, default="uploading")
```

Extend the `ExtractionStatus` enum to add `failed`:

```python
class ExtractionStatus(str, enum.Enum):
    pending = "pending"
    processing = "processing"
    ready = "ready"
    confirmed = "confirmed"
    failed = "failed"   # new
```

Phase values and their meaning:

| Phase | Meaning |
|-------|---------|
| `uploading` | Job created, file received |
| `parsing` | Extracting text from PDF/DOCX/XLSX |
| `extracting_is` | Claude extracting Income Statement fields |
| `extracting_bs` | Claude extracting Balance Sheet fields |
| `extracting_cf` | Claude extracting Cash Flow fields |
| `ready` | Extraction complete, awaiting analyst review |
| `confirmed` | Analyst confirmed, written to line items |

On exception in the background task: `status = "failed"`, `phase = "failed"`, commit.

Add a migration: `alembic revision --autogenerate -m "add phase to extraction_job and failed status"`. This produces a new file in `backend/alembic/versions/`.

### Schema change: `ExtractionJobRead`

Add `phase: str` to `backend/app/modules/ingestion/schemas.py`:

```python
class ExtractionJobRead(BaseModel):
    id: int
    spread_id: int
    filename: str
    file_type: str
    status: str
    phase: str
    results: Optional[dict] = None
    created_at: datetime
    model_config = {"from_attributes": True}
```

The `ExtractedField` schema (with `flagged: bool`) becomes unused once `ExtractionPanel` replaces `ExtractionReview`. It can be removed from `schemas.py` as part of this plan.

### Service change: `service.py`

Split `upload_and_extract()` into two functions:

**`create_job(file: UploadFile, file_bytes: bytes, spread_id: int, user: User, db: AsyncSession) → ExtractionJob`**
- Validates file type and size
- Creates `ExtractionJob` with `status="processing"`, `phase="uploading"`
- Flushes and returns the job immediately (no extraction yet)

**`run_extraction(job_id: int, file_bytes: bytes) → None`** (background task — no db parameter)
- Opens its own session using `AsyncSessionFactory` from `app.database` (already exported as `AsyncSessionFactory = async_sessionmaker(engine, expire_on_commit=False)`)
- Uses a try/except around the entire extraction, committing `status="failed"`, `phase="failed"` on any exception
- Phase update pattern — after each step, set phase and call `await session.commit()` explicitly (the `get_db()` dependency is not in scope here):

```python
async def run_extraction(job_id: int, file_bytes: bytes) -> None:
    async with AsyncSessionFactory() as session:
        try:
            job = await session.get(ExtractionJob, job_id)

            job.phase = "parsing"
            await session.commit()
            text = extract_text(file_bytes, job.file_type)

            job.phase = "extracting_is"
            await session.commit()
            is_fields = await claude_extract(text, "IS")

            job.phase = "extracting_bs"
            await session.commit()
            bs_fields = await claude_extract(text, "BS")

            job.phase = "extracting_cf"
            await session.commit()
            cf_fields = await claude_extract(text, "CF")

            job.results = {"IS": is_fields, "BS": bs_fields, "CF": cf_fields}
            job.status = "ready"
            job.phase = "ready"
            await session.commit()

        except Exception:
            job.status = "failed"
            job.phase = "failed"
            await session.commit()
            raise
```

**`get_job(job_id: int, user: User, db: AsyncSession) → ExtractionJob | None`**

The `GET /ingestion/{job_id}` endpoint already exists in the router. The service function needs to add an ownership check. Since `ExtractionJob` has no SQLAlchemy `relationship()` to `Spread`, use an explicit join:

```python
async def get_job(job_id: int, user: User, db: AsyncSession) -> ExtractionJob | None:
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
```

### Router changes: `router.py`

**`POST /ingestion/upload`** — modified to be async with BackgroundTask:

```python
@router.post("/upload", response_model=ExtractionJobRead, status_code=201)
async def upload(
    spread_id: int = Query(...),
    file: UploadFile = File(...),
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    file_bytes = await file.read()
    job = await service.create_job(file, file_bytes, spread_id, user, db)
    background_tasks.add_task(service.run_extraction, job.id, file_bytes)
    return job
```

**`GET /ingestion/{job_id}`** — already exists; update to call `service.get_job` with ownership check (currently calls the old service function without it):

```python
@router.get("/{job_id}", response_model=ExtractionJobRead)
async def get_job(
    job_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    job = await service.get_job(job_id, user, db)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job
```

No change to `POST /ingestion/{job_id}/confirm`.

### Tests: `backend/tests/test_ingestion.py`

Add 4 tests:
- `test_upload_returns_job_immediately` — POST returns 201 with `status=processing`, response arrives before extraction finishes
- `test_get_job_returns_phase` — GET returns job with `phase` field present
- `test_get_job_404_for_other_analyst` — analyst B cannot see analyst A's job
- `test_phase_advances_to_ready` — after background task completes (awaited in test), GET returns `status=ready`

---

## Frontend

### New file: `frontend/src/components/ExtractionPanel.tsx`

Props:
```typescript
interface Props {
  spreadId: number
  periods: SpreadPeriod[]
  onConfirmed: () => void
}
```

Internal state:
```typescript
type PanelState = 'idle' | 'uploading' | 'extracting' | 'review' | 'error'
```

**Idle state** — shown when no active job:
- Full-width drag-drop zone: "Drop PDF, Word, or Excel file here" + "or click to browse"
- `accept=".pdf,.docx,.xlsx"`, 50MB client-side validation
- On file select: POST to `/ingestion/upload?spread_id={id}`, set `activeJobId`, transition to `extracting`
- Upload errors (network, 4xx): transition to `error`

**Extracting state** — polls `GET /ingestion/{job_id}` every 2s via React Query `refetchInterval: 2000`:
- Stop polling condition: `status !== "processing"` (covers both `ready` and `failed`)
- Progress bar: phase → percentage:
  - `uploading` = 10%, `parsing` = 25%, `extracting_is` = 50%, `extracting_bs` = 70%, `extracting_cf` = 90%, `ready` = 100%
- Per-statement checklist (IS / BS / CF):
  - Pending: ○ grey
  - Active (current phase): ⏳ blue
  - Done (phase has passed): ✓ green
- On `status === "ready"`: transition to `review`
- On `status === "failed"`: transition to `error`

**Review state** — rendered from `job.results`:
- Period selector dropdown at top (uses `periods` prop)
- Table columns: Field | Extracted Value | Override | Confidence
- Rows sorted: LOW first, then MED, then HIGH
- Row styling by confidence (thresholds: HIGH ≥ 0.85, MED 0.60–0.84, LOW < 0.60):
  - HIGH: green tint, no input, `● HIGH` badge in green
  - MED: yellow tint, `border-l-2 border-yellow-400`, inline input pre-filled, `● MED` badge in yellow
  - LOW: red tint, `border-l-2 border-red-400`, inline input pre-filled, `⚠ LOW` badge in red
- Override inputs: `overrides: Record<string, number>` state, pre-seeded with extracted values for MED/LOW rows
- "Confirm" button: disabled until every LOW field has a value in `overrides`
- On confirm: `POST /ingestion/{job_id}/confirm` with `{ period_id, overrides }`, call `onConfirmed()`
- Confirm errors: show inline error message, remain in review state

**Error state**:
- Error message: "Extraction failed. Please try again."
- "Try Again" button: resets to `idle` state (clears `activeJobId`)

### New API helper: `frontend/src/api/ingestion.ts`

Add `getExtractionJob(jobId: number): Promise<ExtractionJob>` alongside existing `uploadDocument` and `confirmExtraction`.

### Type update: `frontend/src/types/index.ts`

Add `phase: string` to `ExtractionJob` interface.

### Modified: `frontend/src/pages/SpreadDetailPage.tsx`

- Remove `showIngestion`, `pendingJob` state
- Add `activeJobId: number | null` state (set after successful upload POST response)
- Remove `IngestionHub` and `ExtractionReview` imports
- Add `ExtractionPanel` import
- In Spread section: when `activeJobId !== null`, render `<ExtractionPanel>` full-width; when null, render the existing spreading grid + "Import Document" button

### Retired components

`IngestionHub.tsx` and `ExtractionReview.tsx` are deleted once `ExtractionPanel` is wired and TypeScript compiles clean.

---

## File Map

### Modified files
| File | Change |
|------|--------|
| `backend/app/models/extraction_job.py` | Add `phase` column; add `failed` to `ExtractionStatus` enum |
| `backend/app/modules/ingestion/schemas.py` | Add `phase` to `ExtractionJobRead`; remove unused `ExtractedField` |
| `backend/app/modules/ingestion/service.py` | Split into `create_job` + `run_extraction` (background); add/update `get_job` with ownership join |
| `backend/app/modules/ingestion/router.py` | Make upload async with BackgroundTask; update GET `/{job_id}` with ownership check |
| `backend/tests/test_ingestion.py` | Add 4 new tests |
| `frontend/src/types/index.ts` | Add `phase` to `ExtractionJob` |
| `frontend/src/api/ingestion.ts` | Add `getExtractionJob` |
| `frontend/src/pages/SpreadDetailPage.tsx` | Replace IngestionHub/ExtractionReview with ExtractionPanel |

### New files
| File | Responsibility |
|------|---------------|
| `frontend/src/components/ExtractionPanel.tsx` | Upload zone + progress + review table + error state, all inline |
| `backend/alembic/versions/<hash>_add_phase_to_extraction_job_and_failed_status.py` | Migration: add `phase` column, extend `ExtractionStatus` enum |

### Deleted files
| File | Reason |
|------|--------|
| `frontend/src/components/IngestionHub.tsx` | Replaced by ExtractionPanel |
| `frontend/src/components/ExtractionReview.tsx` | Replaced by ExtractionPanel |

---

## Testing

### Backend (4 new tests)
- `test_upload_returns_job_immediately` — POST returns 201 with `status=processing`
- `test_get_job_returns_phase` — GET returns `phase` field
- `test_get_job_404_for_other_analyst` — returns 404 for wrong analyst
- `test_phase_advances_to_ready` — after background task, job reaches `status=ready`

### Frontend
- TypeScript: `npx tsc --noEmit` passes
- Manual: upload PDF → progress panel → phases advance → review table with color-coded rows → override LOW field → confirm → line items updated

---

## What This Plan Does Not Include

- Retry from error state without page reload (error state shows "Try Again" which resets to idle — no automatic retry)
- Batch upload (multiple PDFs in queue — Phase 5 item)
- Extraction confidence threshold configuration (hardcoded: HIGH ≥ 0.85, MED ≥ 0.60, LOW < 0.60)
- File persistence to S3 (files processed in-memory, not stored — separate Phase 4 item)

---

## Implementation Notes (added 2026-04-21)

Implemented as Plan 8 across 9 tasks. Key deviations and refinements from the original spec:

- **`extract_statement(text, statement)` added to `claude_extractor.py`**: The spec referenced `claude_extract(text, stmt)` generically; implementation uses `extract_statement` with `Literal["IS", "BS", "CF"]` type annotation, invalid-statement guard, and `max_tokens=4096`.
- **`run_extraction` error handler**: Uses a separate `AsyncSessionFactory` recovery session to mark the job failed, avoiding `UnboundLocalError` if the original session fails before fetching the job.
- **`BackgroundTasks = ...` injection**: Python syntax requires `...` (Ellipsis) as a default when `BackgroundTasks` follows parameters with defaults in the upload handler signature.
- **`ExtractionPanel` state transitions**: Moved from render-time `if` block to `useEffect([job?.status, panelState])` to avoid React side-effect-during-render anti-pattern.
- **Test isolation for `run_extraction`**: In ASGI test transport, `BackgroundTasks` run synchronously. Tests mock `service.run_extraction` at the service layer to prevent the background task's `AsyncSessionFactory` session from conflicting with the test transaction.
- **Migration chain**: `down_revision` points to `cadd08808bae` (the credit_memo_meta migration), not `eeddf3d4fbd9` as initially drafted — corrected to avoid a two-head Alembic branch.

Final test counts: 71/71 backend tests passing · TypeScript compiles clean.
