import React, { useState, useEffect, useRef } from 'react';
import {
  MapPin,
  Clock,
  TrendingUp,
  AlertCircle,
  CheckCircle,
  Crosshair,
  Play,
  Plus,
  Trash2,
  FileCode,
  ShieldCheck,
  Info,
} from 'lucide-react';
import { cameraApi } from '../api/cameraApi';
import { calibrationApi } from '../api/calibrationApi';
import { intrusionApi, validationApi } from '../api/intrusionApi';

export function TestingPage({ showToast, onNavigate }) {
  // Navigation / Mode State
  const [activeMode, setActiveMode] = useState('single'); // 'single' | 'motion' | 'groundtruth' | 'teammate'

  // Cameras & Calibration State
  const [cameras, setCameras] = useState([]);
  const [selectedCameraId, setSelectedCameraId] = useState('');
  const [selectedCamera, setSelectedCamera] = useState(null);
  const [calibrationRecord, setCalibrationRecord] = useState(null);
  const [loadingCamera, setLoadingCamera] = useState(false);

  // Time Interval Configuration (Part 8)
  const [evalInterval, setEvalInterval] = useState(1.0);
  const [savingInterval, setSavingInterval] = useState(false);

  // Canvas / Viewport State
  const canvasRef = useRef(null);
  const [activeFrameSelect, setActiveFrameSelect] = useState('frame1'); // 'frame1' | 'frame2'

  // Single-Point State (Part 1 & 2)
  const [singlePoint, setSinglePoint] = useState({
    frame_id: 'frame_1001',
    timestamp: new Date().toISOString(),
    pixel_x: 640.0,
    pixel_y: 490.0,
  });
  const [singleResult, setSingleResult] = useState(null);
  const [localizingSingle, setLocalizingSingle] = useState(false);

  // Two-Frame Motion State (Part 3 & 5)
  const [frame1, setFrame1] = useState({
    timestamp: '2026-10-04T12:00:00.000Z',
    pixel_x: 640.0,
    pixel_y: 490.0,
  });
  const [frame2, setFrame2] = useState({
    timestamp: '2026-10-04T12:00:02.500Z',
    pixel_x: 660.0,
    pixel_y: 450.0,
  });
  const [motionResult, setMotionResult] = useState(null);
  const [evaluatingMotion, setEvaluatingMotion] = useState(false);

  // Ground-Truth Error Testing State (Part 7)
  const [testInstances, setTestInstances] = useState([
    {
      instance_id: 'CASE_A_PATROL_RUN',
      frame_1: { pixel_x: 640.0, pixel_y: 490.0, timestamp: '2026-10-04T12:00:00.000Z' },
      frame_2: { pixel_x: 660.0, pixel_y: 450.0, timestamp: '2026-10-04T12:00:02.500Z' },
      actual_values: {
        actual_distance_1_m: 27.5,
        actual_distance_2_m: 34.5,
        actual_bearing_1_deg: 0.0,
        actual_bearing_2_deg: 6.0,
        actual_movement_distance_m: 7.2,
        actual_speed_mps: 2.88,
        actual_movement_direction_deg: 30.0,
      },
    },
    {
      instance_id: 'CASE_B_PERIMETER_PROWLER',
      frame_1: { pixel_x: 580.0, pixel_y: 500.0, timestamp: '2026-10-04T12:00:10.000Z' },
      frame_2: { pixel_x: 620.0, pixel_y: 470.0, timestamp: '2026-10-04T12:00:13.000Z' },
      actual_values: {
        actual_distance_1_m: 26.0,
        actual_distance_2_m: 31.0,
        actual_movement_distance_m: 7.0,
        actual_speed_mps: 2.33,
        actual_movement_direction_deg: 45.0,
      },
    },
  ]);
  const [validationOutput, setValidationOutput] = useState(null);
  const [runningValidation, setRunningValidation] = useState(false);

  // Load cameras and interval on mount
  useEffect(() => {
    loadCameras();
    fetchInterval();
  }, []);

  // When selected camera changes, fetch its calibration
  useEffect(() => {
    if (selectedCameraId) {
      loadCameraCalibration(selectedCameraId);
    }
  }, [selectedCameraId]);

  // Draw canvas overlay when points or camera change
  useEffect(() => {
    drawCanvasOverlay();
  }, [singlePoint, frame1, frame2, activeMode, activeFrameSelect, selectedCameraId]);

  const loadCameras = async () => {
    try {
      const data = await cameraApi.list();
      setCameras(data);
      if (data.length > 0) {
        // Prefer CAM_SEC_001 if available
        const defaultCam = data.find((c) => c.camera_id === 'CAM_SEC_001') || data[0];
        setSelectedCameraId(defaultCam.camera_id);
      }
    } catch (err) {
      console.error('Failed to load cameras', err);
      if (showToast) showToast({ type: 'error', message: 'Failed to load cameras list' });
    }
  };

  const fetchInterval = async () => {
    try {
      const res = await intrusionApi.getInterval();
      if (res && res.interval_seconds) {
        setEvalInterval(res.interval_seconds);
      }
    } catch {
      // Fallback to default
    }
  };

  const loadCameraCalibration = async (camId) => {
    setLoadingCamera(true);
    setSingleResult(null);
    setMotionResult(null);
    try {
      const cam = await cameraApi.get(camId);
      setSelectedCamera(cam);

      try {
        const cal = await calibrationApi.get(camId);
        setCalibrationRecord(cal);
      } catch {
        setCalibrationRecord(null);
      }
    } catch (err) {
      console.error('Error fetching camera/calibration', err);
      setCalibrationRecord(null);
    } finally {
      setLoadingCamera(false);
    }
  };

  const handleUpdateInterval = async (val) => {
    const num = parseFloat(val);
    if (isNaN(num) || num <= 0) return;
    setSavingInterval(true);
    try {
      const res = await intrusionApi.setInterval(num);
      setEvalInterval(res.interval_seconds);
      if (showToast) {
        showToast({
          type: 'success',
          message: `Evaluation time interval updated to ${res.interval_seconds}s`,
        });
      }
    } catch (err) {
      if (showToast) showToast({ type: 'error', message: err.message || 'Failed to update interval' });
    } finally {
      setSavingInterval(false);
    }
  };

  // Canvas Drawing
  const drawCanvasOverlay = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    // Tactical dark background with grid
    ctx.fillStyle = '#060a12';
    ctx.fillRect(0, 0, width, height);

    // Perspective / horizon lines
    ctx.strokeStyle = 'rgba(6, 182, 212, 0.12)';
    ctx.lineWidth = 1;
    for (let y = 100; y < height; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    for (let x = 60; x < width; x += 80) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

    // Camera FOV center line & horizon
    ctx.strokeStyle = 'rgba(6, 182, 212, 0.35)';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(width / 2, 0);
    ctx.lineTo(width / 2, height);
    ctx.stroke();

    // Horizon line (typical optical center approx height/2)
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw reference markers
    ctx.fillStyle = 'rgba(148, 163, 184, 0.5)';
    ctx.font = '10px JetBrains Mono, monospace';
    ctx.fillText('OPTICAL HORIZON (PITCH AXIS)', 12, height / 2 - 6);
    ctx.fillText('OPTICAL MERIDIAN (YAW AXIS)', width / 2 + 6, 20);

    // Mode-specific markers
    if (activeMode === 'single') {
      // Draw single intrusion point
      drawTargetReticle(ctx, singlePoint.pixel_x, singlePoint.pixel_y, '#22d3ee', 'INTRUSION BASE');
    } else if (activeMode === 'motion' || activeMode === 'groundtruth') {
      // Draw Frame 1 and Frame 2
      drawTargetReticle(ctx, frame1.pixel_x, frame1.pixel_y, '#22d3ee', 'OBS 1 (t₁)');
      drawTargetReticle(ctx, frame2.pixel_x, frame2.pixel_y, '#34d399', 'OBS 2 (t₂)');

      // Draw displacement line between Frame 1 and Frame 2
      ctx.strokeStyle = '#fb7185';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(frame1.pixel_x, frame1.pixel_y);
      ctx.lineTo(frame2.pixel_x, frame2.pixel_y);
      ctx.stroke();

      // Draw arrow head at frame 2
      const angle = Math.atan2(frame2.pixel_y - frame1.pixel_y, frame2.pixel_x - frame1.pixel_x);
      const headLen = 12;
      ctx.fillStyle = '#fb7185';
      ctx.beginPath();
      ctx.moveTo(frame2.pixel_x, frame2.pixel_y);
      ctx.lineTo(
        frame2.pixel_x - headLen * Math.cos(angle - Math.PI / 6),
        frame2.pixel_y - headLen * Math.sin(angle - Math.PI / 6)
      );
      ctx.lineTo(
        frame2.pixel_x - headLen * Math.cos(angle + Math.PI / 6),
        frame2.pixel_y - headLen * Math.sin(angle + Math.PI / 6)
      );
      ctx.closePath();
      ctx.fill();
    }
  };

  const drawTargetReticle = (ctx, x, y, color, label) => {
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2;

    // Crosshairs
    ctx.beginPath();
    ctx.arc(x, y, 14, 0, 2 * Math.PI);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x - 20, y);
    ctx.lineTo(x + 20, y);
    ctx.moveTo(x, y - 20);
    ctx.lineTo(x, y + 20);
    ctx.stroke();

    // Center point
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, 2 * Math.PI);
    ctx.fill();

    // Label tag
    ctx.font = 'bold 11px JetBrains Mono, monospace';
    ctx.fillText(`${label} (${Math.round(x)}, ${Math.round(y)})`, x + 18, y - 10);
  };

  const handleCanvasClick = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const clickX = Math.round((e.clientX - rect.left) * scaleX * 10) / 10;
    const clickY = Math.round((e.clientY - rect.top) * scaleY * 10) / 10;

    if (activeMode === 'single') {
      setSinglePoint((prev) => ({ ...prev, pixel_x: clickX, pixel_y: clickY }));
    } else if (activeMode === 'motion' || activeMode === 'groundtruth') {
      if (activeFrameSelect === 'frame1') {
        setFrame1((prev) => ({ ...prev, pixel_x: clickX, pixel_y: clickY }));
        setActiveFrameSelect('frame2');
      } else {
        setFrame2((prev) => ({ ...prev, pixel_x: clickX, pixel_y: clickY }));
        setActiveFrameSelect('frame1');
      }
    }
  };

  // =========================================================================
  // Handlers for API Calls
  // =========================================================================

  // Part 1: Single Intrusion Localization
  const handleLocalizeSingle = async () => {
    if (!selectedCameraId) {
      if (showToast) showToast({ type: 'warning', message: 'Please select a camera first' });
      return;
    }
    if (!calibrationRecord || !calibrationRecord.is_calibrated) {
      if (showToast) showToast({ type: 'error', message: 'Selected camera is not calibrated' });
      return;
    }

    setLocalizingSingle(true);
    setSingleResult(null);
    try {
      const payload = {
        camera_id: selectedCameraId,
        frame_id: singlePoint.frame_id || 'frame_001',
        timestamp: singlePoint.timestamp || new Date().toISOString(),
        pixel_x: parseFloat(singlePoint.pixel_x),
        pixel_y: parseFloat(singlePoint.pixel_y),
      };

      const res = await intrusionApi.localizeEvent(payload);
      setSingleResult(res);
      if (showToast) {
        showToast({
          type: 'success',
          message: `Intrusion localized: Dist ${res.horizontal_distance_m}m, Bearing ${res.bearing_deg}°`,
        });
      }
    } catch (err) {
      console.error('Localization error', err);
      if (showToast) showToast({ type: 'error', message: err.message || 'Localization failed' });
    } finally {
      setLocalizingSingle(false);
    }
  };

  // Part 3 & 5: Two-Frame Motion Analysis
  const handleAnalyzeMotion = async () => {
    if (!selectedCameraId) {
      if (showToast) showToast({ type: 'warning', message: 'Please select a camera first' });
      return;
    }
    if (!calibrationRecord || !calibrationRecord.is_calibrated) {
      if (showToast) showToast({ type: 'error', message: 'Selected camera is not calibrated' });
      return;
    }

    setEvaluatingMotion(true);
    setMotionResult(null);
    try {
      const payload = {
        camera_id: selectedCameraId,
        observation_1: {
          timestamp: frame1.timestamp,
          pixel_x: parseFloat(frame1.pixel_x),
          pixel_y: parseFloat(frame1.pixel_y),
        },
        observation_2: {
          timestamp: frame2.timestamp,
          pixel_x: parseFloat(frame2.pixel_x),
          pixel_y: parseFloat(frame2.pixel_y),
        },
      };

      const res = await intrusionApi.calculateMotion(payload);
      setMotionResult(res);
      if (showToast) {
        showToast({
          type: 'success',
          message: `Motion analyzed: Travelled ${res.motion.distance_m}m at ${res.motion.speed_kmph} km/h`,
        });
      }
    } catch (err) {
      console.error('Motion analysis error', err);
      if (showToast) showToast({ type: 'error', message: err.message || 'Motion analysis failed' });
    } finally {
      setEvaluatingMotion(false);
    }
  };

  // Part 7: Ground-Truth Error Testing
  const handleRunGroundTruth = async () => {
    if (!selectedCameraId) {
      if (showToast) showToast({ type: 'warning', message: 'Please select a camera first' });
      return;
    }
    if (!calibrationRecord || !calibrationRecord.is_calibrated) {
      if (showToast) showToast({ type: 'error', message: 'Selected camera is not calibrated' });
      return;
    }

    setRunningValidation(true);
    setValidationOutput(null);
    try {
      const payload = {
        camera_id: selectedCameraId,
        instances: testInstances,
      };

      const res = await validationApi.evaluate(payload);
      setValidationOutput(res);
      if (showToast) {
        showToast({
          type: 'success',
          message: `Evaluated ${res.total_instances} ground-truth test cases`,
        });
      }
    } catch (err) {
      console.error('Ground-truth evaluation error', err);
      if (showToast) showToast({ type: 'error', message: err.message || 'Validation evaluation failed' });
    } finally {
      setRunningValidation(false);
    }
  };

  const handleAddTestCase = () => {
    const newCase = {
      instance_id: `CASE_${testInstances.length + 1}_CUSTOM`,
      frame_1: { pixel_x: 640.0, pixel_y: 480.0, timestamp: '2026-10-04T12:00:20.000Z' },
      frame_2: { pixel_x: 650.0, pixel_y: 450.0, timestamp: '2026-10-04T12:00:22.000Z' },
      actual_values: {
        actual_distance_1_m: 28.0,
        actual_distance_2_m: 35.0,
        actual_movement_distance_m: 7.5,
        actual_speed_mps: 3.75,
      },
    };
    setTestInstances([...testInstances, newCase]);
  };

  const handleRemoveTestCase = (index) => {
    if (testInstances.length <= 1) return;
    setTestInstances(testInstances.filter((_, i) => i !== index));
  };

  const isCalibrated = calibrationRecord && calibrationRecord.is_calibrated;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header Banner */}
      <div
        className="glass-panel"
        style={{
          padding: '1.5rem',
          border: '1px solid rgba(6, 182, 212, 0.3)',
          background: 'linear-gradient(135deg, rgba(17, 24, 39, 0.95), rgba(22, 32, 50, 0.8))',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
              <div className="badge badge-calibrated">Phase 3B • Integration Active</div>
              <h2 style={{ fontSize: '1.35rem', fontWeight: 700 }}>
                Intrusion Localization & Motion Analysis Verification
              </h2>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', lineHeight: 1.6, maxWidth: '850px' }}>
              Verifies the application integration layer on top of tested Phase 3 geometry. Localizes intrusion base points
              into geodetic GPS coordinates, Earth-referenced azimuth bearings, and calculates two-frame motion vectors
              (distance, direction, speed) with real-value ground truth error validation.
            </p>
          </div>

          {/* Time Interval Control (Part 8) */}
          <div
            style={{
              padding: '0.85rem 1.25rem',
              background: 'rgba(7, 10, 16, 0.8)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-medium)',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.4rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', color: 'var(--cyan-400)', fontWeight: 600 }}>
              <Clock size={14} /> MOTION EVALUATION INTERVAL (PART 8)
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              {[0.5, 1.0, 2.0, 5.0].map((sec) => (
                <button
                  key={sec}
                  onClick={() => handleUpdateInterval(sec)}
                  disabled={savingInterval}
                  className={`btn-ghost font-mono ${evalInterval === sec ? 'active' : ''}`}
                  style={{
                    padding: '0.3rem 0.6rem',
                    fontSize: '0.75rem',
                    borderRadius: 'var(--radius-sm)',
                    background: evalInterval === sec ? 'var(--cyan-500)' : 'rgba(255, 255, 255, 0.05)',
                    color: evalInterval === sec ? '#000' : 'var(--text-primary)',
                    fontWeight: evalInterval === sec ? 700 : 500,
                  }}
                >
                  {sec}s
                </button>
              ))}
            </div>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
              Evaluates displacement between frames at ≥ {evalInterval}s intervals (No video storage)
            </span>
          </div>
        </div>
      </div>

      {/* Target Camera & Calibration State Selector */}
      <div
        className="glass-panel"
        style={{
          padding: '1.25rem 1.5rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '1.5rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
          <div>
            <label className="form-label" style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              Active Border Surveillance Camera:
            </label>
            <select
              value={selectedCameraId}
              onChange={(e) => setSelectedCameraId(e.target.value)}
              className="form-select font-mono"
              style={{ minWidth: '280px', padding: '0.5rem 0.75rem' }}
            >
              {cameras.map((c) => (
                <option key={c.id} value={c.camera_id}>
                  {c.camera_id} — {c.name} ({c.status})
                </option>
              ))}
            </select>
          </div>

          {/* Calibration Status Badge */}
          {loadingCamera ? (
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Loading camera calibration...</div>
          ) : isCalibrated ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span className="badge badge-calibrated" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <CheckCircle size={13} /> CALIBRATION ACTIVE
              </span>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                RMSE: <span className="font-mono" style={{ color: 'var(--emerald-400)' }}>{calibrationRecord.rmse_error_meters}m</span>
                {' • '}
                Origin: <span className="font-mono">{selectedCamera?.latitude?.toFixed(4)}, {selectedCamera?.longitude?.toFixed(4)}</span>
                {' • '}
                Height: <span className="font-mono">{selectedCamera?.height_meters}m</span>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span className="badge badge-uncalibrated" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <AlertCircle size={13} /> UNCALIBRATED CAMERA
              </span>
              <button
                onClick={() => onNavigate && onNavigate('calibration')}
                className="btn-ghost"
                style={{ fontSize: '0.75rem', color: 'var(--cyan-400)', textDecoration: 'underline' }}
              >
                Go to Calibration Workspace →
              </button>
            </div>
          )}
        </div>

        {/* Navigation Tabs for Testing Workflows */}
        <div style={{ display: 'flex', gap: '0.5rem', background: 'rgba(7, 10, 16, 0.8)', padding: '0.3rem', borderRadius: 'var(--radius-md)' }}>
          <button
            onClick={() => setActiveMode('single')}
            className={`btn-ghost ${activeMode === 'single' ? 'active' : ''}`}
            style={{
              padding: '0.45rem 0.9rem',
              fontSize: '0.8rem',
              borderRadius: 'var(--radius-sm)',
              background: activeMode === 'single' ? 'rgba(6, 182, 212, 0.2)' : 'transparent',
              color: activeMode === 'single' ? 'var(--cyan-400)' : 'var(--text-secondary)',
              fontWeight: activeMode === 'single' ? 600 : 500,
            }}
          >
            Part 1: Single Intrusion
          </button>
          <button
            onClick={() => setActiveMode('motion')}
            className={`btn-ghost ${activeMode === 'motion' ? 'active' : ''}`}
            style={{
              padding: '0.45rem 0.9rem',
              fontSize: '0.8rem',
              borderRadius: 'var(--radius-sm)',
              background: activeMode === 'motion' ? 'rgba(6, 182, 212, 0.2)' : 'transparent',
              color: activeMode === 'motion' ? 'var(--cyan-400)' : 'var(--text-secondary)',
              fontWeight: activeMode === 'motion' ? 600 : 500,
            }}
          >
            Part 3/5: Two-Frame Motion
          </button>
          <button
            onClick={() => setActiveMode('groundtruth')}
            className={`btn-ghost ${activeMode === 'groundtruth' ? 'active' : ''}`}
            style={{
              padding: '0.45rem 0.9rem',
              fontSize: '0.8rem',
              borderRadius: 'var(--radius-sm)',
              background: activeMode === 'groundtruth' ? 'rgba(6, 182, 212, 0.2)' : 'transparent',
              color: activeMode === 'groundtruth' ? 'var(--cyan-400)' : 'var(--text-secondary)',
              fontWeight: activeMode === 'groundtruth' ? 600 : 500,
            }}
          >
            Part 7: Ground-Truth Error
          </button>
          <button
            onClick={() => setActiveMode('teammate')}
            className={`btn-ghost ${activeMode === 'teammate' ? 'active' : ''}`}
            style={{
              padding: '0.45rem 0.9rem',
              fontSize: '0.8rem',
              borderRadius: 'var(--radius-sm)',
              background: activeMode === 'teammate' ? 'rgba(6, 182, 212, 0.2)' : 'transparent',
              color: activeMode === 'teammate' ? 'var(--cyan-400)' : 'var(--text-secondary)',
              fontWeight: activeMode === 'teammate' ? 600 : 500,
            }}
          >
            Part 9: Teammate API
          </button>
        </div>
      </div>

      {/* Main Interactive Workspace (Canvas + Controls) */}
      {activeMode !== 'teammate' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(350px, 1.25fr) minmax(320px, 1fr)', gap: '1.5rem' }}>
          {/* Left: Interactive Canvas / Video Viewport */}
          <div className="glass-panel" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Crosshair size={16} color="var(--cyan-400)" />
                <h3 style={{ fontSize: '0.95rem', fontWeight: 600 }}>Tactical Video Viewport / Click Base Point</h3>
              </div>
              <span className="badge badge-phase font-mono" style={{ fontSize: '0.72rem' }}>
                1280 × 720 px
              </span>
            </div>

            <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
              Click directly on the viewport below to select the intrusion <strong>BASE POINT</strong> (ground contact center of bounding box).
            </p>

            {/* Canvas Container */}
            <div
              style={{
                position: 'relative',
                width: '100%',
                borderRadius: 'var(--radius-md)',
                overflow: 'hidden',
                border: '1px solid var(--border-medium)',
                cursor: 'crosshair',
                boxShadow: 'inset 0 0 30px rgba(0,0,0,0.8)',
              }}
            >
              <canvas
                ref={canvasRef}
                width={1280}
                height={720}
                onClick={handleCanvasClick}
                style={{
                  width: '100%',
                  height: 'auto',
                  display: 'block',
                }}
              />

              {/* Viewport Floating HUD */}
              <div
                style={{
                  position: 'absolute',
                  bottom: '10px',
                  left: '10px',
                  background: 'rgba(7, 10, 16, 0.85)',
                  padding: '4px 10px',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '0.72rem',
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--cyan-400)',
                  border: '1px solid rgba(6, 182, 212, 0.3)',
                }}
              >
                {activeMode === 'single'
                  ? `BASE POINT: (${Math.round(singlePoint.pixel_x)}, ${Math.round(singlePoint.pixel_y)}) px`
                  : `FRAME 1: (${Math.round(frame1.pixel_x)}, ${Math.round(frame1.pixel_y)}) | FRAME 2: (${Math.round(frame2.pixel_x)}, ${Math.round(frame2.pixel_y)})`}
              </div>
            </div>

            {/* Frame Selector buttons for Motion Mode */}
            {(activeMode === 'motion' || activeMode === 'groundtruth') && (
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
                <button
                  onClick={() => setActiveFrameSelect('frame1')}
                  className={`btn-ghost ${activeFrameSelect === 'frame1' ? 'active' : ''}`}
                  style={{
                    flex: 1,
                    padding: '0.4rem',
                    fontSize: '0.75rem',
                    borderRadius: 'var(--radius-sm)',
                    background: activeFrameSelect === 'frame1' ? 'rgba(34, 211, 238, 0.2)' : 'rgba(255,255,255,0.04)',
                    color: activeFrameSelect === 'frame1' ? 'var(--cyan-400)' : 'var(--text-secondary)',
                    border: activeFrameSelect === 'frame1' ? '1px solid var(--cyan-400)' : '1px solid transparent',
                  }}
                >
                  Clicking Targets: Observation 1 (t₁)
                </button>
                <button
                  onClick={() => setActiveFrameSelect('frame2')}
                  className={`btn-ghost ${activeFrameSelect === 'frame2' ? 'active' : ''}`}
                  style={{
                    flex: 1,
                    padding: '0.4rem',
                    fontSize: '0.75rem',
                    borderRadius: 'var(--radius-sm)',
                    background: activeFrameSelect === 'frame2' ? 'rgba(52, 211, 153, 0.2)' : 'rgba(255,255,255,0.04)',
                    color: activeFrameSelect === 'frame2' ? 'var(--emerald-400)' : 'var(--text-secondary)',
                    border: activeFrameSelect === 'frame2' ? '1px solid var(--emerald-400)' : '1px solid transparent',
                  }}
                >
                  Clicking Targets: Observation 2 (t₂)
                </button>
              </div>
            )}
          </div>

          {/* Right: Controls & Observation Input Form */}
          <div className="glass-panel" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Mode 1: Single Intrusion Form */}
            {activeMode === 'single' && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ fontSize: '0.95rem', fontWeight: 600 }}>Part 1: Single Observation Inputs</h3>
                  <span className="badge badge-phase">Base Center</span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div>
                    <label className="form-label" style={{ fontSize: '0.75rem' }}>Pixel X (Horizontal px):</label>
                    <input
                      type="number"
                      step="0.1"
                      className="form-input font-mono"
                      value={singlePoint.pixel_x}
                      onChange={(e) => setSinglePoint({ ...singlePoint, pixel_x: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="form-label" style={{ fontSize: '0.75rem' }}>Pixel Y (Base Center px):</label>
                    <input
                      type="number"
                      step="0.1"
                      className="form-input font-mono"
                      value={singlePoint.pixel_y}
                      onChange={(e) => setSinglePoint({ ...singlePoint, pixel_y: e.target.value })}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '0.75rem' }}>
                  <div>
                    <label className="form-label" style={{ fontSize: '0.75rem' }}>Frame ID:</label>
                    <input
                      type="text"
                      className="form-input font-mono"
                      value={singlePoint.frame_id}
                      onChange={(e) => setSinglePoint({ ...singlePoint, frame_id: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="form-label" style={{ fontSize: '0.75rem' }}>Timestamp (ISO 8601):</label>
                    <input
                      type="text"
                      className="form-input font-mono"
                      value={singlePoint.timestamp}
                      onChange={(e) => setSinglePoint({ ...singlePoint, timestamp: e.target.value })}
                    />
                  </div>
                </div>

                <button
                  onClick={handleLocalizeSingle}
                  disabled={localizingSingle || !isCalibrated}
                  className="btn-primary"
                  style={{
                    marginTop: '0.5rem',
                    padding: '0.7rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem',
                    fontWeight: 600,
                  }}
                >
                  <MapPin size={16} />
                  {localizingSingle ? 'Calculating Localization...' : 'Localize Intrusion Point'}
                </button>
              </>
            )}

            {/* Mode 2: Two-Frame Motion Form */}
            {(activeMode === 'motion' || activeMode === 'groundtruth') && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ fontSize: '0.95rem', fontWeight: 600 }}>Part 3/5: Two-Frame Motion Inputs</h3>
                  <span className="badge badge-phase">t₁ → t₂</span>
                </div>

                {/* Frame 1 Sub-card */}
                <div style={{ padding: '0.85rem', background: 'rgba(7, 10, 16, 0.6)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(34, 211, 238, 0.3)' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--cyan-400)', marginBottom: '0.4rem' }}>
                    OBSERVATION 1 (FRAME 1)
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.4rem' }}>
                    <input
                      type="number"
                      step="0.1"
                      placeholder="Pixel X"
                      className="form-input font-mono"
                      value={frame1.pixel_x}
                      onChange={(e) => setFrame1({ ...frame1, pixel_x: e.target.value })}
                    />
                    <input
                      type="number"
                      step="0.1"
                      placeholder="Pixel Y"
                      className="form-input font-mono"
                      value={frame1.pixel_y}
                      onChange={(e) => setFrame1({ ...frame1, pixel_y: e.target.value })}
                    />
                  </div>
                  <input
                    type="text"
                    placeholder="Timestamp 1"
                    className="form-input font-mono"
                    style={{ fontSize: '0.75rem' }}
                    value={frame1.timestamp}
                    onChange={(e) => setFrame1({ ...frame1, timestamp: e.target.value })}
                  />
                </div>

                {/* Frame 2 Sub-card */}
                <div style={{ padding: '0.85rem', background: 'rgba(7, 10, 16, 0.6)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(52, 211, 153, 0.3)' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--emerald-400)', marginBottom: '0.4rem' }}>
                    OBSERVATION 2 (FRAME 2)
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.4rem' }}>
                    <input
                      type="number"
                      step="0.1"
                      placeholder="Pixel X"
                      className="form-input font-mono"
                      value={frame2.pixel_x}
                      onChange={(e) => setFrame2({ ...frame2, pixel_x: e.target.value })}
                    />
                    <input
                      type="number"
                      step="0.1"
                      placeholder="Pixel Y"
                      className="form-input font-mono"
                      value={frame2.pixel_y}
                      onChange={(e) => setFrame2({ ...frame2, pixel_y: e.target.value })}
                    />
                  </div>
                  <input
                    type="text"
                    placeholder="Timestamp 2"
                    className="form-input font-mono"
                    style={{ fontSize: '0.75rem' }}
                    value={frame2.timestamp}
                    onChange={(e) => setFrame2({ ...frame2, timestamp: e.target.value })}
                  />
                </div>

                {activeMode === 'motion' && (
                  <button
                    onClick={handleAnalyzeMotion}
                    disabled={evaluatingMotion || !isCalibrated}
                    className="btn-primary"
                    style={{
                      marginTop: '0.5rem',
                      padding: '0.7rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.5rem',
                      fontWeight: 600,
                    }}
                  >
                    <TrendingUp size={16} />
                    {evaluatingMotion ? 'Evaluating Motion...' : 'Analyze Two-Frame Motion'}
                  </button>
                )}
              </>
            )}

            {/* Informational Callout regarding Direction Distinction */}
            <div
              style={{
                marginTop: 'auto',
                padding: '0.75rem 1rem',
                background: 'rgba(245, 158, 11, 0.08)',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid rgba(245, 158, 11, 0.25)',
                display: 'flex',
                gap: '0.6rem',
                fontSize: '0.75rem',
                color: 'var(--text-secondary)',
                lineHeight: 1.5,
              }}
            >
              <Info size={16} color="var(--amber-400)" style={{ flexShrink: 0, marginTop: '2px' }} />
              <div>
                <strong style={{ color: 'var(--amber-400)' }}>Important Direction Distinction:</strong>
                <div>1. <strong>Camera → Intrusion Bearing:</strong> Absolute line of sight from camera to target (0°=N, 90°=E).</div>
                <div>2. <strong>Intrusion Movement Direction:</strong> Trajectory calculated from Frame 1 to Frame 2 (0°=N, 90°=E).</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* RESULTS DISPLAY: PART 1 (Single Observation Result) */}
      {/* ===================================================================== */}
      {activeMode === 'single' && singleResult && (
        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <ShieldCheck size={18} color="var(--cyan-400)" />
              <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Part 1: Localization Output (API Verified)</h3>
            </div>
            <span className="badge badge-calibrated">Contract Matches Part 1</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
            {/* Base Pixel */}
            <div style={{ padding: '1rem', background: 'var(--bg-darkest)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>INPUT BASE PIXEL</div>
              <div className="font-mono" style={{ fontSize: '1.15rem', color: 'var(--cyan-400)', fontWeight: 700, margin: '0.2rem 0' }}>
                ({singleResult.pixel?.x}, {singleResult.pixel?.y}) px
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Frame: {singleResult.frame_id}</div>
            </div>

            {/* Local ENU Position */}
            <div style={{ padding: '1rem', background: 'var(--bg-darkest)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>LOCAL EAST / NORTH</div>
              <div className="font-mono" style={{ fontSize: '1.15rem', color: 'var(--text-primary)', fontWeight: 700, margin: '0.2rem 0' }}>
                E: {singleResult.local_position?.east_m}m, N: {singleResult.local_position?.north_m}m
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Tangent Plane relative to camera</div>
            </div>

            {/* Horizontal Distance */}
            <div style={{ padding: '1rem', background: 'var(--bg-darkest)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>HORIZONTAL DISTANCE</div>
              <div className="font-mono" style={{ fontSize: '1.25rem', color: 'var(--emerald-400)', fontWeight: 700, margin: '0.2rem 0' }}>
                {singleResult.horizontal_distance_m} m
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>sqrt(East² + North²)</div>
            </div>

            {/* Earth-Referenced Bearing (Part 2) */}
            <div style={{ padding: '1rem', background: 'var(--bg-darkest)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>CAMERA → INTRUSION BEARING</div>
              <div className="font-mono" style={{ fontSize: '1.25rem', color: 'var(--amber-400)', fontWeight: 700, margin: '0.2rem 0' }}>
                {singleResult.bearing_deg}°
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                {singleResult.bearing_deg >= 315 || singleResult.bearing_deg < 45
                  ? 'NORTH SECTOR'
                  : singleResult.bearing_deg < 135
                  ? 'EAST SECTOR'
                  : singleResult.bearing_deg < 225
                  ? 'SOUTH SECTOR'
                  : 'WEST SECTOR'} (0°=N, 90°=E)
              </div>
            </div>

            {/* Latitude / Longitude */}
            <div style={{ padding: '1rem', background: 'var(--bg-darkest)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>GEODETIC GPS COORDINATES</div>
              <div className="font-mono" style={{ fontSize: '0.95rem', color: 'var(--cyan-400)', fontWeight: 700, margin: '0.2rem 0' }}>
                {singleResult.gps?.latitude?.toFixed(7)}° N
              </div>
              <div className="font-mono" style={{ fontSize: '0.95rem', color: 'var(--cyan-400)', fontWeight: 700 }}>
                {singleResult.gps?.longitude?.toFixed(7)}° E
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* RESULTS DISPLAY: PART 3 & 5 (Two-Frame Motion Result) */}
      {/* ===================================================================== */}
      {activeMode === 'motion' && motionResult && (
        <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <TrendingUp size={18} color="var(--emerald-400)" />
              <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Part 3/5: Two-Frame Motion Analysis Output</h3>
            </div>
            <span className="badge badge-calibrated">Contract Matches Part 5</span>
          </div>

          {/* Side by side: Observation 1 vs Observation 2 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            {/* Observation 1 */}
            <div style={{ padding: '1rem', background: 'var(--bg-darkest)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(34, 211, 238, 0.3)' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--cyan-400)', marginBottom: '0.5rem' }}>
                FRAME 1 OBSERVATION (t₁)
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.8rem' }}>
                <div>Pixel: <span className="font-mono">({frame1.pixel_x}, {frame1.pixel_y})</span></div>
                <div>Local EN: <span className="font-mono">E={motionResult.observation_1?.east_m}m, N={motionResult.observation_1?.north_m}m</span></div>
                <div>GPS: <span className="font-mono">{motionResult.observation_1?.gps?.latitude?.toFixed(6)}°, {motionResult.observation_1?.gps?.longitude?.toFixed(6)}°</span></div>
                <div>Camera Distance: <span className="font-mono">{motionResult.observation_1?.horizontal_distance_m}m</span></div>
                <div>Camera Bearing: <span className="font-mono">{motionResult.observation_1?.bearing_deg}°</span> (0°=N, 90°=E)</div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>Timestamp: {motionResult.observation_1?.timestamp}</div>
              </div>
            </div>

            {/* Observation 2 */}
            <div style={{ padding: '1rem', background: 'var(--bg-darkest)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(52, 211, 153, 0.3)' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--emerald-400)', marginBottom: '0.5rem' }}>
                FRAME 2 OBSERVATION (t₂)
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.8rem' }}>
                <div>Pixel: <span className="font-mono">({frame2.pixel_x}, {frame2.pixel_y})</span></div>
                <div>Local EN: <span className="font-mono">E={motionResult.observation_2?.east_m}m, N={motionResult.observation_2?.north_m}m</span></div>
                <div>GPS: <span className="font-mono">{motionResult.observation_2?.gps?.latitude?.toFixed(6)}°, {motionResult.observation_2?.gps?.longitude?.toFixed(6)}°</span></div>
                <div>Camera Distance: <span className="font-mono">{motionResult.observation_2?.horizontal_distance_m}m</span></div>
                <div>Camera Bearing: <span className="font-mono">{motionResult.observation_2?.bearing_deg}°</span> (0°=N, 90°=E)</div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>Timestamp: {motionResult.observation_2?.timestamp}</div>
              </div>
            </div>
          </div>

          {/* Motion Vector Metrics */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '1rem' }}>
            <div style={{ padding: '1rem', background: 'rgba(251, 113, 133, 0.08)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(251, 113, 133, 0.3)' }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--rose-400)', fontWeight: 600 }}>DISTANCE TRAVELLED</div>
              <div className="font-mono" style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--rose-400)', margin: '0.2rem 0' }}>
                {motionResult.motion?.distance_m} m
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>D = sqrt(ΔE² + ΔN²)</div>
            </div>

            <div style={{ padding: '1rem', background: 'rgba(16, 185, 129, 0.08)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--emerald-400)', fontWeight: 600 }}>MOVEMENT DIRECTION</div>
              <div className="font-mono" style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--emerald-400)', margin: '0.2rem 0' }}>
                {motionResult.motion?.direction_deg}°
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Frame 1 → Frame 2 Azimuth</div>
            </div>

            <div style={{ padding: '1rem', background: 'rgba(245, 158, 11, 0.08)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(245, 158, 11, 0.3)' }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--amber-400)', fontWeight: 600 }}>TIME DIFFERENCE</div>
              <div className="font-mono" style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--amber-400)', margin: '0.2rem 0' }}>
                {motionResult.motion?.time_seconds} s
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Δt = t₂ - t₁</div>
            </div>

            <div style={{ padding: '1rem', background: 'rgba(6, 182, 212, 0.08)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(6, 182, 212, 0.3)' }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--cyan-400)', fontWeight: 600 }}>GROUND SPEED (M/S)</div>
              <div className="font-mono" style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--cyan-400)', margin: '0.2rem 0' }}>
                {motionResult.motion?.speed_mps} m/s
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>speed = D / Δt</div>
            </div>

            <div style={{ padding: '1rem', background: 'rgba(99, 102, 241, 0.08)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(99, 102, 241, 0.3)' }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--indigo-400)', fontWeight: 600 }}>GROUND SPEED (KM/H)</div>
              <div className="font-mono" style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--indigo-400)', margin: '0.2rem 0' }}>
                {motionResult.motion?.speed_kmph} km/h
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>mps × 3.6</div>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODE 3: REAL-VALUE ERROR TESTING & GROUND TRUTH (PART 7) */}
      {/* ===================================================================== */}
      {activeMode === 'groundtruth' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div className="glass-panel" style={{ padding: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 600 }}>
                  Part 7: Ground-Truth Real-Value Error Evaluation
                </h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Enter surveyed ground-truth values for test cases to evaluate absolute error, percentage error (distance & speed),
                  and circular angular deviations. No arbitrary "accuracy scores".
                </p>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  onClick={handleAddTestCase}
                  className="btn-secondary"
                  style={{ fontSize: '0.8rem', padding: '0.45rem 0.8rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                >
                  <Plus size={14} /> Add Test Case
                </button>
                <button
                  onClick={handleRunGroundTruth}
                  disabled={runningValidation || !isCalibrated}
                  className="btn-primary"
                  style={{ fontSize: '0.8rem', padding: '0.45rem 1rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                >
                  <Play size={14} /> {runningValidation ? 'Evaluating...' : 'Run Ground-Truth Evaluation'}
                </button>
              </div>
            </div>

            {/* Test Instances List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {testInstances.map((inst, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: '1rem',
                    background: 'var(--bg-darkest)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span className="badge badge-phase font-mono">{inst.instance_id}</span>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        Obs 1: ({inst.frame_1.pixel_x}, {inst.frame_1.pixel_y}) → Obs 2: ({inst.frame_2.pixel_x}, {inst.frame_2.pixel_y})
                      </span>
                    </div>
                    {testInstances.length > 1 && (
                      <button
                        onClick={() => handleRemoveTestCase(idx)}
                        className="btn-ghost"
                        style={{ color: 'var(--rose-400)', padding: '0.2rem 0.5rem' }}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>

                  {/* Ground Truth Inputs */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.5rem' }}>
                    <div>
                      <label style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Actual Dist 1 (m):</label>
                      <input
                        type="number"
                        step="0.1"
                        className="form-input font-mono"
                        style={{ fontSize: '0.78rem', padding: '0.35rem 0.5rem' }}
                        value={inst.actual_values.actual_distance_1_m || ''}
                        onChange={(e) => {
                          const val = e.target.value ? parseFloat(e.target.value) : null;
                          const updated = [...testInstances];
                          updated[idx].actual_values.actual_distance_1_m = val;
                          setTestInstances(updated);
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Actual Dist 2 (m):</label>
                      <input
                        type="number"
                        step="0.1"
                        className="form-input font-mono"
                        style={{ fontSize: '0.78rem', padding: '0.35rem 0.5rem' }}
                        value={inst.actual_values.actual_distance_2_m || ''}
                        onChange={(e) => {
                          const val = e.target.value ? parseFloat(e.target.value) : null;
                          const updated = [...testInstances];
                          updated[idx].actual_values.actual_distance_2_m = val;
                          setTestInstances(updated);
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Actual Bearing 1 (°):</label>
                      <input
                        type="number"
                        step="0.1"
                        className="form-input font-mono"
                        style={{ fontSize: '0.78rem', padding: '0.35rem 0.5rem' }}
                        value={inst.actual_values.actual_bearing_1_deg ?? ''}
                        onChange={(e) => {
                          const val = e.target.value ? parseFloat(e.target.value) : null;
                          const updated = [...testInstances];
                          updated[idx].actual_values.actual_bearing_1_deg = val;
                          setTestInstances(updated);
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Actual Move Dist (m):</label>
                      <input
                        type="number"
                        step="0.1"
                        className="form-input font-mono"
                        style={{ fontSize: '0.78rem', padding: '0.35rem 0.5rem' }}
                        value={inst.actual_values.actual_movement_distance_m || ''}
                        onChange={(e) => {
                          const val = e.target.value ? parseFloat(e.target.value) : null;
                          const updated = [...testInstances];
                          updated[idx].actual_values.actual_movement_distance_m = val;
                          setTestInstances(updated);
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Actual Move Dir (°):</label>
                      <input
                        type="number"
                        step="0.1"
                        className="form-input font-mono"
                        style={{ fontSize: '0.78rem', padding: '0.35rem 0.5rem' }}
                        value={inst.actual_values.actual_movement_direction_deg ?? ''}
                        onChange={(e) => {
                          const val = e.target.value ? parseFloat(e.target.value) : null;
                          const updated = [...testInstances];
                          updated[idx].actual_values.actual_movement_direction_deg = val;
                          setTestInstances(updated);
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Actual Speed (m/s):</label>
                      <input
                        type="number"
                        step="0.05"
                        className="form-input font-mono"
                        style={{ fontSize: '0.78rem', padding: '0.35rem 0.5rem' }}
                        value={inst.actual_values.actual_speed_mps || ''}
                        onChange={(e) => {
                          const val = e.target.value ? parseFloat(e.target.value) : null;
                          const updated = [...testInstances];
                          updated[idx].actual_values.actual_speed_mps = val;
                          setTestInstances(updated);
                        }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Validation Output Comparison Matrix & Aggregate Statistics */}
          {validationOutput && (
            <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 600 }}>
                  Evaluation Results: Predicted vs Ground-Truth Comparison
                </h3>
                <span className="badge badge-calibrated">
                  {validationOutput.total_instances} Test Cases Evaluated
                </span>
              </div>

              {/* Per-Instance Detailed Comparison Tables */}
              {validationOutput.instances.map((res, i) => (
                <div key={i} style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '1rem', background: 'var(--bg-darkest)' }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--cyan-400)', marginBottom: '0.75rem' }}>
                    {res.instance_id} Error Breakdown
                  </div>

                  <div className="table-container">
                    <table className="tactical-table">
                      <thead>
                        <tr>
                          <th>Metric</th>
                          <th>Predicted</th>
                          <th>Actual (Ground Truth)</th>
                          <th>Absolute Error</th>
                          <th>Percentage Error</th>
                        </tr>
                      </thead>
                      <tbody>
                        {res.errors.distance_1_error && (
                          <tr>
                            <td>Distance to Target (Frame 1)</td>
                            <td className="font-mono">{res.errors.distance_1_error.predicted_m} m</td>
                            <td className="font-mono">{res.errors.distance_1_error.actual_m} m</td>
                            <td className="font-mono" style={{ color: 'var(--amber-400)' }}>
                              {res.errors.distance_1_error.absolute_error_m} m
                            </td>
                            <td className="font-mono">{res.errors.distance_1_error.percentage_error}%</td>
                          </tr>
                        )}
                        {res.errors.distance_2_error && (
                          <tr>
                            <td>Distance to Target (Frame 2)</td>
                            <td className="font-mono">{res.errors.distance_2_error.predicted_m} m</td>
                            <td className="font-mono">{res.errors.distance_2_error.actual_m} m</td>
                            <td className="font-mono" style={{ color: 'var(--amber-400)' }}>
                              {res.errors.distance_2_error.absolute_error_m} m
                            </td>
                            <td className="font-mono">{res.errors.distance_2_error.percentage_error}%</td>
                          </tr>
                        )}
                        {res.errors.movement_distance_error && (
                          <tr>
                            <td>Movement Travelled Distance</td>
                            <td className="font-mono">{res.errors.movement_distance_error.predicted_m} m</td>
                            <td className="font-mono">{res.errors.movement_distance_error.actual_m} m</td>
                            <td className="font-mono" style={{ color: 'var(--amber-400)' }}>
                              {res.errors.movement_distance_error.absolute_error_m} m
                            </td>
                            <td className="font-mono">{res.errors.movement_distance_error.percentage_error}%</td>
                          </tr>
                        )}
                        {res.errors.speed_mps_error && (
                          <tr>
                            <td>Ground Speed (m/s)</td>
                            <td className="font-mono">{res.errors.speed_mps_error.predicted_mps} m/s</td>
                            <td className="font-mono">{res.errors.speed_mps_error.actual_mps} m/s</td>
                            <td className="font-mono" style={{ color: 'var(--amber-400)' }}>
                              {res.errors.speed_mps_error.absolute_error_mps} m/s
                            </td>
                            <td className="font-mono">{res.errors.speed_mps_error.percentage_error}%</td>
                          </tr>
                        )}
                        {res.errors.bearing_1_error_deg && (
                          <tr>
                            <td>Camera Bearing 1</td>
                            <td className="font-mono">{res.errors.bearing_1_error_deg.predicted_deg}°</td>
                            <td className="font-mono">{res.errors.bearing_1_error_deg.actual_deg}°</td>
                            <td className="font-mono" style={{ color: 'var(--cyan-400)' }}>
                              {res.errors.bearing_1_error_deg.absolute_error_deg}°
                            </td>
                            <td className="font-mono" style={{ color: 'var(--text-muted)' }}>N/A (Angular)</td>
                          </tr>
                        )}
                        {res.errors.movement_direction_error_deg && (
                          <tr>
                            <td>Movement Direction</td>
                            <td className="font-mono">{res.errors.movement_direction_error_deg.predicted_deg}°</td>
                            <td className="font-mono">{res.errors.movement_direction_error_deg.actual_deg}°</td>
                            <td className="font-mono" style={{ color: 'var(--cyan-400)' }}>
                              {res.errors.movement_direction_error_deg.absolute_error_deg}°
                            </td>
                            <td className="font-mono" style={{ color: 'var(--text-muted)' }}>N/A (Angular)</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}

              {/* Aggregate Error Statistics (MAE, RMSE, Max Error) */}
              {validationOutput.aggregate_metrics && (
                <div style={{ marginTop: '0.5rem' }}>
                  <div style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '0.75rem' }}>
                    Aggregate Statistical Metrics Across All Instances
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
                    {/* Distance Error Aggregate */}
                    {validationOutput.aggregate_metrics.distance_error?.sample_count > 0 && (
                      <div style={{ padding: '1rem', background: 'var(--bg-darkest)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--cyan-400)', marginBottom: '0.4rem' }}>
                          DISTANCE ERROR STATS
                        </div>
                        <div style={{ fontSize: '0.8rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                          <div>MAE: <span className="font-mono" style={{ color: 'var(--text-primary)' }}>{validationOutput.aggregate_metrics.distance_error.mean_absolute_error_m} m</span></div>
                          <div>RMSE: <span className="font-mono" style={{ color: 'var(--emerald-400)' }}>{validationOutput.aggregate_metrics.distance_error.rmse_m} m</span></div>
                          <div>Max Error: <span className="font-mono" style={{ color: 'var(--amber-400)' }}>{validationOutput.aggregate_metrics.distance_error.max_error_m} m</span></div>
                          <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>Samples: {validationOutput.aggregate_metrics.distance_error.sample_count}</div>
                        </div>
                      </div>
                    )}

                    {/* Speed Error Aggregate */}
                    {validationOutput.aggregate_metrics.speed_error?.sample_count > 0 && (
                      <div style={{ padding: '1rem', background: 'var(--bg-darkest)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--emerald-400)', marginBottom: '0.4rem' }}>
                          GROUND SPEED ERROR STATS
                        </div>
                        <div style={{ fontSize: '0.8rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                          <div>MAE: <span className="font-mono" style={{ color: 'var(--text-primary)' }}>{validationOutput.aggregate_metrics.speed_error.mean_absolute_error_mps} m/s</span></div>
                          <div>RMSE: <span className="font-mono" style={{ color: 'var(--emerald-400)' }}>{validationOutput.aggregate_metrics.speed_error.rmse_mps} m/s</span></div>
                          <div>Max Error: <span className="font-mono" style={{ color: 'var(--amber-400)' }}>{validationOutput.aggregate_metrics.speed_error.max_error_mps} m/s</span></div>
                          <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>Samples: {validationOutput.aggregate_metrics.speed_error.sample_count}</div>
                        </div>
                      </div>
                    )}

                    {/* Direction Error Aggregate */}
                    {validationOutput.aggregate_metrics.movement_direction_error?.sample_count > 0 && (
                      <div style={{ padding: '1rem', background: 'var(--bg-darkest)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--amber-400)', marginBottom: '0.4rem' }}>
                          MOVEMENT DIRECTION ERROR
                        </div>
                        <div style={{ fontSize: '0.8rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                          <div>MAE: <span className="font-mono" style={{ color: 'var(--text-primary)' }}>{validationOutput.aggregate_metrics.movement_direction_error.mean_absolute_error_deg}°</span></div>
                          <div>RMSE: <span className="font-mono" style={{ color: 'var(--emerald-400)' }}>{validationOutput.aggregate_metrics.movement_direction_error.rmse_deg}°</span></div>
                          <div>Max Error: <span className="font-mono" style={{ color: 'var(--amber-400)' }}>{validationOutput.aggregate_metrics.movement_direction_error.max_error_deg}°</span></div>
                          <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>Samples: {validationOutput.aggregate_metrics.movement_direction_error.sample_count}</div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODE 4: TEAMMATE INTEGRATION GUIDE & SPEC (PART 9) */}
      {/* ===================================================================== */}
      {activeMode === 'teammate' && (
        <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
              <FileCode size={20} color="var(--cyan-400)" />
              <h3 style={{ fontSize: '1.2rem', fontWeight: 700 }}>
                Teammate Integration Guide (AI Intrusion Detector Module)
              </h3>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', lineHeight: 1.6 }}>
              The detection teammate only needs to send 5 simple fields per bounding box:
              <code className="font-mono" style={{ color: 'var(--cyan-400)', marginLeft: '6px' }}>
                camera_id, frame_id, timestamp, pixel_x, pixel_y
              </code>.
              All calibration, homography, camera pose, and GPS transformations remain completely internal.
            </p>
          </div>

          {/* Quick Request/Response Schema */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem' }}>
            <div style={{ background: 'var(--bg-darkest)', padding: '1.25rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-medium)' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--cyan-400)', marginBottom: '0.5rem' }}>
                POST /api/intrusion/event (REQUEST PAYLOAD)
              </div>
              <pre className="font-mono" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5, overflowX: 'auto' }}>
{`{
  "camera_id": "CAM_SEC_001",
  "frame_id": "frame_1042",
  "timestamp": "2026-10-04T12:00:01.500Z",
  "pixel_x": 742,
  "pixel_y": 518
}`}
              </pre>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                * pixel_x and pixel_y represent the BASE CENTER of the detected bounding box.
              </div>
            </div>

            <div style={{ background: 'var(--bg-darkest)', padding: '1.25rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-medium)' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--emerald-400)', marginBottom: '0.5rem' }}>
                HTTP 200 OK (RESPONSE OUTPUT)
              </div>
              <pre className="font-mono" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5, overflowX: 'auto' }}>
{`{
  "camera_id": "CAM_SEC_001",
  "frame_id": "frame_1042",
  "timestamp": "2026-10-04T12:00:01.500Z",
  "pixel": { "x": 742, "y": 518 },
  "local_position": { "east_m": 7.35, "north_m": 26.46 },
  "horizontal_distance_m": 27.46,
  "bearing_deg": 15.52,
  "gps": {
    "latitude": 32.7163476,
    "longitude": 74.8562785
  }
}`}
              </pre>
            </div>
          </div>

          {/* Python Example Code for Teammate */}
          <div style={{ background: 'var(--bg-darkest)', padding: '1.25rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-medium)' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--amber-400)', marginBottom: '0.5rem' }}>
              PYTHON INTEGRATION EXAMPLE (FOR TEAMMATE'S YOLO / DETECTOR LOOP)
            </div>
            <pre className="font-mono" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5, overflowX: 'auto' }}>
{`import requests
from datetime import datetime, timezone

def dispatch_intrusion_event(camera_id, frame_id, bbox_xyxy):
    # Base center of bounding box: x_mid = (x1 + x2)/2, y_base = y2
    x1, y1, x2, y2 = bbox_xyxy
    base_x = (x1 + x2) / 2.0
    base_y = float(y2)

    payload = {
        "camera_id": camera_id,
        "frame_id": frame_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "pixel_x": base_x,
        "pixel_y": base_y
    }

    response = requests.post("http://localhost:8000/api/intrusion/event", json=payload)
    if response.status_code == 200:
        result = response.json()
        print(f"Target at Lat: {result['gps']['latitude']:.7f}, Lon: {result['gps']['longitude']:.7f}")
        print(f"Distance: {result['horizontal_distance_m']}m, Earth Bearing: {result['bearing_deg']}°")
        return result
    else:
        print(f"Localization failed: {response.text}")
        return None`}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
