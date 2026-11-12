import React, { useEffect, useState } from 'react';
import {
  Plus,
  Search,
  Eye,
  Edit2,
  Trash2,
  Camera,
  Video,
  MapPin,
  Layers,
  Calendar,
  AlertCircle,
  Check,
} from 'lucide-react';
import { cameraApi } from '../api/cameraApi';
import { pillarApi } from '../api/pillarApi';
import { StatusBadge } from '../components/StatusBadge';
import { Modal } from '../components/Modal';

export function CamerasPage({ showToast, onNavigate }) {
  const [cameras, setCameras] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Modals state
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isViewOpen, setIsViewOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);

  // Selected camera
  const [selectedCam, setSelectedCam] = useState(null);
  const [selectedPillars, setSelectedPillars] = useState([]);
  const [loadingPillars, setLoadingPillars] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    camera_id: '',
    name: '',
    description: '',
    latitude: '',
    longitude: '',
    height: '',
    status: 'uncalibrated',
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadCameras();
  }, []);

  const loadCameras = async () => {
    try {
      setLoading(true);
      const data = await cameraApi.list();
      setCameras(data);
    } catch (err) {
      showToast({ type: 'error', message: err.message || 'Failed to load cameras' });
    } finally {
      setLoading(false);
    }
  };

  const handleOpenAdd = () => {
    const nextNum = cameras.length + 1;
    const defaultId = `CAM_SEC_${String(nextNum).padStart(3, '0')}`;
    setFormData({
      camera_id: defaultId,
      name: '',
      description: '',
      latitude: '',
      longitude: '',
      height: '',
      status: 'uncalibrated',
    });
    setIsAddOpen(true);
  };

  const handleOpenEdit = (cam) => {
    setSelectedCam(cam);
    setFormData({
      name: cam.name,
      description: cam.description || '',
      latitude: cam.latitude !== null ? cam.latitude : '',
      longitude: cam.longitude !== null ? cam.longitude : '',
      height: cam.height !== null ? cam.height : '',
      status: cam.status || 'uncalibrated',
    });
    setIsEditOpen(true);
  };

  const handleOpenView = async (cam) => {
    setSelectedCam(cam);
    setIsViewOpen(true);
    setLoadingPillars(true);
    try {
      const pillars = await pillarApi.listByCamera(cam.camera_id);
      setSelectedPillars(pillars);
    } catch (err) {
      console.error('Failed to load camera pillars:', err);
      setSelectedPillars([]);
    } finally {
      setLoadingPillars(false);
    }
  };

  const handleOpenDelete = (cam) => {
    setSelectedCam(cam);
    setIsDeleteOpen(true);
  };

  // Submit Add
  const handleAddSubmit = async (e) => {
    e.preventDefault();
    if (!formData.camera_id || !formData.name) {
      showToast({ type: 'warning', message: 'Camera ID and Name are required.' });
      return;
    }

    try {
      setSubmitting(true);
      const payload = {
        camera_id: formData.camera_id.trim().toUpperCase(),
        name: formData.name.trim(),
        description: formData.description.trim() || null,
        latitude: formData.latitude !== '' ? parseFloat(formData.latitude) : null,
        longitude: formData.longitude !== '' ? parseFloat(formData.longitude) : null,
        height: formData.height !== '' ? parseFloat(formData.height) : null,
        status: formData.status,
      };

      await cameraApi.create(payload);
      showToast({ type: 'success', message: `Camera ${payload.camera_id} created successfully!` });
      setIsAddOpen(false);
      loadCameras();
    } catch (err) {
      showToast({ type: 'error', message: err.message || 'Failed to create camera' });
    } finally {
      setSubmitting(false);
    }
  };

  // Submit Edit
  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name) {
      showToast({ type: 'warning', message: 'Camera name is required.' });
      return;
    }

    try {
      setSubmitting(true);
      const payload = {
        name: formData.name.trim(),
        description: formData.description.trim() || null,
        latitude: formData.latitude !== '' ? parseFloat(formData.latitude) : null,
        longitude: formData.longitude !== '' ? parseFloat(formData.longitude) : null,
        height: formData.height !== '' ? parseFloat(formData.height) : null,
        status: formData.status,
      };

      await cameraApi.update(selectedCam.camera_id, payload);
      showToast({ type: 'success', message: `Camera ${selectedCam.camera_id} updated successfully!` });
      setIsEditOpen(false);
      loadCameras();
    } catch (err) {
      showToast({ type: 'error', message: err.message || 'Failed to update camera' });
    } finally {
      setSubmitting(false);
    }
  };

  // Submit Delete
  const handleDeleteSubmit = async () => {
    try {
      setSubmitting(true);
      await cameraApi.delete(selectedCam.camera_id);
      showToast({ type: 'success', message: `Camera ${selectedCam.camera_id} deleted successfully.` });
      setIsDeleteOpen(false);
      loadCameras();
    } catch (err) {
      showToast({ type: 'error', message: err.message || 'Failed to delete camera' });
    } finally {
      setSubmitting(false);
    }
  };

  // Filtering
  const filteredCameras = cameras.filter((cam) => {
    const q = searchQuery.toLowerCase();
    return (
      cam.camera_id.toLowerCase().includes(q) ||
      cam.name.toLowerCase().includes(q) ||
      (cam.description && cam.description.toLowerCase().includes(q))
    );
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Top Action Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        {/* Search */}
        <div style={{ position: 'relative', width: '320px', maxWidth: '100%' }}>
          <Search
            size={16}
            style={{
              position: 'absolute',
              left: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-muted)',
            }}
          />
          <input
            type="text"
            placeholder="Search by Camera ID or Name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="form-input"
            style={{ paddingLeft: '36px' }}
          />
        </div>

        {/* Add Camera Button */}
        <button onClick={handleOpenAdd} className="btn btn-primary">
          <Plus size={16} />
          <span>Add New Camera</span>
        </button>
      </div>

      {/* Cameras Table Card */}
      <div className="glass-panel" style={{ padding: '0', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            Loading cameras from database...
          </div>
        ) : filteredCameras.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            {searchQuery ? 'No cameras match your search query.' : 'No cameras registered yet.'}
          </div>
        ) : (
          <div className="table-container" style={{ border: 'none', borderRadius: '0' }}>
            <table className="tactical-table">
              <thead>
                <tr>
                  <th>Camera ID</th>
                  <th>Name & Sector</th>
                  <th>Mount Height</th>
                  <th>GPS Coordinates (WGS84)</th>
                  <th>Pillars</th>
                  <th>Calibration Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredCameras.map((cam) => (
                  <tr key={cam.id}>
                    <td>
                      <span className="font-mono" style={{ color: 'var(--cyan-400)', fontWeight: 600 }}>
                        {cam.camera_id}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{cam.name}</div>
                      {cam.description && (
                        <div
                          style={{
                            fontSize: '0.75rem',
                            color: 'var(--text-muted)',
                            maxWidth: '300px',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {cam.description}
                        </div>
                      )}
                    </td>
                    <td className="font-mono">{cam.height ? `${cam.height} m` : '—'}</td>
                    <td className="font-mono" style={{ fontSize: '0.8rem' }}>
                      {cam.latitude && cam.longitude ? (
                        <span>
                          {cam.latitude.toFixed(6)}, {cam.longitude.toFixed(6)}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>Not configured</span>
                      )}
                    </td>
                    <td>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '0.15rem 0.55rem',
                          borderRadius: 'var(--radius-sm)',
                          background: 'rgba(255, 255, 255, 0.05)',
                          fontSize: '0.8rem',
                          fontFamily: 'var(--font-mono)',
                        }}
                      >
                        {cam.pillar_count || 0}
                      </span>
                    </td>
                    <td>
                      <StatusBadge status={cam.calibration_status || cam.status} />
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end' }}>
                        <button
                          onClick={() => onNavigate?.('stream')}
                          className="btn btn-secondary"
                          style={{ padding: '0.35rem 0.6rem' }}
                          title="Open Live Stream"
                        >
                          <Video size={15} color="var(--emerald-400)" />
                        </button>
                        <button
                          onClick={() => handleOpenView(cam)}
                          className="btn btn-secondary"
                          style={{ padding: '0.35rem 0.6rem' }}
                          title="View Details"
                        >
                          <Eye size={15} color="var(--cyan-400)" />
                        </button>
                        <button
                          onClick={() => handleOpenEdit(cam)}
                          className="btn btn-secondary"
                          style={{ padding: '0.35rem 0.6rem' }}
                          title="Edit Camera"
                        >
                          <Edit2 size={15} color="var(--amber-400)" />
                        </button>
                        <button
                          onClick={() => handleOpenDelete(cam)}
                          className="btn btn-danger"
                          style={{ padding: '0.35rem 0.6rem' }}
                          title="Delete Camera"
                        >
                          <Trash2 size={15} />
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

      {/* ===================== ADD CAMERA MODAL ===================== */}
      <Modal
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        title="Register Static Border Camera"
        subtitle="Adds a fixed surveillance camera record to the database for calibration."
      >
        <form onSubmit={handleAddSubmit}>
          <div className="form-group">
            <label className="form-label">Camera Identifier *</label>
            <input
              type="text"
              required
              className="form-input font-mono"
              placeholder="e.g. CAM_SEC_004"
              value={formData.camera_id}
              onChange={(e) => setFormData({ ...formData, camera_id: e.target.value })}
            />
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
              Must be unique across the border surveillance network.
            </span>
          </div>

          <div className="form-group">
            <label className="form-label">Camera Name / Sector Designation *</label>
            <input
              type="text"
              required
              className="form-input"
              placeholder="e.g. Delta Sector - Mast Sensor 12"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Description / Installation Notes</label>
            <textarea
              rows={2}
              className="form-textarea"
              placeholder="e.g. Stationary 4K lens mounted on mast overlooking border ditch."
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div className="form-group">
              <label className="form-label">Latitude (°)</label>
              <input
                type="number"
                step="any"
                className="form-input font-mono"
                placeholder="e.g. 32.7157"
                value={formData.latitude}
                onChange={(e) => setFormData({ ...formData, latitude: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Longitude (°)</label>
              <input
                type="number"
                step="any"
                className="form-input font-mono"
                placeholder="e.g. 74.8560"
                value={formData.longitude}
                onChange={(e) => setFormData({ ...formData, longitude: e.target.value })}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div className="form-group">
              <label className="form-label">Mount Height (meters)</label>
              <input
                type="number"
                step="any"
                className="form-input font-mono"
                placeholder="e.g. 6.5"
                value={formData.height}
                onChange={(e) => setFormData({ ...formData, height: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Status</label>
              <select
                className="form-select"
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              >
                <option value="uncalibrated">Uncalibrated</option>
                <option value="calibrated">Calibrated</option>
                <option value="active">Active</option>
                <option value="maintenance">Maintenance</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
            <button
              type="button"
              onClick={() => setIsAddOpen(false)}
              className="btn btn-secondary"
              disabled={submitting}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Registering...' : 'Save Camera'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ===================== EDIT CAMERA MODAL ===================== */}
      <Modal
        isOpen={isEditOpen}
        onClose={() => setIsEditOpen(false)}
        title={`Edit Camera: ${selectedCam?.camera_id}`}
        subtitle="Modify installation parameters and operating status."
      >
        <form onSubmit={handleEditSubmit}>
          <div className="form-group">
            <label className="form-label">Camera Identifier</label>
            <input
              type="text"
              disabled
              className="form-input font-mono"
              value={selectedCam?.camera_id || ''}
              style={{ opacity: 0.6, cursor: 'not-allowed' }}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Camera Name *</label>
            <input
              type="text"
              required
              className="form-input"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Description / Installation Notes</label>
            <textarea
              rows={2}
              className="form-textarea"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div className="form-group">
              <label className="form-label">Latitude (°)</label>
              <input
                type="number"
                step="any"
                className="form-input font-mono"
                value={formData.latitude}
                onChange={(e) => setFormData({ ...formData, latitude: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Longitude (°)</label>
              <input
                type="number"
                step="any"
                className="form-input font-mono"
                value={formData.longitude}
                onChange={(e) => setFormData({ ...formData, longitude: e.target.value })}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div className="form-group">
              <label className="form-label">Mount Height (meters)</label>
              <input
                type="number"
                step="any"
                className="form-input font-mono"
                value={formData.height}
                onChange={(e) => setFormData({ ...formData, height: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Status</label>
              <select
                className="form-select"
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              >
                <option value="uncalibrated">Uncalibrated</option>
                <option value="calibrated">Calibrated</option>
                <option value="active">Active</option>
                <option value="maintenance">Maintenance</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
            <button
              type="button"
              onClick={() => setIsEditOpen(false)}
              className="btn btn-secondary"
              disabled={submitting}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Updating...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ===================== VIEW CAMERA DETAILS MODAL ===================== */}
      <Modal
        isOpen={isViewOpen}
        onClose={() => setIsViewOpen(false)}
        title={`Camera Details: ${selectedCam?.camera_id}`}
        subtitle={selectedCam?.name}
        maxWidth="680px"
      >
        {selectedCam && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* Meta Grid */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: '0.75rem',
                padding: '1rem',
                background: 'var(--bg-darkest)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  Mount Height
                </div>
                <div style={{ fontSize: '1rem', fontWeight: 600, fontFamily: 'var(--font-mono)', marginTop: '0.2rem' }}>
                  {selectedCam.height ? `${selectedCam.height} m` : 'Unspecified'}
                </div>
              </div>

              <div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  GPS Coordinates
                </div>
                <div style={{ fontSize: '0.85rem', fontFamily: 'var(--font-mono)', marginTop: '0.2rem' }}>
                  {selectedCam.latitude && selectedCam.longitude ? (
                    `${selectedCam.latitude.toFixed(6)}, ${selectedCam.longitude.toFixed(6)}`
                  ) : (
                    'Not Configured'
                  )}
                </div>
              </div>

              <div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  Status
                </div>
                <div style={{ marginTop: '0.25rem' }}>
                  <StatusBadge status={selectedCam.calibration_status || selectedCam.status} />
                </div>
              </div>

              <div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  Registered At
                </div>
                <div style={{ fontSize: '0.8rem', fontFamily: 'var(--font-mono)', marginTop: '0.2rem', color: 'var(--text-secondary)' }}>
                  {new Date(selectedCam.created_at).toLocaleDateString()}
                </div>
              </div>
            </div>

            {selectedCam.description && (
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.35rem' }}>
                  Description / Sector Location
                </div>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-primary)', lineHeight: 1.5 }}>
                  {selectedCam.description}
                </p>
              </div>
            )}

            {/* Reference Pillars for this Camera */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
                <h4 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--cyan-400)' }}>
                  Associated Reference Boundary Pillars ({selectedPillars.length})
                </h4>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  Independent Calibration Anchor Points
                </span>
              </div>

              {loadingPillars ? (
                <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                  Loading reference pillars...
                </div>
              ) : selectedPillars.length === 0 ? (
                <div
                  style={{
                    padding: '1.25rem',
                    textAlign: 'center',
                    background: 'var(--bg-darkest)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px dashed var(--border-subtle)',
                    color: 'var(--text-muted)',
                    fontSize: '0.85rem',
                  }}
                >
                  No reference pillars configured for this camera yet. Add reference pillars in the Calibration tab.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                  {selectedPillars.map((p) => (
                    <div
                      key={p.id}
                      style={{
                        padding: '0.75rem 1rem',
                        borderRadius: 'var(--radius-md)',
                        background: 'var(--bg-darkest)',
                        border: '1px solid var(--border-subtle)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: '0.5rem',
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span className="font-mono" style={{ color: 'var(--indigo-400)', fontWeight: 600, fontSize: '0.85rem' }}>
                            {p.pillar_id}
                          </span>
                          <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>{p.name}</span>
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                          Height: {p.height ? `${p.height}m` : '—'} | X (border): {p.x_distance !== null ? `${p.x_distance}m` : '—'} | Y (perp): {p.y_distance !== null ? `${p.y_distance}m` : '—'}
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '0.35rem' }}>
                        {p.image_points && p.image_points.length > 0 ? (
                          p.image_points.map((pt) => (
                            <span
                              key={pt.id}
                              style={{
                                fontSize: '0.7rem',
                                padding: '0.15rem 0.45rem',
                                borderRadius: 'var(--radius-sm)',
                                background: pt.point_type === 'TOP' ? 'rgba(6, 182, 212, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                                color: pt.point_type === 'TOP' ? 'var(--cyan-400)' : 'var(--emerald-400)',
                                border: `1px solid ${pt.point_type === 'TOP' ? 'rgba(6, 182, 212, 0.3)' : 'rgba(16, 185, 129, 0.3)'}`,
                                fontFamily: 'var(--font-mono)',
                              }}
                            >
                              {pt.point_type}: ({pt.pixel_x.toFixed(0)}, {pt.pixel_y.toFixed(0)})
                            </span>
                          ))
                        ) : (
                          <span style={{ fontSize: '0.72rem', color: 'var(--amber-400)' }}>
                            No pixel points set
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.75rem' }}>
              <button onClick={() => setIsViewOpen(false)} className="btn btn-secondary">
                Close
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* ===================== DELETE CONFIRMATION MODAL ===================== */}
      <Modal
        isOpen={isDeleteOpen}
        onClose={() => setIsDeleteOpen(false)}
        title="Confirm Camera Deletion"
        subtitle="This action permanently removes the camera and all associated calibration data."
        maxWidth="460px"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div
            style={{
              padding: '1rem',
              borderRadius: 'var(--radius-md)',
              background: 'rgba(244, 63, 94, 0.1)',
              border: '1px solid rgba(244, 63, 94, 0.25)',
              color: 'var(--rose-400)',
              fontSize: '0.85rem',
              lineHeight: 1.5,
              display: 'flex',
              gap: '0.75rem',
            }}
          >
            <AlertCircle size={20} style={{ flexShrink: 0, marginTop: '2px' }} />
            <div>
              Are you sure you want to delete camera{' '}
              <strong className="font-mono">{selectedCam?.camera_id}</strong> (
              {selectedCam?.name})?
              <div style={{ marginTop: '0.35rem', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                This will also delete any configured reference pillars and historical calibration records for this camera.
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
            <button
              onClick={() => setIsDeleteOpen(false)}
              className="btn btn-secondary"
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              onClick={handleDeleteSubmit}
              className="btn btn-danger"
              disabled={submitting}
            >
              {submitting ? 'Deleting...' : 'Permanently Delete'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
