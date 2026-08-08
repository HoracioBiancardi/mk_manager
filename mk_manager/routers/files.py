from __future__ import annotations
from typing import Annotated
from urllib.parse import unquote
from fastapi import APIRouter, Depends, HTTPException, Query, status
from mk_manager.dependencies import get_file_service
from mk_manager.domain.entities import FileRecord
from mk_manager.models.schemas import (
    ArchiveBatchResponse,
    FileCreateRequest,
    FileDetailResponse,
    FileMetaResponse,
    FileUpdateRequest,
    FolderChangeResponse,
    FolderCreateRequest,
    FolderListResponse,
    FolderRenameRequest,
)
from mk_manager.services.file_service import FileService, extract_inline_tags

router = APIRouter(prefix="/api/files", tags=["files"])

def _to_meta(record: FileRecord) -> FileMetaResponse:
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
        status_changed_at=record.status_changed_at,
        archived_from=record.archived_from,
        trashed_from=record.trashed_from,
        due_date=record.due_date,
    )

def _to_detail(record: FileRecord) -> FileDetailResponse:
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
        status_changed_at=record.status_changed_at,
        archived_from=record.archived_from,
        trashed_from=record.trashed_from,
        due_date=record.due_date,
        content=record.content,
    )

@router.get("/", response_model=list[FileMetaResponse])
def list_files(
    type: Annotated[str | None, Query()] = None,
    include_archived: Annotated[bool, Query()] = False,
    service: FileService = Depends(get_file_service),
) -> list[FileMetaResponse]:
    return [_to_meta(r) for r in service.list_files(type_filter=type, include_archived=include_archived)]

@router.post("/", response_model=FileDetailResponse, status_code=status.HTTP_201_CREATED)
def create_file(
    body: FileCreateRequest,
    service: FileService = Depends(get_file_service),
) -> FileDetailResponse:
    return _to_detail(service.create_file(body))

@router.get("/folders", response_model=FolderListResponse)
def list_folders(service: FileService = Depends(get_file_service)) -> FolderListResponse:
    return FolderListResponse(folders=service.list_folders())

@router.post("/folder", response_model=FolderChangeResponse, status_code=status.HTTP_201_CREATED)
def create_folder(
    body: FolderCreateRequest,
    service: FileService = Depends(get_file_service),
) -> FolderChangeResponse:
    try:
        service.create_folder(body.path)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e
    return FolderChangeResponse(updated_count=0)

@router.put("/folder", response_model=FolderChangeResponse)
def rename_folder(
    body: FolderRenameRequest,
    service: FileService = Depends(get_file_service),
) -> FolderChangeResponse:
    count = service.rename_folder(body.old_path, body.new_path)
    return FolderChangeResponse(updated_count=count)

@router.delete("/folder", response_model=FolderChangeResponse)
def delete_folder(
    path: Annotated[str, Query()],
    service: FileService = Depends(get_file_service),
) -> FolderChangeResponse:
    count = service.delete_folder(path)
    return FolderChangeResponse(updated_count=count)

@router.get("/archived", response_model=list[FileMetaResponse])
def list_archived_files(service: FileService = Depends(get_file_service)) -> list[FileMetaResponse]:
    return [_to_meta(r) for r in service.list_archived_files()]

@router.post("/archive-completed", response_model=ArchiveBatchResponse)
def archive_completed(
    days: Annotated[int, Query(ge=0)] = 30,
    service: FileService = Depends(get_file_service),
) -> ArchiveBatchResponse:
    count = service.archive_completed_before(days)
    return ArchiveBatchResponse(archived_count=count)

@router.get("/trashed", response_model=list[FileMetaResponse])
def list_trashed_files(service: FileService = Depends(get_file_service)) -> list[FileMetaResponse]:
    return [_to_meta(r) for r in service.list_trash_files()]

@router.delete("/trash/purge", status_code=status.HTTP_204_NO_CONTENT)
def purge_all_trash(service: FileService = Depends(get_file_service)) -> None:
    service.purge_trash()

@router.get("/{file_id:path}", response_model=FileDetailResponse)
def get_file(
    file_id: str,
    service: FileService = Depends(get_file_service),
) -> FileDetailResponse:
    try:
        return _to_detail(service.get_file(unquote(file_id)))
    except FileNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"File '{file_id}' not found.")

@router.put("/{file_id:path}", response_model=FileDetailResponse)
def update_file(
    file_id: str,
    body: FileUpdateRequest,
    service: FileService = Depends(get_file_service),
) -> FileDetailResponse:
    try:
        return _to_detail(service.update_file(unquote(file_id), body))
    except FileNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"File '{file_id}' not found.")

@router.delete("/{file_id:path}", status_code=status.HTTP_204_NO_CONTENT)
def delete_file(
    file_id: str,
    service: FileService = Depends(get_file_service),
) -> None:
    try:
        service.delete_file(unquote(file_id))
    except FileNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"File '{file_id}' not found.")

@router.post("/{file_id:path}/archive", response_model=FileMetaResponse)
def archive_file(
    file_id: str,
    service: FileService = Depends(get_file_service),
) -> FileMetaResponse:
    try:
        return _to_meta(service.archive_file(unquote(file_id)))
    except FileNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"File '{file_id}' not found.")

@router.post("/{file_id:path}/unarchive", response_model=FileMetaResponse)
def unarchive_file(
    file_id: str,
    service: FileService = Depends(get_file_service),
) -> FileMetaResponse:
    try:
        return _to_meta(service.unarchive_file(unquote(file_id)))
    except FileNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"File '{file_id}' not found.")

@router.post("/{file_id:path}/untrash", response_model=FileMetaResponse)
def untrash_file(
    file_id: str,
    service: FileService = Depends(get_file_service),
) -> FileMetaResponse:
    try:
        return _to_meta(service.untrash_file(unquote(file_id)))
    except FileNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"File '{file_id}' not found in trash.")

@router.delete("/{file_id:path}/purge", status_code=status.HTTP_204_NO_CONTENT)
def purge_file(
    file_id: str,
    service: FileService = Depends(get_file_service),
) -> None:
    service.purge_trash(unquote(file_id))
