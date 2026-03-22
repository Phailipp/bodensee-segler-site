# Claude Code – Projekt-Richtlinien

## Git Workflow

- **Arbeite auf `main`** – alle Commits lokal auf main machen
- **Am Ende IMMER pushen** – damit der User die Änderungen live gehen lassen kann
  1. Neuen Branch von main erstellen: `claude/<kurze-beschreibung>`
  2. Branch pushen
  3. PR öffnen mit Zusammenfassung
- **Commit-Messages auf Englisch**
- Direkt auf `main` pushen geht nicht (Branch Protection)

## Daten-Konventionen

- `lastVerified` als ISO-Datum: `YYYY-MM-DD`
- Eintrag gilt als **verifiziert** wenn sowohl `source` als auch `lastVerified` nicht-leer sind
- Alle externen Links mit `target="_blank" rel="noreferrer"`
- **Vollständige Daten sind PFLICHT** – kein Eintrag ohne Kerndaten:
  - **Häfen:** `berths`, `guestBerths`, `maxDraftM`, `features` (mind. 2), `notes`
  - **Ankerplätze:** `depthMinM`, `depthMaxM`, `ground`, `protection`, `overnight`
  - **Vermietungen:** `fleetSize`, `priceFrom`, `features` (mind. 1)
  - **Gastro:** `price`, `features` (mind. 1). Nur Restaurants direkt am Wasser/Hafen (max. 500m Luftlinie)
  - **Services:** `type`, `details`
  - Für ALLE Typen Pflicht: `name`, `lat`, `lng`, `url`, `source`, `lastVerified`
  - Einträge ohne Kerndaten dürfen NICHT committed werden – erst recherchieren, dann eintragen
- **Koordinaten-Validierung ist PFLICHT** bei jeder Datenänderung:
  - ALLE Koordinaten müssen auf dem jeweiligen See liegen (nicht an Land, nicht auf anderem See)
  - Jeder neue/geänderte Eintrag: lat/lng gegen die Bounding Box des Sees prüfen (aus `lakes.json`)
  - Keine Duplikate über Seen hinweg (gleiche ID darf nicht in mehreren Seen vorkommen)
  - Keine null-, 0- oder fehlenden Koordinaten
  - Bei größeren Änderungen: ALLE Einträge des betroffenen Sees komplett validieren, nicht nur Stichprobe
  - Bounding Boxes (aus lakes.json bzw. bekannt):
    - Bodensee: lat 47.47–47.83, lng 8.93–9.76
    - Genfersee: lat 46.30–46.55, lng 6.05–7.00
    - Lago Maggiore: lat 45.86–46.26, lng 8.45–9.05
    - Thunersee: lat 46.62–46.76, lng 7.55–7.82
    - Vierwaldstättersee: lat 46.86–47.20, lng 8.17–8.70
    - Zürichsee: lat 47.17–47.40, lng 8.40–8.80
    - Zugersee: lat 47.05–47.18, lng 8.43–8.58

## Projekt-Struktur

- `data/lakes.json` – Index aller Seen mit Metadaten
- `data/lakes/<see-id>/` – Pro See: anchors, gastros, harbors, layers, rentals, services (je .json)
- `js/app.js` – Haupt-App-Logik
- `css/styles.css` – Alle Styles
- `index.html` – Single-Page Layout

## Offene Punkte

- robots.txt Domain anpassen (wenn Hosting-Domain final)
- Impressum + Datenschutz mit echten Daten füllen
