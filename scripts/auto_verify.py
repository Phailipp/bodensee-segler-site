#!/usr/bin/env python3
"""Auto-verify entries by finding plausible official/operator sources on the web.

This script is intentionally conservative. It will only set:
- source
- lastVerified

It will NOT invent facts. It does not change name/coords.

Rules (configured in code):
- harbors/services/rentals/gastros: prefer operator/official sites, avoid aggregators
- anchors: allow community/forum sources

Inputs:
- data/lakes.json
- data/lakes/<lake>/*.json

Output:
- Updates the JSON files in place, only for entries that were unverified.
- Prints a JSON summary to stdout.

Note: Uses simple HTML text checks (via requests) and a local search provider endpoint
passed in via --search-json (so orchestration can call any search API/tool).
"""

from __future__ import annotations

import argparse
import json
import re
import time
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Any

import urllib.request

ROOT = Path(__file__).resolve().parents[1]

TYPE_FILES = {
    "harbor": "harbors.json",
    "anchor": "anchors.json",
    "rental": "rentals.json",
    "gastro": "gastros.json",
    "service": "services.json",
}

# Domains we generally do NOT treat as official sources
BLOCKLIST = {
    "tripadvisor.",
    "google.",
    "goo.gl",
    "facebook.",
    "instagram.",
    "yelp.",
    "booking.",
    "opentable.",
    "thefork.",
    "ubereats.",
    "just-eat.",
    "lieferando.",
    "wikipedia.",
    "wikidata.",
    "openstreetmap.",
    "osm.",
}

# For anchoring we allow community sources as requested
ANCHOR_ALLOW = {
    "navily.",
    "noonsite.",
    "cruisersforum.",
    "forum.",
    "seglerforum.",
}

KEYWORDS_OFFICIAL = [
    "impressum",
    "kontakt",
    "hafen",
    "marina",
    "yachthafen",
    "betreiber",
    "verwaltung",
]


def norm(s: str) -> str:
    return (s or "").strip()


def is_verified(it: dict) -> bool:
    return bool(norm(it.get("source")) and norm(it.get("lastVerified")))


def domain_ok(url: str, typ: str) -> bool:
    u = (url or "").lower()
    if not u.startswith("http"):
        return False
    if typ == "anchor":
        # anchors: allow forums etc, but still avoid the worst aggregators
        for b in BLOCKLIST:
            if b in u:
                return False
        return True
    for b in BLOCKLIST:
        if b in u:
            return False
    return True


def looks_official_text(txt: str) -> bool:
    t = (txt or "").lower()
    return any(k in t for k in KEYWORDS_OFFICIAL)


def fetch_text(url: str, timeout_s: int = 10) -> str:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (compatible; BodenseeSeglerBot/1.0; +https://github.com/Phailipp/bodensee-segler-site)",
            "Accept": "text/html,application/xhtml+xml",
        },
    )
    with urllib.request.urlopen(req, timeout=timeout_s) as r:
        ctype = r.headers.get("Content-Type", "")
        data = r.read(400_000)
    try:
        s = data.decode("utf-8", errors="ignore")
    except Exception:
        s = str(data)
    # rough html strip
    s = re.sub(r"<script[\s\S]*?</script>", " ", s, flags=re.I)
    s = re.sub(r"<style[\s\S]*?</style>", " ", s, flags=re.I)
    s = re.sub(r"<[^>]+>", " ", s)
    s = re.sub(r"\s+", " ", s)
    return s[:200_000]


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


def pick_best(typ: str, it: dict, results: list[dict[str, Any]]) -> str | None:
    name = norm(it.get("name")).lower()
    cand = norm(it.get("candidateUrl"))

    # If candidateUrl already exists and passes domain rules, try it first
    if cand and domain_ok(cand, typ):
        try:
            txt = fetch_text(cand)
            if name and name[:6] in txt.lower():
                return cand
            if typ == "anchor":
                return cand
            if looks_official_text(txt):
                return cand
        except Exception:
            pass

    for r in results:
        url = norm(r.get("url") or "")
        if not domain_ok(url, typ):
            continue
        try:
            txt = fetch_text(url)
            low = txt.lower()
            if typ == "anchor":
                # anchors: accept if the name appears at least once
                if name and name[:6] in low:
                    return url
                continue
            # other types: require name + at least one official-ish keyword
            if name and name[:6] in low and looks_official_text(txt):
                return url
        except Exception:
            continue
    return None


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--lake", required=True)
    ap.add_argument("--lake-name", required=True)
    ap.add_argument("--limit", type=int, default=15)
    ap.add_argument("--search-json", required=True, help="Path to a JSON file containing search results per query")
    ap.add_argument("--sleep-ms", type=int, default=250)
    args = ap.parse_args()

    lake_id = args.lake
    lake_name = args.lake_name
    today = date.today().isoformat()

    # Orchestrator provides a JSON mapping query->results
    search_db = json.loads(Path(args.search_json).read_text(encoding="utf-8"))

    changed = 0
    attempted = 0
    per_type = {}

    base = ROOT / "data" / "lakes" / lake_id

    for typ, fname in TYPE_FILES.items():
        p = base / fname
        if not p.exists():
            continue
        data = json.loads(p.read_text(encoding="utf-8"))
        for it in data:
            if changed >= args.limit:
                break
            if is_verified(it):
                continue
            if not norm(it.get("name")):
                continue

            q = mk_query(lake_name, typ, it)
            results = search_db.get(q, [])
            attempted += 1
            best = pick_best(typ, it, results)
            if best:
                it["source"] = best
                it["lastVerified"] = today
                changed += 1
                per_type[typ] = per_type.get(typ, 0) + 1
            time.sleep(args.sleep_ms / 1000.0)

        p.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(
        json.dumps(
            {
                "lake": lake_id,
                "changed": changed,
                "attempted": attempted,
                "perType": per_type,
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
