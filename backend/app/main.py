from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.database import Base, engine, init_db
import app.models  # ensure models are registered
from app.routers import (
    health_router,
    cameras_router,
    pillars_router,
    calibration_router,
    validation_router,
    localization_router,
    intrusion_router,
    signaling_router,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize and migrate SQLite schema if needed
    init_db()
    yield


app = FastAPI(
    title=settings.APP_NAME,
    description="Backend service for Static Camera Geospatial Localization and Motion Analysis System",
    version="2.0.0-phase2",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS configuration for frontend and mobile LAN development
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS if isinstance(settings.CORS_ORIGINS, list) else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount Routers under API_V1_STR (/api)
app.include_router(health_router, prefix=settings.API_V1_STR)
app.include_router(cameras_router, prefix=settings.API_V1_STR)
app.include_router(pillars_router, prefix=settings.API_V1_STR)
app.include_router(calibration_router, prefix=settings.API_V1_STR)
app.include_router(validation_router, prefix=settings.API_V1_STR)
app.include_router(localization_router, prefix=settings.API_V1_STR)
app.include_router(intrusion_router, prefix=settings.API_V1_STR)
app.include_router(signaling_router, prefix=settings.API_V1_STR)


@app.get("/")
def root():
    return {
        "system": settings.APP_NAME,
        "phase": "Phase 2 - Live Mobile Camera Streaming via WebRTC",
        "docs": "/docs",
        "health": f"{settings.API_V1_STR}/health",
        "stream_status": f"{settings.API_V1_STR}/stream/status",
    }
