// Responsabilidade: UI do editor (textarea, toolbar, tags, footer, resize)

import { st } from "./state.js";
import { esc, toast } from "./utils.js";
import { renderPreview } from "./preview.js";

let _scheduleSave = null;
export function setSaveCallback(fn) {
  _scheduleSave = fn;
}

function scheduleSave() {
  clearTimeout(st.saveTimer);
  st.saveTimer = setTimeout(() => _scheduleSave?.(), 800);
}

function makeTableRow(cols) {
  return "|" + "  |".repeat(Math.max(1, cols));
}

function makeTableSep(cols) {
  return "|" + " --- |".repeat(Math.max(1, cols));
}

// Substitui [start, end) por text preservando o undo stack nativo do browser
function replaceRange(ta, start, end, text) {
  ta.focus();
  ta.setSelectionRange(start, end);
  if (!document.execCommand("insertText", false, text)) {
    // fallback para browsers sem suporte (perde undo mas mantém funcionalidade)
    ta.value = ta.value.slice(0, start) + text + ta.value.slice(end);
  }
}

// ── Painel ────────────────────────────────────────────────────────────────────

export function showEditorPanel() {
  document.getElementById("empty-panel").style.display = "none";
  document.getElementById("editor-area").style.display = "flex";
}

export function showEmptyPanel() {
  document.getElementById("empty-panel").style.display = "flex";
  document.getElementById("editor-area").style.display = "none";
}

// ── Visibilidade do status ─────────────────────────────────────────────────────

export function updateStatusVis(type) {
  const el = document.getElementById("status-row-part");
  if (el) el.style.display = type === "task" ? "contents" : "none";
}

// ── Tags ──────────────────────────────────────────────────────────────────────

export function renderTags(tags) {
  document.getElementById("tags-container").innerHTML = tags
    .map(
      (t, i) =>
        `<span class="tag-chip">${esc(t)}<button onclick="removeTag(${i})" title="Remover">×</button></span>`,
    )
    .join("");
  renderTagSuggestions(tags);
}

function renderTagSuggestions(activeTags) {
  const datalist = document.getElementById("tag-suggestions");
  if (!datalist) return;
  const known = new Set(st.files.flatMap((f) => f.tags || []));
  for (const t of activeTags) known.delete(t);
  datalist.innerHTML = [...known]
    .sort()
    .map((t) => `<option value="${esc(t)}"></option>`)
    .join("");
}

export function onTagKey(e) {
  if (e.key === "Enter" || e.key === ",") {
    e.preventDefault();
    const input = document.getElementById("tag-input");
    const tag = input.value.trim().replace(/,/g, "");
    if (tag && !st.activeTags.includes(tag)) {
      st.activeTags.push(tag);
      renderTags(st.activeTags);
      st.isDirty = true;
      scheduleSave();
    }
    input.value = "";
  }
  if (e.key === "Backspace" && !e.target.value && st.activeTags.length) {
    st.activeTags.pop();
    renderTags(st.activeTags);
    st.isDirty = true;
    scheduleSave();
  }
}

export function removeTag(idx) {
  st.activeTags.splice(idx, 1);
  renderTags(st.activeTags);
  st.isDirty = true;
  scheduleSave();
}

// ── Modo de visualização ──────────────────────────────────────────────────────

export function applyRatio() {
  document.getElementById("editor-pane").style.flex =
    `0 0 ${st.splitRatio * 100}%`;
  document.getElementById("preview-pane").style.flex = "1 1 0";
}

export function setView(v) {
  st.view = v;
  const ep = document.getElementById("editor-pane");
  const pp = document.getElementById("preview-pane");
  const rh = document.getElementById("resize-handle");
  ["edit", "split", "preview"].forEach((m) =>
    document.getElementById("btn-" + m).classList.toggle("active", m === v),
  );
  if (v === "edit") {
    ep.style.display = "flex";
    ep.style.flex = "1";
    pp.style.display = "none";
    rh.style.display = "none";
  } else if (v === "split") {
    ep.style.display = "flex";
    pp.style.display = "block";
    rh.style.display = "block";
    applyRatio();
    renderPreview();
  } else {
    ep.style.display = "none";
    pp.style.display = "block";
    pp.style.flex = "1";
    rh.style.display = "none";
    renderPreview();
  }
}

// ── Resize handle ─────────────────────────────────────────────────────────────

