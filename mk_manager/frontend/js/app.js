// Responsabilidade: inicialização, coordenação e operações de arquivo (CRUD)

import { st } from './state.js';
import { esc, toast, dlBlob, initBackground } from './utils.js';
import { apiFetch, apiUpload } from './api.js';
import {
  renderSidebar, renderFolderTree, renderTagFilterChips,
  getDisplayFiles, toggleFolder, toggleFolderSection,
  startNewFolder, cancelNewFolder, folderPathsFromFiles,
} from './sidebar.js';
import {
  setSaveCallback, showEditorPanel, showEmptyPanel,
  renderTags, renderPreview, setView, applyRatio, initResizer,
  updateFooter, setSaveStatus, updateStatusVis,
  onEditorInput, onTitleChange, onEditorKeydown,
  onTagKey, removeTag, fmt, ins, insCodeBlock, insRaw, insMermaid, insTable, formatTable,
} from './editor.js';

// ── Conexão ───────────────────────────────────────────────────────────────────
async function checkConn() {
  try {
    await fetch('/api/stats');
    const b = document.getElementById('conn-badge');
    b.textContent = '● online';
    b.style.background = 'rgba(16,185,129,.15)';
    b.style.color = '#34d399';
    b.style.borderColor = 'rgba(16,185,129,.2)';
    return true;
  } catch {
    return false;
  }
}

// ── Storage info ───────────────────────────────────────────────────────────────
async function updateStorageInfo() {
  try {
    const r = await apiFetch('/stats');
    const s = await r.json();
    const kb = (s.size_bytes / 1024).toFixed(1);
    document.getElementById('storage-info').textContent =
      `${s.total} arquivo(s) · ${s.notes} notas · ${s.tasks} tasks · ${kb} KB`;
  } catch { }
}

// ── Carregar arquivos ──────────────────────────────────────────────────────────
async function loadFiles() {
  try {
    const url = st.filter === 'all' ? '/files' : `/files?type=${st.filter}`;
    const r = await apiFetch(url);
    st.files = await r.json();
    st.searchResults = null;
    renderSidebar();
    renderFolderTree();
    renderTagFilterChips();
    updateStorageInfo();
  } catch (e) {
    toast('Erro ao carregar arquivos: ' + e.message, 'error');
  }
}

async function doSearch(q) {
  if (!q && !st.tagFilter) { st.searchResults = null; renderSidebar(); return; }
  try {
    let url = `/search?q=${encodeURIComponent(q || '')}`;
    if (st.filter !== 'all') url += `&type=${st.filter}`;
    if (st.tagFilter) url += `&tag=${encodeURIComponent(st.tagFilter)}`;
    const r = await apiFetch(url);
    st.searchResults = await r.json();
    renderSidebar();
  } catch (e) {
    toast('Erro na busca: ' + e.message, 'error');
  }
}

// ── CRUD ───────────────────────────────────────────────────────────────────────
async function saveFile() {
  if (!st.activeId) return;
  const content = document.getElementById('md-editor').value;
  const title = document.getElementById('title-input').value.trim();
  const folder = document.getElementById('folder-input')?.value.trim() ?? st.activeFolder;
  const status = document.getElementById('status-select')?.value ?? st.activeStatus;
  try {
    const prevId = st.activeId;
    const r = await apiFetch(`/files/${prevId}`, {
      method: 'PUT',
      body: JSON.stringify({ title, content, tags: st.activeTags, folder, status }),
    });
    const updated = await r.json();
    const idx = st.files.findIndex(f => f.id === prevId);
    if (idx !== -1) st.files[idx] = { ...updated };
    // The file may have been renamed on disk (ID = slug of title)
    if (updated.id !== prevId) st.activeId = updated.id;
    st.activeFolder = updated.folder || '';
    st.activeStatus = updated.status || '';
    st.isDirty = false;
    document.getElementById('filename-label').textContent = updated.filename;
    renderSidebar();
    renderFolderTree();
    renderTagFilterChips();
    setSaveStatus('saved');
    updateStorageInfo();
  } catch (e) {
    setSaveStatus('error');
    toast('Erro ao salvar: ' + e.message, 'error');
  }
}

