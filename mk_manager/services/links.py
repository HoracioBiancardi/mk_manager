"""Ligações entre notas: extrair, resolver e reescrever links.

Uma nota aponta para outra de três jeitos:
- `[[Título]]` ou `[[nome-do-arquivo]]` (wikilink, com `|apelido` e `#seção` opcionais);
- link Markdown para um `.md`: `[texto](../k3s/03-instalacao.md)`, relativo à pasta da nota;
- o campo `origin` do frontmatter (de onde a nota saiu: proposta → spec → task).

Tudo o que está em bloco de código ou entre crases é ignorado, como já era nas tags.
"""

from __future__ import annotations

import posixpath
import re
from collections.abc import Callable, Iterable
from dataclasses import dataclass
from urllib.parse import unquote

from mk_manager.domain.entities import FileRecord

_CODE_RE = re.compile(r"```.*?```|`[^`\n]*`", re.DOTALL)
_WIKILINK_RE = re.compile(r"\[\[([^\[\]|#]+)((?:#[^\[\]|]*)?)((?:\|[^\[\]]+)?)\]\]")
# [texto](destino "título opcional"), sem pegar imagens ![...](...).
_MD_LINK_RE = re.compile(r"(?<!!)\[([^\]\n]*)\]\(\s*(<[^>\n]+>|[^)\s]+)((?:\s+\"[^\"]*\")?)\s*\)")
_SCHEME_RE = re.compile(r"^[a-zA-Z][a-zA-Z0-9+.-]*:")


@dataclass(frozen=True)
class NoteLink:
    target: str
    kind: str  # "wiki" | "md"


def _code_spans(content: str) -> list[tuple[int, int]]:
    return [m.span() for m in _CODE_RE.finditer(content)]


def _inside(spans: list[tuple[int, int]], pos: int) -> bool:
    return any(start <= pos < end for start, end in spans)


def _md_target(raw: str) -> str | None:
    """Caminho de nota de um link Markdown, ou None se não for link para .md local."""
    href = raw[1:-1] if raw.startswith("<") else raw
    if _SCHEME_RE.match(href) or href.startswith(("/", "#")):
        return None
    path = unquote(href.split("#", 1)[0])
    return path if path.lower().endswith(".md") else None


def extract_note_links(content: str) -> list[NoteLink]:
    """Links para outras notas, na ordem em que aparecem no texto, sem repetir."""
    spans = _code_spans(content)
    found: list[tuple[int, NoteLink]] = []
    for m in _WIKILINK_RE.finditer(content):
        target = m.group(1).strip()
        if target and not _inside(spans, m.start()):
            found.append((m.start(), NoteLink(target, "wiki")))
    for m in _MD_LINK_RE.finditer(content):
        target = _md_target(m.group(2))
        if target and not _inside(spans, m.start()):
            found.append((m.start(), NoteLink(target, "md")))
    found.sort(key=lambda item: item[0])
    seen: set[NoteLink] = set()
    ordered: list[NoteLink] = []
    for _, link in found:
        if link not in seen:
            seen.add(link)
            ordered.append(link)
    return ordered


_STEP_LINE_RE = re.compile(r"^\s*(?:[-*+]|\d+[.)]|\|)\s?.*$", re.MULTILINE)


def extract_index_steps(content: str) -> list[NoteLink]:
    """Passos da trilha de um índice: os links das listas e tabelas, na ordem.

    Links soltos no texto (ex.: uma citação no parágrafo de abertura) não viram passo.
    Um índice sem lista nem tabela usa todos os links.
    """
    steps = extract_note_links("\n".join(m.group(0) for m in _STEP_LINE_RE.finditer(content)))
    return steps or extract_note_links(content)


def origin_target(origin: str) -> str:
    """`[[Proposta X]]` ou `Proposta X` → `Proposta X`."""
    value = (origin or "").strip()
    if value.startswith("[[") and value.endswith("]]"):
        value = value[2:-2]
    return value.split("|", 1)[0].split("#", 1)[0].strip()


def _strip_md(name: str) -> str:
    return name[:-3] if name.lower().endswith(".md") else name


class LinkResolver:
    """Acha a nota de um link: pelo título, pelo nome do arquivo ou pelo caminho."""

    def __init__(self, records: Iterable[FileRecord]) -> None:
        self.records = [r for r in records if r.type != "other"]
        self._by_title: dict[str, FileRecord] = {}
        self._by_name: dict[str, FileRecord] = {}
        self._by_path: dict[str, FileRecord] = {}
        for r in self.records:
            self._by_title.setdefault((r.title or r.id).strip().lower(), r)
            self._by_name.setdefault(r.id.lower(), r)
            self._by_path.setdefault(_strip_md(r.filename).lower(), r)

    def resolve(self, link: NoteLink, from_folder: str = "") -> FileRecord | None:
        if link.kind == "md":
            joined = posixpath.normpath(posixpath.join(from_folder, link.target))
            hit = self._by_path.get(_strip_md(joined).lower())
            if hit:
                return hit
            return self._by_name.get(_strip_md(posixpath.basename(link.target)).lower())
        key = link.target.strip().lower()
        return (
            self._by_title.get(key)
            or self._by_name.get(_strip_md(key))
            or self._by_path.get(_strip_md(key))
            or self._by_name.get(_strip_md(posixpath.basename(key)))
        )

    def resolve_origin(self, record: FileRecord) -> FileRecord | None:
        target = origin_target(record.origin)
        if not target:
            return None
        hit = self.resolve(NoteLink(target, "wiki"), record.folder)
        return hit if hit is not None and hit.id != record.id else None


def _sub_outside_code(content: str, pattern: re.Pattern[str], repl: Callable[[re.Match[str]], str]) -> str:
    spans = _code_spans(content)
    return pattern.sub(lambda m: m.group(0) if _inside(spans, m.start()) else repl(m), content)


def rewrite_links(content: str, folder: str, old: FileRecord, new: FileRecord) -> str:
    """Troca, em `content` (de uma nota em `folder`), os links que apontavam para `old`."""
    old_title = (old.title or old.id).strip().lower()
    old_names = {old.id.lower(), _strip_md(old.filename).lower(), old.filename.lower()}
    old_path = _strip_md(old.filename).lower()

    def wiki(m: re.Match[str]) -> str:
        target = m.group(1).strip().lower()
        if target == old_title:
            new_target = new.title or new.id
        elif target in old_names:
            new_target = new.id
        else:
            return m.group(0)
        return f"[[{new_target}{m.group(2)}{m.group(3)}]]"

    def md(m: re.Match[str]) -> str:
        target = _md_target(m.group(2))
        if not target:
            return m.group(0)
        joined = _strip_md(posixpath.normpath(posixpath.join(folder, target))).lower()
        if joined != old_path:
            return m.group(0)
        anchor = ""
        if "#" in m.group(2):
            anchor = "#" + m.group(2).strip("<>").split("#", 1)[1]
        rel = posixpath.relpath(new.filename, folder or ".")
        return f"[{m.group(1)}]({rel}{anchor}{m.group(3)})"

    content = _sub_outside_code(content, _WIKILINK_RE, wiki)
    return _sub_outside_code(content, _MD_LINK_RE, md)


def rewrite_origin(origin: str, old: FileRecord, new: FileRecord) -> str:
    target = origin_target(origin).lower()
    if not target:
        return origin
    if target == (old.title or old.id).strip().lower():
        return f"[[{new.title or new.id}]]"
    if target in {old.id.lower(), _strip_md(old.filename).lower(), old.filename.lower()}:
        return f"[[{new.id}]]"
    return origin
