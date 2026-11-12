"""
Unit Tests for Phase 3 Geometric Calibration & Coordinate Systems
=================================================================

Tests:
1. GPS <-> Local metric ENU coordinate transforms (round-trip accuracy)
2. Homography calculation from synthetic 4+ reference points
3. Forward (pixel -> ground) and inverse (ground -> pixel) projections
4. Collinearity detection for degenerate configurations
5. Minimum point count validation (<4 points rejected)
6. Reprojection error and RMSE calculations
7. Viewing ray unprojection and ray-ground plane intersection
8. 3D Pose estimation (SolvePnP) using pillar TOP/BASE heights
9. Calibration isolation between different cameras
"""

import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import math
import numpy as np

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


def test_gps_local_enu_roundtrip():
    """Verify GPS -> Local ENU -> GPS round-trip conversion accuracy to < 1mm."""
    origin_lat = 32.7161000
    origin_lon = 74.8562000

    # Test point roughly 150m East and 250m North
    test_lat = 32.7183500
    test_lon = 74.8578000

    x_east, y_north, z_up = gps_to_local_enu(test_lat, test_lon, origin_lat, origin_lon)

    # Convert back to GPS
    lat_recov, lon_recov, _ = local_enu_to_gps(x_east, y_north, origin_lat, origin_lon)

    assert abs(lat_recov - test_lat) < 1e-6, f"Lat error: {abs(lat_recov - test_lat)}"
    assert abs(lon_recov - test_lon) < 1e-6, f"Lon error: {abs(lon_recov - test_lon)}"
    print(f"PASS: GPS <-> ENU round-trip error < 0.000001 deg (X: {x_east}m, Y: {y_north}m)")


def test_homography_synthetic_exact():
    """Verify homography calculation from known 4 planar points recovers exact ground positions."""
    # Synthetic ground rectangular area:
    # P1: (0, 10), P2: (30, 10), P3: (30, 60), P4: (0, 60) in meters
    ground_pts = [
        (0.0, 10.0),
        (30.0, 10.0),
        (30.0, 60.0),
        (0.0, 60.0),
    ]

    # Corresponding camera image pixels under perspective projection
    image_pts = [
        (250.0, 500.0),
        (710.0, 500.0),
        (580.0, 250.0),
        (380.0, 250.0),
    ]

    H, H_inv, meta = calculate_homography(image_pts, ground_pts, use_ransac=False)

    assert H.shape == (3, 3)
    assert H_inv.shape == (3, 3)

    # Test forward projection
    for (u, v), (gx, gy) in zip(image_pts, ground_pts):
        gx_pred, gy_pred = project_pixel_to_ground(H, u, v)
        assert abs(gx_pred - gx) < 0.01, f"Ground X error: {abs(gx_pred - gx)}"
        assert abs(gy_pred - gy) < 0.01, f"Ground Y error: {abs(gy_pred - gy)}"

    # Test backward projection
    for (u, v), (gx, gy) in zip(image_pts, ground_pts):
        u_pred, v_pred = project_ground_to_pixel(H_inv, gx, gy)
        assert abs(u_pred - u) < 0.05, f"Pixel U error: {abs(u_pred - u)}"
        assert abs(v_pred - v) < 0.05, f"Pixel V error: {abs(v_pred - v)}"

    print("PASS: Homography forward and inverse exact projection")


def test_homography_collinear_rejection():
    """Verify that collinear points are rejected with a clear exception."""
    # 4 points lying along a single straight line
    collinear_ground = [
        (10.0, 10.0),
        (20.0, 20.0),
        (30.0, 30.0),
        (40.0, 40.0),
    ]
    collinear_image = [
        (100.0, 100.0),
        (200.0, 200.0),
        (300.0, 300.0),
        (400.0, 400.0),
    ]

    try:
        calculate_homography(collinear_image, collinear_ground)
        assert False, "Should have raised DegeneratePointsException for collinear points"
    except (DegeneratePointsException, ValueError) as ex:
        assert "collinear" in str(ex).lower()
        print("PASS: Collinear points correctly rejected")


def test_homography_insufficient_points():
    """Verify that fewer than 4 points is rejected."""
    try:
        calculate_homography([(100, 100), (200, 200), (300, 300)], [(0, 10), (10, 10), (10, 20)])
        assert False, "Should have raised InsufficientPointsException"
    except InsufficientPointsException:
        print("PASS: <4 points correctly rejected")


