# Plan 7: Navigation & Layout Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the per-page header with a collapsible left sidebar, add Borrower List and Borrower Overview pages, and add a borrower breadcrumb to the Spread Detail page.

**Architecture:** A new `MainLayout` component wraps all protected routes and renders a `Sidebar` plus an `<Outlet />`. The sidebar handles nav, user identity, and sign-out globally. Two new pages (`BorrowerListPage`, `BorrowerOverviewPage`) make borrowers first-class navigable objects. The backend gains a `borrower_id` filter on `GET /spreads/`.

**Tech Stack:** FastAPI / SQLAlchemy async (Python 3.9) · React 18 + TypeScript + Tailwind + React Query v5 · React Router v6 nested routes · localStorage for sidebar collapse state

---

## File Map

### New files
| File | Responsibility |
|------|---------------|
| `frontend/src/components/Sidebar.tsx` | Collapsible nav sidebar with collapse toggle, nav items, user + sign-out |
| `frontend/src/components/MainLayout.tsx` | Layout shell: Sidebar + `<Outlet />` |
| `frontend/src/pages/BorrowerListPage.tsx` | `/borrowers` — table of all borrowers with spread counts |
| `frontend/src/pages/BorrowerOverviewPage.tsx` | `/borrowers/:id` — borrower metadata + spreads table |

### Modified files
| File | Change |
|------|--------|
| `backend/app/modules/spreads/router.py` | Add `borrower_id` query param to `GET /spreads/` |
| `backend/app/modules/spreads/service.py` | Add `borrower_id` filter to `list_spreads` |
| `backend/tests/test_spreads.py` | Add 2 tests for `borrower_id` filter |
| `frontend/src/api/borrowers.ts` | Add `getBorrowerById(id)` |
| `frontend/src/api/spreads.ts` | Add `getSpreadsByBorrowerId(borrowerId)` |
| `frontend/src/App.tsx` | Wrap protected routes in `MainLayout`, add `/borrowers` and `/borrowers/:id` routes |
| `frontend/src/pages/DealDashboardPage.tsx` | Remove `<header>` with user name + sign-out (sidebar owns it) |
| `frontend/src/pages/SpreadDetailPage.tsx` | Replace `← Dashboard` with `← BorrowerName` breadcrumb |

---

## Task 1: Backend — add `borrower_id` filter to `GET /spreads/`

**Files:**
- Modify: `backend/app/modules/spreads/service.py`
- Modify: `backend/app/modules/spreads/router.py`
- Test: `backend/tests/test_spreads.py`

- [ ] **Step 1.1: Write the failing tests**

Open `backend/tests/test_spreads.py` and append these two tests at the bottom:

```python
async def test_filter_by_borrower_id(client, analyst_headers, borrower_id):
    """Analyst sees only their own spreads for a specific borrower."""
    # Create a second analyst whose spread should be invisible
    from app.models.user import User, UserRole
    from app.core.security import hash_password
    # We need a second borrower ID via the same borrower for simplicity
    # Create spread for our analyst
    r1 = await client.post("/spreads/", json={"borrower_id": borrower_id, "deal_name": "My Borrower Deal"}, headers=analyst_headers)
    assert r1.status_code == 201

    # Create a second analyst and have them create a spread for the same borrower
    # (sr_headers already exists in test DB, login separately)
    reg = await client.post("/auth/register", json={
        "email": "analyst2_s@bank.com", "password": "password123",
        "full_name": "Analyst Two", "role": "analyst"
    })
    login2 = await client.post("/auth/login", json={"email": "analyst2_s@bank.com", "password": "password123"})
    headers2 = {"Authorization": f"Bearer {login2.json()['access_token']}"}
    r2 = await client.post("/spreads/", json={"borrower_id": borrower_id, "deal_name": "Other Analyst Deal"}, headers=headers2)
    assert r2.status_code == 201

    # Analyst 1 filters by borrower_id — should see only their own spread
    resp = await client.get(f"/spreads/?borrower_id={borrower_id}", headers=analyst_headers)
    assert resp.status_code == 200
    names = [s["deal_name"] for s in resp.json()]
    assert "My Borrower Deal" in names
    assert "Other Analyst Deal" not in names


async def test_filter_by_borrower_id_sr_sees_all(client, sr_headers, analyst_headers, borrower_id):
    """sr_credit_analyst sees all spreads for a borrower regardless of ownership."""
    # Analyst creates a spread
    await client.post("/spreads/", json={"borrower_id": borrower_id, "deal_name": "Analyst SR Deal"}, headers=analyst_headers)

    resp = await client.get(f"/spreads/?borrower_id={borrower_id}", headers=sr_headers)
    assert resp.status_code == 200
    names = [s["deal_name"] for s in resp.json()]
    assert "Analyst SR Deal" in names
```

