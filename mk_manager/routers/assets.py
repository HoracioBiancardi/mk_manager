import re
from pathlib import Path
from typing import Any, Union
from urllib.parse import unquote, quote
from fastapi import APIRouter, HTTPException, Request, Depends, status, File, UploadFile
from fastapi.responses import FileResponse
from mk_manager.config import get_settings
from mk_manager.dependencies import get_file_service
from mk_manager.services.file_service import FileService
from mk_manager.models.schemas import FileUpdateRequest
from mk_manager.utils.security import PathTraversalError, ensure_within_root, sanitize_relative_path

router = APIRouter(tags=["assets"])

IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp", ".ico", ".avif"}
MAX_UPLOAD_SIZE_BYTES = 50 * 1024 * 1024  # 50MB


def _resolve_safe_asset_path(assets_dir: Path, asset_name: str) -> Path:
    """Sanitize a user-supplied asset path and confirm it stays inside `assets_dir`.

    Raises HTTPException(400) on any traversal/absolute-path attempt.
    """
    try:
        safe_name = sanitize_relative_path(asset_name, label="asset name")
    except PathTraversalError:
        raise HTTPException(status_code=400, detail="Invalid asset path")

    if not safe_name:
        raise HTTPException(status_code=400, detail="Invalid asset path")

    file_path = assets_dir / safe_name
    try:
        ensure_within_root(assets_dir, file_path, label="Asset path")
    except PathTraversalError:
        raise HTTPException(status_code=400, detail="Invalid asset path")

    return file_path

def get_available_filename(assets_dir: Path, original_name: str, content: bytes) -> str:
    raw_name = Path(original_name).name
    clean_name = re.sub(r'[\\/*?:"<>|]', '_', raw_name) or "file"
    stem = Path(clean_name).stem
    suffix = Path(clean_name).suffix

    target = assets_dir / clean_name
    if not target.exists():
        return clean_name

    try:
        if target.read_bytes() == content:
            return clean_name
    except Exception:
        pass

    counter = 1
    while True:
        new_name = f"{stem}_{counter}{suffix}"
        candidate = assets_dir / new_name
        if not candidate.exists():
            return new_name
        try:
            if candidate.read_bytes() == content:
                return new_name
        except Exception:
            pass
        counter += 1

def find_asset_usage(real_name: str, service: FileService) -> list[dict[str, str]]:
    quoted_name = quote(real_name)
    search_terms = {real_name, quoted_name}

    all_files = service.list_files(include_archived=True)
    usage: list[dict[str, str]] = []

    for f in all_files:
        content = f.content or ""
        if any(term in content for term in search_terms):
            usage.append({
                "id": f.id,
                "title": f.title or f.id,
                "filename": f.filename or ""
            })

    return usage

def cleanup_asset_references(real_name: str, service: FileService) -> list[str]:
    quoted_name = quote(real_name)
    search_terms = {real_name, quoted_name}

    all_files = service.list_files(include_archived=True)
    affected_titles: list[str] = []

    for f in all_files:
        content = f.content or ""
        if not any(term in content for term in search_terms):
            continue

        lines = content.split("\n")
        new_lines = []
        modified = False

        for line in lines:
            if any(term in line for term in search_terms):
                modified = True
                line_stripped = line.strip()
                if line_stripped.startswith("!") or line_stripped.startswith("[") or re.match(r"^(!?\[.*?\]\(.*?\))", line_stripped):
                    continue
                for term in search_terms:
                    pattern = re.compile(r"!\[.*?\]\([^)]*" + re.escape(term) + r"[^)]*\)|\[.*?\]\([^)]*" + re.escape(term) + r"[^)]*\)")
                    line = pattern.sub("", line)
                if line.strip():
                    new_lines.append(line)
            else:
                new_lines.append(line)

        if modified:
            new_content = "\n".join(new_lines)
            service.update_file(
                f.id,
                FileUpdateRequest(
                    title=None,
                    tags=None,
                    content=new_content,
                    folder=None,
                    status=None,
                    due_date=None,
                ),
            )
            affected_titles.append(f.title or f.id)

    return affected_titles

