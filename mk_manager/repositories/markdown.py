"""Filesystem-backed repository that stores files as Markdown with YAML frontmatter.

Files with a folder are stored at ``{notes_dir}/{folder}/{id}.md``; files
without a folder live directly at ``{notes_dir}/{id}.md``.

.. code-block:: text

   notes/
   ├── abc123def456.md          # root-level file
   └── trabalho/
       └── projetos/
           └── def789abc012.md  # file with folder="trabalho/projetos"

Files dropped manually anywhere under the notes directory (with or without
frontmatter) are accepted; the ``folder`` field is derived from the path
relative to the notes root if not present in the frontmatter.
"""

from __future__ import annotations

import dataclasses
import re
import threading
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import yaml

from mk_manager.domain.entities import FileRecord
from mk_manager.repositories.base import AbstractFileRepository

_FRONTMATTER_RE: re.Pattern[str] = re.compile(r"^---\n(.*?)\n---\n?", re.DOTALL)


def _slugify(text: str) -> str:
    """Convert *text* to a filesystem-safe ASCII slug."""
    text = unicodedata.normalize("NFD", text)
    text = "".join(c for c in text if unicodedata.category(c) != "Mn")
    text = text.lower().strip()
    text = re.sub(r"[^a-z0-9]+", "-", text)
    return text.strip("-")


def _coerce_str(value: Any) -> str:
    """Coerce a raw YAML-parsed value into a plain string field.

    YAML parses unquoted ISO timestamps as ``datetime`` objects rather than
    strings, and missing keys as ``None`` — this normalizes both back to the
    plain ``str`` shape ``FileRecord`` expects.

    Args:
        value: Raw value decoded from YAML frontmatter (any type, or ``None``).

    Returns:
        ``value`` as a string, or ``""`` if ``value`` is ``None``.
    """
    if isinstance(value, datetime):
        return value.isoformat()
    return str(value) if value is not None else ""


def _cleanup_empty_dirs(start: Path, stop_at: Path) -> None:
    """Remove empty ancestor directories up to (but not including) *stop_at*."""
    current = start
    while current != stop_at:
        if not current.is_dir():
            current = current.parent
            continue
        try:
            current.rmdir()  # no-op if non-empty
            current = current.parent
        except OSError:
            break


