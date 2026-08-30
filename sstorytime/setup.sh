#!/usr/bin/env bash
# ============================================================================
# sstorytime/setup.sh — stand up a local SSTorytime instance for one agent.
#
# Resolves README.md §9 Phase 2's "Local SSTorytime instance per agent" and
# the build half of "N4L ingestion pipeline". Clones and builds the real
# SSTorytime toolchain (N4L compiler, http_server, pathsolve) and merges
# this repo's n4l/arrows-epistemic.sst into it, exactly as verified
# end-to-end in README.md §5.2. Does NOT install Go, PostgreSQL, or
# openssl — those are real system-level installs this script deliberately
# leaves to the operator (see README.md §6.1-style prerequisites below),
# the same judgment call this project already made for its own
# prerequisites list.
#
# Prerequisites (checked, not installed):
#   - go        (https://go.dev/dl/)
#   - psql      (a running PostgreSQL server this agent controls)
#   - openssl   (for the server's self-signed TLS cert)
#
# Everything this script creates is a rebuildable artifact under
# sstorytime/.local/ (gitignored) — safe to delete and rerun.
#
# Usage:
#   sstorytime/setup.sh                    # clone+build+configure+db setup
#   PGUSER=... PGPASSWORD=... PGDATABASE=... sstorytime/setup.sh   # override DB creds
# ============================================================================
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$HERE/.." && pwd)"
LOCAL="$HERE/.local"
SRC="$LOCAL/src"
BIN="$LOCAL/bin"
CONFIG="$LOCAL/SSTconfig"
CERT_DIR="$LOCAL/cert"

# Pinned for reproducibility — the exact commit this pipeline was verified
# against in README.md §5.2. Bump deliberately, re-verify after bumping.
SSTORYTIME_COMMIT="a9b34d5197cb0a9fb586bc4722eb8153dffaf044"
SSTORYTIME_REPO="https://github.com/markburgess/SSTorytime.git"

PGHOST="${PGHOST:-127.0.0.1}"
PGPORT="${PGPORT:-5432}"
PGUSER="${PGUSER:-sstoryline}"
PGPASSWORD="${PGPASSWORD:-sst_1234}"
PGDATABASE="${PGDATABASE:-sstoryline}"
# Superuser creds, used only to create the role/db above if they don't
# already exist. Not needed if PGUSER/PGDATABASE already exist.
PG_ADMIN_USER="${PG_ADMIN_USER:-postgres}"
PG_ADMIN_PASSWORD="${PG_ADMIN_PASSWORD:-}"

log() { echo "[setup] $*"; }
fail() { echo "[setup] ERROR: $*" >&2; exit 1; }

# --- 1. Check prerequisites -------------------------------------------------

command -v go >/dev/null 2>&1 || fail "go not found on PATH. Install from https://go.dev/dl/ and re-run."
command -v psql >/dev/null 2>&1 || fail "psql not found on PATH. Install PostgreSQL and re-run."
command -v openssl >/dev/null 2>&1 || fail "openssl not found on PATH (needed for the server's TLS cert)."
command -v git >/dev/null 2>&1 || fail "git not found on PATH."

log "go: $(go version)"
log "psql: $(psql --version)"

# --- 2. Clone SSTorytime at the pinned commit -------------------------------

mkdir -p "$LOCAL"
if [ ! -d "$SRC/.git" ]; then
  log "Cloning SSTorytime into $SRC ..."
  git clone "$SSTORYTIME_REPO" "$SRC"
else
  log "SSTorytime source already present at $SRC"
fi

CURRENT_COMMIT="$(cd "$SRC" && git rev-parse HEAD)"
if [ "$CURRENT_COMMIT" != "$SSTORYTIME_COMMIT" ]; then
  log "Checking out pinned commit $SSTORYTIME_COMMIT (was $CURRENT_COMMIT)..."
  (cd "$SRC" && git fetch origin && git checkout "$SSTORYTIME_COMMIT")
fi

# --- 3. Build the three binaries this pipeline needs ------------------------

mkdir -p "$BIN"
log "Building N4L ..."
(cd "$SRC/cmd/N4L" && go build -o "$BIN/N4L.exe" .)
log "Building pathsolve ..."
(cd "$SRC/cmd/pathsolve" && go build -o "$BIN/pathsolve.exe" .)
log "Building http_server (embeds its own UI assets, must build from cmd/server) ..."
(cd "$SRC/cmd/server" && go build -o "$BIN/http_server.exe" .)

# --- 4. Generate a self-signed TLS cert for http_server ---------------------
# http_server.go's HTTPS goroutine calls log.Fatalf (kills the whole
# process) if cert/key are missing — confirmed by reading the source, not
# assumed. Generating them up front avoids that failure mode entirely.

