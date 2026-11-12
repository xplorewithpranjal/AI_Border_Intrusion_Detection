"""
Reprojection Error and Calibration Quality Analysis Module
==========================================================

Evaluates geometric fidelity of the computed homography against known
ground reference points.

Metrics Computed:
-----------------
- Per-point metric Euclidean error: e_i = sqrt((X_pred - X_true)^2 + (Y_pred - Y_true)^2)
- Mean Error (meters)
- RMSE (Root Mean Square Error in meters)
- Maximum Point Error (meters)
- Image-space pixel reprojection error (pixels)
"""

import math
import numpy as np
from typing import List, Tuple, Dict, Any
from app.geometry.homography import project_pixel_to_ground, project_ground_to_pixel


def calculate_reprojection_metrics(
    H: np.ndarray,
    H_inv: np.ndarray,
    reference_data: List[Dict[str, Any]],
    rmse_valid_threshold: float = 2.0,
) -> Dict[str, Any]:
    """
    Computes comprehensive reprojection error metrics for a set of reference pillars.

    Args:
        H: Forward homography matrix (Image -> Ground)
        H_inv: Inverse homography matrix (Ground -> Image)
        reference_data: List of dicts, each with:
            - 'pillar_id': str
            - 'name': str
            - 'pixel_x': float
            - 'pixel_y': float
            - 'ground_x': float
            - 'ground_y': float
        rmse_valid_threshold: Threshold in meters for marking calibration valid (default 2.0m)

    Returns:
        Dict with mean_error, rmse, max_error, point_errors list, and is_valid status.
    """
    if not reference_data:
        return {
            "mean_error": 0.0,
            "rmse": 0.0,
            "max_error": 0.0,
            "num_points": 0,
            "point_errors": [],
            "is_valid": False,
            "status_text": "No points available",
        }

    point_errors = []
    squared_errors = []
    absolute_errors = []

    for item in reference_data:
        u = float(item["pixel_x"])
        v = float(item["pixel_y"])
        gx_true = float(item["ground_x"])
        gy_true = float(item["ground_y"])

        # Forward project pixel -> ground
        try:
            gx_pred, gy_pred = project_pixel_to_ground(H, u, v)
            err_m = math.hypot(gx_pred - gx_true, gy_pred - gy_true)
        except Exception:
            gx_pred, gy_pred = 0.0, 0.0
            err_m = 999.0

        # Backward project ground -> pixel
        try:
            u_pred, v_pred = project_ground_to_pixel(H_inv, gx_true, gy_true)
            err_px = math.hypot(u_pred - u, v_pred - v)
        except Exception:
            u_pred, v_pred = 0.0, 0.0
            err_px = 999.0

        squared_errors.append(err_m**2)
        absolute_errors.append(err_m)

        point_errors.append({
            "pillar_id": item.get("pillar_id", "P"),
            "name": item.get("name", ""),
            "pixel_x": round(u, 1),
            "pixel_y": round(v, 1),
            "ground_x_true": round(gx_true, 3),
            "ground_y_true": round(gy_true, 3),
            "ground_x_projected": round(gx_pred, 3),
            "ground_y_projected": round(gy_pred, 3),
            "error_meters": round(err_m, 4),
            "reprojected_pixel_x": round(u_pred, 1),
            "reprojected_pixel_y": round(v_pred, 1),
            "pixel_error_px": round(err_px, 2),
        })

    n = len(absolute_errors)
    mean_error = sum(absolute_errors) / n if n > 0 else 0.0
    rmse = math.sqrt(sum(squared_errors) / n) if n > 0 else 0.0
    max_error = max(absolute_errors) if n > 0 else 0.0

    highest_error_item = max(point_errors, key=lambda x: x["error_meters"]) if point_errors else None
    highest_pillar_id = highest_error_item["pillar_id"] if highest_error_item else None
    highest_pillar_name = highest_error_item["name"] if highest_error_item else None

    is_valid = rmse <= rmse_valid_threshold and n >= 4

    return {
        "mean_error": round(mean_error, 4),
        "rmse": round(rmse, 4),
        "max_error": round(max_error, 4),
        "highest_error_pillar": highest_pillar_id,
        "highest_error_pillar_name": highest_pillar_name,
        "highest_error_meters": round(max_error, 4) if highest_error_item else 0.0,
        "num_points": n,
        "point_errors": point_errors,
        "is_valid": is_valid,
        "status_text": "CALIBRATION VALID" if is_valid else "CALIBRATION DEGRADED (Check point coordinates)",
    }
