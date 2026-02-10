# Bodensee Segler – Data Model (v0)

Goal: keep the page *premium* and scalable by separating **content** (JSON) from **presentation** (HTML/CSS) and **logic** (JS).

## Files
- `data/harbors.json`
- `data/anchors.json`
- `data/rentals.json`
- `data/gastros.json`
- `data/services.json`

## Common fields
Most items support:
- `id` (string, unique)
- `name` (string)
- `country` ("DE"|"CH"|"AT")
- `lat`, `lng` (number)
- `url` (string, optional; official website)
- `notes` (string, optional; short, premium tone)
- `source` (string, optional; where the info comes from)
- `lastVerified` (string, optional; ISO date e.g. `2026-02-03`)

### Harbors
`data/harbors.json` item:
- `region` (string)
- `berths` (number)
- `guestBerths` (number)
- `maxDraftM` (number)
- `features` (string[])

### Anchors
`data/anchors.json` item:
- `region` (string)
- `depthMinM`, `depthMaxM` (number)
- `ground` (string)
- `protection` (string)
- `overnight` (boolean)

### Rentals
`data/rentals.json` item:
- `location` (string)
- `fleetSize` (number)
- `priceFrom` (string)
- `features` (string[])

### Gastros
`data/gastros.json` item:
- `location` (string)
- `price` (string)
- `berthing` (string)
- `features` (string[])

### Services
`data/services.json` item:
- `type` (string; `slip|fuel|yard|rigg|other`)
- `details` (string)

## Next Depth (planned)
- Add `url`, `source`, `lastVerified` for every entry
- Add `contact` fields (phone/email) **only if official and stable**
- Add `maxLOA` / `guestPolicy` for harbors
- Add `safety` hints for anchors ("fair-weather only", "ferry traffic")
