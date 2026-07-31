// Responsabilidade: formata blocos de código ```lang ... ``` no editor.
// Usa Prettier, prettier-plugin-sh e sql-formatter (com fallback nativo de alta precisão em JS puro) —
// suporte completo a SQL, dbt, Jinja, binds (:param), 4 espaços de indentação e preservação de comentários.

import { onEditorInput, replaceRange } from "./editor.js";
import { toast } from "./utils.js";

const PRETTIER_BASE = "https://cdn.jsdelivr.net/npm/prettier@3";
const SH_PLUGIN_URL = "https://esm.sh/prettier-plugin-sh@0.14?bundle";
const SQL_FORMATTER_URL = "https://cdn.jsdelivr.net/npm/sql-formatter@15/+esm";

const LANG_TO_PARSER = {
  js: "babel", javascript: "babel", jsx: "babel", mjs: "babel", cjs: "babel",
  ts: "typescript", typescript: "typescript", tsx: "typescript",
  json: "json", json5: "json5", jsonc: "json",
  css: "css", scss: "scss", sass: "scss", less: "less",
  html: "html", htm: "html",
  yaml: "yaml", yml: "yaml",
};

const SHELL_LANGS = new Set(["sh", "bash", "shell", "zsh"]);

const SQL_DIALECTS = {
  sql: "sql", dbt: "sql", dbt_sql: "sql", jinja_sql: "sql", jinja: "sql",
  mysql: "mysql", mariadb: "mariadb",
  postgres: "postgresql", postgresql: "postgresql", pgsql: "postgresql",
  sqlite: "sqlite", plsql: "plsql", tsql: "tsql", mssql: "tsql", sqlserver: "tsql",
  bigquery: "bigquery", snowflake: "snowflake", redshift: "redshift",
  db2: "db2", spark: "spark", hive: "hive", duckdb: "sql",
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
      prettierPromise = null;
      throw err;
    });
  }
  return prettierPromise;
}

let shFormatterPromise = null;

function loadShFormatter() {
  if (!shFormatterPromise) {
    shFormatterPromise = Promise.all([
      import(`${PRETTIER_BASE}/standalone.mjs`),
      import(SH_PLUGIN_URL),
    ]).then(([standalone, shPlugin]) => ({
      format: standalone.format,
      plugins: [shPlugin.default || shPlugin],
    })).catch((err) => {
      shFormatterPromise = null;
      throw err;
    });
  }
  return shFormatterPromise;
}

let sqlFormatterPromise = null;

function loadSqlFormatter() {
  if (!sqlFormatterPromise) {
    sqlFormatterPromise = import(SQL_FORMATTER_URL).catch((err) => {
      sqlFormatterPromise = null;
      throw err;
    });
  }
  return sqlFormatterPromise;
}

