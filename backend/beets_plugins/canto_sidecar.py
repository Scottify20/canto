"""Keeps companion files (.lrc, .ttml, .txt) next to their audio file.

Copies them on import and moves them whenever beets moves/renames a track,
so lyrics follow the audio regardless of tag edits.
"""
import os
import shutil

from beets.plugins import BeetsPlugin


class CantoSidecarPlugin(BeetsPlugin):
    def __init__(self):
        super().__init__()
        self.config.add({"extensions": [".lrc", ".ttml", ".txt"]})
        self.register_listener("item_copied", self._on_copied)
        self.register_listener("item_moved", self._on_moved)

    def _extensions(self):
        raw = self.config["extensions"].get()
        if isinstance(raw, str):
            raw = raw.split()
        return {e.lower() if e.startswith(".") else f".{e.lower()}" for e in raw}

    def _sidecars(self, audio_path):
        """Yield (source_file, suffix) for files named `<stem><suffix>` beside the audio."""
        directory, name = os.path.split(audio_path)
        stem = os.path.splitext(name)[0]
        exts = self._extensions()
        try:
            entries = os.listdir(directory)
        except OSError:
            return
        for entry in entries:
            if not entry.startswith(stem):
                continue
            suffix = entry[len(stem):]
            # `.lrc` or a language-tagged variant such as `.en.lrc`
            if suffix.startswith(".") and os.path.splitext("x" + suffix)[1].lower() in exts:
                yield os.path.join(directory, entry), suffix

    def _transfer(self, source, destination, operation):
        source, destination = os.fsdecode(source), os.fsdecode(destination)
        if os.path.normpath(source) == os.path.normpath(destination):
            return
        dest_stem = os.path.splitext(destination)[0]
        os.makedirs(os.path.dirname(destination), exist_ok=True)
        for path, suffix in list(self._sidecars(source)):
            target = dest_stem + suffix
            if os.path.exists(target):
                continue
            try:
                operation(path, target)
            except OSError as exc:
                self._log.warning("sidecar {}: {}", path, exc)

    def _on_copied(self, item, source, destination):
        self._transfer(source, destination, shutil.copy2)

    def _on_moved(self, item, source, destination):
        self._transfer(source, destination, shutil.move)
