# Neue Daten hinzufügen

Füge neue verifizierte Einträge für einen See hinzu. Argument: `<see-id> <typ>` (z.B. `thunersee rentals`)

## Schritt 1: Lücken identifizieren

Lese die bestehende JSON-Datei für `data/lakes/<see-id>/<typ>.json`.
Analysiere welche Orte/Betriebe fehlen könnten basierend auf:
- Geografische Lücken am See (Nord/Süd/Ost/West-Ufer)
- Bekannte Häfen/Marinas ohne Eintrag
- Typische Angebote für den See (z.B. Thunersee → Segelschulen, Lago Maggiore → Motorboote)

## Schritt 2: Recherche für jeden Kandidaten

Für jeden potenziellen neuen Eintrag:

1. `WebSearch`: `"<betriebsname>" "<ort>" <typ> offizielle Website`
2. `WebFetch` auf gefundene URL um Daten zu verifizieren:
   - Existiert die Seite wirklich?
   - Sind Preise / Flotteninfos / Öffnungszeiten vorhanden?
   - Ist der Betrieb direkt am Wasser / Hafen?
3. Koordinaten via WebSearch ermitteln: `"<betriebsname>" "<ort>" koordinaten GPS`

## Schritt 3: Validierung vor dem Eintragen

Für jeden neuen Eintrag prüfen:
- [ ] URL zeigt auf echte Business-Website (nicht Gemeindewebseite, nicht nur Tourismus-Portal)
- [ ] Koordinaten liegen innerhalb der See-Bounding-Box:
  - bodensee: lat 47.47–47.83, lng 8.93–9.76
  - genfersee: lat 46.30–46.55, lng 6.05–7.00
  - lago-maggiore: lat 45.86–46.26, lng 8.45–9.05
  - thunersee: lat 46.62–46.76, lng 7.55–7.82
  - vierwaldstaettersee: lat 46.86–47.20, lng 8.17–8.70
  - zuerichsee: lat 47.17–47.40, lng 8.40–8.90
  - zugersee: lat 47.05–47.20, lng 8.43–8.58
- [ ] Pflichtfelder vollständig (je nach Typ):
  - rentals: fleetSize, priceFrom, features (min. 1)
  - gastros: price, features (min. 1) — NUR direkt am Wasser/Hafen (max. 500m)
  - services: type, details
  - harbors: berths, guestBerths, maxDraftM, features (min. 2), notes
  - anchors: depthMinM, depthMaxM, ground, protection, overnight
  - Alle: name, lat, lng, url, source, lastVerified
- [ ] `lastVerified` = heutiges Datum (YYYY-MM-DD)
- [ ] `id` eindeutig (kein Duplikat im ganzen Datensatz)

## Schritt 4: Validierungsscript ausführen

Nach dem Hinzufügen das Script aus `/verify-data` (Schritt 1) laufen lassen → 0 Issues.

## Schritt 5: Commit + Push + PR + Merge

```bash
git checkout -b claude/data-add-<see-id>-<typ>
git add data/lakes/<see-id>/<typ>.json
git commit -m "Add verified <typ> for <see-id>: <namen der neuen Einträge>"
git push -u origin HEAD
```

PR erstellen und **sofort mergen**.
