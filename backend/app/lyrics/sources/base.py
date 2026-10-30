import re
from collections.abc import Callable

from ...core.http import make_session
from ..convert import parse_lrc, parse_ttml
from ..types import Candidate

TIMEOUT = 10




class LyricsSource:
    name = "base"

    def __init__(self) -> None:
        self.http = make_session()
        self.keys_provider: Callable[[], dict] = lambda: {}

    @property
    def keys(self) -> dict:
        return self.keys_provider() or {}

    def search(self, artist: str, title: str, album: str, duration: float | None) -> list[Candidate]:
        raise NotImplementedError


_HAS_STAMPS = re.compile(r"(?m)^\s*\[\d{1,3}:\d{2}(?:[.:]\d+)?\]")


def is_timed_lrc(text: str | None) -> bool:
    return bool(text and _HAS_STAMPS.search(text))


def looks_like_ttml(text: str | None) -> bool:
    return bool(text and text.lstrip().startswith(("<?xml", "<tt")))


def payload_candidate(source: str, title: str, artist: str, duration: float | None, ttml: str | None, lrc: str | None) -> Candidate | None:
    """Build a candidate from providers that hand back ready-made TTML and/or LRC text."""
    lines = []
    if looks_like_ttml(ttml):
        try:
            lines = parse_ttml(ttml)
        except Exception:  # noqa: BLE001
            ttml, lines = None, []
    else:
        ttml = None
    if not lines and is_timed_lrc(lrc):
        lines = parse_lrc(lrc)
    if not lines:
        return None
    return Candidate(
        source=source, title=title, artist=artist, duration=duration, lines=lines,
        raw_ttml=ttml, raw_lrc=lrc if is_timed_lrc(lrc) else None,
    )
