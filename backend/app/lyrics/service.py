import os
import re
import tempfile
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass

from ..core.http import RateLimited
from ..core.jobs import Job
from ..services.beets_engine import BeetsEngine
from ..services.tracks import item_path, sidecar_base
from .convert import build_lrc, build_ttml, is_usable, parse_ttml, strip_credits
from .sources.registry import PROVIDERS, PROVIDERS_BY_ID
from .text import artist_similarity, primary_artist, similarity, strip_noise
from .types import Candidate, Line, is_word_synced

MIN_TITLE_SIMILARITY = 0.75
MIN_ARTIST_SIMILARITY = 0.5
MAX_DURATION_DELTA = 6.0  # seconds


@dataclass
class LyricsOptions:
    overwrite_lrc: bool = False
    overwrite_ttml: bool = False


class LyricsService:
    """Queries several lyric providers and keeps the best LRC and TTML per track."""

    def __init__(self, engine: BeetsEngine):
        self.engine = engine
        self.sources: dict[str, object] = {}
        for info in PROVIDERS:
            source = info.factory()
            source.keys_provider = lambda pid=info.id: engine.settings.lyrics_providers.get(pid, {}).get("keys", {})
            self.sources[info.id] = source

    # ---- provider configuration --------------------------------------------
    def provider_states(self) -> list[dict]:
        """Ordered provider list with enabled/active flags (secrets never leave the server)."""
        stored = self.engine.settings.lyrics_providers
        order = [p for p in self.engine.settings.lyrics_order if p in PROVIDERS_BY_ID]
        order += [p.id for p in PROVIDERS if p.id not in order]
        states = []
        for pid in order:
            info = PROVIDERS_BY_ID[pid]
            entry = stored.get(pid, {})
            keys = entry.get("keys", {})
            enabled = entry.get("enabled", info.default_enabled)
            has_keys = all(keys.get(f.id) for f in info.key_fields if f.secret) if info.key_fields else True
            states.append(
                {
                    "id": pid, "label": info.label, "description": info.description, "word_level": info.word_level,
                    "enabled": enabled, "key_required": info.key_required, "key_url": info.key_url,
                    "configured": has_keys if info.key_required else True,
                    "key_fields": [
                        {"id": f.id, "label": f.label, "secret": f.secret, "set": bool(keys.get(f.id)),
                         "value": "" if f.secret else keys.get(f.id, "")}
                        for f in info.key_fields
                    ],
                }
            )
        return states

    def active_ids(self) -> list[str]:
        return [s["id"] for s in self.provider_states() if s["enabled"] and s["configured"]]

    # ---- candidate gathering & ranking -----------------------------------
    def _query_variants(self, artist: str, title: str) -> list[tuple[str, str]]:
        variants = [(primary_artist(artist), strip_noise(title)), (artist, title)]
        seen, unique = set(), []
        for variant in variants:
            if variant not in seen and variant[1]:
                seen.add(variant)
                unique.append(variant)
        return unique

    def _score(self, cand: Candidate, artist: str, title: str, duration: float | None, bonus: float) -> float | None:
        title_sim = similarity(title, cand.title)
        artist_sim = artist_similarity(artist, cand.artist)
        if title_sim < MIN_TITLE_SIMILARITY or artist_sim < MIN_ARTIST_SIMILARITY:
            return None
        duration_score = 0.5
        if duration and cand.duration:
            delta = abs(duration - cand.duration)
            if delta > MAX_DURATION_DELTA:
                return None
            duration_score = 1 - delta / MAX_DURATION_DELTA
        return 0.5 * title_sim + 0.25 * artist_sim + 0.25 * duration_score + bonus

    def gather(self, artist: str, title: str, album: str, duration: float | None, notes: list[str]) -> list[Candidate]:
        queries = self._query_variants(artist, title)
        active = self.active_ids()

        def run(pid: str) -> list[Candidate]:
            source = self.sources[pid]
            for q_artist, q_title in queries:
                try:
                    found = source.search(q_artist, q_title, album, duration)
                except Exception as exc:  # noqa: BLE001 - one provider failing must not stop the rest
                    notes.append(f"{pid}: {exc}" if isinstance(exc, RateLimited) else f"{pid}: {type(exc).__name__}")
                    return []
                if found:
                    return found
            return []

        ranked: list[Candidate] = []
        if not active:
            notes.append("no lyric provider is enabled")
            return ranked
        with ThreadPoolExecutor(max_workers=len(active)) as pool:
            futures = {pool.submit(run, pid): idx for idx, pid in enumerate(active)}
            for future in as_completed(futures):
                bonus = 0.05 * (1 - futures[future] / max(1, len(active)))  # earlier in the order wins ties
                for cand in future.result():
                    cand.lines = strip_credits(cand.lines)
                    score = self._score(cand, artist, title, duration, bonus)
                    if score is not None and (cand.instrumental or is_usable(cand.lines)):
                        cand.score = score
                        ranked.append(cand)
        ranked.sort(key=lambda c: c.score, reverse=True)
        return ranked

    # ---- per-track processing --------------------------------------------
    @staticmethod
    def _write(path: str, content: str) -> None:
        directory = os.path.dirname(path)
        fd, tmp = tempfile.mkstemp(dir=directory, suffix=".tmp")
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(content)
        os.replace(tmp, path)

    def _normalize_existing_ttml(self, item, lrc_path: str, ttml_path: str) -> list[Line] | None:
        if not os.path.exists(ttml_path):
            return None
        try:
            with open(ttml_path, encoding="utf-8") as handle:
                lines = parse_ttml(handle.read())
        except (ET.ParseError, UnicodeError, ValueError):
            lines = []
        if is_word_synced(lines):
            return lines
        if not os.path.exists(lrc_path) and is_usable(lines):
            self._write(lrc_path, build_lrc(lines, item.title, item.artist, item.album))
        os.remove(ttml_path)
        return None

    def process_item(self, item, opts: LyricsOptions) -> dict:
        base = sidecar_base(item)
        lrc_path, ttml_path = f"{base}.lrc", f"{base}.ttml"
        had_lrc = os.path.exists(lrc_path)
        had_ttml = os.path.exists(ttml_path)
        existing_word_lines = self._normalize_existing_ttml(item, lrc_path, ttml_path)
        migrated_ttml = had_ttml and not os.path.exists(ttml_path) and not had_lrc and os.path.exists(lrc_path)
        name = f"{item.artist} - {item.title}"
        need_lrc = opts.overwrite_lrc or not os.path.exists(lrc_path)
        need_ttml = opts.overwrite_ttml or not os.path.exists(ttml_path)
        result = {"id": item.id, "name": name, "lrc": None, "ttml": None}
        if not need_lrc and not need_ttml:
            return {**result, "status": "skipped", "message": f"[Skipped] {name} (already has LRC & TTML)"}
        if not os.path.exists(item_path(item)):
            return {**result, "status": "error", "message": f"[Error] {name} (audio file is missing on disk — use 'Remove missing' or re-import)"}

        duration = item.length or None
        # Free conversion: an existing word-synced TTML can produce the LRC offline.
        if need_lrc and not need_ttml and os.path.exists(ttml_path):
            lines = existing_word_lines
            if lines is None:
                with open(ttml_path, encoding="utf-8") as handle:
                    lines = parse_ttml(handle.read())
            if is_usable(lines):
                self._write(lrc_path, build_lrc(lines, item.title, item.artist, item.album))
                return {**result, "status": "success", "lrc": "from local TTML", "message": f"[Success] {name} (LRC derived from existing TTML)"}

        notes: list[str] = []
        candidates = self.gather(item.artist, item.title, item.album, duration, notes)
        if candidates and candidates[0].instrumental:
            return {**result, "status": "instrumental", "message": f"[Instrumental] {name}"}
        candidates = [c for c in candidates if not c.instrumental]
        if not candidates:
            if migrated_ttml:
                return {
                    **result,
                    "status": "success",
                    "lrc": "from local TTML",
                    "message": f"[Success] {name} (line-synced TTML converted to LRC; no word-synced TTML found)",
                }
            suffix = f" ({', '.join(sorted(set(notes)))})" if notes else ""
            return {**result, "status": "not_found", "message": f"[Not Found] {name}{suffix}"}

        word_best = next((c for c in candidates if c.word_synced), None)
        line_best = candidates[0]
        saved = []
        if need_ttml and word_best:
            chosen = word_best
            self._write(ttml_path, chosen.raw_ttml or build_ttml(chosen.lines, duration, language="en"))
            result["ttml"] = f"{chosen.source} (word-synced)"
            saved.append(f"TTML←{result['ttml']}")
        elif need_ttml:
            saved.append("TTML not saved (no word/syllable-level timing found)")
        if need_lrc:
            # Prefer the highest-scoring provider; LRC only needs line timing.
            chosen = line_best
            self._write(lrc_path, chosen.raw_lrc or build_lrc(chosen.lines, item.title, item.artist, item.album))
            result["lrc"] = chosen.source
            saved.append(f"LRC←{chosen.source}")
        return {**result, "status": "success", "message": f"[Success] {name} ({'; '.join(saved)})"}

    def process_single(self, item_id: int, opts: LyricsOptions) -> dict:
        item = self.engine.lib.get_item(item_id)
        if not item:
            raise LookupError("Track not found")
        return self.process_item(item, opts)

    def run_batch(self, job: Job, ids: list[int] | None, opts: LyricsOptions, workers: int = 4) -> None:
        lib = self.engine.lib
        items = [lib.get_item(i) for i in ids] if ids else list(lib.items())
        items = [i for i in items if i]
        job.total = len(items)
        job.message = f"Fetching lyrics from {len(self.active_ids())} providers…"
        counts = {"success": 0, "skipped": 0, "not_found": 0, "instrumental": 0, "error": 0}

        def work(item):
            if job.cancelled:
                return None
            try:
                return self.process_item(item, opts)
            except Exception as exc:  # noqa: BLE001
                return {"status": "error", "message": f"[Error] {item.title} ({exc})"}

        with ThreadPoolExecutor(max_workers=workers) as pool:
            for res in pool.map(work, items):
                if res is None:
                    continue
                counts[res["status"]] = counts.get(res["status"], 0) + 1
                job.done += 1
                job.write(res["message"])
        job.message = ", ".join(f"{v} {k.replace('_', ' ')}" for k, v in counts.items() if v)
        job.write(f"[Done] {job.message}")

    # ---- preview ---------------------------------------------------------
    def read_lyrics(self, item_id: int) -> dict:
        item = self.engine.lib.get_item(item_id)
        if not item:
            raise LookupError("Track not found")
        base = sidecar_base(item)
        out = {"lrc": None, "ttml": None, "ttml_timing": None}
        ttml_path = f"{base}.ttml"
        lines = self._normalize_existing_ttml(item, f"{base}.lrc", ttml_path)
        for kind in ("lrc", "ttml"):
            path = f"{base}.{kind}"
            if os.path.exists(path):
                with open(path, encoding="utf-8", errors="replace") as handle:
                    out[kind] = handle.read()
        if out["ttml"] and lines is not None:
            out["ttml_timing"] = "word"
        return out

    # ---- compare / edit -----------------------------------------------------
    def candidates_for(self, item_id: int) -> dict:
        """All usable provider results for one track, for side-by-side review."""
        item = self.engine.lib.get_item(item_id)
        if not item:
            raise LookupError("Track not found")
        notes: list[str] = []
        found = [c for c in self.gather(item.artist, item.title, item.album, item.length or None, notes) if not c.instrumental]
        out = []
        for cand in found:
            lrc = cand.raw_lrc or build_lrc(cand.lines, item.title, item.artist, item.album)
            ttml = cand.raw_ttml or build_ttml(cand.lines, item.length or None, language="en")
            out.append(
                {
                    "source": cand.source, "score": round(cand.score * 100), "title": cand.title, "artist": cand.artist,
                    "timing": "word" if cand.word_synced else "line", "lines": len([l for l in cand.lines if l.text.strip()]),
                    "native_ttml": bool(cand.raw_ttml), "lrc": lrc, "ttml": ttml,
                }
            )
        return {"candidates": out, "notes": sorted(set(notes))}

    def save_content(self, item_id: int, kind: str, content: str, embed: bool = False) -> str:
        item = self.engine.lib.get_item(item_id)
        if not item or kind not in ("lrc", "ttml"):
            raise LookupError("Track not found")
        if not os.path.exists(item_path(item)):
            raise FileNotFoundError("Audio file is missing on disk")
        base = sidecar_base(item)
        saved_kind = kind
        if kind == "ttml":
            if not content.lstrip().startswith(("<?xml", "<tt")):
                raise ValueError("That does not look like TTML (expected an XML <tt> document)")
            try:
                lines = parse_ttml(content)
            except (ET.ParseError, UnicodeError, ValueError) as exc:
                raise ValueError("That TTML could not be parsed") from exc
            if not is_word_synced(lines):
                if not is_usable(lines):
                    raise ValueError("That TTML has no usable timed lyrics to convert to LRC")
                content = build_lrc(lines, item.title, item.artist, item.album)
                saved_kind = "lrc"
        self._normalize_existing_ttml(item, f"{base}.lrc", f"{base}.ttml")
        self._write(f"{base}.{saved_kind}", content)
        if embed and saved_kind == "lrc":
            plain = "\n".join(re.sub(r"\[[^\]]*\]|<[^>]*>", "", row).strip() for row in content.splitlines())
            item.lyrics = plain.strip()
            item.try_write()
            item.store()
        return saved_kind
