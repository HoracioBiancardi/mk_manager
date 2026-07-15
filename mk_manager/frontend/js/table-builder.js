// Responsabilidade: construtor visual de tabelas Markdown — grade de
// células editáveis (linhas/colunas dinâmicas, alinhamento por coluna),
// no mesmo ciclo de vida do construtor de diagramas (diagram-builder.js):
// abre um modal, detecta se o cursor está sobre uma tabela existente pra
// editar in-place, ou começa com uma grade em branco; ao inserir, gera o
// Markdown final (via alignTableRows, compartilhado com "⊟ Alinhar") e
// substitui/insere no editor.

import { ins, onEditorInput, replaceRange, alignTableRows } from "./editor.js";
import { toast } from "./utils.js";

let state = null;
let els = null;

const ALIGN_CYCLE = { left: "center", center: "right", right: "left" };
const ALIGN_ICON = { left: "⬅", center: "↔", right: "➡" };

// ── Detecção/parse de uma tabela existente sob o cursor (mesma lógica de
// varredura usada por formatTable() em editor.js) ──────────────────────────
function findTableBlockAt(text, pos) {
  const lines = text.split("\n");
  let charCount = 0,
    cursorLine = -1;
  for (let i = 0; i < lines.length; i++) {
    if (charCount + lines[i].length >= pos) {
      cursorLine = i;
      break;
    }
    charCount += lines[i].length + 1;
  }
  if (cursorLine === -1 || !/^\s*\|/.test(lines[cursorLine])) return null;

  let start = cursorLine;
  while (start > 0 && /^\s*\|/.test(lines[start - 1])) start--;
  let end = cursorLine;
  while (end < lines.length - 1 && /^\s*\|/.test(lines[end + 1])) end++;

  const tableLines = lines.slice(start, end + 1);
  const charStart = lines.slice(0, start).reduce((s, l) => s + l.length + 1, 0);
  const charEnd = charStart + tableLines.join("\n").length;
  return { start: charStart, end: charEnd, lines: tableLines };
}

function parseTableBlock(tableLines) {
  const rows = tableLines.map((line) =>
    line.trim().split("|").slice(1, -1).map((c) => c.trim()),
  );
  if (rows.length > 1 && rows[1].length > 0 && rows[1].every((c) => /^:?-+:?$/.test(c))) {
    const colAligns = rows[1].map((cell) => {
      const L = cell.startsWith(":");
      const R = cell.endsWith(":") && cell.length > 1;
      return L && R ? "center" : R ? "right" : "left";
    });
    const grid = [rows[0], ...rows.slice(2)];
    return { grid, colAligns };
  }
  // Sem separadora reconhecível (tabela incompleta): trata tudo como dados.
  const numCols = Math.max(...rows.map((r) => r.length));
  return { grid: rows, colAligns: Array(numCols).fill("left") };
}

function blankState() {
  return {
    grid: [
      ["Coluna 1", "Coluna 2", "Coluna 3"],
      ["", "", ""],
    ],
    colAligns: ["left", "left", "left"],
    sourceRange: null,
    focusedCell: null,
  };
}

// ── Mutações da grade ───────────────────────────────────────────────────────
function focusCell(r, c) {
  const tr = els.gridEl.children[r];
  const td = tr?.children[c];
  const input = td?.querySelector(".tb-cell-input");
  input?.focus();
}

function addRow() {
  const cols = state.grid[0].length;
  const at = state.focusedCell ? state.focusedCell.row + 1 : state.grid.length;
  const insertAt = Math.max(1, at);
  state.grid.splice(insertAt, 0, Array(cols).fill(""));
  renderGrid();
  focusCell(insertAt, 0);
}

function removeRow() {
  if (state.grid.length - 1 <= 1) {
    toast("A tabela precisa de pelo menos uma linha de dados.", "info");
    return;
  }
  const row = state.focusedCell?.row;
  const at = row && row > 0 ? row : state.grid.length - 1;
  state.grid.splice(at, 1);
  renderGrid();
  focusCell(Math.min(at, state.grid.length - 1), 0);
}

