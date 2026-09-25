from pathlib import Path

try:
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

except ImportError:
    class Settings:
        def __init__(
            self,
            notes_dir: Path = Path("./notes"),
            assets_dir: Path | None = None,
            data_dir: Path = Path("./data"),
            host: str = "127.0.0.1",
            port: int = 8888,
            debug: bool = False,
        ):
            self.notes_dir = Path(notes_dir)
            self.assets_dir = Path(assets_dir) if assets_dir else None
            self.data_dir = Path(data_dir)
            self.host = host
            self.port = port
            self.debug = debug

        def resolved_assets_dir(self) -> Path:
            return self.assets_dir if self.assets_dir else self.notes_dir / "assets"


settings = Settings()

def get_settings() -> Settings:
    return settings
