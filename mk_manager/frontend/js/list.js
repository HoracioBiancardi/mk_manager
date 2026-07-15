// Responsabilidade: tela de Lista (tabela densa estilo ClickUp — notas + tasks,
// ordenável e filtrável por tipo/status/tag/pasta/título). Estado próprio do módulo,
// mesmo padrão de graph.js, pra não interferir nos filtros globais de Busca/Tags.

import { st } from "./state.js";
import { esc, toast, timeAgo } from "./utils.js";
import { openFile } from "./files.js";
import { moveTaskStatus } from "./kanban.js";

let _typeFilter = "all"; // all | note | task
let _statusFilter = ""; // "" = todos os status
let _tagFilter = ""; // "" = todas
let _folderFilter = ""; // "" = todas
let _titleQuery = "";
let _sortCol = "modified"; // title | type | status | progress | folder | modified | status_changed_at
let _sortDir = "desc";
let _groupBy = "none"; // none | status | folder | tag | type
const _collapsedGroups = new Set();

const COLUMNS = [
  { key: "title", label: "Título", sortable: true },
  { key: "type", label: "Tipo", sortable: true },
  { key: "status", label: "Status", sortable: true },
  { key: "progress", label: "Progresso", sortable: true },
  { key: "folder", label: "Pasta", sortable: true },
  { key: "tags", label: "Tags", sortable: false },
  { key: "modified", label: "Modificado", sortable: true },
  { key: "status_changed_at", label: "Status alterado em", sortable: true },
];

export function renderList() {
  populateListFilterOptions();
  renderListTable();
}

function populateListFilterOptions() {
  const statusSel = document.getElementById("list-status-filter");
  const tagSel = document.getElementById("list-tag-filter");
  const folderSel = document.getElementById("list-folder-filter");
  if (!statusSel || !tagSel || !folderSel) return;

  const curStatus = statusSel.value;
  statusSel.innerHTML =
    '<option value="">Todos os status</option>' +
    st.kanbanColumns
      .filter((c) => c.key)
      .map((c) => `<option value="${esc(c.key)}">${esc(c.label)}</option>`)
      .join("");
  statusSel.value = st.kanbanColumns.some((c) => c.key === curStatus) ? curStatus : "";
  _statusFilter = statusSel.value;

  const tags = new Set();
  const folders = new Set();
  for (const f of st.files) {
    (f.tags || []).forEach((t) => tags.add(t));
    if (f.folder) folders.add(f.folder);
  }
  const buildOptions = (sel, values, current, allLabel) => {
    const sorted = [...values].sort((a, b) => a.localeCompare(b));
    sel.innerHTML =
      `<option value="">${allLabel}</option>` +
      sorted.map((v) => `<option value="${esc(v)}">${esc(v)}</option>`).join("");
    sel.value = sorted.includes(current) ? current : "";
  };
  buildOptions(tagSel, tags, _tagFilter, "Todas as tags");
  buildOptions(folderSel, folders, _folderFilter, "Todas as pastas");
  _tagFilter = tagSel.value;
  _folderFilter = folderSel.value;
}

// Casamento hierárquico: filtrar por "area" também mostra tag/pasta "area/sub".
function matchesHierarchy(value, filter) {
  return value === filter || value.startsWith(filter + "/");
}

function statusLabelFor(statusKey) {
  return st.kanbanColumns?.find((c) => c.key === (statusKey || ""))?.label || "";
}

function getFilteredSortedFiles() {
  let rows = st.files
    .filter((f) => _typeFilter === "all" || f.type === _typeFilter)
    .filter((f) => !_statusFilter || (f.status || "") === _statusFilter)
    .filter((f) => !_tagFilter || (f.tags || []).some((t) => matchesHierarchy(t, _tagFilter)))
    .filter((f) => !_folderFilter || matchesHierarchy(f.folder || "", _folderFilter))
    .filter((f) => !_titleQuery || (f.title || "").toLowerCase().includes(_titleQuery));

  const dir = _sortDir === "asc" ? 1 : -1;
  const valueFor = (f) => {
    switch (_sortCol) {
      case "title":
        return (f.title || "").toLowerCase();
      case "type":
        return f.type;
      case "status":
        return statusLabelFor(f.status);
      case "progress":
        return f.task_total ? f.task_done / f.task_total : -1;
      case "folder":
        return f.folder || "";
      case "status_changed_at":
        return f.status_changed_at || "";
      case "modified":
      default:
        return f.modified || "";
    }
  };
  rows = rows.slice().sort((a, b) => {
    const va = valueFor(a);
    const vb = valueFor(b);
    if (va < vb) return -1 * dir;
    if (va > vb) return 1 * dir;
    return 0;
  });
  return rows;
}