function addColumn() {
  const at = state.focusedCell ? state.focusedCell.col + 1 : state.grid[0].length;
  state.grid.forEach((row) => row.splice(at, 0, ""));
  state.colAligns.splice(at, 0, "left");
  renderGrid();
  focusCell(0, at);
}

function removeColumn() {
  if (state.grid[0].length <= 1) {
    toast("A tabela precisa de pelo menos uma coluna.", "info");
    return;
  }
  const at = state.focusedCell ? state.focusedCell.col : state.grid[0].length - 1;
  state.grid.forEach((row) => row.splice(at, 1));
  state.colAligns.splice(at, 1);
  renderGrid();
  focusCell(0, Math.min(at, state.grid[0].length - 1));
}

function cycleAlign(col) {
  state.colAligns[col] = ALIGN_CYCLE[state.colAligns[col] || "left"];
  renderGrid();
  focusCell(0, col);
}

// ── Renderização ─────────────────────────────────────────────────────────────
function updateInsertBtnLabel() {
  if (els?.btnInsert) els.btnInsert.textContent = state.sourceRange ? "Atualizar tabela" : "Inserir no editor";
}

function renderGrid() {
  const { gridEl } = els;
  gridEl.innerHTML = "";
  state.grid.forEach((row, r) => {
    const tr = document.createElement("tr");
    tr.className = r === 0 ? "tb-header-row" : "tb-data-row";

    row.forEach((cellVal, c) => {
      const td = document.createElement("td");
      // O `<td>` em si fica com o display de célula de tabela padrão (senão
      // o layout de colunas quebra); quem vira flex é este wrapper interno,
      // só necessário no cabeçalho por causa do botão de alinhar/remover.
      const cellInner = r === 0 ? document.createElement("div") : td;
      if (r === 0) {
        cellInner.className = "tb-header-cell-inner";
        td.appendChild(cellInner);
      }

      const input = document.createElement("input");
      input.type = "text";
      input.className = "tb-cell-input";
      input.value = cellVal;
      if (r === 0) input.placeholder = `Coluna ${c + 1}`;
      input.addEventListener("input", (e) => {
        state.grid[r][c] = e.target.value;
      });
      input.addEventListener("focus", () => {
        state.focusedCell = { row: r, col: c };
      });
      cellInner.appendChild(input);

      if (r === 0) {
        const alignBtn = document.createElement("button");
        alignBtn.type = "button";
        alignBtn.className = "tb-align-btn";
        alignBtn.tabIndex = -1;
        alignBtn.textContent = ALIGN_ICON[state.colAligns[c] || "left"];
        alignBtn.title = "Alinhamento da coluna (clique para alternar)";
        alignBtn.addEventListener("click", () => cycleAlign(c));
        cellInner.appendChild(alignBtn);

        const rmColBtn = document.createElement("button");
        rmColBtn.type = "button";
        rmColBtn.className = "tb-col-remove";
        rmColBtn.tabIndex = -1;
        rmColBtn.textContent = "✕";
        rmColBtn.title = "Remover coluna";
        rmColBtn.addEventListener("click", () => {
          state.focusedCell = { row: 0, col: c };
          removeColumn();
        });
        cellInner.appendChild(rmColBtn);
      }
      tr.appendChild(td);
    });

    const controlTd = document.createElement("td");
    controlTd.className = "tb-row-controls";
    if (r > 0) {
      const rmRowBtn = document.createElement("button");
      rmRowBtn.type = "button";
      rmRowBtn.className = "tb-row-remove";
      rmRowBtn.tabIndex = -1;
      rmRowBtn.textContent = "✕";
      rmRowBtn.title = "Remover linha";
      rmRowBtn.addEventListener("click", () => {
        state.focusedCell = { row: r, col: 0 };
        removeRow();
      });
      controlTd.appendChild(rmRowBtn);
    }
    tr.appendChild(controlTd);
    gridEl.appendChild(tr);
  });

  updateInsertBtnLabel();
}

