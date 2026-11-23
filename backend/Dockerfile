FROM python:3.12-slim

LABEL project="nullwasted"

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Match host UID/GID (1000) so non-root appuser can safely access mounted uploads
RUN groupadd -g 1000 appuser \
    && useradd -u 1000 -g 1000 -m -s /usr/sbin/nologin appuser

COPY requirements.txt .
RUN pip install --upgrade pip \
    && pip install -r requirements.txt

COPY --chown=1000:1000 app ./app
RUN mkdir -p /app/static/uploads && chown -R 1000:1000 /app/static

USER appuser

EXPOSE 8016

HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
    CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8016/health', timeout=3)"]

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8016", "--workers", "1", "--proxy-headers"]
