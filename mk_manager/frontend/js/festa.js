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

// Descanso de tela: depois de DESCANSO_MS sem mouse nem teclado, a aurora
// sobe por cima do app. Qualquer movimento a dispensa na hora.
const DESCANSO_MS = 2 * 60 * 1000;
let timerDescanso = null;
let descanso = null;

function criarDescanso() {
  const el = document.createElement("div");
  el.className = "festa-descanso";
  el.setAttribute("aria-hidden", "true");
  for (let i = 1; i <= 4; i++) {
    const orb = document.createElement("div");
    orb.className = "orb orb-" + i;
    el.appendChild(orb);
  }
  const texto = document.createElement("div");
  texto.className = "festa-descanso-texto";
  texto.textContent = "MK Manager";
  el.appendChild(texto);
  document.body.appendChild(el);
  return el;
}

function mostrarDescanso() {
  if (!document.body.classList.contains("theme-festa") || menosMovimento.matches) return;
  descanso = descanso || criarDescanso();
  // um frame depois, para a transição de opacidade rodar
  requestAnimationFrame(() => descanso.classList.add("ativo"));
}

function acordar() {
  if (descanso) descanso.classList.remove("ativo");
  clearTimeout(timerDescanso);
  timerDescanso = setTimeout(mostrarDescanso, DESCANSO_MS);
}

["pointermove", "pointerdown", "keydown", "wheel", "touchstart"].forEach((ev) =>
  document.addEventListener(ev, acordar, { passive: true, capture: true })
);
acordar();
