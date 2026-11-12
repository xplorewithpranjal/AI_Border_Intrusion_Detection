from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, JSON
from sqlalchemy.orm import relationship
from app.database import Base


def utc_now():
    return datetime.now(timezone.utc)


class CameraCalibration(Base):
    __tablename__ = "camera_calibrations"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    camera_id = Column(Integer, ForeignKey("cameras.id", ondelete="CASCADE"), nullable=False, index=True)
    calibration_status = Column(String(32), default="pending", nullable=False, doc="pending, calibrated, failed, stale")
    is_valid = Column(Integer, default=0, nullable=False, doc="1 if calibration meets quality criteria, 0 otherwise")

    # Camera Position & Orientation at calibration time
    camera_latitude = Column(Float, nullable=True)
    camera_longitude = Column(Float, nullable=True)
    camera_height = Column(Float, nullable=True, doc="Height above ground in meters")
    yaw = Column(Float, nullable=True, doc="Yaw angle in degrees")
    pitch = Column(Float, nullable=True, doc="Pitch angle in degrees")
    roll = Column(Float, nullable=True, doc="Roll angle in degrees")

    # Camera Intrinsics
    image_width = Column(Integer, nullable=True, default=1280)
    image_height = Column(Integer, nullable=True, default=720)
    hfov = Column(Float, nullable=True, doc="Horizontal Field of View in degrees")
    vfov = Column(Float, nullable=True, doc="Vertical Field of View in degrees")
    focal_length_px = Column(Float, nullable=True, doc="Focal length in pixels")
    intrinsic_k = Column(JSON, nullable=True, doc="3x3 Camera Intrinsic Matrix K")

    # Homography (Image <-> Local Ground Plane)
    h_matrix = Column(JSON, nullable=True, doc="3x3 Homography matrix mapping (u, v) -> local (X, Y)")
    h_inv_matrix = Column(JSON, nullable=True, doc="3x3 Inverse Homography matrix mapping local (X, Y) -> (u, v)")
    local_origin_lat = Column(Float, nullable=True, doc="Origin latitude for local metric tangent plane")
    local_origin_lon = Column(Float, nullable=True, doc="Origin longitude for local metric tangent plane")
    local_origin_alt = Column(Float, nullable=True, doc="Origin altitude / height")

    # Quality Metrics
    reprojection_error_mean = Column(Float, nullable=True, doc="Mean Euclidean error in meters")
    reprojection_error_rmse = Column(Float, nullable=True, doc="Root Mean Squared Error in meters")
    reprojection_error_max = Column(Float, nullable=True, doc="Maximum point error in meters")
    num_reference_points = Column(Integer, nullable=True, default=0)
    point_errors = Column(JSON, nullable=True, doc="List of per-point reprojection errors")

    # 3D Pose Estimation & Validation
    pose_estimation_status = Column(String(64), nullable=True, doc="estimated, manual, insufficient_points, failed")
    pose_data = Column(JSON, nullable=True, doc="PnP rotation vector, translation vector, etc.")

    # Structured placeholders for Phase 1 backward compatibility
    calibration_data = Column(JSON, nullable=True, doc="Structured calibration parameters (e.g. homography, intrinsics)")
    calibration_error = Column(JSON, nullable=True, doc="Calibration error metrics (e.g. reprojection error, RMSE)")

    calibrated_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    # Relationships
    camera = relationship("Camera", back_populates="calibrations")
