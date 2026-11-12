
import os
import cv2
import json
import time
import asyncio
import threading
import numpy as np
import requests

from pathlib import Path
from datetime import datetime, timezone

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse
from ultralytics import YOLO

# ==================================================
# CONFIGURATION
# ==================================================

APP_TITLE = "Border Camera Intrusion Detection API"

MODEL_PATH = os.getenv(
    "MODEL_PATH",
    "yolo26n.pt"
)

VIDEO_SOURCE = os.getenv(
    "VIDEO_SOURCE",
    "0"
)

CAMERA_ID = os.getenv("CAMERA_ID", "pillar_camera_01")
DETECTION_DEVICE = os.getenv("DETECTION_DEVICE", "cpu")
LOCALIZATION_API_URL = os.getenv(
    "LOCALIZATION_API_URL",
    "http://127.0.0.1:8000/api/localization/event",
)
SEND_EVENTS_TO_BACKEND = os.getenv("SEND_EVENTS_TO_BACKEND", "true").lower() == "true"

EVENT_FILE = Path(os.getenv("EVENT_FILE", "events.jsonl"))
EVENT_FILE.parent.mkdir(parents=True, exist_ok=True)

CONFIDENCE_THRESHOLD = 0.25
LOOP_VIDEO = True

# Example normalized polygon. Calibrate it to the actual
# restricted region in your camera view.
ZONE = [
    (0.35, 0.25),
    (0.95, 0.25),
    (0.95, 0.95),
    (0.35, 0.95),
]

RELEVANT_CLASSES = {
    "person",
    "bicycle",
    "car",
    "motorcycle",
    "bus",
    "truck",
    "bird",
    "airplane",
    "kite",
}

app = FastAPI(title=APP_TITLE)

# ==================================================
# SHARED STATE
# ==================================================

lock = threading.Lock()
stop_event = threading.Event()

latest_jpeg = None
latest_detections = []

event_history = []
track_states = {}

frame_id = 0
worker_thread = None

status = {
    "running": False,
    "camera_connected": False,
    "camera_id": CAMERA_ID,
    "device": DETECTION_DEVICE,
    "error": None,
    "last_frame": None,
    "frames_processed": 0,
    "detections_in_latest_frame": 0,
    "model": MODEL_PATH,
}

# Load model once at application startup/import.
model = YOLO(MODEL_PATH)


# ==================================================
# HELPERS
# ==================================================

def utc_now():
    return datetime.now(timezone.utc).isoformat()


def normalize_source(source):
    if isinstance(source, str) and source.isdigit():
        return int(source)
    return source


def point_in_zone(x, y):
    polygon = np.array(
        [
            (int(px * 10000), int(py * 10000))
            for px, py in ZONE
        ],
        dtype=np.int32,
    )

    return cv2.pointPolygonTest(
        polygon,
        (int(x * 10000), int(y * 10000)),
        False,
    ) >= 0


def draw_zone(frame):
    height, width = frame.shape[:2]

    points = np.array(
        [
            (int(x * width), int(y * height))
            for x, y in ZONE
        ],
        dtype=np.int32,
    )

    cv2.polylines(
        frame, [points], True, (0, 165, 255), 2
    )

    cv2.putText(
        frame,
        "CONFIGURED ZONE",
        (points[0][0], max(20, points[0][1] - 8)),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.55,
        (0, 165, 255),
        2,
    )


def save_event(event):
    # Write the event to disk before adding it to memory.
    with open(EVENT_FILE, "a", encoding="utf-8") as file:
        file.write(json.dumps(event) + "\n")

    with lock:
        event_history.append(event)
        if len(event_history) > 1000:
            del event_history[:-1000]

    if SEND_EVENTS_TO_BACKEND:
        x1, y1, x2, y2 = event["bbox_xyxy"]
        label = event["class"]
        if label in {"person", "bicycle", "car", "motorcycle", "bus", "truck"}:
            pixel_x, pixel_y = (x1 + x2) / 2, y2
        else:
            pixel_x, pixel_y = (x1 + x2) / 2, (y1 + y2) / 2
        payload = {
            "camera_id": event["camera_id"],
            "frame_id": event["frame_id"],
            "timestamp": event["timestamp"],
            "pixel_x": pixel_x,
            "pixel_y": pixel_y,
            "object_id": str(event["track_id"]),
        }
        try:
            response = requests.post(LOCALIZATION_API_URL, json=payload, timeout=2)
            response.raise_for_status()
        except requests.RequestException as exc:
            print(f"Backend event delivery failed: {exc}")


