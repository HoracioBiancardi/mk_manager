"""Core domain entities for the MK Manager application.

These classes represent the business concepts and are deliberately
free of any framework or infrastructure dependencies.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Literal

_TASK_ANY_RE: re.Pattern[str] = re.compile(r"^- \[[ x]\] ", re.MULTILINE)
_TASK_DONE_RE: re.Pattern[str] = re.compile(r"^- \[x\] ", re.MULTILINE)
_TASK_ITEM_RE: re.Pattern[str] = re.compile(r"^(\s*)- \[([ x])\] (.+)", re.MULTILINE)


@dataclass
class FileRecord:
    """A single markdown file managed by the application.

    Represents the parsed state of a ``.md`` file on disk, including
    its YAML frontmatter fields and body content.

    Attributes:
        id: Unique identifier, derived from the filename stem.
        title: Human-readable title sourced from frontmatter.
        type: Semantic file type — either ``"note"`` or ``"task"``.
        tags: Ordered list of tag strings from frontmatter.
        content: Raw markdown body (everything after the frontmatter block).
        filename: Actual filename on disk, e.g. ``"abc123def456.md"``.
        created: ISO 8601 UTC timestamp of initial creation.
        modified: ISO 8601 UTC timestamp of last modification.
    """

    id: str
    title: str
    type: Literal["note", "task"]
    tags: list[str]
    content: str
    filename: str
    created: str
    modified: str
    folder: str = field(default="")
    status: str = field(default="")
    date_planning: str = field(default="")
    date_execution: str = field(default="")
    date_conclusion: str = field(default="")

    @property
    def word_count(self) -> int:
        """Count words in the markdown content.

        Returns:
            Number of whitespace-separated tokens, or ``0`` for empty content.
        """
        return len(self.content.split()) if self.content.strip() else 0

    @property
    def task_total(self) -> int:
        """Count all task-list items (checked and unchecked).

        Returns:
            Number of lines matching the ``- [ ]`` or ``- [x]`` pattern.
        """
        return len(_TASK_ANY_RE.findall(self.content))

    @property
    def task_done(self) -> int:
        """Count completed task-list items.

        Returns:
            Number of lines matching the ``- [x]`` pattern.
        """
        return len(_TASK_DONE_RE.findall(self.content))

    @property
    def task_items(self) -> list[dict]:
        """Parse all checklist items from content.

        Returns:
            List of dicts with ``text``, ``done``, and ``indent`` keys.
        """
        return [
            {"text": m.group(3), "done": m.group(2) == "x", "indent": len(m.group(1))}
            for m in _TASK_ITEM_RE.finditer(self.content)
        ]


@dataclass
class SearchResult:
    """A file found by a search query, enriched with a relevance snippet.

    Attributes:
        record: The matched ``FileRecord``.
        snippet: Short excerpt from the content around the match location.
        score: Internal relevance score used for sorting results.
    """

    record: FileRecord
    snippet: str
    score: int = field(default=0, compare=False)
