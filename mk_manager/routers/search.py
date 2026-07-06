"""HTTP route for full-text search across all files."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query

from mk_manager.dependencies import get_file_service
from mk_manager.domain.entities import SearchResult
from mk_manager.models.schemas import FileMetaResponse, SearchResultResponse
from mk_manager.services.file_service import FileService

router = APIRouter(prefix="/api/search", tags=["search"])


def _to_search_response(result: SearchResult) -> SearchResultResponse:
    """Map a domain ``SearchResult`` to its API response schema.

    Args:
        result: Domain search result containing the record and snippet.

    Returns:
        ``SearchResultResponse`` ready for JSON serialisation.
    """
    record = result.record
    return SearchResultResponse(
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
        snippet=result.snippet,
    )


@router.get(
    "/",
    response_model=list[SearchResultResponse],
    summary="Search files",
    description=(
        "Full-text search across title, tags, and content. "
        "An empty query returns all files ordered by modification date."
    ),
)
def search_files(
    q: Annotated[str, Query(description="Search term (case-insensitive)")] = "",
    type: Annotated[
        str | None,
        Query(description="Restrict results to 'note' or 'task'"),
    ] = None,
    tag: Annotated[
        list[str] | None,
        Query(description="Filter by exact tag value(s); repeat for AND match"),
    ] = None,
    service: FileService = Depends(get_file_service),
) -> list[SearchResultResponse]:
    results = service.search_files(query=q, type_filter=type, tag_filter=tag)
    return [_to_search_response(r) for r in results]
