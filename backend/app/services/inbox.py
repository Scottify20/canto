"""Inbox: inspect the input folder, resolve duplicates and import the chosen files."""
import os
import subprocess
import sys
import threading
from concurrent.futures import ThreadPoolExecutor

from mediafile import MediaFile

from ..core.jobs import Job
from ..core.settings import BEETS_DIR
from ..lyrics.service import LyricsService
from . import analysis, animated, covers
from .audio import channel_count
from .beets_engine import AUDIO_EXTENSIONS, BeetsEngine
from .tracks import SIDECAR_EXTS, cluster_duplicates, dup_key, item_path, quality

CHUNK = 25
MAX_FILES = 5000


class InboxService:
    def __init__(self, engine: BeetsEngine, tracks, lyrics: LyricsService):
        self.engine = engine
        self.tracks = tracks
        self.lyrics = lyrics

    # ---- scanning ------------------------------------------------------------
    @staticmethod
    def _walk(root: str) -> tuple[list[str], dict[str, dict[str, str]]]:
        """Audio files plus, per folder, the animated cover videos ({dir: {"square"|"tall": path}})."""
        found: list[str] = []
        videos: dict[str, dict[str, str]] = {}
        for base, _dirs, files in os.walk(root):
            for name in sorted(files):
                ext = os.path.splitext(name)[1].lower()
                path = os.path.join(base, name)
                if ext in animated.VIDEO_EXTENSIONS:  # .mp4 is both: a video-only file is a cover, not a song
                    info = animated.probe(path)
                    kind = animated.shape(info)
                    if kind:
                        videos.setdefault(base, {}).setdefault(kind, path)
                    if kind or ext != ".mp4" or (info and not info["audio"]):
                        continue
                if ext in AUDIO_EXTENSIONS:
                    found.append(path)
            if len(found) >= MAX_FILES:
                break
        return found[:MAX_FILES], videos

    @staticmethod
    def _read(path: str, root: str) -> dict:
        stem = os.path.splitext(path)[0]
        row = {
            "path": path, "rel": os.path.relpath(path, root), "size": 0, "title": "", "artist": "", "album": "",
            "length": 0.0, "format": "", "bitrate": 0, "channels": 2, "animated": [], "has_cover": False, "corrupt": False,
            "has_lrc": os.path.exists(stem + ".lrc"), "has_ttml": os.path.exists(stem + ".ttml"),
            "has_txt": os.path.exists(stem + ".txt"), "status": "new", "dup_of": None,
        }
        try:
            row["size"] = os.path.getsize(path)
            media = MediaFile(path)
            row.update(
                title=media.title or os.path.splitext(os.path.basename(path))[0], artist=media.artist or media.albumartist or "",
                album=media.album or "", length=round(media.length or 0, 1), format=media.type or "", bitrate=media.bitrate or 0, channels=channel_count(path, media.channels),
                has_cover=covers.has_embedded_art(path),
            )
            if not media.length:
                row["corrupt"] = True
        except Exception:  # noqa: BLE001
            row["corrupt"] = True
            row["title"] = os.path.splitext(os.path.basename(path))[0]
        if row["corrupt"]:
            row["status"] = "corrupt"
        return row

    def scan(self, root: str) -> dict:
        if not os.path.isdir(root):
            raise NotADirectoryError(f"Input folder not found: {root}")
        paths, videos = self._walk(root)
        with ThreadPoolExecutor(max_workers=8) as pool:
            rows = list(pool.map(lambda p: self._read(p, root), paths))
        for row in rows:
            row["animated_files"] = animated.folder_covers(os.path.dirname(row["path"]), videos)
            row["animated"] = sorted(row["animated_files"])
        self._mark_duplicates(rows)
        counts: dict[str, int] = {}
        for row in rows:
            counts[row["status"]] = counts.get(row["status"], 0) + 1
        return {"root": root, "files": rows, "counts": counts, "truncated": len(paths) >= MAX_FILES}

    def _mark_duplicates(self, rows: list[dict]) -> None:
        """Flag files already in the library, and the lower-quality copies among identical inbox files."""
        library: dict[str, list] = {}
        for item in self.engine.lib.items():
            library.setdefault(dup_key(item.artist, item.title, item.get("channels") or 2), []).append(item)
        for row in rows:
            if row["corrupt"]:
                continue
            for item in library.get(dup_key(row["artist"], row["title"], row["channels"]), []):
                if abs((item.length or 0) - row["length"]) <= 3.0:
                    row["status"], row["dup_of"] = "in_library", {"id": item.id, "path": item_path(item), "exists": os.path.exists(item_path(item))}
                    break
        pending = [dict(r, key=dup_key(r["artist"], r["title"], r["channels"]), row=r) for r in rows if r["status"] == "new"]
        for group in cluster_duplicates(pending):
            keep = max(group, key=lambda r: (r["format"].upper() in {"FLAC", "ALAC", "WAV"}, r["bitrate"], r["size"]))
            for member in group:
                if member is not keep:
                    member["row"]["status"], member["row"]["dup_of"] = "in_inbox", {"path": keep["path"]}

    # ---- importing -----------------------------------------------------------
    def run_import(self, job: Job, files: list[str] | None) -> None:
        settings = self.engine.settings
        root = settings.input_path
        scan = self.scan(root)
        wanted = set(files) if files else None
        rows = [r for r in scan["files"] if wanted is None or r["path"] in wanted]
        action = settings.duplicate_action
        queue: list[str] = []
        skipped_dup = replaced = corrupt = 0
        for row in rows:
            if row["status"] == "corrupt":
                corrupt += 1
                job.write(f"[Skipped] {row['rel']} (unreadable / corrupt audio)")
            elif row["status"] in ("in_library", "in_inbox") and action == "skip":
                skipped_dup += 1
                job.write(f"[Duplicate] {row['rel']} (already {'in the library' if row['status'] == 'in_library' else 'present in the inbox'})")
            elif row["status"] == "in_library" and action == "replace":
                self._replace(row, job)
                replaced += 1
                queue.append(row["path"])
            elif row["status"] == "in_inbox" and action == "replace":
                skipped_dup += 1
                job.write(f"[Duplicate] {row['rel']} (lower-quality copy of another inbox file)")
            else:
                queue.append(row["path"])
        job.total = len(queue)
        before = {i.id for i in self.engine.lib.items()}
        job.message = "Importing…"
        for start in range(0, len(queue), CHUNK):
            if job.cancelled:
                break
            self._run_beets(job, queue[start:start + CHUNK])
            job.done = min(job.total, len({i.id for i in self.engine.lib.items()} - before))
        new_items = [i for i in self.engine.lib.items() if i.id not in before]
        self._post_process(job, new_items)
        self._place_animated_covers(job, new_items, rows)
        if settings.delete_originals and settings.prune_empty_dirs:
            self._prune_empty(root)
        parts = [f"Imported {len(new_items)} track(s)"]
        if skipped_dup:
            parts.append(f"{skipped_dup} duplicate(s) skipped")
        if replaced:
            parts.append(f"{replaced} replaced")
        if corrupt:
            parts.append(f"{corrupt} unreadable")
        job.message = ", ".join(parts)
        job.write(f"[Done] {job.message}")

    def _replace(self, row: dict, job: Job) -> None:
        old = row["dup_of"]
        self.tracks.remove([old["id"]], delete_files=True)
        job.write(f"[Replaced] {row['rel']} (old copy deleted)")

    def _run_beets(self, job: Job, paths: list[str]) -> None:
        process = subprocess.Popen(
            [sys.executable, "-m", "beets", "import", "-q", "-s", *paths],
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, env={**os.environ, "BEETSDIR": str(BEETS_DIR)},
        )
        job.on_cancel = process.terminate

        def pump() -> None:
            for line in process.stdout:  # type: ignore[union-attr]
                text = line.strip()
                if text and "Skipping" not in text:
                    job.write(os.path.basename(text) if os.sep in text else text)

        reader = threading.Thread(target=pump, daemon=True)
        reader.start()
        process.wait()
        reader.join(timeout=2)
        if process.returncode not in (0, None) and not job.cancelled:
            job.write(f"[Error] beets exited with code {process.returncode}")

    def _place_animated_covers(self, job: Job, items: list, rows: list[dict]) -> None:
        by_key = {dup_key(r["artist"], r["title"], r["channels"]): r for r in rows if r.get("animated_files")}
        sources: set[str] = set()
        albums = 0
        for item in items:
            item = self.engine.lib.get_item(item.id)  # re-read: multi-channel routing may have moved it
            row = by_key.get(dup_key(item.artist, item.title, item.get("channels") or 2)) if item else None
            if not row:
                continue
            directory = os.path.dirname(item_path(item))
            if not any(f.startswith(animated.PREFIX) for f in os.listdir(directory)):
                albums += 1
            if animated.install(row["animated_files"], directory):
                sources.update(row["animated_files"].values())
        if albums:
            job.write(f"[Animated cover] copied to {albums} album folder(s)")
        if self.engine.settings.delete_originals:
            for source in sources:
                try:
                    os.remove(source)
                except OSError:
                    pass

    def _post_process(self, job: Job, items: list) -> None:
        """Normalize lyric sidecars and guarantee analysis/artwork after import."""
        if not items:
            return
        moved = self.tracks.route_multichannel(items)
        if moved:
            job.write(f"[Multi-channel] {moved} surround/Atmos track(s) filed in the multi-channel folder")
        for item in items:
            if job.cancelled:
                break
            ttml_path = os.path.splitext(item_path(item))[0] + ".ttml"
            had_ttml = os.path.exists(ttml_path)
            if had_ttml:
                lyrics = self.lyrics.read_lyrics(item.id)
                if not lyrics["ttml"]:
                    action = "converted to LRC" if lyrics["lrc"] else "removed (not usable timed lyrics)"
                    job.write(f"[Lyrics] {item.artist} - {item.title}: existing TTML {action}")
        job.message = "Analysing loudness & key, adding artwork…"
        analysis.run_analysis(_Quiet(job), self.engine.lib, [i.id for i in items])
        for item in items:
            path = item_path(item)
            if job.cancelled or not os.path.exists(path) or covers.has_embedded_art(path):
                continue
            try:
                data = covers.best_remote_cover(item.albumartist or item.artist, item.album, item.title)
                if data:
                    covers.embed_cover(path, data)
                    job.write(f"[Artwork] {item.artist} - {item.title}")
            except Exception:  # noqa: BLE001 - artwork is best effort
                pass

    @staticmethod
    def _prune_empty(root: str) -> None:
        for base, _dirs, _files in os.walk(root, topdown=False):
            if base != root:
                try:
                    os.rmdir(base)  # only succeeds when empty
                except OSError:
                    pass


class _Quiet:
    """Forward analysis progress to the import job without clobbering its counters."""

    def __init__(self, job: Job):
        self._job = job
        self.total = self.done = 0
        self.message = ""

    @property
    def cancelled(self):
        return self._job.cancelled

    @property
    def on_cancel(self):
        return self._job.on_cancel

    @on_cancel.setter
    def on_cancel(self, fn):
        self._job.on_cancel = fn

    def write(self, line: str) -> None:
        if not line.startswith("[Done]"):
            self._job.write(line)
