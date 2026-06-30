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

// ── Expor ao DOM (necessário para event handlers inline) ──────────────────────
Object.assign(window, {
  triggerAssetImport,
  onAssetFiles,
});
