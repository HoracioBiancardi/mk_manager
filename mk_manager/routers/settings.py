from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException
from mk_manager import config
from mk_manager.config import get_settings
from mk_manager.dependencies import reset_repository_cache
from mk_manager.models.schemas import BrowseResponse, DirEntry, SettingsResponse, SettingsUpdateRequest
from mk_manager.services.auth_service import get_auth_service, require_admin
from mk_manager.services.git_sync_service import git_sync_service, is_git_repo

# Só admin: trocar a pasta de notas faz as rotas de arquivos operarem em qualquer lugar do
# disco, e /browse lista o sistema de arquivos inteiro.
router = APIRouter(prefix="/api/settings", tags=["settings"], dependencies=[Depends(require_admin)])

# As pastas escolhidas em Ajustes ficam no banco do app; sem isso, ao reiniciar o app
# voltava para ./notes (a pasta padrão) e a tela mostrava outras notas.
_PATHS_KEY = "paths"


def load_saved_paths() -> None:
    """Na subida do app, volta as pastas salvas em Ajustes.

    MK_NOTES_DIR / MK_ASSETS_DIR (variável ou .env) ganham do que foi salvo.
    """
    s = get_settings()
    saved = get_auth_service().db.get_key(_PATHS_KEY) or {}
    if not isinstance(saved, dict):
        return
    notes = saved.get("notes_dir") or ""
    if notes and "notes_dir" not in config.ENV_FIELDS and Path(notes).is_dir():
        s.notes_dir = Path(notes)
    assets = saved.get("assets_dir") or ""
    if assets and "assets_dir" not in config.ENV_FIELDS and Path(assets).is_dir():
        s.assets_dir = Path(assets)
    reset_repository_cache()


def _save_paths() -> None:
    s = get_settings()
    get_auth_service().db.set_key(
        _PATHS_KEY, {"notes_dir": str(s.notes_dir), "assets_dir": str(s.assets_dir or "")}
    )


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
        git_sync=git_sync_service.enabled,
        notes_dir_is_git=is_git_repo(n_dir),
    )

@router.put("/", response_model=SettingsResponse)
def update_settings_handler(body: SettingsUpdateRequest) -> SettingsResponse:
    s = get_settings()
    try:
        new_notes = Path(body.notes_dir).expanduser().resolve()
        new_notes.mkdir(parents=True, exist_ok=True)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Caminho de notas inválido: {e}") from e

    git_sync = git_sync_service.enabled if body.git_sync is None else body.git_sync
    if git_sync and not is_git_repo(new_notes):
        raise HTTPException(
            status_code=400,
            detail=f"A pasta de notas não é um repositório git ({new_notes}). Desmarque a opção ou escolha a pasta do clone.",
        )

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

    _save_paths()
    reset_repository_cache()
    if git_sync != git_sync_service.enabled:
        git_sync_service.set_enabled(get_auth_service().db, git_sync)
    if git_sync:
        git_sync_service.notify_change()  # puxa o remoto (e sobe o pendente) logo após ligar/trocar
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
