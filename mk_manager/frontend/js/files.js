// Responsabilidade: ciclo de vida de arquivos via API (CRUD, busca, mover, renomear)

import { st } from "./state.js";
import { toast } from "./utils.js";
import { apiFetch } from "./api.js";
import { renderSidebar, renderSearchResults } from "./sidebar.js";
import {
  showEditorPanel,
  showEmptyPanel,
  renderTags,
  setView,
  updateFooter,
  setSaveStatus,
  updateStatusVis,
} from "./editor.js";
import { exitKanbanMode, updateStatusSelect } from "./kanban.js";

// ── Storage info ───────────────────────────────────────────────────────────────
async function updateStorageInfo() {
  try {
    const r = await apiFetch("/stats");
    const s = await r.json();
    const kb = (s.size_bytes / 1024).toFixed(1);
    document.getElementById("storage-info").textContent =
      `${s.total} arquivo(s) · ${s.notes} notas · ${s.tasks} tasks · ${kb} KB`;
  } catch {}
}

// ── Carregar arquivos ──────────────────────────────────────────────────────────
export async function loadFiles() {
  try {
    const r = await apiFetch("/files");
    st.files = await r.json();
    st.searchResults = null;
    renderSidebar();
    updateStorageInfo();
  } catch (e) {
    toast("Erro ao carregar arquivos: " + e.message, "error");
  }
}

export async function doSearch(q) {
  if (!q && !st.tagFilters.length) {
    st.searchResults = null;
    renderSearchResults();
    return;
  }
  try {
    let url = `/search?q=${encodeURIComponent(q || "")}`;
    if (st.filter !== "all") url += `&type=${st.filter}`;
    for (const t of st.tagFilters) url += `&tag=${encodeURIComponent(t)}`;
    const r = await apiFetch(url);
    st.searchResults = await r.json();
    renderSearchResults();
  } catch (e) {
    toast("Erro na busca: " + e.message, "error");
  }
}

// ── CRUD ───────────────────────────────────────────────────────────────────────
export async function saveFile() {
  if (!st.activeId) return;
  const content = document.getElementById("md-editor").value;
  const title = document.getElementById("title-input").value.trim();
  const folder =
    document.getElementById("folder-input")?.value.trim() ?? st.activeFolder;
  const status =
    document.getElementById("status-select")?.value ?? st.activeStatus;
  try {
    const prevId = st.activeId;
    const r = await apiFetch(`/files/${prevId}`, {
      method: "PUT",
      body: JSON.stringify({
        title,
        content,
        tags: st.activeTags,
        folder,
        status,
      }),
    });
    const updated = await r.json();
    const idx = st.files.findIndex((f) => f.id === prevId);
    if (idx !== -1) st.files[idx] = { ...updated };
    // The file may have been renamed on disk (ID = slug of title)
    if (updated.id !== prevId) st.activeId = updated.id;
    st.activeFolder = updated.folder || "";
    st.activeStatus = updated.status || "";
    st.isDirty = false;
    document.getElementById("filename-label").textContent = updated.filename;
    renderSidebar();
    setSaveStatus("saved");
    updateStorageInfo();
  } catch (e) {
    setSaveStatus("error");
    toast("Erro ao salvar: " + e.message, "error");
  }
}

export async function openFile(id) {
  if (st.kanbanMode) exitKanbanMode();
  if (st.isDirty && st.activeId) await saveFile();
  try {
    const r = await apiFetch(`/files/${id}`);
    const file = await r.json();
    st.activeId = id;
    st.activeTags = [...(file.tags || [])];
    st.activeFolder = file.folder || "";
    st.activeStatus = file.status || "";
    st.isDirty = false;

    document.getElementById("title-input").value = file.title;
    document.getElementById("md-editor").value = file.content;
    document.getElementById("filename-label").textContent = file.filename;
    const folderInput = document.getElementById("folder-input");
    if (folderInput) folderInput.value = file.folder || "";
    updateStatusSelect();
    const statusSel = document.getElementById("status-select");
    if (statusSel) statusSel.value = file.status || "";

    const badge = document.getElementById("type-badge");
    badge.textContent = file.type === "task" ? "Task" : "Note";
    badge.className = `type-badge ${file.type}`;
    updateStatusVis(file.type);

    renderTags(st.activeTags);
    renderSidebar();
    showEditorPanel();
    setView(st.view);
    updateFooter();
    setSaveStatus("saved");
  } catch (e) {
    toast("Erro ao abrir arquivo: " + e.message, "error");
  }
}