export function setListSort(col) {
  if (_sortCol === col) _sortDir = _sortDir === "asc" ? "desc" : "asc";
  else {
    _sortCol = col;
    _sortDir = "asc";
  }
  renderListTable();
}

export function setListTypeFilter(f) {
  _typeFilter = f;
  document
    .querySelectorAll("#list-pane .filter-tab")
    .forEach((b) => b.classList.toggle("active", b.dataset.filter === f));
  renderListTable();
}

export function setListStatusFilter(v) {
  _statusFilter = v;
  renderListTable();
}

export function setListTagFilter(v) {
  _tagFilter = v;
  renderListTable();
}

export function setListFolderFilter(v) {
  _folderFilter = v;
  renderListTable();
}

export function onListTitleSearch(v) {
  _titleQuery = v.trim().toLowerCase();
  renderListTable();
}

export function setListGroupBy(v) {
  _groupBy = v;
  renderListTable();
}

export function toggleListGroup(key) {
  if (_collapsedGroups.has(key)) _collapsedGroups.delete(key);
  else _collapsedGroups.add(key);
  renderListTable();
}

// Particiona `rows` (já filtradas/ordenadas) em seções pro modo "Agrupar por".
// Agrupar por tag é multi-valor: um item com várias tags aparece em mais de um
// grupo (mesmo comportamento do ClickUp), por isso não dá pra usar um único
// Map de "id -> grupo" — cada grupo filtra `rows` de novo pelo seu critério.
function groupsFor(rows) {
  if (_groupBy === "status") {
    return st.kanbanColumns
      .map((c) => ({
        key: `status:${c.key}`,
        label: c.label,
        color: c.color,
        files: rows.filter((f) => (f.status || "") === c.key),
      }))
      .filter((g) => g.files.length);
  }
  if (_groupBy === "folder") {
    const folders = new Set(rows.map((f) => f.folder || ""));
    return [...folders]
      .sort((a, b) => a.localeCompare(b))
      .map((folder) => ({
        key: `folder:${folder}`,
        label: folder || "Sem pasta",
        files: rows.filter((f) => (f.folder || "") === folder),
      }));
  }
  if (_groupBy === "tag") {
    const tags = new Set();
    let hasUntagged = false;
    rows.forEach((f) => {
      if (!f.tags?.length) hasUntagged = true;
      (f.tags || []).forEach((t) => tags.add(t));
    });
    const groups = [...tags]
      .sort((a, b) => a.localeCompare(b))
      .map((tag) => ({
        key: `tag:${tag}`,
        label: tag,
        files: rows.filter((f) => (f.tags || []).includes(tag)),
      }));
    if (hasUntagged) {
      groups.push({ key: "tag:__none__", label: "Sem tag", files: rows.filter((f) => !f.tags?.length) });
    }
    return groups;
  }
  if (_groupBy === "type") {
    return [
      { key: "type:note", label: "Notas", files: rows.filter((f) => f.type === "note") },
      { key: "type:task", label: "Tasks", files: rows.filter((f) => f.type === "task") },
    ].filter((g) => g.files.length);
  }
  return null;
}

export function openFileFromList(id) {
  openFile(id);
}

export function onListStatusChange(event, id, status) {
  event.stopPropagation();
  moveTaskStatus(id, status).then(() => renderListTable());
}