export function initResizer() {
  const handle = document.getElementById("resize-handle");
  const body = document.querySelector(".editor-body");
  let dragging = false,
    bodyRect = null;

  const startDrag = (clientX) => {
    dragging = true;
    bodyRect = body.getBoundingClientRect();
    handle.classList.add("dragging");
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };
  const moveDrag = (clientX) => {
    if (!dragging) return;
    st.splitRatio = Math.min(
      0.85,
      Math.max(0.15, (clientX - bodyRect.left) / bodyRect.width),
    );
    applyRatio();
  };
  const endDrag = () => {
    if (!dragging) return;
    dragging = false;
    handle.classList.remove("dragging");
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    if (st.splitRatio <= 0.15) {
      setView("preview");
      return;
    }
    if (st.splitRatio >= 0.85) {
      setView("edit");
      return;
    }
  };

  handle.addEventListener("mousedown", (e) => {
    startDrag(e.clientX);
    e.preventDefault();
  });
  document.addEventListener("mousemove", (e) => moveDrag(e.clientX));
  document.addEventListener("mouseup", endDrag);
  handle.addEventListener(
    "touchstart",
    (e) => {
      startDrag(e.touches[0].clientX);
      e.preventDefault();
    },
    { passive: false },
  );
  document.addEventListener(
    "touchmove",
    (e) => {
      if (dragging) {
        moveDrag(e.touches[0].clientX);
        e.preventDefault();
      }
    },
    { passive: false },
  );
  document.addEventListener("touchend", endDrag);
  handle.addEventListener("dblclick", () => {
    st.splitRatio = 0.5;
    applyRatio();
  });
}

// ── Eventos do editor ─────────────────────────────────────────────────────────

export function onEditorInput() {
  if (!st.activeId) return;
  st.isDirty = true;
  updateFooter();
  if (st.view !== "edit") renderPreview();
  setSaveStatus("saving");
  scheduleSave();
}

export function onTitleChange() {
  if (!st.activeId) return;
  st.isDirty = true;
  setSaveStatus("saving");
  scheduleSave();
}

export function onEditorKeydown(e) {
  const ta = document.getElementById("md-editor");

  // ── Tab / Shift+Tab ──────────────────────────────────────────────────────
  if (e.key === "Tab") {
    e.preventDefault();
    const pos = ta.selectionStart;
    const lineStart = ta.value.lastIndexOf("\n", pos - 1) + 1;
    const currentLine = ta.value.slice(lineStart).split("\n")[0];
    const lineEnd = lineStart + currentLine.length;
    const isTable = /^\s*\|/.test(currentLine);
    const isList = /^\s*(- \[[ x]\] |- |\* |\d+\. )/.test(currentLine);

    if (isTable) {
      // Tab: pula para a próxima célula; Shift+Tab: célula anterior
      if (e.shiftKey) {
        const beforeCursor = ta.value.slice(lineStart, pos);
        const pipes = [...beforeCursor.matchAll(/\|/g)];
        if (pipes.length >= 2) {
          const p1 = lineStart + pipes[pipes.length - 2].index + 1;
          const p2 = lineStart + pipes[pipes.length - 1].index;
          ta.setSelectionRange(p1, p2);
        }
      } else {
        const afterCursor = ta.value.slice(pos, lineEnd);
        const nextPipe = afterCursor.indexOf("|");
        if (nextPipe !== -1 && afterCursor.slice(nextPipe + 1).includes("|")) {
          // Há mais uma célula depois: seleciona conteúdo dela
          const cellStart = pos + nextPipe + 1;
          const cellEnd = ta.value.indexOf("|", cellStart);
          ta.setSelectionRange(cellStart, cellEnd !== -1 ? cellEnd : cellStart);
        } else {
          // Última célula: cria nova linha da tabela
          const cols = currentLine.split("|").length - 2;
          const newRow = makeTableRow(cols);
          replaceRange(ta, lineEnd, lineEnd, "\n" + newRow);
          ta.setSelectionRange(lineEnd + 2, lineEnd + 2);
          onEditorInput();
        }
      }
      return;
    }

    if (isList && e.shiftKey) {
      const removed = currentLine.startsWith("  ")
        ? 2
        : currentLine.startsWith(" ")
          ? 1
          : 0;
      if (removed > 0) {
        replaceRange(ta, lineStart, lineStart + removed, "");
        ta.setSelectionRange(
          Math.max(lineStart, pos - removed),
          Math.max(lineStart, pos - removed),
        );
        onEditorInput();
      }
    } else if (isList) {
      replaceRange(ta, lineStart, lineStart, "  ");
      ta.setSelectionRange(pos + 2, pos + 2);
      onEditorInput();
    } else if (!e.shiftKey) {
      replaceRange(ta, pos, ta.selectionEnd, "  ");
      ta.setSelectionRange(pos + 2, pos + 2);
      onEditorInput();
    }
    return;
  }

  // ── Ctrl+S salvar ────────────────────────────────────────────────────────
  if (e.ctrlKey && e.key === "s") {
    e.preventDefault();
    clearTimeout(st.saveTimer);
    _scheduleSave?.();
    return;
  }

  // ── Ctrl+B Bold, Ctrl+I Itálico, Ctrl+K Link ────────────────────────────
  if (e.ctrlKey && !e.shiftKey && e.key === "b") {
    e.preventDefault();
    fmt("**", "**");
    return;
  }
  if (e.ctrlKey && !e.shiftKey && e.key === "i") {
    e.preventDefault();
    fmt("*", "*");
    return;
  }
  if (e.ctrlKey && !e.shiftKey && e.key === "k") {
    e.preventDefault();
    fmt("[", "](url)");
    return;
  }

  // ── Enter: continua tabelas e listas automaticamente ────────────────────
  if (e.key === "Enter") {
    const pos = ta.selectionStart;
    const lineStart = ta.value.lastIndexOf("\n", pos - 1) + 1;
    const line = ta.value.slice(lineStart, pos);
    const fullLine = ta.value.slice(lineStart).split("\n")[0];

    // Tabela: Enter cria nova linha (ignora linha separadora)
    const isTableRow = /^\s*\|/.test(fullLine);
    const isSepRow = /^\s*\|[\s\-:|]+\|$/.test(fullLine);
    if (isTableRow && !isSepRow) {
      e.preventDefault();
      const lineEnd = lineStart + fullLine.length;
      const cols = fullLine.split("|").length - 2;

      // Se é o cabeçalho e ainda não tem separador, insere separador + linha
      const nextLine = ta.value.slice(lineEnd + 1).split("\n")[0];
      const nextIsSep = /^\s*\|[\s\-:|]+\|$/.test(nextLine);
      if (!nextIsSep && !ta.value.slice(lineEnd + 1).startsWith("|")) {
        const sep = makeTableSep(cols);
        const row = makeTableRow(cols);
        replaceRange(ta, lineEnd, ta.selectionEnd, "\n" + sep + "\n" + row);
        // Posiciona cursor na primeira célula da nova linha
        ta.setSelectionRange(
          lineEnd + sep.length + 3,
          lineEnd + sep.length + 3,
        );
      } else {
        const row = makeTableRow(cols);
        replaceRange(ta, lineEnd, ta.selectionEnd, "\n" + row);
        ta.setSelectionRange(lineEnd + 2, lineEnd + 2);
      }
      onEditorInput();
      return;
    }

    // Lista: continua com próximo item (numerada incrementa)
    const m = line.match(/^(\s*)(- \[[ x]\] |- |\* |(\d+)\. )/);
    if (m) {
      let prefix = m[0].replace(/\[x\]/, "[ ]");
      if (m[3] !== undefined) {
        // Lista numerada: incrementa o número
        prefix = m[1] + (parseInt(m[3], 10) + 1) + ". ";
      }
      if (line.trim() === m[2]?.trim() || line.trimEnd() === m[0].trimEnd()) {
        e.preventDefault();
        replaceRange(ta, lineStart, ta.selectionEnd, "\n");
        ta.setSelectionRange(lineStart + 1, lineStart + 1);
      } else {
        e.preventDefault();
        replaceRange(ta, pos, ta.selectionEnd, "\n" + prefix);
        ta.setSelectionRange(pos + 1 + prefix.length, pos + 1 + prefix.length);
      }
      onEditorInput();
    }
  }
}

