// Responsabilidade: exportação de arquivos (.md e PDF)

import { st } from "./state.js";
import { toast, dlBlob } from "./utils.js";
import { apiFetch } from "./api.js";
import { saveFile } from "./files.js";

// ── Export .md ─────────────────────────────────────────────────────────────────
export async function exportFile(id, title) {
  try {
    const r = await apiFetch(`/files/${id}`);
    const file = await r.json();
    const fm = [
      "---",
      `id: ${file.id}`,
      `title: ${file.title || "Sem título"}`,
      `type: ${file.type}`,
      `tags: [${(file.tags || []).join(", ")}]`,
      `created: '${file.created}'`,
      `modified: '${file.modified}'`,
      "---",
      "",
      file.content,
    ].join("\n");
    const slug = (file.title || "sem-titulo")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    dlBlob(slug + ".md", fm, "text/markdown;charset=utf-8");
    toast("Arquivo exportado!", "success");
  } catch (e) {
    toast("Erro ao exportar: " + e.message, "error");
  }
}

export async function exportCurrent() {
  if (!st.activeId) return;
  await saveFile();
  await exportFile(st.activeId);
}

export async function exportAll() {
  if (!st.files.length) {
    toast("Nenhum arquivo para exportar.", "info");
    return;
  }
  for (const f of st.files) await exportFile(f.id, f.title);
  toast(`${st.files.length} arquivo(s) exportado(s).`, "success");
}

// ── Export PDF ────────────────────────────────────────────────────────────────
export function printPDF() {
  if (!st.activeId) {
    toast("Abra uma nota para exportar.", "info");
    return;
  }

  const rawTitle = document.getElementById("title-input").value || "Nota";
  const safeTitle = rawTitle
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Parseia o markdown direto, sem tocar o preview pane
  const mdContent = document.getElementById("md-editor").value;
  const bodyHTML = marked.parse(mdContent);
  const hasMermaid = bodyHTML.includes('class="mermaid"');

  const hlURL =
    [...document.querySelectorAll('link[rel="stylesheet"]')].find((l) =>
      l.href.includes("highlight"),
    )?.href ||
    "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github.min.css";

  const win = window.open("", "_blank");
  if (!win) {
    toast("Permita pop-ups para exportar PDF.", "info");
    return;
  }

  win.document.write(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>${safeTitle}</title>
<link rel="stylesheet" href="${hlURL}">
<style>
  *, *::before, *::after { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
    font-size: 14px; line-height: 1.8; color: #222;
    max-width: 820px; margin: 0 auto; padding: 2rem; background: white;
  }
  h1 { font-size:1.9rem; border-bottom:2px solid #ccc; padding-bottom:.4rem; margin-bottom:1.5rem; break-after:avoid; page-break-after:avoid; }
  h2 { font-size:1.35rem; border-bottom:1px solid #eee; margin-top:2.5rem; break-after:avoid; page-break-after:avoid; }
  h3 { font-size:1.1rem; margin-top:1.8rem; break-after:avoid; page-break-after:avoid; }
  h4,h5,h6 { margin-top:1.2rem; break-after:avoid; page-break-after:avoid; }
  p { orphans:3; widows:3; margin:.6rem 0 .9rem; }
  pre {
    background:#f6f8fa; border:1px solid #ddd; border-radius:6px;
    padding:1rem; font-size:.84em;
    white-space:pre-wrap; word-break:break-word;
    break-inside:avoid; page-break-inside:avoid; margin:1rem 0; overflow:visible;
  }
  pre code { background:transparent!important; border:none!important; padding:0!important; font-family:'SFMono-Regular',Consolas,monospace; }
  code { font-family:'SFMono-Regular',Consolas,monospace; font-size:.88em; }
  p code, li code { background:#f0f0f0; padding:.1em .35em; border-radius:3px; border:1px solid #ddd; }
  table { border-collapse:collapse; width:100%; margin:1.2rem 0; break-inside:avoid; page-break-inside:avoid; font-size:.92em; }
  th,td { border:1px solid #ccc; padding:.5rem .75rem; text-align:left; vertical-align:top; }
  th { background:#f0f0f0; font-weight:600; }
  tr:nth-child(even) td { background:#fafafa; }
  blockquote { border-left:4px solid #aaa; margin:1rem 0; padding:.5rem 1rem; background:#f9f9f9; color:#555; break-inside:avoid; page-break-inside:avoid; }
  img { max-width:100%; height:auto; }
  .mermaid-wrap { text-align:center; margin:1.5rem 0; break-inside:avoid; page-break-inside:avoid; display:block; }
  .mermaid-wrap svg { max-width:100%; background:white; }
  a { color:#1a56db; }
  hr { border:none; border-top:1px solid #ddd; margin:1.5rem 0; }
  ul,ol { padding-left:1.5rem; margin:.5rem 0; }
  li { margin:.25rem 0; }
  input[type="checkbox"] { margin-right:.4rem; }
  .task-list-item.done { opacity:.65; text-decoration:line-through; }
  .hljs { background:#f6f8fa!important; color:#24292e!important; }
  @page { size:A4 portrait; margin:2cm; }
  @media print { body { padding:0; } }
</style>
</head>
<body>
<h1>${safeTitle}</h1>
${bodyHTML}
${hasMermaid ? '<script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"><\\/script>' : ""}
<script>
window.addEventListener('load', function() {
  if (${hasMermaid} && typeof mermaid !== 'undefined') {
    mermaid.initialize({ startOnLoad: false, theme: 'default' });
    mermaid.run().then(function() { setTimeout(window.print, 400); })
               .catch(function()  { setTimeout(window.print, 400); });
  } else {
    setTimeout(window.print, 300);
  }
});
<\/script>
</body>
</html>`);
  win.document.close();
}

// ── Expor ao DOM (necessário para event handlers inline) ──────────────────────
Object.assign(window, {
  exportFile,
  exportCurrent,
  exportAll,
  printPDF,
});
