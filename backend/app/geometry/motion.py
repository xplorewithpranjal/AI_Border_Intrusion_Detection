"""
Two-Frame Motion Calculation Module
====================================

Calculates planar ground displacement, speed, and movement direction
between two sequential intrusion observations:

Frame 1: (E1, N1, t1)
Frame 2: (E2, N2, t2)

Formulas:
---------
- DeltaE = E2 - E1
- DeltaN = N2 - N1
- Ground Distance Travelled: D = sqrt(DeltaE^2 + DeltaN^2)
- Time interval: DeltaT = t2 - t1
- Ground Speed: v = D / DeltaT (m/s)
- Ground Speed (km/h): v_kmh = 3.6 * v
- Movement Direction: theta_movement = atan2(DeltaE, DeltaN) normalized to [0, 360) deg

IMPORTANT CONSTRAINTS:
- Do NOT implement acceleration.
- Do NOT calculate 3D distance as a required output.
- Distinguishes:
    A. Bearing from camera to intrusion (bearing camera -> intrusion)
    B. Direction in which intrusion is moving (bearing pos1 -> pos2)
"""

import math
import re
from datetime import datetime
from typing import Union, Dict, Any, Optional


def parse_timestamp_to_seconds(ts: Union[float, int, datetime, str]) -> float:
    """Converts a timestamp (epoch seconds, ISO string, or datetime) to float seconds."""
    if isinstance(ts, (int, float)):
        return float(ts)
    if isinstance(ts, datetime):
        return ts.timestamp()
    if isinstance(ts, str):
        # Direct float conversion if numeric string
        try:
            return float(ts)
        except ValueError:
            pass

        # Parse ISO 8601 string with support for variable fractional seconds and Z
        clean_str = ts.replace("Z", "+00:00")
        match = re.match(r"^(.*?)(\.\d+)(\+.*|-.*)?$", clean_str)
        if match:
            main, frac, tz = match.groups()
            frac_padded = frac[1:].ljust(6, "0")[:6]
            tz = tz or ""
            clean_str = f"{main}.{frac_padded}{tz}"
        try:
            dt = datetime.fromisoformat(clean_str)
            return dt.timestamp()
        except ValueError:
            pass
    raise ValueError(f"Unsupported timestamp format: {ts}")


def calculate_two_frame_motion(
    east_1: float,
    north_1: float,
    time_1: Union[float, int, datetime, str],
    east_2: float,
    north_2: float,
    time_2: Union[float, int, datetime, str],
    camera_east: float = 0.0,
    camera_north: float = 0.0,
) -> Dict[str, Any]:
    """
    Computes ground displacement, distance travelled, speed, and movement direction
    between two intrusion observations.

    Args:
        east_1: Local Easting coordinate of Frame 1 in meters
        north_1: Local Northing coordinate of Frame 1 in meters
        time_1: Timestamp of Frame 1
        east_2: Local Easting coordinate of Frame 2 in meters
        north_2: Local Northing coordinate of Frame 2 in meters
        time_2: Timestamp of Frame 2
        camera_east: Camera Easting (default 0.0)
        camera_north: Camera Northing (default 0.0)

    Returns:
        Dict containing:
        - delta_east_m
        - delta_north_m
        - distance_travelled_m
        - time_interval_s
        - speed_mps
        - speed_kmh
        - movement_direction_deg (direction intrusion is moving: Frame 1 -> Frame 2)
        - camera_bearing_frame1_deg (direction from camera to intrusion at Frame 1)
        - camera_bearing_frame2_deg (direction from camera to intrusion at Frame 2)
    """
    t1 = parse_timestamp_to_seconds(time_1)
    t2 = parse_timestamp_to_seconds(time_2)
    delta_t = t2 - t1

    if delta_t < 0:
        raise ValueError(f"Frame 2 timestamp ({t2}) must be greater than Frame 1 timestamp ({t1}).")

    delta_e = east_2 - east_1
    delta_n = north_2 - north_1

    # Ground horizontal distance travelled
    distance = math.hypot(delta_e, delta_n)

    # Speed in m/s and km/h
    if delta_t > 1e-6:
        speed_mps = distance / delta_t
    else:
        speed_mps = 0.0
    speed_kmh = 3.6 * speed_mps

    # Direction intrusion is moving (bearing from Position 1 to Position 2)
    # Convention: 0 = North, 90 = East, 180 = South, 270 = West
    if distance > 1e-5:
        movement_deg = (math.degrees(math.atan2(delta_e, delta_n)) + 360.0) % 360.0
    else:
        movement_deg = 0.0  # Stationary

    # Direction from camera to intrusion at Frame 1
    cam_dx1 = east_1 - camera_east
    cam_dy1 = north_1 - camera_north
    cam_dist1 = math.hypot(cam_dx1, cam_dy1)
    cam_bearing_f1 = (math.degrees(math.atan2(cam_dx1, cam_dy1)) + 360.0) % 360.0

    # Direction from camera to intrusion at Frame 2
    cam_dx2 = east_2 - camera_east
    cam_dy2 = north_2 - camera_north
    cam_dist2 = math.hypot(cam_dx2, cam_dy2)
    cam_bearing_f2 = (math.degrees(math.atan2(cam_dx2, cam_dy2)) + 360.0) % 360.0

    return {
        "frame_1": {
            "east_m": round(east_1, 4),
            "north_m": round(north_1, 4),
            "timestamp": t1,
            "horizontal_distance_from_camera_m": round(cam_dist1, 2),
            "bearing_from_camera_deg": round(cam_bearing_f1, 2),
        },
        "frame_2": {
            "east_m": round(east_2, 4),
            "north_m": round(north_2, 4),
            "timestamp": t2,
            "horizontal_distance_from_camera_m": round(cam_dist2, 2),
            "bearing_from_camera_deg": round(cam_bearing_f2, 2),
        },
        "displacement": {
            "delta_east_m": round(delta_e, 4),
            "delta_north_m": round(delta_n, 4),
            "distance_travelled_m": round(distance, 3),
        },
        "time_interval_s": round(delta_t, 3),
        "speed": {
            "mps": round(speed_mps, 3),
            "kmh": round(speed_kmh, 2),
        },
        "movement_direction_deg": round(movement_deg, 2),
    }
