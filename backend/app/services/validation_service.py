"""
Ground-Truth Validation & Real-Value Error Testing Service (Phase 3B)
===================================================================

Compares predicted localization and motion metrics against measured
ground-truth values for one or more test instances:
- Absolute error
- Percentage error (where mathematically appropriate: distance, speed)
- Angular error with 0°/360° compass wraparound awareness
- Geodetic GPS displacement error in meters
- Aggregate Mean Error, RMSE, and Maximum Error across multiple instances.

Strictly avoids arbitrary accuracy scores.
"""

import math
from typing import Dict, List, Any, Optional
from sqlalchemy.orm import Session

from app.services.calibration_service import CalibrationService
from app.services.camera_service import CameraService
from app.geometry.motion import calculate_two_frame_motion
from app.geometry.coordinate_transform import gps_to_local_enu


def angular_difference_deg(angle1: float, angle2: float) -> float:
    """Computes minimum circular angular difference between two compass bearings in degrees [0, 180]."""
    diff = abs(angle1 - angle2) % 360.0
    return min(diff, 360.0 - diff)


def compute_rmse(errors: List[float]) -> Optional[float]:
    if not errors:
        return None
    return round(math.sqrt(sum(e ** 2 for e in errors) / len(errors)), 4)


def compute_mae(errors: List[float]) -> Optional[float]:
    if not errors:
        return None
    return round(sum(abs(e) for e in errors) / len(errors), 4)


def compute_max(errors: List[float]) -> Optional[float]:
    if not errors:
        return None
    return round(max(abs(e) for e in errors), 4)


