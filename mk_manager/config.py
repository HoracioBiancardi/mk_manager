"""Application configuration loaded from environment variables.

All settings are prefixed with ``MK_`` and can be overridden via a ``.env``
file in the project root or by exporting environment variables.

Example:
    Override the notes directory at runtime::

        MK_NOTES_DIR=/home/user/vault uv run mk-manager
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application-wide settings resolved from environment variables.

    Attributes:
        notes_dir: Directory where markdown files are stored.
            Defaults to ``./notes`` relative to the working directory.
        assets_dir: Directory where uploaded/pasted assets (images, PDFs,
            etc.) are stored. When unset, defaults to ``{notes_dir}/assets``
            — set explicitly to keep assets separate from a notes folder
            that may itself point elsewhere (e.g. a synced vault).
        host: Bind address for the uvicorn server. Defaults to ``"0.0.0.0"``.
        port: TCP port for the uvicorn server. Defaults to ``8888``.
        debug: Enable uvicorn ``--reload`` and FastAPI debug mode.
            Defaults to ``True``.
    """

    notes_dir: Path = Path("./notes")
    assets_dir: Path | None = None
    host: str = "0.0.0.0"
    port: int = 8099
    debug: bool = True

    model_config = SettingsConfigDict(
        env_prefix="MK_",
        env_file=".env",
        env_file_encoding="utf-8",
    )

    def resolved_assets_dir(self) -> Path:
        """Return the effective assets directory.

        Falls back to ``{notes_dir}/assets`` when ``assets_dir`` isn't
        explicitly configured.
        """
        return self.assets_dir if self.assets_dir else self.notes_dir / "assets"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return the singleton application settings instance.

    Cached after the first call so environment variables are read only once
    per process lifetime.

    Returns:
        The application ``Settings`` object.
    """
    return Settings()
