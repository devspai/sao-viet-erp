# Backend image: FastAPI served by uvicorn. Connects to the Postgres service.
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Install deps first for better layer caching.
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# App source.
COPY app ./app

EXPOSE 8000

# DATABASE_URL / JWT_SECRET / SEED_* are provided by docker-compose env.
# app.serve: migrate + seed MỘT lần rồi bật N worker uvicorn (N tự tính theo CPU/RAM container,
# WEB_CONCURRENCY ghi đè; không có REDIS_URL thì ép 1). Healthcheck khai ở docker-compose.yml.
CMD ["python", "-m", "app.serve"]
