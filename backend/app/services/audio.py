"""Channel counting that sees through containers mutagen misreports (E-AC-3/Atmos in .m4a reads as stereo)."""
import json
import shutil
import subprocess

_MP4_LIKE = {".m4a", ".mp4", ".m4b", ".aac"}


def probe_channels(path: str) -> int | None:
    exe = shutil.which("ffprobe")
    if not exe:
        return None
    try:
        out = subprocess.run(
            [exe, "-v", "error", "-select_streams", "a:0", "-show_entries", "stream=channels", "-of", "json", path],
            capture_output=True, text=True, timeout=20,
        ).stdout
        return int(json.loads(out)["streams"][0]["channels"])
    except (OSError, subprocess.SubprocessError, ValueError, KeyError, IndexError):
        return None


def channel_count(path: str, reported: int | None) -> int:
    """Trust mutagen unless it says stereo/mono for an MP4 container, where it's often wrong."""
    reported = reported or 2
    if reported <= 2 and path.lower().endswith(tuple(_MP4_LIKE)):
        return max(reported, probe_channels(path) or 0)
    return reported
