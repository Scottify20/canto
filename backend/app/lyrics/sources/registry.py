from dataclasses import dataclass, field

from .apple import AppleMusicSource
from .base import LyricsSource
from .line_apis import MegalobizSource, QQMusicSource
from .lrclib import LrcLibSource
from .musixmatch import MusixmatchSource
from .netease import NetEaseSource
from .lyricsplus import LyricsPlusSource
from .ttml_apis import BetterLyricsSource, LrcRedSource, UnisonSource


@dataclass(frozen=True)
class KeyField:
    id: str
    label: str
    secret: bool = True


@dataclass(frozen=True)
class ProviderInfo:
    id: str
    label: str
    description: str
    word_level: bool
    factory: type[LyricsSource]
    key_fields: tuple[KeyField, ...] = field(default_factory=tuple)
    key_url: str = ""
    key_required: bool = False
    default_enabled: bool = True


# Default order: word-level sources first, then line-synced fallbacks.
PROVIDERS: tuple[ProviderInfo, ...] = (
    ProviderInfo("apple", "Apple Music", "Official syllable-synced TTML. Needs a subscription and your own tokens.", True, AppleMusicSource,
                 (KeyField("developer_token", "Developer token"), KeyField("media_user_token", "Media user token"), KeyField("storefront", "Storefront (e.g. us)", False)),
                 "https://developer.apple.com/documentation/applemusicapi/generating-developer-tokens", True, False),
    ProviderInfo("blyrics", "Better Lyrics", "Apple-Music-based TTML (word or line synced).", True, BetterLyricsSource),
    ProviderInfo("lrcred", "lrc.red", "Apple-derived TTML with a large catalogue.", True, LrcRedSource),
    ProviderInfo("unison", "Unison", "Crowdsourced word-synced TTML.", True, UnisonSource),
    ProviderInfo("lyricsplus", "LyricsPlus", "Word-synced lyrics aggregated from several catalogues (slow).", True, LyricsPlusSource),
    ProviderInfo("musixmatch", "Musixmatch", "Word-level richsync + synced LRC. Needs your own user token.", True, MusixmatchSource,
                 (KeyField("token", "User token"),), "https://github.com/spicetify/cli/wiki", True, False),
    ProviderInfo("netease", "NetEase Cloud Music", "Line + word synced (YRC) lyrics, huge catalogue.", True, NetEaseSource),
    ProviderInfo("lrclib", "LRCLIB", "Community line-synced LRC.", False, LrcLibSource),
    ProviderInfo("megalobiz", "Megalobiz", "Line-synced LRC sheets. API key optional (raises rate limit).", False, MegalobizSource,
                 (KeyField("api_key", "API key"),), "https://megalobiz.com/developers"),
    ProviderInfo("qq", "QQ Music", "Line-synced lyrics from QQ Music.", False, QQMusicSource),
)
PROVIDERS_BY_ID = {p.id: p for p in PROVIDERS}