def load_event_history():
    if not EVENT_FILE.exists():
        return

    try:
        loaded = []

        with open(EVENT_FILE, "r", encoding="utf-8") as file:
            for line in file:
                try:
                    if line.strip():
                        loaded.append(json.loads(line))
                except json.JSONDecodeError:
                    continue

        with lock:
            event_history.extend(loaded[-1000:])
    except OSError as exc:
        print("Event history load failed:", exc)


# ==================================================
# DETECTION AND TRACKING WORKER
# ==================================================

def process_video():
    global latest_jpeg, latest_detections, frame_id

    source = normalize_source(VIDEO_SOURCE)
    cap = cv2.VideoCapture(source)

    if not cap.isOpened():
        with lock:
            status["error"] = (
                f"Cannot open video source: {VIDEO_SOURCE}"
            )
            status["running"] = False
            status["camera_connected"] = False
        cap.release()
        return

    with lock:
        status["running"] = True
        status["camera_connected"] = True
        status["error"] = None

    track_states.clear()

    try:
        while not stop_event.is_set():
            ok, original_frame = cap.read()

            if not ok:
                if not LOOP_VIDEO:
                    break

                # Loop local recorded video for repeatable testing.
                if isinstance(source, str) and not source.lower().startswith("rtsp"):
                    cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                    track_states.clear()
                    continue

                with lock:
                    status["camera_connected"] = False

                time.sleep(0.2)
                continue

            height, width = original_frame.shape[:2]
            annotated = original_frame.copy()
            draw_zone(annotated)

            result = model.track(
                original_frame,
                persist=True,
                tracker="bytetrack.yaml",
                conf=CONFIDENCE_THRESHOLD,
                device=DETECTION_DEVICE,
                verbose=False,
            )[0]

            frame_detections = []
            current_frame_id = frame_id + 1

            if result.boxes is not None and len(result.boxes) > 0:
                boxes = result.boxes
                coords = boxes.xyxy.cpu().numpy()
                class_ids = boxes.cls.int().cpu().tolist()
                scores = boxes.conf.cpu().tolist()

                if boxes.id is not None:
                    ids = boxes.id.int().cpu().tolist()
                else:
                    ids = [None] * len(coords)

                for box, class_id, score, track_id in zip(
                    coords, class_ids, scores, ids
                ):
                    label = model.names[int(class_id)]

                    if label not in RELEVANT_CLASSES:
                        continue

                    x1, y1, x2, y2 = map(int, box)

                    # Approximate ground contact for ground objects.
                    # Center point for airborne or other objects.
                    if label in {
                        "person", "bicycle", "car",
                        "motorcycle", "bus", "truck"
                    }:
                        ax = (x1 + x2) / (2 * width)
                        ay = y2 / height
                    else:
                        ax = (x1 + x2) / (2 * width)
                        ay = (y1 + y2) / (2 * height)

                    inside = point_in_zone(ax, ay)

                    track_key = (
                        f"{CAMERA_ID}:{track_id}"
                        if track_id is not None
                        else None
                    )

                    previous_inside = (
                        track_states.get(track_key)
                        if track_key is not None
                        else None
                    )

                    event_type = None

                    if track_key is not None:
                        if inside and previous_inside is None:
                            event_type = "first_seen_inside_zone"
                        elif inside and previous_inside is False:
                            event_type = "zone_entry"

                        track_states[track_key] = inside

                    detection = {
                        "camera_id": CAMERA_ID,
                        "frame_id": current_frame_id,
                        "class": label,
                        "track_id": track_id,
                        "confidence": round(float(score), 4),
                        "bbox_xyxy": [x1, y1, x2, y2],
                        "anchor_normalized": [
                            round(float(ax), 4),
                            round(float(ay), 4),
                        ],
                        "inside_restricted_zone": inside,
                        "intrusion_candidate": (
                            event_type is not None
                        ),
                    }

                    frame_detections.append(detection)

                    color = (
                        (0, 0, 255)
                        if inside
                        else (0, 255, 0)
                    )

                    identity = (
                        str(track_id)
                        if track_id is not None
                        else "untracked"
                    )

                    cv2.rectangle(
                        annotated,
                        (x1, y1),
                        (x2, y2),
                        color,
                        2,
                    )

                    cv2.putText(
                        annotated,
                        f"{label} ID:{identity} {score:.2f}",
                        (x1, max(20, y1 - 8)),
                        cv2.FONT_HERSHEY_SIMPLEX,
                        0.55,
                        color,
                        2,
                    )

                    if event_type is not None:
                        event = {
                            "event_id": (
                                f"{CAMERA_ID}-{track_id}-"
                                f"{int(time.time() * 1000)}"
                            ),
                            "timestamp": utc_now(),
                            "camera_id": CAMERA_ID,
                            "frame_id": current_frame_id,
                            "event_type": event_type,
                            "intrusion_candidate": True,
                            "intrusion_confirmed": False,
                            "class": label,
                            "track_id": track_id,
                            "confidence": round(float(score), 4),
                            "bbox_xyxy": [x1, y1, x2, y2],
                            "zone": "configured_roi",
                        }

                        try:
                            save_event(event)
                        except OSError as exc:
                            with lock:
                                status["error"] = (
                                    f"Event storage failed: {exc}"
                                )

            ok, encoded = cv2.imencode(".jpg", annotated)

            with lock:
                frame_id = current_frame_id
                latest_detections = frame_detections
                status["camera_connected"] = True
                status["last_frame"] = utc_now()
                status["frames_processed"] += 1
                status["detections_in_latest_frame"] = len(
                    frame_detections
                )

                if ok:
                    latest_jpeg = encoded.tobytes()

    except Exception as exc:
        with lock:
            status["error"] = str(exc)

        print("Detection worker error:", repr(exc))

    finally:
        cap.release()
        with lock:
            status["running"] = False
            status["camera_connected"] = False


