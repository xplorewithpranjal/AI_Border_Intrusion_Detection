"""
Phase 3B — Intrusion Localization & Motion Analysis Integration Tests
=====================================================================

Validates all 14 required Phase 3B capabilities:
1. Localization API
2. Saved calibration loading
3. Pixel -> localization integration
4. GPS output
5. Horizontal distance output
6. Absolute bearing output (Earth-referenced 0=N, 90=E, 180=S, 270=W)
7. Two-frame displacement
8. Movement direction
9. Time difference
10. Speed (m/s and km/h)
11. Invalid camera (404)
12. Missing calibration (400)
13. Invalid timestamp (422)
14. Invalid pixel coordinates (422)
Bonus:
15. Configurable time interval evaluation (Part 8)
16. Real-value error testing & ground truth evaluation (Part 7)
"""

import sys
import os
import math
from datetime import datetime

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def setup_calibrated_camera(cam_id: str):
    """Helper to register and calibrate a test camera with 4 reference pillars."""
    client.delete(f"/api/cameras/{cam_id}")

    # Create camera
    client.post("/api/cameras", json={
        "camera_id": cam_id,
        "name": f"Test Surveillance Sensor {cam_id}",
        "latitude": 32.716100,
        "longitude": 74.856200,
        "height": 5.0,
        "yaw": 0.0,
        "pitch": -20.0,
        "roll": 0.0,
    })

    # Add 4 pillars
    pillars = [
        {"id": "P1", "name": "Pillar 1", "x": -15.0, "y": 20.0, "h": 2.5, "px": 350.0, "py": 600.0},
        {"id": "P2", "name": "Pillar 2", "x": 15.0, "y": 20.0, "h": 2.5, "px": 930.0, "py": 600.0},
        {"id": "P3", "name": "Pillar 3", "x": 25.0, "y": 50.0, "h": 2.5, "px": 800.0, "py": 380.0},
        {"id": "P4", "name": "Pillar 4", "x": -25.0, "y": 50.0, "h": 2.5, "px": 480.0, "py": 380.0},
    ]

    for p in pillars:
        p_res = client.post(f"/api/cameras/{cam_id}/pillars", json={
            "pillar_id": p["id"],
            "name": p["name"],
            "height": p["h"],
            "x_distance": p["x"],
            "y_distance": p["y"],
        })
        p_id = p_res.json()["id"]

        client.post(f"/api/pillars/{p_id}/points", json={
            "point_type": "BASE",
            "pixel_x": p["px"],
            "pixel_y": p["py"],
            "real_z": 0.0,
        })
        client.post(f"/api/pillars/{p_id}/points", json={
            "point_type": "TOP",
            "pixel_x": p["px"],
            "pixel_y": p["py"] - 70.0,
            "real_z": p["h"],
        })

    # Calculate calibration
    c_res = client.post(f"/api/calibration/{cam_id}/calculate", json={
        "camera_height": 5.0,
        "camera_latitude": 32.7161,
        "camera_longitude": 74.8562,
    })
    assert c_res.status_code == 200


