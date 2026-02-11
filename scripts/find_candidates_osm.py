#!/usr/bin/env python3
"""Find candidate POIs around Lake Constance from Overpass (OSM).

Strict rule: this script NEVER sets official sources. It only proposes candidate URLs.

Output: JSON list of candidates (stdout)

Design: best-effort. Overpass is flaky; return partial results rather than failing.
"""

import json
import time
import argparse
from pathlib import Path
from datetime import date

import requests

# Prefer one stable endpoint to avoid long failovers.
ENDPOINT = "https://overpass.kumi.systems/api/interpreter"


def load_bbox(lake_id: str):
    try:
        lakes = json.loads(Path('data/lakes.json').read_text(encoding='utf-8'))
        for l in lakes:
            if l.get('id') == lake_id:
                return tuple(l.get('bbox'))
    except Exception:
        pass
    # fallback Bodensee
    return (47.30, 8.70, 47.90, 10.20)



def norm_url(u: str) -> str:
    u = (u or "").strip()
    if not u:
        return ""
    if u.startswith("http://") or u.startswith("https://"):
        return u
    return "https://" + u


def post_overpass(query: str):
    r = requests.post(ENDPOINT, data={"data": query}, timeout=180)
    r.raise_for_status()
    return r.json()


def collect(query: str, kind: str):
    """Return (candidates, error)."""
    today = date.today().isoformat()
    for attempt in range(3):
        try:
            js = post_overpass(query)
            out = []
            for el in js.get("elements", []):
                tags = el.get("tags", {})
                name = tags.get("name")
                if not name:
                    continue
                website = tags.get("website") or tags.get("contact:website")
                website = norm_url(website)

                lat = el.get("lat")
                lon = el.get("lon")
                if lat is None or lon is None:
                    center = el.get("center") or {}
                    lat = center.get("lat")
                    lon = center.get("lon")

                out.append(
                    {
                        "name": name,
                        "website": website or '',
                        "kind": kind,
                        "osmType": el.get("type"),
                        "osmId": el.get("id"),
                        "tags": {
                            "amenity": tags.get("amenity"),
                            "leisure": tags.get("leisure"),
                            "waterway": tags.get("waterway"),
                            "seamark:type": tags.get("seamark:type"),
                            "addr:country": tags.get("addr:country"),
                            "contact:phone": tags.get("contact:phone") or tags.get("phone"),
                            "opening_hours": tags.get("opening_hours"),
                        },
                        "lat": lat,
                        "lng": lon,
                        "foundAt": today,
                        "foundVia": "osm",
                        "overpass": ENDPOINT,
                    }
                )
            return out, None
        except Exception as e:
            err = f"{type(e).__name__}: {e}"
            time.sleep(1.5 * (attempt + 1))
            last = err
    return [], last


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--lake", default="bodensee")
    args = ap.parse_args()
    lake_id = (args.lake or "bodensee").strip()
    bbox = load_bbox(lake_id)

    marina_query = f"""
[out:json][timeout:120];
(
  nwr[\"leisure\"=\"marina\"][\"website\"]({bbox[0]},{bbox[1]},{bbox[2]},{bbox[3]});
  nwr[\"leisure\"=\"marina\"][\"contact:website\"]({bbox[0]},{bbox[1]},{bbox[2]},{bbox[3]});
);
out center tags;
"""
    gastro_query = f"""
[out:json][timeout:120];
(
  // Restaurants and cafes that are plausibly reachable by boat:
  // take marinas/harbors first, then fetch nearby gastronomy within ~300m.
  nwr["leisure"="marina"]({bbox[0]},{bbox[1]},{bbox[2]},{bbox[3]});
  nwr["seamark:type"="harbour"]({bbox[0]},{bbox[1]},{bbox[2]},{bbox[3]});
  nwr["harbour"]({bbox[0]},{bbox[1]},{bbox[2]},{bbox[3]});
)->.h;
(
  nwr["amenity"~"^(restaurant|cafe|bar|pub)$"](around.h:300);
);
out center tags;
"""

    rental_query = f"""
[out:json][timeout:120];
(
  nwr[\"amenity\"=\"boat_rental\"][\"website\"]({bbox[0]},{bbox[1]},{bbox[2]},{bbox[3]});
  nwr[\"amenity\"=\"boat_rental\"][\"contact:website\"]({bbox[0]},{bbox[1]},{bbox[2]},{bbox[3]});
);
out center tags;
"""

    all_candidates = []
    errors = {}

    for kind, q in [
        ("marina", marina_query),
        ("gastro", gastro_query),
        ("rental", rental_query),
    ]:
        cands, err = collect(q, kind)
        all_candidates += cands
        if err:
            errors[kind] = err

    # de-dup by website+name
    seen = set()
    uniq = []
    for c in all_candidates:
        key = (c.get('name','').strip().lower(), c.get('website','').strip().lower())
        if key in seen:
            continue
        seen.add(key)
        uniq.append(c)

    print(json.dumps({"candidates": uniq, "errors": errors}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
