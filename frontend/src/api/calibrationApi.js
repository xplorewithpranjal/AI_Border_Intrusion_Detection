import { apiRequest } from './client';

export const calibrationApi = {
  // Full Phase 3 calibration details
  get: (cameraId) => apiRequest(`/api/calibration/${cameraId}`),

  // Phase 1 legacy contract
  getLegacy: (cameraId) => apiRequest(`/api/cameras/${cameraId}/calibration`),

  // Calculate homography & geometric calibration
  calculate: (cameraId, data = {}) =>
    apiRequest(`/api/calibration/${cameraId}/calculate`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Detailed calibration result and per-point errors
  getResult: (cameraId) => apiRequest(`/api/calibration/${cameraId}/result`),

  // Localize pixel (u, v) -> ground (X, Y) + GPS (lat, lon)
  localize: (cameraId, { pixel_x, pixel_y }) =>
    apiRequest(`/api/calibration/${cameraId}/localize`, {
      method: 'POST',
      body: JSON.stringify({ pixel_x, pixel_y }),
    }),

  // Two-frame motion calculation
  calculateMotion: (data) =>
    apiRequest('/api/localization/motion', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Detection module intrusion event ingestion
  sendDetectionEvent: (data) =>
    apiRequest('/api/localization/event', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};

export const healthApi = {
  check: () => apiRequest('/api/health'),
};
