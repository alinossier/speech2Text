from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="STT_", extra="ignore")

    api_origins: str = "http://localhost:8080"
    upload_limit_gb: int = 10
    hf_token: str = ""
    model_name: str = "large-v3"
    model_cache: Path = Path("/app/models")
    data_dir: Path = Path("/app/data")

    @property
    def allowed_origins(self) -> list[str]:
        return [origin.strip() for origin in self.api_origins.split(",") if origin.strip()]

    @property
    def upload_limit_bytes(self) -> int:
        return self.upload_limit_gb * 1024 * 1024 * 1024


settings = Settings()
