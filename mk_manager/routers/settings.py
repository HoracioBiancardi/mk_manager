from pathlib import Path
from fastapi import APIRouter, HTTPException
from mk_manager.config import get_settings
from mk_manager.dependencies import reset_repository_cache
from mk_manager.models.schemas import BrowseResponse, DirEntry, SettingsResponse, SettingsUpdateRequest

router = APIRouter(prefix="/api/settings", tags=["settings"])

@router.get("/", response_model=SettingsResponse)
def get_settings_handler() -> SettingsResponse:
    s = get_settings()
    n_dir = s.notes_dir.resolve()
    a_dir = s.resolved_assets_dir().resolve()
    is_def = s.assets_dir is None
    return SettingsResponse(
        notes_dir=str(n_dir),
        assets_dir=str(a_dir),
        assets_dir_is_default=is_def,
        host=s.host,
        port=s.port,
    )

@router.put("/", response_model=SettingsResponse)
def update_settings_handler(body: SettingsUpdateRequest) -> SettingsResponse:
    s = get_settings()
    try:
        new_notes = Path(body.notes_dir).expanduser().resolve()
        new_notes.mkdir(parents=True, exist_ok=True)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Caminho de notas inválido: {e}") from e

    s.notes_dir = new_notes
    if body.assets_dir is not None:
        stripped = body.assets_dir.strip()
        if not stripped:
            s.assets_dir = None
        else:
            try:
                new_assets = Path(stripped).expanduser().resolve()
                new_assets.mkdir(parents=True, exist_ok=True)
                s.assets_dir = new_assets
            except Exception as e:
                raise HTTPException(status_code=400, detail=f"Caminho de anexos inválido: {e}") from e

    reset_repository_cache()
    return get_settings_handler()

@router.get("/browse", response_model=BrowseResponse)
def browse_directories(path: str = "") -> BrowseResponse:
    try:
        target = Path(path).expanduser().resolve() if path.strip() else Path.home()
        if not target.exists() or not target.is_dir():
            target = Path.home()
    except Exception:
        target = Path.home()

    dirs: list[DirEntry] = []
    try:
        for child in sorted(target.iterdir(), key=lambda p: p.name.lower()):
            if child.is_dir() and not child.name.startswith("."):
                dirs.append(DirEntry(name=child.name, path=str(child.resolve())))
    except PermissionError:
        pass

    parent = str(target.parent.resolve()) if target != target.parent else None
    return BrowseResponse(path=str(target), parent=parent, dirs=dirs)
