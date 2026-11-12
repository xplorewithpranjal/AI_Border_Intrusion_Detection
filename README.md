# Static Camera Geospatial Localization and Motion Analysis System

## Full-stack integration and demo deployment

The React frontend and FastAPI backend are separate processes. For local
development, run the backend on port 8000 and the Vite frontend on port 5173;
Vite proxies `/api` HTTP and WebSocket traffic to FastAPI. The optional YOLO
detector in `detector/` runs on port 8001 and forwards zone-entry events to
`/api/localization/event`. It needs a local video source and a registered,
calibrated camera to produce real GPS output.

The root `render.yaml` describes a public Render demo with separate frontend
and backend services. The free backend uses the project's default SQLite
database, so its records can reset when the service restarts or redeploys.
The detector is not hosted by this blueprint because it needs access to a
camera or video source and model weights. The frontend and API can still be
presented independently, and the API docs are served at `/docs` on the backend.

Before pushing to a public repository, confirm that no private or real-world
camera credentials or location data have been added. `.gitignore` excludes
local `.env` files, databases, event logs, model weights, and dependency/build
folders.

**Phase 3: Static Camera Geometric Calibration & Localization Engine**

---

## 1. System Overview

This software system performs **geospatial localization and motion analysis** for fixed/static cameras installed near border and perimeter infrastructure.

- **Phase 1**: Camera & Reference Pillar CRUD, Database schema, REST APIs, and React Dashboard.
- **Phase 2**: Real-time Mobile Phone Video Streaming via WebRTC & FastAPI WebSocket Signaling (P2P transport, HTTPS/WSS LAN support).
- **Phase 3**: Static Camera Geometric Calibration — mapping 2D camera pixels $(u, v) \to$ planar Homography $H \to$ local metric East-North-Up Cartesian $(X, Y) \to$ WGS84 GPS (latitude, longitude), complete with 3D camera ray-ground intersection, SolvePnP pose estimation, reprojection error diagnostics, and interactive testing UI.

### Complete Image-to-GPS Localization Pipeline
```
Image Pixel (u, v)
        ↓
Planar Homography H (computed from non-collinear BASE points)
        ↓
Local Ground Metric Position (X Easting, Y Northing, Z=0)
        ↓
Geodetic Local Tangent Plane Projection (WGS84)
        ↓
Real-World GPS (Latitude, Longitude)
```


---

## 2. Core Concepts & Decoupled Architecture

The architecture separates five core concerns:

1. **Camera Source**: Mobile phone browser capturing local video via `navigator.mediaDevices.getUserMedia` (Rear camera preferred for perimeter surveillance).
2. **WebRTC Signaling**: Lightweight FastAPI WebSocket router (`/api/ws/signaling/{camera_id}`) dispatching session offers, answers, and ICE candidates between peers. **FastAPI does NOT carry video payload.**
3. **Video Transport**: Direct WebRTC Peer-to-Peer (`RTCPeerConnection`) using public STUN servers for NAT traversal.
4. **React Video Display**: Desktop surveillance console rendering live `<video>` streams with a tactical HUD, live FPS counter, resolution display, and camera telemetry.
5. **Future Frame Processing Pipeline**: Decoupled design allowing backend frames to be tapped in Phase 3+ for geometric calibration and localization.

---

## 3. Repository Structure

