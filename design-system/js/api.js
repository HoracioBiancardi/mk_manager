import { st } from './state.js';

const BASE = '/api';

export async function apiFetch(path, opts = {}) {
  const r = await fetch(BASE + path, {
    headers: {
      'Content-Type': 'application/json',
      'X-Master-Key': st.masterKey || '',
      ...(opts.headers || {}),
    },
    ...opts,
  });

  if (r.status === 401) throw Object.assign(new Error('Chave Mestre inválida.'), { status: 401 });
  if (!r.ok) {
    const err = await r.json().catch(() => ({ detail: r.statusText }));
    throw new Error(err.detail || 'Erro na API');
  }
  return r;
}

export async function listar() {
  const r = await apiFetch('/credenciais/');
  return r.json();
}

export async function buscar(termo) {
  const r = await apiFetch(`/credenciais/buscar?termo=${encodeURIComponent(termo)}`);
  return r.json();
}

export async function adicionar(payload) {
  const r = await apiFetch('/credenciais/', { method: 'POST', body: JSON.stringify(payload) });
  return r.json();
}

export async function atualizar(payload) {
  const r = await apiFetch('/credenciais/', { method: 'PATCH', body: JSON.stringify(payload) });
  return r.json();
}

export async function remover(nome, email) {
  await apiFetch(`/credenciais/?nome=${encodeURIComponent(nome)}&email=${encodeURIComponent(email)}`, { method: 'DELETE' });
}

export async function exportar() {
  const r = await apiFetch('/io/export');
  const blob = await r.blob();
  const cd = r.headers.get('Content-Disposition') || '';
  const fn = cd.match(/filename="([^"]+)"/)?.[1] || 'pm-backup.json';
  return { blob, filename: fn };
}
