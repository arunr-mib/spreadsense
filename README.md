# SpreadSense — Financial Spreading Tool

AI-powered financial spreading platform: upload PDF financials → Claude extracts to the RMA template → reviewer confirms → spreads written to a structured grid.

Built for bank credit analysts to compress hours of manual spreading into minutes, with confidence scores on every extracted field so reviewers know exactly what to verify.

**Live:** [spreadsense.vercel.app](https://spreadsense.vercel.app)

## Documentation

- **[Plain-English explainer](./docs/SpreadSense-Explainer.md)** — 5-minute walkthrough of what SpreadSense does and how it works
- **[Product Requirements Document](./docs/SpreadSense-AI-PRD.md)** — full PRD covering goals, personas, requirements, architecture, and roadmap
- **[Design specs](./docs/superpowers/specs/)** — feature-level design documents
- **[Implementation plans](./docs/superpowers/plans/)** — task-by-task execution plans

## Stack

- **Backend:** Python 3.12, FastAPI, SQLAlchemy (async), PostgreSQL, Anthropic SDK
- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS, React Query
- **AI:** Claude API for document extraction and narrative generation
- **PDF parsing:** PyMuPDF
- **Tests:** pytest (backend), `tsc --noEmit` + `vite build` (frontend)

## Production Topology

| Layer | Service | Notes |
|---|---|---|
| Frontend | [Vercel](https://vercel.com) | Static Vite build; `/api/*` rewrites proxy to Railway backend (sidesteps CORS) |
| Backend | [Railway](https://railway.app) | FastAPI in Docker; `backend/railway.json` pins builder to `DOCKERFILE` |
| Database | [Neon](https://neon.tech) | Managed Postgres 16 with pooled connection |
| CI | GitHub Actions | Backend pytest + frontend tsc/build on every push and PR |

## Quick Start (local)

```bash
cp .env.example .env
# Edit .env: set ANTHROPIC_API_KEY, JWT_SECRET, etc.
docker compose up --build
```

- Backend API: http://localhost:8001
- Frontend: http://localhost:5174
- API docs: http://localhost:8001/docs

## Running Tests

```bash
# Inside the backend container — uses dedicated fst_test_db, never touches dev data
docker compose exec backend sh -c "cd /app && python -m pytest tests/ -v"
```

## Helper Scripts

- **[`scripts/fetch_10k_pdf.py`](./scripts/fetch_10k_pdf.py)** — pulls any company's most recent 10-K from SEC EDGAR and renders it via Chrome headless to a multi-page text-layer PDF for testing the extraction pipeline.

  ```bash
  python3 scripts/fetch_10k_pdf.py docu       # DocuSign (default)
  python3 scripts/fetch_10k_pdf.py msft       # Microsoft
  python3 scripts/fetch_10k_pdf.py --cik 320193   # Apple
  ```

## Project Status

In active development. See the [PRD launch plan](./docs/SpreadSense-AI-PRD.md#14-launch-plan--milestones) for milestone status. As of May 3, 2026: production deployment live, real SEC 10-K extraction validated end-to-end, 75/75 backend tests passing.

## License

Proprietary — internal use only.
