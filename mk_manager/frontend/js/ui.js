// Responsabilidade: peças de interface compartilhadas — menus suspensos (⋮ da nota,
// "mais" da barra do editor) e o painel de atalhos de teclado (tecla ?).

export function closeMenus(except = null) {
  document.querySelectorAll(".menu:not([hidden])").forEach((m) => {
    if (m !== except) m.hidden = true;
  });
}

export function toggleMenu(event, id) {
  event.stopPropagation();
  const menu = document.getElementById(id);
  if (!menu) return;
  closeMenus(menu);
  menu.hidden = !menu.hidden;
  event.currentTarget.setAttribute("aria-expanded", String(!menu.hidden));
  if (!menu.hidden) menu.querySelector(".menu-item:not([style*='display: none'])")?.focus();
}

// Clique num item ou fora fecha; o item roda o próprio onclick antes.
document.addEventListener("click", () => closeMenus());

const ATALHOS = [
  ["Ctrl K", "Abrir ou criar nota/task (@título cria task, #título cria nota)"],
  ["Ctrl S", "Salvar agora (o editor também salva sozinho)"],
  ["Ctrl Shift F", "Tela cheia no editor"],
  ["Esc", "Fecha janelas, menus e a tela cheia"],
  ["[[", "No editor: link para outra nota, com sugestões"],
  ["#", "No editor: tag, com sugestões"],
  ["Tab / Shift Tab", "Indenta ou desindenta a linha ou a seleção"],
  ["?", "Esta lista"],
];

export function openShortcutsModal() {
  const lista = document.getElementById("shortcuts-list");
  if (lista && !lista.childElementCount) {
    lista.innerHTML = ATALHOS.map(
      ([k, d]) => `<div class="shortcut-row"><span class="shortcut-keys">${k
        .split(" ")
        .map((p) => (p === "/" ? "/" : `<kbd>${p}</kbd>`))
        .join(" ")}</span><span>${d}</span></div>`,
    ).join("");
  }
  document.getElementById("shortcuts-overlay")?.classList.add("open");
}

export function closeShortcutsModal() {
  document.getElementById("shortcuts-overlay")?.classList.remove("open");
}

function digitando(el) {
  return el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeMenus();
    closeShortcutsModal();
  }
  if (e.key === "?" && !e.ctrlKey && !e.metaKey && !e.altKey && !digitando(e.target)) {
    if (document.getElementById("app-layout")?.hidden) return; // ainda na tela de login
    e.preventDefault();
    openShortcutsModal();
  }
});

Object.assign(window, { toggleMenu, openShortcutsModal, closeShortcutsModal });
