"""
Planar Homography Calibration Module
====================================

Computes and applies the projective transformation between 2D image pixels
(u, v) and 2D local ground coordinates (X, Y in meters on Z=0 plane).

Mathematical Formulation:
-------------------------
For image point p = [u, v, 1]^T and ground point P = [X, Y, 1]^T:
P ~ H * p

X = (h11*u + h12*v + h13) / (h31*u + h32*v + h33)
Y = (h21*u + h22*v + h23) / (h31*u + h32*v + h33)
"""

import numpy as np
import cv2
from typing import List, Tuple, Dict, Any, Optional


class DegeneratePointsException(ValueError):
    """Raised when ground or image reference points are collinear or degenerate."""
    pass


class InsufficientPointsException(ValueError):
    """Raised when fewer than 4 reference points are provided for homography."""
    pass


def check_collinearity(points: np.ndarray, tolerance: float = 1e-4) -> bool:
    """
    Checks if a set of 2D points are collinear using SVD of centered coordinates.

    Args:
        points: (N, 2) array of coordinates
        tolerance: threshold for ratio of second singular value to first

    Returns:
        True if all points are collinear/degenerate, False if properly distributed in 2D.
    """
    if len(points) < 3:
        return True

    # Center the points
    mean = np.mean(points, axis=0)
    centered = points - mean

    # SVD
    _, s, _ = np.linalg.svd(centered)
    if s[0] < 1e-9:
        return True

    # Ratio of minor axis to major axis
    ratio = s[1] / s[0]
    return ratio < tolerance


def calculate_homography(
    image_points: List[Tuple[float, float]],
    ground_points: List[Tuple[float, float]],
    use_ransac: bool = True,
    ransac_threshold: float = 2.0,
) -> Tuple[np.ndarray, np.ndarray, Dict[str, Any]]:
    """
    Computes the 3x3 homography matrix H mapping image pixels -> local ground (X, Y)
    and its inverse H_inv mapping local ground -> image pixels.

    Args:
        image_points: List of (u, v) pixel tuples (minimum 4)
        ground_points: List of (X, Y) meters tuples (minimum 4)
        use_ransac: Whether to use RANSAC (recommended for >= 5 points)
        ransac_threshold: RANSAC reprojection error threshold in meters

    Returns:
        (H, H_inv, metadata_dict)
    """
    n_pts = len(image_points)
    if n_pts < 4:
        raise InsufficientPointsException(
            f"At least 4 non-collinear reference points required for homography calculation. Provided: {n_pts}."
        )
    if n_pts > 4:
        raise ValueError(
            f"Maximum of 4 reference pillars allowed for homography calibration. Provided: {n_pts}."
        )

    if len(ground_points) != n_pts:
        raise ValueError("Number of image points must exactly match number of ground points.")

    img_arr = np.array(image_points, dtype=np.float64)
    gnd_arr = np.array(ground_points, dtype=np.float64)

    # Check for negative pixel coordinates
    if (img_arr < 0).any():
        raise ValueError("Image reference point pixel coordinates cannot be negative.")

    # Check for duplicate coordinates
    if len(np.unique(img_arr, axis=0)) < n_pts:
        raise DegeneratePointsException("Image reference points contain duplicate pixel coordinates.")
    if len(np.unique(gnd_arr, axis=0)) < n_pts:
        raise DegeneratePointsException("Ground reference points contain duplicate coordinates.")

    # Validate non-collinearity of image points
    if check_collinearity(img_arr):
        raise DegeneratePointsException(
            "Image reference points are collinear or degenerate. Points must span both horizontal and depth dimensions."
        )

    # Validate non-collinearity of ground points
    if check_collinearity(gnd_arr):
        raise DegeneratePointsException(
            "Ground reference points are collinear. Pillars must span an area in East and North directions, not a single line."
        )

    # Compute Homography: src = image (u, v), dst = ground (X, Y)
    # Using cv2.findHomography
    if n_pts == 4 or not use_ransac:
        H, mask = cv2.findHomography(img_arr, gnd_arr, method=0)
    else:
        H, mask = cv2.findHomography(
            img_arr,
            gnd_arr,
            method=cv2.RANSAC,
            ransacReprojThreshold=ransac_threshold,
        )

    if H is None:
        raise ValueError("Homography estimation failed to converge. Verify point correspondences.")

    # Normalize so H[2, 2] == 1.0 (if non-zero)
    if abs(H[2, 2]) > 1e-9:
        H = H / H[2, 2]

    # Compute inverse homography (Ground -> Image)
    det = np.linalg.det(H)
    if abs(det) < 1e-12:
        raise DegeneratePointsException("Computed homography is singular / non-invertible.")

    H_inv = np.linalg.inv(H)
    if abs(H_inv[2, 2]) > 1e-9:
        H_inv = H_inv / H_inv[2, 2]

    inlier_count = int(np.sum(mask)) if mask is not None else n_pts

    meta = {
        "num_points": n_pts,
        "inliers": inlier_count,
        "method": "RANSAC" if (use_ransac and n_pts > 4) else "Exact Least-Squares",
        "determinant": float(det),
    }

    return H, H_inv, meta


def project_pixel_to_ground(H: np.ndarray, u: float, v: float) -> Tuple[float, float]:
    """
    Transforms an image pixel (u, v) to ground position (X, Y) in meters
    using forward homography H.

    Args:
        H: 3x3 homography matrix
        u: pixel horizontal coordinate (width axis)
        v: pixel vertical coordinate (height axis)

    Returns:
        (X_east_m, Y_north_m)
    """
    vec = np.array([u, v, 1.0], dtype=np.float64)
    proj = H @ vec

    denom = proj[2]
    if abs(denom) < 1e-9:
        raise ValueError("Point projects to infinity (parallel or beyond horizon ray).")

    x = float(proj[0] / denom)
    y = float(proj[1] / denom)
    return round(x, 4), round(y, 4)


def project_ground_to_pixel(H_inv: np.ndarray, x: float, y: float) -> Tuple[float, float]:
    """
    Transforms a ground position (X, Y) in meters to image pixel (u, v)
    using inverse homography H_inv.

    Args:
        H_inv: 3x3 inverse homography matrix
        x: Easting in meters
        y: Northing in meters

    Returns:
        (u_px, v_px)
    """
    vec = np.array([x, y, 1.0], dtype=np.float64)
    proj = H_inv @ vec

    denom = proj[2]
    if abs(denom) < 1e-9:
        raise ValueError("Ground point projection denominator is zero.")

    u = float(proj[0] / denom)
    v = float(proj[1] / denom)
    return round(u, 2), round(v, 2)
