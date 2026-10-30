"""Polite HTTP client shared by every outbound lookup: per-host throttling, retry/backoff,
a circuit breaker for rate-limited hosts, and a small on-disk cache for GET responses."""
import contextlib
import hashlib
import sqlite3
import threading
import time
from urllib.parse import urlparse

import requests

from .settings import BEETS_DIR

USER_AGENT = "Canto/1.0 (https://github.com/canto-app; local music manager)"
# Minimum seconds between requests to the same host.
MIN_INTERVAL = {
    "musicbrainz.org": 1.1,
    "coverartarchive.org": 0.5,
    "itunes.apple.com": 3.0,  # ~20 requests/minute
    "api.deezer.com": 0.2,
    "lrclib.net": 0.2,
}
DEFAULT_INTERVAL = 0.3
MAX_ATTEMPTS = 3
MAX_WAIT = 30.0
BREAKER_FAILURES = 3
BREAKER_PAUSE = 300.0
CACHE_TTL = 12 * 3600
CACHE_PATH = BEETS_DIR / "http_cache.sqlite"


class RateLimited(RuntimeError):
    """Raised instead of sending a request while a host is paused after repeated 429/5xx responses."""


class _HostState:
    def __init__(self) -> None:
        self.lock = threading.Lock()
        self.next_slot = 0.0
        self.failures = 0
        self.paused_until = 0.0


_hosts: dict[str, _HostState] = {}
_hosts_lock = threading.Lock()
_cache_lock = threading.Lock()


def _state(host: str) -> _HostState:
    with _hosts_lock:
        return _hosts.setdefault(host, _HostState())


@contextlib.contextmanager
def _db():
    conn = sqlite3.connect(CACHE_PATH, timeout=10)
    try:
        conn.execute("CREATE TABLE IF NOT EXISTS cache (key TEXT PRIMARY KEY, ts REAL, ctype TEXT, body BLOB)")
        yield conn
        conn.commit()
    finally:
        conn.close()


def _cache_key(url: str) -> str:
    return hashlib.sha256(url.encode()).hexdigest()  # only a hash is stored, so tokens in URLs never hit disk


def _cache_get(key: str) -> requests.Response | None:
    try:
        with _cache_lock, _db() as conn:
            row = conn.execute("SELECT ts, ctype, body FROM cache WHERE key=?", (key,)).fetchone()
    except sqlite3.Error:
        return None
    if not row or time.time() - row[0] > CACHE_TTL:
        return None
    res = requests.Response()
    res.status_code = 200
    res._content = row[2]
    res.headers["Content-Type"] = row[1] or ""
    res.encoding = "utf-8"
    return res


def _cache_put(key: str, res: requests.Response) -> None:
    try:
        with _cache_lock, _db() as conn:
            conn.execute(
                "REPLACE INTO cache VALUES (?,?,?,?)",
                (key, time.time(), res.headers.get("Content-Type", ""), res.content),
            )
    except sqlite3.Error:
        pass


def clear_cache() -> int:
    try:
        with _cache_lock, _db() as conn:
            count = conn.execute("SELECT COUNT(*) FROM cache").fetchone()[0]
            conn.execute("DELETE FROM cache")
        return count
    except sqlite3.Error:
        return 0


def cache_stats() -> tuple[int, int]:
    try:
        with _cache_lock, _db() as conn:
            return tuple(conn.execute("SELECT COUNT(*), COALESCE(SUM(LENGTH(body)), 0) FROM cache").fetchone())
    except sqlite3.Error:
        return 0, 0


def purge_expired() -> None:
    try:
        with _cache_lock, _db() as conn:
            conn.execute("DELETE FROM cache WHERE ts < ?", (time.time() - CACHE_TTL,))
    except sqlite3.Error:
        pass


def host_status() -> list[dict]:
    """Hosts currently paused by the circuit breaker (for the UI)."""
    now = time.time()
    with _hosts_lock:
        return [
            {"host": h, "resume_in": round(s.paused_until - now)}
            for h, s in _hosts.items()
            if s.paused_until > now
        ]


def _retry_after(res: requests.Response, attempt: int) -> float:
    header = res.headers.get("Retry-After", "")
    try:
        wait = float(header)
    except ValueError:
        wait = 2.0 ** attempt
    return min(wait, MAX_WAIT)


class PoliteSession(requests.Session):
    def __init__(self) -> None:
        super().__init__()
        self.headers["User-Agent"] = USER_AGENT

    def request(self, method, url, *args, **kwargs):  # noqa: D102
        use_cache = kwargs.pop("cache", True) and method.upper() == "GET" and not kwargs.get("stream")
        host = urlparse(url).netloc.lower()
        state = _state(host)
        key = None
        if use_cache:
            prepared = self.prepare_request(requests.Request(
                method, url, params=kwargs.get("params"), headers=kwargs.get("headers")))
            key = _cache_key(prepared.url)
            hit = _cache_get(key)
            if hit is not None:
                return hit

        last_error: Exception | None = None
        for attempt in range(1, MAX_ATTEMPTS + 1):
            now = time.time()
            if state.paused_until > now:
                raise RateLimited(f"{host} is rate-limited; paused for {round(state.paused_until - now)}s")
            with state.lock:  # reserve the next free slot, then wait outside the lock
                slot = max(now, state.next_slot)
                state.next_slot = slot + MIN_INTERVAL.get(host, DEFAULT_INTERVAL)
            if slot > now:
                time.sleep(slot - now)
            try:
                res = super().request(method, url, *args, **kwargs)
            except (requests.ConnectionError, requests.Timeout) as exc:
                last_error = exc
                self._fail(state, host)
                time.sleep(min(2.0 ** attempt, MAX_WAIT))
                continue
            if res.status_code == 429 or res.status_code >= 500:
                last_error = requests.HTTPError(f"{host} returned {res.status_code}")
                self._fail(state, host)
                if attempt < MAX_ATTEMPTS:
                    wait = _retry_after(res, attempt)
                    state.next_slot = max(state.next_slot, time.time() + wait)
                    continue
                if res.status_code == 429:
                    raise RateLimited(f"{host} rate-limited the request (429)")
                return res
            state.failures = 0
            if key and res.status_code == 200:
                _cache_put(key, res)
            return res
        if isinstance(last_error, RateLimited):
            raise last_error
        raise last_error or RuntimeError("request failed")

    @staticmethod
    def _fail(state: _HostState, host: str) -> None:
        state.failures += 1
        if state.failures >= BREAKER_FAILURES:
            state.paused_until = time.time() + BREAKER_PAUSE
            state.failures = 0


def make_session() -> PoliteSession:
    return PoliteSession()


shared = PoliteSession()
