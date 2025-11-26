from __future__ import annotations

from typing import Any, Dict

import requests

from .config import get_settings
from .models import PropertySearchRequest


settings = get_settings()


def property_search(payload: PropertySearchRequest) -> Dict[str, Any]:
    url = f"https://{settings.rapidapi_host}/propertyExtendedSearch"
    params: Dict[str, Any] = {
        "location": payload.location,
        "status_type": payload.status_type,
        "home_type": payload.home_type,
    }
    if payload.min_price is not None:
        params["minPrice"] = payload.min_price
    if payload.max_price is not None:
        params["maxPrice"] = payload.max_price
    if payload.beds_min is not None:
        params["beds_min"] = payload.beds_min
    if payload.baths_min is not None:
        params["baths_min"] = payload.baths_min
    if payload.limit:
        params["limit"] = payload.limit

    headers = {
        "x-rapidapi-key": settings.rapidapi_key or "",
        "x-rapidapi-host": settings.rapidapi_host,
    }
    resp = requests.get(url, headers=headers, params=params, timeout=30)
    resp.raise_for_status()
    return resp.json()
