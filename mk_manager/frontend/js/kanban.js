// Responsabilidade: board Kanban (colunas, cards, drag & drop, quick-edit modal)

import { st } from "./state.js";
import { esc, toast, confirmDialog, dueInfo } from "./utils.js";
import { apiFetch } from "./api.js";
import { renderMarkdown, toggleCheckboxAt, findAutoCompleteParents } from "./preview.js";
import { updateRetroStatusLabel } from "./editor.js";
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
  _archiveFile?.(id); // sem confirmação: o toast oferece "Desfazer"
}

// ── Configuração de colunas ────────────────────────────────────────────────────
const KANBAN_DEFAULT_COLS = [
  { key: "", label: "Backlog", color: "" },
  { key: "planning", label: "Planejado", color: "#60a5fa" },
  { key: "development", label: "Em dev", color: "#f59e0b" },
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

// As colunas valem para todos (ficam no servidor, GET/PUT /api/kanban/columns). O
// localStorage é só cache para o board aparecer já no boot, antes da resposta.
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

// Depois do login: adota as colunas do servidor. Se ninguém salvou ainda, as deste
// navegador (as que a pessoa já usava) viram as de todos.
export async function syncKanbanColumnsFromServer() {
  try {
    const { columns } = await (await apiFetch("/kanban/columns")).json();
    if (Array.isArray(columns) && columns.length) {
      st.kanbanColumns = columns;
      _cacheKanbanColumns();
      updateStatusSelect();
      if (st.mainView === "kanban") renderKanban();
      refreshListIfActive();
    } else {
      await _putKanbanColumns();
    }
  } catch {}
}

function _cacheKanbanColumns() {
  try {
    localStorage.setItem("mk-kanban-cols", JSON.stringify(st.kanbanColumns));
  } catch {}
}

async function _putKanbanColumns() {
  await apiFetch("/kanban/columns", {
    method: "PUT",
    body: JSON.stringify({ columns: st.kanbanColumns }),
  });
}

function saveKanbanColumns() {
  _cacheKanbanColumns();
  _putKanbanColumns().catch((e) => toast("Erro ao salvar as colunas: " + e.message, "error"));
}

export function statusLabel(key) {
  return st.kanbanColumns?.find((c) => c.key === (key || ""))?.label || key || "";
}

export function isKnownStatus(key) {
  return !!st.kanbanColumns?.some((c) => c.key === (key || ""));
}

// Status que não tem coluna (coluna apagada, outro usuário, frontmatter à mão) entra
// como opção própria: sem ela o select caía em "—" e o próximo salvamento apagava o status.
export function updateStatusSelect() {
  const sel = document.getElementById("status-select");
  if (!sel || !st.kanbanColumns) return;
  const cur = sel.value;
  const extra = st.activeStatus && !isKnownStatus(st.activeStatus)
    ? `<option value="${esc(st.activeStatus)}">${esc(st.activeStatus)} (sem coluna)</option>`
    : "";
  sel.innerHTML =
    '<option value="">Backlog</option>' +
    st.kanbanColumns
      .filter((c) => c.key)
      .map((c) => `<option value="${esc(c.key)}">${esc(c.label)}</option>`)
      .join("") +
    extra;
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

// ── Ordem dos cards ───────────────────────────────────────────────────────────
// Cada task guarda `kanban_order` no frontmatter (menor = mais acima). Cards que
// nunca foram arrastados não têm ordem e ficam depois dos ordenados, por título.
const ORDER_STEP = 1000;

function hasOrder(f) {
  return typeof f.kanban_order === "number" && Number.isFinite(f.kanban_order);
}

function compareKanbanCards(a, b) {
  const ao = hasOrder(a), bo = hasOrder(b);
  if (ao && bo && a.kanban_order !== b.kanban_order) return a.kanban_order - b.kanban_order;
  if (ao !== bo) return ao ? -1 : 1;
  return (a.title || "").localeCompare(b.title || "", "pt-BR", { sensitivity: "base" });
}

// Calcula as mudanças de ordem para soltar `id` na coluna `status`, na posição
// `index` (contada sem o próprio card). Devolve [{id, kanban_order}]: só o card
// arrastado quando cabe entre os vizinhos; a coluna inteira renumerada quando o
// vizinho de cima não tem ordem ou o intervalo entre eles se esgotou.
export function planKanbanReorder(files, id, status, index) {
  const col = files
    .filter((f) => f.type === "task" && f.id !== id && (f.status || "") === status)
    .sort(compareKanbanCards);
  const i = Math.max(0, Math.min(index, col.length));
  const prev = col[i - 1];
  const next = col[i];

  if (!prev || hasOrder(prev)) {
    const lo = prev ? prev.kanban_order : null;
    const hi = next && hasOrder(next) ? next.kanban_order : null;
    let order;
    if (lo === null && hi === null) order = ORDER_STEP;
    else if (lo === null) order = hi - ORDER_STEP;
    else if (hi === null) order = lo + ORDER_STEP;
    else order = (lo + hi) / 2;
    const fits = (lo === null || order > lo) && (hi === null || order < hi);
    if (fits) return [{ id, kanban_order: order }];
  }

  const ids = col.map((f) => f.id);
  ids.splice(i, 0, id);
  return ids
    .map((cid, n) => ({ id: cid, kanban_order: (n + 1) * ORDER_STEP }))
    .filter((c) => c.id === id || files.find((f) => f.id === c.id)?.kanban_order !== c.kanban_order);
}

// ── Renderização do board ──────────────────────────────────────────────────────
function renderKanbanCard(f, i, orphan = false) {
  const pct = f.task_total ? Math.round((f.task_done / f.task_total) * 100) : -1;
  const progress =
    pct >= 0
      ? `<div class="kanban-card-progress"><div class="kanban-progress"><div class="kanban-progress-bar" style="width:${pct}%"></div></div>
         <span class="kanban-progress-label">${f.task_done}/${f.task_total}</span></div>`
      : "";
  const tags = f.tags?.length
    ? `<div class="kanban-card-tags">${f.tags
        .slice(0, 3)
        .map((t) => `<span class="kanban-tag">${esc(t)}</span>`)
        .join("")}</div>`
    : "";
  const due = dueInfo(f.due_date, f.status === "done");
  const dueChip = due
    ? `<span class="due-chip ${due.tone}" title="Prazo: ${esc(due.full)}"><span class="ms" aria-hidden="true">event</span>${esc(due.label)}</span>`
    : "";
  const orphanChip = orphan
    ? `<span class="status-orphan-chip" title="Status sem coluna no Kanban">${esc(f.status)}</span>`
    : "";
  const meta = dueChip || orphanChip ? `<div class="kanban-card-meta">${orphanChip}${dueChip}</div>` : "";
  const items = f.task_items || [];
  const PREVIEW_LIMIT = 3;
  const isExpanded = _expandedCards.has(f.id);
  const visibleItems = isExpanded ? items : items.slice(0, PREVIEW_LIMIT);
  const hasMore = items.length > PREVIEW_LIMIT;
  const taskPreview = visibleItems.length
    ? `<div class="kanban-card-tasks">${visibleItems
        .map((it) => {
          const level = Math.min(Math.floor((it.indent || 0) / 2), 3);
          const icon = it.done ? "check_box" : "check_box_outline_blank";
          return `<div class="kanban-card-task-item${it.done ? " done" : ""}" style="padding-left:${level * 12}px">
            <span class="kanban-card-task-icon ms" aria-hidden="true">${icon}</span>
            <span>${esc(it.text)}</span>
          </div>`;
        })
        .join("")}${
        hasMore
          ? `<button class="kanban-card-expand-btn" onclick="toggleKanbanCardExpand('${f.id}',event)">${isExpanded ? "Mostrar menos" : `+${items.length - PREVIEW_LIMIT} itens`}</button>`
          : ""
      }</div>`
    : "";
  return `<div class="kanban-card${due?.tone === "overdue" ? " is-overdue" : ""}" data-id="${f.id}"
    style="animation-delay:${Math.min(i * 25, 250)}ms"
    draggable="true"
    onclick="onKanbanCardClick('${f.id}')"
    ondblclick="openKanbanCardEditor(event,'${f.id}')"
    ondragstart="onKanbanCardDragStart(event,'${f.id}')"
    ondragend="onKanbanCardDragEnd(event)"
    title="Clique: edição rápida · Duplo-clique: abrir no editor">
    <button class="kanban-card-archive-btn" title="Arquivar" aria-label="Arquivar" onclick="archiveTaskFromKanban(event,'${f.id}')"><span class="ms" aria-hidden="true">inventory_2</span></button>
    <div class="kanban-card-title">${esc(f.title || "Sem título")}</div>
    ${meta}${taskPreview}${progress}${tags}
  </div>`;
}

export function renderKanban() {
  const board = document.getElementById("kanban-board");
  if (!board) return;
  const tasks = st.files.filter((f) => f.type === "task").sort(compareKanbanCards);

  const cols = st.kanbanColumns.map((col) => {
    const colTasks = tasks.filter((f) => (f.status || "") === col.key);
    const cards = colTasks.map((f, i) => renderKanbanCard(f, i)).join("");
    const dot = `<span class="kanban-col-dot" style="${col.color ? `background:${col.color}` : ""}"></span>`;
    return `<div class="kanban-col" data-status="${esc(col.key)}"
      ondragover="onKanbanColDragOver(event)"
      ondrop="onKanbanColDrop(event,'${esc(col.key)}')"
      ondragleave="onKanbanColDragLeave(event)">
      <div class="kanban-col-header">
        <span class="kanban-col-title">${dot}${esc(col.label)}</span>
        <div class="kanban-col-header-actions">
          <span class="kanban-col-count">${colTasks.length}</span>
          ${col.key ? `<button class="kanban-col-del" onclick="deleteKanbanCol('${esc(col.key)}')" title="Excluir coluna" aria-label="Excluir coluna ${esc(col.label)}"><span class="ms" aria-hidden="true">close</span></button>` : ""}
        </div>
      </div>
      <div class="kanban-cards">${cards || '<div class="kanban-col-empty">Arraste uma task para cá</div>'}</div>
    </div>`;
  });

  // Tasks com status sem coluna: antes sumiam do board sem aviso.
  const orphans = tasks.filter((f) => !isKnownStatus(f.status));
  if (orphans.length) {
    cols.push(`<div class="kanban-col kanban-col-orphan" data-status="__orphan__">
      <div class="kanban-col-header">
        <span class="kanban-col-title"><span class="ms" aria-hidden="true">help</span>Sem coluna</span>
        <div class="kanban-col-header-actions">
          <span class="kanban-col-count">${orphans.length}</span>
        </div>
      </div>
      <p class="kanban-orphan-hint">O status destas tasks não tem coluna. Arraste para uma coluna ou
        <button class="link-btn" type="button" onclick="createColumnsForOrphans()">crie as colunas que faltam</button>.</p>
      <div class="kanban-cards">${orphans.map((f, i) => renderKanbanCard(f, i, true)).join("")}</div>
    </div>`);
  }

  const addPart = st.addingKanbanCol
    ? `<div class="kanban-add-col-form">
        <input class="kanban-add-col-input" id="kanban-col-input" placeholder="Nome da coluna"
          onkeydown="onKanbanColKey(event)" onblur="onKanbanColBlur(this.value)"
          onclick="event.stopPropagation()">
      </div>`
    : `<button class="kanban-add-col-btn" onclick="startAddKanbanCol()" title="Nova coluna" aria-label="Nova coluna"><span class="ms" aria-hidden="true">add</span></button>`;

  board.innerHTML = cols.join("") + addPart;

  if (st.addingKanbanCol) {
    requestAnimationFrame(() =>
      document.getElementById("kanban-col-input")?.focus(),
    );
  }
}

export function createColumnsForOrphans() {
  const keys = [...new Set(
    st.files.filter((f) => f.type === "task" && !isKnownStatus(f.status)).map((f) => f.status),
  )];
  for (const key of keys) {
    const usedColors = st.kanbanColumns.map((c) => c.color);
    const color = KANBAN_PALETTE.find((c) => !usedColors.includes(c)) || KANBAN_PALETTE[0];
    const label = (key.charAt(0).toUpperCase() + key.slice(1).replace(/-/g, " ")).slice(0, 40);
    st.kanbanColumns.push({ key, label, color });
  }
  saveKanbanColumns();
  updateStatusSelect();
  renderKanban();
  refreshListIfActive();
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
export async function moveTaskStatus(id, status, extra = {}) {
  try {
    await _putKanbanCard(id, { status, ...extra });
    renderKanban();
    refreshListIfActive();
  } catch (e) {
    toast("Erro ao mover task: " + e.message, "error");
  }
}

async function _putKanbanCard(id, body) {
  const r = await apiFetch(`/files/${id}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
  const updated = await r.json();
  const idx = st.files.findIndex((f) => f.id === id);
  if (idx !== -1) st.files[idx] = { ...updated };
  if (st.activeId === id) st.activeModified = updated.modified || null; // mudança desta aba: não é conflito
  if (body.status !== undefined && st.activeId === id) {
    st.activeStatus = updated.status || "";
    updateStatusSelect();
    const sel = document.getElementById("status-select");
    if (sel) sel.value = updated.status || "";
    updateRetroStatusLabel();

    // Sincroniza o input de data do editor ativo se a tarefa estiver aberta
    const statusChangedEl = document.getElementById("status-changed-at");
    if (statusChangedEl) statusChangedEl.value = updated.status_changed_at || "";
  }
}

// Solta o card na coluna `status`, na posição `index`: muda o status (se mudou)
// e grava a nova ordem — do card e, se preciso, dos vizinhos renumerados.
async function dropKanbanCard(id, status, index) {
  const card = st.files.find((f) => f.id === id);
  if (!card) return;
  const oldStatus = card.status || "";
  const statusChanged = oldStatus !== status;
  if (!statusChanged) {
    const current = st.files
      .filter((f) => f.type === "task" && (f.status || "") === status)
      .sort(compareKanbanCards)
      .findIndex((f) => f.id === id);
    if (current === index) return;
  }
  const plan = planKanbanReorder(st.files, id, status, index);

  // Mostra a nova posição na hora; o servidor confirma em seguida.
  const before = new Map(plan.map((c) => [c.id, st.files.find((f) => f.id === c.id)?.kanban_order]));
  for (const c of plan) {
    const f = st.files.find((x) => x.id === c.id);
    if (f) f.kanban_order = c.kanban_order;
  }
  card.status = status;
  renderKanban();

  const results = await Promise.allSettled(
    plan.map((c) =>
      _putKanbanCard(
        c.id,
        c.id === id && statusChanged
          ? { status, kanban_order: c.kanban_order }
          : { kanban_order: c.kanban_order },
      ),
    ),
  );
  const failed = results.findIndex((r) => r.status === "rejected");
  if (failed !== -1) {
    results.forEach((r, n) => {
      if (r.status !== "rejected") return;
      const f = st.files.find((x) => x.id === plan[n].id);
      if (!f) return;
      f.kanban_order = before.get(f.id);
      if (f.id === id) f.status = oldStatus;
    });
    renderKanban();
    toast("Erro ao mover task: " + results[failed].reason.message, "error");
  }
  if (statusChanged) refreshListIfActive();
}

// ── Drag & drop dos cards ──────────────────────────────────────────────────────
let _kanbanDraggingId = null;

let _dropIndicator = null;

export function onKanbanCardDragStart(e, id) {
  _kanbanDraggingId = id;
  e.dataTransfer.effectAllowed = "move";
  e.currentTarget.classList.add("dragging");
}

export function onKanbanCardDragEnd(e) {
  e.currentTarget.classList.remove("dragging");
  _removeDropIndicator();
  document
    .querySelectorAll(".kanban-col.drag-over")
    .forEach((c) => c.classList.remove("drag-over"));
}

// Posição de inserção = quantos cards (fora o arrastado) têm o meio acima do mouse.
function _dropTarget(colEl, clientY) {
  const cards = [...colEl.querySelectorAll(".kanban-card:not(.dragging)")];
  const index = cards.findIndex((c) => {
    const r = c.getBoundingClientRect();
    return clientY < r.top + r.height / 2;
  });
  return index === -1 ? { index: cards.length, before: null } : { index, before: cards[index] };
}

function _removeDropIndicator() {
  _dropIndicator?.remove();
  _dropIndicator = null;
}

export function onKanbanColDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
  const col = e.currentTarget;
  col.classList.add("drag-over");
  const list = col.querySelector(".kanban-cards");
  if (!list || !_kanbanDraggingId) return;
  if (!_dropIndicator) {
    _dropIndicator = document.createElement("div");
    _dropIndicator.className = "kanban-drop-indicator";
  }
  const { before } = _dropTarget(col, e.clientY);
  if (before) {
    if (_dropIndicator.nextSibling !== before) list.insertBefore(_dropIndicator, before);
  } else if (list.lastChild !== _dropIndicator) {
    list.appendChild(_dropIndicator);
  }
}

export function onKanbanColDragLeave(e) {
  if (!e.currentTarget.contains(e.relatedTarget)) {
    e.currentTarget.classList.remove("drag-over");
    if (_dropIndicator && e.currentTarget.contains(_dropIndicator)) _removeDropIndicator();
  }
}

export function onKanbanColDrop(e, status) {
  e.preventDefault();
  e.currentTarget.classList.remove("drag-over");
  const id = _kanbanDraggingId;
  _kanbanDraggingId = null;
  const { index } = _dropTarget(e.currentTarget, e.clientY);
  _removeDropIndicator();
  if (id) dropKanbanCard(id, status, index);
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
      .replace(/^-|-$/g, "")
      .slice(0, 40);
    if (key && !st.kanbanColumns.find((c) => c.key === key)) {
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
    const confirmed = await confirmDialog(
      `Excluir a coluna "${col.label}"?`,
      `Ela tem ${affected.length} task(s), que vão para o Backlog.`,
      { confirmLabel: "Excluir coluna", danger: true },
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

// Clique único abre a edição rápida, mas com um pequeno atraso: a edição
// rápida abre um overlay síncrono que cobriria o card antes do segundo clique
// do duplo-clique chegar até ele, então adiamos a ação de clique único pra dar
// tempo do ondblclick (que cancela esse timer) decidir primeiro.
let _cardClickTimer = null;
const CARD_CLICK_DELAY = 220;

export function onKanbanCardClick(id) {
  clearTimeout(_cardClickTimer);
  _cardClickTimer = setTimeout(() => openKanbanQEdit(id), CARD_CLICK_DELAY);
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
  for (const parentIdx of findAutoCompleteParents(_kqedit.content, index)) {
    _kqedit.content = toggleCheckboxAt(_kqedit.content, parentIdx);
  }
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

// Duplo-clique no card: pula direto pro editor completo, cancelando a
// edição rápida adiada do clique único (e fechando-a, por via das dúvidas).
export async function openKanbanCardEditor(e, id) {
  e.stopPropagation();
  clearTimeout(_cardClickTimer);
  closeKanbanQEdit();
  await openFileFromKanban(id);
}

// ── Expor ao DOM (necessário para event handlers inline) ──────────────────────
Object.assign(window, {
  openFileFromKanban,
  moveTaskStatus,
  toggleKanbanCardExpand,
  onKanbanCardDragStart,
  onKanbanCardDragEnd,
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
  onKanbanCardClick,
  openKanbanCardEditor,
  archiveTaskFromKanban,
  createColumnsForOrphans,
});