mkdir -p "$CERT_DIR"
if [ ! -f "$CERT_DIR/cert.pem" ] || [ ! -f "$CERT_DIR/key.pem" ]; then
  log "Generating self-signed TLS cert for the local server ..."
  # MSYS2_ARG_CONV_EXCL=/CN= stops Git Bash's automatic POSIX-to-Windows
  # path conversion from mangling "-subj /CN=localhost" specifically,
  # while leaving -keyout/-out's real paths converted normally (a blanket
  # MSYS_NO_PATHCONV=1 was tried first and broke those instead — confirmed
  # by hitting both failure modes directly).
  MSYS2_ARG_CONV_EXCL="/CN=" openssl req -x509 -newkey rsa:4096 \
    -keyout "$CERT_DIR/key.pem" -out "$CERT_DIR/cert.pem" \
    -days 365 -nodes -subj "/CN=localhost"
else
  log "TLS cert already present at $CERT_DIR"
fi

# --- 5. Merge n4l/arrows-epistemic.sst into a fresh SSTconfig --------------
# Rebuilt from scratch every run (never appended-to in place) so this step
# stays idempotent — see the comment on this exact hazard in
# n4l/arrows-epistemic.sst's own header.

log "Merging n4l/arrows-epistemic.sst into a fresh SSTconfig ..."
rm -rf "$CONFIG"
mkdir -p "$CONFIG"
cp "$SRC/SSTconfig/"*.sst "$CONFIG/"

EPISTEMIC_ARROWS="$REPO_ROOT/n4l/arrows-epistemic.sst"
[ -f "$EPISTEMIC_ARROWS" ] || fail "n4l/arrows-epistemic.sst not found at $EPISTEMIC_ARROWS"

merge_section() {
  local section="$1" target_file="$2"
  local body
  body="$(awk -v sec="$section" '
    $0 == "- " sec { found=1; next }
    found && /^- / { exit }
    found { print }
  ' "$EPISTEMIC_ARROWS")"
  # Trim leading/trailing blank lines from the extracted body so the merge
  # doesn'\''t accumulate stray blank runs across reruns.
  body="$(printf '%s\n' "$body" | sed -e '/./,$!d' -e ':a' -e '/^\n*$/{$d;N;ba' -e '}')"
  {
    echo ""
    echo "    :: epistemic ::"
    echo ""
    printf '%s\n' "$body"
  } >> "$CONFIG/$target_file"
}

merge_section "leadsto" "arrows-LT-1.sst"
merge_section "contains" "arrows-CN-2.sst"
merge_section "properties" "arrows-EP-3.sst"

log "Merged leadsto/contains/properties sections into $CONFIG"

# --- 6. Create the sstoryline Postgres role/database (idempotent) ----------

ROLE_EXISTS="$(PGPASSWORD="$PG_ADMIN_PASSWORD" psql -h "$PGHOST" -p "$PGPORT" -U "$PG_ADMIN_USER" -tAc \
  "SELECT 1 FROM pg_roles WHERE rolname='$PGUSER'" 2>/dev/null || true)"
if [ "$ROLE_EXISTS" != "1" ]; then
  log "Creating role '$PGUSER' ..."
  PGPASSWORD="$PG_ADMIN_PASSWORD" psql -h "$PGHOST" -p "$PGPORT" -U "$PG_ADMIN_USER" \
    -c "CREATE ROLE $PGUSER WITH LOGIN PASSWORD '$PGPASSWORD' SUPERUSER;"
else
  log "Role '$PGUSER' already exists"
fi

DB_EXISTS="$(PGPASSWORD="$PG_ADMIN_PASSWORD" psql -h "$PGHOST" -p "$PGPORT" -U "$PG_ADMIN_USER" -tAc \
  "SELECT 1 FROM pg_database WHERE datname='$PGDATABASE'" 2>/dev/null || true)"
if [ "$DB_EXISTS" != "1" ]; then
  log "Creating database '$PGDATABASE' ..."
  PGPASSWORD="$PG_ADMIN_PASSWORD" psql -h "$PGHOST" -p "$PGPORT" -U "$PG_ADMIN_USER" \
    -c "CREATE DATABASE $PGDATABASE OWNER $PGUSER;"
else
  log "Database '$PGDATABASE' already exists"
fi

# --- 7. Write a local env file the other scripts source --------------------

cat > "$LOCAL/env.sh" <<EOF
# Generated by setup.sh — sourced by ingest.sh / serve.sh / cone-path.sh.
export SST_LOCAL="$LOCAL"
export SST_BIN="$BIN"
export SST_CONFIG_PATH="$CONFIG"
export SST_CERT_DIR="$CERT_DIR"
export POSTGRESQL_URI="postgresql://$PGUSER:$PGPASSWORD@$PGHOST:$PGPORT/$PGDATABASE?sslmode=disable"
EOF

log "Done. Local instance ready under $LOCAL"
log "Next: sstorytime/ingest.sh sstorytime/fixtures/sample_export.n4l"
