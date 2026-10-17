// Responsabilidade: página Ligações (tela cheia) — as cadeias de origem
// (proposta → spec → task, documento → runbook → task) e os índices de leitura,
// com o status das tasks em cada ponto. Só aparece o que está ligado: nota solta
// (nota pessoal) fica de fora.

import { st } from "./state.js";
import { esc, toast } from "./utils.js";
import { apiFetch } from "./api.js";

const STATUS_LABEL = { planning: "Planejado", development: "Em Dev", review: "Em Review", done: "Concluído" };

let _data = null;
let _search = "";
let _folder = "";
let _openOnly = false;

function nodeRow(n) {
  const ref = n.note;
  const icon = ref.type === "task" ? "task_alt" : "description";
  const role = ref.role ? `<span class="lk-role">${esc(ref.role)}</span>` : "";
  const status =
    ref.type === "task"
      ? `<span class="lk-status lk-st-${esc(ref.status || "none")}">${esc(STATUS_LABEL[ref.status] || ref.status || "Sem status")}</span>`
      : "";
  const progress =
    ref.type !== "task" && n.tasks_total
      ? `<span class="lm-progress" title="Tasks nesta cadeia: ${n.tasks_done} de ${n.tasks_total} concluídas">
          <span class="lm-bar"><span style="width:${Math.round((n.tasks_done / n.tasks_total) * 100)}%"></span></span>
          ${n.tasks_done}/${n.tasks_total}
        </span>`
      : "";
  const match = _search && (ref.title || "").toLowerCase().includes(_search) ? " match" : "";
  return `<div class="lm-row${match}" data-open="${esc(ref.id)}" title="${esc(ref.folder || "raiz")}">
    <span class="ms">${icon}</span>${role}<span class="lm-title">${esc(ref.title)}</span>${status}${progress}
  </div>`;
}

function nodeTree(n) {
  const kids = n.children.length ? `<div class="lm-children">${n.children.map(nodeTree).join("")}</div>` : "";
  return `<div class="lm-node">${nodeRow(n)}${kids}</div>`;
}

function walk(n, fn) {
  if (fn(n)) return true;
  return n.children.some((c) => walk(c, fn));
}

function keep(n) {
  if (_openOnly && !(n.tasks_total > n.tasks_done)) return false;
  if (_folder && !walk(n, (x) => x.note.folder === _folder || x.note.folder.startsWith(_folder + "/"))) return false;
  if (_search && !walk(n, (x) => (x.note.title || "").toLowerCase().includes(_search))) return false;
  return true;
}

function render() {
  const el = document.getElementById("links-map");
  if (!el || !_data) return;
  const chains = _data.chains.filter(keep);
  const indexes = _data.indexes
    .filter((ix) => !_folder || ix.index.folder === _folder || ix.index.folder.startsWith(_folder + "/"))
    .filter((ix) => !_search || (ix.index.title || "").toLowerCase().includes(_search) || ix.steps.some(keep))
    .filter((ix) => !_openOnly || ix.steps.some((s) => s.tasks_total > s.tasks_done));

  const chainCards = chains
    .map((n) => `<div class="lm-card">${nodeTree(n)}</div>`)
    .join("");
  const indexCards = indexes
    .map(
      (ix) => `<div class="lm-card">
        <div class="lm-card-head" data-open="${esc(ix.index.id)}"><span class="ms">format_list_numbered</span>${esc(ix.index.title)}</div>
        <ol class="lm-steps">${ix.steps.map((s) => `<li>${nodeTree(s)}</li>`).join("")}</ol>
      </div>`,
    )
    .join("");

  const empty = (what) => `<div class="lm-empty">${what}</div>`;
  el.innerHTML = `
    <section class="lm-section">
      <h3 class="lm-h">Índices <span>ordem de leitura</span></h3>
      ${indexCards ? `<div class="lm-grid">${indexCards}</div>` : empty("Nenhum índice. Marque uma nota como <strong>Índice</strong> no editor: a ordem dos links das listas e tabelas dela vira a trilha.")}
    </section>
    <section class="lm-section">
      <h3 class="lm-h">Cadeias <span>de onde cada nota e task saiu</span></h3>
      ${chainCards ? `<div class="lm-grid">${chainCards}</div>` : empty("Nenhuma cadeia. Preencha a <strong>Origem</strong> de uma nota, ou use <strong>Derivar</strong> na faixa de ligações, para ligar proposta → spec → task.")}
    </section>`;

  el.querySelectorAll("[data-open]").forEach((row) => {
    row.onclick = () => window.openFile(row.dataset.open);
  });
}

function fillFolderFilter() {
  const sel = document.getElementById("links-map-folder");
  if (!sel || !_data) return;
  const folders = new Set();
  const add = (n) => {
    if (n.note.folder) folders.add(n.note.folder);
    n.children.forEach(add);
  };
  _data.chains.forEach(add);
  _data.indexes.forEach((ix) => {
    if (ix.index.folder) folders.add(ix.index.folder);
    ix.steps.forEach(add);
  });
  sel.innerHTML =
    '<option value="">Todas as pastas</option>' +
    [...folders].sort().map((f) => `<option value="${esc(f)}"${f === _folder ? " selected" : ""}>${esc(f)}</option>`).join("");
}

export async function renderLinksMap() {
  const el = document.getElementById("links-map");
  if (!el) return;
  if (!_data) el.innerHTML = '<div class="lm-empty">Carregando…</div>';
  try {
    _data = await (await apiFetch("/links/map")).json();
  } catch (e) {
    toast("Erro ao carregar as ligações: " + e.message, "error");
    return;
  }
  fillFolderFilter();
  render();
}

export function refreshLinksMapIfActive() {
  if (st.mainView === "links") renderLinksMap();
}

export function setLinksMapSearch(v) {
  _search = (v || "").trim().toLowerCase();
  render();
}

export function setLinksMapFolder(v) {
  _folder = v || "";
  render();
}

export function toggleLinksMapOpenOnly() {
  _openOnly = !_openOnly;
  document.getElementById("links-map-open-btn")?.classList.toggle("active", _openOnly);
  render();
}

Object.assign(window, { setLinksMapSearch, setLinksMapFolder, toggleLinksMapOpenOnly });
