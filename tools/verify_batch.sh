#!/usr/bin/env bash
set -euo pipefail
LIMIT="${1:-20}"
cd "$(dirname "$0")/.."
node tools/verify_candidates.mjs --limit "$LIMIT"
