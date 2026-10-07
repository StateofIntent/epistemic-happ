#!/usr/bin/env bash
# =============================================================================
# ONE CONDUCTOR, POINTED AT PUBLIC INFRASTRUCTURE RATHER THAN LOCALHOST.
#
# WHY THIS EXISTS AND WHY IT IS NOT PART OF `network.sh`. README has recorded
# for a long time that "cross-internet peer discovery is the one thing this
# project has never been able to test", and INSTALL.md repeats it to first-time
# users. Every verification here runs on one machine: `sandbox.sh` is a single
# conductor, and `network.sh` runs three or four of them against a bootstrap
# server and iroh relay on 127.0.0.1. Two conductors that find each other over
# loopback have demonstrated nothing about two conductors on different
# continents finding each other at all.
#
# `network.sh` is load-bearing for every harness in `scripts/live-verify/`, and
# threading public-infrastructure overrides through its clean/start/stop/census
# machinery would put all of them at risk to serve one experiment. So this is a
# separate, deliberately small script: generate ONE node, start it, wait for its
# ports. Nothing else.
#
# WHAT MAKES IT A REAL TEST. `hc sandbox generate` already takes the bootstrap
# and relay as arguments — `network -b <bootstrap> quic <relay>` — so pointing
# them at the public services is not a hack, it is the documented parameter.
# The defaults below are Holochain 0.7.0's OWN defaults, read out of
# `holochain_conductor_api-0.7.0/src/config/conductor.rs`:
#
#   bootstrap_url: https://dev-test-bootstrap2.holochain.org
#   relay_url:     https://use1-1.relay.n0.iroh-canary.iroh.link./
#
# So a node started by this script joins the network through exactly the path a
# user installing the `.webhapp` would, which is the thing never tested.
#
# AND WHY A NETWORK SEED IS MANDATORY HERE, which is the one decision in this
# file that is about safety rather than mechanism. The shipped `.happ` declares
# NO network seed, so every installer lands on one shared DHT — README says so
# in as many words. Running this test on that DHT would write test entries into
# the network real users join, and **Invariant #6 means they could never be
# removed**. A required, caller-supplied seed puts each run on its own DHT:
# still a genuine crossing of the public internet through public rendezvous
# infrastructure, with nothing written where it cannot be taken back.
#
# Usage:
#   scripts/cross-internet-node.sh start <seed> [admin-port] [app-port]
#   scripts/cross-internet-node.sh stop
#
# Env:
#   EPI_XNET_ROOT        state dir            (default /tmp/epi-xnet)
#   EPI_XNET_BOOTSTRAP   bootstrap URL        (default 0.7.0's own)
#   EPI_XNET_RELAY       iroh relay URL       (default 0.7.0's own)
#   EPI_HAPP_PATH        .happ to install     (default the repo's)
# =============================================================================
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NET_ROOT="${EPI_XNET_ROOT:-/tmp/epi-xnet}"
HAPP_PATH="${EPI_HAPP_PATH:-$REPO_ROOT/epistemic-resonance-happ.happ}"
BOOTSTRAP_URL="${EPI_XNET_BOOTSTRAP:-https://dev-test-bootstrap2.holochain.org}"
RELAY_URL="${EPI_XNET_RELAY:-https://use1-1.relay.n0.iroh-canary.iroh.link./}"
PASSPHRASE="${HC_SANDBOX_PASSPHRASE:-sandbox-dev-passphrase-1234}"
APP_ID="epistemic-xnet"
NODE="nodeX"

log() { printf '[xnet] %s\n' "$*"; }
fail() { printf '[xnet] ERROR: %s\n' "$*" >&2; exit 1; }

find_bin() {
  local name="$1"
  if command -v "$name" >/dev/null 2>&1; then command -v "$name"
  elif [ -x "$HOME/.cargo/bin/$name" ]; then echo "$HOME/.cargo/bin/$name"
  else fail "$name not found on PATH or in ~/.cargo/bin."; fi
}

port_up() { (exec 3<>"/dev/tcp/127.0.0.1/$1") >/dev/null 2>&1; }
wait_for_port() {
  local port="$1" tries="${2:-120}"
  while [ "$tries" -gt 0 ]; do port_up "$port" && return 0; sleep 1; tries=$((tries - 1)); done
  return 1
}

