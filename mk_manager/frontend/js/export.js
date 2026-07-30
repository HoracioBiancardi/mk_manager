// Responsabilidade: exportação de Notas (PDF / Standalone HTML)

import { st } from "./state.js";
import { toast } from "./utils.js";
import { apiFetch } from "./api.js";

export async function exportCurrentNoteAsPdf() {
  if (!st.activeId) {
    toast("Nenhuma nota aberta para exportar", "warning");
    return;
  }
  window.print();
}

export async function exportCurrentNoteAsHtml() {
  if (!st.activeId) {
    toast("Nenhuma nota aberta para exportar", "warning");
    return;
  }

  try {
    const res = await apiFetch(`/files/${encodeURIComponent(st.activeId)}`);
    const file = await res.json();

    const previewEl = document.getElementById("preview-pane");
    const bodyHtml = previewEl ? previewEl.innerHTML : `<pre>${file.content}</pre>`;

    const fullHtml = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>${file.title || file.id}</title>
  <style>
    body {
      font-family: system-ui, -apple-system, sans-serif;
      line-height: 1.6;
      color: #1a1a1a;
      max-width: 800px;
      margin: 2rem auto;
      padding: 0 1rem;
    }
    h1, h2, h3 { border-bottom: 1px solid #eaeaea; padding-bottom: .3rem; }
    code { background: #f4f4f4; padding: .2rem .4rem; border-radius: 3px; font-family: monospace; }
    pre code { display: block; padding: 1rem; overflow-x: auto; }
    blockquote { border-left: 4px solid #ddd; margin: 0; padding-left: 1rem; color: #666; }
    table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background-color: #f2f2f2; }
  </style>
</head>
<body>
  <h1>${file.title || file.id}</h1>
  <hr>
  <div>${bodyHtml}</div>
</body>
</html>`;

    const blob = new Blob([fullHtml], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${file.id}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast("Nota exportada para HTML!", "success");
  } catch (e) {
    toast("Erro ao exportar HTML: " + e.message, "error");
  }
}

Object.assign(window, {
  exportCurrentNoteAsPdf,
  exportCurrentNoteAsHtml,
});
