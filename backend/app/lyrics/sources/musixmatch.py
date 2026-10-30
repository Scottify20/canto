import json

from ..types import Candidate, Line, Word
from .base import TIMEOUT, LyricsSource

BASE = "https://apic-desktop.musixmatch.com/ws/1.1"
APP_ID = "web-desktop-app-v1.0"


class MusixmatchSource(LyricsSource):
    """Musixmatch desktop API (needs a user token): word-level richsync + synced subtitles."""

    name = "musixmatch"

    def __init__(self):
        super().__init__()
        self.http.headers["Cookie"] = "AWSELBCORS=0; AWSELB=0"

    def search(self, artist, title, album, duration):
        token = self.keys.get("token", "")
        if not token:
            return []  # needs a user token (Settings → Metadata sources)
        params = {
            "format": "json",
            "namespace": "lyrics_richsynched",
            "subtitle_format": "mxm",
            "app_id": APP_ID,
            "q_artist": artist,
            "q_track": title,
            "q_album": album or "",
            "q_duration": int(duration) if duration else "",
            "f_subtitle_length": int(duration) if duration else "",
            "usertoken": token,
        }
        res = self.http.get(f"{BASE}/macro.subtitles.get", params=params, timeout=TIMEOUT)
        message = res.json()["message"]
        if message["header"].get("status_code") == 401:
            raise PermissionError("token rejected")
        calls = (message.get("body") or {}).get("macro_calls") or {}
        track = self._body(calls, "matcher.track.get").get("track") or {}
        if not track:
            return []
        length = track.get("track_length") or duration
        meta = dict(source=self.name, title=track.get("track_name", ""), artist=track.get("artist_name", ""), duration=length)
        if track.get("instrumental"):
            return [Candidate(lines=[], instrumental=True, **meta)]

        candidates = []
        richsync = self._body(calls, "track.richsync.get").get("richsync") or {}
        if richsync.get("richsync_body"):
            lines = self._parse_richsync(richsync["richsync_body"])
            if lines:
                candidates.append(Candidate(lines=lines, **meta))
        subs = self._body(calls, "track.subtitles.get").get("subtitle_list") or []
        if subs and not candidates:
            lines = self._parse_subtitle(subs[0]["subtitle"].get("subtitle_body", ""))
            if lines:
                candidates.append(Candidate(lines=lines, **meta))
        return candidates

    @staticmethod
    def _body(calls: dict, key: str) -> dict:
        message = (calls.get(key) or {}).get("message") or {}
        body = message.get("body")
        return body if isinstance(body, dict) else {}

    @staticmethod
    def _parse_subtitle(raw: str) -> list[Line]:
        try:
            data = json.loads(raw)
        except ValueError:
            return []
        return [Line(start=float(e["time"]["total"]), text=e.get("text", "")) for e in data]

    @staticmethod
    def _parse_richsync(raw: str) -> list[Line]:
        try:
            data = json.loads(raw)
        except ValueError:
            return []
        lines = []
        for entry in data:
            ts, te = float(entry["ts"]), float(entry["te"])
            tokens = entry.get("l") or []
            words: list[Word] = []
            for i, tok in enumerate(tokens):
                chars = tok.get("c", "")
                if not chars.strip():
                    if words:
                        words[-1].space_after = True
                    continue
                start = ts + float(tok.get("o", 0))
                nxt = next((ts + float(t["o"]) for t in tokens[i + 1:] if t.get("c", "").strip()), te)
                words.append(Word(start, max(nxt, start), chars.strip(), space_after=False))
            lines.append(Line(start=ts, end=te, text=entry.get("x", "").strip(), words=words))
        return lines
