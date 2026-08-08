// Responsabilidade: Gestor de Assets do Projeto (Painel Global de Arquivos/Imagens)

import { st } from "./state.js";
import { esc, toast } from "./utils.js";
import { apiUpload } from "./api.js";
import { insRaw } from "./editor.js";
import { setMainView } from "./views.js";

let _projectAssets = [];
let _assetSearchQuery = "";

export async function loadProjectAssets() {
  try {
    const res = await fetch("/api/assets/");
    if (!res.ok) throw new Error("Erro ao carregar assets do projeto.");
    _projectAssets = await res.json();
    renderAssetsPanel();
  } catch (e) {
    console.error(e);
  }
}

export function onAssetSearchInput(query) {
  _assetSearchQuery = (query || "").toLowerCase();
  renderAssetsPanel();
}

export function renderAssetsPanel() {
  const container = document.getElementById("assets-list");
  if (!container) return;

  const filtered = _assetSearchQuery
    ? _projectAssets.filter(a => a.name.toLowerCase().includes(_assetSearchQuery))
    : _projectAssets;

  if (!filtered.length) {
    container.innerHTML = `
      <div class="empty-state" style="padding: 2rem; text-align: center; color: var(--text-muted);">
        <p style="margin-bottom: 0.5rem;">Nenhum asset encontrado.</p>
        <p class="form-hint">Clique em "+ Importar Asset" para adicionar imagens ou documentos ao projeto.</p>
      </div>`;
    return;
  }

  container.innerHTML = `
    <div class="assets-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 0.75rem; padding: 0.5rem 0;">
      ${filtered.map(a => {
        const markdownSnippet = a.is_image
          ? `![${a.name}](${a.url})`
          : `[📄 ${a.name}](${a.url})`;
        
        return `
          <div class="asset-card" style="background: var(--surface-alt); border: 1px solid var(--border); border-radius: var(--r-md); padding: 0.5rem; display: flex; flex-direction: column; gap: 0.35rem; position: relative;">
            <div class="asset-preview" style="height: 80px; width: 100%; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.2); border-radius: var(--r-sm); overflow: hidden;">
              ${a.is_image 
                ? `<img src="${esc(a.url)}" alt="${esc(a.name)}" style="max-height: 100%; max-width: 100%; object-fit: contain;" />`
                : `<div style="font-size: 1.5rem; opacity: 0.7;">📄 <span style="font-size: 0.65rem; display: block; font-weight: bold; text-align: center;">${esc(a.ext)}</span></div>`
              }
            </div>
            <div class="asset-name" title="${esc(a.name)}" style="font-size: 0.72rem; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text);">
              ${esc(a.name)}
            </div>
            <div class="asset-actions" style="display: flex; gap: 0.25rem; margin-top: auto;">
              <button class="btn btn-ghost btn-sm" style="flex: 1; padding: 0.2rem; font-size: 0.68rem;" onclick="insertAssetToEditor('${esc(markdownSnippet)}')" title="Inserir no editor">
                ➕ Usar
              </button>
              <button class="btn btn-ghost btn-sm" style="padding: 0.2rem 0.4rem; font-size: 0.68rem;" onclick="copyAssetSnippet('${esc(markdownSnippet)}')" title="Copiar link Markdown">
                📋
              </button>
              <button class="btn btn-ghost btn-sm" style="padding: 0.2rem 0.4rem; font-size: 0.68rem; color: var(--danger);" onclick="deleteProjectAsset('${esc(a.name)}')" title="Excluir asset">
                🗑️
              </button>
            </div>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

export function insertAssetToEditor(snippet) {
  if (!st.activeId) {
    toast("Abra uma nota ou task primeiro para inserir o asset.", "warn");
    return;
  }
  insRaw(snippet);
  setMainView("editor");
  toast("Asset inserido na nota!", "success");
}

export function copyAssetSnippet(snippet) {
  navigator.clipboard.writeText(snippet).then(() => {
    toast("Link do asset copiado!", "success");
  }).catch(() => toast("Erro ao copiar link.", "error"));
}

export async function deleteProjectAsset(assetName) {
  if (!confirm(`Deseja excluir o asset "${assetName}" do projeto?`)) return;
  try {
    const res = await fetch(`/api/assets/${encodeURIComponent(assetName)}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Erro ao excluir asset.");
    toast("Asset excluído com sucesso.", "success");
    await loadProjectAssets();
  } catch (e) {
    toast("Erro ao excluir: " + e.message, "error");
  }
}

export async function uploadGlobalProjectAsset(file) {
  try {
    const fd = new FormData();
    fd.append("file", file);
    const r = await apiUpload(fd);
    const data = await r.json();
    toast(`Asset "${data.filename}" importado para o projeto!`, "success");
    await loadProjectAssets();
  } catch (e) {
    toast("Erro ao importar asset: " + e.message, "error");
  }
}

export function triggerGlobalAssetUpload() {
  const input = document.createElement("input");
  input.type = "file";
  input.multiple = true;
  input.onchange = async () => {
    if (!input.files?.length) return;
    for (const file of input.files) {
      await uploadGlobalProjectAsset(file);
    }
  };
  input.click();
}

Object.assign(window, {
  onAssetSearchInput,
  insertAssetToEditor,
  copyAssetSnippet,
  deleteProjectAsset,
  triggerGlobalAssetUpload,
});
