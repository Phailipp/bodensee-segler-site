# Claude Code – Projekt-Richtlinien

## Git Workflow

- **Arbeite auf `main`** – alle Commits lokal auf main machen
- **Am Ende der Arbeit:** PR erstellen damit der User die Änderungen reviewen kann
  1. Neuen Branch von main erstellen: `claude/<kurze-beschreibung>`
  2. Branch pushen
  3. PR öffnen mit Zusammenfassung
- **Commit-Messages auf Englisch**
- Direkt auf `main` pushen geht nicht (Branch Protection)

## Daten-Konventionen

- `lastVerified` als ISO-Datum: `YYYY-MM-DD`
- Eintrag gilt als **verifiziert** wenn sowohl `source` als auch `lastVerified` nicht-leer sind
- Alle externen Links mit `target="_blank" rel="noreferrer"`
- Koordinaten müssen auf dem jeweiligen See liegen (nicht an Land, nicht auf anderem See)
  - Bodensee realistischer Bereich: lat 47.47–47.83, lng 8.93–9.76

## Projekt-Struktur

- `data/lakes.json` – Index aller Seen mit Metadaten
- `data/lakes/<see-id>/` – Pro See: anchors, gastros, harbors, layers, rentals, services (je .json)
- `js/app.js` – Haupt-App-Logik
- `css/styles.css` – Alle Styles
- `index.html` – Single-Page Layout

## Offene Punkte

- Stichprobe neue Koordinaten (Spot-Check)
- robots.txt Domain anpassen (wenn Hosting-Domain final)
- og:image erstellen und einbinden
- Impressum + Datenschutz mit echten Daten füllen
