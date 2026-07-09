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
  updateRetroStatusLabel,
  updateTaskDuration,
} from "./editor.js";
import { updateStatusSelect } from "./kanban.js";
import { setMainView } from "./views.js";

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
  const datePlanning = document.getElementById("date-planning")?.value ?? "";
  const dateExecution = document.getElementById("date-execution")?.value ?? "";
  const dateConclusion = document.getElementById("date-conclusion")?.value ?? "";
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
        date_planning: datePlanning,
        date_execution: dateExecution,
        date_conclusion: dateConclusion,
      }),
    });
    const updated = await r.json();
    const idx = st.files.findIndex((f) => f.id === prevId);
    if (idx !== -1) st.files[idx] = { ...updated };
    
    // Sincroniza inputs de data na tela com o retorno da API
    const datePlanEl = document.getElementById("date-planning");
    if (datePlanEl) datePlanEl.value = updated.date_planning || "";
    const dateExecEl = document.getElementById("date-execution");
    if (dateExecEl) dateExecEl.value = updated.date_execution || "";
    const dateConclEl = document.getElementById("date-conclusion");
    if (dateConclEl) dateConclEl.value = updated.date_conclusion || "";
    updateTaskDuration();

    // The file may have been renamed on disk (ID = slug of title)
    if (updated.id !== prevId) st.activeId = updated.id;
    st.activeFolder = updated.folder || "";
    st.activeStatus = updated.status || "";
    updateRetroStatusLabel();
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
  if (st.mainView !== "editor") setMainView("editor");
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
    updateRetroStatusLabel();
    const datePlanEl = document.getElementById("date-planning");
    if (datePlanEl) datePlanEl.value = file.date_planning || "";
    const dateExecEl = document.getElementById("date-execution");
    if (dateExecEl) dateExecEl.value = file.date_execution || "";
    const dateConclEl = document.getElementById("date-conclusion");
    if (dateConclEl) dateConclEl.value = file.date_conclusion || "";
    updateTaskDuration();

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

export async function newFile(type, folder = "", title = "") {
  if (st.mainView !== "editor") setMainView("editor");
  const defaultContent =
    type === "task"
      ? "- [ ] Primeira tarefa\n- [ ] Segunda tarefa\n- [ ] Terceira tarefa\n"
      : "";
  try {
    document.getElementById(`btn-new-${type}`).disabled = true;
    const r = await apiFetch("/files", {
      method: "POST",
      body: JSON.stringify({
        title,
        type,
        tags: [],
        content: defaultContent,
        folder,
        status: "",
      }),
    });
    const file = await r.json();
    st.files.unshift(file);
    renderSidebar();
    await openFile(file.id);
    if (title) document.getElementById("md-editor").focus();
    else setTimeout(() => document.getElementById("title-input").focus(), 60);
  } catch (e) {
    toast("Erro ao criar arquivo: " + e.message, "error");
  } finally {
    document.getElementById(`btn-new-${type}`).disabled = false;
  }
}

// Usado por links internos [[Nota]] (preview) e por cliques em nós "fantasma"
// no grafo — resolve por título e abre, ou oferece criar a nota na hora.
export async function openOrCreateByTitle(title) {
  const key = title.trim().toLowerCase();
  const match = st.files.find((f) => (f.title || f.id).trim().toLowerCase() === key);
  if (match) {
    await openFile(match.id);
    return;
  }
  if (window.confirm(`A nota "${title}" ainda não existe. Criar agora?`)) {
    await newFile("note", "", title);
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

// ── Renomear/excluir pasta ─────────────────────────────────────────────────────
function remapFolderSet(set, oldPath, newPath) {
  const remapped = new Set();
  for (const p of set) {
    if (p === oldPath) {
      if (newPath) remapped.add(newPath);
    } else if (p.startsWith(oldPath + "/")) {
      const suffix = p.slice(oldPath.length + 1);
      remapped.add(newPath ? `${newPath}/${suffix}` : suffix);
    } else {
      remapped.add(p);
    }
  }
  return remapped;
}

function syncActiveFolderFromState() {
  if (!st.activeId) return;
  const active = st.files.find((f) => f.id === st.activeId);
  if (!active) return;
  st.activeFolder = active.folder || "";
  const folderInput = document.getElementById("folder-input");
  if (folderInput) folderInput.value = active.folder || "";
}

export async function renameFolder(oldPath, newName) {
  const parent = oldPath.includes("/") ? oldPath.slice(0, oldPath.lastIndexOf("/")) : "";
  const newPath = parent ? `${parent}/${newName}` : newName;
  try {
    const r = await apiFetch("/files/folder", {
      method: "PUT",
      body: JSON.stringify({ old_path: oldPath, new_path: newPath }),
    });
    const { updated_count } = await r.json();
    st.expandedFolders = remapFolderSet(st.expandedFolders, oldPath, newPath);
    st.emptyFolders = remapFolderSet(st.emptyFolders, oldPath, newPath);
    await loadFiles();
    syncActiveFolderFromState();
    toast(`Pasta renomeada (${updated_count} arquivo(s)).`, "success");
  } catch (e) {
    toast("Erro ao renomear pasta: " + e.message, "error");
  }
}

export async function deleteFolder(path) {
  const parent = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
  try {
    const r = await apiFetch(`/files/folder?path=${encodeURIComponent(path)}`, {
      method: "DELETE",
    });
    const { updated_count } = await r.json();
    st.expandedFolders = remapFolderSet(st.expandedFolders, path, parent);
    st.emptyFolders = remapFolderSet(st.emptyFolders, path, parent);
    await loadFiles();
    syncActiveFolderFromState();
    toast(
      updated_count ? `Pasta excluída. ${updated_count} arquivo(s) movido(s) para a pasta pai.` : "Pasta excluída.",
      "success",
    );
  } catch (e) {
    toast("Erro ao excluir pasta: " + e.message, "error");
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
  renameFolder,
  deleteFolder,
  openOrCreateByTitle,
  onMetaChange,
});
