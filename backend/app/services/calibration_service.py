"""
Calibration Service (Phase 3: Deterministic Geometric Calibration)
==================================================================

Computes, validates, persists, and utilizes camera-specific geometric
calibrations using:
- Planar homography (OpenCV RANSAC / least-squares)
- Metric Local Tangent Plane (ENU) coordinate transforms
- Reprojection error and RMSE quality analysis
- Camera intrinsic K matrix and Euler rotation R
- 3D pose estimation / validation (SolvePnP) using pillar TOP/BASE heights
- Single-pixel ground localization and GPS projection
"""

import math
from datetime import datetime, timezone
import numpy as np
from typing import Optional, Dict, Any, List
from sqlalchemy.orm import Session

from app.models.camera import Camera
from app.models.pillar import ReferencePillar, PillarImagePoint
from app.models.calibration import CameraCalibration
from app.schemas.calibration import (
    CameraCalibrationRead,
    CameraCalibrationCreate,
    CalibrationCalculationRequest,
    CalibrationCalculationResponse,
    PixelLocalizationResponse,
    PixelCoordinates,
    LocalPosition,
    GPSCoordinates,
    RayGroundVerification,
    PointReprojectionError,
)
from app.services.camera_service import CameraService
from app.services.pillar_service import PillarService
from app.core.exceptions import EntityNotFoundException

from app.geometry.coordinate_transform import (
    gps_to_local_enu,
    local_enu_to_gps,
    horizontal_distance,
)
from app.geometry.homography import (
    calculate_homography,
    project_pixel_to_ground,
    project_ground_to_pixel,
    InsufficientPointsException,
    DegeneratePointsException,
)
from app.geometry.reprojection import calculate_reprojection_metrics
from app.geometry.camera_geometry import (
    build_intrinsic_matrix,
    rotation_matrix_from_euler,
    calculate_ray_ground_intersection,
)
from app.geometry.pose_estimation import estimate_camera_pose


def utc_now():
    return datetime.now(timezone.utc)


