// Responsabilidade: selo "git" da barra de cima — estado do commit + push automático da pasta
// de notas (Ajustes → "é repositório git"). Erro de sync não perde a nota: só avisa aqui.

import { toast } from "./utils.js";
import { apiFetch } from "./api.js";
import { loadFiles } from "./files.js";

const POLL_MS = 5000;
const LABEL = { pending: "git: aguardando", syncing: "git: enviando", ok: "git: em dia", error: "git: erro" };
let _timer = null;
let _last = null;

function render(s) {
  const b = document.getElementById("git-badge");
  if (!b) return;
  b.hidden = !s.enabled;
  b.className = `git-badge ${s.state}`;
  b.querySelector(".git-badge-text").textContent = LABEL[s.state] || "git";
  const quando = s.last_ok_at ? `\nÚltimo sync: ${new Date(s.last_ok_at).toLocaleString()}` : "";
  b.title = `${s.message || LABEL[s.state] || ""}${quando}\nClique para sincronizar agora.`;
}

function onChange(prev, s) {
  if (s.state === "error" && (prev?.state !== "error" || prev?.message !== s.message)) {
    toast("Sync do git falhou (a nota está salva aqui): " + s.message.split("\n")[0], "error");
  }
  // Um pull pode trazer notas da outra máquina: recarrega a lista quando o sync termina.
  if (prev && prev.last_ok_at !== s.last_ok_at && s.state === "ok") loadFiles().catch(() => {});
}

export async function refreshGitStatus() {
  try {
    const s = await (await apiFetch("/sync/status")).json();
    onChange(_last, s);
    _last = s;
    render(s);
  } catch { /* sem sessão/offline: o selo de conexão já avisa */ }
}

export function startGitStatusPolling() {
  if (_timer) return;
  refreshGitStatus();
  _timer = setInterval(refreshGitStatus, POLL_MS);
}

async function onGitBadgeClick() {
  if (document.getElementById("settings-admin-dirs")?.hidden) {
    if (_last?.message) toast(_last.message, _last.state === "error" ? "error" : "info");
    return;
  }
  render({ ...(_last || {}), enabled: true, state: "syncing" });
  try {
    const s = await (await apiFetch("/sync/now", { method: "POST" })).json();
    onChange(_last, s);
    _last = s;
    render(s);
    if (s.state === "ok") toast(s.message || "Sincronizado.", "success");
  } catch (e) {
    toast("Erro ao sincronizar: " + e.message, "error");
    refreshGitStatus();
  }
}

Object.assign(window, { onGitBadgeClick });
