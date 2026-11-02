"""Share the backend with other devices (e.g. the phone app) from the desktop UI, with the QR code's address."""
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from ..services import sharing
from .common import guard

router = APIRouter(prefix="/api")
LOCAL_CLIENTS = {"127.0.0.1", "::1", "localhost"}


def _is_local(request: Request) -> bool:
    # The PIN is only revealed to the computer running Canto, never to devices on the share port.
    return bool(request.client and request.client.host in LOCAL_CLIENTS and request.scope["server"][1] != sharing.SHARE_PORT)


class ShareRequest(BaseModel):
    enabled: bool | None = None
    auto_start: bool | None = None


def _info(local: bool = False) -> dict:
    on = sharing.is_sharing()
    return {
        "pin": sharing.current_pin() if local else None,
        "sharing": on,
        "auto_start": sharing.auto_start(),
        "port": sharing.SHARE_PORT,
        "addresses": [{"ip": ip, "url": f"http://{ip}:{sharing.SHARE_PORT}"} for ip in sharing.lan_addresses()] if on else [],
    }


@router.get("/remote")
def remote_info(request: Request):
    return _info(_is_local(request))


@router.put("/remote")
def set_remote(body: ShareRequest, request: Request):
    # Only the computer running Canto may switch sharing, never a remote device.
    if not _is_local(request):
        raise HTTPException(403, "Sharing can only be changed on the computer running Canto")
    if body.auto_start is not None:
        guard(lambda: sharing.set_auto_start(body.auto_start))
    if body.enabled is not None:
        guard(sharing.start if body.enabled else sharing.stop)
    return _info(True)
