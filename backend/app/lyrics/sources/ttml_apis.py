from ..types import Candidate
from .base import TIMEOUT, LyricsSource, is_timed_lrc, looks_like_ttml, payload_candidate


class BetterLyricsSource(LyricsSource):
    """Apple-Music-based word/line TTML via the Better Lyrics API."""

    name = "blyrics"

    def search(self, artist, title, album, duration):
        base = {"s": title, "a": artist, "d": int(duration or 0)}
        for params in ({**base, "al": album} if album else base, base):
            res = self.http.get("https://lyrics-api.boidu.dev/getLyrics", params=params, timeout=TIMEOUT)
            if res.status_code != 200:
                continue
            data = res.json()
            cand = payload_candidate(self.name, title, artist, None, data.get("ttml"), data.get("lrc"))
            if cand:
                return [cand]
        return []


class UnisonSource(LyricsSource):
    """Crowdsourced word-synced TTML from Better Lyrics users."""

    name = "unison"

    def search(self, artist, title, album, duration):
        params = {"song": title, "artist": artist, "duration": int(duration or 0)}
        if album:
            params["album"] = album
        res = self.http.get("https://unison.boidu.dev/lyrics", params=params, timeout=TIMEOUT)
        if res.status_code != 200:
            return []
        body = ((res.json().get("data")) or {}).get("lyrics") or ""
        cand = payload_candidate(
            self.name, title, artist, None, body if looks_like_ttml(body) else None, body if is_timed_lrc(body) else None
        )
        return [cand] if cand else []


class LrcRedSource(LyricsSource):
    """lrc.red: Apple-derived TTML keyed by ISRC."""

    name = "lrcred"

    def search(self, artist, title, album, duration):
        res = self.http.get("https://lrc.red/search.json", params={"q": f"{title} {artist}"}, timeout=TIMEOUT)
        if res.status_code != 200:
            return []
        found: list[Candidate] = []
        for hit in res.json().get("hits", [])[:6]:
            length = float(hit.get("duration") or 0) or None
            ttml = self.http.get(f"https://lrc.red/s/{hit['isrc']}.ttml", timeout=TIMEOUT)
            if ttml.status_code != 200:
                continue
            cand = payload_candidate(self.name, hit.get("title", ""), hit.get("artist", ""), length, ttml.text, None)
            if cand:
                found.append(cand)
        return found
