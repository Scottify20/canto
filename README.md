# 🎼 Canto

Local-first music library manager: a FastAPI + Beets backend with an Angular (Tailwind CSS + daisyUI) frontend. Everything runs on your machine; files and metadata stay portable.

## Setup

**Requirements:** Python 3.11+, Node 20+, Git. Optional runtime tools: `ffmpeg` (ReplayGain), `essentia` (key + BPM; on Windows the bundled essentia.js is used via Node), optional `keyfinder-cli` (not needed; only a low-confidence cross-check), `rsgain`, `fpcalc`/chromaprint (AcoustID).

**Quick start by OS** (from the repo root, after cloning; Python 3.11+, Node 20+ and Git installed first):

| Step | Windows (PowerShell) | Linux (Debian/Ubuntu, WSL) |
|---|---|---|
| Setup | `npm run setup` (Rust, VS Build Tools, WebView2 via winget; venv; npm deps) | `npm run setup` (apt packages via sudo, Rust; venv; npm deps) |
| Run | `npm run backend` and `npm start` in two terminals | same |
| Build | `npm run build:windows` | `npm run build:linux:appimage` or `npm run build:linux:deb` |

Open a new terminal after setup if Rust was just installed. To build the Windows `.exe` from Linux/WSL, run `npm run setup:windows` once first.

**All setup commands:**

```bash
npm run setup        # system packages (Rust, Tauri libs / winget on Windows), backend venv + deps, frontend deps
npm run setup:app    # same, but skips system packages (just venv + npm install)
npm run backend      # start the API on 127.0.0.1:8010
npm start            # start the UI on http://localhost:4200
```

