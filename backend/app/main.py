from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.v1 import api_v1_router
from app.core.ai_gateway import ai_gateway
from app.core.config import APP_NAME, BASE_DIR, CORS_ORIGIN_REGEX, STATIC_DIR, STATIC_UPLOADS_DIR
from app.core.database import init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Ensure static uploads directory exists
    STATIC_UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    # Initialize database tables and seed demo data on startup
    init_db()
    yield
    # Graceful shutdown of persistent connections
    await ai_gateway.close()


app = FastAPI(
    title=APP_NAME,
    version="1.0.0",
    description="NullWasted Surplus Food Rescue Platform API with Agentic AI & Deterministic BPOM Guardrail",
    lifespan=lifespan,
)

# Cross-Origin Resource Sharing (CORS) Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=CORS_ORIGIN_REGEX,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount local static files directory for image serving
STATIC_UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

# Register API routers
app.include_router(api_v1_router, prefix="/api/v1")


@app.get("/health")
def health_check():
    return {"status": "ok", "service": APP_NAME}
