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

from mk_manager.config import get_settings
from mk_manager.repositories.markdown import MarkdownFileRepository
from mk_manager.services.file_service import FileService


def get_file_service() -> FileService:
    """Construct and return a ``FileService`` wired to the configured repository.

    Called by FastAPI's dependency injection system on each request.
    Construction is lightweight (no I/O at instantiation time) so no
    per-request caching is needed.

    Returns:
        ``FileService`` backed by a ``MarkdownFileRepository`` pointing to
        the directory defined in ``Settings.notes_dir``.
    """
    settings = get_settings()
    repository = MarkdownFileRepository(settings.notes_dir)
    return FileService(repository)
