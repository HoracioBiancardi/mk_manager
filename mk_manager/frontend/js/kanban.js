// Responsabilidade: board kanban (renderização e drag-and-drop)

import { st } from './state.js';
import { esc, timeAgo, toast } from './utils.js';
import { apiFetch } from './api.js';

const STATUSES = ['planning', 'development', 'review', 'done'];

const STATUS_LABELS = {
  planning: 'Planejado',
  development: 'Em Desenvolvimento',
  review: 'Em Review',
  done: 'Concluído',
};

let dragFileId = null;

export function renderKanban() {
  for (const s of STATUSES) {
    const cards = st.files.filter(f => f.type === 'task' && (f.status || '') === s);
    const container = document.getElementById('cards-' + s);
    document.getElementById('cnt-' + s).textContent = cards.length;

    if (!cards.length) {
      container.innerHTML = '<div class="kanban-empty">Nenhum item</div>';
      continue;
    }

    container.innerHTML = cards.map(f => {
      const tagsHtml = (f.tags || []).length
        ? f.tags.map(t => `<span class="ftag">${esc(t)}</span>`).join('')
        : '';
      const folderHtml = f.folder
        ? `<div class="kanban-card-folder">📁 ${esc(f.folder)}</div>` : '';
      const taskProgress = f.type === 'task' && f.task_total
        ? `<span>${f.task_done}/${f.task_total}</span>` : '';

      return `<div class="kanban-card" draggable="true" data-id="${f.id}"
          ondragstart="onCardDragStart(event,'${f.id}')"
          ondragend="onCardDragEnd(event)"
          onclick="openFromKanban('${f.id}')">
          <div class="kanban-card-title">${esc(f.title || 'Sem título')}</div>
          <div class="kanban-card-meta">
            <span>✅</span>
            ${tagsHtml}
            ${taskProgress}
            <span style="margin-left:auto;opacity:.55">${timeAgo(f.modified)}</span>
          </div>
          ${folderHtml}
        </div>`;
    }).join('');
  }
}

export function openFromKanban(id) {
  // setMainView e openFile são expostos globalmente por app.js
  window.setMainView('notes');
  window.openFile(id);
}

export function onCardDragStart(e, id) {
  dragFileId = id;
  e.dataTransfer.effectAllowed = 'move';
  setTimeout(() => e.target.classList.add('dragging'), 0);
}

export function onCardDragEnd(e) {
  e.target.classList.remove('dragging');
  dragFileId = null;
}

export function onColDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  e.currentTarget.classList.add('drag-over');
}

export function onColDragLeave(e) {
  e.currentTarget.classList.remove('drag-over');
}

export async function onColDrop(e, status) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');
  if (!dragFileId) return;
  const fileId = dragFileId; // captura antes do ondragend zerar
  const file = st.files.find(f => f.id === fileId);
  if (!file || file.status === status) return;
  try {
    const r = await apiFetch(`/files/${fileId}`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    });
    const updated = await r.json();
    const idx = st.files.findIndex(f => f.id === fileId);
    if (idx !== -1) st.files[idx] = { ...st.files[idx], ...updated };
    if (st.activeId === fileId) {
      st.activeStatus = status;
      const sel = document.getElementById('status-select');
      if (sel) sel.value = status;
    }
    renderKanban();
    toast(`Movido para ${STATUS_LABELS[status]}`, 'success');
  } catch (err) {
    toast('Erro ao mover card: ' + err.message, 'error');
  }
}
