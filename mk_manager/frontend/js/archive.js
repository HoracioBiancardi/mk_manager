// Responsabilidade: tela Arquivo (notas/tasks arquivadas — restaurar ou excluir
// definitivamente). Arquivadas ficam fora de st.files, então essa tela busca
// sua própria lista sob demanda em /files/archived.

import { st } from "./state.js";
import { esc, toast, timeAgo } from "./utils.js";
import { apiFetch } from "./api.js";
import { unarchiveFile } from "./files.js";
import { renderMarkdown } from "./preview.js";
import { openDeleteModal } from "./delete-modal.js";

let _archivedFiles = [];

export async function renderArchivePane() {
  const container = document.getElementById("archive-list-container");
  if (!container) return;
  container.innerHTML = '<div class="list-empty">Carregando…</div>';
  try {
    const r = await apiFetch("/files/archived");
    _archivedFiles = await r.json();
    drawArchiveList();
  } catch (e) {
    container.innerHTML = `<div class="list-empty">Erro ao carregar arquivadas: ${esc(e.message)}</div>`;
    toast("Erro ao carregar arquivadas: " + e.message, "error");
  }
}

function drawArchiveList() {
  const container = document.getElementById("archive-list-container");
  if (!container) return;
  if (!_archivedFiles.length) {
    container.innerHTML = '<div class="list-empty">Nenhum item arquivado.</div>';
    return;
  }

  container.innerHTML = _archivedFiles
    .map((f) => {
      const tags = f.tags?.length
        ? `<div class="list-tags">${f.tags
            .slice(0, 3)
            .map((t) => `<span class="kanban-tag">${esc(t)}</span>`)
            .join("")}</div>`
        : "";
      const progress = f.type === "task" && f.task_total > 0
        ? `<span class="tree-progress" title="Progresso da task: ${f.task_done} concluídas de ${f.task_total}">[${f.task_done}/${f.task_total}]</span>`
        : "";
      const origin = f.archived_from
        ? `<span class="archive-row-origin" title="Pasta original">📁 ${esc(f.archived_from)}</span>`
        : `<span class="archive-row-origin" title="Pasta original">📁 Raiz</span>`;
      return `<div class="archive-row" data-id="${f.id}" onclick="openArchiveDetail('${f.id}')">
        <span class="type-badge ${f.type}">${f.type === "task" ? "Task" : "Note"}</span>
        <span class="archive-row-title">${esc(f.title || "Sem título")}</span>
        ${progress}
        ${origin}
        <span class="archive-row-words">${f.word_count} palavra${f.word_count === 1 ? "" : "s"}</span>
        ${tags}
        <span class="archive-row-date" title="${esc(f.modified)}">${timeAgo(f.modified)}</span>
        <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation(); restoreArchivedFile('${f.id}')">Restaurar</button>
        <button class="icon-btn del" title="Excluir definitivamente"
          onclick="event.stopPropagation(); openDeleteModal('${f.id}','${esc(f.title || "Sem título")}','${esc(f.filename)}')">✕</button>
      </div>`;
    })
    .join("");
}

export async function restoreArchivedFile(id) {
  await unarchiveFile(id);
  await renderArchivePane();
}

export function refreshArchiveIfActive() {
  if (st.mainView !== "archive") return;
  renderArchivePane();
}

// ── Modal de detalhes de um item arquivado (somente leitura) ──────────────────
let _detailId = null;
let _detailMeta = null;

export async function openArchiveDetail(id) {
  const meta = _archivedFiles.find((f) => f.id === id);
  if (!meta) return;
  _detailId = id;
  _detailMeta = meta;

  document.getElementById("archive-detail-title").textContent = meta.title || "Sem título";
  document.getElementById("archive-detail-meta").innerHTML = buildDetailMetaHtml(meta);
  document.getElementById("archive-detail-body").innerHTML = '<p class="kanban-qedit-empty">Carregando…</p>';
  document.getElementById("archive-detail-overlay").classList.add("open");

  try {
    const r = await apiFetch(`/files/${id}`);
    const data = await r.json();
    renderMarkdown(data.content, document.getElementById("archive-detail-body"), { enableCapture: false });
  } catch (e) {
    document.getElementById("archive-detail-body").innerHTML =
      `<p class="kanban-qedit-empty">Erro ao carregar: ${esc(e.message)}</p>`;
  }
}

function buildDetailMetaHtml(f) {
  const tags = f.tags?.length
    ? f.tags.map((t) => `<span class="kanban-tag">${esc(t)}</span>`).join("")
    : "<span class=\"archive-detail-meta-empty\">Sem tags</span>";
  const progress = f.type === "task" && f.task_total > 0
    ? `<span class="tree-progress">[${f.task_done}/${f.task_total}]</span>`
    : "";
  return `
    <div class="archive-detail-meta-row">
      <span class="type-badge ${f.type}">${f.type === "task" ? "Task" : "Note"}</span>
      ${progress}
      <span class="archive-row-origin" title="Pasta original">📁 ${esc(f.archived_from || "Raiz")}</span>
      <span class="archive-row-words">${f.word_count} palavra${f.word_count === 1 ? "" : "s"}</span>
      <span class="archive-row-date">Arquivado ${timeAgo(f.modified)}</span>
    </div>
    <div class="archive-detail-meta-row">${tags}</div>
  `;
}

export function onArchiveDetailOverlayClick(e) {
  if (e.target === document.getElementById("archive-detail-overlay")) closeArchiveDetail();
}

export function closeArchiveDetail() {
  document.getElementById("archive-detail-overlay").classList.remove("open");
  _detailId = null;
  _detailMeta = null;
}

export async function restoreFromArchiveDetail() {
  if (!_detailId) return;
  const id = _detailId;
  closeArchiveDetail();
  await restoreArchivedFile(id);
}

export function deleteFromArchiveDetail() {
  if (!_detailId || !_detailMeta) return;
  const { id, title, filename } = _detailMeta;
  closeArchiveDetail();
  openDeleteModal(id, title || "Sem título", filename);
}

// ── Expor ao DOM (necessário para event handlers inline) ──────────────────────
Object.assign(window, {
  restoreArchivedFile,
  openArchiveDetail,
  closeArchiveDetail,
  onArchiveDetailOverlayClick,
  restoreFromArchiveDetail,
  deleteFromArchiveDetail,
});
