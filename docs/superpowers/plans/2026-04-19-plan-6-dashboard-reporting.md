# Plan 6: Dashboard & Reporting — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a portfolio dashboard for sr_credit_analyst/admin at `/dashboard` showing pipeline counts, breach alerts, and an enriched deal table, plus a PDF export via `window.print()`.

**Architecture:** One new backend module (`portfolio`) exposes `GET /portfolio/summary` which joins spreads/borrowers/users and calls the existing analytics service per spread to return aggregated status counts, breach alerts, and enriched spread summaries. The frontend adds a `DashboardPage` at `/dashboard` with a `RoleRoute` guard, and `LoginPage` is updated to redirect sr/admin to `/dashboard` post-login.

**Tech Stack:** FastAPI + SQLAlchemy async (backend), React 18 + TypeScript + Tailwind + React Query (frontend), pytest-asyncio (tests).

---

## File Map

### New files
- `backend/app/modules/portfolio/__init__.py` — empty
- `backend/app/modules/portfolio/schemas.py` — `BreachAlert`, `SpreadSummary`, `StatusCounts`, `PortfolioSummary`
- `backend/app/modules/portfolio/service.py` — `get_portfolio_summary(user, db)`
- `backend/app/modules/portfolio/router.py` — `GET /portfolio/summary`
- `backend/tests/test_portfolio.py` — 6 tests
- `frontend/src/components/RoleRoute.tsx` — role-based route guard
- `frontend/src/api/portfolio.ts` — `getPortfolioSummary()`
- `frontend/src/pages/DashboardPage.tsx` — full dashboard page

### Modified files
- `backend/app/modules/analytics/service.py` — rename `_DEFAULTS` → `DEFAULT_THRESHOLDS`
- `backend/app/main.py` — register portfolio router
- `frontend/src/types/index.ts` — add `StatusCounts`, `BreachAlert`, `SpreadSummary`, `PortfolioSummary`
- `frontend/src/App.tsx` — add `/dashboard` route with `RoleRoute`, add `*` catch-all for unknown routes
- `frontend/src/pages/LoginPage.tsx` — role-aware post-login redirect

---

## Task 1: Rename `_DEFAULTS` → `DEFAULT_THRESHOLDS` in analytics service

**Files:**
- Modify: `backend/app/modules/analytics/service.py`

- [ ] **Step 1: Rename the constant**

In `backend/app/modules/analytics/service.py`, change line 24:
```python
# Before
_DEFAULTS = {

# After
DEFAULT_THRESHOLDS = {
```

Then update the one internal reference to `_DEFAULTS` (line ~128 in `get_analytics`):
```python
# Before
thresholds = dict(_DEFAULTS)

# After
thresholds = dict(DEFAULT_THRESHOLDS)
```

- [ ] **Step 2: Run existing tests to confirm no regressions**

```bash
cd backend && python -m pytest tests/ -q --ignore=tests/test_portfolio.py 2>&1 | tail -5
```
Expected: `64 passed, 3 failed` (the 3 failures are pre-existing `test_memo.py` weasyprint failures — unrelated).

- [ ] **Step 3: Commit**

```bash
git add backend/app/modules/analytics/service.py
git commit -m "refactor: expose DEFAULT_THRESHOLDS as public constant in analytics service"
```

---

## Task 2: Backend — portfolio schemas

**Files:**
- Create: `backend/app/modules/portfolio/__init__.py`
- Create: `backend/app/modules/portfolio/schemas.py`

- [ ] **Step 1: Create `__init__.py`**

```python
# backend/app/modules/portfolio/__init__.py
# (empty)
```

- [ ] **Step 2: Create `schemas.py`**

