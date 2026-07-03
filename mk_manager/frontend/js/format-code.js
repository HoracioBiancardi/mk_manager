// Responsabilidade: formata blocos de código ```lang ... ``` no editor.
// Usa Prettier (carregado sob demanda via import dinâmico, só quando o
// usuário aciona a formatação — não pesa o carregamento inicial da página)
// para as linguagens suportadas; para as demais, faz uma limpeza básica e
// conservadora de espaçamento (sem reindentar, pra não quebrar linguagens
// sensíveis a espaço como Python/YAML mal detectado).

import { onEditorInput, replaceRange } from "./editor.js";
import { toast } from "./utils.js";

const PRETTIER_BASE = "https://cdn.jsdelivr.net/npm/prettier@3";

// Alias da linguagem do fence ```lang → parser do Prettier.
const LANG_TO_PARSER = {
  js: "babel", javascript: "babel", jsx: "babel", mjs: "babel", cjs: "babel",
  ts: "typescript", typescript: "typescript", tsx: "typescript",
  json: "json", json5: "json5", jsonc: "json",
  css: "css", scss: "scss", sass: "scss", less: "less",
  html: "html", htm: "html",
  yaml: "yaml", yml: "yaml",
};

let prettierPromise = null;

function loadPrettier() {
  if (!prettierPromise) {
    prettierPromise = Promise.all([
      import(`${PRETTIER_BASE}/standalone.mjs`),
      import(`${PRETTIER_BASE}/plugins/babel.mjs`),
      import(`${PRETTIER_BASE}/plugins/estree.mjs`),
      import(`${PRETTIER_BASE}/plugins/typescript.mjs`),
      import(`${PRETTIER_BASE}/plugins/postcss.mjs`),
      import(`${PRETTIER_BASE}/plugins/html.mjs`),
      import(`${PRETTIER_BASE}/plugins/yaml.mjs`),
    ]).then(([standalone, babel, estree, typescript, postcss, html, yaml]) => ({
      format: standalone.format,
      plugins: [babel.default, estree.default, typescript.default, postcss.default, html.default, yaml.default],
    })).catch((err) => {
      prettierPromise = null; // permite tentar de novo na próxima chamada
      throw err;
    });
  }
  return prettierPromise;
}

// Limpeza conservadora: só espaçamento (trailing whitespace + linhas em
// branco nas pontas), nunca reindenta — reindentar às cegas quebraria
// linguagens onde espaço é significativo (Python, YAML...).
function basicCleanup(code) {
  const lines = code.replace(/\r\n/g, "\n").split("\n").map((l) => l.replace(/[ \t]+$/, ""));
  while (lines.length && lines[0] === "") lines.shift();
  while (lines.length && lines[lines.length - 1] === "") lines.pop();
  return lines.join("\n");
}

async function formatCode(lang, rawBody) {
  const body = rawBody.endsWith("\n") ? rawBody.slice(0, -1) : rawBody;
  const parser = LANG_TO_PARSER[lang];
  if (parser) {
    try {
      const { format, plugins } = await loadPrettier();
      const out = await format(body, { parser, plugins });
      return { text: out.endsWith("\n") ? out : out + "\n", formatted: true };
    } catch {
      // Código com erro de sintaxe ou Prettier indisponível (offline etc.):
      // cai pra limpeza básica em vez de travar a ação do usuário.
      return { text: basicCleanup(body) + "\n", formatted: false };
    }
  }
  return { text: basicCleanup(body) + "\n", formatted: false };
}

// Limpa espaçamento do texto FORA de blocos de código: trailing whitespace
// (preservando quebra de linha "dura" do Markdown, que é exatamente 2
// espaços no fim da linha) e no máximo uma linha em branco entre blocos.
// Nunca mexe em listas, tabelas ou no texto em si.
// Trabalha direto na string (não linha-a-linha com split/join) pra não
// perder a quebra de linha que separa um fence do próximo bloco.
function hygieneOutsideCode(text) {
  const noTrailingWs = text.replace(/[ \t]+$/gm, (m) => (m === "  " ? m : ""));
  return noTrailingWs.replace(/\n{3,}/g, "\n\n");
}

const FENCE_RE = /(```[^\n`]*\n)([\s\S]*?)(```)/g;

function findFenceAt(text, pos) {
  const re = new RegExp(FENCE_RE.source, "g");
  let m;
  while ((m = re.exec(text))) {
    const start = m.index;
    const end = m.index + m[0].length;
    if (pos >= start && pos <= end) {
      return {
        start, end,
        bodyStart: start + m[1].length,
        lang: m[1].slice(3, -1).trim().toLowerCase(),
        body: m[2],
      };
    }
  }
  return null;
}

export async function formatCodeBlockAtCursor() {
  const ta = document.getElementById("md-editor");
  const fence = findFenceAt(ta.value, ta.selectionStart);
  if (!fence) {
    toast("Coloque o cursor dentro de um bloco de código (```) primeiro.", "info");
    return;
  }
  const { text, formatted } = await formatCode(fence.lang, fence.body);
  if (text === fence.body) {
    toast("Bloco já está formatado.", "info");
    return;
  }
  replaceRange(ta, fence.bodyStart, fence.bodyStart + fence.body.length, text);
  onEditorInput();
  toast(
    formatted ? "Bloco formatado." : "Espaçamento do bloco limpo (sem formatador completo pra essa linguagem).",
    "success",
  );
}

export async function formatDocument() {
  const ta = document.getElementById("md-editor");
  const original = ta.value;

  const re = new RegExp(FENCE_RE.source, "g");
  const fences = [];
  let m;
  while ((m = re.exec(original))) {
    fences.push({
      start: m.index,
      end: m.index + m[0].length,
      openFence: m[1],
      lang: m[1].slice(3, -1).trim().toLowerCase(),
      body: m[2],
      closeFence: m[3],
    });
  }

  const results = await Promise.all(fences.map((f) => formatCode(f.lang, f.body)));
  const anyUnformatted = results.some((r) => !r.formatted);

  let result = "";
  let cursor = 0;
  fences.forEach((f, i) => {
    result += hygieneOutsideCode(original.slice(cursor, f.start));
    result += f.openFence + results[i].text + f.closeFence;
    cursor = f.end;
  });
  result += hygieneOutsideCode(original.slice(cursor));
  result = result.replace(/\s+$/, "") + "\n";

  if (result === original) {
    toast("Documento já está formatado.", "info");
    return;
  }
  replaceRange(ta, 0, original.length, result);
  onEditorInput();
  toast(
    fences.length && anyUnformatted
      ? "Documento formatado (alguns blocos só tiveram o espaçamento limpo)."
      : "Documento formatado.",
    "success",
  );
}

// ── Expor ao DOM (necessário para os botões da toolbar) ────────────────────
Object.assign(window, { formatCodeBlockAtCursor, formatDocument });
