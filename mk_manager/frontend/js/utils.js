// Responsabilidade: utilitários reutilizáveis

// Toast = o do app_template: empilha no canto, fundo neutro, faixa colorida por tipo.
// `action` ({ label, onClick }) põe um botão no toast — usado no "Desfazer" de arquivar e
// mandar para a lixeira, que deixaram de pedir confirmação (são reversíveis).
const TOAST_CLASSE = { success: '', error: 'toast--erro', warn: 'toast--aviso', warning: 'toast--aviso', info: 'toast--info' };
export function toast(msg, type = 'info', duration = 4500, action = null) {
  const caixa = document.getElementById('toasts');
  if (!caixa) return;
  const el = document.createElement('div');
  el.className = ('toast ' + (TOAST_CLASSE[type] ?? 'toast--info')).trim();
  el.setAttribute('role', 'status');
  const texto = document.createElement('span');
  texto.textContent = msg;
  el.appendChild(texto);
  if (action) {
    el.classList.add('toast--acao');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'toast-action';
    btn.textContent = action.label;
    btn.onclick = () => { el.remove(); action.onClick(); };
    el.appendChild(btn);
  }
  caixa.appendChild(el);
  setTimeout(() => el.remove(), duration);
}

// Ação reversível: executa, avisa e oferece desfazer por alguns segundos.
export function toastUndo(msg, onUndo) {
  toast(msg, 'success', 7000, { label: 'Desfazer', onClick: onUndo });
}

// ── Diálogos no visual do tema (substituem confirm()/prompt() do navegador) ──
// Devolvem Promise: confirmDialog → true/false; promptDialog → texto ou null.
let _dialogAberto = null;

function abrirDialogo({ title, message, input = null, confirmLabel = 'Confirmar', cancelLabel = 'Cancelar', danger = false }) {
  _dialogAberto?.(null);
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'overlay open app-dialog-overlay';
    overlay.innerHTML = `
      <form class="modal app-dialog" role="alertdialog" aria-modal="true" aria-labelledby="app-dialog-title">
        <div class="modal-header"><h2 id="app-dialog-title"></h2></div>
        <div class="modal-body app-dialog-msg"></div>
        ${input !== null ? '<input class="form-input app-dialog-input" autocomplete="off" spellcheck="false">' : ''}
        <div class="modal-footer">
          <button type="button" class="btn btn-ghost" data-cancelar></button>
          <button type="submit" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-ok></button>
        </div>
      </form>`;
    overlay.querySelector('#app-dialog-title').textContent = title;
    overlay.querySelector('.app-dialog-msg').textContent = message || '';
    overlay.querySelector('[data-ok]').textContent = confirmLabel;
    overlay.querySelector('[data-cancelar]').textContent = cancelLabel;
    const campo = overlay.querySelector('.app-dialog-input');
    if (campo) campo.value = input;
    const anterior = document.activeElement;
    const fechar = (valor) => {
      _dialogAberto = null;
      document.removeEventListener('keydown', onKey, true);
      overlay.remove();
      anterior?.focus?.();
      resolve(valor);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fechar(null); }
    };
    _dialogAberto = fechar;
    document.addEventListener('keydown', onKey, true);
    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) fechar(null); });
    overlay.querySelector('[data-cancelar]').onclick = () => fechar(null);
    overlay.querySelector('form').onsubmit = (e) => {
      e.preventDefault();
      fechar(campo ? campo.value : true);
    };
    document.body.appendChild(overlay);
    if (campo) { campo.focus(); campo.select(); }
    else overlay.querySelector(danger ? '[data-cancelar]' : '[data-ok]').focus();
  });
}

export async function confirmDialog(title, message, { confirmLabel = 'Confirmar', cancelLabel = 'Cancelar', danger = false } = {}) {
  return (await abrirDialogo({ title, message, confirmLabel, cancelLabel, danger })) === true;
}

export function promptDialog(title, message, value = '', { confirmLabel = 'Salvar' } = {}) {
  return abrirDialogo({ title, message, input: value, confirmLabel });
}

// ── Datas (pt-BR em todo o app) ──────────────────────────────────────────────
// As datas do frontmatter são "AAAA-MM-DD" (prazo) ou "AAAA-MM-DDTHH:MM" (status em):
// lidas como data local, sem passar por UTC — senão à noite o "hoje" já vira amanhã.
function _local(v) {
  if (!v) return null;
  const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0));
  const d = new Date(v);
  return isNaN(d) ? null : d;
}

export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// 18/10 no ano corrente, 18/10/2025 em outro ano.
export function formatDate(v) {
  const d = _local(v);
  if (!d) return '';
  const opts = { day: '2-digit', month: '2-digit' };
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
  return d.toLocaleDateString('pt-BR', opts);
}

// Situação de um prazo: { label: "amanhã" | "há 3 dias" | "18/10", tone: overdue|today|soon|later|done }.
export function dueInfo(due, isDone = false) {
  const d = _local(due);
  if (!d) return null;
  const hoje = _local(todayISO());
  const dias = Math.round((d - hoje) / 86400000);
  let label = formatDate(due);
  if (dias === 0) label = 'hoje';
  else if (dias === 1) label = 'amanhã';
  else if (dias === -1) label = 'ontem';
  else if (dias < 0 && dias >= -30) label = `há ${-dias} dias`;
  else if (dias > 1 && dias <= 6) label = `em ${dias} dias`;
  let tone = dias < 0 ? 'overdue' : dias === 0 ? 'today' : dias <= 7 ? 'soon' : 'later';
  if (isDone) tone = 'done';
  return { label, tone, days: dias, full: d.toLocaleDateString('pt-BR') };
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
  const m = Math.floor(s / 60); if (m < 60) return `há ${m} min`;
  const h = Math.floor(m / 60); if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'ontem';
  if (d < 30) return `há ${d} dias`;
  return formatDate(iso);
}

// O marked repassa HTML cru da nota (<img onerror=...>, <script>) e as notas são compartilhadas
// entre usuários: sem limpar, quem escreve uma nota roda código na sessão de quem a abre (admin).
// Todo HTML gerado de Markdown passa por aqui antes de ir para innerHTML/document.write.
export function sanitizeHtml(html) {
  return DOMPurify.sanitize(html, { ADD_ATTR: ["target"] });
}
