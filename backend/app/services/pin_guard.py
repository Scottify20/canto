"""PIN protection for the shared (LAN) listener only. The local listener on 127.0.0.1 never asks for it.

The PIN is a random 6-digit code created each time sharing is switched on. A client sends it as the `X-Canto-Pin`
header, or as a `?pin=` query parameter for <img>/<audio>/<video> URLs that cannot carry headers. Wrong guesses are never locked out;
the scanner UI limits how often it retries instead. It stops other people on the same Wi-Fi; traffic is still plain HTTP.
"""
import secrets
from urllib.parse import parse_qs

from . import sharing



def new_pin() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def _reply(status: int, message: str):
    body = ('{"detail":"%s"}' % message).encode()

    async def send_it(send):
        await send({"type": "http.response.start", "status": status, "headers": [(b"content-type", b"application/json"), (b"content-length", str(len(body)).encode())]})
        await send({"type": "http.response.body", "body": body})

    return send_it


class PinMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] not in ("http", "websocket") or (scope.get("server") or (None, None))[1] != sharing.SHARE_PORT:
            return await self.app(scope, receive, send)
        if scope["type"] == "http" and scope["method"] == "OPTIONS":
            return await self.app(scope, receive, send)  # CORS preflight carries no credentials

        pin = sharing.current_pin()

        headers = {k.decode("latin-1").lower(): v.decode("latin-1") for k, v in scope["headers"]}
        given = headers.get("x-canto-pin") or parse_qs(scope.get("query_string", b"").decode("latin-1")).get("pin", [""])[0]
        if pin and given and secrets.compare_digest(given.encode(), pin.encode()):
            return await self.app(scope, receive, send)

        if scope["type"] == "websocket":
            return await send({"type": "websocket.close", "code": 1008})
        await _reply(401, "PIN required" if not given else "Wrong PIN")(send)
