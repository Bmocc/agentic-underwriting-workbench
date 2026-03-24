# backend/app/auth.py
from __future__ import annotations
from fastapi import Header, HTTPException, status
from .config import get_settings


async def require_api_key(x_api_key: str | None = Header(default=None)) -> None:
    """FastAPI dependency: validates X-API-Key when UNDERWRITER_API_KEY is configured."""
    settings = get_settings()
    configured_key = settings.api_key
    if not configured_key:
        return  # Auth disabled — no key configured
    if x_api_key != configured_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing API key. Set X-API-Key header.",
        )
