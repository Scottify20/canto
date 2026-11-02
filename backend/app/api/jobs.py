from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from .. import deps
from ..core.jobs import jobs
from ..lyrics.service import LyricsOptions
from ..services import analysis

router = APIRouter(prefix="/api")


class ImportRequest(BaseModel):
    files: list[str] | None = None  # None = everything in the input folder


class LyricsBatchRequest(BaseModel):
    ids: list[int] | None = None  # None = whole library
    overwrite_lrc: bool = False
    overwrite_ttml: bool = False
    embed: bool = False


class LyricsTrackRequest(BaseModel):
    id: int
    overwrite_lrc: bool = False
    overwrite_ttml: bool = False
    embed: bool = False


class IdsRequest(BaseModel):
    ids: list[int] | None = None
    force: bool = False


def _start(kind, target):
    try:
        return jobs.start(kind, target).snapshot()
    except RuntimeError as exc:
        raise HTTPException(409, str(exc))


@router.post("/import")
def start_import(body: ImportRequest):
    return _start("import", lambda job: deps.inbox.run_import(job, body.files))


@router.post("/lyrics")
def start_lyrics(body: LyricsBatchRequest):
    opts = LyricsOptions(body.overwrite_lrc, body.overwrite_ttml, body.embed)
    return _start("lyrics", lambda job: deps.lyrics.run_batch(job, body.ids, opts))


@router.post("/analyze")
def start_analysis(body: IdsRequest):
    return _start("analyze", lambda job: analysis.run_analysis(job, deps.engine.lib, body.ids, body.force))


@router.post("/covers")
def start_covers(body: IdsRequest):
    return _start("covers", lambda job: deps.tracks.fetch_missing_covers(job, body.ids, body.force))


@router.post("/lyrics/track")
def fetch_single_lyrics(body: LyricsTrackRequest):
    try:
        result = deps.lyrics.process_single(body.id, LyricsOptions(body.overwrite_lrc, body.overwrite_ttml, body.embed))
    except LookupError as exc:
        raise HTTPException(404, str(exc))
    return {"status": "success", "result": result, "track": deps.tracks.get_track(body.id)}


@router.get("/jobs/current")
def current_job(since: int = 0):
    job = jobs.current
    return job.snapshot(since) if job else None


@router.post("/jobs/cancel")
def cancel_job():
    return {"cancelled": jobs.cancel()}
