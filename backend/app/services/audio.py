"""Channel counting that sees through what mutagen misreports (E-AC-3/Atmos in .m4a/.mp4 reads as stereo, multi-stream files)."""
import functools
import json
import os
import shutil
import subprocess


@functools.lru_cache(maxsize=4096)
def _probe(path: str, mtime: float) -> int | None:
    exe = shutil.which("ffprobe")
    if not exe:
        return None
    try:
        out = subprocess.run(
            [exe, "-v", "error", "-select_streams", "a", "-show_entries", "stream=channels", "-of", "json", path],
            capture_output=True, text=True, timeout=30,
        ).stdout
        counts = [int(s["channels"]) for s in json.loads(out).get("streams", []) if s.get("channels")]
        return max(counts) if counts else None
    except (OSError, subprocess.SubprocessError, ValueError, KeyError):
        return None


def probe_channels(path: str) -> int | None:
    """Highest channel count over all audio streams, as ffprobe sees it."""
    try:
        mtime = os.path.getmtime(path)
    except OSError:
        return None
    return _probe(path, mtime)


def channel_count(path: str, reported: int | None) -> int:
    """The larger of the tag reader's count and ffprobe's, so surround is never missed."""
    return max(reported or 2, probe_channels(path) or 0)
