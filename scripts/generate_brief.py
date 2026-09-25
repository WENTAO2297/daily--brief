#!/usr/bin/env python3
"""Build one Daily Brief edition from public RSS feeds and DeepSeek.

The script deliberately keeps retrieval outside the model. RSS feeds and article
metadata are collected first, then DeepSeek Flash selects candidates and
DeepSeek Pro edits the final JSON. The resulting JSON is validated before it is
written to data/ and copied to dist/ by the GitHub Actions workflow.
"""

from __future__ import annotations

import hashlib
import html
import json
import os
import re
import ssl
import sys
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

try:
    import certifi
    SSL_CONTEXT = ssl.create_default_context(cafile=certifi.where())
except Exception:
    SSL_CONTEXT = ssl.create_default_context()


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
DIST_DIR = ROOT / "dist"
TZ = ZoneInfo("Asia/Shanghai")
NOW = datetime.now(TZ)
TODAY = NOW.date().isoformat()
API_URL = "https://api.deepseek.com/chat/completions"

FEEDS = [
    ("全球重大新闻", "https://news.google.com/rss/search?" + urllib.parse.urlencode({"q": "world diplomacy policy energy industry", "hl": "en-US", "gl": "US", "ceid": "US:en"})),
    ("AI核心动态", "https://news.google.com/rss/search?" + urllib.parse.urlencode({"q": "AI model multimodal benchmark NVIDIA Google DeepMind Anthropic OpenAI", "hl": "en-US", "gl": "US", "ceid": "US:en"})),
    ("AI核心动态", "https://news.google.com/rss/search?" + urllib.parse.urlencode({"q": "人工智能 大模型 算力 芯片", "hl": "zh-CN", "gl": "CN", "ceid": "CN:zh-Hans"})),
    ("AI Coding / Agent", "https://news.google.com/rss/search?" + urllib.parse.urlencode({"q": "coding agent Claude Code Cursor GitHub Copilot MCP", "hl": "en-US", "gl": "US", "ceid": "US:en"})),
    ("前沿论文 / 技术", "https://export.arxiv.org/rss/cs.AI"),
    ("GitHub / 开源", "https://github.blog/feed/"),
    ("CS2专区", "https://news.google.com/rss/search?" + urllib.parse.urlencode({"q": "CS2 Counter-Strike Falcons HLTV Major IEM BLAST Valve", "hl": "en-US", "gl": "US", "ceid": "US:en"})),
    ("日本动态", "https://news.google.com/rss/search?" + urllib.parse.urlencode({"q": "Japan technology science policy economy", "hl": "en-US", "gl": "US", "ceid": "US:en"})),
    ("经济 / 科技产业", "https://news.google.com/rss/search?" + urllib.parse.urlencode({"q": "China economy PBOC inflation semiconductor AI capex Fed BOJ", "hl": "en-US", "gl": "US", "ceid": "US:en"})),
    ("其他值得知道的科技与科学", "https://news.google.com/rss/search?" + urllib.parse.urlencode({"q": "space robotics quantum fusion science technology breakthrough", "hl": "en-US", "gl": "US", "ceid": "US:en"})),
]

CHANNELS = [
    ("🌍 全球重大新闻", "国际局势 · 能源 · 产业"),
    ("🤖 AI核心动态", "模型 · 基础设施 · 科学"),
    ("🧑‍💻 AI Coding / Agent", "开发者工具 · 软件工程代理"),
    ("📄 前沿论文 / 技术", "只选有明确方法与结果的研究"),
    ("🧰 GitHub / 开源项目", "工具价值优先于机械 Trending"),
    ("🎯 CS2专区", "Asia/Shanghai 中国标准时间"),
    ("🇯🇵 日本动态", "科技 · 科研 · 社会"),
    ("💹 经济 / 科技产业", "宏观 · 利率 · 半导体 · AI CapEx"),
    ("🔬 其他值得知道的科技与科学", "太空 · 机器人 · 芯片 · 科学突破"),
]


def fetch(url: str, timeout: int = 20) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "daily-brief/1.0 (+https://github.com/WENTAO2297/daily--brief)"})
    with urllib.request.urlopen(req, timeout=timeout, context=SSL_CONTEXT) as response:
        return response.read()


