from __future__ import annotations
from typing import Annotated
from fastapi import APIRouter, Depends, Query
from mk_manager.dependencies import get_file_service
from mk_manager.models.schemas import SearchResultResponse
from mk_manager.routers.files import _to_meta
from mk_manager.services.file_service import FileService

router = APIRouter(prefix="/api/search", tags=["search"])

@router.get("/", response_model=list[SearchResultResponse])
def search_files(
    q: Annotated[str, Query(description="Search term")] = "",
    type: Annotated[str | None, Query(description="Filter by type")] = None,
    tag: Annotated[list[str] | None, Query(description="Filter by tag")] = None,
    include_archived: Annotated[bool, Query()] = False,
    service: FileService = Depends(get_file_service),
) -> list[SearchResultResponse]:
    results = service.search_files(
        query=q, type_filter=type, tag_filter=tag, include_archived=include_archived
    )
    return [
        SearchResultResponse(**_to_meta(r.record).model_dump(), snippet=r.snippet)
        for r in results
    ]
