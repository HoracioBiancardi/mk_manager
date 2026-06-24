"""Abstract repository interface for file storage.

Defines the contract (Interface Segregation + Dependency Inversion) that all
concrete storage backends must fulfil. The service layer depends only on this
abstraction, making it trivial to swap the backing store (filesystem → SQLite,
cloud storage, etc.) without touching business logic.
"""

from __future__ import annotations

from abc import ABC, abstractmethod

from mk_manager.domain.entities import FileRecord


class AbstractFileRepository(ABC):
    """Contract for all file-storage backends.

    Every method that raises ``FileNotFoundError`` must do so when the
    given ``file_id`` does not exist in the backing store, regardless of
    the concrete implementation used.
    """

    @abstractmethod
    def list_all(self) -> list[FileRecord]:
        """Return all stored file records, newest-modified first.

        Returns:
            Ordered list of ``FileRecord`` objects (no content body required,
            but implementations may include it for simplicity).
        """
        ...

    @abstractmethod
    def get_by_id(self, file_id: str) -> FileRecord:
        """Fetch a single record by its unique identifier.

        Args:
            file_id: The file's unique identifier (filename stem).

        Returns:
            The corresponding ``FileRecord`` with full content.

        Raises:
            FileNotFoundError: If no file with ``file_id`` exists.
        """
        ...

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
    ) -> FileRecord:
        """Persist a new file record.

        Args:
            file_id: Unique identifier for the new file.
            title: Human-readable title.
            file_type: Semantic type string (``"note"`` or ``"task"``).
            tags: List of tag strings.
            content: Markdown body content.
            created: ISO 8601 UTC creation timestamp.
            modified: ISO 8601 UTC modification timestamp.

        Returns:
            The persisted ``FileRecord``.
        """
        ...

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
    ) -> FileRecord:
        """Apply a partial update to an existing file record.

        Only fields with non-``None`` values are written; others are
        preserved from the current stored state.

        Args:
            file_id: Identifier of the file to update.
            title: New title, or ``None`` to keep the current value.
            tags: New tag list, or ``None`` to keep the current value.
            content: New content, or ``None`` to keep the current value.
            modified: ISO 8601 UTC timestamp for this modification.

        Returns:
            The updated ``FileRecord``.

        Raises:
            FileNotFoundError: If no file with ``file_id`` exists.
        """
        ...

    @abstractmethod
    def delete(self, file_id: str) -> None:
        """Permanently remove a file record from the store.

        Args:
            file_id: Identifier of the file to delete.

        Raises:
            FileNotFoundError: If no file with ``file_id`` exists.
        """
        ...

    @abstractmethod
    def count_by_type(self) -> dict[str, int]:
        """Aggregate file counts grouped by type field.

        Returns:
            Mapping of ``type`` string to file count,
            e.g. ``{"note": 5, "task": 3}``.
        """
        ...

    @abstractmethod
    def total_size_bytes(self) -> int:
        """Compute total storage consumed by all files.

        Returns:
            Sum of file sizes in bytes.
        """
        ...
