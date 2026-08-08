import uuid
from pathlib import Path
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
            items.append({
                "name": p.name,
                "url": f"/api/assets/{p.name}",
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

        filename = file.filename or "file"
        ext = Path(filename).suffix
        unique_name = f"{uuid.uuid4().hex[:12]}{ext}"
        dest = assets_dir / unique_name

        content = await file.read()
        dest.write_bytes(content)

        return {
            "url": f"/api/assets/{unique_name}",
            "filename": filename,
            "name": unique_name
        }
else:
    @router.post("/api/assets/")
    async def upload_asset_raw(request: Request) -> dict[str, str]:
        settings = get_settings()
        assets_dir = settings.resolved_assets_dir()
        assets_dir.mkdir(parents=True, exist_ok=True)

        filename = request.headers.get("x-filename", "file")
        ext = Path(filename).suffix or ".bin"
        unique_name = f"{uuid.uuid4().hex[:12]}{ext}"
        dest = assets_dir / unique_name

        content = await request.body()
        dest.write_bytes(content)

        return {
            "url": f"/api/assets/{unique_name}",
            "filename": filename,
            "name": unique_name
        }

@router.get("/api/assets/{asset_name}")
@router.get("/assets/{asset_name}")
def get_asset(asset_name: str):
    settings = get_settings()
    assets_dir = settings.resolved_assets_dir()
    file_path = assets_dir / asset_name

    if not file_path.is_file():
        raise HTTPException(status_code=404, detail="Asset not found")

    return FileResponse(file_path)

@router.delete("/api/assets/{asset_name}", status_code=status.HTTP_204_NO_CONTENT)
@router.delete("/assets/{asset_name}", status_code=status.HTTP_204_NO_CONTENT)
def delete_asset(asset_name: str):
    settings = get_settings()
    assets_dir = settings.resolved_assets_dir()
    file_path = assets_dir / asset_name

    if file_path.is_file():
        file_path.unlink()
