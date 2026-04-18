# SpreadSense Plan 5: Workflow & Review — Design Spec

**Date:** 2026-04-18
**Status:** Approved

---

## Goal

Add a lightweight review workflow so analysts can submit spreads for senior review, sr_credit_analysts can mark them reviewed, and both roles can see a status transition history. No comments, no reviewer assignment — just enforced status transitions, audit history, and a filtered queue view on the dashboard.

---

## Architecture Overview

Three additions to the existing system:

1. **Spreads module extensions** — two new endpoints (`PATCH /spreads/{id}/status`, `GET /spreads/{id}/history`) and a `status` query parameter on `GET /spreads/`. No new module — these extend the existing `spreads` router, service, and schemas.
2. **AuditLog writes** — the existing `AuditLog` model is populated inline in the status-change service function. No event listeners; writes are explicit and testable.
3. **Frontend workflow UI** — two new components (`WorkflowControls`, `StatusHistory`) wired into `SpreadDetailPage`, plus a status filter tab bar added to `DealDashboardPage`.

---

## Status Machine

```
draft ──► completed ──► reviewed ──► exported
```

| Transition | Allowed roles | Condition |
|-----------|---------------|-----------|
| draft → completed | `analyst` | Own spread only |
| completed → reviewed | `sr_credit_analyst`, `admin` | Any spread |
| reviewed → exported | Any authenticated user | Any spread |
| Any → draft (rollback) | — | **Not allowed** |

Violations return HTTP 403.

---

## Backend

### New endpoints

```
PATCH /spreads/{id}/status      body: { "status": "completed" }  → SpreadRead
GET   /spreads/{id}/history     → list[AuditEntry]
GET   /spreads/?status=draft    → list[SpreadRead]  (status filter, optional)
```

All three require authentication. Ownership rules for loading the spread follow the existing pattern (`analyst` sees own only; `sr_credit_analyst`/`admin` sees all) — a 404 is returned when a spread is not visible to the caller, and a 403 when the transition is not permitted for the caller's role.

### New schemas (added to `backend/app/modules/spreads/schemas.py`)

```python
class SpreadStatusUpdate(BaseModel):
    status: str   # validated against allowed transitions in service

class AuditEntry(BaseModel):
    id: int
    old_status: str
    new_status: str
    changed_by_name: str
    timestamp: datetime
    model_config = {"from_attributes": False}
```

### Service changes (`backend/app/modules/spreads/service.py`)

**`update_status(spread_id, new_status, user, db)`**

1. Load spread via `get_spread()` (existing helper, enforces ownership/404).
2. Validate transition using a `ALLOWED_TRANSITIONS` dict:
   ```python
   ALLOWED_TRANSITIONS: dict[str, list[tuple[str, set[UserRole]]]] = {
       "draft":     [("completed", {UserRole.analyst})],
       "completed": [("reviewed",  {UserRole.sr_credit_analyst, UserRole.admin})],
       "reviewed":  [("exported",  {UserRole.analyst, UserRole.sr_credit_analyst, UserRole.admin})],
   }
   ```
   If the `(old_status → new_status, caller_role)` combination is not in the table → 403.
3. Record `old_status`, set `spread.status = new_status`, `spread.updated_at = now()`.
4. Write `AuditLog(spread_id=spread.id, user_id=user.id, action="status_change", entity="Spread", entity_id=spread.id, old_value={"status": old_status}, new_value={"status": new_status})`.
5. Flush + refresh spread, return it.

**`get_history(spread_id, user, db)`**

1. Load spread (ownership check / 404).
2. Query `AuditLog` joined with `User` (`AuditLog.user_id == User.id`) where `entity="Spread"`, `entity_id=spread_id`, `action="status_change"`, ordered by `timestamp` asc.
3. Construct `AuditEntry` dicts explicitly from `(log_row, user_row)` — `AuditEntry` is **not** built from ORM instances; `changed_by_name` is set manually from `User.full_name`. `model_config = {"from_attributes": False}` is correct.
4. Return `list[AuditEntry]`.

**`list_spreads` update**

Add optional `status: str | None = None` parameter. If provided, add `.where(Spread.status == status)` to the existing query. No pagination at this stage.

### Router changes (`backend/app/modules/spreads/router.py`)

```python
@router.get("/spreads/{spread_id}/history", response_model=list[AuditEntry])
async def get_history(spread_id, db, user): ...

@router.patch("/spreads/{spread_id}/status", response_model=SpreadRead)
async def update_status(spread_id, body: SpreadStatusUpdate, db, user): ...

# Existing list endpoint gains optional query param:
@router.get("/spreads/", response_model=list[SpreadRead])
async def list_spreads(status: str | None = Query(None), db, user): ...
```

