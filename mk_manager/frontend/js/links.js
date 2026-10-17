// Responsabilidade: ligações da nota aberta — cadeia de origem (proposta → spec → task),
// trilha do índice (anterior · próximo) e o painel "Cita / Citada por".
//
// A regra de resolução espelha services/links.py: um link acha a nota pelo título,
// pelo nome do arquivo (id) ou pelo caminho; link Markdown é relativo à pasta da nota.

import { st } from "./state.js";
import { esc, toast } from "./utils.js";
import { apiFetch } from "./api.js";

const STATUS_LABEL = { planning: "Planejado", development: "Em Dev", review: "Em Review", done: "Concluído" };

const stripMd = (s) => (s.toLowerCase().endsWith(".md") ? s.slice(0, -3) : s);

function normalizePath(path) {
  const out = [];
  for (const part of path.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") out.pop();
    else out.push(part);
  }
  return out.join("/");
}

export function resolveNote(target, { kind = "wiki", fromFolder = "" } = {}) {
  const notes = st.files.filter((f) => f.type !== "other");
  const key = (target || "").trim().toLowerCase();
  const byPath = (p) => notes.find((f) => stripMd(f.filename || "").toLowerCase() === p);
  const byName = (n) => notes.find((f) => f.id.toLowerCase() === n);
  const base = stripMd(key.split("/").pop() || "");
  if (kind === "md") {
    const joined = normalizePath((fromFolder ? fromFolder + "/" : "") + target);
    return byPath(stripMd(joined).toLowerCase()) || byName(base);
  }
  return (
    notes.find((f) => (f.title || f.id).trim().toLowerCase() === key) ||
    byName(stripMd(key)) ||
    byPath(stripMd(key)) ||
    byName(base)
  );
}

// ── Faixa de ligações ─────────────────────────────────────────────────────────
let _seq = 0;

function chip(ref, { current = false } = {}) {
  const role = ref.role ? `<span class="lk-role">${esc(ref.role)}</span>` : "";
  const status = ref.status
    ? `<span class="lk-status lk-st-${esc(ref.status)}">${esc(STATUS_LABEL[ref.status] || ref.status)}</span>`
    : "";
  const icon = ref.type === "task" ? "task_alt" : "description";
  const attrs = current ? 'class="lk-chip current"' : `class="lk-chip" data-open="${esc(ref.id)}" title="Abrir"`;
  return `<span ${attrs}><span class="ms">${icon}</span>${role}<span class="lk-title">${esc(ref.title)}</span>${status}</span>`;
}

function renderChain(data, self) {
  if (!data.ancestors.length && !data.children.length) return "";
  const path = [...data.ancestors.map((r) => chip(r)), chip(self, { current: true })].join(
    '<span class="lk-sep ms">chevron_right</span>',
  );
  const kids = data.children.length
    ? `<span class="lk-label">Derivadas</span>${data.children.map((r) => chip(r)).join("")}`
    : "";
  return `<div class="lk-row"><span class="lk-label">Cadeia</span>${path}${kids}</div>`;
}

function renderTrails(data) {
  return data.trails
    .map((t) => {
      const prev = t.prev
        ? `<button class="lk-nav" data-open="${esc(t.prev.id)}"><span class="ms">chevron_left</span>${esc(t.prev.title)}</button>`
        : '<span class="lk-nav disabled"></span>';
      const next = t.next
        ? `<button class="lk-nav" data-open="${esc(t.next.id)}">${esc(t.next.title)}<span class="ms">chevron_right</span></button>`
        : '<span class="lk-nav disabled"></span>';
      return `<div class="lk-row lk-trail">${prev}<span class="lk-chip" data-open="${esc(t.index.id)}" title="Abrir o índice"><span class="ms">format_list_numbered</span>${esc(t.index.title)} · ${t.position} de ${t.total}</span>${next}</div>`;
    })
    .join("");
}

function renderRefs(data) {
  const out = data.outgoing.map((r) => chip(r)).join("");
  const missing = data.missing
    .map((m) => `<span class="lk-chip missing" title="Nota não encontrada">${esc(m)}</span>`)
    .join("");
  const back = data.backlinks.map((r) => chip(r)).join("");
  const total = data.outgoing.length + data.missing.length + data.backlinks.length;
  if (!total) return "";
  const open = localStorage.getItem("mk-links-open") === "1" ? " open" : "";
  return `<details class="lk-refs"${open}>
    <summary>Cita ${data.outgoing.length + data.missing.length} · Citada por ${data.backlinks.length}</summary>
    ${out || missing ? `<div class="lk-row"><span class="lk-label">Cita</span>${out}${missing}</div>` : ""}
    ${back ? `<div class="lk-row"><span class="lk-label">Citada por</span>${back}</div>` : ""}
  </details>`;
}

