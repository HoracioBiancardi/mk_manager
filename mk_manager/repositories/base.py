from __future__ import annotations

from abc import ABC, abstractmethod
from mk_manager.domain.entities import FileRecord

class AbstractFileRepository(ABC):
    @abstractmethod
    def list_all(self, include_archived: bool = False) -> list[FileRecord]: ...

    @abstractmethod
    def list_archived(self) -> list[FileRecord]: ...

    @abstractmethod
    def get_by_id(self, file_id: str) -> FileRecord: ...

    @abstractmethod
    def create(
        self,
        *,
        file_id: str,
        title: str,
        file_type: str,
        tags: list[str],
        content: str,
        created: str,
        modified: str,
        folder: str = "",
        status: str = "",
        status_changed_at: str = "",
        due_date: str = "",
    ) -> FileRecord: ...

    @abstractmethod
    def update(
        self,
        file_id: str,
        *,
        title: str | None,
        tags: list[str] | None,
        content: str | None,
        modified: str,
        folder: str | None = None,
        status: str | None = None,
        status_changed_at: str | None = None,
        due_date: str | None = None,
    ) -> FileRecord: ...

    @abstractmethod
    def delete(self, file_id: str) -> None: ...

    @abstractmethod
    def archive(self, file_id: str) -> FileRecord: ...

    @abstractmethod
    def unarchive(self, file_id: str) -> FileRecord: ...

    @abstractmethod
    def list_trash(self) -> list[FileRecord]: ...

    @abstractmethod
    def trash(self, file_id: str) -> FileRecord: ...

    @abstractmethod
    def untrash(self, file_id: str) -> FileRecord: ...

    @abstractmethod
    def purge_trash(self, file_id: str | None = None) -> None: ...

    @abstractmethod
    def count_by_type(self) -> dict[str, int]: ...

    @abstractmethod
    def total_size_bytes(self) -> int: ...

    @abstractmethod
    def list_folders(self) -> list[str]: ...

    @abstractmethod
    def create_folder(self, folder: str) -> None: ...

    @abstractmethod
    def move_folder(self, old_folder: str, new_folder: str) -> None: ...
