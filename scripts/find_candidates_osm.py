#!/usr/bin/env python3
"""Find candidate POIs around Lake Constance from Overpass (OSM).

Strict rule: this script NEVER sets official sources. It only proposes candidate URLs.

Output: JSON list of candidates (stdout)

Design: best-effort. Overpass is flaky; return partial results rather than failing.
"""

import json
import time
from datetime import date

import requests

BBOX = (47.30, 8.70, 47.90, 10.20)  # south, west, north, east

# Prefer one stable endpoint to avoid long failovers.
ENDPOINT = "https://overpass.kumi.systems/api/interpreter"


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
                if not website:
                    continue

                lat = el.get("lat")
                lon = el.get("lon")
                if lat is None or lon is None:
                    center = el.get("center") or {}
                    lat = center.get("lat")
                    lon = center.get("lon")

                out.append(
                    {
                        "name": name,
                        "website": website,
                        "kind": kind,
                        "osmType": el.get("type"),
                        "osmId": el.get("id"),
                        "tags": {
                            "amenity": tags.get("amenity"),
                            "leisure": tags.get("leisure"),
                            "waterway": tags.get("waterway"),
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
    marina_query = f"""
[out:json][timeout:120];
(
  nwr[\"leisure\"=\"marina\"][\"website\"]({BBOX[0]},{BBOX[1]},{BBOX[2]},{BBOX[3]});
  nwr[\"leisure\"=\"marina\"][\"contact:website\"]({BBOX[0]},{BBOX[1]},{BBOX[2]},{BBOX[3]});
);
out center tags;
"""

    gastro_query = f"""
[out:json][timeout:120];
(
  nwr[\"amenity\"=\"restaurant\"][\"website\"]({BBOX[0]},{BBOX[1]},{BBOX[2]},{BBOX[3]});
  nwr[\"amenity\"=\"restaurant\"][\"contact:website\"]({BBOX[0]},{BBOX[1]},{BBOX[2]},{BBOX[3]});
);
out center tags;
"""

    rental_query = f"""
[out:json][timeout:120];
(
  nwr[\"amenity\"=\"boat_rental\"][\"website\"]({BBOX[0]},{BBOX[1]},{BBOX[2]},{BBOX[3]});
  nwr[\"amenity\"=\"boat_rental\"][\"contact:website\"]({BBOX[0]},{BBOX[1]},{BBOX[2]},{BBOX[3]});
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
