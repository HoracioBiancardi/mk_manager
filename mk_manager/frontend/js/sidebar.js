// Responsabilidade: renderização dos painéis laterais (árvore, busca, tags)
// e interações da árvore (drag&drop, tooltip, rename/nova pasta inline)

import { st } from './state.js';
import { esc, timeAgo } from './utils.js';
import { showContextMenu } from './contextmenu.js';

// ── Ações injetadas por files.js/delete-modal.js (evita import circular: files.js
// precisa de renderSidebar/renderTree daqui, então este módulo não importa de volta) ──
let _moveFileToFolder = null;
let _confirmRenameFile = null;
let _renameFolder = null;
let _deleteFolder = null;
let _newFile = null;
let _openDeleteModal = null;

export function initSidebarActions({ moveFileToFolder, confirmRenameFile, renameFolder, deleteFolder, newFile, openDeleteModal }) {
  _moveFileToFolder = moveFileToFolder;
  _confirmRenameFile = confirmRenameFile;
  _renameFolder = renameFolder;
  _deleteFolder = deleteFolder;
  _newFile = newFile;
  _openDeleteModal = openDeleteModal;
}

// ── SVG icons ─────────────────────────────────────────────────────────────────

const NOTE_ICON = `<svg class="tree-icon" width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M14 2v6h6" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M8 13h8M8 17h5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`;
const TASK_ICON = `<svg class="tree-icon" width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M9 11l3 3L22 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const FOLDER_ICON = `<svg class="tree-icon" width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>`;
const CARET_SVG = `<svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M2 1l4 3-4 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

// ── Utility ──────────────────────────────────────────────────────────────────

export function folderPathsFromFiles(files) {
  const paths = new Set();
  for (const f of files) {
    const folder = (f.folder || '').trim();
    if (!folder) continue;
    const parts = folder.split('/').filter(Boolean);
    let acc = '';
    for (const p of parts) {
      acc = acc ? acc + '/' + p : p;
      paths.add(acc);
    }
  }
  for (const p of st.emptyFolders) paths.add(p);
  return [...paths].sort();
}

export function getDisplayFiles() {
  if (st.searchResults !== null) return st.searchResults;
  return st.filter === 'all' ? st.files : st.files.filter(f => f.type === st.filter);
}

// ── Entry point ───────────────────────────────────────────────────────────────

export function renderSidebar() {
  renderTree();
  if (st.mainView === 'search') renderSearchResults();
  else if (st.mainView === 'tags') renderTagsPanel();
}

// ── Explorer panel — file tree ────────────────────────────────────────────────

