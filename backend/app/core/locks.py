import threading
from collections import defaultdict
from contextlib import contextmanager

_guard = threading.Lock()
_locks: dict[int, threading.RLock] = defaultdict(threading.RLock)


@contextmanager
def item_lock(item_id: int):
    """Serialise anything that writes one track's tags or files, or moves it.

    Without it a tag edit that moves the file races a lyrics/analysis write to the old path.
    """
    with _guard:
        lock = _locks[item_id]
    with lock:
        yield
