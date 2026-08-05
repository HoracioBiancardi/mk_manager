// Responsabilidade: utilitários reutilizáveis

export function toast(msg, type = 'info', duration = 3000) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast ${type} visible`;
  clearTimeout(t._tid);
  t._tid = setTimeout(() => { t.className = 'toast'; }, duration);
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