# ==================================================
# APPLICATION LIFECYCLE
# ==================================================

@app.on_event("startup")
def startup():
    global worker_thread

    stop_event.clear()
    load_event_history()

    worker_thread = threading.Thread(
        target=process_video,
        daemon=True,
    )
    worker_thread.start()


@app.on_event("shutdown")
def shutdown():
    stop_event.set()


# ==================================================
# REST API
# ==================================================

@app.get("/")
def home():
    return {
        "project": APP_TITLE,
        "endpoints": {
            "health": "/health",
            "status": "/status",
            "detections": "/detections",
            "events": "/events",
            "latest_event": "/events/latest",
            "video": "/video_feed",
            "websocket": "/ws/detections",
            "docs": "/docs",
        },
    }


@app.get("/health")
def health():
    return {
        "api": "ok",
        "timestamp": utc_now(),
    }


@app.get("/status")
def get_status():
    with lock:
        return dict(status)


@app.get("/detections")
def get_detections():
    with lock:
        return {
            "camera_id": CAMERA_ID,
            "frame_id": frame_id,
            "timestamp": status["last_frame"],
            "count": len(latest_detections),
            "detections": list(latest_detections),
        }


@app.get("/events")
def get_events(limit: int = 100):
    limit = max(1, min(limit, 500))

    with lock:
        selected = list(event_history[-limit:])
        total = len(event_history)

    return {
        "count_returned": len(selected),
        "total_in_memory": total,
        "events": selected,
    }


@app.get("/events/latest")
def get_latest_event():
    with lock:
        if not event_history:
            return {"event": None}

        return {"event": event_history[-1]}


@app.get("/video_feed")
def video_feed():
    def generate():
        while not stop_event.is_set():
            with lock:
                image = latest_jpeg

            if image is None:
                time.sleep(0.1)
                continue

            yield (
                b"--frame\r\n"
                b"Content-Type: image/jpeg\r\n\r\n"
                + image
                + b"\r\n"
            )

            time.sleep(0.01)

    return StreamingResponse(
        generate(),
        media_type="multipart/x-mixed-replace; boundary=frame",
    )


# ==================================================
# LIVE WEBSOCKET
# ==================================================

@app.websocket("/ws/detections")
async def websocket_detections(websocket: WebSocket):
    await websocket.accept()
    last_sent_frame = -1

    try:
        while True:
            with lock:
                current_frame = frame_id
                payload = {
                    "camera_id": CAMERA_ID,
                    "frame_id": frame_id,
                    "timestamp": status["last_frame"],
                    "detections": list(latest_detections),
                }

            # Send only when a new frame has been processed.
            if current_frame != last_sent_frame:
                await websocket.send_json(payload)
                last_sent_frame = current_frame

            await asyncio.sleep(0.05)

    except WebSocketDisconnect:
        pass
    except Exception as exc:
        print("WebSocket disconnected:", repr(exc))


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        app,
        host="0.0.0.0",
        port=int(os.getenv("DETECTOR_PORT", "8001")),
    )
