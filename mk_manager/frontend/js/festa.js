// Tema Festa: cada clique estoura uma bolha, com ondas que se espalham e
// gotinhas que respingam. Só age com o tema ativo e quando o sistema não
// pede menos movimento (prefers-reduced-motion).
const menosMovimento = window.matchMedia("(prefers-reduced-motion: reduce)");

function pecaDaBolha(classe, x, y) {
  const el = document.createElement("span");
  el.className = classe;
  el.setAttribute("aria-hidden", "true");
  el.style.left = x + "px";
  el.style.top = y + "px";
  el.addEventListener("animationend", () => el.remove());
  document.body.appendChild(el);
  return el;
}

function estourarBolha(x, y) {
  pecaDaBolha("festa-bolha", x, y);
  // duas ondas, a segunda atrasada, como água depois do estouro
  pecaDaBolha("festa-onda", x, y);
  pecaDaBolha("festa-onda festa-onda--2", x, y);
  const gotas = 8;
  for (let i = 0; i < gotas; i++) {
    const ang = (Math.PI * 2 * i) / gotas + Math.random() * 0.4;
    const dist = 28 + Math.random() * 22;
    const g = pecaDaBolha("festa-gota", x, y);
    g.style.setProperty("--dx", Math.cos(ang) * dist + "px");
    g.style.setProperty("--dy", Math.sin(ang) * dist + "px");
  }
}

document.addEventListener("pointerdown", (e) => {
  if (!document.body.classList.contains("theme-festa") || menosMovimento.matches) return;
  // Só em coisas clicáveis, para não estourar bolha enquanto se digita ou seleciona texto.
  if (!e.target.closest("button, a, .activity-btn, .tree-item, .file-item, .kanban-card, .filter-tab")) return;
  estourarBolha(e.clientX, e.clientY);
});

// ── Kanban ─────────────────────────────────────────────────────────────────
// O kanban.js redesenha o board inteiro (innerHTML) a cada mudança. Aqui um
// MutationObserver olha cada redesenho, compara com o anterior e anima só o
// que mudou: o cartão que caiu, a barra que subiu, a tarefa que terminou.
const festaAtiva = () => document.body.classList.contains("theme-festa") && !menosMovimento.matches;

let arrastando = null;              // id do cartão em arrasto
let anterior = null;                // Map id → { pct, status } do último desenho

function lerBoard(board) {
  const cols = [...board.querySelectorAll(".kanban-col")];
  const ultima = cols.length ? cols[cols.length - 1].dataset.status : null;
  const mapa = new Map();
  for (const card of board.querySelectorAll(".kanban-card[data-id]")) {
    const barra = card.querySelector(".kanban-progress-bar");
    mapa.set(card.dataset.id, {
      card,
      barra,
      pct: barra ? parseFloat(barra.style.width) : -1,
      status: card.closest(".kanban-col")?.dataset.status ?? "",
    });
  }
  return { mapa, ultima };
}

// Animações em curso por cartão. Um redesenho logo depois do drop (o
// servidor confirmando) troca o elemento; aqui a classe volta no novo.
const marcas = new Map(); // id → { classe, ate }

function marcar(card, classe, ms) {
  marcas.set(card.dataset.id + "|" + classe, { id: card.dataset.id, classe, ate: performance.now() + ms });
  card.classList.add(classe);
  setTimeout(() => {
    document.querySelector(`.kanban-card[data-id="${CSS.escape(card.dataset.id)}"]`)?.classList.remove(classe);
  }, ms);
}

function reaplicarMarcas(mapa) {
  const agora = performance.now();
  for (const [chave, m] of marcas) {
    if (m.ate <= agora) { marcas.delete(chave); continue; }
    mapa.get(m.id)?.card.classList.add(m.classe);
  }
}

function comemorar(card) {
  marcar(card, "festa-vitoria", 900);
  const r = card.getBoundingClientRect();
  const pontos = [[.5, .3], [.2, .6], [.8, .6]];
  pontos.forEach(([fx, fy], i) =>
    setTimeout(() => estourarBolha(r.left + r.width * fx, r.top + r.height * fy), i * 140),
  );
}

function aoRedesenhar(board) {
  const { mapa, ultima } = lerBoard(board);
  if (!festaAtiva()) { anterior = mapa; return; }
  reaplicarMarcas(mapa);

  if (anterior) {
    for (const [id, agora] of mapa) {
      const antes = anterior.get(id);
      if (!antes) continue;
      // a barra parte da largura antiga e sobe com mola até a nova
      if (agora.barra && antes.pct >= 0 && antes.pct !== agora.pct) {
        const alvo = agora.barra.style.width;
        agora.barra.style.width = antes.pct + "%";
        agora.barra.classList.add("festa-sobe");
        requestAnimationFrame(() => requestAnimationFrame(() => { agora.barra.style.width = alvo; }));
      }

      const terminou = (agora.pct === 100 && antes.pct >= 0 && antes.pct < 100) ||
        (ultima !== null && agora.status === ultima && antes.status !== ultima);
      if (terminou) comemorar(agora.card);
    }
  }

  if (arrastando && mapa.has(arrastando)) {
    const card = mapa.get(arrastando).card;
    marcar(card, "festa-caiu", 600);
    arrastando = null;
  }
  anterior = mapa;
}

function observarKanban() {
  const board = document.getElementById("kanban-board");
  if (!board) return;
  new MutationObserver(() => aoRedesenhar(board)).observe(board, { childList: true });

  // o board aparece (a tela do Kanban foi aberta): as barras enchem do zero
  let largura = 0;
  new ResizeObserver(([e]) => {
    const agora = e.contentRect.width;
    if (agora > 0 && largura === 0 && festaAtiva()) {
      board.classList.remove("festa-enche");
      void board.offsetWidth; // reinicia a animação
      board.classList.add("festa-enche");
      // só nesta abertura: redesenhos seguintes não devem encher de novo
      setTimeout(() => board.classList.remove("festa-enche"), 1200);
    }
    largura = agora;
  }).observe(board);
  board.addEventListener("dragstart", (e) => {
    arrastando = e.target.closest?.(".kanban-card")?.dataset.id || null;
  });
  // arrasto cancelado (soltou fora): não há queda para animar
  board.addEventListener("dragend", () => setTimeout(() => { arrastando = null; }, 400));
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", observarKanban);
else observarKanban();