```python
# backend/app/modules/portfolio/schemas.py
from datetime import datetime
from pydantic import BaseModel


class BreachAlert(BaseModel):
    spread_id: int
    deal_name: str
    borrower_name: str
    ratio_name: str        # e.g. "dscr", "leverage"
    value: float | None
    threshold: float
    direction: str         # "min" (breach when below) or "max" (breach when above)
    severity: str          # "breach" or "near_threshold"


class SpreadSummary(BaseModel):
    id: int
    deal_name: str
    borrower_name: str
    status: str
    analyst_name: str      # resolved from spread.created_by → User.full_name
    alert_count: int
    updated_at: datetime


class StatusCounts(BaseModel):
    draft: int
    completed: int
    reviewed: int
    exported: int
    total: int


class PortfolioSummary(BaseModel):
    status_counts: StatusCounts
    breach_alerts: list[BreachAlert]
    spread_summaries: list[SpreadSummary]
```

- [ ] **Step 3: Verify import works**

```bash
cd backend && python -c "from app.modules.portfolio.schemas import PortfolioSummary; print('ok')"
```
Expected: `ok`

- [ ] **Step 4: Commit**

```bash
git add backend/app/modules/portfolio/
git commit -m "feat: add portfolio module schemas"
```

---

## Task 3: Backend — portfolio service

**Files:**
- Create: `backend/app/modules/portfolio/service.py`

- [ ] **Step 1: Write the failing tests first** (see Task 4 — write tests before service)

*Skip ahead to Task 4, write all 6 tests, run them to confirm they all fail, then return here.*

- [ ] **Step 2: Create `service.py`**

```python
# backend/app/modules/portfolio/service.py
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from fastapi import HTTPException, status

from app.models.spread import Spread
from app.models.borrower import Borrower
from app.models.user import User, UserRole
from app.models.loan_type import LoanType
from app.modules.portfolio.schemas import (
    PortfolioSummary, StatusCounts, BreachAlert, SpreadSummary,
)
from app.modules.analytics.service import DEFAULT_THRESHOLDS

# Maps ratio name → (threshold key in DEFAULT_THRESHOLDS, direction)
_RATIO_META = {
    "dscr":               ("dscr_min",               "min"),
    "current_ratio":      ("current_ratio_min",       "min"),
    "interest_coverage":  ("interest_coverage_min",   "min"),
    "leverage":           ("leverage_max",             "max"),
}


async def _effective_thresholds(spread: Spread, db: AsyncSession) -> dict:
    """Return threshold dict for this spread, applying loan-type overrides."""
    thresholds = dict(DEFAULT_THRESHOLDS)
    if spread.loan_type_id:
        lt_result = await db.execute(
            select(LoanType).where(LoanType.id == spread.loan_type_id)
        )
        lt = lt_result.scalar_one_or_none()
        if lt:
            if lt.dscr_min is not None:
                thresholds["dscr_min"] = float(lt.dscr_min)
            if lt.leverage_max is not None:
                thresholds["leverage_max"] = float(lt.leverage_max)
            if lt.current_ratio_min is not None:
                thresholds["current_ratio_min"] = float(lt.current_ratio_min)
            if lt.interest_coverage_min is not None:
                thresholds["interest_coverage_min"] = float(lt.interest_coverage_min)
    return thresholds


async def get_portfolio_summary(user: User, db: AsyncSession) -> PortfolioSummary:
    if user.role not in (UserRole.sr_credit_analyst, UserRole.admin):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    # Load all spreads with borrower and analyst names resolved via join
    result = await db.execute(
        select(Spread, Borrower, User)
        .join(Borrower, Spread.borrower_id == Borrower.id)
        .join(User, Spread.created_by == User.id)
        .order_by(Spread.updated_at.desc())
    )
    rows = result.all()  # list of (Spread, Borrower, User) tuples

    # Status counts
    counts = {"draft": 0, "completed": 0, "reviewed": 0, "exported": 0}
    for spread, _, __ in rows:
        key = spread.status.value if hasattr(spread.status, "value") else spread.status
        if key in counts:
            counts[key] += 1

    status_counts = StatusCounts(
        **counts,
        total=sum(counts.values()),
    )

    # Per-spread analytics for breach alerts
    breach_alerts: list[BreachAlert] = []
    spread_summaries: list[SpreadSummary] = []

    for spread, borrower, analyst in rows:
        # Import inline to avoid circular import
        from app.modules.analytics.service import get_analytics
        try:
            analytics = await get_analytics(spread.id, user, db)
        except HTTPException:
            analytics = None

        alert_count = 0
        if analytics and analytics.periods:
            # Use most recent actual period; fall back to most recent of any type
            actual = [p for p in analytics.periods if p.period_type == "actual"]
            period = actual[-1] if actual else analytics.periods[-1]

            thresholds = await _effective_thresholds(spread, db)

            for ratio_name in period.breaches:
                meta = _RATIO_META.get(ratio_name)
                if meta:
                    threshold_key, direction = meta
                    ratio_value = getattr(period.ratios, ratio_name, None)
                    breach_alerts.append(BreachAlert(
                        spread_id=spread.id,
                        deal_name=spread.deal_name,
                        borrower_name=borrower.name,
                        ratio_name=ratio_name,
                        value=ratio_value,
                        threshold=thresholds[threshold_key],
                        direction=direction,
                        severity="breach",
                    ))
                    alert_count += 1

            for ratio_name in period.near_threshold:
                meta = _RATIO_META.get(ratio_name)
                if meta:
                    threshold_key, direction = meta
                    ratio_value = getattr(period.ratios, ratio_name, None)
                    breach_alerts.append(BreachAlert(
                        spread_id=spread.id,
                        deal_name=spread.deal_name,
                        borrower_name=borrower.name,
                        ratio_name=ratio_name,
                        value=ratio_value,
                        threshold=thresholds[threshold_key],
                        direction=direction,
                        severity="near_threshold",
                    ))
                    alert_count += 1

        spread_summaries.append(SpreadSummary(
            id=spread.id,
            deal_name=spread.deal_name,
            borrower_name=borrower.name,
            status=spread.status.value if hasattr(spread.status, "value") else spread.status,
            analyst_name=analyst.full_name,
            alert_count=alert_count,
            updated_at=spread.updated_at,
        ))

    # Sort breach_alerts: breaches first, then near_threshold; both sorted by deal_name
    breach_alerts.sort(key=lambda a: (0 if a.severity == "breach" else 1, a.deal_name))

    return PortfolioSummary(
        status_counts=status_counts,
        breach_alerts=breach_alerts,
        spread_summaries=spread_summaries,
    )
```