function renderDerive(self) {
  return `<div class="lk-derive" id="lk-derive" hidden>
    <input id="lk-derive-title" class="meta-input" placeholder="Título da nova nota" autocomplete="off">
    <select id="lk-derive-type" class="meta-input"><option value="note">Nota</option><option value="task">Task</option></select>
    <input id="lk-derive-role" class="meta-input" list="role-list" placeholder="Papel (ex.: spec)" autocomplete="off">
    <button class="btn btn-primary btn-sm" onclick="createDerived()">Criar</button>
    <button class="btn btn-ghost btn-sm" onclick="toggleDeriveForm(false)">Cancelar</button>
    <span class="lk-hint">Nasce com origem nesta nota, na pasta do papel (se existir) ou em "${esc(self.folder || "raiz")}".</span>
  </div>`;
}

export async function refreshLinksBar() {
  const bar = document.getElementById("links-bar");
  if (!bar) return;
  const self = st.files.find((f) => f.id === st.activeId);
  if (!self || self.type === "other") {
    bar.hidden = true;
    return;
  }
  const seq = ++_seq;
  let data;
  try {
    data = await (await apiFetch(`/links/${encodeURIComponent(st.activeId)}`)).json();
  } catch {
    return;
  }
  if (seq !== _seq) return; // outra nota foi aberta enquanto esperava
  const selfRef = { ...self, role: self.role || (self.folder || "").split("/").pop() };
  bar.innerHTML =
    renderChain(data, selfRef) +
    renderTrails(data) +
    `<div class="lk-row lk-actions">${renderRefs(data)}
      <button class="btn btn-ghost btn-sm" onclick="toggleDeriveForm(true)" title="Criar uma nota ou task com origem nesta (ex.: proposta → spec → task)">
        <span class="ms">add_link</span>Derivar
      </button></div>` +
    renderDerive(self);
  bar.hidden = false;
  bar.querySelectorAll("[data-open]").forEach((el) => {
    el.onclick = () => window.openFile(el.dataset.open);
  });
  bar.querySelector("details.lk-refs")?.addEventListener("toggle", (e) => {
    try {
      localStorage.setItem("mk-links-open", e.target.open ? "1" : "0");
    } catch {}
  });
}

// Próximo passo comum da cadeia, para já vir preenchido: proposta → spec → task.
const NEXT_STEP = { proposta: { role: "spec", type: "note" }, spec: { role: "", type: "task" } };

const roleOf = (f) => (f.role || (f.folder || "").split("/").pop() || "").toLowerCase();

export function toggleDeriveForm(show) {
  const form = document.getElementById("lk-derive");
  if (!form) return;
  form.hidden = !show;
  if (!show) return;
  const self = st.files.find((f) => f.id === st.activeId);
  const next = self && NEXT_STEP[roleOf(self)];
  if (next) {
    document.getElementById("lk-derive-role").value = next.role;
    document.getElementById("lk-derive-type").value = next.type;
  }
  fillLinkSuggestions();
  document.getElementById("lk-derive-title")?.focus();
}

// Pasta da nota derivada: a pasta com o nome do papel, se existir (spec → spec/); senão a da origem.
function folderForRole(role, fallback) {
  if (!role) return fallback;
  const folders = [...st.knownFolders].filter((f) => f.split("/").pop().toLowerCase() === role.toLowerCase());
  return folders.find((f) => f.startsWith(fallback.split("/")[0])) || folders[0] || fallback;
}

export async function createDerived() {
  const self = st.files.find((f) => f.id === st.activeId);
  const title = document.getElementById("lk-derive-title")?.value.trim();
  if (!self || !title) return toast("Dê um título à nova nota.", "error");
  const type = document.getElementById("lk-derive-type")?.value || "note";
  const role = document.getElementById("lk-derive-role")?.value.trim() || "";
  try {
    const r = await apiFetch("/files", {
      method: "POST",
      body: JSON.stringify({
        title,
        type,
        role,
        folder: folderForRole(role, self.folder || ""),
        origin: `[[${self.title || self.id}]]`,
        content: "",
      }),
    });
    const file = await r.json();
    st.files.unshift(file);
    await window.openFile(file.id);
    toast(`"${title}" criada a partir de "${self.title}".`, "success");
  } catch (e) {
    toast("Erro ao criar: " + e.message, "error");
  }
}

// Sugestões dos campos Origem e Papel (datalists), montadas na hora a partir das notas.
export function fillLinkSuggestions() {
  const titles = document.getElementById("note-titles-list");
  if (titles) {
    titles.innerHTML = st.files
      .filter((f) => f.type !== "other" && f.id !== st.activeId)
      .map((f) => `<option value="[[${esc(f.title || f.id)}]]">`)
      .join("");
  }
  const roles = document.getElementById("role-list");
  if (roles) {
    const known = new Set(["proposta", "spec", "referência", "runbook", "inventário", "decisão"]);
    st.files.forEach((f) => f.role && known.add(f.role));
    roles.innerHTML = [...known].map((r) => `<option value="${esc(r)}">`).join("");
  }
}

Object.assign(window, { toggleDeriveForm, createDerived, fillLinkSuggestions });
