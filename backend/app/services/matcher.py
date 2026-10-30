from ..core.http import shared as http
from beets.autotag import Source, tag_item

from ..lyrics.text import artist_similarity, similarity
from .beets_engine import BeetsEngine

MAX_CANDIDATES = 5


def _join(value) -> str:
    if isinstance(value, (list, tuple)):
        return ", ".join(str(v) for v in value if v)
    return str(value or "")


def itunes_candidates(artist: str, title: str, duration: float | None) -> list[dict]:
    """Apple's public catalogue search: reliable album, release year and genre."""
    try:
        res = http.get(
            "https://itunes.apple.com/search",
            params={"term": f"{artist} {title}", "entity": "song", "limit": 8},
            timeout=8,
        )
        entries = res.json().get("results", [])
    except Exception:  # noqa: BLE001 - enrichment is best effort
        return []
    found = []
    for e in entries:
        title_sim = similarity(title, e.get("trackName", ""))
        artist_sim = artist_similarity(artist, e.get("artistName", ""))
        if title_sim < 0.7 or artist_sim < 0.5:
            continue
        length = (e.get("trackTimeMillis") or 0) / 1000
        dur = 0.5 if not (duration and length) else max(0.0, 1 - abs(duration - length) / 15)
        similarity_pct = round((0.5 * title_sim + 0.3 * artist_sim + 0.2 * dur) * 100)
        found.append(
            {
                "source": "iTunes",
                "similarity": similarity_pct,
                "fields": {
                    "title": e.get("trackName", ""),
                    "artist": e.get("artistName", ""),
                    "albumartist": e.get("collectionArtistName") or e.get("artistName", ""),
                    "album": e.get("collectionName", ""),
                    "year": int(e["releaseDate"][:4]) if e.get("releaseDate") else "",
                    "genre": e.get("primaryGenreName", ""),
                },
                "provenance": {},
            }
        )
    found.sort(key=lambda c: c["similarity"], reverse=True)
    return found[:3]


class MatchService:
    """Looks up metadata candidates (AcoustID fingerprint, MusicBrainz, Discogs)."""

    def __init__(self, engine: BeetsEngine):
        self.engine = engine

    def propose(self, item_id: int) -> list[dict]:
        item = self.engine.lib.get_item(item_id)
        if not item:
            raise LookupError("Track not found")
        proposal = tag_item(Source.from_item(item))
        results = []
        for match in proposal.candidates[:MAX_CANDIDATES]:
            info = match.info
            year = getattr(info, "year", 0) or ""
            results.append(
                {
                    "source": getattr(info, "data_source", "") or "unknown",
                    "similarity": round((1 - float(match.distance)) * 100),
                    "fields": {
                        "title": getattr(info, "title", "") or "",
                        "artist": getattr(info, "artist", "") or "",
                        "albumartist": getattr(info, "artist", "") or "",
                        "album": getattr(info, "album", "") or "",
                        "year": year,
                        "genre": _join(getattr(info, "genres", None) or getattr(info, "genre", "")),
                    },
                    "provenance": {
                        "mb_trackid": getattr(info, "track_id", "") if getattr(info, "data_source", "") == "MusicBrainz" else "",
                        "mb_albumid": getattr(info, "album_id", "") if getattr(info, "data_source", "") == "MusicBrainz" else "",
                    },
                }
            )
        extra = itunes_candidates(item.artist, item.title, item.length)
        if extra:
            best = extra[0]["fields"]
            for cand in results:
                # Recording-level results lack album/year/genre; borrow them from the closest catalogue hit.
                if similarity(cand["fields"]["title"], best["title"]) > 0.85 and artist_similarity(cand["fields"]["artist"], best["artist"]) > 0.7:
                    for key in ("album", "year", "genre"):
                        cand["fields"][key] = cand["fields"][key] or best[key]
        results.extend(extra)
        results.sort(key=lambda c: c["similarity"], reverse=True)
        return results