```
drone project/
├── backend/
│   ├── app/
│   │   ├── main.py                  # FastAPI app with lifespan, CORS, and mounted routers
│   │   ├── config.py                # Config binding to 0.0.0.0 and CORS * for LAN
│   │   ├── database.py              # SQLite + SQLAlchemy session setup
│   │   ├── models/                  # SQLAlchemy ORM Models
│   │   │   ├── camera.py            # 'cameras' table
│   │   │   ├── pillar.py            # 'reference_pillars' & 'pillar_image_points'
│   │   │   └── calibration.py       # 'camera_calibrations'
│   │   ├── schemas/                 # Pydantic Schemas
│   │   ├── routers/                 # API & WebSocket Routers
│   │   │   ├── health.py            # GET /api/health
│   │   │   ├── cameras.py           # Full Camera CRUD (/api/cameras)
│   │   │   ├── pillars.py           # Reference pillar & image point endpoints
│   │   │   ├── calibration.py       # Calibration status endpoints
│   │   │   ├── validation.py        # Testing & validation placeholder
│   │   │   ├── localization.py      # Detection event ingestion placeholder
│   │   │   └── signaling.py         # WebRTC WebSocket signaling & stream status
│   │   └── services/
│   │       ├── camera_service.py    # Camera CRUD logic
│   │       ├── pillar_service.py    # Pillar logic
│   │       └── signaling_service.py # WebRTC room and signaling state manager
│   ├── tests/
│   │   ├── test_api.py              # Automated API test suite
│   │   └── test_signaling.py        # Automated WebRTC signaling handshake test
│   ├── seed.py                      # Realistic sample border camera seeder
│   ├── requirements.txt             # Pinned dependencies
│   ├── .env.example & .env          # Environment settings
│   └── venv/                        # Python virtual environment
│
├── frontend/
│   ├── src/
│   │   ├── api/                     # Backend API Clients
│   │   ├── components/              # Tactical UI Components (Header, Sidebar, Modal, Toast)
│   │   ├── pages/                   # Application Pages
│   │   │   ├── DashboardPage.jsx    # Metrics, active cameras, and pipeline diagram
│   │   │   ├── LiveStreamPage.jsx   # Dedicated WebRTC Viewer & Mobile Broadcaster
│   │   │   ├── CamerasPage.jsx      # Complete Camera CRUD table, modals & search
│   │   │   ├── CalibrationPage.jsx  # Perspective canvas & TOP/BASE point marker
│   │   │   ├── TestingPage.jsx      # Architectural placeholder for ground-truth tests
│   │   │   └── LocalizationPage.jsx # Architectural placeholder for event ingestion
│   │   ├── services/
│   │   │   └── webrtcClient.js      # Modular WebRTC PeerConnection & Media client
│   │   ├── App.jsx                  # Main view router with broadcaster auto-detection
│   │   └── index.css                # Dark tactical surveillance theme
│   ├── vite.config.js               # Dev server on 0.0.0.0 with WebSocket proxy & basic-ssl
│   └── package.json
└── README.md
```

---

## 4. Quickstart Guide (Step-by-Step for LAN Streaming)

### Step 1: Find Your Computer's LAN IP Address

