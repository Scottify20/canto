import os
import re
import threading
from contextvars import ContextVar

import yaml
from beets import config as beets_config
from beets import context as beets_context
from beets import plugins
from beets.library import Library

from . import analysis
from .audio import channel_count
from ..core.settings import (
    BEETS_DIR,
    CONFIG_PATH,
    DB_PATH,
    PLUGIN_DIR,
    Settings,
    load_settings,
    save_settings,
)

AUDIO_EXTENSIONS = {".mp3", ".flac", ".m4a", ".mp4", ".ogg", ".opus", ".wav", ".aac", ".wma", ".aiff", ".ape", ".wv"}
PLUGINS = ["musicbrainz", "canto_sidecar", "chroma", "mbsync"]


_multichannel_root: bytes | None = None


def _install_multichannel_routing() -> None:
    """Send files with more than two channels to their own library root (beets path formats can't change the root)."""
    from beets.library import Item

    if getattr(Item.destination, "_canto", False):
        return
    original = Item.destination

    def destination(self, relative_to_libdir=False, basedir=None, *args, **kwargs):
        if basedir is None and not relative_to_libdir and _multichannel_root and (self.get("channels") or 0) > 2:
            basedir = _multichannel_root
        return original(self, relative_to_libdir, basedir, *args, **kwargs)

    destination._canto = True  # type: ignore[attr-defined]
    Item.destination = destination  # type: ignore[method-assign]


def _install_channel_probe() -> None:
    """Item.read takes the channel count from mutagen, which reports stereo for E-AC-3 in MP4; correct it with ffprobe."""
    from beets.library import Item

    if getattr(Item.read, "_canto", False):
        return
    original = Item.read

    def read(self, read_path=None):
        original(self, read_path)
        path = os.fsdecode(read_path or self.path)
        channels = channel_count(path, self.get("channels"))
        if channels != self.get("channels"):
            self.channels = channels

    read._canto = True  # type: ignore[attr-defined]
    Item.read = read  # type: ignore[method-assign]


def set_multichannel_root(path: str) -> None:
    global _multichannel_root
    _multichannel_root = os.fsencode(os.path.abspath(os.path.expanduser(path))) if path.strip() else None
    _install_multichannel_routing()
    _install_channel_probe()


def with_fallbacks(structure: str) -> str:
    """Stop blank tags from creating empty/odd folders in path templates."""
    if "%if" in structure:
        return structure
    structure = re.sub(r"\$albumartist(?![A-Za-z_])", "%if{$albumartist,$albumartist,$artist}", structure)
    return re.sub(r"\$album(?![A-Za-z_])", "%if{$album,$album,Singles}", structure)


class BeetsEngine:
    """Owns the beets configuration and library handle shared by the API."""

    def __init__(self) -> None:
        os.makedirs(BEETS_DIR, exist_ok=True)
        os.environ["BEETSDIR"] = str(BEETS_DIR)
        self._lock = threading.RLock()
        self.settings = load_settings()
        self.lib: Library | None = None
        self.apply_settings(self.settings, persist=False)

    # ---- configuration -------------------------------------------------
    def _write_config(self, s: Settings) -> None:
        structure = with_fallbacks(s.folder_structure)
        config = {
            "directory": s.output_path or str(BEETS_DIR / "library"),
            "library": str(DB_PATH),
            "pluginpath": [str(PLUGIN_DIR)],
            "plugins": PLUGINS + (["discogs"] if s.discogs_token else []),
            "import": {
                "copy": not s.delete_originals,
                "move": s.delete_originals,
                "write": True,
                "autotag": False,
                "singletons": True,
                "quiet_fallback": "asis",
                "duplicate_action": "keep",  # Canto resolves duplicates itself before importing
                "incremental": False,
            },
            "match": {"strong_rec_thresh": s.tolerance},
            "paths": {"default": structure, "singleton": structure},
            "chroma": {"auto": False},
            "discogs": {"user_token": s.discogs_token},
            "canto_sidecar": {"extensions": [".lrc", ".ttml", ".txt"]},
        }
        CONFIG_PATH.write_text(yaml.safe_dump(config, sort_keys=False, allow_unicode=True))

    def apply_settings(self, s: Settings, persist: bool = True) -> None:
        with self._lock:
            self.settings = s
            set_multichannel_root(s.multichannel_path)
            analysis.MULTICHANNEL_OFFSET = s.multichannel_gain_offset
            if persist:
                save_settings(s)
            self._write_config(s)
            beets_config.clear()
            beets_config.read()
            plugins.load_plugins()
            if self.lib is not None:
                self.lib._close()
            self.lib = Library(str(DB_PATH), str(beets_config["directory"].as_filename()))
            # beets keeps the library root in a ContextVar, which request/job threads
            # don't inherit; rebind it with a process-wide default so every thread resolves paths.
            beets_context._music_dir_var = ContextVar("music_dir", default=self.lib.directory)

    def structure_with_fallbacks(self) -> str:
        return with_fallbacks(self.settings.folder_structure)
