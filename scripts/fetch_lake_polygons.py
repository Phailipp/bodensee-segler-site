#!/usr/bin/env python3
"""
fetch_lake_polygons.py – Lädt Seen-Umrisse einmalig von Overpass und speichert
sie als vereinfachte GeoJSON-Polygone in data/lakes/<id>/outline.geojson.

Diese Dateien werden von validate.py für den Wasser-Check genutzt (offline,
kein API-Call zur Laufzeit).

Aufruf:
  python3 scripts/fetch_lake_polygons.py            # alle Seen
  python3 scripts/fetch_lake_polygons.py --lake zugersee
  python3 scripts/fetch_lake_polygons.py --lake bodensee --simplify 0.0005
"""

import argparse
import json
import math
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

OVERPASS_URL = "https://overpass-api.de/api/interpreter"

# OSM Relation IDs der Seen
LAKE_RELATIONS = {
    "bodensee":            1156846,   # OSM: Bodensee, natural=water water=lake
    "genfersee":           332617,    # OSM: Le Léman, natural=water
    "lago-maggiore":       11758,     # OSM: Lago Maggiore
    "thunersee":           1117321,   # OSM: Thunersee
    "vierwaldstaettersee": 1442399,   # OSM: Vierwaldstättersee
    "zuerichsee":          32362,     # OSM: Zürichsee
    "zugersee":            540344,    # OSM: Zugersee
}


def overpass_post(query: str, timeout: int = 60) -> dict | None:
    data = urllib.parse.urlencode({"data": query}).encode()
    req = urllib.request.Request(
        OVERPASS_URL, data=data, method="POST",
        headers={"User-Agent": "bodensee-segler-fetch-polygons/1.0 (+https://github.com/Phailipp/bodensee-segler-site)"}
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout + 10) as resp:
            return json.loads(resp.read())
    except Exception as e:
        print(f"  Overpass-Fehler: {e}")
        return None


def fetch_ways_of_relation(relation_id: int) -> dict | None:
    """Lädt die Member-Ways einer Relation mit deren Geometrie."""
    query = f"""[out:json][timeout:90];
relation({relation_id})->.r;
way(r.r)->.w;
.w out geom;"""
    result = overpass_post(query, timeout=90)
    if result and result.get("elements"):
        return result
    # Fallback: smaller query
    query2 = f"""[out:json][timeout:60];
relation({relation_id});
out geom bb;"""
    return overpass_post(query2, timeout=60)


def build_polygon_from_ways(osm_data: dict, relation_id: int) -> list[list[float]] | None:
    """
    Baut einen äusseren Ring aus den Way-Geometrien der OSM-Relation.
    Gibt [[lng, lat], ...] zurück.
    """
    elements = osm_data.get("elements", [])
    if not elements:
        return None

    # First pass: find the relation itself to get member refs with roles
    relation = None
    for el in elements:
        if el.get("type") == "relation" and el.get("id") == relation_id:
            relation = el
            break

    # Build way geometries: way_id -> [[lng, lat], ...]
    way_geom: dict[int, list[list[float]]] = {}
    outer_way_ids: set[int] = set()

    for el in elements:
        if el.get("type") == "way" and "geometry" in el:
            way_geom[el["id"]] = [[p["lon"], p["lat"]] for p in el["geometry"]]

    # Determine which ways are "outer"
    if relation:
        for member in relation.get("members", []):
            if member.get("type") == "way":
                if member.get("role") in ("outer", ""):
                    outer_way_ids.add(member["ref"])
    else:
        # No explicit relation: use all ways
        outer_way_ids = set(way_geom.keys())

    # Filter to outer ways
    segments = [way_geom[wid] for wid in outer_way_ids if wid in way_geom]
    if not segments:
        segments = list(way_geom.values())
    if not segments:
        return None

    # Separate closed rings from open segments
    closed = [s for s in segments if len(s) >= 4 and _close(s[0], s[-1])]
    open_segs = [s for s in segments if not (len(s) >= 4 and _close(s[0], s[-1]))]

    # If only closed rings (e.g. Zugersee: all 4 ways are closed polygons):
    # take the largest one as the main outer polygon
    if not open_segs:
        main = max(closed, key=len)
        print(f"  {len(segments)} Ways alle geschlossen → nehme längsten ({len(main)} Punkte)")
        return main

    # Otherwise: chain the open segments into one outer ring
    print(f"  {len(segments)} Ways: {len(open_segs)} offen + {len(closed)} geschlossen → verkette offene")

    # Chain the open segments into a continuous ring
    ring: list[list[float]] = []
    remaining = [list(s) for s in open_segs]

    ring.extend(remaining.pop(0))

    max_iter = len(remaining) * 3 + 10
    icount = 0
    while remaining and icount < max_iter:
        icount += 1
        last = ring[-1]
        matched = False
        for i, seg in enumerate(remaining):
            if _close(seg[0], last):
                ring.extend(seg[1:])
                remaining.pop(i)
                matched = True
                break
            elif _close(seg[-1], last):
                seg_rev = list(reversed(seg))
                ring.extend(seg_rev[1:])
                remaining.pop(i)
                matched = True
                break
        if not matched:
            # Gap: append next segment anyway
            ring.extend(remaining.pop(0))

    # Close ring
    if ring and not _close(ring[0], ring[-1]):
        ring.append(ring[0])

    return ring


