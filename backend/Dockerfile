FROM python:3.11-slim

# Create non-root user (Hugging Face Spaces standard UID 1000)
RUN useradd -m -u 1000 user
WORKDIR /app

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy application code and static assets
COPY --chown=user:user app/ ./app/
COPY --chown=user:user static/ ./static/

USER user

ENV PYTHONUNBUFFERED=1 \
    ENVIRONMENT=staging \
    ENABLE_TIME_SIMULATION=true \
    PORT=7860

EXPOSE 7860

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "7860"]
