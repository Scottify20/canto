import re
import unicodedata
from difflib import SequenceMatcher

_BRACKETS = re.compile(r"\(.*?\)|\[.*?\]")
_FEAT = re.compile(r"\s+(?:feat\.?|ft\.?|featuring|with)\s+.*$", re.IGNORECASE)


def strip_noise(value: str) -> str:
    """Drop bracketed annotations and 'feat.' credits, e.g. 'Song (Remastered) [feat. X]'."""
    value = _BRACKETS.sub(" ", value or "")
    value = _FEAT.sub("", value)
    return re.sub(r"\s+", " ", value).strip()


def normalize(value: str) -> str:
    value = unicodedata.normalize("NFKD", strip_noise(value)).casefold()
    value = "".join(ch for ch in value if not unicodedata.combining(ch))
    return re.sub(r"\s+", " ", re.sub(r"[^\w\s]", " ", value)).strip()


def similarity(a: str, b: str) -> float:
    a, b = normalize(a), normalize(b)
    if not a or not b:
        return 0.0
    if a == b:
        return 1.0
    return SequenceMatcher(None, a, b).ratio()


def primary_artist(artist: str) -> str:
    """'A, B & C' / 'A feat. B' -> 'A'."""
    artist = _FEAT.sub("", artist or "")
    return re.split(r"\s*(?:,|&|;| x | and )\s*", artist, maxsplit=1)[0].strip()


def artist_similarity(wanted: str, found: str) -> float:
    """Tolerant of credit-list differences ('A & B' vs 'A')."""
    full = similarity(wanted, found)
    first = similarity(primary_artist(wanted), primary_artist(found))
    contained = 1.0 if normalize(primary_artist(wanted)) and normalize(primary_artist(wanted)) in normalize(found) else 0.0
    return max(full, first, contained * 0.9)
