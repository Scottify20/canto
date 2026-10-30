import re

from .base import TIMEOUT, LyricsSource, is_timed_lrc, payload_candidate


class MegalobizSource(LyricsSource):
    """Line-synced LRC sheets; an API key is optional and raises the rate limit."""

    name = "megalobiz"
    BASE = "https://api.megalobiz.com/api/public/v1"

    def search(self, artist, title, album, duration):
        headers = {"X-API-Key": self.keys["api_key"]} if self.keys.get("api_key") else {}
        res = self.http.get(
            f"{self.BASE}/search", params={"title": title, "artist": artist, "duration": int(duration or 0), "limit": 5},
            headers=headers, timeout=TIMEOUT,
        )
        if res.status_code != 200:
            return []
        found = []
        for hit in res.json().get("results", []):
            if float(hit.get("duration_diff") or 0) > 6:
                continue
            lrc = self.http.get(f"{self.BASE}/lrc/{hit['id']}", params={"format": "lrc"}, headers=headers, timeout=TIMEOUT)
            if lrc.status_code == 200 and is_timed_lrc(lrc.text):
                cand = payload_candidate(self.name, title, artist, None, None, lrc.text)
                if cand:
                    found.append(cand)
        return found


class QQMusicSource(LyricsSource):
    """QQ Music line-synced lyrics."""

    name = "qq"
    HEADERS = {"Referer": "https://y.qq.com/portal/player.html", "Origin": "https://y.qq.com"}

    def search(self, artist, title, album, duration):
        res = self.http.get(
            "https://c.y.qq.com/splcloud/fcgi-bin/smartbox_new.fcg", params={"key": f"{artist} {title}", "format": "json"},
            headers=self.HEADERS, timeout=TIMEOUT,
        )
        if res.status_code != 200:
            return []
        songs = (((res.json().get("data") or {}).get("song")) or {}).get("itemlist") or []
        found = []
        for song in songs[:5]:
            lyric = self.http.get(
                "https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg",
                params={"songmid": song["mid"], "g_tk": 5381, "format": "json", "inCharset": "utf8", "outCharset": "utf-8", "nobase64": 1},
                headers=self.HEADERS, timeout=TIMEOUT,
            )
            if lyric.status_code != 200:
                continue
            lrc = lyric.json().get("lyric")
            if not is_timed_lrc(lrc):
                continue
            lrc = re.sub(r"&apos;", "'", lrc)
            cand = payload_candidate(self.name, song.get("name", ""), song.get("singer", ""), None, None, lrc)
            if cand:
                found.append(cand)
        return found
