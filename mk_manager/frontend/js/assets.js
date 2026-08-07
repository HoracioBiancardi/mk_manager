// Responsabilidade: import de arquivos como assets anexados à nota ativa

import { st } from "./state.js";
import { toast } from "./utils.js";
import { apiUpload } from "./api.js";
import { insRaw } from "./editor.js";
import { loadFiles } from "./files.js";

export function triggerAssetImport() {
  document.getElementById("asset-file-input").click();
}

export async function onAssetFiles(files) {
  if (!files.length) return;
  const activeFile = st.files.find((f) => f.id === st.activeId);
  const targetFolder = activeFile?.folder || "";

  for (const file of files) {
    try {
      const fd = new FormData();
      fd.append("file", file);
      if (targetFolder) {
        fd.append("folder", targetFolder);
      }
      const r = await apiUpload(fd);
      const data = await r.json();
      const isImage = /\.(png|jpe?g|gif|webp|svg|bmp|ico|avif)$/i.test(
        file.name,
      );
      const activeTitle = activeFile?.title || "";
      const label = activeTitle && activeTitle !== file.name ? `${activeTitle} - ${file.name}` : file.name;
      const link = isImage
        ? `![${label}](${data.url})`
        : `[📄 ${label}](${data.url})`;
      if (st.activeId && activeFile?.type !== "other") {
        insRaw(link);
      }
      toast(
        `"${data.filename}" importado ${targetFolder ? `para "${targetFolder}"` : "para a raiz"}.`,
        "success",
      );
    } catch (e) {
      toast("Erro ao importar: " + e.message, "error");
    }
  }
  document.getElementById("asset-file-input").value = "";
  await loadFiles();
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
