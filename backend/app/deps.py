from .lyrics.service import LyricsService
from .services.beets_engine import BeetsEngine
from .services.inbox import InboxService
from .services.library_backup import LibraryBackupService
from .services.match_store import MatchStore
from .services.matcher import MatchService
from .services.tracks import TrackService

engine = BeetsEngine()
tracks = TrackService(engine)
matcher = MatchService(engine)
match_store = MatchStore(engine, matcher)
lyrics = LyricsService(engine)
inbox = InboxService(engine, tracks, lyrics)
library_backup = LibraryBackupService(engine)
