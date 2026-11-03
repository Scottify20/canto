"""Detects folders that live on drives which are currently unplugged or unmounted.

An unmounted drive often leaves an empty mount-point folder behind (/mnt/d, /media/me/USB), so
`isdir` alone can't tell "offline" from "empty". Writing into it would create the library on the
system disk, and treating its files as deleted would wipe the library entries.
"""
import os
import re
import shutil

_REMOVABLE = re.compile(r"^(/mnt/[^/]+|/media/[^/]+/[^/]+|/run/media/[^/]+/[^/]+|/Volumes/[^/]+)")


def volume_online(path: str) -> bool:
    """True when the drive/volume holding `path` is present (the folder itself may not exist yet)."""
    if not path:
        return False
    full = os.path.abspath(os.path.expanduser(path))
    if os.name == "nt":
        drive = os.path.splitdrive(full)[0]
        return not drive or os.path.exists(drive + "\\")
    match = _REMOVABLE.match(full)
    if match:
        base = match.group(1)
        return os.path.ismount(base)
    return True


def root_status(path: str, must_exist: bool = True) -> dict:
    """Describe whether a configured root is usable: {"path", "ok", "reason"}."""
    path = (path or "").strip()
    if not path:
        return {"path": "", "ok": False, "reason": "not set"}
    full = os.path.abspath(os.path.expanduser(path))
    if not volume_online(full):
        return {"path": full, "ok": False, "reason": "drive not connected"}
    if os.path.isdir(full):
        return {"path": full, "ok": True, "reason": ""}
    if must_exist:
        return {"path": full, "ok": False, "reason": "folder not found"}
    return {"path": full, "ok": True, "reason": "will be created"}


GB = 1024 ** 3


def _existing_parent(path: str) -> str | None:
    full = os.path.abspath(os.path.expanduser(path))
    while full and not os.path.exists(full):
        parent = os.path.dirname(full)
        if parent == full:
            return None
        full = parent
    return full


def disk_usage(path: str) -> dict | None:
    """{"total", "free", "used"} in bytes for the drive holding `path`, or None when it can't be read."""
    if not path.strip() or not volume_online(path):
        return None
    base = _existing_parent(path)
    try:
        usage = shutil.disk_usage(base) if base else None
    except OSError:
        return None
    return {"total": usage.total, "free": usage.free, "used": usage.used} if usage else None


def storage_report(settings) -> list[dict]:
    """Space on each library drive (output and 5.1 folder), flagged `low` below the configured threshold."""
    limit = int(max(0.0, settings.min_free_gb) * GB)
    report = []
    for key, label, path in (("output", "Library (output) folder", settings.output_path), ("multichannel", "5.1 / surround folder", settings.multichannel_path)):
        if not path.strip():
            continue
        usage = disk_usage(path)
        report.append({"key": key, "label": label, "path": os.path.abspath(os.path.expanduser(path)), "online": usage is not None,
                       "low": bool(usage and usage["free"] < limit), **(usage or {"total": 0, "free": 0, "used": 0})})
    return report


def low_space_message(settings, keys: tuple[str, ...] = ("output", "multichannel"), needed: int = 0) -> str | None:
    """A human message when a drive in `keys` would drop under the free-space limit, else None."""
    limit = int(max(0.0, settings.min_free_gb) * GB)
    for entry in storage_report(settings):
        if entry["key"] in keys and entry["online"] and entry["free"] - needed < limit:
            left = entry["free"] / GB
            return f"Paused: only {left:.1f} GB left on {entry['path']} (limit {settings.min_free_gb:g} GB). Free up space or lower the limit in Settings → Storage."
    return None
