#!/usr/bin/env python3
"""
SATURN CINEMA — 每日自动抓取脚本
抓取宇宙/科技类 YouTube 视频元数据，写入 public/saturn_daily.json 作为前端兜底数据。

使用免 Key 的 Piped API 镜像节点轮询（无需 YouTube API Key），
也可通过环境变量 YOUTUBE_API_KEY 走官方 YouTube Data API v3。
仅抓取公开视频元数据（标题/频道/时长/观看数/视频ID），不下载任何媒体文件。
"""

import json
import os
import re
import sys
import urllib.parse
import urllib.request
from datetime import date, timezone

PIPED_INSTANCES = [
    "https://pipedapi.kavin.rocks",
    "https://pipedapi.tokhmi.xyz",
    "https://pipedapi.moomoo.me",
    "https://pipedapi.ducks.party",
]

QUERIES = [
    "universe space documentary",
    "NASA astronomy",
    "future technology AI",
    "space ambient music",
]

MAX_VIDEOS = 12
OUT_PATH = os.path.join("public", "saturn_daily.json")

YOUTUBE_API_KEY = os.environ.get("YOUTUBE_API_KEY", "").strip()

VIDEO_ID_RE = re.compile(r"([A-Za-z0-9_-]{11})")


def extract_video_id(url: str) -> str:
    m = re.search(r"(?:v=|/shorts/|/embed/)([A-Za-z0-9_-]{11})", url or "")
    if m:
        return m.group(1)
    return ""


def http_get_json(url: str, timeout: int = 10):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def search_piped(query: str):
    for instance in PIPED_INSTANCES:
        try:
            url = f"{instance}/search?q={urllib.parse.quote(query)}&filter=videos"
            data = http_get_json(url)
            items = data.get("items", [])
            videos = []
            for it in items:
                if it.get("type") != "stream":
                    continue
                video_id = extract_video_id(it.get("url", ""))
                if not video_id:
                    continue
                videos.append({
                    "videoId": video_id,
                    "title": it.get("title") or "Untitled",
                    "author": it.get("uploaderName") or it.get("uploader") or "Unknown",
                    "publishedText": it.get("uploadedDate"),
                    "durationSeconds": it.get("duration") if isinstance(it.get("duration"), int) else None,
                    "views": it.get("views") if isinstance(it.get("views"), int) else None,
                })
            if videos:
                return videos
        except Exception:
            continue
    return []


def search_official(query: str):
    """可选：官方 YouTube Data API v3（需 YOUTUBE_API_KEY）。"""
    if not YOUTUBE_API_KEY:
        return []
    base = "https://www.googleapis.com/youtube/v3"
    try:
        search = http_get_json(
            f"{base}/search?part=snippet&type=video&maxResults=12&q={urllib.parse.quote(query)}&key={YOUTUBE_API_KEY}"
        )
        ids = [i["id"]["videoId"] for i in search.get("items", []) if i.get("id", {}).get("videoId")]
        if not ids:
            return []
        detail = http_get_json(
            f"{base}/videos?part=snippet,statistics,contentDetails&id={','.join(ids)}&key={YOUTUBE_API_KEY}"
        )
        videos = []
        for v in detail.get("items", []):
            videos.append({
                "videoId": v["id"],
                "title": v.get("snippet", {}).get("title", "Untitled"),
                "author": v.get("snippet", {}).get("channelTitle", "Unknown"),
                "publishedText": (v.get("snippet", {}).get("publishedAt") or "")[:10],
                "durationSeconds": parse_iso_duration(v.get("contentDetails", {}).get("duration")),
                "views": int(v.get("statistics", {}).get("viewCount", 0) or 0),
            })
        return videos
    except Exception:
        return []


def parse_iso_duration(iso: str) -> int:
    if not iso:
        return 0
    m = re.match(r"PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?", iso)
    if not m:
        return 0
    return int(m.group(1) or 0) * 3600 + int(m.group(2) or 0) * 60 + int(m.group(3) or 0)


def dedupe(videos):
    seen = set()
    out = []
    for v in videos:
        if v["videoId"] in seen:
            continue
        seen.add(v["videoId"])
        out.append(v)
    return out


def main():
    videos = []
    for q in QUERIES:
        if YOUTUBE_API_KEY:
            videos.extend(search_official(q))
        videos.extend(search_piped(q))
        if len(videos) >= MAX_VIDEOS:
            break

    videos = dedupe(videos)[:MAX_VIDEOS]

    payload = {
        "date": date.today().isoformat(),
        "generatedAt": date.today().isoformat(),
        "source": "Piped/Invidious mirrors" if not YOUTUBE_API_KEY else "YouTube Data API v3",
        "count": len(videos),
        "videos": videos,
    }

    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

    print(f"Wrote {len(videos)} videos to {OUT_PATH}")
    return 0 if videos else 1


if __name__ == "__main__":
    sys.exit(main())
