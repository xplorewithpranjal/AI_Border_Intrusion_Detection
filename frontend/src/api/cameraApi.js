import { apiRequest } from './client';

export const cameraApi = {
  list: () => apiRequest('/api/cameras'),
  get: (id) => apiRequest(`/api/cameras/${id}`),
  create: (data) => apiRequest('/api/cameras', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  update: (id, data) => apiRequest(`/api/cameras/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  }),
  delete: (id) => apiRequest(`/api/cameras/${id}`, {
    method: 'DELETE',
  }),
};
