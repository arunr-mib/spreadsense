# SpreadSense Deployment Runbook

**Audience:** Anyone (including future-you) responding to a production incident or doing a fresh deployment.
**Last updated:** 2026-05-03

---

## Production Topology At-A-Glance

```
            ┌──────────────────────────────────────────┐
Browser ──▶ │  Vercel: spreadsense.vercel.app          │
            │  Static Vite build of frontend/          │
            └────────────┬─────────────────────────────┘
                         │  /api/* rewritten to ↓
                         ▼
            ┌──────────────────────────────────────────┐
            │  Railway: spreadsense-production         │
            │  .up.railway.app                         │
            │  FastAPI in Docker (backend/Dockerfile)  │
            └────────────┬─────────────────────────────┘
                         │  asyncpg over SSL ↓
                         ▼
            ┌──────────────────────────────────────────┐
            │  Neon: ep-summer-bar-aksbh4c6-pooler...  │
            │  Managed Postgres 16                      │
            └──────────────────────────────────────────┘
```

Source repo: https://github.com/arunr-mib/spreadsense

---

## Required Environment Variables

### Backend (Railway service)

| Variable | Example / Notes |
|---|---|
| `DATABASE_URL` | `postgresql+asyncpg://USER:PASSWORD@HOST/DB?ssl=require` (asyncpg driver, NOT `postgresql://`) |
| `ANTHROPIC_API_KEY` | `sk-ant-api03-...` (full 108-char key) |
| `JWT_SECRET` | 48+ char random — generate with `python3 -c "import secrets; print(secrets.token_urlsafe(48))"` |
| `JWT_ALGORITHM` | `HS256` |
| `JWT_EXPIRE_MINUTES` | `30` |

Railway auto-injects `PORT` — the Dockerfile binds `uvicorn` to `${PORT:-8001}`.

### Frontend (Vercel project)

No env vars currently required. The `/api/*` proxy target is hardcoded in `frontend/vercel.json` — change the file (and redeploy) if the backend URL changes.

### Local dev (`.env` at repo root, NOT committed)

Includes `ANTHROPIC_API_KEY`, `JWT_SECRET`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`. The Postgres vars are used by `docker-compose.yml` to construct a local `DATABASE_URL`.

---

## First-Time Deployment Checklist

If standing up a fresh environment (e.g. moving to a new account or staging clone):

### 1. GitHub
- Repo: https://github.com/arunr-mib/spreadsense
- Default branch: `main`
- CI runs automatically on push (`.github/workflows/test.yml`)

### 2. Neon (Postgres)
1. Create a project (any region near your Railway region).
2. Use the default `neondb` database or create a dedicated one.
3. Copy the connection string from the Neon dashboard.
4. **Convert it for asyncpg:**
   - Replace `postgresql://` with `postgresql+asyncpg://`
   - Replace `?sslmode=require&channel_binding=require` (or any psycopg-style SSL params) with `?ssl=require`
   - asyncpg handles channel binding automatically when SSL is on.

