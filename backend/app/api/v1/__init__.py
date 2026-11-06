from fastapi import APIRouter
from app.api.v1.auth import router as auth_router
from app.api.v1.listings import router as listings_router
from app.api.v1.upload import router as upload_router

api_v1_router = APIRouter()
api_v1_router.include_router(auth_router)
api_v1_router.include_router(listings_router)
api_v1_router.include_router(upload_router)
