#!/usr/bin/env python3
"""Conservative dedup for a single lake.

Only touches entries with candidateSource=="osm" and only when two entries are very likely duplicates:
- same type file
- within a small distance threshold
- name is very similar (normalized)

Merge strategy:
- keep the entry that is verified, else keep the one with candidateUrl, else keep the first
- merge candidateUrl if missing
- do NOT change coordinates/name

Outputs JSON summary.
"""

from __future__ import annotations

import argparse
import json
import math
import re
from pathlib import Path

TYPE_FILES = {
    "harbors": "harbors.json",
    "anchors": "anchors.json",
    "rentals": "rentals.json",
    "gastros": "gastros.json",
    "services": "services.json",
}


def norm_name(s: str) -> str:
    s = (s or "").strip().lower()
    s = re.sub(r"\s+", " ", s)
    s = re.sub(r"[^a-z0-9äöüß ]+", "", s)
    return s


def is_verified(it: dict) -> bool:
    return bool((it.get("source") or "").strip() and (it.get("lastVerified") or "").strip())


def haversine_m(lat1, lon1, lat2, lon2) -> float:
    R = 6371000.0
    p1 = math.radians(lat1)
    p2 = math.radians(lat2)
    d1 = math.radians(lat2 - lat1)
    d2 = math.radians(lon2 - lon1)
    a = math.sin(d1/2)**2 + math.cos(p1)*math.cos(p2)*math.sin(d2/2)**2
    return 2*R*math.asin(math.sqrt(a))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--lake", required=True)
    ap.add_argument("--max-m", type=int, default=60)
    args = ap.parse_args()

    base = Path("data") / "lakes" / args.lake
    removed_total = 0
    merges_total = 0

    for key, fname in TYPE_FILES.items():
        p = base / fname
        if not p.exists():
            continue
        data = json.loads(p.read_text(encoding="utf-8"))
        # work list of osm candidates only
        idx = [i for i, it in enumerate(data) if (it.get("candidateSource") == "osm") and it.get("lat") is not None and it.get("lng") is not None]
        to_remove = set()

        for a_i in range(len(idx)):
            i = idx[a_i]
            if i in to_remove:
                continue
            A = data[i]
            nA = norm_name(A.get("name"))
            for b_i in range(a_i + 1, len(idx)):
                j = idx[b_i]
                if j in to_remove:
                    continue
                B = data[j]
                nB = norm_name(B.get("name"))
                if not nA or not nB:
                    continue
                # simple similarity: one contains the other (after normalization)
                if nA not in nB and nB not in nA:
                    continue
                d = haversine_m(A["lat"], A["lng"], B["lat"], B["lng"])
                if d > args.max_m:
                    continue

                # Decide keep/drop
                candA = (A.get("candidateUrl") or "").strip()
                candB = (B.get("candidateUrl") or "").strip()
                keep, drop = (A, B)
                drop_idx = j

                if is_verified(B) and not is_verified(A):
                    keep, drop = (B, A)
                    drop_idx = i
                elif (candB and not candA):
                    keep, drop = (B, A)
                    drop_idx = i

                # Merge candidateUrl
                if not (keep.get("candidateUrl") or "").strip() and (drop.get("candidateUrl") or "").strip():
                    keep["candidateUrl"] = drop.get("candidateUrl")
                    merges_total += 1

                to_remove.add(drop_idx)

        if to_remove:
            out = [it for k, it in enumerate(data) if k not in to_remove]
            removed_total += len(to_remove)
            p.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(json.dumps({"lake": args.lake, "removed": removed_total, "merged": merges_total}, ensure_ascii=False))


if __name__ == "__main__":
    main()
