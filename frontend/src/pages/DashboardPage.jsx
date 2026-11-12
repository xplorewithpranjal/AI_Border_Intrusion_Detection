import React, { useEffect, useState } from 'react';
import {
  Camera,
  Video,
  Crosshair,
  CheckCircle,
  Radio,
  ArrowRight,
  TrendingUp,
  MapPin,
  Maximize2,
  Layers,
  Cpu,
} from 'lucide-react';
import { cameraApi } from '../api/cameraApi';
import { StatusBadge } from '../components/StatusBadge';

export function DashboardPage({ onNavigate }) {
  const [cameras, setCameras] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      const data = await cameraApi.list();
      setCameras(data);
    } catch (err) {
      console.error('Failed to load cameras for dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  const totalCameras = cameras.length;
  const calibratedCameras = cameras.filter((c) => c.status === 'calibrated' || c.calibration_status === 'calibrated').length;
  const uncalibratedCameras = totalCameras - calibratedCameras;
  const totalPillars = cameras.reduce((acc, c) => acc + (c.pillar_count || 0), 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
      {/* Welcome & System Summary Banner */}
      <div
        className="glass-panel"
        style={{
          padding: '1.75rem 2rem',
          background: 'linear-gradient(135deg, rgba(17, 24, 39, 0.9) 0%, rgba(22, 32, 50, 0.7) 100%)',
          border: '1px solid var(--border-accent)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: '-60px',
            right: '-60px',
            width: '220px',
            height: '220px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, var(--cyan-glow) 0%, transparent 70%)',
            pointerEvents: 'none',
          }}
        />
        <div style={{ maxWidth: '850px' }}>
          <div className="badge badge-phase" style={{ marginBottom: '0.75rem' }}>
            Phase 1 • Foundational Architecture Active
          </div>
          <h2 style={{ fontSize: '1.65rem', marginBottom: '0.5rem', fontWeight: 700 }}>
            Border Static Camera Geospatial Localization System
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.925rem', lineHeight: 1.6 }}>
            Deterministic geometric localization platform for fixed border infrastructure cameras. Ingests detected
            intrusion ground-contact base coordinates and translates them into physical boundary positions and GPS
            trajectories via independent camera calibration.
          </p>
          <div style={{ marginTop: '1rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button
              onClick={() => onNavigate('stream')}
              className="btn btn-primary"
              style={{ padding: '0.5rem 1rem' }}
            >
              <Video size={16} />
              <span>Open Live Camera Stream</span>
            </button>
            <button
              onClick={() => onNavigate('cameras')}
              className="btn btn-secondary"
              style={{ padding: '0.5rem 1rem' }}
            >
              <Camera size={16} />
              <span>Configure Cameras</span>
            </button>
          </div>
        </div>
      </div>

      {/* Metric Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.25rem' }}>
        {/* Card 1: Total Cameras */}
        <div className="glass-panel" style={{ padding: '1.25rem 1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Monitored Cameras
              </div>
              <div style={{ fontSize: '2rem', fontWeight: 700, marginTop: '0.35rem', color: 'var(--text-primary)' }}>
                {loading ? '...' : totalCameras}
              </div>
            </div>
            <div
              style={{
                padding: '0.65rem',
                borderRadius: 'var(--radius-md)',
                background: 'rgba(6, 182, 212, 0.12)',
                color: 'var(--cyan-400)',
              }}
            >
              <Camera size={22} />
            </div>
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.75rem' }}>
            Configured fixed surveillance masts
          </div>
        </div>

        {/* Card 2: Calibrated Sensors */}
        <div className="glass-panel" style={{ padding: '1.25rem 1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Calibrated Cameras
              </div>
              <div style={{ fontSize: '2rem', fontWeight: 700, marginTop: '0.35rem', color: 'var(--emerald-400)' }}>
                {loading ? '...' : calibratedCameras}
              </div>
            </div>
            <div
              style={{
                padding: '0.65rem',
                borderRadius: 'var(--radius-md)',
                background: 'rgba(16, 185, 129, 0.12)',
                color: 'var(--emerald-400)',
              }}
            >
              <CheckCircle size={22} />
            </div>
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.75rem' }}>
            Ready for geometric projection
          </div>
        </div>

        {/* Card 3: Pending Calibration */}
        <div className="glass-panel" style={{ padding: '1.25rem 1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Awaiting Calibration
              </div>
              <div style={{ fontSize: '2rem', fontWeight: 700, marginTop: '0.35rem', color: 'var(--amber-400)' }}>
                {loading ? '...' : uncalibratedCameras}
              </div>
            </div>
            <div
              style={{
                padding: '0.65rem',
                borderRadius: 'var(--radius-md)',
                background: 'rgba(245, 158, 11, 0.12)',
                color: 'var(--amber-400)',
              }}
            >
              <Crosshair size={22} />
            </div>
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.75rem' }}>
            Needs pillar point registration
          </div>
        </div>

        {/* Card 4: Reference Pillars */}
        <div className="glass-panel" style={{ padding: '1.25rem 1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Boundary Pillars Registered
              </div>
              <div style={{ fontSize: '2rem', fontWeight: 700, marginTop: '0.35rem', color: 'var(--indigo-400)' }}>
                {loading ? '...' : totalPillars}
              </div>
            </div>
            <div
              style={{
                padding: '0.65rem',
                borderRadius: 'var(--radius-md)',
                background: 'rgba(99, 102, 241, 0.12)',
                color: 'var(--indigo-400)',
              }}
            >
              <MapPin size={22} />
            </div>
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.75rem' }}>
            Known ground geometric anchors
          </div>
        </div>
      </div>

      {/* System Localization Pipeline Architecture Diagram */}
      <div className="glass-panel" style={{ padding: '1.5rem 1.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
          <div>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 600 }}>End-to-End Localization Pipeline</h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              Deterministic data flow from intrusion bounding box base point to real-world GPS and motion vector
            </p>
          </div>
          <div className="badge badge-phase">Deterministic Geometry</div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '0.75rem',
            alignItems: 'center',
          }}
        >
          {/* Step 1 */}
          <div
            style={{
              padding: '1rem',
              borderRadius: 'var(--radius-md)',
              background: 'var(--bg-darkest)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <div style={{ fontSize: '0.7rem', color: 'var(--cyan-400)', fontWeight: 600, textTransform: 'uppercase' }}>
              Step 01
            </div>
            <div style={{ fontWeight: 600, fontSize: '0.9rem', margin: '0.25rem 0' }}>Detection Module</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              External feed: camera_id, object_id, timestamp, base_pixel (x, y)
            </div>
          </div>

          {/* Step 2 */}
          <div
            style={{
              padding: '1rem',
              borderRadius: 'var(--radius-md)',
              background: 'var(--bg-darkest)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <div style={{ fontSize: '0.7rem', color: 'var(--cyan-400)', fontWeight: 600, textTransform: 'uppercase' }}>
              Step 02
            </div>
            <div style={{ fontWeight: 600, fontSize: '0.9rem', margin: '0.25rem 0' }}>Camera Calibration</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Specific calibration matrix (e.g. CAM_001 → H1) based on pillar geometry
            </div>
          </div>

          {/* Step 3 */}
          <div
            style={{
              padding: '1rem',
              borderRadius: 'var(--radius-md)',
              background: 'var(--bg-darkest)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <div style={{ fontSize: '0.7rem', color: 'var(--cyan-400)', fontWeight: 600, textTransform: 'uppercase' }}>
              Step 03
            </div>
            <div style={{ fontWeight: 600, fontSize: '0.9rem', margin: '0.25rem 0' }}>Pixel → Ground</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Base pixel projection onto physical border ground plane (X, Y)
            </div>
          </div>

          {/* Step 4 */}
          <div
            style={{
              padding: '1rem',
              borderRadius: 'var(--radius-md)',
              background: 'var(--bg-darkest)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <div style={{ fontSize: '0.7rem', color: 'var(--cyan-400)', fontWeight: 600, textTransform: 'uppercase' }}>
              Step 04
            </div>
            <div style={{ fontWeight: 600, fontSize: '0.9rem', margin: '0.25rem 0' }}>Ground → GPS</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Local coordinates converted to geodetic WGS84 (Lat, Lon)
            </div>
          </div>

          {/* Step 5 */}
          <div
            style={{
              padding: '1rem',
              borderRadius: 'var(--radius-md)',
              background: 'var(--bg-darkest)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <div style={{ fontSize: '0.7rem', color: 'var(--cyan-400)', fontWeight: 600, textTransform: 'uppercase' }}>
              Step 05
            </div>
            <div style={{ fontWeight: 600, fontSize: '0.9rem', margin: '0.25rem 0' }}>Motion Analysis</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Distance, speed, Earth bearing (0°-360°), trajectory alerts
            </div>
          </div>
        </div>
      </div>

      {/* Quick Action Camera Overview */}
      <div className="glass-panel" style={{ padding: '1.5rem 1.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.2rem' }}>
          <div>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 600 }}>Active Cameras Snapshot</h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              Perimeter sensors registered in SQLite database
            </p>
          </div>
          <button onClick={() => onNavigate('cameras')} className="btn btn-outline-cyan" style={{ fontSize: '0.825rem' }}>
            <span>Manage All Cameras</span>
            <ArrowRight size={15} />
          </button>
        </div>

        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            Loading cameras from database...
          </div>
        ) : cameras.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            No cameras registered yet. Head to the Cameras tab to add your first camera!
          </div>
        ) : (
          <div className="table-container">
            <table className="tactical-table">
              <thead>
                <tr>
                  <th>Camera ID</th>
                  <th>Name / Location</th>
                  <th>Mount Height</th>
                  <th>GPS Coordinates</th>
                  <th>Reference Pillars</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {cameras.slice(0, 5).map((cam) => (
                  <tr key={cam.id}>
                    <td>
                      <span className="font-mono" style={{ color: 'var(--cyan-400)', fontWeight: 600 }}>
                        {cam.camera_id}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontWeight: 500 }}>{cam.name}</div>
                      {cam.description && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {cam.description}
                        </div>
                      )}
                    </td>
                    <td className="font-mono">{cam.height ? `${cam.height} m` : '—'}</td>
                    <td className="font-mono" style={{ fontSize: '0.8rem' }}>
                      {cam.latitude && cam.longitude ? `${cam.latitude.toFixed(4)}, ${cam.longitude.toFixed(4)}` : 'Unassigned'}
                    </td>
                    <td>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '0.15rem 0.5rem',
                          borderRadius: 'var(--radius-sm)',
                          background: 'rgba(255, 255, 255, 0.05)',
                          fontSize: '0.8rem',
                          fontFamily: 'var(--font-mono)',
                        }}
                      >
                        {cam.pillar_count || 0} Pillars
                      </span>
                    </td>
                    <td>
                      <StatusBadge status={cam.calibration_status || cam.status} />
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.4rem' }}>
                        <button
                          onClick={() => onNavigate('stream')}
                          className="btn btn-primary"
                          style={{ padding: '0.35rem 0.65rem', fontSize: '0.78rem' }}
                          title="Watch Live Stream"
                        >
                          <Video size={13} />
                          <span>Stream</span>
                        </button>
                        <button
                          onClick={() => onNavigate('calibration')}
                          className="btn btn-secondary"
                          style={{ padding: '0.35rem 0.65rem', fontSize: '0.78rem' }}
                        >
                          <Crosshair size={13} color="var(--cyan-400)" />
                          <span>Calibrate</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
