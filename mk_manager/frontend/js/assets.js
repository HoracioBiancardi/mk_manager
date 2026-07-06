// Responsabilidade: import de arquivos como assets anexados à nota ativa

import { st } from "./state.js";
import { toast } from "./utils.js";
import { apiUpload } from "./api.js";
import { insRaw } from "./editor.js";

export function triggerAssetImport() {
  if (!st.activeId) {
    toast("Abra uma nota antes de importar um arquivo.", "info");
    return;
  }
  document.getElementById("asset-file-input").click();
}

export async function onAssetFiles(files) {
  if (!files.length) return;
  if (!st.activeId) {
    toast("Abra uma nota antes de importar um arquivo.", "info");
    return;
  }
  for (const file of files) {
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await apiUpload(fd);
      const data = await r.json();
      const isImage = /\.(png|jpe?g|gif|webp|svg|bmp|ico|avif)$/i.test(
        file.name,
      );
      const link = isImage
        ? `![${file.name}](${data.url})`
        : `[${file.name}](${data.url})`;
      insRaw(link);
      toast(`"${data.filename}" importado.`, "success");
    } catch (e) {
      toast("Erro ao importar: " + e.message, "error");
    }
  }
  document.getElementById("asset-file-input").value = "";
}

// ── Colar (Ctrl+V) e arrastar arquivos direto no editor ────────────────────────

export function initAssetDropZone() {
  const ta = document.getElementById("md-editor");
  const pane = document.getElementById("editor-pane");
  if (!ta || !pane) return;

  ta.addEventListener("paste", (e) => {
    const files = [...(e.clipboardData?.items || [])]
      .filter((it) => it.kind === "file")
      .map((it) => it.getAsFile())
      .filter(Boolean);
    if (!files.length) return;
    e.preventDefault();
    onAssetFiles(files);
  });

  ["dragenter", "dragover"].forEach((evt) =>
    pane.addEventListener(evt, (e) => {
      if (![...(e.dataTransfer?.types || [])].includes("Files")) return;
      e.preventDefault();
      pane.classList.add("drag-over");
    }),
  );
  ["dragleave", "drop"].forEach((evt) =>
    pane.addEventListener(evt, () => pane.classList.remove("drag-over")),
  );
  pane.addEventListener("drop", (e) => {
    const files = [...(e.dataTransfer?.files || [])];
    if (!files.length) return;
    e.preventDefault();
    onAssetFiles(files);
  });
}

// ── Expor ao DOM (necessário para event handlers inline) ──────────────────────
Object.assign(window, {
  triggerAssetImport,
  onAssetFiles,
});
