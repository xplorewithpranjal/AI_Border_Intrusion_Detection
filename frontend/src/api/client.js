/**
 * Generic API request wrapper for the backend.
 * Uses native fetch with standard error unwrapping.
 */
const BASE_URL = import.meta.env.VITE_API_URL || '';

export async function apiRequest(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...(options.headers || {}),
  };

  const config = {
    ...options,
    headers,
  };

  try {
    const res = await fetch(url, config);
    if (!res.ok) {
      let errorData;
      try {
        errorData = await res.json();
      } catch {
        errorData = { detail: res.statusText };
      }
      const message = errorData.detail || `Request failed with status ${res.status}`;
      const err = new Error(message);
      err.status = res.status;
      err.data = errorData;
      throw err;
    }

    if (res.status === 204) {
      return null;
    }

    return await res.json();
  } catch (err) {
    console.error(`API Error on [${options.method || 'GET'}] ${endpoint}:`, err);
    throw err;
  }
}
