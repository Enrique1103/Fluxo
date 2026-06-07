FROM python:3.12-slim

WORKDIR /app

# Install dependencies first (cached layer)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Force cache invalidation — bump this value when migrations need to run
ARG CACHE_BUST=20260606b
RUN echo "Cache bust: $CACHE_BUST"

# Copy source (invalidated by ARG above)
COPY . .

EXPOSE 8000

# Run migrations then start — $PORT is injected by Render; fallback to 8000 locally
CMD sh -c "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"
