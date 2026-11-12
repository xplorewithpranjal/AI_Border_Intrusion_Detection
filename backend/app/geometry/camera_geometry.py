"""
Camera Geometry and Ray-Ground Plane Intersection Module
========================================================

Defines camera intrinsic matrix K, extrinsic rotation R from explicit
yaw/pitch/roll angles, viewing rays, and analytic ray-ground intersection.

Coordinate Frame Definitions:
-----------------------------
1. Local World Frame (ENU - East, North, Up):
   - +X: East
   - +Y: North
   - +Z: Up (elevation above ground)
   - Camera Center C = (0.0, 0.0, camera_height) relative to ground plumb-line

2. Camera Optical Frame (Standard Computer Vision):
   - +X_cam: Right
   - +Y_cam: Down
   - +Z_cam: Forward (along viewing optical axis)

3. Orientation Angles (Degrees):
   - Yaw (psi): Heading angle (0° = North, 90° = East, 180° = South, 270° = West)
   - Pitch (theta): Vertical tilt angle (0° = horizontal, negative = tilted down toward ground)
   - Roll (phi): Tilt about viewing axis (0° = upright horizontal horizon)
"""

import math
import numpy as np
from typing import Tuple, Optional, Dict, Any


def build_intrinsic_matrix(
    image_width: int,
    image_height: int,
    hfov_deg: Optional[float] = None,
    vfov_deg: Optional[float] = None,
    focal_length_px: Optional[float] = None,
) -> np.ndarray:
    """
    Constructs the 3x3 camera intrinsic matrix K:
    [ fx   0   cx ]
    [  0  fy   cy ]
    [  0   0    1 ]
    """
    cx = image_width / 2.0
    cy = image_height / 2.0

    if focal_length_px is not None and focal_length_px > 0:
        fx = focal_length_px
        fy = focal_length_px
    elif hfov_deg is not None and hfov_deg > 0:
        fx = (image_width / 2.0) / math.tan(math.radians(hfov_deg / 2.0))
        if vfov_deg is not None and vfov_deg > 0:
            fy = (image_height / 2.0) / math.tan(math.radians(vfov_deg / 2.0))
        else:
            fy = fx  # Square pixels
    else:
        # Default ~65° HFOV standard surveillance lens
        default_hfov = 65.0
        fx = (image_width / 2.0) / math.tan(math.radians(default_hfov / 2.0))
        fy = fx

    K = np.array([
        [fx,  0.0, cx],
        [0.0, fy,  cy],
        [0.0, 0.0, 1.0]
    ], dtype=np.float64)

    return K


def rotation_matrix_from_euler(yaw_deg: float, pitch_deg: float, roll_deg: float) -> np.ndarray:
    """
    Computes rotation matrix R_cam2world mapping camera optical vectors
    (+X right, +Y down, +Z forward) into ENU World coordinates (+X East, +Y North, +Z Up).

    Args:
        yaw_deg: Compass heading (0 = North, 90 = East)
        pitch_deg: Elevation tilt (negative = downwards looking)
        roll_deg: Bank angle (degrees)

    Returns:
        3x3 rotation matrix R_cam2world
    """
    yaw = math.radians(yaw_deg)
    pitch = math.radians(pitch_deg)
    roll = math.radians(roll_deg)

    # 1. Base rotation from optical frame (+X right, +Y down, +Z forward)
    # to ENU looking North (+X East, +Y North, +Z Up):
    # Looking North: right = +X (East), down = -Z (Down), forward = +Y (North)
    R_base = np.array([
        [ 1.0,  0.0,  0.0],  # Cam X (Right)   -> World East (+X)
        [ 0.0,  0.0,  1.0],  # Cam Z (Forward) -> World North (+Y)
        [ 0.0, -1.0,  0.0],  # Cam Y (Down)    -> World Up (+Z)
    ], dtype=np.float64)

    # 2. Rotation around World Up (Yaw)
    # Note: Compass yaw is clockwise from North (+Y toward +X)
    R_yaw = np.array([
        [ math.cos(yaw), math.sin(yaw), 0.0],
        [-math.sin(yaw), math.cos(yaw), 0.0],
        [ 0.0,           0.0,           1.0]
    ], dtype=np.float64)

    # 3. Rotation around Cam Right / Pitch
    # Pitch tilts camera forward/backward
    R_pitch = np.array([
        [1.0,  0.0,              0.0            ],
        [0.0,  math.cos(pitch), -math.sin(pitch)],
        [0.0,  math.sin(pitch),  math.cos(pitch)]
    ], dtype=np.float64)

    # 4. Rotation around Optical Axis / Roll
    R_roll = np.array([
        [ math.cos(roll), -math.sin(roll), 0.0],
        [ math.sin(roll),  math.cos(roll), 0.0],
        [ 0.0,             0.0,            1.0]
    ], dtype=np.float64)

    # Combine: R_cam2world
    R_cam = R_pitch @ R_roll
    R_cam2world = R_yaw @ R_base @ R_cam

    return R_cam2world


