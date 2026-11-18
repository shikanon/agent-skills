#!/usr/bin/env python3
"""Search TXQQ, download the selected returned audio, and verify local delivery."""

import argparse
from datetime import datetime, timedelta, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import time
import unicodedata
import urllib.parse
import urllib.request

import music_search


SITE = "https://music.txqq.pro/"
SOURCES = {"netease", "qq", "kugou", "kuwo", "baidu", "1ting", "migu",
           "lizhi", "qingting", "ximalaya", "5singyc", "5singfc", "kg"}
MEDIA_DOMAINS = {"music.163.com", "music.126.net", "qq.com", "qqmusic.qq.com",
                 "kuwo.cn", "kugou.com", "kugou.net", "migu.cn",
                 "taihe.com", "1ting.com", "lizhi.fm", "qingting.fm",
                 "ximalaya.com", "xmcdn.com"}
ROOT = Path.home() / ".local/share/go-music-dl"
DEFAULT_OUTDIR = Path.home() / "Downloads/资讯/音乐下载"
HEADERS = {"User-Agent": "Mozilla/5.0", "Referer": SITE}


def now():
    return datetime.now(timezone(timedelta(hours=8))).isoformat(timespec="seconds")


def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    # Receipts may contain expiring CDN URLs; keep them local and private.
    with os.fdopen(os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600), "w", encoding="utf-8") as output:
        json.dump(data, output, ensure_ascii=False, indent=2)
        output.write("\n")


def clean_track(track, source):
    identity = str(track.get("songid", ""))
    provider = str(track.get("type") or source)
    if provider != source or not re.fullmatch(r"[A-Za-z0-9_|-]{1,128}", identity):
        raise ValueError("The site returned an unexpected source or song ID")
    if not track.get("title") or not track.get("url"):
        raise ValueError("The site returned incomplete track metadata")
    return {"id": identity, "source": provider, "name": str(track["title"]),
            "artist": str(track.get("author", "")), "url": str(track["url"]),
            "original_url": str(track.get("link", ""))}


def site_request(value, source, mode="name", page=1):
    if source not in SOURCES:
        raise ValueError("Unsupported site source: " + source)
    fields = {"input": value, "filter": mode, "type": source, "page": page}
    request = urllib.request.Request(
        SITE, data=urllib.parse.urlencode(fields).encode(),
        headers={**HEADERS, "X-Requested-With": "XMLHttpRequest",
                 "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8"},
    )
    with urllib.request.urlopen(request, timeout=35) as response:
        raw = response.read(8 * 1024 * 1024 + 1)
    if len(raw) > 8 * 1024 * 1024:
        raise ValueError("The search response exceeded 8 MiB")
    result = json.loads(raw)
    if not isinstance(result, dict):
        raise RuntimeError("The site returned an unexpected response structure")
    if result.get("code") != 200 or not isinstance(result.get("data"), list):
        raise RuntimeError(str(result.get("error") or "The site did not return track data"))
    tracks = [clean_track(track, source) for track in result["data"]]
    return {"schema_version": 1, "site": SITE, "fetched_at": now(),
            "request": {"input": value, "filter": mode, "source": source, "page": page},
            "status": "ok" if tracks else "empty", "tracks": tracks}


def parse_query(value, source):
    if not value.startswith(("http://", "https://")):
        if not value.strip():
            raise ValueError("The search keyword must not be empty")
        return value, source
    parsed = urllib.parse.urlsplit(value)
    if parsed.scheme != "https" or parsed.hostname != "music.txqq.pro" or parsed.username:
        raise ValueError("Pass a music.txqq.pro search URL or a keyword")
    params = urllib.parse.parse_qs(parsed.query)
    query = params.get("name", [""])[0]
    provider = params.get("type", [source])[0]
    if not query or provider not in SOURCES:
        raise ValueError("The URL needs name and a supported type parameter")
    return query, provider


def tool_path(name):
    config_file = ROOT / "media-tools.json"
    config = json.loads(config_file.read_text()) if config_file.is_file() else {}
    candidates = [os.environ.get(name.upper()), shutil.which(name), config.get(name)]
    for candidate in candidates:
        if candidate and os.access(candidate, os.X_OK):
            return str(Path(candidate).expanduser().resolve())
    raise RuntimeError(name + " is needed for audio verification; set " + name.upper() + " to an installed executable")


