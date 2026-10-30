from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel

from .. import deps
from .common import guard

router = APIRouter(prefix="/api")
MAX_UPLOAD = 25 * 1024 * 1024


class LyricsContent(BaseModel):
    content: str
    embed: bool = False  # also write plain (untimed) lyrics into the audio tags


class CoverUrl(BaseModel):
    url: str


@router.get("/tracks/{item_id}/cover")
def get_cover(item_id: int, size: int = 96):
    data = deps.tracks.cover(item_id, max(32, min(size, 1200)))
    if not data:
        raise HTTPException(404, "No artwork")
    return Response(data, media_type="image/jpeg", headers={"Cache-Control": "no-cache"})


@router.get("/tracks/{item_id}/cover/info")
def cover_info(item_id: int):
    return guard(lambda: deps.tracks.cover_info(item_id))


@router.post("/tracks/{item_id}/cover")
async def upload_cover(item_id: int, request: Request):
    data = await request.body()
    if not data or len(data) > MAX_UPLOAD:
        raise HTTPException(400, "Send an image up to 25 MB as the request body")
    return guard(lambda: deps.tracks.set_cover(item_id, data))


@router.delete("/tracks/{item_id}/cover")
def delete_cover(item_id: int):
    guard(lambda: deps.tracks.remove_cover(item_id))
    return {"status": "success"}


@router.get("/tracks/{item_id}/cover/candidates")
def cover_candidates(item_id: int):
    return guard(lambda: deps.tracks.cover_candidates(item_id))


@router.post("/tracks/{item_id}/cover/from-url")
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