def calculate_ray_ground_intersection(
    u: float,
    v: float,
    K: np.ndarray,
    R_cam2world: np.ndarray,
    camera_height: float,
    camera_east: float = 0.0,
    camera_north: float = 0.0,
) -> Tuple[Optional[float], Optional[float], Dict[str, Any]]:
    """
    Computes viewing ray for pixel (u, v) and intersects it with the ground plane (Z = 0).

    Formula:
    Ray d_world = R_cam2world * K^-1 * [u, v, 1]^T
    Ground plane intersection (Z = 0):
    P(lambda) = C + lambda * d_world
    Z = Cz + lambda * d_z = 0  =>  lambda = -Cz / d_z

    Args:
        u: pixel X coordinate
        v: pixel Y coordinate
        K: 3x3 camera intrinsic matrix
        R_cam2world: 3x3 camera to world rotation matrix
        camera_height: height of camera above ground plane in meters (Cz)
        camera_east: camera East position in meters
        camera_north: camera North position in meters

    Returns:
        (ground_x_east, ground_y_north, meta_dict) or (None, None, error_meta) if ray does not intersect ground.
    """
    if camera_height <= 0:
        return None, None, {"error": "Camera height must be positive for ground plane intersection"}

    # Unproject pixel to camera optical frame ray
    K_inv = np.linalg.inv(K)
    p_hom = np.array([u, v, 1.0], dtype=np.float64)
    d_cam = K_inv @ p_hom
    d_cam_unit = d_cam / np.linalg.norm(d_cam)

    # Transform ray direction to World ENU frame
    d_world = R_cam2world @ d_cam_unit
    d_world = d_world / np.linalg.norm(d_world)

    dz = float(d_world[2])

    # If ray is pointing upwards or parallel to ground (dz >= -1e-4), it will never hit ground plane
    if dz >= -1e-4:
        return None, None, {
            "error": "Viewing ray points at or above horizon (sky / horizon line).",
            "ray_elevation_deg": math.degrees(math.asin(max(-1.0, min(1.0, dz)))),
            "dz": dz,
        }

    # Solve for lambda parameter: Z = Cz + lambda * dz = 0
    # lambda = -camera_height / dz
    lambda_param = -camera_height / dz

    gx = camera_east + lambda_param * float(d_world[0])
    gy = camera_north + lambda_param * float(d_world[1])

    dist_from_cam = math.hypot(gx - camera_east, gy - camera_north)
    elevation_deg = math.degrees(math.asin(max(-1.0, min(1.0, dz))))

    meta = {
        "ray_elevation_deg": round(elevation_deg, 2),
        "distance_m": round(dist_from_cam, 2),
        "lambda": round(lambda_param, 2),
        "ray_world": [round(float(x), 4) for x in d_world],
    }

    return round(gx, 4), round(gy, 4), meta
