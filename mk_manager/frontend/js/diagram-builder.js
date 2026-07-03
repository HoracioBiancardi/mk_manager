// Responsabilidade: construtor visual de diagramas (caixas + setas) que gera
// sintaxe Mermaid flowchart e também consegue abrir/editar um bloco
// ```mermaid``` já existente no editor (ver findMermaidBlockAt/parseMermaid).
//
// Reaproveita as classes .mermaid-zoom-overlay/.mermaid-zoom-modal/
// .mermaid-zoom-toolbar/.mermaid-zoom-ctrl (style.css) para o chrome do
// modal, definindo só o necessário para o canvas de nós/setas.

import { ins, onEditorInput, replaceRange } from "./editor.js";
import { toast } from "./utils.js";

const SVG_NS = "http://www.w3.org/2000/svg";

const SHAPES = ["rect", "round", "rhombus", "circle"];
const SHAPE_ICON = { rect: "▭", round: "⬭", rhombus: "◇", circle: "●" };
const SHAPE_WRAP = {
  rect: (l) => `["${l}"]`,
  round: (l) => `("${l}")`,
  rhombus: (l) => `{"${l}"}`,
  circle: (l) => `(("${l}"))`,
};

const EDGE_TYPES = ["arrow", "dashed", "line", "both"];
const EDGE_TYPE_LABEL = { arrow: "→ Seta", dashed: "⇢ Tracejada", line: "─ Linha", both: "↔ Dupla" };
const EDGE_ARROW = { arrow: "-->", dashed: "-.->", line: "---", both: "<-->" };
const TYPE_BY_ARROW = { "-->": "arrow", "-.->": "dashed", "---": "line", "<-->": "both" };

const HISTORY_LIMIT = 50;

let state = null; // { nodes, edges, groups, direction, nextId, nextGroupId, nextEdgeType, sourceRange }
let els = null; // { overlay, canvas, svg, btnDir, btnEdgeType, btnUndo, btnRedo, btnInsert }
let history = { past: [], future: [] };

