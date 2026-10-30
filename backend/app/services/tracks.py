import io
import os
import re
from concurrent.futures import ThreadPoolExecutor
from functools import lru_cache

from beets import util as beets_util
from PIL import Image

from . import covers
from .beets_engine import BeetsEngine

TEXT_FIELDS = ["title", "artist", "albumartist", "album", "subtitle", "grouping", "comments", "label", "catalognum", "isrc", "language", "initial_key"]
LIST_FIELDS = ["genres", "composers", "lyricists", "arrangers", "remixers"]
INT_FIELDS = ["year", "month", "day", "track", "tracktotal", "disc", "disctotal", "bpm"]
EDITABLE_FIELDS = set(TEXT_FIELDS + LIST_FIELDS + INT_FIELDS + ["genre", "comp"])
PROVENANCE_FIELDS = {"mb_trackid", "mb_albumid", "mb_artistid", "mb_albumartistid"}
SIDECAR_EXTS = (".lrc", ".ttml", ".txt")
DUP_TOLERANCE = 3.0  # seconds


def item_path(item) -> str:
    return os.fsdecode(item.path)


def sidecar_base(item) -> str:
    return os.path.splitext(item_path(item))[0]


def dup_key(artist: str, title: str) -> str:
    from ..lyrics.text import primary_artist

    squash = lambda v: re.sub(r"[^\w]+", "", (v or "").casefold())  # noqa: E731
    return f"{squash(primary_artist(artist))}|{squash(title)}"


def cluster_duplicates(rows: list[dict]) -> list[list[dict]]:
    """Group rows ({key, length, ...}) with equal key and lengths within the tolerance."""
    by_key: dict[str, list[dict]] = {}
    for row in rows:
        by_key.setdefault(row["key"], []).append(row)
    groups = []
    for members in by_key.values():
        members.sort(key=lambda r: r["length"] or 0)
        current = [members[0]]
        for row in members[1:]:
            if abs((row["length"] or 0) - (current[-1]["length"] or 0)) <= DUP_TOLERANCE:
                current.append(row)
            else:
                groups.append(current)
                current = [row]
        groups.append(current)
    return [g for g in groups if len(g) > 1]


def quality(row: dict) -> tuple:
    lossless = row.get("format", "").upper() in {"FLAC", "ALAC", "WAV", "AIFF", "APE", "WV"}
    extras = int(row.get("has_lrc", False)) + int(row.get("has_ttml", False)) + int(row.get("has_cover", False))
    return (row.get("exists", False), lossless, row.get("bitrate") or 0, extras)


