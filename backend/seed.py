import os
import sys

sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

from app.database import Base, engine, SessionLocal, init_db
import app.models  # ensure models registered
from app.models.camera import Camera
from app.models.pillar import ReferencePillar, PillarImagePoint
from app.models.calibration import CameraCalibration
from app.geometry.coordinate_transform import local_enu_to_gps


def seed_database():
    init_db()
    db = SessionLocal()
    try:
        if "--reset" in sys.argv:
            print("Resetting database records...")
            db.query(PillarImagePoint).delete()
            db.query(ReferencePillar).delete()
            db.query(CameraCalibration).delete()
            db.query(Camera).delete()
            db.commit()
        elif db.query(Camera).count() > 0:
            print("Database already contains camera records. Skipping initial seeding. (Use --reset to re-seed)")
            return

        # =========================================================================
        # Camera 1: Sector Alpha (CAM_SEC_001)
        # =========================================================================
        cam1_lat = 32.716100
        cam1_lon = 74.856200
        cam1 = Camera(
            camera_id="CAM_SEC_001",
            name="Alpha Sector - Perimeter Mast 04",
            description="High-definition fixed optical surveillance camera monitoring border sector Alpha-4.",
            latitude=cam1_lat,
            longitude=cam1_lon,
            height=5.5,
            yaw=0.0,
            pitch=-18.0,
            roll=0.0,
            status="uncalibrated",
        )
        db.add(cam1)
        db.flush()

        # 4 Reference Pillars for CAM_SEC_001 (P1, P2, P3, P4)
        cam1_pillars = [
            {"id": "P1", "name": "Sector Demarcation Post 1", "x": -20.0, "y": 25.0, "h": 2.5, "bx": 360.0, "by": 580.0, "tx": 360.0, "ty": 480.0},
            {"id": "P2", "name": "Sector Demarcation Post 2", "x": 20.0, "y": 25.0, "h": 2.5, "bx": 920.0, "by": 580.0, "tx": 920.0, "ty": 480.0},
            {"id": "P3", "name": "Perimeter Anchor Pylon 3", "x": 30.0, "y": 55.0, "h": 2.8, "bx": 820.0, "by": 390.0, "tx": 820.0, "ty": 320.0},
            {"id": "P4", "name": "Perimeter Anchor Pylon 4", "x": -30.0, "y": 55.0, "h": 2.8, "bx": 460.0, "by": 390.0, "tx": 460.0, "ty": 320.0},
        ]

        for p_info in cam1_pillars:
            plat, plon, _ = local_enu_to_gps(p_info["x"], p_info["y"], cam1_lat, cam1_lon)
            pillar = ReferencePillar(
                camera_id=cam1.id,
                pillar_id=p_info["id"],
                name=p_info["name"],
                latitude=plat,
                longitude=plon,
                height=p_info["h"],
                x_distance=p_info["x"],
                y_distance=p_info["y"],
            )
            db.add(pillar)
            db.flush()

            pt_base = PillarImagePoint(
                pillar_id=pillar.id,
                point_type="BASE",
                pixel_x=p_info["bx"],
                pixel_y=p_info["by"],
                real_z=0.0,
            )
            pt_top = PillarImagePoint(
                pillar_id=pillar.id,
                point_type="TOP",
                pixel_x=p_info["tx"],
                pixel_y=p_info["ty"],
                real_z=p_info["h"],
            )
            db.add_all([pt_base, pt_top])

        # =========================================================================
        # Camera 2: Sector Bravo (CAM_SEC_002)
        # =========================================================================
        cam2_lat = 32.721450
        cam2_lon = 74.863120
        cam2 = Camera(
            camera_id="CAM_SEC_002",
            name="Bravo Sector - Tower Sensor 09",
            description="Stationary visual sensor installed on watchtower B9. Covers riverbank perimeter.",
            latitude=cam2_lat,
            longitude=cam2_lon,
            height=7.0,
            yaw=45.0,
            pitch=-15.0,
            roll=0.0,
            status="uncalibrated",
        )
        db.add(cam2)
        db.flush()

        cam2_pillars = [
            {"id": "BP_201", "name": "River Marker 201", "x": -15.0, "y": 30.0, "h": 2.5, "bx": 420.0, "by": 550.0, "tx": 420.0, "ty": 460.0},
            {"id": "BP_202", "name": "River Marker 202", "x": 15.0, "y": 30.0, "h": 2.5, "bx": 860.0, "by": 550.0, "tx": 860.0, "ty": 460.0},
            {"id": "BP_203", "name": "River Marker 203", "x": 25.0, "y": 60.0, "h": 2.5, "bx": 760.0, "by": 380.0, "tx": 760.0, "ty": 310.0},
            {"id": "BP_204", "name": "River Marker 204", "x": -25.0, "y": 60.0, "h": 2.5, "bx": 520.0, "by": 380.0, "tx": 520.0, "ty": 310.0},
        ]

        for p_info in cam2_pillars:
            plat, plon, _ = local_enu_to_gps(p_info["x"], p_info["y"], cam2_lat, cam2_lon)
            pillar = ReferencePillar(
                camera_id=cam2.id,
                pillar_id=p_info["id"],
                name=p_info["name"],
                latitude=plat,
                longitude=plon,
                height=p_info["h"],
                x_distance=p_info["x"],
                y_distance=p_info["y"],
            )
            db.add(pillar)
            db.flush()

            pt_base = PillarImagePoint(
                pillar_id=pillar.id,
                point_type="BASE",
                pixel_x=p_info["bx"],
                pixel_y=p_info["by"],
                real_z=0.0,
            )
            pt_top = PillarImagePoint(
                pillar_id=pillar.id,
                point_type="TOP",
                pixel_x=p_info["tx"],
                pixel_y=p_info["ty"],
                real_z=p_info["h"],
            )
            db.add_all([pt_base, pt_top])

        # =========================================================================
        # Camera 3: Charlie Sector (CAM_SEC_003)
        # =========================================================================
        cam3 = Camera(
            camera_id="CAM_SEC_003",
            name="Charlie Sector - Road Checkpoint Mast",
            description="Border crossing approach monitoring sensor. Fixed position atop concrete pylon.",
            latitude=32.730100,
            longitude=74.871500,
            height=5.0,
            status="uncalibrated",
        )
        db.add(cam3)

        db.commit()
        print("Database seeded successfully with initial border surveillance cameras and reference pillars!")
    except Exception as e:
        db.rollback()
        print(f"Error during seeding: {e}")
        raise e
    finally:
        db.close()


if __name__ == "__main__":
    seed_database()
