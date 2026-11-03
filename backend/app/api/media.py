import os
import shutil
import subprocess
import tempfile

from starlette.concurrency import run_in_threadpool
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel

from .. import deps
from .common import guard, space_guard

router = APIRouter(prefix="/api")
MAX_UPLOAD = 25 * 1024 * 1024


class LyricsContent(BaseModel):
    content: str
    embed: bool = False  # also write plain (untimed) lyrics into the audio tags


class CoverUrl(BaseModel):
    url: str


PREVIEW_DIR = os.path.join(tempfile.gettempdir(), "canto_preview")


def _preview(item_id: int, path: str, mix: str) -> str:
    st = os.stat(path)
    os.makedirs(PREVIEW_DIR, exist_ok=True)
    out = os.path.join(PREVIEW_DIR, f"{item_id}_{mix}_{int(st.st_mtime)}_{st.st_size}.m4a")
    if os.path.isfile(out):
        return out
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise HTTPException(500, "ffmpeg is not installed, so surround files cannot be previewed")
    part = out + ".part.m4a"
    proc = subprocess.run(
        [ffmpeg, "-v", "error", "-y", "-i", path, "-map", "0:a:0", "-vn", *(["-ac", "2", "-b:a", "192k"] if mix == "stereo" else ["-ac", "6", "-b:a", "448k"]), "-c:a", "aac", "-movflags", "+faststart", part],
        capture_output=True, text=True, timeout=600,
    )
    if proc.returncode != 0 or not os.path.isfile(part):
        raise HTTPException(500, f"Could not create the preview: {proc.stderr.strip()[-200:]}")
    os.replace(part, out)
    return out


@router.get("/tracks/{item_id}/audio")
def get_audio(item_id: int, mix: str = ""):
    path = deps.tracks.audio_path(item_id)
    if not path:
        raise HTTPException(404, "Audio file not found")
    if mix in ("stereo", "surround"):
        # Browsers cannot decode E-AC-3/Atmos, so serve a cached AAC transcode (surround keeps up to 5.1 channels)
        return FileResponse(_preview(item_id, path, mix), media_type="audio/mp4")
    return FileResponse(path)  # supports Range requests, so seeking works


@router.get("/tracks/{item_id}/cover")
def get_cover(item_id: int, size: int = 96):
    data = deps.tracks.cover(item_id, max(32, min(size, 1200)))
    if not data:
        raise HTTPException(404, "No artwork")
    return Response(data, media_type="image/jpeg", headers={"Cache-Control": "no-cache"})


@router.get("/tracks/{item_id}/cover/info")
def cover_info(item_id: int):
    return guard(lambda: deps.tracks.cover_info(item_id))


@router.post("/tracks/{item_id}/cover", dependencies=[space_guard()])
async def upload_cover(item_id: int, request: Request):
    data = await request.body()
    if not data or len(data) > MAX_UPLOAD:
        raise HTTPException(400, "Send an image up to 25 MB as the request body")
    return await run_in_threadpool(lambda: guard(lambda: deps.tracks.set_cover(item_id, data)))


@router.delete("/tracks/{item_id}/cover")
def delete_cover(item_id: int):
    guard(lambda: deps.tracks.remove_cover(item_id))
    return {"status": "success"}


MAX_VIDEO = 400 * 1024 * 1024
MEDIA_TYPES = {".mp4": "video/mp4", ".m4v": "video/mp4", ".mov": "video/quicktime", ".webm": "video/webm", ".mkv": "video/x-matroska", ".gif": "image/gif"}


@router.get("/tracks/{item_id}/animated")
def animated_list(item_id: int):
    return guard(lambda: deps.tracks.animated_list(item_id))


@router.post("/tracks/{item_id}/animated", dependencies=[space_guard()])
async def upload_animated(item_id: int, request: Request, name: str = "cover.mp4", shape: str | None = None):
    """Raw video body. The shape (tall/square) is detected from the picture unless `shape` is given."""
    ext = os.path.splitext(name)[1] or ".mp4"
    with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as handle:
        tmp = handle.name
        size = 0
        async for chunk in request.stream():
            size += len(chunk)
            if size > MAX_VIDEO:
                handle.close()
                os.unlink(tmp)
                raise HTTPException(413, "Video is larger than 400 MB")
            await run_in_threadpool(handle.write, chunk)
    try:
        if not size:
            raise HTTPException(400, "Send the video file as the request body")
        return await run_in_threadpool(lambda: guard(lambda: deps.tracks.animated_set(item_id, tmp, ext, shape)))
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)


@router.get("/tracks/{item_id}/animated/{shape}")
def get_animated(item_id: int, shape: str):
    path = guard(lambda: deps.tracks.animated_path(item_id, shape)) if shape in ("square", "tall") else None
    if not path:
        raise HTTPException(404, "No animated cover")
    return FileResponse(path, media_type=MEDIA_TYPES.get(os.path.splitext(path)[1].lower(), "video/mp4"))


@router.delete("/tracks/{item_id}/animated/{shape}")
def delete_animated(item_id: int, shape: str):
    if shape not in ("square", "tall"):
        raise HTTPException(400, "Shape must be square or tall")
    guard(lambda: deps.tracks.animated_remove(item_id, shape))
    return {"status": "success"}


@router.get("/tracks/{item_id}/cover/candidates")
def cover_candidates(item_id: int):
    return guard(lambda: deps.tracks.cover_candidates(item_id))


@router.post("/tracks/{item_id}/cover/from-url", dependencies=[space_guard()])
def cover_from_url(item_id: int, body: CoverUrl):
    return guard(lambda: deps.tracks.set_cover_from_url(item_id, body.url))


@router.get("/tracks/{item_id}/lyrics")
def read_lyrics(item_id: int):
    lyrics = guard(lambda: deps.lyrics.read_lyrics(item_id))
    return {"lyrics": lyrics, "track": deps.tracks.get_track(item_id)}


@router.put("/tracks/{item_id}/lyrics/{kind}")
def save_lyrics(item_id: int, kind: str, body: LyricsContent):
    saved_kind = guard(lambda: deps.lyrics.save_content(item_id, kind, body.content, body.embed))
    return {"status": "success", "saved_kind": saved_kind, "track": deps.tracks.get_track(item_id)}


@router.delete("/tracks/{item_id}/lyrics/{kind}")
def delete_lyrics(item_id: int, kind: str):
    guard(lambda: deps.tracks.delete_lyrics(item_id, kind))
    return {"status": "success", "track": deps.tracks.get_track(item_id)}


@router.get("/tracks/{item_id}/lyrics/candidates")
def lyrics_candidates(item_id: int):
    return guard(lambda: deps.lyrics.candidates_for(item_id))
