"""
Integration Tests for Phase 3 Geometric Calibration & Real Localization
========================================================================

Verifies:
1. Camera creation with physical parameters (height, yaw, pitch, roll)
2. Reference pillar creation and maximum 4 pillars constraint enforcement
3. Pillar BASE (ground) and TOP image coordinate registration
4. Planar homography calculation, reprojection error, and highest-error pillar identification
5. Camera calibration isolation (CAM_002 does not inherit CAM_001)
6. Live intrusion event localization (/api/localization/event) returning real GPS, distance, bearing
7. Two-frame motion calculation (/api/localization/motion) returning speed, displacement, direction
"""

import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_full_calibration_pipeline():
    cam_id = "CAM_TEST_CALIB"

    # Clean up if existed
    client.delete(f"/api/cameras/{cam_id}")

    # 1. Create camera with height and orientation
    res = client.post("/api/cameras", json={
        "camera_id": cam_id,
        "name": "Perimeter Calibration Test Camera",
        "latitude": 32.716100,
        "longitude": 74.856200,
        "height": 5.0,
        "yaw": 0.0,
        "pitch": -20.0,
        "roll": 0.0,
    })
    assert res.status_code == 201

    # 2. Add 4 reference pillars with BASE and TOP points (P1..P4)
    # Ground coordinates relative to camera (0, 0):
    # P1: (-15, 20), P2: (15, 20), P3: (25, 50), P4: (-25, 50)
    pillars_data = [
        {"pillar_id": "P1", "name": "Pillar 1", "x_dist": -15.0, "y_dist": 20.0, "height": 2.5, "px": 350.0, "py": 600.0},
        {"pillar_id": "P2", "name": "Pillar 2", "x_dist": 15.0, "y_dist": 20.0, "height": 2.5, "px": 930.0, "py": 600.0},
        {"pillar_id": "P3", "name": "Pillar 3", "x_dist": 25.0, "y_dist": 50.0, "height": 2.5, "px": 800.0, "py": 380.0},
        {"pillar_id": "P4", "name": "Pillar 4", "x_dist": -25.0, "y_dist": 50.0, "height": 2.5, "px": 480.0, "py": 380.0},
    ]

    for p in pillars_data:
        p_res = client.post(f"/api/cameras/{cam_id}/pillars", json={
            "pillar_id": p["pillar_id"],
            "name": p["name"],
            "height": p["height"],
            "x_distance": p["x_dist"],
            "y_distance": p["y_dist"],
        })
        assert p_res.status_code == 201, p_res.text
        pillar_db_id = p_res.json()["id"]

        # Record BASE point
        b_res = client.post(f"/api/pillars/{pillar_db_id}/points", json={
            "point_type": "BASE",
            "pixel_x": p["px"],
            "pixel_y": p["py"],
            "real_z": 0.0,
        })
        assert b_res.status_code == 201

        # Record TOP point
        t_res = client.post(f"/api/pillars/{pillar_db_id}/points", json={
            "point_type": "TOP",
            "pixel_x": p["px"],
            "pixel_y": p["py"] - 70.0,
            "real_z": p["height"],
        })
        assert t_res.status_code == 201

    # Verify 5th pillar is strictly REJECTED (max 4 reference pillars rule)
    p5_res = client.post(f"/api/cameras/{cam_id}/pillars", json={
        "pillar_id": "P5",
        "name": "Excess Pillar 5",
        "height": 2.5,
        "x_distance": 0.0,
        "y_distance": 35.0,
    })
    assert p5_res.status_code == 409, "5th reference pillar must be rejected"
    print("PASS: Maximum 4 reference pillars constraint correctly enforced (409 Conflict on 5th pillar)")

    # 3. Calculate Calibration
    calc_res = client.post(f"/api/calibration/{cam_id}/calculate", json={
        "camera_height": 5.0,
        "camera_latitude": 32.7161,
        "camera_longitude": 74.8562,
        "yaw": 0.0,
        "pitch": -20.0,
        "roll": 0.0,
        "image_width": 1280,
        "image_height": 720,
    })
    assert calc_res.status_code == 200, calc_res.text
    calc_json = calc_res.json()

    assert calc_json["success"] is True
    assert calc_json["calibration_status"] == "calibrated"
    assert calc_json["num_reference_points"] == 4
    assert calc_json["h_matrix"] is not None
    assert len(calc_json["h_matrix"]) == 3
    assert len(calc_json["point_errors"]) == 4
    assert calc_json["highest_error_pillar"] is not None
    assert calc_json["highest_error_meters"] is not None
    print(f"PASS: Calibration calculation succeeded (RMSE: {calc_json['reprojection_error_rmse']}m, Highest Error Pillar: {calc_json['highest_error_pillar']})")

    # 4. Get Calibration Details
    res_details = client.get(f"/api/calibration/{cam_id}")
    assert res_details.status_code == 200
    details_json = res_details.json()
    assert details_json["calibration_status"] == "calibrated"
    assert details_json["has_minimum_points"] is True
    assert details_json["highest_error_pillar"] is not None
    print("PASS: Calibration details retrieved with highest-error pillar")

    # 5. Localize Pixel directly
    loc_res = client.post(f"/api/calibration/{cam_id}/localize", json={
        "pixel_x": 640.0,
        "pixel_y": 490.0,
    })
    assert loc_res.status_code == 200, loc_res.text
    loc_json = loc_res.json()
    assert loc_json["camera_id"] == cam_id
    assert loc_json["distance_m"] > 10.0
    assert loc_json["gps"]["latitude"] > 32.0
    assert loc_json["gps"]["longitude"] > 74.0
    print(f"PASS: Direct pixel localization (640, 490) -> Ground: ({loc_json['local_position']['x']}m, {loc_json['local_position']['y']}m), GPS: {loc_json['gps']}")

    # 6. Test Live Intrusion Event Endpoint (/api/localization/event)
    event_payload = {
        "camera_id": cam_id,
        "object_id": "INTRUDER_TEST_01",
        "timestamp": "2026-10-03T12:00:00Z",
        "pixel_x": 640.0,
        "pixel_y": 490.0,
    }
    event_res = client.post("/api/localization/event", json=event_payload)
    assert event_res.status_code == 200, event_res.text
    ev_json = event_res.json()

    assert ev_json["status"] == "calibrated"
    assert ev_json["camera_id"] == cam_id
    assert ev_json["local_position"]["east_m"] is not None
    assert ev_json["local_position"]["north_m"] is not None
    assert ev_json["horizontal_distance_m"] > 0
    assert 0.0 <= ev_json["bearing_deg"] <= 360.0
    assert ev_json["gps"]["latitude"] is not None
    assert ev_json["gps"]["longitude"] is not None
    assert abs(ev_json["gps"]["latitude"] - 32.7161) < 0.05
    print(f"PASS: Intrusion event endpoint returns real GPS: ({ev_json['gps']['latitude']}, {ev_json['gps']['longitude']}), Distance: {ev_json['horizontal_distance_m']}m, Bearing: {ev_json['bearing_deg']}°")

    # 7. Test Two-Frame Motion Calculation (/api/localization/motion)
    motion_payload = {
        "camera_id": cam_id,
        "frame_1": {
            "timestamp": "2026-10-03T12:00:00Z",
            "pixel_x": 600.0,
            "pixel_y": 520.0,
        },
        "frame_2": {
            "timestamp": "2026-10-03T12:00:02.5Z",
            "pixel_x": 650.0,
            "pixel_y": 460.0,
        },
    }
    mot_res = client.post("/api/localization/motion", json=motion_payload)
    assert mot_res.status_code == 200, mot_res.text
    mot_json = mot_res.json()

    assert mot_json["displacement"]["distance_travelled_m"] > 0
    assert mot_json["time_interval_s"] == 2.5
    assert mot_json["speed"]["mps"] > 0
    assert mot_json["speed"]["kmh"] > 0
    assert 0.0 <= mot_json["movement_direction_deg"] <= 360.0
    assert "No acceleration or 3D distance" in mot_json["note"]
    print(f"PASS: Two-frame motion computed: Distance {mot_json['displacement']['distance_travelled_m']}m, Speed {mot_json['speed']['kmh']} km/h, Direction {mot_json['movement_direction_deg']}°")

    # 8. Test Camera Isolation: Create second camera and verify it does NOT inherit CAM_TEST_CALIB calibration
    cam_id_2 = "CAM_TEST_CALIB_2"
    client.post("/api/cameras", json={
        "camera_id": cam_id_2,
        "name": "Second Independent Cam",
        "latitude": 32.7161,
        "longitude": 74.8562,
    })
    res_2 = client.get(f"/api/calibration/{cam_id_2}")
    assert res_2.status_code == 200
    details_2 = res_2.json()
    assert details_2["calibration_status"] == "uncalibrated"
    assert details_2["h_matrix"] is None
    print("PASS: Camera calibration isolation confirmed (CAM_TEST_CALIB_2 is uncalibrated)")

    # Clean up test cameras
    client.delete(f"/api/cameras/{cam_id}")
    client.delete(f"/api/cameras/{cam_id_2}")
    print("PASS: Cleanup completed")


if __name__ == "__main__":
    print("Running Phase 3 Calibration API Integration Tests...")
    test_full_calibration_pipeline()
    print("\nALL PHASE 3 CALIBRATION API TESTS PASSED!")
