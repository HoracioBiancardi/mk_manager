from fastapi import APIRouter, Depends
from mk_manager.dependencies import get_file_service
from mk_manager.models.schemas import StatsResponse
from mk_manager.services.file_service import FileService

router = APIRouter(prefix="/api/stats", tags=["stats"])

@router.get("/", response_model=StatsResponse)
def get_stats(service: FileService = Depends(get_file_service)) -> StatsResponse:
    return service.get_stats()
