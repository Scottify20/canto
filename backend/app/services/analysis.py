"""Local acoustic analysis: loudness (ReplayGain 2.0) and musical key, with no external services."""
import os
import re
import shutil
import subprocess

import numpy as np

REFERENCE_LUFS = -18.0  # ReplayGain 2.0 reference level
SAMPLE_RATE = 22050
KEY_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
# Krumhansl–Kessler key profiles
MAJOR = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
MINOR = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])


class AnalysisError(RuntimeError):
    pass


def _ffmpeg() -> str:
    exe = shutil.which("ffmpeg")
    if not exe:
        raise AnalysisError("ffmpeg is not installed")
    return exe


def measure_loudness(path: str) -> tuple[float, float]:
    """Return (integrated LUFS, true-peak as linear amplitude) using ffmpeg's EBU R128 filter."""
    proc = subprocess.run(
        [_ffmpeg(), "-hide_banner", "-nostats", "-i", path, "-filter_complex", "ebur128=peak=true", "-f", "null", "-"],
        capture_output=True, text=True, timeout=600,
    )
    summary = proc.stderr.rsplit("Summary:", 1)[-1]
    loud = re.search(r"I:\s+(-?[\d.]+)\s+LUFS", summary)
    peak = re.search(r"Peak:\s+(-?[\d.]+|-inf)\s+dBFS", summary)
    if proc.returncode != 0 or not loud:
        raise AnalysisError("audio stream is unreadable (corrupt file?)")
    lufs = float(loud.group(1))
    peak_db = float(peak.group(1)) if peak and peak.group(1) != "-inf" else -60.0
    return lufs, 10 ** (peak_db / 20)


def _rsgain_scan(path: str) -> dict | None:
    """Scan with rsgain (read-only: tags are written by Canto) and return its gain/peak, or None if unavailable."""
    exe = shutil.which("rsgain")
    if not exe:
        return None
    try:
        proc = subprocess.run(
            [exe, "custom", "-O", "-q", "-t", "-l", str(int(REFERENCE_LUFS)), path],
            capture_output=True, text=True, timeout=600,
        )
        cols = [ln for ln in proc.stdout.splitlines() if ln.strip()][-1].split("\t")
        return {"rg_track_gain": round(float(cols[2]), 2), "rg_track_peak": round(float(cols[3]), 6)}
    except (subprocess.SubprocessError, OSError, IndexError, ValueError):
        return None


def replaygain_values(path: str) -> tuple[dict, str]:
    """Return (tag values, engine). Prefers rsgain, falls back to ffmpeg's EBU R128 filter."""
    values = _rsgain_scan(path)
    if values:
        return values, "rsgain"
    lufs, peak = measure_loudness(path)
    return {"rg_track_gain": round(REFERENCE_LUFS - lufs, 2), "rg_track_peak": round(peak, 6)}, "ffmpeg"


def detect_key_essentia(path: str, length: float = 0.0, seconds: float = 120.0) -> str | None:
    """Essentia's key extractor (optional dependency): markedly more accurate than the numpy estimator."""
    try:
        import essentia.standard as es
    except ImportError:
        return None
    try:
        start = max(0.0, min(length * 0.2, length - seconds)) if length else 0.0
        audio = es.EasyLoader(filename=path, sampleRate=44100, startTime=start, endTime=start + seconds, downmix="mix")()
        key, scale, _strength = es.KeyExtractor(profileType="temperley")(audio)
    except Exception:  # noqa: BLE001 - fall through to the next engine
        return None
    return normalize_key(key + ("m" if scale == "minor" else ""))


def _decode(path: str, seconds: float, length: float) -> np.ndarray:
    start = max(0.0, min(length * 0.25, length - seconds)) if length else 0.0
    proc = subprocess.run(
        [_ffmpeg(), "-v", "error", "-ss", f"{start:.1f}", "-t", f"{seconds:.0f}", "-i", path,
         "-ac", "1", "-ar", str(SAMPLE_RATE), "-f", "f32le", "-"],
        capture_output=True, timeout=300,
    )
    if proc.returncode != 0 or not proc.stdout:
        raise AnalysisError("audio stream is unreadable (corrupt file?)")
    return np.frombuffer(proc.stdout, dtype=np.float32)


