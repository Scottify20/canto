"""Library database safety net: a copy beside the music, and tools to repoint paths after a drive moves.

The live database stays on the local disk (SQLite dislikes removable/network drives); the copy in
`<output>/.canto/` lets a fresh install or another computer pick the library back up.
"""
import json
import os
import shutil
import sqlite3
import threading
import time

from ..core.settings import DB_PATH
from .beets_engine import BeetsEngine
from .storage import root_status
from .tracks import item_path

BACKUP_DIR = ".canto"
BACKUP_NAME = "library-backup.db"
META_NAME = "library-backup.json"
DEBOUNCE_SECONDS = 5.0


class LibraryBackupService:
    def __init__(self, engine: BeetsEngine):
        self.engine = engine
        self._timer: threading.Timer | None = None
        self._lock = threading.Lock()

    # ---- locations -------------------------------------------------------
    def _dir(self) -> str | None:
        output = self.engine.settings.output_path.strip()
        if not output or not root_status(output, must_exist=False)["ok"]:
            return None
        return os.path.join(os.path.abspath(os.path.expanduser(output)), BACKUP_DIR)

    def info(self) -> dict:
        folder = self._dir()
        meta: dict = {}
        if folder:
            try:
                with open(os.path.join(folder, META_NAME), encoding="utf-8") as fh:
                    meta = json.load(fh)
            except (OSError, ValueError):
                meta = {}
        return {
            "available": bool(folder and os.path.exists(os.path.join(folder, BACKUP_NAME))),
            "folder": folder,
            "writable_target": bool(folder),
            "saved_at": meta.get("saved_at"),
            "tracks": meta.get("tracks"),
        }

    # ---- backup ------------------------------------------------------------
    def backup_now(self) -> dict:
        folder = self._dir()
        if not folder:
            raise FileNotFoundError("The output folder isn't available, so the backup can't be saved there")
        os.makedirs(folder, exist_ok=True)
        target = os.path.join(folder, BACKUP_NAME)
        temp = target + ".tmp"
        source = sqlite3.connect(str(DB_PATH))
        try:
            dest = sqlite3.connect(temp)
            try:
                source.backup(dest)
            finally:
                dest.close()
        finally:
            source.close()
        os.replace(temp, target)  # a half-written copy never replaces a good one
        meta = {"saved_at": time.time(), "tracks": len(self.engine.lib.items()), "library": os.fsdecode(self.engine.lib.directory)}
        with open(os.path.join(folder, META_NAME), "w", encoding="utf-8") as fh:
            json.dump(meta, fh)
        return self.info()

    def schedule(self) -> None:
        """Debounced backup after changes; silently skipped when the drive is away."""
        with self._lock:
            if self._timer:
                self._timer.cancel()
            self._timer = threading.Timer(DEBOUNCE_SECONDS, self._quiet_backup)
            self._timer.daemon = True
            self._timer.start()

    def _quiet_backup(self) -> None:
        try:
            self.backup_now()
        except Exception:  # noqa: BLE001 - a missed backup must never break the app
            pass

    def flush(self) -> None:
        """Run a pending backup immediately (app shutdown)."""
        with self._lock:
            pending, self._timer = self._timer, None
        if pending:
            pending.cancel()
            self._quiet_backup()

    # ---- restore ---------------------------------------------------------------
    def restore(self) -> dict:
        folder = self._dir()
        source = os.path.join(folder, BACKUP_NAME) if folder else ""
        if not source or not os.path.exists(source):
            raise FileNotFoundError("No library backup found in the output folder")
        check = sqlite3.connect(source)
        try:
            if check.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
                raise ValueError("The backup file is damaged")
            check.execute("SELECT count(*) FROM items")
        finally:
            check.close()
        with self.engine._lock:
            if self.engine.lib is not None:
                self.engine.lib._close()
            if DB_PATH.exists():
                shutil.copy2(DB_PATH, f"{DB_PATH}.before-restore")
            shutil.copy2(source, DB_PATH)
        self.engine.apply_settings(self.engine.settings, persist=False)
        return {"tracks": len(self.engine.lib.items())}

    # ---- path rebase -------------------------------------------------------------
    @staticmethod
    def _swap(path: str, old: str, new: str) -> str | None:
        norm = os.path.normpath(path)
        if norm == old or norm.startswith(old + os.sep):
            return new + norm[len(old):]
        return None

    def rebase(self, old: str, new: str, dry_run: bool = True) -> dict:
        old, new = (os.path.normpath(os.path.abspath(os.path.expanduser(p.strip()))) for p in (old, new))
        if not old or not new or old == new:
            raise ValueError("Enter two different folders")
        items = list(self.engine.lib.items())
        matches = [(i, p) for i in items if (p := self._swap(item_path(i), old, new))]
        present = sum(1 for _i, p in matches if os.path.exists(p))
        result = {"matched": len(matches), "found_at_new": present, "total": len(items), "applied": False}
        if dry_run or not matches:
            return result
        with self.engine.lib.transaction():
            for item, path in matches:
                item.path = os.fsencode(path)
                item.store()
            for album in self.engine.lib.albums():
                art = os.fsdecode(album.artpath) if album.artpath else ""
                swapped = self._swap(art, old, new) if art else None
                if swapped:
                    album.artpath = os.fsencode(swapped)
                    album.store()
        result["applied"] = True
        self.schedule()
        return result
