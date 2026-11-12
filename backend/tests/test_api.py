import sys
import os

# Ensure backend root is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from fastapi.testclient import TestClient
from app.main import app
from app.database import Base, engine

# Ensure clean test state
Base.metadata.drop_all(bind=engine)
Base.metadata.create_all(bind=engine)

client = TestClient(app)


def test_health():
    res = client.get("/api/health")
    assert res.status_code == 200, f"Health check failed: {res.text}"
    data = res.json()
    assert data["status"] == "healthy"
    assert data["database_connected"] is True
    print("PASS: Health endpoint check")


def test_camera_crud():
    # 1. Create camera
    new_cam = {
        "camera_id": "CAM_BORDER_01",
        "name": "Northern Sector Alpha",
        "description": "Stationary 4K surveillance camera pointing towards boundary pillar 42",
        "latitude": 32.7157,
        "longitude": 74.8560,
        "height": 5.5,
        "status": "uncalibrated",
    }
    res = client.post("/api/cameras", json=new_cam)
    assert res.status_code == 201, f"Create camera failed: {res.text}"
    cam_data = res.json()
    assert cam_data["camera_id"] == "CAM_BORDER_01"
    assert cam_data["name"] == "Northern Sector Alpha"
    assert cam_data["height"] == 5.5
    assert cam_data["pillar_count"] == 0
    print("PASS: Create camera")

    # 2. List cameras
    res = client.get("/api/cameras")
    assert res.status_code == 200
    cameras = res.json()
    assert len(cameras) >= 1
    assert any(c["camera_id"] == "CAM_BORDER_01" for c in cameras)
    print("PASS: List cameras")

    # 3. Get single camera
    res = client.get("/api/cameras/CAM_BORDER_01")
    assert res.status_code == 200
    cam = res.json()
    assert cam["camera_id"] == "CAM_BORDER_01"
    print("PASS: Get single camera")

    # 4. Update camera
    update_payload = {"name": "Northern Sector Alpha - Refurbished", "height": 6.2}
    res = client.put("/api/cameras/CAM_BORDER_01", json=update_payload)
    assert res.status_code == 200
    updated = res.json()
    assert updated["name"] == "Northern Sector Alpha - Refurbished"
    assert updated["height"] == 6.2
    print("PASS: Update camera")

    # 5. Add reference pillar
    pillar_payload = {
        "pillar_id": "BP_42",
        "name": "Border Pillar 42",
        "latitude": 32.7159,
        "longitude": 74.8562,
        "height": 2.0,
        "x_distance": 25.0,
        "y_distance": 10.0,
    }
    res = client.post("/api/cameras/CAM_BORDER_01/pillars", json=pillar_payload)
    assert res.status_code == 201, f"Pillar creation failed: {res.text}"
    pillar = res.json()
    pillar_id = pillar["id"]
    assert pillar["pillar_id"] == "BP_42"
    print("PASS: Create reference pillar")

    # 6. Add TOP and BASE image points
    res = client.post(
        f"/api/pillars/{pillar_id}/points",
        json={"point_type": "TOP", "pixel_x": 960.5, "pixel_y": 320.0, "real_z": 2.0},
    )
    assert res.status_code == 201, f"Add TOP point failed: {res.text}"

    res = client.post(
        f"/api/pillars/{pillar_id}/points",
        json={"point_type": "BASE", "pixel_x": 961.0, "pixel_y": 740.0, "real_z": 0.0},
    )
    assert res.status_code == 201, f"Add BASE point failed: {res.text}"
    print("PASS: Record TOP and BASE image points")

    # 7. Check camera updated pillar count
    res = client.get("/api/cameras/CAM_BORDER_01")
    assert res.status_code == 200
    cam = res.json()
    assert cam["pillar_count"] == 1
    print("PASS: Camera pillar count reflects recorded pillar")

    # 8. Calibration status placeholder
    res = client.get("/api/cameras/CAM_BORDER_01/calibration")
    assert res.status_code == 200
    cal_data = res.json()
    assert cal_data["reference_pillar_count"] == 1
    assert cal_data["total_recorded_points"] == 2
    assert "Phase 2" in cal_data["phase_note"]
    print("PASS: Calibration architectural contract check")

    # 9. Validation placeholder
    val_payload = {
        "camera_id": "CAM_BORDER_01",
        "point_1": {
            "frame_index": 10,
            "timestamp": "2026-10-02T10:00:00Z",
            "base_pixel_x": 500.0,
            "base_pixel_y": 800.0,
        },
        "point_2": {
            "frame_index": 25,
            "timestamp": "2026-10-02T10:00:05Z",
            "base_pixel_x": 550.0,
            "base_pixel_y": 810.0,
        },
    }
    res = client.post("/api/validation/run", json=val_payload)
    assert res.status_code == 200
    val_res = res.json()
    assert val_res["status"] == "architectural_placeholder"
    assert val_res["predicted_distance_meters"] is None  # honest: no fake math
    assert val_res["time_difference_seconds"] == 5.0
    print("PASS: Validation placeholder check")

    # 10. Localization placeholder
    loc_payload = {
        "camera_id": "CAM_BORDER_01",
        "object_id": "OBJ_INTRUDER_01",
        "timestamp": "2026-10-02T10:00:00Z",
        "base_pixel_x": 420.0,
        "base_pixel_y": 890.0,
    }
    res = client.post("/api/localization/event", json=loc_payload)
    assert res.status_code == 200
    loc_res = res.json()
    assert loc_res["status"] == "architectural_placeholder"
    assert loc_res["gps_latitude"] is None  # honest: no fake math
    print("PASS: Localization event placeholder check")

    # 11. Delete camera
    res = client.delete("/api/cameras/CAM_BORDER_01")
    assert res.status_code == 200
    print("PASS: Delete camera")

    # Verify 404 after delete
    res = client.get("/api/cameras/CAM_BORDER_01")
    assert res.status_code == 404
    print("PASS: Verified camera deleted (404)")


if __name__ == "__main__":
    test_health()
    test_camera_crud()
    print("\nALL BACKEND API TESTS PASSED!")