def detect_key_builtin(path: str, length: float = 0.0, seconds: float = 100.0) -> str:
    """Approximate key estimate (tuned chroma + Krumhansl–Schmuckler, pure numpy); only a fallback when keyfinder-cli is unavailable or fails."""
    samples = _decode(path, seconds, length)
    n, hop = 8192, 4096
    if len(samples) < n * 4:
        raise AnalysisError("audio too short for key detection")
    window = np.hanning(n)
    freqs = np.fft.rfftfreq(n, 1 / SAMPLE_RATE)
    band = (freqs >= 65) & (freqs <= 1200)
    mags = np.array([np.abs(np.fft.rfft(samples[i:i + n] * window))[band] for i in range(0, len(samples) - n, hop)])
    semitones = 12 * np.log2(freqs[band] / 440.0) + 69
    # Estimate tuning: the offset that makes spectral energy sit closest to semitone centres.
    energy = mags.sum(0)
    offset = max(np.linspace(-0.5, 0.5, 11), key=lambda o: float(np.abs(np.cos(2 * np.pi * (semitones + o))) @ energy))
    pitch_class = np.round(semitones + offset).astype(int) % 12
    chroma = np.zeros(12)
    for frame_mag in mags:
        frame = np.bincount(pitch_class, weights=frame_mag, minlength=12)
        total = frame.sum()
        if total > 0:
            chroma += frame / total  # per-frame normalisation so loud passages don't dominate
    if not chroma.any():
        raise AnalysisError("no tonal content found")
    best, best_score = (0, False), -2.0
    for tonic in range(12):
        for minor, profile in ((False, MAJOR), (True, MINOR)):
            score = np.corrcoef(chroma, np.roll(profile, tonic))[0, 1]
            if score > best_score:
                best, best_score = (tonic, minor), score
    return KEY_NAMES[best[0]] + ("m" if best[1] else "")


_FLATS = {"Db": "C#", "Eb": "D#", "Gb": "F#", "Ab": "G#", "Bb": "A#"}


def normalize_key(key: str) -> str:
    key = key.replace("♯", "#").replace("♭", "b")
    root, minor = (key[:-1], "m") if key.endswith("m") else (key, "")
    return _FLATS.get(root, root) + minor


def detect_key(path: str, length: float = 0.0) -> tuple[str, str]:
    """Return (key, engine): keyfinder-cli, then Essentia, then the built-in estimator."""
    exe = shutil.which("keyfinder-cli")
    if exe:
        try:
            proc = subprocess.run([exe, path], capture_output=True, text=True, timeout=300)
            tokens = proc.stdout.split()
            if proc.returncode == 0 and tokens:
                return normalize_key(tokens[-1]), "keyfinder-cli"
        except (subprocess.SubprocessError, OSError):
            pass
    key = detect_key_essentia(path, length)
    if key:
        return key, "essentia"
    return detect_key_builtin(path, length), "built-in"


def analyze_item(item, force: bool = False) -> list[str]:
    """Fill missing ReplayGain/key tags on a beets item. Returns human-readable results."""
    path = os.fsdecode(item.path)
    if not os.path.exists(path):
        raise AnalysisError("audio file is missing on disk")
    done = []
    if force or item.get("rg_track_gain") in (None, ""):
        values, engine = replaygain_values(path)
        for key, value in values.items():
            item[key] = value
        done.append(f"gain {values['rg_track_gain']:+.2f} dB ({engine})")
    if force or not item.get("initial_key"):
        key, engine = detect_key(path, item.length or 0)
        item["initial_key"] = key
        done.append(f"key {key} ({engine})")
    if done:
        item.try_write()
        item.store()
    return done


def run_analysis(job, lib, ids: list[int] | None, force: bool = False, workers: int = 2) -> None:
    """Batch job: fill missing ReplayGain/key tags. Works from ffmpeg/keyfinder directly, so no beets plugins are involved."""
    from concurrent.futures import ThreadPoolExecutor

    items = [lib.get_item(i) for i in ids] if ids else list(lib.items())
    items = [i for i in items if i and (force or i.get("rg_track_gain") in (None, "") or not i.get("initial_key"))]
    job.total = len(items)
    job.message = "Measuring loudness and detecting musical key…"
    ok = failed = 0

    def work(item):
        if job.cancelled:
            return item, None, None
        try:
            return item, analyze_item(item, force), None
        except Exception as exc:  # noqa: BLE001
            return item, None, str(exc)

    with ThreadPoolExecutor(max_workers=workers) as pool:
        for item, done, error in pool.map(work, items):
            if done is None and error is None:
                continue
            job.done += 1
            name = f"{item.artist} - {item.title}"
            if error:
                failed += 1
                job.write(f"[Error] {name}: {error}")
            else:
                ok += 1
                job.write(f"[Analysed] {name}: {', '.join(done)}")
    job.message = f"Analysed {ok} track(s)" + (f", {failed} failed" if failed else "")
    job.write(f"[Done] {job.message}")
