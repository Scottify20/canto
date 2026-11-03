"""Metadata proposals waiting for review, kept on the server so they survive closing the app.

Which tracks were looked up and reviewed is stored on the track itself (`meta_fetched`,
`meta_reviewed` flexible fields). A re-imported file becomes a new library entry, so it starts
again as "not fetched, not reviewed".
"""
import json
import os
import threading
import time

from ..core.settings import BEETS_DIR
from ..core.jobs import Job
from .matcher import MatchService

PATH = BEETS_DIR / "match_proposals.json"


class MatchStore:
    def __init__(self, engine, matcher: MatchService):
        self.engine = engine
        self.matcher = matcher
        self._lock = threading.Lock()

    def _load(self) -> dict[str, list]:
        try:
            return json.loads(PATH.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return {}

    def _save(self, data: dict) -> None:
        temp = PATH.with_suffix(".tmp")
        temp.write_text(json.dumps(data), encoding="utf-8")
        os.replace(temp, PATH)

    def all(self) -> dict[int, list]:
        with self._lock:
            data = self._load()
            live = {k: v for k, v in data.items() if self.engine.lib.get_item(int(k))}
            if len(live) != len(data):
                self._save(live)
            return {int(k): v for k, v in live.items()}

    def _mark(self, item_id: int, **flags) -> None:
        item = self.engine.lib.get_item(item_id)
        if not item:
            return
        stamp = int(time.time())
        for key, on in flags.items():
            if on:
                item[key] = stamp
        item.store()

    def lookup(self, item_id: int) -> list:
        """Fetch candidates for one track and keep them for review."""
        candidates = self.matcher.propose(item_id)
        with self._lock:
            data = self._load()
            if candidates:
                data[str(item_id)] = candidates
            else:
                data.pop(str(item_id), None)
            self._save(data)
        self._mark(item_id, meta_fetched=True)
        return candidates

    def resolve(self, item_id: int, reviewed: bool) -> None:
        """Remove the pending proposal; `reviewed` records that the user looked at it (accepted or rejected)."""
        with self._lock:
            data = self._load()
            if data.pop(str(item_id), None) is not None:
                self._save(data)
        if reviewed:
            self._mark(item_id, meta_fetched=True, meta_reviewed=True)

    def run_batch(self, job: Job, ids: list[int] | None, force: bool) -> None:
        lib = self.engine.lib
        wanted = ids if ids is not None else [i.id for i in lib.items()]
        pending = self.all()
        todo = [i for i in wanted if force or i not in pending]
        job.total = len(todo)
        found = 0
        for n, item_id in enumerate(todo, 1):
            if job.cancelled:
                break
            item = lib.get_item(item_id)
            job.message = f"Matching {n}/{len(todo)}"
            if item:
                try:
                    if self.lookup(item_id):
                        found += 1
                except Exception as exc:  # noqa: BLE001 - one bad lookup must not stop the batch
                    job.write(f"[Error] {item.artist} - {item.title}: {exc}")
            job.done = n
        job.message = f"Looked up {job.done} track(s), {found} with candidates to review"
        job.write(f"[Done] {job.message}")
