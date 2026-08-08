from __future__ import annotations

import dataclasses
import re
import shutil
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
    current = start
    while current != stop_at:
        if not current.is_dir():
            current = current.parent
            continue
        try:
            current.rmdir()
            current = current.parent
        except OSError:
            break

class MarkdownFileRepository(AbstractFileRepository):
    ARCHIVE_FOLDER = "_archive"
    TRASH_FOLDER = "_trash"
    ASSETS_FOLDER = "assets"

    def __init__(self, notes_dir: Path) -> None:
        self._dir: Path = notes_dir
        self._dir.mkdir(parents=True, exist_ok=True)
        self._cache: dict[Path, tuple[int, FileRecord]] = {}
        self._id_to_path: dict[str, Path] = {}
        self._lock = threading.Lock()
        self._migrate_flat_files()

    def _migrate_flat_files(self) -> None:
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

    def _parse_cached(self, path: Path) -> FileRecord:
        mtime_ns = path.stat().st_mtime_ns
        with self._lock:
            cached = self._cache.get(path)
            if cached is not None and cached[0] == mtime_ns:
                return cached[1]
        record = self._parse(path) if path.suffix == ".md" else self._parse_non_md(path)
        with self._lock:
            self._cache[path] = (mtime_ns, record)
            self._id_to_path[record.id] = path
        return record

    def _remember(self, path: Path, record: FileRecord) -> None:
        with self._lock:
            self._cache[path] = (path.stat().st_mtime_ns, record)
            self._id_to_path[record.id] = path

    def _forget(self, path: Path, file_id: str | None = None) -> None:
        with self._lock:
            self._cache.pop(path, None)
            if file_id is not None:
                self._id_to_path.pop(file_id, None)

    def _evict_stale(self, existing_paths: set[Path]) -> None:
        with self._lock:
            stale = [p for p in self._cache if p not in existing_paths]
            for p in stale:
                del self._cache[p]
            stale_ids = [i for i, p in self._id_to_path.items() if p not in existing_paths]
            for i in stale_ids:
                del self._id_to_path[i]

    def _unique_id(self, desired: str, current_id: str | None = None) -> str:
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
        folder = folder.strip("/")
        if folder:
            return self._dir / folder / f"{file_id}.md"
        return self._dir / f"{file_id}.md"

    def _require_path(self, file_id: str) -> Path:
        cached_path = self._id_to_path.get(file_id)
        if cached_path is not None and cached_path.is_file():
            return cached_path

        direct = self._dir / file_id
        if direct.is_file():
            with self._lock:
                self._id_to_path[file_id] = direct
            return direct

        matches = list(self._dir.rglob(f"{file_id}.md"))
        if not matches:
            matches = [
                p for p in self._dir.rglob("*")
                if p.is_file() and (p.name == file_id or str(p.relative_to(self._dir)).replace("\\", "/") == file_id)
            ]
        if not matches:
            with self._lock:
                self._id_to_path.pop(file_id, None)
            raise FileNotFoundError(f"File not found: '{file_id}'")
        path = matches[0]
        with self._lock:
            self._id_to_path[file_id] = path
        return path

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

        rel_parent = path.parent.relative_to(self._dir)
        path_folder = str(rel_parent).replace("\\", "/") if str(rel_parent) != "." else ""
        rel_path = path.relative_to(self._dir)
        filename = str(rel_path).replace("\\", "/")

        now = datetime.now(timezone.utc).isoformat()
        return FileRecord(
            id=_coerce_str(meta.get("id", path.stem)),
            title=_coerce_str(meta.get("title", path.stem)),
            type=str(meta.get("type", "note")),
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
            trashed_from=_coerce_str(meta.get("trashed_from", "")),
            due_date=_coerce_str(meta.get("due_date") or meta.get("due") or ""),
        )

    def _parse_non_md(self, path: Path) -> FileRecord:
        rel_path = path.relative_to(self._dir)
        filename = str(rel_path).replace("\\", "/")
        rel_parent = path.parent.relative_to(self._dir)
        folder = str(rel_parent).replace("\\", "/") if str(rel_parent) != "." else ""

        now = datetime.now(timezone.utc).isoformat()
        try:
            st = path.stat()
            mtime = datetime.fromtimestamp(st.st_mtime, timezone.utc).isoformat()
            ctime = datetime.fromtimestamp(st.st_ctime, timezone.utc).isoformat()
        except OSError:
            mtime = now
            ctime = now

        return FileRecord(
            id=filename,
            title=path.name,
            type="other",
            tags=[],
            content="",
            filename=filename,
            created=ctime,
            modified=mtime,
            folder=folder,
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
            "status_changed_at": record.status_changed_at,
            "archived_from": record.archived_from,
            "trashed_from": record.trashed_from,
            "due_date": record.due_date,
        }
        frontmatter = yaml.dump(
            fm_data, allow_unicode=True, default_flow_style=False
        ).strip()
        path.write_text(f"---\n{frontmatter}\n---\n{record.content}", "utf-8")

    def list_all(self, include_archived: bool = False) -> list[FileRecord]:
        paths: list[Path] = []
        for child in self._dir.rglob("*"):
            if not child.is_file():
                continue
            rel_parts = child.relative_to(self._dir).parts
            if any(part.startswith(".") for part in rel_parts):
                continue
            if rel_parts[0] == self.TRASH_FOLDER:
                continue
            if not include_archived and rel_parts[0] == self.ARCHIVE_FOLDER:
                continue
            paths.append(child)
        paths.sort(key=lambda p: p.stat().st_mtime, reverse=True)

        records: list[FileRecord] = []
        for p in paths:
            try:
                records.append(self._parse_cached(p))
            except (OSError, ValueError, yaml.YAMLError):
                continue
        if include_archived:
            self._evict_stale(set(paths))
        return records

    def list_archived(self) -> list[FileRecord]:
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
        due_date: str = "",
    ) -> FileRecord:
        folder = folder.strip("/")
        actual_id = self._unique_id(file_id)
        rel_filename = f"{folder}/{actual_id}.md" if folder else f"{actual_id}.md"
        record = FileRecord(
            id=actual_id,
            title=title,
            type=file_type,
            tags=tags,
            content=content,
            filename=rel_filename,
            created=created,
            modified=modified,
            folder=folder,
            status=status,
            status_changed_at=status_changed_at,
            due_date=due_date,
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
        due_date: str | None = None,
    ) -> FileRecord:
        old_path = self._require_path(file_id)
        existing = self._parse_cached(old_path)

        new_title = title if title is not None else existing.title
        new_folder = folder.strip("/") if folder is not None else existing.folder
        new_folder = new_folder or ""

        if existing.type == "other":
            dest_dir = self._dir / new_folder if new_folder else self._dir
            dest_dir.mkdir(parents=True, exist_ok=True)
            new_path = dest_dir / new_title

            if new_path != old_path:
                old_path.rename(new_path)
                self._forget(old_path, file_id)

            new_rel_filename = str(new_path.relative_to(self._dir)).replace("\\", "/")
            updated = dataclasses.replace(
                existing,
                id=new_rel_filename,
                title=new_title,
                folder=new_folder,
                filename=new_rel_filename,
                modified=modified,
            )
            self._remember(new_path, updated)
            return updated

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
            due_date=due_date if due_date is not None else existing.due_date,
        )

        new_path = self._build_path(new_id, new_folder)
        if new_path != old_path:
            self._write(new_path, updated)
            old_path.unlink()
            self._forget(old_path, file_id if file_id != new_id else None)
        else:
            self._write(old_path, updated)

        self._remember(new_path, updated)
        return updated

    def delete(self, file_id: str) -> None:
        path = self._require_path(file_id)
        path.unlink()
        self._forget(path, file_id)

    def _relocate(
        self,
        file_id: str,
        *,
        new_folder: str,
        archived_from: str | None = None,
        trashed_from: str | None = None,
    ) -> FileRecord:
        old_path = self._require_path(file_id)
        existing = self._parse_cached(old_path)
        if existing.type == "other":
            new_path = (self._dir / new_folder / old_path.name) if new_folder else (self._dir / old_path.name)
            new_path.parent.mkdir(parents=True, exist_ok=True)
            if new_path != old_path:
                old_path.rename(new_path)
                self._forget(old_path, file_id)
            rel_filename = str(new_path.relative_to(self._dir)).replace("\\", "/")
            updated = dataclasses.replace(
                existing,
                id=rel_filename,
                folder=new_folder,
                archived_from=archived_from if archived_from is not None else existing.archived_from,
                trashed_from=trashed_from if trashed_from is not None else existing.trashed_from,
                filename=rel_filename,
                modified=datetime.now(timezone.utc).isoformat(),
            )
            self._remember(new_path, updated)
            return updated

        new_path = self._build_path(existing.id, new_folder)
        rel_filename = str(new_path.relative_to(self._dir)).replace("\\", "/")
        updated = dataclasses.replace(
            existing,
            folder=new_folder,
            archived_from=archived_from if archived_from is not None else existing.archived_from,
            trashed_from=trashed_from if trashed_from is not None else existing.trashed_from,
            filename=rel_filename,
            modified=datetime.now(timezone.utc).isoformat(),
        )
        if new_path != old_path:
            self._write(new_path, updated)
            old_path.unlink()
            self._forget(old_path, file_id)
        else:
            self._write(old_path, updated)
        self._remember(new_path, updated)
        return updated

    def archive(self, file_id: str) -> FileRecord:
        existing = self.get_by_id(file_id)
        return self._relocate(file_id, new_folder=self.ARCHIVE_FOLDER, archived_from=existing.folder)

    def unarchive(self, file_id: str) -> FileRecord:
        existing = self.get_by_id(file_id)
        return self._relocate(file_id, new_folder=existing.archived_from, archived_from="")

    def list_trash(self) -> list[FileRecord]:
        trash_dir = self._dir / self.TRASH_FOLDER
        if not trash_dir.is_dir():
            return []
        paths = sorted(trash_dir.rglob("*.md"), key=lambda p: p.stat().st_mtime, reverse=True)
        records: list[FileRecord] = []
        for p in paths:
            try:
                records.append(self._parse_cached(p))
            except (OSError, ValueError, yaml.YAMLError):
                continue
        return records

    def trash(self, file_id: str) -> FileRecord:
        existing = self.get_by_id(file_id)
        return self._relocate(file_id, new_folder=self.TRASH_FOLDER, trashed_from=existing.folder)

    def untrash(self, file_id: str) -> FileRecord:
        existing = self.get_by_id(file_id)
        target = existing.trashed_from if existing.trashed_from != self.TRASH_FOLDER else ""
        return self._relocate(file_id, new_folder=target, trashed_from="")

    def purge_trash(self, file_id: str | None = None) -> None:
        trash_dir = self._dir / self.TRASH_FOLDER
        if not trash_dir.is_dir():
            return
        if file_id:
            path = self._require_path(file_id)
            if self.TRASH_FOLDER in path.relative_to(self._dir).parts:
                path.unlink()
                self._forget(path, file_id)
        else:
            for p in list(trash_dir.rglob("*.md")):
                p.unlink()
                self._forget(p)

    def count_by_type(self) -> dict[str, int]:
        counts: dict[str, int] = {}
        for record in self.list_all(include_archived=True):
            counts[record.type] = counts.get(record.type, 0) + 1
        return counts

    def total_size_bytes(self) -> int:
        return sum(p.stat().st_size for p in self._dir.rglob("*.md"))

    def list_folders(self) -> list[str]:
        reserved = {self.ARCHIVE_FOLDER, self.ASSETS_FOLDER, self.TRASH_FOLDER}
        paths: list[str] = []
        for child in self._dir.rglob("*"):
            if not child.is_dir():
                continue
            rel_parts = child.relative_to(self._dir).parts
            if rel_parts[0] in reserved:
                continue
            paths.append("/".join(rel_parts))
        return sorted(paths)

    def create_folder(self, folder: str) -> None:
        folder = folder.strip("/")
        if not folder:
            raise ValueError("Folder path cannot be empty.")
        parts = Path(folder).parts
        if ".." in parts:
            raise ValueError("Invalid folder path.")
        if parts[0] in (self.ARCHIVE_FOLDER, self.ASSETS_FOLDER, self.TRASH_FOLDER):
            raise ValueError(f"'{parts[0]}' is a reserved folder name.")
        (self._dir / folder).mkdir(parents=True, exist_ok=True)

    def move_folder(self, old_folder: str, new_folder: str) -> None:
        old_folder = old_folder.strip("/")
        new_folder = new_folder.strip("/")
        old_path = self._dir / old_folder
        if not old_path.is_dir():
            return
        new_root = self._dir / new_folder if new_folder else self._dir
        for sub in sorted(old_path.rglob("*")):
            if sub.is_dir():
                (new_root / sub.relative_to(old_path)).mkdir(parents=True, exist_ok=True)
        shutil.rmtree(old_path, ignore_errors=True)
        _cleanup_empty_dirs(old_path.parent, self._dir)
