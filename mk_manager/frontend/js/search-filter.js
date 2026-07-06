// Responsabilidade: busca full-text e filtros de tipo/tag (tela de Busca e painel de Tags)

import { st } from "./state.js";
import { toast } from "./utils.js";
import { apiFetch } from "./api.js";
import { renderSearchResults, renderTagsPanel } from "./sidebar.js";
import { doSearch, loadFiles } from "./files.js";

// ── Busca ──────────────────────────────────────────────────────────────────────
export function onSearch(v) {
  st.search = v.trim();
  clearTimeout(st.searchTimer);
  st.searchTimer = setTimeout(() => doSearch(st.search), 300);
}

// ── Filtros ────────────────────────────────────────────────────────────────────
export function setFilter(f) {
  st.filter = f;
  document
    .querySelectorAll(".filter-tab")
    .forEach((b) => b.classList.toggle("active", b.dataset.filter === f));
  if (st.search || st.tagFilters.length) doSearch(st.search);
  else renderSearchResults();
}

export function setTagFilter(tag) {
  const idx = st.tagFilters.indexOf(tag);
  if (idx === -1) st.tagFilters.push(tag);
  else st.tagFilters.splice(idx, 1);
  renderTagsPanel();
}

export function onTagSearchInput(v) {
  st.tagSearch = v.trim().toLowerCase();
  renderTagsPanel();
}

export async function renameTagPrompt(oldTag) {
  const input = prompt(`Renomear tag "${oldTag}" para:\n(se já existir, as duas são unificadas)`, oldTag);
  if (input === null) return;
  const newTag = input.trim();
  if (!newTag || newTag === oldTag) return;
  try {
    const r = await apiFetch(`/tags/${encodeURIComponent(oldTag)}`, {
      method: "PUT",
      body: JSON.stringify({ new_tag: newTag }),
    });
    const { updated_count } = await r.json();
    st.tagFilters = st.tagFilters.map((t) => (t === oldTag ? newTag : t));
    st.tagFilters = [...new Set(st.tagFilters)];
    await loadFiles();
    toast(`"${oldTag}" renomeada para "${newTag}" em ${updated_count} arquivo(s).`, "success");
  } catch (e) {
    toast("Erro ao renomear tag: " + e.message, "error");
  }
}

// ── Expor ao DOM (necessário para event handlers inline) ──────────────────────
Object.assign(window, {
  onSearch,
  setFilter,
  setTagFilter,
  onTagSearchInput,
  renameTagPrompt,
});
