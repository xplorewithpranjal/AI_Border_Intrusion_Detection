/**
 * WebRTC Streaming Service
 * Handles media capture (getUserMedia), WebRTC RTCPeerConnection negotiation,
 * and WebSocket signaling between phone camera (broadcaster) and dashboard (viewer).
 */

const RTC_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
};

export class WebRTCClient {
  constructor({ cameraId, role, onStatusChange, onMetaChange, onRemoteStream }) {
    this.cameraId = cameraId;
    this.role = role; // 'broadcaster' or 'viewer'
    this.clientId = `${role}_${Math.random().toString(36).substring(2, 9)}`;

    this.onStatusChange = onStatusChange || (() => {});
    this.onMetaChange = onMetaChange || (() => {});
    this.onRemoteStream = onRemoteStream || (() => {});

    this.ws = null;
    this.localStream = null;
    this.peerConnections = {}; // Map of targetId -> RTCPeerConnection (for broadcaster), or { broadcaster: pc } (for viewer)
    this.status = 'DISCONNECTED'; // CONNECTING, CONNECTED, DISCONNECTED, ERROR
    this.pingInterval = null;
  }

  _setStatus(newStatus) {
    this.status = newStatus;
    this.onStatusChange(newStatus);
  }

  /**
   * Connects to FastAPI WebSocket signaling endpoint.
   */
  connectSignaling() {
    this._setStatus('CONNECTING');

    const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
    const wsOverride = urlParams?.get('ws_url') || import.meta.env?.VITE_WS_URL;

    let wsUrl;
    if (wsOverride) {
      const base = wsOverride.replace(/\/$/, '');
      wsUrl = `${base}/api/ws/signaling/${this.cameraId}?role=${this.role}&client_id=${this.clientId}`;
    } else {
      const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';
      const protocol = isHttps ? 'wss:' : 'ws:';
      const host = window.location.host;
      wsUrl = `${protocol}//${host}/api/ws/signaling/${this.cameraId}?role=${this.role}&client_id=${this.clientId}`;
    }

    // Force secure WSS if the page is loaded under HTTPS to avoid mixed-content blocks
    if (typeof window !== 'undefined' && window.location.protocol === 'https:' && wsUrl.startsWith('ws:')) {
      wsUrl = wsUrl.replace(/^ws:/, 'wss:');
    }

    console.log(`[WebRTC] Connecting signaling via: ${wsUrl} (Role: ${this.role}, SecureContext: ${typeof window !== 'undefined' ? window.isSecureContext : false})`);

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        // Keepalive heartbeat every 20s
        this.pingInterval = setInterval(() => {
          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type: 'ping' }));
          }
        }, 20000);
      };

      this.ws.onmessage = async (event) => {
        try {
          const msg = JSON.parse(event.data);
          await this._handleSignalingMessage(msg);
        } catch (e) {
          console.error('[WebRTC] Signaling parse error:', e);
        }
      };

      this.ws.onerror = (err) => {
        console.error('[WebRTC] Signaling error:', err);
        this._setStatus('ERROR');
      };

      this.ws.onclose = () => {
        clearInterval(this.pingInterval);
        this._setStatus('DISCONNECTED');
      };
    } catch (err) {
      console.error('[WebRTC] Failed to open WebSocket:', err);
      this._setStatus('ERROR');
    }
  }

  async _handleSignalingMessage(msg) {
    switch (msg.type) {
      case 'registered':
        if (this.role === 'broadcaster') {
          // Broadcaster is registered and waiting for viewers
          this._setStatus(this.localStream ? 'CONNECTED' : 'CONNECTING');
        }
        break;

      case 'broadcaster-status':
        if (this.role === 'viewer') {
          if (msg.online) {
            this._setStatus('CONNECTING');
            if (msg.meta) this.onMetaChange(msg.meta);
          } else {
            this._setStatus('DISCONNECTED');
            this._closeAllPeerConnections();
          }
        }
        break;

      case 'viewer-joined':
        // A new viewer arrived; broadcaster creates an SDP offer specifically for this viewer
        if (this.role === 'broadcaster' && msg.viewer_id) {
          await this._createOfferForViewer(msg.viewer_id);
        }
        break;

      case 'viewer-left':
        if (this.role === 'broadcaster' && msg.viewer_id) {
          this._closePeerConnection(msg.viewer_id);
        }
        break;

      case 'offer':
        // Viewer receives SDP offer from broadcaster
        if (this.role === 'viewer') {
          await this._handleOffer(msg.sender, msg.sdp);
        }
        break;

      case 'answer':
        // Broadcaster receives SDP answer from viewer
        if (this.role === 'broadcaster') {
          await this._handleAnswer(msg.sender, msg.sdp);
        }
        break;

      case 'ice-candidate':
        // Received ICE candidate from peer
        await this._handleIceCandidate(msg.sender, msg.candidate);
        break;

      case 'camera-meta':
        if (this.role === 'viewer' && msg.meta) {
          this.onMetaChange(msg.meta);
        }
        break;

      case 'pong':
        break;

      default:
        break;
    }
  }

  // =================== BROADCASTER METHODS ===================

  /**
   * Initializes local phone camera stream.
   * @param {'environment' | 'user'} facingMode
   * @param {'720p' | '1080p' | '480p'} resolution
   */
  async startCamera({ facingMode = 'environment', resolution = '720p' } = {}) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error(
        'Camera API not supported or inaccessible. Ensure you are in a Secure Context (HTTPS or localhost).'
      );
    }

    let width = 1280;
    let height = 720;
    if (resolution === '1080p') {
      width = 1920;
      height = 1080;
    } else if (resolution === '480p') {
      width = 640;
      height = 480;
    }

    const constraints = {
      audio: false,
      video: {
        facingMode: { ideal: facingMode },
        width: { ideal: width },
        height: { ideal: height },
        frameRate: { ideal: 30 },
      },
    };

    // Stop existing stream if any
    this.stopCamera();

    this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
    const videoTrack = this.localStream.getVideoTracks()[0];
    const settings = videoTrack ? videoTrack.getSettings() : {};

    // Publish camera metadata to signaling
    const meta = {
      resolution: `${settings.width || width}x${settings.height || height}`,
      facing_mode: settings.facingMode || facingMode,
      frameRate: settings.frameRate || 30,
      label: videoTrack?.label || 'Mobile Camera',
    };
    this.onMetaChange(meta);

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'camera-meta', meta }));
    }

    return this.localStream;
  }

  stopCamera() {
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }
    this._closeAllPeerConnections();
  }

  async _createOfferForViewer(viewerId) {
    if (!this.localStream) return;

    const pc = new RTCPeerConnection(RTC_CONFIG);
    this.peerConnections[viewerId] = pc;

    // Add local tracks to peer connection
    this.localStream.getTracks().forEach((track) => {
      pc.addTrack(track, this.localStream);
    });

    pc.onicecandidate = (event) => {
      if (event.candidate && this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(
          JSON.stringify({
            type: 'ice-candidate',
            candidate: event.candidate,
            target: viewerId,
          })
        );
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        this._setStatus('CONNECTED');
      } else if (pc.connectionState === 'failed') {
        this._setStatus('ERROR');
      }
    };

    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(
          JSON.stringify({
            type: 'offer',
            sdp: pc.localDescription,
            target: viewerId,
          })
        );
      }
    } catch (err) {
      console.error('[WebRTC] Error creating offer for viewer:', err);
    }
  }

  async _handleAnswer(senderId, sdp) {
    const pc = this.peerConnections[senderId];
    if (pc) {
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      } catch (err) {
        console.error('[WebRTC] Error setting remote answer:', err);
      }
    }
  }

  // =================== VIEWER METHODS ===================

  async _handleOffer(broadcasterId, sdp) {
    const pc = new RTCPeerConnection(RTC_CONFIG);
    this.peerConnections[broadcasterId] = pc;

    pc.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        this.onRemoteStream(event.streams[0]);
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate && this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(
          JSON.stringify({
            type: 'ice-candidate',
            candidate: event.candidate,
            target: broadcasterId,
          })
        );
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        this._setStatus('CONNECTED');
      } else if (pc.connectionState === 'disconnected') {
        this._setStatus('DISCONNECTED');
      } else if (pc.connectionState === 'failed') {
        this._setStatus('ERROR');
      }
    };

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(
          JSON.stringify({
            type: 'answer',
            sdp: pc.localDescription,
            target: broadcasterId,
          })
        );
      }
    } catch (err) {
      console.error('[WebRTC] Error handling offer:', err);
      this._setStatus('ERROR');
    }
  }

  async _handleIceCandidate(senderId, candidate) {
    const pc = this.peerConnections[senderId];
    if (pc && candidate) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.error('[WebRTC] Error adding ICE candidate:', err);
      }
    }
  }

  _closePeerConnection(id) {
    if (this.peerConnections[id]) {
      try {
        this.peerConnections[id].close();
      } catch {}
      del: delete this.peerConnections[id];
    }
  }

  _closeAllPeerConnections() {
    Object.keys(this.peerConnections).forEach((id) => {
      try {
        this.peerConnections[id].close();
      } catch {}
    });
    this.peerConnections = {};
  }

  disconnect() {
    this.stopCamera();
    clearInterval(this.pingInterval);
    if (this.ws) {
      try {
        this.ws.send(JSON.stringify({ type: 'leave' }));
        this.ws.close();
      } catch {}
      this.ws = null;
    }
    this._setStatus('DISCONNECTED');
  }
}
