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


class SearchResultResponse(FileMetaResponse):
    """Search result enriched with a content excerpt around the match.

    Attributes:
        snippet: Short excerpt from the content body around the first match.
            Prefixed/suffixed with ``…`` where text was truncated.
    """

    snippet: str


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
