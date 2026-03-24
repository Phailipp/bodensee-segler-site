#!/usr/bin/env python3
"""
validate.py – Validierungsscript für alle Seen-Daten.

Prüft:
  1. Pflichtfelder (je nach Typ)
  2. Koordinaten gegen Bounding Box des jeweiligen Sees
  3. Keine null/0-Koordinaten
  4. URL-Erreichbarkeit (HTTP HEAD-Request, optional mit --check-urls)
  5. lastVerified + source vorhanden (verifiziert-Status)
  6. Duplikate (gleiche ID in mehreren Seen)
  7. Koordinaten im Wasser (Overpass-API, optional mit --check-water)
     Nur für anchors: Punkt muss in natural=water oder waterway liegen.

Aufruf:
  python3 scripts/validate.py                        # alle Seen, ohne URL/Wasser-Check
  python3 scripts/validate.py --check-urls           # inkl. HTTP-Check
  python3 scripts/validate.py --check-water          # inkl. Overpass-Wasser-Check (anchors)
  python3 scripts/validate.py --check-water --check-urls  # alles
  python3 scripts/validate.py --lake bodensee --check-water
"""

import argparse
import json
import sys
import time
import urllib.request
import urllib.error
import urllib.parse
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

# ── Bounding Boxes (lat_min, lat_max, lng_min, lng_max) ───────────────────────
BBOXES = {
    "bodensee":            (47.47, 47.83, 8.93, 9.76),
    "genfersee":           (46.30, 46.55, 6.05, 7.00),
    "lago-maggiore":       (45.86, 46.26, 8.45, 9.05),
    "thunersee":           (46.62, 46.76, 7.55, 7.82),
    "vierwaldstaettersee": (46.86, 47.20, 8.17, 8.70),
    # Zürichsee inkl. Obersee (bis Schmerikon/Uznach, lng bis ~8.90)
    "zuerichsee":          (47.17, 47.40, 8.40, 8.90),
    # Zugersee: Nordende bei Cham/Zug bis lat ~47.20
    "zugersee":            (47.05, 47.20, 8.43, 8.58),
}

FILES = ["harbors", "anchors", "rentals", "gastros", "services"]

# ── Pflichtfelder je Typ ──────────────────────────────────────────────────────
REQUIRED_ALL = ["id", "name", "lat", "lng", "url", "source", "lastVerified"]

REQUIRED_BY_TYPE = {
    "harbors":  ["berths", "guestBerths", "maxDraftM", "features", "notes"],
    "anchors":  ["depthMinM", "depthMaxM", "ground", "protection", "overnight"],
    "rentals":  ["fleetSize", "priceFrom", "features"],
    "gastros":  ["price", "features"],
    "services": ["type", "details"],
}

MIN_FEATURES = {
    "harbors": 2,
    "rentals": 1,
    "gastros": 1,
}

# ── Farben ────────────────────────────────────────────────────────────────────
RED   = "\033[91m"
YEL   = "\033[93m"
GRN   = "\033[92m"
RESET = "\033[0m"
BOLD  = "\033[1m"

def err(msg):  print(f"  {RED}✗ {msg}{RESET}")
def warn(msg): print(f"  {YEL}⚠ {msg}{RESET}")
def ok(msg):   print(f"  {GRN}✓ {msg}{RESET}")


# ── URL-Check (HEAD, Fallback GET) ────────────────────────────────────────────
def check_url(url: str, timeout: int = 10) -> tuple[bool, str]:
    """Returns (ok, status_or_error)."""
    if not url or not url.startswith("http"):
        return False, "no/invalid URL"
    for method in ("HEAD", "GET"):
        try:
            req = urllib.request.Request(url, method=method, headers={
                "User-Agent": "Mozilla/5.0 (validate-script; +https://github.com/Phailipp/bodensee-segler-site)"
            })
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return True, str(resp.status)
        except urllib.error.HTTPError as e:
            if e.code in (405, 403, 401):
                # method not allowed or auth required – URL probably exists
                if method == "GET":
                    return True, f"HTTP {e.code} (tolerated)"
                continue
            return False, f"HTTP {e.code}"
        except urllib.error.URLError as e:
            return False, str(e.reason)
        except Exception as e:
            return False, str(e)
    return False, "unknown error"


def check_urls_parallel(items: list[dict], label: str) -> list[str]:
    """Check all `url` fields in parallel. Returns list of error messages."""
    errors = []
    to_check = [(i, it) for i, it in enumerate(items) if it.get("url")]

    with ThreadPoolExecutor(max_workers=10) as ex:
        futures = {ex.submit(check_url, it["url"]): (i, it) for i, it in to_check}
        for future in as_completed(futures):
            i, it = futures[future]
            ok_flag, status = future.result()
            entry_id = it.get("id", f"[{i}]")
            if not ok_flag:
                errors.append(f"{entry_id}: URL nicht erreichbar ({status}) → {it['url']}")
            else:
                # slight delay to be polite
                time.sleep(0.05)
    return errors


