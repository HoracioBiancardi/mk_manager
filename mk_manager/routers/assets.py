"""HTTP route for uploading asset files (images, PDFs, etc.) linked in markdown."""

from __future__ import annotations

import shutil
from pathlib import Path

from fastapi import APIRouter, Form, HTTPException, UploadFile, status

from mk_manager.config import get_settings

router = APIRouter(prefix="/api/assets", tags=["assets"])


@router.post("/", status_code=status.HTTP_201_CREATED)
async def upload_asset(
    file: UploadFile,
    folder: str = Form(""),
) -> dict[str, str]:
    """Upload a file to a note's folder or notes root and return its public URL.

    Args:
        file: The uploaded file (multipart/form-data).
        folder: Optional target folder path (relative to notes_dir).

    Returns:
        ``{"url": "/assets/<path>", "filename": "<name>", "folder": "<folder>"}``
    """
    settings = get_settings()
    clean_folder = folder.strip("/")
    if ".." in Path(clean_folder).parts:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid folder path")

    target_dir = settings.notes_dir / clean_folder if clean_folder else settings.notes_dir
    target_dir.mkdir(parents=True, exist_ok=True)

    # Sanitise: take only the basename to prevent path traversal
    original_name = Path(file.filename or "unnamed").name
    dest = target_dir / original_name

    # Deduplicate filename
    if dest.exists():
        stem = Path(original_name).stem
        suffix = Path(original_name).suffix
        counter = 1
        while dest.exists():
            dest = target_dir / f"{stem}_{counter}{suffix}"
            counter += 1

    with dest.open("wb") as fp:
        shutil.copyfileobj(file.file, fp)

    rel_path = f"{clean_folder}/{dest.name}" if clean_folder else dest.name
    return {"url": f"/assets/{rel_path}", "filename": dest.name, "folder": clean_folder}
