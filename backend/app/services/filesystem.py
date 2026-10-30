import os
from pathlib import Path

from .beets_engine import AUDIO_EXTENSIONS


def list_directory(path: str | None) -> dict:
    target = Path(os.path.expanduser(path)) if path else Path.home()
    if not target.is_dir():
        raise NotADirectoryError(f"Not a folder: {target}")
    target = target.resolve()
    dirs, audio = [], 0
    try:
        with os.scandir(target) as entries:
            for entry in entries:
                if entry.name.startswith("."):
                    continue
                try:
                    if entry.is_dir():
                        dirs.append({"name": entry.name, "path": entry.path})
                    elif os.path.splitext(entry.name)[1].lower() in AUDIO_EXTENSIONS:
                        audio += 1
                except OSError:
                    continue
    except PermissionError:
        raise PermissionError(f"No permission to read {target}")
    dirs.sort(key=lambda d: d["name"].lower())
    parent = str(target.parent) if target.parent != target else None
    return {"path": str(target), "parent": parent, "dirs": dirs, "audio_count": audio}
