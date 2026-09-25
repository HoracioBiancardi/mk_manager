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
    // `headers` depois do spread: um header extra da chamada não apaga o JSON (o servidor
    // exige Content-Type JSON em POST/PUT/DELETE como defesa CSRF).
    r = await fetch(API + path, {
      ...opts,
      headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    });
  } catch {
    setConnBadge(false);
    throw new Error('Sem conexão com o servidor.');
  }
  setConnBadge(true);
  if (!r.ok) {
    // Sessão expirada (inatividade/prazo) fora das rotas de credencial: volta ao login.
    if (r.status === 401 && !path.startsWith('/auth/')) document.dispatchEvent(new CustomEvent('mk:unauthorized'));
    const err = await r.json().catch(() => ({ detail: r.statusText }));
    const e = new Error(err.detail || 'Erro na API');
    e.status = r.status;
    throw e;
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
    if (r.status === 401) document.dispatchEvent(new CustomEvent('mk:unauthorized'));
    const err = await r.json().catch(() => ({ detail: r.statusText }));
    throw new Error(err.detail || 'Erro no upload');
  }
  return r;
}