function sanitizeText(text, fallback) {
  return String(text ?? "").replace(/"/g, "'").replace(/\s*\n\s*/g, " ").trim() || fallback;
}
function sanitizeLabel(text) {
  return sanitizeText(text, "Nó");
}

// Um nó pertence a um grupo se seu centro cai dentro do retângulo do grupo
// no canvas — a posição visual é a fonte da verdade, não um vínculo salvo,
// então arrastar uma caixa para dentro/fora de um grupo já muda a saída.
function groupRect(group) {
  const el = group.el;
  return { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight };
}
function nodeInGroup(node, group) {
  const r = groupRect(group);
  const el = node.el;
  const cx = el.offsetLeft + el.offsetWidth / 2;
  const cy = el.offsetTop + el.offsetHeight / 2;
  return cx >= r.x && cx <= r.x + r.w && cy >= r.y && cy <= r.y + r.h;
}

function toMermaidSyntax(s) {
  if (!s.nodes.length) return "";
  const lines = [`flowchart ${s.direction}`];
  const placed = new Set();
  for (const g of s.groups) {
    const members = s.nodes.filter((n) => nodeInGroup(n, g));
    if (!members.length) continue;
    lines.push(`    subgraph ${g.id} ["${sanitizeText(g.title, "Grupo")}"]`);
    for (const n of members) {
      placed.add(n.id);
      const wrap = SHAPE_WRAP[n.shape] || SHAPE_WRAP.rect;
      lines.push(`        ${n.id}${wrap(sanitizeLabel(n.label))}`);
    }
    lines.push("    end");
  }
  for (const n of s.nodes) {
    if (placed.has(n.id)) continue;
    const wrap = SHAPE_WRAP[n.shape] || SHAPE_WRAP.rect;
    lines.push(`    ${n.id}${wrap(sanitizeLabel(n.label))}`);
  }
  for (const e of s.edges) {
    const arrow = EDGE_ARROW[e.type] || EDGE_ARROW.arrow;
    const label = e.label ? sanitizeLabel(e.label) : "";
    lines.push(label ? `    ${e.from} ${arrow}|${label}| ${e.to}` : `    ${e.from} ${arrow} ${e.to}`);
  }
  return lines.join("\n");
}

// ── Parser: lê um bloco ```mermaid``` (nosso formato, com nós declarados em
// linhas próprias, ou o formato compacto em que a forma é declarada direto
// na linha da seta, ex. `A[Início] --> B[Passo]`) e extrai nós/edges ──

function nodeDeclRegex() {
  return /([A-Za-z0-9_]+)(\(\(("[^"]*"|[^()]*)\)\)|\[("[^"]*"|[^[\]]*)\]|\{("[^"]*"|[^{}]*)\}|\(("[^"]*"|[^()]*)\))/g;
}
function edgeRegex() {
  return /([A-Za-z0-9_]+)\s*(<-->|-\.->|-->|---)\s*(?:\|([^|]*)\|\s*)?([A-Za-z0-9_]+)/g;
}
function unquote(s) {
  const t = (s ?? "").trim();
  return t.startsWith('"') && t.endsWith('"') ? t.slice(1, -1) : t;
}

// `subgraph ID [Título]`, `subgraph ID ["Título"]` ou `subgraph ID` (sem título)
function parseSubgraphHeader(line) {
  const m = /^subgraph\s+([^\s[]+)\s*(?:\[\s*(.*?)\s*\])?\s*$/i.exec(line);
  if (!m) return null;
  const id = m[1];
  const title = m[2] !== undefined ? unquote(m[2]) : id;
  return { id, title };
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

function parseMermaid(body) {
  const lines = body.split("\n").map((l) => l.trim()).filter(Boolean);
  if (!lines.length || !/^flowchart\s+/i.test(lines[0])) return null;
  const direction = /^flowchart\s+LR/i.test(lines[0]) ? "LR" : "TD";
  const bodyLines = lines.slice(1);

  // Separa marcadores subgraph/end do resto: cada linha "normal" carrega o id
  // do grupo em que está aninhada (se houver), pra atribuir os nós a ele.
  // Subgraphs aninhados colapsam no grupo mais interno (não suportamos
  // hierarquia de grupos no builder visual).
  const groups = [];
  const groupStack = [];
  const flatLines = [];
  for (const line of bodyLines) {
    if (/^end$/i.test(line)) { groupStack.pop(); continue; }
    const sg = parseSubgraphHeader(line);
    if (sg) { groups.push(sg); groupStack.push(sg.id); continue; }
    flatLines.push({ line, groupId: groupStack[groupStack.length - 1] || null });
  }

  const nodeMap = new Map();
  const nodeGroupId = new Map();
  const registerNode = (id, shape, rawLabel, groupId) => {
    if (!nodeMap.has(id)) {
      nodeMap.set(id, { id, label: unquote(rawLabel) || id, shape });
      if (groupId) nodeGroupId.set(id, groupId);
    } else if (groupId && !nodeGroupId.has(id)) {
      nodeGroupId.set(id, groupId);
    }
  };

  for (const { line, groupId } of flatLines) {
    const re = nodeDeclRegex();
    let m;
    while ((m = re.exec(line))) {
      if (m[3] !== undefined) registerNode(m[1], "circle", m[3], groupId);
      else if (m[4] !== undefined) registerNode(m[1], "rect", m[4], groupId);
      else if (m[5] !== undefined) registerNode(m[1], "rhombus", m[5], groupId);
      else if (m[6] !== undefined) registerNode(m[1], "round", m[6], groupId);
    }
  }

  const edges = [];
  for (const { line: rawLine, groupId } of flatLines) {
    const cleaned = rawLine.replace(nodeDeclRegex(), (_, id) => id);
    const re = edgeRegex();
    let m;
    while ((m = re.exec(cleaned))) {
      const [, from, arrow, label, to] = m;
      registerNode(from, "rect", from, groupId);
      registerNode(to, "rect", to, groupId);
      edges.push({ from, to, label: (label || "").trim(), type: TYPE_BY_ARROW[arrow] || "arrow" });
    }
  }

  if (!nodeMap.size) return null;
  const nodes = [...nodeMap.values()].map((n) => ({ ...n, groupId: nodeGroupId.get(n.id) || null }));
  return { direction, nodes, groups, edges };
}

// ── Histórico (undo/redo) ───────────────────────────────────────────────────

function snapshot() {
  return {
    direction: state.direction,
    nextId: state.nextId,
    nextGroupId: state.nextGroupId,
    nodes: state.nodes.map((n) => ({ id: n.id, label: n.label, shape: n.shape, x: n.el.offsetLeft, y: n.el.offsetTop })),
    edges: state.edges.map((e) => ({ from: e.from, to: e.to, label: e.label, type: e.type })),
    groups: state.groups.map((g) => ({
      id: g.id, title: g.title,
      x: g.el.offsetLeft, y: g.el.offsetTop, w: g.el.offsetWidth, h: g.el.offsetHeight,
    })),
  };
}

function updateHistoryButtons() {
  if (!els) return;
  els.btnUndo.disabled = history.past.length === 0;
  els.btnRedo.disabled = history.future.length === 0;
}

function commitHistory(snap) {
  history.past.push(snap);
  if (history.past.length > HISTORY_LIMIT) history.past.shift();
  history.future = [];
  updateHistoryButtons();
}

function pushHistory() {
  if (state) commitHistory(snapshot());
}

function restoreSnapshot(snap) {
  state.nodes.slice().forEach((n) => n.el.remove());
  state.edges.slice().forEach((e) => e.g.remove());
  state.groups.slice().forEach((g) => g.el.remove());
  state.direction = snap.direction;
  state.nextId = snap.nextId;
  state.nextGroupId = snap.nextGroupId;
  state.groups = snap.groups.map((g) => ({ ...g }));
  state.nodes = snap.nodes.map((n) => ({ ...n }));
  state.edges = snap.edges.map((e) => ({ ...e }));
  state.groups.forEach(makeGroupElement);
  state.nodes.forEach(makeNodeElement);
  state.edges.forEach(makeEdgeElement);
  updateDirectionBtnLabel();
}

function undo() {
  if (!history.past.length) return;
  history.future.push(snapshot());
  restoreSnapshot(history.past.pop());
  updateHistoryButtons();
}

function redo() {
  if (!history.future.length) return;
  history.past.push(snapshot());
  restoreSnapshot(history.future.pop());
  updateHistoryButtons();
}

// ── Geometria ────────────────────────────────────────────────────────────────

function nodeCenter(node) {
  const el = node.el;
  return { x: el.offsetLeft + el.offsetWidth / 2, y: el.offsetTop + el.offsetHeight / 2 };
}

// Interseção do segmento centro→centro com a borda do retângulo de destino,
// para a seta parar na borda da caixa em vez de atravessá-la.
function borderPoint(fromC, toEl) {
  const w = toEl.offsetWidth / 2, h = toEl.offsetHeight / 2;
  const cx = toEl.offsetLeft + w, cy = toEl.offsetTop + h;
  const dx = fromC.x - cx, dy = fromC.y - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  const scale = 1 / Math.max(Math.abs(dx) / w, Math.abs(dy) / h);
  return { x: cx + dx * scale, y: cy + dy * scale };
}

function updateEdgeGeometry(edge) {
  const from = state.nodes.find((n) => n.id === edge.from);
  const to = state.nodes.find((n) => n.id === edge.to);
  if (!from || !to) return;
  const c1 = nodeCenter(from);
  const p2 = borderPoint(c1, to.el);
  const p1 = borderPoint(p2, from.el);
  edge.hit.setAttribute("x1", p1.x); edge.hit.setAttribute("y1", p1.y);
  edge.hit.setAttribute("x2", p2.x); edge.hit.setAttribute("y2", p2.y);
  edge.line.setAttribute("x1", p1.x); edge.line.setAttribute("y1", p1.y);
  edge.line.setAttribute("x2", p2.x); edge.line.setAttribute("y2", p2.y);

  if (edge.label) {
    const mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2;
    edge.labelText.textContent = edge.label;
    edge.labelText.setAttribute("x", mx);
    edge.labelText.setAttribute("y", my);
    edge.labelText.style.display = "";
    const bbox = edge.labelText.getBBox();
    edge.labelBg.setAttribute("x", bbox.x - 3);
    edge.labelBg.setAttribute("y", bbox.y - 1);
    edge.labelBg.setAttribute("width", bbox.width + 6);
    edge.labelBg.setAttribute("height", bbox.height + 2);
    edge.labelBg.style.display = "";
  } else {
    edge.labelText.style.display = "none";
    edge.labelBg.style.display = "none";
  }
}

function updateEdgesFor(nodeId) {
  state.edges.forEach((e) => {
    if (e.from === nodeId || e.to === nodeId) updateEdgeGeometry(e);
  });
}

function removeEdge(edge) {
  edge.g.remove();
  state.edges = state.edges.filter((e) => e !== edge);
}

function removeNode(node) {
  state.edges.filter((e) => e.from === node.id || e.to === node.id).forEach(removeEdge);
  node.el.remove();
  state.nodes = state.nodes.filter((n) => n !== node);
}

// ── Grupos (subgraph) ────────────────────────────────────────────────────────

function removeGroup(group) {
  // Remove só a caixa do grupo — as caixas dentro dela continuam soltas.
  group.el.remove();
  state.groups = state.groups.filter((g) => g !== group);
}

function startGroupDrag(group, downEvent) {
  downEvent.preventDefault();
  const startLeft = group.el.offsetLeft, startTop = group.el.offsetTop;
  // Membros são decididos uma vez, no início do arraste: move junto quem
  // estava visualmente dentro do grupo nesse instante.
  const members = state.nodes
    .filter((n) => nodeInGroup(n, group))
    .map((n) => ({ node: n, left: n.el.offsetLeft, top: n.el.offsetTop }));
  const preSnapshot = snapshot();
  let dx = 0, dy = 0, moved = false;

  const onMove = (e) => {
    dx += e.movementX; dy += e.movementY;
    moved = true;
    group.el.style.left = `${startLeft + dx}px`;
    group.el.style.top = `${startTop + dy}px`;
    members.forEach(({ node, left, top }) => {
      node.el.style.left = `${left + dx}px`;
      node.el.style.top = `${top + dy}px`;
      updateEdgesFor(node.id);
    });
  };
  const onUp = () => {
    document.removeEventListener("pointermove", onMove);
    document.removeEventListener("pointerup", onUp);
    if (moved) commitHistory(preSnapshot);
  };
  document.addEventListener("pointermove", onMove);
  document.addEventListener("pointerup", onUp);
}

const GROUP_MIN_W = 160;
const GROUP_MIN_H = 110;

function startGroupResize(group, downEvent) {
  downEvent.preventDefault();
  downEvent.stopPropagation();
  const startW = group.el.offsetWidth, startH = group.el.offsetHeight;
  const preSnapshot = snapshot();
  let dw = 0, dh = 0, moved = false;

  const onMove = (e) => {
    dw += e.movementX; dh += e.movementY;
    moved = true;
    group.el.style.width = `${Math.max(GROUP_MIN_W, startW + dw)}px`;
    group.el.style.height = `${Math.max(GROUP_MIN_H, startH + dh)}px`;
  };
  const onUp = () => {
    document.removeEventListener("pointermove", onMove);
    document.removeEventListener("pointerup", onUp);
    if (moved) commitHistory(preSnapshot);
  };
  document.addEventListener("pointermove", onMove);
  document.addEventListener("pointerup", onUp);
}

function makeGroupElement(group) {
  const div = document.createElement("div");
  div.className = "db-group";
  div.style.left = `${group.x}px`;
  div.style.top = `${group.y}px`;
  div.style.width = `${group.w}px`;
  div.style.height = `${group.h}px`;

  const titleBar = document.createElement("div");
  titleBar.className = "db-group-title";
  titleBar.title = "Arraste para mover o grupo (e as caixas dentro dele)";

  const titleText = document.createElement("div");
  titleText.className = "db-group-title-text";
  titleText.contentEditable = "true";
  titleText.spellcheck = false;
  titleText.textContent = group.title;
  titleText.addEventListener("pointerdown", (e) => e.stopPropagation());
  titleText.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); titleText.blur(); }
  });
  titleText.addEventListener("blur", () => {
    const next = titleText.textContent.trim() || "Grupo";
    if (next !== group.title) pushHistory();
    group.title = next;
    titleText.textContent = group.title;
  });

  const del = document.createElement("button");
  del.className = "db-group-delete";
  del.title = "Remover grupo (mantém as caixas)";
  del.textContent = "✕";
  del.addEventListener("pointerdown", (e) => e.stopPropagation());
  del.addEventListener("click", (e) => { e.stopPropagation(); pushHistory(); removeGroup(group); });

  titleBar.append(titleText, del);
  titleBar.addEventListener("pointerdown", (e) => startGroupDrag(group, e));

  const resize = document.createElement("div");
  resize.className = "db-group-resize";
  resize.title = "Arraste para redimensionar o grupo";
  resize.addEventListener("pointerdown", (e) => startGroupResize(group, e));

  div.append(titleBar, resize);

  group.el = div;
  els.canvas.appendChild(div);
}

