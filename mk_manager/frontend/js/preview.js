// Responsabilidade: renderização do preview markdown/mermaid e exportação de imagens

import { st } from "./state.js";
import { esc, toast } from "./utils.js";
import { onEditorInput, jumpToSourceLine, replaceRange } from "./editor.js";
import { openDiagramBuilder } from "./diagram-builder.js";

// ── Links internos [[Nota]] / [[Nota|Apelido]] ─────────────────────────────────
// Extensão inline do marked: resolve o alvo só no clique (não no render), pra
// sempre refletir o estado atual de st.files mesmo que uma nota tenha sido
// criada/renomeada entre um render e outro.
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
});

function findFileByTitle(target) {
  const key = target.trim().toLowerCase();
  return st.files.find((f) => (f.title || f.id).trim().toLowerCase() === key);
}

async function onWikilinkClick(e, target) {
  e.preventDefault();
  await window.openOrCreateByTitle?.(target);
}

function wireWikilinks(container) {
  container.querySelectorAll("a.wikilink").forEach((a) => {
    const target = a.dataset.target;
    const resolved = !!findFileByTitle(target);
    a.classList.toggle("phantom", !resolved);
    a.title = resolved ? `Abrir "${target}"` : `Criar nota "${target}"`;
    a.addEventListener("click", (e) => onWikilinkClick(e, target));
  });
}

// ── Renderização de markdown (compartilhada com o modal do kanban) ────────────

export function toggleCheckboxAt(content, idx) {
  let count = 0;
  return content.replace(/^([ \t]*[-*+] \[)([ xX])(\] )/gm, (m, a, ch, b) => {
    if (count++ === idx) return a + (ch === " " ? "x" : " ") + b;
    return m;
  });
}

// Posição (índice) do caractere "[ ]"/"[x]" do idx-ésimo checkbox, para trocar
// só esse caractere via replaceRange (preserva undo nativo do textarea).
function checkboxCharIndex(content, idx) {
  const re = /^[ \t]*[-*+] \[[ xX]\] /gm;
  let count = 0;
  let m;
  while ((m = re.exec(content))) {
    if (count++ === idx) return m.index + m[0].indexOf("[") + 1;
  }
  return -1;
}

// Todas as linhas de task do documento, na mesma ordem (e numeração) dos
// checkboxes renderizados — indent é usado para inferir a relação
// subtarefa/tarefa-mãe a partir do nível de indentação da lista.
function parseTaskLines(content) {
  const re = /^([ \t]*)[-*+] \[([ xX])\] /;
  return content.split("\n").reduce((tasks, line) => {
    const m = re.exec(line);
    if (m) tasks.push({ indent: m[1].length, checked: /[xX]/.test(m[2]) });
    return tasks;
  }, []);
}

// Regra de negócio: quando TODAS as subtarefas de uma tarefa-mãe ficam
// concluídas, a tarefa-mãe deve ser marcada como concluída automaticamente
// (efeito em cascata para tarefas aninhadas em múltiplos níveis). Só age no
// sentido de completar — desmarcar uma subtarefa nunca desmarca a mãe de volta.
// Retorna os índices de checkbox (mesma numeração de checkboxCharIndex/
// toggleCheckboxAt) que ainda precisam ser marcados como concluídos.
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

// Renderiza bloco a bloco (via marked.lexer) marcando cada wrapper com a linha
// de origem em que o bloco começa, para permitir navegação preview → editor.
// ``.md-block`` usa `display: contents` (ver style.css) para não afetar o
// layout/CSS existente — os wrappers ficam invisíveis à árvore de renderização.
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

/**
 * Renderiza markdown em qualquer container.
 * @param {string} content  — source markdown
 * @param {HTMLElement} el  — container de destino
 * @param {{ onCheckboxChange?: (idx:number)=>void, enableCapture?: boolean, trackSourceLines?: boolean }} opts
 */
