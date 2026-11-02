import importlib.util
import os
import shutil

CHECKS = [
    ("ffmpeg", "binary", "ffmpeg", "ReplayGain loudness analysis"),
    ("essentia", "essentia", "essentia", "Best key + BPM detection (Python wheel on Linux/macOS, essentia.js via Node on Windows)", True),
    ("fpcalc", "binary", "fpcalc", "AcoustID audio fingerprinting"),
    ("pyacoustid", "module", "acoustid", "AcoustID lookups (chroma)"),
    ("discogs-client", "module", "discogs_client", "Discogs metadata fallback"),
    ("Pillow", "module", "PIL", "Artwork resizing/thumbnails"),
]


def system_health() -> list[dict]:
    report = []
    for name, kind, target, purpose, *rest in CHECKS:
        if kind == "essentia":
            from .analysis import ESSENTIA_JS

            js = shutil.which("node") is not None and os.path.isdir(os.path.join(ESSENTIA_JS, "lib"))
            ok = importlib.util.find_spec(target) is not None or js
        else:
            ok = shutil.which(target) is not None if kind == "binary" else importlib.util.find_spec(target) is not None
        report.append({"name": name, "ok": ok, "purpose": purpose, "optional": bool(rest)})
    return report
