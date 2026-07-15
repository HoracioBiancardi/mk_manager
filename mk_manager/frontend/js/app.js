// Responsabilidade: bootstrap e inicialização da aplicação
//
// Cada módulo de feature (files, delete-modal, export, assets, search-filter,
// sidebar, editor, preview, kanban) expõe suas próprias funções em `window`
// (necessário para os event handlers inline gerados nos templates). Este
// arquivo só precisa importá-los — mesmo sem usar os exports diretamente,
// o import já roda o `Object.assign(window, ...)` de cada um — e cuidar da
// sequência de inicialização e dos atalhos globais.

import { toast } from "./utils.js";
import { apiFetch } from "./api.js";
import { initSidebarActions, initSidebarResizer } from "./sidebar.js";
import { setSaveCallback, initResizer } from "./editor.js";
import { initPreviewSourceSync } from "./preview.js";
import { initAssetDropZone } from "./assets.js";
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
  archiveFile,
} from "./files.js";
import { closeDeleteModal, openDeleteModal } from "./delete-modal.js";
import { closeSettingsModal } from "./settings.js";
import { openQuickOpen, closeQuickOpen } from "./quickopen.js";
import { applyPrefsOnBoot } from "./prefs.js";
import { playBootSfx, playClickSfx } from "./sfx.js";
import "./views.js";
import "./export.js";
import "./search-filter.js";
import "./diagram-builder.js";
import "./table-builder.js";
import "./format-code.js";
import "./settings.js";

// ── Conexão ───────────────────────────────────────────────────────────────────
// Só o check inicial do boot — depois disso o badge é mantido em dia pelo
// próprio apiFetch (api.js), a cada requisição real que o app já faz.
async function checkConn() {
  try {
    await apiFetch("/stats");
    return true;
  } catch {
    return false;
  }
}

// ── Wiring entre módulos (evita imports circulares) ────────────────────────────
initSidebarActions({ moveFileToFolder, confirmRenameFile, renameFolder, deleteFolder, newFile, openDeleteModal });
initKanban({ openFile, archiveFile });

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
  initSidebarResizer();
  initPreviewSourceSync();
  initAssetDropZone();
  const ok = await checkConn();
  if (ok) {
    await loadFiles();
    playBootSfx();
  } else {
    toast("API offline. Inicie o servidor: uv run mk-manager", "error");
  }
})();

// Efeitos sonoros mecânicos globais de digitação e clique
document.addEventListener("click", () => {
  playClickSfx();
});

document.addEventListener("keydown", (e) => {
  // Apenas toca som em teclas de caracteres simples (comprimento 1)
  if (e.key && e.key.length === 1) {
    playClickSfx();
  }
});