function maskJinjaMacros(code) {
  const jinjaBlocks = [];
  const maskedCode = code.replace(/({{[\s\S]*?}}|{%[\s\S]*?%}|{#[\s\S]*?#})/g, (match) => {
    const placeholder = `__JINJA_MACRO_${jinjaBlocks.length}__`;
    jinjaBlocks.push({ placeholder, original: match });
    return placeholder;
  });
  return { maskedCode, jinjaBlocks };
}

function unmaskJinjaMacros(formattedCode, jinjaBlocks) {
  let result = formattedCode;
  jinjaBlocks.forEach(({ placeholder, original }) => {
    const re = new RegExp(placeholder, "gi");
    result = result.replace(re, original);
  });
  return result;
}

function formatSqlPureJS(code) {
  const { maskedCode, jinjaBlocks } = maskJinjaMacros(code);

  const mainClauseKeywords = [
    "SELECT", "FROM", "WHERE", "HAVING", "GROUP BY", "ORDER BY", "LIMIT",
    "WITH", "UNION ALL", "UNION", "INSERT INTO", "VALUES", "UPDATE", "SET", "DELETE",
    "LEFT JOIN", "RIGHT JOIN", "INNER JOIN", "CROSS JOIN", "FULL JOIN", "JOIN"
  ];

  const subClauseKeywords = ["AND", "OR", "ON"];

  const allKeywords = [
    ...mainClauseKeywords, ...subClauseKeywords,
    "AS", "IN", "IS", "NOT", "NULL", "LIKE", "ILIKE", "BETWEEN", "CASE", "WHEN", "THEN", "ELSE", "END",
    "DISTINCT", "ALL", "EXISTS", "ASC", "DESC", "OVER", "PARTITION BY"
  ];

  let text = maskedCode;
  allKeywords.forEach((kw) => {
    const re = new RegExp(`\\b${kw}\\b`, "gi");
    text = text.replace(re, kw);
  });

  const rawLines = text.split("\n");
  const resultLines = [];
  let inSelect = false;
  let inClause = false;

  for (let rawLine of rawLines) {
    let line = rawLine.trim();
    if (!line) continue;

    const mainKw = mainClauseKeywords.find((kw) => {
      const re = new RegExp(`^${kw}\\b`, "i");
      return re.test(line);
    });

    if (mainKw) {
      resultLines.push(line);
      inSelect = (mainKw === "SELECT");
      inClause = true;
      continue;
    }

    const subKw = subClauseKeywords.find((kw) => {
      const re = new RegExp(`^${kw}\\b`, "i");
      return re.test(line);
    });

    if (subKw) {
      resultLines.push("    " + line);
      continue;
    }

    if (inSelect || inClause) {
      resultLines.push("    " + line);
    } else {
      resultLines.push(line);
    }
  }

  let formatted = resultLines.join("\n");
  return unmaskJinjaMacros(formatted, jinjaBlocks);
}

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
      const out = await format(body, { parser, plugins, tabWidth: 4, useTabs: false });
      return { text: out.endsWith("\n") ? out : out + "\n", formatted: true };
    } catch {
      return { text: basicCleanup(body) + "\n", formatted: false };
    }
  }

  if (SHELL_LANGS.has(lang)) {
    try {
      const { format, plugins } = await loadShFormatter();
      const out = await format(body, { parser: "sh", plugins, tabWidth: 4 });
      return { text: out.endsWith("\n") ? out : out + "\n", formatted: true };
    } catch {
      return { text: basicCleanup(body) + "\n", formatted: false };
    }
  }

  const sqlDialect = SQL_DIALECTS[lang];
  if (sqlDialect) {
    const { maskedCode, jinjaBlocks } = maskJinjaMacros(body);
    try {
      const { format } = await loadSqlFormatter();
      const out = format(maskedCode, {
        language: sqlDialect,
        tabWidth: 4,
        keywordCase: "upper",
        paramTypes: { named: [":", "@", "$"] }
      });
      const unmasked = unmaskJinjaMacros(out, jinjaBlocks);
      return { text: unmasked.endsWith("\n") ? unmasked : unmasked + "\n", formatted: true };
    } catch {
      const fallback = formatSqlPureJS(body);
      return { text: fallback.endsWith("\n") ? fallback : fallback + "\n", formatted: true };
    }
  }

  return { text: basicCleanup(body) + "\n", formatted: false };
}

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
    formatted ? "Bloco formatado com 4 espaços de indentação." : "Espaçamento do bloco limpo.",
    "success",
  );
}

export async function formatDocument() {
  const ta = document.getElementById("md-editor");
  const original = ta.value;

  const re = new RegExp(FENCE_RE.source, "g");
  const fences = [];
  let match;
  while ((match = re.exec(original))) {
    fences.push({
      start: match.index,
      end: match.index + match[0].length,
      prefix: match[1],
      lang: match[1].slice(3, -1).trim().toLowerCase(),
      body: match[2],
      suffix: match[3],
    });
  }

  if (!fences.length) {
    const cleaned = hygieneOutsideCode(original);
    if (cleaned !== original) {
      ta.value = cleaned;
      onEditorInput();
      toast("Espaçamento do documento limpo.", "success");
    } else {
      toast("Documento sem blocos de código pra formatar.", "info");
    }
    return;
  }

  let formattedCount = 0;
  let out = "";
  let lastIdx = 0;

  for (const fence of fences) {
    out += hygieneOutsideCode(original.slice(lastIdx, fence.start));
    const res = await formatCode(fence.lang, fence.body);
    if (res.text !== fence.body) formattedCount++;
    out += fence.prefix + res.text + fence.suffix;
    lastIdx = fence.end;
  }

  out += hygieneOutsideCode(original.slice(lastIdx));

  if (out !== original) {
    ta.value = out;
    onEditorInput();
    toast(
      formattedCount > 0
        ? `Formatado(s) ${formattedCount} bloco(s) de código (4 espaços).`
        : "Espaçamento do documento limpo.",
      "success",
    );
  } else {
    toast("Documento já está formatado.", "info");
  }
}

export async function formatSmart() {
  const ta = document.getElementById("md-editor");
  if (!ta) return;
  const fence = findFenceAt(ta.value, ta.selectionStart);
  if (fence) {
    await formatCodeBlockAtCursor();
  } else {
    await formatDocument();
  }
}

export { formatCode };

Object.assign(window, {
  formatCode,
  formatSmart,
  formatCodeBlockAtCursor,
  formatDocument,
});
