// Responsabilidade: renderização dos painéis laterais (árvore, busca, tags)

import { st } from './state.js';
import { esc, timeAgo } from './utils.js';

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
  return [...paths].sort();
}

export function getDisplayFiles() {
  if (st.searchResults !== null) return st.searchResults;
  return st.filter === 'all' ? st.files : st.files.filter(f => f.type === st.filter);
}

// ── Entry point ───────────────────────────────────────────────────────────────

export function renderSidebar() {
  renderTree();
  if (st.activePanel === 'search') renderSearchResults();
  else if (st.activePanel === 'tags') renderTagsPanel();
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
  const rootFiles = files.filter(f => !(f.folder || '').trim());

  const filesByFolder = {};
  files.filter(f => (f.folder || '').trim()).forEach(f => {
    const folder = f.folder.trim();
    if (!filesByFolder[folder]) filesByFolder[folder] = [];
    filesByFolder[folder].push(f);
  });

  let html = '';

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
  return `<div class="tree-folder-row" style="padding-left:${indent}rem" onclick="toggleTreeFolder('${ep}')">
    ${hasContent
      ? `<span class="tree-caret${isOpen ? ' open' : ''}">${CARET_SVG}</span>`
      : '<span class="tree-caret-gap"></span>'}
    ${FOLDER_ICON}
    <span class="tree-name">${esc(name)}</span>
    ${fileCount ? `<span class="tree-count">${fileCount}</span>` : ''}
  </div>`;
}

function treeFileHtml(f, depth) {
  const indent = (0.5 + depth * 0.875).toFixed(2);
  const active = f.id === st.activeId ? ' active' : '';
  const fileIcon = f.type === 'task' ? TASK_ICON : NOTE_ICON;

  if (st.renamingId === f.id) {
    return `<div class="tree-item${active}" style="padding-left:${indent}rem" data-id="${f.id}">
      <span class="tree-caret-gap"></span>
      ${fileIcon}
      <input class="rename-input" id="rename-input" style="flex:1"
        value="${esc(f.title || '')}"
        onkeydown="onRenameKey(event,'${f.id}')"
        onblur="onRenameBlur('${f.id}',this.value)"
        onclick="event.stopPropagation()">
    </div>`;
  }

  return `<div class="tree-item${active}" style="padding-left:${indent}rem" data-id="${f.id}" onclick="openFile('${f.id}')">
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

// ── Tags panel ────────────────────────────────────────────────────────────────

export function renderTagsPanel() {
  const el = document.getElementById('tags-panel-body');
  if (!el) return;

  const allTags = [...new Set(st.files.flatMap(f => f.tags || []))].sort();
  if (!allTags.length) {
    el.innerHTML = '<div class="tags-empty">Nenhuma tag ainda.<br>Adicione tags na barra do editor.</div>';
    return;
  }

  const activeTag = st.tagFilter;
  let html = `<div class="tags-cloud">`;
  html += allTags.map(t =>
    `<button class="tag-browse-chip${activeTag === t ? ' active' : ''}" onclick="setTagFilter('${esc(t)}')">${esc(t)}</button>`
  ).join('');
  html += '</div>';

  if (activeTag) {
    const filtered = st.files.filter(f => (f.tags || []).includes(activeTag));
    if (filtered.length) {
      html += `<div class="tags-panel-divider">com tag "${esc(activeTag)}"</div>`;
      html += `<div class="tags-panel-files">`;
      html += filtered.map(f => {
        const a = f.id === st.activeId ? ' active' : '';
        return `<div class="tree-item${a}" onclick="openFile('${f.id}')" data-id="${f.id}" style="padding-left:.5rem">
          <span class="tree-caret-gap"></span>
          ${f.type === 'task' ? TASK_ICON : NOTE_ICON}
          <span class="tree-name">${esc(f.title || 'Sem título')}</span>
        </div>`;
      }).join('');
      html += '</div>';
    }
  }

  el.innerHTML = html;
}

// ── Stubs de compatibilidade (funções removidas da UI) ────────────────────────
export function renderFolderTree() {}
export function renderTagFilterChips() {}
export function toggleFolderSection() {}
export function startNewFolder() {}
export function cancelNewFolder() {}
