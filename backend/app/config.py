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


def _parse_rate_limit() -> int:
    raw = os.getenv("RAPIDAPI_RATE_LIMIT", "")
    if not raw:
        return 10
    try:
        val = int(raw)
    except ValueError:
        raise ValueError(f"RAPIDAPI_RATE_LIMIT must be an integer, got: {raw!r}")
    if val < 1:
        raise ValueError(f"RAPIDAPI_RATE_LIMIT must be >= 1, got: {val}")
    return val


class Settings(BaseModel):
    rapidapi_key: str | None = Field(default_factory=lambda: os.getenv("RapidAPI_Key"))
    openai_api_key: str | None = Field(default_factory=lambda: os.getenv("OPENAI_API_KEY"))
    rapidapi_host: str = "zillow-com1.p.rapidapi.com"
    default_location: str = "CT"
    default_max_price: int = 300_000
    agent_model: str = os.getenv("UNDERWRITER_AGENT_MODEL", "gpt-4o-mini")
    api_key: str | None = Field(default_factory=lambda: os.getenv("UNDERWRITER_API_KEY") or None)
    rapidapi_rate_limit: int = Field(default_factory=_parse_rate_limit)


@lru_cache
def get_settings() -> Settings:
    return Settings()
