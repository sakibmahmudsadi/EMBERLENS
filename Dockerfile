# Build the SPA separately so Node and development dependencies stay out of runtime.
FROM node:24.22.2-alpine3.24 AS frontend-build
WORKDIR /build
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# FastAPI serves the built SPA and API on one origin; DuckDB remains an external persistent mount.
FROM python:3.12.16-slim-bookworm AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    EMBERLENS_DB=/var/lib/emberlens/emberlens-bangladesh.duckdb \
    EMBERLENS_SERVE_FRONTEND=true \
    PORT=8000 \
    TMPDIR=/tmp
WORKDIR /app
RUN groupadd --system --gid 10001 emberlens \
    && useradd --system --uid 10001 --gid emberlens --home-dir /nonexistent --shell /usr/sbin/nologin emberlens \
    && mkdir -p /var/lib/emberlens /tmp \
    && chown -R emberlens:emberlens /var/lib/emberlens /tmp
COPY backend/requirements-prod.txt /app/backend/requirements-prod.txt
RUN pip install --no-cache-dir -r /app/backend/requirements-prod.txt
COPY backend/ /app/backend/
COPY --from=frontend-build /build/dist/ /app/frontend/dist/
USER 10001:10001
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=4s --start-period=20s --retries=3 \
    CMD python -c "import os,urllib.request; urllib.request.urlopen('http://127.0.0.1:'+os.environ.get('PORT','8000')+'/api/v1/health',timeout=3).read()" || exit 1
CMD ["python", "-m", "backend.container_start"]
