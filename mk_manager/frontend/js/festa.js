// Tema Festa: cada clique solta uma explosão de faíscas na cor do tema. Só age com o tema ativo
// e quando o sistema não pede menos movimento (prefers-reduced-motion).
const FAISCAS = ["✦", "✧", "•", "◆", "✶", "·"];
const menosMovimento = window.matchMedia("(prefers-reduced-motion: reduce)");

function explodir(x, y) {
  const qtd = 10;
  for (let i = 0; i < qtd; i++) {
    const el = document.createElement("span");
    el.className = "festa-particula";
    el.setAttribute("aria-hidden", "true");
    el.textContent = FAISCAS[Math.floor(Math.random() * FAISCAS.length)];
    const ang = (Math.PI * 2 * i) / qtd + Math.random() * 0.5;
    const dist = 50 + Math.random() * 70;
    el.style.left = x + "px";
    el.style.top = y + "px";
    el.style.setProperty("--dx", Math.cos(ang) * dist + "px");
    el.style.setProperty("--dy", Math.sin(ang) * dist + "px");
    el.style.setProperty("--giro", (Math.random() * 720 - 360) + "deg");
    el.addEventListener("animationend", () => el.remove());
    document.body.appendChild(el);
  }
}

document.addEventListener("pointerdown", (e) => {
  if (!document.body.classList.contains("theme-festa") || menosMovimento.matches) return;
  // Só em coisas clicáveis, para não virar confete enquanto se digita ou seleciona texto.
  if (!e.target.closest("button, a, .activity-btn, .tree-item, .file-item, .kanban-card, .filter-tab")) return;
  explodir(e.clientX, e.clientY);
});