function addGroup() {
  pushHistory();
  const i = state.groups.length;
  const group = {
    id: `g${state.nextGroupId++}`,
    title: `Grupo ${i + 1}`,
    x: 60 + (i % 4) * 24,
    y: 60 + (i % 4) * 24,
    w: 320,
    h: 220,
  };
  state.groups.push(group);
  makeGroupElement(group);
}

function applyEdgeTypeVisual(edge) {
  edge.line.classList.toggle("db-edge-line--dashed", edge.type === "dashed");
  if (edge.type === "line") edge.line.removeAttribute("marker-end");
  else edge.line.setAttribute("marker-end", "url(#db-arrow)");
  if (edge.type === "both") edge.line.setAttribute("marker-start", "url(#db-arrow-start)");
  else edge.line.removeAttribute("marker-start");
}

function makeEdgeElement(edge) {
  const g = document.createElementNS(SVG_NS, "g");
  const titleEl = document.createElementNS(SVG_NS, "title");
  titleEl.textContent = "Clique: muda tipo de seta · Duplo-clique: edita rótulo · Shift+clique: remove";
  const hit = document.createElementNS(SVG_NS, "line");
  hit.setAttribute("class", "db-edge-hit");
  const line = document.createElementNS(SVG_NS, "line");
  line.setAttribute("class", "db-edge-line");
  const labelBg = document.createElementNS(SVG_NS, "rect");
  labelBg.setAttribute("class", "db-edge-label-bg");
  const labelText = document.createElementNS(SVG_NS, "text");
  labelText.setAttribute("class", "db-edge-label");
  g.append(titleEl, hit, line, labelBg, labelText);
  // Um duplo-clique dispara "click" duas vezes antes de "dblclick" — adia o
  // ciclo de tipo para poder cancelá-lo caso um segundo clique (edição de
  // rótulo) chegue a tempo.
  let clickTimer = null;
  g.addEventListener("click", (e) => {
    if (e.shiftKey) {
      pushHistory();
      removeEdge(edge);
      return;
    }
    if (clickTimer) return;
    clickTimer = setTimeout(() => {
      clickTimer = null;
      pushHistory();
      const idx = EDGE_TYPES.indexOf(edge.type);
      edge.type = EDGE_TYPES[(idx + 1) % EDGE_TYPES.length];
      applyEdgeTypeVisual(edge);
    }, 220);
  });
  g.addEventListener("dblclick", (e) => {
    e.stopPropagation();
    if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; }
    const next = prompt("Texto da seta (vazio remove o rótulo):", edge.label || "");
    if (next === null) return;
    const trimmed = next.trim();
    if (trimmed !== edge.label) pushHistory();
    edge.label = trimmed;
    updateEdgeGeometry(edge);
  });
  edge.g = g; edge.hit = hit; edge.line = line; edge.labelBg = labelBg; edge.labelText = labelText;
  edge.type = edge.type || "arrow";
  els.svg.appendChild(g);
  applyEdgeTypeVisual(edge);
  updateEdgeGeometry(edge);
}