- [ ] **Step 3: Run the tests (written in Task 4)**

```bash
cd backend && python -m pytest tests/test_portfolio.py -v 2>&1 | tail -20
```
Expected: all 6 tests pass.

- [ ] **Step 4: Run full suite to check for regressions**

```bash
cd backend && python -m pytest tests/ -q --ignore=tests/test_memo.py 2>&1 | tail -5
```
Expected: 64 + 6 = `70 passed`.

- [ ] **Step 5: Commit**

```bash
git add backend/app/modules/portfolio/service.py
git commit -m "feat: add portfolio summary service with breach aggregation"
```

---

## Task 4: Backend — portfolio tests

**Files:**
- Create: `backend/tests/test_portfolio.py`

- [ ] **Step 1: Write all 6 tests**

```python
# backend/tests/test_portfolio.py
import pytest
from decimal import Decimal


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture
async def p6_analyst(db):
    from app.models.user import User, UserRole
    from app.core.security import hash_password
    user = User(email="p6_analyst@bank.com", full_name="Ana P6",
                hashed_password=hash_password("password123"), role=UserRole.analyst)
    db.add(user)
    await db.flush()
    await db.refresh(user)
    return user


@pytest.fixture
async def p6_sr(db):
    from app.models.user import User, UserRole
    from app.core.security import hash_password
    user = User(email="p6_sr@bank.com", full_name="James P6",
                hashed_password=hash_password("password123"), role=UserRole.sr_credit_analyst)
    db.add(user)
    await db.flush()
    await db.refresh(user)
    return user


@pytest.fixture
async def p6_borrower(db, p6_analyst):
    from app.models.borrower import Borrower
    b = Borrower(name="Acme P6 Corp", fiscal_year_end_month=12, created_by=p6_analyst.id)
    db.add(b)
    await db.flush()
    await db.refresh(b)
    return b


@pytest.fixture
async def p6_spread(db, p6_analyst, p6_borrower):
    from app.models.spread import Spread, SpreadStatus
    s = Spread(deal_name="P6 Term Loan", borrower_id=p6_borrower.id,
               created_by=p6_analyst.id, status=SpreadStatus.draft)
    db.add(s)
    await db.flush()
    await db.refresh(s)
    return s


@pytest.fixture
async def p6_sr_headers(client, p6_sr):
    resp = await client.post("/auth/login", json={"email": "p6_sr@bank.com", "password": "password123"})
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


@pytest.fixture
async def p6_analyst_headers(client, p6_analyst):
    resp = await client.post("/auth/login", json={"email": "p6_analyst@bank.com", "password": "password123"})
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


# ── Tests ─────────────────────────────────────────────────────────────────────

async def test_sr_can_access_summary(client, p6_sr_headers, p6_spread):
    resp = await client.get("/portfolio/summary", headers=p6_sr_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "status_counts" in data
    assert data["status_counts"]["total"] >= 1
    assert data["status_counts"]["draft"] >= 1
    assert "breach_alerts" in data
    assert "spread_summaries" in data


async def test_analyst_cannot_access_summary(client, p6_analyst_headers, p6_spread):
    resp = await client.get("/portfolio/summary", headers=p6_analyst_headers)
    assert resp.status_code == 403


async def test_breach_alerts_populated(client, p6_sr_headers, p6_spread, db):
    """Spread with a DSCR breach (value < 1.20 minimum) appears in breach_alerts."""
    from app.models.spread_period import SpreadPeriod, PeriodType
    from app.models.spread_line_item import SpreadLineItem

    # Add a period with line items that will produce a DSCR breach
    # DSCR = UCA_CFADS / Total_Debt_Service. To force breach: CFADS < 1.20 * debt_service
    period = SpreadPeriod(spread_id=p6_spread.id, fiscal_year=2024,
                          period_type=PeriodType.actual, locked=False)
    db.add(period)
    await db.flush()
    await db.refresh(period)

    # Minimal line items: Net Sales, EBIT, CFADS, Debt Service
    items = [
        SpreadLineItem(spread_period_id=period.id, statement="IS",
                       rma_field_key="net_sales", value=Decimal("1000000")),
        SpreadLineItem(spread_period_id=period.id, statement="IS",
                       rma_field_key="ebit", value=Decimal("100000")),
        SpreadLineItem(spread_period_id=period.id, statement="CF",
                       rma_field_key="uca_cfads", value=Decimal("50000")),   # DSCR = 0.50 → breach
        SpreadLineItem(spread_period_id=period.id, statement="CF",
                       rma_field_key="total_debt_service", value=Decimal("100000")),
    ]
    for item in items:
        db.add(item)
    await db.flush()

    resp = await client.get("/portfolio/summary", headers=p6_sr_headers)
    assert resp.status_code == 200
    alerts = resp.json()["breach_alerts"]
    dscr_breaches = [a for a in alerts if a["ratio_name"] == "dscr" and a["severity"] == "breach"]
    assert len(dscr_breaches) >= 1
    breach = dscr_breaches[0]
    assert breach["direction"] == "min"
    assert breach["threshold"] == 1.20
    assert breach["spread_id"] == p6_spread.id


async def test_near_threshold_included(client, p6_sr_headers, p6_spread, db):
    """Spread near-threshold (DSCR between 1.20 and 1.32) appears with severity near_threshold."""
    from app.models.spread_period import SpreadPeriod, PeriodType
    from app.models.spread_line_item import SpreadLineItem

    period = SpreadPeriod(spread_id=p6_spread.id, fiscal_year=2023,
                          period_type=PeriodType.actual, locked=False)
    db.add(period)
    await db.flush()
    await db.refresh(period)

    # DSCR = 1.25: above min 1.20 but within 10% (1.20 * 1.10 = 1.32) → near_threshold
    items = [
        SpreadLineItem(spread_period_id=period.id, statement="CF",
                       rma_field_key="uca_cfads", value=Decimal("125000")),
        SpreadLineItem(spread_period_id=period.id, statement="CF",
                       rma_field_key="total_debt_service", value=Decimal("100000")),
    ]
    for item in items:
        db.add(item)
    await db.flush()

    resp = await client.get("/portfolio/summary", headers=p6_sr_headers)
    assert resp.status_code == 200
    alerts = resp.json()["breach_alerts"]
    near = [a for a in alerts if a["ratio_name"] == "dscr" and a["severity"] == "near_threshold"]
    assert len(near) >= 1


async def test_empty_portfolio(client, p6_sr_headers):
    """No spreads created → zero counts, empty arrays."""
    resp = await client.get("/portfolio/summary", headers=p6_sr_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["status_counts"]["total"] == 0
    assert data["breach_alerts"] == []
    assert data["spread_summaries"] == []


async def test_spread_summary_names_resolved(client, p6_sr_headers, p6_spread, p6_borrower, p6_analyst):
    """spread_summaries[0].borrower_name and analyst_name match fixture data."""
    resp = await client.get("/portfolio/summary", headers=p6_sr_headers)
    assert resp.status_code == 200
    summaries = resp.json()["spread_summaries"]
    assert len(summaries) >= 1
    summary = next(s for s in summaries if s["id"] == p6_spread.id)
    assert summary["borrower_name"] == p6_borrower.name        # "Acme P6 Corp"
    assert summary["analyst_name"] == p6_analyst.full_name     # "Ana P6"
```