- [ ] **Step 1.2: Run the failing tests**

```bash
cd backend
pytest tests/test_spreads.py::test_filter_by_borrower_id tests/test_spreads.py::test_filter_by_borrower_id_sr_sees_all -v
```

Expected: FAIL — `list_spreads` does not accept `borrower_id` yet.

- [ ] **Step 1.3: Update `service.py` — add `borrower_id` parameter**

```python
# backend/app/modules/spreads/service.py
from typing import List, Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.spread import Spread
from app.models.user import User, UserRole
from app.modules.spreads.schemas import SpreadCreate


async def create_spread(data: SpreadCreate, user: User, db: AsyncSession) -> Spread:
    spread = Spread(**data.model_dump(), created_by=user.id)
    db.add(spread)
    await db.flush()
    await db.refresh(spread)
    return spread


async def list_spreads(
    user: User,
    db: AsyncSession,
    borrower_id: Optional[int] = None,
) -> List[Spread]:
    query = select(Spread).order_by(Spread.updated_at.desc())
    if user.role == UserRole.analyst:
        query = query.where(Spread.created_by == user.id)
    if borrower_id is not None:
        query = query.where(Spread.borrower_id == borrower_id)
    result = await db.execute(query)
    return list(result.scalars().all())


async def get_spread(spread_id: int, user: User, db: AsyncSession) -> Optional[Spread]:
    query = select(Spread).where(Spread.id == spread_id)
    if user.role == UserRole.analyst:
        query = query.where(Spread.created_by == user.id)
    result = await db.execute(query)
    return result.scalar_one_or_none()
```

- [ ] **Step 1.4: Update `router.py` — add `borrower_id` query param**

```python
# backend/app/modules/spreads/router.py
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.database import get_db
from app.models.user import User
from app.modules.spreads import service
from app.modules.spreads.schemas import SpreadCreate, SpreadRead

router = APIRouter(prefix="/spreads", tags=["spreads"])


@router.post("/", response_model=SpreadRead, status_code=status.HTTP_201_CREATED)
async def create_spread(
    body: SpreadCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await service.create_spread(body, user, db)


@router.get("/", response_model=list[SpreadRead])
async def list_spreads(
    borrower_id: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await service.list_spreads(user, db, borrower_id=borrower_id)


@router.get("/{spread_id}", response_model=SpreadRead)
async def get_spread(
    spread_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    spread = await service.get_spread(spread_id, user, db)
    if not spread:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Spread not found")
    return spread
```

- [ ] **Step 1.5: Run all spread tests**

```bash
cd backend
pytest tests/test_spreads.py -v
```

Expected: all tests PASS (including the 2 new ones).

- [ ] **Step 1.6: Commit**

```bash
cd backend
git add app/modules/spreads/service.py app/modules/spreads/router.py tests/test_spreads.py
git commit -m "feat: add borrower_id filter to GET /spreads/"
```

---

## Task 2: Frontend API helpers

**Files:**
- Modify: `frontend/src/api/borrowers.ts`
- Modify: `frontend/src/api/spreads.ts`

These are pure additions — no existing logic changes.

- [ ] **Step 2.1: Add `getBorrowerById` to `borrowers.ts`**

Replace the full file:

```typescript
// frontend/src/api/borrowers.ts
import { apiClient } from './client'
import type { Borrower } from '../types'

export async function getBorrowers(): Promise<Borrower[]> {
  const { data } = await apiClient.get<Borrower[]>('/borrowers/')
  return data
}

export async function getBorrowerById(id: number): Promise<Borrower> {
  const { data } = await apiClient.get<Borrower>(`/borrowers/${id}`)
  return data
}
```

- [ ] **Step 2.2: Add `getSpreadsByBorrowerId` to `spreads.ts`**

