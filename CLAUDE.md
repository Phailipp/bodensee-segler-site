# Claude Code - Projekt-Richtlinien

## Git Workflow (AUTOMATISIERT)

Der komplette Git-Workflow ist automatisiert. So gehst du vor:

1. Neuen Branch von main erstellen: `claude/<kurze-beschreibung>`
2. Alle Aenderungen committen (Commit-Messages auf Englisch)
3. Branch pushen: `git push -u origin claude/<kurze-beschreibung>`
4. PR erstellen: `gh pr create --fill`
5. Der Auto-Merge Workflow (.github/workflows/auto-merge.yml) merged die PR automatisch
6. GitHub Pages deployed automatisch nach Merge auf main
7. Head Branch wird automatisch geloescht

**Wichtig:**
- NIEMALS direkt auf `main` pushen
- Branch-Name MUSS mit `claude/` beginnen (sonst kein Auto-Merge)
- `gh` CLI ist verfuegbar via GH_TOKEN Environment Variable
- Nach PR-Erstellung laeuft alles automatisch: Merge -> Deploy -> Branch-Cleanup
- Falls `gh` nicht verfuegbar: `git push` reicht, Auto-Merge greift trotzdem

## Daten-Konventionen

- `lastVerified` als ISO-Datum: `YYYY-MM-DD`
- Eintrag gilt als **verifiziert** wenn sowohl `source` als auch `lastVerified` nicht-leer sind
- Alle externen Links mit `target="_blank" rel="noreferrer"`
- **Vollstaendige Daten sind PFLICHT** - kein Eintrag ohne Kerndaten:
  - **Haefen:** `berths`, `guestBerths`, `maxDraftM`, `features` (mind. 2), `notes`
  - **Ankerplaetze:** `depthMinM`, `depthMaxM`, `ground`, `protection`, `overnight`
  - **Vermietungen:** `fleetSize`, `priceFrom`, `features` (mind. 1)
  - **Gastro:** `price`, `features` (mind. 1). Nur Restaurants direkt am Wasser/Hafen (max. 500m Luftlinie)
  - **Services:** `type`, `details`
  - Fuer ALLE Typen Pflicht: `name`, `lat`, `lng`, `url`, `source`, `lastVerified`
- Eintraege ohne Kerndaten duerfen NICHT committed werden - erst recherchieren, dann eintragen
- **Koordinaten-Validierung ist PFLICHT** bei jeder Datenaenderung:
  - ALLE Koordinaten muessen auf dem jeweiligen See liegen (nicht an Land, nicht auf anderem See)
  - Jeder neue/geaenderte Eintrag: lat/lng gegen die Bounding Box des Sees pruefen (aus `lakes.json`)
  - Keine Duplikate ueber Seen hinweg (gleiche ID darf nicht in mehreren Seen vorkommen)
  - Keine null-, 0- oder fehlenden Koordinaten
  - Bei groesseren Aenderungen: ALLE Eintraege des betroffenen Sees komplett validieren, nicht nur Stichprobe
- Bounding Boxes (aus lakes.json bzw. bekannt):
  - Bodensee: lat 47.47-47.83, lng 8.93-9.76
  - Genfersee: lat 46.30-46.55, lng 6.05-7.00
  - Lago Maggiore: lat 45.86-46.26, lng 8.45-9.05
  - Thunersee: lat 46.62-46.76, lng 7.55-7.82
  - Vierwaldstaettersee: lat 46.86-47.20, lng 8.17-8.70
  - Zuerichsee: lat 47.17-47.40, lng 8.40-8.90 (inkl. Obersee bis Schmerikon)
  - Zugersee: lat 47.05-47.20, lng 8.43-8.58

## Projekt-Struktur

- `data/lakes.json` - Index aller Seen mit Metadaten
- `data/lakes/<see-id>/` - Pro See: anchors, gastros, harbors, layers, rentals, services (je .json)
- `js/app.js` - Haupt-App-Logik
- `css/styles.css` - Alle Styles
- `index.html` - Single-Page Layout

## Offene Punkte

- robots.txt Domain anpassen (wenn Hosting-Domain final)
- Impressum + Datenschutz mit echten Daten fuellen
