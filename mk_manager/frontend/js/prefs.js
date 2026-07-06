// Responsabilidade: preferências de edição persistidas no navegador
// (visualização padrão ao abrir arquivo, tamanho da fonte do editor)

import { st } from "./state.js";

const VIEW_KEY = "mk-default-view";
const FONT_KEY = "mk-editor-font-size";
const VALID_VIEWS = new Set(["edit", "split", "preview"]);

export function getDefaultView() {
  const saved = localStorage.getItem(VIEW_KEY);
  return VALID_VIEWS.has(saved) ? saved : "edit";
}

export function setDefaultView(view) {
  localStorage.setItem(VIEW_KEY, view);
}

export function getEditorFontSize() {
  const saved = parseInt(localStorage.getItem(FONT_KEY), 10);
  return Number.isFinite(saved) && saved >= 11 && saved <= 24 ? saved : 14;
}

export function applyEditorFontSize(px = getEditorFontSize()) {
  const ta = document.getElementById("md-editor");
  if (ta) ta.style.fontSize = px + "px";
}

export function setEditorFontSize(px) {
  localStorage.setItem(FONT_KEY, String(px));
  applyEditorFontSize(px);
}

// Aplica as preferências salvas antes do primeiro arquivo ser aberto.
export function applyPrefsOnBoot() {
  st.view = getDefaultView();
  applyEditorFontSize();
}
