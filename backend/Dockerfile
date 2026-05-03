FROM python:3.12-slim
WORKDIR /app

# Install dependencies first so subsequent code changes don't bust the layer
COPY pyproject.toml .
RUN pip install --no-cache-dir -e ".[dev]"

COPY . .

# Railway / Fly / etc. set $PORT; fall back to 8001 for local docker-compose use
EXPOSE 8001
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8001}"]
