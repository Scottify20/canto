"""Local acoustic analysis: loudness (ReplayGain 2.0), musical key and BPM, with no external services."""
import json
import os
import re
import shutil
import subprocess
import threading

import numpy as np

REFERENCE_LUFS = -18.0  # ReplayGain 2.0 reference level
SAMPLE_RATE = 22050
CONFIDENT = 0.55  # Essentia key strength above which no second opinion is needed
KEY_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
# Krumhansl–Kessler key profiles
MAJOR = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
MINOR = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])


# Extra dB added to ReplayGain of files with more than two channels (set from the user's settings).
MULTICHANNEL_OFFSET = 0.0


class AnalysisError(RuntimeError):
    pass


_active: set[subprocess.Popen] = set()
_lock = threading.Lock()
_cancelled = threading.Event()


def _run(cmd, capture_output=True, text=False, timeout=None, input=None) -> subprocess.CompletedProcess:
    """subprocess.run that registers the child so cancelling a job can kill it immediately."""
    if _cancelled.is_set():
        raise AnalysisError("cancelled")
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, stdin=subprocess.PIPE if input is not None else None, text=text)
    with _lock:
        _active.add(proc)
    try:
        out, err = proc.communicate(input=input, timeout=timeout)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.communicate()
        raise
    finally:
        with _lock:
            _active.discard(proc)
    if _cancelled.is_set():
        raise AnalysisError("cancelled")
    return subprocess.CompletedProcess(cmd, proc.returncode, out, err)


def _check_cancel() -> None:
    if _cancelled.is_set():
        raise AnalysisError("cancelled")


def cancel_running() -> None:
    _cancelled.set()
    with _lock:
        for proc in list(_active):
            proc.kill()


def _ffmpeg() -> str:
    exe = shutil.which("ffmpeg")
    if not exe:
        raise AnalysisError("ffmpeg is not installed")
    return exe


