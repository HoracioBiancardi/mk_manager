// Responsabilidade: redirecionamento do botão Importar para a tela Assets do Projeto

import { setMainView } from "./views.js";

export function triggerAssetImport() {
  setMainView("assets");
}

// ── Desativar o arrastar (drag & drop) no editor ────────────────────────────

export function initAssetDropZone() {
  const pane = document.getElementById("editor-pane");
  if (!pane) return;

  // Previne comportamento padrão de navegação ao arrastar sobre o editor
  ["dragenter", "dragover", "dragleave", "drop"].forEach((evt) =>
    pane.addEventListener(evt, (e) => {
      e.preventDefault();
      e.stopPropagation();
    })
  );
}

// ── Expor ao DOM (necessário para event handlers inline) ──────────────────────
Object.assign(window, {
  triggerAssetImport,
});
