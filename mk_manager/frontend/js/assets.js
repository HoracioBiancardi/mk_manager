// Responsabilidade: colar imagem (Ctrl+V) no editor como asset e redirecionar botão Importar

import { setMainView } from "./views.js";
import { apiUpload } from "./api.js";
import { insRaw } from "./editor.js";
import { toast } from "./utils.js";
import { loadProjectAssets } from "./assets-panel.js";

export function triggerAssetImport() {
  setMainView("assets");
}

export function initAssetDropZone() {
  const ta = document.getElementById("md-editor");
  const pane = document.getElementById("editor-pane");

  if (ta) {
    ta.addEventListener("paste", async (e) => {
      const items = [...(e.clipboardData?.items || [])].filter((it) => it.kind === "file");
      if (!items.length) return;

      e.preventDefault();

      for (const item of items) {
        const file = item.getAsFile();
        if (!file) continue;

        try {
          const fd = new FormData();
          let fileName = file.name || "imagem_colada.png";
          if (fileName === "image.png") {
            const now = new Date();
            const ts = now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
            fileName = `imagem_colada_${ts}.png`;
          }

          fd.append("file", file, fileName);
          const r = await apiUpload(fd);
          const data = await r.json();

          const isImage = /\.(png|jpe?g|gif|webp|svg|bmp|ico|avif)$/i.test(fileName);
          const snippet = isImage
            ? `![${data.name}](${data.url})`
            : `[📄 ${data.name}](${data.url})`;

          insRaw(snippet);
          toast(`Imagem colada e salva como asset!`, "success");
          loadProjectAssets();
        } catch (err) {
          toast("Erro ao colar imagem: " + err.message, "error");
        }
      }
    });
  }

  if (pane) {
    // Desativa comportamento padrão de navegação ao arrastar sobre o editor
    ["dragenter", "dragover", "dragleave", "drop"].forEach((evt) =>
      pane.addEventListener(evt, (e) => {
        e.preventDefault();
        e.stopPropagation();
      })
    );
  }
}

Object.assign(window, {
  triggerAssetImport,
});