cmd_stop() {
  if [ -f "$NET_ROOT/$NODE.pid" ]; then
    local pid; pid="$(cat "$NET_ROOT/$NODE.pid")"
    log "Stopping $NODE (pid $pid) ..."
    kill -TERM "-$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true
    sleep 2
  fi
  rm -rf "$NET_ROOT"
  log "Stopped and cleaned $NET_ROOT."
}

cmd_start() {
  local seed="${1:-}" admin="${2:-9899}" app="${3:-9898}"
  # REQUIRED, not defaulted — see the header. A missing seed would silently put
  # this on the DHT that real installers share, and Invariant #6 means whatever
  # it wrote would stay there.
  [ -n "$seed" ] || fail "a network seed is REQUIRED. Without one this joins the DHT that every \
installer of the shipped .webhapp shares, and Invariant #6 means any entry written there can never \
be removed. Pass a run-unique seed."
  [ -f "$HAPP_PATH" ] || fail "no .happ at $HAPP_PATH — build and pack it first."

  local HC_BIN HOLOCHAIN_BIN
  HC_BIN="$(find_bin hc)"; HOLOCHAIN_BIN="$(find_bin holochain)"

  rm -rf "$NET_ROOT"; mkdir -p "$NET_ROOT"
  log "bootstrap: $BOOTSTRAP_URL"
  log "relay:     $RELAY_URL"
  log "seed:      $seed   (isolates this run from the shipped network)"

  # `-r` is deliberately NOT used: generate writes the config, then `run`
  # starts it, the same two-step `network.sh` uses.
  log "Generating $NODE (admin :$admin, app :$app) ..."
  ( cd "$NET_ROOT" && echo "$PASSPHRASE" | "$HC_BIN" sandbox -H "$HOLOCHAIN_BIN" --piped \
      generate -a "$APP_ID" --in-process-lair --root "$NET_ROOT" -d "$NODE" \
      -s "$seed" "$HAPP_PATH" \
      network -b "$BOOTSTRAP_URL" quic "$RELAY_URL" >> "$NET_ROOT/$NODE.log" 2>&1 )
  [ -d "$NET_ROOT/$NODE" ] || fail "$NODE was not generated. Log tail:$(echo; tail -n 30 "$NET_ROOT/$NODE.log")"

  # CONFIRM THE CONFIG ACTUALLY NAMES THE PUBLIC SERVICES. An entry the
  # conductor does not recognise is discarded in silence, and a node quietly
  # left on a localhost bootstrap would find no peers and look exactly like a
  # failed crossing — the strongest available false negative.
  local cfg="$NET_ROOT/$NODE/conductor-config.yaml"
  grep -qF "$BOOTSTRAP_URL" "$cfg" \
    || fail "$cfg does not name $BOOTSTRAP_URL. The generated shape changed; a node on the wrong \
bootstrap would report a failed crossing that never happened."
  grep -qiE '^\s*relay_url:' "$cfg" \
    || fail "$cfg has no relay_url. Same reason: silence here is indistinguishable from no peers."
  log "config names the public bootstrap — checked, not assumed."

  local gidx
  gidx="$(grep -nxF "$NET_ROOT/$NODE" "$NET_ROOT/.hc" 2>/dev/null | head -n1 | cut -d: -f1)"
  [ -n "$gidx" ] || fail "$NODE generated but absent from $NET_ROOT/.hc."
  gidx=$((gidx - 1))

  log "Starting $NODE ..."
  ( cd "$NET_ROOT" && echo "$PASSPHRASE" | setsid --fork "$HC_BIN" sandbox -H "$HOLOCHAIN_BIN" --piped -f="$admin" \
      run "$gidx" -p="$app" >> "$NET_ROOT/$NODE.log" 2>&1 )
  pgrep -f "sandbox .*-f=$admin" | head -1 > "$NET_ROOT/$NODE.pid" 2>/dev/null || true

  if ! wait_for_port "$admin" 120 || ! wait_for_port "$app" 120; then
    log "$NODE did not come up within 120s. Log tail:"; tail -n 40 "$NET_ROOT/$NODE.log" >&2 || true
    exit 1
  fi
  log "$NODE up — admin ws://localhost:$admin  app ws://localhost:$app  app-id $APP_ID"
}

case "${1:-}" in
  start) shift; cmd_start "$@" ;;
  stop)  cmd_stop ;;
  *) fail "usage: $0 start <seed> [admin-port] [app-port] | stop" ;;
esac
