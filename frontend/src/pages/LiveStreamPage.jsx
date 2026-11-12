import React, { useState, useEffect, useRef } from 'react';
import {
  Video,
  VideoOff,
  Radio,
  Smartphone,
  Monitor,
  RefreshCw,
  Copy,
  Check,
  SwitchCamera,
  Activity,
  Layers,
  Settings,
  AlertTriangle,
  ExternalLink,
  ShieldAlert,
  ShieldCheck,
  Lock,
  Wifi,
} from 'lucide-react';
import { WebRTCClient } from '../services/webrtcClient';
import { cameraApi } from '../api/cameraApi';
import { apiRequest } from '../api/client';
import { StatusBadge } from '../components/StatusBadge';

export function LiveStreamPage({ showToast }) {
  // Query param check for mode (e.g. ?mode=broadcaster)
  const urlParams = new URLSearchParams(window.location.search);
  const initialMode = urlParams.get('mode') === 'broadcaster' ? 'broadcaster' : 'viewer';
  const initialCameraId = urlParams.get('camera_id') || 'CAM_SEC_001';

  // Mode: 'viewer' (desktop dashboard display) or 'broadcaster' (phone camera source)
  const [mode, setMode] = useState(initialMode);
  const [cameras, setCameras] = useState([]);
  const [selectedCameraId, setSelectedCameraId] = useState(initialCameraId);

  // WebRTC Connection & Status
  const [connectionStatus, setConnectionStatus] = useState('DISCONNECTED'); // CONNECTING, CONNECTED, DISCONNECTED, ERROR
  const [cameraState, setCameraState] = useState('IDLE'); // IDLE, STARTING, STREAMING, STOPPED, ERROR
  const [cameraMeta, setCameraMeta] = useState({
    resolution: '—',
    facing_mode: 'environment',
    label: '—',
    fps: 0,
  });

  // Controls (for broadcaster)
  const [facingMode, setFacingMode] = useState('environment'); // 'environment' (rear) or 'user' (front)
  const [resolutionPref, setResolutionPref] = useState('720p'); // 720p, 1080p, 480p

  // Video element refs
  const videoRef = useRef(null);
  const webrtcRef = useRef(null);

  // Live FPS Counter state
  const [liveFps, setLiveFps] = useState(0);
  const frameCountRef = useRef(0);
  const lastFpsTimeRef = useRef(performance.now());
  const rAFRef = useRef(null);

  // Copied link state
  const [copied, setCopied] = useState(false);

  // Dynamic Network & Host Detection (No hardcoded IP or localhost)
  const [networkInfo, setNetworkInfo] = useState(null);
  const [selectedIp, setSelectedIp] = useState('');

  // Is Secure Context check
  const isSecure = typeof window !== 'undefined' ? window.isSecureContext : false;

  // Load cameras list
  useEffect(() => {
    cameraApi
      .list()
      .then((data) => {
        setCameras(data);
        if (data.length > 0 && !urlParams.get('camera_id')) {
          setSelectedCameraId(data[0].camera_id);
        }
      })
      .catch((err) => console.error('Error fetching cameras:', err));
  }, []);

  // Fetch dynamic LAN IP from backend network detection
  useEffect(() => {
    apiRequest('/api/network-info')
      .then((data) => {
        setNetworkInfo(data);
        if (data?.primary_lan_ip) {
          setSelectedIp(data.primary_lan_ip);
        }
      })
      .catch((err) => {
        console.warn('Network info detection failed:', err);
      });
  }, []);

  // Compute live FPS from video playback
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let callbackId;
    const calculateFps = () => {
      frameCountRef.current += 1;
      const now = performance.now();
      const delta = now - lastFpsTimeRef.current;

      if (delta >= 1000) {
        const computed = Math.round((frameCountRef.current * 1000) / delta);
        setLiveFps(computed);
        frameCountRef.current = 0;
        lastFpsTimeRef.current = now;
      }

      if ('requestVideoFrameCallback' in video) {
        callbackId = video.requestVideoFrameCallback(calculateFps);
      } else {
        rAFRef.current = requestAnimationFrame(calculateFps);
      }
    };

    if (connectionStatus === 'CONNECTED' || cameraState === 'STREAMING') {
      if ('requestVideoFrameCallback' in video) {
        callbackId = video.requestVideoFrameCallback(calculateFps);
      } else {
        rAFRef.current = requestAnimationFrame(calculateFps);
      }
    } else {
      setLiveFps(0);
    }

    return () => {
      if (video && 'cancelVideoFrameCallback' in video && callbackId) {
        video.cancelVideoFrameCallback(callbackId);
      }
      if (rAFRef.current) {
        cancelAnimationFrame(rAFRef.current);
      }
    };
  }, [connectionStatus, cameraState]);

  // Clean up WebRTC on unmount or camera/mode switch
  useEffect(() => {
    return () => {
      if (webrtcRef.current) {
        webrtcRef.current.disconnect();
        webrtcRef.current = null;
      }
    };
  }, [selectedCameraId, mode]);

  // =================== VIEWER MODE LIFECYCLE ===================
  useEffect(() => {
    if (mode !== 'viewer' || !selectedCameraId) return;

    // Disconnect any existing client
    if (webrtcRef.current) {
      webrtcRef.current.disconnect();
    }

    const client = new WebRTCClient({
      cameraId: selectedCameraId,
      role: 'viewer',
      onStatusChange: (status) => setConnectionStatus(status),
      onMetaChange: (meta) => setCameraMeta((prev) => ({ ...prev, ...meta })),
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
    };
  }, [mode, selectedCameraId]);

  // =================== BROADCASTER CONTROLS ===================

  const handleStartBroadcaster = async () => {
    try {
      setCameraState('STARTING');
      setConnectionStatus('CONNECTING');

      // Initialize client
      if (webrtcRef.current) {
        webrtcRef.current.disconnect();
      }

      const client = new WebRTCClient({
        cameraId: selectedCameraId,
        role: 'broadcaster',
        onStatusChange: (status) => setConnectionStatus(status),
        onMetaChange: (meta) => setCameraMeta((prev) => ({ ...prev, ...meta })),
      });

      webrtcRef.current = client;

      // Request media stream from device
      const stream = await client.startCamera({
        facingMode,
        resolution: resolutionPref,
      });

      // Bind local stream to viewfinder preview
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.muted = true;
        videoRef.current.play().catch(console.error);
      }

      // Connect signaling to start accepting viewers
      client.connectSignaling();

      setCameraState('STREAMING');
      showToast?.({
        type: 'success',
        message: `Camera live on ${selectedCameraId} (${facingMode === 'environment' ? 'Rear' : 'Front'})`,
      });
    } catch (err) {
      console.error('Camera startup error:', err);
      setCameraState('ERROR');
      setConnectionStatus('ERROR');
      showToast?.({
        type: 'error',
        message: err.message || 'Could not access phone camera.',
      });
    }
  };

  const handleStopBroadcaster = () => {
    if (webrtcRef.current) {
      webrtcRef.current.disconnect();
      webrtcRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraState('STOPPED');
    setConnectionStatus('DISCONNECTED');
    setLiveFps(0);
    showToast?.({ type: 'info', message: 'Camera stream stopped.' });
  };

  const handleFlipCamera = async () => {
    const nextMode = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextMode);

    if (cameraState === 'STREAMING' && webrtcRef.current) {
      try {
        const stream = await webrtcRef.current.startCamera({
          facingMode: nextMode,
          resolution: resolutionPref,
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        showToast?.({
          type: 'info',
          message: `Switched to ${nextMode === 'environment' ? 'Rear' : 'Front'} Camera`,
        });
      } catch (err) {
        showToast?.({ type: 'error', message: err.message });
      }
    }
  };

  // Dynamic host determination (never hardcoding 192.168.1.77 or localhost)
  const isLocalHost = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
  const activeHost = isLocalHost
    ? (selectedIp || networkInfo?.primary_lan_ip || window.location.hostname)
    : window.location.hostname;
  const currentPort = typeof window !== 'undefined' && window.location.port ? `:${window.location.port}` : '';
  const currentProtocol = typeof window !== 'undefined' ? window.location.protocol : 'https:';
  const mobileLanUrl = `${currentProtocol}//${activeHost}${currentPort}/?mode=broadcaster&camera_id=${selectedCameraId}`;

  const copyMobileLink = () => {
    navigator.clipboard?.writeText(mobileLanUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
    showToast?.({ type: 'success', message: 'Phone camera link copied to clipboard!' });
  };

  // Status pill badge color
  const getStatusColor = (status) => {
    switch (status) {
      case 'CONNECTED':
        return 'var(--emerald-400)';
      case 'CONNECTING':
        return 'var(--cyan-400)';
      case 'ERROR':
        return 'var(--rose-400)';
      case 'DISCONNECTED':
      default:
        return 'var(--text-muted)';
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Top Mode Switcher & Camera Selector */}
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
          {/* Target Camera Dropdown */}
          <div>
            <label className="form-label" style={{ display: 'block', marginBottom: '0.25rem' }}>
              Target Camera:
            </label>
            <select
              value={selectedCameraId}
              onChange={(e) => setSelectedCameraId(e.target.value)}
              className="form-select font-mono"
              style={{ minWidth: '240px', fontWeight: 600 }}
            >
              {cameras.map((c) => (
                <option key={c.id} value={c.camera_id}>
                  {c.camera_id} — {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Mode Switch Tabs (Desktop Display vs Mobile Camera Source) */}
          <div>
            <label className="form-label" style={{ display: 'block', marginBottom: '0.25rem' }}>
              Interface Role:
            </label>
            <div
              style={{
                display: 'inline-flex',
                background: 'var(--bg-darkest)',
                padding: '0.2rem',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <button
                type="button"
                onClick={() => setMode('viewer')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  padding: '0.4rem 0.85rem',
                  borderRadius: 'var(--radius-sm)',
                  border: 'none',
                  background: mode === 'viewer' ? 'rgba(6, 182, 212, 0.2)' : 'transparent',
                  color: mode === 'viewer' ? 'var(--cyan-400)' : 'var(--text-secondary)',
                  fontWeight: mode === 'viewer' ? 600 : 500,
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                <Monitor size={15} />
                <span>Dashboard Display (Desktop)</span>
              </button>
              <button
                type="button"
                onClick={() => setMode('broadcaster')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  padding: '0.4rem 0.85rem',
                  borderRadius: 'var(--radius-sm)',
                  border: 'none',
                  background: mode === 'broadcaster' ? 'rgba(16, 185, 129, 0.2)' : 'transparent',
                  color: mode === 'broadcaster' ? 'var(--emerald-400)' : 'var(--text-secondary)',
                  fontWeight: mode === 'broadcaster' ? 600 : 500,
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                <Smartphone size={15} />
                <span>Phone Camera Source (Mobile)</span>
              </button>
            </div>
          </div>
        </div>

        {/* Global Connection & Security Badges */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
          {/* Security Context Badge */}
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '0.35rem 0.75rem',
              borderRadius: 'var(--radius-full)',
              background: isSecure ? 'rgba(16, 185, 129, 0.12)' : 'rgba(245, 158, 11, 0.12)',
              border: `1px solid ${isSecure ? 'rgba(16, 185, 129, 0.4)' : 'rgba(245, 158, 11, 0.4)'}`,
              color: isSecure ? 'var(--emerald-400)' : 'var(--amber-400)',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.75rem',
              fontWeight: 600,
            }}
            title={isSecure ? 'Page running in Secure Context (HTTPS/localhost)' : 'Insecure HTTP: Camera API disabled by mobile browsers'}
          >
            {isSecure ? <ShieldCheck size={14} /> : <AlertTriangle size={14} />}
            <span>{isSecure ? 'HTTPS Secure Context' : 'HTTP Insecure'}</span>
          </span>

          {/* WebRTC Status Badge */}
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.45rem',
              padding: '0.35rem 0.75rem',
              borderRadius: 'var(--radius-full)',
              background: 'var(--bg-darkest)',
              border: `1px solid ${getStatusColor(connectionStatus)}`,
              color: getStatusColor(connectionStatus),
              fontFamily: 'var(--font-mono)',
              fontSize: '0.75rem',
              fontWeight: 600,
              textTransform: 'uppercase',
            }}
          >
            <span
              style={{
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                backgroundColor: getStatusColor(connectionStatus),
                display: 'inline-block',
                boxShadow: `0 0 8px ${getStatusColor(connectionStatus)}`,
              }}
            />
            {connectionStatus}
          </span>
        </div>
      </div>

      {/* Broadcaster Secure Context Confirmation Banner on Mobile */}
      {mode === 'broadcaster' && isSecure && (
        <div
          style={{
            padding: '0.75rem 1.25rem',
            borderRadius: 'var(--radius-md)',
            background: 'rgba(16, 185, 129, 0.1)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            color: 'var(--emerald-400)',
            fontSize: '0.825rem',
            lineHeight: 1.4,
            display: 'flex',
            alignItems: 'center',
            gap: '0.65rem',
          }}
        >
          <ShieldCheck size={18} style={{ flexShrink: 0 }} />
          <span>
            <strong>Secure Context Active (HTTPS):</strong> Physical camera API (<code>navigator.mediaDevices.getUserMedia</code>) is authorized. Tap "Start Camera Stream" below to broadcast live.
          </span>
        </div>
      )}

      {/* Insecure Context Warning Banner if accessed over plain HTTP */}
      {!isSecure && (
        <div
          style={{
            padding: '1rem 1.25rem',
            borderRadius: 'var(--radius-md)',
            background: 'rgba(245, 158, 11, 0.1)',
            border: '1px solid rgba(245, 158, 11, 0.3)',
            color: 'var(--amber-400)',
            fontSize: '0.825rem',
            lineHeight: 1.5,
            display: 'flex',
            gap: '0.75rem',
          }}
        >
          <AlertTriangle size={20} style={{ flexShrink: 0, marginTop: '2px' }} />
          <div>
            <strong>Mobile Browser Camera Security Requirement (HTTPS Required):</strong>
            <p style={{ marginTop: '0.2rem', color: 'var(--text-secondary)' }}>
              Modern mobile browsers (Chrome / Safari) strictly block camera access over plain HTTP on LAN.
              Please switch to the HTTPS development server URL:
            </p>
            <div style={{ marginTop: '0.4rem' }}>
              <a
                href={`https://${activeHost}${currentPort}/?mode=broadcaster&camera_id=${selectedCameraId}`}
                style={{
                  color: 'var(--cyan-400)',
                  fontWeight: 600,
                  textDecoration: 'underline',
                  wordBreak: 'break-all',
                }}
              >
                https://{activeHost}{currentPort}/?mode=broadcaster&camera_id={selectedCameraId}
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Main Workspace Grid: Video Display + Technical Status Panel */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.9fr) minmax(320px, 1fr)', gap: '1.5rem' }}>
        {/* Left Column: Live Video Display / Viewfinder */}
        <div className="glass-panel" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Section Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Radio size={18} color="var(--cyan-400)" />
              <h3 style={{ fontSize: '1.05rem', fontWeight: 600 }}>
                {mode === 'viewer' ? 'Live Static Camera Stream Feed' : 'Phone Camera Viewfinder (Broadcaster)'}
              </h3>
            </div>
            <div className="font-mono" style={{ fontSize: '0.8rem', color: 'var(--cyan-400)' }}>
              {selectedCameraId}
            </div>
          </div>

          {/* Video Container with Tactical HUD */}
          <div
            style={{
              position: 'relative',
              borderRadius: 'var(--radius-md)',
              overflow: 'hidden',
              backgroundColor: '#070a10',
              border: '1px solid var(--border-medium)',
              aspectRatio: '16/9',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {/* The Video Element */}
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted={mode === 'broadcaster'} // always mute broadcaster to avoid feedback
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                display:
                  (mode === 'viewer' && connectionStatus === 'CONNECTED') ||
                  (mode === 'broadcaster' && cameraState === 'STREAMING')
                    ? 'block'
                    : 'none',
              }}
            />

            {/* Offline / Standby Placeholder */}
            {!(
              (mode === 'viewer' && connectionStatus === 'CONNECTED') ||
              (mode === 'broadcaster' && cameraState === 'STREAMING')
            ) && (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.85rem',
                  color: 'var(--text-muted)',
                  textAlign: 'center',
                  padding: '2rem',
                }}
              >
                <div
                  style={{
                    width: '64px',
                    height: '64px',
                    borderRadius: '50%',
                    background: 'rgba(255, 255, 255, 0.03)',
                    border: '1px dashed var(--border-medium)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--text-secondary)',
                  }}
                >
                  <VideoOff size={28} />
                </div>
                <div>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '1rem' }}>
                    {mode === 'viewer' ? 'Waiting for Live Phone Stream' : 'Camera Inactive'}
                  </div>
                  <div style={{ fontSize: '0.8rem', maxWidth: '380px', marginTop: '0.35rem' }}>
                    {mode === 'viewer'
                      ? `Open this application on your mobile phone on the local Wi-Fi to transmit live video for ${selectedCameraId}.`
                      : 'Click "Start Camera Stream" below to grant browser permission and start broadcasting.'}
                  </div>
                </div>
              </div>
            )}

            {/* Tactical HUD Overlay (When Video is Live) */}
            {((mode === 'viewer' && connectionStatus === 'CONNECTED') ||
              (mode === 'broadcaster' && cameraState === 'STREAMING')) && (
              <>
                {/* Live Beacon (Top-Left) */}
                <div
                  style={{
                    position: 'absolute',
                    top: '14px',
                    left: '14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    background: 'rgba(7, 10, 16, 0.75)',
                    backdropFilter: 'blur(6px)',
                    padding: '0.25rem 0.65rem',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid rgba(244, 63, 94, 0.4)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.72rem',
                    color: 'var(--rose-400)',
                    fontWeight: 700,
                  }}
                >
                  <span
                    style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      backgroundColor: 'var(--rose-500)',
                      boxShadow: '0 0 8px var(--rose-glow)',
                      animation: 'pulseGlow 1.5s infinite',
                    }}
                  />
                  <span>LIVE FEED</span>
                </div>

                {/* Tactical FPS & Resolution Tag (Top-Right) */}
                <div
                  style={{
                    position: 'absolute',
                    top: '14px',
                    right: '14px',
                    background: 'rgba(7, 10, 16, 0.75)',
                    backdropFilter: 'blur(6px)',
                    padding: '0.25rem 0.65rem',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-subtle)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.72rem',
                    color: 'var(--cyan-400)',
                  }}
                >
                  {cameraMeta.resolution} | {liveFps || cameraMeta.fps || 30} FPS
                </div>

                {/* Bottom Bar: Camera ID & Timestamp */}
                <div
                  style={{
                    position: 'absolute',
                    bottom: '12px',
                    left: '14px',
                    right: '14px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: 'rgba(7, 10, 16, 0.75)',
                    backdropFilter: 'blur(6px)',
                    padding: '0.35rem 0.75rem',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-subtle)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.72rem',
                    color: 'var(--text-secondary)',
                  }}
                >
                  <span>
                    CAM: <strong style={{ color: 'var(--text-primary)' }}>{selectedCameraId}</strong>
                  </span>
                  <span>MODE: {mode === 'viewer' ? 'RECEIVER (WebRTC)' : 'SENDER (Phone)'}</span>
                  <span>TIME: {new Date().toLocaleTimeString()}</span>
                </div>
              </>
            )}
          </div>

          {/* Broadcaster Mobile Controls */}
          {mode === 'broadcaster' && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '0.75rem',
                paddingTop: '0.5rem',
              }}
            >
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                {/* Flip Camera Button */}
                <button
                  type="button"
                  onClick={handleFlipCamera}
                  className="btn btn-secondary"
                  title="Switch between front and rear camera"
                >
                  <SwitchCamera size={16} />
                  <span>{facingMode === 'environment' ? 'Rear (Preferred)' : 'Front'} Camera</span>
                </button>

                {/* Resolution selector */}
                <select
                  value={resolutionPref}
                  onChange={(e) => setResolutionPref(e.target.value)}
                  className="form-select font-mono"
                  style={{ width: '130px', padding: '0.45rem 0.65rem' }}
                  disabled={cameraState === 'STREAMING'}
                >
                  <option value="720p">720p HD</option>
                  <option value="1080p">1080p FHD</option>
                  <option value="480p">480p SD</option>
                </select>
              </div>

              {/* Start / Stop Button */}
              {cameraState === 'STREAMING' ? (
                <button
                  type="button"
                  onClick={handleStopBroadcaster}
                  className="btn btn-danger"
                  style={{ padding: '0.65rem 1.4rem', fontWeight: 600 }}
                >
                  <VideoOff size={16} />
                  <span>Stop Camera Stream</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleStartBroadcaster}
                  className="btn btn-primary"
                  style={{ padding: '0.65rem 1.4rem', fontWeight: 600 }}
                  disabled={cameraState === 'STARTING'}
                >
                  <Video size={16} />
                  <span>{cameraState === 'STARTING' ? 'Requesting Permission...' : 'Start Camera Stream'}</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Right Column: Technical Status Panel & Mobile Connection Guide */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Requirement 10: Small Technical Status Panel */}
          <div className="glass-panel" style={{ padding: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
              <Activity size={18} color="var(--cyan-400)" />
              <h3 style={{ fontSize: '0.95rem', fontWeight: 600 }}>Technical Stream Status Panel</h3>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {/* Row 1: Camera Status */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '0.5rem 0.75rem',
                  background: 'var(--bg-darkest)',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Camera Status:</span>
                <span
                  style={{
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    color:
                      connectionStatus === 'CONNECTED' || cameraState === 'STREAMING'
                        ? 'var(--emerald-400)'
                        : 'var(--text-secondary)',
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  {mode === 'broadcaster' ? cameraState : connectionStatus === 'CONNECTED' ? 'STREAMING' : 'IDLE'}
                </span>
              </div>

              {/* Row 2: WebRTC Connection Status */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '0.5rem 0.75rem',
                  background: 'var(--bg-darkest)',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>WebRTC Status:</span>
                <span
                  style={{
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    color: getStatusColor(connectionStatus),
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  {connectionStatus}
                </span>
              </div>

              {/* Row 3: Selected Camera */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '0.5rem 0.75rem',
                  background: 'var(--bg-darkest)',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Selected Camera:</span>
                <span className="font-mono" style={{ fontSize: '0.8rem', color: 'var(--cyan-400)', fontWeight: 600 }}>
                  {selectedCameraId}
                </span>
              </div>

              {/* Row 4: Video Resolution */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '0.5rem 0.75rem',
                  background: 'var(--bg-darkest)',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Video Resolution:</span>
                <span className="font-mono" style={{ fontSize: '0.8rem', color: 'var(--text-primary)' }}>
                  {cameraMeta.resolution || 'Waiting for stream...'}
                </span>
              </div>

              {/* Row 5: Approximate FPS */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '0.5rem 0.75rem',
                  background: 'var(--bg-darkest)',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Approximate FPS:</span>
                <span
                  className="font-mono"
                  style={{
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    color: liveFps > 0 ? 'var(--emerald-400)' : 'var(--text-muted)',
                  }}
                >
                  {liveFps > 0 ? `${liveFps} FPS` : connectionStatus === 'CONNECTED' ? 'Calculating...' : '0 FPS'}
                </span>
              </div>

              {/* Row 6: Facing Mode (Camera Optics) */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '0.5rem 0.75rem',
                  background: 'var(--bg-darkest)',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Camera Optics:</span>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  {cameraMeta.facing_mode === 'environment' || facingMode === 'environment'
                    ? 'Rear / Environment'
                    : 'Front / User'}
                </span>
              </div>

              {/* Row 7: Security Context */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '0.5rem 0.75rem',
                  background: 'var(--bg-darkest)',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Security Context:</span>
                <span
                  style={{
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    color: isSecure ? 'var(--emerald-400)' : 'var(--amber-400)',
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  {isSecure ? 'Secure Context (HTTPS 🔒)' : 'Insecure (HTTP ⚠️)'}
                </span>
              </div>

              {/* Row 8: Signaling Transport */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '0.5rem 0.75rem',
                  background: 'var(--bg-darkest)',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Signaling Transport:</span>
                <span className="font-mono" style={{ fontSize: '0.8rem', color: 'var(--cyan-400)' }}>
                  {currentProtocol === 'https:' ? 'WSS (Secure WebSocket)' : 'WS (WebSocket)'}
                </span>
              </div>

              {/* Row 9: LAN Host */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '0.5rem 0.75rem',
                  background: 'var(--bg-darkest)',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Target Host:</span>
                <span className="font-mono" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  {activeHost}
                </span>
              </div>
            </div>
          </div>

          {/* Connect Phone Camera Guide (For Desktop Viewer Mode) */}
          {mode === 'viewer' && (
            <div
              className="glass-panel"
              style={{
                padding: '1.25rem',
                border: '1px solid rgba(6, 182, 212, 0.3)',
                background: 'linear-gradient(135deg, rgba(17, 24, 39, 0.95), rgba(22, 32, 50, 0.85))',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Smartphone size={16} color="var(--cyan-400)" />
                  <h4 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--cyan-400)' }}>
                    Connect Mobile Phone Camera
                  </h4>
                </div>
                <span
                  style={{
                    fontSize: '0.68rem',
                    padding: '0.15rem 0.45rem',
                    borderRadius: 'var(--radius-sm)',
                    background: isSecure ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                    color: isSecure ? 'var(--emerald-400)' : 'var(--amber-400)',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.25rem',
                  }}
                >
                  <Lock size={10} />
                  {isSecure ? 'HTTPS SECURE' : 'HTTP INSECURE'}
                </span>
              </div>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                Open this URL in the browser on your phone (connected to the same Wi-Fi) to stream video live:
              </p>

              {/* Dynamic LAN IP Selector if multiple adapters detected */}
              {networkInfo?.available_ips && networkInfo.available_ips.length > 1 && (
                <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Target Host IP:</span>
                  <select
                    value={selectedIp}
                    onChange={(e) => setSelectedIp(e.target.value)}
                    className="form-select font-mono"
                    style={{ fontSize: '0.72rem', padding: '0.2rem 0.5rem', height: 'auto' }}
                  >
                    {networkInfo.available_ips.map((ip) => (
                      <option key={ip} value={ip}>
                        {ip} {ip === networkInfo.primary_lan_ip ? '(Primary Wi-Fi/LAN)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div
                style={{
                  marginTop: '0.75rem',
                  padding: '0.6rem 0.75rem',
                  background: 'var(--bg-darkest)',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-subtle)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '0.5rem',
                }}
              >
                <span
                  className="font-mono"
                  style={{
                    fontSize: '0.72rem',
                    color: 'var(--cyan-400)',
                    wordBreak: 'break-all',
                    userSelect: 'all',
                  }}
                >
                  {mobileLanUrl}
                </span>
                <button
                  type="button"
                  onClick={copyMobileLink}
                  className="btn btn-secondary"
                  style={{ padding: '0.3rem 0.55rem', flexShrink: 0 }}
                  title="Copy link"
                >
                  {copied ? <Check size={14} color="var(--emerald-400)" /> : <Copy size={14} />}
                </button>
              </div>

              {/* Step-by-step Mobile SSL Guidance */}
              <div
                style={{
                  marginTop: '0.75rem',
                  padding: '0.65rem 0.75rem',
                  background: 'rgba(0, 0, 0, 0.35)',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid rgba(255, 255, 255, 0.05)',
                  fontSize: '0.72rem',
                  color: 'var(--text-secondary)',
                  lineHeight: 1.45,
                }}
              >
                <div style={{ fontWeight: 600, color: 'var(--cyan-300)', marginBottom: '0.3rem' }}>
                  📱 Mobile Connection Instructions:
                </div>
                <ol style={{ paddingLeft: '1.15rem', margin: 0 }}>
                  <li>Open the link above in Chrome or Safari on your phone.</li>
                  <li>
                    <strong>First-Time SSL Warning:</strong> Because a self-signed dev certificate is used, Chrome will show <em>"Your connection is not private"</em>. Tap <strong>Advanced</strong> &rarr; <strong>Proceed to {activeHost} (unsafe)</strong>.
                  </li>
                  <li>
                    Tap <strong>Start Camera Stream</strong> & approve camera access when prompted.
                  </li>
                </ol>
              </div>

              <div style={{ marginTop: '0.75rem', fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                💡 <em>Tip: You can also click the "Phone Camera Source" tab above to test right in this browser tab using your webcam.</em>
              </div>
            </div>
          )}

          {/* Architecture Separation Notice */}
          <div
            className="glass-panel"
            style={{
              padding: '1.25rem',
              background: 'var(--bg-darkest)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
              <Layers size={14} color="var(--cyan-400)" />
              <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--cyan-400)', textTransform: 'uppercase' }}>
                Phase 2 Decoupled Architecture
              </span>
            </div>
            <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
              WebRTC P2P handles video transport directly between peers. FastAPI handles WebSocket signaling without
              bearing video bandwidth. Prepared for future frame processing pipelines.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