def text_of(value: Any) -> str:
    return re.sub(r"\s+", " ", html.unescape(str(value or ""))).strip()


def clean_html(value: str) -> str:
    value = re.sub(r"<script[\s\S]*?</script>", " ", value, flags=re.I)
    value = re.sub(r"<style[\s\S]*?</style>", " ", value, flags=re.I)
    value = re.sub(r"<[^>]+>", " ", value)
    return text_of(value)


def child_text(element: ET.Element, names: tuple[str, ...]) -> str:
    for child in list(element):
        if child.tag.rsplit("}", 1)[-1] in names and child.text:
            return text_of(child.text)
    return ""


def first_image_from_element(element: ET.Element) -> str:
    for node in element.iter():
        tag = node.tag.rsplit("}", 1)[-1]
        if tag in {"thumbnail", "content", "image"}:
            url = node.attrib.get("url") or node.attrib.get("href") or (node.text or "")
            if url.startswith("http"):
                return url
    return ""


def parse_date(value: str) -> str:
    if not value:
        return ""
    try:
        dt = parsedate_to_datetime(value).astimezone(TZ)
        return dt.isoformat()
    except (TypeError, ValueError, OverflowError):
        return value


def article_metadata(url: str) -> tuple[str, str]:
    """Return og:image and a short page text. Failure is intentionally non-fatal."""
    try:
        raw = fetch(url, timeout=5).decode("utf-8", errors="ignore")[:500_000]
    except Exception:
        return "", ""
    image = ""
    for pattern in (
        r'<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']+)',
        r'<meta[^>]+name=["\']twitter:image["\'][^>]+content=["\']([^"\']+)',
        r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:image["\']',
    ):
        match = re.search(pattern, raw, flags=re.I)
        if match:
            image = urllib.parse.urljoin(url, html.unescape(match.group(1)))
            break
    body = clean_html(raw)
    return (image if image.startswith("https://") else ""), body[:1800]


def collect_candidates() -> list[dict[str, Any]]:
    candidates: list[dict[str, Any]] = []
    seen: set[str] = set()
    for channel, feed_url in FEEDS:
        try:
            root = ET.fromstring(fetch(feed_url))
        except Exception as exc:
            print(f"feed skipped: {feed_url} ({exc})", file=sys.stderr)
            continue
        entries = [node for node in root.iter() if node.tag.rsplit("}", 1)[-1] in {"item", "entry"}]
        for entry in entries[:12]:
            title = child_text(entry, ("title",))
            link = ""
            for node in list(entry):
                if node.tag.rsplit("}", 1)[-1] == "link":
                    link = node.attrib.get("href") or text_of(node.text)
                    if link:
                        break
            if not link:
                continue
            link = html.unescape(link)
            key = hashlib.sha1((title + link).encode("utf-8")).hexdigest()[:12]
            if key in seen or not title:
                continue
            seen.add(key)
            published = child_text(entry, ("pubDate", "published", "updated", "date"))
            source = child_text(entry, ("source", "creator", "author")) or channel
            summary = child_text(entry, ("description", "summary", "content"))
            feed_image = first_image_from_element(entry)
            candidates.append({
                "id": key,
                "channel": channel,
                "title": title[:240],
                "source": source[:120],
                "published": parse_date(published),
                "url": link,
                "summary": clean_html(summary)[:900],
                "image_url": feed_image if feed_image.startswith("https://") else "",
            })

    # Enrich a bounded number of candidates concurrently. This gives the final
    # editor reliable image URLs without downloading media into Git, while a
    # slow publisher cannot hold the whole daily run for many minutes.
    def enrich(item: dict[str, Any]) -> dict[str, Any]:
        enriched = dict(item)
        image, page_text = article_metadata(item["url"])
        enriched["image_url"] = item["image_url"] or image
        if page_text:
            enriched["page_text"] = page_text
        return enriched

    bounded = candidates[:48]
    with ThreadPoolExecutor(max_workers=8) as executor:
        enriched_items = list(executor.map(enrich, bounded))
    by_id = {item["id"]: item for item in enriched_items}
    for index, item in enumerate(candidates):
        if item["id"] in by_id:
            candidates[index] = by_id[item["id"]]
    return candidates