export function renderMarkdown(content, el, { onCheckboxChange, enableCapture = true, trackSourceLines = false } = {}) {
  el.innerHTML = trackSourceLines ? renderBlocksWithLineMap(content) : marked.parse(content);

  const diagrams = el.querySelectorAll(".mermaid");
  if (diagrams.length && typeof mermaid !== "undefined") {
    diagrams.forEach((d) => d.removeAttribute("data-processed"));
    // Espera a fonte (Google Fonts "Inter", carregada com font-display:swap)
    // terminar de carregar antes de medir/renderizar. Sem isso, o mermaid mede
    // os labels com a fonte de fallback, e quando a Inter chega depois o texto
    // reflui para uma largura maior — os títulos de subgraph (que já ficaram
    // com white-space:normal fixado em px por fixMermaidLabels) quebram linha
    // e ficam cortados atrás das caixas.
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

// ── Preview do editor ─────────────────────────────────────────────────────────

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

// Duplo-clique num bloco do preview leva o cursor do editor até a linha de
// origem correspondente (troca para split se estiver em "só preview").
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

// ── Corrige labels cortados em nós mermaid ────────────────────────────────────

function fixMermaidLabels(svgEl) {
  svgEl.querySelectorAll("foreignObject").forEach(fo => {
    const foW = parseFloat(fo.getAttribute("width") || 0);
    const foH = parseFloat(fo.getAttribute("height") || 0);
    if (foW < 10 || foH < 10) return; // pula edge-labels (w=0 ou h=0)

    const div = fo.querySelector("div");
    if (!div) return;

    // Mede a largura natural do conteúdo (respeita os <br/> manuais do
    // mermaid como quebras "duras", sem forçar reflow de palavra).
    // O cálculo de largura do próprio mermaid pode ficar 1-2px menor que o
    // necessário (diferença de métricas de fonte); nesse caso, com
    // white-space:normal sozinho, a última palavra de uma linha curta
    // ("Delivery", "Faturamento"...) acaba sendo quebrada letra a letra.
    // Por isso medimos o conteúdo com width:max-content antes de decidir
    // se precisa crescer, e só então fixamos uma largura explícita.
    div.style.whiteSpace = "normal";
    div.style.wordBreak = "break-word";
    div.style.width = "max-content";
    // getBoundingClientRect() devolve sub-pixels (ex: 47.23px), enquanto
    // scrollWidth arredonda para inteiros. Usar Math.ceil garante que nunca
    // ficamos 1 pixel abaixo do necessário, evitando word-break quebrando
    // palavras como "Invoice" → "Invoic/e" por margem de fração de pixel.
    // Soma 2px de folga: white-space:normal + largura fixa em px é sensível a
    // qualquer diferença de métrica entre a medição e o paint final (ex.: a
    // fonte Inter do Google Fonts ainda trocando de fallback→Inter), e sem
    // essa margem a última palavra pode quebrar linha por 1px de sobra.
    const naturalW = Math.ceil(div.getBoundingClientRect().width) + 2;
    const finalW = Math.max(foW, naturalW);
    div.style.width = finalW + "px";

    const realH = div.scrollHeight;
    const deltaH = realH - foH;
    const deltaW = finalW - foW;
    if (deltaH < 2 && deltaW < 2) return;

    // Expande foreignObject (largura e altura)
    if (deltaW >= 2) {
      fo.setAttribute("width", finalW);
      fo.setAttribute("x", parseFloat(fo.getAttribute("x") || 0) - deltaW / 2);
    }
    if (deltaH >= 2) fo.setAttribute("height", realH);

    // Expande rect de fundo (padding de 7.5px em cada lado)
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

    // Reposiciona g.label verticalmente para manter centralizado
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

// ── Captura de elementos como imagem ─────────────────────────────────────────

function addCaptureButtons(container) {
  // Blocos de código: envolve em .capture-wrap e adiciona botão de copiar
  container.querySelectorAll("pre").forEach((pre) => {
    if (pre.closest(".capture-wrap")) return;
    const wrap = wrapInCapture(pre);
    wrap.appendChild(makeCopyBtn(pre));
  });

  // Tabelas
  container.querySelectorAll("table").forEach((table, i) => {
    if (table.closest(".capture-wrap")) return;
    const wrap = wrapInCapture(table);
    wrap.appendChild(
      makeCaptureBtn(() => captureWithCanvas(table, `tabela-${i + 1}.png`)),
    );
  });

  // Mermaid (já tem position:relative no próprio .mermaid-wrap)
  container.querySelectorAll(".mermaid-wrap").forEach((wrap, i) => {
    if (!wrap.querySelector(".capture-btn")) {
      wrap.appendChild(
        makeCaptureBtn(() => captureMermaid(wrap, `diagrama-${i + 1}.png`)),
      );
    }
    if (!wrap.querySelector(".mermaid-edit-btn")) {
      wrap.appendChild(makeEditBtn(() => editMermaidBlock(wrap)));
    }
    if (!wrap.querySelector(".mermaid-modal-btn")) {
      wrap.appendChild(makeExpandBtn(() => openMermaidModal(wrap)));
    }
  });
}

// Manda o cursor do editor para a linha de origem do bloco ```mermaid``` que
// gerou este .mermaid-wrap (via data-line do .md-block ancestral, o mesmo
// mecanismo usado pelo dblclick de sincronização preview→editor) e então abre
// o construtor visual, que detecta o bloco na posição do cursor e o carrega.
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

function makeExpandBtn(onClick) {
  const btn = document.createElement("button");
  btn.className = "mermaid-modal-btn";
  btn.title = "Visualizar diagrama em tela cheia";
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

  // getBBox() no grupo raiz captura o conteúdo real, inclusive labels que excedem as dims declaradas do SVG
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

  const btnOut   = mkBtn("−", "Reduzir (scroll para baixo)");
  const btnIn    = mkBtn("+", "Ampliar (scroll para cima)");
  const btnFit   = mkBtn("↺ Ajustar", "Ajustar ao tamanho do painel");
  const btnClose = mkBtn("✕ Fechar", "Fechar (Esc)");
  btnClose.style.marginLeft = "auto";

  toolbar.append(label, levelEl, btnOut, btnIn, btnFit, btnClose);

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

// Mermaid: extrai o SVG e converte para PNG via canvas.
//
// Problema: SVGs com <foreignObject> ou estilos com "font-family:inherit" taintam
// o canvas em Chromium (mesmo vindos de blob URL), tornando toBlob() inoperante.
// Solução: antes de serializar o clone, resolver "inherit" no <style> e substituir
// cada <foreignObject> por um <text> SVG nativo com os mesmos rótulos.
async function captureMermaid(wrap, filename) {
  const svgEl = wrap.querySelector("svg");
  if (!svgEl) {
    toast("Diagrama ainda não renderizado.", "info");
    return;
  }

  // Bounding box real do conteúdo (inclui labels expandidos por fixMermaidLabels)
  const rootG = svgEl.querySelector(":scope > g");
  let bx = 0, by = 0, bw = 800, bh = 200;
  try {
    const bb = (rootG || svgEl).getBBox();
    bx = bb.x - 24; by = bb.y - 24;
    bw = bb.width + 48; bh = bb.height + 48;
  } catch { /* fallback */ }

  // 2× para exportar em alta resolução
  const exportW = Math.ceil(bw) * 2;
  const exportH = Math.ceil(bh) * 2;

  const clone = svgEl.cloneNode(true);
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", exportW);
  clone.setAttribute("height", exportH);
  clone.setAttribute("viewBox", `${bx} ${by} ${bw} ${bh}`);
  clone.removeAttribute("style");

  // Remove clip-paths que podem cortar labels fora do viewBox original
  clone.querySelectorAll("[clip-path]").forEach((el) => el.removeAttribute("clip-path"));

  // Resolve "font-family: inherit" → valor literal para tornar o SVG standalone
  const styleEl = clone.querySelector("style");
  if (styleEl) {
    const cs = getComputedStyle(svgEl);
    const ff = cs.fontFamily || "Arial, sans-serif";
    styleEl.textContent = styleEl.textContent
      .replace(/font-family\s*:\s*inherit/g, `font-family: ${ff}`)
      .replace(/\bcolor\s*:\s*inherit\b/g, "color: currentColor");
  }

  // Substitui <foreignObject> (HTML) por <text> SVG nativo.
  // <foreignObject> taint o canvas em Chromium independentemente de outras medidas.
  clone.querySelectorAll("foreignObject").forEach((fo) => {
    const w = parseFloat(fo.getAttribute("width") || 0);
    const h = parseFloat(fo.getAttribute("height") || 0);
    if (w < 1 || h < 1) { fo.remove(); return; }

    const x = parseFloat(fo.getAttribute("x") || 0);
    const y = parseFloat(fo.getAttribute("y") || 0);
    const div = fo.querySelector("div");
    if (!div) { fo.remove(); return; }

    // Coleta linhas de texto respeitando <br> explícitos
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

// Tabelas: usa html2canvas (CDN) se disponível, senão SVG foreignObject
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
  // Fallback: SVG foreignObject (sem estilos externos)
  await captureViaForeignObject(el, filename);
}

async function captureViaForeignObject(el, filename) {
  const rect = el.getBoundingClientRect();
  const w = Math.ceil(rect.width) || 800;
  const h = Math.ceil(rect.height) || 400;

  // Inline computed styles para capturar syntax highlight, etc.
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