function startNodeDrag(node, downEvent) {
  downEvent.preventDefault();
  const startLeft = node.el.offsetLeft, startTop = node.el.offsetTop;
  const preSnapshot = snapshot();
  let dx = 0, dy = 0, moved = false;

  const onMove = (e) => {
    dx += e.movementX; dy += e.movementY;
    moved = true;
    node.el.style.left = `${startLeft + dx}px`;
    node.el.style.top = `${startTop + dy}px`;
    updateEdgesFor(node.id);
  };
  const onUp = () => {
    document.removeEventListener("pointermove", onMove);
    document.removeEventListener("pointerup", onUp);
    if (moved) commitHistory(preSnapshot);
  };
  document.addEventListener("pointermove", onMove);
  document.addEventListener("pointerup", onUp);
}

function startConnect(node, downEvent) {
  downEvent.preventDefault();
  downEvent.stopPropagation();
  const temp = document.createElementNS(SVG_NS, "line");
  temp.setAttribute("class", "db-edge-temp");
  els.svg.appendChild(temp);

  const canvasRect = () => els.canvas.getBoundingClientRect();

  const onMove = (e) => {
    const r = canvasRect();
    const c = nodeCenter(node);
    temp.setAttribute("x1", c.x); temp.setAttribute("y1", c.y);
    temp.setAttribute("x2", e.clientX - r.left + els.canvas.scrollLeft);
    temp.setAttribute("y2", e.clientY - r.top + els.canvas.scrollTop);
  };
  const onUp = (e) => {
    document.removeEventListener("pointermove", onMove);
    document.removeEventListener("pointerup", onUp);
    temp.remove();
    const targetEl = document.elementFromPoint(e.clientX, e.clientY)?.closest(".db-node");
    const targetId = targetEl?.dataset.nodeId;
    if (targetId && targetId !== node.id) {
      pushHistory();
      const edge = { from: node.id, to: targetId, label: "", type: state.nextEdgeType };
      state.edges.push(edge);
      makeEdgeElement(edge);
    }
  };
  document.addEventListener("pointermove", onMove);
  document.addEventListener("pointerup", onUp);
}

