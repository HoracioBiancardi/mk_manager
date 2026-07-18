// Responsabilidade: configurações centralizadas do sistema — atalhos de teclado etc.
// Alterar os valores aqui remapeia o atalho em todo o app, sem tocar em quem os consome.

// Atalhos de navegação entre abas de arquivos recentes (recent-files-bar).
export const RECENT_TABS_SHORTCUTS = {
  next: { key: "Tab", ctrlKey: true, shiftKey: false, altKey: false },
  prev: { key: "Tab", ctrlKey: true, shiftKey: true, altKey: false },
  // Alt+1 .. Alt+9 pulam direto para a N-ésima aba (limitado ao nº de abas visíveis).
  jump: { key: null, ctrlKey: false, shiftKey: false, altKey: true },
};

export function matchesShortcut(e, shortcut) {
  return (
    e.key.toLowerCase() === String(shortcut.key).toLowerCase() &&
    e.ctrlKey === !!shortcut.ctrlKey &&
    e.shiftKey === !!shortcut.shiftKey &&
    e.altKey === !!shortcut.altKey
  );
}

// Retorna o índice (0-based) do dígito 1-9 pressionado junto com os
// modificadores do atalho "jump", ou null se o evento não corresponder.
export function matchesJumpShortcut(e, shortcut) {
  if (e.ctrlKey !== !!shortcut.ctrlKey) return null;
  if (e.shiftKey !== !!shortcut.shiftKey) return null;
  if (e.altKey !== !!shortcut.altKey) return null;
  if (!/^[1-9]$/.test(e.key)) return null;
  return Number(e.key) - 1;
}
