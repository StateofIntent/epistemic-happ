#!/usr/bin/env bash
# =============================================================================
# scripts/swarm.sh — a conductor on a DHT THAT EXISTS ONLY FOR THIS RUN.
#
# READINESS item 11 wants "a deliberate minority of observers with looser
# thresholds and unusual CritiqueSpecies preferences". Running them is the row
# itself. This script is the containment that makes running them reversible.
#
# WHY A SCRATCH DHT IS NOT OPTIONAL. Invariant 6: nothing is deleted, by
# anybody, ever — the capability is absent from the integrity zome, not merely
# unexposed. So everything a swarm writes is permanent on whatever network it
# writes to. And item 11's own finding is that exploration cannot be told from
# degradation at the time of writing: adoption is visible only later, which
# means a swarm's output is judged after it is already irreversible.
#
# Those two facts together say a first swarm must not touch a graph anybody
# cares about. A fresh network seed gives a different DNA hash, which IS a
# different DHT — the same mechanism `network.sh`'s nodeC uses as its isolation
# control, where "different seed" is what makes the control a control.
#
# THE SEED IS MINTED PER RUN AND RECORDED, and the driver REFUSES to write to a
# conductor whose DNA hash is not the one in that record. A flag saying "yes I
# meant it" would be a convention; this is a check — point the swarm at the
# ordinary sandbox and it stops, because the hash does not match.
#
# Ports are 9400/9401, clear of sandbox.sh (8888-8889), network.sh (8890-8899)
# and the scale nodes (9200+).
#
# Usage:
#   scripts/swarm.sh start [agents]   # default 5
#   scripts/swarm.sh stop
#   scripts/swarm.sh clean            # stop and DESTROY the scratch DHT
#   scripts/swarm.sh status
# =============================================================================
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ROOT="${EPI_SWARM_ROOT:-/tmp/epi-swarm}"
HAPP_PATH="${EPI_HAPP_PATH:-$REPO_ROOT/epistemic-resonance-happ.happ}"
HC_BIN="${EPI_HC_BIN:-$HOME/.cargo/bin/hc}"
HOLOCHAIN_BIN="${EPI_HOLOCHAIN_BIN:-$HOME/.cargo/bin/holochain}"
ADMIN_PORT="${EPI_SWARM_ADMIN:-9400}"
APP_PORT="${EPI_SWARM_APP:-9401}"
# Its own bootstrap, on its own port. The swarm's agents all live on ONE
# conductor, but Holochain still wants a network config — and pointing a
# scratch DHT at the public bootstrap would ANNOUNCE a network whose whole
# purpose is to be disposable. 9402 is clear of sandbox.sh's 8887.
BOOT_PORT="${EPI_SWARM_BOOT:-9402}"
BOOT_URL="http://127.0.0.1:$BOOT_PORT"
K2_BOOT_BIN="${EPI_K2_BOOT_BIN:-$HOME/.cargo/bin/kitsune2-bootstrap-srv}"
BOOT_PIDFILE="$ROOT/bootstrap.pid"
PASSPHRASE="swarm-scratch-passphrase"
STATE="$ROOT/swarm.json"
PIDFILE="$ROOT/conductor.pid"

log() { echo "[swarm] $*"; }
fail() { log "ERROR: $*"; exit 1; }

cmd="${1:-}"; shift || true

