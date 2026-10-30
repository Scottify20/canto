from ..convert import parse_lrc
from ..types import Candidate
from .base import TIMEOUT, LyricsSource


class LrcLibSource(LyricsSource):
    """Community database of synced (.lrc) lyrics: https://lrclib.net"""

    name = "lrclib"

    def search(self, artist, title, album, duration):
        params = {"track_name": title, "artist_name": artist}
        if album:
            params["album_name"] = album
        found = []
        if duration:
            exact = self.http.get(
                "https://lrclib.net/api/get", params={**params, "duration": int(round(duration))}, timeout=TIMEOUT
            )
            if exact.status_code == 200:
                found.append(exact.json())
        if not found:
            res = self.http.get(
                "https://lrclib.net/api/search", params={"track_name": title, "artist_name": artist}, timeout=TIMEOUT
            )
            if res.status_code == 200:
                found.extend(res.json())
        candidates = []
        for entry in found:
            synced = entry.get("syncedLyrics")
            instrumental = bool(entry.get("instrumental"))
            if not synced and not instrumental:
                continue
            candidates.append(
                Candidate(
                    source=self.name,
                    title=entry.get("trackName", ""),
                    artist=entry.get("artistName", ""),
                    duration=entry.get("duration"),
                    lines=parse_lrc(synced) if synced else [],
                    instrumental=instrumental,
                )
            )
        return candidates
