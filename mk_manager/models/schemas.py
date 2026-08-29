from __future__ import annotations
from typing import Literal
from pydantic import BaseModel, Field, field_validator

class FileMetaResponse(BaseModel):
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
    status_changed_at: str = ""
    archived_from: str = ""
    trashed_from: str = ""
    due_date: str = ""

    model_config = {"from_attributes": True}

class FileDetailResponse(FileMetaResponse):
    content: str

class FileCreateRequest(BaseModel):
    title: str = Field(default="", description="File title", max_length=500)
    type: Literal["note", "task"] = Field(default="note", description="File type")
    tags: list[str] = Field(default_factory=list, description="List of tags")
    content: str = Field(default="", description="Markdown body content", max_length=5_000_000)
    folder: str = Field(default="", description="Folder path", max_length=1000)
    status: str = Field(default="", description="Kanban status", max_length=100)
    status_changed_at: str = Field(default="", description="Timestamp of status change", max_length=100)
    due_date: str = Field(default="", description="Due date YYYY-MM-DD", max_length=100)

    @field_validator("tags")
    @classmethod
    def _validate_tags(cls, value: list[str]) -> list[str]:
        for tag in value:
            if len(tag) > 100:
                raise ValueError("Each tag must be at most 100 characters long.")
        return value

class FileUpdateRequest(BaseModel):
    title: str | None = Field(default=None, max_length=500)
    tags: list[str] | None = Field(default=None)
    content: str | None = Field(default=None, max_length=5_000_000)
    folder: str | None = Field(default=None, max_length=1000)
    status: str | None = Field(default=None, max_length=100)
    status_changed_at: str | None = Field(default=None, max_length=100)
    due_date: str | None = Field(default=None, max_length=100)

    @field_validator("tags")
    @classmethod
    def _validate_tags(cls, value: list[str] | None) -> list[str] | None:
        if value is None:
            return value
        for tag in value:
            if len(tag) > 100:
                raise ValueError("Each tag must be at most 100 characters long.")
        return value

class TagRenameRequest(BaseModel):
    new_tag: str = Field(description="New tag value")

class TagRenameResponse(BaseModel):
    updated_count: int

class FolderRenameRequest(BaseModel):
    old_path: str
    new_path: str

class FolderChangeResponse(BaseModel):
    updated_count: int

class FolderCreateRequest(BaseModel):
    path: str

class FolderListResponse(BaseModel):
    folders: list[str]

class ArchiveBatchResponse(BaseModel):
    archived_count: int

class SearchResultResponse(FileMetaResponse):
    snippet: str

class GraphNode(BaseModel):
    id: str
    title: str
    type: str
    tags: list[str]
    folder: str

class GraphEdge(BaseModel):
    source: str
    target: str

class GraphResponse(BaseModel):
    nodes: list[GraphNode]
    edges: list[GraphEdge]

class StatsResponse(BaseModel):
    total: int
    notes: int
    tasks: int
    size_bytes: int

class SettingsResponse(BaseModel):
    notes_dir: str
    assets_dir: str
    assets_dir_is_default: bool
    host: str
    port: int

class SettingsUpdateRequest(BaseModel):
    notes_dir: str
    assets_dir: str | None = None

class DirEntry(BaseModel):
    name: str
    path: str

class BrowseResponse(BaseModel):
    path: str
    parent: str | None
    dirs: list[DirEntry]
