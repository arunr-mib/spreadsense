FROM python:3.12-slim
WORKDIR /app

# Build context is the repo root (so Railway / Vercel / Fly can use /Dockerfile or
# any tool that doesn't run docker-compose). Source files live under backend/.
# docker-compose.yml sets context: . to match.
COPY backend/pyproject.toml ./
RUN pip install --no-cache-dir -e ".[dev]"

COPY backend/ ./

# Railway / Fly / etc. set $PORT; fall back to 8001 for local docker-compose use
EXPOSE 8001
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8001}"]
