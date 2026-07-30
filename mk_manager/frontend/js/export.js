// Responsabilidade: exportação de Notas (PDF / MD / Standalone HTML)

import { st } from "./state.js";
import { esc, toast } from "./utils.js";
import { apiFetch } from "./api.js";

export async function exportCurrentNoteAsPdf() {
  if (!st.activeId) {
    toast("Nenhuma nota aberta para exportar", "warning");
    return;
  }

  const file = st.files.find((f) => f.id === st.activeId);
  const title = file?.title || file?.id || "Documento";

  const content = document.getElementById("md-editor")?.value || file?.content || "";
  let bodyHtml = "";
  try {
    bodyHtml = typeof marked !== "undefined" ? marked.parse(content) : `<pre>${esc(content)}</pre>`;
  } catch (e) {
    const previewEl = document.getElementById("preview-pane");
    bodyHtml = previewEl ? previewEl.innerHTML : `<pre>${esc(content)}</pre>`;
  }

  const printWin = window.open("", "_blank", "width=900,height=900");
  if (!printWin) {
    toast("Bloqueador de pop-ups impediu a exportação. Permita pop-ups no navegador para gerar o PDF.", "warning");
    return;
  }

  const fullHtml = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>${esc(title)}</title>
  <style>
    @page { margin: 20mm; size: auto; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      line-height: 1.6;
      color: #111827;
      background: #ffffff;
      margin: 0;
      padding: 0;
    }
    h1.pdf-title {
      font-size: 2rem;
      margin-bottom: 0.5rem;
      color: #111827;
    }
    .pdf-meta {
      font-size: 0.85rem;
      color: #6b7280;
      border-bottom: 2px solid #e5e7eb;
      padding-bottom: 0.75rem;
      margin-bottom: 1.5rem;
    }
    h1, h2, h3, h4 { color: #111827; margin-top: 1.5rem; margin-bottom: 0.75rem; }
    p { margin-bottom: 1rem; }
    code { background: #f3f4f6; padding: 2px 6px; border-radius: 4px; font-family: monospace; font-size: 0.9em; }
    pre { background: #f8fafc; border: 1px solid #e2e8f0; padding: 1rem; border-radius: 6px; overflow-x: auto; }
    pre code { background: none; padding: 0; }
    blockquote { border-left: 4px solid #3b82f6; margin: 0 0 1rem 0; padding-left: 1rem; color: #4b5563; }
    table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
    th, td { border: 1px solid #cbd5e1; padding: 8px 12px; text-align: left; }
    th { background-color: #f1f5f9; font-weight: 600; }
    input[type="checkbox"] { margin-right: 6px; }
  </style>
</head>
<body>
  <h1 class="pdf-title">${esc(title)}</h1>
  <div class="pdf-meta">
    ${file?.due_date ? `<strong>Prazo:</strong> ${esc(file.due_date)} &nbsp;·&nbsp; ` : ''}
    ${file?.folder ? `<strong>Pasta:</strong> ${esc(file.folder)} &nbsp;·&nbsp; ` : ''}
    <strong>Exportado em:</strong> ${new Date().toLocaleDateString("pt-BR")}
  </div>
  <div class="pdf-content">${bodyHtml}</div>
  <script>
    window.onload = function() {
      window.focus();
      window.print();
    };
  </script>
</body>
</html>`;

  printWin.document.open();
  printWin.document.write(fullHtml);
  printWin.document.close();
}

export async function exportCurrentNoteAsMd() {
  if (!st.activeId) {
    toast("Nenhuma nota aberta para exportar", "warning");
    return;
  }
  const file = st.files.find((f) => f.id === st.activeId);
  const content = document.getElementById("md-editor")?.value || file?.content || "";
  const filename = `${file?.id || "nota"}.md`;
  const blob = new Blob([content], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast("Arquivo .md baixado!", "success");
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
  printPDF: exportCurrentNoteAsPdf,
  exportCurrent: exportCurrentNoteAsMd,
  exportCurrentNoteAsPdf,
  exportCurrentNoteAsHtml,
  exportCurrentNoteAsMd,
});
