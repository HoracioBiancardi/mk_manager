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
    def list_all(self, include_archived: bool = False) -> list[FileRecord]:
        """Return all stored file records, newest-modified first.

        Args:
            include_archived: When ``False`` (default), archived files are
                excluded — implementations should skip scanning the archive
                entirely rather than filtering results after the fact, so
                that a large archive doesn't slow down every normal listing.

        Returns:
            Ordered list of ``FileRecord`` objects (no content body required,
            but implementations may include it for simplicity).
        """
        ...

    @abstractmethod
    def list_archived(self) -> list[FileRecord]:
        """Return only archived file records, newest-modified first.

        Returns:
            Ordered list of archived ``FileRecord`` objects.
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
        status_changed_at: str = "",
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
        status_changed_at: str | None = None,
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
    def archive(self, file_id: str) -> FileRecord:
        """Move a file out of default listings, remembering its origin.

        Implementations decide how "archived" is represented in storage
        (e.g. a reserved folder for a filesystem backend); callers should
        not assume anything about *how*, only that the file stops appearing
        in ``list_all()`` (with ``include_archived=False``) and starts
        appearing in ``list_archived()`` until ``unarchive`` is called.

        Args:
            file_id: Identifier of the file to archive.

        Returns:
            The updated ``FileRecord``.

        Raises:
            FileNotFoundError: If no file with *file_id* exists.
        """
        ...

    @abstractmethod
    def unarchive(self, file_id: str) -> FileRecord:
        """Restore a previously archived file to where it was before.

        Args:
            file_id: Identifier of the file to restore.

        Returns:
            The updated ``FileRecord``.

        Raises:
            FileNotFoundError: If no file with *file_id* exists.
        """
        ...

    @abstractmethod
    def list_trash(self) -> list[FileRecord]:
        """Return only trashed file records, newest-modified first.

        Returns:
            Ordered list of trashed ``FileRecord`` objects.
        """
        ...

    @abstractmethod
    def trash(self, file_id: str) -> FileRecord:
        """Soft-delete a file by moving it to the trash folder.

        Args:
            file_id: Identifier of the file to move to trash.

        Returns:
            The updated ``FileRecord``.

        Raises:
            FileNotFoundError: If no file with *file_id* exists.
        """
        ...

    @abstractmethod
    def untrash(self, file_id: str) -> FileRecord:
        """Restore a trashed file to its original location.

        Args:
            file_id: Identifier of the file to restore.

        Returns:
            The updated ``FileRecord``.

        Raises:
            FileNotFoundError: If no file with *file_id* exists.
        """
        ...

    @abstractmethod
    def purge_trash(self, file_id: str | None = None) -> None:
        """Permanently delete a file from trash, or purge all trashed files.

        Args:
            file_id: Identifier of the file to purge, or ``None`` to purge all.
        """
        ...

    @abstractmethod
    def count_by_type(self) -> dict[str, int]:
        """Aggregate file counts grouped by type field, including archived files.

        Returns:
            Mapping of ``type`` string to file count,
            e.g. ``{"note": 5, "task": 3}``.
        """
        ...

    @abstractmethod
    def total_size_bytes(self) -> int:
        """Compute total storage consumed by all files, including archived ones.

        Returns:
            Sum of file sizes in bytes.
        """
        ...

    @abstractmethod
    def list_folders(self) -> list[str]:
        """Return every known folder path, including folders with no files.

        Unlike deriving folders purely from file records, this reports
        folders that exist but are currently empty. Implementations without
        an independent concept of "empty folder" may return only folders
        derived from existing records.

        Returns:
            Sorted list of folder paths (no leading/trailing slashes).
        """
        ...

    @abstractmethod
    def create_folder(self, folder: str) -> None:
        """Ensure *folder* exists, even before any file is filed into it.

        Idempotent — calling this for a folder that already exists (because
        it already has files, or was already created) is a no-op.

        Args:
            folder: Folder path to create (with or without nesting).

        Raises:
            ValueError: If *folder* is empty, malformed, or a reserved name.
        """
        ...

    @abstractmethod
    def move_folder(self, old_folder: str, new_folder: str) -> None:
        """Relocate whatever empty remnants of *old_folder* remain to *new_folder*.

        Callers first move every file individually (each file's own
        relocation already handles its immediate containing folder); this
        covers what's left over — nested empty subfolders that no file
        pointed at — so a rename/delete doesn't leave orphaned empty
        directories behind. Safe no-op if *old_folder* has nothing left.

        Args:
            old_folder: Folder path moved from.
            new_folder: Destination folder path (``""`` for the root).
        """
        ...
