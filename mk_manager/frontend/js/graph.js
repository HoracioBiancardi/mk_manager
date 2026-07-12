// Responsabilidade: grafo de notas (nós = notas/tasks, arestas = [[links]] resolvidos).
// Física de força via D3, carregado sob demanda (só quando a tela de Grafo abre)
// pra não pesar o carregamento inicial da página.

import { esc, toast } from "./utils.js";
import { apiFetch } from "./api.js";
import { openFile, openOrCreateByTitle } from "./files.js";
import { st } from "./state.js";

const NODE_PALETTE = ["#f87171", "#fb923c", "#fbbf24", "#34d399", "#38bdf8", "#818cf8", "#e879f9", "#94a3b8"];

let _d3Promise = null;
let _simulation = null;
let _graphData = null;
let _filter = "all"; // all | note | task
let _tagFilter = ""; // "" = todas
let _folderFilter = ""; // "" = todas
let _showOrphans = true;

function loadD3() {
  if (window.d3) return Promise.resolve();
  if (_d3Promise) return _d3Promise;
  _d3Promise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/d3@7/dist/d3.min.js";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Falha ao carregar D3 (offline?)"));
    document.head.appendChild(s);
  });
  return _d3Promise;
}

function hashString(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function colorFor(node) {
  if (node.type === "phantom") return "#6e7681";
  if (!node.tags?.length) return "#7d8590";
  return NODE_PALETTE[hashString(node.tags[0]) % NODE_PALETTE.length];
}

export async function renderGraph() {
  const container = document.getElementById("graph-container");
  if (!container) return;
  container.innerHTML = '<div class="graph-loading">Carregando grafo…</div>';
  try {
    await loadD3();
    await fetchGraphData();
    drawGraph();
  } catch (e) {
    container.innerHTML = `<div class="graph-loading">Erro ao carregar grafo: ${esc(e.message)}</div>`;
    toast("Erro ao carregar grafo: " + e.message, "error");
  }
}

async function fetchGraphData() {
  const r = await apiFetch("/graph");
  _graphData = await r.json();
  populateGraphFilterOptions();
}

// Chamado após qualquer criação/edição/exclusão/movimentação de arquivo ou pasta,
// pra manter o grafo em sincronia sem esperar o usuário sair e voltar pra tela.
export async function refreshGraphIfActive() {
  if (st.mainView !== "graph" || !_graphData) return;
  try {
    await fetchGraphData();
    drawGraph();
  } catch (e) {
    toast("Erro ao atualizar grafo: " + e.message, "error");
  }
}

function populateGraphFilterOptions() {
  const tagSel = document.getElementById("graph-tag-filter");
  const folderSel = document.getElementById("graph-folder-filter");
  if (!tagSel || !folderSel) return;

  const tags = new Set();
  const folders = new Set();
  for (const n of _graphData.nodes) {
    if (n.type === "phantom") continue;
    (n.tags || []).forEach((t) => tags.add(t));
    if (n.folder) folders.add(n.folder);
  }

  const buildOptions = (sel, values, current, allLabel) => {
    const sorted = [...values].sort((a, b) => a.localeCompare(b));
    sel.innerHTML =
      `<option value="">${allLabel}</option>` +
      sorted.map((v) => `<option value="${esc(v)}">${esc(v)}</option>`).join("");
    sel.value = sorted.includes(current) ? current : "";
  };
  buildOptions(tagSel, tags, _tagFilter, "Todas as tags");
  buildOptions(folderSel, folders, _folderFilter, "Todas as pastas");
  _tagFilter = tagSel.value;
  _folderFilter = folderSel.value;
}

export function setGraphFilter(f) {
  _filter = f;
  document
    .querySelectorAll("#graph-pane .filter-tab")
    .forEach((b) => b.classList.toggle("active", b.dataset.filter === f));
  if (_graphData) drawGraph();
}

export function setGraphTagFilter(v) {
  _tagFilter = v;
  if (_graphData) drawGraph();
}

export function setGraphFolderFilter(v) {
  _folderFilter = v;
  if (_graphData) drawGraph();
}

export function toggleGraphOrphans() {
  _showOrphans = !_showOrphans;
  document.getElementById("graph-orphans-btn")?.classList.toggle("active", _showOrphans);
  if (_graphData) drawGraph();
}

// Casamento hierárquico: filtrar por "area" também mostra nós com tag/pasta "area/sub".
function matchesHierarchy(value, filter) {
  return value === filter || value.startsWith(filter + "/");
}

function onNodeClick(d) {
  if (d.type === "phantom") openOrCreateByTitle(d.title);
  else openFile(d.id);
}

function drawGraph() {
  _simulation?.stop();
  const container = document.getElementById("graph-container");
  container.innerHTML = "";
  const width = container.clientWidth || 800;
  const height = container.clientHeight || 500;

  const nodesById = new Map();
  const nodes = _graphData.nodes
    .filter((n) => _filter === "all" || n.type === _filter || n.type === "phantom")
    .filter((n) => n.type === "phantom" || !_tagFilter || (n.tags || []).some((t) => matchesHierarchy(t, _tagFilter)))
    .filter((n) => n.type === "phantom" || !_folderFilter || matchesHierarchy(n.folder || "", _folderFilter))
    .map((n) => ({ ...n }));
  nodes.forEach((n) => nodesById.set(n.id, n));

  const edges = _graphData.edges
    .filter((e) => nodesById.has(e.source) && nodesById.has(e.target))
    .map((e) => ({ ...e }));

  const degree = new Map();
  edges.forEach((e) => {
    degree.set(e.source, (degree.get(e.source) || 0) + 1);
    degree.set(e.target, (degree.get(e.target) || 0) + 1);
  });

  const visibleNodes = _showOrphans ? nodes : nodes.filter((n) => degree.get(n.id));
  const visibleIds = new Set(visibleNodes.map((n) => n.id));
  const visibleEdges = edges.filter((e) => visibleIds.has(e.source) && visibleIds.has(e.target));

  if (!visibleNodes.length) {
    container.innerHTML = '<div class="graph-loading">Nenhuma nota pra mostrar com esse filtro.</div>';
    return;
  }

  const radiusFor = (d) => 6 + Math.min(degree.get(d.id) || 0, 10) * 1.6;

  const svg = d3
    .select(container)
    .append("svg")
    .attr("width", "100%")
    .attr("height", "100%")
    .attr("viewBox", [0, 0, width, height]);

  const g = svg.append("g");
  svg.call(d3.zoom().scaleExtent([0.15, 4]).on("zoom", (ev) => g.attr("transform", ev.transform)));

  const simulation = d3
    .forceSimulation(visibleNodes)
    .force("link", d3.forceLink(visibleEdges).id((d) => d.id).distance(70).strength(0.5))
    .force("charge", d3.forceManyBody().strength(-220))
    .force("center", d3.forceCenter(width / 2, height / 2))
    .force("collide", d3.forceCollide().radius((d) => radiusFor(d) + 8));

  const link = g
    .append("g")
    .attr("stroke", "#30363d")
    .attr("stroke-width", 1.2)
    .selectAll("line")
    .data(visibleEdges)
    .join("line");

  const node = g
    .append("g")
    .selectAll("g")
    .data(visibleNodes)
    .join("g")
    .attr("class", (d) => `graph-node${d.type === "phantom" ? " phantom" : ""}`)
    .call(
      d3
        .drag()
        .on("start", (event, d) => {
          if (!event.active) simulation.alphaTarget(0.3).restart();
          d.fx = d.x;
          d.fy = d.y;
        })
        .on("drag", (event, d) => {
          d.fx = event.x;
          d.fy = event.y;
        })
        .on("end", (event, d) => {
          if (!event.active) simulation.alphaTarget(0);
          d.fx = null;
          d.fy = null;
        }),
    )
    .on("click", (event, d) => onNodeClick(d));

  node
    .append("circle")
    .attr("r", radiusFor)
    .attr("fill", colorFor)
    .attr("stroke", (d) => (d.type === "phantom" ? "#6e7681" : "#0d1117"))
    .attr("stroke-width", 1.5)
    .attr("stroke-dasharray", (d) => (d.type === "phantom" ? "3,2" : null));

  node
    .append("text")
    .text((d) => d.title)
    .attr("x", (d) => radiusFor(d) + 4)
    .attr("y", 4)
    .attr("fill", "#e6edf3")
    .attr("font-size", "11px")
    .attr("font-family", "inherit")
    .attr("pointer-events", "none");

  node.append("title").text((d) => d.title);

  simulation.on("tick", () => {
    link
      .attr("x1", (d) => d.source.x)
      .attr("y1", (d) => d.source.y)
      .attr("x2", (d) => d.target.x)
      .attr("y2", (d) => d.target.y);
    node.attr("transform", (d) => `translate(${d.x},${d.y})`);
  });

  _simulation = simulation;
}

// ── Expor ao DOM (necessário para event handlers inline) ──────────────────────
Object.assign(window, { setGraphFilter, setGraphTagFilter, setGraphFolderFilter, toggleGraphOrphans });
