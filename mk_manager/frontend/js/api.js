// Responsabilidade: comunicação HTTP com o backend

const API = '/api';

// Atualiza o badge de conexão a partir do resultado real das requisições
// (em vez de só checar uma vez no boot) — reflete queda/retomada da API
// sem precisar de polling: online quando um fetch chega no servidor
// (mesmo que a resposta seja um erro HTTP), offline só quando o fetch em
// si falha (rede fora do ar / servidor não respondendo).
function setConnBadge(online) {
  const b = document.getElementById('conn-badge');
  if (!b) return;
  b.textContent = online ? '● online' : '● offline';
  b.classList.toggle('online', online);
}

export async function apiFetch(path, opts = {}) {
  let r;
  try {
    r = await fetch(API + path, {
      headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
      ...opts,
    });
  } catch {
    setConnBadge(false);
    throw new Error('Sem conexão com o servidor.');
  }
  setConnBadge(true);
  if (!r.ok) {
    const err = await r.json().catch(() => ({ detail: r.statusText }));
    throw new Error(err.detail || 'Erro na API');
  }
  return r;
}

export async function apiUpload(formData) {
  let r;
  try {
    r = await fetch(API + '/assets', { method: 'POST', body: formData });
  } catch {
    setConnBadge(false);
    throw new Error('Sem conexão com o servidor.');
  }
  setConnBadge(true);
  if (!r.ok) {
    const err = await r.json().catch(() => ({ detail: r.statusText }));
    throw new Error(err.detail || 'Erro no upload');
  }
  return r;
}
