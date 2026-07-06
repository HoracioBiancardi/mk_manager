// Responsabilidade: bootstrap e inicialização da aplicação
//
// Cada módulo de feature (files, delete-modal, export, assets, search-filter,
// sidebar, editor, preview, kanban) expõe suas próprias funções em `window`
// (necessário para os event handlers inline gerados nos templates). Este
// arquivo só precisa importá-los — mesmo sem usar os exports diretamente,
// o import já roda o `Object.assign(window, ...)` de cada um — e cuidar da
// sequência de inicialização e dos atalhos globais.

import { toast } from "./utils.js";
import { initSidebarActions } from "./sidebar.js";
import { setSaveCallback, initResizer } from "./editor.js";
import { initPreviewSourceSync } from "./preview.js";
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
  renameFolder,
  deleteFolder,
} from "./files.js";
import { closeDeleteModal, openDeleteModal } from "./delete-modal.js";
import { closeSettingsModal } from "./settings.js";
import { openQuickOpen, closeQuickOpen } from "./quickopen.js";
import { applyPrefsOnBoot } from "./prefs.js";
import "./views.js";
import "./export.js";
import "./assets.js";
import "./search-filter.js";
import "./diagram-builder.js";
import "./format-code.js";
import "./settings.js";

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
initSidebarActions({ moveFileToFolder, confirmRenameFile, renameFolder, deleteFolder, newFile, openDeleteModal });
initKanban({ openFile });

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
  if (e.ctrlKey && e.key.toLowerCase() === "k") {
    e.preventDefault();
    openQuickOpen();
  }
  if (e.key === "Escape") {
    closeDeleteModal();
    closeKanbanQEdit();
    closeSettingsModal();
    closeQuickOpen();
  }
});

(async () => {
  applyPrefsOnBoot();
  loadKanbanColumns();
  updateStatusSelect();
  const treeEl = document.getElementById("file-tree");
  if (treeEl) treeEl.innerHTML = '<div class="tree-empty">⏳ Carregando…</div>';
  // (canvas de partículas do design system fica desativado por padrão —
  // roda um loop de requestAnimationFrame O(n²) para sempre, mesmo com o
  // editor/kanban por cima cobrindo o efeito; as auroras via CSS abaixo já
  // dão a sensação de "vivo" sem esse custo contínuo de CPU)
  initResizer();
  initPreviewSourceSync();
  const ok = await checkConn();
  if (ok) await loadFiles();
  else toast("API offline. Inicie o servidor: uv run mk-manager", "error");
})();
