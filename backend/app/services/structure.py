"""Preview a folder-structure template against sample tracks using beets' own template engine."""
from beets.library import Item
from beets.util.functemplate import Template as template

from .beets_engine import with_fallbacks

SAMPLES = [
    {"artist": "Daft Punk", "albumartist": "Daft Punk", "album": "Random Access Memories", "title": "Get Lucky", "track": 8, "disc": 1, "year": 2013, "genres": ["Electronic"], "format": "FLAC"},
    {"artist": "Laufey, Philharmonia Orchestra", "albumartist": "", "album": "", "title": "Let You Break My Heart Again", "track": 1, "disc": 1, "year": 2024, "genres": ["Jazz"], "format": "MP3"},
]


def preview(structure: str) -> list[dict]:
    if not structure.strip():
        raise ValueError("The template is empty")
    if structure.startswith("/") or ".." in structure.split("/"):
        raise ValueError("Use a relative template (no leading '/' or '..')")
    compiled = with_fallbacks(structure)
    template(compiled)  # raises on syntax errors
    out = []
    for sample in SAMPLES:
        item = Item(**sample)
        out.append({"sample": f"{sample['artist']} – {sample['title']}", "path": item.evaluate_template(compiled, for_path=True) + "." + sample["format"].lower()})
    return out
