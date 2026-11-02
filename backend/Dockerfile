# syntax=docker/dockerfile:1
# Imagen del backend FastAPI. Multi-stage: `dev` (recarga en caliente) y `prod` (mínima).
FROM python:3.12-slim AS base
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1
WORKDIR /srv

# ---------- desarrollo: el código se monta como volumen y uvicorn recarga ----------
FROM base AS dev
COPY . .
RUN pip install -e ".[dev]"
EXPOSE 8000
# Aplica migraciones al arrancar SOLO en desarrollo; en producción es un paso explícito.
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload"]

# ---------- producción: usuario sin privilegios y sin dependencias de desarrollo ----------
FROM base AS prod
COPY pyproject.toml alembic.ini ./
COPY app ./app
COPY alembic ./alembic
RUN pip install . && useradd --system --uid 10001 appuser
USER appuser
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=3s \
  CMD python -c "import urllib.request as u; u.urlopen('http://localhost:8000/health')"
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