class CalibrationService:
    @staticmethod
    def get_latest_calibration_record(db: Session, camera_identifier: str) -> Optional[CameraCalibration]:
        """Fetches raw CameraCalibration model instance for a camera."""
        camera = CameraService.get_by_identifier(db, camera_identifier)
        return (
            db.query(CameraCalibration)
            .filter(CameraCalibration.camera_id == camera.id)
            .order_by(CameraCalibration.created_at.desc())
            .first()
        )

    @staticmethod
    def get_latest_calibration(db: Session, camera_identifier: str) -> Optional[CameraCalibrationRead]:
        """Phase 1 compatible read schema."""
        cal = CalibrationService.get_latest_calibration_record(db, camera_identifier)
        if not cal:
            return None
        return CameraCalibrationRead.model_validate(cal)

    @staticmethod
    def register_calibration_record(
        db: Session, camera_identifier: str, payload: CameraCalibrationCreate
    ) -> CameraCalibrationRead:
        """Phase 1 compatibility endpoint for manual record insertion."""
        camera = CameraService.get_by_identifier(db, camera_identifier)
        cal = CameraCalibration(
            camera_id=camera.id,
            calibration_status=payload.calibration_status,
            calibration_data=payload.calibration_data,
            calibration_error=payload.calibration_error,
            calibrated_at=utc_now() if payload.calibration_status == "calibrated" else None,
        )
        db.add(cal)
        db.commit()
        db.refresh(cal)
        return CameraCalibrationRead.model_validate(cal)

    @staticmethod
    def calculate_calibration(
        db: Session, camera_identifier: str, req: CalibrationCalculationRequest
    ) -> CalibrationCalculationResponse:
        """
        Executes complete Phase 3 deterministic geometric calibration pipeline:
        1. Updates camera parameters (latitude, longitude, height, yaw, pitch, roll) if provided.
        2. Gathers reference pillar BASE points and maps them to local ground metric coordinates (X, Y).
        3. Validates non-collinearity and point count (min 4, recommended 5-8).
        4. Calculates homography H (pixel -> ground) and H_inv.
        5. Calculates reprojection error and RMSE.
        6. If 3D TOP points exist, performs SolvePnP camera pose validation.
        7. Persists calibration to database for this specific camera.
        """
        camera = CameraService.get_by_identifier(db, camera_identifier)

        # 1. Update camera position / orientation metadata if provided in request
        if req.camera_height is not None:
            camera.height = req.camera_height
        if req.camera_latitude is not None:
            camera.latitude = req.camera_latitude
        if req.camera_longitude is not None:
            camera.longitude = req.camera_longitude
        if req.yaw is not None:
            camera.yaw = req.yaw
        if req.pitch is not None:
            camera.pitch = req.pitch
        if req.roll is not None:
            camera.roll = req.roll

        cam_lat = camera.latitude or 32.7161
        cam_lon = camera.longitude or 74.8562
        cam_h = camera.height or 5.0

        # 2. Collect Reference Pillars & Image Points
        pillars = PillarService.list_by_camera(db, camera.camera_id)

        image_points = []
        ground_points = []
        ref_data_list = []

        # Also collect 3D points for pose estimation (TOP and BASE)
        object_pts_3d = []
        image_pts_3d = []

        for p in pillars:
            base_pt = next((pt for pt in p.image_points if pt.point_type == "BASE"), None)
            top_pt = next((pt for pt in p.image_points if pt.point_type == "TOP"), None)

            if not base_pt:
                continue

            # Determine local ground metric position (X Easting, Y Northing in meters)
            if p.latitude is not None and p.longitude is not None:
                # Use GPS -> Local Tangent Plane (ENU)
                gx, gy, _ = gps_to_local_enu(p.latitude, p.longitude, cam_lat, cam_lon)
            elif p.x_distance is not None and p.y_distance is not None:
                # Use local physical distance measurements
                gx = float(p.x_distance)
                gy = float(p.y_distance)
            else:
                # Skip if neither GPS nor local distance is available
                continue

            u = float(base_pt.pixel_x)
            v = float(base_pt.pixel_y)

            image_points.append((u, v))
            ground_points.append((gx, gy))

            ref_data_list.append({
                "pillar_id": p.pillar_id,
                "name": p.name,
                "pixel_x": u,
                "pixel_y": v,
                "ground_x": gx,
                "ground_y": gy,
            })

            # 3D points for pose validation
            object_pts_3d.append((gx, gy, 0.0))
            image_pts_3d.append((u, v))

            if top_pt:
                p_height = p.height or 2.0
                object_pts_3d.append((gx, gy, p_height))
                image_pts_3d.append((float(top_pt.pixel_x), float(top_pt.pixel_y)))

        n_pts = len(image_points)
        if n_pts < 4:
            raise InsufficientPointsException(
                f"Minimum 4 reference pillars with BASE points required for homography calibration. "
                f"Currently configured: {n_pts}."
            )
        if n_pts > 4:
            raise ValueError(
                f"Maximum of 4 reference pillars allowed for calibration. "
                f"Currently configured: {n_pts}."
            )

        # 3. Calculate Homography
        H, H_inv, h_meta = calculate_homography(image_points, ground_points, use_ransac=True)

        # 4. Calculate Reprojection Error & Quality Metrics
        quality = calculate_reprojection_metrics(H, H_inv, ref_data_list, rmse_valid_threshold=2.0)

        # 5. Build Intrinsic Matrix & SolvePnP Pose Validation
        img_w = req.image_width or 1280
        img_h = req.image_height or 720
        K = build_intrinsic_matrix(img_w, img_h, hfov_deg=req.hfov, vfov_deg=req.vfov)

        pose_result = estimate_camera_pose(object_pts_3d, image_pts_3d, K)

        # 6. Save Calibration Record to Database
        cal_status = "calibrated" if quality["is_valid"] else "degraded"
        camera.status = cal_status

        point_errors_models = [
            PointReprojectionError(**pt) for pt in quality["point_errors"]
        ]

        cal_record = CameraCalibration(
            camera_id=camera.id,
            calibration_status=cal_status,
            is_valid=1 if quality["is_valid"] else 0,
            camera_latitude=cam_lat,
            camera_longitude=cam_lon,
            camera_height=cam_h,
            yaw=camera.yaw,
            pitch=camera.pitch,
            roll=camera.roll,
            image_width=img_w,
            image_height=img_h,
            hfov=req.hfov or 65.0,
            vfov=req.vfov,
            intrinsic_k=K.tolist(),
            h_matrix=H.tolist(),
            h_inv_matrix=H_inv.tolist(),
            local_origin_lat=cam_lat,
            local_origin_lon=cam_lon,
            local_origin_alt=cam_h,
            reprojection_error_mean=quality["mean_error"],
            reprojection_error_rmse=quality["rmse"],
            reprojection_error_max=quality["max_error"],
            num_reference_points=n_pts,
            point_errors=quality["point_errors"],
            pose_estimation_status=pose_result.get("pose_status", "none"),
            pose_data=pose_result,
            calibration_data={
                "h_matrix": H.tolist(),
                "h_inv_matrix": H_inv.tolist(),
                "method": h_meta.get("method"),
                "inliers": h_meta.get("inliers"),
            },
            calibration_error={
                "mean_error": quality["mean_error"],
                "rmse": quality["rmse"],
                "max_error": quality["max_error"],
            },
            calibrated_at=utc_now(),
        )

        db.add(cal_record)
        db.commit()
        db.refresh(cal_record)

        return CalibrationCalculationResponse(
            success=True,
            camera_id=camera.camera_id,
            calibration_status=cal_status,
            is_valid=quality["is_valid"],
            h_matrix=H.tolist(),
            num_reference_points=n_pts,
            reprojection_error_mean=quality["mean_error"],
            reprojection_error_rmse=quality["rmse"],
            reprojection_error_max=quality["max_error"],
            highest_error_pillar=quality.get("highest_error_pillar"),
            highest_error_meters=quality.get("highest_error_meters"),
            point_errors=point_errors_models,
            pose_estimation_status=pose_result.get("pose_status", "unknown"),
            pose_summary=pose_result,
            local_origin={"latitude": cam_lat, "longitude": cam_lon, "height": cam_h},
            message=f"Geometric calibration computed successfully with {n_pts} reference pillars. RMSE: {quality['rmse']}m.",
        )

    @staticmethod
    def localize_pixel(
        db: Session, camera_identifier: str, pixel_x: float, pixel_y: float
    ) -> PixelLocalizationResponse:
        """
        Transforms a pixel coordinate (u, v) into a real-world ground position and WGS84 GPS coordinate:
        Pixel (u, v) -> Homography H -> Local Ground (X_East, Y_North) -> GPS (Lat, Lon).
        Also performs camera ray-ground plane intersection validation if height/pitch is available.
        """
        camera = CameraService.get_by_identifier(db, camera_identifier)
        cal = (
            db.query(CameraCalibration)
            .filter(CameraCalibration.camera_id == camera.id)
            .filter(CameraCalibration.h_matrix.isnot(None))
            .order_by(CameraCalibration.created_at.desc())
            .first()
        )

        if not cal or not cal.h_matrix:
            raise ValueError(
                f"Camera '{camera.camera_id}' has not been calibrated. "
                "Please configure at least 4 reference pillars and calculate calibration first."
            )

        H = np.array(cal.h_matrix, dtype=np.float64)

        # 1. Project Pixel to Local Ground Plane (X meters East, Y meters North)
        gx, gy = project_pixel_to_ground(H, pixel_x, pixel_y)

        # Distance from camera optical plumb line
        distance_m = round(horizontal_distance(gx, gy), 2)

        # 2. Local Ground (X, Y) -> WGS84 GPS (Latitude, Longitude)
        origin_lat = cal.local_origin_lat or camera.latitude or 32.7161
        origin_lon = cal.local_origin_lon or camera.longitude or 74.8562

        target_lat, target_lon, _ = local_enu_to_gps(gx, gy, origin_lat, origin_lon)

        # 3. Ray-Ground Intersection Validation (if height and orientation available)
        ray_verification = None
        if cal.camera_height and cal.camera_height > 0 and cal.intrinsic_k is not None:
            try:
                K = np.array(cal.intrinsic_k, dtype=np.float64)
                yaw = cal.yaw or camera.yaw or 0.0
                pitch = cal.pitch or camera.pitch or -15.0
                roll = cal.roll or camera.roll or 0.0

                R_cam2world = rotation_matrix_from_euler(yaw, pitch, roll)
                ray_x, ray_y, ray_meta = calculate_ray_ground_intersection(
                    pixel_x, pixel_y, K, R_cam2world, camera_height=cal.camera_height
                )

                if ray_x is not None and ray_y is not None:
                    discrepancy = round(math.hypot(ray_x - gx, ray_y - gy), 2)
                    ray_verification = RayGroundVerification(
                        ground_x=ray_x,
                        ground_y=ray_y,
                        distance_discrepancy_m=discrepancy,
                        ray_elevation_angle_deg=ray_meta.get("ray_elevation_deg", 0.0),
                    )
            except Exception:
                ray_verification = None

        return PixelLocalizationResponse(
            camera_id=camera.camera_id,
            pixel=PixelCoordinates(pixel_x=pixel_x, pixel_y=pixel_y),
            local_position=LocalPosition(x=gx, y=gy, z=0.0),
            distance_m=distance_m,
            gps=GPSCoordinates(latitude=target_lat, longitude=target_lon),
            ray_verification=ray_verification,
            calibration_status=cal.calibration_status,
        )

    @staticmethod
    def get_full_calibration_details(db: Session, camera_identifier: str) -> Dict[str, Any]:
        """Provides full calibration report for the Calibration UI."""
        camera = CameraService.get_by_identifier(db, camera_identifier)
        cal = (
            db.query(CameraCalibration)
            .filter(CameraCalibration.camera_id == camera.id)
            .order_by(CameraCalibration.created_at.desc())
            .first()
        )
        pillars = PillarService.list_by_camera(db, camera.camera_id)

        num_base_points = sum(
            1 for p in pillars if any(pt.point_type == "BASE" for pt in p.image_points)
        )
        num_top_points = sum(
            1 for p in pillars if any(pt.point_type == "TOP" for pt in p.image_points)
        )

        highest_error_pillar = None
        highest_error_meters = None
        if cal and cal.point_errors:
            try:
                worst = max(cal.point_errors, key=lambda x: x.get("error_meters", 0.0))
                highest_error_pillar = worst.get("pillar_id")
                highest_error_meters = worst.get("error_meters")
            except Exception:
                pass

        return {
            "camera_id": camera.camera_id,
            "name": camera.name,
            "camera_latitude": camera.latitude,
            "camera_longitude": camera.longitude,
            "camera_height": camera.height,
            "yaw": camera.yaw,
            "pitch": camera.pitch,
            "roll": camera.roll,
            "calibration_status": cal.calibration_status if cal else "uncalibrated",
            "is_valid": bool(cal.is_valid) if cal else False,
            "calibrated_at": cal.calibrated_at if cal else None,
            "h_matrix": cal.h_matrix if cal else None,
            "h_inv_matrix": cal.h_inv_matrix if cal else None,
            "reprojection_error_mean": cal.reprojection_error_mean if cal else None,
            "reprojection_error_rmse": cal.reprojection_error_rmse if cal else None,
            "reprojection_error_max": cal.reprojection_error_max if cal else None,
            "highest_error_pillar": highest_error_pillar,
            "highest_error_meters": highest_error_meters,
            "num_reference_points": cal.num_reference_points if cal else 0,
            "point_errors": cal.point_errors if cal else [],
            "pose_estimation_status": cal.pose_estimation_status if cal else "none",
            "pose_data": cal.pose_data if cal else None,
            "reference_pillar_count": len(pillars),
            "num_base_points": num_base_points,
            "num_top_points": num_top_points,
            "has_minimum_points": num_base_points >= 4,
        }
