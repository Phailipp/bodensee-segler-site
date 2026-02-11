#!/usr/bin/env python3
"""Update /home/phil/clawd/memory/auto-verify-search-cache.json.

Usage:
  update_search_cache.py --query "..." --results-json /tmp/results.json

results.json must be an array of objects with at least {url,title,description}.
"""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

CACHE_PATH = Path("/home/phil/clawd/memory/auto-verify-search-cache.json")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--query", required=True)
    ap.add_argument("--results-json", required=True)
    args = ap.parse_args()

    q = args.query
    results = json.loads(Path(args.results_json).read_text(encoding="utf-8"))
    if not isinstance(results, list):
        raise SystemExit("results-json must be a list")

    cache = {}
    if CACHE_PATH.exists():
        try:
            cache = json.loads(CACHE_PATH.read_text(encoding="utf-8"))
        except Exception:
            cache = {}

    cache[q] = results
    out = {
        "_meta": {
            "updatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        },
        **{k: v for k, v in cache.items() if k != "_meta"},
    }
    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    CACHE_PATH.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"ok": True, "query": q, "count": len(results)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
