"""Optional LAN sharing: a second listener (same app, same library) that the desktop UI can switch on and off.

The normal backend always stays on 127.0.0.1:8010. While sharing is on, the same app is also served on
0.0.0.0:SHARE_PORT so a phone on the same network can connect; stopping it closes only that listener.
"""
import json
import socket
import subprocess
import threading
import time

import uvicorn

from ..core.settings import BEETS_DIR

SHARE_PORT = 8001
PREFS_PATH = BEETS_DIR / "canto_share.json"
_lock = threading.Lock()
_server: uvicorn.Server | None = None
_thread: threading.Thread | None = None
_pin = ""


def current_pin() -> str:
    return _pin if is_sharing() else ""


def auto_start() -> bool:
    try:
        return bool(json.loads(PREFS_PATH.read_text()).get("auto_start"))
    except (OSError, ValueError, AttributeError):
        return False


def set_auto_start(enabled: bool) -> None:
    BEETS_DIR.mkdir(parents=True, exist_ok=True)
    PREFS_PATH.write_text(json.dumps({"auto_start": enabled}))


def is_sharing() -> bool:
    return _thread is not None and _thread.is_alive() and _server is not None and _server.started


def _windows_host_addresses() -> list[str]:
    # Under WSL2 (NAT) the Linux address is a private 172.x one; phones need the Windows host's Wi-Fi/Ethernet address.
    try:
        if "microsoft" not in open("/proc/version").read().lower():
            return []
        out = subprocess.run(
            ["powershell.exe", "-NoProfile", "-Command",
             "Get-NetIPAddress -AddressFamily IPv4 -PrefixOrigin Dhcp,Manual | Where-Object { $_.InterfaceAlias -notmatch 'vEthernet|WSL|Loopback|VirtualBox|VMware' } | ForEach-Object { $_.IPAddress }"],
            capture_output=True, text=True, timeout=5,
        ).stdout
    except (OSError, subprocess.SubprocessError):
        return []
    return [ip for ip in out.split() if ip.startswith(("192.168.", "10.", "172."))]


def lan_addresses() -> list[str]:
    host = _windows_host_addresses()
    if host:
        return host
    found: list[str] = []
    probe = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        probe.connect(("10.255.255.255", 1))  # no packet is sent; selects the outbound interface
        found.append(probe.getsockname()[0])
    except OSError:
        pass
    finally:
        probe.close()
    try:
        found.extend(socket.gethostbyname_ex(socket.gethostname())[2])
    except OSError:
        pass
    return [ip for i, ip in enumerate(found) if ip not in found[:i] and not ip.startswith(("127.", "169.254.", "0."))]


def start() -> None:
    global _server, _thread, _pin
    with _lock:
        if is_sharing():
            return
        from .pin_guard import new_pin

        _pin = new_pin()
        from ..main import app  # imported late: main imports the API that imports this module

        _server = uvicorn.Server(uvicorn.Config(app, host="0.0.0.0", port=SHARE_PORT, log_level="warning", lifespan="off"))
        _thread = threading.Thread(target=_server.run, name="canto-share", daemon=True)
        _thread.start()
        for _ in range(50):  # wait up to 5 s for the socket to open (or fail, e.g. port in use)
            if _server.started or not _thread.is_alive():
                break
            time.sleep(0.1)
        if not _server.started:
            _server = _thread = None
            _pin = ""
            raise RuntimeError(f"Could not open port {SHARE_PORT} (is it already in use?)")


def stop() -> None:
    global _server, _thread, _pin
    with _lock:
        if _server and _thread:
            _server.should_exit = True
            _thread.join(timeout=5)
        _server = _thread = None
