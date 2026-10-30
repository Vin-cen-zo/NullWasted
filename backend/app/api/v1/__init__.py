from fastapi import APIRouter
from app.api.v1.listings import router as listings_router

api_v1_router = APIRouter()
api_v1_router.include_router(listings_router)
