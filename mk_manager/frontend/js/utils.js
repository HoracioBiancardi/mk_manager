// Responsabilidade: utilitários reutilizáveis

// Toast = o do app_template: empilha no canto, fundo neutro, faixa colorida por tipo.
const TOAST_CLASSE = { success: '', error: 'toast--erro', warn: 'toast--aviso', warning: 'toast--aviso', info: 'toast--info' };
export function toast(msg, type = 'info', duration = 4500) {
  const caixa = document.getElementById('toasts');
  if (!caixa) return;
  const el = document.createElement('div');
  el.className = ('toast ' + (TOAST_CLASSE[type] ?? 'toast--info')).trim();
  el.setAttribute('role', 'status');
  el.textContent = msg;
  caixa.appendChild(el);
  setTimeout(() => el.remove(), duration);
}

// esc local: inclui aspas simples (necessário para atributos onclick inline)
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

// dlBlob local: cria o Blob a partir do conteúdo (assinatura diferente do DS)
export function dlBlob(name, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  a.click();
  URL.revokeObjectURL(url);
}

export function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return 'agora';
  const m = Math.floor(s / 60); if (m < 60) return `${m}m atrás`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h atrás`;
  const d = Math.floor(h / 24); if (d < 30) return `${d}d atrás`;
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

// O marked repassa HTML cru da nota (<img onerror=...>, <script>) e as notas são compartilhadas
// entre usuários: sem limpar, quem escreve uma nota roda código na sessão de quem a abre (admin).
// Todo HTML gerado de Markdown passa por aqui antes de ir para innerHTML/document.write.
export function sanitizeHtml(html) {
  return DOMPurify.sanitize(html, { ADD_ATTR: ["target"] });
}
