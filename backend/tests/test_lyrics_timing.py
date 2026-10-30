import os
import tempfile
import unittest
from types import SimpleNamespace

from app.lyrics.service import LyricsOptions, LyricsService
from app.lyrics.convert import parse_ttml
from app.lyrics.types import Candidate

LINE_TTML = """<tt xmlns="http://www.w3.org/ns/ttml" xmlns:itunes="urn:test" itunes:timing="Word"><body><div>
<p begin="0s"><span begin="0s" end="2s">This is an entire lyric line</span></p>
<p begin="2s"><span begin="2s" end="4s">A second line of lyrics</span></p>
<p begin="4s"><span begin="4s" end="6s">And one more lyric line</span></p>
</div></body></tt>"""

WORD_TTML = """<tt xmlns="http://www.w3.org/ns/ttml"><body><div>
<p begin="0s"><span begin="0s" end="0.5s">This </span><span begin="0.5s" end="1s">is </span><span begin="1s" end="2s">timed</span></p>
</div></body></tt>"""

DUR_WORD_TTML = """<tt xmlns="http://www.w3.org/ns/ttml"><body><div>
<p begin="0s" dur="2s"><span begin="0s" dur="0.5s">This </span><span begin="0.5s" dur="0.5s">is </span><span begin="1s" dur="1s">timed</span></p>
</div></body></tt>"""

PHRASE_TTML = """<tt xmlns="http://www.w3.org/ns/ttml"><body><div>
<p begin="0s"><span begin="0s" end="1s">This is</span><span begin="1s" end="2s">not word-level</span></p>
</div></body></tt>"""


class LyricsTimingTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.audio_path = os.path.join(self.temp_dir.name, "track.mp3")
        with open(self.audio_path, "wb"):
            pass
        self.item = SimpleNamespace(
            id=1,
            path=self.audio_path,
            title="Title",
            artist="Artist",
            album="Album",
            length=120,
        )
        self.service = LyricsService.__new__(LyricsService)
        self.service.engine = SimpleNamespace(lib=SimpleNamespace(get_item=lambda _item_id: self.item))

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_candidate_requires_multiple_independently_timed_units_on_a_line(self):
        line_candidate = Candidate("test", "title", "artist", None, parse_ttml(LINE_TTML))
        word_candidate = Candidate("test", "title", "artist", None, parse_ttml(WORD_TTML))
        dur_candidate = Candidate("test", "title", "artist", None, parse_ttml(DUR_WORD_TTML))
        phrase_candidate = Candidate("test", "title", "artist", None, parse_ttml(PHRASE_TTML))

        self.assertFalse(line_candidate.word_synced)
        self.assertTrue(word_candidate.word_synced)
        self.assertTrue(dur_candidate.word_synced)
        self.assertFalse(phrase_candidate.word_synced)

    def test_line_synced_ttml_is_saved_as_lrc(self):
        saved_kind = self.service.save_content(self.item.id, "ttml", LINE_TTML)

        self.assertEqual(saved_kind, "lrc")
        self.assertTrue(os.path.exists(os.path.join(self.temp_dir.name, "track.lrc")))
        self.assertFalse(os.path.exists(os.path.join(self.temp_dir.name, "track.ttml")))

    def test_existing_line_synced_ttml_is_migrated_when_read(self):
        ttml_path = os.path.join(self.temp_dir.name, "track.ttml")
        with open(ttml_path, "w", encoding="utf-8") as handle:
            handle.write(LINE_TTML)

        result = self.service.read_lyrics(self.item.id)

        self.assertIsNone(result["ttml"])
        self.assertIsNone(result["ttml_timing"])
        self.assertIn("[00:00.00]", result["lrc"])
        self.assertFalse(os.path.exists(ttml_path))

    def test_fetch_does_not_save_line_synced_ttml(self):
        candidate = Candidate("test", "title", "artist", 120, parse_ttml(LINE_TTML))
        self.service.gather = lambda *_args: [candidate]

        result = self.service.process_item(self.item, LyricsOptions())

        self.assertEqual(result["status"], "success")
        self.assertIsNone(result["ttml"])
        self.assertTrue(os.path.exists(os.path.join(self.temp_dir.name, "track.lrc")))
        self.assertFalse(os.path.exists(os.path.join(self.temp_dir.name, "track.ttml")))

    def test_fetch_saves_word_synced_ttml(self):
        candidate = Candidate("test", "title", "artist", 120, parse_ttml(WORD_TTML))
        self.service.gather = lambda *_args: [candidate]

        result = self.service.process_item(self.item, LyricsOptions())

        ttml_path = os.path.join(self.temp_dir.name, "track.ttml")
        self.assertEqual(result["status"], "success")
        self.assertEqual(result["ttml"], "test (word-synced)")
        self.assertTrue(os.path.exists(ttml_path))
        with open(ttml_path, encoding="utf-8") as handle:
            saved_lines = parse_ttml(handle.read())
        self.assertTrue(Candidate("test", "title", "artist", None, saved_lines).word_synced)


if __name__ == "__main__":
    unittest.main()
