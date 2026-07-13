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
export function replaceRange(ta, start, end, text) {
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
  const datesEl = document.getElementById("task-dates-part");
  if (datesEl) datesEl.style.display = type === "task" ? "contents" : "none";
  const archiveBtn = document.getElementById("btn-archive-current");
  if (archiveBtn) archiveBtn.style.display = type === "task" ? "" : "none";
}

// ── Tags ──────────────────────────────────────────────────────────────────────

// ── Tags ──────────────────────────────────────────────────────────────────────

export function renderTags(tags) {
  document.getElementById("tags-container").innerHTML = tags
    .map(
      (t, i) =>
        `<span class="tag-chip">${esc(t)}<button onclick="removeTag(${i})" title="Remover">×</button></span>`,
    )
    .join("");
  
  const dropdown = document.getElementById("retro-tag-suggestions");
  if (dropdown && dropdown.classList.contains("open")) {
    rebuildRetroTagSuggestions();
  }
}

export function showRetroTagSuggestions() {
  const dropdown = document.getElementById("retro-tag-suggestions");
  if (!dropdown) return;
  rebuildRetroTagSuggestions();
  dropdown.classList.add("open");
}

export function closeRetroTagSuggestions() {
  const dropdown = document.getElementById("retro-tag-suggestions");
  if (dropdown) dropdown.classList.remove("open");
}

export function selectRetroTag(tag) {
  const input = document.getElementById("tag-input");
  if (tag && !st.activeTags.includes(tag)) {
    st.activeTags.push(tag);
    renderTags(st.activeTags);
    st.isDirty = true;
    scheduleSave();
  }
  if (input) {
    input.value = "";
    input.focus();
  }
  closeRetroTagSuggestions();
}

export function filterRetroTagSuggestions() {
  rebuildRetroTagSuggestions();
}

