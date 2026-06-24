// ── Toast ──────────────────────────────────────────────────────────
export function toast(msg, type = 'info', duration = 3000) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast ${type} visible`;
  clearTimeout(t._tid);
  t._tid = setTimeout(() => { t.className = 'toast'; }, duration);
}

// ── Copiar para área de transferência ────────────────────────────
export async function copyText(text, btn) {
  try {
    await navigator.clipboard.writeText(text);
    if (btn) {
      const prev = btn.textContent;
      btn.classList.add('copied');
      btn.textContent = '✓';
      setTimeout(() => { btn.classList.remove('copied'); btn.textContent = prev; }, 1500);
    }
    toast('Copiado!', 'success', 1500);
  } catch {
    toast('Falha ao copiar', 'error');
  }
}

// ── Download de blob ──────────────────────────────────────────────
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ── Partículas de fundo ───────────────────────────────────────────
export function initBackground() {
  const c = document.getElementById('bg-canvas');
  if (!c) return;
  const ctx = c.getContext('2d');
  const N = 70, MAX = 130;
  let P = [], W, H;
  const resize = () => { W = c.width = innerWidth; H = c.height = innerHeight; };
  const mk = () => ({
    x: Math.random() * W, y: Math.random() * H,
    vx: (Math.random() - .5) * .4, vy: (Math.random() - .5) * .4,
    r: Math.random() * 1.2 + 1,
  });
  const draw = () => {
    ctx.clearRect(0, 0, W, H);
    for (let i = 0; i < P.length; i++)
      for (let j = i + 1; j < P.length; j++) {
        const dx = P[i].x - P[j].x, dy = P[i].y - P[j].y, d = Math.hypot(dx, dy);
        if (d < MAX) {
          ctx.beginPath();
          ctx.strokeStyle = `rgba(99,155,255,${(1 - d / MAX) * .18})`;
          ctx.lineWidth = .7;
          ctx.moveTo(P[i].x, P[i].y); ctx.lineTo(P[j].x, P[j].y);
          ctx.stroke();
        }
      }
    for (const p of P) {
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(120,170,255,0.45)'; ctx.fill();
      p.x += p.vx; p.y += p.vy;
      if (p.x < -10) p.x = W + 10; if (p.x > W + 10) p.x = -10;
      if (p.y < -10) p.y = H + 10; if (p.y > H + 10) p.y = -10;
    }
    requestAnimationFrame(draw);
  };
  window.addEventListener('resize', resize);
  resize(); P = Array.from({ length: N }, mk); draw();
}

// ── Escapar HTML ──────────────────────────────────────────────────
export function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Inicial do serviço para avatar ────────────────────────────────
export function initial(nome) {
  return (nome || '?').trim()[0].toUpperCase();
}
