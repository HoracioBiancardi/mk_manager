// Responsabilidade: board Kanban (colunas, cards, drag & drop, quick-edit modal)

import { st } from "./state.js";
import { esc, toast } from "./utils.js";
import { apiFetch } from "./api.js";
import { renderMarkdown, toggleCheckboxAt } from "./preview.js";
import { updateRetroStatusLabel, updateTaskDuration } from "./editor.js";
import { refreshListIfActive } from "./list.js";

// ── Callback injetado por app.js para evitar dependência circular ─────────────
let _openFile = null;
let _archiveFile = null;

export function initKanban({ openFile, archiveFile }) {
  _openFile = openFile;
  _archiveFile = archiveFile;
}

export function archiveTaskFromKanban(event, id) {
  event.stopPropagation();
  if (!window.confirm("Arquivar esta task? Ela sai do Kanban e da Lista, mas continua salva — dá pra restaurar na tela Arquivo.")) return;
  _archiveFile?.(id);
}

// ── Configuração de colunas ────────────────────────────────────────────────────
const KANBAN_DEFAULT_COLS = [
  { key: "", label: "Backlog", color: "" },
  { key: "planning", label: "Planejado", color: "#60a5fa" },
  { key: "development", label: "Em desenvolvimento", color: "#f59e0b" },
  { key: "done", label: "Concluído", color: "#10b981" },
];

const KANBAN_PALETTE = [
  "#f87171",
  "#fb923c",
  "#fbbf24",
  "#34d399",
  "#38bdf8",
  "#818cf8",
  "#e879f9",
  "#94a3b8",
];

export function loadKanbanColumns() {
  try {
    const saved = localStorage.getItem("mk-kanban-cols");
    if (saved) {
      st.kanbanColumns = JSON.parse(saved);
      return;
    }
  } catch {}
  st.kanbanColumns = KANBAN_DEFAULT_COLS.map((c) => ({ ...c }));
}

function saveKanbanColumns() {
  localStorage.setItem("mk-kanban-cols", JSON.stringify(st.kanbanColumns));
}

export function updateStatusSelect() {
  const sel = document.getElementById("status-select");
  if (!sel || !st.kanbanColumns) return;
  const cur = sel.value;
  sel.innerHTML =
    '<option value="">—</option>' +
    st.kanbanColumns
      .filter((c) => c.key)
      .map((c) => `<option value="${esc(c.key)}">${esc(c.label)}</option>`)
      .join("");
  sel.value = cur;
}

// ── Estado de expansão dos cards ──────────────────────────────────────────────
const _expandedCards = new Set();

export function toggleKanbanCardExpand(id, event) {
  event?.stopPropagation();
  if (_expandedCards.has(id)) _expandedCards.delete(id);
  else _expandedCards.add(id);
  renderKanban();
}