function rebuildRetroTagSuggestions() {
  const dropdown = document.getElementById("retro-tag-suggestions");
  const input = document.getElementById("tag-input");
  if (!dropdown || !input) return;

  const val = input.value.trim().toLowerCase();
  const known = new Set(st.files.flatMap((f) => f.tags || []));
  for (const t of st.activeTags) known.delete(t);

  const filtered = [...known]
    .sort()
    .filter((t) => !val || t.toLowerCase().includes(val));

  if (filtered.length === 0) {
    dropdown.innerHTML = `<div class="retro-tag-suggestion-item" style="cursor: default; color: var(--text-subtle);">Nenhuma sugestão</div>`;
  } else {
    dropdown.innerHTML = filtered
      .map(
        (t) =>
          `<div class="retro-tag-suggestion-item" onclick="selectRetroTag('${esc(t)}')">${esc(t)}</div>`,
      )
      .join("");
  }
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
    closeRetroTagSuggestions();
  }
  if (e.key === "Backspace" && !e.target.value && st.activeTags.length) {
    st.activeTags.pop();
    renderTags(st.activeTags);
    st.isDirty = true;
    scheduleSave();
    showRetroTagSuggestions();
  }
  if (e.key === "Escape") {
    closeRetroTagSuggestions();
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

// ── Preview → editor: navega até a linha de origem correspondente ─────────────

export function jumpToSourceLine(lineNumber) {
  if (st.view === "preview") setView("split");
  const ta = document.getElementById("md-editor");
  const lines = ta.value.split("\n");
  let pos = 0;
  for (let i = 0; i < lineNumber && i < lines.length; i++) {
    pos += lines[i].length + 1;
  }
  ta.focus();
  ta.setSelectionRange(pos, pos);
  const lineHeight = parseFloat(getComputedStyle(ta).lineHeight) || 20;
  ta.scrollTop = Math.max(0, lineHeight * lineNumber - ta.clientHeight / 2);
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
  checkWikiLinkAutocomplete();
}

export function onTitleChange() {
  if (!st.activeId) return;
  st.isDirty = true;
  setSaveStatus("saving");
  scheduleSave();
}

export function onEditorKeydown(e) {
  const ta = document.getElementById("md-editor");

  // ── Autocomplete [[ Wiki-Links ───────────────────────────────────────────
  if (_wikiActive) {
    const dropdown = document.getElementById("wiki-link-suggestions");
    const items = dropdown ? dropdown.querySelectorAll(".wiki-link-item") : [];
    
    if (e.key === "ArrowDown") {
      e.preventDefault();
      _wikiSelectedIdx = (_wikiSelectedIdx + 1) % items.length;
      showWikiLinkSuggestions();
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      _wikiSelectedIdx = (_wikiSelectedIdx - 1 + items.length) % items.length;
      showWikiLinkSuggestions();
      return;
    }
    if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      const selectedItem = dropdown ? dropdown.querySelector(".wiki-link-item.selected") : null;
      if (selectedItem) {
        selectedItem.click();
      } else {
        hideWikiLinkSuggestions();
      }
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      hideWikiLinkSuggestions();
      return;
    }
  }

  // ── Tab / Shift+Tab ──────────────────────────────────────────────────────
  if (e.key === "Tab") {
    e.preventDefault();
    const pos = ta.selectionStart;
    const selEnd = ta.selectionEnd;
    const lineStart = ta.value.lastIndexOf("\n", pos - 1) + 1;
    const currentLine = ta.value.slice(lineStart).split("\n")[0];
    const lineEnd = lineStart + currentLine.length;
    const isTable = /^\s*\|/.test(currentLine);
    const isList = /^\s*(- \[[ x]\] |- |\* |\d+\. )/.test(currentLine);

    // Seleção cobrindo várias linhas: indenta/desindenta o bloco inteiro em
    // vez de substituir a seleção inteira por 2 espaços (o que apagava as
    // linhas selecionadas).
    const isMultiLine = pos !== selEnd && ta.value.slice(pos, selEnd).includes("\n");
    if (isMultiLine && !isTable) {
      const blockStart = lineStart;
      let blockEnd = selEnd;
      // Se a seleção termina bem no início de uma linha (ex.: shift+down),
      // essa última linha não entra no bloco a indentar.
      if (blockEnd > blockStart && ta.value[blockEnd - 1] === "\n") blockEnd -= 1;
      const lines = ta.value.slice(blockStart, blockEnd).split("\n");
      const newLines = e.shiftKey
        ? lines.map((l) => l.replace(/^(  |\t| )/, ""))
        : lines.map((l) => "  " + l);
      const newBlock = newLines.join("\n");
      replaceRange(ta, blockStart, blockEnd, newBlock);
      ta.setSelectionRange(blockStart, blockStart + newBlock.length);
      onEditorInput();
      return;
    }

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
  if (s === "saved") {
    // className foi resetado acima, então forçar reflow antes de adicionar
    // "pulse" garante que a animação reinicia mesmo em saves consecutivos.
    void el.offsetWidth;
    el.classList.add("pulse");
  }
}

// ── Expor ao DOM (necessário para event handlers inline) ──────────────────────
Object.assign(window, {
  onEditorInput,
  onTitleChange,
  onEditorKeydown,
  onTagKey,
  removeTag,
  fmt,
  ins,
  insCodeBlock,
  insTable,
  formatTable,
  setView,
  toggleRetroSelect,
  closeAllRetroSelects,
  selectRetroOption,
  updateRetroStatusLabel,
  showRetroTagSuggestions,
  selectRetroTag,
  filterRetroTagSuggestions,
  updateTaskDuration,
  insertWikiLink,
});

export function updateTaskDuration() {
  const execVal = document.getElementById("date-execution")?.value;
  const conclVal = document.getElementById("date-conclusion")?.value;
  const badge = document.getElementById("task-duration-badge");
  if (!badge) return;

  if (execVal && conclVal) {
    const execDate = new Date(execVal);
    const conclDate = new Date(conclVal);
    const diffMs = conclDate - execDate;
    if (diffMs >= 0) {
      const diffHours = diffMs / (1000 * 60 * 60);
      const formatted = diffHours % 1 === 0 ? diffHours : diffHours.toFixed(1);
      badge.textContent = `⏱ ${formatted}h`;
      badge.style.display = "inline-flex";
      return;
    }
  }
  badge.style.display = "none";
}

/* ── Custom select dropdown functions (Pip-Boy themed status selector) ── */
export function toggleRetroSelect(event) {
  event.stopPropagation();
  const dropdown = document.getElementById("retro-status-dropdown");
  if (!dropdown) return;
  const isOpen = dropdown.classList.contains("open");
  closeAllRetroSelects();
  if (!isOpen) {
    rebuildRetroSelectOptions();
    dropdown.classList.add("open");
  }
}

export function closeAllRetroSelects() {
  const dropdown = document.getElementById("retro-status-dropdown");
  if (dropdown) dropdown.classList.remove("open");
}

export function selectRetroOption(value, text) {
  const sel = document.getElementById("status-select");
  if (sel) {
    sel.value = value;
    sel.dispatchEvent(new Event("change"));
  }
  updateRetroStatusLabel();
  closeAllRetroSelects();
}

export function updateRetroStatusLabel() {
  const sel = document.getElementById("status-select");
  const labelEl = document.getElementById("retro-status-label");
  if (sel && labelEl) {
    const selectedOption = sel.options[sel.selectedIndex];
    labelEl.textContent = selectedOption ? selectedOption.textContent : "—";
  }
}

function rebuildRetroSelectOptions() {
  const sel = document.getElementById("status-select");
  const dropdown = document.getElementById("retro-status-dropdown");
  if (!sel || !dropdown) return;
  
  const curValue = sel.value;
  dropdown.innerHTML = Array.from(sel.options).map(opt => {
    const isSelected = opt.value === curValue;
    return `<div class="retro-select-option ${isSelected ? "selected" : ""}" 
                 onclick="selectRetroOption('${esc(opt.value)}', '${esc(opt.textContent)}')">
              ${esc(opt.textContent)}
            </div>`;
  }).join("");
}

document.addEventListener("click", (e) => {
  closeAllRetroSelects();
  
  if (!e.target.closest(".retro-tag-input-wrap")) {
    closeRetroTagSuggestions();
  }
});

// ── Lógica de Autocomplete de Wiki-Links ──────────────────────────────────────
let _wikiActive = false;
let _wikiStartIndex = -1;
let _wikiQuery = "";
let _wikiSelectedIdx = 0;

export function checkWikiLinkAutocomplete() {
  const ta = document.getElementById("md-editor");
  if (!ta) return;
  const pos = ta.selectionStart;
  const textBefore = ta.value.slice(0, pos);
  const lastDoubleOpen = textBefore.lastIndexOf("[[");
  
  if (lastDoubleOpen !== -1) {
    const textAfterOpen = textBefore.slice(lastDoubleOpen + 2);
    if (!textAfterOpen.includes("]]") && !textAfterOpen.includes("\n")) {
      _wikiActive = true;
      _wikiStartIndex = lastDoubleOpen;
      _wikiQuery = textAfterOpen.trim().toLowerCase();
      showWikiLinkSuggestions();
      return;
    }
  }
  
  hideWikiLinkSuggestions();
}

export function showWikiLinkSuggestions() {
  const suggestions = st.files.filter(f => {
    const title = (f.title || "").toLowerCase();
    const id = (f.id || "").toLowerCase();
    return title.includes(_wikiQuery) || id.includes(_wikiQuery);
  });
  
  const dropdown = document.getElementById("wiki-link-suggestions");
  if (!dropdown) return;
  
  if (suggestions.length === 0) {
    dropdown.style.display = "none";
    return;
  }
  
  _wikiSelectedIdx = Math.max(0, Math.min(_wikiSelectedIdx, suggestions.length - 1));
  dropdown.style.display = "block";
  
  dropdown.innerHTML = suggestions.map((f, idx) => {
    const isSelected = idx === _wikiSelectedIdx ? "selected" : "";
    const icon = f.type === "task" ? "☑" : "📝";
    return `<div class="wiki-link-item ${isSelected}" onclick="insertWikiLink('${esc(f.title || f.id)}')">
              <span class="wiki-icon">${icon}</span>
              <span class="wiki-title">${esc(f.title || "Sem título")}</span>
              <span class="wiki-type">${f.type === "task" ? "Task" : "Note"}</span>
            </div>`;
  }).join("");
}

export function hideWikiLinkSuggestions() {
  _wikiActive = false;
  _wikiStartIndex = -1;
  _wikiQuery = "";
  _wikiSelectedIdx = 0;
  const dropdown = document.getElementById("wiki-link-suggestions");
  if (dropdown) dropdown.style.display = "none";
}

export function insertWikiLink(title) {
  const ta = document.getElementById("md-editor");
  if (!ta || _wikiStartIndex === -1) return;
  
  const pos = ta.selectionStart;
  const insertText = `[[${title}]]`;
  
  replaceRange(ta, _wikiStartIndex, pos, insertText);
  const newCursorPos = _wikiStartIndex + insertText.length;
  ta.setSelectionRange(newCursorPos, newCursorPos);
  ta.focus();
  
  hideWikiLinkSuggestions();
  onEditorInput();
}

// Vincula listeners ao textarea do editor
document.addEventListener("DOMContentLoaded", () => {
  const ta = document.getElementById("md-editor");
  if (ta) {
    ta.addEventListener("click", checkWikiLinkAutocomplete);
    ta.addEventListener("keyup", (e) => {
      if (e.key !== "ArrowUp" && e.key !== "ArrowDown" && e.key !== "Enter" && e.key !== "Escape") {
        checkWikiLinkAutocomplete();
      }
    });
    ta.addEventListener("blur", () => {
      // Pequeno atraso para dar tempo de registrar o clique nos itens do dropdown
      setTimeout(hideWikiLinkSuggestions, 200);
    });
  }
});

