# Bodensee Segler – Data Model (v0)

Goal: keep the page *premium* and scalable by separating **content** (JSON) from **presentation** (HTML/CSS) and **logic** (JS).

## Files
### Global
- `data/lakes.json` (list of available lakes/regions + map defaults)

### Per lake
- `data/lakes/<slug>/harbors.json`
- `data/lakes/<slug>/anchors.json`
- `data/lakes/<slug>/rentals.json`
- `data/lakes/<slug>/gastros.json`
- `data/lakes/<slug>/services.json`

> Backward compatibility: the original `data/*.json` files may still exist for older builds, but the app loads from `data/lakes/<slug>/...`. 

## Common fields
Most items support:
- `id` (string, unique)
- `name` (string)
- `country` ("DE"|"CH"|"AT")
- `lat`, `lng` (number)
- `url` (string, optional; **verified** official website)
- `source` (string, optional; where the verified `url` comes from — typically the `url` itself)
- `lastVerified` (string, optional; ISO date e.g. `2026-02-03`)
- `candidateUrl` (string|null, optional; **unverified** website candidate)
- `candidateFoundAt` (string|null, optional; ISO date when the candidate was found)
- `candidateSource` (string|null, optional; where the candidate came from; note: never used as the verified `source`)
- `notes` (string, optional; short, premium tone)

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