function applyNodeShapeVisual(node) {
  SHAPES.forEach((s) => node.el.classList.remove(`db-node--${s}`));
  node.el.classList.add(`db-node--${node.shape}`);
  node.shapeBtn.textContent = SHAPE_ICON[node.shape];
}

function cycleShape(node) {
  pushHistory();
  const idx = SHAPES.indexOf(node.shape);
  node.shape = SHAPES[(idx + 1) % SHAPES.length];
  applyNodeShapeVisual(node);
}

function makeNodeElement(node) {
  const div = document.createElement("div");
  div.className = "db-node";
  div.dataset.nodeId = node.id;
  div.style.left = `${node.x}px`;
  div.style.top = `${node.y}px`;

  const rhombusBg = document.createElementNS(SVG_NS, "svg");
  rhombusBg.setAttribute("class", "db-node-rhombus-bg");
  rhombusBg.setAttribute("viewBox", "0 0 100 100");
  rhombusBg.setAttribute("preserveAspectRatio", "none");
  const rhombusPoly = document.createElementNS(SVG_NS, "polygon");
  rhombusPoly.setAttribute("points", "50,1 99,50 50,99 1,50");
  rhombusPoly.setAttribute("vector-effect", "non-scaling-stroke");
  rhombusBg.appendChild(rhombusPoly);

  const shapeBtn = document.createElement("button");
  shapeBtn.className = "db-node-shape";
  shapeBtn.title = "Clique para mudar a forma";
  shapeBtn.textContent = SHAPE_ICON[node.shape || "rect"];
  shapeBtn.addEventListener("pointerdown", (e) => e.stopPropagation());
  shapeBtn.addEventListener("click", (e) => { e.stopPropagation(); cycleShape(node); });

  const label = document.createElement("div");
  label.className = "db-node-label";
  label.contentEditable = "true";
  label.spellcheck = false;
  label.textContent = node.label;
  label.addEventListener("pointerdown", (e) => e.stopPropagation());
  label.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); label.blur(); }
  });
  label.addEventListener("blur", () => {
    const next = label.textContent.trim() || "Nó";
    if (next !== node.label) pushHistory();
    node.label = next;
    label.textContent = node.label;
  });

  const handle = document.createElement("div");
  handle.className = "db-node-handle";
  handle.title = "Arraste para conectar a outra caixa";
  handle.addEventListener("pointerdown", (e) => startConnect(node, e));

  const del = document.createElement("button");
  del.className = "db-node-delete";
  del.title = "Remover caixa";
  del.textContent = "✕";
  del.addEventListener("pointerdown", (e) => e.stopPropagation());
  del.addEventListener("click", (e) => { e.stopPropagation(); pushHistory(); removeNode(node); });

  div.append(rhombusBg, shapeBtn, label, handle, del);
  div.addEventListener("pointerdown", (e) => startNodeDrag(node, e));

  node.shape = node.shape || "rect";
  node.el = div;
  node.shapeBtn = shapeBtn;
  applyNodeShapeVisual(node);
  els.canvas.appendChild(div);
}

