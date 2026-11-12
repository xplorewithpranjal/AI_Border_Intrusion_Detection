from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.services.calibration_service import CalibrationService
from app.services.camera_service import CameraService
from app.services.pillar_service import PillarService
from app.schemas.calibration import (
    CalibrationCalculationRequest,
    CalibrationCalculationResponse,
    PixelLocalizationRequest,
    PixelLocalizationResponse,
)

router = APIRouter(tags=["Geometric Calibration"])


# =========================================================================
# Phase 1 Backward Compatibility Endpoints
# =========================================================================

@router.get("/cameras/{camera_id}/calibration")
def get_camera_calibration_legacy(
    camera_id: str,
    db: Session = Depends(get_db),
):
    """
    Retrieve calibration record for a camera (Phase 1 contract).
    Preserves exact payload for Phase 1 automated tests.
    """
    camera = CameraService.get_camera(db, camera_id)
    cal = CalibrationService.get_latest_calibration_record(db, camera_id)
    pillars = PillarService.list_by_camera(db, camera_id)

    total_points = sum(len(p.image_points) for p in pillars)

    return {
        "camera_id": camera.camera_id,
        "name": camera.name,
        "calibration_status": cal.calibration_status if cal else "uncalibrated",
        "calibrated_at": cal.calibrated_at if cal else None,
        "calibration_data": cal.calibration_data if cal else None,
        "calibration_error": cal.calibration_error if cal else None,
        "reference_pillar_count": len(pillars),
        "total_recorded_points": total_points,
        "phase_note": "Geometric calibration (homography / solvePnP) scheduled for Phase 2. No simulated data.",
    }


# =========================================================================
# Phase 3 Geometric Calibration Endpoints
# =========================================================================

@router.get("/calibration/{camera_id}")
def get_calibration_details(
    camera_id: str,
    db: Session = Depends(get_db),
):
    """
    Returns full geometric calibration status, camera pose/intrinsics,
    homography H matrix, and quality metrics for a static camera.
    """
    try:
        return CalibrationService.get_full_calibration_details(db, camera_id)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND if "not found" in str(e).lower() else status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.post(
    "/calibration/{camera_id}/calculate",
    response_model=CalibrationCalculationResponse,
)
def calculate_calibration(
    camera_id: str,
    payload: CalibrationCalculationRequest,
    db: Session = Depends(get_db),
):
    """
    Calculates planar homography H, reprojection errors, and 3D pose validation
    for the specified static camera based on registered reference pillars.
    Requires minimum 4 non-collinear reference points.
    """
    try:
        return CalibrationService.calculate_calibration(db, camera_id, payload)
    except ValueError as ve:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("/calibration/{camera_id}/result")
def get_calibration_result(
    camera_id: str,
    db: Session = Depends(get_db),
):
    """Returns homography matrix and detailed per-point reprojection errors."""
    try:
        return CalibrationService.get_full_calibration_details(db, camera_id)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post(
    "/calibration/{camera_id}/localize",
    response_model=PixelLocalizationResponse,
)
def localize_pixel_coordinate(
    camera_id: str,
    payload: PixelLocalizationRequest,
    db: Session = Depends(get_db),
):
    """
    Localizes a single image pixel (u, v) into:
    - Real-world local ground coordinate (X meters East, Y meters North)
    - Distance in meters from camera optical plumb line
    - WGS84 GPS coordinate (latitude, longitude)
    - Optional optical ray-ground plane verification
    """
    try:
        return CalibrationService.localize_pixel(
            db, camera_id, payload.pixel_x, payload.pixel_y
        )
    except ValueError as ve:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))