# ── Lokaler Wasser-Check via GeoJSON-Polygon ──────────────────────────────────
# Nutzt outline.geojson (per See), erzeugt von scripts/fetch_lake_polygons.py.
# Ray-Casting Point-in-Polygon, keine API-Aufrufe.

def _load_lake_polygon(lake: str, data_dir: Path) -> list[list[float]] | None:
    """Lädt outline.geojson für einen See. Returns [[lng, lat], ...] oder None."""
    p = data_dir / lake / "outline.geojson"
    if not p.exists():
        return None
    try:
        geojson = json.loads(p.read_text(encoding="utf-8"))
        coords = geojson["geometry"]["coordinates"][0]
        return coords  # [[lng, lat], ...]
    except Exception:
        return None


def _point_in_polygon(lat: float, lng: float, polygon: list[list[float]]) -> bool:
    """
    Ray-Casting Algorithmus: True wenn (lat, lng) innerhalb des Polygons liegt.
    polygon: [[lng, lat], ...] (GeoJSON-Format)
    """
    x, y = lng, lat
    n = len(polygon)
    inside = False
    j = n - 1
    for i in range(n):
        xi, yi = polygon[i]
        xj, yj = polygon[j]
        if ((yi > y) != (yj > y)) and (x < (xj - xi) * (y - yi) / (yj - yi + 1e-15) + xi):
            inside = not inside
        j = i
    return inside


def check_water_local(entries: list[dict], lake: str, data_dir: Path) -> list[str]:
    """
    Prüft Koordinaten lokal gegen das GeoJSON-Polygon des Sees.
    Returns Fehlermeldungen.
    """
    polygon = _load_lake_polygon(lake, data_dir)
    if polygon is None:
        return [f"WARN outline.geojson nicht vorhanden → Wasser-Check übersprungen "
                f"(Hinweis: python3 scripts/fetch_lake_polygons.py --lake {lake})"]

    errors = []
    for it in entries:
        lat = it.get("lat")
        lng = it.get("lng")
        if lat is None or lng is None:
            continue
        eid = it.get("id", "?")
        if not _point_in_polygon(lat, lng, polygon):
            errors.append(
                f"{eid}: Koordinaten NICHT im Wasser! lat={lat} lng={lng} "
                f"(liegt ausserhalb outline.geojson)"
            )
    return errors


# ── Koordinaten-Check ─────────────────────────────────────────────────────────
def check_coords(entry: dict, bbox: tuple, lake: str) -> list[str]:
    errors = []
    lat = entry.get("lat")
    lng = entry.get("lng")
    eid = entry.get("id", "?")

    if lat is None or lng is None:
        errors.append(f"{eid}: lat/lng fehlt")
        return errors
    if lat == 0 or lng == 0:
        errors.append(f"{eid}: lat oder lng ist 0")
        return errors

    lat_min, lat_max, lng_min, lng_max = bbox
    if not (lat_min <= lat <= lat_max):
        errors.append(f"{eid}: lat={lat} ausserhalb {lat_min}–{lat_max} ({lake})")
    if not (lng_min <= lng <= lng_max):
        errors.append(f"{eid}: lng={lng} ausserhalb {lng_min}–{lng_max} ({lake})")
    return errors


# ── Pflichtfelder-Check ───────────────────────────────────────────────────────
def check_required(entry: dict, ftype: str) -> list[str]:
    errors = []
    eid = entry.get("id", "?")

    for field in REQUIRED_ALL:
        val = entry.get(field)
        if val is None or val == "" or val == []:
            errors.append(f"{eid}: Pflichtfeld '{field}' fehlt/leer")

    for field in REQUIRED_BY_TYPE.get(ftype, []):
        val = entry.get(field)
        if val is None or val == "" or val == []:
            errors.append(f"{eid}: Pflichtfeld '{field}' fehlt/leer ({ftype})")

    # Min-Feature-Check
    if ftype in MIN_FEATURES:
        feats = entry.get("features") or []
        if isinstance(feats, list) and len(feats) < MIN_FEATURES[ftype]:
            errors.append(f"{eid}: 'features' hat {len(feats)} Einträge (mind. {MIN_FEATURES[ftype]} nötig)")

    return errors


# ── Duplikat-Check über Seen hinweg ──────────────────────────────────────────
def check_global_duplicates(data_dir: Path) -> list[str]:
    """Prüft ob dieselbe ID in VERSCHIEDENEN Seen vorkommt (nicht: gleiche ID in verschiedenen Typen desselben Sees)."""
    # id -> set of lakes it appears in
    id_to_lakes: dict[str, set[str]] = {}
    for lake_dir in sorted(data_dir.iterdir()):
        if not lake_dir.is_dir():
            continue
        lake = lake_dir.name
        for ftype in FILES:
            p = lake_dir / f"{ftype}.json"
            if not p.exists():
                continue
            try:
                entries = json.loads(p.read_text(encoding="utf-8"))
            except Exception:
                continue
            for entry in entries:
                eid = entry.get("id")
                if eid:
                    id_to_lakes.setdefault(eid, set()).add(lake)

    errors = []
    for eid, lakes in id_to_lakes.items():
        if len(lakes) > 1:
            errors.append(f"Duplikat ID '{eid}' in verschiedenen Seen: {', '.join(sorted(lakes))}")
    return errors