function addNode() {
  pushHistory();
  const i = state.nodes.length;
  const node = {
    id: `n${state.nextId++}`,
    label: `Nó ${i + 1}`,
    shape: "rect",
    x: 40 + (i % 5) * 150,
    y: 40 + Math.floor(i / 5) * 110,
  };
  state.nodes.push(node);
  makeNodeElement(node);
}

function clearAll() {
  if (!state.nodes.length && !state.edges.length && !state.groups.length) return;
  pushHistory();
  state.nodes.slice().forEach(removeNode);
  state.groups.slice().forEach(removeGroup);
}

function updateDirectionBtnLabel() {
  if (els?.btnDir) els.btnDir.textContent = state.direction === "TD" ? "↕ Vertical" : "↔ Horizontal";
}

function toggleDirection() {
  pushHistory();
  state.direction = state.direction === "TD" ? "LR" : "TD";
  updateDirectionBtnLabel();
}

function cycleNextEdgeType() {
  const idx = EDGE_TYPES.indexOf(state.nextEdgeType);
  state.nextEdgeType = EDGE_TYPES[(idx + 1) % EDGE_TYPES.length];
  els.btnEdgeType.textContent = EDGE_TYPE_LABEL[state.nextEdgeType];
}

function updateInsertBtnLabel() {
  if (els?.btnInsert) els.btnInsert.textContent = state.sourceRange ? "Atualizar bloco" : "Inserir no editor";
}

