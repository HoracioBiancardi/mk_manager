// Responsabilidade: tela inicial do painel principal (nenhuma nota aberta) — atalhos para
// criar, recentes e prazos próximos, no lugar do antigo "Selecione um arquivo".

import { st } from "./state.js";
import { esc, timeAgo, dueInfo } from "./utils.js";
import { apiFetch } from "./api.js";

let _notesDir = null; // só admin lê /settings; para os demais a linha mostra só os totais

async function loadNotesDir() {
  if (_notesDir !== null) return _notesDir;
  try {
    _notesDir = (await (await apiFetch("/settings/")).json()).notes_dir || "";
  } catch {
    _notesDir = "";
  }
  return _notesDir;
}

function itemHtml(f, right) {
  const icon = f.type === "task" ? "task_alt" : "description";
  return `<button class="home-item" type="button" onclick="openFile('${esc(f.id)}')">
    <span class="ms" aria-hidden="true">${icon}</span>
    <span class="home-item-title">${esc(f.title || "Sem título")}</span>
    ${f.folder ? `<span class="home-item-folder">${esc(f.folder)}</span>` : ""}
    <span class="home-item-right">${right}</span>
  </button>`;
}

export async function renderHome() {
  const recentEl = document.getElementById("home-recent");
  const dueEl = document.getElementById("home-due");
  if (!recentEl || !dueEl) return;

  const recent = st.files
    .filter((f) => f.type !== "other")
    .slice()
    .sort((a, b) => (b.modified || "").localeCompare(a.modified || ""))
    .slice(0, 6);
  recentEl.innerHTML = recent.length
    ? recent.map((f) => itemHtml(f, esc(timeAgo(f.modified)))).join("")
    : '<p class="home-empty">Nada ainda. Crie a primeira nota.</p>';

  const due = st.files
    .filter((f) => f.type === "task" && f.due_date && f.status !== "done")
    .sort((a, b) => a.due_date.localeCompare(b.due_date))
    .slice(0, 6);
  dueEl.innerHTML = due.length
    ? due
        .map((f) => {
          const d = dueInfo(f.due_date);
          return itemHtml(f, `<span class="due-chip ${d.tone}" title="${esc(d.full)}">${esc(d.label)}</span>`);
        })
        .join("")
    : '<p class="home-empty">Nenhuma task aberta com prazo.</p>';

  const notas = st.files.filter((f) => f.type === "note").length;
  const tasks = st.files.filter((f) => f.type === "task").length;
  document.getElementById("home-counts").textContent = `${notas} notas · ${tasks} tasks`;
  const dir = await loadNotesDir();
  const dirEl = document.getElementById("home-notes-dir");
  dirEl.innerHTML = dir ? `Notas em <code class="path-hint">${esc(dir)}</code> · ` : "";
}