### 3. Railway (FastAPI backend)
1. **New project → Deploy from GitHub repo →** select `arunr-mib/spreadsense`.
2. **Service Settings → Source → Root Directory:** `backend`
3. **Variables tab → Raw Editor → paste all 5 env vars** (see table above).
4. **Settings → Networking → Generate Domain** with port `8080` (Railway's default for `$PORT`).
5. Trigger a deploy (commit a new change OR click "Apply changes / Deploy").
6. Watch **Deployments → View Logs** for:
   - `==> Building image...` (NOT `railpack` — see Troubleshooting if you see that)
   - `Running upgrade -> e41fb146095b, initial schema` (alembic migrations)
   - `Uvicorn running on http://0.0.0.0:8080`
7. Verify: `curl https://YOUR-SERVICE.up.railway.app/health` → `{"status":"ok"}`

### 4. Vercel (frontend)
1. From the host machine: `cd frontend && vercel login` (browser OAuth).
2. `vercel link --yes --project spreadsense` (auto-creates project if missing).
3. `vercel deploy --prod --yes` → produces a deployment URL.
4. Verify: open `https://spreadsense.vercel.app` — login page should render.
5. Verify proxy: `curl https://spreadsense.vercel.app/api/health` → should return the same `{"status":"ok"}` as Railway directly.

### 5. Smoke test (end-to-end)
1. Open https://spreadsense.vercel.app
2. Register a test user via the signup form (or `POST /api/auth/register`).
3. Create a borrower, then a spread.
4. Upload `/tmp/sec_10k.pdf` (use `python3 scripts/fetch_10k_pdf.py docu` to get one).
5. Wait ~30s for extraction → review confidence-coded table → confirm.
6. Open the spread grid and verify line items populated.

---

## Endpoints

- `GET /sec/fetch?ticker=&form=10-K|10-Q` — auth-required. Resolves ticker via
  SEC's `company_tickers.json`, fetches the latest matching filing, and renders
  it to PDF using WeasyPrint. Streams the result back as `application/pdf` with
  `Content-Disposition: attachment` and `X-PDF-Pages` header. No new env vars.
  SEC traffic uses User-Agent `SpreadSense (contact@adamsmind.ai)`.

---

## Common Failure Modes & Fixes

### "Application not found" (HTTP 404 from Railway URL)

The Railway service has no successful deployment, or the deployment crashed.

**Diagnostic:** Railway → service → Deployments tab → look at the latest entry's status.

| Status | Action |
|---|---|
| 🟠 Building / Deploying | Wait — first build takes 2-3 min |
| 🔴 Crashed / Failed during build | Click → View Logs → see "Build failure" cases below |
| 🔴 Crashed / Removed at runtime | Click → View Logs → see "Runtime crash" cases below |
| 🟢 Success but still 404 externally | Networking → confirm domain is on the CURRENT deployment (not an orphaned one) |

### Build failure: "railpack process exited with an error"

Railway is using its Railpack auto-detector instead of your Dockerfile.

**Fix:** confirm `backend/railway.json` exists and contains `"builder": "DOCKERFILE"`. If editing, push to `main` to trigger a redeploy.

### Build failure: pip install fails

Usually a transient network blip on Railway. **Retry the deploy** from the Deployments tab. If it persists, check if `pyproject.toml` references a package that needs a system library not in `python:3.12-slim` — install via apt in the Dockerfile.

### WeasyPrint native libs

The backend image must include libpango, libcairo, libgdk-pixbuf, libffi8,
libglib, fontconfig, and a font package (we use `fonts-dejavu-core`). These
were added to `backend/Dockerfile` for the SEC fetcher — if you're rebuilding
from a fork or older base image, ensure the `apt-get install` layer is
preserved or PDF rendering will fail at import time with
`OSError: cannot load library 'libgobject-2.0-0'`.

### Runtime crash: "alembic.util.exc.CommandError" or "relation does not exist"

The database is in an inconsistent state. Possibly:
- Migrations failed mid-run on a prior deploy.
- Someone manually dropped tables but `alembic_version` still says we're at head.

**Fix:** open a Railway shell (or temporarily change the Dockerfile CMD) and run:
```bash
alembic stamp base
alembic upgrade head
```
This resets the alembic version pointer and reapplies all migrations from scratch.

### Runtime crash: "ANTHROPIC_API_KEY is not set in environment"

The variable isn't reaching the container.

**Fix:** Railway → Variables tab → confirm `ANTHROPIC_API_KEY` is present and starts with `sk-ant-api03-`. If you see only a placeholder string, click the row's 3-dot menu → Edit → paste the real value.

### Runtime crash: "asyncpg.exceptions.InvalidCatalogNameError" or "database does not exist"

The `DATABASE_URL` points at a database name that doesn't exist on the Neon project.

**Fix:** verify the database name in the URL matches what Neon shows (default is `neondb`). Connect with the Neon SQL editor and `CREATE DATABASE` if needed.

### Login works but API calls 401 immediately after

JWT signing mismatch — `JWT_SECRET` differs between when the token was issued and now (e.g. you redeployed with a fresh secret).

**Fix:** clear browser localStorage and log in again. To prevent: never rotate `JWT_SECRET` without a session-invalidation plan.

### Login works locally but fails on production with CORS errors

The frontend is calling the backend cross-origin instead of using the Vercel rewrite.

**Fix:** verify `frontend/src/api/client.ts` has `baseURL: '/api'` (not the absolute Railway URL). Confirm `frontend/vercel.json` contains the `/api/:path*` rewrite. Redeploy frontend.

### Frontend shows blank page in production but works in dev

Almost certainly a TypeScript build error caught only by `tsc -b` (production strict mode). The dev server is more lenient.

**Fix:** run `npm run build` locally — fix any type errors it surfaces, commit, and push (CI will gate this on PRs going forward).

### Tests wipe production data

**This must never happen again.** Verify `backend/tests/conftest.py`:
- `TEST_DATABASE_URL` should default to `postgresql+asyncpg://...@postgres:5432/fst_test_db` (note `_test_`)
- Override via `TEST_DATABASE_URL` env var if running outside Docker

The session-scoped `engine` fixture runs `Base.metadata.drop_all()` — if it ever points at production, all tables die.

---

## Rotating Secrets

### Anthropic API key

1. Anthropic console → revoke old key.
2. Create a new key.
3. Update `ANTHROPIC_API_KEY` in Railway Variables.
4. Update local `.env`.
5. Railway auto-redeploys; no other action needed.

### JWT secret

1. Generate a new one: `python3 -c "import secrets; print(secrets.token_urlsafe(48))"`
2. Update `JWT_SECRET` in Railway Variables.
3. **All existing user sessions will be invalidated** — communicate to users beforehand.

### Neon database password

1. Neon dashboard → reset password.
2. Construct new asyncpg-formatted connection string.
3. Update `DATABASE_URL` in Railway Variables.
4. Railway auto-redeploys with new credential.

---

## Manual Operations

### Reset the production database (destructive!)

```bash
# Via Neon SQL editor or psql connected to production:
DROP TABLE alembic_version, users, borrowers, spreads, spread_periods,
           spread_line_items, extraction_jobs, narrative_versions,
           workflow_comments, audit_log, adjustments, credit_memo_meta,
           loan_types CASCADE;

# Then trigger a Railway redeploy — Dockerfile CMD will run alembic upgrade head.
```

### Run a one-off command on production

Railway → service → click into a deployment → "..." menu → "Open shell". Then:
```bash
alembic current        # see current migration
alembic history        # see all migrations
python -c "from app.config import settings; print(settings.anthropic_api_key[:15])"   # verify env var
```

### Roll back to a previous deployment

Railway → Deployments tab → find a known-good deployment → "..." menu → "Redeploy".

---

## Useful Links

- Railway dashboard: https://railway.app/dashboard
- Vercel dashboard: https://vercel.com/dashboard
- Neon console: https://console.neon.tech
- GitHub Actions runs: https://github.com/arunr-mib/spreadsense/actions
- Anthropic console: https://console.anthropic.com

---

## What This Runbook Does NOT Cover (Yet)

- Multi-tenant isolation (single-tenant currently)
- Disaster recovery / backup restore (rely on Neon's PITR)
- Incident postmortem template
- On-call rotation
- Customer-facing status page

These belong in the Phase 5 GA-readiness checklist.
