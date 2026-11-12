import math
from collections import deque
from threading import Lock
from typing import Optional, Dict, Any, Union
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.services.calibration_service import CalibrationService
from app.services.camera_service import CameraService
from app.geometry.motion import calculate_two_frame_motion
from app.schemas.localization import (
    DetectionEventInput,
    LocalizationResult,
    PixelPoint,
    LocalPosition,
    GPSPoint,
    TwoFrameMotionRequest,
    TwoFrameMotionResponse,
    MotionFrameState,
    MotionDisplacement,
    MotionSpeed,
)

router = APIRouter(prefix="/localization", tags=["Live Localization"])
recent_events = deque(maxlen=100)
recent_events_lock = Lock()


def remember_localization_event(result: LocalizationResult):
    with recent_events_lock:
        recent_events.appendleft(result.model_dump(mode="json"))


@router.get("/events")
def list_recent_localization_events(limit: int = Query(default=20, ge=1, le=100)):
    """Return recent detection events for the dashboard. Stored in memory."""
    with recent_events_lock:
        return {"events": list(recent_events)[:limit]}


@router.post("/event", response_model=LocalizationResult)
def receive_detection_event(
    payload: DetectionEventInput,
    db: Session = Depends(get_db),
):
    """
    Ingests an intrusion detection event:
    camera_id, timestamp, pixel_x, pixel_y (base-center of detected object).

    If the camera has an active geometric calibration:
    - Resolves real-world local ground metric position (East, North)
    - Computes ground horizontal distance from camera (NO 3D distance)
    - Computes absolute Earth compass direction/bearing (0 = North, 90 = East)
    - Converts to exact WGS84 GPS (latitude, longitude)

    If uncalibrated:
    - Safely returns placeholder status without fabricating coordinates.
    """
    cal = CalibrationService.get_latest_calibration_record(db, payload.camera_id)
    if not cal or not cal.h_matrix:
        result = LocalizationResult(
            status="architectural_placeholder",
            message="Camera has not been geometrically calibrated yet. Localization unavailable.",
            camera_id=payload.camera_id,
            object_id=payload.object_id,
            timestamp=payload.timestamp,
            base_pixel_x=payload.base_pixel_x,
            base_pixel_y=payload.base_pixel_y,
            ground_x=None,
            ground_y=None,
            gps_latitude=None,
            gps_longitude=None,
            speed_mps=None,
            bearing_deg=None,
        )
        remember_localization_event(result)
        return result

    # Perform real geometric transformation using saved calibration
    loc_res = CalibrationService.localize_pixel(
        db=db,
        camera_identifier=payload.camera_id,
        pixel_x=payload.pixel_x,
        pixel_y=payload.pixel_y,
    )

    east = loc_res.local_position.x
    north = loc_res.local_position.y
    bearing = (math.degrees(math.atan2(east, north)) + 360.0) % 360.0
    dist_m = loc_res.distance_m
    lat = loc_res.gps.latitude
    lon = loc_res.gps.longitude

    # Evaluate interval motion if tracking buffer has prior observation
    from app.services.motion_service import IntrusionTrackingService
    interval_motion = IntrusionTrackingService.record_and_evaluate(
        camera_id=payload.camera_id,
        timestamp=payload.timestamp,
        pixel_x=payload.pixel_x,
        pixel_y=payload.pixel_y,
        east_m=east,
        north_m=north,
        latitude=lat,
        longitude=lon,
        horizontal_distance_m=dist_m,
        bearing_deg=bearing,
        frame_id=payload.frame_id,
        object_id=payload.object_id or "OBJ_INTRUDER",
    )

    result = LocalizationResult(
        camera_id=payload.camera_id,
        timestamp=payload.timestamp,
        frame_id=payload.frame_id,
        status="calibrated",
        message="Real-world ground position and GPS successfully resolved via saved camera calibration.",
        pixel=PixelPoint(x=payload.pixel_x, y=payload.pixel_y),
        local_position=LocalPosition(east_m=round(east, 4), north_m=round(north, 4)),
        horizontal_distance_m=round(dist_m, 2),
        bearing_deg=round(bearing, 2),
        gps=GPSPoint(latitude=lat, longitude=lon),
        motion=interval_motion,
        object_id=payload.object_id,
        base_pixel_x=payload.base_pixel_x,
        base_pixel_y=payload.base_pixel_y,
        ground_x=round(east, 4),
        ground_y=round(north, 4),
        gps_latitude=lat,
        gps_longitude=lon,
    )
    remember_localization_event(result)
    return result


