// Responsabilidade: bootstrap e inicialização da aplicação
//
// Cada módulo de feature (files, delete-modal, export, assets, search-filter,
// sidebar, editor, preview, kanban) expõe suas próprias funções em `window`
// (necessário para os event handlers inline gerados nos templates). Este
// arquivo só precisa importá-los — mesmo sem usar os exports diretamente,
// o import já roda o `Object.assign(window, ...)` de cada um — e cuidar da
// sequência de inicialização e dos atalhos globais.

import { toast, initBackground } from "./utils.js";
import { initSidebarActions, hideFileTooltip } from "./sidebar.js";
import { setSaveCallback, initResizer } from "./editor.js";
import "./preview.js";
import {
  initKanban,
  loadKanbanColumns,
  updateStatusSelect,
  closeKanbanQEdit,
} from "./kanban.js";
import {
  loadFiles,
  saveFile,
  newFile,
  openFile,
  moveFileToFolder,
  confirmRenameFile,
} from "./files.js";
import { closeDeleteModal } from "./delete-modal.js";
import "./export.js";
import "./assets.js";
import "./search-filter.js";

// ── Conexão ───────────────────────────────────────────────────────────────────
async function checkConn() {
  try {
    await fetch("/api/stats");
    const b = document.getElementById("conn-badge");
    b.textContent = "● online";
    b.classList.add("online");
    return true;
  } catch {
    return false;
  }
}

// ── Wiring entre módulos (evita imports circulares) ────────────────────────────
initSidebarActions({ moveFileToFolder, confirmRenameFile });
initKanban({ openFile, hideFileTooltip });

// ── Init ───────────────────────────────────────────────────────────────────────
marked.use({ breaks: true, gfm: true });

setSaveCallback(saveFile);

document.addEventListener("keydown", (e) => {
  if (
    e.ctrlKey &&
    e.key === "n" &&
    !e.shiftKey &&
    !e.target.matches("input,textarea")
  ) {
    e.preventDefault();
    newFile("note");
  }
  if (e.ctrlKey && e.shiftKey && e.key === "N") {
    e.preventDefault();
    newFile("task");
  }
  if (e.key === "Escape") {
    closeDeleteModal();
    closeKanbanQEdit();
  }
});

(async () => {
  loadKanbanColumns();
  updateStatusSelect();
  const treeEl = document.getElementById("file-tree");
  if (treeEl) treeEl.innerHTML = '<div class="tree-empty">⏳ Carregando…</div>';
  initBackground();
  initResizer();
  const ok = await checkConn();
  if (ok) await loadFiles();
  else toast("API offline. Inicie o servidor: uv run mk-manager", "error");
})();
