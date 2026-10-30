from .lyrics.service import LyricsService
from .services.beets_engine import BeetsEngine
from .services.inbox import InboxService
from .services.matcher import MatchService
from .services.tracks import TrackService

engine = BeetsEngine()
tracks = TrackService(engine)
matcher = MatchService(engine)
lyrics = LyricsService(engine)
inbox = InboxService(engine, tracks, lyrics)