function buildModal() {
  const overlay = document.createElement("div");
  overlay.className = "mermaid-zoom-overlay db-overlay";

  const modal = document.createElement("div");
  modal.className = "mermaid-zoom-modal";

  const toolbar = document.createElement("div");
  toolbar.className = "mermaid-zoom-toolbar";

  const title = document.createElement("span");
  title.className = "mermaid-zoom-label";
  title.textContent = "Construtor de diagrama";

  const mkBtn = (text, title_) => {
    const b = document.createElement("button");
    b.className = "mermaid-zoom-ctrl";
    b.textContent = text;
    b.title = title_;
    return b;
  };

  const btnAdd = mkBtn("+ Caixa", "Adicionar uma caixa");
  const btnAddGroup = mkBtn("+ Grupo", "Adicionar um grupo (vira um subgraph no Mermaid)");
  const btnDir = mkBtn("↕ Vertical", "Alternar direção do fluxo");
  const btnEdgeType = mkBtn(EDGE_TYPE_LABEL.arrow, "Tipo de seta usado nas próximas conexões");
  const btnUndo = mkBtn("↶ Desfazer", "Desfazer (Ctrl+Z)");
  const btnRedo = mkBtn("↷ Refazer", "Refazer (Ctrl+Shift+Z)");
  const btnClear = mkBtn("🗑 Limpar", "Remover todas as caixas");
  const hint = document.createElement("span");
  hint.className = "mermaid-zoom-label";
  hint.style.color = "var(--text-subtle)";
  hint.textContent = "Arraste ● para conectar · clique numa seta muda o tipo · duplo-clique edita o rótulo · shift+clique remove · arraste caixas para dentro de um grupo";
  const btnInsert = mkBtn("Inserir no editor", "Gerar Mermaid e inserir no texto");
  btnInsert.style.marginLeft = "auto";
  btnInsert.style.color = "var(--primary)";
  btnInsert.style.borderColor = "var(--primary)";
  const btnClose = mkBtn("✕ Fechar", "Fechar sem inserir (Esc)");

  toolbar.append(title, btnAdd, btnAddGroup, btnDir, btnEdgeType, btnUndo, btnRedo, btnClear, hint, btnInsert, btnClose);

  const canvasWrap = document.createElement("div");
  canvasWrap.className = "db-canvas-wrap";
  const canvas = document.createElement("div");
  canvas.className = "db-canvas";
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "db-edges");
  svg.innerHTML = `<defs>
    <marker id="db-arrow" markerWidth="10" markerHeight="10" refX="8" refY="4" orient="auto">
      <path d="M0,0 L8,4 L0,8 Z" fill="var(--primary)"></path>
    </marker>
    <marker id="db-arrow-start" markerWidth="10" markerHeight="10" refX="2" refY="4" orient="auto">
      <path d="M8,0 L0,4 L8,8 Z" fill="var(--primary)"></path>
    </marker>
  </defs>`;
  canvas.appendChild(svg);
  canvasWrap.appendChild(canvas);

  modal.append(toolbar, canvasWrap);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  els = { overlay, canvas, svg, btnDir, btnEdgeType, btnUndo, btnRedo, btnInsert };

  btnAdd.addEventListener("click", addNode);
  btnAddGroup.addEventListener("click", addGroup);
  btnDir.addEventListener("click", toggleDirection);
  btnEdgeType.addEventListener("click", cycleNextEdgeType);
  btnUndo.addEventListener("click", undo);
  btnRedo.addEventListener("click", redo);
  btnClear.addEventListener("click", clearAll);
  btnInsert.addEventListener("click", insertAndClose);
  btnClose.addEventListener("click", closeDiagramBuilder);

  const onKey = (e) => {
    if (e.key === "Escape") { closeDiagramBuilder(); return; }
    if (e.target.isContentEditable || e.target.matches("input,textarea")) return;
    if (!e.ctrlKey || e.key.toLowerCase() !== "z") return;
    e.preventDefault();
    if (e.shiftKey) redo();
    else undo();
  };
  overlay.addEventListener("keydown", onKey);
  overlay.tabIndex = -1;
  overlay.focus();
}