def measure_loudness(path: str, downmix: bool = False) -> tuple[float, float]:
    """Return (integrated LUFS, true-peak as linear amplitude) using ffmpeg's EBU R128 filter.

    With `downmix`, a surround file is folded to stereo first, so the result is the loudness a
    stereo (or binaural) listener actually hears.
    """
    graph = ("aformat=channel_layouts=stereo," if downmix else "") + "ebur128=peak=true"
    proc = _run(
        [_ffmpeg(), "-hide_banner", "-nostats", "-i", path, "-filter_complex", graph, "-f", "null", "-"],
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
        proc = _run(
            [exe, "custom", "-O", "-q", "-t", "-l", str(int(REFERENCE_LUFS)), path],
            capture_output=True, text=True, timeout=600,
        )
        cols = [ln for ln in proc.stdout.splitlines() if ln.strip()][-1].split("\t")
        return {"rg_track_gain": round(float(cols[2]), 2), "rg_track_peak": round(float(cols[3]), 6)}
    except (subprocess.SubprocessError, OSError, IndexError, ValueError):
        return None


def replaygain_values(path: str, channels: int = 2) -> tuple[dict, str]:
    """Return (tag values, engine). Prefers rsgain, falls back to ffmpeg's EBU R128 filter.

    Surround/Atmos files are measured on their stereo downmix (surround mixes are mastered quieter and the
    downmix attenuates further), plus the user's multi-channel offset, so they play level with stereo music.
    """
    if channels > 2:
        lufs, peak = measure_loudness(path, downmix=True)
        gain = REFERENCE_LUFS - lufs + MULTICHANNEL_OFFSET
        return {"rg_track_gain": round(gain, 2), "rg_track_peak": round(peak, 6)}, f"ffmpeg stereo downmix, {MULTICHANNEL_OFFSET:+.1f} dB offset"
    values = _rsgain_scan(path)
    if values:
        return values, "rsgain"
    lufs, peak = measure_loudness(path)
    return {"rg_track_gain": round(REFERENCE_LUFS - lufs, 2), "rg_track_peak": round(peak, 6)}, "ffmpeg"


ESSENTIA_JS = os.path.join(os.path.dirname(__file__), "..", "..", "tools", "essentia")
_js_last: tuple[str, dict | None] | None = None


def _essentia_js(path: str, length: float = 0.0) -> dict | None:
    """essentia.js (WebAssembly, run through Node) gives Essentia-grade key and BPM where the Python wheel does not exist, e.g. Windows."""
    global _js_last
    cached = _js_last
    if cached and cached[0] == path:
        return cached[1]
    node = shutil.which("node")
    script = os.path.join(ESSENTIA_JS, "analyze.js")
    if not node or not os.path.isdir(os.path.join(ESSENTIA_JS, "lib")):
        return None
    result = None
    try:
        samples = _decode(path, 90.0, length, rate=44100)
        proc = _run([node, script], input=samples.tobytes(), timeout=300)
        if proc.returncode == 0:
            result = json.loads(proc.stdout.decode().strip().splitlines()[-1])
    except AnalysisError:
        raise
    except Exception:  # noqa: BLE001 - fall through to the built-in estimators
        result = None
    _js_last = (path, result)
    return result


def detect_key_essentia(path: str, length: float = 0.0, seconds: float = 120.0) -> tuple[str, float] | None:
    """Essentia's key extractor (optional dependency): markedly more accurate than the numpy estimator."""
    try:
        import essentia.standard as es
    except ImportError:
        found = _essentia_js(path, length)
        if found and found.get("key"):
            return normalize_key(found["key"] + ("m" if found["scale"] == "minor" else "")), float(found.get("strength", 0))
        return None
    try:
        start = max(0.0, min(length * 0.2, length - seconds)) if length else 0.0
        audio = es.EasyLoader(filename=path, sampleRate=44100, startTime=start, endTime=start + seconds, downmix="mix")()
        key, scale, strength = es.KeyExtractor(profileType="temperley")(audio)
    except Exception:  # noqa: BLE001 - fall through to the next engine
        return None
    return normalize_key(key + ("m" if scale == "minor" else "")), float(strength)


def _decode(path: str, seconds: float, length: float, rate: int | None = None) -> np.ndarray:
    start = max(0.0, min(length * 0.25, length - seconds)) if length else 0.0
    proc = _run(
        [_ffmpeg(), "-v", "error", "-ss", f"{start:.1f}", "-t", f"{seconds:.0f}", "-i", path,
         "-ac", "1", "-ar", str(rate or SAMPLE_RATE), "-f", "f32le", "-"],
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


def _keyfinder(path: str) -> str | None:
    exe = shutil.which("keyfinder-cli")
    if not exe:
        return None
    try:
        proc = _run([exe, path], capture_output=True, text=True, timeout=300)
        tokens = proc.stdout.split()
        return normalize_key(tokens[-1]) if proc.returncode == 0 and tokens else None
    except (subprocess.SubprocessError, OSError):
        return None


def detect_key(path: str, length: float = 0.0) -> tuple[str, str]:
    """Return (key, engine). Essentia first; keyfinder-cli is only consulted when Essentia is missing or unsure
    (strength below CONFIDENT), so confident tracks are analysed once. Built-in estimator is the last resort."""
    found = detect_key_essentia(path, length)
    if found and found[1] >= CONFIDENT:
        return found[0], "essentia"
    finder_key = _keyfinder(path)
    if found and finder_key:
        if found[0] == finder_key:
            return finder_key, "essentia + keyfinder agree"
        return finder_key, f"keyfinder; essentia says {found[0]} - low confidence"
    if finder_key:
        return finder_key, "keyfinder-cli"
    if found:
        return found[0], "essentia - low confidence"
    return detect_key_builtin(path, length), "built-in"


def detect_bpm_essentia(path: str) -> float | None:
    try:
        import essentia.standard as es
    except ImportError:
        found = _essentia_js(path)
        bpm = float(found.get("bpm", 0)) if found else 0.0
        return bpm if bpm > 0 else None
    try:
        audio = es.MonoLoader(filename=path, sampleRate=44100)()
        bpm, *_ = es.RhythmExtractor2013(method="multifeature")(audio)
    except Exception:  # noqa: BLE001
        return None
    return float(bpm) if bpm > 0 else None


def detect_bpm_builtin(path: str, length: float = 0.0, seconds: float = 60.0) -> float:
    """Tempo from the autocorrelation of an onset-strength envelope (pure numpy); fallback when Essentia is missing."""
    samples = _decode(path, seconds, length)
    hop, n = 512, 1024
    if len(samples) < n * 40:
        raise AnalysisError("audio too short for BPM detection")
    window = np.hanning(n)
    mags = np.array([np.abs(np.fft.rfft(samples[i:i + n] * window)) for i in range(0, len(samples) - n, hop)])
    onset = np.maximum(np.diff(np.log1p(mags * 10), axis=0), 0).sum(1)
    onset -= onset.mean()
    ac = np.correlate(onset, onset, "full")[len(onset) - 1:]
    fps = SAMPLE_RATE / hop
    lags = np.arange(len(ac))
    bpms = np.where(lags > 0, 60 * fps / np.maximum(lags, 1), 0)
    valid = (bpms >= 70) & (bpms <= 180)
    weight = np.exp(-0.5 * (np.log2(np.where(valid, bpms, 120) / 120) / 0.8) ** 2)  # prefer typical tempos
    return float(bpms[np.argmax(np.where(valid, ac * weight, -np.inf))])


def detect_bpm(path: str, length: float = 0.0) -> tuple[int, str]:
    bpm = detect_bpm_essentia(path)
    if bpm:
        return round(bpm), "essentia"
    return round(detect_bpm_builtin(path, length)), "built-in"


def analyze_item(item, force: bool = False) -> list[str]:
    """Fill missing ReplayGain/key tags on a beets item. Returns human-readable results."""
    path = os.fsdecode(item.path)
    if not os.path.exists(path):
        raise AnalysisError("audio file is missing on disk")
    done = []
    if force or item.get("rg_track_gain") in (None, ""):
        values, engine = replaygain_values(path, item.get("channels") or 2)
        for key, value in values.items():
            item[key] = value
        done.append(f"gain {values['rg_track_gain']:+.2f} dB ({engine})")
    _check_cancel()
    if force or not item.get("initial_key"):
        key, engine = detect_key(path, item.length or 0)
        item["initial_key"] = key
        done.append(f"key {key} ({engine})")
    _check_cancel()
    if force or not item.get("bpm"):
        bpm, engine = detect_bpm(path, item.length or 0)
        item["bpm"] = bpm
        done.append(f"bpm {bpm} ({engine})")
    if done:
        item.try_write()
        item.store()
    return done


def run_analysis(job, lib, ids: list[int] | None, force: bool = False, workers: int = 2) -> None:
    """Batch job: fill missing ReplayGain/key tags. Works from ffmpeg/keyfinder directly, so no beets plugins are involved."""
    from concurrent.futures import ThreadPoolExecutor

    items = [lib.get_item(i) for i in ids] if ids else list(lib.items())
    items = [i for i in items if i and (force or i.get("rg_track_gain") in (None, "") or not i.get("initial_key") or not i.get("bpm"))]
    job.total = len(items)
    job.message = "Measuring loudness and detecting musical key…"
    ok = failed = 0

    def work(item):
        if job.cancelled:
            return item, None, None
        try:
            return item, analyze_item(item, force), None
        except Exception as exc:  # noqa: BLE001
            if job.cancelled:
                return item, None, None
            return item, None, str(exc)

    _cancelled.clear()
    job.on_cancel = cancel_running
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
    if job.cancelled:
        job.write("[Cancelled] analysis stopped")
    job.message = f"Analysed {ok} track(s)" + (f", {failed} failed" if failed else "")
    job.write(f"[Done] {job.message}")
