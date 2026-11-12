from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field, ConfigDict


class PillarImagePointBase(BaseModel):
    point_type: str = Field(..., pattern="^(TOP|BASE)$", description="Type of reference point: TOP or BASE")
    pixel_x: float = Field(..., ge=0.0, description="Image coordinate X in pixels")
    pixel_y: float = Field(..., ge=0.0, description="Image coordinate Y in pixels")
    real_z: Optional[float] = Field(None, ge=0.0, description="Real physical height in meters (0 for BASE, pillar height for TOP)")


class PillarImagePointCreate(PillarImagePointBase):
    pass


class PillarImagePointRead(PillarImagePointBase):
    id: int
    pillar_id: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ReferencePillarBase(BaseModel):
    pillar_id: str = Field(..., min_length=1, max_length=64, description="Pillar identifier, e.g. BP_001")
    name: str = Field(..., min_length=1, max_length=128, description="Pillar label or designation")
    latitude: Optional[float] = Field(None, ge=-90.0, le=90.0, description="Physical pillar latitude")
    longitude: Optional[float] = Field(None, ge=-180.0, le=180.0, description="Physical pillar longitude")
    height: Optional[float] = Field(None, ge=0.0, description="Physical pillar height in meters (Z)")
    x_distance: Optional[float] = Field(None, description="Along-border/local horizontal coordinate in meters (X)")
    y_distance: Optional[float] = Field(None, description="Perpendicular-to-border coordinate in meters (Y)")


class ReferencePillarCreate(ReferencePillarBase):
    image_points: Optional[List[PillarImagePointCreate]] = Field(default=[], description="Initial image points (TOP/BASE)")


class ReferencePillarUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=128)
    latitude: Optional[float] = Field(None, ge=-90.0, le=90.0)
    longitude: Optional[float] = Field(None, ge=-180.0, le=180.0)
    height: Optional[float] = Field(None, ge=0.0)
    x_distance: Optional[float] = None
    y_distance: Optional[float] = None


class ReferencePillarRead(ReferencePillarBase):
    id: int
    camera_id: int
    created_at: datetime
    updated_at: datetime
    image_points: List[PillarImagePointRead] = []

    model_config = ConfigDict(from_attributes=True)