async function openFile(id) {
  if (st.isDirty && st.activeId) await saveFile();
  try {
    const r = await apiFetch(`/files/${id}`);
    const file = await r.json();
    st.activeId = id;
    st.activeTags = [...(file.tags || [])];
    st.activeFolder = file.folder || '';
    st.activeStatus = file.status || '';
    st.isDirty = false;

    document.getElementById('title-input').value = file.title;
    document.getElementById('md-editor').value = file.content;
    document.getElementById('filename-label').textContent = file.filename;
    const folderInput = document.getElementById('folder-input');
    if (folderInput) folderInput.value = file.folder || '';
    const statusSel = document.getElementById('status-select');
    if (statusSel) statusSel.value = file.status || '';

    const badge = document.getElementById('type-badge');
    badge.textContent = file.type === 'task' ? 'Task' : 'Note';
    badge.className = `type-badge ${file.type}`;
    updateStatusVis(file.type);

    renderTags(st.activeTags);
    renderSidebar();
    showEditorPanel();
    setView(st.view);
    updateFooter();
    setSaveStatus('saved');
  } catch (e) {
    toast('Erro ao abrir arquivo: ' + e.message, 'error');
  }
}

async function newFile(type) {
  const defaultContent = type === 'task'
    ? '- [ ] Primeira tarefa\n- [ ] Segunda tarefa\n- [ ] Terceira tarefa\n'
    : '';
  try {
    document.getElementById(`btn-new-${type}`).disabled = true;
    const r = await apiFetch('/files', {
      method: 'POST',
      body: JSON.stringify({ title: '', type, tags: [], content: defaultContent, folder: st.folderFilter || '', status: '' }),
    });
    const file = await r.json();
    st.files.unshift(file);
    renderSidebar();
    await openFile(file.id);
    setTimeout(() => document.getElementById('title-input').focus(), 60);
  } catch (e) {
    toast('Erro ao criar arquivo: ' + e.message, 'error');
  } finally {
    document.getElementById(`btn-new-${type}`).disabled = false;
  }
}

async function deleteFile(id) {
  try {
    await apiFetch(`/files/${id}`, { method: 'DELETE' });
    st.files = st.files.filter(f => f.id !== id);
    if (st.searchResults) st.searchResults = st.searchResults.filter(f => f.id !== id);
    if (st.activeId === id) { st.activeId = null; showEmptyPanel(); }
    renderSidebar();
    updateStorageInfo();
    toast('Arquivo excluído.', 'success');
  } catch (e) {
    toast('Erro ao excluir: ' + e.message, 'error');
  }
}

// ── Delete modal ───────────────────────────────────────────────────────────────
function openDeleteModal(id, title, filename) {
  st.pendingDelete = id;
  document.getElementById('delete-filename').textContent = `"${title}"`;
  document.getElementById('delete-path').textContent = `notes/${filename}`;
  document.getElementById('delete-overlay').classList.add('open');
}

function closeDeleteModal() {
  document.getElementById('delete-overlay').classList.remove('open');
  st.pendingDelete = null;
}

async function confirmDelete() {
  if (!st.pendingDelete) return;
  const btn = document.getElementById('confirm-del-btn');
  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>';
  await deleteFile(st.pendingDelete);
  closeDeleteModal();
  btn.disabled = false; btn.textContent = 'Excluir';
}

