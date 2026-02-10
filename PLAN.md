# Bodensee Segler – Roadmap (Premium + Pipeline)

Ziel: Premium-Revierportal. Default zeigt nur verifizierte Inhalte (offizielle Quelle + lastVerified). Unverifizierte Funde werden in einer Pipeline gesammelt und abgearbeitet – ohne die Premium-Ansicht zu verwässern.

## Prinzipien (Quality Gate)

- **Verified** = `source` + `lastVerified` gesetzt **und** `source` ist eine **offizielle, öffentlich erreichbare** Seite.
- **Strict rule**: Finder-Quellen (OSM/Wikidata/Directories) dürfen **nie** als `source` verwendet werden.
- **url** ist immer der öffentliche Link, den Nutzer anklicken sollen (meist identisch zu `source`).

## Phase 1 – Premium Default + Trust UX (fertig / ongoing)

- Verified-only als Default (Toggle „Unverified anzeigen“).
- Modal zeigt Status, Quelle, lastVerified, Search, Report.
- Backlog in Quellen (offene Datenpunkte) als Issue-Links.

Status: umgesetzt. Mobile Toggle-Fix: umgesetzt.

## Phase 2 – Pipeline (Finder → Candidate → Verify → Publish)

### 2.1 Datenmodell erweitern

Für alle POI-Typen (harbors, anchors, rentals, gastros, services):

- `candidateUrl` (string, optional)
- `candidateFoundAt` (YYYY-MM-DD, optional)
- `candidateSource` (enum: `osm`, `wikidata`, `manual`, optional)

### 2.2 Finder (kostenfrei)

- Overpass (OSM) und/oder Wikidata, um Kandidaten-Links zu finden.
- Output: nur `candidate*` Felder oder GitHub-Issues (kein `source`).

### 2.3 Verifier (Playwright)

- Script lädt `candidateUrl` im Headless-Browser.
- Wenn Seite erreichbar + plausibel: setzt `url`, `source`, `lastVerified`.
- Wenn nicht: lässt Entry unverifiziert.

### 2.4 Backlog UI

- Zeigt zusätzlich `candidateUrl` (falls vorhanden) + „Open“-Button.
- Priorisierung: Einträge mit candidateUrl zuerst.

**ETA Phase 2:** 1–2 Tage für Modell+Scripts+UI.

## Phase 3 – Decision Support pro Spot (Datenmodell + UI)

### 3.1 Datenfelder (optional, nur anzeigen wenn vorhanden)

**Harbors**
- `approachNotes`
- `windProtection` (z.B. Array `['W','NW']` oder Text)
- `minDepthM` / `maxDepthM`
- `vhf`, `phone`, `email`
- `facilities` (sanitary, power, water, waste)
- `crane`, `slip`
- `pricingHint`, `openingHours`
- `guestBerthsPolicy`

**Anchors**
- `approachNotes`
- `windProtection`
- `minDepthM` / `maxDepthM`
- `overnightAllowed` (bool)
- `restrictionsNotes`

**Services/Rentals/Gastro**
- `openingHours`, `phone`
- `pricingHint` (wenn offiziell)

### 3.2 Filter + Szenarien

- Neue Filter (nur auf verifizierten Feldern)
- Presets/Szenarien: „Heute Abend Hafen“ (Umkreis + Tiefgang + Schutz)

**ETA Phase 3:** 3–6 Tage (UI+Modell). Datenbefüllung läuft danach kontinuierlich.

## Phase 4 – Revierstruktur als Karten-Layer

- Zonen: Naturschutz, Ankerverbote, Sperrgebiete, Fahrverbote
- Wind-/Föhn-Hotspots als Layer (nur wenn offizielle/seriöse Quelle)
- Jede Zone hat `source` + `lastVerified`

**ETA Phase 4:** 4–10 Tage (je nach Quellenlage). 

## Phase 5 – Live Kontext

- Quellen-Links bündeln: Pegel, Sturmwarnung, Wetterstationen, Sperrungen
- Optional: kleine Widgets, wenn kostenfrei und stabil

**ETA Phase 5:** 1–3 Tage (links+ui), Widgets optional.

## Phase 6 – Unterwegs/Export

- „In Google Maps öffnen“
- Share-Link pro Eintrag
- Optional PWA/Offline cache

**ETA Phase 6:** 1–4 Tage.

## Laufender Betrieb (ohne Nachfragen)

- Ich arbeite in kleinen Batches.
- Jede Änderung: commit → Pages deploy → kurze Statusmeldung.
- Premium-Ansicht bleibt sauber, Backlog wächst separat.
