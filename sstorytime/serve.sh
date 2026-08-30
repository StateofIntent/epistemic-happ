#!/usr/bin/env bash
# ============================================================================
# sstorytime/serve.sh — graph visualization server.
#
# Resolves README.md §9 Phase 2's "3D graph visualization of critique
# manifold". "3D" here is semantic spacetime's own (domain, modality,
# time) coordinate space (§2.2), not literal WebGL — SSTorytime's actual
# rendering is an HTML5 canvas-based graph browser (confirmed by reading
# cmd/server/public/main.js), which is what this script launches, pointed
# at whatever this agent has ingested via ingest.sh.
#
# Usage:
#   sstorytime/serve.sh [-http :8080] [-https :8443]
#
# Then open http://localhost:8080/ (redirects to https://localhost:8443/,
# which will show a self-signed-certificate browser warning — expected
# for a local instance, accept it to continue).
# ============================================================================
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOCAL="$HERE/.local"

[ -f "$LOCAL/env.sh" ] || { echo "[serve] ERROR: sstorytime/setup.sh hasn't been run yet (no $LOCAL/env.sh)." >&2; exit 1; }
# shellcheck source=/dev/null
source "$LOCAL/env.sh"

RESOURCES_DIR="$LOCAL/resources"
mkdir -p "$RESOURCES_DIR"

echo "[serve] Starting http_server (resources=$RESOURCES_DIR, cert=$SST_CERT_DIR) ..."
echo "[serve] Ctrl+C to stop."
"$SST_BIN/http_server.exe" \
  -resources "$RESOURCES_DIR" \
  -cert "$SST_CERT_DIR/cert.pem" \
  -key "$SST_CERT_DIR/key.pem" \
  "$@"
