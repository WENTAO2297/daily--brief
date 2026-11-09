"""Build the static Pages directory from the homepage assets and saved editions."""

import json
import re
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def build_site(root: Path = ROOT) -> None:
    data = root / "data"
    dist = root / "dist"
    editions = []
    dated_files = sorted(
        (path for path in data.glob("*.json") if re.fullmatch(r"\d{4}-\d{2}-\d{2}", path.stem)),
        reverse=True,
    )
    for path in dated_files:
        brief = json.loads(path.read_text(encoding="utf-8"))
        if brief["date"] != path.stem:
            raise ValueError(f"Edition date does not match its filename: {path.name}")
        hero = brief.get("hero") or {}
        count = int(bool(hero)) + len(brief.get("topStories", []))
        count += sum(len(channel.get("stories", [])) for channel in brief.get("channels", []))
        editions.append({"date": path.stem, "title": hero.get("title") or "新闻情报日报", "count": count})

    archive = data / "editions.json"
    archive.write_text(json.dumps(editions, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (dist / "assets").mkdir(parents=True, exist_ok=True)
    (dist / "data").mkdir(parents=True, exist_ok=True)
    shutil.copyfile(root / "index.html", dist / "index.html")
    for name in ("newsroom.css", "newsroom.js"):
        shutil.copyfile(root / "assets" / name, dist / "assets" / name)
    for path in (*dated_files, data / "latest.json", archive):
        shutil.copyfile(path, dist / "data" / path.name)


if __name__ == "__main__":
    build_site()
