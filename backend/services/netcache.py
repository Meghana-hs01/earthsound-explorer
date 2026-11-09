"""HTTP helper with a simple in-memory TTL cache. Errors become UpstreamError, which the API returns as HTTP 502."""
from __future__ import annotations

import time

import httpx

_store: dict[str, tuple[float, object]] = {}


class UpstreamError(Exception):
    def __init__(self, service: str, message: str):
        self.service = service
        super().__init__(f"{service} request failed: {message}")


def _cache_key(url: str, params: dict | None) -> str:
    items = sorted((params or {}).items())
    return url + "?" + "&".join(f"{k}={v}" for k, v in items)


async def fetch_json(service: str, url: str, params: dict | None = None, ttl: int = 900):
    key = _cache_key(url, params)
    hit = _store.get(key)
    if hit and hit[0] > time.time():
        return hit[1]
    try:
        async with httpx.AsyncClient(timeout=45) as client:
            response = await client.get(url, params=params)
            response.raise_for_status()
            data = response.json()
    except httpx.HTTPError as e:
        raise UpstreamError(service, f"{e.__class__.__name__}: {e}") from e
    except ValueError as e:
        raise UpstreamError(service, "response was not valid JSON") from e
    _store[key] = (time.time() + ttl, data)
    return data


async def fetch_text(service: str, url: str, ttl: int = 86400) -> str:
    key = _cache_key(url, None)
    hit = _store.get(key)
    if hit and hit[0] > time.time():
        return hit[1]
    try:
        async with httpx.AsyncClient(timeout=45) as client:
            response = await client.get(url)
            response.raise_for_status()
            text = response.text
    except httpx.HTTPError as e:
        raise UpstreamError(service, f"{e.__class__.__name__}: {e}") from e
    _store[key] = (time.time() + ttl, text)
    return text