// ── Export ─────────────────────────────────────────────────────────────────────
async function exportFile(id, title) {
  try {
    const r = await apiFetch(`/files/${id}`);
    const file = await r.json();
    const fm = [
      '---',
      `id: ${file.id}`,
      `title: ${file.title || 'Sem título'}`,
      `type: ${file.type}`,
      `tags: [${(file.tags || []).join(', ')}]`,
      `created: '${file.created}'`,
      `modified: '${file.modified}'`,
      '---',
      '',
      file.content,
    ].join('\n');
    const slug = (file.title || 'sem-titulo').toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    dlBlob(slug + '.md', fm, 'text/markdown;charset=utf-8');
    toast('Arquivo exportado!', 'success');
  } catch (e) {
    toast('Erro ao exportar: ' + e.message, 'error');
  }
}

async function exportCurrent() {
  if (!st.activeId) return;
  await saveFile();
  await exportFile(st.activeId);
}

async function exportAll() {
  if (!st.files.length) { toast('Nenhum arquivo para exportar.', 'info'); return; }
  for (const f of st.files) await exportFile(f.id, f.title);
  toast(`${st.files.length} arquivo(s) exportado(s).`, 'success');
}

// ── Export PDF ────────────────────────────────────────────────────────────────
function printPDF() {
  if (!st.activeId) { toast('Abra uma nota para exportar.', 'info'); return; }

  const rawTitle = document.getElementById('title-input').value || 'Nota';
  const safeTitle = rawTitle.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  // Parseia o markdown direto, sem tocar o preview pane
  const mdContent = document.getElementById('md-editor').value;
  const bodyHTML  = marked.parse(mdContent);
  const hasMermaid = bodyHTML.includes('class="mermaid"');

  const hlURL = [...document.querySelectorAll('link[rel="stylesheet"]')]
    .find(l => l.href.includes('highlight'))?.href
    || 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github.min.css';

  const win = window.open('', '_blank');
  if (!win) { toast('Permita pop-ups para exportar PDF.', 'info'); return; }

  win.document.write(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>${safeTitle}</title>
<link rel="stylesheet" href="${hlURL}">
<style>
  *, *::before, *::after { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
    font-size: 14px; line-height: 1.8; color: #222;
    max-width: 820px; margin: 0 auto; padding: 2rem; background: white;
  }
  h1 { font-size:1.9rem; border-bottom:2px solid #ccc; padding-bottom:.4rem; margin-bottom:1.5rem; break-after:avoid; page-break-after:avoid; }
  h2 { font-size:1.35rem; border-bottom:1px solid #eee; margin-top:2.5rem; break-after:avoid; page-break-after:avoid; }
  h3 { font-size:1.1rem; margin-top:1.8rem; break-after:avoid; page-break-after:avoid; }
  h4,h5,h6 { margin-top:1.2rem; break-after:avoid; page-break-after:avoid; }
  p { orphans:3; widows:3; margin:.6rem 0 .9rem; }
  pre {
    background:#f6f8fa; border:1px solid #ddd; border-radius:6px;
    padding:1rem; font-size:.84em;
    white-space:pre-wrap; word-break:break-word;
    break-inside:avoid; page-break-inside:avoid; margin:1rem 0; overflow:visible;
  }
  pre code { background:transparent!important; border:none!important; padding:0!important; font-family:'SFMono-Regular',Consolas,monospace; }
  code { font-family:'SFMono-Regular',Consolas,monospace; font-size:.88em; }
  p code, li code { background:#f0f0f0; padding:.1em .35em; border-radius:3px; border:1px solid #ddd; }
  table { border-collapse:collapse; width:100%; margin:1.2rem 0; break-inside:avoid; page-break-inside:avoid; font-size:.92em; }
  th,td { border:1px solid #ccc; padding:.5rem .75rem; text-align:left; vertical-align:top; }
  th { background:#f0f0f0; font-weight:600; }
  tr:nth-child(even) td { background:#fafafa; }
  blockquote { border-left:4px solid #aaa; margin:1rem 0; padding:.5rem 1rem; background:#f9f9f9; color:#555; break-inside:avoid; page-break-inside:avoid; }
  img { max-width:100%; height:auto; }
  .mermaid-wrap { text-align:center; margin:1.5rem 0; break-inside:avoid; page-break-inside:avoid; display:block; }
  .mermaid-wrap svg { max-width:100%; background:white; }
  a { color:#1a56db; }
  hr { border:none; border-top:1px solid #ddd; margin:1.5rem 0; }
  ul,ol { padding-left:1.5rem; margin:.5rem 0; }
  li { margin:.25rem 0; }
  input[type="checkbox"] { margin-right:.4rem; }
  .task-list-item.done { opacity:.65; text-decoration:line-through; }
  .hljs { background:#f6f8fa!important; color:#24292e!important; }
  @page { size:A4 portrait; margin:2cm; }
  @media print { body { padding:0; } }
</style>
</head>
<body>
<h1>${safeTitle}</h1>
${bodyHTML}
${hasMermaid ? '<script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"><\\/script>' : ''}
<script>
window.addEventListener('load', function() {
  if (${hasMermaid} && typeof mermaid !== 'undefined') {
    mermaid.initialize({ startOnLoad: false, theme: 'default' });
    mermaid.run().then(function() { setTimeout(window.print, 400); })
               .catch(function()  { setTimeout(window.print, 400); });
  } else {
    setTimeout(window.print, 300);
  }
});
<\/script>
</body>
</html>`);
  win.document.close();
}

// ── Import de assets ──────────────────────────────────────────────────────────
function triggerAssetImport() {
  if (!st.activeId) { toast('Abra uma nota antes de importar um arquivo.', 'info'); return; }
  document.getElementById('asset-file-input').click();
}

async function onAssetFiles(files) {
  if (!files.length) return;
  for (const file of files) {
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await apiUpload(fd);
      const data = await r.json();
      const isImage = /\.(png|jpe?g|gif|webp|svg|bmp|ico|avif)$/i.test(file.name);
      const link = isImage
        ? `![${file.name}](${data.url})`
        : `[${file.name}](${data.url})`;
      insRaw(link);
      toast(`"${data.filename}" importado.`, 'success');
    } catch (e) {
      toast('Erro ao importar: ' + e.message, 'error');
    }
  }
  document.getElementById('asset-file-input').value = '';
}

// ── Rename inline ─────────────────────────────────────────────────────────────
function startRenameFile(id, title) {
  st.renamingId = id;
  renderSidebar();
}

async function confirmRenameFile(id, newTitle) {
  if (st.renamingId !== id) return;
  st.renamingId = null;
  const trimmed = newTitle.trim();
  if (!trimmed) { renderSidebar(); return; }
  const file = st.files.find(f => f.id === id);
  if (!file || file.title === trimmed) { renderSidebar(); return; }
  try {
    const r = await apiFetch(`/files/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ title: trimmed }),
    });
    const updated = await r.json();
    const idx = st.files.findIndex(f => f.id === id);
    if (idx !== -1) st.files[idx] = { ...updated };
    if (st.activeId === id) {
      document.getElementById('title-input').value = updated.title;
      document.getElementById('filename-label').textContent = updated.filename;
      if (updated.id !== id) st.activeId = updated.id;
    }
    renderSidebar();
    toast('Renomeado com sucesso.', 'success');
  } catch (e) {
    renderSidebar();
    toast('Erro ao renomear: ' + e.message, 'error');
  }
}

function cancelRename() {
  st.renamingId = null;
  renderSidebar();
}

function onRenameKey(e, id) {
  e.stopPropagation();
  if (e.key === 'Enter') { e.preventDefault(); confirmRenameFile(id, e.target.value); }
  else if (e.key === 'Escape') { e.preventDefault(); cancelRename(); }
}

function onRenameBlur(id, value) {
  if (st.renamingId === id) confirmRenameFile(id, value);
}

// ── Filtros e busca ────────────────────────────────────────────────────────────
function onSearch(v) {
  st.search = v.trim();
  clearTimeout(st.searchTimer);
  st.searchTimer = setTimeout(() => doSearch(st.search), 300);
}

function setFilter(f) {
  st.filter = f;
  document.querySelectorAll('.filter-tab').forEach(b =>
    b.classList.toggle('active', b.dataset.filter === f)
  );
  if (st.search) doSearch(st.search); else loadFiles();
}

function setFolderFilter(path) {
  st.folderFilter = path;
  renderFolderTree();
  if (st.search || st.tagFilter) doSearch(st.search); else renderSidebar();
}

function setTagFilter(tag) {
  st.tagFilter = st.tagFilter === tag ? null : tag;
  renderTagFilterChips();
  doSearch(st.search);
}

function onMetaChange() {
  if (!st.activeId) return;
  st.isDirty = true;
  setSaveStatus('saving');
  clearTimeout(st.saveTimer);
  st.saveTimer = setTimeout(saveFile, 800);
}

// ── Nova pasta ─────────────────────────────────────────────────────────────────
async function onNewFolderKey(e) {
  if (e.key === 'Escape') { cancelNewFolder(); return; }
  if (e.key !== 'Enter') return;
  const raw = e.target.value.trim().replace(/\/+/g, '/').replace(/^\/|\/$/g, '');
  if (!raw) { cancelNewFolder(); return; }
  cancelNewFolder();
  try {
    document.getElementById('btn-new-note').disabled = true;
    const r = await apiFetch('/files', {
      method: 'POST',
      body: JSON.stringify({ title: '', type: 'note', tags: [], content: '', folder: raw, status: '' }),
    });
    const file = await r.json();
    st.files.unshift(file);
    st.folderFilter = raw;
    st.expandedFolders.add(raw.split('/').slice(0, -1).join('/') || raw);
    renderSidebar();
    renderFolderTree();
    renderTagFilterChips();
    await openFile(file.id);
    setTimeout(() => {
      document.getElementById('title-input').focus();
      toast(`Pasta "${raw}" criada`, 'success');
    }, 80);
  } catch (err) {
    toast('Erro ao criar pasta: ' + err.message, 'error');
  } finally {
    document.getElementById('btn-new-note').disabled = false;
  }
}

// ── Expor ao DOM (necessário para event handlers inline) ──────────────────────
Object.assign(window, {
  // arquivo
  openFile, newFile, saveFile, exportFile, exportCurrent, exportAll,
  // modal
  openDeleteModal, closeDeleteModal, confirmDelete,
  // busca e filtros
  onSearch, setFilter, setFolderFilter, setTagFilter,
  // pastas
  toggleFolder, toggleFolderSection, startNewFolder, cancelNewFolder, onNewFolderKey,
  // editor
  onEditorInput, onTitleChange, onEditorKeydown, onTagKey, removeTag,
  fmt, ins, insCodeBlock, insMermaid, insTable, formatTable, setView, onMetaChange,
  // export
  printPDF,
  // import de assets
  triggerAssetImport, onAssetFiles,
  // rename inline
  startRenameFile, confirmRenameFile, cancelRename, onRenameKey, onRenameBlur,
});

// ── Init ───────────────────────────────────────────────────────────────────────
marked.use({ breaks: true, gfm: true });

setSaveCallback(saveFile);

document.addEventListener('keydown', e => {
  if (e.ctrlKey && e.key === 'n' && !e.shiftKey && !e.target.matches('input,textarea')) {
    e.preventDefault(); newFile('note');
  }
  if (e.ctrlKey && e.shiftKey && e.key === 'N') { e.preventDefault(); newFile('task'); }
  if (e.key === 'Escape') closeDeleteModal();
});

(async () => {
  initBackground();
  initResizer();
  const ok = await checkConn();
  if (ok) await loadFiles();
  else toast('API offline. Inicie o servidor: uv run mk-manager', 'error');
})();
