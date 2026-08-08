from fastapi import APIRouter, Depends
from mk_manager.dependencies import get_file_service
from mk_manager.models.schemas import GraphResponse
from mk_manager.services.file_service import FileService

router = APIRouter(prefix="/api/graph", tags=["graph"])

@router.get("/", response_model=GraphResponse)
def get_graph(service: FileService = Depends(get_file_service)) -> GraphResponse:
    return service.build_graph()
