# 🎼 Canto

Local-first music library manager: a FastAPI + Beets backend with an Angular (Tailwind CSS + daisyUI) frontend. Everything runs on your machine; files and metadata stay portable.

## Setup

**Requirements:** Python 3.11+, Node 20+, `ffmpeg` (ReplayGain), `keyfinder-cli` (key detection), optional `rsgain` and `essentia` (faster/more accurate analysis), `fpcalc`/chromaprint (AcoustID fingerprinting).

```bash
# backend
cd backend
python -m venv venv && venv/bin/python -m pip install -r requirements.txt
venv/bin/python -m uvicorn app.main:app --reload --port 8000

# frontend
cd frontend && npm install && npm start      # http://localhost:4200
```

The navbar's **System check** dropdown shows which tools/modules are missing. `.vscode/tasks.json` starts both servers on folder open.

To open the UI on a phone connected to the same Wi-Fi, leave the backend running and start the phone-accessible frontend:

```bash
cd frontend
npm run start:phone
```

Open `http://<computer-LAN-IP>:4300` in the phone's browser (find the IP with `hostname -I` on Linux). This uses a separate port from the normal UI task and proxies API requests to the backend on the computer, so `.vscode/tasks.json` does not need to change. Allow port 4300 through the computer's firewall if prompted; use this only on a trusted network.

## Features

### Library engine (Beets)
- Offline; SQLite library + Beets core. Settings persist in `backend/beets_data/canto_settings.json`; `config.yaml` is generated from them (override the data dir with `CANTO_DATA_DIR`).
- **Structure modal** (📁 Structure): presets, variable chips, live preview and a guide for the path template. A new structure applies to future imports; existing tracks move when their tags are next edited.
- **Sidecar preservation:** the bundled `canto_sidecar` plugin copies/moves `.lrc`/`.ttml`/`.txt` files with the audio and keeps them together on later renames.
- **Covers are embedded at original size** (no resizing). Candidates come from iTunes, Deezer and Cover Art Archive.

### Inbox & imports
- **Inbox** tab scans the input folder and flags each file: `new`, `in library`, `duplicate in inbox`, `corrupt`, plus badges for existing cover / LRC / TTML sidecars.
- Import selected files or everything. **Duplicate policy:** skip, keep, or replace (artist+title match, 3 s duration tolerance).
- **Delete originals** switch: files are moved instead of copied and emptied input folders are pruned. Skipped duplicates and corrupt files stay in place.
- Library: **Remove** (selected/all) with the choice to keep or delete files; **Duplicates** modal; **Remove missing** for entries whose files are gone.

### Acoustic analysis
- ReplayGain: `rsgain` if installed, otherwise ffmpeg (EBU R128). Key: `keyfinder-cli`, then `essentia` (`pip install essentia`), then a pure-numpy estimator. The engine used is shown in the job log. Runs on import or on demand. No reliable keyless key API exists.
- **Rate limits:** every outbound lookup (lyrics, covers, iTunes/Deezer/MusicBrainz) goes through one polite HTTP client (`backend/app/core/http.py`): per-host throttling (e.g. MusicBrainz 1 req/s, iTunes ~20/min), retry with backoff honouring `Retry-After`, a circuit breaker that pauses a host for 5 min after repeated 429/5xx (reported in the fetch notes), and a 12 h response cache in `beets_data/http_cache.sqlite`.

### Metadata matching & edit
- AcoustID fingerprint, MusicBrainz, iTunes and Discogs (token) candidates with a per-field diff, **Fetch all** / **Apply all**.
- **Edit modal** per track: all metadata, **Lyrics** (drag & drop `.lrc`/`.ttml`, online candidates with side-by-side comparison, embed option) and **Cover** (drag & drop image, candidates, current-vs-found comparison, remove).

### Lyrics
- Configurable provider order under 🔑 Sources: LRCLib, NetEase, Musixmatch, LyricsPlus and other TTML/LRC APIs, Apple. Best LRC and best word/syllable-synced TTML are chosen independently. Line-level TTML is converted to LRC and never saved as TTML; existing line-level TTML sidecars are migrated when read or processed.
- Existing lyrics are detected and skipped unless overwrite is enabled.

### Maintenance & cleanup
- Startup and shutdown remove stale `*.tmp` files. The **Cleanup** modal also handles missing entries, empty dirs, orphans and old DB backups. Expired HTTP cache entries are purged on startup; Cleanup can clear the whole lookup cache to force fresh fetches. Thumbnails live in memory.

### Frontend
- Angular signals, standalone components, Tailwind v4 + daisyUI 5, Lucide icons, frosted-glass styling and animations (respecting reduced motion), light/dark theme, tooltips.
- Mobile friendly: stacked layout, Setup tab, full-screen modals, secondary columns hidden on small screens.
- Live job polling, column visibility and UI prefs in `localStorage`, Maximize workspace, in-app folder picker.

## Notes
- Beets stores paths relative to the output folder, so changing the output path while tracks exist requires moving the files too.
- API tokens are stored only in the local settings file and never returned by the API.
