#!/usr/bin/env bash
# ============================================================================
# scripts/network.sh — bring up a REAL multi-node Holochain network.
#
# WHY THIS EXISTS, AND HOW IT DIFFERS FROM scripts/sandbox.sh.
#
# `sandbox.sh` starts ONE conductor with no networking at all. That is not
# a configuration choice it makes; it is what `hc sandbox generate`
# produces by default, and the conductor config proves it:
#
#     network:
#       transport_pool: []          # <- no transport. Nothing to gossip over.
#       bootstrap_service: null     # <- no peer discovery. Nobody to gossip to.
#
# Every multi-agent live-verify harness in this project installs its extra
# agents on THAT conductor (`generateAgentPubKey` + `installApp`), so two
# "agents" share one local DHT store and gossip is never exercised — the
# entries are already there, locally, the instant they are written. That is
# the right setup for the questions those harnesses ask (read scope,
# per-agent friction budgets, what one agent can see of another's work),
# and it is silent on the question this script exists to make answerable:
# does an entry written on one node reach a genuinely different node over
# a real network?
#
# README.md has claimed since Phase 1 that "gossip protocol is wave
# propagation — information ripples through the network organically."
# Nothing in this repository had ever run two conductors that could reach
# each other, so that sentence described an untested property. `federation/`
# does run two conductors, but deliberately ones that share NO network —
# the boundary is the point there. This script builds the opposite
# arrangement, and `scripts/live-verify/real-gossip.mjs` is what asks the
# question against it.
#
# WHAT IT BRINGS UP — three conductors, and the third is the control:
#
#   nodeA  admin :8899  app :8898   network seed "netverify-seed-1"
#   nodeB  admin :8897  app :8896   network seed "netverify-seed-1"
#   nodeC  admin :8895  app :8894   network seed "netverify-seed-2-isolated"
#
# plus the bootstrap server on :8893 and the WebRTC signal server on :8892.
#
# A and B share a network seed, so the DNA hashes they install are
# identical and they are on the SAME DHT. C differs in the seed alone —
# same .happ, same code, same bootstrap server, same signal server, same
# machine — so its DNA hash differs and it is on a DIFFERENT DHT. C is
# there so "B received it over the network" cannot be confused with "any
# conductor pointed at these services would have shown it." Without C, a
# harness that only watches B prove positive is an anecdote.
#
# Peer discovery and transport come from `hc run-local-services`, which
# runs a local bootstrap server and a tx5 WebRTC signal server. Both bind
# ephemeral ports and write their real addresses to files, which this
# script reads rather than guessing.
#
# Ports are deliberately 8894-8899, NOT sandbox.sh's 8888/8889, so this
# network and the single-node sandbox can be up at the same time without
# either noticing the other.
#
# ---------------------------------------------------------------------------
# THREE THINGS THAT COST REAL TIME TO FIND, RECORDED SO THEY COST NOBODY
# ELSE ANY:
#
#   - THE SANDBOX ROOT PATH MUST BE SHORT. `--in-process-lair` puts a unix
#     domain socket at <root>/<node>/ks/socket, and unix socket paths are
#     capped by SUN_LEN (~108 bytes). A root under a long path — a
#     per-session scratch directory, for instance — fails at conductor
#     startup with `Failed to spawn Lair keystore in process
#     err={"error":"InvalidInput","message":"path must be shorter than
#     SUN_LEN"}`, followed by holochain's "Well, this is embarrassing."
#     crash-report banner. The error names neither the path nor the root
#     flag, so it reads as a lair bug rather than as a path-length limit.
#     Hence NET_ROOT below defaults to a deliberately short /tmp path, and
#     should stay short if overridden.
#
#   - `.hc` IS WRITTEN TO THE CURRENT WORKING DIRECTORY, and `hc sandbox
#     generate` APPENDS to it. Generating these nodes from the repo root
#     would append three networked sandbox paths to the repo's own `.hc`,
#     whose LAST line is exactly what sandbox.sh reads to decide which
#     sandbox to resume — so the next `sandbox.sh start` would try to
#     resume nodeC instead of its own conductor. This script therefore
#     runs `hc sandbox` with cwd set to $NET_ROOT, giving this network its
#     own `.hc` and leaving the repo's untouched.
#
#   - CLEANUP IS `rm -rf $NET_ROOT`, NEVER `hc sandbox clean`. That
#     subcommand cleans every sandbox listed in the `.hc` it finds, which
#     from the repo root includes sandbox.sh's conductor. Deleting this
#     network must not delete that one.
#
#   - THE BOOTSTRAP AND SIGNAL PORTS MUST BE PINNED, even though
#     `run-local-services` recommends leaving them at 0 to be assigned
#     something free. Its own advice is right for a one-shot run and wrong
#     here, because a conductor's bootstrap and signal URLs are written
#     into its persistent config at GENERATE time. Stop the network,
#     start it again, and the services come back on two different
#     ephemeral ports while the resumed conductors go on dialling the old
#     ones — a network that reports itself fully up, on which nothing ever
#     gossips. Observed exactly that way: three nodes resumed green and
#     were only reachable because the previous run's services happened to
#     still be alive. Fixed ports below make `stop`/`start` mean what it
#     looks like it means. The cost is that these two ports must be free,
#     which is the same contract the conductor ports already have.
#
# NO PID IN THIS SCRIPT IS CAPTURED; EVERY ONE IS FOUND. The `hc sandbox
# run`/`generate` wrapper exits on its own immediately after handing off
# to the real `holochain` binary, so conductor PIDs are found by matching
# each one's own --config-path once its ports answer — the same technique,
# and for the same hard-won reason, as sandbox.sh. The services needed the
# identical treatment for a different reason: `( cd X && nohup Y & )`
# backgrounds the whole `cd && nohup` list, so `$!` names that transient
# subshell rather than `hc`. An earlier version of this script recorded
# `$!`, so `stop` killed a process that had exited milliseconds after
# starting and left the real services running and still bound. That leak
# was invisible while the service ports were ephemeral — every `start`
# got fresh ones, so a leaked predecessor collided with nothing — and
# pinning the ports surfaced it instantly as `AddrInUse`. Found by
# running `clean && start` end to end, not by reading the code.
#
# Usage:
#   scripts/network.sh start     # services + three conductors, from scratch
#   scripts/network.sh stop      # stop everything, keep DHT state
#   scripts/network.sh status    # what is up, on which ports
#   scripts/network.sh clean     # stop + delete all state (fresh next start)
#   scripts/network.sh addrs     # print the bootstrap/signal URLs in use
# ============================================================================
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$HERE/.." && pwd)"

