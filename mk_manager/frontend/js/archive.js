// Responsabilidade: tela Arquivo (notas/tasks arquivadas — restaurar ou excluir
// definitivamente). Arquivadas ficam fora de st.files, então essa tela busca
// sua própria lista sob demanda em /files/archived.

import { st } from "./state.js";
import { esc, toast, timeAgo } from "./utils.js";
import { apiFetch } from "./api.js";
import { unarchiveFile } from "./files.js";

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
      return `<div class="archive-row" data-id="${f.id}">
        <span class="type-badge ${f.type}">${f.type === "task" ? "Task" : "Note"}</span>
        <span class="archive-row-title">${esc(f.title || "Sem título")}</span>
        ${tags}
        <span class="archive-row-date" title="${esc(f.modified)}">${timeAgo(f.modified)}</span>
        <button class="btn btn-ghost btn-sm" onclick="restoreArchivedFile('${f.id}')">Restaurar</button>
        <button class="icon-btn del" title="Excluir definitivamente"
          onclick="openDeleteModal('${f.id}','${esc(f.title || "Sem título")}','${esc(f.filename)}')">✕</button>
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

// ── Expor ao DOM (necessário para event handlers inline) ──────────────────────
Object.assign(window, { restoreArchivedFile });