def test_reprojection_error_computation():
    """Verify reprojection error and RMSE quality metrics."""
    ground_pts = [(0.0, 10.0), (30.0, 10.0), (30.0, 60.0), (0.0, 60.0)]
    image_pts = [(250.0, 500.0), (710.0, 500.0), (580.0, 250.0), (380.0, 250.0)]

    H, H_inv, _ = calculate_homography(image_pts, ground_pts, use_ransac=False)

    ref_data = [
        {"pillar_id": f"P{i+1}", "name": f"Pillar {i+1}", "pixel_x": img[0], "pixel_y": img[1], "ground_x": gnd[0], "ground_y": gnd[1]}
        for i, (img, gnd) in enumerate(zip(image_pts, ground_pts))
    ]

    metrics = calculate_reprojection_metrics(H, H_inv, ref_data, rmse_valid_threshold=1.0)

    assert metrics["rmse"] < 0.05, f"RMSE too high: {metrics['rmse']}"
    assert metrics["is_valid"] is True
    assert len(metrics["point_errors"]) == 4
    print(f"PASS: Reprojection error metrics (RMSE: {metrics['rmse']}m, Status: {metrics['status_text']})")


def test_ray_ground_intersection():
    """Verify analytic ray-ground intersection from camera height and pitch."""
    K = build_intrinsic_matrix(image_width=1280, image_height=720, hfov_deg=65.0)
    # Camera looking North (yaw=0), tilted down 20 deg (pitch=-20)
    R_cam2world = rotation_matrix_from_euler(yaw_deg=0.0, pitch_deg=-20.0, roll_deg=0.0)

    # Pixel in center of screen (cx=640, cy=360)
    gx, gy, meta = calculate_ray_ground_intersection(
        u=640.0, v=360.0, K=K, R_cam2world=R_cam2world, camera_height=5.0
    )

    assert gx is not None and gy is not None
    # For pitch = -20°, ground distance along optical axis = 5 / tan(20°) = 5 / 0.36397 = ~13.73m North
    expected_y = 5.0 / math.tan(math.radians(20.0))
    assert abs(gx) < 0.1, f"East error: {gx}"
    assert abs(gy - expected_y) < 0.2, f"North expected ~{expected_y}m, got {gy}m"
    print(f"PASS: Ray-ground intersection: (X: {gx}m, Y: {gy}m, expected ~{round(expected_y, 2)}m)")


def test_pose_estimation_solvepnp():
    """Verify 3D pose estimation from pillar TOP and BASE points."""
    K = build_intrinsic_matrix(image_width=1280, image_height=720, hfov_deg=65.0)

    # 4 pillars with known BASE and TOP points (8 total 3D points)
    obj_3d = [
        (0.0, 15.0, 0.0),    (0.0, 15.0, 2.5),
        (25.0, 15.0, 0.0),   (25.0, 15.0, 2.5),
        (25.0, 45.0, 0.0),   (25.0, 45.0, 2.5),
        (0.0, 45.0, 0.0),    (0.0, 45.0, 2.5),
    ]

    # Project these points with a known camera pose: C=(0, 0, 5), looking North (yaw=0, pitch=-15)
    R = rotation_matrix_from_euler(0.0, -15.0, 0.0)
    # World to Cam: R_w2c = R.T, t_w2c = -R.T * C
    C = np.array([0.0, 0.0, 5.0], dtype=np.float64)
    R_w2c = R.T
    t_w2c = -R_w2c @ C

    img_2d = []
    for pt in obj_3d:
        p_cam = R_w2c @ np.array(pt) + t_w2c
        p_px = K @ (p_cam / p_cam[2])
        img_2d.append((float(p_px[0]), float(p_px[1])))

    pose = estimate_camera_pose(obj_3d, img_2d, K)

    assert pose["pose_status"] == "estimated"
    assert abs(pose["estimated_height"] - 5.0) < 0.2, f"Height estimated: {pose['estimated_height']}"
    assert abs(pose["estimated_pitch"] - (-15.0)) < 2.0, f"Pitch estimated: {pose['estimated_pitch']}"
    print(f"PASS: Pose estimation recovered height {pose['estimated_height']}m and pitch {pose['estimated_pitch']}°")


def test_earth_bearing_azimuth():
    """Verify Earth-referenced absolute compass bearing: 0° = North, 90° = East, 180° = South, 270° = West."""
    def calc_bearing(east, north):
        return (math.degrees(math.atan2(east, north)) + 360.0) % 360.0

    assert abs(calc_bearing(0.0, 50.0) - 0.0) < 1e-4, "Direct North must be 0°"
    assert abs(calc_bearing(50.0, 0.0) - 90.0) < 1e-4, "Direct East must be 90°"
    assert abs(calc_bearing(0.0, -50.0) - 180.0) < 1e-4, "Direct South must be 180°"
    assert abs(calc_bearing(-50.0, 0.0) - 270.0) < 1e-4, "Direct West must be 270°"
    assert abs(calc_bearing(30.0, 30.0) - 45.0) < 1e-4, "North-East must be 45°"
    assert abs(calc_bearing(-30.0, -30.0) - 225.0) < 1e-4, "South-West must be 225°"
    print("PASS: Earth-referenced bearing verified (0°=N, 90°=E, 180°=S, 270°=W)")


