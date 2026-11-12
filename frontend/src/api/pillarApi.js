import { apiRequest } from './client';

export const pillarApi = {
  listByCamera: (cameraId) => apiRequest(`/api/cameras/${cameraId}/pillars`),
  create: (cameraId, data) => apiRequest(`/api/cameras/${cameraId}/pillars`, {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  recordPoint: (pillarId, data) => apiRequest(`/api/pillars/${pillarId}/points`, {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  delete: (pillarId) => apiRequest(`/api/pillars/${pillarId}`, {
    method: 'DELETE',
  }),
};