- [ ] **Step 2: Run tests to confirm they all fail** (service not implemented yet)

```bash
cd backend && python -m pytest tests/test_portfolio.py -v 2>&1 | tail -15
```
Expected: 6 failures (import error or 404).

- [ ] **Step 3: Implement the service** (Task 3, Step 2)

Return to Task 3 Step 2 and implement `service.py`, then run the tests again.

---

## Task 5: Backend — portfolio router + registration

**Files:**
- Create: `backend/app/modules/portfolio/router.py`
- Modify: `backend/app/main.py`

- [ ] **Step 1: Create `router.py`**

```python
# backend/app/modules/portfolio/router.py
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.modules.portfolio import service
from app.modules.portfolio.schemas import PortfolioSummary

router = APIRouter(tags=["portfolio"])


@router.get("/portfolio/summary", response_model=PortfolioSummary)
async def get_portfolio_summary(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await service.get_portfolio_summary(user, db)
```

- [ ] **Step 2: Register router in `main.py`**

Add two lines to `backend/app/main.py`:

```python
# Add with other imports:
from app.modules.portfolio.router import router as portfolio_router

# Add with other include_router calls:
app.include_router(portfolio_router)
```

- [ ] **Step 3: Run full test suite**

```bash
cd backend && python -m pytest tests/ -q --ignore=tests/test_memo.py 2>&1 | tail -5
```
Expected: `70 passed`.

