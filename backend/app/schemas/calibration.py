from datetime import datetime
from typing import Optional, Dict, Any, List
from pydantic import BaseModel, Field, ConfigDict


class PointReprojectionError(BaseModel):
    pillar_id: str = Field(..., description="Pillar identifier")
    name: Optional[str] = None
    pixel_x: float
    pixel_y: float
    ground_x_true: float
    ground_y_true: float
    ground_x_projected: float
    ground_y_projected: float
    error_meters: float = Field(..., description="Euclidean error in meters")
    reprojected_pixel_x: Optional[float] = None
    reprojected_pixel_y: Optional[float] = None
    pixel_error_px: Optional[float] = None


class CameraCalibrationBase(BaseModel):
    calibration_status: str = Field(default="pending", description="Status: uncalibrated, pending, calibrated, failed, stale")
    is_valid: bool = Field(default=False)

    # Position & Orientation
    camera_latitude: Optional[float] = None
    camera_longitude: Optional[float] = None
    camera_height: Optional[float] = Field(None, description="Height above ground in meters")
    yaw: Optional[float] = Field(None, description="Yaw in degrees")
    pitch: Optional[float] = Field(None, description="Pitch in degrees")
    roll: Optional[float] = Field(None, description="Roll in degrees")

    # Intrinsics
    image_width: Optional[int] = 1280
    image_height: Optional[int] = 720
    hfov: Optional[float] = Field(None, description="Horizontal FOV in degrees")
    vfov: Optional[float] = Field(None, description="Vertical FOV in degrees")
    focal_length_px: Optional[float] = None
    intrinsic_k: Optional[List[List[float]]] = None

    # Homography
    h_matrix: Optional[List[List[float]]] = None
    h_inv_matrix: Optional[List[List[float]]] = None
    local_origin_lat: Optional[float] = None
    local_origin_lon: Optional[float] = None
    local_origin_alt: Optional[float] = None

    # Error Metrics
    reprojection_error_mean: Optional[float] = None
    reprojection_error_rmse: Optional[float] = None
    reprojection_error_max: Optional[float] = None
    num_reference_points: Optional[int] = 0
    point_errors: Optional[List[PointReprojectionError]] = None

    # Pose estimation
    pose_estimation_status: Optional[str] = None
    pose_data: Optional[Dict[str, Any]] = None

    # Backward compatibility
    calibration_data: Optional[Dict[str, Any]] = None
    calibration_error: Optional[Dict[str, Any]] = None


class CameraCalibrationCreate(CameraCalibrationBase):
    camera_id: int


class CameraCalibrationRead(CameraCalibrationBase):
    id: int
    camera_id: int
    calibrated_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class CalibrationCalculationRequest(BaseModel):
    # Optional overrides for camera physical placement
    camera_height: Optional[float] = Field(None, ge=0.1, description="Camera mounting height in meters")
    camera_latitude: Optional[float] = Field(None, ge=-90.0, le=90.0)
    camera_longitude: Optional[float] = Field(None, ge=-180.0, le=180.0)
    yaw: Optional[float] = Field(None, description="Manual yaw in degrees")
    pitch: Optional[float] = Field(None, description="Manual pitch in degrees")
    roll: Optional[float] = Field(None, description="Manual roll in degrees")
    image_width: Optional[int] = Field(default=1280, ge=100)
    image_height: Optional[int] = Field(default=720, ge=100)
    hfov: Optional[float] = Field(None, ge=1.0, le=180.0)
    vfov: Optional[float] = Field(None, ge=1.0, le=180.0)


class CalibrationCalculationResponse(BaseModel):
    success: bool
    camera_id: str
    calibration_status: str
    is_valid: bool
    h_matrix: Optional[List[List[float]]] = None
    num_reference_points: int
    reprojection_error_mean: float
    reprojection_error_rmse: float
    reprojection_error_max: float
    highest_error_pillar: Optional[str] = None
    highest_error_meters: Optional[float] = None
    point_errors: List[PointReprojectionError] = []
    pose_estimation_status: str
    pose_summary: Optional[Dict[str, Any]] = None
    local_origin: Dict[str, float]
    message: str


class PixelCoordinates(BaseModel):
    pixel_x: float = Field(..., description="Pixel coordinate X")
    pixel_y: float = Field(..., description="Pixel coordinate Y")


class LocalPosition(BaseModel):
    x: float = Field(..., description="Local ground Easting displacement in meters")
    y: float = Field(..., description="Local ground Northing displacement in meters")
    z: float = Field(default=0.0, description="Local ground elevation in meters (0 for ground plane)")


class GPSCoordinates(BaseModel):
    latitude: float = Field(..., ge=-90.0, le=90.0)
    longitude: float = Field(..., ge=-180.0, le=180.0)


class PixelLocalizationRequest(BaseModel):
    pixel_x: float = Field(..., description="Pixel X in camera viewport")
    pixel_y: float = Field(..., description="Pixel Y in camera viewport")


class RayGroundVerification(BaseModel):
    ground_x: float
    ground_y: float
    distance_discrepancy_m: float
    ray_elevation_angle_deg: float


class PixelLocalizationResponse(BaseModel):
    camera_id: str
    pixel: PixelCoordinates
    local_position: LocalPosition
    distance_m: float
    gps: GPSCoordinates
    ray_verification: Optional[RayGroundVerification] = None
    calibration_status: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)