`npm run setup` uses `apt` + `sudo` on Debian/Ubuntu and `winget` on Windows; other distros need the [Tauri prerequisites](https://tauri.app/start/prerequisites/) installed manually. After Rust is installed, open a new terminal. The root `npm run build:*` and `start:phone` commands forward to `frontend/`.

Manual equivalent:

```bash
# backend
cd backend
python -m venv venv && venv/bin/python -m pip install -r requirements.txt
venv/bin/python -m uvicorn app.main:app --reload --port 8010

# frontend
cd frontend && npm install && npm start      # http://localhost:4200
```

The navbar's **System check** dropdown shows which tools/modules are missing. `.vscode/tasks.json` starts both servers on folder open.

To open the UI on a phone connected to the same Wi-Fi, leave the backend running and start the phone-accessible frontend:

```bash
cd frontend
npm run start:phone
```

On WSL2, first run `npm run phone:forward` once per WSL restart: it asks for Windows administrator approval and forwards ports 4300 (UI) and 8010 (API) to WSL. The command prints the Windows port-forwarding steps needed to expose the server to your LAN. They require an Administrator PowerShell on Windows. Then open `http://<Windows-Wi-Fi-IPv4-address>:4300` on your phone; find the address with `ipconfig`. The Angular Network URL may be a WSL-only address and not reachable from the phone. This uses a separate port from the normal UI task and proxies API requests to the backend on the computer, so `.vscode/tasks.json` does not need to change. Use this only on a trusted network.

## Desktop builds (Tauri)

Run from the repo root (or from `frontend/`). The Linux desktop builds are only the UI: the backend must be running on `127.0.0.1:8010` (see Setup). The Windows installer bundles the backend (embeddable Python, dependencies, ffmpeg/ffprobe/fpcalc) and starts it on launch unless something already listens on 8010; its library data lives in `%APPDATA%\com.canto.app`. `npm run build:windows` assembles it with `frontend/scripts/prepare-backend-windows.js` (needs the backend venv and internet on first run). Installers are written to `frontend/src-tauri/target/**/release/bundle/`.

| Command | Output |
|---|---|
| `npm run tauri:dev` | Desktop dev window with live reload |
| `npm run build:linux:appimage` | Linux `.AppImage` |
| `npm run build:linux:deb` | Linux `.deb` |
| `npm run build:windows` | Windows `.exe` (NSIS installer) |

**Cleanup** (from the repo root): `npm run clean` removes build output and caches (`frontend/dist`, `.angular`, `src-tauri/target`, Python `__pycache__`, `.pytest_cache`). `npm run clean:all` also removes `node_modules` and the backend `venv`; re-run `npm run setup:app` afterwards. Add `-- --dry-run` to preview. Your library data in `backend/beets_data` is never touched.

Linux needs Rust plus the Tauri system libraries (`libwebkit2gtk-4.1-dev`, `libgtk-3-dev`, `librsvg2-dev`, `libayatana-appindicator3-dev`). On Windows, `npm run build:windows` needs Rust (MSVC) and the WebView2 runtime. To build the Windows `.exe` from Linux/WSL, run `npm run setup:windows` once (installs NSIS, clang/lld, the Rust target and `cargo-xwin`; needs sudo).

## Android builds (Capacitor)

Run from the repo root (or `frontend/`). One-time: `npm run setup:android` (Linux/macOS: installs JDK 21 via apt plus the Android SDK into `~/Android/Sdk`; Windows: installs Android Studio via winget, then open it once to finish its SDK download).

| Command | Output |
|---|---|
| `npm run build:android:apk` | Debug APK: `frontend/android/app/build/outputs/apk/debug/app-debug.apk` (installable directly) |
| `npm run build:android:aab` | Unsigned release bundle for Play (sign it before uploading) |
| `npm run android:open` | Build, sync and open the project in Android Studio |

The Android app is the UI only; it talks to the Canto backend on your computer.

1. Start the backend as usual (`npm run backend`; it also auto-starts when the folder opens in VS Code). It only listens on `127.0.0.1:8010`, so nothing is exposed by default.
2. On the computer open **Settings → Remote control (QR)** and switch on **Share with other devices**. This opens a second listener on port 8001 (same library, same jobs) and shows its address as a QR code. Switching it off, or closing Canto, closes that port; the desktop UI keeps working. Enable **Start sharing when Canto launches** to open it automatically on every start. Only the computer itself can change this switch.
3. On the phone open **Settings → Remote control → Scan QR** (camera permission). It saves the address and reloads. You can also type the address.

Both devices must be on the same Wi-Fi; allow port 8001 in the firewall (WSL2 needs the same port-forward as the phone-UI steps above: `npm run phone:forward`). Share only on a trusted network, since sharing has no password. Sideload the APK by copying it to the phone and opening it (allow "install unknown apps").

### Debugging on a phone

1. On the phone enable Developer options and USB debugging, plug it in by USB and accept the prompt.
2. `npm run build:android:apk`, then `npm run android:debug`: installs the APK, launches Canto and forwards the WebView debugger to `localhost:9222`. Add `-- --no-install` to skip reinstalling.
3. Attach with Chrome/Edge (`chrome://inspect/#devices` > **inspect**) or the VS Code launch config **Android: Attach to Canto WebView**. Backend logs show in the `npm run backend` terminal.

On WSL2 the phone is attached to Windows: install Windows platform-tools (the script falls back to `adb.exe`), attach the phone with `usbipd-win`, or use Wi-Fi debugging. Re-run the command after restarting the app. Chrome DevTools is the most reliable option; the VS Code attach needs the forwarded port reachable from where VS Code runs.

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
- **Surround / Atmos:** files with more than two channels (5.1, 7.1, Atmos beds) are never duplicates of the stereo version of the same song. Structure modal → *Surround & Atmos* sets an optional separate **multi-channel output folder** (same folder template; files are routed there on import and whenever their tags are edited) and a **loudness offset**. Their ReplayGain is measured on the stereo downmix (what a stereo/binaural player outputs, and surround mixes are mastered quieter) plus that offset, so they play level with stereo music. Re-run Analyse with the re-analyse switch after changing the offset. Cleanup covers both folders.
- **Animated covers:** looping cover videos in the raw folder (or its parent folder, for multi-disc albums) are detected by shape with ffprobe, whatever their file names: square (1:1) and tall (portrait, e.g. 3:4). They're copied into each album folder as `animated-cover-square.mp4` / `animated-cover-tall.mp4` on import (removed from the inbox when *Delete originals* is on) and flagged with a film badge in the Inbox and the library. Video-only `.mp4` files are not mistaken for songs.
- Library table: **Added** column (import date, sortable), **Shift+click** selects a range, **Ctrl/Cmd+click** toggles a row, **Ctrl/Cmd+A** selects everything shown.
- Library: **Remove** (selected/all) with the choice to keep or delete files; **Duplicates** modal; **Remove missing** for entries whose files are gone.

### Acoustic analysis
- ReplayGain: `rsgain` if installed, otherwise ffmpeg (EBU R128). Key: `essentia` (`pip install essentia`, Linux/macOS), or **essentia.js** (WebAssembly run by Node from `backend/tools/essentia`, installed by `npm run setup`, bundled with `node.exe` in the Windows installer) where the Python wheel does not exist; `keyfinder-cli` is only run as a second opinion when Essentia is missing or its confidence is low (then a disagreement is marked "low confidence" in the job log), with a pure-numpy estimator as the last resort. BPM: Essentia's `RhythmExtractor2013` (Python or essentia.js), then a numpy onset-autocorrelation estimator, written to the `bpm` tag. The engine used is shown in the job log. Runs on import or on demand; the "Re-analyse already analysed songs" switch (next to the lyrics overwrite switches) recomputes values that already exist. No reliable keyless key API exists.
- **Rate limits:** every outbound lookup (lyrics, covers, iTunes/Deezer/MusicBrainz) goes through one polite HTTP client (`backend/app/core/http.py`): per-host throttling (e.g. MusicBrainz 1 req/s, iTunes ~20/min), retry with backoff honouring `Retry-After`, a circuit breaker that pauses a host for 5 min after repeated 429/5xx (reported in the fetch notes), and a 12 h response cache in `beets_data/http_cache.sqlite`.

### Metadata matching & edit
- AcoustID fingerprint, MusicBrainz, iTunes and Discogs (token) candidates with a per-field diff, **Fetch all** / **Apply all**.
- **Edit modal** per track: all metadata, **Lyrics** (drag & drop `.lrc`/`.ttml`, online candidates with side-by-side comparison, embed option) and **Cover** (drag & drop image, candidates, current-vs-found comparison, remove). The cover tab accepts several files at once with previews: still images, plus **animated video covers** (tall and square are both stored as `animated-cover-tall.*` / `animated-cover-square.*`; the shape is detected from the aspect ratio, otherwise you pick it; no external app standard is guaranteed). The editor also exposes ReplayGain/R128, release details, MusicBrainz IDs and sort/credit fields.
- **Swipe review:** when proposals are waiting, **Swipe review** opens a card stack (swipe right = apply, left = skip; ← → keys and buttons on desktop). Decisions commit after a 5 s undo window so you can keep swiping; open decisions are committed when the dialog closes. The card fills the available height and scrolls internally while the skip, undo and apply buttons stay pinned at the bottom; tap the cover to open a pinch-zoomable preview, and a source picker appears when several matches exist. In the metadata editor, **Find online** on the Cover tab opens a separate dialog to browse, compare (pinch-zoomable) and apply artwork. A clock button (or ↓) sends the current card to the end of the stack without discarding the match.
- **Filters:** grouped dropdown (lyrics state, surround/stereo, lossless/lossy, missing cover/key/BPM/ReplayGain/tags, animated cover, duplicates, missing files, recently added). Extra columns: bitrate, BPM, album artist, track no.

### Lyrics
- Configurable provider order under 🔑 Sources: LRCLib, NetEase, Musixmatch, LyricsPlus and other TTML/LRC APIs, Apple. Best LRC and best word/syllable-synced TTML are chosen independently. Line-level TTML is converted to LRC and never saved as TTML; existing line-level TTML sidecars are migrated when read or processed.
- Existing lyrics are detected and skipped unless overwrite is enabled. **Embed lyrics in the audio tags** is one universal switch in the Lyrics options (not per track). The **surround loudness offset** (default 0 dB, since ReplayGain is already measured on a stereo downmix) lives in the Analysis options.

### Maintenance & cleanup
- Startup and shutdown remove stale `*.tmp` files. The **Cleanup** modal also handles missing entries, empty dirs, orphans and old DB backups. Expired HTTP cache entries are purged on startup; Cleanup can clear the whole lookup cache to force fresh fetches. Thumbnails live in memory.

### Frontend
- Angular signals, standalone components, Tailwind v4 + daisyUI 5, Lucide icons, frosted-glass styling and animations (respecting reduced motion), light/dark theme, tooltips.
- Mobile friendly: stacked layout, Setup tab, full-screen modals, secondary columns hidden on small screens.
- **LAN sharing is PIN protected:** starting sharing generates a 6-digit PIN, required (header or `?pin=`) on the shared port only; the QR code encodes address and PIN, wrong PINs are never locked out; the phone scanner pauses after 3 failed connection attempts and shows a "Scan again" button. Traffic is plain HTTP, so the PIN is not encrypted; use trusted networks.
- Softer light theme; dropdowns are near-opaque because browsers ignore nested `backdrop-filter`.
- Live job polling, column visibility and UI prefs in `localStorage`, Maximize workspace, in-app folder picker.

## Notes
- Beets stores paths relative to the output folder, so changing the output path while tracks exist requires moving the files too.
- API tokens are stored only in the local settings file and never returned by the API.
