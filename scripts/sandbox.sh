#!/usr/bin/env bash
# ============================================================================
# scripts/sandbox.sh — bring up / tear down a local hc sandbox conductor.
#
# Replaces README.md §6.6's `hc run -p 8888`, which does not work against
# any `hc` version this project has actually installed (0.4.4) — `hc run`
# is not a real subcommand; the real one is `hc sandbox`. This script
# exists because getting a conductor running at all took several real,
# confirmed false starts the first time this was done by hand (see
# README.md's Phase 2 changelog entry on live-conductor verification):
#
#   - `hc` looks for a `holochain` binary on PATH by default and fails with
#     a bare "No such file or directory" if it isn't there. This project's
#     install puts both `hc` and `holochain` in ~/.cargo/bin, which is not
#     on PATH by default in every shell — resolved here via `-H`
#     (--holochain-path) rather than mutating the caller's PATH.
#   - A standalone `lair-keystore` binary is not part of the `hc`/
#     `holochain` release artifacts and was never separately installed —
#     `hc sandbox generate` fails with "Failed to execute
#     'lair-keystore init': No such file or directory" without it. Worked
#     around via `--in-process-lair` (an embedded lair server), rather
#     than requiring a second binary install.
#   - `-f`/`--force-admin-ports` is a GLOBAL `hc sandbox` flag and errors
#     as an unrecognized argument if placed after `generate`/`run`
#     instead of before. `--piped` is the opposite split: for
#     `generate`/`run` it must go BEFORE the subcommand (global position);
#     for `zome-call-auth`/`zome-call` it must go AFTER the subcommand
#     name (those redefine their own local `--piped`, which the global
#     one does not propagate into) — confirmed directly by hitting both
#     wrong orderings and getting either a clap parse error or a hung
#     interactive passphrase prompt (`Error: Failed to get passphrase`
#     when stdin isn't a tty).
#   - Resuming an existing sandbox via `hc sandbox run -l` restores its
#     already-persisted app interface (the same port passed to `generate
#     -r=...` the first time) without needing to pass a port again —
#     confirmed by checking with `ss` after a bare `run -l`, not assumed
#     from the (misleadingly empty) `app_ports` field hc-sandbox itself
#     logs at that instant.
#   - `hc sandbox run`/`generate` hands off to the real `holochain`
#     binary and then EXITS ON ITS OWN almost immediately — it does not
#     stay alive as a supervising parent. `$!` right after backgrounding
#     it therefore captures a process that's already gone (reparented to
#     init) by the time anything needs a PID to stop later. Confirmed
#     directly, the expensive way: an earlier version of this script
#     recorded that PID anyway, `stop` then killed a process that no
#     longer existed, and the real `holochain` server was left running
#     and still bound to the ports — so the *next* `start` silently
#     reattached its port-liveness check to that orphan's stale DHT data
#     instead of ever starting a genuinely fresh conductor
#     (`wait_for_ports` below only checks that *something* answers on
#     the port, which a leaked old process satisfies just as well as a
#     new one). Fixed by finding the real `holochain` process afterward,
#     by matching its own `--config-path`, once the ports confirm it's
#     actually up — see `start`'s `real_pid` below.
#
# Admin port, app port, and app id below are chosen to match
# bridge/.env.example's HOLOCHAIN_ADMIN_URL / HOLOCHAIN_URL /
# HOLOCHAIN_APP_ID defaults exactly, so the bridge's own defaults work
# against this sandbox with no .env edits beyond adding Twitter creds.
#
# Usage:
#   scripts/sandbox.sh start    # generate (first run) or resume (later
#                                # runs) a conductor in the background
#   scripts/sandbox.sh stop     # stop the background conductor
#   scripts/sandbox.sh status   # report whether it's up, and on what ports
#   scripts/sandbox.sh clean    # stop + hc sandbox clean (deletes all
#                                # sandbox state — DHT data included)
# ============================================================================
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$HERE/.." && pwd)"

