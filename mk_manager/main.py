import logging
from pathlib import Path
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import uvicorn
from mk_manager.auth_middleware import AuthMiddleware, SecurityHeadersMiddleware
from mk_manager.config import get_settings
from mk_manager.routers import auth, files, search, stats, tags, graph, assets, settings as settings_router, system, vault, tasks
from mk_manager.services.log_buffer_service import log_buffer_service

def create_app() -> FastAPI:
    s = get_settings()
    app = FastAPI(
        title="MK Manager V2",
        debug=s.debug,
        docs_url="/docs" if s.debug else None,
        redoc_url="/redoc" if s.debug else None,
        openapi_url="/openapi.json" if s.debug else None,
    )

    # Sem CORS: o front é servido pelo próprio app (mesma origem). Liberar outras portas
    # locais deixava páginas nelas lerem e alterarem as notas.
    app.add_middleware(AuthMiddleware)
    app.add_middleware(SecurityHeadersMiddleware)

    # Captura logging padrão (logging.getLogger(__name__)) no buffer de logs da UI
    logging.getLogger().addHandler(log_buffer_service.get_handler())

    app.include_router(auth.router)
    app.include_router(files.router)
    app.include_router(search.router)
    app.include_router(stats.router)
    app.include_router(tags.router)
    app.include_router(graph.router)
    app.include_router(assets.router)
    app.include_router(settings_router.router)
    app.include_router(system.router)
    app.include_router(vault.router)
    app.include_router(tasks.router)

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
