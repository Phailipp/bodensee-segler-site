# Daten-Verifizierung Skill

Führe eine vollständige Daten-Verifizierung aller Lake-Daten durch. Geh systematisch vor:

## Schritt 1: Automatische Validierung

Führe dieses Python-Script aus um strukturelle Probleme zu finden:

```python
import json, os
from urllib.parse import urlparse

BOUNDS = {
    'bodensee':            {'lat': (47.47, 47.83), 'lng': (8.93, 9.76)},
    'genfersee':           {'lat': (46.30, 46.55), 'lng': (6.05, 7.00)},
    'lago-maggiore':       {'lat': (45.86, 46.26), 'lng': (8.45, 9.05)},
    'thunersee':           {'lat': (46.62, 46.76), 'lng': (7.55, 7.82)},
    'vierwaldstaettersee': {'lat': (46.86, 47.20), 'lng': (8.17, 8.70)},
    'zuerichsee':          {'lat': (47.17, 47.40), 'lng': (8.40, 8.90)},
    'zugersee':            {'lat': (47.05, 47.20), 'lng': (8.43, 8.58)},
}

REQUIRED_ALL = ['name', 'lat', 'lng', 'url', 'source', 'lastVerified']
REQUIRED = {
    'harbors':  ['berths', 'maxDraftM', 'features', 'notes'],
    'anchors':  ['depthMinM', 'depthMaxM', 'ground', 'protection', 'overnight'],
    'rentals':  ['fleetSize', 'priceFrom', 'features'],
    'gastros':  ['price', 'features'],
    'services': ['type', 'details'],
}

GENERIC_URL_EXACT_DOMAINS = [
    'www.thun.ch', 'www.spiez.ch', 'www.hilterfingen.ch', 'www.stansstad.ch',
    'www.uetikon.ch', 'www.staefa.ch', 'www.cham.ch', 'schwyz-tourismus.ch',
    'www.thonon-les-bains.fr', 'ville-evian.fr', 'www.coppet-tourisme.ch',
    'gemeinde.lochau.at', 'www.langenargen-tourismus.de',
]
GENERIC_URL_PATH_KEYWORDS = [
    '/tourismus/', '/aktivitaeten', 'verwaltung/bauverwaltung',
    '/erleben/aktivitaeten', 'cadre-de-vie/port-de-plaisance',
    'loisirs/port-de-plaisance',
]

def is_generic_url(url):
    if not url: return False
    u = url.lower()
    try:
        domain = urlparse(u).netloc
    except:
        domain = ''
    if any(g == domain for g in GENERIC_URL_EXACT_DOMAINS):
        if u.count('/') <= 3:
            return True
    if any(p in u for p in GENERIC_URL_PATH_KEYWORDS):
        return True
    return False

issues = []
base = 'data/lakes'
all_ids = {}

for lake in sorted(os.listdir(base)):
    lake_path = os.path.join(base, lake)
    if not os.path.isdir(lake_path): continue
    bounds = BOUNDS.get(lake)
    for ftype in ['harbors', 'anchors', 'rentals', 'gastros', 'services']:
        fpath = os.path.join(lake_path, f'{ftype}.json')
        if not os.path.exists(fpath): continue
        entries = json.load(open(fpath))
        for e in entries:
            eid = e.get('id', '???')
            loc = f'{lake}/{ftype}/{eid}'
            all_ids.setdefault(eid, []).append(lake)
            for field in REQUIRED_ALL:
                v = e.get(field)
                if v is None or v == '':
                    issues.append(f'MISSING_{field}  {loc}')
            for field in REQUIRED.get(ftype, []):
                v = e.get(field)
                if v is None:
                    issues.append(f'MISSING_{field}  {loc}')
                elif v == '' or (isinstance(v, list) and not v):
                    issues.append(f'EMPTY_{field}  {loc}')
                elif isinstance(v, bool):
                    pass
                elif isinstance(v, (int, float)) and v == 0 and field in ('depthMinM', 'depthMaxM', 'maxDraftM'):
                    issues.append(f'ZERO_{field}  {loc}')
            if ftype in ('harbors', 'rentals', 'gastros'):
                feats = e.get('features') or []
                min_f = 2 if ftype == 'harbors' else 1
                if isinstance(feats, list) and len(feats) < min_f:
                    issues.append(f'FEW_FEATURES  {loc}')
            lat, lng = e.get('lat'), e.get('lng')
            if not lat or not lng:
                issues.append(f'BAD_COORD  {loc}')
            elif bounds:
                if not (bounds['lat'][0] <= lat <= bounds['lat'][1] and bounds['lng'][0] <= lng <= bounds['lng'][1]):
                    issues.append(f'OUT_OF_BOUNDS  lat={lat} lng={lng}  {loc}')
            if is_generic_url(e.get('url') or ''):
                issues.append(f'GENERIC_URL  {loc}  {e.get("url")}')

for eid, lakes in all_ids.items():
    if len(lakes) > 1:
        issues.append(f'DUPLICATE_ID  {eid}  {lakes}')

print(f'ISSUES: {len(issues)}')
for i in sorted(issues): print(' ', i)
```

## Schritt 2: Web-Recherche für verdächtige Einträge

Für **jeden** GENERIC_URL- oder MISSING_url-Eintrag:

1. `WebSearch` nach: `"<name>" "<location>" site:<land-domain> OR "<name>" boot OR segeln OR restaurant`
2. Falls echter Betrieb gefunden → URL in JSON aktualisieren, `lastVerified` auf heute setzen
3. Falls kein echter Betrieb gefunden → Eintrag entfernen

**Entscheidungsregeln:**
- Kein direktes Business-Ergebnis in den ersten 3 Suchergebnissen → ENTFERNEN
- Nur aggregator-Seiten (booking.com, tripadvisor, yelp) → URL auf beste Aggregator-Seite setzen, wenn Betrieb eindeutig real ist
- Telefonnummer vorhanden → Betrieb wahrscheinlich real, aggressive Suche bevor Entfernen

## Schritt 3: Koordinaten-Plausibilitätsprüfung

Für **jeden** OUT_OF_BOUNDS-Eintrag:
- Koordinaten gegen Google Maps / Nominatim prüfen
- Koordinaten korrigieren oder Eintrag entfernen

## Schritt 4: Neue Einträge hinzufügen (optional)

Wenn der User explizit Lücken füllen möchte:
- Nur Einträge mit direkter Business-URL (kein Aggregator, keine Gemeindewebseite als Haupt-URL)
- Koordinaten immer gegen Bounding Box validieren
- `lastVerified` auf heute setzen

## Schritt 5: Abschliessende Validierung

Script nochmal laufen lassen → muss 0 Issues zeigen.

## Schritt 6: Commit + Push + PR

```bash
git checkout -b claude/data-verify-$(date +%Y-%m-%d)
git add data/
git commit -m "Data verification: <kurze Zusammenfassung der Änderungen>"
git push -u origin HEAD
# PR erstellen via mcp__github__create_pull_request
```

**WICHTIG:** Immer sofort mergen nach PR-Erstellung. Branch-Name MUSS mit `claude/` beginnen.
