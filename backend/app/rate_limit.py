# backend/app/rate_limit.py
from slowapi import Limiter
from slowapi.util import get_remote_address

# Uses in-memory storage — works for single-worker deployments only.
# For multi-worker: pass storage_uri="redis://..." to Limiter().
limiter = Limiter(key_func=get_remote_address)
