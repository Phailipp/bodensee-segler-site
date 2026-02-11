#!/usr/bin/env python3
"""Import OSM candidates into per-lake datasets.

Strict:
- NEVER sets source/lastVerified.
- Creates/updates only candidate* fields and minimal geometry/name.

Input: /tmp/osm_candidates_<lake>.json (from find_candidates_osm.py)
Writes: data/lakes/<lake>/{harbors,gastros,rentals}.json

This is the "bootstrap" step for new lakes: create candidate entries even if no website.
"""

import argparse
import json
import re
from datetime import date
from pathlib import Path

STOP = {"am","an","bei","zum","zur","und","the","der","die","das","im","in","of","a","la","le"}


def slug(s: str) -> str:
    s = (s or "").strip().lower()
    s = re.sub(r"[^a-z0-9äöüß]+", "-", s).strip("-")
    s = re.sub(r"-+", "-", s)
    return s[:60] or "poi"


def mk_id(c: dict) -> str:
    ot = c.get("osmType") or "x"
    oid = c.get("osmId") or "0"
    base = f"osm-{ot}-{oid}"
    # add a tiny name hint for readability
    return f"{base}-{slug(c.get('name'))}"


def load_json(path: Path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return []


def save_json(path: Path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--lake", default="bodensee")
    ap.add_argument("--candidates", required=True)
    args = ap.parse_args()

    lake_id = (args.lake or "bodensee").strip()
    cand_path = Path(args.candidates)
    today = date.today().isoformat()

    js = json.loads(cand_path.read_text(encoding="utf-8"))
    candidates = js.get("candidates", [])

    base = Path("data") / "lakes" / lake_id
    base.mkdir(parents=True, exist_ok=True)

    targets = {
        "marina": base / "harbors.json",
        "gastro": base / "gastros.json",
        "rental": base / "rentals.json",
    }

    existing = {k: load_json(p) for k, p in targets.items()}
    index = {k: {it.get("id"): it for it in existing[k] if it.get("id")} for k in existing}

    added = 0
    updated = 0

    for c in candidates:
        kind = c.get("kind")
        if kind not in targets:
            continue
        lat = c.get("lat")
        lng = c.get("lng")
        name = (c.get("name") or "").strip()
        if not name or lat is None or lng is None:
            continue

        pid = mk_id(c)
        it = index[kind].get(pid)
        if not it:
            it = {
                "id": pid,
                "name": name,
                "lat": lat,
                "lng": lng,
                "candidateSource": "osm",
                "candidateFoundAt": c.get("foundAt") or today,
                "candidateOsmType": c.get("osmType"),
                "candidateOsmId": c.get("osmId"),
            }
            existing[kind].append(it)
            index[kind][pid] = it
            added += 1
        else:
            updated += 1

        # candidate URL if present
        if c.get("website") and not (it.get("candidateUrl") or "").strip():
            it["candidateUrl"] = c.get("website")

        # keep a few helpful tags (still candidate-level)
        tags = c.get("tags") or {}
        if tags.get("contact:phone") and not (it.get("candidatePhone") or "").strip():
            it["candidatePhone"] = tags.get("contact:phone")
        if tags.get("opening_hours") and not (it.get("candidateHours") or "").strip():
            it["candidateHours"] = tags.get("opening_hours")

    for kind, path in targets.items():
        save_json(path, existing[kind])

    print(json.dumps({"added": added, "touched": added + updated}, ensure_ascii=False))


if __name__ == "__main__":
    main()
