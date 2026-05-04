# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Project: SpreadSense — Financial Spreading Tool

AI-assisted financial spreading: upload a borrower's 10-K (PDF), Claude extracts
the three core statements (Balance Sheet, Income Statement, Cash Flow), and the
analyst reviews confidence-coded fields before confirming the spread.

- **Live frontend:** https://spreadsense.vercel.app
- **Live backend:**  https://spreadsense-production.up.railway.app
- **Source repo:**   https://github.com/arunr-mib/financial-spreading-tool

## Production Topology

| Layer    | Provider | Notes                                                              |
|----------|----------|--------------------------------------------------------------------|
| Frontend | Vercel   | Vite build; `vercel.json` rewrites `/api/*` → Railway              |
| Backend  | Railway  | Docker build via `railway.json` (builder=DOCKERFILE), repo-root ctx|
| Database | Neon     | Managed Postgres (us-west-2), `postgresql+asyncpg://...?ssl=require` |
| LLM      | Anthropic | `claude-opus-4-5` for extraction                                  |

See `docs/Deployment-Runbook.md` for env vars, failure modes, and runbooks.

## Documentation Map

- `docs/SpreadSense-AI-PRD.md` — product requirements (v1.3, May 2026)
- `docs/SpreadSense-Explainer.md` — plain-English overview for non-technical readers
- `docs/Deployment-Runbook.md` — production deployment + ops
- `docs/superpowers/specs/` — design specs (extraction-upload-confidence is current)
- `docs/superpowers/plans/` — implementation plans (Plan 8 = ExtractionPanel)

## Test Users (Production)

- `smoke@test.com` / `Smoke1234!`
- `uat@test.com` / `Test1234!`

## Key Architectural Decisions

1. **Smart slicing for 10-Ks** (`backend/app/modules/ingestion/claude_extractor.py`):
   regex-locate `CONSOLIDATED BALANCE SHEET` and send a 100k-char window
   (starting 2k chars before the match) to Claude. Falls back to 500k head
   truncation if no header is found. Cut token cost ~75% and lifted DocuSign
   10-K extraction from 0/33 → 23/33 fields.
2. **Image-PDF guard** (`service.py`): if PyMuPDF yields <200 chars of text,
   raise early with a clear error rather than sending an empty doc to Claude.
3. **Test isolation via savepoints** (`backend/tests/conftest.py`): each test
   runs inside a connection-level transaction with
   `join_transaction_mode="create_savepoint"` against a dedicated `fst_test_db`,
   so service-layer `commit()` calls don't leak across tests (and never touch prod).
4. **`redirect_slashes=False`** (`backend/app/main.py`): FastAPI's default 307 on
   trailing-slash mismatch sent absolute URLs that exposed the Railway hostname
   and broke HTTPS. Frontend always calls the canonical (trailing-slash) URL.
5. **Vercel rewrites with both slash variants** (`frontend/vercel.json`): two
   rewrites — `/api/:path*/` and `/api/:path*` — so trailing-slash routes also match.
6. **Repo-root Docker build context** (`backend/Dockerfile`, `docker-compose.yml`,
   `railway.json`): Dockerfile uses `backend/`-prefixed COPYs so Railway,
   docker-compose, and any other tool can build from repo root identically.
7. **Stdout logging for ingestion modules** (`main.py`): `basicConfig` is a no-op
   after uvicorn boots, so we attach our own StreamHandler to the ingestion
   loggers and disable propagation to avoid duplicate lines.

## Common Commands

```bash
# Local dev (Docker Compose)
docker compose up --build              # backend :8001, frontend :5174, postgres :5434

# Backend tests (uses fst_test_db, never touches fst_db)
docker compose exec backend pytest

# Frontend type-check + build (matches CI)
cd frontend && npx tsc --noEmit && npm run build

# Fetch a public 10-K for testing extraction
python3 scripts/fetch_10k_pdf.py msft   # → /tmp/sec_10k.pdf
```

## CI

`.github/workflows/test.yml` runs on every push/PR:
- **backend:** Postgres service container, alembic upgrade, pytest (skips
  `tests/test_memo.py` — needs WeasyPrint system libs)
- **frontend:** `tsc --noEmit` + `vite build`

## Open Threads / Ideas

- ✅ **SEC fetcher** — shipped May 2026. `GET /sec/fetch` endpoint + `SecFetchControl`
  in ExtractionPanel. Spec: `docs/superpowers/specs/2026-05-03-sec-fetcher-design.md`.
  Plan: `docs/superpowers/plans/2026-05-03-sec-fetcher.md`.
- Test additional 10-Ks beyond DocuSign + Microsoft.
- Phase 5: Supabase Auth, S3 file persistence, batch upload, multi-tenant.

## Working Style

- Frequent small commits with descriptive messages.
- TDD where it adds signal; don't bolt tests on after the fact.
- When touching deployment config (Dockerfile, railway.json, vercel.json),
  update `docs/Deployment-Runbook.md` in the same commit.
- Update `docs/SpreadSense-AI-PRD.md` after any major feature ships.