class MarkdownFileRepository(AbstractFileRepository):
    """Filesystem-backed implementation of ``AbstractFileRepository``.

    Each file record is stored as a real ``.md`` file with a YAML frontmatter
    header under ``notes_dir`` (see module docstring for the on-disk layout).
    Maintains an in-memory, mtime-invalidated parse cache plus an id→path
    index so repeated single-file lookups (get/update/delete) don't require
    a full directory scan.
    """

    # Reserved top-level folder for archived files (excluded from list_all()
    # by default). Kept flat under notes_dir like "assets" already is.
    ARCHIVE_FOLDER = "_archive"

    def __init__(self, notes_dir: Path) -> None:
        """Initialize the repository, creating *notes_dir* if needed.

        Args:
            notes_dir: Root directory where markdown files are stored.
        """
        self._dir: Path = notes_dir
        self._dir.mkdir(parents=True, exist_ok=True)
        # In-memory cache keyed by path, invalidated per-entry via mtime so a
        # request only re-reads/re-parses files that changed since the last
        # scan. ``_id_to_path`` shortcuts single-file lookups (get/update/
        # delete) that would otherwise need a full ``rglob`` per call.
        self._cache: dict[Path, tuple[int, FileRecord]] = {}
        self._id_to_path: dict[str, Path] = {}
        self._lock = threading.Lock()
        self._migrate_flat_files()

    def _migrate_flat_files(self) -> None:
        """Move any root-level files that have a folder set in frontmatter.

        Runs once at startup so that files created before subdirectory support
        are relocated to their canonical paths without manual intervention.
        """
        for path in list(self._dir.glob("*.md")):
            try:
                record = self._parse(path)
                if not record.folder:
                    continue
                target = self._build_path(record.id, record.folder)
                if target != path:
                    target.parent.mkdir(parents=True, exist_ok=True)
                    path.rename(target)
            except Exception:
                continue

    # ── Cache helpers ────────────────────────────────────────────────────────

    def _parse_cached(self, path: Path) -> FileRecord:
        """Return the parsed record for *path*, reusing the cache when fresh."""
        mtime_ns = path.stat().st_mtime_ns
        with self._lock:
            cached = self._cache.get(path)
            if cached is not None and cached[0] == mtime_ns:
                return cached[1]
        record = self._parse(path)
        with self._lock:
            self._cache[path] = (mtime_ns, record)
            self._id_to_path[record.id] = path
        return record

    def _remember(self, path: Path, record: FileRecord) -> None:
        """Populate the cache directly after a write, skipping a re-read."""
        with self._lock:
            self._cache[path] = (path.stat().st_mtime_ns, record)
            self._id_to_path[record.id] = path

    def _forget(self, path: Path, file_id: str | None = None) -> None:
        """Evict *path* (and optionally *file_id*) from the cache."""
        with self._lock:
            self._cache.pop(path, None)
            if file_id is not None:
                self._id_to_path.pop(file_id, None)

    def _evict_stale(self, existing_paths: set[Path]) -> None:
        """Drop cache entries for paths no longer present on disk."""
        with self._lock:
            stale = [p for p in self._cache if p not in existing_paths]
            for p in stale:
                del self._cache[p]
            stale_ids = [i for i, p in self._id_to_path.items() if p not in existing_paths]
            for i in stale_ids:
                del self._id_to_path[i]

    # ── Private helpers ────────────────────────────────────────────────────

    def _unique_id(self, desired: str, current_id: str | None = None) -> str:
        """Return *desired* or *desired_N* that doesn't exist in the notes tree.

        *current_id* is excluded from conflict checks so that renaming a file
        to its own slug (no-op) doesn't append a counter.
        """
        candidate = desired
        counter = 2
        while True:
            conflicts = [
                p for p in self._dir.rglob(f"{candidate}.md")
                if p.stem != current_id
            ]
            if not conflicts:
                return candidate
            candidate = f"{desired}_{counter}"
            counter += 1

    def _build_path(self, file_id: str, folder: str = "") -> Path:
        """Return the canonical path for *file_id* inside *folder*."""
        folder = folder.strip("/")
        if folder:
            return self._dir / folder / f"{file_id}.md"
        return self._dir / f"{file_id}.md"

    def _require_path(self, file_id: str) -> Path:
        """Find an existing file by ID, preferring the cached path.

        Falls back to a full tree scan on a cache miss (or if the cached
        path was deleted from under us), and repopulates the cache either
        way so repeated lookups of the same ID (e.g. autosave) stay O(1).

        Raises:
            FileNotFoundError: If the file does not exist.
        """
        cached_path = self._id_to_path.get(file_id)
        if cached_path is not None and cached_path.is_file():
            return cached_path

        matches = list(self._dir.rglob(f"{file_id}.md"))
        if not matches:
            with self._lock:
                self._id_to_path.pop(file_id, None)
            raise FileNotFoundError(f"File not found: '{file_id}'")
        path = matches[0]
        with self._lock:
            self._id_to_path[file_id] = path
        return path

    def _parse(self, path: Path) -> FileRecord:
        """Read and parse a single ``.md`` file from disk into a ``FileRecord``.

        Tolerates files with no frontmatter (treats the whole file as
        content) and derives ``folder``/``id``/``title`` from the filesystem
        path when frontmatter doesn't supply them, so files dropped in
        manually are still readable. Also falls back to the legacy
        ``date_conclusion``/``date_execution``/``date_planning`` frontmatter
        keys for ``status_changed_at`` when that field itself is absent.

        Args:
            path: Absolute path to the ``.md`` file.

        Returns:
            The parsed ``FileRecord``.
        """
        text = path.read_text("utf-8")
        match = _FRONTMATTER_RE.match(text)

        meta: dict[str, Any] = {}
        if match:
            try:
                meta = yaml.safe_load(match.group(1)) or {}
            except yaml.YAMLError:
                meta = {}
            content = text[match.end():]
        else:
            content = text

        # Derive folder from filesystem path for files without frontmatter
        rel_parent = path.parent.relative_to(self._dir)
        path_folder = str(rel_parent).replace("\\", "/") if str(rel_parent) != "." else ""

        # filename is the path relative to notes_dir (e.g. "work/abc123.md")
        rel_path = path.relative_to(self._dir)
        filename = str(rel_path).replace("\\", "/")

        now = datetime.now(timezone.utc).isoformat()
        return FileRecord(
            id=_coerce_str(meta.get("id", path.stem)),
            title=_coerce_str(meta.get("title", path.stem)),
            type=str(meta.get("type", "note")),  # type: ignore[arg-type]
            tags=[str(t) for t in (meta.get("tags") or [])],
            content=content,
            filename=filename,
            created=_coerce_str(meta.get("created", now)),
            modified=_coerce_str(meta.get("modified", now)),
            folder=_coerce_str(meta.get("folder", path_folder)),
            status=_coerce_str(meta.get("status", "")),
            status_changed_at=_coerce_str(
                meta.get("status_changed_at")
                or meta.get("date_conclusion")
                or meta.get("date_execution")
                or meta.get("date_planning")
                or ""
            ),
            archived_from=_coerce_str(meta.get("archived_from", "")),
        )

    def _write(self, path: Path, record: FileRecord) -> None:
        """Serialize *record* as YAML frontmatter + Markdown body and save it.

        Creates any missing parent directories first.

        Args:
            path: Absolute destination path for the ``.md`` file.
            record: The record to persist.
        """
        path.parent.mkdir(parents=True, exist_ok=True)
        fm_data: dict[str, Any] = {
            "id": record.id,
            "title": record.title,
            "type": record.type,
            "tags": record.tags,
            "created": record.created,
            "modified": record.modified,
            "folder": record.folder,
            "status": record.status,
            "status_changed_at": record.status_changed_at,
            "archived_from": record.archived_from,
        }
        frontmatter = yaml.dump(
            fm_data, allow_unicode=True, default_flow_style=False
        ).strip()
        path.write_text(f"---\n{frontmatter}\n---\n{record.content}", "utf-8")

    # ── AbstractFileRepository ─────────────────────────────────────────────

    def list_all(self, include_archived: bool = False) -> list[FileRecord]:
        """Return all stored file records, newest-modified first.

        When *include_archived* is ``False``, the ``_archive/`` subtree is
        skipped entirely during the directory walk (not filtered out after
        scanning), so a large archive never slows down normal listings.

        Args:
            include_archived: Whether to also scan and include archived files.

        Returns:
            Ordered list of ``FileRecord`` objects, newest-modified first.
        """
        archive_dir = self._dir / self.ARCHIVE_FOLDER
        paths: list[Path] = []
        for child in self._dir.iterdir():
            if child == archive_dir:
                if include_archived:
                    paths.extend(child.rglob("*.md"))
                continue
            if child.is_dir():
                paths.extend(child.rglob("*.md"))
            elif child.suffix == ".md":
                paths.append(child)
        paths.sort(key=lambda p: p.stat().st_mtime, reverse=True)

        records: list[FileRecord] = []
        for p in paths:
            try:
                records.append(self._parse_cached(p))
            except (OSError, ValueError, yaml.YAMLError):
                continue
        if include_archived:
            # Only a comprehensive scan is safe to use for eviction — with
            # the archive skipped, `paths` wouldn't cover it and every
            # archived entry would look "stale" and get dropped from the
            # cache on every single non-archived listing.
            self._evict_stale(set(paths))
        return records

    def list_archived(self) -> list[FileRecord]:
        """Return only archived file records, newest-modified first.

        Returns:
            Ordered list of ``FileRecord`` objects under ``_archive/``, or
            an empty list if no file has ever been archived.
        """
        archive_dir = self._dir / self.ARCHIVE_FOLDER
        if not archive_dir.is_dir():
            return []
        paths = sorted(archive_dir.rglob("*.md"), key=lambda p: p.stat().st_mtime, reverse=True)
        records: list[FileRecord] = []
        for p in paths:
            try:
                records.append(self._parse_cached(p))
            except (OSError, ValueError, yaml.YAMLError):
                continue
        return records

    def get_by_id(self, file_id: str) -> FileRecord:
        """Fetch a single record by its unique identifier.

        Args:
            file_id: The file's unique identifier (filename stem).

        Returns:
            The corresponding ``FileRecord`` with full content.

        Raises:
            FileNotFoundError: If no file with *file_id* exists.
        """
        return self._parse_cached(self._require_path(file_id))

    def create(
        self,
        *,
        file_id: str,
        title: str,
        file_type: str,
        tags: list[str],
        content: str,
        created: str,
        modified: str,
        folder: str = "",
        status: str = "",
        status_changed_at: str = "",
    ) -> FileRecord:
        """Persist a new file record.

        The final id is *file_id* deduplicated against existing files (a
        numeric suffix is appended on conflict), not necessarily *file_id*
        verbatim.

        Args:
            file_id: Desired identifier for the new file (typically a slug
                of the title); may be altered to avoid a collision.
            title: Human-readable title.
            file_type: Semantic type string (``"note"`` or ``"task"``).
            tags: List of tag strings.
            content: Markdown body content.
            created: ISO 8601 UTC creation timestamp.
            modified: ISO 8601 UTC modification timestamp.
            folder: Folder path relative to the notes root.
            status: Kanban status, or ``""`` if not on the board.
            status_changed_at: Timestamp of the last status change.

        Returns:
            The persisted ``FileRecord``, with its actual (possibly
            deduplicated) id and filename.
        """
        folder = folder.strip("/")
        # Use slug of title as ID; fall back to whatever the caller provided
        actual_id = self._unique_id(file_id)
        rel_filename = f"{folder}/{actual_id}.md" if folder else f"{actual_id}.md"
        record = FileRecord(
            id=actual_id,
            title=title,
            type=file_type,  # type: ignore[arg-type]
            tags=tags,
            content=content,
            filename=rel_filename,
            created=created,
            modified=modified,
            folder=folder,
            status=status,
            status_changed_at=status_changed_at,
        )
        path = self._build_path(actual_id, folder)
        self._write(path, record)
        self._remember(path, record)
        return record

    def update(
        self,
        file_id: str,
        *,
        title: str | None,
        tags: list[str] | None,
        content: str | None,
        modified: str,
        folder: str | None = None,
        status: str | None = None,
        status_changed_at: str | None = None,
    ) -> FileRecord:
        """Apply a partial update to an existing file record.

        Fields left as ``None`` preserve their current stored value. If the
        new title's slug differs from the current id, the file is renamed
        (and physically relocated on disk if the folder also changed).

        Args:
            file_id: Identifier of the file to update.
            title: New title, or ``None`` to keep the current value.
            tags: New tag list, or ``None`` to keep the current value.
            content: New content, or ``None`` to keep the current value.
            modified: ISO 8601 UTC timestamp for this modification.
            folder: New folder path, or ``None`` to keep the current value.
            status: New kanban status, or ``None`` to keep the current value.
            status_changed_at: New status-changed timestamp, or ``None`` to
                keep the current value.

        Returns:
            The updated ``FileRecord``.

        Raises:
            FileNotFoundError: If no file with *file_id* exists.
        """
        old_path = self._require_path(file_id)
        existing = self._parse_cached(old_path)

        new_title = title if title is not None else existing.title
        new_folder = folder.strip("/") if folder is not None else existing.folder
        new_folder = new_folder or ""

        # Re-slug the ID whenever the title's slug doesn't match the current file ID
        desired = _slugify(new_title) if new_title else ""
        if desired and desired != file_id:
            new_id = self._unique_id(desired, file_id)
        else:
            new_id = file_id

        rel_filename = f"{new_folder}/{new_id}.md" if new_folder else f"{new_id}.md"

        updated = FileRecord(
            id=new_id,
            title=new_title,
            type=existing.type,
            tags=tags if tags is not None else existing.tags,
            content=content if content is not None else existing.content,
            filename=rel_filename,
            created=existing.created,
            modified=modified,
            folder=new_folder,
            status=status if status is not None else existing.status,
            status_changed_at=status_changed_at if status_changed_at is not None else existing.status_changed_at,
        )

        new_path = self._build_path(new_id, new_folder)
        if new_path != old_path:
            self._write(new_path, updated)
            old_path.unlink()
            _cleanup_empty_dirs(old_path.parent, self._dir)
            self._forget(old_path, file_id if file_id != new_id else None)
        else:
            self._write(old_path, updated)

        self._remember(new_path, updated)
        return updated

    def delete(self, file_id: str) -> None:
        """Permanently remove a file record from the store.

        Also cleans up any now-empty ancestor folders left behind.

        Args:
            file_id: Identifier of the file to delete.

        Raises:
            FileNotFoundError: If no file with *file_id* exists.
        """
        path = self._require_path(file_id)
        path.unlink()
        _cleanup_empty_dirs(path.parent, self._dir)
        self._forget(path, file_id)

    def _relocate(self, file_id: str, *, new_folder: str, archived_from: str) -> FileRecord:
        """Shared move logic for `archive`/`unarchive` (both are just a folder move)."""
        old_path = self._require_path(file_id)
        existing = self._parse_cached(old_path)
        new_path = self._build_path(existing.id, new_folder)
        rel_filename = str(new_path.relative_to(self._dir)).replace("\\", "/")
        updated = dataclasses.replace(
            existing,
            folder=new_folder,
            archived_from=archived_from,
            filename=rel_filename,
            modified=datetime.now(timezone.utc).isoformat(),
        )
        if new_path != old_path:
            self._write(new_path, updated)
            old_path.unlink()
            _cleanup_empty_dirs(old_path.parent, self._dir)
            self._forget(old_path, file_id)
        else:
            self._write(old_path, updated)
        self._remember(new_path, updated)
        return updated

    def archive(self, file_id: str) -> FileRecord:
        """Move a file into the reserved ``_archive/`` folder.

        Stamps ``archived_from`` with the file's current folder so
        ``unarchive`` can restore it exactly.

        Args:
            file_id: Identifier of the file to archive.

        Returns:
            The updated ``FileRecord``.

        Raises:
            FileNotFoundError: If no file with *file_id* exists.
        """
        existing = self.get_by_id(file_id)
        return self._relocate(file_id, new_folder=self.ARCHIVE_FOLDER, archived_from=existing.folder)

    def unarchive(self, file_id: str) -> FileRecord:
        """Restore a previously archived file to its original folder.

        Args:
            file_id: Identifier of the file to restore.

        Returns:
            The updated ``FileRecord``, with ``archived_from`` cleared.

        Raises:
            FileNotFoundError: If no file with *file_id* exists.
        """
        existing = self.get_by_id(file_id)
        return self._relocate(file_id, new_folder=existing.archived_from, archived_from="")

    def count_by_type(self) -> dict[str, int]:
        """Aggregate file counts grouped by type, including archived files.

        Returns:
            Mapping of ``type`` string to file count,
            e.g. ``{"note": 5, "task": 3}``.
        """
        counts: dict[str, int] = {}
        for record in self.list_all(include_archived=True):
            counts[record.type] = counts.get(record.type, 0) + 1
        return counts

    def total_size_bytes(self) -> int:
        """Compute total storage consumed by all files, including archived ones.

        Returns:
            Sum of file sizes in bytes.
        """
        return sum(p.stat().st_size for p in self._dir.rglob("*.md"))
