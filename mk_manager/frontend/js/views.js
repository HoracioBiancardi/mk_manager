// Responsabilidade: alternância entre as "telas cheias" do painel principal
// (editor, kanban, tags, busca, assets) e a barra de atividades que as controla.

import { st } from "./state.js";
import { setView, showEditorPanel, showEmptyPanel } from "./editor.js";
import { renderKanban, resetKanbanUiState } from "./kanban.js";
import { renderTagsPanel, renderSearchResults, hideFileTooltip } from "./sidebar.js";
import { renderLinksMap } from "./links-map.js";
import { renderList } from "./list.js";
import { renderArchivePane } from "./archive.js";
import { renderTrashView } from "./trash.js";
import { renderCalendarView } from "./calendar.js";
import { loadProjectAssets } from "./assets-panel.js";
import { loadUsers } from "./auth.js";

const PANES = {
  kanban: "kanban-pane",
  tags: "tags-pane",
  search: "search-pane",
  links: "links-pane",
  list: "list-pane",
  archive: "archive-pane",
  trash: "trash-pane",
  calendar: "calendar-pane",
  assets: "assets-pane",
  users: "users-pane",
};

function hideAllPanes() {
  document.getElementById("empty-panel").style.display = "none";
  document.getElementById("editor-area").style.display = "none";
  for (const id of Object.values(PANES)) {
    const el = document.getElementById(id);
    if (el) el.style.display = "none";
  }
}

// Um único item destacado: a tela onde a pessoa está ("Arquivos" = editor).
function updateActivityBarActive() {
  document.querySelectorAll(".activity-btn").forEach((b) => {
    const panel = b.dataset.panel;
    const active = panel === "explorer" ? st.mainView === "editor" : st.mainView === panel;
    b.classList.toggle("active", active);
    if (panel) b.setAttribute("aria-current", active ? "page" : "false");
  });
}

// ── Sidebar por tela ─────────────────────────────────────────────────────────
// Kanban, Lista, Agenda... são telas largas: o Explorador começa recolhido nelas e
// aberto no editor. Abrir/fechar à mão fica lembrado para aquela tela.
const SIDEBAR_PREF_KEY = "mk-sidebar-por-tela";

function sidebarPrefs() {
  try {
    return JSON.parse(localStorage.getItem(SIDEBAR_PREF_KEY)) || {};
  } catch {
    return {};
  }
}

function wantsSidebar(view) {
  const prefs = sidebarPrefs();
  return view in prefs ? !!prefs[view] : view === "editor";
}

function setSidebarOpen(open) {
  st.sidebarOpen = open;
  document.querySelector(".sidebar-panel")?.classList.toggle("collapsed", !open);
  document.querySelectorAll(".sidebar-toggle-btn").forEach((b) => b.setAttribute("aria-expanded", String(open)));
}

export function toggleSidebar() {
  setSidebarOpen(!st.sidebarOpen);
  const prefs = sidebarPrefs();
  prefs[st.mainView] = st.sidebarOpen;
  try {
    localStorage.setItem(SIDEBAR_PREF_KEY, JSON.stringify(prefs));
  } catch {}
}

export function setMainView(view) {
  if (st.mainView === "kanban" && view !== "kanban") resetKanbanUiState();
  
  const performChange = () => {
    st.mainView = view;
    hideAllPanes();

    if (view === "editor") {
      if (st.activeId) {
        showEditorPanel();
        setView(st.view);
      } else {
        showEmptyPanel();
      }
    } else {
      const paneEl = document.getElementById(PANES[view]);
      if (paneEl) paneEl.style.display = "flex";
      if (view === "kanban") {
        hideFileTooltip();
        renderKanban();
      } else if (view === "tags") {
        renderTagsPanel();
      } else if (view === "search") {
        renderSearchResults();
        setTimeout(() => document.getElementById("search-input")?.focus(), 60);
      } else if (view === "links") {
        renderLinksMap();
      } else if (view === "list") {
        renderList();
      } else if (view === "archive") {
        renderArchivePane();
      } else if (view === "trash") {
        renderTrashView();
      } else if (view === "calendar") {
        renderCalendarView();
      } else if (view === "assets") {
        loadProjectAssets();
      } else if (view === "users") {
        loadUsers();
      }
    }

    setSidebarOpen(wantsSidebar(view));
    updateActivityBarActive();
  };

  performChange();
}

// ── Barra de atividades ─────────────────────────────────────────────────────
// "Arquivos" volta para o editor; já no editor, abre/fecha o Explorador.
export function switchPanel(panel) {
  if (panel === "explorer") {
    if (st.mainView === "editor") toggleSidebar();
    else setMainView("editor");
    return;
  }

  setMainView(st.mainView === panel ? "editor" : panel);
}

// ── Expor ao DOM (necessário para event handlers inline) ──────────────────────
Object.assign(window, { switchPanel, toggleSidebar });
