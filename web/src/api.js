import { buildQuery } from './format.js';

async function request(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    headers: { 'content-type': 'application/json' },
    ...options,
  });
  if (res.status === 204) return null;

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.error || `Request failed (${res.status})`);
    error.status = res.status;
    error.fields = data.fields || {};
    throw error;
  }
  return data;
}

export const api = {
  meta: () => request('/meta'),
  listEmployees: (params) => request(`/employees${buildQuery(params)}`),
  createEmployee: (payload) => request('/employees', { method: 'POST', body: JSON.stringify(payload) }),
  updateEmployee: (id, payload) => request(`/employees/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteEmployee: (id) => request(`/employees/${id}`, { method: 'DELETE' }),
  summary: (filters) => request(`/insights/summary${buildQuery(filters)}`),
  breakdown: (by, filters) => request(`/insights/breakdown${buildQuery({ by, ...filters })}`),
  outliers: (limit = 25) => request(`/insights/outliers${buildQuery({ limit })}`),
};
