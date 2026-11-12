"""
Testing & Ground-Truth Validation Router (Phase 3B - Part 7)
===========================================================

Provides endpoints for:
1. Ground-truth real-value error evaluation across single and multiple test instances:
   - Absolute error
   - Percentage error (where mathematically appropriate: distance, speed)
   - Angular error with compass wraparound
   - Geodetic GPS displacement error in meters
   - Aggregate MAE, RMSE, and Max Error
2. Phase 1 compatible /run endpoint preserved.
"""

from typing import Dict, Any, List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.validation import (
    ValidationRequest,
    ValidationResult,
    BatchValidationRequest,
    GroundTruthInstanceInput,
)
from app.services.camera_service import CameraService
from app.services.calibration_service import CalibrationService
from app.services.validation_service import ValidationService


router = APIRouter(prefix="/validation", tags=["Testing & Validation"])


@router.post("/evaluate")
def evaluate_ground_truth_test(
    payload: BatchValidationRequest,
    db: Session = Depends(get_db),
):
    """
    Real-Value Error Testing Endpoint (Part 7):
    Accepts one or more test instances with predicted base points and actual ground-truth values.
    Calculates predicted vs actual and returns:
    - Instance-wise predicted values, actual values, and errors
    - Mean absolute error (MAE), RMSE, and Maximum error
    - No arbitrary accuracy scores.
    """
    try:
        dict_instances = [inst.model_dump() for inst in payload.instances]
        return ValidationService.evaluate_multiple_instances(
            db=db,
            camera_id=payload.camera_id,
            instances=dict_instances,
        )
    except ValueError as ve:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/run", response_model=ValidationResult)
def execute_validation_test(
    payload: ValidationRequest,
    db: Session = Depends(get_db),
):
    """
    Phase 1 compatible validation test execution.
    If camera has active geometric calibration, performs real calculation.
    If uncalibrated, safely returns placeholder for Phase 1 test compliance.
    """
    camera = CameraService.get_camera(db, payload.camera_id)
    cal = CalibrationService.get_latest_calibration_record(db, payload.camera_id)

    time_diff = abs((payload.point_2.timestamp - payload.point_1.timestamp).total_seconds())

    if not cal or not cal.h_matrix:
        return ValidationResult(
            status="architectural_placeholder",
            message="Validation calculation will be executed in Phase 2 once camera geometric calibration is active. No simulated or fake GPS/distance calculation performed.",
            camera_id=payload.camera_id,
            predicted_gps_1=None,
            predicted_gps_2=None,
            predicted_distance_meters=None,
            time_difference_seconds=time_diff,
            predicted_speed_mps=None,
            predicted_bearing_degrees=None,
            errors=None,
        )

    # Execute real calculation
    f1_dict = {
        "pixel_x": payload.point_1.base_pixel_x,
        "pixel_y": payload.point_1.base_pixel_y,
        "timestamp": payload.point_1.timestamp,
    }
    f2_dict = {
        "pixel_x": payload.point_2.base_pixel_x,
        "pixel_y": payload.point_2.base_pixel_y,
        "timestamp": payload.point_2.timestamp,
    }

    gt_dict = payload.ground_truth.model_dump(exclude_none=True) if payload.ground_truth else {}
    res = ValidationService.evaluate_test_instance(
        db=db,
        camera_id=payload.camera_id,
        frame_1_data=f1_dict,
        frame_2_data=f2_dict,
        actual_values=gt_dict,
    )

    pred = res["predicted"]
    return ValidationResult(
        status="validated",
        message="Ground positions, motion, and ground-truth errors computed via calibrated camera model.",
        camera_id=payload.camera_id,
        predicted_gps_1=pred["frame_1"]["gps"],
        predicted_gps_2=pred["frame_2"]["gps"],
        predicted_distance_meters=pred["motion"]["distance_travelled_m"],
        time_difference_seconds=pred["motion"]["time_difference_s"],
        predicted_speed_mps=pred["motion"]["speed_mps"],
        predicted_bearing_degrees=pred["motion"]["movement_direction_deg"],
        errors=res["errors"],
    )
