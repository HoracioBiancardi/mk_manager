// Responsabilidade: comunicação HTTP com o backend

const API = '/api';

export async function apiFetch(path, opts = {}) {
  const r = await fetch(API + path, {
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    ...opts,
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({ detail: r.statusText }));
    throw new Error(err.detail || 'Erro na API');
  }
  return r;
}

export async function apiUpload(formData) {
  const r = await fetch(API + '/assets', { method: 'POST', body: formData });
  if (!r.ok) {
    const err = await r.json().catch(() => ({ detail: r.statusText }));
    throw new Error(err.detail || 'Erro no upload');
  }
  return r;
}
