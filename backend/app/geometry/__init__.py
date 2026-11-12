"""
Geometry Package for Static Border Camera Geospatial Localization
"""

from app.geometry.coordinate_transform import (
    gps_to_local_enu,
    local_enu_to_gps,
    horizontal_distance,
    bearing_deg,
)
from app.geometry.homography import (
    calculate_homography,
    project_pixel_to_ground,
    project_ground_to_pixel,
    check_collinearity,
    DegeneratePointsException,
    InsufficientPointsException,
)
from app.geometry.reprojection import calculate_reprojection_metrics
from app.geometry.camera_geometry import (
    build_intrinsic_matrix,
    rotation_matrix_from_euler,
    calculate_ray_ground_intersection,
)
from app.geometry.pose_estimation import estimate_camera_pose
from app.geometry.motion import calculate_two_frame_motion

__all__ = [
    "gps_to_local_enu",
    "local_enu_to_gps",
    "horizontal_distance",
    "bearing_deg",
    "calculate_homography",
    "project_pixel_to_ground",
    "project_ground_to_pixel",
    "check_collinearity",
    "DegeneratePointsException",
    "InsufficientPointsException",
    "calculate_reprojection_metrics",
    "build_intrinsic_matrix",
    "rotation_matrix_from_euler",
    "calculate_ray_ground_intersection",
    "estimate_camera_pose",
    "calculate_two_frame_motion",
]
