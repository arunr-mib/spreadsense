# Financial Spreading Tool

Standalone web application for bank analysts to spread commercial borrower financials using RMA + UCA Cash Flow standards.

## Stack

- **Backend:** Python 3.12, FastAPI, SQLAlchemy (async), PostgreSQL
- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS
- **AI:** Claude API for document extraction and narrative generation

## Quick Start

```bash
cp .env.example .env
# Edit .env with your values
docker compose up --build
```

- Backend API: http://localhost:8001
- Frontend: http://localhost:5174
- API docs: http://localhost:8001/docs

## Development

See `docs/superpowers/plans/` for implementation plans.
