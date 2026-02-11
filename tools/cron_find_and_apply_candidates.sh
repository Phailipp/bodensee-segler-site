#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

# 1) Find + apply candidates per lake
TOTAL=0

if [[ "$#" -gt 0 ]]; then
  LAKES="$*"
else
  LAKES=$(python3 - <<'PY'
import json
from pathlib import Path
l=json.loads(Path('data/lakes.json').read_text(encoding='utf-8'))
print(' '.join([x['id'] for x in l]))
PY
)
fi

for LAKE in ${LAKES}; do
  echo "LAKE=${LAKE}"
  OUT="/tmp/osm_candidates_${LAKE}.json"
  # Overpass can hang; put a hard cap per lake.
  timeout 220s python3 scripts/find_candidates_osm.py --lake "${LAKE}" > "${OUT}" || true
  CHANGED=$(python3 scripts/apply_candidates.py --lake "${LAKE}" --candidates "${OUT}" | tail -n 1 | tr -d '\r')
  echo "CHANGED_${LAKE}=${CHANGED}"
  if [[ "${CHANGED}" != "0" ]]; then
    TOTAL=$((TOTAL + CHANGED))
  fi
done

# 2) Rebuild sitemap/detail pages if needed (safe even if no changes)
python3 scripts/gen_detail_pages.py >/dev/null || true

# 3) Commit + push if anything changed
if [[ "${TOTAL}" != "0" ]]; then
  git add data/lakes/**/*.json data/lakes.json sitemap.xml robots.txt detail js css scripts tools artikel i18n index.html || true
  git commit -m "Cron: apply OSM candidates (multi-lake, candidateUrl only)" || true
  git push origin main
  echo "CANDIDATES_APPLIED=${TOTAL}"
else
  echo "CANDIDATES_APPLIED=0"
fi