@router.post("/motion", response_model=TwoFrameMotionResponse)
def calculate_two_frame_motion_endpoint(
    req: TwoFrameMotionRequest,
    db: Session = Depends(get_db),
):
    """
    Computes real-world ground displacement, ground speed (m/s and km/h),
    and target movement direction across two observation frames.
    Accepts observation_1 / observation_2 or frame_1 / frame_2.
    """
    f1 = req.observation_1 or req.frame_1
    f2 = req.observation_2 or req.frame_2
    cam_id = req.camera_id or f1.camera_id or f2.camera_id

    # Resolve Frame 1 coordinates
    p1_px = None
    if f1.east_m is not None and f1.north_m is not None:
        e1, n1 = float(f1.east_m), float(f1.north_m)
        camera = CameraService.get_by_identifier(db, cam_id) if cam_id else None
        origin_lat = camera.latitude if camera and camera.latitude else 32.7161
        origin_lon = camera.longitude if camera and camera.longitude else 74.8562
        from app.geometry.coordinate_transform import local_enu_to_gps
        lat1, lon1, _ = local_enu_to_gps(e1, n1, origin_lat, origin_lon)
        dist1 = round(math.hypot(e1, n1), 2)
        bear1 = (math.degrees(math.atan2(e1, n1)) + 360.0) % 360.0
    elif f1.pixel_x is not None and f1.pixel_y is not None:
        if not cam_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="camera_id required to localize pixel coordinates for Frame 1.",
            )
        loc1 = CalibrationService.localize_pixel(db, cam_id, f1.pixel_x, f1.pixel_y)
        e1, n1 = loc1.local_position.x, loc1.local_position.y
        dist1 = loc1.distance_m
        lat1, lon1 = loc1.gps.latitude, loc1.gps.longitude
        bear1 = (math.degrees(math.atan2(e1, n1)) + 360.0) % 360.0
        p1_px = PixelPoint(x=f1.pixel_x, y=f1.pixel_y)
    else:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Observation 1 requires either (east_m, north_m) or (pixel_x, pixel_y).",
        )

    # Resolve Frame 2 coordinates
    p2_px = None
    if f2.east_m is not None and f2.north_m is not None:
        e2, n2 = float(f2.east_m), float(f2.north_m)
        camera = CameraService.get_by_identifier(db, cam_id) if cam_id else None
        origin_lat = camera.latitude if camera and camera.latitude else 32.7161
        origin_lon = camera.longitude if camera and camera.longitude else 74.8562
        from app.geometry.coordinate_transform import local_enu_to_gps
        lat2, lon2, _ = local_enu_to_gps(e2, n2, origin_lat, origin_lon)
        dist2 = round(math.hypot(e2, n2), 2)
        bear2 = (math.degrees(math.atan2(e2, n2)) + 360.0) % 360.0
    elif f2.pixel_x is not None and f2.pixel_y is not None:
        if not cam_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="camera_id required to localize pixel coordinates for Frame 2.",
            )
        loc2 = CalibrationService.localize_pixel(db, cam_id, f2.pixel_x, f2.pixel_y)
        e2, n2 = loc2.local_position.x, loc2.local_position.y
        dist2 = loc2.distance_m
        lat2, lon2 = loc2.gps.latitude, loc2.gps.longitude
        bear2 = (math.degrees(math.atan2(e2, n2)) + 360.0) % 360.0
        p2_px = PixelPoint(x=f2.pixel_x, y=f2.pixel_y)
    else:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Observation 2 requires either (east_m, north_m) or (pixel_x, pixel_y).",
        )

    # Calculate motion using geometry module
    try:
        res = calculate_two_frame_motion(
            east_1=e1,
            north_1=n1,
            time_1=f1.timestamp,
            east_2=e2,
            north_2=n2,
            time_2=f2.timestamp,
        )
    except ValueError as ve:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(ve))

    from app.schemas.localization import ObservationState, MotionResultDetails

    obs1_state = ObservationState(
        gps=GPSPoint(latitude=lat1, longitude=lon1),
        east_m=round(e1, 4),
        north_m=round(n1, 4),
        timestamp=f1.timestamp,
        horizontal_distance_from_camera_m=round(dist1, 2),
        bearing_from_camera_deg=round(bear1, 2),
        pixel=p1_px,
    )

    obs2_state = ObservationState(
        gps=GPSPoint(latitude=lat2, longitude=lon2),
        east_m=round(e2, 4),
        north_m=round(n2, 4),
        timestamp=f2.timestamp,
        horizontal_distance_from_camera_m=round(dist2, 2),
        bearing_from_camera_deg=round(bear2, 2),
        pixel=p2_px,
    )

    motion_details = MotionResultDetails(
        distance_m=round(res["displacement"]["distance_travelled_m"], 4),
        direction_deg=round(res["movement_direction_deg"], 2),
        time_seconds=round(res["time_interval_s"], 4),
        speed_mps=round(res["speed"]["mps"], 4),
        speed_kmph=round(res["speed"]["kmh"], 4),
    )

    return TwoFrameMotionResponse(
        camera_id=cam_id,
        observation_1=obs1_state,
        observation_2=obs2_state,
        motion=motion_details,
        frame_1=MotionFrameState(**res["frame_1"]),
        frame_2=MotionFrameState(**res["frame_2"]),
        displacement=MotionDisplacement(**res["displacement"]),
        time_interval_s=res["time_interval_s"],
        speed=MotionSpeed(**res["speed"]),
        movement_direction_deg=res["movement_direction_deg"],
    )


@router.get("/interval")
def get_evaluation_interval():
    """Returns the current configurable motion evaluation interval."""
    from app.services.motion_service import IntrusionTrackingService
    return {
        "evaluation_interval_seconds": IntrusionTrackingService.get_default_interval(),
        "description": "Configurable evaluation interval for consecutive intrusion detections",
    }


@router.put("/interval")
def set_evaluation_interval(interval_seconds: float):
    """Sets the configurable motion evaluation interval (e.g. 1.0 second)."""
    if interval_seconds <= 0:
        raise HTTPException(status_code=400, detail="Evaluation interval must be greater than 0.")
    from app.services.motion_service import IntrusionTrackingService
    new_val = IntrusionTrackingService.set_default_interval(interval_seconds)
    return {
        "evaluation_interval_seconds": new_val,
        "message": f"Evaluation interval successfully set to {new_val} seconds.",
    }


@router.delete("/buffer")
def clear_tracking_buffer(camera_id: Optional[str] = None):
    """Clears the in-memory intrusion tracking buffer."""
    from app.services.motion_service import IntrusionTrackingService
    IntrusionTrackingService.clear_history(camera_id)
    return {"message": "Tracking buffer cleared successfully."}

