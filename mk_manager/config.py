from pathlib import Path

try:
    from pydantic_settings import BaseSettings, SettingsConfigDict
    class Settings(BaseSettings):
        notes_dir: Path = Path("./notes")
        assets_dir: Path | None = None
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
        notes_dir: Path = Path("./notes")
        assets_dir: Path | None = None
        host: str = "127.0.0.1"
        port: int = 8888
        debug: bool = False

        def resolved_assets_dir(self) -> Path:
            return self.assets_dir if self.assets_dir else self.notes_dir / "assets"

settings = Settings()

def get_settings() -> Settings:
    return settings