# ── Hauptlogik ────────────────────────────────────────────────────────────────
def validate_lake(lake: str, data_dir: Path, check_urls: bool, check_water: bool) -> dict:
    bbox = BBOXES.get(lake)
    if not bbox:
        print(f"{YEL}⚠  Kein Bounding Box für '{lake}' – übersprungen{RESET}")
        return {"lake": lake, "errors": 0, "warnings": 0}

    lake_dir = data_dir / lake
    total_errors = 0
    total_warnings = 0

    print(f"\n{BOLD}── {lake} ──{RESET}")

    for ftype in FILES:
        p = lake_dir / f"{ftype}.json"
        if not p.exists():
            warn(f"{ftype}.json nicht gefunden")
            total_warnings += 1
            continue

        try:
            entries = json.loads(p.read_text(encoding="utf-8"))
        except json.JSONDecodeError as e:
            err(f"{ftype}.json: JSON-Fehler: {e}")
            total_errors += 1
            continue

        file_errors = []

        for entry in entries:
            file_errors += check_coords(entry, bbox, lake)
            file_errors += check_required(entry, ftype)

        if check_urls and entries:
            url_errors = check_urls_parallel(entries, f"{lake}/{ftype}")
            file_errors += url_errors

        # Wasser-Check: nur für anchors (lokal via outline.geojson)
        if check_water and ftype == "anchors" and entries:
            water_results = check_water_local(entries, lake, data_dir)
            for msg in water_results:
                if msg.startswith("WARN "):
                    warn(msg[5:])
                    total_warnings += 1
                else:
                    file_errors.append(msg)

        if file_errors:
            print(f"\n  {BOLD}{ftype}.json{RESET} ({len(entries)} Einträge, {len(file_errors)} Fehler):")
            for e in file_errors:
                err(e)
            total_errors += len(file_errors)
        else:
            ok(f"{ftype}.json – {len(entries)} Einträge OK")

    return {"lake": lake, "errors": total_errors, "warnings": total_warnings}


def main():
    ap = argparse.ArgumentParser(description="Validiert alle Seen-Daten")
    ap.add_argument("--lake", help="Nur diesen See prüfen (z.B. bodensee)")
    ap.add_argument("--check-urls", action="store_true", help="HTTP-Erreichbarkeit aller URLs prüfen (langsam)")
    ap.add_argument("--check-water", action="store_true", help="Overpass-API: Ankerplätze müssen im Wasser liegen")
    ap.add_argument("--data-dir", default="data/lakes", help="Pfad zum lakes-Verzeichnis")
    args = ap.parse_args()

    data_dir = Path(args.data_dir)
    if not data_dir.exists():
        print(f"{RED}data-dir nicht gefunden: {data_dir}{RESET}")
        sys.exit(1)

    lakes = [args.lake] if args.lake else sorted(BBOXES.keys())

    print(f"{BOLD}=== validate.py ==={RESET}")
    if args.check_urls:
        print(f"{YEL}URL-Check aktiviert (kann mehrere Minuten dauern){RESET}")
    if args.check_water:
        print(f"{YEL}Wasser-Check aktiviert (Overpass API, für Ankerplätze){RESET}")

    # Global duplicate check
    print(f"\n{BOLD}── Globale Duplikat-Prüfung ──{RESET}")
    dup_errors = check_global_duplicates(data_dir)
    if dup_errors:
        for e in dup_errors:
            err(e)
    else:
        ok("Keine Duplikate gefunden")

    # Per-lake validation
    results = []
    for lake in lakes:
        r = validate_lake(lake, data_dir, args.check_urls, args.check_water)
        results.append(r)

    # Summary
    total = sum(r["errors"] for r in results)
    total_w = sum(r["warnings"] for r in results)
    print(f"\n{BOLD}=== Zusammenfassung ==={RESET}")
    for r in results:
        status = f"{RED}✗ {r['errors']} Fehler{RESET}" if r["errors"] else f"{GRN}✓ OK{RESET}"
        print(f"  {r['lake']}: {status}")
    print()
    if total > 0:
        print(f"{RED}{BOLD}FEHLGESCHLAGEN: {total} Fehler, {total_w} Warnungen{RESET}")
        sys.exit(1)
    else:
        print(f"{GRN}{BOLD}BESTANDEN – alle Daten valide{RESET}")
        if total_w:
            print(f"{YEL}{total_w} Warnungen{RESET}")


if __name__ == "__main__":
    main()