class TrackService:
    def __init__(self, engine: BeetsEngine):
        self.engine = engine
        self._art_cache: dict[tuple, bool] = {}

    @property
    def lib(self):
        return self.engine.lib

    # ---- listing -----------------------------------------------------------
    def _has_cover(self, path: str, exists: bool) -> bool:
        if not exists:
            return False
        try:
            key = (path, os.path.getmtime(path))
        except OSError:
            return False
        if key not in self._art_cache:
            self._art_cache[key] = covers.has_embedded_art(path)
        return self._art_cache[key]

    def _serialize(self, item, dir_cache: dict[str, set[str]]) -> dict:
        path = item_path(item)
        directory, name = os.path.split(path)
        if directory not in dir_cache:
            try:
                dir_cache[directory] = set(os.listdir(directory))
            except OSError:
                dir_cache[directory] = set()
        siblings = dir_cache[directory]
        stem = os.path.splitext(name)[0]
        exists = name in siblings
        return {
            "id": item.id,
            "title": item.title,
            "artist": item.artist,
            "albumartist": item.albumartist,
            "album": item.album,
            "year": item.year or "",
            "genre": ", ".join(item.genres or []),
            "track": item.track or "",
            "length": round(item.length or 0, 1),
            "format": item.format,
            "bitrate": item.bitrate,
            "rg_track_gain": item.get("rg_track_gain", ""),
            "initial_key": item.get("initial_key", ""),
            "path": path,
            "exists": exists,
            "has_lrc": f"{stem}.lrc" in siblings,
            "has_ttml": f"{stem}.ttml" in siblings,
            "has_cover": False,
            "dup_group": None,
        }

    def list_tracks(self) -> list[dict]:
        cache: dict[str, set[str]] = {}
        rows = [self._serialize(i, cache) for i in self.lib.items()]
        with ThreadPoolExecutor(max_workers=8) as pool:
            for row, has in zip(rows, pool.map(lambda r: self._has_cover(r["path"], r["exists"]), rows)):
                row["has_cover"] = has
        for number, group in enumerate(cluster_duplicates(self._dup_rows(rows)), start=1):
            for member in group:
                member["row"]["dup_group"] = number
        return rows

    @staticmethod
    def _dup_rows(rows: list[dict]) -> list[dict]:
        return [{"key": dup_key(r["artist"], r["title"]), "length": r["length"], "row": r, **r} for r in rows]

    def get_track(self, item_id: int) -> dict | None:
        item = self.lib.get_item(item_id)
        if not item:
            return None
        row = self._serialize(item, {})
        row["has_cover"] = self._has_cover(row["path"], row["exists"])
        return row

    def details(self, item_id: int) -> dict:
        item = self.lib.get_item(item_id)
        if not item:
            raise LookupError("Track not found")
        values = {}
        for key in TEXT_FIELDS + INT_FIELDS:
            value = item.get(key)
            values[key] = "" if value in (None, 0) else value
        for key in LIST_FIELDS:
            values[key] = ", ".join(item.get(key) or [])
        values["comp"] = bool(item.get("comp"))
        values["genre"] = values.pop("genres")
        return {"track": self.get_track(item_id), "fields": values}

    # ---- tag editing -------------------------------------------------------
    def update_tags(self, item_id: int, tags: dict) -> dict:
        item = self.lib.get_item(item_id)
        if not item:
            raise LookupError("Track not found")
        if not os.path.exists(item_path(item)):
            raise FileNotFoundError("Audio file is missing on disk — remove the entry or re-import the file")
        tags = {("genres" if k == "genre" else k): v for k, v in tags.items()}
        old_dir = os.path.dirname(item_path(item))
        for key, value in tags.items():
            if key in LIST_FIELDS:
                setattr(item, key, [g.strip() for g in re.split(r"[;,/]", str(value)) if g.strip()])
            elif key in INT_FIELDS:
                setattr(item, key, int(value) if str(value).strip().isdigit() else 0)
            elif key == "comp":
                item.comp = bool(value)
            elif key in TEXT_FIELDS or key in PROVENANCE_FIELDS:
                setattr(item, key, "" if value is None else str(value))
        self._reconcile_album(item, tags)
        item.try_sync(write=True, move=True)
        new_dir = os.path.dirname(item_path(item))
        if new_dir != old_dir:
            beets_util.prune_dirs(old_dir, root=self.lib.directory)
        return self.get_track(item_id)

    @staticmethod
    def _reconcile_album(item, tags: dict) -> None:
        """Album-level fields override item fields in path templates, so keep them in step.

        A track that shares its album with others is detached (becoming a standalone item) so
        that retagging it doesn't rename the whole album; a lone track updates its album too.
        """
        album = item.get_album()
        if not album or not (set(tags) & {"album", "albumartist", "year", "genres"}):
            return
        if any(other.id != item.id for other in album.items()):
            item.album_id = None
            return
        for key in ("album", "albumartist", "year"):
            if key in tags and tags[key] not in (None, ""):
                album[key] = getattr(item, key)
        if "genres" in tags:
            album["genres"] = item.genres
        album.store()

    # ---- lyrics files ------------------------------------------------------
    def delete_lyrics(self, item_id: int, kind: str) -> None:
        item = self.lib.get_item(item_id)
        if not item or kind not in ("lrc", "ttml"):
            raise LookupError("Track not found")
        target = f"{sidecar_base(item)}.{kind}"
        if os.path.exists(target):
            os.remove(target)

    # ---- removal / cleanup --------------------------------------------------
    def remove(self, ids: list[int], delete_files: bool) -> int:
        removed = 0
        for item_id in ids:
            item = self.lib.get_item(item_id)
            if not item:
                continue
            path = item_path(item)
            if delete_files:
                for ext in SIDECAR_EXTS:
                    side = f"{sidecar_base(item)}{ext}"
                    if os.path.exists(side):
                        os.remove(side)
            item.remove(delete=delete_files, with_album=False)
            if delete_files:
                beets_util.prune_dirs(os.path.dirname(path), root=self.lib.directory)
            removed += 1
        return removed

    def clear(self, delete_files: bool) -> int:
        return self.remove([i.id for i in self.lib.items()], delete_files)

    def prune_missing(self) -> int:
        gone = [i.id for i in self.lib.items() if not os.path.exists(item_path(i))]
        return self.remove(gone, delete_files=False)

    def duplicates(self) -> list[dict]:
        rows = self.list_tracks()
        out = []
        for group in cluster_duplicates(self._dup_rows(rows)):
            members = [m["row"] for m in group]
            keep = max(members, key=quality)
            out.append({"keep_id": keep["id"], "tracks": members})
        return out

    # ---- artwork ---------------------------------------------------------------
    def _existing(self, item_id: int):
        item = self.lib.get_item(item_id)
        if not item:
            raise LookupError("Track not found")
        if not os.path.exists(item_path(item)):
            raise FileNotFoundError("Audio file is missing on disk")
        return item

    def cover_info(self, item_id: int) -> dict:
        return covers.cover_info(item_path(self._existing(item_id)))

    def set_cover(self, item_id: int, data: bytes) -> dict:
        item = self._existing(item_id)
        info = covers.embed_cover(item_path(item), data)
        self._thumbnail.cache_clear()
        return info

    def remove_cover(self, item_id: int) -> None:
        covers.remove_cover(item_path(self._existing(item_id)))
        self._thumbnail.cache_clear()

    def cover_candidates(self, item_id: int) -> dict:
        item = self.lib.get_item(item_id)
        if not item:
            raise LookupError("Track not found")
        found, notes = covers.find_candidates(item.albumartist or item.artist, item.album, item.title)
        return {"candidates": found, "notes": notes}

    def set_cover_from_url(self, item_id: int, url: str) -> dict:
        return self.set_cover(item_id, covers.download_image(url))

    def fetch_missing_covers(self, job, ids: list[int] | None, overwrite: bool = False) -> None:
        items = [self.lib.get_item(i) for i in ids] if ids else list(self.lib.items())
        items = [i for i in items if i]
        job.total = len(items)
        job.message = "Looking for album artwork…"
        added = 0
        for item in items:
            if job.cancelled:
                break
            job.done += 1
            path = item_path(item)
            name = f"{item.artist} - {item.title}"
            if not os.path.exists(path):
                job.write(f"[Error] {name} (audio file is missing)")
                continue
            if not overwrite and covers.has_embedded_art(path):
                job.write(f"[Skipped] {name} (already has artwork)")
                continue
            try:
                data = covers.best_remote_cover(item.albumartist or item.artist, item.album, item.title)
                if data:
                    covers.embed_cover(path, data)
                    added += 1
                    job.write(f"[Success] {name} (artwork embedded)")
                else:
                    job.write(f"[Not Found] {name}")
            except Exception as exc:  # noqa: BLE001
                job.write(f"[Error] {name} ({exc})")
        self._thumbnail.cache_clear()
        job.message = f"Embedded artwork for {added} track(s)"
        job.write(f"[Done] {job.message}")

    @lru_cache(maxsize=512)  # noqa: B019
    def _thumbnail(self, path: str, mtime: float, size: int) -> bytes | None:
        try:
            data = covers.read_cover(path)
        except Exception:  # noqa: BLE001
            return None
        if not data:
            return None
        with Image.open(io.BytesIO(data)) as img:
            img = img.convert("RGB")
            img.thumbnail((size, size))
            out = io.BytesIO()
            img.save(out, "JPEG", quality=82)
            return out.getvalue()

    def cover(self, item_id: int, size: int = 96) -> bytes | None:
        item = self.lib.get_item(item_id)
        if not item:
            return None
        path = item_path(item)
        try:
            return self._thumbnail(path, os.path.getmtime(path), size)
        except OSError:
            return None
