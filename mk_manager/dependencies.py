"""FastAPI dependency providers for service and repository injection.

Centralising dependency creation here keeps router handlers free of
construction logic and makes it trivial to swap implementations in tests
(just override ``get_file_service`` with ``app.dependency_overrides``).

Example:
    Override in tests::

        from mk_manager.dependencies import get_file_service
        from unittest.mock import MagicMock

        app.dependency_overrides[get_file_service] = lambda: MagicMock()
"""

from __future__ import annotations

from functools import lru_cache

from mk_manager.config import get_settings
from mk_manager.repositories.markdown import MarkdownFileRepository
from mk_manager.services.file_service import FileService


@lru_cache
def _get_repository() -> MarkdownFileRepository:
    """Return the process-wide ``MarkdownFileRepository`` singleton.

    Cached so the repository (and its in-memory parse cache) survives across
    requests instead of being rebuilt — and re-scanning the whole notes tree
    for migration — on every single call.
    """
    settings = get_settings()
    return MarkdownFileRepository(settings.notes_dir)


def get_file_service() -> FileService:
    """Construct and return a ``FileService`` wired to the shared repository.

    Called by FastAPI's dependency injection system on each request.

    Returns:
        ``FileService`` backed by the singleton ``MarkdownFileRepository``
        pointing to the directory defined in ``Settings.notes_dir``.
    """
    return FileService(_get_repository())
