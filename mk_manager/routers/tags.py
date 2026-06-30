"""HTTP route for tag-wide operations (rename/merge across all files)."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from mk_manager.dependencies import get_file_service
from mk_manager.models.schemas import TagRenameRequest, TagRenameResponse
from mk_manager.services.file_service import FileService

router = APIRouter(prefix="/api/tags", tags=["tags"])


@router.put(
    "/{old_tag}",
    response_model=TagRenameResponse,
    summary="Rename or merge a tag across every file",
)
def rename_tag(
    old_tag: str,
    body: TagRenameRequest,
    service: FileService = Depends(get_file_service),
) -> TagRenameResponse:
    """Rename *old_tag* to ``body.new_tag`` on every file that has it.

    If a file already has the new tag, the old one is merged away instead
    of creating a duplicate entry.

    Args:
        old_tag: Existing tag value to replace.
        body: Contains the replacement tag value.
        service: Injected ``FileService`` instance.

    Returns:
        Count of files that were updated.
    """
    count = service.rename_tag(old_tag, body.new_tag.strip())
    return TagRenameResponse(updated_count=count)
