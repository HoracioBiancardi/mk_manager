// Responsabilidade: renderização do preview markdown/mermaid e exportação de imagens/tabelas/código

import { st } from "./state.js";
import { esc, toast } from "./utils.js";
import { onEditorInput, jumpToSourceLine, replaceRange } from "./editor.js";
import { openDiagramBuilder } from "./diagram-builder.js";
import { openTableBuilder } from "./table-builder.js";
import { closeKanbanQEdit } from "./kanban.js";

// ── Links internos [[Nota]] / [[Nota|Apelido]] ─────────────────────────────────
const WIKILINK_RE = /^\[\[([^[\]|#]+)(?:#[^[\]|]*)?(?:\|([^[\]]+))?\]\]/;

marked.use({
  extensions: [
    {
      name: "wikilink",
      level: "inline",
      start(src) {
        const idx = src.indexOf("[[");
        return idx === -1 ? undefined : idx;
      },
      tokenizer(src) {
        const match = WIKILINK_RE.exec(src);
        if (!match) return undefined;
        return {
          type: "wikilink",
          raw: match[0],
          target: match[1].trim(),
          label: (match[2] || match[1]).trim(),
        };
      },
      renderer(token) {
        return `<a href="#" class="wikilink" data-target="${esc(token.target)}">${esc(token.label)}</a>`;
      },
    },
  ],
  renderer: {
    link(href, title, text) {
      const hrefStr = href || "";
      const isExternal = /^https?:\/\//i.test(hrefStr);
      const isAsset = hrefStr.startsWith("/assets/") || hrefStr.startsWith("assets/");
      const isImageHref = isAsset && /\.(png|jpe?g|gif|webp|svg|bmp|ico|avif)$/i.test(hrefStr);
      const titleAttr = title ? ` title="${esc(title)}"` : "";

      if (isAsset && !isImageHref) {
        const label = text.includes("📄") ? text : `📄 ${text}`;
        return `<a href="${esc(hrefStr)}" class="asset-link"${titleAttr} target="_blank" rel="noopener noreferrer">${label}</a>`;
      }

      const target = isExternal ? ' target="_blank" rel="noopener noreferrer"' : "";
      return `<a href="${esc(hrefStr)}"${titleAttr}${target}>${text}</a>`;
    },
  },
});

function findFileByTitle(target) {
  const key = target.trim().toLowerCase();
  return st.files.find((f) => (f.title || f.id).trim().toLowerCase() === key);
}

async function onWikilinkClick(e, target, insideKanbanModal) {
  e.preventDefault();
  if (insideKanbanModal) closeKanbanQEdit();
  await window.openOrCreateByTitle?.(target);
}

export function wireWikilinks(container, { insideKanbanModal = false } = {}) {
  container.querySelectorAll("a.wikilink").forEach((a) => {
    const target = a.dataset.target || a.textContent;
    const found = findFileByTitle(target);
    if (!found) a.classList.add("phantom");
    a.onclick = (e) => onWikilinkClick(e, target, insideKanbanModal);
  });
}

export function toggleCheckboxAt(content, idx) {
  let count = 0;
  return content.replace(/^([ \t]*[-*+] \[)([ xX])(\] )/gm, (m, a, ch, b) => {
    if (count++ === idx) return a + (ch === " " ? "x" : " ") + b;
    return m;
  });
}

function checkboxCharIndex(content, idx) {
  const re = /^[ \t]*[-*+] \[[ xX]\] /gm;
  let count = 0;
  let m;
  while ((m = re.exec(content))) {
    if (count++ === idx) return m.index + m[0].indexOf("[") + 1;
  }
  return -1;
}

function parseTaskLines(content) {
  const re = /^([ \t]*)[-*+] \[([ xX])\] /;
  return content.split("\n").reduce((tasks, line) => {
    const m = re.exec(line);
    if (m) tasks.push({ indent: m[1].length, checked: /[xX]/.test(m[2]) });
    return tasks;
  }, []);
}

export function findAutoCompleteParents(content, toggledIdx) {
  const tasks = parseTaskLines(content);
  const toAutoCheck = [];
  let curPos = toggledIdx;
  if (!tasks[curPos]?.checked) return toAutoCheck;

  while (true) {
    const current = tasks[curPos];
    let parentPos = -1;
    for (let i = curPos - 1; i >= 0; i--) {
      if (tasks[i].indent < current.indent) { parentPos = i; break; }
    }
    if (parentPos === -1) break;
    const parent = tasks[parentPos];
    if (parent.checked) break;

    let end = tasks.length;
    for (let i = parentPos + 1; i < tasks.length; i++) {
      if (tasks[i].indent <= parent.indent) { end = i; break; }
    }
    const children = tasks.slice(parentPos + 1, end);
    if (!children.length || !children.every((t) => t.checked)) break;

    toAutoCheck.push(parentPos);
    parent.checked = true;
    curPos = parentPos;
  }
  return toAutoCheck;
}

function renderBlocksWithLineMap(content) {
  const tokens = marked.lexer(content);
  let line = 0;
  let html = "";
  for (const token of tokens) {
    const raw = token.raw ?? "";
    const newlines = (raw.match(/\n/g) || []).length;
    if (token.type === "space") {
      line += newlines;
      continue;
    }
    html += `<div class="md-block" data-line="${line}">${marked.parser([token])}</div>`;
    line += newlines;
  }
  return html;
}

export function renderMarkdown(content, el, { onCheckboxChange, enableCapture = true, trackSourceLines = false } = {}) {
  el.innerHTML = trackSourceLines ? renderBlocksWithLineMap(content) : marked.parse(content);

  const diagrams = el.querySelectorAll(".mermaid");
  if (diagrams.length && typeof mermaid !== "undefined") {
    diagrams.forEach((d) => d.removeAttribute("data-processed"));
    const fontsReady = document.fonts?.ready ?? Promise.resolve();
    fontsReady.then(() => mermaid.run({ nodes: diagrams })).then(() => {
      el.querySelectorAll(".mermaid-wrap svg").forEach(fixMermaidLabels);
    }).catch(() => {});
  }

  let cbIdx = 0;
  el.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
    cb.removeAttribute("disabled");
    const idx = cbIdx++;
    const li = cb.closest("li");
    if (li) {
      li.classList.add("task-list-item");
      if (cb.checked) li.classList.add("done");
    }
    if (onCheckboxChange) {
      cb.addEventListener("change", () => {
        if (li) li.classList.toggle("done", cb.checked);
        onCheckboxChange(idx);
      });
    }
  });

  wireWikilinks(el);

  if (enableCapture) setTimeout(() => addCaptureButtons(el), 300);
}

export function renderPreview() {
  const content = document.getElementById("md-editor").value;
  const el = document.getElementById("md-preview");
  renderMarkdown(content, el, {
    onCheckboxChange: (idx) => {
      const ta = document.getElementById("md-editor");
      const pos = checkboxCharIndex(ta.value, idx);
      if (pos !== -1) {
        const ch = ta.value[pos];
        replaceRange(ta, pos, pos + 1, /[xX]/.test(ch) ? " " : "x");
      }
      for (const parentIdx of findAutoCompleteParents(ta.value, idx)) {
        const parentPos = checkboxCharIndex(ta.value, parentIdx);
        if (parentPos !== -1) replaceRange(ta, parentPos, parentPos + 1, "x");
      }
      onEditorInput();
    },
    enableCapture: true,
    trackSourceLines: true,
  });
}

export function initPreviewSourceSync() {
  const el = document.getElementById("md-preview");
  if (!el) return;
  el.addEventListener("dblclick", (e) => {
    const block = e.target.closest("[data-line]");
    if (!block) return;
    const line = parseInt(block.dataset.line, 10);
    if (Number.isNaN(line)) return;
    jumpToSourceLine(line);
  });
}

function fixMermaidLabels(svgEl) {
  svgEl.querySelectorAll("foreignObject").forEach(fo => {
    const foW = parseFloat(fo.getAttribute("width") || 0);
    const foH = parseFloat(fo.getAttribute("height") || 0);
    if (foW < 10 || foH < 10) return;

    const div = fo.querySelector("div");
    if (!div) return;

    div.style.whiteSpace = "normal";
    div.style.wordBreak = "break-word";
    div.style.width = "max-content";

    const naturalW = Math.ceil(div.getBoundingClientRect().width) + 2;
    const finalW = Math.max(foW, naturalW);
    div.style.width = finalW + "px";

    const realH = div.scrollHeight;
    const deltaH = realH - foH;
    const deltaW = finalW - foW;
    if (deltaH < 2 && deltaW < 2) return;

    if (deltaW >= 2) {
      fo.setAttribute("width", finalW);
      fo.setAttribute("x", parseFloat(fo.getAttribute("x") || 0) - deltaW / 2);
    }
    if (deltaH >= 2) fo.setAttribute("height", realH);

    const labelG = fo.closest("g.label, g[class~='label']");
    if (!labelG) return;
    const nodeG = labelG.parentElement;
    if (!nodeG) return;

    const rect = nodeG.querySelector(":scope > rect");
    if (rect) {
      if (deltaW >= 2) {
        rect.setAttribute("width", parseFloat(rect.getAttribute("width") || 0) + deltaW);
        rect.setAttribute("x", parseFloat(rect.getAttribute("x") || 0) - deltaW / 2);
      }
      if (deltaH >= 2) {
        rect.setAttribute("height", parseFloat(rect.getAttribute("height") || 0) + deltaH);
        rect.setAttribute("y", parseFloat(rect.getAttribute("y") || 0) - deltaH / 2);
      }
    }

    const tf = labelG.getAttribute("transform") || "";
    const m = tf.match(/translate\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)/);
    if (m) {
      labelG.setAttribute(
        "transform",
        `translate(${m[1]}, ${(parseFloat(m[2]) - deltaH / 2).toFixed(4)})`
      );
    }
  });
}

// ── Captura & Ações nos Elementos do Preview (PNG, Copiar, Editar, Zoom) ─────

function addCaptureButtons(container) {
  // Blocos de código (<pre>)
  container.querySelectorAll("pre").forEach((pre) => {
    if (pre.closest(".capture-wrap")) return;
    const wrap = wrapInCapture(pre);
    const actions = document.createElement("div");
    actions.className = "block-actions";
    actions.appendChild(makeCopyBtn(pre));
    actions.appendChild(makeCodeEditBtn(() => openCodeBlockModal(pre)));
    wrap.appendChild(actions);
  });

  // Tabelas
  container.querySelectorAll("table").forEach((table, i) => {
    if (table.closest(".capture-wrap")) return;
    const wrap = wrapInCapture(table);
    const actions = document.createElement("div");
    actions.className = "block-actions";
    actions.appendChild(makeCaptureBtn(() => captureWithCanvas(table, `tabela-${i + 1}.png`)));
    actions.appendChild(makeTableCopyBtn(table));
    actions.appendChild(makeCodeEditBtn(() => editTableBlock(table), "Editar no construtor visual de tabelas"));
    actions.appendChild(makeExpandBtn(() => openTableModal(table)));
    wrap.appendChild(actions);
  });

  // Diagramas Mermaid (.mermaid-wrap)
  container.querySelectorAll(".mermaid-wrap").forEach((wrap, i) => {
    if (wrap.querySelector(".block-actions")) return;
    const actions = document.createElement("div");
    actions.className = "block-actions";
    actions.appendChild(makeCaptureBtn(() => captureMermaid(wrap, `diagrama-${i + 1}.png`)));
    actions.appendChild(makeMermaidCopyBtn(wrap));
    actions.appendChild(makeEditBtn(() => editMermaidBlock(wrap)));
    actions.appendChild(makeExpandBtn(() => openMermaidModal(wrap)));
    wrap.appendChild(actions);
  });
}

function editMermaidBlock(wrap) {
  const block = wrap.closest("[data-line]");
  const line = block ? parseInt(block.dataset.line, 10) : NaN;
  if (Number.isNaN(line)) {
    toast("Não foi possível localizar este diagrama no texto.", "error");
    return;
  }
  jumpToSourceLine(line);
  openDiagramBuilder();
}

function editTableBlock(table) {
  const block = table.closest("[data-line]");
  const line = block ? parseInt(block.dataset.line, 10) : NaN;
  if (Number.isNaN(line)) {
    toast("Não foi possível localizar esta tabela no texto.", "error");
    return;
  }
  jumpToSourceLine(line);
  openTableBuilder();
}

function findCodeBlockAt(text, pos) {
  const re = /```([^\n`]*)\n([\s\S]*?)```/g;
  let m;
  while ((m = re.exec(text))) {
    const start = m.index, end = m.index + m[0].length;
    if (pos >= start && pos <= end) return { start, end, lang: m[1].trim(), body: m[2] };
  }
  return null;
}

function findMermaidBlockAt(text, pos) {
  const re = /```mermaid\n([\s\S]*?)```/g;
  let m;
  while ((m = re.exec(text))) {
    const start = m.index, end = m.index + m[0].length;
    if (pos >= start && pos <= end) return { start, end, body: m[1] };
  }
  return null;
}

function openCodeBlockModal(pre) {
  const block = pre.closest("[data-line]");
  const line = block ? parseInt(block.dataset.line, 10) : NaN;
  if (Number.isNaN(line)) {
    toast("Não foi possível localizar este bloco no texto.", "error");
    return;
  }
  jumpToSourceLine(line);
  const ta = document.getElementById("md-editor");
  const found = findCodeBlockAt(ta.value, ta.selectionStart);
  if (!found) {
    toast("Não foi possível localizar este bloco no texto.", "error");
    return;
  }
  const { start, end, lang } = found;
  const body = found.body.endsWith("\n") ? found.body.slice(0, -1) : found.body;

  const overlay = document.createElement("div");
  overlay.className = "mermaid-zoom-overlay";

  const modal = document.createElement("div");
  modal.className = "mermaid-zoom-modal";

  const toolbar = document.createElement("div");
  toolbar.className = "mermaid-zoom-toolbar";

  const label = document.createElement("span");
  label.className = "mermaid-zoom-label";
  label.textContent = "Editor de Código";

  ensureLangDatalist();
  const langInput = document.createElement("input");
  langInput.type = "text";
  langInput.className = "code-edit-lang-input";
  langInput.setAttribute("list", "code-edit-lang-datalist");
  langInput.placeholder = "linguagem";
  langInput.spellcheck = false;
  langInput.value = lang;
  langInput.title = "Linguagem do bloco (ex: sql, dbt, python, js, sh)";

  const mkBtn = (text, title) => {
    const b = document.createElement("button");
    b.className = "mermaid-zoom-ctrl";
    b.textContent = text;
    b.title = title;
    return b;
  };

  const btnFormat = mkBtn("🧹 Formatar", "Formatar código automaticamente (4 espaços)");
  const btnCopy   = mkBtn("⎘ Copiar", "Copiar código");
  const btnSave   = mkBtn("💾 Salvar", "Formatar e Salvar alterações (Ctrl+Enter)");
  const btnClose  = mkBtn("✕ Fechar", "Fechar sem salvar (Esc)");
  btnClose.style.marginLeft = "auto";

  toolbar.append(label, langInput, btnFormat, btnCopy, btnSave, btnClose);

  const content = document.createElement("div");
  content.className = "code-edit-content";

  const editorWrap = document.createElement("div");
  editorWrap.className = "code-edit-editor";
  editorWrap.style.borderRight = "none";

  const gutter = document.createElement("div");
  gutter.className = "code-edit-gutter";

  const textarea = document.createElement("textarea");
  textarea.className = "code-edit-textarea";
  textarea.spellcheck = false;
  textarea.value = body;

  editorWrap.append(gutter, textarea);
  content.appendChild(editorWrap);
  modal.append(toolbar, content);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  function updateGutter() {
    const n = textarea.value.split("\n").length;
    gutter.textContent = Array.from({ length: n }, (_, i) => i + 1).join("\n");
  }

  updateGutter();
  textarea.addEventListener("input", updateGutter);
  textarea.addEventListener("scroll", () => { gutter.scrollTop = textarea.scrollTop; });
  requestAnimationFrame(() => textarea.focus());

  async function triggerAutoFormat() {
    const currentLang = langInput.value.trim().toLowerCase();
    if (window.formatCode) {
      const res = await window.formatCode(currentLang, textarea.value);
      if (res && res.text) {
        textarea.value = res.text.trim();
        updateGutter();
      }
    }
  }

  btnFormat.addEventListener("click", async () => {
    await triggerAutoFormat();
    toast("Código formatado com 4 espaços.", "success");
  });

  btnCopy.addEventListener("click", () => {
    navigator.clipboard.writeText(textarea.value).then(() => {
      btnCopy.textContent = "✓ Copiado!";
      setTimeout(() => { btnCopy.textContent = "⎘ Copiar"; }, 1500);
      toast("Código copiado!", "success");
    });
  });

  textarea.addEventListener("keydown", (e) => {
    if (e.key === "Tab") {
      e.preventDefault();
      const pos = textarea.selectionStart;
      const endPos = textarea.selectionEnd;
      if (e.shiftKey) {
        const lines = textarea.value.slice(0, pos).split("\n");
        const lastLine = lines[lines.length - 1];
        if (lastLine.endsWith("    ")) {
          textarea.value = textarea.value.slice(0, pos - 4) + textarea.value.slice(pos);
          textarea.setSelectionRange(pos - 4, pos - 4);
        }
      } else {
        textarea.value = textarea.value.slice(0, pos) + "    " + textarea.value.slice(endPos);
        textarea.setSelectionRange(pos + 4, pos + 4);
      }
      updateGutter();
    }
  });

  async function save() {
    await triggerAutoFormat();
    replaceRange(ta, start, end, "```" + langInput.value.trim() + "\n" + textarea.value + "\n```");
    onEditorInput();
    close();
  }

  function close() {
    document.removeEventListener("keydown", onKey);
    overlay.remove();
  }

  function onKey(e) {
    if (e.key === "Escape") { e.stopPropagation(); close(); }
    else if (e.ctrlKey && e.key === "Enter") { e.preventDefault(); save(); }
  }

  btnSave.addEventListener("click", save);
  btnClose.addEventListener("click", close);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  document.addEventListener("keydown", onKey);
}

function ensureLangDatalist() {
  if (document.getElementById("code-edit-lang-datalist")) return;
  const datalist = document.createElement("datalist");
  datalist.id = "code-edit-lang-datalist";
  datalist.innerHTML = hljs.listLanguages().sort()
    .map((l) => `<option value="${esc(l)}"></option>`).join("");
  document.body.appendChild(datalist);
}

function wrapInCapture(el) {
  const wrap = document.createElement("div");
  wrap.className = "capture-wrap";
  el.replaceWith(wrap);
  wrap.appendChild(el);
  return wrap;
}

function makeCaptureBtn(onClick) {
  const btn = document.createElement("button");
  btn.className = "capture-btn";
  btn.title = "Exportar como imagem PNG";
  btn.textContent = "📷 PNG";
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    onClick();
  });
  return btn;
}

function makeCopyBtn(pre) {
  const btn = document.createElement("button");
  btn.className = "capture-btn";
  btn.title = "Copiar código";
  btn.textContent = "⎘ Copiar";
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const text = pre.querySelector("code")?.innerText ?? pre.innerText;
    navigator.clipboard.writeText(text).then(() => {
      btn.textContent = "✓ Copiado!";
      setTimeout(() => { btn.textContent = "⎘ Copiar"; }, 1500);
    }).catch(() => toast("Erro ao copiar.", "error"));
  });
  return btn;
}

function makeTableCopyBtn(table) {
  const btn = document.createElement("button");
  btn.className = "capture-btn";
  btn.title = "Copiar conteúdo da tabela";
  btn.textContent = "⎘ Copiar";
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const rows = Array.from(table.querySelectorAll("tr"));
    const text = rows.map(r => Array.from(r.querySelectorAll("th, td")).map(c => c.innerText.trim()).join("\t")).join("\n");
    navigator.clipboard.writeText(text).then(() => {
      btn.textContent = "✓ Copiado!";
      setTimeout(() => { btn.textContent = "⎘ Copiar"; }, 1500);
    }).catch(() => toast("Erro ao copiar tabela.", "error"));
  });
  return btn;
}

function makeMermaidCopyBtn(wrap) {
  const btn = document.createElement("button");
  btn.className = "capture-btn";
  btn.title = "Copiar código do diagrama";
  btn.textContent = "⎘ Copiar";
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    copyMermaidCode(wrap, btn);
  });
  return btn;
}

function copyMermaidCode(wrap, btn) {
  const block = wrap.closest("[data-line]");
  const line = block ? parseInt(block.dataset.line, 10) : NaN;
  const ta = document.getElementById("md-editor");
  if (!Number.isNaN(line) && ta) {
    const found = findMermaidBlockAt(ta.value, ta.selectionStart);
    if (found) {
      navigator.clipboard.writeText(found.body.trim()).then(() => {
        if (btn) {
          btn.textContent = "✓ Copiado!";
          setTimeout(() => { btn.textContent = "⎘ Copiar"; }, 1500);
        }
        toast("Código do diagrama copiado!", "success");
        return;
      });
      return;
    }
  }
  const svgEl = wrap.querySelector("svg");
  const text = svgEl ? svgEl.outerHTML : wrap.innerText;
  navigator.clipboard.writeText(text).then(() => {
    if (btn) {
      btn.textContent = "✓ Copiado!";
      setTimeout(() => { btn.textContent = "⎘ Copiar"; }, 1500);
    }
    toast("Conteúdo do diagrama copiado!", "success");
  });
}

function makeEditBtn(onClick) {
  const btn = document.createElement("button");
  btn.className = "mermaid-edit-btn";
  btn.title = "Editar no construtor visual de diagramas";
  btn.textContent = "✏️ Editar";
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    onClick();
  });
  return btn;
}

function makeCodeEditBtn(onClick, title = "Editar em um modal maior, com preview ao vivo") {
  const btn = document.createElement("button");
  btn.className = "code-edit-btn";
  btn.title = title;
  btn.textContent = "✏️ Editar";
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    onClick();
  });
  return btn;
}

function makeExpandBtn(onClick) {
  const btn = document.createElement("button");
  btn.className = "mermaid-modal-btn";
  btn.title = "Visualizar em tela cheia (Zoom)";
  btn.textContent = "⛶ Zoom";
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    onClick();
  });
  return btn;
}

function openMermaidModal(wrap) {
  const svgEl = wrap.querySelector("svg");
  if (!svgEl) { toast("Diagrama ainda não renderizado.", "info"); return; }

  const rootG = svgEl.querySelector(":scope > g");
  let cX = 0, cY = 0, cW, cH;
  const pad = 20;
  try {
    const bb = (rootG || svgEl).getBBox();
    cX = bb.x - pad; cY = bb.y - pad;
    cW = bb.width + pad * 2; cH = bb.height + pad * 2;
  } catch {
    const r = svgEl.getBoundingClientRect();
    cW = r.width; cH = r.height;
  }

  const svgClone = svgEl.cloneNode(true);
  svgClone.setAttribute("width", Math.ceil(cW));
  svgClone.setAttribute("height", Math.ceil(cH));
  svgClone.setAttribute("viewBox", `${cX} ${cY} ${cW} ${cH}`);
  svgClone.removeAttribute("style");

  const overlay = document.createElement("div");
  overlay.className = "mermaid-zoom-overlay";

  const modal = document.createElement("div");
  modal.className = "mermaid-zoom-modal";

  const toolbar = document.createElement("div");
  toolbar.className = "mermaid-zoom-toolbar";

  const label = document.createElement("span");
  label.className = "mermaid-zoom-label";
  label.textContent = "Diagrama";

  const levelEl = document.createElement("span");
  levelEl.className = "mermaid-zoom-level";
  levelEl.textContent = "100%";

  const mkBtn = (text, title) => {
    const b = document.createElement("button");
    b.className = "mermaid-zoom-ctrl";
    b.textContent = text;
    b.title = title;
    return b;
  };

  const btnOut   = mkBtn("−", "Reduzir");
  const btnIn    = mkBtn("+", "Ampliar");
  const btnFit   = mkBtn("↺ Ajustar", "Ajustar ao tamanho do painel");
  const btnPng   = mkBtn("📷 PNG", "Exportar diagrama como PNG");
  const btnCopy  = mkBtn("⎘ Copiar", "Copiar código do diagrama");
  const btnEdit  = mkBtn("✏️ Editar", "Editar no construtor visual de diagramas");
  const btnClose = mkBtn("✕ Fechar", "Fechar (Esc)");
  btnClose.style.marginLeft = "auto";

  toolbar.append(label, levelEl, btnOut, btnIn, btnFit, btnPng, btnCopy, btnEdit, btnClose);

  const content = document.createElement("div");
  content.className = "mermaid-zoom-content";
  const inner = document.createElement("div");
  inner.className = "mermaid-zoom-inner";
  inner.appendChild(svgClone);
  content.appendChild(inner);

  modal.appendChild(toolbar);
  modal.appendChild(content);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  let scale = 1, panX = 0, panY = 0;

  function applyTransform() {
    inner.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
    levelEl.textContent = `${Math.round(scale * 100)}%`;
  }

  function clampScale(s) { return Math.min(8, Math.max(0.1, s)); }

  function fitToContent() {
    scale = 1; panX = 0; panY = 0;
    applyTransform();
    const cr = content.getBoundingClientRect();
    const ratioX = (cr.width - 64) / cW;
    const ratioY = (cr.height - 64) / cH;
    scale = clampScale(Math.min(ratioX, ratioY, 1));
    applyTransform();
  }

  requestAnimationFrame(fitToContent);

  btnIn.addEventListener("click",  () => { scale = clampScale(scale * 1.25); applyTransform(); });
  btnOut.addEventListener("click", () => { scale = clampScale(scale / 1.25); applyTransform(); });
  btnFit.addEventListener("click", fitToContent);
  btnPng.addEventListener("click", () => captureMermaid(wrap, "diagrama.png"));
  btnCopy.addEventListener("click", () => copyMermaidCode(wrap, btnCopy));
  btnEdit.addEventListener("click", () => { close(); editMermaidBlock(wrap); });

  content.addEventListener("wheel", (e) => {
    e.preventDefault();
    scale = clampScale(scale * (e.deltaY > 0 ? 0.88 : 1.14));
    applyTransform();
  }, { passive: false });

  let dragging = false, sx = 0, sy = 0;

  const onMouseDown = (e) => {
    if (e.button !== 0) return;
    dragging = true;
    sx = e.clientX - panX;
    sy = e.clientY - panY;
    content.style.cursor = "grabbing";
  };
  const onMouseMove = (e) => {
    if (!dragging) return;
    panX = e.clientX - sx;
    panY = e.clientY - sy;
    applyTransform();
  };
  const onMouseUp = () => {
    dragging = false;
    content.style.cursor = "grab";
  };

  content.addEventListener("mousedown", onMouseDown);
  document.addEventListener("mousemove", onMouseMove);
  document.addEventListener("mouseup", onMouseUp);

  function close() {
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
    document.removeEventListener("keydown", onKey);
    overlay.remove();
  }

  const onKey = (e) => { if (e.key === "Escape") close(); };
  btnClose.addEventListener("click", close);
  document.addEventListener("keydown", onKey);
}

function openTableModal(table) {
  const tableClone = table.cloneNode(true);
  const overlay = document.createElement("div");
  overlay.className = "mermaid-zoom-overlay";

  const modal = document.createElement("div");
  modal.className = "mermaid-zoom-modal";

  const toolbar = document.createElement("div");
  toolbar.className = "mermaid-zoom-toolbar";

  const label = document.createElement("span");
  label.className = "mermaid-zoom-label";
  label.textContent = "Tabela";

  const levelEl = document.createElement("span");
  levelEl.className = "mermaid-zoom-level";
  levelEl.textContent = "100%";

  const mkBtn = (text, title) => {
    const b = document.createElement("button");
    b.className = "mermaid-zoom-ctrl";
    b.textContent = text;
    b.title = title;
    return b;
  };

  const btnOut   = mkBtn("−", "Reduzir");
  const btnIn    = mkBtn("+", "Ampliar");
  const btnFit   = mkBtn("↺ Ajustar", "Ajustar tamanho");
  const btnPng   = mkBtn("📷 PNG", "Exportar tabela como PNG");
  const btnCopy  = mkBtn("⎘ Copiar", "Copiar conteúdo da tabela");
  const btnEdit  = mkBtn("✏️ Editar", "Editar no construtor visual de tabelas");
  const btnClose = mkBtn("✕ Fechar", "Fechar (Esc)");
  btnClose.style.marginLeft = "auto";

  toolbar.append(label, levelEl, btnOut, btnIn, btnFit, btnPng, btnCopy, btnEdit, btnClose);

  const content = document.createElement("div");
  content.className = "mermaid-zoom-content";
  const inner = document.createElement("div");
  inner.className = "mermaid-zoom-inner";
  inner.style.background = "var(--surface)";
  inner.style.padding = "2rem";
  inner.style.borderRadius = "var(--r-md)";
  inner.style.boxShadow = "var(--shadow-md)";
  inner.appendChild(tableClone);
  content.appendChild(inner);

  modal.append(toolbar, content);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  let scale = 1, panX = 0, panY = 0;

  function applyTransform() {
    inner.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
    levelEl.textContent = `${Math.round(scale * 100)}%`;
  }
  function clampScale(s) { return Math.min(6, Math.max(0.2, s)); }
  function fitToContent() {
    scale = 1; panX = 0; panY = 0;
    applyTransform();
  }

  btnIn.addEventListener("click",  () => { scale = clampScale(scale * 1.25); applyTransform(); });
  btnOut.addEventListener("click", () => { scale = clampScale(scale / 1.25); applyTransform(); });
  btnFit.addEventListener("click", fitToContent);
  btnPng.addEventListener("click", () => captureWithCanvas(table, "tabela.png"));
  btnCopy.addEventListener("click", () => {
    const rows = Array.from(table.querySelectorAll("tr"));
    const text = rows.map(r => Array.from(r.querySelectorAll("th, td")).map(c => c.innerText.trim()).join("\t")).join("\n");
    navigator.clipboard.writeText(text).then(() => toast("Tabela copiada!", "success"));
  });
  btnEdit.addEventListener("click", () => { close(); editTableBlock(table); });

  function close() {
    overlay.remove();
    document.removeEventListener("keydown", onKey);
  }
  const onKey = (e) => { if (e.key === "Escape") close(); };
  btnClose.addEventListener("click", close);
  document.addEventListener("keydown", onKey);
}

// ── Captura de elementos em Canvas/SVG ───────────────────────────────────────

async function captureMermaid(wrap, filename) {
  const svgEl = wrap.querySelector("svg");
  if (!svgEl) {
    toast("Diagrama ainda não renderizado.", "info");
    return;
  }

  const rootG = svgEl.querySelector(":scope > g");
  let bx = 0, by = 0, bw = 800, bh = 200;
  try {
    const bb = (rootG || svgEl).getBBox();
    bx = bb.x - 24; by = bb.y - 24;
    bw = bb.width + 48; bh = bb.height + 48;
  } catch { /* fallback */ }

  const exportW = Math.ceil(bw) * 2;
  const exportH = Math.ceil(bh) * 2;

  const clone = svgEl.cloneNode(true);
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", exportW);
  clone.setAttribute("height", exportH);
  clone.setAttribute("viewBox", `${bx} ${by} ${bw} ${bh}`);
  clone.removeAttribute("style");

  clone.querySelectorAll("[clip-path]").forEach((el) => el.removeAttribute("clip-path"));

  const styleEl = clone.querySelector("style");
  if (styleEl) {
    const cs = getComputedStyle(svgEl);
    const ff = cs.fontFamily || "Arial, sans-serif";
    styleEl.textContent = styleEl.textContent
      .replace(/font-family\s*:\s*inherit/g, `font-family: ${ff}`)
      .replace(/\bcolor\s*:\s*inherit\b/g, "color: currentColor");
  }

  clone.querySelectorAll("foreignObject").forEach((fo) => {
    const w = parseFloat(fo.getAttribute("width") || 0);
    const h = parseFloat(fo.getAttribute("height") || 0);
    if (w < 1 || h < 1) { fo.remove(); return; }

    const x = parseFloat(fo.getAttribute("x") || 0);
    const y = parseFloat(fo.getAttribute("y") || 0);
    const div = fo.querySelector("div");
    if (!div) { fo.remove(); return; }

    const span = div.querySelector(".nodeLabel") || div.querySelector("span") || div;
    const lines = [];
    let cur = "";
    for (const node of span.childNodes) {
      if (node.nodeName === "BR") { if (cur) lines.push(cur); cur = ""; }
      else cur += node.textContent || "";
    }
    if (cur) lines.push(cur);
    if (!lines.length) { fo.remove(); return; }

    const textEl = document.createElementNS("http://www.w3.org/2000/svg", "text");
    const lineH = 18;
    const cx = x + w / 2;
    const cy = y + h / 2 - ((lines.length - 1) * lineH) / 2;
    textEl.setAttribute("x", cx);
    textEl.setAttribute("y", cy);
    textEl.setAttribute("text-anchor", "middle");
    textEl.setAttribute("dominant-baseline", "central");

    lines.forEach((line, i) => {
      const ts = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
      ts.setAttribute("x", cx);
      if (i > 0) ts.setAttribute("dy", lineH + "px");
      ts.textContent = line;
      textEl.appendChild(ts);
    });
    fo.replaceWith(textEl);
  });

  const svgStr = new XMLSerializer().serializeToString(clone);
  const blob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  try {
    const img = await loadImage(url);
    const canvas = document.createElement("canvas");
    canvas.width = exportW;
    canvas.height = exportH;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, exportW, exportH);
    ctx.drawImage(img, 0, 0, exportW, exportH);
    downloadCanvas(canvas, filename);
    toast("Imagem exportada!", "success");
  } catch (err) {
    toast("Erro ao exportar imagem.", "error");
    console.error("captureMermaid:", err);
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function captureWithCanvas(el, filename) {
  if (typeof html2canvas !== "undefined") {
    try {
      const canvas = await html2canvas(el, {
        backgroundColor: "#ffffff",
        scale: 2,
        logging: false,
        useCORS: true,
      });
      downloadCanvas(canvas, filename);
      toast("Imagem exportada!", "success");
      return;
    } catch {
      /* fallback */
    }
  }
  await captureViaForeignObject(el, filename);
}

async function captureViaForeignObject(el, filename) {
  const rect = el.getBoundingClientRect();
  const w = Math.ceil(rect.width) || 800;
  const h = Math.ceil(rect.height) || 400;

  const cloned = el.cloneNode(true);
  cloned.style.margin = "0";
  inlineComputedStyles(el, cloned);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <foreignObject width="${w}" height="${h}">
      <div xmlns="http://www.w3.org/1999/xhtml" style="background:#f6f8fa;padding:16px;font-family:monospace;font-size:13px;box-sizing:border-box;width:${w}px;min-height:${h}px">
        ${cloned.outerHTML}
      </div>
    </foreignObject>
  </svg>`;

  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const img = await loadImage(url);
    const canvas = document.createElement("canvas");
    canvas.width = w * 2;
    canvas.height = h * 2;
    const ctx = canvas.getContext("2d");
    ctx.scale(2, 2);
    ctx.fillStyle = "#f6f8fa";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    downloadCanvas(canvas, filename);
    toast("Imagem exportada!", "success");
  } finally {
    URL.revokeObjectURL(url);
  }
}

function inlineComputedStyles(src, dst) {
  const srcStyle = getComputedStyle(src);
  const important = [
    "color",
    "background-color",
    "font-family",
    "font-size",
    "font-weight",
    "line-height",
    "padding",
    "border-radius",
  ];
  important.forEach((p) =>
    dst.style.setProperty(p, srcStyle.getPropertyValue(p)),
  );
  const srcChildren = src.children;
  const dstChildren = dst.children;
  for (let i = 0; i < srcChildren.length; i++) {
    if (dstChildren[i]) inlineComputedStyles(srcChildren[i], dstChildren[i]);
  }
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function downloadCanvas(canvas, filename) {
  canvas.toBlob((blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 100);
  }, "image/png");
}

Object.assign(window, {
  renderPreview,
  renderMarkdown,
});