def call_deepseek(model: str, system: str, user: str) -> dict[str, Any]:
    key = os.environ.get("DEEPSEEK_API_KEY", "").strip()
    if not key:
        raise RuntimeError("DEEPSEEK_API_KEY is not configured")
    payload = {
        "model": model,
        "temperature": 0.2,
        "response_format": {"type": "json_object"},
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
    }
    request = urllib.request.Request(
        API_URL,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=180, context=SSL_CONTEXT) as response:
        result = json.loads(response.read().decode("utf-8"))
    content = result["choices"][0]["message"]["content"]
    if isinstance(content, list):
        content = "".join(part.get("text", "") for part in content if isinstance(part, dict))
    return json.loads(content)


def compact_candidates(items: list[dict[str, Any]], limit: int = 80) -> str:
    return json.dumps(items[:limit], ensure_ascii=False, separators=(",", ":"))


def select_candidates(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    system = "你是每日新闻编辑的检索筛选助手。只返回合法 JSON，不要添加 Markdown。"
    user = f"""当前时间：{NOW.isoformat()}。从候选新闻中选择最值得进入中文每日新闻日报的 35 条左右，覆盖全球、AI、Coding-Agent、论文、开源、CS2、日本、经济产业、科技科学。优先过去24小时、官方和一手来源；同一事件只保留一条。返回格式：{{\"selected\":[{{\"id\":\"候选id\",\"reason\":\"一句话\"}}]}}。不要编造候选中不存在的 id。候选：{compact_candidates(items)}"""
    selected = call_deepseek("deepseek-flash", system, user).get("selected", [])
    ids = {str(item.get("id")) for item in selected if item.get("id")}
    chosen = [item for item in items if item["id"] in ids]
    return chosen or items[:35]


EDITOR_SYSTEM = """你是中文每日新闻情报日报的总编辑。只输出合法 JSON，不要输出 Markdown 代码围栏或解释。严格基于候选资料写作；候选资料不足时宁缺毋滥，不得编造事实、来源、图片 URL、比赛、论文结果或日期。所有新闻都要保留候选中的原始来源 URL。政治与选举保持中立、事实化。"""


def editor_prompt(items: list[dict[str, Any]], repair: str = "") -> str:
    return f"""当前日期：{TODAY}；时区：Asia/Shanghai；当前是测试模式，每次独立重建当天日报，不做跨期去重，但同一日报内严格去重。

生成一份新闻 App 信息流 JSON，必须包含：date、edition、updatedAt、overview、hero、topStories、channels、closing。

硬性结构：hero 只有1条；topStories 恰好4条；channels 必须按以下9个固定频道出现且每个有 title、note、stories：全球重大新闻、AI核心动态、AI Coding / Agent、前沿论文 / 技术、GitHub / 开源项目、CS2专区、日本动态、经济 / 科技产业、其他值得知道的科技与科学。正文卡片总量控制在18–25条。每条卡片使用 kind=hero/large/standard/flash 之一，并包含 channel、title、what、why、sources；sources 为1–3个包含 label 和 url 的数组。GitHub项目卡可以包含 recommendation，值只能是“值得装”“值得关注”“暂时不用折腾”。

今日重点与频道重复事件不要完整重复；中国宏观经济没有高价值新数据/政策时，明确写“今日无重大中国宏观新数据/政策。”CS2 固定写 Falcons、世界前十焦点、顶级赛事、Valve / 游戏更新；比赛时间转换为中国标准时间。论文卡尽量在 what 中包含论文、问题、方法、结果和为什么值得看。closing 必须包含 themes 数组（3条）与 links 数组（3个最值得读的原始来源）。

图片规则：只使用候选中真实存在的 image_url；不得编造 URL。hero 必须优先配图；整体尽量达到6组以上并分散到 AI、Coding-Agent、CS2、日本和其他高价值新闻。没有可靠图就使用空数组，不要写幕后说明；如果图片确实不足，在 overview 中明确“本次图片检索受限”。

长度：HERO 3–5句；LARGE 2–4句事实+1句为什么重要；STANDARD 2–3句事实+1句为什么重要；FLASH 1–2句。不要把所有卡写成同样长度。来源优先官方、一手专业媒体、垂直专业来源。

候选资料：{compact_candidates(items)}

{repair}"""


def total_stories(brief: dict[str, Any]) -> int:
    return 1 + len(brief.get("topStories", [])) + sum(len(channel.get("stories", [])) for channel in brief.get("channels", []))


def validate(brief: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    for field in ("date", "edition", "updatedAt", "overview", "hero", "topStories", "channels", "closing"):
        if field not in brief:
            errors.append(f"missing {field}")
    if brief.get("date") != TODAY:
        errors.append("date is not today")
    if len(brief.get("topStories", [])) != 4:
        errors.append("topStories must contain exactly 4 cards")
    if len(brief.get("channels", [])) != 9:
        errors.append("channels must contain exactly 9 sections")
    if not 18 <= total_stories(brief) <= 25:
        errors.append(f"story count is {total_stories(brief)}, expected 18-25")
    titles: list[str] = []
    for card in [brief.get("hero", {}), *brief.get("topStories", []), *(s for c in brief.get("channels", []) for s in c.get("stories", []))]:
        if not isinstance(card, dict):
            errors.append("card is not an object")
            continue
        for field in ("title", "what", "why", "sources"):
            if not card.get(field):
                errors.append(f"card missing {field}")
        title = text_of(card.get("title"))
        if title in titles:
            errors.append(f"duplicate title: {title}")
        titles.append(title)
        for source in card.get("sources", []) if isinstance(card.get("sources"), list) else []:
            if not str(source.get("url", "")).startswith("http"):
                errors.append(f"invalid source URL in {title}")
        for image in card.get("images", []) if isinstance(card.get("images"), list) else []:
            if not str(image.get("url", "")).startswith("https://"):
                errors.append(f"invalid image URL in {title}")
    return errors


def normalize(brief: dict[str, Any]) -> dict[str, Any]:
    brief["date"] = TODAY
    brief["updatedAt"] = NOW.isoformat(timespec="seconds")
    brief["edition"] = brief.get("edition") or "测试模式 · 每日新闻情报日报"
    for card in [brief.get("hero", {}), *brief.get("topStories", []), *(s for c in brief.get("channels", []) for s in c.get("stories", []))]:
        card.setdefault("images", [])
        card.setdefault("sources", [])
        card.setdefault("kind", "standard")
    return brief


def main() -> None:
    candidates = collect_candidates()
    if len(candidates) < 12:
        raise RuntimeError(f"only collected {len(candidates)} candidate stories")
    chosen = select_candidates(candidates)
    brief = normalize(call_deepseek("deepseek-v4-pro", EDITOR_SYSTEM, editor_prompt(chosen)))
    errors = validate(brief)
    if errors:
        repair = "上一次输出校验失败：" + "; ".join(errors[:12]) + "。请完整重写 JSON，修复这些问题，不要解释。"
        brief = normalize(call_deepseek("deepseek-v4-pro", EDITOR_SYSTEM, editor_prompt(chosen, repair)))
        errors = validate(brief)
    if errors:
        raise RuntimeError("brief validation failed: " + "; ".join(errors[:20]))

    DATA_DIR.mkdir(exist_ok=True)
    DIST_DIR.mkdir(exist_ok=True)
    payload = json.dumps(brief, ensure_ascii=False, indent=2) + "\n"
    (DATA_DIR / f"{TODAY}.json").write_text(payload, encoding="utf-8")
    (DATA_DIR / "latest.json").write_text(payload, encoding="utf-8")
    (DIST_DIR / "index.html").write_text((ROOT / "index.html").read_text(encoding="utf-8"), encoding="utf-8")
    dist_data = DIST_DIR / "data"
    dist_data.mkdir(exist_ok=True)
    (dist_data / f"{TODAY}.json").write_text(payload, encoding="utf-8")
    (dist_data / "latest.json").write_text(payload, encoding="utf-8")
    image_count = sum(len(card.get("images", [])) for card in [brief["hero"], *brief["topStories"], *(s for c in brief["channels"] for s in c["stories"])])
    print(json.dumps({"date": TODAY, "stories": total_stories(brief), "image_groups": image_count, "candidates": len(candidates), "selected": len(chosen)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
