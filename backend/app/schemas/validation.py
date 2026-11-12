"""
Validation Schemas (Phase 1 Architectural Placeholder)

Defines data contracts for Phase 2/3 validation testing, including:
- Two-frame base point observations
- Predicted vs ground-truth metrics (distance, speed, bearing, GPS)
- Error calculations and aggregate test runs
NOTE: Mathematical validation routines are NOT implemented in Phase 1.
"""

from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field


class ValidationPointInput(BaseModel):
    frame_index: int = Field(..., description="Frame index or identifier")
    timestamp: datetime = Field(..., description="Observation timestamp")
    base_pixel_x: float = Field(..., description="Ground-contact base pixel X")
    base_pixel_y: float = Field(..., description="Ground-contact base pixel Y")


class ValidationGroundTruth(BaseModel):
    actual_distance_meters: Optional[float] = Field(None, ge=0.0)
    actual_speed_mps: Optional[float] = Field(None, ge=0.0)
    actual_bearing_deg: Optional[float] = Field(None, ge=0.0, le=360.0)
    actual_gps_lat: Optional[float] = None
    actual_gps_lon: Optional[float] = None


class ValidationRequest(BaseModel):
    camera_id: str = Field(..., description="Calibrated camera identifier")
    point_1: ValidationPointInput
    point_2: ValidationPointInput
    ground_truth: Optional[ValidationGroundTruth] = None


class ValidationResult(BaseModel):
    status: str = Field(default="architectural_placeholder")
    message: str = Field(
        default="Validation calculation will be executed in Phase 2 once geometric calibration is integrated."
    )
    camera_id: str
    predicted_gps_1: Optional[dict] = None
    predicted_gps_2: Optional[dict] = None
    predicted_distance_meters: Optional[float] = None
    time_difference_seconds: Optional[float] = None
    predicted_speed_mps: Optional[float] = None
    predicted_bearing_degrees: Optional[float] = None
    errors: Optional[dict] = None


# =========================================================================
# Phase 3B Ground-Truth Real-Value Error Testing Schemas (Part 7)
# =========================================================================

class GroundTruthActuals(BaseModel):
    # Single observation / Frame 1 or general values
    actual_latitude: Optional[float] = None
    actual_longitude: Optional[float] = None
    actual_horizontal_distance: Optional[float] = None
    actual_bearing: Optional[float] = None

    # Motion values
    actual_movement_distance: Optional[float] = None
    actual_movement_direction: Optional[float] = None
    actual_speed: Optional[float] = None
    actual_speed_kmh: Optional[float] = None

    # Two-frame specific aliases
    actual_distance_1_m: Optional[float] = None
    actual_distance_2_m: Optional[float] = None
    actual_bearing_1_deg: Optional[float] = None
    actual_bearing_2_deg: Optional[float] = None
    actual_gps_lat_1: Optional[float] = None
    actual_gps_lon_1: Optional[float] = None
    actual_gps_lat_2: Optional[float] = None
    actual_gps_lon_2: Optional[float] = None
    actual_movement_distance_m: Optional[float] = None
    actual_speed_mps: Optional[float] = None
    actual_movement_direction_deg: Optional[float] = None


class GroundTruthInstanceInput(BaseModel):
    instance_id: Optional[str] = "CASE_1"
    camera_id: Optional[str] = None
    frame_1: dict
    frame_2: dict
    actual_values: Optional[dict] = None


class BatchValidationRequest(BaseModel):
    camera_id: str
    instances: List[GroundTruthInstanceInput]

