import re
import xml.etree.ElementTree as ET
from xml.sax.saxutils import escape

from .types import Line, Word

_LRC_TIME = re.compile(r"\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]")
_LRC_WORD_TAG = re.compile(r"<\d{1,3}:\d{2}(?:[.:]\d{1,3})?>")
TTML_NS = "http://www.w3.org/ns/ttml"


def _frac(raw: str | None) -> float:
    if not raw:
        return 0.0
    return int(raw) / (10 ** len(raw))


def parse_lrc(text: str) -> list[Line]:
    lines: list[Line] = []
    for raw in text.splitlines():
        stamps = list(_LRC_TIME.finditer(raw))
        if not stamps:
            continue
        body = _LRC_WORD_TAG.sub("", raw[stamps[-1].end():]).strip()
        for m in stamps:
            start = int(m.group(1)) * 60 + int(m.group(2)) + _frac(m.group(3))
            lines.append(Line(start=start, text=body))
    lines.sort(key=lambda l: l.start)
    _fill_line_ends(lines)
    return lines


def _fill_line_ends(lines: list[Line], duration: float | None = None) -> None:
    for i, line in enumerate(lines):
        if line.end is None or line.end <= line.start:
            nxt = lines[i + 1].start if i + 1 < len(lines) else None
            line.end = nxt if nxt is not None else (duration if duration and duration > line.start else line.start + 4.0)


def _lrc_stamp(seconds: float) -> str:
    centis = int(round(seconds * 100))
    return f"[{centis // 6000:02d}:{(centis // 100) % 60:02d}.{centis % 100:02d}]"


def build_lrc(lines: list[Line], title: str = "", artist: str = "", album: str = "") -> str:
    header = [f"[{tag}:{value}]" for tag, value in (("ti", title), ("ar", artist), ("al", album)) if value]
    body = [f"{_lrc_stamp(l.start)}{l.text}" for l in lines]
    return "\n".join(header + body) + "\n"


def _ttml_time(seconds: float) -> str:
    millis = int(round(max(seconds, 0) * 1000))
    h, rem = divmod(millis, 3_600_000)
    m, rem = divmod(rem, 60_000)
    s, ms = divmod(rem, 1000)
    return f"{h}:{m:02d}:{s:02d}.{ms:03d}" if h else f"{m}:{s:02d}.{ms:03d}"


def build_ttml(lines: list[Line], duration: float | None = None, language: str = "en") -> str:
    _fill_line_ends(lines, duration)
    word_level = any(l.words for l in lines)
    end_of_song = max((l.end or 0 for l in lines), default=duration or 0)
    out = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        f'<tt xmlns="{TTML_NS}" xmlns:itunes="http://music.apple.com/lyric-ttml-internal" '
        f'xmlns:ttm="{TTML_NS}#metadata" itunes:timing="{"Word" if word_level else "Line"}" xml:lang="{language}">',
        '<head><metadata><ttm:agent type="person" xml:id="v1"/></metadata></head>',
        f'<body dur="{_ttml_time(end_of_song)}"><div begin="{_ttml_time(lines[0].start if lines else 0)}" end="{_ttml_time(end_of_song)}">',
    ]
    for i, line in enumerate(lines, 1):
        attrs = f'begin="{_ttml_time(line.start)}" end="{_ttml_time(line.end or line.start)}" ttm:agent="v1" itunes:key="L{i}"'
        if line.words:
            parts = []
            for w in line.words:
                parts.append(f'<span begin="{_ttml_time(w.start)}" end="{_ttml_time(w.end)}">{escape(w.text)}</span>')
                if w.space_after:
                    parts.append(" ")
            inner = "".join(parts).rstrip()
        else:
            inner = escape(line.text)
        out.append(f"<p {attrs}>{inner}</p>")
    out.append("</div></body></tt>")
    return "\n".join(out) + "\n"


def _parse_clock(value: str | None) -> float:
    if not value:
        return 0.0
    value = value.strip()
    if value.endswith("s"):
        return float(value[:-1])
    parts = value.split(":")
    seconds = 0.0
    for part in parts:
        seconds = seconds * 60 + float(part)
    return seconds


def parse_ttml(xml_text: str) -> list[Line]:
    root = ET.fromstring(xml_text)
    lines: list[Line] = []
    for p in root.iter(f"{{{TTML_NS}}}p"):
        start = _parse_clock(p.get("begin"))
        end = None
        if p.get("end"):
            end = _parse_clock(p.get("end"))
        elif p.get("dur"):
            end = start + _parse_clock(p.get("dur"))
        words = []
        pieces = []
        for span in p.iter(f"{{{TTML_NS}}}span"):
            if span.get("begin") and (span.text or "").strip():
                # Apple splits words into syllable spans; only whitespace between spans marks a word break
                spaced = span.text[-1:].isspace() or (span.tail or "")[:1].isspace()
                word_start = _parse_clock(span.get("begin"))
                word_end = _parse_clock(span.get("end")) if span.get("end") else word_start + _parse_clock(span.get("dur"))
                words.append(Word(word_start, word_end, span.text.strip(), spaced))
                pieces.append(span.text.strip() + (" " if spaced else ""))
        text = re.sub(r"\s+", " ", "".join(pieces)).strip() if words else "".join(p.itertext()).strip()
        lines.append(Line(start=start, end=end, text=text, words=words))
    return lines


def is_usable(lines: list[Line]) -> bool:
    """At least a few non-empty lines with non-decreasing timestamps."""
    texts = [l for l in lines if l.text.strip()]
    return len(texts) >= 3 and all(a.start <= b.start for a, b in zip(lines, lines[1:]))


_CREDIT = re.compile(
    r"^\s*(作词|作詞|作曲|编曲|編曲|制作人|製作人|混音|录音|母带|词|曲|lyrics?|lyricist|music|composer|arranger|producer|written|words|composed)"
    r"(\s+by)?\s*[:：]",
    re.IGNORECASE,
)


def strip_credits(lines: list[Line]) -> list[Line]:
    """Remove provider-injected credit rows ('作词 : X') from the head of a lyric."""
    return [l for i, l in enumerate(lines) if not (i < 10 and _CREDIT.match(l.text))]
