"""
Teammate Intrusion Detection Integration Router (Phase 3B)
=========================================================

Exposes a clean, high-level REST API for the external AI intrusion-detection
module. The teammate module provides only bounding-box base pixel coordinates
and timestamps; all homography, camera pose, coordinate transforms, and
GPS projections remain entirely encapsulated internally.

Endpoints:
- POST /api/intrusion/event: Localizes single intrusion detection event
- POST /api/intrusion/motion: Analyzes motion between two observations
- GET  /api/intrusion/interval: Returns configured motion evaluation interval
- PUT  /api/intrusion/interval: Sets evaluation interval (e.g., 1.0 second)
- DELETE /api/intrusion/buffer: Clears recent detection buffer
"""

import math
from datetime import datetime
from typing import Optional, Dict, Any, Union
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, model_validator
from sqlalchemy.orm import Session

from app.database import get_db
from app.services.camera_service import CameraService
from app.services.calibration_service import CalibrationService
from app.services.motion_service import IntrusionTrackingService
from app.geometry.motion import calculate_two_frame_motion, parse_timestamp_to_seconds
from app.core.exceptions import EntityNotFoundException


router = APIRouter(prefix="/intrusion", tags=["Teammate Intrusion Integration"])


class IntrusionDetectionInput(BaseModel):
    camera_id: str = Field(..., description="Camera identifier where intrusion was detected")
    frame_id: Optional[Union[str, int]] = Field(None, description="Frame index or identifier")
    timestamp: Union[str, float, int, datetime] = Field(..., description="Timestamp of observation")
    pixel_x: float = Field(..., description="Ground-contact base center pixel X")
    pixel_y: float = Field(..., description="Ground-contact base center pixel Y")
    object_id: Optional[str] = Field("OBJ_INTRUDER", description="Tracking identifier")
    interval_s: Optional[float] = Field(None, description="Optional custom evaluation interval in seconds")

    @model_validator(mode="after")
    def validate_inputs(self):
        if self.pixel_x < 0.0 or self.pixel_y < 0.0:
            raise ValueError("Pixel coordinates cannot be negative.")
        # Validate timestamp can be parsed
        try:
            parse_timestamp_to_seconds(self.timestamp)
        except Exception as e:
            raise ValueError(f"Invalid timestamp format: {str(e)}")
        return self


class ObservationPoint(BaseModel):
    timestamp: Union[str, float, int, datetime]
    pixel_x: float
    pixel_y: float

    @model_validator(mode="after")
    def validate_coords(self):
        if self.pixel_x < 0.0 or self.pixel_y < 0.0:
            raise ValueError("Pixel coordinates cannot be negative.")
        try:
            parse_timestamp_to_seconds(self.timestamp)
        except Exception as e:
            raise ValueError(f"Invalid timestamp format: {str(e)}")
        return self


class IntrusionMotionRequest(BaseModel):
    camera_id: str
    observation_1: ObservationPoint
    observation_2: ObservationPoint


@router.post("/event")
def process_intrusion_event(
    payload: IntrusionDetectionInput,
    db: Session = Depends(get_db),
):
    """
    Teammate Module Ingestion Endpoint:
    Receives detection bounding box base center pixel, timestamp, and frame_id.
    Loads saved calibration for camera_id, localizes to ground (East, North),
    computes horizontal distance from camera, absolute Earth bearing, and GPS.
    """
    # 1. Validate Camera exists
    try:
        camera = CameraService.get_by_identifier(db, payload.camera_id)
    except EntityNotFoundException:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Camera '{payload.camera_id}' not found.",
        )

    # 2. Validate Camera is calibrated
    cal = CalibrationService.get_latest_calibration_record(db, camera.camera_id)
    if not cal or not cal.h_matrix:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Camera '{camera.camera_id}' has not been calibrated. Geometric calibration is required before processing intrusion events.",
        )

    # 3. Localize pixel using existing calibrated geometry
    try:
        loc_res = CalibrationService.localize_pixel(
            db=db,
            camera_identifier=camera.camera_id,
            pixel_x=payload.pixel_x,
            pixel_y=payload.pixel_y,
        )
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    east = loc_res.local_position.x
    north = loc_res.local_position.y
    dist_m = loc_res.distance_m
    lat = loc_res.gps.latitude
    lon = loc_res.gps.longitude

    # Absolute Earth bearing: 0° = North, 90° = East, 180° = South, 270° = West
    bearing = (math.degrees(math.atan2(east, north)) + 360.0) % 360.0

    # 4. Optional interval motion evaluation from tracking buffer
    interval_motion = IntrusionTrackingService.record_and_evaluate(
        camera_id=camera.camera_id,
        timestamp=payload.timestamp,
        pixel_x=payload.pixel_x,
        pixel_y=payload.pixel_y,
        east_m=east,
        north_m=north,
        latitude=lat,
        longitude=lon,
        horizontal_distance_m=dist_m,
        bearing_deg=bearing,
        frame_id=payload.frame_id,
        object_id=payload.object_id or "OBJ_INTRUDER",
        interval_s=payload.interval_s,
    )

    response = {
        "camera_id": camera.camera_id,
        "frame_id": payload.frame_id,
        "timestamp": payload.timestamp,
        "pixel": {
            "x": payload.pixel_x,
            "y": payload.pixel_y,
        },
        "local_position": {
            "east_m": round(east, 4),
            "north_m": round(north, 4),
        },
        "horizontal_distance_m": round(dist_m, 2),
        "bearing_deg": round(bearing, 2),
        "gps": {
            "latitude": lat,
            "longitude": lon,
        },
    }

    if interval_motion is not None:
        response["motion"] = interval_motion

    return response


