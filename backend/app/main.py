from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import threading
from contextlib import asynccontextmanager

from .api import jobs, library, media, remote, workspace
from .services import sharing
from .services.pin_guard import PinMiddleware

@asynccontextmanager
async def lifespan(_app: FastAPI):
    workspace.maintenance.quick_cleanup()  # stale temp files from an interrupted run
    threading.Thread(target=workspace.maintenance.fix_channel_counts, daemon=True).start()
    if sharing.auto_start():
        try:
            sharing.start()
        except RuntimeError:
            pass  # port busy: the user can retry from Remote control
    yield
    sharing.stop()
    workspace.maintenance.quick_cleanup()


app = FastAPI(title="Canto Music Engine API", lifespan=lifespan)

app.add_middleware(PinMiddleware)  # added first so CORS stays outermost and also covers 401 replies
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"(https?://(localhost|127\.0\.0\.1)(:\d+)?|tauri://localhost|https?://tauri\.localhost|https?://(192\.168|10|172\.(1[6-9]|2\d|3[01]))\.[\d.]+(:\d+)?)",
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(library.router)
app.include_router(media.router)
app.include_router(workspace.router)
app.include_router(jobs.router)
app.include_router(remote.router)
