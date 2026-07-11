# ── Build stage ────────────────────────────────────────────────────────────────
FROM python:3.11-slim AS builder

WORKDIR /build

# Install build tools
RUN pip install --no-cache-dir build

# Copy only what we need for the package install
COPY pyproject.toml ./
COPY . .

# Build the wheel
RUN python -m build --wheel --outdir /dist


# ── Runtime stage ──────────────────────────────────────────────────────────────
FROM python:3.11-slim

# Security: run as non-root
RUN useradd --create-home appuser
WORKDIR /app
USER appuser

# Copy and install only the built wheel + its deps (no dev extras)
COPY --from=builder /dist /dist
RUN pip install --no-cache-dir /dist/*.whl httpx

# Copy source so the package-dir mapping works
COPY --chown=appuser:appuser . .

# Cloud Run injects PORT; default to 8080
ENV PORT=8080 \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

EXPOSE 8080

CMD ["python", "-m", "uvicorn", "cloud.main:app", "--host", "0.0.0.0", "--port", "8080"]