Replace the full file:

```typescript
// frontend/src/api/spreads.ts
import { apiClient } from './client'
import type { Spread } from '../types'

export async function getSpreads(): Promise<Spread[]> {
  const { data } = await apiClient.get<Spread[]>('/spreads/')
  return data
}

export async function getSpreadsByBorrowerId(borrowerId: number): Promise<Spread[]> {
  const { data } = await apiClient.get<Spread[]>(`/spreads/?borrower_id=${borrowerId}`)
  return data
}

export async function createSpread(payload: {
  borrower_id: number
  deal_name: string
  loan_type_id?: number
}): Promise<Spread> {
  const { data } = await apiClient.post<Spread>('/spreads/', payload)
  return data
}
```

- [ ] **Step 2.3: Verify TypeScript compiles**

```bash
cd frontend
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 2.4: Commit**

```bash
git add src/api/borrowers.ts src/api/spreads.ts
git commit -m "feat: add getBorrowerById and getSpreadsByBorrowerId API helpers"
```

---

## Task 3: Sidebar component

**Files:**
- Create: `frontend/src/components/Sidebar.tsx`

The sidebar reads from `useAuthStore`, persists collapse state in `localStorage`, and uses `useLocation` for active item detection.

- [ ] **Step 3.1: Create `Sidebar.tsx`**

```tsx
// frontend/src/components/Sidebar.tsx
import { useLocation, useNavigate, Link } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useAuthStore } from '../store/auth'

const STORAGE_KEY = 'sidebar_collapsed'

interface NavItem {
  icon: string
  label: string
  path: string
  adminOnly?: boolean
}

const NAV_ITEMS: NavItem[] = [
  { icon: '📋', label: 'Deals', path: '/' },
  { icon: '🏢', label: 'Borrowers', path: '/borrowers' },
  { icon: '📊', label: 'Portfolio', path: '/dashboard', adminOnly: true },
]

export default function Sidebar() {
  const location = useLocation()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)

  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'true'
    } catch {
      return false
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, String(collapsed))
    } catch {
      // ignore
    }
  }, [collapsed])

  const handleSignOut = () => {
    logout()
    navigate('/login')
  }

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/'
    return location.pathname.startsWith(path)
  }

  const isSrOrAdmin = user?.role === 'sr_credit_analyst' || user?.role === 'admin'
  const visibleItems = NAV_ITEMS.filter((item) => !item.adminOnly || isSrOrAdmin)

  const initials = user?.full_name
    ? user.full_name.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase()
    : '?'

  return (
    <aside
      style={{
        width: collapsed ? 52 : 240,
        minWidth: collapsed ? 52 : 240,
        transition: 'width 0.2s ease, min-width 0.2s ease',
        background: 'var(--bg-strip)',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        height: '100vh',
        position: 'sticky',
        top: 0,
        overflowX: 'hidden',
      }}
    >
      {/* Top: logo + collapse toggle */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'space-between',
          padding: collapsed ? '14px 0' : '14px 12px 14px 16px',
          borderBottom: '1px solid #3a2e20',
          flexShrink: 0,
        }}
      >
        {!collapsed && (
          <span style={{ fontSize: 13, fontWeight: 700, color: '#c8b89a', letterSpacing: '0.04em' }}>
            SpreadSense
          </span>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          style={{
            background: 'none',
            border: 'none',
            color: '#8a7a5a',
            fontSize: 16,
            cursor: 'pointer',
            padding: '2px 4px',
            lineHeight: 1,
          }}
        >
          {collapsed ? '›' : '‹'}
        </button>
      </div>

      {/* Nav items */}
      <nav style={{ flex: 1, padding: '8px 6px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {visibleItems.map((item) => {
          const active = isActive(item.path)
          return (
            <Link
              key={item.path}
              to={item.path}
              title={collapsed ? item.label : undefined}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: collapsed ? 0 : 10,
                justifyContent: collapsed ? 'center' : 'flex-start',
                padding: collapsed ? '9px 0' : '8px 10px',
                borderRadius: 6,
                textDecoration: 'none',
                background: active ? '#3a2e20' : 'transparent',
                color: active ? '#f5f0e8' : '#c8b89a',
                fontSize: 13,
                fontWeight: active ? 600 : 400,
                transition: 'background 0.15s',
              }}
            >
              <span style={{ fontSize: 15, flexShrink: 0 }}>{item.icon}</span>
              {!collapsed && <span>{item.label}</span>}
            </Link>
          )
        })}
      </nav>

      {/* Bottom: user + sign out */}
      <div
        style={{
          borderTop: '1px solid #3a2e20',
          padding: collapsed ? '10px 0' : '10px 12px',
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          alignItems: collapsed ? 'center' : 'flex-start',
        }}
      >
        {collapsed ? (
          <div
            title={user?.full_name ?? ''}
            style={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              background: '#3a2e20',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 10,
              color: '#92805a',
              fontWeight: 600,
              cursor: 'default',
            }}
          >
            {initials}
          </div>
        ) : (
          <>
            <div>
              <div style={{ fontSize: 12, color: '#c8b89a', fontWeight: 500 }}>{user?.full_name}</div>
              <div style={{ fontSize: 10, color: '#8a7a5a', textTransform: 'capitalize' }}>
                {user?.role?.replace(/_/g, ' ')}
              </div>
            </div>
            <button
              onClick={handleSignOut}
              style={{
                background: 'none',
                border: 'none',
                color: '#8a7a5a',
                fontSize: 11,
                cursor: 'pointer',
                padding: 0,
                textAlign: 'left',
              }}
            >
              Sign out
            </button>
          </>
        )}
      </div>
    </aside>
  )
}
```

- [ ] **Step 3.2: Check TypeScript**

```bash
cd frontend
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3.3: Commit**