function renderListRow(f) {
  const isTask = f.type === "task";
  const pct = isTask && f.task_total ? Math.round((f.task_done / f.task_total) * 100) : -1;
  const progressCell =
    pct >= 0
      ? `<div class="kanban-progress"><div class="kanban-progress-bar" style="width:${pct}%"></div></div>
         <span class="kanban-progress-label">${f.task_done}/${f.task_total}</span>`
      : `<span class="list-dash">—</span>`;

  const statusCell = isTask
    ? `<select class="list-status-select" onclick="event.stopPropagation()"
        onchange="onListStatusChange(event,'${f.id}',this.value)">
        <option value="">—</option>
        ${st.kanbanColumns
          .filter((c) => c.key)
          .map(
            (c) =>
              `<option value="${esc(c.key)}" ${c.key === (f.status || "") ? "selected" : ""}>${esc(c.label)}</option>`,
          )
          .join("")}
      </select>`
    : `<span class="list-dash">—</span>`;

  const tags = f.tags || [];
  const tagsCell = tags.length
    ? `<div class="list-tags">${tags
        .slice(0, 3)
        .map((t) => `<span class="kanban-tag">${esc(t)}</span>`)
        .join("")}${tags.length > 3 ? `<span class="kanban-tag list-tag-more">+${tags.length - 3}</span>` : ""}</div>`
    : "";

  const statusChangedCell = f.status_changed_at
    ? esc(new Date(f.status_changed_at).toLocaleDateString("pt-BR"))
    : `<span class="list-dash">—</span>`;

  return `<tr class="list-row" data-id="${f.id}">
    <td class="list-cell-title" onclick="openFileFromList('${f.id}')">${esc(f.title || "Sem título")}</td>
    <td><span class="type-badge ${f.type}">${f.type === "task" ? "Task" : "Note"}</span></td>
    <td>${statusCell}</td>
    <td>${progressCell}</td>
    <td>${esc(f.folder || "")}</td>
    <td>${tagsCell}</td>
    <td title="${esc(f.modified)}">${timeAgo(f.modified)}</td>
    <td>${statusChangedCell}</td>
  </tr>`;
}

function renderListTable() {
  const container = document.getElementById("list-table-container");
  if (!container) return;
  const rows = getFilteredSortedFiles();

  if (!rows.length) {
    container.innerHTML = '<div class="list-empty">Nenhum item encontrado com esse filtro.</div>';
    return;
  }

  const thead = `<thead><tr>${COLUMNS.map((c) => {
    if (!c.sortable) return `<th>${esc(c.label)}</th>`;
    const active = _sortCol === c.key;
    const arrow = active ? (_sortDir === "asc" ? " ▲" : " ▼") : "";
    return `<th class="sortable${active ? " active" : ""}" onclick="setListSort('${c.key}')">${esc(c.label)}${arrow}</th>`;
  }).join("")}</tr></thead>`;

  const groups = groupsFor(rows);
  const tbody = groups
    ? `<tbody>${groups.map((g) => renderListGroup(g)).join("")}</tbody>`
    : `<tbody>${rows.map((f) => renderListRow(f)).join("")}</tbody>`;
  container.innerHTML = `<table class="list-table">${thead}${tbody}</table>`;
}

function renderListGroup(group) {
  const collapsed = _collapsedGroups.has(group.key);
  const arrow = collapsed ? "▸" : "▾";
  const colorStyle = group.color ? `color:${group.color}` : "";
  const header = `<tr class="list-group-header" onclick="toggleListGroup('${group.key}')">
    <td colspan="${COLUMNS.length}">
      <span class="list-group-arrow">${arrow}</span>
      <span style="${colorStyle}">${esc(group.label)}</span>
      <span class="list-group-count">${group.files.length}</span>
    </td>
  </tr>`;
  const rows = collapsed ? "" : group.files.map((f) => renderListRow(f)).join("");
  return header + rows;
}

export function refreshListIfActive() {
  if (st.mainView !== "list") return;
  populateListFilterOptions();
  renderListTable();
}

// ── Expor ao DOM (necessário para event handlers inline) ──────────────────────
Object.assign(window, {
  setListSort,
  setListTypeFilter,
  setListStatusFilter,
  setListTagFilter,
  setListFolderFilter,
  onListTitleSearch,
  setListGroupBy,
  toggleListGroup,
  openFileFromList,
  onListStatusChange,
});
