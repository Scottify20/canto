from ..text import artist_similarity, similarity
from .base import TIMEOUT, LyricsSource, payload_candidate


class AppleMusicSource(LyricsSource):
    """Official syllable-synced TTML. Needs an Apple Music subscription and your own tokens."""

    name = "apple"

    def search(self, artist, title, album, duration):
        keys = self.keys
        developer, user = keys.get("developer_token"), keys.get("media_user_token")
        if not developer or not user:
            return []
        storefront = (keys.get("storefront") or "us").strip().lower()
        headers = {
            "Authorization": f"Bearer {developer}",
            "Media-User-Token": user,
            "Origin": "https://music.apple.com",
        }
        base = f"https://amp-api.music.apple.com/v1/catalog/{storefront}"
        res = self.http.get(f"{base}/search", params={"term": f"{artist} {title}", "types": "songs", "limit": 5}, headers=headers, timeout=TIMEOUT)
        if res.status_code in (401, 403):
            raise PermissionError("Apple tokens rejected")
        if res.status_code != 200:
            return []
        found = []
        for song in (((res.json().get("results") or {}).get("songs")) or {}).get("data", []):
            attrs = song.get("attributes") or {}
            length = float(attrs.get("durationInMillis") or 0) / 1000 or None
            if similarity(title, attrs.get("name", "")) < 0.75 or artist_similarity(artist, attrs.get("artistName", "")) < 0.5:
                continue
            for endpoint in ("syllable-lyrics", "lyrics"):
                lyric = self.http.get(f"{base}/songs/{song['id']}/{endpoint}", headers=headers, timeout=TIMEOUT)
                if lyric.status_code != 200:
                    continue
                ttml = (((lyric.json().get("data") or [{}])[0]).get("attributes") or {}).get("ttml")
                cand = payload_candidate(self.name, attrs.get("name", ""), attrs.get("artistName", ""), length, ttml, None)
                if cand:
                    found.append(cand)
                    break
        return found
