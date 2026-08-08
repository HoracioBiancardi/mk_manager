from __future__ import annotations
from functools import lru_cache
from mk_manager.config import get_settings
from mk_manager.repositories.markdown import MarkdownFileRepository
from mk_manager.services.file_service import FileService

@lru_cache
def _get_repository() -> MarkdownFileRepository:
    settings = get_settings()
    return MarkdownFileRepository(settings.notes_dir)

def get_file_service() -> FileService:
    return FileService(_get_repository())

def reset_repository_cache() -> None:
    _get_repository.cache_clear()
