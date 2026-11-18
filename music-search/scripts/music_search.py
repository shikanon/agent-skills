#!/usr/bin/env python3
"""Read live chart/song metadata through a temporary local Go Music DL server."""

import argparse
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from html.parser import HTMLParser
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request


DEFAULT_SOURCES = "netease,qq,kuwo"
CHART_SOURCES = {"netease", "qq", "kugou", "kuwo", "migu", "soda", "apple"}
SEARCH_SOURCES = CHART_SOURCES | {"qianqian", "fivesing", "jamendo", "joox", "bilibili"}
PAGE_SIZE = 500


def as_int(value, default=0):
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def public_link(value):
    parsed = urllib.parse.urlsplit(value or "")
    if parsed.scheme in {"https", "http"} and parsed.hostname and not parsed.username:
        return value
    return ""


class MusicPage(HTMLParser):
    """Parse metadata only; never follow playback, artwork or download links."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.songs = []
        self.charts = []
        self.total = 0
        self.song = None

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        classes = attrs.get("class", "").split()
        if attrs.get("id") == "batch-toolbar":
            self.total = as_int(attrs.get("data-total-count"))
        if tag == "a" and "toplist-card" in classes:
            url = urllib.parse.urlsplit(attrs.get("href", ""))
            if url.path != "/music/toplist_songs" or url.netloc:
                return
            params = urllib.parse.parse_qs(url.query)
            get = lambda key: params.get(key, [""])[0]
            if not get("source") or not get("toplist_id"):
                return
            self.charts.append({
                "id": get("toplist_id"),
                "source": get("source"),
                "name": get("toplist_name") or get("name"),
                "url": public_link(get("link")),
                "update_frequency": get("update_frequency"),
                "reported_track_count": as_int(get("track_count")),
            })
        if tag == "li" and "song-card" in classes:
            self.song = {
                "id": attrs.get("data-id", ""),
                "source": attrs.get("data-source", ""),
                "name": attrs.get("data-name", ""),
                "artist": attrs.get("data-artist", ""),
                "album": attrs.get("data-album", ""),
                "duration_seconds": as_int(attrs.get("data-duration")),
                "url": "",
            }
            self.songs.append(self.song)
        if self.song is not None and tag == "a" and "song-title-link" in classes:
            self.song["url"] = public_link(attrs.get("href", ""))

    def handle_endtag(self, tag):
        if tag == "li":
            self.song = None


def get_page(root, path, params, timeout):
    # Always construct local requests here. Never request arbitrary links from HTML.
    if path not in {"toplists", "toplist_songs", "search"}:
        raise ValueError("Unsupported metadata endpoint")
    query = urllib.parse.urlencode(params, doseq=True)
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    request = urllib.request.Request(root + "/music/" + path + "?" + query,
                                     headers={"User-Agent": "music-search-skill/1"})
    with opener.open(request, timeout=timeout) as response:
        if "text/html" not in response.headers.get("Content-Type", ""):
            raise RuntimeError("The metadata endpoint did not return HTML")
        data = response.read(16 * 1024 * 1024 + 1)
    if len(data) > 16 * 1024 * 1024:
        raise RuntimeError("Metadata response exceeded 16 MiB")
    page = MusicPage()
    page.feed(data.decode("utf-8"))
    return page


@contextmanager
def local_server(binary):
    # Isolate config, cookies, history and the automatic download queue.
    with tempfile.TemporaryDirectory(prefix="music-search-") as scratch:
        env = os.environ.copy()
        env["MUSIC_DL_CONFIG_DB"] = str(Path(scratch) / "data/settings.db")
        env["MUSIC_DL_COOKIE_FILE"] = str(Path(scratch) / "data/cookies.json")
        with socket.socket() as port_socket:
            port_socket.bind(("127.0.0.1", 0))
            port = port_socket.getsockname()[1]
        root = "http://127.0.0.1:" + str(port)
        proc = subprocess.Popen(
            [binary, "web", "--desktop", "--no-browser", "--port", str(port)],
            cwd=scratch, env=env, stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        try:
            opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
            deadline = time.monotonic() + 12
            while time.monotonic() < deadline:
                if proc.poll() is not None:
                    raise RuntimeError("music-dl web exited before readiness; verify the installed version")
                try:
                    with opener.open(root + "/music/healthz", timeout=0.4) as response:
                        health = json.load(response)
                    if health.get("app") == "go-music-dl" and health.get("status") == "ok":
                        break
                except (OSError, ValueError):
                    pass
                time.sleep(0.1)
            else:
                raise RuntimeError("The temporary music-dl server did not become ready")
            yield root
        finally:
            if proc.poll() is None:
                proc.terminate()
                try:
                    proc.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    proc.kill()
                    proc.wait(timeout=3)


def matches(item, keyword):
    text = " ".join(str(item.get(key, "")) for key in ("name", "artist", "album"))
    return not keyword or keyword.casefold() in text.casefold()


def select_chart(charts, name, chart_id):
    if chart_id:
        found = [chart for chart in charts if chart["id"] == chart_id]
    else:
        found = [chart for chart in charts if chart["name"] in {name, name + "榜"}]
        if not found:
            found = [chart for chart in charts if name.casefold() in chart["name"].casefold()]
    if len(found) == 1:
        return found[0]
    if not found:
        raise ValueError("No matching chart; run charts for this source and choose a returned name or ID")
    choices = ", ".join(chart["name"] + " (" + chart["id"] + ")" for chart in found[:12])
    raise ValueError("Ambiguous chart; choose a specific name or ID: " + choices)


def run_source(root, args, source):
    result = {"source": source, "status": "error"}
    try:
        if args.command in {"charts", "hot"}:
            chart_page = get_page(root, "toplists", {"sources": [source]}, args.timeout)
            charts = [chart for chart in chart_page.charts if chart["source"] == source]
            if not charts:
                result.update(status="empty_or_unavailable", charts=[],
                              error="No chart metadata returned by music-dl")
                return result
            if args.command == "charts":
                filtered = [chart for chart in charts if matches(chart, args.match)]
                result.update(status="ok" if filtered else "no_matches",
                              received_count=len(charts), matched_count=len(filtered),
                              charts=filtered[:args.limit])
                return result
            chart = select_chart(charts, args.chart, args.chart_id)
            result["chart"] = chart
            params = {"source": source, "toplist_id": chart["id"],
                      "toplist_name": chart["name"], "link": chart["url"],
                      "page_size": PAGE_SIZE, "page": 1}
            page = get_page(root, "toplist_songs", params, args.timeout)
        else:
            page = get_page(root, "search", {"q": args.keyword, "type": "song",
                                            "sources": [source], "page_size": PAGE_SIZE,
                                            "page": 1}, args.timeout)
        songs = [song for song in page.songs if song["source"] == source and song["id"] and song["name"]]
        order_key = "rank" if args.command == "hot" else "position"
        for position, song in enumerate(songs, 1):
            song[order_key] = position
        filtered = [song for song in songs if matches(song, args.match)]
        if songs:
            status = "ok" if filtered else "no_matches"
        else:
            status = "empty_or_unavailable"
        result.update(status=status, received_count=len(songs), total_from_cli=page.total,
                      matched_count=len(filtered), songs=filtered[:args.limit])
        if not songs and page.total > 0:
            result.update(status="error", error="The native page reports songs but none could be parsed; check version compatibility")
        elif not songs:
            result["error"] = "No songs returned; the upstream tool may hide provider errors"
        if page.total > len(songs):
            result["warnings"] = ["Only the first 500 songs are scanned; this is not a complete chart search"]
    except (OSError, ValueError, RuntimeError, urllib.error.URLError) as error:
        result["error"] = str(error)
    return result


def render_table(report):
    def cell(value):
        return str(value).replace("|", "\\|").replace("\n", " ").replace("\r", " ")

    lines = ["抓取时间：" + report["fetched_at"], "状态：" + report["status"]]
    if report.get("error"):
        lines.append(cell(report["error"]))
    for result in report["results"]:
        label = result["source"]
        if result.get("chart"):
            label += " · " + result["chart"]["name"]
        lines.extend(["", cell(label) + "：" + result["status"]])
        if result.get("error"):
            lines.append(cell(result["error"]))
        if "charts" in result:
            lines.extend(["", "| ID | 榜单 | 更新信息 | 来源 |", "| --- | --- | --- | --- |"])
            for chart in result["charts"]:
                lines.append("| " + " | ".join(cell(chart[key]) for key in ("id", "name", "update_frequency", "url")) + " |")
        elif result.get("songs"):
            lines.extend(["", "| 顺序 | 歌曲 | 歌手 | 秒 | 来源 |", "| --- | --- | --- | --- | --- |"])
            for song in result["songs"]:
                values = [song.get("rank", song.get("position")), song["name"], song["artist"], song["duration_seconds"], song["url"]]
                lines.append("| " + " | ".join(map(cell, values)) + " |")
        lines.extend(result.get("warnings", []))
    return "\n".join(lines) + "\n"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    for name in ("hot", "charts", "search"):
        command = commands.add_parser(name)
        if name == "search":
            command.add_argument("keyword")
        if name == "hot":
            command.add_argument("--chart", default="热歌", help="Chart name or unambiguous substring")
            command.add_argument("--chart-id", help="ID returned by charts; requires one source")
        command.add_argument("--sources", default=DEFAULT_SOURCES)
        command.add_argument("--match", default="", help="Substring filter on name, artist or album")
        command.add_argument("--limit", type=int, default=30 if name == "charts" else 10,
                             help="Maximum items per source (1-100)")
        command.add_argument("--timeout", type=float, default=35, help="Seconds per local metadata request")
        command.add_argument("--format", choices=("json", "table"), default="json")
        command.add_argument("--output", type=Path, help="Save the same output to a file")
        command.add_argument("--binary", default=os.environ.get("MUSIC_DL_BIN"))
    args = parser.parse_args()
    sources = list(dict.fromkeys(item.strip() for item in args.sources.split(",") if item.strip()))
    supported = SEARCH_SOURCES if args.command == "search" else CHART_SOURCES
    if not sources or set(sources) - supported:
        parser.error("Choose supported sources: " + ",".join(sorted(supported)))
    if not 1 <= args.limit <= 100 or not 0 < args.timeout <= 120:
        parser.error("--limit must be 1-100 and --timeout must be greater than 0 and at most 120")
    if args.command == "hot" and args.chart_id and len(sources) != 1:
        parser.error("--chart-id requires exactly one source")
    if args.command == "search" and not args.keyword.strip():
        parser.error("The search keyword must not be empty")
    if args.command == "hot" and not args.chart.strip():
        parser.error("The chart name must not be empty")
    binary = args.binary or shutil.which("music-dl") or str(Path.home() / ".local/bin/music-dl")
    binary = str(Path(shutil.which(binary) or binary).expanduser().resolve())
    report = {"mode": args.command, "sources": sources}
    if args.command == "search":
        report["keyword"] = args.keyword
    if args.match:
        report["match"] = args.match
    try:
        if not os.access(binary, os.X_OK):
            raise RuntimeError("music-dl executable not found; install it or set MUSIC_DL_BIN")
        with local_server(binary) as root:
            with ThreadPoolExecutor(max_workers=min(4, len(sources))) as executor:
                results = list(executor.map(lambda source: run_source(root, args, source), sources))
        report["results"] = results
        successes = sum(result["status"] in {"ok", "no_matches"} for result in results)
        report["status"] = "ok" if successes == len(results) else "partial" if successes else "error"
    except (OSError, ValueError, RuntimeError) as error:
        report.update(status="error", results=[], error=str(error))
    report["fetched_at"] = datetime.now(timezone(timedelta(hours=8))).isoformat(timespec="seconds")
    output = json.dumps(report, ensure_ascii=False, indent=2) + "\n" if args.format == "json" else render_table(report)
    if args.output:
        args.output.expanduser().parent.mkdir(parents=True, exist_ok=True)
        args.output.expanduser().write_text(output, encoding="utf-8")
    sys.stdout.write(output)
    return 2 if report["status"] == "error" else 0


if __name__ == "__main__":
    raise SystemExit(main())