HAPP_PATH="$REPO_ROOT/epistemic-resonance-happ.happ"

# Short by necessity, not by taste — see the SUN_LEN note in the header.
NET_ROOT="${EPI_NET_ROOT:-/tmp/epi-net}"

SHARED_SEED="netverify-seed-1"
ISOLATED_SEED="netverify-seed-2-isolated"

# node:admin:app:app-id:seed
NODES=(
  "nodeA:8899:8898:epistemic-net-a:$SHARED_SEED"
  "nodeB:8897:8896:epistemic-net-b:$SHARED_SEED"
  "nodeC:8895:8894:epistemic-net-c:$ISOLATED_SEED"
)

# Pinned, not ephemeral — see the header. These live just below the
# conductor ports for the same reason those avoid 8888/8889: so the whole
# range this script occupies is contiguous and obvious.
BOOTSTRAP_PORT="${EPI_NET_BOOTSTRAP_PORT:-8893}"
SIGNAL_PORT="${EPI_NET_SIGNAL_PORT:-8892}"

BOOT_ADDR_FILE="$NET_ROOT/bootstrap.addr"
SIG_ADDR_FILE="$NET_ROOT/signal.addr"
SERVICES_LOG="$NET_ROOT/services.log"
SERVICES_PIDFILE="$NET_ROOT/services.pid"

# Same dev-only passphrase as sandbox.sh, and fine for the same reason:
# this is throwaway local state, deleted wholesale by `clean`.
PASSPHRASE="${HC_SANDBOX_PASSPHRASE:-sandbox-dev-passphrase-1234}"

log() { echo "[network] $*"; }
fail() { echo "[network] ERROR: $*" >&2; exit 1; }

