import re
from pathlib import Path
from urllib.parse import unquote, quote
from fastapi import APIRouter, HTTPException, Request, status
from fastapi.responses import FileResponse
from mk_manager.config import get_settings

router = APIRouter(tags=["assets"])

try:
    from fastapi import File, UploadFile
    import python_multipart
    HAS_MULTIPART = True
except ImportError:
    HAS_MULTIPART = False

IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp", ".ico", ".avif"}

def get_available_filename(assets_dir: Path, original_name: str, content: bytes) -> str:
    raw_name = Path(original_name).name
    # Remove apenas caracteres inválidos em sistemas de arquivos mantendo o nome original limpo
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

if HAS_MULTIPART:
    @router.post("/api/assets/")
    async def upload_asset_multipart(file: UploadFile = File(...)) -> dict[str, str]:
        settings = get_settings()
        assets_dir = settings.resolved_assets_dir()
        assets_dir.mkdir(parents=True, exist_ok=True)

        original_filename = file.filename or "file"
        content = await file.read()
        saved_name = get_available_filename(assets_dir, original_filename, content)
        dest = assets_dir / saved_name
        dest.write_bytes(content)

        return {
            "url": f"/api/assets/{quote(saved_name)}",
            "filename": original_filename,
            "name": saved_name
        }
else:
    @router.post("/api/assets/")
    async def upload_asset_raw(request: Request) -> dict[str, str]:
        settings = get_settings()
        assets_dir = settings.resolved_assets_dir()
        assets_dir.mkdir(parents=True, exist_ok=True)

        original_filename = unquote(request.headers.get("x-filename", "file"))
        content = await request.body()
        saved_name = get_available_filename(assets_dir, original_filename, content)
        dest = assets_dir / saved_name
        dest.write_bytes(content)

        return {
            "url": f"/api/assets/{quote(saved_name)}",
            "filename": original_filename,
            "name": saved_name
        }

@router.get("/api/assets/{asset_name:path}")
@router.get("/assets/{asset_name:path}")
def get_asset(asset_name: str):
    settings = get_settings()
    assets_dir = settings.resolved_assets_dir()
    real_name = unquote(asset_name)
    file_path = assets_dir / real_name

    if not file_path.is_file():
        raise HTTPException(status_code=404, detail="Asset not found")

    return FileResponse(file_path)

@router.delete("/api/assets/{asset_name:path}", status_code=status.HTTP_204_NO_CONTENT)
@router.delete("/assets/{asset_name:path}", status_code=status.HTTP_204_NO_CONTENT)
def delete_asset(asset_name: str):
    settings = get_settings()
    assets_dir = settings.resolved_assets_dir()
    real_name = unquote(asset_name)
    file_path = assets_dir / real_name

    if file_path.is_file():
        file_path.unlink()
