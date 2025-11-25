from functools import lru_cache
from pathlib import Path
from pydantic import Field
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "RunPod Portal"
    database_url: str = Field(default="sqlite:///./data/app.db", env="DATABASE_URL")
    secret_key: str = Field(default="change-me", env="SECRET_KEY")
    access_token_expire_minutes: int = 60 * 24
    algorithm: str = "HS256"

    runpod_api_key: str | None = Field(default=None, env="RUNPOD_API_KEY")
    alphafold_endpoint_id: str | None = Field(default=None, env="ALPHAFOLD_ENDPOINT_ID")
    diffdock_endpoint_id: str | None = Field(default=None, env="DIFFDOCK_ENDPOINT_ID")
    phastest_endpoint_id: str | None = Field(default=None, env="PHASTEST_ENDPOINT_ID")

    storage_root: Path = Field(default=Path("./data"), env="STORAGE_ROOT")
    uploads_dir: str = "uploads"
    results_dir: str = "results"
    retention_days: int = Field(default=7, env="RETENTION_DAYS")
    poll_interval_seconds: int = Field(default=30, env="POLL_INTERVAL_SECONDS")

    class Config:
        env_file = ".env"
        case_sensitive = False


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    settings.storage_root.mkdir(parents=True, exist_ok=True)
    return settings