async def upload_asset(file_or_req: Any, folder: str = "") -> dict[str, str]:
    """Helper interno e exportado para testes."""
    settings = get_settings()
    base_assets = settings.resolved_assets_dir()

    try:
        safe_folder = sanitize_relative_path(folder, label="folder")
    except PathTraversalError:
        raise HTTPException(status_code=400, detail="Invalid folder path")

    assets_dir = base_assets / safe_folder if safe_folder else base_assets
    try:
        ensure_within_root(base_assets, assets_dir, label="Folder path")
    except PathTraversalError:
        raise HTTPException(status_code=400, detail="Invalid folder path")
    folder = safe_folder
    assets_dir.mkdir(parents=True, exist_ok=True)

    if isinstance(file_or_req, UploadFile):
        original_filename = file_or_req.filename or "file"
        declared_size = getattr(file_or_req, "size", None)
        if declared_size is not None and declared_size > MAX_UPLOAD_SIZE_BYTES:
            raise HTTPException(status_code=413, detail="File too large")
        content = await file_or_req.read()
    elif isinstance(file_or_req, Request):
        original_filename = unquote(file_or_req.headers.get("x-filename", "file"))
        content = await file_or_req.body()
    else:
        original_filename = getattr(file_or_req, "filename", "file")
        content = await file_or_req.read() if hasattr(file_or_req, "read") else b""

    if len(content) > MAX_UPLOAD_SIZE_BYTES:
        raise HTTPException(status_code=413, detail="File too large")

    saved_name = get_available_filename(assets_dir, original_filename, content)
    dest = assets_dir / saved_name
    dest.write_bytes(content)

    rel_path = f"{folder}/{saved_name}" if folder else saved_name
    url_path = quote(rel_path)

    return {
        "url": f"/assets/{url_path}",
        "filename": original_filename,
        "name": saved_name,
        "folder": folder
    }

@router.get("/api/assets/")
def list_assets() -> list[dict[str, str | int | bool]]:
    settings = get_settings()
    assets_dir = settings.resolved_assets_dir()
    if not assets_dir.exists():
        return []

    items = []
    for p in sorted(assets_dir.iterdir(), key=lambda x: x.stat().st_mtime if x.is_file() else 0, reverse=True):
        if p.is_file() and not p.name.startswith("."):
            ext = p.suffix.lower()
            safe_url_name = quote(p.name)
            items.append({
                "name": p.name,
                "url": f"/api/assets/{safe_url_name}",
                "size": p.stat().st_size,
                "modified": int(p.stat().st_mtime),
                "is_image": ext in IMAGE_EXTENSIONS,
                "ext": ext.replace(".", "").upper()
            })
    return items

@router.post("/api/assets/")
async def upload_asset_endpoint(file: UploadFile = File(...), folder: str = "") -> dict[str, str]:
    return await upload_asset(file, folder)

@router.get("/api/assets/{asset_name:path}/usage")
def check_asset_usage(
    asset_name: str,
    service: FileService = Depends(get_file_service)
) -> dict[str, Any]:
    real_name = unquote(asset_name)
    usage = find_asset_usage(real_name, service)
    return {"asset_name": real_name, "affected_files": usage}

@router.get("/api/assets/{asset_name:path}")
@router.get("/assets/{asset_name:path}")
def get_asset(asset_name: str):
    settings = get_settings()
    assets_dir = settings.resolved_assets_dir()
    real_name = unquote(asset_name)
    file_path = _resolve_safe_asset_path(assets_dir, real_name)

    if not file_path.is_file():
        raise HTTPException(status_code=404, detail="Asset not found")

    return FileResponse(file_path)

@router.delete("/api/assets/{asset_name:path}")
@router.delete("/assets/{asset_name:path}")
def delete_asset(
    asset_name: str,
    service: FileService = Depends(get_file_service)
) -> dict[str, Any]:
    settings = get_settings()
    assets_dir = settings.resolved_assets_dir()
    real_name = unquote(asset_name)
    file_path = _resolve_safe_asset_path(assets_dir, real_name)

    affected = cleanup_asset_references(real_name, service)

    if file_path.is_file():
        file_path.unlink()

    return {"status": "deleted", "asset_name": real_name, "affected_files": affected}
