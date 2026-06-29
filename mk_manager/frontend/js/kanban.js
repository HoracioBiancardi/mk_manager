// Responsabilidade: board Kanban (colunas, cards, drag & drop, quick-edit modal)

import { st } from "./state.js";
import { esc, toast } from "./utils.js";
import { apiFetch } from "./api.js";
import { setView } from "./editor.js";

// ── Callbacks injetados por app.js para evitar dependência circular ────────────
let _openFile = null;
let _hideFileTooltip = null;

export function initKanban({ openFile, hideFileTooltip }) {
  _openFile = openFile;
  _hideFileTooltip = hideFileTooltip;
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
      .map((f) => {
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
        const previewItems = items.slice(0, 3);
        const taskPreview = previewItems.length
          ? `<div class="kanban-card-tasks">${previewItems
              .map(
                (it) =>
                  `<div class="kanban-card-task-item${it.done ? " done" : ""}">
                  <span class="kanban-card-task-icon">${it.done ? "✓" : "○"}</span>
                  <span>${esc(it.text)}</span>
                </div>`,
              )
              .join("")}${items.length > 3 ? `<div class="kanban-card-task-more">+${items.length - 3} mais...</div>` : ""}</div>`
          : "";
        return `<div class="kanban-card" data-id="${f.id}"
        draggable="true"
        onclick="openKanbanQEdit('${f.id}')"
        ondragstart="onKanbanCardDragStart(event,'${f.id}')">
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

// ── Entrada/saída do modo Kanban ───────────────────────────────────────────────
export function enterKanbanMode() {
  if (st.kanbanMode) return;
  st.kanbanMode = true;
  _hideFileTooltip?.();
  document.getElementById("empty-panel").style.display = "none";
  document.getElementById("editor-area").style.display = "none";
  document.getElementById("kanban-pane").style.display = "flex";
  renderKanban();
}

export function exitKanbanMode() {
  if (!st.kanbanMode) return;
  st.kanbanMode = false;
  st.addingKanbanCol = false;
  document.getElementById("kanban-pane").style.display = "none";
  if (st.activeId) {
    document.getElementById("empty-panel").style.display = "none";
    document.getElementById("editor-area").style.display = "flex";
    setView(st.view);
  } else {
    document.getElementById("empty-panel").style.display = "flex";
  }
}

export async function openFileFromKanban(id) {
  exitKanbanMode();
  document
    .querySelectorAll(".activity-btn")
    .forEach((b) =>
      b.classList.toggle("active", b.dataset.panel === st.activePanel),
    );
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
    }
    renderKanban();
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
    _renderQEditItems();
  } catch (e) {
    document.getElementById("kanban-qedit-body").innerHTML =
      `<p class="kanban-qedit-empty">Erro ao carregar: ${esc(e.message)}</p>`;
  }
}

function _renderQEditItems() {
  const items = _parseTaskItems(_kqedit.content);
  const body = document.getElementById("kanban-qedit-body");
  if (!items.length) {
    body.innerHTML =
      '<p class="kanban-qedit-empty">Nenhuma tarefa encontrada.</p>';
    return;
  }
  body.innerHTML = items
    .map((item, i) => {
      const indentClass =
        item.indent >= 4 ? " indent-2" : item.indent >= 2 ? " indent-1" : "";
      return `<div class="kanban-qedit-item${item.done ? " done" : ""}${indentClass}" onclick="toggleKanbanQEditItem(${i})">
        <input type="checkbox" id="kqitem-${i}" ${item.done ? "checked" : ""}
          onclick="event.stopPropagation();toggleKanbanQEditItem(${i})">
        <label for="kqitem-${i}" onclick="event.preventDefault()">${esc(item.text)}</label>
      </div>`;
    })
    .join("");
}

function _parseTaskItems(content) {
  const items = [];
  for (const m of (content || "").matchAll(/^(\s*)- \[([ x])\] (.+)/gm)) {
    items.push({ text: m[3], done: m[2] === "x", indent: m[1].length });
  }
  return items;
}

export async function toggleKanbanQEditItem(index) {
  if (_kqedit.saving) return;
  const lines = (_kqedit.content || "").split("\n");
  let taskIdx = 0;
  const newLines = lines.map((line) => {
    const m = line.match(/^(\s*)- \[([ x])\] (.+)/);
    if (m) {
      if (taskIdx === index) {
        const nowDone = m[2] !== "x";
        taskIdx++;
        return `${m[1]}- [${nowDone ? "x" : " "}] ${m[3]}`;
      }
      taskIdx++;
    }
    return line;
  });
  _kqedit.content = newLines.join("\n");
  _renderQEditItems();

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