```bash
git add src/components/Sidebar.tsx
git commit -m "feat: add collapsible Sidebar component"
```

---

## Task 4: MainLayout component

**Files:**
- Create: `frontend/src/components/MainLayout.tsx`

- [ ] **Step 4.1: Create `MainLayout.tsx`**

```tsx
// frontend/src/components/MainLayout.tsx
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'

export default function MainLayout() {
  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <main style={{ flex: 1, minWidth: 0, overflow: 'auto' }}>
        <Outlet />
      </main>
    </div>
  )
}
```

- [ ] **Step 4.2: Commit**

```bash
git add src/components/MainLayout.tsx
git commit -m "feat: add MainLayout shell with Sidebar + Outlet"
```

---

## Task 5: Update `App.tsx` routing

**Files:**
- Modify: `frontend/src/App.tsx`

- [ ] **Step 5.1: Replace `App.tsx`**

```tsx
// frontend/src/App.tsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import LoginPage from './pages/LoginPage'
import DealDashboardPage from './pages/DealDashboardPage'
import DashboardPage from './pages/DashboardPage'
import SpreadDetailPage from './pages/SpreadDetailPage'
import BorrowerListPage from './pages/BorrowerListPage'
import BorrowerOverviewPage from './pages/BorrowerOverviewPage'
import ProtectedRoute from './components/ProtectedRoute'
import RoleRoute from './components/RoleRoute'
import MainLayout from './components/MainLayout'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<MainLayout />}>
            <Route path="/" element={<DealDashboardPage />} />
            <Route path="/borrowers" element={<BorrowerListPage />} />
            <Route path="/borrowers/:id" element={<BorrowerOverviewPage />} />
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
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
```

Note: `BorrowerListPage` and `BorrowerOverviewPage` don't exist yet — TypeScript will error until Task 6 and 7 create them. Either create stub files first (recommended), or complete Tasks 6 and 7 before checking types.

- [ ] **Step 5.2: Create stub files to unblock TypeScript**

```tsx
// frontend/src/pages/BorrowerListPage.tsx
export default function BorrowerListPage() { return <div>Borrowers</div> }
```

```tsx
// frontend/src/pages/BorrowerOverviewPage.tsx
export default function BorrowerOverviewPage() { return <div>Borrower Overview</div> }
```

- [ ] **Step 5.3: Check TypeScript**

