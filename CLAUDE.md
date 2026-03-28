# Claude Code - Projekt-Richtlinien

## Git Workflow (AUTOMATISIERT)

Der komplette Git-Workflow ist automatisiert. So gehst du vor:

1. Neuen Branch von main erstellen: `claude/<kurze-beschreibung>`
2. Alle Aenderungen committen (Commit-Messages auf Englisch)
3. Branch pushen: `git push -u origin claude/<kurze-beschreibung>`
4. PR erstellen: `gh pr create --fill`
5. Der Auto-Merge Workflow (.github/workflows/auto-merge.yml) merged die PR automatisch und loescht den Branch
6. GitHub Pages deployed automatisch nach Merge auf main

**Wichtig:**
- NIEMALS direkt auf `main` pushen
- Branch-Name MUSS mit `claude/` beginnen (sonst kein Auto-Merge)
- `gh` CLI ist verfuegbar via GH_TOKEN Environment Variable
- Nach PR-Erstellung laeuft alles automatisch: Merge -> Branch-Loeschung -> Deploy
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
  - Genfersee: lat 46.17-46.55, lng 6.05-7.00
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

## UI-Stil-Richtlinien (Style Guide)

Neue Features MUESSEN sich nahtlos in den bestehenden Stil einfuegen. Immer erst `css/styles.css`, `js/app.js` und `index.html` lesen, bevor neue Elemente hinzugefuegt werden.

### Farben (CSS-Variablen, nie hardcoden!)
```
--gold: #c9a962          Hafen-Marker, Akzente, aktive Tabs
--gold-light: #e0c97a    Links, sekundaere Akzente
--bg-dark: #0c1929       Haupt-Hintergrund
--bg-card: #0f2035       Karten-Hintergrund
--bg-card-hover: #142840 Hover-Zustand
--white: #ffffff
--marker-anchor: #4fc3f7  Anker-Marker (blau)
--marker-gastro: #81c784  Gastro-Marker (gruen)
--marker-rental: #ffb74d  Vermietung-Marker (orange)
```

### Sektion-Template
Jede neue Sektion folgt exakt diesem Muster (am bestehenden Regelwerk/Toernplaner orientieren):
```html
<section id="<id>">
  <div class="section-inner">
    <div class="section-label" data-i18n="<key>.label">Label</div>
    <h2 class="section-title" data-i18n="<key>.title">Titel</h2>
    <p class="section-subtitle" data-i18n="<key>.subtitle">Untertitel</p>
    <!-- Inhalt -->
  </div>
</section>
```
Klassen: `.section-inner`, `.section-label`, `.section-title`, `.section-subtitle`

### Karten (Cards)
- Klasse: `.harbor-card` (fuer Haefen/Anker/etc.) oder spezifische Card-Klassen
- Hintergrund: `var(--bg-card)`, hover: `var(--bg-card-hover)`
- Border-radius: `12px`, padding: `20px`
- Border: `1px solid rgba(255,255,255,0.06)`

### Filter-Chips (Toggle-Stil)
Fuer interaktive Toggle-Filter in Sektionen:
- Klasse: `.gf-chip` (Gastplatz-Filter), `.config-chip` (Toernplaner), `.qf-chip` (Quick-Filter)
- Aktiv-Zustand: Klasse `.active` setzen, Farbe `var(--gold)`, Border `var(--gold)`
- Basis: `border: 1.5px solid rgba(255,255,255,0.15)`, `background: rgba(255,255,255,0.04)`

### Filter-Bars
- Container: `.filter-bar` + `aria-label`
- Felder: `.filter-field` > `.filter-label` + `.filter-input` / `.filter-select`
- Chip-Zeile: `.filter-chiprow` (fuer aktive Filter als Badge anzeigen)

### Modals
- Inhalt wird in `openModal(type, item)` in `js/app.js` generiert
- Zeilen via `kv(label, value)` Helper-Funktion
- Type-spezifische Bloecke per `if (type === '<type>') { ... }` einfuegen
- Keine neuen Modal-Strukturen - immer bestehenden `openModal` erweitern

### Karten-Marker
- `makeIcon(color, size)` fuer neue Marker-Typen
- Groessen: 14px (standard), 16px (Haefen), 22px (Premium-Haefen), 18px (Gastplatz-Haefen)
- Marker-Farben: CSS-Variablen verwenden, kein Hardcode

### Navigation
- Primary-Nav: max. 8 Items sichtbar
- Sekundaere Items (Guide, Safety, FAQ, Quellen) in `.nav-mehr` Dropdown
- Premium-Link bleibt als `.nav-premium` separat
- Neue Sektionen-Links ans Ende der Primary-Nav (vor Mehr-Dropdown)

### i18n
- Alle UI-Texte MUESSEN in `i18n/de.json` UND `i18n/en.json` vorhanden sein
- Naming: `<section>.<element>` (z.B. `regelwerk.tab.license`, `gf.walkIn`)
- Kein deutschen Plaintext direkt in HTML/JS (nur data-i18n Attribute nutzen)

### JavaScript-Muster
- Neue Init-Funktionen: `initXxx()` Benennung, via `safeInit(initXxx, 'initXxx')` ausfuehren
- State: Neuer Filter-State in `state.filtersXxx` als flaches Objekt
- Filter-Logik: In `applyFilters(list, type)` als neuer `if`-Block
- Alle State-Resets (Quick-Filter Toggle) muessen neue Felder zuruecksetzen

## Offene Punkte

- robots.txt Domain anpassen (wenn Hosting-Domain final)
- Impressum + Datenschutz mit echten Daten fuellen