def validate_media_url(url):
    parsed = urllib.parse.urlsplit(url)
    hostname = (parsed.hostname or "").lower()
    if (parsed.scheme not in {"http", "https"} or parsed.username or parsed.password
            or parsed.port not in {None, 80, 443}
            or not any(hostname == domain or hostname.endswith("." + domain) for domain in MEDIA_DOMAINS)):
        raise ValueError("The returned media host has not been verified for this downloader: " + hostname)
    return url


class MediaRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, message, headers, newurl):
        validate_media_url(newurl)
        return super().redirect_request(request, fp, code, message, headers, newurl)


def native_expectation(track):
    if track["source"] not in {"netease", "qq", "kuwo", "kugou", "migu"} or not track["original_url"]:
        return {"status": "unavailable", "reason": "No verified native metadata route for this source"}
    try:
        binary = os.environ.get("MUSIC_DL_BIN") or shutil.which("music-dl") or str(Path.home() / ".local/bin/music-dl")
        binary = str(Path(shutil.which(binary) or binary).expanduser().resolve())
        # Keep process ownership in this context so an exception always stops its server.
        with music_search.local_server(binary) as root:
            page = music_search.get_page(root, "search", {"q": track["original_url"],
                                         "type": "song", "sources": [track["source"]],
                                         "page_size": 500, "page": 1}, 35)
        candidates = [song for song in page.songs
                      if song["source"] == track["source"] and song["id"] == track["id"]]
        if len(candidates) != 1:
            return {"status": "unavailable", "reason": "Native metadata did not return the same provider ID"}
        return {"status": "verified", "fetched_at": now(), "song": candidates[0]}
    except (OSError, ValueError, RuntimeError) as error:
        return {"status": "unavailable", "reason": str(error)[:300]}


def hot_selection(path, source, rank):
    report = json.loads(path.expanduser().read_text())
    if report.get("mode") != "hot":
        raise ValueError("--hot-receipt must be a music_search.py hot JSON receipt")
    sources = [result for result in report.get("results", [])
               if result.get("source") == source and result.get("status") == "ok"]
    songs = [song for result in sources for song in result.get("songs", []) if song.get("rank") == rank]
    if len(songs) != 1:
        raise ValueError("The selected source/rank does not identify a song in this hot receipt")
    return songs[0], {"path": str(path.expanduser().resolve()), "fetched_at": report.get("fetched_at"),
                      "chart": sources[0].get("chart"), "rank": rank}


def inspect_audio(path, ffprobe, ffmpeg, expected_duration):
    result = subprocess.run(
        [ffprobe, "-v", "error", "-show_entries",
         "format=duration,size,format_name,bit_rate:stream=codec_name,codec_type,sample_rate,channels",
         "-of", "json", str(path)], capture_output=True, text=True, check=True, timeout=45,
    )
    metadata = json.loads(result.stdout)
    streams = [stream for stream in metadata.get("streams", []) if stream.get("codec_type") == "audio"]
    if not streams:
        raise ValueError("The download does not contain an audio stream")
    stream = streams[0]
    duration = float(metadata.get("format", {}).get("duration", 0))
    if duration <= 0:
        raise ValueError("The audio duration is empty")
    formats = metadata["format"]["format_name"].split(",")
    extension = next((ext for fmt, ext in [("mp3", ".mp3"), ("flac", ".flac"),
                     ("wav", ".wav"), ("ogg", ".ogg"), ("mov", ".m4a"),
                     ("aac", ".aac")] if fmt in formats), None)
    if extension is None:
        raise ValueError("Unsupported audio container: " + metadata["format"]["format_name"])
    subprocess.run([ffmpeg, "-nostdin", "-v", "error", "-xerror", "-i", str(path),
                    "-map", "0:a:0", "-f", "null", "-"], capture_output=True,
                   check=True, timeout=max(60, int(duration) + 20))
    duration_matches = None
    if expected_duration:
        duration_matches = abs(duration - expected_duration) <= max(3, expected_duration * 0.02)
        if not duration_matches:
            raise ValueError("Duration mismatch: expected %.3fs, downloaded %.3fs; kept the .part file" % (expected_duration, duration))
    digest = hashlib.sha256()
    with path.open("rb") as media:
        for block in iter(lambda: media.read(1024 * 1024), b""):
            digest.update(block)
    return {"duration_seconds": round(duration, 3), "codec": stream["codec_name"],
            "sample_rate": int(stream["sample_rate"]), "channels": stream["channels"],
            "bytes": path.stat().st_size, "sha256": digest.hexdigest(),
            "full_decode_passed": True, "expected_duration_seconds": expected_duration or None,
            "duration_matches": duration_matches, "extension": extension}


