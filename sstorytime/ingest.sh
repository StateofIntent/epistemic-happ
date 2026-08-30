#!/usr/bin/env bash
# ============================================================================
# sstorytime/ingest.sh — N4L ingestion pipeline.
#
# Resolves README.md §9 Phase 2's "N4L ingestion pipeline". Takes an N4L
# .dat/.n4l file (e.g. the output of the coordinator zome's export_to_n4l,
# or sstorytime/fixtures/sample_export.n4l for a no-conductor smoke test)
# and loads it into the local SSTorytime instance sstorytime/setup.sh
# built, via the real `N4L -u` upload path — the same binary and config
# verified end-to-end in README.md §5.2.
#
# Usage:
#   sstorytime/ingest.sh <file.n4l> [--force] [--wipe]
#
#   --force  passes -force to N4L (allow uploading into a chapter that
#            already exists in the DB — N4L's own conflict guard,
#            confirmed by reading cmd/N4L/N4L.go's Upload()).
#   --wipe   passes -wipe to N4L (drops and recreates the whole schema
#            first — use to start from a clean instance).
# ============================================================================
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOCAL="$HERE/.local"

[ -f "$LOCAL/env.sh" ] || { echo "[ingest] ERROR: sstorytime/setup.sh hasn't been run yet (no $LOCAL/env.sh)." >&2; exit 1; }
# shellcheck source=/dev/null
source "$LOCAL/env.sh"

FILE=""
EXTRA_FLAGS=()
for arg in "$@"; do
  case "$arg" in
    --force) EXTRA_FLAGS+=("-force") ;;
    --wipe)  EXTRA_FLAGS+=("-wipe") ;;
    *) FILE="$arg" ;;
  esac
done

[ -n "$FILE" ] || { echo "[ingest] Usage: sstorytime/ingest.sh <file.n4l> [--force] [--wipe]" >&2; exit 1; }
[ -f "$FILE" ] || { echo "[ingest] ERROR: file not found: $FILE" >&2; exit 1; }

echo "[ingest] Uploading $FILE via N4L -u ${EXTRA_FLAGS[*]:-}..."
"$SST_BIN/N4L.exe" -u "${EXTRA_FLAGS[@]}" "$FILE"

echo "[ingest] Verifying upload by querying the DB directly ..."
NODE_COUNT="$(psql "$POSTGRESQL_URI" -tAc 'SELECT count(*) FROM Node' 2>/dev/null || echo "?")"
ARROW_COUNT="$(psql "$POSTGRESQL_URI" -tAc 'SELECT count(*) FROM ArrowDirectory' 2>/dev/null || echo "?")"
echo "[ingest] Node table now has $NODE_COUNT rows; ArrowDirectory has $ARROW_COUNT arrows."
echo "[ingest] Done. Try: sstorytime/serve.sh (visualization) or sstorytime/cone-path.sh (path navigation)"