// ── Modal ────────────────────────────────────────────────────────────────────
function buildModal() {
  const overlay = document.createElement("div");
  overlay.className = "mermaid-zoom-overlay tb-overlay";

  const modal = document.createElement("div");
  modal.className = "mermaid-zoom-modal";

  const toolbar = document.createElement("div");
  toolbar.className = "mermaid-zoom-toolbar";

  const title = document.createElement("span");
  title.className = "mermaid-zoom-label";
  title.textContent = "Construtor de tabela";

  const mkBtn = (text, titleText) => {
    const b = document.createElement("button");
    b.className = "mermaid-zoom-ctrl";
    b.textContent = text;
    b.title = titleText;
    return b;
  };

  const btnAddRow = mkBtn("+ Linha", "Adicionar linha (após a linha focada)");
  const btnAddCol = mkBtn("+ Coluna", "Adicionar coluna (após a coluna focada)");
  const btnRmRow = mkBtn("– Linha", "Remover a linha focada");
  const btnRmCol = mkBtn("– Coluna", "Remover a coluna focada");
  const hint = document.createElement("span");
  hint.className = "mermaid-zoom-label";
  hint.style.color = "var(--text-subtle)";
  hint.textContent = "Tab navega entre células · ícone no cabeçalho alterna o alinhamento da coluna";
  const btnInsert = mkBtn("Inserir no editor", "Gerar Markdown e inserir no texto");
  btnInsert.style.marginLeft = "auto";
  btnInsert.style.color = "var(--primary)";
  btnInsert.style.borderColor = "var(--primary)";
  const btnClose = mkBtn("✕ Fechar", "Fechar sem inserir (Esc)");

  toolbar.append(title, btnAddRow, btnAddCol, btnRmRow, btnRmCol, hint, btnInsert, btnClose);

  const gridWrap = document.createElement("div");
  gridWrap.className = "tb-grid-wrap";
  const gridEl = document.createElement("table");
  gridEl.className = "tb-grid";
  gridWrap.appendChild(gridEl);

  modal.append(toolbar, gridWrap);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  els = { overlay, gridEl, btnInsert };

  btnAddRow.addEventListener("click", addRow);
  btnAddCol.addEventListener("click", addColumn);
  btnRmRow.addEventListener("click", removeRow);
  btnRmCol.addEventListener("click", removeColumn);
  btnInsert.addEventListener("click", insertAndClose);
  btnClose.addEventListener("click", closeTableBuilder);

  overlay.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeTableBuilder();
  });
  overlay.tabIndex = -1;
  overlay.focus();
}

// ── Ciclo de vida ────────────────────────────────────────────────────────────
export function openTableBuilder() {
  if (els) return;
  const ta = document.getElementById("md-editor");
  const block = ta ? findTableBlockAt(ta.value, ta.selectionStart) : null;
  const parsed = block ? parseTableBlock(block.lines) : null;

  state = parsed
    ? {
        grid: parsed.grid,
        colAligns: parsed.colAligns,
        sourceRange: { start: block.start, end: block.end },
        focusedCell: null,
      }
    : blankState();

  buildModal();
  renderGrid();
  focusCell(0, 0);
}

export function closeTableBuilder() {
  els?.overlay.remove();
  els = null;
  state = null;
}

function insertAndClose() {
  if (!state.grid.length || !state.grid[0].length) {
    toast("Adicione ao menos uma coluna antes de inserir.", "info");
    return;
  }
  const src = alignTableRows(state.grid, state.colAligns);
  if (state.sourceRange) {
    const ta = document.getElementById("md-editor");
    const { start, end } = state.sourceRange;
    replaceRange(ta, start, end, src);
    ta.selectionStart = ta.selectionEnd = start + src.length;
    ta.focus();
    onEditorInput();
  } else {
    ins(src);
  }
  closeTableBuilder();
}

// ── Expor ao DOM (necessário para os botões inline no toolbar principal) ────
Object.assign(window, { openTableBuilder, closeTableBuilder });
