// Responsabilidade: preferências de edição persistidas no navegador
// (visualização padrão ao abrir arquivo, tamanho da fonte do editor)

import { st } from "./state.js";

const VIEW_KEY = "mk-default-view";
const FONT_KEY = "mk-editor-font-size";
const VALID_VIEWS = new Set(["edit", "split", "preview"]);

export function getDefaultView() {
  const saved = localStorage.getItem(VIEW_KEY);
  return VALID_VIEWS.has(saved) ? saved : "split";
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

const SIDEBAR_WIDTH_KEY = "mk-sidebar-width";
export const SIDEBAR_WIDTH_DEFAULT = 240;
const SIDEBAR_WIDTH_MIN = 160;
const SIDEBAR_WIDTH_MAX = 480;

export function getSidebarWidth() {
  const saved = parseInt(localStorage.getItem(SIDEBAR_WIDTH_KEY), 10);
  return Number.isFinite(saved) && saved >= SIDEBAR_WIDTH_MIN && saved <= SIDEBAR_WIDTH_MAX
    ? saved
    : SIDEBAR_WIDTH_DEFAULT;
}

export function applySidebarWidth(px = getSidebarWidth()) {
  document.documentElement.style.setProperty("--sidebar-w", px + "px");
}

export function setSidebarWidth(px) {
  const clamped = Math.min(SIDEBAR_WIDTH_MAX, Math.max(SIDEBAR_WIDTH_MIN, px));
  localStorage.setItem(SIDEBAR_WIDTH_KEY, String(clamped));
  applySidebarWidth(clamped);
}

// Aplica as preferências salvas antes do primeiro arquivo ser aberto.
export function applyPrefsOnBoot() {
  st.view = getDefaultView();
  applyEditorFontSize();
  applySidebarWidth();
  applyActivityBarOrder();
  setCrtTheme(getCrtTheme());
}

const THEME_KEY = "mk-crt-theme";
const VALID_THEMES = new Set(["corporate", "green-neutral"]);

export function getCrtTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  return VALID_THEMES.has(saved) ? saved : "corporate";
}

export function setCrtTheme(theme) {
  const validTheme = VALID_THEMES.has(theme) ? theme : "corporate";
  localStorage.setItem(THEME_KEY, validTheme);
  VALID_THEMES.forEach((t) => document.body.classList.remove("theme-" + t));
  document.body.classList.add("theme-" + validTheme);
  const el = document.getElementById("settings-theme");
  if (el) el.value = validTheme;
}

const ACTIVITY_BAR_ORDER_KEY = "mk-activity-bar-order";
export const DEFAULT_ACTIVITY_BAR_ORDER = [
  "explorer",
  "search",
  "tags",
  "kanban",
  "graph",
  "list",
  "calendar",
  "archive",
  "trash",
];

export const ACTIVITY_BAR_LABELS = {
  explorer: "📂 Explorador",
  search: "🔍 Busca",
  tags: "🏷️ Tags",
  kanban: "📋 Kanban",
  graph: "🌐 Grafo",
  list: "📑 Lista",
  calendar: "📅 Calendário",
  archive: "📦 Arquivo",
  trash: "🗑️ Lixeira",
};

export function getActivityBarOrder() {
  try {
    const saved = localStorage.getItem(ACTIVITY_BAR_ORDER_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const set = new Set(parsed);
        DEFAULT_ACTIVITY_BAR_ORDER.forEach((item) => {
          if (!set.has(item)) parsed.push(item);
        });
        return parsed;
      }
    }
  } catch (e) {}
  return [...DEFAULT_ACTIVITY_BAR_ORDER];
}

export function setActivityBarOrder(orderArray) {
  localStorage.setItem(ACTIVITY_BAR_ORDER_KEY, JSON.stringify(orderArray));
  applyActivityBarOrder(orderArray);
}

export function applyActivityBarOrder(order = getActivityBarOrder()) {
  const nav = document.querySelector(".activity-bar");
  if (!nav) return;
  order.forEach((id) => {
    let btn = nav.querySelector(`button[data-panel="${id}"]`);
    if (btn) nav.appendChild(btn);
  });
}

export function moveActivityBarItem(id, direction) {
  const current = getActivityBarOrder();
  const idx = current.indexOf(id);
  if (idx === -1) return;
  const targetIdx = direction === "up" ? idx - 1 : idx + 1;
  if (targetIdx < 0 || targetIdx >= current.length) return;
  const temp = current[idx];
  current[idx] = current[targetIdx];
  current[targetIdx] = temp;
  setActivityBarOrder(current);
}

export function resetActivityBarOrder() {
  setActivityBarOrder([...DEFAULT_ACTIVITY_BAR_ORDER]);
}


