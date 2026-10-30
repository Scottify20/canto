from dataclasses import dataclass, field


@dataclass
class Word:
    start: float
    end: float
    text: str
    space_after: bool = True


@dataclass
class Line:
    start: float
    text: str
    end: float | None = None
    words: list[Word] = field(default_factory=list)


def is_word_synced(lines: list[Line]) -> bool:
    return any(
        len(line.words) >= 2
        and all(word.end > word.start for word in line.words)
        and all(len(word.text.split()) <= 1 for word in line.words)
        and any(a.start != b.start for a, b in zip(line.words, line.words[1:]))
        for line in lines
    )


@dataclass
class Candidate:
    source: str
    title: str
    artist: str
    duration: float | None
    lines: list[Line]
    score: float = 0.0
    instrumental: bool = False
    raw_ttml: str | None = None  # provider-supplied TTML kept verbatim when it is the chosen one
    raw_lrc: str | None = None

    @property
    def word_synced(self) -> bool:
        return is_word_synced(self.lines)
