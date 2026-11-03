"""Detects folders that live on drives which are currently unplugged or unmounted.

An unmounted drive often leaves an empty mount-point folder behind (/mnt/d, /media/me/USB), so
`isdir` alone can't tell "offline" from "empty". Writing into it would create the library on the
system disk, and treating its files as deleted would wipe the library entries.
"""
import os
import re

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
