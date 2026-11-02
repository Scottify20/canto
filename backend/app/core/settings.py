import json
import os
import threading
from dataclasses import asdict, dataclass, field
from pathlib import Path

import yaml

BACKEND_DIR = Path(__file__).resolve().parents[2]
BEETS_DIR = Path(os.environ.get("CANTO_DATA_DIR", BACKEND_DIR / "beets_data"))
CONFIG_PATH = BEETS_DIR / "config.yaml"
DB_PATH = BEETS_DIR / "musiclibrary.db"
SETTINGS_PATH = BEETS_DIR / "canto_settings.json"
PLUGIN_DIR = BACKEND_DIR / "beets_plugins"

DEFAULT_STRUCTURE = "$albumartist/$album/$title"


@dataclass
class Settings:
    input_path: str = ""
    output_path: str = ""
    folder_structure: str = DEFAULT_STRUCTURE
    tolerance: float = 0.04
    discogs_token: str = ""
    delete_originals: bool = False  # move instead of copy on import
    duplicate_action: str = "skip"  # skip | keep | replace
    prune_empty_dirs: bool = True
    # Multi-channel (5.1 / 7.1 / Atmos) files: optional separate library root, and a loudness offset
    # applied on top of the stereo-downmix measurement so they sit level with stereo music.
    multichannel_path: str = ""
    multichannel_gain_offset: float = 0.0
    # Lyrics providers: id -> {"enabled": bool, "keys": {field: value}}; order = priority.
    lyrics_order: list = field(default_factory=list)
    lyrics_providers: dict = field(default_factory=dict)


_lock = threading.Lock()


def _bootstrap_from_beets_config() -> Settings:
    """Adopt the directory/path format of a pre-existing beets config."""
    settings = Settings()
    try:
        data = yaml.safe_load(CONFIG_PATH.read_text()) or {}
        settings.output_path = str(data.get("directory") or "")
        settings.folder_structure = (data.get("paths") or {}).get("default", DEFAULT_STRUCTURE)
        settings.tolerance = float((data.get("match") or {}).get("strong_rec_thresh", 0.04))
    except Exception:
        pass
    return settings


def load_settings() -> Settings:
    with _lock:
        if SETTINGS_PATH.exists():
            try:
                raw = json.loads(SETTINGS_PATH.read_text())
                known = {k: v for k, v in raw.items() if k in Settings.__dataclass_fields__}
                settings = Settings(**known)
                legacy = raw.get("musixmatch_token")
                if legacy:  # migrate the old single-token field
                    entry = settings.lyrics_providers.setdefault("musixmatch", {"enabled": True, "keys": {}})
                    entry["keys"].setdefault("token", legacy)
                return settings
            except Exception:
                pass
        return _bootstrap_from_beets_config()


def save_settings(settings: Settings) -> None:
    with _lock:
        os.makedirs(BEETS_DIR, exist_ok=True)
        SETTINGS_PATH.write_text(json.dumps(asdict(settings), indent=2))
