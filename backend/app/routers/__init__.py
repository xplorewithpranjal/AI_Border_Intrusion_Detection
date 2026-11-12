from app.routers.health import router as health_router
from app.routers.cameras import router as cameras_router
from app.routers.pillars import router as pillars_router
from app.routers.calibration import router as calibration_router
from app.routers.validation import router as validation_router
from app.routers.localization import router as localization_router
from app.routers.intrusion import router as intrusion_router
from app.routers.signaling import router as signaling_router

__all__ = [
    "health_router",
    "cameras_router",
    "pillars_router",
    "calibration_router",
    "validation_router",
    "localization_router",
    "intrusion_router",
    "signaling_router",
]