def filename(value):
    value = unicodedata.normalize("NFC", value)
    return re.sub(r'[\\/:*?"<>|\x00-\x1f]', "-", value).strip(" .")[:100] or "track"


def download_track(track, selection, outdir, expectation=None, hot_receipt=None, max_mib=128):
    ffmpeg, ffprobe = tool_path("ffmpeg"), tool_path("ffprobe")
    outdir = outdir.expanduser().resolve()
    outdir.mkdir(parents=True, exist_ok=True)
    receipt_path = outdir / ".receipts" / (track["source"] + "-" + track["id"] + ".json")
    expectation = expectation or native_expectation(track)
    expected_song = expectation.get("song", {})
    if expected_song and (expected_song["id"] != track["id"] or expected_song["source"] != track["source"]):
        raise ValueError("The resolved track contradicts the selected provider ID")
    expected_duration = expected_song.get("duration_seconds", 0)
    identity = track["source"] + "-" + track["id"]
    if receipt_path.is_file():
        old = json.loads(receipt_path.read_text())
        existing = Path(old.get("local_file", ""))
        if existing.parent == outdir and existing.is_file():
            audio = inspect_audio(existing, ffprobe, ffmpeg, expected_duration)
            if audio["sha256"] != old.get("audio", {}).get("sha256"):
                raise ValueError("An existing delivered file changed; kept it without overwriting")
            old.update(reused_existing=True, rechecked_at=now(), audio=audio,
                       last_selection=selection, last_hot_receipt=hot_receipt,
                       native_expectation=expectation)
            write_json(receipt_path, old)
            return old
    stem = filename(track["name"] + " - " + track["artist"]) + " [" + identity.replace("|", "-") + "]"
    part = outdir / (stem + ".part")
    if part.exists():
        raise ValueError("A previous partial file exists; inspect it before explicitly retrying: " + str(part))
    validate_media_url(track["url"])
    opener = urllib.request.build_opener(MediaRedirect())
    request = urllib.request.Request(track["url"], headers=HEADERS)
    started = time.monotonic()
    with opener.open(request, timeout=35) as response:
        final_url = validate_media_url(response.url)
        content_type = response.headers.get("Content-Type", "")
        if any(kind in content_type.lower() for kind in ("text/", "application/json")):
            raise ValueError("The media link returned a webpage or error response instead of audio")
        expected_bytes = int(response.headers.get("Content-Length", 0))
        if expected_bytes > max_mib * 1024 * 1024:
            raise ValueError("The media file exceeds the configured size limit")
        transferred = 0
        with part.open("xb") as output:
            while True:
                block = response.read(256 * 1024)
                if not block:
                    break
                transferred += len(block)
                if transferred > max_mib * 1024 * 1024:
                    raise ValueError("The media file exceeds the configured size limit")
                output.write(block)
        if expected_bytes and transferred != expected_bytes:
            raise ValueError("The response ended before the advertised content length")
    audio = inspect_audio(part, ffprobe, ffmpeg, expected_duration)
    destination = outdir / (stem + audio["extension"])
    if destination.exists():
        raise ValueError("A destination file exists without a verified matching receipt; preserved both files")
    os.replace(part, destination)
    record = {"schema_version": 1, "status": "downloaded_verified", "downloaded_at": now(),
              "site": SITE, "song": track, "selection": selection,
              "local_file": str(destination), "receipt_file": str(receipt_path), "audio": audio,
              "native_expectation": expectation, "hot_receipt": hot_receipt,
              "download": {"request_url": track["url"], "final_url": final_url,
                           "content_type": content_type, "content_length": expected_bytes,
                           "elapsed_seconds": round(time.monotonic() - started, 3)},
              "rights_evidence": {"site_statement": "音频版权来自各网站，本站只提供数据查询服务",
                                  "per_track_license_document": None},
              "reused_existing": False}
    write_json(receipt_path, record)
    return record


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    search = commands.add_parser("search", help="Save a selectable search receipt")
    fetch = commands.add_parser("fetch", help="Search, select one result, download and verify it")
    download = commands.add_parser("download", help="Download a selected receipt item or an exact provider ID")
    for command in (search, fetch):
        command.add_argument("query", help="A keyword or TXQQ search URL")
        command.add_argument("--page", type=int, default=1)
    for command in (search, fetch, download):
        command.add_argument("--source", choices=sorted(SOURCES), default="netease")
        command.add_argument("--output", type=Path, help="Save the command result as JSON")
    for command in (fetch, download):
        command.add_argument("--index", type=int, default=1, help="One-based selected search result")
        command.add_argument("--outdir", type=Path, default=DEFAULT_OUTDIR)
        command.add_argument("--max-mib", type=int, default=128)
    origin = download.add_mutually_exclusive_group(required=True)
    origin.add_argument("--receipt", type=Path, help="A search receipt from this helper")
    origin.add_argument("--id", help="Exact provider song ID; do not pass a guessed ID")
    origin.add_argument("--hot-receipt", type=Path, help="An existing music_search.py hot receipt")
    download.add_argument("--rank", type=int, default=1, help="Chart position from --hot-receipt")
    args = parser.parse_args()
    if getattr(args, "page", 1) < 1 or getattr(args, "index", 1) < 1 or getattr(args, "rank", 1) < 1:
        parser.error("Page, index and rank must be positive")
    if not 1 <= getattr(args, "max_mib", 128) <= 512:
        parser.error("--max-mib must be 1-512")
    track, selection = None, None
    try:
        expectation, hot_receipt = None, None
        if args.command in {"search", "fetch"}:
            query, source = parse_query(args.query, args.source)
            report = site_request(query, source, page=args.page)
            if args.command == "search":
                if args.output:
                    write_json(args.output.expanduser(), report)
                print(json.dumps(report, ensure_ascii=False, indent=2))
                return 0
            # Save the search independently so a failed download does not lose selection evidence.
            search_path = args.outdir.expanduser() / ".receipts" / ("search-" + hashlib.sha256((source + query + str(args.page)).encode()).hexdigest()[:16] + ".json")
            write_json(search_path, report)
            if args.index > len(report["tracks"]):
                raise ValueError("The selected index is not present in the site response")
            track = report["tracks"][args.index - 1]
            selection = {"kind": "search", "receipt": str(search_path.resolve()),
                         "query": query, "page": args.page, "index": args.index}
        elif args.receipt:
            report = json.loads(args.receipt.expanduser().read_text())
            if report.get("site") != SITE or not isinstance(report.get("tracks"), list):
                raise ValueError("Not a TXQQ search receipt")
            if args.index > len(report["tracks"]):
                raise ValueError("The selected index is not present in the receipt")
            selected = report["tracks"][args.index - 1]
            report = site_request(selected["id"], selected["source"], mode="id")
            candidates = [track for track in report["tracks"] if track["id"] == selected["id"]]
            if len(candidates) != 1:
                raise ValueError("The site did not resolve the selected exact provider ID")
            track = candidates[0]
            selection = {"kind": "search_receipt", "receipt": str(args.receipt.expanduser().resolve()), "index": args.index}
        else:
            if args.hot_receipt:
                song, hot_receipt = hot_selection(args.hot_receipt, args.source, args.rank)
                song_id = song["id"]
                expectation = {"status": "verified_from_hot_receipt", "song": song,
                               "fetched_at": hot_receipt["fetched_at"]}
            else:
                song_id = args.id
            report = site_request(song_id, args.source, mode="id")
            candidates = [track for track in report["tracks"] if track["id"] == str(song_id)]
            if len(candidates) != 1:
                raise ValueError("The site did not return the selected exact provider ID")
            track = candidates[0]
            selection = {"kind": "hot_receipt" if hot_receipt else "exact_id", "id": str(song_id)}
        report = download_track(track, selection, args.outdir, expectation, hot_receipt, args.max_mib)
        if args.output:
            write_json(args.output.expanduser(), report)
        # Do not print signed CDN URLs or full server responses into the conversation.
        visible = {key: report[key] for key in ("status", "downloaded_at", "local_file", "receipt_file", "audio", "reused_existing")}
        visible["song"] = {key: track[key] for key in ("id", "source", "name", "artist", "original_url")}
        visible["native_metadata_status"] = report["native_expectation"]["status"]
        print(json.dumps(visible, ensure_ascii=False, indent=2))
        return 0
    except (OSError, ValueError, RuntimeError, KeyError, TypeError, subprocess.SubprocessError) as error:
        failure = {"status": "failed", "failed_at": now(), "error": str(error)[:1200]}
        if track:
            failure["song"] = {key: track.get(key) for key in ("id", "source", "name", "artist")}
            failure["selection"] = selection
        if args.output:
            write_json(args.output.expanduser(), failure)
        print(json.dumps(failure, ensure_ascii=False, indent=2))
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
