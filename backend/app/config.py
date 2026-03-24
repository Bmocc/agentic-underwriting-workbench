import os
from functools import lru_cache
from pathlib import Path
from pydantic import BaseModel, Field
from dotenv import load_dotenv


_ENV_PATHS = [
    Path(__file__).resolve().parents[1] / ".env",  # backend/.env
    Path(__file__).resolve().parents[2] / ".env",  # repo root .env
]

for env_path in _ENV_PATHS:
    if env_path.exists():
        load_dotenv(env_path, override=False)


class Settings(BaseModel):
    rapidapi_key: str | None = Field(default_factory=lambda: os.getenv("RapidAPI_Key"))
    openai_api_key: str | None = Field(default_factory=lambda: os.getenv("OPENAI_API_KEY"))
    rapidapi_host: str = "zillow-com1.p.rapidapi.com"
    default_location: str = "CT"
    default_max_price: int = 300_000
    agent_model: str = os.getenv("UNDERWRITER_AGENT_MODEL", "gpt-5-mini")
    api_key: str | None = Field(default_factory=lambda: os.getenv("UNDERWRITER_API_KEY") or None)


@lru_cache
def get_settings() -> Settings:
    return Settings()