```bash
cd frontend
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 5.4: Commit**

```bash
git add src/App.tsx src/pages/BorrowerListPage.tsx src/pages/BorrowerOverviewPage.tsx
git commit -m "feat: wire MainLayout and new borrower routes in App.tsx"
```

---

## Task 6: Remove old header from `DealDashboardPage`

**Files:**
- Modify: `frontend/src/pages/DealDashboardPage.tsx`

The sidebar now owns user identity, navigation, and sign-out. Remove the `<header>` block and unused imports (`useAuthStore`, `useNavigate`).

- [ ] **Step 6.1: Remove the header from `DealDashboardPage`**

Find and delete this block (approximately lines 21–32):

```tsx
      <header className="bg-[var(--bg-strip)] px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-[var(--bg-page)]">Deal Dashboard</h1>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">SpreadSense</p>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-[var(--text-secondary)]">{user?.full_name}</span>
          <button onClick={handleLogout} className="text-sm text-[var(--text-secondary)] hover:text-[var(--bg-page)]">Sign out</button>
        </div>
      </header>
```

Also remove:
- `const user = useAuthStore((s) => s.user)` (line using authStore for name)
- `const logout = useAuthStore((s) => s.logout)` 
- `const navigate = useNavigate()`
- `const handleLogout = () => { logout(); navigate('/login', { replace: true }) }`
- The `useNavigate` and `useAuthStore` imports (if no longer used elsewhere in the file)

The outer `<div className="min-h-screen bg-[var(--bg-page)]">` and everything inside `<main>` stays unchanged.

- [ ] **Step 6.2: Check TypeScript**

```bash
cd frontend
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 6.3: Commit**

```bash
git add src/pages/DealDashboardPage.tsx
git commit -m "refactor: remove per-page header from DealDashboardPage (sidebar owns it)"
```

---

## Task 7: Add borrower breadcrumb to `SpreadDetailPage`

**Files:**
- Modify: `frontend/src/pages/SpreadDetailPage.tsx`

The `spread` object is already resolved via `spreads.find(s => s.id === spreadId)`. We need to add a `useQuery` for the borrower name, then replace `← Dashboard` with `← BorrowerName`.

- [ ] **Step 7.1: Add borrower query and replace breadcrumb**

At the top of the file, add the import:
```tsx
import { getBorrowerById } from '../api/borrowers'
import { Link } from 'react-router-dom'
```

After the existing `spreads` query (around line 43), add:
```tsx
  const { data: borrower } = useQuery({
    queryKey: ['borrower', spread?.borrower_id],
    queryFn: () => getBorrowerById(spread!.borrower_id),
    enabled: !!spread?.borrower_id,
  })
```

In the `<header>` block, replace:
```tsx
        <button onClick={() => navigate('/')} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-sm">
          ← Dashboard
        </button>
```

With:
```tsx
        <Link
          to={`/borrowers/${spread?.borrower_id}`}
          className="text-[var(--accent)] hover:opacity-80 text-sm"
        >
          ← {borrower?.name ?? '...'}
        </Link>
```

If `navigate` is now unused, remove it and the `useNavigate` import.

- [ ] **Step 7.2: Check TypeScript**

```bash
cd frontend
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 7.3: Commit**

```bash
git add src/pages/SpreadDetailPage.tsx
git commit -m "feat: add borrower breadcrumb to SpreadDetailPage"
```

---

## Task 8: `BorrowerListPage`

**Files:**
- Modify: `frontend/src/pages/BorrowerListPage.tsx` (replace stub from Task 5)

This page fetches `getBorrowers()` and `getSpreads()` in parallel, then computes spread counts client-side.

- [ ] **Step 8.1: Implement `BorrowerListPage`**

```tsx
// frontend/src/pages/BorrowerListPage.tsx
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { getBorrowers } from '../api/borrowers'
import { getSpreads } from '../api/spreads'
import { useAuthStore } from '../store/auth'

function toMonthName(month: number): string {
  return new Date(2000, month - 1).toLocaleString('default', { month: 'long' })
}

