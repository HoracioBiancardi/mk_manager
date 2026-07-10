// Responsabilidade: modal de configurações (pasta de notas, backup, preferências de edição)

import { esc, toast } from "./utils.js";
import { apiFetch } from "./api.js";
import { loadFiles } from "./files.js";
import { applyEditorFontSize, getDefaultView, getEditorFontSize, setDefaultView, setEditorFontSize, getCrtScanlines, setCrtScanlines, getCrtFlicker, setCrtFlicker, getCrtTheme, setCrtTheme, getCrtStatic, setCrtStatic, getCrtCurved, setCrtCurved, getCrtTransition, setCrtTransition, getSfxEnabled, setSfxEnabled, getCrtOpacity, setCrtOpacity, getCrtRadar, setCrtRadar } from "./prefs.js";

let _assetsDirLoaded = "";
let _assetsDirWasDefault = true;

export async function openSettingsModal() {
  document.getElementById("settings-overlay").classList.add("open");
  document.getElementById("settings-notes-dir").value = "Carregando…";
  document.getElementById("settings-assets-dir").value = "";
  document.getElementById("settings-server-info").textContent = "–";
  document.getElementById("settings-storage-info").textContent = "–";
  document.getElementById("settings-default-view").value = getDefaultView();
  document.getElementById("settings-font-size").value = getEditorFontSize();
  document.getElementById("settings-font-size-label").textContent = `${getEditorFontSize()}px`;
  
  // Inicializa inputs de aparência do Pip-Boy
  document.getElementById("settings-scanlines").checked = getCrtScanlines();
  document.getElementById("settings-flicker").checked = getCrtFlicker();
  document.getElementById("settings-static").checked = getCrtStatic();
  document.getElementById("settings-curved").checked = getCrtCurved();
  document.getElementById("settings-transition").checked = getCrtTransition();
  document.getElementById("settings-radar-sweep").checked = getCrtRadar();
  document.getElementById("settings-sfx").checked = getSfxEnabled();
  document.getElementById("settings-crt-opacity").value = getCrtOpacity();
  document.getElementById("settings-crt-opacity-label").textContent = `${Math.round(getCrtOpacity() * 100)}%`;
  document.getElementById("settings-theme").value = getCrtTheme();

  try {
    const [settingsRes, statsRes] = await Promise.all([
      apiFetch("/settings"),
      apiFetch("/stats"),
    ]);
    const settingsData = await settingsRes.json();
    const stats = await statsRes.json();

    document.getElementById("settings-notes-dir").value = settingsData.notes_dir;
    _assetsDirWasDefault = settingsData.assets_dir_is_default;
    _assetsDirLoaded = settingsData.assets_dir;
    document.getElementById("settings-assets-dir").value = _assetsDirWasDefault
      ? ""
      : _assetsDirLoaded;
    document.getElementById("settings-assets-dir").placeholder =
      `Padrão: ${settingsData.assets_dir}`;
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
let _browseTarget = "notes";

export async function toggleFolderBrowser(target = "notes") {
  const panel = document.getElementById("folder-browser");
  const targetInput = document.getElementById(
    target === "assets" ? "settings-assets-dir" : "settings-notes-dir",
  );
  const opening = panel.style.display === "none" || _browseTarget !== target;
  _browseTarget = target;
  panel.style.display = opening ? "block" : "none";
  if (opening) {
    document.getElementById("folder-browser-target").textContent =
      target === "assets" ? "Selecionando: pasta dos assets" : "Selecionando: pasta dos arquivos";
    const current = targetInput.value.trim();
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
  const targetId =
    _browseTarget === "assets" ? "settings-assets-dir" : "settings-notes-dir";
  document.getElementById(targetId).value = _browsePath;
  document.getElementById("folder-browser").style.display = "none";
}

export async function saveSettings() {
  const input = document.getElementById("settings-notes-dir");
  const notesDir = input.value.trim();
  if (!notesDir) {
    toast("Informe uma pasta válida.", "info");
    return;
  }

  const assetsInput = document.getElementById("settings-assets-dir").value.trim();
  let assetsDir; // undefined = não enviar (mantém como está)
  if (_assetsDirWasDefault) {
    if (assetsInput && assetsInput !== _assetsDirLoaded) assetsDir = assetsInput;
  } else {
    assetsDir = assetsInput; // "" reseta para o padrão; valor novo troca o override
  }

  setDefaultView(document.getElementById("settings-default-view").value);
  setEditorFontSize(parseInt(document.getElementById("settings-font-size").value, 10));

  const btn = document.getElementById("settings-save-btn");
  btn.disabled = true;
  try {
    const r = await apiFetch("/settings", {
      method: "PUT",
      body: JSON.stringify({
        notes_dir: notesDir,
        ...(assetsDir !== undefined ? { assets_dir: assetsDir } : {}),
      }),
    });
    const updated = await r.json();
    input.value = updated.notes_dir;
    _assetsDirWasDefault = updated.assets_dir_is_default;
    _assetsDirLoaded = updated.assets_dir;
    document.getElementById("settings-assets-dir").value = _assetsDirWasDefault
      ? ""
      : _assetsDirLoaded;
    document.getElementById("settings-assets-dir").placeholder =
      `Padrão: ${updated.assets_dir}`;
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
  toggleScanlines: setCrtScanlines,
  toggleFlicker: setCrtFlicker,
  toggleStatic: setCrtStatic,
  toggleCurved: setCrtCurved,
  toggleTransition: setCrtTransition,
  toggleRadar: setCrtRadar,
  toggleSfx: setSfxEnabled,
  changeCrtOpacity: setCrtOpacity,
  changeTheme: setCrtTheme,
});
