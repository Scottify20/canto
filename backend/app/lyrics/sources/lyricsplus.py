
from ..types import Candidate, Line, Word
from .base import LyricsSource


class LyricsPlusSource(LyricsSource):
    """Word-synced lyrics aggregated from several upstream catalogues (binimum)."""

    name = "lyricsplus"

    def search(self, artist, title, album, duration):
        base = {"title": title, "artist": artist, "duration": int(duration or 0)}
        for params in ({**base, "album": album} if album else base, base):
            res = self.http.get("https://lyricsplus.binimum.org/v2/lyrics/get", params=params, timeout=15)
            if res.status_code != 200:
                continue
            data = res.json()
            rows = data.get("lyrics") or []
            lines: list[Line] = []
            for row in rows:
                start = (row.get("time") or 0) / 1000
                words = [
                    Word(w["time"] / 1000, (w["time"] + w.get("duration", 0)) / 1000, w["text"].strip(), w["text"][-1:].isspace())
                    for w in row.get("syllabus") or []
                    if w.get("text", "").strip()
                ]
                end = start + (row.get("duration") or 0) / 1000 or None
                text = " ".join(w.text for w in words) if words else row.get("text", "").strip()
                lines.append(Line(start=start, end=end, text=text, words=words if data.get("type") == "Word" else []))
            if len({l.start for l in lines}) > 1:
                return [Candidate(source=self.name, title=title, artist=artist, duration=None, lines=lines)]
        return []