class ValidationService:
    @staticmethod
    def evaluate_test_instance(
        db: Session,
        camera_id: str,
        frame_1_data: Dict[str, Any],
        frame_2_data: Dict[str, Any],
        actual_values: Optional[Dict[str, Any]] = None,
        instance_id: str = "INSTANCE_1",
    ) -> Dict[str, Any]:
        """
        Evaluates a single two-frame observation against actual ground-truth values.
        """
        camera = CameraService.get_by_identifier(db, camera_id)
        cal = CalibrationService.get_latest_calibration_record(db, camera.camera_id)
        if not cal or not cal.h_matrix:
            raise ValueError(f"Camera '{camera.camera_id}' is not calibrated. Geometric calibration required.")

        # Localize Frame 1
        p1_x = frame_1_data.get("pixel_x")
        p1_y = frame_1_data.get("pixel_y")
        if p1_x is not None and p1_y is not None:
            loc1 = CalibrationService.localize_pixel(db, camera.camera_id, float(p1_x), float(p1_y))
            e1, n1 = loc1.local_position.x, loc1.local_position.y
            dist1 = loc1.distance_m
            lat1, lon1 = loc1.gps.latitude, loc1.gps.longitude
            bear1 = (math.degrees(math.atan2(e1, n1)) + 360.0) % 360.0
        elif frame_1_data.get("east_m") is not None and frame_1_data.get("north_m") is not None:
            e1 = float(frame_1_data["east_m"])
            n1 = float(frame_1_data["north_m"])
            dist1 = round(math.hypot(e1, n1), 2)
            bear1 = (math.degrees(math.atan2(e1, n1)) + 360.0) % 360.0
            origin_lat = cal.local_origin_lat or camera.latitude or 32.7161
            origin_lon = cal.local_origin_lon or camera.longitude or 74.8562
            from app.geometry.coordinate_transform import local_enu_to_gps
            lat1, lon1, _ = local_enu_to_gps(e1, n1, origin_lat, origin_lon)
        else:
            raise ValueError("Frame 1 requires either (pixel_x, pixel_y) or (east_m, north_m).")

        # Localize Frame 2
        p2_x = frame_2_data.get("pixel_x")
        p2_y = frame_2_data.get("pixel_y")
        if p2_x is not None and p2_y is not None:
            loc2 = CalibrationService.localize_pixel(db, camera.camera_id, float(p2_x), float(p2_y))
            e2, n2 = loc2.local_position.x, loc2.local_position.y
            dist2 = loc2.distance_m
            lat2, lon2 = loc2.gps.latitude, loc2.gps.longitude
            bear2 = (math.degrees(math.atan2(e2, n2)) + 360.0) % 360.0
        elif frame_2_data.get("east_m") is not None and frame_2_data.get("north_m") is not None:
            e2 = float(frame_2_data["east_m"])
            n2 = float(frame_2_data["north_m"])
            dist2 = round(math.hypot(e2, n2), 2)
            bear2 = (math.degrees(math.atan2(e2, n2)) + 360.0) % 360.0
            origin_lat = cal.local_origin_lat or camera.latitude or 32.7161
            origin_lon = cal.local_origin_lon or camera.longitude or 74.8562
            from app.geometry.coordinate_transform import local_enu_to_gps
            lat2, lon2, _ = local_enu_to_gps(e2, n2, origin_lat, origin_lon)
        else:
            raise ValueError("Frame 2 requires either (pixel_x, pixel_y) or (east_m, north_m).")

        # Calculate Two-Frame Motion
        t1 = frame_1_data["timestamp"]
        t2 = frame_2_data["timestamp"]
        motion_res = calculate_two_frame_motion(
            east_1=e1, north_1=n1, time_1=t1,
            east_2=e2, north_2=n2, time_2=t2,
        )

        pred = {
            "frame_1": {
                "pixel": {"x": p1_x, "y": p1_y} if p1_x is not None else None,
                "local_position": {"east_m": round(e1, 4), "north_m": round(n1, 4)},
                "horizontal_distance_m": round(dist1, 2),
                "bearing_deg": round(bear1, 2),
                "gps": {"latitude": lat1, "longitude": lon1},
                "timestamp": t1,
            },
            "frame_2": {
                "pixel": {"x": p2_x, "y": p2_y} if p2_x is not None else None,
                "local_position": {"east_m": round(e2, 4), "north_m": round(n2, 4)},
                "horizontal_distance_m": round(dist2, 2),
                "bearing_deg": round(bear2, 2),
                "gps": {"latitude": lat2, "longitude": lon2},
                "timestamp": t2,
            },
            "motion": {
                "distance_travelled_m": motion_res["displacement"]["distance_travelled_m"],
                "time_difference_s": motion_res["time_interval_s"],
                "speed_mps": motion_res["speed"]["mps"],
                "speed_kmh": motion_res["speed"]["kmh"],
                "movement_direction_deg": motion_res["movement_direction_deg"],
                "camera_bearing_f1_deg": round(bear1, 2),
                "camera_bearing_f2_deg": round(bear2, 2),
            },
        }

        # Calculate errors if actual values provided
        errors = {}
        actual = actual_values or {}

        # 1. Distance errors
        if actual.get("actual_distance_1_m") is not None:
            act_d1 = float(actual["actual_distance_1_m"])
            abs_err = abs(dist1 - act_d1)
            pct_err = (abs_err / act_d1 * 100.0) if act_d1 > 0 else 0.0
            errors["distance_1_error"] = {
                "predicted_m": round(dist1, 2),
                "actual_m": round(act_d1, 2),
                "absolute_error_m": round(abs_err, 4),
                "percentage_error": round(pct_err, 2),
            }

        if actual.get("actual_distance_2_m") is not None:
            act_d2 = float(actual["actual_distance_2_m"])
            abs_err = abs(dist2 - act_d2)
            pct_err = (abs_err / act_d2 * 100.0) if act_d2 > 0 else 0.0
            errors["distance_2_error"] = {
                "predicted_m": round(dist2, 2),
                "actual_m": round(act_d2, 2),
                "absolute_error_m": round(abs_err, 4),
                "percentage_error": round(pct_err, 2),
            }

        # 2. Movement distance error
        if actual.get("actual_movement_distance_m") is not None:
            act_mov_d = float(actual["actual_movement_distance_m"])
            pred_mov_d = motion_res["displacement"]["distance_travelled_m"]
            abs_err = abs(pred_mov_d - act_mov_d)
            pct_err = (abs_err / act_mov_d * 100.0) if act_mov_d > 0 else 0.0
            errors["movement_distance_error"] = {
                "predicted_m": round(pred_mov_d, 2),
                "actual_m": round(act_mov_d, 2),
                "absolute_error_m": round(abs_err, 4),
                "percentage_error": round(pct_err, 2),
            }

        # 3. Speed error (m/s or km/h)
        if actual.get("actual_speed_mps") is not None:
            act_v = float(actual["actual_speed_mps"])
            pred_v = motion_res["speed"]["mps"]
            abs_err = abs(pred_v - act_v)
            pct_err = (abs_err / act_v * 100.0) if act_v > 0 else 0.0
            errors["speed_mps_error"] = {
                "predicted_mps": round(pred_v, 2),
                "actual_mps": round(act_v, 2),
                "absolute_error_mps": round(abs_err, 4),
                "percentage_error": round(pct_err, 2),
            }

        if actual.get("actual_speed_kmh") is not None:
            act_v_kmh = float(actual["actual_speed_kmh"])
            pred_v_kmh = motion_res["speed"]["kmh"]
            abs_err = abs(pred_v_kmh - act_v_kmh)
            pct_err = (abs_err / act_v_kmh * 100.0) if act_v_kmh > 0 else 0.0
            errors["speed_kmh_error"] = {
                "predicted_kmh": round(pred_v_kmh, 2),
                "actual_kmh": round(act_v_kmh, 2),
                "absolute_error_kmh": round(abs_err, 4),
                "percentage_error": round(pct_err, 2),
            }

        # 4. Bearings & Direction errors (angular difference)
        if actual.get("actual_bearing_1_deg") is not None:
            act_b1 = float(actual["actual_bearing_1_deg"])
            ang_err = angular_difference_deg(bear1, act_b1)
            errors["bearing_1_error_deg"] = {
                "predicted_deg": round(bear1, 2),
                "actual_deg": round(act_b1, 2),
                "absolute_error_deg": round(ang_err, 2),
            }

        if actual.get("actual_bearing_2_deg") is not None:
            act_b2 = float(actual["actual_bearing_2_deg"])
            ang_err = angular_difference_deg(bear2, act_b2)
            errors["bearing_2_error_deg"] = {
                "predicted_deg": round(bear2, 2),
                "actual_deg": round(act_b2, 2),
                "absolute_error_deg": round(ang_err, 2),
            }

        if actual.get("actual_movement_direction_deg") is not None:
            act_dir = float(actual["actual_movement_direction_deg"])
            pred_dir = motion_res["movement_direction_deg"]
            ang_err = angular_difference_deg(pred_dir, act_dir)
            errors["movement_direction_error_deg"] = {
                "predicted_deg": round(pred_dir, 2),
                "actual_deg": round(act_dir, 2),
                "absolute_error_deg": round(ang_err, 2),
            }

        # 5. Geodetic GPS position error (metric displacement on Earth surface)
        if actual.get("actual_gps_lat_1") is not None and actual.get("actual_gps_lon_1") is not None:
            act_lat1 = float(actual["actual_gps_lat_1"])
            act_lon1 = float(actual["actual_gps_lon_1"])
            dx, dy, _ = gps_to_local_enu(lat1, lon1, act_lat1, act_lon1)
            gps_err1 = round(math.hypot(dx, dy), 4)
            errors["gps_1_error_m"] = {
                "predicted_gps": {"latitude": lat1, "longitude": lon1},
                "actual_gps": {"latitude": act_lat1, "longitude": act_lon1},
                "ground_displacement_error_m": gps_err1,
            }

        if actual.get("actual_gps_lat_2") is not None and actual.get("actual_gps_lon_2") is not None:
            act_lat2 = float(actual["actual_gps_lat_2"])
            act_lon2 = float(actual["actual_gps_lon_2"])
            dx, dy, _ = gps_to_local_enu(lat2, lon2, act_lat2, act_lon2)
            gps_err2 = round(math.hypot(dx, dy), 4)
            errors["gps_2_error_m"] = {
                "predicted_gps": {"latitude": lat2, "longitude": lon2},
                "actual_gps": {"latitude": act_lat2, "longitude": act_lon2},
                "ground_displacement_error_m": gps_err2,
            }

        return {
            "instance_id": instance_id,
            "camera_id": camera.camera_id,
            "predicted": pred,
            "actual": actual,
            "errors": errors,
        }

    @classmethod
    def evaluate_multiple_instances(
        cls,
        db: Session,
        camera_id: str,
        instances: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """
        Runs evaluation over multiple test instances and aggregates MAE, RMSE, and Max Error.
        """
        results = []
        dist_errors = []
        mov_dist_errors = []
        speed_mps_errors = []
        bearing_errors = []
        direction_errors = []
        gps_errors = []

        for idx, inst in enumerate(instances, 1):
            inst_id = inst.get("instance_id", f"INSTANCE_{idx}")
            eval_res = cls.evaluate_test_instance(
                db=db,
                camera_id=inst.get("camera_id") or camera_id,
                frame_1_data=inst["frame_1"],
                frame_2_data=inst["frame_2"],
                actual_values=inst.get("actual_values", inst.get("ground_truth")),
                instance_id=inst_id,
            )
            results.append(eval_res)

            errs = eval_res["errors"]
            if "distance_1_error" in errs:
                dist_errors.append(errs["distance_1_error"]["absolute_error_m"])
            if "distance_2_error" in errs:
                dist_errors.append(errs["distance_2_error"]["absolute_error_m"])
            if "movement_distance_error" in errs:
                mov_dist_errors.append(errs["movement_distance_error"]["absolute_error_m"])
            if "speed_mps_error" in errs:
                speed_mps_errors.append(errs["speed_mps_error"]["absolute_error_mps"])
            if "bearing_1_error_deg" in errs:
                bearing_errors.append(errs["bearing_1_error_deg"]["absolute_error_deg"])
            if "bearing_2_error_deg" in errs:
                bearing_errors.append(errs["bearing_2_error_deg"]["absolute_error_deg"])
            if "movement_direction_error_deg" in errs:
                direction_errors.append(errs["movement_direction_error_deg"]["absolute_error_deg"])
            if "gps_1_error_m" in errs:
                gps_errors.append(errs["gps_1_error_m"]["ground_displacement_error_m"])
            if "gps_2_error_m" in errs:
                gps_errors.append(errs["gps_2_error_m"]["ground_displacement_error_m"])

        # Compute aggregates
        aggregate = {
            "total_instances_evaluated": len(instances),
            "distance_error": {
                "mean_absolute_error_m": compute_mae(dist_errors),
                "rmse_m": compute_rmse(dist_errors),
                "max_error_m": compute_max(dist_errors),
                "sample_count": len(dist_errors),
            },
            "movement_distance_error": {
                "mean_absolute_error_m": compute_mae(mov_dist_errors),
                "rmse_m": compute_rmse(mov_dist_errors),
                "max_error_m": compute_max(mov_dist_errors),
                "sample_count": len(mov_dist_errors),
            },
            "speed_error": {
                "mean_absolute_error_mps": compute_mae(speed_mps_errors),
                "rmse_mps": compute_rmse(speed_mps_errors),
                "max_error_mps": compute_max(speed_mps_errors),
                "sample_count": len(speed_mps_errors),
            },
            "bearing_error": {
                "mean_absolute_error_deg": compute_mae(bearing_errors),
                "rmse_deg": compute_rmse(bearing_errors),
                "max_error_deg": compute_max(bearing_errors),
                "sample_count": len(bearing_errors),
            },
            "movement_direction_error": {
                "mean_absolute_error_deg": compute_mae(direction_errors),
                "rmse_deg": compute_rmse(direction_errors),
                "max_error_deg": compute_max(direction_errors),
                "sample_count": len(direction_errors),
            },
            "gps_displacement_error": {
                "mean_absolute_error_m": compute_mae(gps_errors),
                "rmse_m": compute_rmse(gps_errors),
                "max_error_m": compute_max(gps_errors),
                "sample_count": len(gps_errors),
            },
        }

        return {
            "camera_id": camera_id,
            "total_instances": len(instances),
            "instances": results,
            "aggregate_metrics": aggregate,
        }