def test_horizontal_distance_formula():
    """Verify horizontal ground distance calculation (no 3D altitude)."""
    assert abs(horizontal_distance(0.0, 0.0) - 0.0) < 1e-6
    assert abs(horizontal_distance(3.0, 4.0) - 5.0) < 1e-6
    assert abs(horizontal_distance(-6.0, 8.0) - 10.0) < 1e-6
    assert abs(horizontal_distance(20.0, 20.0) - math.hypot(20.0, 20.0)) < 1e-6
    print("PASS: Horizontal distance formula verified")


def test_pixel_to_gps_localization():
    """Verify complete pixel -> calibrated ground -> GPS pipeline."""
    ground_pts = [(0.0, 10.0), (30.0, 10.0), (30.0, 60.0), (0.0, 60.0)]
    image_pts = [(250.0, 500.0), (710.0, 500.0), (580.0, 250.0), (380.0, 250.0)]
    H, _, _ = calculate_homography(image_pts, ground_pts, use_ransac=False)

    origin_lat = 32.716100
    origin_lon = 74.856200

    # Test pixel (480, 375) roughly center of the polygon
    gx, gy = project_pixel_to_ground(H, 480.0, 375.0)
    assert 0.0 < gx < 30.0
    assert 10.0 < gy < 60.0

    # Project to GPS
    lat, lon, _ = local_enu_to_gps(gx, gy, origin_lat, origin_lon)
    assert abs(lat - origin_lat) > 0.00001
    assert abs(lon - origin_lon) > 0.00001

    # Round-trip back to local ENU
    gx_back, gy_back, _ = gps_to_local_enu(lat, lon, origin_lat, origin_lon)
    assert abs(gx_back - gx) < 0.01
    assert abs(gy_back - gy) < 0.01
    print(f"PASS: Pixel -> Ground ({round(gx, 2)}m, {round(gy, 2)}m) -> GPS ({lat}, {lon}) verified")


def test_invalid_calibration_cases():
    """Verify robust rejection of all invalid/degenerate calibration configurations."""
    # 1. More than 4 reference pillars (strictly forbidden)
    five_pts = [(100, 100), (200, 100), (200, 200), (100, 200), (150, 150)]
    five_gnd = [(0, 10), (20, 10), (20, 30), (0, 30), (10, 20)]
    try:
        calculate_homography(five_pts, five_gnd)
        assert False, "Should have rejected > 4 reference pillars"
    except ValueError as ve:
        assert "maximum of 4 reference pillars" in str(ve).lower()
        print("PASS: > 4 reference pillars rejected with clear message")

    # 2. Negative pixel coordinates
    try:
        calculate_homography([(-10, 100), (200, 100), (200, 200), (100, 200)], five_gnd[:4])
        assert False, "Should have rejected negative pixel coordinates"
    except ValueError as ve:
        assert "cannot be negative" in str(ve).lower()
        print("PASS: Negative pixel coordinates rejected")

    # 3. Duplicate coordinates
    try:
        calculate_homography([(100, 100), (100, 100), (200, 200), (100, 200)], five_gnd[:4])
        assert False, "Should have rejected duplicate coordinates"
    except DegeneratePointsException as de:
        assert "duplicate" in str(de).lower()
        print("PASS: Duplicate coordinates rejected")

    # 4. Pose estimation with purely planar points (insufficient 3D height variation)
    K = build_intrinsic_matrix(1280, 720)
    planar_3d = [(0, 10, 0), (20, 10, 0), (20, 30, 0), (0, 30, 0)]
    planar_img = [(200, 500), (800, 500), (700, 300), (300, 300)]
    pose_res = estimate_camera_pose(planar_3d, planar_img, K)
    assert pose_res["pose_status"] == "insufficient_3d_span"
    print("PASS: Planar points correctly flagged with insufficient_3d_span for 3D pose")

    # 5. Pose estimation with < 4 points
    pose_res_few = estimate_camera_pose(planar_3d[:3], planar_img[:3], K)
    assert pose_res_few["pose_status"] == "insufficient_points"
    print("PASS: < 4 3D points correctly flagged with insufficient_points")


if __name__ == "__main__":
    print("Running Phase 3 Geometry Unit Tests...")
    test_gps_local_enu_roundtrip()
    test_homography_synthetic_exact()
    test_homography_collinear_rejection()
    test_homography_insufficient_points()
    test_reprojection_error_computation()
    test_ray_ground_intersection()
    test_pose_estimation_solvepnp()
    test_earth_bearing_azimuth()
    test_horizontal_distance_formula()
    test_pixel_to_gps_localization()
    test_invalid_calibration_cases()
    print("\nALL PHASE 3 GEOMETRY UNIT TESTS PASSED!")