@router.post("/motion")
def process_intrusion_motion(
    payload: IntrusionMotionRequest,
    db: Session = Depends(get_db),
):
    """
    Teammate Motion Analysis Endpoint (Part 5):
    Takes observation_1 and observation_2, localizes both using the camera's
    saved calibration, and computes distance travelled, movement direction,
    time difference, and ground speed (m/s and km/h).
    """
    # 1. Validate Camera exists
    try:
        camera = CameraService.get_by_identifier(db, payload.camera_id)
    except EntityNotFoundException:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Camera '{payload.camera_id}' not found.",
        )

    # 2. Validate Camera is calibrated
    cal = CalibrationService.get_latest_calibration_record(db, camera.camera_id)
    if not cal or not cal.h_matrix:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Camera '{camera.camera_id}' has not been calibrated. Geometric calibration is required.",
        )

    # Localize Observation 1
    loc1 = CalibrationService.localize_pixel(
        db, camera.camera_id, payload.observation_1.pixel_x, payload.observation_1.pixel_y
    )
    e1, n1 = loc1.local_position.x, loc1.local_position.y

    # Localize Observation 2
    loc2 = CalibrationService.localize_pixel(
        db, camera.camera_id, payload.observation_2.pixel_x, payload.observation_2.pixel_y
    )
    e2, n2 = loc2.local_position.x, loc2.local_position.y

    # Calculate Motion
    try:
        motion_res = calculate_two_frame_motion(
            east_1=e1,
            north_1=n1,
            time_1=payload.observation_1.timestamp,
            east_2=e2,
            north_2=n2,
            time_2=payload.observation_2.timestamp,
        )
    except ValueError as ve:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(ve))

    return {
        "camera_id": camera.camera_id,
        "observation_1": {
            "gps": {
                "latitude": loc1.gps.latitude,
                "longitude": loc1.gps.longitude,
            },
            "east_m": round(e1, 4),
            "north_m": round(n1, 4),
            "timestamp": payload.observation_1.timestamp,
        },
        "observation_2": {
            "gps": {
                "latitude": loc2.gps.latitude,
                "longitude": loc2.gps.longitude,
            },
            "east_m": round(e2, 4),
            "north_m": round(n2, 4),
            "timestamp": payload.observation_2.timestamp,
        },
        "motion": {
            "distance_m": round(motion_res["displacement"]["distance_travelled_m"], 4),
            "direction_deg": round(motion_res["movement_direction_deg"], 2),
            "time_seconds": round(motion_res["time_interval_s"], 4),
            "speed_mps": round(motion_res["speed"]["mps"], 4),
            "speed_kmph": round(motion_res["speed"]["kmh"], 4),
        },
    }


@router.get("/interval")
def get_interval():
    return {
        "evaluation_interval_seconds": IntrusionTrackingService.get_default_interval(),
        "description": "Configurable evaluation interval for continuous intrusion detections (Part 8)",
    }


@router.put("/interval")
def update_interval(interval_seconds: float):
    if interval_seconds <= 0:
        raise HTTPException(status_code=400, detail="Evaluation interval must be strictly positive.")
    new_val = IntrusionTrackingService.set_default_interval(interval_seconds)
    return {
        "evaluation_interval_seconds": new_val,
        "message": f"Motion evaluation interval set to {new_val}s.",
    }


@router.delete("/buffer")
def clear_buffer(camera_id: Optional[str] = None):
    IntrusionTrackingService.clear_history(camera_id)
    return {"message": "Detection buffer cleared successfully."}