- [ ] **Step 4: Commit**

```bash
git add backend/app/modules/portfolio/router.py backend/app/main.py
git commit -m "feat: register portfolio router — GET /portfolio/summary"
```

---

## Task 6: Frontend — types and API

**Files:**
- Modify: `frontend/src/types/index.ts`
- Create: `frontend/src/api/portfolio.ts`

- [ ] **Step 1: Add types to `types/index.ts`**

Append to the end of `frontend/src/types/index.ts`:

```typescript
export interface StatusCounts {
  draft: number
  completed: number
  reviewed: number
  exported: number
  total: number
}

export interface BreachAlert {
  spread_id: number
  deal_name: string
  borrower_name: string
  ratio_name: string
  value: number | null
  threshold: number
  direction: 'min' | 'max'
  severity: 'breach' | 'near_threshold'
}

export interface SpreadSummary {
  id: number
  deal_name: string
  borrower_name: string
  status: string
  analyst_name: string
  alert_count: number
  updated_at: string
}

export interface PortfolioSummary {
  status_counts: StatusCounts
  breach_alerts: BreachAlert[]
  spread_summaries: SpreadSummary[]
}
```

- [ ] **Step 2: Create `api/portfolio.ts`**

```typescript
// frontend/src/api/portfolio.ts
import client from './client'
import type { PortfolioSummary } from '../types'

export async function getPortfolioSummary(): Promise<PortfolioSummary> {
  const resp = await client.get<PortfolioSummary>('/portfolio/summary')
  return resp.data
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd frontend && npm run build 2>&1 | tail -5
```
Expected: clean build.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/types/index.ts frontend/src/api/portfolio.ts
git commit -m "feat: add PortfolioSummary types and portfolio API function"
```

---

## Task 7: Frontend — RoleRoute component

**Files:**
- Create: `frontend/src/components/RoleRoute.tsx`

- [ ] **Step 1: Create `RoleRoute.tsx`**

```tsx
// frontend/src/components/RoleRoute.tsx
import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '../store/auth'

