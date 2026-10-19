import logging
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import uvicorn
from mk_manager.auth_middleware import AuthMiddleware, SecurityHeadersMiddleware
from mk_manager.config import get_settings
from mk_manager.routers import auth, files, search, stats, tags, links, assets, settings as settings_router, system, vault, tasks, sync
from mk_manager.services.auth_service import get_auth_service
from mk_manager.services.git_sync_service import git_sync_service
from mk_manager.services.log_buffer_service import log_buffer_service

# Rotas que gravam na pasta de notas/anexos: uma resposta de sucesso nelas agenda o git sync.
_WRITES_NOTES = ("/api/files", "/api/tags", "/api/assets", "/assets/")
_STATE_CHANGING = frozenset({"POST", "PUT", "PATCH", "DELETE"})

@asynccontextmanager
async def lifespan(_app: FastAPI):
    settings_router.load_saved_paths()
    git_sync_service.load(get_auth_service().db)
    git_sync_service.start_background()
    yield
    git_sync_service.stop_background()


def create_app() -> FastAPI:
    s = get_settings()
    app = FastAPI(
        lifespan=lifespan,
        title="MK Manager V2",
        debug=s.debug,
        docs_url="/docs" if s.debug else None,
        redoc_url="/redoc" if s.debug else None,
        openapi_url="/openapi.json" if s.debug else None,
    )

    # Sem CORS: o front é servido pelo próprio app (mesma origem). Liberar outras portas
    # locais deixava páginas nelas lerem e alterarem as notas.
    # Mais interno que o AuthMiddleware: só vê o que passou pela sessão.
    @app.middleware("http")
    async def git_sync_after_write(request: Request, call_next):
        response = await call_next(request)
        if (request.method in _STATE_CHANGING and response.status_code < 400
                and request.url.path.startswith(_WRITES_NOTES)):
            git_sync_service.notify_change()
        return response

    app.add_middleware(AuthMiddleware)
    app.add_middleware(SecurityHeadersMiddleware)

    # Captura logging padrão (logging.getLogger(__name__)) no buffer de logs da UI
    logging.getLogger().addHandler(log_buffer_service.get_handler())

    app.include_router(auth.router)
    app.include_router(files.router)
    app.include_router(search.router)
    app.include_router(stats.router)
    app.include_router(tags.router)
    app.include_router(links.router)
    app.include_router(assets.router)
    app.include_router(settings_router.router)
    app.include_router(system.router)
    app.include_router(vault.router)
    app.include_router(tasks.router)
    app.include_router(sync.router)

    @app.get("/health")
    def health():
        return {"status": "ok", "app": "MK Manager V2"}

    frontend_dir = Path(__file__).resolve().parent / "frontend"
    app.mount("/static", StaticFiles(directory=frontend_dir), name="static")

    @app.get("/")
    def index():
        return FileResponse(frontend_dir / "index.html")

    return app

app = create_app()

def start():
    s = get_settings()
    uvicorn.run("mk_manager.main:app", host=s.host, port=s.port, reload=s.debug)

if __name__ == "__main__":
    start()
