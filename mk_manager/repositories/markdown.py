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

import re
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

    def __init__(self, notes_dir: Path) -> None:
        self._dir: Path = notes_dir
        self._dir.mkdir(parents=True, exist_ok=True)
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
        """Find an existing file by ID anywhere under the notes tree.

        Raises:
            FileNotFoundError: If the file does not exist.
        """
        matches = list(self._dir.rglob(f"{file_id}.md"))
        if not matches:
            raise FileNotFoundError(f"File not found: '{file_id}'")
        return matches[0]

    def _parse(self, path: Path) -> FileRecord:
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
        )

    def _write(self, path: Path, record: FileRecord) -> None:
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
        }
        frontmatter = yaml.dump(
            fm_data, allow_unicode=True, default_flow_style=False
        ).strip()
        path.write_text(f"---\n{frontmatter}\n---\n{record.content}", "utf-8")

    # ── AbstractFileRepository ─────────────────────────────────────────────

    def list_all(self) -> list[FileRecord]:
        paths = sorted(
            self._dir.rglob("*.md"),
            key=lambda p: p.stat().st_mtime,
            reverse=True,
        )
        records: list[FileRecord] = []
        for p in paths:
            try:
                records.append(self._parse(p))
            except (OSError, ValueError, yaml.YAMLError):
                continue
        return records

    def get_by_id(self, file_id: str) -> FileRecord:
        return self._parse(self._require_path(file_id))

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
    ) -> FileRecord:
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
        )
        self._write(self._build_path(actual_id, folder), record)
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
    ) -> FileRecord:
        old_path = self._require_path(file_id)
        existing = self._parse(old_path)

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
        )

        new_path = self._build_path(new_id, new_folder)
        if new_path != old_path:
            self._write(new_path, updated)
            old_path.unlink()
            _cleanup_empty_dirs(old_path.parent, self._dir)
        else:
            self._write(old_path, updated)

        return updated

    def delete(self, file_id: str) -> None:
        path = self._require_path(file_id)
        path.unlink()
        _cleanup_empty_dirs(path.parent, self._dir)

    def count_by_type(self) -> dict[str, int]:
        counts: dict[str, int] = {}
        for record in self.list_all():
            counts[record.type] = counts.get(record.type, 0) + 1
        return counts

    def total_size_bytes(self) -> int:
        return sum(p.stat().st_size for p in self._dir.rglob("*.md"))