case "$cmd" in
  start)
    agents="${1:-5}"
    [ -f "$HAPP_PATH" ] || fail "no .happ at $HAPP_PATH — run scripts/pack-webhapp.sh"
    command -v "$HC_BIN" >/dev/null 2>&1 || [ -x "$HC_BIN" ] || fail "hc not found at $HC_BIN"

    if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
      log "already running (pid $(cat "$PIDFILE")). 'stop' or 'clean' first."
      exit 0
    fi

    mkdir -p "$ROOT"
    # MINTED, NOT FIXED. A constant seed would make every swarm run share one
    # DHT, so run 2 would inherit run 1's permanent output — which is exactly
    # the accumulation this script exists to prevent.
    seed="swarm-scratch-$(date +%s)-$$"
    log "Minting a scratch DHT with seed \"$seed\" ..."
    log "  This is a network that has never existed before and will not be"
    log "  reachable from any other. Nothing written here touches a real graph."

    if ! ss -ltn 2>/dev/null | grep -q ":$BOOT_PORT "; then
      log "Starting this swarm's own bootstrap/relay on :$BOOT_PORT ..."
      ( cd "$ROOT" && setsid --fork "$K2_BOOT_BIN" --listen "127.0.0.1:$BOOT_PORT" \
          < /dev/null > "$ROOT/bootstrap.log" 2>&1 )
      for _ in $(seq 1 30); do ss -ltn 2>/dev/null | grep -q ":$BOOT_PORT " && break; sleep 1; done
      ss -ltn 2>/dev/null | grep -q ":$BOOT_PORT " || fail "bootstrap never came up on :$BOOT_PORT"
      pgrep -f "kitsune2-bootstrap-srv --listen 127.0.0.1:$BOOT_PORT" > "$BOOT_PIDFILE" 2>/dev/null || true
    fi

    # STATE IS WRITTEN BEFORE THE CONDUCTOR STARTS, because `generate` WITH
    # PORTS DOES NOT RETURN — and that is the thing four attempts at this got
    # wrong. Given `-f` (admin) and `-r` (app), `hc sandbox generate` does not
    # merely write a sandbox: it hands off to `holochain` and holds the
    # foreground, so there is no separate `run` step to reach and the script
    # simply stopped, with a perfectly healthy conductor listening.
    #
    # `sandbox.sh` has always known this — its generate branch backgrounds the
    # whole command with `&` and has no `run` of its own. The lesson is the
    # one this repository keeps relearning in a new costume: READ WHAT THE
    # WORKING SCRIPT DOES before inventing a second way.
    #
    # The three detachment attempts that preceded it, kept because each failed
    # differently and only one was obvious: `( ... & echo $! )` hung on the
    # subshell's stdout; `( ... & )` returned but let the conductor die with
    # the script's process group — a clean launch in the log, then nothing
    # listening; `echo "$P" | setsid --fork` hung again, because the shell
    # waits on the PIPELINE even though setsid itself returns.
    cat > "$STATE" <<EOF
{
  "seed": "$seed",
  "agents": $agents,
  "adminPort": $ADMIN_PORT,
  "appPort": $APP_PORT,
  "appIdPrefix": "epistemic-swarm-",
  "startedAt": "$(date -Iseconds)"
}
EOF
    log "State recorded: $STATE"
    # Backgrounded, exactly as sandbox.sh backgrounds its own generate. This
    # both creates the sandbox AND runs it; there is no second step.
    ( cd "$ROOT" && echo "$PASSPHRASE" | "$HC_BIN" sandbox -H "$HOLOCHAIN_BIN" --piped \
        -f="$ADMIN_PORT" generate -a "epistemic-swarm-0" -r="$APP_PORT" --in-process-lair \
        --root "$ROOT" -d "swarm" -s "$seed" "$HAPP_PATH" \
        network -b "$BOOT_URL" quic "$BOOT_URL" >> "$ROOT/swarm.log" 2>&1 & )

    for _ in $(seq 1 60); do
      ss -ltn 2>/dev/null | grep -q ":$ADMIN_PORT " && break
      sleep 1
    done
    ss -ltn 2>/dev/null | grep -q ":$ADMIN_PORT " \
      || fail "admin port $ADMIN_PORT never came up. Tail:$(echo; tail -n 20 "$ROOT/swarm.log")"
    sleep 4
    pgrep -f "config-path $ROOT" > "$PIDFILE" 2>/dev/null || true

    log "Conductor up on admin :$ADMIN_PORT, app :$APP_PORT"
    log ""
    log "Next: node scripts/swarm/run-swarm.mjs"
    ;;

  stop)
    if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
      log "Stopping conductor (pid $(cat "$PIDFILE")) ..."
      kill "$(cat "$PIDFILE")" 2>/dev/null || true
      sleep 2
      kill -9 "$(cat "$PIDFILE")" 2>/dev/null || true
    fi
    pkill -f "epi-swarm/swarm" 2>/dev/null || true
    if [ -f "$BOOT_PIDFILE" ]; then kill "$(cat "$BOOT_PIDFILE")" 2>/dev/null || true; rm -f "$BOOT_PIDFILE"; fi
    pkill -f "kitsune2-bootstrap-srv --listen 127.0.0.1:$BOOT_PORT" 2>/dev/null || true
    rm -f "$PIDFILE"
    log "Stopped. The scratch DHT's state is kept — 'clean' destroys it."
    ;;

  clean)
    "$0" stop >/dev/null 2>&1 || true
    rm -rf "$ROOT"
    log "Destroyed. The scratch DHT and everything the swarm wrote to it are gone."
    log "That is only possible BECAUSE it was scratch: on a real network"
    log "Invariant 6 means no such command can exist."
    ;;

  status)
    if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
      log "running (pid $(cat "$PIDFILE")) — admin :$ADMIN_PORT, app :$APP_PORT"
      [ -f "$STATE" ] && log "  seed: $(grep -o '"seed": "[^"]*"' "$STATE" | cut -d'"' -f4)"
    else
      log "not running."
    fi
    ;;

  *)
    echo "Usage: scripts/swarm.sh {start [agents]|stop|clean|status}" >&2
    exit 2
    ;;
esac