def test_phase3b_suite():
    cam_id = "CAM_TEST_P3B"
    uncal_cam_id = "CAM_TEST_UNCAL"

    print("\n--- [Phase 3B Test Suite] Setting up test cameras ---")
    setup_calibrated_camera(cam_id)

    # Setup uncalibrated camera
    client.delete(f"/api/cameras/{uncal_cam_id}")
    client.post("/api/cameras", json={
        "camera_id": uncal_cam_id,
        "name": "Uncalibrated Camera",
        "latitude": 32.7161,
        "longitude": 74.8562,
    })

    # =========================================================================
    # Test 1 & 2: Localization API & Saved Calibration Loading
    # =========================================================================
    res = client.post("/api/intrusion/event", json={
        "camera_id": cam_id,
        "frame_id": "frame_001",
        "timestamp": "2026-10-04T12:00:00Z",
        "pixel_x": 640.0,
        "pixel_y": 490.0,
    })
    assert res.status_code == 200, res.text
    data = res.json()
    print("PASS 1: Localization API successfully called (/api/intrusion/event)")
    print("PASS 2: Saved camera calibration successfully loaded and utilized")

    # =========================================================================
    # Test 3 & 4: Pixel -> Localization Integration & GPS Output
    # =========================================================================
    assert data["camera_id"] == cam_id
    assert data["frame_id"] == "frame_001"
    assert data["pixel"]["x"] == 640.0
    assert data["pixel"]["y"] == 490.0
    assert data["gps"]["latitude"] is not None
    assert data["gps"]["longitude"] is not None
    assert abs(data["gps"]["latitude"] - 32.7161) < 0.05
    assert abs(data["gps"]["longitude"] - 74.8562) < 0.05
    print(f"PASS 3: Pixel (640, 490) mapped to ground: E={data['local_position']['east_m']}m, N={data['local_position']['north_m']}m")
    print(f"PASS 4: GPS output generated: Lat={data['gps']['latitude']}, Lon={data['gps']['longitude']}")

    # =========================================================================
    # Test 5 & 6: Horizontal Distance & Absolute Earth Bearing
    # =========================================================================
    assert data["horizontal_distance_m"] > 0
    # Optical center pixel (640, y) on plumb line -> East roughly 0m -> bearing roughly 0 deg (North)
    assert abs(data["bearing_deg"] - 0.0) < 5.0 or abs(data["bearing_deg"] - 360.0) < 5.0
    print(f"PASS 5: Horizontal distance calculated: {data['horizontal_distance_m']}m")
    print(f"PASS 6: Absolute Earth-referenced bearing verified: {data['bearing_deg']}° (North meridian)")

    # =========================================================================
    # Test 7, 8, 9, 10: Two-Frame Displacement, Direction, Time Difference, Speed
    # =========================================================================
    motion_req = {
        "camera_id": cam_id,
        "observation_1": {
            "timestamp": "2026-10-04T12:00:00Z",
            "pixel_x": 600.0,
            "pixel_y": 520.0,
        },
        "observation_2": {
            "timestamp": "2026-10-04T12:00:02.5Z",
            "pixel_x": 650.0,
            "pixel_y": 460.0,
        },
    }
    m_res = client.post("/api/intrusion/motion", json=motion_req)
    assert m_res.status_code == 200, m_res.text
    m_data = m_res.json()

    assert m_data["camera_id"] == cam_id
    assert m_data["observation_1"]["gps"] is not None
    assert m_data["observation_2"]["gps"] is not None

    motion = m_data["motion"]
    assert motion["distance_m"] > 0
    assert motion["time_seconds"] == 2.5
    assert motion["speed_mps"] > 0
    assert abs(motion["speed_kmph"] - (motion["speed_mps"] * 3.6)) < 1e-3
    assert 0.0 <= motion["direction_deg"] <= 360.0

    print(f"PASS 7: Two-frame ground displacement calculated: {motion['distance_m']}m")
    print(f"PASS 8: Intrusion movement direction calculated: {motion['direction_deg']}°")
    print(f"PASS 9: Observation time difference calculated: {motion['time_seconds']}s")
    print(f"PASS 10: Ground speed calculated: {motion['speed_mps']} m/s ({motion['speed_kmph']} km/h)")

    # =========================================================================
    # Test 11: Invalid Camera (404)
    # =========================================================================
    err_cam = client.post("/api/intrusion/event", json={
        "camera_id": "NON_EXISTENT_CAM_999",
        "frame_id": "frame_001",
        "timestamp": "2026-10-04T12:00:00Z",
        "pixel_x": 640.0,
        "pixel_y": 480.0,
    })
    assert err_cam.status_code == 404
    assert "not found" in err_cam.json()["detail"].lower()
    print("PASS 11: Unknown camera correctly returns 404 Not Found")

    # =========================================================================
    # Test 12: Missing Calibration (400)
    # =========================================================================
    err_cal = client.post("/api/intrusion/event", json={
        "camera_id": uncal_cam_id,
        "frame_id": "frame_001",
        "timestamp": "2026-10-04T12:00:00Z",
        "pixel_x": 640.0,
        "pixel_y": 480.0,
    })
    assert err_cal.status_code == 400
    assert "not been calibrated" in err_cal.json()["detail"].lower()
    print("PASS 12: Missing calibration correctly returns 400 Bad Request")

    # =========================================================================
    # Test 13: Invalid Timestamp (422)
    # =========================================================================
    err_ts = client.post("/api/intrusion/event", json={
        "camera_id": cam_id,
        "frame_id": "frame_001",
        "timestamp": "NOT_A_VALID_DATE_OR_NUMBER",
        "pixel_x": 640.0,
        "pixel_y": 480.0,
    })
    assert err_ts.status_code == 422
    print("PASS 13: Malformed timestamp correctly returns 422 Unprocessable Entity")

    # =========================================================================
    # Test 14: Invalid Pixel Coordinates (422)
    # =========================================================================
    err_px = client.post("/api/intrusion/event", json={
        "camera_id": cam_id,
        "frame_id": "frame_001",
        "timestamp": "2026-10-04T12:00:00Z",
        "pixel_x": -100.0,
        "pixel_y": 480.0,
    })
    assert err_px.status_code == 422
    print("PASS 14: Negative pixel coordinates correctly return 422 Unprocessable Entity")

    # =========================================================================
    # Test 15: Configurable Time Interval (Part 8)
    # =========================================================================
    client.delete("/api/intrusion/buffer")
    # Send event 1 at t=0
    e1 = client.post("/api/intrusion/event", json={
        "camera_id": cam_id,
        "frame_id": "F_0",
        "timestamp": "2026-10-04T12:00:00.000Z",
        "pixel_x": 600.0,
        "pixel_y": 500.0,
        "interval_s": 1.0,
    }).json()
    assert "motion" not in e1, "First frame should not have motion yet"

    # Send event 2 at t=0.5 (below 1.0s interval)
    e2 = client.post("/api/intrusion/event", json={
        "camera_id": cam_id,
        "frame_id": "F_5",
        "timestamp": "2026-10-04T12:00:00.500Z",
        "pixel_x": 620.0,
        "pixel_y": 480.0,
        "interval_s": 1.0,
    }).json()
    assert "motion" not in e2, "0.5s observation should not trigger 1.0s interval evaluation"

    # Send event 3 at t=1.1 (exceeds 1.0s interval from F_0)
    e3 = client.post("/api/intrusion/event", json={
        "camera_id": cam_id,
        "frame_id": "F_11",
        "timestamp": "2026-10-04T12:00:01.100Z",
        "pixel_x": 640.0,
        "pixel_y": 460.0,
        "interval_s": 1.0,
    }).json()
    assert "motion" in e3, "Observation matching >= 1.0s interval must evaluate motion"
    assert e3["motion"]["speed_mps"] > 0
    print(f"PASS 15: Configurable time interval evaluation verified: evaluated interval {e3['motion']['evaluation_interval_s']}s, speed {e3['motion']['speed_kmh']} km/h")

    # =========================================================================
    # Test 16: Real-Value Error Testing & Ground-Truth (Part 7)
    # =========================================================================
    val_payload = {
        "camera_id": cam_id,
        "instances": [
            {
                "instance_id": "TEST_CASE_1",
                "frame_1": {"pixel_x": 640.0, "pixel_y": 490.0, "timestamp": "2026-10-04T12:00:00Z"},
                "frame_2": {"pixel_x": 660.0, "pixel_y": 450.0, "timestamp": "2026-10-04T12:00:02Z"},
                "actual_values": {
                    "actual_distance_1_m": 27.5,
                    "actual_distance_2_m": 35.0,
                    "actual_bearing_1_deg": 0.0,
                    "actual_bearing_2_deg": 6.0,
                    "actual_movement_distance_m": 8.0,
                    "actual_speed_mps": 4.0,
                    "actual_movement_direction_deg": 25.0,
                },
            },
            {
                "instance_id": "TEST_CASE_2",
                "frame_1": {"pixel_x": 580.0, "pixel_y": 500.0, "timestamp": "2026-10-04T12:00:10Z"},
                "frame_2": {"pixel_x": 620.0, "pixel_y": 470.0, "timestamp": "2026-10-04T12:00:13Z"},
                "actual_values": {
                    "actual_distance_1_m": 26.0,
                    "actual_distance_2_m": 31.0,
                    "actual_movement_distance_m": 7.0,
                    "actual_speed_mps": 2.33,
                },
            },
        ],
    }

    eval_res = client.post("/api/validation/evaluate", json=val_payload)
    assert eval_res.status_code == 200, eval_res.text
    eval_data = eval_res.json()

    assert eval_data["total_instances"] == 2
    assert len(eval_data["instances"]) == 2
    agg = eval_data["aggregate_metrics"]
    assert "distance_error" in agg
    assert "speed_error" in agg
    assert agg["distance_error"]["rmse_m"] is not None
    assert agg["speed_error"]["mean_absolute_error_mps"] is not None
    print(f"PASS 16: Ground-truth real-value error evaluation passed: Distance RMSE={agg['distance_error']['rmse_m']}m, Speed MAE={agg['speed_error']['mean_absolute_error_mps']} m/s")

    # Cleanup test cameras
    client.delete(f"/api/cameras/{cam_id}")
    client.delete(f"/api/cameras/{uncal_cam_id}")
    print("\n--- ALL 16 PHASE 3B INTEGRATION TESTS PASSED SUCCESSFULLY! ---")


if __name__ == "__main__":
    test_phase3b_suite()
