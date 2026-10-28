// Thin API client. All calls go through /api (proxied in dev, nginx in Docker).
async function request(path, options) {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return body;
}

export const api = {
  drift: () => request('/drift'),
  summary: () => request('/drift/summary'),
  scan: () => request('/scans', { method: 'POST' }),
  remediate: (id, approvedBy) =>
    request(`/drift/${id}/remediate`, { method: 'POST', body: JSON.stringify({ approvedBy }) }),
  auditLog: () => request('/audit-log?limit=150'),
  resources: () => request('/resources'),
  resetDemo: () => request('/demo/reset', { method: 'POST' }),
};
