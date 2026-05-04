FROM python:3.12-slim
WORKDIR /app

# WeasyPrint requires native libs (Pango, Cairo, GDK-PixBuf, GObject, fontconfig)
# to render HTML to PDF. Install before pip so wheel-only deps stay cached.
RUN apt-get update && apt-get install -y --no-install-recommends \
        libpango-1.0-0 \
        libpangoft2-1.0-0 \
        libharfbuzz0b \
        libcairo2 \
        libgdk-pixbuf-2.0-0 \
        libglib2.0-0 \
        libffi8 \
        shared-mime-info \
        fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

# Build context is the repo root (so Railway / Vercel / Fly can use /Dockerfile or
# any tool that doesn't run docker-compose). Source files live under backend/.
# docker-compose.yml sets context: . to match.
COPY backend/pyproject.toml ./
RUN pip install --no-cache-dir -e ".[dev]"

COPY backend/ ./

# Railway / Fly / etc. set $PORT; fall back to 8001 for local docker-compose use
EXPOSE 8001
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8001}"]
