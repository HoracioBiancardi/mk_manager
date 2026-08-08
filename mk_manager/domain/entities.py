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
