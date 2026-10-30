import importlib.util
import shutil

CHECKS = [
    ("ffmpeg", "binary", "ffmpeg", "ReplayGain loudness analysis"),
    ("keyfinder-cli", "binary", "keyfinder-cli", "Musical key detection"),
    ("fpcalc", "binary", "fpcalc", "AcoustID audio fingerprinting"),
    ("pyacoustid", "module", "acoustid", "AcoustID lookups (chroma)"),
    ("discogs-client", "module", "discogs_client", "Discogs metadata fallback"),
    ("Pillow", "module", "PIL", "Artwork resizing/thumbnails"),
]


def system_health() -> list[dict]:
    report = []
    for name, kind, target, purpose in CHECKS:
        ok = shutil.which(target) is not None if kind == "binary" else importlib.util.find_spec(target) is not None
        report.append({"name": name, "ok": ok, "purpose": purpose})
    return report
