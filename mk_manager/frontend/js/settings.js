// Responsabilidade: modal de configurações (pasta de notas, backup, preferências de edição)

import { esc, toast } from "./utils.js";
import { apiFetch } from "./api.js";
import { loadFiles } from "./files.js";
import { applyEditorFontSize, getDefaultView, getEditorFontSize, setDefaultView, setEditorFontSize } from "./prefs.js";

export async function openSettingsModal() {
  document.getElementById("settings-overlay").classList.add("open");
  document.getElementById("settings-notes-dir").value = "Carregando…";
  document.getElementById("settings-server-info").textContent = "–";
  document.getElementById("settings-storage-info").textContent = "–";
  document.getElementById("settings-default-view").value = getDefaultView();
  document.getElementById("settings-font-size").value = getEditorFontSize();
  document.getElementById("settings-font-size-label").textContent = `${getEditorFontSize()}px`;

  try {
    const [settingsRes, statsRes] = await Promise.all([
      apiFetch("/settings"),
      apiFetch("/stats"),
    ]);
    const settingsData = await settingsRes.json();
    const stats = await statsRes.json();

    document.getElementById("settings-notes-dir").value = settingsData.notes_dir;
    document.getElementById("settings-server-info").textContent =
      `${settingsData.host}:${settingsData.port} (mude via .env / MK_HOST, MK_PORT — requer reiniciar o servidor)`;
    document.getElementById("settings-storage-info").textContent =
      `${stats.total} arquivo(s) · ${stats.notes} notas · ${stats.tasks} tasks · ${(stats.size_bytes / 1024).toFixed(1)} KB`;
  } catch (e) {
    document.getElementById("settings-notes-dir").value = "";
    toast("Erro ao carregar configurações: " + e.message, "error");
  }
}

export function closeSettingsModal() {
  document.getElementById("settings-overlay").classList.remove("open");
  document.getElementById("folder-browser").style.display = "none";
}

export function onSettingsOverlayClick(e) {
  if (e.target === document.getElementById("settings-overlay")) {
    closeSettingsModal();
  }
}

export function onFontSizeInput(value) {
  document.getElementById("settings-font-size-label").textContent = `${value}px`;
  applyEditorFontSize(parseInt(value, 10));
}

export function downloadBackup() {
  const a = Object.assign(document.createElement("a"), {
    href: "/api/settings/backup",
    download: "",
  });
  document.body.appendChild(a);
  a.click();
  a.remove();
  toast("Preparando backup…", "info");
}

// ── Navegador de pastas (evita ter que digitar caminho absoluto) ───────────────
let _browsePath = null;
let _browseParent = null;

export async function toggleFolderBrowser() {
  const panel = document.getElementById("folder-browser");
  const opening = panel.style.display === "none";
  panel.style.display = opening ? "block" : "none";
  if (opening) {
    const current = document.getElementById("settings-notes-dir").value.trim();
    await loadFolderBrowser(current || null);
  }
}

async function loadFolderBrowser(path) {
  try {
    const qs = path ? `?path=${encodeURIComponent(path)}` : "";
    const r = await apiFetch(`/settings/browse${qs}`);
    const data = await r.json();
    _browsePath = data.path;
    _browseParent = data.parent;
    document.getElementById("folder-browser-path").textContent = data.path;
    document.getElementById("folder-browser-path").title = data.path;
    document.getElementById("folder-browser-up-btn").disabled = !data.parent;

    const list = document.getElementById("folder-browser-list");
    list.innerHTML = data.dirs.length
      ? data.dirs
          .map(
            (d) => `<div class="folder-browser-item" data-path="${esc(d.path)}">📁 ${esc(d.name)}</div>`,
          )
          .join("")
      : `<div class="folder-browser-empty">Nenhuma subpasta aqui.</div>`;
  } catch (e) {
    toast("Erro ao listar pastas: " + e.message, "error");
  }
}

export function onFolderBrowserListClick(e) {
  const item = e.target.closest(".folder-browser-item");
  if (item) loadFolderBrowser(item.dataset.path);
}

export function folderBrowserGoUp() {
  if (!_browseParent) return;
  loadFolderBrowser(_browseParent);
}

export function folderBrowserSelect() {
  if (!_browsePath) return;
  document.getElementById("settings-notes-dir").value = _browsePath;
  document.getElementById("folder-browser").style.display = "none";
}

export async function saveSettings() {
  const input = document.getElementById("settings-notes-dir");
  const notesDir = input.value.trim();
  if (!notesDir) {
    toast("Informe uma pasta válida.", "info");
    return;
  }

  setDefaultView(document.getElementById("settings-default-view").value);
  setEditorFontSize(parseInt(document.getElementById("settings-font-size").value, 10));

  const btn = document.getElementById("settings-save-btn");
  btn.disabled = true;
  try {
    const r = await apiFetch("/settings", {
      method: "PUT",
      body: JSON.stringify({ notes_dir: notesDir }),
    });
    const updated = await r.json();
    input.value = updated.notes_dir;
    toast("Configurações salvas!", "success");
    closeSettingsModal();
    await loadFiles();
  } catch (e) {
    toast("Erro ao salvar: " + e.message, "error");
  } finally {
    btn.disabled = false;
  }
}

// ── Expor ao DOM (necessário para event handlers inline) ──────────────────────
Object.assign(window, {
  openSettingsModal,
  closeSettingsModal,
  onSettingsOverlayClick,
  onFontSizeInput,
  downloadBackup,
  toggleFolderBrowser,
  onFolderBrowserListClick,
  folderBrowserGoUp,
  folderBrowserSelect,
  saveSettings,
});