def _close(a: list[float], b: list[float], tol: float = 5e-5) -> bool:
    return abs(a[0] - b[0]) < tol and abs(a[1] - b[1]) < tol


def _rdp_open(points: list, eps: float) -> list:
    """Iterativer RDP für OFFENE Linien (start ≠ end)."""
    if len(points) <= 2:
        return points
    keep = [True] * len(points)
    stack = [(0, len(points) - 1)]
    while stack:
        si, ei = stack.pop()
        if ei - si < 2:
            continue
        sx, sy = points[si]
        ex, ey = points[ei]
        dx, dy = ex - sx, ey - sy
        length = math.sqrt(dx * dx + dy * dy) or 1e-12
        max_dist, max_idx = 0.0, si
        for i in range(si + 1, ei):
            if not keep[i]:
                continue
            dist = abs(dx * (points[i][1] - sy) - dy * (points[i][0] - sx)) / length
            if dist > max_dist:
                max_dist, max_idx = dist, i
        if max_dist > eps:
            stack.append((si, max_idx))
            stack.append((max_idx, ei))
        else:
            for i in range(si + 1, ei):
                keep[i] = False
    return [p for p, k in zip(points, keep) if k]


def rdp(points: list, eps: float) -> list:
    """
    RDP für geschlossene Ringe und offene Linien.
    Bei geschlossenen Ringen (first==last): teile am Fernpunkt auf, vereinfache jede Hälfte.
    """
    if len(points) <= 3:
        return points
    # Prüfe ob geschlossener Ring
    is_closed = _close(points[0], points[-1])
    if not is_closed:
        return _rdp_open(points, eps)
    # Geschlossener Ring: finde den Punkt am weitesten vom Startpunkt entfernt
    start = points[0]
    max_dist, split_idx = 0.0, len(points) // 2
    for i in range(1, len(points) - 1):
        dx = points[i][0] - start[0]
        dy = points[i][1] - start[1]
        d = dx * dx + dy * dy
        if d > max_dist:
            max_dist, split_idx = d, i
    # Teile Ring in zwei Hälften
    half1 = points[:split_idx + 1]
    half2 = points[split_idx:]
    s1 = _rdp_open(half1, eps)
    s2 = _rdp_open(half2, eps)
    # Verbinde (Treffpunkt split_idx doppelt – entferne Duplikat)
    result = s1[:-1] + s2
    # Schliesse Ring
    if not _close(result[0], result[-1]):
        result.append(result[0])
    return result


def save_geojson(path: Path, polygon: list[list[float]], lake_id: str, metadata: dict) -> None:
    geojson = {
        "type": "Feature",
        "properties": {"lake": lake_id, **metadata},
        "geometry": {"type": "Polygon", "coordinates": [polygon]}
    }
    path.write_text(json.dumps(geojson, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"  → Gespeichert: {path} ({len(polygon)} Punkte)")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--lake", help="Nur diesen See laden (z.B. zugersee)")
    ap.add_argument("--data-dir", default="data/lakes")
    ap.add_argument("--simplify", type=float, default=0.0003,
                    help="RDP-Toleranz in Grad (default: 0.0003 ≈ 25m)")
    ap.add_argument("--retry", type=int, default=2, help="Anzahl Wiederholungen bei Fehler")
    args = ap.parse_args()

    data_dir = Path(args.data_dir)
    lakes = [args.lake] if args.lake else list(LAKE_RELATIONS.keys())

    print(f"Lade Seen-Polygone von Overpass (simplify={args.simplify}°) ...")

    success, failed = [], []
    for lake in lakes:
        rid = LAKE_RELATIONS.get(lake)
        if not rid:
            print(f"\n{lake}: unbekannte Relation – übersprungen")
            continue

        out_path = data_dir / lake / "outline.geojson"
        print(f"\n── {lake} (OSM relation {rid}) ──", flush=True)

        osm = None
        for attempt in range(1, args.retry + 2):
            if attempt > 1:
                wait = attempt * 5
                print(f"  Wiederholung {attempt}/{args.retry + 1} (warte {wait}s) ...")
                time.sleep(wait)
            osm = fetch_ways_of_relation(rid)
            if osm and osm.get("elements"):
                break

        if not osm or not osm.get("elements"):
            print(f"  → FEHLGESCHLAGEN (keine Daten)")
            failed.append(lake)
            continue

        print(f"  {len(osm['elements'])} OSM-Elemente", flush=True)
        ring = build_polygon_from_ways(osm, rid)
        if not ring or len(ring) < 4:
            print(f"  → Polygon-Extraktion fehlgeschlagen ({len(ring) if ring else 0} Punkte)")
            failed.append(lake)
            continue

        print(f"  Roh: {len(ring)} Punkte → vereinfache ...", flush=True)
        simplified = rdp(ring, args.simplify)
        if len(simplified) < 4:
            print(f"  → Zu wenige Punkte nach Vereinfachung ({len(simplified)})")
            failed.append(lake)
            continue

        save_geojson(out_path, simplified, lake, {"osm_relation": rid, "simplify": args.simplify})
        success.append(lake)

        if len(lakes) > 1:
            time.sleep(8)

    print(f"\n{'='*40}")
    if success:
        print(f"Erfolgreich: {', '.join(success)}")
    if failed:
        print(f"Fehlgeschlagen: {', '.join(failed)}")
        print("→ Tipp: Später erneut versuchen (Overpass Rate-Limiting)")
        sys.exit(1)


if __name__ == "__main__":
    main()
