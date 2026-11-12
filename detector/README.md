# YOLO detector integration

This service is the uploaded intrusion detector, adapted to forward each new
zone-entry event to the main FastAPI localization endpoint. For ground objects,
it sends the bounding-box bottom center as the image pixel so the backend can
map the likely ground-contact point through the camera calibration.

Run the main backend first on port 8000. Then, in a separate terminal:

```powershell
cd detector
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
uvicorn app:app --host 0.0.0.0 --port 8001
```

Edit `detector/.env` for the video source, model, camera ID, and backend URL.
The camera ID must exist in the main backend and have a valid calibration for
the event to return GPS coordinates. The detector keeps its own event log and
also posts events to `/api/localization/event`. Its video feed is available at
`http://127.0.0.1:8001/video_feed` while the detector runs.

The detector runs separately because it needs access to a local camera/video
source and YOLO model weights. It is not started by the hosted frontend/backend.
