"""Embedded artwork: inspect, embed at original size, remove, and find candidates online."""
import io
import os
from urllib.parse import urlparse

import mutagen
from mediafile import Image, ImageType, MediaFile
from PIL import Image as PILImage

from ..core.http import shared as http
from ..lyrics.text import artist_similarity, similarity

TIMEOUT = 10
MAX_BYTES = 25 * 1024 * 1024
UA = {"User-Agent": "Canto/1.0 (local music manager)"}
# Cover downloads are restricted to known artwork hosts.
ALLOWED_HOST_SUFFIXES = ("mzstatic.com", "dzcdn.net", "deezer.com", "coverartarchive.org", "archive.org", "musicbrainz.org")


def has_embedded_art(path: str) -> bool:
    try:
        audio = mutagen.File(path)
    except Exception:  # noqa: BLE001
        return False
    if audio is None:
        return False
    if getattr(audio, "pictures", None):
        return True
    tags = audio.tags
    if tags is None:
        return False
    if hasattr(tags, "getall") and tags.getall("APIC"):
        return True
    try:
        return bool(tags.get("covr"))
    except Exception:  # noqa: BLE001
        return False


def read_cover(path: str) -> bytes | None:
    images = MediaFile(path).images or []
    return images[0].data if images else None


def describe(data: bytes) -> dict:
    with PILImage.open(io.BytesIO(data)) as img:
        return {"width": img.width, "height": img.height, "bytes": len(data), "mime": PILImage.MIME.get(img.format, "image/jpeg")}


def cover_info(path: str) -> dict:
    data = read_cover(path)
    return {"has": True, **describe(data)} if data else {"has": False}


def embed_cover(path: str, data: bytes) -> dict:
    info = describe(data)  # raises if the bytes are not an image
    media = MediaFile(path)
    media.images = [Image(data=data, desc="", type=ImageType.front)]
    media.save()
    return {"has": True, **info}


def remove_cover(path: str) -> None:
    media = MediaFile(path)
    media.images = []
    media.save()


def download_image(url: str) -> bytes:
    parsed = urlparse(url)
    host = parsed.hostname or ""
    if parsed.scheme != "https" or not host.endswith(ALLOWED_HOST_SUFFIXES):
        raise ValueError("Cover downloads are limited to https artwork hosts (Apple, Deezer, Cover Art Archive)")
    res = http.get(url, headers=UA, timeout=TIMEOUT, stream=True)
    final = urlparse(res.url).hostname or ""
    if not final.endswith(ALLOWED_HOST_SUFFIXES):
        raise ValueError("Redirected to a host that is not allowed")
    res.raise_for_status()
    data = res.raw.read(MAX_BYTES + 1, decode_content=True)
    if len(data) > MAX_BYTES:
        raise ValueError("Image is larger than 25 MB")
    describe(data)
    return data


def _itunes(artist: str, album: str, title: str) -> list[dict]:
    res = http.get("https://itunes.apple.com/search", params={"term": f"{artist} {album or title}", "entity": "album", "limit": 6}, timeout=TIMEOUT)
    out = []
    for e in res.json().get("results", []):
        if artist_similarity(artist, e.get("artistName", "")) < 0.5:
            continue
        thumb = e.get("artworkUrl100", "")
        out.append({
            "source": "iTunes", "label": f"{e.get('collectionName', '')} ({e.get('artistName', '')})",
            "thumb": thumb.replace("100x100bb", "300x300bb"), "url": thumb.replace("100x100bb", "3000x3000bb"),
        })
    return out[:3]


def _deezer(artist: str, album: str, title: str) -> list[dict]:
    res = http.get("https://api.deezer.com/search", params={"q": f'artist:"{artist}" track:"{title}"', "limit": 5}, timeout=TIMEOUT)
    out, seen = [], set()
    for e in res.json().get("data", []):
        alb = e.get("album") or {}
        if alb.get("id") in seen or not alb.get("cover_xl"):
            continue
        seen.add(alb.get("id"))
        out.append({"source": "Deezer", "label": f"{alb.get('title', '')} ({(e.get('artist') or {}).get('name', '')})",
                    "thumb": alb.get("cover_medium", alb["cover_xl"]), "url": alb["cover_xl"]})
    return out[:3]


def _caa(artist: str, album: str, title: str) -> list[dict]:
    if not album:
        return []
    res = http.get(
        "https://musicbrainz.org/ws/2/release/",
        params={"query": f'release:"{album}" AND artist:"{artist}"', "fmt": "json", "limit": 4}, headers=UA, timeout=TIMEOUT,
    )
    out = []
    for rel in res.json().get("releases", []):
        if similarity(album, rel.get("title", "")) < 0.8:
            continue
        mbid = rel["id"]
        url = f"https://coverartarchive.org/release/{mbid}/front"
        if http.head(url, headers=UA, timeout=TIMEOUT, allow_redirects=True).status_code == 200:
            out.append({"source": "Cover Art Archive", "label": f"{rel.get('title', '')} ({rel.get('date', '')[:4]})",
                        "thumb": f"https://coverartarchive.org/release/{mbid}/front-250", "url": url})
    return out[:2]


def find_candidates(artist: str, album: str, title: str) -> tuple[list[dict], list[str]]:
    found, notes = [], []
    for name, fn in (("iTunes", _itunes), ("Deezer", _deezer), ("Cover Art Archive", _caa)):
        try:
            found.extend(fn(artist, album, title))
        except Exception as exc:  # noqa: BLE001 - one source failing must not hide the others
            notes.append(f"{name}: {type(exc).__name__}")
    return found, notes


def best_remote_cover(artist: str, album: str, title: str) -> bytes | None:
    """Largest usable artwork among the candidates (first candidate that downloads)."""
    candidates, _ = find_candidates(artist, album, title)
    for cand in candidates:
        try:
            return download_image(cand["url"])
        except Exception:  # noqa: BLE001
            continue
    return None