export function renderTree() {
  const tree = document.getElementById('file-tree');
  if (!tree) return;

  const { files } = st;
  if (!files.length) {
    tree.innerHTML = '<div class="tree-empty">Nenhum arquivo ainda.<br>Crie uma nota ou task.</div>';
    return;
  }

  const allFolderPaths = folderPathsFromFiles(files);
  const rootFiles = files
    .filter(f => !(f.folder || '').trim())
    .sort((a, b) => (a.title || '').localeCompare(b.title || '', 'pt-BR', { sensitivity: 'base' }));

  const filesByFolder = {};
  files.filter(f => (f.folder || '').trim()).forEach(f => {
    const folder = f.folder.trim();
    if (!filesByFolder[folder]) filesByFolder[folder] = [];
    filesByFolder[folder].push(f);
  });
  for (const key of Object.keys(filesByFolder)) {
    filesByFolder[key].sort((a, b) => (a.title || '').localeCompare(b.title || '', 'pt-BR', { sensitivity: 'base' }));
  }

  let html = '';

  if (st.creatingFolder) {
    html += `<div class="tree-folder-new">
      <span class="tree-caret-gap"></span>
      ${FOLDER_ICON}
      <input class="rename-input" id="new-folder-input" placeholder="Nome da pasta"
        onkeydown="onNewFolderKey(event)"
        onblur="onNewFolderBlur(this.value)"
        onclick="event.stopPropagation()">
    </div>`;
  }

  rootFiles.forEach(f => { html += treeFileHtml(f, 0); });

  allFolderPaths.forEach(folderPath => {
    const parentPath = folderPath.includes('/')
      ? folderPath.split('/').slice(0, -1).join('/')
      : null;
    if (parentPath && !st.expandedFolders.has(parentPath)) return;

    const depth = (folderPath.match(/\//g) || []).length;
    const name = folderPath.split('/').pop();
    const isOpen = st.expandedFolders.has(folderPath);
    const filesHere = filesByFolder[folderPath] || [];
    const hasSubfolders = allFolderPaths.some(p =>
      p.startsWith(folderPath + '/') &&
      (p.match(/\//g) || []).length === depth + 1
    );

    html += treeFolderHtml(folderPath, name, depth, isOpen, filesHere.length, filesHere.length > 0 || hasSubfolders);

    if (isOpen) {
      filesHere.forEach(f => { html += treeFileHtml(f, depth + 1); });
    }
  });

  tree.innerHTML = html;

  if (st.creatingFolder) {
    requestAnimationFrame(() => document.getElementById('new-folder-input')?.focus());
  }
  if (st.activeId) {
    requestAnimationFrame(() => {
      tree.querySelector(`.tree-item[data-id="${st.activeId}"]`)?.scrollIntoView({ block: 'nearest' });
    });
  }
  if (st.renamingId) {
    requestAnimationFrame(() => document.getElementById('rename-input')?.focus());
  }
}

function treeFolderHtml(path, name, depth, isOpen, fileCount, hasContent) {
  const indent = (0.5 + depth * 0.875).toFixed(2);
  const ep = esc(path);

  if (st.renamingFolderPath === path) {
    return `<div class="tree-folder-row" data-folder-path="${ep}" style="padding-left:${indent}rem">
      <span class="tree-caret-gap"></span>
      ${FOLDER_ICON}
      <input class="rename-input" id="rename-folder-input" style="flex:1"
        value="${esc(name)}"
        onkeydown="onRenameFolderKey(event,'${ep}')"
        onblur="onRenameFolderBlur('${ep}',this.value)"
        onclick="event.stopPropagation()">
    </div>`;
  }

  return `<div class="tree-folder-row" data-folder-path="${ep}" style="padding-left:${indent}rem"
    onclick="toggleTreeFolder('${ep}')"
    oncontextmenu="onFolderContextMenu(event,'${ep}')"
    ondragover="onFolderDragOver(event,'${ep}')"
    ondrop="onFolderDrop(event,'${ep}')"
    ondragleave="onFolderDragLeave(event)">
    ${hasContent
      ? `<span class="tree-caret${isOpen ? ' open' : ''}">${CARET_SVG}</span>`
      : '<span class="tree-caret-gap"></span>'}
    ${FOLDER_ICON}
    <span class="tree-name">${esc(name)}</span>
    ${fileCount ? `<span class="tree-count">${fileCount}</span>` : ''}
    <div class="tree-item-actions" onclick="event.stopPropagation()">
      <button class="icon-btn" onclick="startRenameFolder('${ep}')" title="Renomear pasta">✏</button>
      <button class="icon-btn del" onclick="deleteFolderPrompt('${ep}')" title="Excluir pasta">✕</button>
    </div>
  </div>`;
}

function treeFileHtml(f, depth) {
  const indent = (0.5 + depth * 0.875).toFixed(2);
  const active = f.id === st.activeId ? ' active' : '';
  const fileIcon = f.type === 'task' ? TASK_ICON : NOTE_ICON;

  if (st.renamingId === f.id) {
    return `<div class="tree-item${active}" style="padding-left:${indent}rem" data-id="${f.id}"
      draggable="true" ondragstart="onFileDragStart(event,'${f.id}')">
      <span class="tree-caret-gap"></span>
      ${fileIcon}
      <input class="rename-input" id="rename-input" style="flex:1"
        value="${esc(f.title || '')}"
        onkeydown="onRenameKey(event,'${f.id}')"
        onblur="onRenameBlur('${f.id}',this.value)"
        onclick="event.stopPropagation()">
    </div>`;
  }

  return `<div class="tree-item${active}" style="padding-left:${indent}rem" data-id="${f.id}"
    onclick="openFile('${f.id}')"
    oncontextmenu="onFileContextMenu(event,'${f.id}')"
    draggable="true" ondragstart="onFileDragStart(event,'${f.id}')"
    onmouseenter="showFileTooltip(event,'${f.id}')" onmouseleave="hideFileTooltip()">
    <span class="tree-caret-gap"></span>
    ${fileIcon}
    <span class="tree-name">${esc(f.title || 'Sem título')}</span>
    <div class="tree-item-actions" onclick="event.stopPropagation()">
      <button class="icon-btn" onclick="startRenameFile('${f.id}')" title="Renomear">✏</button>
      <button class="icon-btn del" onclick="openDeleteModal('${f.id}','${esc(f.title || 'Sem título')}','${esc(f.filename)}')" title="Excluir">✕</button>
    </div>
  </div>`;
}

export function toggleTreeFolder(path) {
  if (st.expandedFolders.has(path)) st.expandedFolders.delete(path);
  else st.expandedFolders.add(path);
  renderTree();
}

export const toggleFolder = toggleTreeFolder;

// ── Renomear/excluir pasta ─────────────────────────────────────────────────────

export function startRenameFolder(path) {
  st.renamingFolderPath = path;
  renderTree();
}

export function cancelRenameFolder() {
  st.renamingFolderPath = null;
  renderTree();
}

export function onRenameFolderKey(e, path) {
  e.stopPropagation();
  if (e.key === 'Enter') {
    e.preventDefault();
    confirmRenameFolderInput(path, e.target.value);
  } else if (e.key === 'Escape') {
    e.preventDefault();
    cancelRenameFolder();
  }
}

export function onRenameFolderBlur(path, value) {
  if (st.renamingFolderPath === path) confirmRenameFolderInput(path, value);
}

function confirmRenameFolderInput(path, newName) {
  st.renamingFolderPath = null;
  const trimmed = newName.trim().replace(/\//g, '');
  const currentName = path.includes('/') ? path.split('/').pop() : path;
  if (!trimmed || trimmed === currentName) {
    renderTree();
    return;
  }
  _renameFolder?.(path, trimmed);
}

export function deleteFolderPrompt(path) {
  const affected = st.files.filter(f =>
    (f.folder || '') === path || (f.folder || '').startsWith(path + '/')
  );
  const name = path.includes('/') ? path.split('/').pop() : path;
  const msg = affected.length
    ? `Excluir a pasta "${name}"?\n${affected.length} arquivo(s) serão movidos para a pasta pai (nada é apagado).`
    : `Excluir a pasta "${name}"?`;
  if (!window.confirm(msg)) return;
  _deleteFolder?.(path);
}

// ── Search panel ──────────────────────────────────────────────────────────────

export function renderSearchResults() {
  const el = document.getElementById('search-results');
  if (!el) return;

  const baseFiles = st.filter === 'all' ? st.files : st.files.filter(f => f.type === st.filter);
  const files = st.searchResults !== null ? st.searchResults : (st.search ? [] : baseFiles);
  const hasSearch = !!st.search;

  if (!files.length) {
    el.innerHTML = hasSearch
      ? `<div class="search-empty">Nenhum resultado para <strong>"${esc(st.search)}"</strong></div>`
      : '<div class="search-empty">Digite para buscar…</div>';
    return;
  }

  el.innerHTML = files.map(f => {
    const active = f.id === st.activeId ? ' active' : '';
    const folder = f.folder ? `${esc(f.folder)} · ` : '';
    const taskMeta = f.type === 'task' && f.task_total ? ` · ${f.task_done}/${f.task_total} tasks` : '';
    return `<div class="search-result${active}" onclick="openFile('${f.id}')">
      <div class="search-result-title">${esc(f.title || 'Sem título')}</div>
      ${f.snippet ? `<div class="search-result-snippet">${esc(f.snippet)}</div>` : ''}
      <div class="search-result-meta">${folder}${timeAgo(f.modified)} · ${f.word_count} pal.${taskMeta}</div>
    </div>`;
  }).join('');
}

// ── Tags panel (árvore hierárquica, tipo Obsidian: #area/sub) ─────────────────

// Uma tag "area" cobre notas com exatamente "area" OU qualquer "area/..." aninhada.
function tagMatchesFilter(tag, filter) {
  return tag === filter || tag.startsWith(filter + '/');
}

function buildTagTree(tagCounts) {
  const root = { name: '', path: '', children: new Map(), ownCount: 0, count: 0 };
  for (const [tag, count] of tagCounts) {
    const parts = tag.split('/').filter(Boolean);
    let node = root;
    let acc = '';
    for (const part of parts) {
      acc = acc ? `${acc}/${part}` : part;
      if (!node.children.has(part)) {
        node.children.set(part, { name: part, path: acc, children: new Map(), ownCount: 0, count: 0 });
      }
      node = node.children.get(part);
    }
    node.ownCount = count;
  }
  (function aggregate(node) {
    let total = node.ownCount;
    for (const child of node.children.values()) total += aggregate(child);
    node.count = total;
    return total;
  })(root);
  return root;
}

function renderTagTreeChildren(node, depth) {
  const children = [...node.children.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  return children.map(child => renderTagTreeNode(child, depth)).join('');
}

function renderTagTreeNode(node, depth) {
  const indent = (0.25 + depth * 0.875).toFixed(2);
  const hasChildren = node.children.size > 0;
  const isOpen = st.expandedTags.has(node.path);
  const isActive = st.tagFilters.includes(node.path);
  const ep = esc(node.path);

  let html = `<div class="tagtree-row${isActive ? ' active' : ''}" style="padding-left:${indent}rem" onclick="setTagFilter('${ep}')">
    ${hasChildren
      ? `<span class="tree-caret${isOpen ? ' open' : ''}" onclick="event.stopPropagation(); toggleTagTreeNode('${ep}')">${CARET_SVG}</span>`
      : '<span class="tree-caret-gap"></span>'}
    <span class="tagtree-name">${esc(node.name)}</span>
    <span class="tagtree-count">${node.count}</span>
    ${node.ownCount > 0
      ? `<button class="icon-btn" onclick="event.stopPropagation(); renameTagPrompt('${ep}')" title="Renomear / unificar tag">✎</button>`
      : ''}
  </div>`;

  if (hasChildren && isOpen) {
    html += `<div class="tagtree-children">${renderTagTreeChildren(node, depth + 1)}</div>`;
  }
  return html;
}

export function toggleTagTreeNode(path) {
  if (st.expandedTags.has(path)) st.expandedTags.delete(path);
  else st.expandedTags.add(path);
  renderTagsPanel();
}

export function renderTagsPanel() {
  const treeEl = document.getElementById('tagtree-list');
  const detailEl = document.getElementById('tagtree-detail');
  if (!treeEl || !detailEl) return;

  const tagCounts = new Map();
  for (const f of st.files) {
    for (const t of f.tags || []) {
      tagCounts.set(t, (tagCounts.get(t) || 0) + 1);
    }
  }
  if (!tagCounts.size) {
    treeEl.innerHTML = '<div class="tags-empty">Nenhuma tag ainda.<br>Adicione tags na barra do editor ou #tags no texto.</div>';
    detailEl.innerHTML = '';
    return;
  }

  const visibleTags = st.tagSearch
    ? [...tagCounts.keys()].filter(t => t.toLowerCase().includes(st.tagSearch))
    : [...tagCounts.keys()];

  const activeTags = st.tagFilters;
  if (visibleTags.length) {
    const filteredCounts = visibleTags.map(t => [t, tagCounts.get(t)]);
    const tree = buildTagTree(filteredCounts);
    treeEl.innerHTML = renderTagTreeChildren(tree, 0);
  } else {
    treeEl.innerHTML = '<div class="tags-empty">Nenhuma tag encontrada.</div>';
  }

  if (!activeTags.length) {
    detailEl.innerHTML = '<div class="tagtree-detail-empty">Selecione uma tag para ver as notas relacionadas.</div>';
    return;
  }

  const filtered = st.files.filter(f =>
    activeTags.every(t => (f.tags || []).some(tag => tagMatchesFilter(tag, t)))
  );
  const label = activeTags.map(t => `"${esc(t)}"`).join(' + ');

  let html = `<div class="tags-lineage">`;
  html += activeTags.map((t, i) =>
    `${i > 0 ? '<span class="tags-lineage-sep">›</span>' : ''}<button class="tags-lineage-crumb" onclick="setTagFilter('${esc(t)}')" title="Remover do filtro">${esc(t)} ×</button>`
  ).join('');
  html += `</div>`;

  const relatedCounts = new Map();
  for (const f of filtered) {
    for (const t of f.tags || []) {
      if (activeTags.some(af => tagMatchesFilter(t, af))) continue;
      relatedCounts.set(t, (relatedCounts.get(t) || 0) + 1);
    }
  }
  const relatedTags = [...relatedCounts.keys()].sort((a, b) => relatedCounts.get(b) - relatedCounts.get(a) || a.localeCompare(b));
  if (relatedTags.length) {
    html += `<div class="tags-panel-divider">tags relacionadas</div>`;
    html += `<div class="tags-cloud">`;
    html += relatedTags.map(t =>
      `<button class="tag-browse-chip tag-related-chip" onclick="setTagFilter('${esc(t)}')" title="${relatedCounts.get(t)} nota${relatedCounts.get(t) === 1 ? '' : 's'} em comum">${esc(t)} <span class="tag-related-count">${relatedCounts.get(t)}</span></button>`
    ).join('');
    html += `</div>`;
  }

  if (filtered.length) {
    html += `<div class="tags-panel-divider">com tag ${label}</div>`;
    html += `<div class="tags-panel-files">`;
    html += filtered.map(f => {
      const a = f.id === st.activeId ? ' active' : '';
      const folder = f.folder ? `<span class="tagtree-file-folder">${esc(f.folder)}</span>` : '';
      return `<div class="tree-item${a}" onclick="openFile('${f.id}')" data-id="${f.id}">
        <span class="tree-caret-gap"></span>
        ${f.type === 'task' ? TASK_ICON : NOTE_ICON}
        <span class="tree-name">${esc(f.title || 'Sem título')}</span>
        ${folder}
      </div>`;
    }).join('');
    html += '</div>';
  } else {
    html += `<div class="tags-panel-divider">nenhuma nota com ${label}</div>`;
  }

  detailEl.innerHTML = html;
}

// ── Tooltip de preview no explorador ─────────────────────────────────────────

export function showFileTooltip(e, id) {
  const f = st.files.find((f) => f.id === id);
  if (!f) return;
  const tip = document.getElementById('tree-tooltip');
  if (!tip) return;

  let html = `<div class="tip-title">${esc(f.title || 'Sem título')}</div>`;
  if (f.folder) html += `<span class="tip-stat">📁 ${esc(f.folder)}</span>`;
  if (f.tags?.length) {
    html += `<div class="tip-tags">${f.tags.map((t) => `<span class="tip-tag">${esc(t)}</span>`).join('')}</div>`;
  }
  if (f.type === 'task' && f.task_total) {
    html += `<span class="tip-stat">✓ ${f.task_done}/${f.task_total} tasks</span>`;
  }
  html += `<span class="tip-stat">${f.word_count} pal. · ${timeAgo(f.modified)}</span>`;
  tip.innerHTML = html;

  const rect = e.currentTarget.getBoundingClientRect();
  const sidebar = document.querySelector('.sidebar-panel');
  const sRight = sidebar ? sidebar.getBoundingClientRect().right : rect.right;
  tip.style.top = `${Math.max(4, rect.top)}px`;
  tip.style.left = `${sRight + 10}px`;
  tip.classList.add('visible');
}

export function hideFileTooltip() {
  document.getElementById('tree-tooltip')?.classList.remove('visible');
}

// ── Drag & drop de arquivos para pastas ────────────────────────────────────────

export function onFileDragStart(e, id) {
  st.draggingFileId = id;
  e.dataTransfer.effectAllowed = 'move';
}

export function onFolderDragOver(e, path) {
  e.preventDefault();
  e.stopPropagation();
  e.dataTransfer.dropEffect = 'move';
  e.currentTarget.classList.add('drag-over');
}

export function onFolderDragLeave(e) {
  if (!e.currentTarget.contains(e.relatedTarget)) {
    e.currentTarget.classList.remove('drag-over');
  }
}

export function onFolderDrop(e, path) {
  e.preventDefault();
  e.stopPropagation();
  e.currentTarget.classList.remove('drag-over');
  const id = st.draggingFileId;
  st.draggingFileId = null;
  if (id) _moveFileToFolder?.(id, path);
}

// ── Menu de contexto (clique direito) ──────────────────────────────────────────

export function onFileContextMenu(e, id) {
  e.preventDefault();
  e.stopPropagation();
  hideFileTooltip();
  const f = st.files.find((x) => x.id === id);
  if (!f) return;
  showContextMenu(e.clientX, e.clientY, [
    { icon: '✏', label: 'Renomear', onClick: () => startRenameFile(id) },
    { icon: '✕', label: 'Excluir', danger: true, onClick: () => _openDeleteModal?.(id, f.title || 'Sem título', f.filename) },
  ]);
}

export function onFolderContextMenu(e, path) {
  e.preventDefault();
  e.stopPropagation();
  showContextMenu(e.clientX, e.clientY, [
    { icon: '📄', label: 'Nova nota aqui', onClick: () => _newFile?.('note', path) },
    { icon: '☑', label: 'Nova task aqui', onClick: () => _newFile?.('task', path) },
    { separator: true },
    { icon: '✏', label: 'Renomear pasta', onClick: () => startRenameFolder(path) },
    { icon: '✕', label: 'Excluir pasta', danger: true, onClick: () => deleteFolderPrompt(path) },
  ]);
}

export function onTreeBackgroundContextMenu(e) {
  if (e.target.closest('.tree-item, .tree-folder-row')) return;
  e.preventDefault();
  e.stopPropagation();
  showContextMenu(e.clientX, e.clientY, [
    { icon: '📄', label: 'Nova nota', onClick: () => _newFile?.('note') },
    { icon: '☑', label: 'Nova task', onClick: () => _newFile?.('task') },
    { icon: '📁', label: 'Nova pasta', onClick: () => startNewFolderInput() },
  ]);
}

// ── Nova pasta inline ──────────────────────────────────────────────────────────

export function startNewFolderInput() {
  st.creatingFolder = true;
  renderTree();
}

export function onNewFolderKey(e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    confirmNewFolder(e.target.value);
  } else if (e.key === 'Escape') {
    e.preventDefault();
    cancelNewFolderInput();
  }
}

export function onNewFolderBlur(value) {
  if (st.creatingFolder) confirmNewFolder(value);
}

export function confirmNewFolder(name) {
  st.creatingFolder = false;
  const trimmed = name.trim().replace(/^\/+|\/+$/g, '');
  if (trimmed) {
    st.emptyFolders.add(trimmed);
    st.expandedFolders.add(trimmed);
  }
  renderTree();
}

export function cancelNewFolderInput() {
  st.creatingFolder = false;
  renderTree();
}

// ── Rename inline ─────────────────────────────────────────────────────────────

export function startRenameFile(id) {
  st.renamingId = id;
  renderSidebar();
}

export function cancelRename() {
  st.renamingId = null;
  renderSidebar();
}

export function onRenameKey(e, id) {
  e.stopPropagation();
  if (e.key === 'Enter') {
    e.preventDefault();
    _confirmRenameFile?.(id, e.target.value);
  } else if (e.key === 'Escape') {
    e.preventDefault();
    cancelRename();
  }
}

export function onRenameBlur(id, value) {
  if (st.renamingId === id) _confirmRenameFile?.(id, value);
}

// ── Expor ao DOM (necessário para event handlers inline gerados acima) ────────
Object.assign(window, {
  toggleTreeFolder,
  toggleFolder,
  showFileTooltip,
  hideFileTooltip,
  onFileDragStart,
  onFolderDragOver,
  onFolderDragLeave,
  onFolderDrop,
  startNewFolderInput,
  onNewFolderKey,
  onNewFolderBlur,
  confirmNewFolder,
  cancelNewFolderInput,
  startRenameFile,
  cancelRename,
  onRenameKey,
  onRenameBlur,
  startRenameFolder,
  cancelRenameFolder,
  onRenameFolderKey,
  onRenameFolderBlur,
  deleteFolderPrompt,
  onFileContextMenu,
  onFolderContextMenu,
  onTreeBackgroundContextMenu,
  toggleTagTreeNode,
});
