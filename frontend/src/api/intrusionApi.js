import { apiRequest } from './client';

export const intrusionApi = {
  // Ingest single intrusion event and get real-time localization + motion
  localizeEvent: (data) =>
    apiRequest('/api/intrusion/event', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Calculate motion between two specific observations
  calculateMotion: (data) =>
    apiRequest('/api/intrusion/motion', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Get current configurable time interval
  getInterval: () => apiRequest('/api/intrusion/interval'),

  // Set configurable time interval
  setInterval: (intervalS) =>
    apiRequest(`/api/intrusion/interval?interval_s=${intervalS}`, {
      method: 'PUT',
    }),

  // Clear intrusion buffer
  clearBuffer: (cameraId = null, objectId = null) => {
    const params = new URLSearchParams();
    if (cameraId) params.append('camera_id', cameraId);
    if (objectId) params.append('object_id', objectId);
    return apiRequest(`/api/intrusion/buffer?${params.toString()}`, {
      method: 'DELETE',
    });
  },
};

export const validationApi = {
  // Real-value ground truth error evaluation (MAE, RMSE, Max Error)
  evaluate: (data) =>
    apiRequest('/api/validation/evaluate', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Phase 1 legacy run endpoint
  runLegacy: (data) =>
    apiRequest('/api/validation/run', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};
