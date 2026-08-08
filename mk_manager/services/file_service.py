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
    slug = _slugify(title)
    if slug:
        return slug
    now = datetime.now(timezone.utc)
    return f"nota-{now.strftime('%Y%m%d-%H%M%S')}"

_FENCE_RE = re.compile(r"```.*?```", re.DOTALL)
_INLINE_CODE_RE = re.compile(r"`[^`\n]*`")
_URL_RE = re.compile(r"https?://\S+")
_TAG_RE = re.compile(r"(?<![\w#/])#([A-Za-z][\w/-]*)")
_WIKILINK_RE = re.compile(r"\[\[([^\[\]|#]+)(?:#[^\[\]|]*)?(?:\|([^\[\]]+))?\]\]")

def _strip_code_and_urls(content: str) -> str:
    return _URL_RE.sub(" ", _INLINE_CODE_RE.sub(" ", _FENCE_RE.sub(" ", content)))

def extract_inline_tags(content: str) -> list[str]:
    stripped = _strip_code_and_urls(content)
    seen: list[str] = []
    for m in _TAG_RE.finditer(stripped):
        tag = m.group(1)
        if tag not in seen:
            seen.append(tag)
    return seen

def extract_wikilink_targets(content: str) -> list[str]:
    stripped = _strip_code_and_urls(content)
    seen: list[str] = []
    for m in _WIKILINK_RE.finditer(stripped):
        target = m.group(1).strip()
        if target and target not in seen:
            seen.append(target)
    return seen

def _build_snippet(content: str, query: str, radius: int = 120) -> str:
    stripped = content.strip()
    if not query:
        return (stripped[:240] + "…") if len(stripped) > 240 else stripped

    lower = content.lower()
    q_lower = query.lower()
    idx = lower.find(q_lower)
    if idx == -1:
        return (stripped[:240] + "…") if len(stripped) > 240 else stripped

    start = max(0, idx - radius)
    end = min(len(content), idx + len(query) + radius)

    before = content[start:idx]
    match_text = content[idx : idx + len(query)]
    after = content[idx + len(query) : end]

    chunk = f"{before}<mark>{match_text}</mark>{after}".strip()
    if start > 0:
        chunk = "…" + chunk
    if end < len(content):
        chunk += "…"
    return chunk

class FileService:
    def __init__(self, repository: AbstractFileRepository) -> None:
        self._repo = repository

    def list_files(
        self, type_filter: str | None = None, include_archived: bool = False
    ) -> list[FileRecord]:
        records = self._repo.list_all(include_archived=include_archived)
        if type_filter:
            records = [r for r in records if r.type == type_filter]
        return records

    def list_archived_files(self) -> list[FileRecord]:
        return self._repo.list_archived()

    def get_file(self, file_id: str) -> FileRecord:
        return self._repo.get_by_id(file_id)

    def search_files(
        self,
        query: str,
        type_filter: str | None = None,
        tag_filter: list[str] | None = None,
        include_archived: bool = False,
    ) -> list[SearchResult]:
        records = self._repo.list_all(include_archived=include_archived)
        if type_filter:
            records = [r for r in records if r.type == type_filter]
        if tag_filter:
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
        counts = self._repo.count_by_type()
        return StatsResponse(
            total=sum(counts.values()),
            notes=counts.get("note", 0),
            tasks=counts.get("task", 0),
            size_bytes=self._repo.total_size_bytes(),
        )

    def build_graph(self) -> GraphResponse:
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
                    continue
                edge_key = tuple(sorted((r.id, target_id)))
                if edge_key in seen_edges:
                    continue
                seen_edges.add(edge_key)
                edges.append(GraphEdge(source=r.id, target=target_id))

        return GraphResponse(nodes=nodes, edges=edges)

    def create_file(self, request: FileCreateRequest) -> FileRecord:
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
            due_date=request.due_date,
        )

    def update_file(self, file_id: str, request: FileUpdateRequest) -> FileRecord:
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
            due_date=request.due_date,
        )

    def rename_tag(self, old_tag: str, new_tag: str) -> int:
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
        old_folder = old_folder.strip("/")
        new_folder = new_folder.strip("/")
        updated_count = 0
        for record in self._repo.list_all():
            if record.folder != old_folder and not record.folder.startswith(old_folder + "/"):
                continue
            suffix = record.folder[len(old_folder):]
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
        self._repo.move_folder(old_folder, new_folder)
        return updated_count

    def delete_folder(self, folder: str) -> int:
        folder = folder.strip("/")
        parent = folder.rsplit("/", 1)[0] if "/" in folder else ""
        return self.rename_folder(folder, parent)

    def create_folder(self, folder: str) -> None:
        self._repo.create_folder(folder)

    def list_folders(self) -> list[str]:
        return self._repo.list_folders()

    def delete_file(self, file_id: str) -> FileRecord:
        return self._repo.trash(file_id)

    def trash_file(self, file_id: str) -> FileRecord:
        return self._repo.trash(file_id)

    def untrash_file(self, file_id: str) -> FileRecord:
        return self._repo.untrash(file_id)

    def list_trash_files(self) -> list[FileRecord]:
        return self._repo.list_trash()

    def purge_trash(self, file_id: str | None = None) -> None:
        self._repo.purge_trash(file_id)

    def archive_file(self, file_id: str) -> FileRecord:
        return self._repo.archive(file_id)

    def unarchive_file(self, file_id: str) -> FileRecord:
        return self._repo.unarchive(file_id)

    def archive_completed_before(self, days: int) -> int:
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