// ── Toolbar ───────────────────────────────────────────────────────────────────

export function fmt(before, after) {
  const ta = document.getElementById("md-editor");
  const s = ta.selectionStart,
    e = ta.selectionEnd;
  const sel = ta.value.slice(s, e) || "texto";
  replaceRange(ta, s, e, before + sel + after);
  ta.setSelectionRange(s + before.length, s + before.length + sel.length);
  ta.focus();
  onEditorInput();
}

export function ins(text) {
  const ta = document.getElementById("md-editor");
  const pos = ta.selectionStart;
  const before = ta.value.slice(0, pos);
  const prefix = before && !before.endsWith("\n") ? "\n" + text : text;
  replaceRange(ta, pos, ta.selectionEnd, prefix);
  ta.focus();
  onEditorInput();
}

export function insTable() {
  const ta = document.getElementById("md-editor");
  const s = ta.selectionStart;
  const before = ta.value.slice(0, s);
  const prefix = before && !before.endsWith("\n") ? "\n" : "";
  const block = `${prefix}| Coluna 1 | Coluna 2 | Coluna 3 |\n| --- | --- | --- |\n| dado | dado | dado |\n| dado | dado | dado |`;
  replaceRange(ta, s, ta.selectionEnd, block);
  const headerStart = s + prefix.length + 2;
  ta.setSelectionRange(headerStart, headerStart + 8);
  ta.focus();
  onEditorInput();
}

