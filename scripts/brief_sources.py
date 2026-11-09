"""Collect fresh evidence and verify article images without a paid search API."""
from __future__ import annotations

import hashlib
import html
import re
import ssl
import sys
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from html.parser import HTMLParser

try:
    import certifi
except ImportError:
    SSL_CONTEXT = ssl.create_default_context()
else:
    SSL_CONTEXT = ssl.create_default_context(cafile=certifi.where())

BBC = "https://feeds.bbci.co.uk/news/"
FEEDS = [
    *(("world", region, "BBC", BBC + f"world/{desk}/rss.xml") for region, desk in [
        ("americas", "latin_america"), ("americas", "us_and_canada"), ("europe", "europe"),
        ("asia", "asia"), ("middle_east", "middle_east"), ("africa", "africa"),
    ]),
    ("world", "africa", "Le Monde", "https://www.lemonde.fr/en/le-monde-africa/rss_full.xml"),
    ("world", "global", "The Guardian", "https://www.theguardian.com/world/rss"),
    ("world", "middle_east", "Al Jazeera", "https://www.aljazeera.com/xml/rss/all.xml"),
    ("ai", "global", "OpenAI", "https://openai.com/news/rss.xml"),
    ("ai", "global", "Google", "https://blog.google/technology/ai/rss/"),
    ("ai", "global", "Hugging Face", "https://huggingface.co/blog/feed.xml"),
    ("ai", "global", "NVIDIA", "https://blogs.nvidia.com/feed/"),
    ("ai", "global", "Ars Technica", "https://arstechnica.com/ai/feed/"),
    ("coding", "global", "GitHub Changelog", "https://github.blog/changelog/feed/"),
    ("coding", "global", "Claude Code", "https://github.com/anthropics/claude-code/releases.atom"),
    ("coding", "global", "Codex", "https://github.com/openai/codex/releases.atom"),
    ("coding", "global", "Cursor", "https://cursor.com/changelog/rss.xml"),
    ("papers", "global", "arXiv cs.AI", "https://rss.arxiv.org/rss/cs.AI"),
    ("papers", "global", "arXiv cs.CL", "https://rss.arxiv.org/rss/cs.CL"),
    ("papers", "global", "Nature Machine Intelligence", "https://www.nature.com/natmachintell.rss"),
    ("open", "global", "vLLM", "https://github.com/vllm-project/vllm/releases.atom"),
    ("open", "global", "Transformers", "https://github.com/huggingface/transformers/releases.atom"),
    ("open", "global", "Ollama", "https://github.com/ollama/ollama/releases.atom"),
    ("cs2", "global", "HLTV", "https://www.hltv.org/rss/news"),
    ("cs2", "global", "Valve", "https://store.steampowered.com/feeds/news/app/730/"),
    ("japan", "japan", "NHK", "https://www3.nhk.or.jp/rss/news/cat0.xml"),
    ("japan", "japan", "The Japan Times", "https://www.japantimes.co.jp/feed/"),
    ("japan", "japan", "The Guardian", "https://www.theguardian.com/world/japan/rss"),
    ("economy", "global", "BBC", BBC + "business/rss.xml"),
    ("economy", "global", "The Guardian", "https://www.theguardian.com/business/economics/rss"),
    ("economy", "americas", "Federal Reserve", "https://www.federalreserve.gov/feeds/press_all.xml"),
    ("economy", "europe", "ECB", "https://www.ecb.europa.eu/rss/press.html"),
    ("science", "global", "NASA", "https://www.nasa.gov/news-release/feed/"),
    ("science", "global", "ESA", "https://www.esa.int/rssfeed/TopNews"),
    ("science", "global", "Nature", "https://www.nature.com/nature.rss"),
    ("science", "global", "The Guardian", "https://www.theguardian.com/science/rss"),
]
LIMITS = {"world": 18, "ai": 7, "coding": 5, "papers": 6, "open": 5, "cs2": 5, "japan": 5, "economy": 7, "science": 5}
USER_AGENT = "DailyBrief/1.0 (+https://github.com/WENTAO2297/daily--brief)"
GENERIC_IMAGE = re.compile(r"(?:^|[/_.-])(logo|favicon|placeholder|default|avatar|defaultshare)(?:[/_.-]|$)", re.I)


def https_url(value: str, base: str = "") -> str:
    try:
        parsed = urllib.parse.urlsplit(urllib.parse.urljoin(base, html.unescape(value.strip())))
        if parsed.scheme == "https" and parsed.hostname and not parsed.username and not parsed.password:
            return parsed._replace(fragment="").geturl()
    except ValueError:
        pass
    return ""


def fetch(url: str, limit: int, timeout: int = 8) -> tuple[bytes, str]:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=timeout, context=SSL_CONTEXT) as response:
        return response.read(limit), response.geturl()


def plain(text: str) -> str:
    return " ".join(html.unescape(re.sub(r"<[^>]+>", " ", text)).split())


def tag(node: ET.Element) -> str:
    return node.tag.rsplit("}", 1)[-1]


def child(entry: ET.Element, *names: str) -> str:
    for name in names:
        for node in entry:
            if tag(node) == name and (text := "".join(node.itertext()).strip()):
                return text
    return ""


def parse_date(value: str) -> datetime | None:
    try:
        timestamp = datetime.fromisoformat(value)
    except ValueError:
        try:
            timestamp = parsedate_to_datetime(value)
        except (ValueError, TypeError, OverflowError):
            return None
    return timestamp.replace(tzinfo=timestamp.tzinfo or timezone.utc)


