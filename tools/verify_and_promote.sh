#!/usr/bin/env bash
set -euo pipefail

LIMIT="${1:-20}"
DRY="${2:-}"

cd "$(dirname "$0")/.."

if [[ "${DRY}" == "--dry-run" || "${DRY}" == "--dry" ]]; then
  node tools/verify_candidates.mjs --limit "$LIMIT" --dry-run
  exit 0
fi

OUT=$(node tools/verify_candidates.mjs --limit "$LIMIT")
echo "$OUT"
PROMOTED=$(echo "$OUT" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);console.log(j.promoted||0)}catch{console.log(0)}})')

# regenerate SEO assets
python3 scripts/gen_detail_pages.py >/dev/null || true

# run smoke QA (live)
node scripts/qa_smoke_playwright.cjs "https://phailipp.github.io/bodensee-segler-site/?v=verify-promote" || true

if [[ "$PROMOTED" != "0" ]]; then
  git add data/*.json detail sitemap.xml robots.txt
  git commit -m "Verify: promote candidate URLs (batch)" || true
  git push origin main
  echo "PROMOTED=${PROMOTED}"
else
  echo "PROMOTED=0"
fi
