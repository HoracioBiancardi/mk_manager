"""Pydantic schemas for API request validation and response serialization.

These schemas are intentionally separate from the domain entities so that
HTTP concerns (field aliasing, validation rules, serialization format) do
not leak into the core business model.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class FileMetaResponse(BaseModel):
    """File metadata returned in list and search responses (no content body).

    Attributes:
        id: Unique file identifier (filename stem).
        title: Human-readable title from frontmatter.
        type: File semantic type — ``"note"`` or ``"task"``.
        tags: Ordered list of tag strings.
        filename: Physical filename on disk (e.g. ``"abc123.md"``).
        created: ISO 8601 UTC creation timestamp.
        modified: ISO 8601 UTC last-modified timestamp.
        word_count: Number of words in the markdown body.
        task_total: Total task-list items (meaningful only for ``type="task"``).
        task_done: Completed task-list items (meaningful only for ``type="task"``).
    """

    id: str
    title: str
    type: str
    tags: list[str]
    filename: str
    created: str
    modified: str
    word_count: int
    task_total: int
    task_done: int
    task_items: list[dict] = []
    folder: str = ""
    status: str = ""
    date_planning: str = ""
    date_execution: str = ""
    date_conclusion: str = ""

    model_config = {"from_attributes": True}


class FileDetailResponse(FileMetaResponse):
    """Full file response including the raw markdown content body.

    Extends ``FileMetaResponse`` with the complete content, returned only
    by the single-file GET endpoint to avoid sending large payloads in lists.

    Attributes:
        content: Raw markdown body (YAML frontmatter excluded).
    """

    content: str


class FileCreateRequest(BaseModel):
    """Request body for creating a new file.

    All fields have sensible defaults so the frontend can POST ``{}`` to
    create a blank draft and fill it in later.

    Attributes:
        title: File title. Defaults to an empty string.
        type: Semantic type. Defaults to ``"note"``.
        tags: Initial tag list. Defaults to an empty list.
        content: Initial markdown content. Defaults to an empty string.
    """

    title: str = Field(default="", description="File title")
    type: Literal["note", "task"] = Field(default="note", description="File type")
    tags: list[str] = Field(default_factory=list, description="List of tags")
    content: str = Field(default="", description="Markdown body content")
    folder: str = Field(default="", description="Folder path, e.g. 'work/projects'")
    status: str = Field(default="", description="Kanban status: planning|development|review|done")
    date_planning: str = Field(default="", description="Planning date")
    date_execution: str = Field(default="", description="Execution date")
    date_conclusion: str = Field(default="", description="Conclusion date")


class FileUpdateRequest(BaseModel):
    """Request body for a partial file update (HTTP PUT).

    Uses ``None`` as the sentinel for *"do not change this field"*,
    so clients only need to send the fields they want to modify.

    Attributes:
        title: New title, or ``None`` to leave unchanged.
        tags: New tag list, or ``None`` to leave unchanged.
        content: New markdown content, or ``None`` to leave unchanged.
    """

    title: str | None = Field(default=None, description="New title")
    tags: list[str] | None = Field(default=None, description="New tag list")
    content: str | None = Field(default=None, description="New markdown content")
    folder: str | None = Field(default=None, description="New folder path")
    status: str | None = Field(default=None, description="New kanban status")
    date_planning: str | None = Field(default=None, description="New planning date")
    date_execution: str | None = Field(default=None, description="New execution date")
    date_conclusion: str | None = Field(default=None, description="New conclusion date")


class TagRenameRequest(BaseModel):
    """Request body for renaming a tag across every file that has it.

    Attributes:
        new_tag: The replacement tag value. If it already exists on a file,
            the old and new tags are merged (no duplicate entries).
    """

    new_tag: str = Field(description="New tag value to rename/merge into")


class TagRenameResponse(BaseModel):
    """Result of a tag rename operation.

    Attributes:
        updated_count: Number of files whose tag list was changed.
    """

    updated_count: int


class FolderRenameRequest(BaseModel):
    """Request body for renaming/moving a folder (and everything nested under it).

    Attributes:
        old_path: Existing folder path.
        new_path: Destination folder path (``""`` moves contents to the root).
    """

    old_path: str
    new_path: str


class FolderChangeResponse(BaseModel):
    """Result of a folder rename or delete operation.

    Attributes:
        updated_count: Number of files relocated.
    """

    updated_count: int


class ArchiveBatchResponse(BaseModel):
    """Result of a batch-archive operation.

    Attributes:
        archived_count: Number of files moved into the archive.
    """

    archived_count: int


class SearchResultResponse(FileMetaResponse):
    """Search result enriched with a content excerpt around the match.

    Attributes:
        snippet: Short excerpt from the content body around the first match.
            Prefixed/suffixed with ``…`` where text was truncated.
    """

    snippet: str


class GraphNode(BaseModel):
    """A single node in the notes graph (a real file, or a "phantom" placeholder.

    Attributes:
        id: Real file id, or a synthetic ``"phantom:<title>"`` id for a
            ``[[link]]`` target that doesn't resolve to any existing file.
        title: Display title.
        type: ``"note"``, ``"task"``, or ``"phantom"`` (unresolved link target).
        tags: Tag list (empty for phantom nodes).
        folder: Folder path (empty for phantom nodes).
    """

    id: str
    title: str
    type: str
    tags: list[str]
    folder: str


class GraphEdge(BaseModel):
    """An undirected connection between two graph nodes (one resolved ``[[link]]``).

    Attributes:
        source: Id of the linking file.
        target: Id of the link target (real file id or phantom id).
    """

    source: str
    target: str


class GraphResponse(BaseModel):
    """The whole notes graph, built from ``[[wikilink]]`` references.

    Attributes:
        nodes: Every file plus any phantom (unresolved link target) nodes.
        edges: One entry per unique resolved link between two nodes.
    """

    nodes: list[GraphNode]
    edges: list[GraphEdge]


class StatsResponse(BaseModel):
    """Aggregated storage statistics.

    Attributes:
        total: Total number of markdown files in the notes directory.
        notes: Number of files with ``type="note"``.
        tasks: Number of files with ``type="task"``.
        size_bytes: Combined size of all files in bytes.
    """

    total: int
    notes: int
    tasks: int
    size_bytes: int


class SettingsResponse(BaseModel):
    """Current application configuration exposed to the frontend.

    Attributes:
        notes_dir: Absolute path where markdown files are stored.
        assets_dir: Absolute path where uploaded/pasted assets are stored
            (defaults to ``{notes_dir}/assets`` when not set separately).
        assets_dir_is_default: Whether *assets_dir* is the derived default
            (``{notes_dir}/assets``) rather than an explicit override.
        host: Bind address the server is listening on (read-only; requires
            a restart to change).
        port: TCP port the server is listening on (read-only; requires a
            restart to change).
    """

    notes_dir: str
    assets_dir: str
    assets_dir_is_default: bool
    host: str
    port: int


class SettingsUpdateRequest(BaseModel):
    """Payload to change the notes and/or assets directory at runtime.

    Attributes:
        notes_dir: New directory path where markdown files should be stored.
            Created automatically if it doesn't exist yet.
        assets_dir: New directory path for uploaded/pasted assets. Pass an
            empty string to reset back to the default (``{notes_dir}/assets``).
            Omit (or leave ``None``) to keep the current assets setting
            unchanged.
    """

    notes_dir: str
    assets_dir: str | None = None


class DirEntry(BaseModel):
    """A single subdirectory entry returned by the folder browser.

    Attributes:
        name: Directory's own name (no path segments).
        path: Absolute path to the directory.
    """

    name: str
    path: str


class BrowseResponse(BaseModel):
    """A directory listing used by the notes-folder picker in Settings.

    Attributes:
        path: Absolute path currently being browsed.
        parent: Absolute path of the parent directory, or ``None`` at the
            filesystem root.
        dirs: Immediate subdirectories, sorted by name.
    """

    path: str
    parent: str | None
    dirs: list[DirEntry]
