from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    notes_dir: Path = Path("./notes")
    assets_dir: Path | None = None
    data_dir: Path = Path("./data")  # banco de usuários (mk_manager.db); fora do git
    host: str = "127.0.0.1"
    port: int = 8888
    debug: bool = False

    model_config = SettingsConfigDict(
        env_prefix="MK_",
        env_file=".env",
        env_file_encoding="utf-8",
    )

    def resolved_assets_dir(self) -> Path:
        return self.assets_dir if self.assets_dir else self.notes_dir / "assets"


settings = Settings()
# Campos vindos de variável de ambiente ou .env (ganham dos Ajustes salvos no banco).
ENV_FIELDS = frozenset(settings.model_fields_set)

def get_settings() -> Settings:
    return settings
