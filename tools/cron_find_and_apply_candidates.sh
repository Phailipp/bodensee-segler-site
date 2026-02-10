#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

# 1) Find candidates via Overpass
python3 scripts/find_candidates_osm.py > /tmp/osm_candidates.json

# 2) Apply candidates into existing datasets (strict: only candidate* fields)
CHANGED=$(python3 scripts/apply_candidates.py | tail -n 1 | tr -d '\r')

# 3) Rebuild sitemap/detail pages if needed (safe even if no changes)
python3 scripts/gen_detail_pages.py >/dev/null || true
node tools/build_sitemap.mjs >/dev/null || true

# 4) Commit + push if anything changed
if [[ "${CHANGED}" != "0" ]]; then
  git add data/*.json sitemap.xml robots.txt detail place.html js place.css css scripts tools artikel || true
  git commit -m "Cron: apply OSM candidates (candidateUrl only)" || true
  git push origin main
  echo "CANDIDATES_APPLIED=${CHANGED}"
else
  echo "CANDIDATES_APPLIED=0"
fi
