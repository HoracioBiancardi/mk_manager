"""HTTP route for storage statistics."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from mk_manager.dependencies import get_file_service
from mk_manager.models.schemas import StatsResponse
from mk_manager.services.file_service import FileService

router = APIRouter(prefix="/api", tags=["stats"])


@router.get(
    "/stats",
    response_model=StatsResponse,
    summary="Storage statistics",
    description="Returns the total number of files, counts by type, and storage used.",
)
def get_stats(
    service: FileService = Depends(get_file_service),
) -> StatsResponse:
    """Return aggregated statistics about the notes directory.

    Args:
        service: Injected ``FileService`` instance.

    Returns:
        ``StatsResponse`` with file counts and total storage size in bytes.
    """
    return service.get_stats()
