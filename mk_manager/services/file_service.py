"""Business logic for file management, search, and statistics.

The ``FileService`` is the single point of contact between the HTTP layer and
the storage layer.  It knows *what* to do (business rules) but is agnostic of
*how* files are stored (delegated to ``AbstractFileRepository``).

This satisfies:
- **S**: One reason to change — only if business rules change.
- **O**: Extended by supplying a different repository, not by modifying this class.
- **D**: Depends on ``AbstractFileRepository``, not on any concrete class.
"""

from __future__ import annotations

import re
import unicodedata
from datetime import datetime, timezone

from mk_manager.domain.entities import FileRecord, SearchResult
from mk_manager.models.schemas import (
    FileCreateRequest,
    FileUpdateRequest,
    StatsResponse,
)
from mk_manager.repositories.base import AbstractFileRepository


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _slugify(text: str) -> str:
    text = unicodedata.normalize("NFD", text)
    text = "".join(c for c in text if unicodedata.category(c) != "Mn")
    text = text.lower().strip()
    text = re.sub(r"[^a-z0-9]+", "-", text)
    return text.strip("-")


def _id_for_title(title: str) -> str:
    """Return a slug of *title*, or a timestamp-based fallback for empty titles."""
    slug = _slugify(title)
    if slug:
        return slug
    now = datetime.now(timezone.utc)
    return f"nota-{now.strftime('%Y%m%d-%H%M%S')}"


def _build_snippet(content: str, query: str, radius: int = 120) -> str:
    """Extract a relevant excerpt from *content* around *query*'s first occurrence.

    Args:
        content: Full markdown text to search within.
        query: The search term whose location anchors the excerpt.
        radius: Characters to include on each side of the match.

    Returns:
        An excerpt string.  Truncated edges are marked with ``"…"``.
        If *query* is empty or not found, the first 240 characters are returned.
    """
    stripped = content.strip()
    if not query:
        return (stripped[:240] + "…") if len(stripped) > 240 else stripped

    lower = content.lower()
    idx = lower.find(query.lower())
    if idx == -1:
        return (stripped[:240] + "…") if len(stripped) > 240 else stripped

    start = max(0, idx - radius)
    end = min(len(content), idx + len(query) + radius)
    chunk = content[start:end].strip()
    if start > 0:
        chunk = "…" + chunk
    if end < len(content):
        chunk += "…"
    return chunk


class FileService:
    """Orchestrates file CRUD, search, and statistics operations.

    Depends exclusively on ``AbstractFileRepository`` so the storage backend
    can be replaced without any changes here (Dependency Inversion Principle).

    Args:
        repository: A concrete implementation of ``AbstractFileRepository``.

    Example:
        >>> from pathlib import Path
        >>> from mk_manager.repositories.markdown import MarkdownFileRepository
        >>> repo = MarkdownFileRepository(Path("./notes"))
        >>> service = FileService(repo)
        >>> file = service.create_file(FileCreateRequest(title="Sprint planning"))
    """

    def __init__(self, repository: AbstractFileRepository) -> None:
        """Inject the storage repository dependency.

        Args:
            repository: Storage backend implementing ``AbstractFileRepository``.
        """
        self._repo = repository

    # ── Queries ────────────────────────────────────────────────────────────

    def list_files(self, type_filter: str | None = None) -> list[FileRecord]:
        """Return all files, optionally restricted to a single type.

        Args:
            type_filter: ``"note"`` or ``"task"`` to filter results,
                or ``None`` to return every file.

        Returns:
            List of ``FileRecord`` objects ordered newest-modified first.
        """
        records = self._repo.list_all()
        if type_filter:
            records = [r for r in records if r.type == type_filter]
        return records

    def get_file(self, file_id: str) -> FileRecord:
        """Retrieve a single file by its unique identifier.

        Args:
            file_id: The file's unique identifier.

        Returns:
            The corresponding ``FileRecord`` with full content.

        Raises:
            FileNotFoundError: If no file with *file_id* exists.
        """
        return self._repo.get_by_id(file_id)

    def search_files(
        self,
        query: str,
        type_filter: str | None = None,
        tag_filter: str | None = None,
    ) -> list[SearchResult]:
        """Full-text search across title, tags, and content.

        Scoring heuristic (higher = more relevant):

        - Title match: **+20 pts**
        - Tag match: **+10 pts**
        - Content match: **+1 pt**

        Results are sorted by score descending, then by ``modified`` descending.
        An empty *query* returns all files (with snippets of the first 240 chars).

        Args:
            query: Search term.  Case-insensitive.  Empty string returns all files.
            type_filter: Optional type restriction (``"note"`` or ``"task"``).

        Returns:
            Ordered list of ``SearchResult`` dataclasses.
        """
        records = self._repo.list_all()
        if type_filter:
            records = [r for r in records if r.type == type_filter]
        if tag_filter:
            records = [r for r in records if tag_filter in r.tags]

        q_lower = query.strip().lower()
        results: list[SearchResult] = []

        for record in records:
            if not q_lower:
                results.append(SearchResult(record=record, snippet=_build_snippet(record.content, ""), score=0))
                continue

            score = 0
            if q_lower in record.title.lower():
                score += 20
            if any(q_lower in tag.lower() for tag in record.tags):
                score += 10
            if q_lower in record.content.lower():
                score += 1

            if score > 0:
                results.append(
                    SearchResult(
                        record=record,
                        snippet=_build_snippet(record.content, query),
                        score=score,
                    )
                )

        results.sort(key=lambda r: (r.score, r.record.modified), reverse=True)
        return results

    def get_stats(self) -> StatsResponse:
        """Compute aggregated storage statistics.

        Returns:
            ``StatsResponse`` with file counts by type and total byte usage.
        """
        counts = self._repo.count_by_type()
        return StatsResponse(
            total=sum(counts.values()),
            notes=counts.get("note", 0),
            tasks=counts.get("task", 0),
            size_bytes=self._repo.total_size_bytes(),
        )

    # ── Commands ───────────────────────────────────────────────────────────

    def create_file(self, request: FileCreateRequest) -> FileRecord:
        """Create a new file from a validated creation request.

        Generates a unique ID and both timestamps automatically; callers
        need only supply the user-provided fields.

        Args:
            request: Validated ``FileCreateRequest`` data.

        Returns:
            The newly persisted ``FileRecord``.
        """
        now = _utc_now()
        return self._repo.create(
            file_id=_id_for_title(request.title),
            title=request.title,
            file_type=request.type,
            tags=request.tags,
            content=request.content,
            created=now,
            modified=now,
            folder=request.folder,
            status=request.status,
        )

    def update_file(self, file_id: str, request: FileUpdateRequest) -> FileRecord:
        """Apply a partial update to an existing file.

        Fields set to ``None`` in *request* are left unchanged in storage.

        Args:
            file_id: Identifier of the file to update.
            request: Partial update data.

        Returns:
            The updated ``FileRecord``.

        Raises:
            FileNotFoundError: If no file with *file_id* exists.
        """
        return self._repo.update(
            file_id,
            title=request.title,
            tags=request.tags,
            content=request.content,
            modified=_utc_now(),
            folder=request.folder,
            status=request.status,
        )

    def delete_file(self, file_id: str) -> None:
        """Permanently delete a file.

        Args:
            file_id: Identifier of the file to delete.

        Raises:
            FileNotFoundError: If no file with *file_id* exists.
        """
        self._repo.delete(file_id)