find_bin() {
  local name="$1"
  if command -v "$name" >/dev/null 2>&1; then command -v "$name"
  elif [ -x "$HOME/.cargo/bin/$name" ]; then echo "$HOME/.cargo/bin/$name"
  else fail "$name not found on PATH or in ~/.cargo/bin. Install the Holochain toolchain (README.md §6.1) and re-run."
  fi
}

HC_BIN="$(find_bin hc)"
HOLOCHAIN_BIN="$(find_bin holochain)"

port_up() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null && { exec 3>&- 2>/dev/null || true; return 0; }; return 1; }

wait_for_port() {
  local port="$1" tries="${2:-60}"
  while [ "$tries" -gt 0 ]; do
    port_up "$port" && return 0
    sleep 1; tries=$((tries - 1))
  done
  return 1
}

node_pidfile() { echo "$NET_ROOT/$1.pid"; }

node_running() {
  local pf; pf="$(node_pidfile "$1")"
  [ -f "$pf" ] && kill -0 "$(cat "$pf")" 2>/dev/null
}

services_running() {
  [ -f "$SERVICES_PIDFILE" ] && kill -0 "$(cat "$SERVICES_PIDFILE")" 2>/dev/null
}

start_services() {
  if services_running; then
    log "Local bootstrap/signal services already running (pid $(cat "$SERVICES_PIDFILE"))."
    return 0
  fi
  # run-local-services REFUSES to start if either address file already
  # exists ("If the file exists, an error will be returned"), so a stale
  # pair from a previous run is a hard failure rather than an overwrite.
  rm -f "$BOOT_ADDR_FILE" "$SIG_ADDR_FILE"
  log "Starting local bootstrap + WebRTC signal services ..."
  ( cd "$NET_ROOT" && nohup "$HC_BIN" run-local-services \
      --bootstrap-port "$BOOTSTRAP_PORT" --signal-port "$SIGNAL_PORT" \
      --bootstrap-address-path "$BOOT_ADDR_FILE" \
      --signal-address-path "$SIG_ADDR_FILE" \
      > "$SERVICES_LOG" 2>&1 & )

  local tries=30
  while [ "$tries" -gt 0 ]; do
    [ -s "$BOOT_ADDR_FILE" ] && [ -s "$SIG_ADDR_FILE" ] && break
    # A bind failure is reported in the log and never produces an address
    # file, so waiting out the full 30s for it is pure delay. Fail fast
    # and show the reason, which is nearly always a leaked previous run
    # still holding these ports.
    if grep -q "run-local-services error" "$SERVICES_LOG" 2>/dev/null; then
      log "Services failed to start. Log:"
      cat "$SERVICES_LOG" >&2
      fail "If this says AddrInUse, something is still bound to :$BOOTSTRAP_PORT/:$SIGNAL_PORT — check with: pgrep -af run-local-services"
    fi
    sleep 1; tries=$((tries - 1))
  done
  [ -s "$BOOT_ADDR_FILE" ] && [ -s "$SIG_ADDR_FILE" ] \
    || fail "Services did not publish their addresses within 30s. Log tail:$(echo; tail -n 20 "$SERVICES_LOG" 2>/dev/null)"

  # THE PID MUST BE FOUND, NOT CAPTURED. `( cd X && nohup Y ... & )`
  # backgrounds the whole `cd && nohup` list, so `$!` is that transient
  # subshell's PID, not the `hc` process's — the subshell is gone in
  # milliseconds while `hc` keeps running and keeps the ports. Recording
  # `$!` therefore made `stop` kill something already dead and leave the
  # real services alive, which is the exact leak sandbox.sh's header
  # describes for conductors, reproduced here for the services.
  #
  # It stayed invisible for as long as the ports were ephemeral: every
  # `start` got fresh ones, so a leaked predecessor collided with nothing.
  # Pinning the ports (see the header) is what surfaced it, immediately
  # and as `AddrInUse` — a good argument for pinning beyond the resume
  # correctness it was done for. Found by running `clean && start` end to
  # end rather than by reading this function.
  #
  # Matched on the address-path arguments, which contain $NET_ROOT and so
  # cannot match a run-local-services belonging to a different network.
  local pid
  pid="$(pgrep -f "run-local-services .*--bootstrap-address-path $BOOT_ADDR_FILE" | head -n1)"
  [ -n "$pid" ] || fail "Services published their addresses but their process could not be found (looked for --bootstrap-address-path $BOOT_ADDR_FILE)."
  echo "$pid" > "$SERVICES_PIDFILE"

  log "  bootstrap: $(head -n1 "$BOOT_ADDR_FILE")  (pid $pid)"
  log "  signal:    $(head -n1 "$SIG_ADDR_FILE")"
}

