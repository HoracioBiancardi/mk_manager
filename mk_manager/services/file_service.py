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
from datetime import datetime, timedelta, timezone

from mk_manager.domain.entities import FileRecord, SearchResult
from mk_manager.models.schemas import (
    FileCreateRequest,
    FileUpdateRequest,
    GraphEdge,
    GraphNode,
    GraphResponse,
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


_FENCE_RE = re.compile(r"```.*?```", re.DOTALL)
_INLINE_CODE_RE = re.compile(r"`[^`\n]*`")
_URL_RE = re.compile(r"https?://\S+")
# Requires a letter immediately after "#" (no space), so markdown headings
# ("# Title") never match — headings always have a space after the hashes,
# tags never do. Also excludes "#" preceded by a word char, another "#", or
# "/" so it doesn't fire mid-word or inside an already-matched path segment.
_TAG_RE = re.compile(r"(?<![\w#/])#([A-Za-z][\w/-]*)")
# [[Target]], [[Target|Alias]], [[Target#heading]] (heading fragment ignored —
# there's no in-note heading anchor navigation, only note-to-note links).
_WIKILINK_RE = re.compile(r"\[\[([^\[\]|#]+)(?:#[^\[\]|]*)?(?:\|([^\[\]]+))?\]\]")


def _strip_code_and_urls(content: str) -> str:
    """Blank out fenced code, inline code, and URLs before scanning prose.

    Shared by tag and wikilink extraction so neither picks up matches from
    inside a code sample or a URL fragment (e.g. ``http://x.com/#section``).
    """
    return _URL_RE.sub(" ", _INLINE_CODE_RE.sub(" ", _FENCE_RE.sub(" ", content)))


def extract_inline_tags(content: str) -> list[str]:
    """Extract ``#tag`` references from markdown body content.

    Mirrors Obsidian's inline-tag convention: a tag is a "#" immediately
    followed by a letter, found anywhere in the prose. Matches inside fenced
    code blocks, inline code spans, and URLs are ignored so code comments,
    hex-like tokens, and URL fragments don't get treated as tags.

    Args:
        content: Raw markdown body (frontmatter already stripped).

    Returns:
        Unique tag strings (without the "#"), in first-seen order.
    """
    stripped = _strip_code_and_urls(content)
    seen: list[str] = []
    for m in _TAG_RE.finditer(stripped):
        tag = m.group(1)
        if tag not in seen:
            seen.append(tag)
    return seen


def extract_wikilink_targets(content: str) -> list[str]:
    """Extract ``[[Note Title]]`` link targets from markdown body content.

    Supports ``[[Target]]``, ``[[Target|Alias]]`` (alias ignored — only the
    target matters for graph/resolution purposes), and ``[[Target#heading]]``
    (heading fragment dropped, links resolve at note granularity).

    Args:
        content: Raw markdown body (frontmatter already stripped).

    Returns:
        Unique, trimmed target strings, in first-seen order.
    """
    stripped = _strip_code_and_urls(content)
    seen: list[str] = []
    for m in _WIKILINK_RE.finditer(stripped):
        target = m.group(1).strip()
        if target and target not in seen:
            seen.append(target)
    return seen


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

    def list_files(
        self, type_filter: str | None = None, include_archived: bool = False
    ) -> list[FileRecord]:
        """Return all files, optionally restricted to a single type.

        Args:
            type_filter: ``"note"`` or ``"task"`` to filter results,
                or ``None`` to return every file.
            include_archived: Whether to include archived files alongside
                active ones. Defaults to ``False`` — archived files are
                meant to stay out of the way until explicitly restored.

        Returns:
            List of ``FileRecord`` objects ordered newest-modified first.
        """
        records = self._repo.list_all(include_archived=include_archived)
        if type_filter:
            records = [r for r in records if r.type == type_filter]
        return records

    def list_archived_files(self) -> list[FileRecord]:
        """Return only archived files, newest-modified first.

        Returns:
            List of archived ``FileRecord`` objects.
        """
        return self._repo.list_archived()

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
        tag_filter: list[str] | None = None,
        include_archived: bool = False,
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
            include_archived: Whether archived files are eligible to match.
                Defaults to ``False``.

        Returns:
            Ordered list of ``SearchResult`` dataclasses.
        """
        records = self._repo.list_all(include_archived=include_archived)
        if type_filter:
            records = [r for r in records if r.type == type_filter]
        if tag_filter:
            # Hierarchical match: a filter on "area" also covers "area/sub"
            # (mirrors the tag tree in the sidebar, where "area" is the parent).
            records = [
                r for r in records
                if all(
                    any(t == f or t.startswith(f + "/") for t in r.tags)
                    for f in tag_filter
                )
            ]

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

    def build_graph(self) -> GraphResponse:
        """Build the notes graph from ``[[wikilink]]`` references in every file.

        Link targets are resolved by title (case-insensitive, matching how
        the user actually writes ``[[Note Title]]``). A target that doesn't
        match any file becomes a "phantom" node — mirrors Obsidian showing
        unresolved links as dangling nodes rather than silently dropping them.
        Bidirectional links between the same two notes collapse into a
        single edge (the graph is undirected).

        Returns:
            ``GraphResponse`` with every file as a node plus any phantom
            nodes, and one edge per unique resolved link.
        """
        records = self._repo.list_all()
        id_by_title: dict[str, str] = {}
        for r in records:
            id_by_title.setdefault((r.title or r.id).strip().lower(), r.id)

        nodes = [
            GraphNode(id=r.id, title=r.title or r.id, type=r.type, tags=r.tags, folder=r.folder)
            for r in records
        ]
        phantom_ids: dict[str, str] = {}
        edges: list[GraphEdge] = []
        seen_edges: set[tuple[str, str]] = set()

        for r in records:
            for target_title in extract_wikilink_targets(r.content):
                key = target_title.lower()
                target_id = id_by_title.get(key)
                if target_id is None:
                    target_id = phantom_ids.get(key)
                    if target_id is None:
                        target_id = f"phantom:{key}"
                        phantom_ids[key] = target_id
                        nodes.append(
                            GraphNode(id=target_id, title=target_title, type="phantom", tags=[], folder="")
                        )
                if target_id == r.id:
                    continue  # self-link
                edge_key = tuple(sorted((r.id, target_id)))
                if edge_key in seen_edges:
                    continue
                seen_edges.add(edge_key)
                edges.append(GraphEdge(source=r.id, target=target_id))

        return GraphResponse(nodes=nodes, edges=edges)

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
        status_changed_at = request.status_changed_at
        if request.status and not status_changed_at:
            status_changed_at = datetime.now().strftime("%Y-%m-%dT%H:%M")

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
            status_changed_at=status_changed_at,
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
        existing = self._repo.get_by_id(file_id)

        status_changed_at = (
            request.status_changed_at if request.status_changed_at is not None else existing.status_changed_at
        )
        if request.status is not None and request.status != existing.status:
            status_changed_at = datetime.now().strftime("%Y-%m-%dT%H:%M")

        return self._repo.update(
            file_id,
            title=request.title,
            tags=request.tags,
            content=request.content,
            modified=_utc_now(),
            folder=request.folder,
            status=request.status,
            status_changed_at=status_changed_at,
        )

    def rename_tag(self, old_tag: str, new_tag: str) -> int:
        """Rename *old_tag* to *new_tag* across every file that has it.

        If a file already has *new_tag*, the old entry is simply dropped
        (merge semantics) instead of creating a duplicate.

        Args:
            old_tag: Existing tag value to replace.
            new_tag: Replacement tag value.

        Returns:
            Number of files whose tag list was changed.
        """
        updated_count = 0
        for record in self._repo.list_all():
            if old_tag not in record.tags:
                continue
            new_tags = [t for t in record.tags if t != old_tag]
            if new_tag not in new_tags:
                new_tags.insert(record.tags.index(old_tag), new_tag)
            self._repo.update(
                record.id,
                title=None,
                tags=new_tags,
                content=None,
                modified=_utc_now(),
                folder=None,
                status=None,
            )
            updated_count += 1
        return updated_count

    def rename_folder(self, old_folder: str, new_folder: str) -> int:
        """Move every file under *old_folder* (including subfolders) to *new_folder*.

        Preserves relative nesting: a file in ``old_folder/sub`` ends up in
        ``new_folder/sub``. Used both for an explicit folder rename/move and,
        via `delete_folder`, for "deleting" a folder by relocating its
        contents to the parent folder instead of destroying data.

        Args:
            old_folder: Folder path to move from (with or without nesting).
            new_folder: Destination folder path (``""`` for the root).

        Returns:
            Number of files moved.
        """
        old_folder = old_folder.strip("/")
        new_folder = new_folder.strip("/")
        updated_count = 0
        for record in self._repo.list_all():
            if record.folder != old_folder and not record.folder.startswith(old_folder + "/"):
                continue
            suffix = record.folder[len(old_folder):]  # "" or "/nested/path"
            target_folder = (new_folder + suffix).strip("/")
            self._repo.update(
                record.id,
                title=None,
                tags=None,
                content=None,
                modified=_utc_now(),
                folder=target_folder,
                status=None,
            )
            updated_count += 1
        return updated_count

    def delete_folder(self, folder: str) -> int:
        """"Delete" a folder by moving its contents up to the parent folder.

        There is no separate trash/undo yet, so this intentionally never
        destroys file content — only the (now-empty) folder itself
        disappears from the tree.

        Args:
            folder: Folder path to remove.

        Returns:
            Number of files relocated to the parent folder.
        """
        folder = folder.strip("/")
        parent = folder.rsplit("/", 1)[0] if "/" in folder else ""
        return self.rename_folder(folder, parent)

    def delete_file(self, file_id: str) -> None:
        """Permanently delete a file.

        Args:
            file_id: Identifier of the file to delete.

        Raises:
            FileNotFoundError: If no file with *file_id* exists.
        """
        self._repo.delete(file_id)

    def archive_file(self, file_id: str) -> FileRecord:
        """Move a file into the archive, out of default listings.

        Args:
            file_id: Identifier of the file to archive.

        Returns:
            The updated ``FileRecord``.

        Raises:
            FileNotFoundError: If no file with *file_id* exists.
        """
        return self._repo.archive(file_id)

    def unarchive_file(self, file_id: str) -> FileRecord:
        """Restore a previously archived file to its original folder.

        Args:
            file_id: Identifier of the file to restore.

        Returns:
            The updated ``FileRecord``.

        Raises:
            FileNotFoundError: If no file with *file_id* exists.
        """
        return self._repo.unarchive(file_id)

    def archive_completed_before(self, days: int) -> int:
        """Archive every "done" task whose status change is older than *days*.

        Only tasks that actually have a ``status == "done"`` and a stamped
        ``status_changed_at`` are considered — tasks marked done without ever
        going through the kanban transition (no stamped date) are left
        alone rather than guessed at.

        Args:
            days: Age threshold in days; tasks concluded on or before this
                many days ago are archived.

        Returns:
            Number of tasks archived.
        """
        cutoff = datetime.now() - timedelta(days=days)
        archived_count = 0
        for record in self._repo.list_all():
            if record.status != "done" or not record.status_changed_at:
                continue
            try:
                concluded_at = datetime.fromisoformat(record.status_changed_at)
            except ValueError:
                continue
            if concluded_at <= cutoff:
                self._repo.archive(record.id)
                archived_count += 1
        return archived_count