def feed_candidates(feed: tuple, now: datetime) -> list[dict]:
    channel, desk, publisher, url = feed
    try:
        raw, _ = fetch(url, 2_000_000)
        root = ET.fromstring(raw)
    except (OSError, ValueError, ET.ParseError) as exc:
        print(f"Source skipped: {publisher} ({type(exc).__name__})", file=sys.stderr)
        return []

    items = []
    for entry in root.iter():
        if tag(entry) not in {"item", "entry"}:
            continue
        published = parse_date(child(entry, "pubDate", "published", "date", "updated"))
        if not published or not now - timedelta(hours=72) <= published <= now + timedelta(minutes=15):
            continue
        title = plain(child(entry, "title"))
        links = [node for node in entry if tag(node) == "link" and node.get("rel", "alternate") == "alternate"]
        article = next((u for node in links if (u := https_url(node.get("href") or (node.text or "")))), "")
        if not title or not article:
            continue
        if publisher == "NHK" and not re.search(r"政府|首相|選挙|経済|研究|大学|科学|技術|入管|留学|外国人|雇用|外交|地震|台風|災害|電力|輸出|半導体|AI", title):
            continue
        if publisher == "The Japan Times" and re.search(r"The Japan Times Alpha|メディア掲載|プレスリリース", title, re.I):
            continue
        images = []
        for node in entry.iter():
            if tag(node) == "thumbnail" or (tag(node) in {"content", "enclosure"} and
                    (node.get("medium") == "image" or node.get("type", "").startswith("image/"))):
                if image := https_url(node.get("url", ""), article):
                    images.append(image)
        items.append({
            "channel": channel, "desk": desk, "publisher": publisher, "url": article,
            "title": title[:240], "published": published.astimezone(now.tzinfo).isoformat(),
            "summary": plain(child(entry, "description", "summary", "encoded", "content"))[:460],
            "image_candidates": list(dict.fromkeys(images))[-4:],
            "fresh": published >= now - timedelta(hours=30),
        })
    return sorted(items, key=lambda item: item["published"], reverse=True)[:9]


class PageMetadata(HTMLParser):
    def __init__(self):
        super().__init__()
        self.images: list[str] = []
        self.descriptions: list[str] = []

    def handle_starttag(self, name, attrs):
        if name != "meta":
            return
        values = dict(attrs)
        key = (values.get("property") or values.get("name") or "").lower()
        content = values.get("content") or ""
        if key in {"og:image", "og:image:url", "og:image:secure_url", "twitter:image", "twitter:image:src"}:
            self.images.append(content)
        if key in {"description", "og:description", "twitter:description"}:
            self.descriptions.append(plain(content))


def verify_image(url: str) -> str:
    if not url:
        return ""
    parsed = urllib.parse.urlsplit(url)
    if GENERIC_IMAGE.search(parsed.path) or parsed.hostname == "opengraph.githubassets.com":
        return ""
    if parsed.hostname == "ichef.bbci.co.uk":
        url = re.sub(r"/(ace/standard|news)/\d+/", r"/\g<1>/640/", url, count=1)
    request = urllib.request.Request(url, headers={
        "User-Agent": USER_AGENT, "Accept": "image/*", "Range": "bytes=0-31",
    })
    try:
        with urllib.request.urlopen(request, timeout=5, context=SSL_CONTEXT) as response:
            data = response.read(32)
            supported = (data.startswith((b"\xff\xd8\xff", b"\x89PNG\r\n\x1a\n", b"GIF87a", b"GIF89a"))
                         or data[8:12] == b"WEBP" or data[4:12] == b"ftypavif")
            if supported and response.headers.get_content_type().startswith("image/"):
                return https_url(response.geturl())
    except (OSError, ValueError):
        pass
    return ""


def enrich(item: dict) -> dict:
    images = list(reversed(item.pop("image_candidates")))
    image = next((valid for url in images if (valid := verify_image(url))), "")
    if not image or len(item["summary"]) < 75:
        try:
            raw, url = fetch(item["url"], 300_000, timeout=5)
            parser = PageMetadata()
            parser.feed(raw.decode("utf-8", errors="replace"))
            if not image:
                page_images = dict.fromkeys(https_url(candidate, url) for candidate in parser.images if candidate)
                image = next((valid for candidate in page_images if (valid := verify_image(candidate))), "")
            summary = max(parser.descriptions, key=len, default="")
            if len(summary) > len(item["summary"]):
                item["summary"] = summary[:460]
        except (OSError, ValueError):
            pass
    item["image"] = image
    return item


def collect_candidates(now: datetime) -> list[dict]:
    with ThreadPoolExecutor(max_workers=12) as executor:
        feed_items = list(executor.map(lambda feed: feed_candidates(feed, now), FEEDS))
    distinct = {}
    for item in (item for feed in feed_items for item in feed):
        key = item["url"].split("?", 1)[0].rstrip("/")
        previous = distinct.get(key)
        if previous is None or (previous["desk"] == "global" and item["desk"] != "global"):
            distinct[key] = item

    picked = []
    per_channel, per_desk = Counter(), Counter()
    for item in sorted(distinct.values(), key=lambda item: item["published"], reverse=True):
        channel = item["channel"]
        desk = item["desk"] if channel == "world" else item["publisher"]
        limit = 3 if channel in {"world", "papers", "japan"} else 2
        if per_channel[channel] >= LIMITS[channel] or per_desk[channel, desk] >= limit:
            continue
        per_channel[channel] += 1
        per_desk[channel, desk] += 1
        item["id"] = hashlib.sha256(item["url"].encode()).hexdigest()[:10]
        picked.append(item)
    with ThreadPoolExecutor(max_workers=12) as executor:
        return list(executor.map(enrich, picked))