start_node() {
  local spec="$1"
  IFS=: read -r name admin app app_id seed <<< "$spec"

  if node_running "$name"; then
    log "$name already running (pid $(cat "$(node_pidfile "$name")"))."
    return 0
  fi

  local boot sig
  boot="$(head -n1 "$BOOT_ADDR_FILE")"
  # The signal file lists both an IPv4 and an IPv6 address; take the first.
  sig="$(head -n1 "$SIG_ADDR_FILE")"

  if [ -d "$NET_ROOT/$name" ]; then
    log "Resuming $name (admin :$admin, app :$app) ..."
    ( cd "$NET_ROOT" && echo "$PASSPHRASE" | "$HC_BIN" sandbox -H "$HOLOCHAIN_BIN" --piped -f="$admin" \
        run -e "$NET_ROOT/$name" > "$NET_ROOT/$name.log" 2>&1 & )
  else
    log "Generating $name (admin :$admin, app :$app, seed \"$seed\") ..."
    ( cd "$NET_ROOT" && echo "$PASSPHRASE" | "$HC_BIN" sandbox -H "$HOLOCHAIN_BIN" --piped -f="$admin" \
        generate -a "$app_id" -r="$app" --in-process-lair --root "$NET_ROOT" -d "$name" \
        -s "$seed" "$HAPP_PATH" \
        network -b "$boot" webrtc "$sig" > "$NET_ROOT/$name.log" 2>&1 & )
  fi

  if ! wait_for_port "$admin" 90 || ! wait_for_port "$app" 90; then
    log "$name did not come up within 90s. Log tail:"
    tail -n 30 "$NET_ROOT/$name.log" >&2 || true
    exit 1
  fi

  # See the header: the `hc sandbox` wrapper is already gone by now.
  local pid
  pid="$(pgrep -f "holochain .*--config-path $NET_ROOT/$name/conductor-config.yaml" | head -n1)"
  [ -n "$pid" ] || fail "$name's ports came up but its holochain process could not be found (looked for --config-path $NET_ROOT/$name/conductor-config.yaml). Log tail:$(echo; tail -n 30 "$NET_ROOT/$name.log")"
  echo "$pid" > "$(node_pidfile "$name")"

  # RESUMING DOES NOT RE-ENABLE THE APP. `hc sandbox generate` installs
  # AND enables; `hc sandbox run` on an existing sandbox brings the
  # conductor back with the app DISABLED. The conductor is up, both ports
  # answer, `status` reports everything healthy — and the first zome call
  # dies with `CellDisabled(CellId(...))` from deep inside the client's
  # signing-credential setup, an error that names a cell id and nothing
  # about what to do. Found by stopping and starting this network and
  # watching real-gossip.mjs fail before its first check.
  #
  # EnableApp is idempotent (confirmed by calling it twice on the same
  # app and getting "Activated app" both times), so this runs on the
  # generate path too rather than being conditional on which branch was
  # taken — one less way for the two paths to diverge.
  if ! echo "$PASSPHRASE" | "$HC_BIN" sandbox --piped call -r "$admin" \
       enable-app "$app_id" > "$NET_ROOT/$name.enable.log" 2>&1; then
    log "  WARNING: could not enable app \"$app_id\" on $name. Zome calls will fail with CellDisabled. Log:"
    cat "$NET_ROOT/$name.enable.log" >&2 || true
  fi

  # AND THEN WAIT FOR IT, because EnableApp returning success is not the
  # same as the cell being usable. Enabling is asynchronous: the call
  # reports `Activated app` immediately while the cell is still coming
  # up, and a client connecting in that window gets the SAME
  # `CellDisabled(CellId(...))` error as if the app had never been
  # enabled at all. Adding the enable call above without this wait
  # therefore changed nothing observable — the harness failed identically,
  # and only a later `list-apps` (by then reporting `status: Running`)
  # showed that the enable had in fact worked and been raced. Polling
  # list-apps for `status: Running` is what makes `start` returning mean
  # the network is actually usable.
  local tries=30
  while [ "$tries" -gt 0 ]; do
    if echo "$PASSPHRASE" | "$HC_BIN" sandbox --piped call -r "$admin" list-apps 2>/dev/null \
         | grep -q "status: Running"; then
      break
    fi
    sleep 1; tries=$((tries - 1))
  done
  [ "$tries" -gt 0 ] || log "  WARNING: $name's app never reported \"status: Running\" within 30s; zome calls may fail with CellDisabled."

  log "  $name ready (pid $pid)."
}

