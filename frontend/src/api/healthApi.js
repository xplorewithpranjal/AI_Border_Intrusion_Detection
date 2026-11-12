import { apiRequest } from './client';

export const healthApi = {
  check: () => apiRequest('/api/health'),
};
