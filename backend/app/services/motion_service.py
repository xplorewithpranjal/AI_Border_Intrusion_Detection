"""
Motion Analysis & Intrusion Tracking Service (Phase 3B)
======================================================

Maintains a lightweight in-memory sliding buffer of localized intrusion
observations per camera and object to enable configurable interval-based
motion evaluation (e.g., interval = 1.0 second).

Constraints:
- Pure coordinate and timestamp tracking; NO video frames stored.
- Explicitly separates camera-to-object bearing from intrusion movement direction.
- Strictly adheres to NO acceleration and NO 3D distance constraints.
"""

import math
from typing import Dict, List, Tuple, Optional, Any, Union
from datetime import datetime

from app.geometry.motion import calculate_two_frame_motion, parse_timestamp_to_seconds


class IntrusionTrackingService:
    # Key: (camera_id, object_id) -> List of observation dicts sorted by timestamp
    _history: Dict[Tuple[str, str], List[Dict[str, Any]]] = {}

    # Configurable default evaluation interval in seconds (default 1.0s)
    _default_interval_s: float = 1.0

    # Max age of observations in buffer (seconds) to prevent unbounded memory growth
    _retention_window_s: float = 60.0

    @classmethod
    def set_default_interval(cls, interval_s: float) -> float:
        if interval_s <= 0:
            raise ValueError("Evaluation interval must be strictly positive.")
        cls._default_interval_s = float(interval_s)
        return cls._default_interval_s

    @classmethod
    def get_default_interval(cls) -> float:
        return cls._default_interval_s

    @classmethod
    def clear_history(cls, camera_id: Optional[str] = None):
        """Clears in-memory tracking buffer for all cameras or a specific camera."""
        if camera_id is None:
            cls._history.clear()
        else:
            keys_to_delete = [k for k in cls._history.keys() if k[0] == camera_id]
            for k in keys_to_delete:
                del cls._history[k]

    @classmethod
    def record_and_evaluate(
        cls,
        camera_id: str,
        timestamp: Union[float, int, datetime, str],
        pixel_x: float,
        pixel_y: float,
        east_m: float,
        north_m: float,
        latitude: float,
        longitude: float,
        horizontal_distance_m: float,
        bearing_deg: float,
        frame_id: Optional[Union[int, str]] = None,
        object_id: str = "OBJ_INTRUDER",
        interval_s: Optional[float] = None,
    ) -> Optional[Dict[str, Any]]:
        """
        Records the current localized observation and evaluates motion against
        a prior observation matching the evaluation interval (e.g., t - interval_s).
        """
        eval_interval = interval_s if interval_s is not None and interval_s > 0 else cls._default_interval_s
        t_sec = parse_timestamp_to_seconds(timestamp)

        obs_record = {
            "timestamp": timestamp,
            "timestamp_sec": t_sec,
            "frame_id": frame_id,
            "pixel_x": pixel_x,
            "pixel_y": pixel_y,
            "east_m": east_m,
            "north_m": north_m,
            "latitude": latitude,
            "longitude": longitude,
            "horizontal_distance_m": horizontal_distance_m,
            "bearing_deg": bearing_deg,
        }

        key = (camera_id, object_id)
        if key not in cls._history:
            cls._history[key] = []

        history = cls._history[key]

        # Prune records older than retention window relative to this event
        cls._history[key] = [
            item for item in history if (t_sec - item["timestamp_sec"]) <= cls._retention_window_s
        ]
        history = cls._history[key]

        # Find the best past observation for motion evaluation
        # We look for a past observation that satisfies (t_sec - past_t) >= eval_interval * 0.9
        # prioritizing the one closest to (t_sec - eval_interval)
        target_t = t_sec - eval_interval
        candidate = None
        best_delta = float("inf")

        for past_obs in history:
            dt = t_sec - past_obs["timestamp_sec"]
            if dt >= (eval_interval * 0.75):  # allow reasonable sampling jitter
                diff = abs(past_obs["timestamp_sec"] - target_t)
                if diff < best_delta:
                    best_delta = diff
                    candidate = past_obs

        # Append current observation to history
        history.append(obs_record)

        if candidate is None:
            return None

        # Calculate two-frame motion between candidate and current observation
        motion_res = calculate_two_frame_motion(
            east_1=candidate["east_m"],
            north_1=candidate["north_m"],
            time_1=candidate["timestamp_sec"],
            east_2=east_m,
            north_2=north_m,
            time_2=t_sec,
        )

        return {
            "evaluation_interval_s": eval_interval,
            "time_difference_s": motion_res["time_interval_s"],
            "previous_observation": {
                "timestamp": candidate["timestamp"],
                "frame_id": candidate["frame_id"],
                "pixel": {"x": candidate["pixel_x"], "y": candidate["pixel_y"]},
                "local_position": {"east_m": candidate["east_m"], "north_m": candidate["north_m"]},
                "horizontal_distance_m": candidate["horizontal_distance_m"],
                "bearing_from_camera_deg": candidate["bearing_deg"],
            },
            "displacement": motion_res["displacement"],
            "distance_travelled_m": motion_res["displacement"]["distance_travelled_m"],
            "speed": motion_res["speed"],
            "speed_mps": motion_res["speed"]["mps"],
            "speed_kmh": motion_res["speed"]["kmh"],
            "movement_direction_deg": motion_res["movement_direction_deg"],
            "camera_bearing_current_deg": bearing_deg,
            "note": "Separates camera-to-object bearing from intrusion movement direction. No acceleration or 3D distance.",
        }