export function openDiagramBuilder() {
  if (els) return;
  const ta = document.getElementById("md-editor");
  const block = ta ? findMermaidBlockAt(ta.value, ta.selectionStart) : null;
  const parsed = block ? parseMermaid(block.body) : null;

  state = {
    nodes: [], edges: [], groups: [],
    direction: "TD", nextId: 1, nextGroupId: 1, nextEdgeType: "arrow", sourceRange: null,
  };
  history = { past: [], future: [] };
  buildModal();

  if (parsed) {
    state.direction = parsed.direction;
    state.sourceRange = { start: block.start, end: block.end };
    let maxN = 0;
    let maxG = 0;

    const nodesByGroup = new Map();
    const ungrouped = [];
    parsed.nodes.forEach((n) => {
      if (n.groupId) {
        if (!nodesByGroup.has(n.groupId)) nodesByGroup.set(n.groupId, []);
        nodesByGroup.get(n.groupId).push(n);
      } else {
        ungrouped.push(n);
      }
    });

    // Grupos empilhados verticalmente, cada um com seus nós num mini-grid
    // dentro do próprio retângulo — assim a filiação espacial (nodeInGroup)
    // já nasce correta ao reabrir um diagrama existente.
    let y = 40;
    parsed.groups.forEach((g) => {
      const members = nodesByGroup.get(g.id) || [];
      if (!members.length) return; // grupo vazio no texto original: descarta
      const cols = Math.min(3, members.length);
      const rows = Math.ceil(members.length / cols);
      const w = Math.max(280, cols * 150 + 40);
      const h = Math.max(150, rows * 110 + 60);
      const group = { id: g.id, title: g.title, x: 40, y, w, h };
      state.groups.push(group);
      makeGroupElement(group);

      members.forEach((n, i) => {
        const node = {
          id: n.id,
          label: n.label,
          shape: n.shape,
          x: group.x + 20 + (i % cols) * 150,
          y: group.y + 54 + Math.floor(i / cols) * 110,
        };
        state.nodes.push(node);
        makeNodeElement(node);
        const mm = /^n(\d+)$/.exec(n.id);
        if (mm) maxN = Math.max(maxN, Number(mm[1]));
      });
      const gm = /^g(\d+)$/.exec(g.id);
      if (gm) maxG = Math.max(maxG, Number(gm[1]));
      y += h + 30;
    });

    ungrouped.forEach((n, i) => {
      const node = {
        id: n.id,
        label: n.label,
        shape: n.shape,
        x: 40 + (i % 5) * 150,
        y: y + Math.floor(i / 5) * 110,
      };
      state.nodes.push(node);
      makeNodeElement(node);
      const mm = /^n(\d+)$/.exec(n.id);
      if (mm) maxN = Math.max(maxN, Number(mm[1]));
    });

    state.nextId = maxN + 1;
    state.nextGroupId = maxG + 1;
    parsed.edges.forEach((e) => {
      const edge = { from: e.from, to: e.to, label: e.label, type: e.type };
      state.edges.push(edge);
      makeEdgeElement(edge);
    });
    updateDirectionBtnLabel();
  } else {
    addNode();
    addNode();
    history = { past: [], future: [] };
  }
  updateInsertBtnLabel();
  updateHistoryButtons();
}

export function closeDiagramBuilder() {
  els?.overlay.remove();
  els = null;
  state = null;
  history = { past: [], future: [] };
}

function insertAndClose() {
  const src = toMermaidSyntax(state);
  if (!src) {
    toast("Adicione ao menos uma caixa antes de inserir.", "info");
    return;
  }
  const block = "```mermaid\n" + src + "\n```";
  if (state.sourceRange) {
    const ta = document.getElementById("md-editor");
    const { start, end } = state.sourceRange;
    replaceRange(ta, start, end, block);
    ta.selectionStart = ta.selectionEnd = start + block.length;
    ta.focus();
    onEditorInput();
  } else {
    ins(block);
  }
  closeDiagramBuilder();
}

// ── Expor ao DOM (necessário para event handlers inline) ──────────────────────
Object.assign(window, { openDiagramBuilder, closeDiagramBuilder });
