// Responsabilidade: busca rápida de arquivos (Ctrl+K) — abre qualquer nota/task
// sem precisar navegar pela árvore de pastas. Sem texto digitado, mostra os
// arquivos mais recentes; com texto, busca full-text (título + tags + conteúdo,
// com trecho) no backend, igual ao que a tela de Busca já faz.

import { st } from "./state.js";
import { esc } from "./utils.js";
import { apiFetch } from "./api.js";
import { openFile } from "./files.js";

let _matches = [];
let _activeIndex = 0;
let _searchTimer = null;
let _requestToken = 0;

const overlay = () => document.getElementById("quickopen-overlay");
const input = () => document.getElementById("quickopen-input");
const list = () => document.getElementById("quickopen-list");

export function openQuickOpen() {
  overlay().classList.add("open");
  input().value = "";
  renderRecent();
  requestAnimationFrame(() => input().focus());
}

export function closeQuickOpen() {
  overlay().classList.remove("open");
  clearTimeout(_searchTimer);
}

export function onQuickOpenOverlayClick(e) {
  if (e.target === overlay()) closeQuickOpen();
}

function renderMatches(matches) {
  _matches = matches;
  _activeIndex = 0;
  list().innerHTML = _matches.length
    ? _matches
        .map(
          (f, i) => `<div class="quickopen-item${i === 0 ? " active" : ""}" onclick="selectQuickOpen(${i})">
            <span class="quickopen-type ${f.type}">${f.type === "task" ? "☑" : "📝"}</span>
            <div class="quickopen-main">
              <div class="quickopen-title-row">
                <span class="quickopen-title">${esc(f.title || "Sem título")}</span>
                ${f.folder ? `<span class="quickopen-folder">${esc(f.folder)}</span>` : ""}
              </div>
              ${f.snippet ? `<div class="quickopen-snippet">${esc(f.snippet)}</div>` : ""}
            </div>
          </div>`,
        )
        .join("")
    : `<div class="quickopen-empty">Nenhum arquivo encontrado.</div>`;
}

function renderRecent() {
  renderMatches(st.files.slice(0, 30));
}

async function renderSearch(q) {
  const token = ++_requestToken;
  try {
    const r = await apiFetch(`/search?q=${encodeURIComponent(q)}`);
    const results = await r.json();
    if (token !== _requestToken) return; // resposta de uma busca antiga, descarta
    renderMatches(results.slice(0, 30));
  } catch {
    if (token === _requestToken) renderMatches([]);
  }
}

export function onQuickOpenInput() {
  const q = input().value.trim();
  clearTimeout(_searchTimer);
  if (!q) {
    renderRecent();
    return;
  }
  _searchTimer = setTimeout(() => renderSearch(q), 200);
}

function setActive(idx) {
  const items = list().querySelectorAll(".quickopen-item");
  if (!items.length) return;
  _activeIndex = (idx + items.length) % items.length;
  items.forEach((el, i) => el.classList.toggle("active", i === _activeIndex));
  items[_activeIndex].scrollIntoView({ block: "nearest" });
}

export async function onQuickOpenKeydown(e) {
  if (e.key === "ArrowDown") {
    e.preventDefault();
    setActive(_activeIndex + 1);
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    setActive(_activeIndex - 1);
  } else if (e.key === "Enter") {
    e.preventDefault();
    await selectQuickOpen(_activeIndex);
  } else if (e.key === "Escape") {
    e.preventDefault();
    closeQuickOpen();
  }
}

export async function selectQuickOpen(idx) {
  const f = _matches[idx];
  if (!f) return;
  closeQuickOpen();
  await openFile(f.id);
}

// ── Expor ao DOM (necessário para event handlers inline) ──────────────────────
Object.assign(window, {
  openQuickOpen,
  closeQuickOpen,
  onQuickOpenOverlayClick,
  onQuickOpenInput,
  onQuickOpenKeydown,
  selectQuickOpen,
});
