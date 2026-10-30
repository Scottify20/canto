from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from contextlib import asynccontextmanager

from .api import jobs, library, media, workspace

@asynccontextmanager
async def lifespan(_app: FastAPI):
    workspace.maintenance.quick_cleanup()  # stale temp files from an interrupted run
    yield
    workspace.maintenance.quick_cleanup()


app = FastAPI(title="Canto Music Engine API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(library.router)
app.include_router(media.router)
app.include_router(workspace.router)
app.include_router(jobs.router)