stop_pidfile() {
  local pf="$1" what="$2"
  [ -f "$pf" ] || return 0
  local pid; pid="$(cat "$pf")"
  if kill -0 "$pid" 2>/dev/null; then
    log "Stopping $what (pid $pid) ..."
    kill "$pid" 2>/dev/null || true
    for _ in $(seq 1 10); do kill -0 "$pid" 2>/dev/null || break; sleep 1; done
    kill -0 "$pid" 2>/dev/null && kill -9 "$pid" 2>/dev/null || true
  fi
  rm -f "$pf"
}

cmd="${1:-}"
case "$cmd" in

  start)
    [ -f "$HAPP_PATH" ] || fail "No .happ bundle at $HAPP_PATH. Build it first: scripts/pack-webhapp.sh"
    mkdir -p "$NET_ROOT"
    start_services
    for spec in "${NODES[@]}"; do start_node "$spec"; done
    log ""
    log "Network up. Three conductors, two of them on the same DHT:"
    for spec in "${NODES[@]}"; do
      IFS=: read -r name admin app app_id seed <<< "$spec"
      log "  $name  admin ws://localhost:$admin  app ws://localhost:$app  app-id $app_id  seed \"$seed\""
    done
    log ""
    log "nodeA and nodeB share a seed, so they share a DNA hash and a DHT."
    log "nodeC differs ONLY in its seed — it is the control that proves a"
    log "positive result on nodeB came from the network and not from the"
    log "mere fact of pointing a conductor at these services."
    log ""
    log "Next: node scripts/live-verify/real-gossip.mjs"
    ;;

  stop)
    for spec in "${NODES[@]}"; do
      IFS=: read -r name _ _ _ _ <<< "$spec"
      stop_pidfile "$(node_pidfile "$name")" "$name"
    done
    stop_pidfile "$SERVICES_PIDFILE" "local bootstrap/signal services"
    log "Stopped. DHT state kept — next 'start' resumes it."
    ;;

  status)
    if services_running; then
      log "Services running (pid $(cat "$SERVICES_PIDFILE"))."
      [ -s "$BOOT_ADDR_FILE" ] && log "  bootstrap: $(head -n1 "$BOOT_ADDR_FILE")"
      [ -s "$SIG_ADDR_FILE" ] && log "  signal:    $(head -n1 "$SIG_ADDR_FILE")"
    else
      log "Services not running."
    fi
    for spec in "${NODES[@]}"; do
      IFS=: read -r name admin app app_id seed <<< "$spec"
      if node_running "$name"; then
        if port_up "$admin" && port_up "$app"; then
          log "$name running (pid $(cat "$(node_pidfile "$name")")) — admin :$admin, app :$app up."
        else
          log "$name WARNING: process alive but ports $admin/$app are not answering."
        fi
      else
        log "$name not running."
      fi
    done
    ;;

  clean)
    "$HERE/network.sh" stop || true
    # rm -rf, NOT `hc sandbox clean` — see the header. That subcommand
    # would also delete sandbox.sh's conductor.
    log "Deleting all network state under $NET_ROOT ..."
    rm -rf "$NET_ROOT"
    log "Clean. Next 'start' generates three fresh conductors with empty DHTs."
    ;;

  addrs)
    [ -s "$BOOT_ADDR_FILE" ] || fail "No bootstrap address recorded. Is the network up? scripts/network.sh start"
    echo "bootstrap=$(head -n1 "$BOOT_ADDR_FILE")"
    echo "signal=$(head -n1 "$SIG_ADDR_FILE")"
    ;;

  *)
    echo "Usage: scripts/network.sh {start|stop|status|clean|addrs}" >&2
    exit 1
    ;;
esac
