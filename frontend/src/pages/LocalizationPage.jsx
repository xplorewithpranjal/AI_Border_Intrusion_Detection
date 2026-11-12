import React, { useEffect, useState } from 'react';
import {
  Radio,
  Send,
  Activity,
  Layers,
  Compass,
  MapPin,
  Clock,
  Video,
  Shield,
  CheckCircle2,
} from 'lucide-react';
import { apiRequest } from '../api/client';

export function LocalizationPage({ showToast }) {
  const [eventForm, setEventForm] = useState({
    camera_id: 'CAM_SEC_001',
    object_id: 'OBJ_HUMAN_042',
    timestamp: new Date().toISOString(),
    base_pixel_x: '460.5',
    base_pixel_y: '680.0',
  });
  const [submitting, setSubmitting] = useState(false);
  const [lastResponse, setLastResponse] = useState(null);
  const [recentEvents, setRecentEvents] = useState([]);

  useEffect(() => {
    let active = true;
    const refreshEvents = async () => {
      try {
        const result = await apiRequest('/api/localization/events?limit=12');
        if (active) setRecentEvents(result.events || []);
      } catch {
        // Keep the page usable while the backend is starting or offline.
      }
    };

    refreshEvents();
    const interval = window.setInterval(refreshEvents, 3000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  const handleTestEventSubmit = async (e) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      const payload = {
        camera_id: eventForm.camera_id,
        object_id: eventForm.object_id,
        timestamp: eventForm.timestamp,
        base_pixel_x: parseFloat(eventForm.base_pixel_x),
        base_pixel_y: parseFloat(eventForm.base_pixel_y),
      };

      const res = await apiRequest('/api/localization/event', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      setLastResponse(res);
      const eventList = await apiRequest('/api/localization/events?limit=12');
      setRecentEvents(eventList.events || []);
      showToast({
        type: 'success',
        message: `Detection event received by backend API contract.`,
      });
    } catch (err) {
      showToast({ type: 'error', message: err.message || 'Failed to dispatch event' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Overview Notice */}
      <div
        className="glass-panel"
        style={{
          padding: '1.5rem',
          border: '1px solid rgba(6, 182, 212, 0.3)',
          background: 'linear-gradient(135deg, rgba(17, 24, 39, 0.95), rgba(22, 32, 50, 0.8))',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
          <div className="badge badge-phase">Live Event Ingestion • Phase 3</div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Live Localization & Motion Ingestion Pipeline</h2>
        </div>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', lineHeight: 1.6 }}>
          Receives detector output, projects ground-contact pixels through the saved camera calibration, and displays
          recent localized events below. GPS is only returned when the selected camera has a valid calibration.
        </p>
      </div>

      <div className="glass-panel" style={{ padding: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
          <div>
            <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Recent Detector Events</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '0.25rem' }}>
              Refreshes every 3 seconds · Latest 12 events
            </p>
          </div>
          <Activity size={18} color="var(--emerald-400)" />
        </div>
        {recentEvents.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', padding: '1.25rem', textAlign: 'center', background: 'var(--bg-darkest)', borderRadius: 'var(--radius-md)' }}>
            No events received yet. Start the detector or submit a test event below.
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '0.6rem' }}>
            {recentEvents.map((event, index) => (
              <div key={`${event.camera_id}-${event.object_id}-${event.timestamp}-${index}`} style={{ display: 'grid', gridTemplateColumns: 'minmax(150px, 1fr) minmax(130px, 1fr) minmax(180px, 1.2fr)', gap: '0.75rem', alignItems: 'center', padding: '0.85rem 1rem', background: 'var(--bg-darkest)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)' }}>
                <div>
                  <div className="font-mono" style={{ fontWeight: 600 }}>{event.object_id || 'Unknown object'}</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>{event.camera_id} · {event.status}</div>
                </div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.78rem' }}>
                  {event.gps ? `${Number(event.gps.latitude).toFixed(6)}, ${Number(event.gps.longitude).toFixed(6)}` : 'GPS unavailable · camera not calibrated'}
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem', textAlign: 'right' }}>
                  {event.timestamp ? new Date(event.timestamp).toLocaleString() : 'Timestamp unavailable'}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* WebRTC Video Architecture Card */}
      <div className="glass-panel" style={{ padding: '1.5rem 1.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
          <Video size={18} color="var(--cyan-400)" />
          <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Planned Video & Transport Architecture</h3>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '1rem',
          }}
        >
          <div style={{ padding: '1rem', background: 'var(--bg-darkest)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--cyan-400)', fontWeight: 600 }}>SOURCE</div>
            <div style={{ fontWeight: 600, margin: '0.2rem 0' }}>Mobile / Static Camera</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Phone camera acts as prototype static camera sensor
            </div>
          </div>

          <div style={{ padding: '1rem', background: 'var(--bg-darkest)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--cyan-400)', fontWeight: 600 }}>TRANSPORT</div>
            <div style={{ fontWeight: 600, margin: '0.2rem 0' }}>WebRTC Protocol</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Ultra-low latency streaming (FastAPI is NOT video transport)
            </div>
          </div>

          <div style={{ padding: '1rem', background: 'var(--bg-darkest)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--cyan-400)', fontWeight: 600 }}>CONTROL & MATH</div>
            <div style={{ fontWeight: 600, margin: '0.2rem 0' }}>FastAPI Backend</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Signaling, calibration retrieval, geometric coordinate projection
            </div>
          </div>

          <div style={{ padding: '1rem', background: 'var(--bg-darkest)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--cyan-400)', fontWeight: 600 }}>PRESENTATION</div>
            <div style={{ fontWeight: 600, margin: '0.2rem 0' }}>React Tactical Dashboard</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Live stream HUD, boundary tracking overlay, speed/bearing displays
            </div>
          </div>
        </div>
      </div>

      {/* Detection Event API Ingestion Tester */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(320px, 1fr)', gap: '1.5rem' }}>
        {/* Event Ingestion Form */}
        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem' }}>
            <Radio size={18} color="var(--emerald-400)" />
            <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Detection Event Ingestion Simulator</h3>
          </div>

          <form onSubmit={handleTestEventSubmit}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div className="form-group">
                <label className="form-label">Camera ID</label>
                <input
                  type="text"
                  required
                  className="form-input font-mono"
                  value={eventForm.camera_id}
                  onChange={(e) => setEventForm({ ...eventForm, camera_id: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Object ID</label>
                <input
                  type="text"
                  required
                  className="form-input font-mono"
                  value={eventForm.object_id}
                  onChange={(e) => setEventForm({ ...eventForm, object_id: e.target.value })}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Timestamp (ISO)</label>
              <input
                type="text"
                required
                className="form-input font-mono"
                value={eventForm.timestamp}
                onChange={(e) => setEventForm({ ...eventForm, timestamp: e.target.value })}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div className="form-group">
                <label className="form-label">Base Pixel X (Ground Point)</label>
                <input
                  type="number"
                  step="any"
                  required
                  className="form-input font-mono"
                  value={eventForm.base_pixel_x}
                  onChange={(e) => setEventForm({ ...eventForm, base_pixel_x: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Base Pixel Y (Ground Point)</label>
                <input
                  type="number"
                  step="any"
                  required
                  className="form-input font-mono"
                  value={eventForm.base_pixel_y}
                  onChange={(e) => setEventForm({ ...eventForm, base_pixel_y: e.target.value })}
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
              <button type="submit" className="btn btn-primary" disabled={submitting}>
                <Send size={15} />
                <span>{submitting ? 'Dispatching...' : 'Dispatch Detection Event'}</span>
              </button>
            </div>
          </form>
        </div>

        {/* Contract Response View */}
        <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem' }}>API Contract Output</h3>
          <div
            style={{
              flex: 1,
              background: '#070a10',
              borderRadius: 'var(--radius-md)',
              padding: '1rem',
              border: '1px solid var(--border-subtle)',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.75rem',
              color: 'var(--cyan-400)',
              overflowX: 'auto',
              minHeight: '220px',
            }}
          >
            {lastResponse ? (
              <pre>{JSON.stringify(lastResponse, null, 2)}</pre>
            ) : (
              <div style={{ color: 'var(--text-muted)', paddingTop: '2rem', textAlign: 'center' }}>
                Dispatch a detection event on the left to inspect the backend architectural contract payload.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
