"""HTTP routes for reading and updating application settings.

Exposes the notes directory and the (optionally independent) assets
directory, both of which can be changed at runtime without restarting the
server: the change is applied immediately (cached repository is rebuilt
against the new notes path) and persisted to ``.env`` so it survives the
next restart too.
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
_ASSETS_DIR_KEY = "MK_ASSETS_DIR"


def _persist_env(key: str, value: str | None) -> None:
    """Write, update, or remove *key* in ``.env`` so a restart keeps the value.

    Removes the line entirely when *value* is ``None`` (used to reset
    ``assets_dir`` back to its default, derived from ``notes_dir``).
    """
    lines = _ENV_FILE.read_text("utf-8").splitlines() if _ENV_FILE.exists() else []
    lines = [line for line in lines if not line.startswith(f"{key}=")]
    if value is not None:
        lines.append(f"{key}={value}")
    _ENV_FILE.write_text("\n".join(lines) + "\n", "utf-8")


@router.get(
    "/",
    response_model=SettingsResponse,
    summary="Read current settings",
)
def read_settings() -> SettingsResponse:
    """Return the notes/assets directories and server bind address in use."""
    settings = get_settings()
    return SettingsResponse(
        notes_dir=str(settings.notes_dir.resolve()),
        assets_dir=str(settings.resolved_assets_dir().resolve()),
        assets_dir_is_default=settings.assets_dir is None,
        host=settings.host,
        port=settings.port,
    )


@router.put(
    "/",
    response_model=SettingsResponse,
    summary="Change the notes and/or assets directory",
)
def update_settings(body: SettingsUpdateRequest) -> SettingsResponse:
    """Point the app at a new notes directory and/or assets directory.

    Both changes are effective immediately (no restart needed).

    Args:
        body: New notes directory path (created if missing), and optionally
            a new assets directory path (empty string resets it to the
            default ``{notes_dir}/assets``; ``None``/omitted leaves it as-is).

    Returns:
        ``SettingsResponse`` reflecting the applied change.

    Raises:
        HTTPException: 400 if a given path can't be created/used as a
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
    _persist_env(_NOTES_DIR_KEY, str(new_dir))

    if body.assets_dir is not None:
        stripped = body.assets_dir.strip()
        if stripped:
            new_assets_dir = Path(stripped).expanduser()
            try:
                new_assets_dir.mkdir(parents=True, exist_ok=True)
            except OSError as exc:
                raise HTTPException(
                    status.HTTP_400_BAD_REQUEST,
                    f"Não foi possível usar essa pasta de assets: {exc}",
                ) from None
            settings.assets_dir = new_assets_dir
            _persist_env(_ASSETS_DIR_KEY, str(new_assets_dir))
        else:
            settings.assets_dir = None
            _persist_env(_ASSETS_DIR_KEY, None)

    return SettingsResponse(
        notes_dir=str(new_dir.resolve()),
        assets_dir=str(settings.resolved_assets_dir().resolve()),
        assets_dir_is_default=settings.assets_dir is None,
        host=settings.host,
        port=settings.port,
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
