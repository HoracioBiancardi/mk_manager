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

export function getUseCodeMirror() {
  return false;
}

export function setUseCodeMirror(enabled) {
  // CodeMirror desativado
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

  // Aplica as preferências do Pip-Boy CRT
  setCrtScanlines(getCrtScanlines());
  setCrtFlicker(getCrtFlicker());
  setCrtStatic(getCrtStatic());
  setCrtCurved(getCrtCurved());
  setCrtTransition(getCrtTransition());
  setCrtRadar(getCrtRadar());
  setCrtOpacity(getCrtOpacity());
  setSfxEnabled(getSfxEnabled());
  setCrtTheme(getCrtTheme());
}

const SCANLINES_KEY = "mk-crt-scanlines";
const FLICKER_KEY = "mk-crt-flicker";
const THEME_KEY = "mk-crt-theme";

export function getCrtScanlines() {
  const saved = localStorage.getItem(SCANLINES_KEY);
  return saved === null ? true : saved === "true";
}

export function setCrtScanlines(enabled) {
  localStorage.setItem(SCANLINES_KEY, String(enabled));
  document.body.classList.toggle("crt-enabled", enabled);
  const el = document.getElementById("settings-scanlines");
  if (el) el.checked = enabled;
}

export function getCrtFlicker() {
  const saved = localStorage.getItem(FLICKER_KEY);
  return saved === null ? true : saved === "true";
}

export function setCrtFlicker(enabled) {
  localStorage.setItem(FLICKER_KEY, String(enabled));
  document.body.classList.toggle("flicker-enabled", enabled);
  const el = document.getElementById("settings-flicker");
  if (el) el.checked = enabled;
}

export function getCrtTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  return saved || "green";
}

export function setCrtTheme(theme) {
  localStorage.setItem(THEME_KEY, theme);
  document.body.classList.remove("theme-green", "theme-amber", "theme-blue", "theme-white", "theme-red", "theme-purple", "theme-corporate", "theme-green-neutral");
  document.body.classList.add("theme-" + theme);
  const el = document.getElementById("settings-theme");
  if (el) el.value = theme;
}

const STATIC_KEY = "mk-crt-static";
const CURVED_KEY = "mk-crt-curved";

export function getCrtStatic() {
  const saved = localStorage.getItem(STATIC_KEY);
  return saved === null ? false : saved === "true";
}

export function setCrtStatic(enabled) {
  localStorage.setItem(STATIC_KEY, String(enabled));
  document.body.classList.toggle("static-enabled", enabled);
  const el = document.getElementById("settings-static");
  if (el) el.checked = enabled;
}

export function getCrtCurved() {
  const saved = localStorage.getItem(CURVED_KEY);
  return saved === null ? true : saved === "true";
}

export function setCrtCurved(enabled) {
  localStorage.setItem(CURVED_KEY, String(enabled));
  document.body.classList.toggle("curved-enabled", enabled);
  const el = document.getElementById("settings-curved");
  if (el) el.checked = enabled;
}

const TRANSITION_KEY = "mk-crt-transition";

export function getCrtTransition() {
  const saved = localStorage.getItem(TRANSITION_KEY);
  return saved === null ? true : saved === "true";
}

export function setCrtTransition(enabled) {
  localStorage.setItem(TRANSITION_KEY, String(enabled));
  const el = document.getElementById("settings-transition");
  if (el) el.checked = enabled;
}

const SFX_KEY = "mk-sfx-enabled";
const OPACITY_KEY = "mk-crt-opacity";
const RADAR_KEY = "mk-crt-radar";

export function getSfxEnabled() {
  const saved = localStorage.getItem(SFX_KEY);
  return saved === null ? false : saved === "true"; // desativado por padrão
}

export function setSfxEnabled(enabled) {
  localStorage.setItem(SFX_KEY, String(enabled));
  const el = document.getElementById("settings-sfx");
  if (el) el.checked = enabled;
}

export function getCrtOpacity() {
  const saved = localStorage.getItem(OPACITY_KEY);
  return saved === null ? 0.06 : parseFloat(saved);
}

export function setCrtOpacity(value) {
  localStorage.setItem(OPACITY_KEY, String(value));
  document.documentElement.style.setProperty("--crt-opacity", value);
  const el = document.getElementById("settings-crt-opacity");
  if (el) el.value = value;
  const label = document.getElementById("settings-crt-opacity-label");
  if (label) label.textContent = `${Math.round(value * 100)}%`;
}

export function getCrtRadar() {
  const saved = localStorage.getItem(RADAR_KEY);
  return saved === null ? true : saved === "true";
}

export function setCrtRadar(enabled) {
  localStorage.setItem(RADAR_KEY, String(enabled));
  document.body.classList.toggle("radar-sweep-enabled", enabled);
  const el = document.getElementById("settings-radar-sweep");
  if (el) el.checked = enabled;
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


