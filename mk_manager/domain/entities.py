from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Literal

_TASK_ANY_RE: re.Pattern[str] = re.compile(r"^\s*- \[[ xX]\]", re.MULTILINE)
_TASK_DONE_RE: re.Pattern[str] = re.compile(r"^\s*- \[[xX]\]", re.MULTILINE)
_TASK_ITEM_RE: re.Pattern[str] = re.compile(r"^(\s*)- \[([ xX])\] (.+)", re.MULTILINE)

@dataclass
class FileRecord:
    id: str
    title: str
    type: Literal["note", "task", "other"]
    tags: list[str]
    content: str
    filename: str
    created: str
    modified: str
    folder: str = field(default="")
    status: str = field(default="")
    status_changed_at: str = field(default="")
    archived_from: str = field(default="")
    trashed_from: str = field(default="")
    due_date: str = field(default="")
    # Posição do card dentro da coluna do Kanban (menor = mais acima). None = nunca
    # reordenado; o board põe esses cards depois dos ordenados, por título.
    kanban_order: float | None = field(default=None)
    # Nota de onde esta saiu (proposta → spec → task), como no [[link]]: título ou nome do arquivo.
    origin: str = field(default="")
    # Papel da nota na cadeia ("proposta", "spec", "runbook"...). Vazio = usa o nome da pasta.
    role: str = field(default="")
    # Nota-índice: a ordem dos links dela vira a trilha "anterior · próximo" das notas citadas.
    is_index: bool = field(default=False)
    # Campos do frontmatter que o app não conhece: guardados para não sumirem ao salvar.
    extra: dict = field(default_factory=dict, repr=False)

    @property
    def word_count(self) -> int:
        return len(self.content.split()) if self.content.strip() else 0

    @property
    def task_total(self) -> int:
        return len(_TASK_ANY_RE.findall(self.content))

    @property
    def task_done(self) -> int:
        return len(_TASK_DONE_RE.findall(self.content))

    @property
    def task_items(self) -> list[dict]:
        return [
            {"text": m.group(3), "done": m.group(2).lower() == "x", "indent": len(m.group(1))}
            for m in _TASK_ITEM_RE.finditer(self.content)
        ]

@dataclass
class SearchResult:
    record: FileRecord
    snippet: str
    score: int = field(default=0, compare=False)