HAPP_PATH="$REPO_ROOT/epistemic-resonance-happ.happ"
APP_ID="epistemic-resonance-happ"    # must match bridge/.env.example's HOLOCHAIN_APP_ID
ADMIN_PORT="8889"                    # must match bridge/.env.example's HOLOCHAIN_ADMIN_URL
APP_PORT="8888"                      # must match bridge/.env.example's HOLOCHAIN_URL

PIDFILE="$REPO_ROOT/.hc_sandbox.pid"
LOGFILE="$REPO_ROOT/.hc_sandbox.log"

# Dev-only keystore passphrase — this sandbox's DHT data is throwaway local
# state (see `clean` above), not a real deployment, so a fixed, documented
# passphrase is fine here. Override with HC_SANDBOX_PASSPHRASE if you want
# a different one.
PASSPHRASE="${HC_SANDBOX_PASSPHRASE:-sandbox-dev-passphrase-1234}"

log() { echo "[sandbox] $*"; }
fail() { echo "[sandbox] ERROR: $*" >&2; exit 1; }

# --- Resolve hc/holochain binaries, PATH or ~/.cargo/bin --------------------

find_bin() {
  local name="$1"
  if command -v "$name" >/dev/null 2>&1; then
    command -v "$name"
  elif [ -x "$HOME/.cargo/bin/$name" ]; then
    echo "$HOME/.cargo/bin/$name"
  else
    fail "$name not found on PATH or in ~/.cargo/bin. Install the Holochain toolchain (README.md §6.1) and re-run."
  fi
}

HC_BIN="$(find_bin hc)"
HOLOCHAIN_BIN="$(find_bin holochain)"

