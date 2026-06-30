"""FastAPI application factory and CLI entry point.

Create the app with ``create_app()`` (useful for testing) or run the server
directly with the ``mk-manager`` CLI command defined in ``pyproject.toml``.

Usage::

    uv run mk-manager
    # or
    uv run uvicorn mk_manager.main:app --reload --port 8888
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path
from typing import AsyncGenerator

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from mk_manager.config import get_settings
from mk_manager.routers import assets, files, search, stats, tags

_FRONTEND_DIR: Path = Path(__file__).parent / "frontend"
_DS_DIR: Path = Path(__file__).parent.parent / "design-system"


@asynccontextmanager
async def _lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan: runs startup logic before yielding to the server.

    Ensures the notes directory exists before the first request is served,
    preventing race conditions on startup.

    Args:
        app: The FastAPI application instance (unused but required by signature).

    Yields:
        Control to the ASGI server during the application's lifetime.
    """
    settings = get_settings()
    settings.notes_dir.mkdir(parents=True, exist_ok=True)
    yield


def create_app() -> FastAPI:
    """Assemble and configure the FastAPI application.

    Registers all middleware, routers, and the frontend static-file handler.
    Separated from module-level instantiation so tests can call this function
    with dependency overrides already in place.

    Returns:
        A fully configured ``FastAPI`` instance.
    """
    app = FastAPI(
        title="MK Manager",
        description="Markdown file manager with notes and tasks support.",
        version="0.1.0",
        lifespan=_lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(files.router)
    app.include_router(search.router)
    app.include_router(stats.router)
    app.include_router(assets.router)
    app.include_router(tags.router)

    @app.get("/", include_in_schema=False)
    @app.get("/index.html", include_in_schema=False)
    async def serve_frontend() -> FileResponse:
        return FileResponse(_FRONTEND_DIR / "index.html")

    @app.get("/favicon.svg", include_in_schema=False)
    @app.get("/favicon.ico", include_in_schema=False)
    async def serve_favicon() -> FileResponse:
        return FileResponse(_FRONTEND_DIR / "favicon.svg")

    app.mount("/static", StaticFiles(directory=str(_FRONTEND_DIR)), name="static")
    app.mount("/ds", StaticFiles(directory=str(_DS_DIR)), name="design-system")

    # Serve uploaded assets; create dir eagerly so StaticFiles doesn't error
    _assets_dir = get_settings().notes_dir / "assets"
    _assets_dir.mkdir(parents=True, exist_ok=True)
    app.mount("/assets", StaticFiles(directory=str(_assets_dir)), name="assets")

    return app


app: FastAPI = create_app()


def start() -> None:
    """CLI entry point registered as ``mk-manager`` in ``pyproject.toml``.

    Reads host, port, and debug settings from ``Settings`` (environment /
    ``.env`` file) and starts the uvicorn server.
    """
    settings = get_settings()
    uvicorn.run(
        "mk_manager.main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug,
    )
