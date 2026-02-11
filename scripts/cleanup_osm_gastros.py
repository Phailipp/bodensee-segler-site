#!/usr/bin/env python3
"""Remove non-verified OSM-imported gastro entries.

Keeps:
- Any entry that is verified (has source + lastVerified)
- Any entry that is NOT from candidateSource=osm

Removes:
- candidateSource=osm entries without verification

This is used after we tighten the gastro candidate query to only harbor/marina-adjacent places.
"""

import argparse
import json
from pathlib import Path


def is_verified(it: dict) -> bool:
    return bool((it.get("source") or "").strip() and (it.get("lastVerified") or "").strip())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--lake", required=True)
    args = ap.parse_args()

    p = Path("data") / "lakes" / args.lake / "gastros.json"
    if not p.exists():
        print(json.dumps({"lake": args.lake, "kept": 0, "removed": 0}, ensure_ascii=False))
        return

    data = json.loads(p.read_text(encoding="utf-8"))
    kept = []
    removed = 0
    for it in data:
        if is_verified(it):
            kept.append(it)
            continue
        if (it.get("candidateSource") or "").strip() != "osm":
            kept.append(it)
            continue
        removed += 1

    p.write_text(json.dumps(kept, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"lake": args.lake, "kept": len(kept), "removed": removed}, ensure_ascii=False))


if __name__ == "__main__":
    main()