**Route ordering note:** FastAPI resolves `/spreads/{spread_id}/history` (literal `/history` segment) before `/spreads/{spread_id}` (pure path param) due to path specificity rules. Register the `/history` route **before** the `/{spread_id}` route in the file to be explicit and avoid any ambiguity.

---

## Frontend

### New files

**`frontend/src/api/workflow.ts`**
```typescript
patchSpreadStatus(spreadId: number, status: string): Promise<Spread>
getSpreadHistory(spreadId: number): Promise<AuditEntry[]>
getSpreads(status?: string): Promise<Spread[]>   // wraps existing with optional param
```

**`frontend/src/components/WorkflowControls.tsx`**

Props: `{ spread: Spread; currentUserId: number; currentUserRole: string; onStatusChange: () => void }`

Renders:
- `<StatusBadge status={spread.status} />` (existing component)
- One contextual action button, derived from role + status:

| Status | Role | Button label | Target status |
|--------|------|-------------|---------------|
| draft | analyst AND `spread.created_by === currentUserId` | Submit for Review | completed |
| completed | sr_credit_analyst / admin | Mark as Reviewed | reviewed |
| reviewed | any | Mark as Exported | exported |
| anything else | — | (no button) | — |

On click: `patchSpreadStatus(spread.id, targetStatus)` → on success call `onStatusChange()` (invalidates spread query). Button is disabled while the mutation is pending.

**`frontend/src/components/StatusHistory.tsx`**

Props: `{ spreadId: number }`

Fetches `GET /spreads/{id}/history` via React Query. Renders a compact horizontal timeline:

```
draft  →  completed (Ana · Apr 18)  →  reviewed (James · Apr 19)
```

- First node is always "draft" (the starting state, no attribution needed).
- Subsequent nodes show `new_status (full_name · date)`.
- If no history entries, renders nothing (hidden for fresh drafts).
- Uses `staleTime: 0` — refetches after every status change.

### Modified files

**`frontend/src/pages/SpreadDetailPage.tsx`**

1. Import `WorkflowControls` and `StatusHistory`.
2. Add `WorkflowControls` to the spread header (right side, next to deal name). Passes `spread`, `currentUserId` (`user.id` from auth store), `currentUserRole` (`user.role` from auth store), and `onStatusChange` (invalidates `['spread', spreadId]` query).
3. Add `StatusHistory` between the RatioStrip and the section content area — always visible regardless of active tab.

**`frontend/src/pages/DealDashboardPage.tsx`**

Add a status filter tab bar above the spreads table:

```
All  |  Draft  |  Awaiting Review  |  Reviewed  |  Exported
```

- Filter tabs operate **client-side** against the already-loaded `spreads` array (no extra API calls). "Awaiting Review" maps to status `completed`. The `GET /spreads/?status=` backend param is available for future use (e.g. server-side pagination) but is not wired to the dashboard filter at this stage.
- Active tab stored in local `useState`.
- The spread count in the heading updates to reflect the filtered count.

### New TypeScript type (`frontend/src/types/index.ts`)

```typescript
export interface AuditEntry {
  id: number
  old_status: string
  new_status: string
  changed_by_name: string
  timestamp: string
}
```

---

## Testing

### Backend tests (`backend/tests/test_workflow.py`)

- `test_analyst_can_submit_own_spread` — draft → completed, 200
- `test_analyst_cannot_submit_others_spread` — 404 (spread not visible)
- `test_analyst_cannot_mark_reviewed` — completed → reviewed by analyst → 403
- `test_sr_can_mark_reviewed` — completed → reviewed by sr_credit_analyst, 200
- `test_invalid_transition_rejected` — draft → reviewed → 403
- `test_rollback_not_allowed` — completed → draft → 403
- `test_history_returns_transitions` — after two transitions, history has 2 entries in order
- `test_history_empty_for_fresh_spread` — returns `[]`
- `test_status_filter_on_list` — `GET /spreads/?status=completed` returns only completed spreads

9 tests. Expected total: 58 + 9 = 67 passing.

---

## What This Plan Does Not Include

- Reviewer assignment (analyst cannot route to a specific person)
- Rollback / "send back to draft" with a required comment
- Email notifications on status change
- Comments/discussion thread
- Bulk status changes
- Pagination on the spreads list
