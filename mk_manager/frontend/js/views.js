// Responsabilidade: alternância entre as "telas cheias" do painel principal
// (editor, kanban, tags, busca) e a barra de atividades que as controla.
// Generaliza o que antes era só o modo Kanban (enterKanbanMode/exitKanbanMode).

import { st } from "./state.js";
import { setView, showEditorPanel, showEmptyPanel } from "./editor.js";
import { renderKanban, resetKanbanUiState } from "./kanban.js";
import { renderTagsPanel, renderSearchResults, hideFileTooltip } from "./sidebar.js";
import { renderGraph } from "./graph.js";

const PANES = {
  kanban: "kanban-pane",
  tags: "tags-pane",
  search: "search-pane",
  graph: "graph-pane",
};

function hideAllPanes() {
  document.getElementById("empty-panel").style.display = "none";
  document.getElementById("editor-area").style.display = "none";
  for (const id of Object.values(PANES)) {
    document.getElementById(id).style.display = "none";
  }
}

function updateActivityBarActive() {
  document.querySelectorAll(".activity-btn").forEach((b) => {
    const panel = b.dataset.panel;
    const active = panel === "explorer" ? st.sidebarOpen : st.mainView === panel;
    b.classList.toggle("active", active);
  });
}

export function setMainView(view) {
  if (st.mainView === "kanban" && view !== "kanban") resetKanbanUiState();
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
    document.getElementById(PANES[view]).style.display = "flex";
    if (view === "kanban") {
      hideFileTooltip();
      renderKanban();
    } else if (view === "tags") {
      renderTagsPanel();
    } else if (view === "search") {
      renderSearchResults();
      setTimeout(() => document.getElementById("search-input")?.focus(), 60);
    } else if (view === "graph") {
      renderGraph();
    }
  }

  updateActivityBarActive();
}

// ── Barra de atividades ─────────────────────────────────────────────────────
export function switchPanel(panel) {
  if (panel === "explorer") {
    st.sidebarOpen = !st.sidebarOpen;
    document.querySelector(".sidebar-panel").classList.toggle("collapsed", !st.sidebarOpen);
    updateActivityBarActive();
    return;
  }

  setMainView(st.mainView === panel ? "editor" : panel);
}

// ── Expor ao DOM (necessário para event handlers inline) ──────────────────────
Object.assign(window, { switchPanel });