export default function BorrowerListPage() {
  const user = useAuthStore((s) => s.user)
  const isSrOrAdmin = user?.role === 'sr_credit_analyst' || user?.role === 'admin'
  const spreadColLabel = isSrOrAdmin ? 'Spreads' : 'My Spreads'

  const { data: borrowers = [], isLoading: borrowersLoading } = useQuery({
    queryKey: ['borrowers'],
    queryFn: getBorrowers,
  })

  const { data: spreads = [], isLoading: spreadsLoading } = useQuery({
    queryKey: ['spreads'],
    queryFn: getSpreads,
  })

  const isLoading = borrowersLoading || spreadsLoading

  function spreadCount(borrowerId: number): number {
    return spreads.filter((s) => s.borrower_id === borrowerId).length
  }

  function lastSpreadDate(borrowerId: number): string {
    const dates = spreads
      .filter((s) => s.borrower_id === borrowerId)
      .map((s) => new Date(s.updated_at).getTime())
    if (dates.length === 0) return '—'
    const max = new Date(Math.max(...dates))
    return max.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  return (
    <div className="min-h-screen bg-[var(--bg-page)]">
      <div className="max-w-6xl mx-auto px-6 py-8">
        <h1 className="text-xl font-semibold text-[var(--text-primary)] mb-6">Borrowers</h1>

        {isLoading ? (
          <p className="text-[var(--text-secondary)] text-sm">Loading...</p>
        ) : borrowers.length === 0 ? (
          <div className="text-center py-16 text-[var(--text-secondary)]">
            <p className="text-lg">No borrowers yet</p>
            <p className="text-sm mt-1">Borrowers are created when you start a new spread.</p>
          </div>
        ) : (
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-[var(--bg-page)] border-b border-[var(--border)]">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-[var(--text-secondary)]">Name</th>
                  <th className="px-4 py-3 text-left font-medium text-[var(--text-secondary)]">Industry</th>
                  <th className="px-4 py-3 text-left font-medium text-[var(--text-secondary)]">FY End</th>
                  <th className="px-4 py-3 text-left font-medium text-[var(--text-secondary)]">{spreadColLabel}</th>
                  <th className="px-4 py-3 text-left font-medium text-[var(--text-secondary)]">Last Spread</th>
                </tr>
              </thead>
              <tbody>
                {borrowers.map((borrower) => (
                  <tr key={borrower.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-page)]">
                    <td className="px-4 py-3">
                      <Link
                        to={`/borrowers/${borrower.id}`}
                        className="text-[var(--accent)] hover:opacity-80 font-medium"
                      >
                        {borrower.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-[var(--text-secondary)]">
                      {borrower.industry ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-[var(--text-secondary)]">
                      {borrower.fiscal_year_end_month
                        ? toMonthName(borrower.fiscal_year_end_month)
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-[var(--text-primary)]">{spreadCount(borrower.id)}</td>
                    <td className="px-4 py-3 text-[var(--text-secondary)]">{lastSpreadDate(borrower.id)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
```

**Note on `Borrower` type:** The `Borrower` type in `frontend/src/types/index.ts` must have `industry?: string | null` and `fiscal_year_end_month?: number | null` fields. If they are missing, add them to the type definition before running tsc.

- [ ] **Step 8.2: Check TypeScript**

```bash
cd frontend
npx tsc --noEmit
```

If you see errors about missing fields on `Borrower`, open `frontend/src/types/index.ts`, find the `Borrower` interface, and add the missing optional fields.

Expected after fix: 0 errors.

- [ ] **Step 8.3: Commit**

```bash
git add src/pages/BorrowerListPage.tsx src/types/index.ts
git commit -m "feat: implement BorrowerListPage with spread counts"
```

---

## Task 9: `BorrowerOverviewPage`

**Files:**
- Modify: `frontend/src/pages/BorrowerOverviewPage.tsx` (replace stub from Task 5)

This page fetches a single borrower and their spreads. It uses `useParams` to extract the `id`.

- [ ] **Step 9.1: Implement `BorrowerOverviewPage`**

```tsx
// frontend/src/pages/BorrowerOverviewPage.tsx
import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getBorrowerById } from '../api/borrowers'
import { getSpreadsByBorrowerId } from '../api/spreads'
import StatusBadge from '../components/StatusBadge'

function toMonthName(month: number): string {
  return new Date(2000, month - 1).toLocaleString('default', { month: 'long' })
}

export default function BorrowerOverviewPage() {
  const { id } = useParams<{ id: string }>()
  const borrowerId = Number(id)

  const { data: borrower, isLoading: borrowerLoading } = useQuery({
    queryKey: ['borrower', borrowerId],
    queryFn: () => getBorrowerById(borrowerId),
    enabled: !!borrowerId,
  })

  const { data: spreads = [], isLoading: spreadsLoading } = useQuery({
    queryKey: ['spreads-by-borrower', borrowerId],
    queryFn: () => getSpreadsByBorrowerId(borrowerId),
    enabled: !!borrowerId,
  })

  return (
    <div className="min-h-screen bg-[var(--bg-page)]">
      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-6">
          <Link to="/borrowers" className="text-[var(--accent)] hover:opacity-80 text-sm">
            ← Borrowers
          </Link>
          <h1 className="text-xl font-semibold text-[var(--text-primary)] mt-2">
            {borrowerLoading ? (
              <span className="inline-block w-48 h-6 bg-[var(--border)] rounded animate-pulse" />
            ) : (
              borrower?.name ?? 'Borrower'
            )}
          </h1>
        </div>

        {/* Metadata cards */}
        {!borrowerLoading && borrower && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <MetaCard label="Industry" value={borrower.industry ?? '—'} />
            <MetaCard label="SIC Code" value={borrower.sic_code ? String(borrower.sic_code) : '—'} />
            <MetaCard
              label="FY End"
              value={borrower.fiscal_year_end_month ? toMonthName(borrower.fiscal_year_end_month) : '—'}
            />
            <MetaCard label="Total Spreads" value={String(spreads.length)} />
          </div>
        )}

        {/* Spreads table */}
        <h2 className="text-base font-semibold text-[var(--text-primary)] mb-3">Spreads</h2>
        {spreadsLoading ? (
          <p className="text-[var(--text-secondary)] text-sm">Loading spreads...</p>
        ) : spreads.length === 0 ? (
          <p className="text-[var(--text-secondary)] text-sm">No spreads for this borrower.</p>
        ) : (
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-[var(--bg-page)] border-b border-[var(--border)]">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-[var(--text-secondary)]">Deal Name</th>
                  <th className="px-4 py-3 text-left font-medium text-[var(--text-secondary)]">Status</th>
                  <th className="px-4 py-3 text-left font-medium text-[var(--text-secondary)]">Updated</th>
                </tr>
              </thead>
              <tbody>
                {spreads.map((spread) => (
                  <tr key={spread.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-page)]">
                    <td className="px-4 py-3">
                      <Link
                        to={`/spreads/${spread.id}`}
                        className="text-[var(--accent)] hover:opacity-80 font-medium"
                      >
                        {spread.deal_name}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={spread.status} />
                    </td>
                    <td className="px-4 py-3 text-[var(--text-secondary)]">
                      {new Date(spread.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function MetaCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4">
      <div className="text-xs text-[var(--text-secondary)] mb-1">{label}</div>
      <div className="text-sm font-semibold text-[var(--text-primary)]">{value}</div>
    </div>
  )
}
```

**Note on `Borrower` type:** The `sic_code` field already exists in the `Borrower` type as `string` — `String(borrower.sic_code)` handles this correctly, no change needed.

- [ ] **Step 9.2: Check TypeScript**

```bash
cd frontend
npx tsc --noEmit
```

Fix any type errors by checking `frontend/src/types/index.ts` against the backend `BorrowerRead` schema.

- [ ] **Step 9.3: Commit**

```bash
git add src/pages/BorrowerOverviewPage.tsx src/types/index.ts
git commit -m "feat: implement BorrowerOverviewPage with metadata cards and spreads table"
```

---

## Task 10: Final build verification

- [ ] **Step 10.1: Run full backend test suite**

```bash
cd backend
pytest -v
```

Expected: all tests pass.

- [ ] **Step 10.2: Build frontend**

```bash
cd frontend
npm run build
```

Expected: 0 errors, build completes.

- [ ] **Step 10.3: Smoke test in browser**

Start the dev server:
```bash
cd frontend
npm run dev
```

Verify these routes all render without errors (open browser devtools console):
1. `/` — Deal list with sidebar visible
2. `/borrowers` — Borrower table
3. `/borrowers/1` (or any valid ID) — Borrower overview with metadata cards
4. `/spreads/1` (or any valid ID) — Spread detail with `← BorrowerName` breadcrumb
5. `/dashboard` (sr/admin only) — Portfolio dashboard

Also verify sidebar collapse works and persists across page refresh.

- [ ] **Step 10.4: Final commit if any cleanup was needed**

```bash
git add -p
git commit -m "chore: final cleanup for Plan 7 navigation layout"
```