On Windows, open PowerShell and run:
```powershell
ipconfig
```
Look for your active network adapter (e.g. `Wireless LAN adapter Wi-Fi` or `Ethernet adapter`). Note the **IPv4 Address**, for example:
```
IPv4 Address. . . . . . . . . . . : 192.168.1.77
```
*(Replace `192.168.1.77` with your computer's actual LAN IP in all steps below.)*

---

### Step 2: Start the Backend Server

From the project root:
```powershell
cd backend
.\venv\Scripts\Activate.ps1
uvicorn app.main:app --host 0.0.0.0 --port 8000
```
- The backend is now listening on all network interfaces (`0.0.0.0:8000`).
- Interactive Swagger docs: `http://127.0.0.1:8000/docs`
- Health check: `http://127.0.0.1:8000/api/health`

---

### Step 3: Start the Frontend Dev Server (HTTPS Enabled)

In a second terminal window, run:

```powershell
cd frontend
npm run dev
```

Vite is preconfigured with `@vitejs/plugin-basic-ssl` and will output:
```
  ➜  Local:   https://localhost:5173/
  ➜  Network: https://192.168.1.77:5173/
```
*(Notice the **https://** protocol — this establishes the Secure Context required by mobile camera APIs).*

---

### Step 4: Open Desktop Dashboard (Viewer)

On your computer browser, open:
```
https://localhost:5173/
```
*(If your browser displays a self-signed certificate warning, click **Advanced** → **Proceed to localhost (unsafe)**).*

1. Click on **Live Stream** in the sidebar.
2. Notice the **🔒 HTTPS Secure Context** badge at the top.
3. Select your target camera (e.g. `CAM_SEC_001`).
4. Notice the **Connect Mobile Phone Camera** box displaying the dynamic mobile LAN URL:
   ```
   https://192.168.1.77:5173/?mode=broadcaster&camera_id=CAM_SEC_001
   ```
   *(The computer's LAN IP is dynamically detected via `/api/network-info` — no hardcoding).*
5. Click the **Copy** button.

---

### Step 5: Connect Your Mobile Phone (Broadcaster)

1. Ensure your phone is connected to the **same Wi-Fi network** as your computer.
2. Open Chrome or Safari on your phone.
3. Enter or paste the HTTPS mobile broadcaster URL:
   ```
   https://192.168.1.77:5173/?mode=broadcaster&camera_id=CAM_SEC_001
   ```
4. **First-Time SSL Bypass (Required for Local Dev Certificates)**:
   - Chrome will show: *"Your connection is not private"* (`NET::ERR_CERT_AUTHORITY_INVALID`).
   - Tap **Advanced** (or *Details*).
   - Tap **Proceed to 192.168.1.77 (unsafe)**.
   *(This one-time action allows the browser to trust the local dev HTTPS server for this session).*
5. The broadcaster page loads in **Secure Context (HTTPS 🔒)**.
6. Tap **Start Camera Stream**.
7. When prompted, tap **Allow** for camera permissions.
8. The rear camera (`environment`) starts streaming, and camera telemetry appears in real time.

---

### Step 6: View Live Stream on Desktop Console

1. Look at your computer screen:
   - The WebRTC link status updates to **CONNECTED** (glowing emerald badge).
   - The live video feed from your phone appears immediately on the desktop display.
   - The Tactical HUD displays:
     - Blinking `LIVE FEED` beacon
     - Live FPS counter (e.g., `30 FPS`)
     - Video Resolution (e.g., `1280x720` or `1920x1080`)
     - Camera ID (`CAM_SEC_001`)
     - Current timestamp
2. The **Technical Status Panel** displays:
   - **Camera Status**: `STREAMING`
   - **WebRTC Status**: `CONNECTED`
   - **Selected Camera**: `CAM_SEC_001`
   - **Video Resolution**: `1280x720`
   - **Approximate FPS**: `30 FPS`
   - **Camera Optics**: `Rear / Environment`
   - **Security Context**: `Secure Context (HTTPS 🔒)`
   - **Signaling Transport**: `WSS (Secure WebSocket)`
   - **Target Host**: `192.168.1.77`

---

## 5. HTTPS, Secure Context & Signaling Architecture

### Why HTTPS is Mandatory
Modern mobile browsers (Google Chrome Android, Apple Safari iOS) restrict `navigator.mediaDevices.getUserMedia` strictly to a **Secure Context** (`https://` or `localhost`). When accessed over LAN via plain `http://192.168.x.x:5173`, mobile browsers disable the camera API completely and return:
```
"Camera API not supported or inaccessible. Ensure you are in a Secure Context (HTTPS or localhost)."
```

### How HTTPS & WSS Are Handled
- **Vite `@vitejs/plugin-basic-ssl`**: Serves the frontend over HTTPS on `0.0.0.0:5173` with a local self-signed certificate.
- **WebSocket Reverse Proxy (`ws: true`)**: Vite proxies both REST endpoints (`/api/...`) and WebSocket signaling (`/api/ws/...`) to FastAPI on `http://127.0.0.1:8000`.
- **Single-Origin TLS Termination**:
  - The phone browser connects securely to `https://192.168.1.77:5173` and `wss://192.168.1.77:5173/api/ws/signaling/...`.
  - Vite terminates TLS and forwards traffic over local HTTP/WS to Uvicorn.
  - **FastAPI does NOT require separate TLS configuration** — eliminating multi-port certificate warnings, mixed-content errors, and mobile WebSocket SSL rejection.
- **Strict Peer-to-Peer Video**: The video stream itself travels directly peer-to-peer via WebRTC (`RTCPeerConnection`). FastAPI only handles JSON SDP offers, answers, and ICE candidates. No video frames are transmitted through FastAPI.

---

## 6. Automated Testing & Verification

Run the test suites from the `backend/` directory using the virtual environment python:

```powershell
# Verify Phase 1 APIs & Camera CRUD
.\venv\Scripts\python.exe tests/test_api.py

# Verify Phase 2 WebRTC WebSocket Signaling Handshake
.\venv\Scripts\python.exe tests/test_signaling.py

# Verify Phase 3 Geometry, Coordinate Transforms, Homography & SolvePnP
.\venv\Scripts\python.exe tests/test_geometry.py

# Verify Phase 3 Calibration APIs, Storage & Pixel Localization
.\venv\Scripts\python.exe tests/test_calibration_api.py
```

### Test Coverage Summary:
- **`test_api.py`**: Health checks, camera CRUD, pillar CRUD, architectural contracts, deletion cascade.
- **`test_signaling.py`**: WebSocket broadcaster & viewer registration, SDP offer/answer routing, ICE candidate exchange, disconnect handling.
- **`test_geometry.py`**:
  - GPS $\leftrightarrow$ Local metric ENU round-trip accuracy ($<10^{-6}$ deg error)
  - Synthetic exact homography forward/inverse projection
  - SVD collinearity check ($>4$ collinear points rejected)
  - Degenerate point handling ($<4$ points rejected)
  - Reprojection error metrics (mean, RMSE, max)
  - Ray-ground plane intersection validation
  - 3D Pose estimation (SolvePnP) using pillar BASE + TOP heights
- **`test_calibration_api.py`**:
  - Full calibration calculation workflow via `/api/calibration/{camera_id}/calculate`
  - Result retrieval via `/api/calibration/{camera_id}/result`
  - Real-time localization via `/api/calibration/{camera_id}/localize`
  - Strict camera calibration isolation (`CAM_002` isolated from `CAM_001`)

---

## 7. Phase 3: Static Camera Geometric Calibration

### Calibration Data Flow
1. **Reference Pillar Definition**: Reference pillars are recorded with known GPS (Latitude, Longitude), known height $H_{\text{pillar}}$, and image coordinates:
   - **BASE Point**: Ground contact $(u_{\text{base}}, v_{\text{base}}) \iff (X, Y, Z=0)$ in local metric ENU.
   - **TOP Point**: Pillar summit $(u_{\text{top}}, v_{\text{top}}) \iff (X, Y, Z=H_{\text{pillar}})$.
2. **Local Tangent Plane (ENU)**: GPS coordinates are projected into local Cartesian meters relative to the camera origin (+X East, +Y North, +Z Up).
3. **Planar Homography $H$**:
   - Estimated from non-collinear BASE ground points using `cv2.findHomography(image_pts, ground_pts, cv2.RANSAC)`.
   - Requires minimum 4 non-collinear points; collinear or $<4$ points are rejected with explicit error diagnostics.
4. **Reprojection Error Analysis**:
   - Computes Euclidean distance $e_i = \|\mathbf{P}_i - H\mathbf{p}_i\|$ for every pillar.
   - Reports Mean Error, RMSE, and Maximum Error.
5. **3D Pose Estimation & Ray Verification**:
   - Known $(X, Y, 0)$ and $(X, Y, H_{\text{pillar}})$ provide 3D constraints for `cv2.solvePnP` to estimate/validate camera yaw, pitch, roll, and elevation.
   - For any image pixel, computes normalized viewing ray $\mathbf{d}$ in camera coordinates, rotates to world frame, and solves ground plane intersection $Z=0$ via $\mathbf{P} = \mathbf{C} - \frac{C_z}{d_z}\mathbf{d}$ for cross-validation against the homography result.
6. **Pixel $\to$ GPS Localization**:
   - Any pixel $(u, v)$ is transformed via $H \mathbf{p}$ to local metric $(X, Y)$, then converted to WGS84 GPS (latitude, longitude).

### Calibration API Endpoints
- `GET /api/calibration/{camera_id}`: Current calibration status, pillar counts, and camera parameters.
- `POST /api/calibration/{camera_id}/calculate`: Computes homography, reprojection metrics, and 3D pose; persists to SQLite.
- `GET /api/calibration/{camera_id}/result`: Retrieves full 3x3 homography matrix, RMSE, per-point errors, and pose diagnostics.
- `POST /api/calibration/{camera_id}/localize`: Accepts `{"pixel_x": ..., "pixel_y": ...}` and returns local metric $(X, Y)$, Euclidean distance $d$, WGS84 GPS coordinates, and optical ray verification.

---

## 8. Troubleshooting Common Issues

| Issue | Cause | Solution |
| :--- | :--- | :--- |
| **Phone cannot connect to `192.168.x.x:5173`** | Windows Firewall or different Wi-Fi network | Ensure phone and computer are on the same Wi-Fi. In Windows Defender Firewall, allow port `5173` and `8000` for Private Networks. |
| **"Camera API not supported or inaccessible" on phone** | Insecure Context (plain HTTP over LAN IP) | Use HTTPS (`$env:HTTPS="true"; npm run dev`) or enable `chrome://flags/#unsafely-treat-insecure-origin-as-secure` on mobile Chrome. |
| **WebRTC Status stays at `CONNECTING`** | NAT / Firewall blocking UDP traffic | The client uses Google public STUN servers (`stun.l.google.com:19302`). Ensure UDP port traffic is not blocked by a corporate router or VPN. |
| **"Insufficient points" or "Degenerate collinear points" error** | Fewer than 4 pillars or pillars in a straight line | Mark at least 4 non-collinear reference pillar base points across the surveillance area. |
| **High Reprojection RMSE (>3m)** | Inaccurate GPS coordinates or mistagged image base points | Verify pillar GPS coordinates and zoom into the canvas to place base markers accurately at ground-contact points. |

---

## 9. Feature Roadmap Status

### Completed:
- **Phase 1**: Camera & Pillar CRUD, DB schemas, REST APIs, and React Dashboard.
- **Phase 2**: Mobile camera capture, WebRTC P2P live streaming, FastAPI WebSocket signaling, and HTTPS/WSS LAN support.
- **Phase 3**: Static camera geometric calibration (Homography, WGS84 ENU transforms, Reprojection RMSE, SolvePnP pose estimation, Ray-ground intersection, Interactive Point Selector UI, and Pixel-to-GPS Localization Engine).

### Preserved for Future Phases:
- **Phase 4**: Testing & ground-truth validation module (predicted vs actual error metrics, automated field verification).
- **Phase 5**: Live geospatial localization pipeline (ingesting external detection bounding boxes, tracking ground footprints, speed, bearing, and intrusion alert zones).

