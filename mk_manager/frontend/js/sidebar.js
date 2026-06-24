// Responsabilidade: renderização da sidebar (lista de arquivos, pastas, tags)

import { st } from './state.js';
import { esc, timeAgo } from './utils.js';

// ── Exibição de arquivos ──────────────────────────────────────────────────────

export function getDisplayFiles() {
  if (st.searchResults !== null) {
    let res = st.searchResults;
    if (st.folderFilter !== null) res = res.filter(f => (f.folder || '') === st.folderFilter);
    return res;
  }
  let res = st.filter === 'all' ? st.files : st.files.filter(f => f.type === st.filter);
  if (st.folderFilter !== null) res = res.filter(f => (f.folder || '') === st.folderFilter);
  return res;
}

export function renderSidebar() {
  const list = document.getElementById('file-list');
  const files = getDisplayFiles();
  const hasSearch = !!st.search;

  if (!files.length) {
    list.innerHTML = `<div class="list-empty">
      <div class="ei">${hasSearch ? '🔎' : '📁'}</div>
      ${hasSearch
        ? 'Nenhum resultado para <strong>' + esc(st.search) + '</strong>.'
        : 'Nenhum arquivo ainda.<br>Crie uma nota ou tarefa.'}
    </div>`;
    return;
  }

  list.innerHTML = files.map(f => {
    const icon = f.type === 'task' ? '✅' : '📝';
    const active = f.id === st.activeId ? ' active' : '';

    if (st.renamingId === f.id) {
      return `<div class="file-item${active} renaming" data-id="${f.id}">
        <div class="file-item-icon">${icon}</div>
        <div class="file-item-body">
          <input class="rename-input" id="rename-input"
            value="${esc(f.title || '')}"
            onkeydown="onRenameKey(event,'${f.id}')"
            onblur="onRenameBlur('${f.id}',this.value)"
            onclick="event.stopPropagation()">
          <div class="rename-hint">↵ confirmar · Esc cancelar</div>
        </div>
      </div>`;
    }

    const taskBar = f.type === 'task' ? `
      <div class="task-bar-wrap">
        <div class="task-bar"><div class="task-bar-fill" style="width:${f.task_total ? Math.round(f.task_done / f.task_total * 100) : 0}%"></div></div>
        <div class="task-count">${f.task_done}/${f.task_total} concluídas</div>
      </div>` : '';
    const tagsHtml = (f.tags || []).length
      ? `<div class="file-tags">${f.tags.map(t => `<span class="ftag">${esc(t)}</span>`).join('')}</div>` : '';
    const snippetHtml = hasSearch && f.snippet
      ? `<div class="file-snippet">${esc(f.snippet)}</div>` : '';

    return `<div class="file-item${active}" onclick="openFile('${f.id}')" data-id="${f.id}">
      <div class="file-item-icon">${icon}</div>
      <div class="file-item-body">
        <div class="file-item-title">${esc(f.title || 'Sem título')}</div>
        <div class="file-item-meta">${timeAgo(f.modified)} · ${f.word_count} palavras</div>
        ${tagsHtml}${snippetHtml}${taskBar}
      </div>
      <div class="file-item-actions" onclick="event.stopPropagation()">
        <button class="fact" onclick="startRenameFile('${f.id}','${esc(f.title || '')}')" title="Renomear">✏️</button>
        <button class="fact" onclick="exportFile('${f.id}','${esc(f.title || 'sem-titulo')}')" title="Baixar .md">⬇</button>
        <button class="fact del" onclick="openDeleteModal('${f.id}','${esc(f.title || 'Sem título')}','${esc(f.filename)}')" title="Excluir">🗑</button>
      </div>
    </div>`;
  }).join('');

  // Focus rename input if active
  if (st.renamingId) {
    requestAnimationFrame(() => document.getElementById('rename-input')?.focus());
  }
}

// ── Árvore de pastas ──────────────────────────────────────────────────────────

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

export function renderFolderTree() {
  const rows = document.getElementById('folder-rows');
  const paths = folderPathsFromFiles(st.files);

  if (!paths.length) {
    rows.innerHTML = '<div style="font-size:.7rem;color:var(--text-muted);padding:.3rem .5rem;opacity:.5">Sem pastas ainda</div>';
    return;
  }

  const allActive = st.folderFilter === null ? ' active' : '';
  let html = `<div class="folder-row${allActive}" onclick="setFolderFilter(null)">🗂 Todos os arquivos</div>`;

  const rendered = new Set();

  function renderNode(prefix, depth) {
    const children = paths.filter(p => {
      if (!prefix) return p.indexOf('/') === -1;
      return p.startsWith(prefix + '/') && p.slice(prefix.length + 1).indexOf('/') === -1;
    });
    for (const p of children) {
      if (rendered.has(p)) continue;
      rendered.add(p);
      const name = p.split('/').pop();
      const isOpen = st.expandedFolders.has(p);
      const hasKids = paths.some(x => x.startsWith(p + '/'));
      const active = st.folderFilter === p ? ' active' : '';
      const indent = depth > 0 ? `style="padding-left:${depth * 0.8 + 0.4}rem"` : '';
      html += `<div class="folder-row${active}" ${indent} onclick="event.stopPropagation();setFolderFilter('${esc(p)}')">`;
      if (hasKids) {
        html += `<span class="folder-toggle${isOpen ? ' open' : ''}" onclick="event.stopPropagation();toggleFolder('${esc(p)}')">▶</span>`;
      } else {
        html += `<span style="width:.9rem;display:inline-block"></span>`;
      }
      html += `📁 ${esc(name)}</div>`;
      if (hasKids && isOpen) renderNode(p, depth + 1);
    }
  }

  renderNode('', 0);
  rows.innerHTML = html;
}

// ── Tag chips de filtro ────────────────────────────────────────────────────────

export function renderTagFilterChips() {
  const allTags = [...new Set(st.files.flatMap(f => f.tags || []))].sort();
  const wrap = document.getElementById('tag-filter-wrap');
  const chips = document.getElementById('tag-filter-chips');
  if (!allTags.length) { wrap.classList.remove('has-tags'); return; }
  wrap.classList.add('has-tags');
  chips.innerHTML = allTags.map(t =>
    `<button class="tag-filter-chip${st.tagFilter === t ? ' active' : ''}" onclick="setTagFilter('${esc(t)}')">${esc(t)}</button>`
  ).join('');
}

// ── Controles de pasta ────────────────────────────────────────────────────────

export function toggleFolder(path) {
  if (st.expandedFolders.has(path)) st.expandedFolders.delete(path);
  else st.expandedFolders.add(path);
  renderFolderTree();
}

export function toggleFolderSection() {
  st.folderSectionOpen = !st.folderSectionOpen;
  document.getElementById('folder-section-arrow').classList.toggle('open', st.folderSectionOpen);
  document.getElementById('folder-tree-body').style.display = st.folderSectionOpen ? '' : 'none';
}

export function startNewFolder() {
  if (!st.folderSectionOpen) toggleFolderSection();
  const row = document.getElementById('new-folder-row');
  const input = document.getElementById('new-folder-input');
  row.classList.add('visible');
  input.value = st.folderFilter ? st.folderFilter + '/' : '';
  input.focus();
  const len = input.value.length;
  input.setSelectionRange(len, len);
}

export function cancelNewFolder() {
  document.getElementById('new-folder-row').classList.remove('visible');
  document.getElementById('new-folder-input').value = '';
}
