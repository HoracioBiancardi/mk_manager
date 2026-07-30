// Responsabilidade: visualização e gestão da Lixeira (restaurar / expurgar)

import { st } from "./state.js";
import { esc, toast } from "./utils.js";
import { apiFetch } from "./api.js";
import { loadFiles } from "./files.js";

export async function renderTrashView() {
  const container = document.getElementById("trash-list");
  if (!container) return;
  container.innerHTML = `<div class="retro-loading">Carregando Lixeira…</div>`;

  try {
    const res = await apiFetch("/files/trashed");
    const trashedFiles = await res.json();

    if (!trashedFiles || trashedFiles.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">🗑️</div>
          <div class="empty-state-title">A Lixeira está vazia</div>
          <div class="empty-state-desc">Arquivos excluídos serão movidos para cá antes da exclusão permanente.</div>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="trash-header">
        <span><strong>${trashedFiles.length}</strong> arquivo(s) na lixeira</span>
        <button class="btn btn-danger btn-sm" type="button" onclick="purgeAllTrash()">🔥 Esvaziar Lixeira</button>
      </div>
      <div class="trash-grid">
        ${trashedFiles.map(f => `
          <div class="trash-card">
            <div class="trash-card-header">
              <span class="type-badge ${f.type}">${f.type === "task" ? "Task" : "Note"}</span>
              <strong class="trash-card-title">${esc(f.title || f.id)}</strong>
            </div>
            <div class="trash-card-meta">
              <span>Origem: <code>${esc(f.trashed_from || "/")}</code></span>
              <span>Modificado: ${new Date(f.modified).toLocaleDateString("pt-BR")}</span>
            </div>
            <div class="trash-card-actions">
              <button class="btn btn-ghost btn-sm" type="button" onclick="restoreTrashFile('${esc(f.id)}')">↩ Restaurar</button>
              <button class="btn btn-danger btn-sm" type="button" onclick="purgeSingleFile('${esc(f.id)}')">🗑 Excluir</button>
            </div>
          </div>
        `).join("")}
      </div>
    `;
  } catch (e) {
    toast("Erro ao carregar Lixeira: " + e.message, "error");
    container.innerHTML = `<div class="empty-state-title" style="color:var(--danger)">Erro ao carregar lixeira</div>`;
  }
}

export async function restoreTrashFile(id) {
  try {
    await apiFetch(`/files/${encodeURIComponent(id)}/untrash`, { method: "POST" });
    toast("Arquivo restaurado com sucesso!", "success");
    await renderTrashView();
    await loadFiles();
  } catch (e) {
    toast("Erro ao restaurar arquivo: " + e.message, "error");
  }
}

export async function purgeSingleFile(id) {
  if (!confirm("Excluir este arquivo permanentemente? Esta ação não pode ser desfeita.")) return;
  try {
    await apiFetch(`/files/${encodeURIComponent(id)}/purge`, { method: "DELETE" });
    toast("Arquivo excluído permanentemente.", "info");
    await renderTrashView();
    await loadFiles();
  } catch (e) {
    toast("Erro ao excluir arquivo: " + e.message, "error");
  }
}

export async function purgeAllTrash() {
  if (!confirm("Esvaziar toda a lixeira permanentemente? Todos os arquivos serão perdidos.")) return;
  try {
    await apiFetch("/files/trash/purge", { method: "DELETE" });
    toast("Lixeira esvaziada.", "info");
    await renderTrashView();
    await loadFiles();
  } catch (e) {
    toast("Erro ao esvaziar lixeira: " + e.message, "error");
  }
}

Object.assign(window, {
  renderTrashView,
  restoreTrashFile,
  purgeSingleFile,
  purgeAllTrash,
});
