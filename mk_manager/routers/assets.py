"""HTTP route for uploading asset files (images, PDFs, etc.) linked in markdown."""

from __future__ import annotations

import shutil
from pathlib import Path

from fastapi import APIRouter, UploadFile, status

from mk_manager.config import get_settings

router = APIRouter(prefix="/api/assets", tags=["assets"])


@router.post("/", status_code=status.HTTP_201_CREATED)
async def upload_asset(file: UploadFile) -> dict[str, str]:
    """Upload a file to the assets directory and return its public URL.

    Files are saved to ``{notes_dir}/assets/``.  If a file with the same
    name already exists, a numeric suffix is appended to avoid collision.

    Args:
        file: The uploaded file (multipart/form-data).

    Returns:
        ``{"url": "/assets/<name>", "filename": "<name>"}``
    """
    settings = get_settings()
    assets_dir = settings.notes_dir / "assets"
    assets_dir.mkdir(parents=True, exist_ok=True)

    # Sanitise: take only the basename to prevent path traversal
    original_name = Path(file.filename or "unnamed").name
    dest = assets_dir / original_name

    # Deduplicate filename
    if dest.exists():
        stem = Path(original_name).stem
        suffix = Path(original_name).suffix
        counter = 1
        while dest.exists():
            dest = assets_dir / f"{stem}_{counter}{suffix}"
            counter += 1

    with dest.open("wb") as fp:
        shutil.copyfileobj(file.file, fp)

    return {"url": f"/assets/{dest.name}", "filename": dest.name}
