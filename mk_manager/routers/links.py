from urllib.parse import unquote

from fastapi import APIRouter, Depends, HTTPException, status

from mk_manager.dependencies import get_file_service
from mk_manager.models.schemas import LinksResponse
from mk_manager.services.file_service import FileService

router = APIRouter(prefix="/api/links", tags=["links"])

@router.get("/{file_id:path}", response_model=LinksResponse)
def get_links(file_id: str, service: FileService = Depends(get_file_service)) -> LinksResponse:
    try:
        return service.get_links(unquote(file_id))
    except FileNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"File '{file_id}' not found.")