is_running() {
  [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null
}

wait_for_ports() {
  local tries=30
  while [ "$tries" -gt 0 ]; do
    if (exec 3<>"/dev/tcp/127.0.0.1/$ADMIN_PORT") 2>/dev/null && (exec 4<>"/dev/tcp/127.0.0.1/$APP_PORT") 2>/dev/null; then
      exec 3>&- 4>&- 2>/dev/null || true
      return 0
    fi
    sleep 1
    tries=$((tries - 1))
  done
  return 1
}

cmd="${1:-}"
case "$cmd" in

  start)
    if is_running; then
      log "Already running (pid $(cat "$PIDFILE")). Try: scripts/sandbox.sh status"
      exit 0
    fi
    rm -f "$PIDFILE"

    # `hc sandbox generate` APPENDS its new sandbox path to .hc rather
    # than replacing the file, so the current sandbox is its LAST line,
    # not its first. Reading the first line instead resolved a stale
    # path from an earlier session — which made `start` either try to
    # resume a sandbox that no longer exists, or (once ports were up)
    # look for the conductor's PID under the wrong --config-path, fail
    # to find it, exit non-zero, and leave the real conductor running
    # with no PIDFILE recording it: exactly the orphan-process leak this
    # script's header describes fixing the first time. Observed for
    # real, so read the last line everywhere .hc is consulted.
    if [ -f "$REPO_ROOT/.hc" ] && [ -d "$(tail -n1 "$REPO_ROOT/.hc")" ]; then
      log "Resuming existing sandbox ($(tail -n1 "$REPO_ROOT/.hc")) ..."
      ( cd "$REPO_ROOT" && \
        echo "$PASSPHRASE" | "$HC_BIN" sandbox -H "$HOLOCHAIN_BIN" --piped -f="$ADMIN_PORT" run -l \
          > "$LOGFILE" 2>&1 & )
    else
      [ -f "$HAPP_PATH" ] || fail "No .happ bundle at $HAPP_PATH. Build it first (README.md §6.2-6.3: cargo build --release --target wasm32-unknown-unknown in dna/integrity and dna/coordinator, then hc dna pack dna/ && hc app pack .)."
      log "No existing sandbox found — generating a fresh one from $HAPP_PATH ..."
      ( cd "$REPO_ROOT" && \
        echo "$PASSPHRASE" | "$HC_BIN" sandbox -H "$HOLOCHAIN_BIN" --piped -f="$ADMIN_PORT" generate \
          -a "$APP_ID" -r="$APP_PORT" --in-process-lair "$HAPP_PATH" \
          > "$LOGFILE" 2>&1 & )
    fi

    log "Waiting for admin ($ADMIN_PORT) and app ($APP_PORT) ports ..."
    if ! wait_for_ports; then
      log "Conductor did not come up within 30s. Log tail:"
      tail -n 30 "$LOGFILE" >&2 || true
      exit 1
    fi

    # `hc sandbox run`/`generate` (backgrounded above) hands off to the
    # real `holochain` binary and exits on its own almost immediately —
    # `$!` above would capture that short-lived wrapper, which is long
    # gone (reparented to init) by the time `stop` needs a PID to kill.
    # The actual long-running server has to be found by matching its own
    # --config-path instead, once ports confirm it's actually up.
    sandbox_dir="$(tail -n1 "$REPO_ROOT/.hc")"
    real_pid="$(pgrep -f "holochain .*--config-path $sandbox_dir/conductor-config.yaml" | head -n1)"
    [ -n "$real_pid" ] || fail "Ports came up but couldn't find the holochain process (looked for --config-path $sandbox_dir/conductor-config.yaml). Log tail:$(echo; tail -n 30 "$LOGFILE")"
    echo "$real_pid" > "$PIDFILE"

    log "Conductor ready (pid $real_pid)."
    log "  HOLOCHAIN_ADMIN_URL=ws://localhost:$ADMIN_PORT"
    log "  HOLOCHAIN_URL=ws://localhost:$APP_PORT"
    log "  HOLOCHAIN_APP_ID=$APP_ID"
    log "(these match bridge/.env.example's defaults exactly)"
    log "Next, to make CLI zome calls: echo \"$PASSPHRASE\" | hc sandbox zome-call-auth --piped $APP_ID"
    ;;

  stop)
    if ! is_running; then
      log "Not running."
      exit 0
    fi
    pid="$(cat "$PIDFILE")"
    log "Stopping (pid $pid) ..."
    # $PIDFILE holds the real `holochain` process's own PID (found via
    # pgrep in `start`, above) — not the short-lived `hc sandbox`
    # wrapper's, which exits on its own almost immediately after
    # handing off to it. Killing the wrapper's PID here would silently
    # do nothing to the actual running server.
    kill "$pid" 2>/dev/null || true
    for _ in $(seq 1 10); do
      kill -0 "$pid" 2>/dev/null || break
      sleep 1
    done
    kill -0 "$pid" 2>/dev/null && kill -9 "$pid" 2>/dev/null || true
    rm -f "$PIDFILE"
    log "Stopped."
    ;;

  status)
    if is_running; then
      log "Running (pid $(cat "$PIDFILE"))."
      if wait_for_ports; then
        log "Ports $ADMIN_PORT (admin) and $APP_PORT (app) are up."
      else
        log "WARNING: process is alive but ports aren't responding yet/anymore."
      fi
    else
      log "Not running."
    fi
    ;;

  clean)
    "$HERE/sandbox.sh" stop
    log "Removing sandbox state (hc sandbox clean) ..."
    ( cd "$REPO_ROOT" && "$HC_BIN" sandbox clean ) || true
    rm -f "$REPO_ROOT/.hc" "$REPO_ROOT/.hc_auth" "$REPO_ROOT"/.hc_live_* "$LOGFILE"
    log "Clean. Next 'start' will generate a fresh sandbox with empty DHT state."
    ;;

  *)
    echo "Usage: scripts/sandbox.sh {start|stop|status|clean}" >&2
    exit 1
    ;;
esac
