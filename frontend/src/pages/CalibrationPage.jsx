import React, { useEffect, useState, useRef } from 'react';
import {
  Crosshair,
  Plus,
  Trash2,
  CheckCircle2,
  Info,
  MapPin,
  Maximize2,
  Compass,
  AlertTriangle,
  Layers,
  Video,
  Camera,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Check,
  Copy,
  Navigation,
  Activity,
  Eye,
  RefreshCw,
  Sliders,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  Zap,
  ArrowRight,
} from 'lucide-react';
import { cameraApi } from '../api/cameraApi';
import { pillarApi } from '../api/pillarApi';
import { calibrationApi } from '../api/calibrationApi';
import { StatusBadge } from '../components/StatusBadge';
import { Modal } from '../components/Modal';
import { WebRTCClient } from '../services/webrtcClient';

export function CalibrationPage({ showToast }) {
  // Camera Selection State
  const [cameras, setCameras] = useState([]);
  const [selectedCameraId, setSelectedCameraId] = useState('');
  const [cameraObj, setCameraObj] = useState(null);

  // Pillars & Calibration State
  const [pillars, setPillars] = useState([]);
  const [calibrationDetails, setCalibrationDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);

  // Active Point Selection State
  const [activePillarId, setActivePillarId] = useState(null);
  const [pointMode, setPointMode] = useState('BASE'); // 'BASE' (Z=0) or 'TOP' (Z=H)
  const [interactionMode, setInteractionMode] = useState('CALIBRATE'); // 'CALIBRATE' (point clicking) or 'TEST_LOCALIZE' (testing pixel -> GPS)

  // Step 2: Camera Physical Parameters Form
  const [camForm, setCamForm] = useState({
    height: '5.0',
    latitude: '32.716100',
    longitude: '74.856200',
    yaw: '0.0',
    pitch: '-18.0',
    roll: '0.0',
  });
  const [savingCamParams, setSavingCamParams] = useState(false);

  // Step 3: Add Pillar Modal
  const [isAddPillarOpen, setIsAddPillarOpen] = useState(false);
  const [pillarForm, setPillarForm] = useState({
    pillar_id: '',
    name: '',
    height: '2.5',
    x_distance: '15.0',
    y_distance: '30.0',
    latitude: '',
    longitude: '',
  });
  const [submittingPillar, setSubmittingPillar] = useState(false);

  // Canvas & Viewport State (Zoom & Pan)
  const canvasRef = useRef(null);
  const [zoomLevel, setZoomLevel] = useState(1.0);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [showGrid, setShowGrid] = useState(true);

  // Step 7: Live WebRTC Stream Integration
  const [useLiveVideo, setUseLiveVideo] = useState(false);
  const [streamActive, setStreamActive] = useState(false);
  const videoRef = useRef(null);
  const webrtcRef = useRef(null);
  const frozenFrameRef = useRef(null); // Captured ImageBitmap / Canvas snapshot

  // Step 14: Interactive Pixel Localization Testing State
  const [testResult, setTestResult] = useState(null);
  const [localizingPoint, setLocalizingPoint] = useState(false);
  const [lastTestPixel, setLastTestPixel] = useState(null);
  const [copiedGps, setCopiedGps] = useState(false);

  // Matrix Viewer Expansion
  const [showMatrix, setShowMatrix] = useState(false);

  // Step 19: Two-Frame Motion Calculation State
  const [motionForm, setMotionForm] = useState({
    p1_x: '640',
    p1_y: '520',
    t1: '0.0',
    p2_x: '680',
    p2_y: '470',
    t2: '2.5',
  });
  const [motionResult, setMotionResult] = useState(null);
  const [calculatingMotion, setCalculatingMotion] = useState(false);

  // Load cameras list on mount
  useEffect(() => {
    loadCameras();
  }, []);

  const loadCameras = async () => {
    try {
      setLoading(true);
      const data = await cameraApi.list();
      setCameras(data);
      if (data.length > 0) {
        setSelectedCameraId(data[0].camera_id);
      }
    } catch (err) {
      showToast({ type: 'error', message: err.message || 'Failed to load cameras' });
    } finally {
      setLoading(false);
    }
  };

  // Reload camera details, pillars, and calibration details on camera switch
  useEffect(() => {
    if (selectedCameraId) {
      loadCameraDetails(selectedCameraId);
    }
  }, [selectedCameraId]);

  const loadCameraDetails = async (camId) => {
    try {
      const [camData, pillarList, calibInfo] = await Promise.all([
        cameraApi.get(camId).catch(() => null),
        pillarApi.listByCamera(camId).catch(() => []),
        calibrationApi.get(camId).catch(() => null),
      ]);

      if (camData) {
        setCameraObj(camData);
        setCamForm({
          height: camData.height !== null ? String(camData.height) : '5.0',
          latitude: camData.latitude !== null ? String(camData.latitude) : '32.716100',
          longitude: camData.longitude !== null ? String(camData.longitude) : '74.856200',
          yaw: camData.yaw !== null ? String(camData.yaw) : '0.0',
          pitch: camData.pitch !== null ? String(camData.pitch) : '-18.0',
          roll: camData.roll !== null ? String(camData.roll) : '0.0',
        });
      }

      setPillars(pillarList || []);
      setCalibrationDetails(calibInfo);

      if (pillarList && pillarList.length > 0) {
        setActivePillarId((prev) => (prev ? prev : pillarList[0].id));
      }
    } catch (err) {
      console.error('Failed to load camera details for calibration:', err);
    }
  };

  // WebRTC Stream listener for live video calibration
  useEffect(() => {
    if (!useLiveVideo || !selectedCameraId) {
      if (webrtcRef.current) {
        webrtcRef.current.disconnect();
        webrtcRef.current = null;
      }
      setStreamActive(false);
      return;
    }

    const client = new WebRTCClient({
      cameraId: selectedCameraId,
      role: 'viewer',
      onStatusChange: (status) => {
        setStreamActive(status === 'CONNECTED');
      },
      onRemoteStream: (stream) => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch((e) => console.log('Autoplay handled:', e));
        }
      },
    });

    webrtcRef.current = client;
    client.connectSignaling();

    return () => {
      client.disconnect();
      webrtcRef.current = null;
      setStreamActive(false);
    };
  }, [useLiveVideo, selectedCameraId]);

  // Snapshot current video frame
  const handleSnapshotFrame = () => {
    const video = videoRef.current;
    if (!video || !streamActive) return;

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = 1280;
    tempCanvas.height = 720;
    const ctx = tempCanvas.getContext('2d');
    ctx.drawImage(video, 0, 0, 1280, 720);
    frozenFrameRef.current = tempCanvas;
    showToast?.({ type: 'success', message: 'Captured calibration snapshot from live stream!' });
  };

  // Save Step 2 Camera Parameters
  const handleSaveCameraParams = async (e) => {
    e.preventDefault();
    try {
      setSavingCamParams(true);
      await cameraApi.update(selectedCameraId, {
        height: parseFloat(camForm.height),
        latitude: parseFloat(camForm.latitude),
        longitude: parseFloat(camForm.longitude),
        yaw: parseFloat(camForm.yaw),
        pitch: parseFloat(camForm.pitch),
        roll: parseFloat(camForm.roll),
      });
      showToast?.({ type: 'success', message: 'Camera installation parameters saved!' });
      loadCameraDetails(selectedCameraId);
    } catch (err) {
      showToast?.({ type: 'error', message: err.message || 'Failed to save camera parameters' });
    } finally {
      setSavingCamParams(false);
    }
  };

  // Canvas Mouse Tracking
  const handleCanvasMouseMove = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = Math.round((e.clientX - rect.left) * scaleX);
    const y = Math.round((e.clientY - rect.top) * scaleY);
    setMousePos({ x, y });
  };

  // Canvas Click (Point Registration or Test Localization)
  const handleCanvasClick = async () => {
    const { x, y } = mousePos;

    if (interactionMode === 'TEST_LOCALIZE') {
      // Step 14: Test Pixel -> Real Ground -> GPS
      if (!calibrationDetails?.is_valid && calibrationDetails?.calibration_status !== 'calibrated') {
        showToast?.({
          type: 'warning',
          message: 'Calculate calibration first before testing pixel localization.',
        });
        return;
      }
      try {
        setLocalizingPoint(true);
        setLastTestPixel({ x, y });
        const res = await calibrationApi.localize(selectedCameraId, { pixel_x: x, pixel_y: y });
        setTestResult(res);
      } catch (err) {
        showToast?.({ type: 'error', message: err.message || 'Localization calculation failed.' });
      } finally {
        setLocalizingPoint(false);
      }
      return;
    }

    // Standard Point Registration Mode
    if (!activePillarId) {
      showToast?.({ type: 'warning', message: 'Select a reference pillar first to record coordinates.' });
      return;
    }

    const pillar = pillars.find((p) => p.id === activePillarId);
    if (!pillar) return;

    try {
      const realZ = pointMode === 'BASE' ? 0.0 : (pillar.height || 2.5);
      await pillarApi.recordPoint(activePillarId, {
        point_type: pointMode,
        pixel_x: x,
        pixel_y: y,
        real_z: realZ,
      });

      showToast?.({
        type: 'success',
        message: `Registered ${pointMode} point (${x}, ${y}) for ${pillar.pillar_id}`,
      });

      loadCameraDetails(selectedCameraId);

      // Auto-toggle from BASE to TOP for intuitive workflow
      if (pointMode === 'BASE') {
        setPointMode('TOP');
      }
    } catch (err) {
      showToast?.({ type: 'error', message: err.message || 'Failed to record coordinate' });
    }
  };

  // Step 6: Trigger Calibration Calculation
  const handleCalculateCalibration = async () => {
    try {
      setCalculating(true);
      const res = await calibrationApi.calculate(selectedCameraId, {
        camera_height: parseFloat(camForm.height),
        camera_latitude: parseFloat(camForm.latitude),
        camera_longitude: parseFloat(camForm.longitude),
        yaw: parseFloat(camForm.yaw),
        pitch: parseFloat(camForm.pitch),
        roll: parseFloat(camForm.roll),
        image_width: 1280,
        image_height: 720,
      });

      showToast?.({
        type: 'success',
        message: `Calibration computed! RMSE: ${res.reprojection_error_rmse}m across ${res.num_reference_points} pillars.`,
      });

      loadCameraDetails(selectedCameraId);
    } catch (err) {
      showToast?.({
        type: 'error',
        message: err.data?.detail || err.message || 'Calibration calculation failed.',
      });
    } finally {
      setCalculating(false);
    }
  };

  // Step 19: Two-Frame Motion Calculation Handler
  const handleCalculateMotion = async (e) => {
    e?.preventDefault();
    if (!selectedCameraId) return;
    try {
      setCalculatingMotion(true);
      const res = await calibrationApi.calculateMotion({
        camera_id: selectedCameraId,
        frame_1: {
          timestamp: parseFloat(motionForm.t1) || 0.0,
          pixel_x: parseFloat(motionForm.p1_x),
          pixel_y: parseFloat(motionForm.p1_y),
        },
        frame_2: {
          timestamp: parseFloat(motionForm.t2) || 2.5,
          pixel_x: parseFloat(motionForm.p2_x),
          pixel_y: parseFloat(motionForm.p2_y),
        },
      });
      setMotionResult(res);
      showToast?.({
        type: 'success',
        message: `Motion computed: ${res.speed.kmh} km/h, direction ${res.movement_direction_deg}°`,
      });
    } catch (err) {
      showToast?.({
        type: 'error',
        message: err.data?.detail || err.message || 'Motion calculation failed.',
      });
    } finally {
      setCalculatingMotion(false);
    }
  };

  // Step 3: Add Reference Pillar
  const handleAddPillarSubmit = async (e) => {
    e.preventDefault();
    if (!pillarForm.pillar_id || !pillarForm.name) {
      showToast?.({ type: 'warning', message: 'Pillar ID and Name are required.' });
      return;
    }

    try {
      setSubmittingPillar(true);
      const payload = {
        pillar_id: pillarForm.pillar_id.trim().toUpperCase(),
        name: pillarForm.name.trim(),
        height: pillarForm.height !== '' ? parseFloat(pillarForm.height) : 2.5,
        x_distance: pillarForm.x_distance !== '' ? parseFloat(pillarForm.x_distance) : null,
        y_distance: pillarForm.y_distance !== '' ? parseFloat(pillarForm.y_distance) : null,
        latitude: pillarForm.latitude !== '' ? parseFloat(pillarForm.latitude) : null,
        longitude: pillarForm.longitude !== '' ? parseFloat(pillarForm.longitude) : null,
      };

      const newP = await pillarApi.create(selectedCameraId, payload);
      showToast?.({ type: 'success', message: `Reference pillar ${payload.pillar_id} added!` });
      setIsAddPillarOpen(false);
      setActivePillarId(newP.id);
      loadCameraDetails(selectedCameraId);
    } catch (err) {
      showToast?.({ type: 'error', message: err.message || 'Failed to add pillar' });
    } finally {
      setSubmittingPillar(false);
    }
  };

  // Render Tactical Viewport & Points
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    // Draw background: Either frozen snapshot, live video frame, or simulated high-fidelity tactical terrain
    if (frozenFrameRef.current) {
      ctx.drawImage(frozenFrameRef.current, 0, 0, width, height);
    } else if (useLiveVideo && streamActive && videoRef.current) {
      ctx.drawImage(videoRef.current, 0, 0, width, height);
    } else {
      // High-fidelity border surveillance perspective background
      ctx.fillStyle = '#080c14';
      ctx.fillRect(0, 0, width, height);

      // Horizon line based on pitch
      const pitchOffset = parseFloat(camForm.pitch || -18) * 4;
      const horizonY = height * 0.4 + pitchOffset;

      // Sky gradient
      const gradSky = ctx.createLinearGradient(0, 0, 0, horizonY);
      gradSky.addColorStop(0, '#060a12');
      gradSky.addColorStop(1, '#0f172a');
      ctx.fillStyle = gradSky;
      ctx.fillRect(0, 0, width, horizonY);

      // Ground plane gradient
      const gradGround = ctx.createLinearGradient(0, horizonY, 0, height);
      gradGround.addColorStop(0, '#111b2b');
      gradGround.addColorStop(1, '#070a10');
      ctx.fillStyle = gradGround;
      ctx.fillRect(0, horizonY, width, height - horizonY);

      // Optional Ground Perspective Grid Lines
      if (showGrid) {
        ctx.strokeStyle = 'rgba(6, 182, 212, 0.12)';
        ctx.lineWidth = 1;
        const vanishingX = width * 0.5;

        for (let x = -width; x <= width * 2; x += 120) {
          ctx.beginPath();
          ctx.moveTo(vanishingX, horizonY);
          ctx.lineTo(x, height);
          ctx.stroke();
        }

        for (let d = 0; d < 8; d++) {
          const y = horizonY + Math.pow(d / 8, 2.2) * (height - horizonY);
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(width, y);
          ctx.stroke();
        }
      }

      // Border perimeter barrier line
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.3)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, horizonY + 25);
      ctx.lineTo(width, horizonY + 25);
      ctx.stroke();
    }

    // Draw Registered Pillars & Selected Points
    pillars.forEach((p) => {
      const isSelected = p.id === activePillarId;
      const topPt = p.image_points?.find((pt) => pt.point_type === 'TOP');
      const basePt = p.image_points?.find((pt) => pt.point_type === 'BASE');

      // Connecting post line
      if (topPt && basePt) {
        ctx.strokeStyle = isSelected ? 'var(--cyan-400)' : 'rgba(255, 255, 255, 0.4)';
        ctx.lineWidth = isSelected ? 2.5 : 1.5;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(topPt.pixel_x, topPt.pixel_y);
        ctx.lineTo(basePt.pixel_x, basePt.pixel_y);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // BASE Point (Green Circle)
      if (basePt) {
        ctx.fillStyle = '#10b981';
        ctx.beginPath();
        ctx.arc(basePt.pixel_x, basePt.pixel_y, isSelected ? 7 : 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = '#34d399';
        ctx.font = 'bold 11px "JetBrains Mono"';
        ctx.fillText(`${p.pillar_id} BASE (Z=0)`, basePt.pixel_x + 10, basePt.pixel_y + 14);
      }

      // TOP Point (Cyan Circle)
      if (topPt) {
        ctx.fillStyle = '#06b6d4';
        ctx.beginPath();
        ctx.arc(topPt.pixel_x, topPt.pixel_y, isSelected ? 7 : 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = '#22d3ee';
        ctx.font = 'bold 11px "JetBrains Mono"';
        ctx.fillText(`${p.pillar_id} TOP (Z=${p.height || 2.5}m)`, topPt.pixel_x + 10, topPt.pixel_y - 4);
      }
    });

    // Draw Reprojected validation points if available
    if (calibrationDetails?.point_errors) {
      calibrationDetails.point_errors.forEach((errPt) => {
        if (errPt.reprojected_pixel_x && errPt.reprojected_pixel_y) {
          ctx.strokeStyle = '#f59e0b';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(errPt.reprojected_pixel_x, errPt.reprojected_pixel_y, 9, 0, Math.PI * 2);
          ctx.stroke();
        }
      });
    }

    // Draw Last Localization Test Marker
    if (lastTestPixel) {
      ctx.strokeStyle = '#ec4899';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(lastTestPixel.x, lastTestPixel.y, 10, 0, Math.PI * 2);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(lastTestPixel.x - 14, lastTestPixel.y);
      ctx.lineTo(lastTestPixel.x + 14, lastTestPixel.y);
      ctx.moveTo(lastTestPixel.x, lastTestPixel.y - 14);
      ctx.lineTo(lastTestPixel.x, lastTestPixel.y + 14);
      ctx.stroke();

      if (testResult) {
        ctx.fillStyle = '#f472b6';
        ctx.font = 'bold 11px "JetBrains Mono"';
        ctx.fillText(
          `TARGET: ${testResult.local_position.x}m E, ${testResult.local_position.y}m N (${testResult.distance_m}m)`,
          lastTestPixel.x + 14,
          lastTestPixel.y - 8
        );
      }
    }

    // Viewport Framing Crosshairs
    const cl = 20;
    ctx.strokeStyle = 'rgba(6, 182, 212, 0.4)';
    ctx.lineWidth = 1;
    // Corners
    ctx.beginPath(); ctx.moveTo(15, 15 + cl); ctx.lineTo(15, 15); ctx.lineTo(15 + cl, 15); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(width - 15 - cl, 15); ctx.lineTo(width - 15, 15); ctx.lineTo(width - 15, 15 + cl); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(15, height - 15 - cl); ctx.lineTo(15, height - 15); ctx.lineTo(15 + cl, height - 15); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(width - 15 - cl, height - 15); ctx.lineTo(width - 15, height - 15); ctx.lineTo(width - 15, height - 15 - cl); ctx.stroke();
  }, [pillars, activePillarId, camForm.pitch, showGrid, calibrationDetails, lastTestPixel, testResult, useLiveVideo, streamActive]);

  // Pillar points summary
  const groundPointsCount = pillars.filter((p) =>
    p.image_points?.some((pt) => pt.point_type === 'BASE')
  ).length;
  const isReadyToCalibrate = groundPointsCount >= 4;

  const activePillar = pillars.find((p) => p.id === activePillarId);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Hidden Video element for WebRTC feed */}
      <video ref={videoRef} autoPlay playsInline muted style={{ display: 'none' }} />

      {/* ==================== STEP 1: CAMERA SELECTOR & STATUS ==================== */}
      <div
        className="glass-panel"
        style={{
          padding: '1.25rem 1.5rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <div>
            <label className="form-label" style={{ display: 'block', marginBottom: '0.25rem' }}>
              STEP 1 — Target Camera:
            </label>
            <select
              value={selectedCameraId}
              onChange={(e) => setSelectedCameraId(e.target.value)}
              className="form-select font-mono"
              style={{ minWidth: '260px', fontWeight: 600 }}
              disabled={loading || cameras.length === 0}
            >
              {cameras.map((c) => (
                <option key={c.id} value={c.camera_id}>
                  {c.camera_id} — {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Calibration Status Badge */}
          <div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Calibration Status
            </div>
            <div style={{ marginTop: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  padding: '0.35rem 0.75rem',
                  borderRadius: 'var(--radius-full)',
                  background:
                    calibrationDetails?.is_valid || calibrationDetails?.calibration_status === 'calibrated'
                      ? 'rgba(16, 185, 129, 0.15)'
                      : 'rgba(245, 158, 11, 0.15)',
                  border: `1px solid ${
                    calibrationDetails?.is_valid || calibrationDetails?.calibration_status === 'calibrated'
                      ? 'rgba(16, 185, 129, 0.4)'
                      : 'rgba(245, 158, 11, 0.4)'
                  }`,
                  color:
                    calibrationDetails?.is_valid || calibrationDetails?.calibration_status === 'calibrated'
                      ? 'var(--emerald-400)'
                      : 'var(--amber-400)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                }}
              >
                {calibrationDetails?.is_valid || calibrationDetails?.calibration_status === 'calibrated' ? (
                  <>
                    <ShieldCheck size={14} />
                    <span>CALIBRATED</span>
                  </>
                ) : (
                  <>
                    <AlertTriangle size={14} />
                    <span>NOT CALIBRATED</span>
                  </>
                )}
              </span>

              {calibrationDetails?.reprojection_error_rmse && (
                <span className="font-mono" style={{ fontSize: '0.75rem', color: 'var(--cyan-400)' }}>
                  RMSE: {calibrationDetails.reprojection_error_rmse}m
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Live Stream / Capture Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <button
            type="button"
            onClick={() => setUseLiveVideo(!useLiveVideo)}
            className="btn btn-secondary"
            style={{ fontSize: '0.8rem', padding: '0.45rem 0.85rem' }}
          >
            <Video size={15} color={streamActive ? 'var(--emerald-400)' : 'var(--text-muted)'} />
            <span>{useLiveVideo ? (streamActive ? 'Live Stream Connected' : 'Connecting Stream...') : 'Connect Phone Stream'}</span>
          </button>
          {useLiveVideo && streamActive && (
            <button
              type="button"
              onClick={handleSnapshotFrame}
              className="btn btn-primary"
              style={{ fontSize: '0.8rem', padding: '0.45rem 0.85rem' }}
            >
              <Camera size={15} />
              <span>Snapshot Frame</span>
            </button>
          )}
        </div>
      </div>

      {/* ==================== STEP 2: CAMERA PARAMETERS ACCORDION ==================== */}
      <div className="glass-panel" style={{ padding: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Sliders size={16} color="var(--cyan-400)" />
            <h4 style={{ fontSize: '0.9rem', fontWeight: 600 }}>
              STEP 2 — Camera Installation & Physical Orientation Parameters
            </h4>
          </div>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
            Used for ray-ground intersection & 3D pose validation
          </span>
        </div>

        <form onSubmit={handleSaveCameraParams}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.75rem' }}>
            <div>
              <label className="form-label" style={{ fontSize: '0.75rem' }}>Height Above Ground (m)</label>
              <input
                type="number"
                step="any"
                required
                className="form-input font-mono"
                style={{ fontSize: '0.8rem', padding: '0.4rem 0.6rem' }}
                value={camForm.height}
                onChange={(e) => setCamForm({ ...camForm, height: e.target.value })}
              />
            </div>
            <div>
              <label className="form-label" style={{ fontSize: '0.75rem' }}>Camera Latitude (°)</label>
              <input
                type="number"
                step="any"
                required
                className="form-input font-mono"
                style={{ fontSize: '0.8rem', padding: '0.4rem 0.6rem' }}
                value={camForm.latitude}
                onChange={(e) => setCamForm({ ...camForm, latitude: e.target.value })}
              />
            </div>
            <div>
              <label className="form-label" style={{ fontSize: '0.75rem' }}>Camera Longitude (°)</label>
              <input
                type="number"
                step="any"
                required
                className="form-input font-mono"
                style={{ fontSize: '0.8rem', padding: '0.4rem 0.6rem' }}
                value={camForm.longitude}
                onChange={(e) => setCamForm({ ...camForm, longitude: e.target.value })}
              />
            </div>
            <div>
              <label className="form-label" style={{ fontSize: '0.75rem' }}>Yaw Heading (° North=0)</label>
              <input
                type="number"
                step="any"
                className="form-input font-mono"
                style={{ fontSize: '0.8rem', padding: '0.4rem 0.6rem' }}
                value={camForm.yaw}
                onChange={(e) => setCamForm({ ...camForm, yaw: e.target.value })}
              />
            </div>
            <div>
              <label className="form-label" style={{ fontSize: '0.75rem' }}>Pitch Tilt (° Down=-18)</label>
              <input
                type="number"
                step="any"
                className="form-input font-mono"
                style={{ fontSize: '0.8rem', padding: '0.4rem 0.6rem' }}
                value={camForm.pitch}
                onChange={(e) => setCamForm({ ...camForm, pitch: e.target.value })}
              />
            </div>
            <div>
              <label className="form-label" style={{ fontSize: '0.75rem' }}>Roll Tilt (°)</label>
              <input
                type="number"
                step="any"
                className="form-input font-mono"
                style={{ fontSize: '0.8rem', padding: '0.4rem 0.6rem' }}
                value={camForm.roll}
                onChange={(e) => setCamForm({ ...camForm, roll: e.target.value })}
              />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.75rem' }}>
            <button
              type="submit"
              className="btn btn-secondary"
              style={{ fontSize: '0.75rem', padding: '0.35rem 0.85rem' }}
              disabled={savingCamParams}
            >
              {savingCamParams ? 'Saving...' : 'Save Camera Placement'}
            </button>
          </div>
        </form>
      </div>

      {/* ==================== WORKSPACE: VIEWPORT (LEFT) & PILLARS (RIGHT) ==================== */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.85fr) minmax(320px, 1fr)', gap: '1.5rem' }}>
        {/* Left Column: Interactive Viewport / Canvas */}
        <div className="glass-panel" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          {/* Viewport Top Bar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Crosshair size={18} color="var(--cyan-400)" />
              <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>
                {interactionMode === 'CALIBRATE' ? 'STEP 4 — Interactive Point Selection' : 'STEP 14 — Pixel Localization Tester'}
              </h3>
            </div>

            {/* Interaction Mode Toggle */}
            <div style={{ display: 'inline-flex', background: 'var(--bg-darkest)', padding: '0.2rem', borderRadius: 'var(--radius-sm)' }}>
              <button
                type="button"
                onClick={() => setInteractionMode('CALIBRATE')}
                style={{
                  padding: '0.3rem 0.75rem',
                  fontSize: '0.75rem',
                  borderRadius: 'var(--radius-sm)',
                  border: 'none',
                  background: interactionMode === 'CALIBRATE' ? 'rgba(6, 182, 212, 0.25)' : 'transparent',
                  color: interactionMode === 'CALIBRATE' ? 'var(--cyan-400)' : 'var(--text-secondary)',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Mark Pillars
              </button>
              <button
                type="button"
                onClick={() => setInteractionMode('TEST_LOCALIZE')}
                style={{
                  padding: '0.3rem 0.75rem',
                  fontSize: '0.75rem',
                  borderRadius: 'var(--radius-sm)',
                  border: 'none',
                  background: interactionMode === 'TEST_LOCALIZE' ? 'rgba(236, 72, 153, 0.25)' : 'transparent',
                  color: interactionMode === 'TEST_LOCALIZE' ? '#f472b6' : 'var(--text-secondary)',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Test Localization (GPS)
              </button>
            </div>
          </div>

          {/* Interactive Canvas Viewport */}
          <div
            style={{
              position: 'relative',
              borderRadius: 'var(--radius-md)',
              overflow: 'hidden',
              border: '1px solid var(--border-medium)',
              cursor: interactionMode === 'TEST_LOCALIZE' ? 'pointer' : 'crosshair',
              background: '#070a10',
            }}
          >
            <canvas
              ref={canvasRef}
              width={1280}
              height={720}
              style={{ width: '100%', height: 'auto', display: 'block' }}
              onMouseMove={handleCanvasMouseMove}
              onClick={handleCanvasClick}
            />

            {/* Viewport Overlay Controls */}
            {interactionMode === 'CALIBRATE' && (
              <div
                style={{
                  position: 'absolute',
                  top: '12px',
                  left: '12px',
                  display: 'flex',
                  gap: '0.4rem',
                  background: 'rgba(11, 15, 23, 0.88)',
                  backdropFilter: 'blur(8px)',
                  padding: '0.35rem 0.5rem',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <button
                  type="button"
                  onClick={() => setPointMode('BASE')}
                  style={{
                    padding: '0.3rem 0.75rem',
                    fontSize: '0.75rem',
                    borderRadius: 'var(--radius-sm)',
                    border: 'none',
                    background: pointMode === 'BASE' ? 'var(--emerald-500)' : 'transparent',
                    color: pointMode === 'BASE' ? '#070a10' : 'var(--text-secondary)',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  BASE Point (Z = 0)
                </button>
                <button
                  type="button"
                  onClick={() => setPointMode('TOP')}
                  style={{
                    padding: '0.3rem 0.75rem',
                    fontSize: '0.75rem',
                    borderRadius: 'var(--radius-sm)',
                    border: 'none',
                    background: pointMode === 'TOP' ? 'var(--cyan-500)' : 'transparent',
                    color: pointMode === 'TOP' ? '#070a10' : 'var(--text-secondary)',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  TOP Point (Z = Height)
                </button>
              </div>
            )}

            {/* Grid & Snapshot Controls */}
            <div
              style={{
                position: 'absolute',
                top: '12px',
                right: '12px',
                display: 'flex',
                gap: '0.4rem',
                background: 'rgba(11, 15, 23, 0.85)',
                backdropFilter: 'blur(8px)',
                padding: '0.3rem 0.5rem',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <button
                type="button"
                onClick={() => setShowGrid(!showGrid)}
                className="btn btn-secondary"
                style={{ padding: '0.25rem 0.5rem', fontSize: '0.72rem' }}
                title="Toggle Perspective Grid"
              >
                Grid: {showGrid ? 'ON' : 'OFF'}
              </button>
              {frozenFrameRef.current && (
                <button
                  type="button"
                  onClick={() => {
                    frozenFrameRef.current = null;
                    showToast?.({ type: 'info', message: 'Cleared frozen snapshot.' });
                  }}
                  className="btn btn-secondary"
                  style={{ padding: '0.25rem 0.5rem', fontSize: '0.72rem', color: 'var(--rose-400)' }}
                >
                  Clear Snapshot
                </button>
              )}
            </div>

            {/* Viewport Bottom Bar info */}
            <div
              style={{
                position: 'absolute',
                bottom: '12px',
                left: '12px',
                right: '12px',
                background: 'rgba(11, 15, 23, 0.88)',
                backdropFilter: 'blur(8px)',
                padding: '0.5rem 0.85rem',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-subtle)',
                fontSize: '0.75rem',
                color: 'var(--text-secondary)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span>
                {interactionMode === 'TEST_LOCALIZE' ? (
                  <span style={{ color: '#f472b6', fontWeight: 600 }}>
                    🎯 Localization Mode: Click anywhere on ground to compute East/North position & GPS coordinates
                  </span>
                ) : activePillar ? (
                  <>
                    Click canvas to register <strong style={{ color: pointMode === 'TOP' ? 'var(--cyan-400)' : 'var(--emerald-400)' }}>{pointMode}</strong> point for{' '}
                    <strong style={{ color: '#fff' }}>{activePillar.pillar_id}</strong>
                  </>
                ) : (
                  'Select or create a reference pillar on the right to start clicking coordinates'
                )}
              </span>
              <span className="font-mono" style={{ color: 'var(--cyan-400)' }}>
                X: {mousePos.x}px | Y: {mousePos.y}px
              </span>
            </div>
          </div>

          {/* ==================== STEP 5 & 6: CALCULATION BUTTON & STATUS ==================== */}
          <div
            style={{
              padding: '0.85rem 1.15rem',
              borderRadius: 'var(--radius-md)',
              background: isReadyToCalibrate ? 'rgba(16, 185, 129, 0.08)' : 'rgba(245, 158, 11, 0.08)',
              border: `1px solid ${isReadyToCalibrate ? 'rgba(16, 185, 129, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '1rem',
            }}
          >
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.85rem', color: isReadyToCalibrate ? 'var(--emerald-400)' : 'var(--amber-400)' }}>
                {isReadyToCalibrate
                  ? `STEP 5: Ground Reference Points: ${groundPointsCount} registered (Ready to Calibrate)`
                  : `STEP 5: Minimum 4 ground reference points required (Currently: ${groundPointsCount}/4)`}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                Recommended: 5–8 reference points for optimal RANSAC homography precision.
              </div>
            </div>

            <button
              type="button"
              onClick={handleCalculateCalibration}
              className="btn btn-primary"
              style={{ padding: '0.6rem 1.4rem', fontWeight: 600 }}
              disabled={!isReadyToCalibrate || calculating}
            >
              <Crosshair size={16} />
              <span>{calculating ? 'Calculating Homography...' : 'STEP 6 — Calculate Calibration'}</span>
            </button>
          </div>

          {/* ==================== STEP 14: LOCALIZATION TEST RESULTS PANEL ==================== */}
          {testResult && (
            <div
              className="glass-panel"
              style={{
                padding: '1.25rem',
                border: '1px solid rgba(236, 72, 153, 0.3)',
                background: 'linear-gradient(135deg, rgba(24, 15, 30, 0.95), rgba(18, 12, 24, 0.85))',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Navigation size={16} color="#f472b6" />
                  <h4 style={{ fontSize: '0.9rem', fontWeight: 600, color: '#f472b6' }}>
                    STEP 14 — Ground Localization Result (Pixel → Real World)
                  </h4>
                </div>
                <span className="font-mono" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Pixel: ({testResult.pixel.pixel_x}, {testResult.pixel.pixel_y})
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
                {/* Local Ground Position */}
                <div style={{ background: 'var(--bg-darkest)', padding: '0.65rem 0.85rem', borderRadius: 'var(--radius-sm)' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                    Ground Position (Local ENU)
                  </div>
                  <div className="font-mono" style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--cyan-400)', marginTop: '0.2rem' }}>
                    X: {testResult.local_position.x}m East
                  </div>
                  <div className="font-mono" style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--cyan-400)' }}>
                    Y: {testResult.local_position.y}m North
                  </div>
                </div>

                {/* Distance from Camera */}
                <div style={{ background: 'var(--bg-darkest)', padding: '0.65rem 0.85rem', borderRadius: 'var(--radius-sm)' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                    Distance from Camera
                  </div>
                  <div className="font-mono" style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--emerald-400)', marginTop: '0.2rem' }}>
                    {testResult.distance_m} m
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Horizontal distance</div>
                </div>

                {/* Real-World GPS */}
                <div style={{ background: 'var(--bg-darkest)', padding: '0.65rem 0.85rem', borderRadius: 'var(--radius-sm)' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                    WGS84 GPS Coordinates
                  </div>
                  <div className="font-mono" style={{ fontSize: '0.825rem', color: 'var(--text-primary)', marginTop: '0.2rem' }}>
                    Lat: {testResult.gps.latitude.toFixed(7)}°
                  </div>
                  <div className="font-mono" style={{ fontSize: '0.825rem', color: 'var(--text-primary)' }}>
                    Lon: {testResult.gps.longitude.toFixed(7)}°
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard?.writeText(`${testResult.gps.latitude}, ${testResult.gps.longitude}`);
                      setCopiedGps(true);
                      setTimeout(() => setCopiedGps(false), 2000);
                    }}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: copiedGps ? 'var(--emerald-400)' : 'var(--cyan-400)',
                      cursor: 'pointer',
                      fontSize: '0.7rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.25rem',
                      marginTop: '0.3rem',
                      padding: 0,
                    }}
                  >
                    {copiedGps ? <Check size={12} /> : <Copy size={12} />}
                    <span>{copiedGps ? 'Copied' : 'Copy GPS'}</span>
                  </button>
                </div>

                {/* Absolute Direction / Bearing */}
                <div style={{ background: 'var(--bg-darkest)', padding: '0.65rem 0.85rem', borderRadius: 'var(--radius-sm)' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                    Absolute Earth Bearing
                  </div>
                  <div className="font-mono" style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--amber-400)', marginTop: '0.2rem' }}>
                    {(((Math.atan2(testResult.local_position.x, testResult.local_position.y) * 180 / Math.PI) + 360) % 360).toFixed(2)}°
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>0°=North, 90°=East</div>
                </div>
              </div>
            </div>
          )}

          {/* ==================== STEP 19: TWO-FRAME MOTION CALCULATION PANEL ==================== */}
          <div
            className="glass-panel"
            style={{
              padding: '1.25rem',
              border: '1px solid rgba(6, 182, 212, 0.3)',
              background: 'linear-gradient(135deg, rgba(8, 20, 36, 0.95), rgba(6, 14, 26, 0.85))',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Compass size={16} color="var(--cyan-400)" />
                <h4 style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--cyan-400)' }}>
                  STEP 19 — Two-Frame Motion Analysis (Speed & Movement Direction)
                </h4>
              </div>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                Planar displacement (No acceleration, No 3D distance)
              </span>
            </div>

            <form onSubmit={handleCalculateMotion}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.85rem', marginBottom: '0.75rem' }}>
                {/* Frame 1 */}
                <div style={{ background: 'var(--bg-darkest)', padding: '0.65rem 0.85rem', borderRadius: 'var(--radius-sm)' }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--cyan-400)', marginBottom: '0.4rem' }}>
                    Observation Frame 1 (t₁)
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.4rem' }}>
                    <div>
                      <label className="form-label" style={{ fontSize: '0.65rem' }}>Pixel X₁</label>
                      <input
                        type="number"
                        step="any"
                        className="form-input font-mono"
                        style={{ fontSize: '0.75rem', padding: '0.3rem' }}
                        value={motionForm.p1_x}
                        onChange={(e) => setMotionForm({ ...motionForm, p1_x: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="form-label" style={{ fontSize: '0.65rem' }}>Pixel Y₁</label>
                      <input
                        type="number"
                        step="any"
                        className="form-input font-mono"
                        style={{ fontSize: '0.75rem', padding: '0.3rem' }}
                        value={motionForm.p1_y}
                        onChange={(e) => setMotionForm({ ...motionForm, p1_y: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="form-label" style={{ fontSize: '0.65rem' }}>Time t₁ (s)</label>
                      <input
                        type="number"
                        step="any"
                        className="form-input font-mono"
                        style={{ fontSize: '0.75rem', padding: '0.3rem' }}
                        value={motionForm.t1}
                        onChange={(e) => setMotionForm({ ...motionForm, t1: e.target.value })}
                      />
                    </div>
                  </div>
                </div>

                {/* Frame 2 */}
                <div style={{ background: 'var(--bg-darkest)', padding: '0.65rem 0.85rem', borderRadius: 'var(--radius-sm)' }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#f472b6', marginBottom: '0.4rem' }}>
                    Observation Frame 2 (t₂)
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.4rem' }}>
                    <div>
                      <label className="form-label" style={{ fontSize: '0.65rem' }}>Pixel X₂</label>
                      <input
                        type="number"
                        step="any"
                        className="form-input font-mono"
                        style={{ fontSize: '0.75rem', padding: '0.3rem' }}
                        value={motionForm.p2_x}
                        onChange={(e) => setMotionForm({ ...motionForm, p2_x: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="form-label" style={{ fontSize: '0.65rem' }}>Pixel Y₂</label>
                      <input
                        type="number"
                        step="any"
                        className="form-input font-mono"
                        style={{ fontSize: '0.75rem', padding: '0.3rem' }}
                        value={motionForm.p2_y}
                        onChange={(e) => setMotionForm({ ...motionForm, p2_y: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="form-label" style={{ fontSize: '0.65rem' }}>Time t₂ (s)</label>
                      <input
                        type="number"
                        step="any"
                        className="form-input font-mono"
                        style={{ fontSize: '0.75rem', padding: '0.3rem' }}
                        value={motionForm.t2}
                        onChange={(e) => setMotionForm({ ...motionForm, t2: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.75rem' }}>
                <button
                  type="submit"
                  className="btn btn-secondary"
                  style={{ fontSize: '0.75rem', padding: '0.4rem 0.9rem' }}
                  disabled={calculatingMotion}
                >
                  <Zap size={14} color="var(--amber-400)" />
                  <span>{calculatingMotion ? 'Computing Motion...' : 'Compute Ground Motion & Speed'}</span>
                </button>
              </div>
            </form>

            {/* Motion Results Output */}
            {motionResult && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.65rem', borderTop: '1px solid var(--border-subtle)', paddingTop: '0.75rem' }}>
                <div style={{ background: 'var(--bg-darkest)', padding: '0.55rem', borderRadius: 'var(--radius-sm)' }}>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Distance Travelled</div>
                  <div className="font-mono" style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--cyan-400)' }}>
                    {motionResult.displacement.distance_travelled_m} m
                  </div>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>ΔE: {motionResult.displacement.delta_east_m}m, ΔN: {motionResult.displacement.delta_north_m}m</div>
                </div>

                <div style={{ background: 'var(--bg-darkest)', padding: '0.55rem', borderRadius: 'var(--radius-sm)' }}>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Ground Speed</div>
                  <div className="font-mono" style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--emerald-400)' }}>
                    {motionResult.speed.kmh} km/h
                  </div>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{motionResult.speed.mps} m/s (Δt: {motionResult.time_interval_s}s)</div>
                </div>

                <div style={{ background: 'var(--bg-darkest)', padding: '0.55rem', borderRadius: 'var(--radius-sm)' }}>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Movement Direction (Travel)</div>
                  <div className="font-mono" style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--amber-400)' }}>
                    {motionResult.movement_direction_deg}°
                  </div>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Heading Pos₁ → Pos₂</div>
                </div>

                <div style={{ background: 'var(--bg-darkest)', padding: '0.55rem', borderRadius: 'var(--radius-sm)' }}>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Camera Bearing (Cam→Obj)</div>
                  <div className="font-mono" style={{ fontSize: '0.825rem', color: 'var(--text-secondary)' }}>
                    F1: {motionResult.frame_1.bearing_from_camera_deg}°
                  </div>
                  <div className="font-mono" style={{ fontSize: '0.825rem', color: 'var(--text-secondary)' }}>
                    F2: {motionResult.frame_2.bearing_from_camera_deg}°
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Reference Pillars List & Calibration Quality */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* STEP 3: Reference Pillars Card */}
          <div className="glass-panel" style={{ padding: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
              <div>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 600 }}>
                  STEP 3 — Reference Pillars ({pillars.length}/4 max)
                </h3>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  P1..P4 (Base Z=0, Top Z=H). Click pillar to set points on canvas
                </span>
              </div>
              <button
                type="button"
                disabled={pillars.length >= 4}
                onClick={() => {
                  const nextIdx = pillars.length + 1;
                  setPillarForm({
                    pillar_id: `P${nextIdx}`,
                    name: `Reference Pillar ${nextIdx}`,
                    height: '2.5',
                    x_distance: `${(nextIdx - 2) * 15}.0`,
                    y_distance: `${20.0 + nextIdx * 8}`,
                    latitude: '',
                    longitude: '',
                  });
                  setIsAddPillarOpen(true);
                }}
                className="btn btn-outline-cyan"
                style={{
                  fontSize: '0.75rem',
                  padding: '0.35rem 0.65rem',
                  opacity: pillars.length >= 4 ? 0.5 : 1,
                  cursor: pillars.length >= 4 ? 'not-allowed' : 'pointer',
                }}
                title={pillars.length >= 4 ? 'Maximum 4 reference pillars (P1..P4) allowed' : 'Add reference pillar'}
              >
                <Plus size={14} />
                <span>{pillars.length >= 4 ? 'Max 4 Pillars' : 'Add Pillar'}</span>
              </button>
            </div>

            {pillars.length === 0 ? (
              <div
                style={{
                  padding: '1.5rem',
                  textAlign: 'center',
                  background: 'var(--bg-darkest)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px dashed var(--border-subtle)',
                  color: 'var(--text-muted)',
                  fontSize: '0.8rem',
                }}
              >
                No reference pillars configured. Click "+ Add Pillar" to add ground points.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '340px', overflowY: 'auto' }}>
                {pillars.map((p) => {
                  const isSelected = p.id === activePillarId;
                  const topPt = p.image_points?.find((pt) => pt.point_type === 'TOP');
                  const basePt = p.image_points?.find((pt) => pt.point_type === 'BASE');

                  return (
                    <div
                      key={p.id}
                      onClick={() => setActivePillarId(p.id)}
                      style={{
                        padding: '0.75rem',
                        borderRadius: 'var(--radius-md)',
                        background: isSelected ? 'rgba(6, 182, 212, 0.12)' : 'var(--bg-darkest)',
                        border: isSelected ? '1px solid var(--cyan-500)' : '1px solid var(--border-subtle)',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span className="font-mono" style={{ fontWeight: 700, color: 'var(--cyan-400)', fontSize: '0.85rem' }}>
                          {p.pillar_id}
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                            Height: {p.height || 2.5}m
                          </span>
                          <button
                            type="button"
                            onClick={async (e) => {
                              e.stopPropagation();
                              if (window.confirm(`Delete pillar ${p.pillar_id}?`)) {
                                await pillarApi.delete(p.id);
                                loadCameraDetails(selectedCameraId);
                              }
                            }}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: 'var(--rose-400)',
                              cursor: 'pointer',
                              padding: '2px',
                            }}
                            title="Delete Pillar"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>

                      <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
                        {p.name}
                      </div>

                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', margin: '0.25rem 0' }}>
                        Local: X: {p.x_distance !== null ? `${p.x_distance}m` : '—'} | Y: {p.y_distance !== null ? `${p.y_distance}m` : '—'}
                      </div>

                      {/* BASE & TOP point status */}
                      <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.35rem' }}>
                        <span
                          style={{
                            fontSize: '0.68rem',
                            padding: '0.15rem 0.45rem',
                            borderRadius: 'var(--radius-sm)',
                            background: basePt ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                            color: basePt ? 'var(--emerald-400)' : 'var(--text-muted)',
                            fontFamily: 'var(--font-mono)',
                            fontWeight: 600,
                          }}
                        >
                          BASE: {basePt ? `(${Math.round(basePt.pixel_x)}, ${Math.round(basePt.pixel_y)})` : 'Unset'}
                        </span>
                        <span
                          style={{
                            fontSize: '0.68rem',
                            padding: '0.15rem 0.45rem',
                            borderRadius: 'var(--radius-sm)',
                            background: topPt ? 'rgba(6, 182, 212, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                            color: topPt ? 'var(--cyan-400)' : 'var(--text-muted)',
                            fontFamily: 'var(--font-mono)',
                            fontWeight: 600,
                          }}
                        >
                          TOP: {topPt ? `(${Math.round(topPt.pixel_x)}, ${Math.round(topPt.pixel_y)})` : 'Unset'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ==================== STEP 12: CALIBRATION QUALITY RESULTS ==================== */}
          <div className="glass-panel" style={{ padding: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Activity size={16} color="var(--cyan-400)" />
                <h4 style={{ fontSize: '0.9rem', fontWeight: 600 }}>Calibration Quality Metrics</h4>
              </div>
              <span
                style={{
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  color: calibrationDetails?.is_valid ? 'var(--emerald-400)' : 'var(--amber-400)',
                }}
              >
                {calibrationDetails?.is_valid ? 'VALID' : 'PENDING'}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0.6rem', background: 'var(--bg-darkest)', borderRadius: 'var(--radius-sm)' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Calibration Status:</span>
                <span className="font-mono" style={{ fontSize: '0.75rem', color: calibrationDetails?.calibration_status === 'calibrated' || calibrationDetails?.is_valid ? 'var(--emerald-400)' : 'var(--amber-400)', fontWeight: 700, textTransform: 'uppercase' }}>
                  {calibrationDetails?.calibration_status || (calibrationDetails?.is_valid ? 'calibrated' : 'uncalibrated')}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0.6rem', background: 'var(--bg-darkest)', borderRadius: 'var(--radius-sm)' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Camera Height:</span>
                <span className="font-mono" style={{ fontSize: '0.75rem', color: 'var(--text-primary)', fontWeight: 600 }}>
                  {calibrationDetails?.camera_height !== undefined && calibrationDetails?.camera_height !== null ? `${calibrationDetails.camera_height} m` : (camForm.height ? `${camForm.height} m` : '—')}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0.6rem', background: 'var(--bg-darkest)', borderRadius: 'var(--radius-sm)' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Reference Pillars:</span>
                <span className="font-mono" style={{ fontSize: '0.75rem', color: 'var(--text-primary)', fontWeight: 600 }}>
                  {calibrationDetails?.reference_pillar_count ?? calibrationDetails?.num_reference_points ?? pillars.length} / 4 max
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0.6rem', background: 'var(--bg-darkest)', borderRadius: 'var(--radius-sm)' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Reprojection RMSE:</span>
                <span className="font-mono" style={{ fontSize: '0.75rem', color: 'var(--emerald-400)', fontWeight: 700 }}>
                  {calibrationDetails?.reprojection_error_rmse !== null && calibrationDetails?.reprojection_error_rmse !== undefined ? `${calibrationDetails.reprojection_error_rmse} m` : '—'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0.6rem', background: 'var(--bg-darkest)', borderRadius: 'var(--radius-sm)' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Maximum Error:</span>
                <span className="font-mono" style={{ fontSize: '0.75rem', color: 'var(--amber-400)', fontWeight: 600 }}>
                  {calibrationDetails?.reprojection_error_max !== null && calibrationDetails?.reprojection_error_max !== undefined ? `${calibrationDetails.reprojection_error_max} m` : '—'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0.6rem', background: calibrationDetails?.highest_error_pillar ? 'rgba(239, 68, 68, 0.1)' : 'var(--bg-darkest)', border: calibrationDetails?.highest_error_pillar ? '1px solid rgba(239, 68, 68, 0.25)' : 'none', borderRadius: 'var(--radius-sm)' }}>
                <span style={{ fontSize: '0.75rem', color: calibrationDetails?.highest_error_pillar ? 'var(--rose-400)' : 'var(--text-muted)', fontWeight: calibrationDetails?.highest_error_pillar ? 600 : 400 }}>Highest-Error Pillar:</span>
                <span className="font-mono" style={{ fontSize: '0.75rem', color: calibrationDetails?.highest_error_pillar ? 'var(--rose-400)' : 'var(--text-secondary)', fontWeight: 700 }}>
                  {calibrationDetails?.highest_error_pillar ? `${calibrationDetails.highest_error_pillar} (${calibrationDetails.highest_error_meters} m)` : '—'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0.6rem', background: 'var(--bg-darkest)', borderRadius: 'var(--radius-sm)' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Estimated Yaw:</span>
                <span className="font-mono" style={{ fontSize: '0.75rem', color: 'var(--cyan-400)' }}>
                  {calibrationDetails?.pose_data?.estimated_yaw !== undefined
                    ? `${calibrationDetails.pose_data.estimated_yaw}°`
                    : (calibrationDetails?.yaw !== null && calibrationDetails?.yaw !== undefined ? `${calibrationDetails.yaw}°` : (camForm.yaw ? `${camForm.yaw}°` : '0.0°'))}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0.6rem', background: 'var(--bg-darkest)', borderRadius: 'var(--radius-sm)' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Estimated Pitch:</span>
                <span className="font-mono" style={{ fontSize: '0.75rem', color: 'var(--cyan-400)' }}>
                  {calibrationDetails?.pose_data?.estimated_pitch !== undefined
                    ? `${calibrationDetails.pose_data.estimated_pitch}°`
                    : (calibrationDetails?.pitch !== null && calibrationDetails?.pitch !== undefined ? `${calibrationDetails.pitch}°` : (camForm.pitch ? `${camForm.pitch}°` : '-18.0°'))}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0.6rem', background: 'var(--bg-darkest)', borderRadius: 'var(--radius-sm)' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Estimated Roll:</span>
                <span className="font-mono" style={{ fontSize: '0.75rem', color: 'var(--cyan-400)' }}>
                  {calibrationDetails?.pose_data?.estimated_roll !== undefined
                    ? `${calibrationDetails.pose_data.estimated_roll}°`
                    : (calibrationDetails?.roll !== null && calibrationDetails?.roll !== undefined ? `${calibrationDetails.roll}°` : (camForm.roll ? `${camForm.roll}°` : '0.0°'))}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0.6rem', background: 'var(--bg-darkest)', borderRadius: 'var(--radius-sm)' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>3D Pose Status:</span>
                <span className="font-mono" style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  {calibrationDetails?.pose_estimation_status || 'none'}
                </span>
              </div>
            </div>

            {/* Homography Matrix View Toggle */}
            {calibrationDetails?.h_matrix && (
              <div style={{ marginTop: '0.75rem' }}>
                <button
                  type="button"
                  onClick={() => setShowMatrix(!showMatrix)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--cyan-400)',
                    fontSize: '0.75rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.3rem',
                    padding: 0,
                  }}
                >
                  {showMatrix ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  <span>{showMatrix ? 'Hide Homography Matrix' : 'Inspect 3x3 Homography Matrix'}</span>
                </button>

                {showMatrix && (
                  <div
                    style={{
                      marginTop: '0.5rem',
                      padding: '0.6rem',
                      background: 'var(--bg-darkest)',
                      borderRadius: 'var(--radius-sm)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.68rem',
                      color: 'var(--cyan-300)',
                      lineHeight: 1.5,
                      overflowX: 'auto',
                    }}
                  >
                    {calibrationDetails.h_matrix.map((row, idx) => (
                      <div key={idx}>
                        [{row.map((val) => val.toFixed(5)).join(', ')}]
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ===================== ADD PILLAR MODAL ===================== */}
      <Modal
        isOpen={isAddPillarOpen}
        onClose={() => setIsAddPillarOpen(false)}
        title="Add Reference Border Pillar"
        subtitle={`Register known ground reference post for camera: ${selectedCameraId}`}
      >
        <form onSubmit={handleAddPillarSubmit}>
          <div className="form-group">
            <label className="form-label">Pillar Identifier *</label>
            <input
              type="text"
              required
              className="form-input font-mono"
              placeholder="e.g. P1, BP_01"
              value={pillarForm.pillar_id}
              onChange={(e) => setPillarForm({ ...pillarForm, pillar_id: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Pillar Name / Label *</label>
            <input
              type="text"
              required
              className="form-input"
              placeholder="e.g. Border Demarcation Post 1"
              value={pillarForm.name}
              onChange={(e) => setPillarForm({ ...pillarForm, name: e.target.value })}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem' }}>
            <div className="form-group">
              <label className="form-label">Height (m) *</label>
              <input
                type="number"
                step="any"
                required
                className="form-input font-mono"
                placeholder="2.5"
                value={pillarForm.height}
                onChange={(e) => setPillarForm({ ...pillarForm, height: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label className="form-label">X East (m)</label>
              <input
                type="number"
                step="any"
                className="form-input font-mono"
                placeholder="0.0"
                value={pillarForm.x_distance}
                onChange={(e) => setPillarForm({ ...pillarForm, x_distance: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Y North (m)</label>
              <input
                type="number"
                step="any"
                className="form-input font-mono"
                placeholder="25.0"
                value={pillarForm.y_distance}
                onChange={(e) => setPillarForm({ ...pillarForm, y_distance: e.target.value })}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div className="form-group">
              <label className="form-label">Latitude (° Optional)</label>
              <input
                type="number"
                step="any"
                className="form-input font-mono"
                placeholder="32.7163"
                value={pillarForm.latitude}
                onChange={(e) => setPillarForm({ ...pillarForm, latitude: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Longitude (° Optional)</label>
              <input
                type="number"
                step="any"
                className="form-input font-mono"
                placeholder="74.8564"
                value={pillarForm.longitude}
                onChange={(e) => setPillarForm({ ...pillarForm, longitude: e.target.value })}
              />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.25rem' }}>
            <button
              type="button"
              onClick={() => setIsAddPillarOpen(false)}
              className="btn btn-secondary"
              disabled={submittingPillar}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={submittingPillar}>
              {submittingPillar ? 'Adding...' : 'Add Pillar'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