interface Props {
  allowedRoles: string[]
  redirectTo: string
}

export default function RoleRoute({ allowedRoles, redirectTo }: Props) {
  const user = useAuthStore((s) => s.user)
  if (!user || !allowedRoles.includes(user.role)) {
    return <Navigate to={redirectTo} replace />
  }
  return <Outlet />
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd frontend && npm run build 2>&1 | tail -5
```
Expected: clean build.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/RoleRoute.tsx
git commit -m "feat: add RoleRoute component for role-based route guarding"
```

---

## Task 8: Frontend — DashboardPage

**Files:**
- Create: `frontend/src/pages/DashboardPage.tsx`

- [ ] **Step 1: Create `DashboardPage.tsx`**

```tsx
// frontend/src/pages/DashboardPage.tsx
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { getPortfolioSummary } from '../api/portfolio'
import StatusBadge from '../components/StatusBadge'
import type { SpreadSummary, BreachAlert } from '../types'

type FilterTab = 'all' | 'awaiting' | 'breaches'

const RATIO_LABELS: Record<string, string> = {
  dscr: 'DSCR',
  leverage: 'Leverage',
  current_ratio: 'Current Ratio',
  interest_coverage: 'Int. Coverage',
}

function filterSummaries(summaries: SpreadSummary[], tab: FilterTab): SpreadSummary[] {
  if (tab === 'awaiting') return summaries.filter(s => s.status === 'completed')
  if (tab === 'breaches') return summaries.filter(s => s.alert_count > 0)
  return summaries
}

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState<FilterTab>('all')
  const { data, isLoading, isError } = useQuery({
    queryKey: ['portfolio-summary'],
    queryFn: getPortfolioSummary,
  })

  if (isLoading) return (
    <div className="min-h-screen bg-[var(--bg-page)] flex items-center justify-center">
      <span className="text-sm text-[var(--text-secondary)]">Loading portfolio...</span>
    </div>
  )

  if (isError || !data) return (
    <div className="min-h-screen bg-[var(--bg-page)] flex items-center justify-center">
      <span className="text-sm text-[var(--breach)]">Could not load portfolio summary.</span>
    </div>
  )

  const { status_counts, breach_alerts, spread_summaries } = data
  const filteredSpreads = filterSummaries(spread_summaries, activeTab)
  const breachCount = breach_alerts.filter(a => a.severity === 'breach').length

  return (
    <div className="min-h-screen bg-[var(--bg-page)] p-6">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white; }
        }
      `}</style>

      {/* Header */}
      <div className="flex items-center justify-between mb-6 no-print">
        <div>
          <h1 className="text-xl font-bold text-[var(--text-primary)]">Portfolio Overview</h1>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">All deals · sr credit analyst view</p>
        </div>
        <button
          onClick={() => window.print()}
          className="bg-[var(--accent)] text-white text-sm font-semibold px-4 py-2 rounded-lg"
        >
          Export PDF
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-4">
          <div className="text-xs text-[var(--text-secondary)] uppercase tracking-wide mb-1">Total Deals</div>
          <div className="text-3xl font-bold text-[var(--text-primary)]">{status_counts.total}</div>
        </div>
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-4">
          <div className="text-xs text-[var(--text-secondary)] uppercase tracking-wide mb-1">Awaiting Review</div>
          <div className="text-3xl font-bold text-[var(--accent)]">{status_counts.completed}</div>
          <div className="text-xs text-[var(--text-secondary)] mt-1">needs sign-off</div>
        </div>
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-4">
          <div className="text-xs text-[var(--text-secondary)] uppercase tracking-wide mb-1">Ratio Breaches</div>
          <div className="text-3xl font-bold text-[var(--breach)]">{breachCount}</div>
          <div className="text-xs text-[var(--text-secondary)] mt-1">across {new Set(breach_alerts.filter(a => a.severity === 'breach').map(a => a.spread_id)).size} deals</div>
        </div>
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-4">
          <div className="text-xs text-[var(--text-secondary)] uppercase tracking-wide mb-1">Exported</div>
          <div className="text-3xl font-bold text-[var(--text-primary)]">{status_counts.exported}</div>
        </div>
      </div>

      {/* Middle row: Pipeline + Breach Alerts */}
      <div className="grid grid-cols-5 gap-4 mb-6">
        {/* Pipeline bar chart */}
        <div className="col-span-2 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-4">
          <div className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wide mb-4">Pipeline by Status</div>
          {status_counts.total === 0 ? (
            <p className="text-xs text-[var(--text-secondary)]">No deals yet.</p>
          ) : (
            <div className="space-y-3">
              {([
                ['Draft', status_counts.draft, 'bg-[var(--text-secondary)]'],
                ['Awaiting', status_counts.completed, 'bg-[var(--accent)]'],
                ['Reviewed', status_counts.reviewed, 'bg-green-600'],
                ['Exported', status_counts.exported, 'bg-blue-500'],
              ] as [string, number, string][]).map(([label, count, color]) => (
                <div key={label} className="flex items-center gap-3">
                  <div className="w-16 text-xs text-right text-[var(--text-secondary)]">{label}</div>
                  <div className="flex-1 bg-[var(--bg-page)] rounded h-4">
                    <div
                      className={`${color} rounded h-4 transition-all`}
                      style={{ width: `${(count / status_counts.total) * 100}%` }}
                    />
                  </div>
                  <div className="w-6 text-xs font-semibold text-[var(--text-primary)]">{count}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Breach & Near-Threshold Alerts */}
        <div className="col-span-3 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-4">
          <div className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wide mb-4">Breach &amp; Near-Threshold Alerts</div>
          {breach_alerts.length === 0 ? (
            <p className="text-xs text-[var(--text-secondary)]">No alerts — all ratios within thresholds.</p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className="text-left py-1.5 px-2 text-[var(--text-secondary)] font-semibold">Deal</th>
                  <th className="text-left py-1.5 px-2 text-[var(--text-secondary)] font-semibold">Ratio</th>
                  <th className="text-left py-1.5 px-2 text-[var(--text-secondary)] font-semibold">Value</th>
                  <th className="text-left py-1.5 px-2 text-[var(--text-secondary)] font-semibold">Threshold</th>
                </tr>
              </thead>
              <tbody>
                {breach_alerts.map((alert: BreachAlert, i: number) => (
                  <tr key={i} className="border-b border-[var(--border)] last:border-0">
                    <td className="py-1.5 px-2 font-semibold text-[var(--text-primary)]">{alert.deal_name}</td>
                    <td className={`py-1.5 px-2 ${alert.severity === 'breach' ? 'text-[var(--breach)]' : 'text-yellow-600'}`}>
                      {RATIO_LABELS[alert.ratio_name] ?? alert.ratio_name} {alert.severity === 'breach' ? '⛔' : '⚠'}
                    </td>
                    <td className={`py-1.5 px-2 font-semibold ${alert.severity === 'breach' ? 'text-[var(--breach)]' : 'text-yellow-600'}`}>
                      {alert.value != null ? alert.value.toFixed(2) : '—'}
                    </td>
                    <td className="py-1.5 px-2 text-[var(--text-secondary)]">
                      {alert.direction} {alert.threshold.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Spreads table */}
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wide">
            All Deals ({filteredSpreads.length})
          </div>
          <div className="flex gap-2 no-print">
            {([
              ['all', 'All'],
              ['awaiting', 'Awaiting Review'],
              ['breaches', 'Breaches Only'],
            ] as [FilterTab, string][]).map(([tab, label]) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`text-xs px-3 py-1 rounded ${
                  activeTab === tab
                    ? 'bg-[var(--accent)] text-white'
                    : 'bg-[var(--bg-page)] text-[var(--text-secondary)]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {filteredSpreads.length === 0 ? (
          <p className="text-xs text-[var(--text-secondary)] py-4 text-center">No deals match this filter.</p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="text-left py-2 px-2 text-[var(--text-secondary)] font-semibold">Deal Name</th>
                <th className="text-left py-2 px-2 text-[var(--text-secondary)] font-semibold">Borrower</th>
                <th className="text-left py-2 px-2 text-[var(--text-secondary)] font-semibold">Status</th>
                <th className="text-left py-2 px-2 text-[var(--text-secondary)] font-semibold">Analyst</th>
                <th className="text-left py-2 px-2 text-[var(--text-secondary)] font-semibold">Alerts</th>
                <th className="text-left py-2 px-2 text-[var(--text-secondary)] font-semibold">Updated</th>
              </tr>
            </thead>
            <tbody>
              {filteredSpreads.map((s: SpreadSummary) => (
                <tr key={s.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-page)] cursor-pointer">
                  <td className="py-2 px-2">
                    <Link to={`/spreads/${s.id}`} className="font-semibold text-[var(--accent)] hover:underline">
                      {s.deal_name}
                    </Link>
                  </td>
                  <td className="py-2 px-2 text-[var(--text-primary)]">{s.borrower_name}</td>
                  <td className="py-2 px-2"><StatusBadge status={s.status} /></td>
                  <td className="py-2 px-2 text-[var(--text-secondary)]">{s.analyst_name}</td>
                  <td className="py-2 px-2">
                    {s.alert_count > 0
                      ? <span className="text-[var(--breach)] font-semibold">{s.alert_count} alert{s.alert_count > 1 ? 's' : ''}</span>
                      : <span className="text-[var(--text-secondary)]">—</span>
                    }
                  </td>
                  <td className="py-2 px-2 text-[var(--text-secondary)]">
                    {new Date(s.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd frontend && npm run build 2>&1 | tail -5
```
Expected: clean build.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/DashboardPage.tsx
git commit -m "feat: add DashboardPage with KPI cards, pipeline chart, breach alerts, and spreads table"
```

---

## Task 9: Frontend — routing and post-login redirect

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/pages/LoginPage.tsx`

- [ ] **Step 1: Update `App.tsx`**

Replace the contents of `frontend/src/App.tsx`:

```tsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import LoginPage from './pages/LoginPage'
import DealDashboardPage from './pages/DealDashboardPage'
import DashboardPage from './pages/DashboardPage'
import SpreadDetailPage from './pages/SpreadDetailPage'
import ProtectedRoute from './components/ProtectedRoute'
import RoleRoute from './components/RoleRoute'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<DealDashboardPage />} />
          <Route path="/spreads/:id" element={<SpreadDetailPage />} />
          <Route
            element={
              <RoleRoute
                allowedRoles={['sr_credit_analyst', 'admin']}
                redirectTo="/"
              />
            }
          >
            <Route path="/dashboard" element={<DashboardPage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
```

- [ ] **Step 2: Update post-login redirect in `LoginPage.tsx`**

Find the `handleSubmit` function in `frontend/src/pages/LoginPage.tsx`. Replace the `navigate('/')` call with a role-aware redirect:

```tsx
// Before:
setAuth(user)
navigate('/')

// After:
setAuth(user)
const dest = (user.role === 'sr_credit_analyst' || user.role === 'admin')
  ? '/dashboard'
  : '/'
navigate(dest)
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd frontend && npm run build 2>&1 | tail -5
```
Expected: clean build.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/App.tsx frontend/src/pages/LoginPage.tsx
git commit -m "feat: add /dashboard route with RoleRoute guard and role-aware post-login redirect"
```

---

## Final verification

- [ ] **Run full backend test suite**

```bash
cd backend && python -m pytest tests/ -q --ignore=tests/test_memo.py 2>&1 | tail -5
```
Expected: `70 passed`.

- [ ] **Run frontend build**

```bash
cd frontend && npm run build 2>&1 | tail -5
```
Expected: clean, 0 errors.
