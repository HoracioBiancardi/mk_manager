// Responsabilidade: menu de contexto genérico (clique direito), usado pela árvore de arquivos

import { esc } from "./utils.js";

let _menuEl = null;
let _items = [];

function ensureMenuEl() {
  if (_menuEl) return _menuEl;
  _menuEl = document.createElement("div");
  _menuEl.className = "context-menu";
  _menuEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".context-menu-item");
    if (!btn) return;
    const idx = parseInt(btn.dataset.idx, 10);
    hideContextMenu();
    _items[idx]?.onClick?.();
  });
  document.body.appendChild(_menuEl);
  return _menuEl;
}

/**
 * @param {number} x
 * @param {number} y
 * @param {{label?:string, icon?:string, danger?:boolean, separator?:boolean, onClick?:()=>void}[]} items
 */
export function showContextMenu(x, y, items) {
  _items = items;
  const menu = ensureMenuEl();
  menu.innerHTML = items
    .map((it, i) =>
      it.separator
        ? '<div class="context-menu-sep"></div>'
        : `<button class="context-menu-item${it.danger ? " danger" : ""}" data-idx="${i}">${it.icon ? `<span class="context-menu-icon">${it.icon}</span>` : ""}${esc(it.label || "")}</button>`,
    )
    .join("");
  menu.style.left = "0px";
  menu.style.top = "0px";
  menu.style.display = "block";

  const rect = menu.getBoundingClientRect();
  const maxX = window.innerWidth - rect.width - 8;
  const maxY = window.innerHeight - rect.height - 8;
  menu.style.left = Math.max(4, Math.min(x, maxX)) + "px";
  menu.style.top = Math.max(4, Math.min(y, maxY)) + "px";
}

export function hideContextMenu() {
  if (_menuEl) _menuEl.style.display = "none";
}

document.addEventListener("click", hideContextMenu);
document.addEventListener("contextmenu", (e) => {
  if (_menuEl && _menuEl.style.display === "block" && !_menuEl.contains(e.target)) {
    hideContextMenu();
  }
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") hideContextMenu();
});
window.addEventListener("scroll", hideContextMenu, true);
window.addEventListener("resize", hideContextMenu);

// ── Expor ao DOM (necessário para event handlers inline) ──────────────────────
Object.assign(window, { hideContextMenu });
