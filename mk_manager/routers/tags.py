from fastapi import APIRouter, Depends
from mk_manager.dependencies import get_file_service
from mk_manager.models.schemas import TagRenameRequest, TagRenameResponse
from mk_manager.services.file_service import FileService

router = APIRouter(prefix="/api/tags", tags=["tags"])

@router.get("/")
def list_tags(service: FileService = Depends(get_file_service)) -> list[dict]:
    tag_counts: dict[str, int] = {}
    for record in service.list_files():
        for tag in record.tags:
            tag_counts[tag] = tag_counts.get(tag, 0) + 1
    return [{"name": name, "count": count} for name, count in sorted(tag_counts.items())]

@router.put("/{old_tag:path}", response_model=TagRenameResponse)
def rename_tag(
    old_tag: str,
    body: TagRenameRequest,
    service: FileService = Depends(get_file_service),
) -> TagRenameResponse:
    count = service.rename_tag(old_tag, body.new_tag)
    return TagRenameResponse(updated_count=count)
