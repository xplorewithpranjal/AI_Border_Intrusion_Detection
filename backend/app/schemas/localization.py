"""
Localization & Motion Analysis Schemas (Phase 3 Engine)
======================================================

Data contracts for:
1. Detection event ingestion (pixel -> real-world local -> GPS)
2. Two-frame motion calculation (displacement, speed, movement direction)
"""

from datetime import datetime
from typing import Optional, Dict, Any, Union
from pydantic import BaseModel, Field, model_validator


class DetectionEventInput(BaseModel):
    camera_id: str = Field(..., description="Camera identifier where intrusion was detected")
    object_id: Optional[str] = Field("OBJ_INTRUDER", description="Tracking identifier from detection module")
    frame_id: Optional[Union[int, str]] = Field(None, description="Frame index or identifier")
    timestamp: datetime = Field(default_factory=datetime.utcnow, description="Timestamp of observation")
    base_pixel_x: Optional[float] = Field(None, ge=0.0, description="Ground-contact base pixel X")
    base_pixel_y: Optional[float] = Field(None, ge=0.0, description="Ground-contact base pixel Y")
    pixel_x: Optional[float] = Field(None, ge=0.0, description="Alias for base_pixel_x")
    pixel_y: Optional[float] = Field(None, ge=0.0, description="Alias for base_pixel_y")

    @model_validator(mode="after")
    def resolve_pixel_coords(self):
        px = self.pixel_x if self.pixel_x is not None else self.base_pixel_x
        py = self.pixel_y if self.pixel_y is not None else self.base_pixel_y
        if px is None or py is None:
            raise ValueError("Either (pixel_x, pixel_y) or (base_pixel_x, base_pixel_y) must be provided.")
        self.pixel_x = px
        self.pixel_y = py
        self.base_pixel_x = px
        self.base_pixel_y = py
        return self


class PixelPoint(BaseModel):
    x: float
    y: float


class LocalPosition(BaseModel):
    east_m: float
    north_m: float


class GPSPoint(BaseModel):
    latitude: float
    longitude: float


class LocalizationResult(BaseModel):
    camera_id: str
    timestamp: Union[datetime, str, float]
    frame_id: Optional[Union[int, str]] = None
    status: str = Field(default="calibrated", description="'calibrated' or 'architectural_placeholder'/'uncalibrated'")
    message: str = Field(default="Pixel successfully mapped to real-world ground position and GPS.")

    # Section 18 / Part 1 Contract
    pixel: Optional[PixelPoint] = None
    local_position: Optional[LocalPosition] = None
    horizontal_distance_m: Optional[float] = None
    bearing_deg: Optional[float] = None
    gps: Optional[GPSPoint] = None

    # Backward compatibility with Phase 1 contracts
    object_id: Optional[str] = None
    base_pixel_x: Optional[float] = None
    base_pixel_y: Optional[float] = None
    ground_x: Optional[float] = None
    ground_y: Optional[float] = None
    gps_latitude: Optional[float] = None
    gps_longitude: Optional[float] = None
    speed_mps: Optional[float] = None

    # Optional interval motion if evaluated
    motion: Optional[Dict[str, Any]] = None


# =========================================================================
# Two-Frame Motion Schemas (Phase 3B / Part 5)
# =========================================================================

class MotionFrameObservation(BaseModel):
    camera_id: Optional[str] = None
    timestamp: Union[float, int, datetime, str] = Field(..., description="Timestamp of frame observation")
    pixel_x: Optional[float] = Field(None, description="Base pixel X")
    pixel_y: Optional[float] = Field(None, description="Base pixel Y")
    east_m: Optional[float] = Field(None, description="Direct local East coordinate in meters")
    north_m: Optional[float] = Field(None, description="Direct local North coordinate in meters")


class TwoFrameMotionRequest(BaseModel):
    camera_id: Optional[str] = Field(None, description="Camera ID if pixel coordinates need localization")
    frame_1: Optional[MotionFrameObservation] = None
    frame_2: Optional[MotionFrameObservation] = None
    observation_1: Optional[MotionFrameObservation] = None
    observation_2: Optional[MotionFrameObservation] = None

    @model_validator(mode="after")
    def resolve_observations(self):
        obs1 = self.observation_1 if self.observation_1 is not None else self.frame_1
        obs2 = self.observation_2 if self.observation_2 is not None else self.frame_2
        if obs1 is None or obs2 is None:
            raise ValueError("Both observation_1 and observation_2 (or frame_1 and frame_2) must be provided.")
        self.frame_1 = obs1
        self.frame_2 = obs2
        self.observation_1 = obs1
        self.observation_2 = obs2
        return self


class MotionSpeed(BaseModel):
    mps: float = Field(..., description="Ground speed in meters per second")
    kmh: float = Field(..., description="Ground speed in kilometers per hour")


class MotionDisplacement(BaseModel):
    delta_east_m: float
    delta_north_m: float
    distance_travelled_m: float


class MotionFrameState(BaseModel):
    east_m: float
    north_m: float
    timestamp: Union[float, int, datetime, str]
    horizontal_distance_from_camera_m: float
    bearing_from_camera_deg: float


class ObservationState(BaseModel):
    gps: GPSPoint
    east_m: float
    north_m: float
    timestamp: Union[float, int, datetime, str]
    horizontal_distance_from_camera_m: Optional[float] = None
    bearing_from_camera_deg: Optional[float] = None
    pixel: Optional[PixelPoint] = None


class MotionResultDetails(BaseModel):
    distance_m: float = Field(..., description="Distance travelled in meters")
    direction_deg: float = Field(..., description="Intrusion movement direction on Earth (0=N, 90=E, 180=S, 270=W)")
    time_seconds: float = Field(..., description="Time difference in seconds")
    speed_mps: float = Field(..., description="Speed in meters per second")
    speed_kmph: float = Field(..., description="Speed in kilometers per hour")


class TwoFrameMotionResponse(BaseModel):
    camera_id: Optional[str] = None

    # Part 5 exact contract
    observation_1: Optional[ObservationState] = None
    observation_2: Optional[ObservationState] = None
    motion: Optional[MotionResultDetails] = None

    # Backward compatibility with Phase 3A test contracts
    frame_1: Optional[MotionFrameState] = None
    frame_2: Optional[MotionFrameState] = None
    displacement: Optional[MotionDisplacement] = None
    time_interval_s: Optional[float] = None
    speed: Optional[MotionSpeed] = None
    movement_direction_deg: Optional[float] = Field(
        None,
        description="Compass azimuth in which intrusion is moving (0 = North, 90 = East, 180 = South, 270 = West)",
    )
    note: str = Field(
        default="Two-frame planar motion estimation. No acceleration or 3D distance computed.",
        description="Explicit geometric constraints",
    )
