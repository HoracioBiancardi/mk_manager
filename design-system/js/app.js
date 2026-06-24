import { st } from './state.js';
import { toast, copyText, downloadBlob, initBackground, esc, initial } from './utils.js';
import { listar, buscar, adicionar, atualizar, remover, exportar } from './api.js';

// ── Chave composta ─────────────────────────────────────────────────
const key = (c) => `${c.nome}::${c.email}`;

// ── Auth ───────────────────────────────────────────────────────────
function showLogin() {
  document.getElementById('login-overlay').classList.add('open');
  document.getElementById('topbar').style.display = 'none';
  document.getElementById('app-layout').style.display = 'none';
}

function showApp() {
  document.getElementById('login-overlay').classList.remove('open');
  document.getElementById('topbar').style.display = '';
  document.getElementById('app-layout').style.display = 'flex';
}

function onUnauthorized() {
  sessionStorage.removeItem('pm_key');
  st.masterKey = null;
  showLogin();
  toast('Chave Mestre inválida ou expirada.', 'error');
}

export async function login() {
  const input = document.getElementById('master-key-input');
  const key = input.value.trim();
  if (!key) { toast('Digite a Chave Mestre.', 'warn'); return; }

  const btn = document.getElementById('login-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Verificando…';

  try {
    st.masterKey = key;
    await listar();
    sessionStorage.setItem('pm_key', key);
    showApp();
    await loadCredentials();
  } catch (e) {
    st.masterKey = null;
    if (e.status === 401) toast('Chave inválida. Tente novamente.', 'error');
    else toast(e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '🔓 Desbloquear';
  }
}

export function logout() {
  sessionStorage.removeItem('pm_key');
  st.masterKey = null;
  st.credentials = []; st.filtered = [];
  st.activeKey = null; st.activeCred = null;
  showLogin();
  showEmptyPanel();
  document.getElementById('master-key-input').value = '';
  renderList();
}

export function toggleMasterVis() {
  const inp = document.getElementById('master-key-input');
  inp.type = inp.type === 'password' ? 'text' : 'password';
}

// ── Carregar credenciais ───────────────────────────────────────────
async function loadCredentials() {
  try {
    st.credentials = await listar();
    applyFilter();
    renderList();
    updateFooter();
  } catch (e) {
    if (e.status === 401) { onUnauthorized(); return; }
    toast('Erro ao carregar credenciais: ' + e.message, 'error');
  }
}

function applyFilter() {
  const q = st.searchQuery.toLowerCase();
  if (!q) { st.filtered = [...st.credentials]; return; }
  st.filtered = st.credentials.filter(c =>
    c.nome.toLowerCase().includes(q) ||
    c.email.toLowerCase().includes(q) ||
    (c.url || '').toLowerCase().includes(q)
  );
}

// ── Busca ──────────────────────────────────────────────────────────
export function onSearch(val) {
  st.searchQuery = val.trim();
  applyFilter();
  renderList();
}

// ── Sidebar ────────────────────────────────────────────────────────
function renderList() {
  const el = document.getElementById('cred-list');
  if (!st.filtered.length) {
    el.innerHTML = `<div class="list-empty"><div class="ei">🔑</div>${
      st.searchQuery ? 'Nenhum resultado.' : 'Nenhuma credencial ainda.'
    }</div>`;
    document.getElementById('cred-count').textContent = '0';
    return;
  }
  document.getElementById('cred-count').textContent = st.filtered.length;
  el.innerHTML = st.filtered.map(c => `
    <div class="list-item${key(c) === st.activeKey ? ' active' : ''}"
         onclick="selectCred(${esc(JSON.stringify(key(c)))})"
         title="${esc(c.nome)}">
      <div class="cred-icon">${esc(initial(c.nome))}</div>
      <div class="list-item-body">
        <div class="list-item-title">${esc(c.nome)}</div>
        <div class="list-item-meta">${esc(c.email)}</div>
      </div>
      <div class="list-item-actions">
        <button class="icon-btn del" title="Excluir"
          onclick="event.stopPropagation();openDeleteModal(${esc(JSON.stringify(key(c)))})">🗑</button>
      </div>
    </div>
  `).join('');
}

function updateFooter() {
  document.getElementById('sidebar-footer').textContent =
    `${st.credentials.length} credencial(is)`;
}

// ── Selecionar credencial ──────────────────────────────────────────
export function selectCred(k) {
  if (st.editing && st.activeKey === k) return;
  st.activeKey = k;
  st.activeCred = st.credentials.find(c => key(c) === k) || null;
  st.editing = false; st.isNew = false;
  renderList();
  if (st.activeCred) {
    showViewPanel(st.activeCred);
    document.getElementById('view-del-btn').onclick = () => openDeleteModal(k);
  }
}

// ── Painel vazio ───────────────────────────────────────────────────
function showEmptyPanel() {
  document.getElementById('empty-panel').style.display = '';
  document.getElementById('cred-view-panel').style.display = 'none';
  document.getElementById('cred-form-panel').style.display = 'none';
}

// ── Painel de leitura ──────────────────────────────────────────────
function showViewPanel(c) {
  document.getElementById('empty-panel').style.display = 'none';
  document.getElementById('cred-form-panel').style.display = 'none';
  const panel = document.getElementById('cred-view-panel');
  panel.style.display = 'flex';

  document.getElementById('view-title').textContent = c.nome;

  document.getElementById('view-fields').innerHTML = `
    ${fieldRow('🌐', 'URL', c.url, 'url', c.url)}
    ${fieldRow('📧', 'E-mail', c.email, 'email', c.email)}
    ${pwFieldRow(c.senha)}
    ${fieldRow('📝', 'Observação', c.observacao, 'obs')}
  `;
}

function fieldRow(icon, label, value, type = '', raw = '') {
  const empty = !value;
  const isUrl = type === 'url' && value;
  const isObs = type === 'obs';
  const valClass = `field-row-value${isUrl ? ' url-link' : ''}${isObs ? ' obs' : ''}${empty ? ' empty' : ''}`;
  const valContent = empty ? '—' : esc(value);
  const urlClick = isUrl ? `onclick="openUrl(${esc(JSON.stringify(value))})"` : '';
  const copyBtn = !empty && !isObs
    ? `<button class="copy-btn" title="Copiar" onclick="doCopy(${esc(JSON.stringify(raw || value))}, this)">📋</button>`
    : '';

  return `
    <div class="field-row">
      <div class="field-row-icon">${icon}</div>
      <div class="field-row-body">
        <div class="field-row-label">${label}</div>
        <div class="${valClass}" ${urlClick}>${valContent}</div>
      </div>
      <div class="field-row-btns">${copyBtn}</div>
    </div>
  `;
}

function pwFieldRow(senha) {
  return `
    <div class="field-row">
      <div class="field-row-icon">🔑</div>
      <div class="field-row-body">
        <div class="field-row-label">Senha</div>
        <div class="field-row-value mono" id="pw-display">••••••••</div>
      </div>
      <div class="field-row-btns">
        <button class="copy-btn" title="Mostrar/ocultar"
          onclick="togglePwVis(${esc(JSON.stringify(senha))}, this)">👁</button>
        <button class="copy-btn" title="Copiar senha"
          onclick="doCopy(${esc(JSON.stringify(senha))}, this)">📋</button>
      </div>
    </div>
  `;
}

export function togglePwVis(senha, btn) {
  const el = document.getElementById('pw-display');
  if (el.dataset.visible === '1') {
    el.textContent = '••••••••'; el.dataset.visible = '0'; btn.textContent = '👁';
  } else {
    el.textContent = senha; el.dataset.visible = '1'; btn.textContent = '🙈';
  }
}

export function doCopy(text, btn) { copyText(text, btn); }
export function openUrl(url) { window.open(url, '_blank', 'noopener'); }

// ── Modo edição ────────────────────────────────────────────────────
export function startEdit() {
  const c = st.activeCred;
  if (!c) return;
  st.editing = true; st.isNew = false;
  showFormPanel(c);
}

export function startNew() {
  st.activeKey = null; st.activeCred = null;
  st.editing = true; st.isNew = true;
  renderList();
  showFormPanel(null);
}

function showFormPanel(c) {
  document.getElementById('empty-panel').style.display = 'none';
  document.getElementById('cred-view-panel').style.display = 'none';
  const panel = document.getElementById('cred-form-panel');
  panel.style.display = 'flex';

  document.getElementById('form-title-label').textContent = c ? 'Editar Credencial' : 'Nova Credencial';
  document.getElementById('f-nome').value    = c?.nome    ?? '';
  document.getElementById('f-url').value     = c?.url     ?? '';
  document.getElementById('f-email').value   = c?.email   ?? '';
  document.getElementById('f-senha').value   = c?.senha   ?? '';
  document.getElementById('f-obs').value     = c?.observacao ?? '';
  document.getElementById('f-nome').focus();
}

export function cancelForm() {
  st.editing = false; st.isNew = false;
  if (st.activeCred) showViewPanel(st.activeCred);
  else showEmptyPanel();
}

export function toggleFormPwVis() {
  const inp = document.getElementById('f-senha');
  inp.type = inp.type === 'password' ? 'text' : 'password';
}

export async function saveForm() {
  const nome  = document.getElementById('f-nome').value.trim();
  const email = document.getElementById('f-email').value.trim();
  const senha = document.getElementById('f-senha').value.trim();
  const url   = document.getElementById('f-url').value.trim();
  const obs   = document.getElementById('f-obs').value.trim();

  if (!nome)  { toast('Nome do serviço é obrigatório.', 'warn'); return; }
  if (!email) { toast('E-mail é obrigatório.', 'warn'); return; }
  if (!senha) { toast('Senha é obrigatória.', 'warn'); return; }

  const btn = document.getElementById('save-btn');
  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>';

  try {
    if (st.isNew) {
      await adicionar({ nome, url, email, senha, observacao: obs });
      toast('Credencial adicionada!', 'success');
    } else {
      const prev = st.activeCred;
      await atualizar({
        nome_atual: prev.nome, email_atual: prev.email,
        nome, url, email, senha, observacao: obs,
      });
      toast('Credencial atualizada!', 'success');
    }
    st.editing = false; st.isNew = false;
    await loadCredentials();
    // selecionar a credencial salva
    const nova = st.credentials.find(c => c.nome === nome && c.email === email);
    if (nova) { st.activeKey = key(nova); st.activeCred = nova; showViewPanel(nova); renderList(); }
    else showEmptyPanel();
  } catch (e) {
    if (e.status === 401) { onUnauthorized(); return; }
    toast('Erro ao salvar: ' + e.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = '💾 Salvar';
  }
}

// ── Delete modal ───────────────────────────────────────────────────
export function openDeleteModal(k) {
  st.pendingDelete = k;
  const c = st.credentials.find(c => key(c) === k);
  document.getElementById('del-name').textContent = c?.nome ?? k;
  document.getElementById('delete-overlay').classList.add('open');
}

export function closeDeleteModal() {
  document.getElementById('delete-overlay').classList.remove('open');
  st.pendingDelete = null;
}

export async function confirmDelete() {
  if (!st.pendingDelete) return;
  const [nome, email] = st.pendingDelete.split('::');
  const btn = document.getElementById('confirm-del-btn');
  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>';

  try {
    await remover(nome, email);
    closeDeleteModal();
    toast('Credencial removida.', 'success');
    if (st.activeKey === st.pendingDelete) {
      st.activeKey = null; st.activeCred = null;
      showEmptyPanel();
    }
    await loadCredentials();
  } catch (e) {
    if (e.status === 401) { onUnauthorized(); return; }
    toast('Erro ao remover: ' + e.message, 'error');
    closeDeleteModal();
  } finally {
    btn.disabled = false; btn.textContent = 'Excluir';
  }
}

// ── Exportar ───────────────────────────────────────────────────────
export async function doExport() {
  try {
    const { blob, filename } = await exportar();
    downloadBlob(blob, filename);
    toast('Backup exportado!', 'success');
  } catch (e) {
    if (e.status === 401) { onUnauthorized(); return; }
    toast('Erro ao exportar: ' + e.message, 'error');
  }
}

// ── Conexão ────────────────────────────────────────────────────────
async function checkConn() {
  try {
    await fetch('/health');
    const b = document.getElementById('conn-badge');
    b.textContent = '● online'; b.classList.add('online');
  } catch {
    document.getElementById('conn-badge').textContent = '● offline';
  }
}

// ── Expor ao DOM ───────────────────────────────────────────────────
Object.assign(window, {
  login, logout, toggleMasterVis,
  onSearch,
  selectCred,
  startEdit, startNew, cancelForm, saveForm, toggleFormPwVis,
  togglePwVis, doCopy, openUrl,
  openDeleteModal, closeDeleteModal, confirmDelete,
  doExport,
});

// ── Init ───────────────────────────────────────────────────────────
(async () => {
  initBackground();
  await checkConn();
  if (st.masterKey) {
    try {
      showApp();
      await loadCredentials();
    } catch {
      showLogin();
    }
  } else {
    showLogin();
  }
})();
