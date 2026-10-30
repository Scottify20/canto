"""Housekeeping: stale temp files, empty folders, orphaned sidecars, old database backups."""
import glob
import os

from ..core import http as http_client
from ..core.settings import BEETS_DIR
from .beets_engine import AUDIO_EXTENSIONS, BeetsEngine
from .tracks import SIDECAR_EXTS, item_path

ACTIONS = ("missing", "tmp", "empty_dirs", "orphans", "db_backups", "http_cache")


class MaintenanceService:
    def __init__(self, engine: BeetsEngine, tracks):
        self.engine = engine
        self.tracks = tracks

    def _roots(self) -> list[str]:
        s = self.engine.settings
        return [p for p in {s.output_path, s.input_path} if p and os.path.isdir(p)]

    def _tmp_files(self) -> list[str]:
        found = []
        for base, _dirs, files in os.walk(self.engine.settings.output_path or "/nonexistent"):
            found.extend(os.path.join(base, f) for f in files if f.endswith(".tmp"))
        return found

    def _empty_dirs(self) -> list[str]:
        found = []
        for root in self._roots():
            for base, dirs, files in os.walk(root, topdown=False):
                if base != root and not os.listdir(base):
                    found.append(base)
        return found

    def _orphans(self) -> list[str]:
        found = []
        output = self.engine.settings.output_path
        for base, _dirs, files in os.walk(output or "/nonexistent"):
            stems = {os.path.splitext(f)[0] for f in files if os.path.splitext(f)[1].lower() in AUDIO_EXTENSIONS}
            for f in files:
                stem, ext = os.path.splitext(f)
                if ext.lower() in SIDECAR_EXTS and stem not in stems and stem.rsplit(".", 1)[0] not in stems:
                    found.append(os.path.join(base, f))
        return found

    @staticmethod
    def _db_backups() -> list[str]:
        return glob.glob(str(BEETS_DIR / "musiclibrary.db-before-*.bak"))

    def _missing(self) -> list[int]:
        return [i.id for i in self.engine.lib.items() if not os.path.exists(item_path(i))]

    @staticmethod
    def _size(paths: list[str]) -> int:
        return sum(os.path.getsize(p) for p in paths if os.path.isfile(p))

    def scan(self) -> dict:
        tmp, orphans, backups = self._tmp_files(), self._orphans(), self._db_backups()
        cache_n, cache_b = http_client.cache_stats()
        return {
            "missing": {"count": len(self._missing()), "label": "Library entries whose audio file no longer exists"},
            "tmp": {"count": len(tmp), "bytes": self._size(tmp), "label": "Leftover temporary files from interrupted writes"},
            "empty_dirs": {"count": len(self._empty_dirs()), "label": "Empty folders in the input and output directories"},
            "orphans": {"count": len(orphans), "bytes": self._size(orphans), "label": "Lyrics/text files with no matching audio file", "examples": orphans[:5]},
            "db_backups": {"count": len(backups), "bytes": self._size(backups), "label": "Automatic database backups made by Beets migrations"},
            "http_cache": {"count": cache_n, "bytes": cache_b, "label": "Cached provider responses (lyrics, covers, metadata lookups)"},
        }

    def run(self, actions: list[str]) -> dict:
        done = {}
        if "missing" in actions:
            done["missing"] = self.tracks.prune_missing()
        if "tmp" in actions:
            files = self._tmp_files()
            for f in files:
                os.remove(f)
            done["tmp"] = len(files)
        if "http_cache" in actions:
            done["http_cache"] = http_client.clear_cache()
        if "orphans" in actions:
            files = self._orphans()
            for f in files:
                os.remove(f)
            done["orphans"] = len(files)
        if "db_backups" in actions:
            files = self._db_backups()
            for f in files:
                os.remove(f)
            done["db_backups"] = len(files)
        if "empty_dirs" in actions:
            removed = 0
            for root in self._roots():
                for base, _dirs, _files in os.walk(root, topdown=False):
                    if base != root:
                        try:
                            os.rmdir(base)
                            removed += 1
                        except OSError:
                            pass
            done["empty_dirs"] = removed
        self.tracks._thumbnail.cache_clear()
        self.tracks._art_cache.clear()
        return done

    def quick_cleanup(self) -> None:
        """Cheap, always-safe cleanup run on startup and shutdown."""
        http_client.purge_expired()
        try:
            for f in self._tmp_files():
                os.remove(f)
        except OSError:
            pass
