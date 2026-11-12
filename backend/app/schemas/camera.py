from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field, ConfigDict


class CameraBase(BaseModel):
    camera_id: str = Field(..., min_length=2, max_length=64, description="Unique camera identifier, e.g. CAM_001")
    name: str = Field(..., min_length=1, max_length=128, description="Human-readable camera name")
    description: Optional[str] = Field(None, max_length=1000, description="Camera location or installation notes")
    latitude: Optional[float] = Field(None, ge=-90.0, le=90.0, description="Camera installation latitude")
    longitude: Optional[float] = Field(None, ge=-180.0, le=180.0, description="Camera installation longitude")
    height: Optional[float] = Field(None, ge=0.0, description="Camera mounting height above ground level in meters")
    yaw: Optional[float] = Field(None, description="Camera yaw in degrees")
    pitch: Optional[float] = Field(None, description="Camera pitch in degrees")
    roll: Optional[float] = Field(None, description="Camera roll in degrees")
    status: Optional[str] = Field(default="uncalibrated", description="Status: uncalibrated, calibrated, active, maintenance")


class CameraCreate(CameraBase):
    pass


class CameraUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=128)
    description: Optional[str] = None
    latitude: Optional[float] = Field(None, ge=-90.0, le=90.0)
    longitude: Optional[float] = Field(None, ge=-180.0, le=180.0)
    height: Optional[float] = Field(None, ge=0.0)
    yaw: Optional[float] = None
    pitch: Optional[float] = None
    roll: Optional[float] = None
    status: Optional[str] = None


class CameraRead(CameraBase):
    id: int
    created_at: datetime
    updated_at: datetime
    pillar_count: Optional[int] = Field(default=0, description="Count of configured reference pillars")
    calibration_status: Optional[str] = Field(default="uncalibrated", description="Current calibration state")

    model_config = ConfigDict(from_attributes=True)
