import re

from ..convert import parse_lrc
from ..types import Candidate, Line, Word
from .base import TIMEOUT, LyricsSource

_YRC_LINE = re.compile(r"^\[(\d+),(\d+)\](.*)$")
_YRC_WORD = re.compile(r"\((\d+),(\d+),\d+\)([^(]*)")


def _join(words: list[Word]) -> str:
    return "".join(w.text + (" " if w.space_after else "") for w in words).strip()


def parse_yrc(text: str) -> list[Line]:
    """NetEase word-level format: `[lineStartMs,durMs](wordStartMs,durMs,0)word...`"""
    lines = []
    for raw in text.splitlines():
        m = _YRC_LINE.match(raw.strip())
        if not m:
            continue  # JSON credit lines
        start_ms, dur_ms, rest = int(m.group(1)), int(m.group(2)), m.group(3)
        words = []
        for w in _YRC_WORD.finditer(rest):
            token = w.group(3)
            if not token.strip():
                continue
            ws = int(w.group(1)) / 1000
            if words and token.strip()[0] in ",.!?;:)":
                words[-1].space_after = False  # glue punctuation tokens to the previous word
            words.append(Word(ws, ws + int(w.group(2)) / 1000, token.strip(), space_after=token.endswith(" ")))
        if words:
            words[-1].space_after = False
            lines.append(Line(start=start_ms / 1000, end=(start_ms + dur_ms) / 1000, text=_join(words), words=words))
    return lines


class NetEaseSource(LyricsSource):
    """NetEase Cloud Music: large catalogue with LRC and word-level (YRC) lyrics."""

    name = "netease"

    def __init__(self):
        super().__init__()
        self.http.headers.update({"Referer": "https://music.163.com/", "Cookie": "appver=2.0.2"})

    def search(self, artist, title, album, duration):
        res = self.http.post(
            "https://music.163.com/api/search/get",
            data={"s": f"{title} {artist}", "type": 1, "limit": 5, "offset": 0},
            timeout=TIMEOUT,
        )
        res.raise_for_status()
        songs = (res.json().get("result") or {}).get("songs") or []
        candidates = []
        for song in songs[:4]:
            lyric = self.http.get(
                "https://music.163.com/api/song/lyric",
                params={"id": song["id"], "lv": 1, "kv": 1, "tv": -1, "yv": 1},
                timeout=TIMEOUT,
            )
            if lyric.status_code != 200:
                continue
            body = lyric.json()
            lrc_text = (body.get("lrc") or {}).get("lyric") or ""
            yrc_text = (body.get("yrc") or {}).get("lyric") or ""
            lines = parse_yrc(yrc_text) if yrc_text else []
            if not lines and lrc_text:
                lines = parse_lrc(lrc_text)
            if not lines:
                continue
            candidates.append(
                Candidate(
                    source=self.name,
                    title=song.get("name", ""),
                    artist=", ".join(a.get("name", "") for a in song.get("artists", [])),
                    duration=(song.get("duration") or 0) / 1000 or None,
                    lines=lines,
                )
            )
        return candidates
