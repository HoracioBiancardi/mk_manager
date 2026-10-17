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
    LinkRef,
    LinksResponse,
    StatsResponse,
    TrailInfo,
)
from mk_manager.repositories.base import AbstractFileRepository
from mk_manager.services.links import (
    LinkResolver,
    extract_index_steps,
    extract_note_links,
    rewrite_links,
    rewrite_origin,
)

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

def _link_ref(record: FileRecord) -> LinkRef:
    role = record.role or (record.folder.rsplit("/", 1)[-1] if record.folder else "")
    return LinkRef(
        id=record.id,
        title=record.title or record.id,
        type=record.type,
        folder=record.folder,
        status=record.status,
        role=role,
    )

class FileConflictError(Exception):
    """A nota mudou depois que o cliente a leu (`expected_modified` não confere)."""


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
        resolver = LinkResolver(records)

        nodes = [
            GraphNode(id=r.id, title=r.title or r.id, type=r.type, tags=r.tags, folder=r.folder)
            for r in records
        ]
        phantom_ids: dict[str, str] = {}
        edges: dict[tuple[str, str], GraphEdge] = {}

        def add_edge(source: str, target: str, kind: str) -> None:
            if source == target:
                return
            edge_key = tuple(sorted((source, target)))
            # Um par de notas vira uma aresta só; a de origem vence a de citação.
            if edge_key in edges and not (kind == "origin" and edges[edge_key].kind != "origin"):
                return
            edges[edge_key] = GraphEdge(source=source, target=target, kind=kind)

        for r in resolver.records:
            parent = resolver.resolve_origin(r)
            if parent is not None:
                add_edge(r.id, parent.id, "origin")
            for link in extract_note_links(r.content):
                hit = resolver.resolve(link, r.folder)
                if hit is not None:
                    add_edge(r.id, hit.id, "link")
                    continue
                if link.kind != "wiki":
                    continue
                key = link.target.lower()
                target_id = phantom_ids.get(key)
                if target_id is None:
                    target_id = f"phantom:{key}"
                    phantom_ids[key] = target_id
                    nodes.append(GraphNode(id=target_id, title=link.target, type="phantom", tags=[], folder=""))
                add_edge(r.id, target_id, "link")

        return GraphResponse(nodes=nodes, edges=list(edges.values()))

    def get_links(self, file_id: str) -> LinksResponse:
        """Tudo o que liga a nota às outras: citações, cadeia de origem e trilhas de índice."""
        current = self._repo.get_by_id(file_id)
        resolver = LinkResolver(self._repo.list_all())

        outgoing: list[FileRecord] = []
        missing: list[str] = []
        for link in extract_note_links(current.content):
            hit = resolver.resolve(link, current.folder)
            if hit is None:
                missing.append(link.target)
            elif hit.id != current.id and hit not in outgoing:
                outgoing.append(hit)

        backlinks: list[FileRecord] = []
        children: list[FileRecord] = []
        trails: list[TrailInfo] = []
        for r in resolver.records:
            if r.id == current.id:
                continue
            parent = resolver.resolve_origin(r)
            if parent is not None and parent.id == current.id:
                children.append(r)
            targets = [resolver.resolve(link, r.folder) for link in extract_note_links(r.content)]
            if any(t is not None and t.id == current.id for t in targets):
                backlinks.append(r)
            if r.is_index:
                steps = [resolver.resolve(link, r.folder) for link in extract_index_steps(r.content)]
                if any(t is not None and t.id == current.id for t in steps):
                    trails.append(self._trail(r, steps, current))

        ancestors: list[FileRecord] = []
        node, seen = current, {current.id}
        while (parent := resolver.resolve_origin(node)) is not None and parent.id not in seen:
            ancestors.insert(0, parent)
            seen.add(parent.id)
            node = parent

        children.sort(key=lambda r: (r.type != "task", (r.title or r.id).lower()))
        return LinksResponse(
            outgoing=[_link_ref(r) for r in outgoing],
            missing=missing,
            backlinks=[_link_ref(r) for r in backlinks],
            ancestors=[_link_ref(r) for r in ancestors],
            children=[_link_ref(r) for r in children],
            trails=trails,
        )

    @staticmethod
    def _trail(index: FileRecord, targets: list[FileRecord | None], current: FileRecord) -> TrailInfo:
        steps: list[FileRecord] = []
        for t in targets:
            if t is not None and t.id != index.id and all(t.id != s.id for s in steps):
                steps.append(t)
        pos = next(i for i, s in enumerate(steps) if s.id == current.id)
        return TrailInfo(
            index=_link_ref(index),
            position=pos + 1,
            total=len(steps),
            prev=_link_ref(steps[pos - 1]) if pos > 0 else None,
            next=_link_ref(steps[pos + 1]) if pos + 1 < len(steps) else None,
        )

    def _update_links_to(self, old: FileRecord, new: FileRecord) -> None:
        """Depois de renomear/mover `old`, corrige os links e as origens que apontavam para ela."""
        for r in self._repo.list_all(include_archived=True):
            if r.type == "other":
                continue
            folder = new.folder if r.id == new.id else r.folder
            content = rewrite_links(r.content, folder, old, new)
            origin = rewrite_origin(r.origin, old, new)
            if content == r.content and origin == r.origin:
                continue
            self._repo.update(
                r.id,
                title=None,
                tags=None,
                content=content,
                modified=r.modified,
                folder=None,
                status=None,
                origin=origin,
            )

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
            origin=request.origin,
            role=request.role,
            is_index=request.is_index,
        )

    def update_file(self, file_id: str, request: FileUpdateRequest) -> FileRecord:
        existing = self._repo.get_by_id(file_id)
        if request.expected_modified is not None and request.expected_modified != existing.modified:
            raise FileConflictError(f"File '{file_id}' was modified elsewhere.")

        status_changed_at = (
            request.status_changed_at if request.status_changed_at is not None else existing.status_changed_at
        )
        if request.status is not None and request.status != existing.status:
            status_changed_at = datetime.now().strftime("%Y-%m-%dT%H:%M")

        # Reordenar um card no Kanban não é edição da nota: mantém o "modificado em",
        # senão arrastar um card renumera a coluna e bagunça a ordem por recentes.
        only_reorder = request.kanban_order is not None and not request.model_dump(
            exclude_none=True, exclude={"kanban_order", "expected_modified"}
        )

        updated = self._repo.update(
            file_id,
            title=request.title,
            tags=request.tags,
            content=request.content,
            modified=existing.modified if only_reorder else _utc_now(),
            folder=request.folder,
            status=request.status,
            status_changed_at=status_changed_at,
            due_date=request.due_date,
            kanban_order=request.kanban_order,
            origin=request.origin,
            role=request.role,
            is_index=request.is_index,
        )
        if (updated.title, updated.filename) != (existing.title, existing.filename):
            self._update_links_to(existing, updated)
            updated = self._repo.get_by_id(updated.id)
        return updated

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
        # Valida antes de mover qualquer nota: "" ou ".." aqui já apagaram a pasta de notas inteira.
        old_folder, new_folder = self._repo.validate_folder_move(old_folder, new_folder)
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
        folder = (folder or "").strip("/")
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
