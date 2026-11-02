"""Animated album covers (Apple-Music style looping videos) found next to raw audio.

Two shapes are recognised: `square` (1:1) and `tall` (portrait, e.g. 3:4). The file names don't matter;
a video in the same folder as the audio (or the folder above, for multi-disc albums) belongs to that album.
Inside the library they are stored as `animated-cover-square.<ext>` / `animated-cover-tall.<ext>`.
"""
import json
import os
import shutil
import subprocess

VIDEO_EXTENSIONS = {".mp4", ".m4v", ".mov", ".webm", ".mkv", ".gif"}
PREFIX = "animated-cover-"


def probe(path: str) -> dict | None:
    """Return {"audio": bool, "width": int, "height": int} or None when ffprobe can't read the file."""
    if not shutil.which("ffprobe"):
        return None
    try:
        out = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "stream=codec_type,width,height", "-of", "json", path],
            capture_output=True, text=True, timeout=20, check=True,
        ).stdout
        streams = json.loads(out).get("streams", [])
    except (subprocess.SubprocessError, OSError, ValueError):
        return None
    video = next((s for s in streams if s.get("codec_type") == "video" and s.get("width")), None)
    return {"audio": any(s.get("codec_type") == "audio" for s in streams), "width": (video or {}).get("width", 0), "height": (video or {}).get("height", 0)}


def shape(info: dict | None) -> str | None:
    if not info or info["audio"] or not info["width"] or not info["height"]:
        return None
    ratio = info["width"] / info["height"]
    if abs(ratio - 1) <= 0.08:
        return "square"
    return "tall" if ratio < 0.92 else None


def classify(path: str) -> str | None:
    return shape(probe(path))


def folder_covers(directory: str, index: dict[str, dict[str, str]]) -> dict[str, str]:
    """Covers for a folder: its own, completed by the parent folder's (multi-disc layouts)."""
    merged = dict(index.get(os.path.dirname(directory), {}))
    merged.update(index.get(directory, {}))
    return merged


def install(sources: dict[str, str], destination_dir: str) -> list[str]:
    """Copy the animated covers into an album folder; returns the shapes that were written."""
    written = []
    for kind, source in sources.items():
        target = os.path.join(destination_dir, f"{PREFIX}{kind}{os.path.splitext(source)[1].lower()}")
        if os.path.exists(target):
            written.append(kind)
            continue
        try:
            os.makedirs(destination_dir, exist_ok=True)
            shutil.copy2(source, target)
            written.append(kind)
        except OSError:
            pass
    return written


def find(directory: str, kind: str) -> str | None:
    try:
        names = sorted(os.listdir(directory))
    except OSError:
        return None
    for name in names:
        stem, ext = os.path.splitext(name)
        if stem == f"{PREFIX}{kind}" and ext.lower() in VIDEO_EXTENSIONS:
            return os.path.join(directory, name)
    return None


def remove(directory: str, kind: str) -> bool:
    removed = False
    while (existing := find(directory, kind)) is not None:
        os.remove(existing)
        removed = True
    return removed


def store(directory: str, source: str, ext: str, kind: str | None = None) -> str:
    """Install an uploaded video as the album's animated cover, replacing the previous one of that shape.
    The shape is detected from the picture's aspect ratio unless `kind` forces it."""
    ext = ext.lower()
    if ext not in VIDEO_EXTENSIONS:
        raise ValueError(f"Unsupported video type {ext or '(none)'}; use mp4, m4v, mov, webm, mkv or gif")
    detected = classify(source)
    if kind not in ("square", "tall"):
        kind = detected
    if kind is None:
        raise ValueError("Could not tell if the video is tall or square (ratio should be about 1:1 or portrait such as 3:4)")
    remove(directory, kind)
    shutil.copy2(source, os.path.join(directory, f"{PREFIX}{kind}{ext}"))
    return kind
