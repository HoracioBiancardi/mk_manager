"""HTTP route for the notes graph (built from [[wikilink]] references)."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from mk_manager.dependencies import get_file_service
from mk_manager.models.schemas import GraphResponse
from mk_manager.services.file_service import FileService

router = APIRouter(prefix="/api/graph", tags=["graph"])


@router.get(
    "/",
    response_model=GraphResponse,
    summary="Get the notes graph",
    description=(
        "Nodes = every file, plus a phantom node per unresolved [[link]] target. "
        "Edges = one per unique resolved link between two notes."
    ),
)
def get_graph(service: FileService = Depends(get_file_service)) -> GraphResponse:
    """Build and return the notes graph.

    Args:
        service: Injected file service.

    Returns:
        The graph's nodes (files + phantom link targets) and edges.
    """
    return service.build_graph()