export function insMermaid() {
  const ta = document.getElementById("md-editor");
  const s = ta.selectionStart;
  const before = ta.value.slice(0, s);
  const prefix = before && !before.endsWith("\n") ? "\n" : "";
  const block = `${prefix}\`\`\`mermaid\nflowchart TD\n    A[Início] --> B[Passo]\n    B --> C{Decisão?}\n    C -->|Sim| D[Resultado]\n    C -->|Não| E[Outro]\n\`\`\``;
  replaceRange(ta, s, ta.selectionEnd, block);
  ta.focus();
  onEditorInput();
}

export function insRaw(text) {
  const ta = document.getElementById("md-editor");
  const pos = ta.selectionStart;
  replaceRange(ta, pos, ta.selectionEnd, text);
  ta.focus();
  onEditorInput();
}

export function insCodeBlock() {
  const ta = document.getElementById("md-editor");
  const s = ta.selectionStart,
    e = ta.selectionEnd;
  const sel = ta.value.slice(s, e) || "código aqui";
  const before = ta.value.slice(0, s);
  const pfx = before && !before.endsWith("\n") ? "\n" : "";
  const block = pfx + "```\n" + sel + "\n```";
  replaceRange(ta, s, e, block);
  ta.setSelectionRange(s + pfx.length + 4, s + pfx.length + 4 + sel.length);
  ta.focus();
  onEditorInput();
}

// ── Formatar tabela (alinha colunas) ──────────────────────────────────────────

export function formatTable() {
  const ta = document.getElementById("md-editor");
  const pos = ta.selectionStart;
  const lines = ta.value.split("\n");

  // Descobre em qual linha o cursor está
  let charCount = 0,
    cursorLine = 0;
  for (let i = 0; i < lines.length; i++) {
    if (charCount + lines[i].length >= pos) {
      cursorLine = i;
      break;
    }
    charCount += lines[i].length + 1;
  }

  if (!/^\s*\|/.test(lines[cursorLine])) {
    toast("Posicione o cursor dentro de uma tabela.", "info");
    return;
  }

  // Expande para todas as linhas contíguas da tabela
  let start = cursorLine;
  while (start > 0 && /^\s*\|/.test(lines[start - 1])) start--;
  let end = cursorLine;
  while (end < lines.length - 1 && /^\s*\|/.test(lines[end + 1])) end++;

  const tableLines = lines.slice(start, end + 1);

  // Parse: split por |, remove primeiro e último vazios, trim cada célula
  const rows = tableLines.map((line) =>
    line
      .trim()
      .split("|")
      .slice(1, -1)
      .map((c) => c.trim()),
  );

  const numCols = Math.max(...rows.map((r) => r.length));

  // Largura máxima por coluna (mínimo 3 para linhas separadoras)
  const colWidths = Array(numCols).fill(3);
  rows.forEach((row) => {
    row.forEach((cell, i) => {
      if (!/^:?-+:?$/.test(cell))
        colWidths[i] = Math.max(colWidths[i], cell.length);
    });
  });

  // Reconstrói cada linha com padding
  const formatted = rows.map((row) => {
    const cells = Array.from({ length: numCols }, (_, i) => {
      const cell = row[i] ?? "";
      const isSep = /^:?-+:?$/.test(cell);
      if (isSep) {
        const L = cell.startsWith(":");
        const R = cell.endsWith(":") && cell.length > 1;
        const dashes = "-".repeat(colWidths[i] - (L ? 1 : 0) - (R ? 1 : 0));
        return (L ? ":" : "") + dashes + (R ? ":" : "");
      }
      return cell.padEnd(colWidths[i]);
    });
    return "| " + cells.join(" | ") + " |";
  });

  const tableCharStart = lines
    .slice(0, start)
    .reduce((s, l) => s + l.length + 1, 0);
  const tableCharEnd = tableCharStart + tableLines.join("\n").length;

  replaceRange(ta, tableCharStart, tableCharEnd, formatted.join("\n"));
  onEditorInput();
  toast("Tabela alinhada!", "success");
}

// ── Footer ────────────────────────────────────────────────────────────────────

export function updateFooter() {
  const content = document.getElementById("md-editor")?.value || "";
  const words = content.trim() ? content.trim().split(/\s+/).length : 0;
  document.getElementById("word-count").textContent =
    `${words} palavra${words !== 1 ? "s" : ""}`;
  const total = (content.match(/^[ \t]*- \[[ x]\] /gm) || []).length;
  const done = (content.match(/^[ \t]*- \[x\] /gm) || []).length;
  const file = st.files.find((f) => f.id === st.activeId);
  if (file?.type === "task" && total > 0) {
    document.getElementById("task-stats").textContent =
      `${done}/${total} tasks (${Math.round((done / total) * 100)}%)`;
  } else {
    document.getElementById("task-stats").textContent = "";
  }
}

export function setSaveStatus(s) {
  const el = document.getElementById("save-status");
  el.className = "save-status " + s;
  el.textContent =
    s === "saving" ? "Salvando…" : s === "error" ? "Erro ao salvar" : "Salvo";
}
