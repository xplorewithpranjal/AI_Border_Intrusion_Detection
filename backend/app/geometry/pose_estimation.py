"""
3D Camera Pose Estimation & Orientation Validation Module (PnP)
==============================================================

Uses 3D reference points from border pillars (BASE points at Z=0 and TOP points at Z=H_pillar)
combined with camera intrinsic matrix K to solve for or validate camera pose (R, t).

Implements cv2.solvePnP when sufficient 3D constraints exist.
Gracefully reports 'insufficient_points' when 3D constraints are inadequate,
ensuring manual orientation parameters remain fully supported.
"""

import math
import numpy as np
import cv2
from typing import List, Tuple, Dict, Any, Optional


def estimate_camera_pose(
    object_points_3d: List[Tuple[float, float, float]],
    image_points_2d: List[Tuple[float, float]],
    K: np.ndarray,
    dist_coeffs: Optional[np.ndarray] = None,
) -> Dict[str, Any]:
    """
    Attempts to estimate camera pose using cv2.solvePnP from 3D-2D correspondences.

    Args:
        object_points_3d: List of (X, Y, Z) in local metric ENU coordinates
        image_points_2d: List of corresponding (u, v) in image pixels
        K: 3x3 camera intrinsic matrix
        dist_coeffs: Camera distortion coefficients (None assumes zero distortion)

    Returns:
        Dict containing pose_status, estimated_yaw, estimated_pitch, estimated_roll,
        estimated_camera_height, translation_vector, rotation_matrix, or explanation
        message if estimation cannot be performed reliably.
    """
    n_pts = len(object_points_3d)

    # solvePnP requires at least 4 non-coplanar points for robust 3D pose
    if n_pts < 4:
        return {
            "pose_status": "insufficient_points",
            "message": "Pose estimation requires sufficient non-degenerate 3D reference points (minimum 4 with known TOP heights).",
            "estimated_yaw": None,
            "estimated_pitch": None,
            "estimated_roll": None,
            "estimated_height": None,
        }

    obj_arr = np.array(object_points_3d, dtype=np.float64)
    img_arr = np.array(image_points_2d, dtype=np.float64)

    # Check Z variation: If all Z values are 0 (pure planar ground), solvePnP is degenerate for 3D pose
    z_values = obj_arr[:, 2]
    z_span = float(np.max(z_values) - np.min(z_values))
    if z_span < 0.5:
        return {
            "pose_status": "insufficient_3d_span",
            "message": "Pose estimation requires sufficient non-degenerate 3D reference points (pillars must include TOP points with known height).",
            "estimated_yaw": None,
            "estimated_pitch": None,
            "estimated_roll": None,
            "estimated_height": None,
        }

    if dist_coeffs is None:
        dist_coeffs = np.zeros((4, 1), dtype=np.float64)

    try:
        success, rvec, tvec = cv2.solvePnP(
            obj_arr,
            img_arr,
            K,
            dist_coeffs,
            flags=cv2.SOLVEPNP_ITERATIVE,
        )

        if not success:
            return {
                "pose_status": "failed",
                "message": "solvePnP solver failed to find a convergent solution.",
                "estimated_yaw": None,
                "estimated_pitch": None,
                "estimated_roll": None,
                "estimated_height": None,
            }

        # Convert rvec to rotation matrix (World -> Cam)
        R_world2cam, _ = cv2.Rodrigues(rvec)

        # Camera center in world coordinates: C = -R_world2cam^T * tvec
        cam_pos_world = -R_world2cam.T @ tvec
        est_height = float(cam_pos_world[2])

        # R_cam2world = R_world2cam.T
        R_cam2world = R_world2cam.T

        # Extract approximate Euler angles from R_cam2world
        # Optical axis forward in world frame is R_cam2world[:, 2]
        forward = R_cam2world[:, 2]
        # In ENU: +X East, +Y North, +Z Up
        # Yaw: angle of forward vector in horizontal plane from North (+Y)
        est_yaw = math.degrees(math.atan2(forward[0], forward[1]))
        est_yaw = (est_yaw + 360.0) % 360.0

        # Pitch: elevation of forward vector above/below horizontal
        horiz_dist = math.hypot(forward[0], forward[1])
        est_pitch = math.degrees(math.atan2(forward[2], horiz_dist))

        return {
            "pose_status": "estimated",
            "message": "3D camera pose successfully estimated from pillar BASE and TOP points.",
            "estimated_yaw": round(est_yaw, 2),
            "estimated_pitch": round(est_pitch, 2),
            "estimated_roll": 0.0,
            "estimated_height": round(est_height, 2),
            "camera_position_enu": [round(float(x), 2) for x in cam_pos_world.flatten()],
            "rotation_vector": [round(float(x), 4) for x in rvec.flatten()],
            "translation_vector": [round(float(x), 4) for x in tvec.flatten()],
        }
    except Exception as ex:
        return {
            "pose_status": "error",
            "message": f"Error during pose estimation: {str(ex)}",
            "estimated_yaw": None,
            "estimated_pitch": None,
            "estimated_roll": None,
            "estimated_height": None,
        }
