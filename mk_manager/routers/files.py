"""HTTP routes for file CRUD operations.

Each handler is deliberately thin: it validates input via Pydantic (automatic),
delegates all logic to ``FileService``, maps ``FileNotFoundError`` to HTTP 404,
and returns a typed response schema.  No business logic lives here.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status

from mk_manager.dependencies import get_file_service
from mk_manager.domain.entities import FileRecord
from mk_manager.models.schemas import (
    FileCreateRequest,
    FileDetailResponse,
    FileMetaResponse,
    FileUpdateRequest,
    FolderChangeResponse,
    FolderRenameRequest,
)
from mk_manager.services.file_service import FileService, extract_inline_tags

router = APIRouter(prefix="/api/files", tags=["files"])


# ── Mapping helpers ────────────────────────────────────────────────────────


def _to_meta(record: FileRecord) -> FileMetaResponse:
    """Convert a ``FileRecord`` to a metadata-only response (no content).

    ``tags`` here is the *browsing* view: frontmatter tags plus any inline
    ``#tag`` references found in the body, merged for the sidebar/tags panel.
    This is deliberately NOT reused for the edit view (see ``_to_detail``) —
    round-tripping the merged set through a save would silently promote
    inline tags into frontmatter.

    Args:
        record: Domain entity to convert.

    Returns:
        ``FileMetaResponse`` populated from the record's fields.
    """
    inline_tags = [t for t in extract_inline_tags(record.content) if t not in record.tags]
    return FileMetaResponse(
        id=record.id,
        title=record.title,
        type=record.type,
        tags=record.tags + inline_tags,
        filename=record.filename,
        created=record.created,
        modified=record.modified,
        word_count=record.word_count,
        task_total=record.task_total,
        task_done=record.task_done,
        task_items=record.task_items,
        folder=record.folder,
        status=record.status,
        date_planning=record.date_planning,
        date_execution=record.date_execution,
        date_conclusion=record.date_conclusion,
    )


def _to_detail(record: FileRecord) -> FileDetailResponse:
    """Convert a ``FileRecord`` to a full detail response including content.

    ``tags`` here is the raw frontmatter list only (no inline tags merged
    in) — this feeds the editable tag-chip UI, and a save round-trips
    whatever it holds straight back into frontmatter.

    Args:
        record: Domain entity to convert.

    Returns:
        ``FileDetailResponse`` with all metadata fields plus ``content``.
    """
    return FileDetailResponse(
        id=record.id,
        title=record.title,
        type=record.type,
        tags=record.tags,
        filename=record.filename,
        created=record.created,
        modified=record.modified,
        word_count=record.word_count,
        task_total=record.task_total,
        task_done=record.task_done,
        task_items=record.task_items,
        folder=record.folder,
        status=record.status,
        date_planning=record.date_planning,
        date_execution=record.date_execution,
        date_conclusion=record.date_conclusion,
        content=record.content,
    )


# ── Route handlers ─────────────────────────────────────────────────────────


@router.get(
    "/",
    response_model=list[FileMetaResponse],
    summary="List all files",
    description="Return metadata for every stored file, ordered newest-modified first.",
)
def list_files(
    type: Annotated[
        str | None,
        Query(description="Filter by type: 'note' or 'task'"),
    ] = None,
    service: FileService = Depends(get_file_service),
) -> list[FileMetaResponse]:
    """Return metadata for all files, optionally filtered by type.

    Args:
        type: Optional type filter. Accepted values: ``"note"``, ``"task"``.
        service: Injected ``FileService`` instance.

    Returns:
        List of ``FileMetaResponse`` objects (content body excluded).
    """
    return [_to_meta(r) for r in service.list_files(type_filter=type)]


@router.post(
    "/",
    response_model=FileDetailResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new file",
)
def create_file(
    body: FileCreateRequest,
    service: FileService = Depends(get_file_service),
) -> FileDetailResponse:
    """Create and persist a new markdown file.

    Args:
        body: Validated file creation data.
        service: Injected ``FileService`` instance.

    Returns:
        Full detail of the newly created file.
    """
    return _to_detail(service.create_file(body))


@router.put(
    "/folder",
    response_model=FolderChangeResponse,
    summary="Rename/move a folder (and everything nested under it)",
)
def rename_folder(
    body: FolderRenameRequest,
    service: FileService = Depends(get_file_service),
) -> FolderChangeResponse:
    """Move every file under ``old_path`` to ``new_path``, preserving nesting.

    Args:
        body: Source and destination folder paths.
        service: Injected ``FileService`` instance.

    Returns:
        Count of files relocated.
    """
    count = service.rename_folder(body.old_path, body.new_path)
    return FolderChangeResponse(updated_count=count)


@router.delete(
    "/folder",
    response_model=FolderChangeResponse,
    summary="Delete a folder by moving its contents to the parent folder",
)
def delete_folder(
    path: Annotated[str, Query(description="Folder path to remove")],
    service: FileService = Depends(get_file_service),
) -> FolderChangeResponse:
    """Relocate every file under ``path`` to its parent folder, then drop it.

    Never destroys file content — there's no undo yet, so "deleting" a
    folder only ever moves its contents up one level.

    Args:
        path: Folder path to remove.
        service: Injected ``FileService`` instance.

    Returns:
        Count of files relocated.
    """
    count = service.delete_folder(path)
    return FolderChangeResponse(updated_count=count)


@router.get(
    "/{file_id}",
    response_model=FileDetailResponse,
    summary="Get a file by ID",
)
def get_file(
    file_id: str,
    service: FileService = Depends(get_file_service),
) -> FileDetailResponse:
    """Retrieve a single file including its full markdown content.

    Args:
        file_id: Unique file identifier (filename stem).
        service: Injected ``FileService`` instance.

    Returns:
        Full file detail.

    Raises:
        HTTPException: 404 if no file with *file_id* exists.
    """
    try:
        return _to_detail(service.get_file(file_id))
    except FileNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"File '{file_id}' not found.",
        )


@router.put(
    "/{file_id}",
    response_model=FileDetailResponse,
    summary="Update a file (partial)",
)
def update_file(
    file_id: str,
    body: FileUpdateRequest,
    service: FileService = Depends(get_file_service),
) -> FileDetailResponse:
    """Partially update an existing file.

    Only fields explicitly provided in *body* are written; ``null`` fields
    are left at their current values.

    Args:
        file_id: Unique file identifier.
        body: Fields to update. ``null`` fields are preserved.
        service: Injected ``FileService`` instance.

    Returns:
        Updated full file detail.

    Raises:
        HTTPException: 404 if no file with *file_id* exists.
    """
    try:
        return _to_detail(service.update_file(file_id, body))
    except FileNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"File '{file_id}' not found.",
        )


@router.delete(
    "/{file_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a file",
)
def delete_file(
    file_id: str,
    service: FileService = Depends(get_file_service),
) -> None:
    """Permanently delete a markdown file from disk.

    Args:
        file_id: Unique file identifier.
        service: Injected ``FileService`` instance.

    Raises:
        HTTPException: 404 if no file with *file_id* exists.
    """
    try:
        service.delete_file(file_id)
    except FileNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"File '{file_id}' not found.",
        )