// ── Renderização do board ──────────────────────────────────────────────────────
export function renderKanban() {
  const board = document.getElementById("kanban-board");
  if (!board) return;
  const tasks = st.files
    .filter((f) => f.type === "task")
    .sort((a, b) =>
      (a.title || "").localeCompare(b.title || "", "pt-BR", {
        sensitivity: "base",
      }),
    );

  const cols = st.kanbanColumns.map((col) => {
    const colTasks = tasks.filter((f) => (f.status || "") === col.key);
    const cards = colTasks
      .map((f, i) => {
        const pct = f.task_total
          ? Math.round((f.task_done / f.task_total) * 100)
          : -1;
        const progress =
          pct >= 0
            ? `<div class="kanban-progress"><div class="kanban-progress-bar" style="width:${pct}%"></div></div>
           <span class="kanban-progress-label">${f.task_done}/${f.task_total}</span>`
            : "";
        const tags = f.tags?.length
          ? `<div class="kanban-card-tags">${f.tags
              .slice(0, 3)
              .map((t) => `<span class="kanban-tag">${esc(t)}</span>`)
              .join("")}</div>`
          : "";
        const items = f.task_items || [];
        const PREVIEW_LIMIT = 3;
        const isExpanded = _expandedCards.has(f.id);
        const visibleItems = isExpanded ? items : items.slice(0, PREVIEW_LIMIT);
        const hasMore = items.length > PREVIEW_LIMIT;
        const taskPreview = visibleItems.length
          ? `<div class="kanban-card-tasks">${visibleItems
              .map((it) => {
                const level = Math.min(Math.floor((it.indent || 0) / 2), 3);
                const icon = it.done ? "✓" : (level > 0 ? "–" : "○");
                return `<div class="kanban-card-task-item${it.done ? " done" : ""}" style="padding-left:${4 + level * 12}px">
                  <span class="kanban-card-task-icon">${icon}</span>
                  <span>${esc(it.text)}</span>
                </div>`;
              })
              .join("")}${
              hasMore
                ? `<button class="kanban-card-expand-btn" onclick="toggleKanbanCardExpand('${f.id}',event)">${isExpanded ? "▲ Menos" : `▼ +${items.length - PREVIEW_LIMIT} mais`}</button>`
                : ""
            }</div>`
          : "";
        return `<div class="kanban-card" data-id="${f.id}"
        style="animation-delay:${Math.min(i * 25, 250)}ms"
        draggable="true"
        onclick="openKanbanQEdit('${f.id}')"
        ondragstart="onKanbanCardDragStart(event,'${f.id}')">
        <button class="kanban-card-archive-btn" title="Arquivar" onclick="archiveTaskFromKanban(event,'${f.id}')">📦</button>
        <div class="kanban-card-title">${esc(f.title || "Sem título")}</div>
        ${taskPreview}${progress}${tags}
      </div>`;
      })
      .join("");
    const colorStyle = col.color ? `color:${col.color}` : "";
    return `<div class="kanban-col" data-status="${esc(col.key)}"
      ondragover="onKanbanColDragOver(event)"
      ondrop="onKanbanColDrop(event,'${esc(col.key)}')"
      ondragleave="onKanbanColDragLeave(event)">
      <div class="kanban-col-header">
        <span style="${colorStyle}">${esc(col.label)}</span>
        <div class="kanban-col-header-actions">
          <span class="kanban-col-count">${colTasks.length}</span>
          <button class="kanban-col-del" onclick="deleteKanbanCol('${esc(col.key)}')" title="Excluir coluna">×</button>
        </div>
      </div>
      <div class="kanban-cards">${cards}</div>
    </div>`;
  });

  const addPart = st.addingKanbanCol
    ? `<div class="kanban-add-col-form">
        <input class="kanban-add-col-input" id="kanban-col-input" placeholder="Nome da coluna"
          onkeydown="onKanbanColKey(event)" onblur="onKanbanColBlur(this.value)"
          onclick="event.stopPropagation()">
      </div>`
    : `<button class="kanban-add-col-btn" onclick="startAddKanbanCol()">+ Nova coluna</button>`;

  board.innerHTML = cols.join("") + addPart;

  if (st.addingKanbanCol) {
    requestAnimationFrame(() =>
      document.getElementById("kanban-col-input")?.focus(),
    );
  }
}

// Chamado por views.js ao sair da tela do Kanban, pra não deixar o formulário
// de "nova coluna" pendurado aberto na próxima vez que o Kanban for reaberto.
export function resetKanbanUiState() {
  st.addingKanbanCol = false;
}

export async function openFileFromKanban(id) {
  await _openFile?.(id);
}

// ── Mover status via drag & drop ───────────────────────────────────────────────
export async function moveTaskStatus(id, status) {
  try {
    const r = await apiFetch(`/files/${id}`, {
      method: "PUT",
      body: JSON.stringify({ status }),
    });
    const updated = await r.json();
    const idx = st.files.findIndex((f) => f.id === id);
    if (idx !== -1) st.files[idx] = { ...updated };
    if (st.activeId === id) {
      st.activeStatus = updated.status || "";
      updateStatusSelect();
      const sel = document.getElementById("status-select");
      if (sel) sel.value = updated.status || "";
      updateRetroStatusLabel();
      
      // Sincroniza inputs de data do editor ativo se a tarefa estiver aberta
      const datePlanEl = document.getElementById("date-planning");
      if (datePlanEl) datePlanEl.value = updated.date_planning || "";
      const dateExecEl = document.getElementById("date-execution");
      if (dateExecEl) dateExecEl.value = updated.date_execution || "";
      const dateConclEl = document.getElementById("date-conclusion");
      if (dateConclEl) dateConclEl.value = updated.date_conclusion || "";
      updateTaskDuration();
    }
    renderKanban();
    refreshListIfActive();
  } catch (e) {
    toast("Erro ao mover task: " + e.message, "error");
  }
}

// ── Drag & drop dos cards ──────────────────────────────────────────────────────
let _kanbanDraggingId = null;

export function onKanbanCardDragStart(e, id) {
  _kanbanDraggingId = id;
  e.dataTransfer.effectAllowed = "move";
  e.currentTarget.classList.add("dragging");
}

export function onKanbanColDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
  e.currentTarget.classList.add("drag-over");
}

export function onKanbanColDragLeave(e) {
  if (!e.currentTarget.contains(e.relatedTarget)) {
    e.currentTarget.classList.remove("drag-over");
  }
}

export function onKanbanColDrop(e, status) {
  e.preventDefault();
  e.currentTarget.classList.remove("drag-over");
  const id = _kanbanDraggingId;
  _kanbanDraggingId = null;
  if (id) moveTaskStatus(id, status);
}

// ── Gerenciar colunas ──────────────────────────────────────────────────────────
export function startAddKanbanCol() {
  st.addingKanbanCol = true;
  renderKanban();
}

export function onKanbanColKey(e) {
  if (e.key === "Enter") {
    e.preventDefault();
    confirmAddKanbanCol(e.target.value);
  } else if (e.key === "Escape") {
    e.preventDefault();
    cancelAddKanbanCol();
  }
}

