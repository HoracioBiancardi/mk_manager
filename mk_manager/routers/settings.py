"""HTTP routes for reading and updating application settings.

Currently exposes the notes directory, which can be changed at runtime
without restarting the server: the change is applied immediately (cached
repository is rebuilt against the new path) and persisted to ``.env`` so it
survives the next restart too.
"""

from __future__ import annotations

import io
import zipfile
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import StreamingResponse

from mk_manager.config import get_settings
from mk_manager.dependencies import reset_repository_cache
from mk_manager.models.schemas import (
    BrowseResponse,
    DirEntry,
    SettingsResponse,
    SettingsUpdateRequest,
)

router = APIRouter(prefix="/api/settings", tags=["settings"])

_ENV_FILE = Path(".env")
_NOTES_DIR_KEY = "MK_NOTES_DIR"


def _persist_notes_dir(path: Path) -> None:
    """Write or update ``MK_NOTES_DIR`` in ``.env`` so a restart keeps *path*."""
    lines = _ENV_FILE.read_text("utf-8").splitlines() if _ENV_FILE.exists() else []
    for i, line in enumerate(lines):
        if line.startswith(f"{_NOTES_DIR_KEY}="):
            lines[i] = f"{_NOTES_DIR_KEY}={path}"
            break
    else:
        lines.append(f"{_NOTES_DIR_KEY}={path}")
    _ENV_FILE.write_text("\n".join(lines) + "\n", "utf-8")


@router.get(
    "/",
    response_model=SettingsResponse,
    summary="Read current settings",
)
def read_settings() -> SettingsResponse:
    """Return the notes directory and server bind address currently in use."""
    settings = get_settings()
    return SettingsResponse(
        notes_dir=str(settings.notes_dir.resolve()),
        host=settings.host,
        port=settings.port,
    )


@router.put(
    "/",
    response_model=SettingsResponse,
    summary="Change the notes directory",
)
def update_settings(body: SettingsUpdateRequest) -> SettingsResponse:
    """Point the app at a new notes directory, effective immediately.

    Args:
        body: New notes directory path (created if missing).

    Returns:
        ``SettingsResponse`` reflecting the applied change.

    Raises:
        HTTPException: 400 if *body.notes_dir* can't be created/used as a
            directory.
    """
    new_dir = Path(body.notes_dir).expanduser()
    try:
        new_dir.mkdir(parents=True, exist_ok=True)
    except OSError as exc:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Não foi possível usar essa pasta: {exc}",
        ) from None

    settings = get_settings()
    settings.notes_dir = new_dir
    reset_repository_cache()
    _persist_notes_dir(new_dir)

    return SettingsResponse(
        notes_dir=str(new_dir.resolve()), host=settings.host, port=settings.port
    )


@router.get(
    "/browse",
    response_model=BrowseResponse,
    summary="List subdirectories of a path (notes-folder picker)",
)
def browse(
    path: str | None = Query(None, description="Absolute path to list; defaults to the current notes_dir's parent"),
) -> BrowseResponse:
    """List immediate subdirectories of *path* for the folder-picker UI.

    Falls back to the current notes directory's parent when *path* is
    omitted, and to the user's home directory if that fallback doesn't
    resolve to a valid, readable directory.
    """
    if path:
        target = Path(path).expanduser()
    else:
        target = get_settings().notes_dir.resolve().parent

    if not target.is_dir():
        target = Path.home()

    dirs: list[DirEntry] = []
    try:
        entries = sorted(target.iterdir(), key=lambda p: p.name.lower())
    except PermissionError:
        entries = []
    for entry in entries:
        if entry.is_dir() and not entry.name.startswith("."):
            dirs.append(DirEntry(name=entry.name, path=str(entry)))

    parent = str(target.parent) if target.parent != target else None
    return BrowseResponse(path=str(target), parent=parent, dirs=dirs)


@router.get(
    "/backup",
    summary="Download a .zip backup of the notes directory",
)
def download_backup() -> StreamingResponse:
    """Stream every file under the notes directory as a single .zip archive."""
    notes_dir = get_settings().notes_dir
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        for path in notes_dir.rglob("*"):
            if path.is_file():
                zf.write(path, path.relative_to(notes_dir))
    buffer.seek(0)

    filename = f"mk-manager-backup-{datetime.now():%Y%m%d-%H%M%S}.zip"
    return StreamingResponse(
        buffer,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