export async function newFile(type) {
  if (st.kanbanMode) exitKanbanMode();
  const defaultContent =
    type === "task"
      ? "- [ ] Primeira tarefa\n- [ ] Segunda tarefa\n- [ ] Terceira tarefa\n"
      : "";
  try {
    document.getElementById(`btn-new-${type}`).disabled = true;
    const r = await apiFetch("/files", {
      method: "POST",
      body: JSON.stringify({
        title: "",
        type,
        tags: [],
        content: defaultContent,
        folder: "",
        status: "",
      }),
    });
    const file = await r.json();
    st.files.unshift(file);
    renderSidebar();
    await openFile(file.id);
    setTimeout(() => document.getElementById("title-input").focus(), 60);
  } catch (e) {
    toast("Erro ao criar arquivo: " + e.message, "error");
  } finally {
    document.getElementById(`btn-new-${type}`).disabled = false;
  }
}

export async function deleteFile(id) {
  try {
    await apiFetch(`/files/${id}`, { method: "DELETE" });
    st.files = st.files.filter((f) => f.id !== id);
    if (st.searchResults)
      st.searchResults = st.searchResults.filter((f) => f.id !== id);
    if (st.activeId === id) {
      st.activeId = null;
      showEmptyPanel();
    }
    renderSidebar();
    updateStorageInfo();
    toast("Arquivo excluído.", "success");
  } catch (e) {
    toast("Erro ao excluir: " + e.message, "error");
  }
}

// ── Mover arquivo para pasta (drag & drop) ────────────────────────────────────
export async function moveFileToFolder(fileId, folderPath) {
  try {
    const r = await apiFetch(`/files/${fileId}`, {
      method: "PUT",
      body: JSON.stringify({ folder: folderPath }),
    });
    const updated = await r.json();
    const idx = st.files.findIndex((f) => f.id === fileId);
    if (idx !== -1) st.files[idx] = { ...updated };
    if (st.activeId === fileId) {
      st.activeFolder = updated.folder || "";
      const folderInput = document.getElementById("folder-input");
      if (folderInput) folderInput.value = updated.folder || "";
    }
    st.emptyFolders.delete(folderPath);
    renderSidebar();
    toast(`Movido para "${folderPath}".`, "success");
  } catch (e) {
    toast("Erro ao mover arquivo: " + e.message, "error");
  }
}

// ── Rename inline ─────────────────────────────────────────────────────────────
export async function confirmRenameFile(id, newTitle) {
  if (st.renamingId !== id) return;
  st.renamingId = null;
  const trimmed = newTitle.trim();
  if (!trimmed) {
    renderSidebar();
    return;
  }
  const file = st.files.find((f) => f.id === id);
  if (!file || file.title === trimmed) {
    renderSidebar();
    return;
  }
  try {
    const r = await apiFetch(`/files/${id}`, {
      method: "PUT",
      body: JSON.stringify({ title: trimmed }),
    });
    const updated = await r.json();
    const idx = st.files.findIndex((f) => f.id === id);
    if (idx !== -1) st.files[idx] = { ...updated };
    if (st.activeId === id) {
      document.getElementById("title-input").value = updated.title;
      document.getElementById("filename-label").textContent = updated.filename;
      if (updated.id !== id) st.activeId = updated.id;
    }
    renderSidebar();
    toast("Renomeado com sucesso.", "success");
  } catch (e) {
    renderSidebar();
    toast("Erro ao renomear: " + e.message, "error");
  }
}

// ── Metadados (pasta/status) ──────────────────────────────────────────────────
export function onMetaChange() {
  if (!st.activeId) return;
  st.isDirty = true;
  setSaveStatus("saving");
  clearTimeout(st.saveTimer);
  st.saveTimer = setTimeout(saveFile, 800);
}

// ── Expor ao DOM (necessário para event handlers inline) ──────────────────────
Object.assign(window, {
  openFile,
  newFile,
  saveFile,
  moveFileToFolder,
  confirmRenameFile,
  onMetaChange,
});