export function onKanbanColBlur(value) {
  if (st.addingKanbanCol) confirmAddKanbanCol(value);
}

export function confirmAddKanbanCol(name) {
  st.addingKanbanCol = false;
  const label = name.trim();
  if (label) {
    const usedColors = st.kanbanColumns.map((c) => c.color);
    const color =
      KANBAN_PALETTE.find((c) => !usedColors.includes(c)) || KANBAN_PALETTE[0];
    const key = label
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    if (!st.kanbanColumns.find((c) => c.key === key)) {
      st.kanbanColumns.push({ key, label, color });
      saveKanbanColumns();
      updateStatusSelect();
    }
  }
  renderKanban();
}

export function cancelAddKanbanCol() {
  st.addingKanbanCol = false;
  renderKanban();
}

export async function deleteKanbanCol(key) {
  const col = st.kanbanColumns.find((c) => c.key === key);
  if (!col) return;
  const affected = st.files.filter(
    (f) => f.type === "task" && (f.status || "") === key,
  );
  if (affected.length) {
    const confirmed = window.confirm(
      `A coluna "${col.label}" tem ${affected.length} task(s).\nExcluir moverá todas para Backlog.`,
    );
    if (!confirmed) return;
    await Promise.all(affected.map((f) => moveTaskStatus(f.id, "")));
  }
  st.kanbanColumns = st.kanbanColumns.filter((c) => c.key !== key);
  saveKanbanColumns();
  updateStatusSelect();
  renderKanban();
}

// ── Quick-edit modal ───────────────────────────────────────────────────────────
let _kqedit = { id: null, content: null, saving: false };

function _rerenderQEditModal() {
  const el = document.getElementById("kanban-qedit-body");
  if (!el) return;
  renderMarkdown(_kqedit.content, el, {
    onCheckboxChange: (idx) => toggleKanbanQEditItem(idx),
    enableCapture: false,
  });
}

export async function openKanbanQEdit(id) {
  const file = st.files.find((f) => f.id === id);
  if (!file) return;
  _kqedit = { id, content: null, saving: false };
  document.getElementById("kanban-qedit-title").textContent =
    file.title || "Sem título";
  document.getElementById("kanban-qedit-body").innerHTML =
    '<p class="kanban-qedit-empty">Carregando...</p>';
  document.getElementById("kanban-qedit-overlay").classList.add("open");

  try {
    const r = await apiFetch(`/files/${id}`);
    const data = await r.json();
    _kqedit.content = data.content;
    _rerenderQEditModal();
  } catch (e) {
    document.getElementById("kanban-qedit-body").innerHTML =
      `<p class="kanban-qedit-empty">Erro ao carregar: ${esc(e.message)}</p>`;
  }
}

export async function toggleKanbanQEditItem(index) {
  if (_kqedit.saving) return;
  _kqedit.content = toggleCheckboxAt(_kqedit.content, index);
  _rerenderQEditModal();

  _kqedit.saving = true;
  try {
    const r = await apiFetch(`/files/${_kqedit.id}`, {
      method: "PUT",
      body: JSON.stringify({ content: _kqedit.content }),
    });
    const updated = await r.json();
    const idx = st.files.findIndex((f) => f.id === _kqedit.id);
    if (idx !== -1) {
      st.files[idx] = {
        ...st.files[idx],
        task_done: updated.task_done,
        task_total: updated.task_total,
        task_items: updated.task_items || [],
      };
    }
    renderKanban();
  } catch (e) {
    toast("Erro ao salvar: " + e.message, "error");
  } finally {
    _kqedit.saving = false;
  }
}

export function onKanbanQEditOverlayClick(e) {
  if (e.target === document.getElementById("kanban-qedit-overlay")) {
    closeKanbanQEdit();
  }
}

export function closeKanbanQEdit() {
  document.getElementById("kanban-qedit-overlay").classList.remove("open");
  _kqedit = { id: null, content: null, saving: false };
}

export async function openEditorFromKanbanQEdit() {
  const id = _kqedit.id;
  closeKanbanQEdit();
  await openFileFromKanban(id);
}

// ── Expor ao DOM (necessário para event handlers inline) ──────────────────────
Object.assign(window, {
  openFileFromKanban,
  moveTaskStatus,
  toggleKanbanCardExpand,
  onKanbanCardDragStart,
  onKanbanColDragOver,
  onKanbanColDragLeave,
  onKanbanColDrop,
  startAddKanbanCol,
  onKanbanColKey,
  onKanbanColBlur,
  confirmAddKanbanCol,
  cancelAddKanbanCol,
  deleteKanbanCol,
  openKanbanQEdit,
  closeKanbanQEdit,
  onKanbanQEditOverlayClick,
  toggleKanbanQEditItem,
  openEditorFromKanbanQEdit,
  archiveTaskFromKanban,
});
