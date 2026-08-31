#!/usr/bin/env bash
# ============================================================================
# sstorytime/cone-path.sh — local cone paths navigation.
#
# Resolves README.md §9 Phase 2's "Local cone paths navigation". Thin
# wrapper around SSTorytime's own `pathsolve` binary, which implements
# cone-path search over the graph (GetConstraintConePathsAsLinks /
# GetFwdConeAsNodes in pkg/SSTorytime — confirmed by reading docs/API.md
# and docs/pathsolve.md). Queries whatever this agent has ingested via
# ingest.sh, straight from Postgres — no config files needed here, since
# pathsolve reads the arrow vocabulary back out of the DB that N4L -u
# already populated.
#
# Usage:
#   sstorytime/cone-path.sh -begin "<keyword>" -end "<keyword>" [-chapter "<chapter>"] [-bwd]
#
# -begin/-end match via Postgres full-text search (tsquery) against node
# text, confirmed by reading pkg/SSTorytime/postgres_retrieval.go — that
# means a short keyword substring, not the full literal sentence a node
# actually contains. A full-sentence -begin/-end returns "No paths
# available" even when a path genuinely exists (confirmed directly: it
# fails silently, at the node-lookup step, before any path search runs).
#
# Example, against sstorytime/fixtures/sample_export.n4l once ingested:
#   sstorytime/cone-path.sh -chapter "epistemic export" -begin "pelvic" -end "fascial"
# ============================================================================
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOCAL="$HERE/.local"

[ -f "$LOCAL/env.sh" ] || { echo "[cone-path] ERROR: sstorytime/setup.sh hasn't been run yet (no $LOCAL/env.sh)." >&2; exit 1; }
# shellcheck source=/dev/null
source "$LOCAL/env.sh"

if [ "$#" -eq 0 ]; then
  "$SST_BIN/pathsolve.exe" -h 2>&1 || true
  exit 0
fi

"$SST_BIN/pathsolve.exe" "$@"
