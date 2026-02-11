#!/usr/bin/env python3
"""Build an auto-verify search plan + cached results.

This script does not call any web APIs. It:
- Picks up to N unverified entries for a lake (priority: harbor, rental, gastro, service, anchor)
- Builds query strings matching scripts/auto_verify.py
- Loads /home/phil/clawd/memory/auto-verify-search-cache.json (if present)
- Writes /tmp/auto_verify_search.json with any cached results available
- Writes /tmp/auto_verify_needed_queries.json with queries still missing (for the agent to web_search)

Output: prints a small JSON summary.
"""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CACHE_PATH = Path("/home/phil/clawd/memory/auto-verify-search-cache.json")

TYPE_FILES = {
    "harbor": "harbors.json",
    "rental": "rentals.json",
    "gastro": "gastros.json",
    "service": "services.json",
    "anchor": "anchors.json",
}
PRIO = ["harbor", "rental", "gastro", "service", "anchor"]


def norm(s: str) -> str:
    return (s or "").strip()


def is_verified(it: dict) -> bool:
    return bool(norm(it.get("source")) and norm(it.get("lastVerified")))


def mk_query(lake_name: str, typ: str, it: dict) -> str:
    name = norm(it.get("name"))
    loc = norm(it.get("region") or it.get("location") or "")
    if typ == "harbor":
        return f"{name} {loc} {lake_name} Hafen Betreiber Website Impressum"
    if typ == "service":
        return f"{name} {loc} {lake_name} Boot service Werft Betreiber Website"
    if typ == "rental":
        return f"{name} {loc} {lake_name} Boot mieten Betreiber Website"
    if typ == "gastro":
        return f"{name} {loc} {lake_name} Restaurant offizielle Website Impressum"
    if typ == "anchor":
        return f"{name} {loc} {lake_name} Ankern Erfahrungen"
    return f"{name} {loc} {lake_name} Website"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--lake", required=True)
    ap.add_argument("--lake-name", required=True)
    ap.add_argument("--limit", type=int, default=8)
    args = ap.parse_args()

    base = ROOT / "data" / "lakes" / args.lake

    cache = {}
    if CACHE_PATH.exists():
        try:
            cache = json.loads(CACHE_PATH.read_text(encoding="utf-8"))
        except Exception:
            cache = {}

    picked = []
    for typ in PRIO:
        p = base / TYPE_FILES[typ]
        if not p.exists():
            continue
        data = json.loads(p.read_text(encoding="utf-8"))
        # prefer entries with candidateUrl
        cand = [it for it in data if (not is_verified(it)) and norm(it.get("candidateUrl"))]
        nocand = [it for it in data if (not is_verified(it)) and (not norm(it.get("candidateUrl")))]
        for it in cand + nocand:
            if len(picked) >= args.limit:
                break
            if not norm(it.get("id")) or not norm(it.get("name")):
                continue
            picked.append((typ, it))
        if len(picked) >= args.limit:
            break

    search_json = {}
    needed = []
    for typ, it in picked:
        q = mk_query(args.lake_name, typ, it)
        if q in cache and isinstance(cache[q], list) and cache[q]:
            search_json[q] = cache[q]
        else:
            search_json[q] = []
            needed.append(q)

    Path("/tmp/auto_verify_search.json").write_text(json.dumps(search_json, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    Path("/tmp/auto_verify_needed_queries.json").write_text(json.dumps(needed, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(
        json.dumps(
            {
                "lake": args.lake,
                "picked": len(picked),
                "needed": len(needed),
                "cachePath": str(CACHE_PATH),
                "ts": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
