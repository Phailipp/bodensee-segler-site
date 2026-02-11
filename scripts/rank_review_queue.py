#!/usr/bin/env python3
"""Generate a review queue (top N) for verification.

Goal: help manual verification by producing a small, high-impact list per lake.
Strict: reads existing data only.

Heuristics (simple + transparent):
- Prefer entries that are unverified (missing source or lastVerified).
- Prefer entries that already have a candidateUrl (faster to verify).
- Prefer certain types: harbor > rental > gastro > service > anchor.

Outputs a markdown file with link-to-open (map modal) and issue template link.
"""

from __future__ import annotations

import argparse
import json
import urllib.parse
from pathlib import Path

SITE_BASE = "https://phailipp.github.io/bodensee-segler-site"

TYPE_FILES = [
    ("harbor", "harbors.json"),
    ("rental", "rentals.json"),
    ("gastro", "gastros.json"),
    ("service", "services.json"),
    ("anchor", "anchors.json"),
]

TYPE_WEIGHT = {"harbor": 5, "rental": 4, "gastro": 3, "service": 2, "anchor": 1}


def is_verified(it: dict) -> bool:
    return bool((it.get("source") or "").strip() and (it.get("lastVerified") or "").strip())


def issue_url(typ: str, it: dict) -> str:
    # Matches the pattern used in the site for backlog links
    title = f"Add source: {it.get('name') or it.get('id') or ''}".strip()
    body = (
        f"Type: {typ}\n"
        f"ID: {it.get('id','')}\n"
        f"Name: {it.get('name','')}\n"
        f"Country: {(it.get('country') or '').upper()}\n"
        f"Coords: {it.get('lat','')}, {it.get('lng','')}\n\n"
        f"Official source link:\n- \n\n"
        f"Last verified (YYYY-MM-DD):\n- \n\n"
        f"Candidate URL (found, not verified):\n- {it.get('candidateUrl','')}\n"
    )
    q = {
        "title": title,
        "body": body,
    }
    return "https://github.com/Phailipp/bodensee-segler-site/issues/new?" + urllib.parse.urlencode(q)


def open_url(lake: str, typ: str, pid: str) -> str:
    return f"{SITE_BASE}/?lake={urllib.parse.quote(lake)}&open={urllib.parse.quote(typ)}:{urllib.parse.quote(pid)}#karte"


def score(typ: str, it: dict) -> tuple:
    # Higher first
    cand = 1 if (it.get("candidateUrl") or "").strip() else 0
    # candidates imported from OSM are usually the ones to verify first
    osm = 1 if (it.get("candidateSource") == "osm") else 0
    return (
        TYPE_WEIGHT.get(typ, 0),
        cand,
        osm,
        len((it.get("name") or "")),
    )


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--lake", required=True)
    ap.add_argument("--limit", type=int, default=30)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    lake = args.lake
    base = Path("data") / "lakes" / lake

    rows: list[tuple[str, dict]] = []
    for typ, fname in TYPE_FILES:
        p = base / fname
        if not p.exists():
            continue
        data = json.loads(p.read_text(encoding="utf-8"))
        for it in data:
            if is_verified(it):
                continue
            if not it.get("id"):
                continue
            rows.append((typ, it))

    rows.sort(key=lambda x: score(x[0], x[1]), reverse=True)
    rows = rows[: args.limit]

    out = []
    out.append(f"Review queue: {lake} (top {args.limit})")
    out.append("")
    out.append("Format: Name | Type | Candidate | Open | Issue")
    out.append("")

    for typ, it in rows:
        name = (it.get("name") or it.get("id") or "").strip()
        cand = (it.get("candidateUrl") or "").strip()
        cand_disp = cand if cand else "(none)"
        openu = open_url(lake, typ, it.get("id"))
        issueu = issue_url(typ, it)
        out.append(f"{name} | {typ} | {cand_disp} | {openu} | {issueu}")

    Path(args.out).write_text("\n".join(out) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
