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
#   nodeD  admin :8891  app :8890   network seed "netverify-seed-1"   OPT-IN
#
# plus a bootstrap server on :8893 and an iroh relay on :8892 — two
# instances of the same binary, one per role. See the BOOTSTRAP_URL /
# RELAY_URL note below for why they are not collapsed into one.
#
# A and B share a network seed, so the DNA hashes they install are
# identical and they are on the SAME DHT. C differs in the seed alone —
# same .happ, same code, same bootstrap server, same relay, same
# machine — so its DNA hash differs and it is on a DIFFERENT DHT. C is
# there so "B received it over the network" cannot be confused with "any
# conductor pointed at these services would have shown it." Without C, a
# harness that only watches B prove positive is an anecdote.
#
# Peer discovery and transport come from `kitsune2-bootstrap-srv`, run on
# pinned ports. Holochain 0.7 removed both `hc run-local-services` and
# the tx5/WebRTC transport it served; the transport is now iroh QUIC, and
# kitsune2's own server binary provides the bootstrap service and an
# embedded iroh relay together on one address. The same URL is therefore
# passed as both `network -b <bootstrap>` and `quic <relay>`.
#
# Install it with:
#   cargo install kitsune2_bootstrap_srv --version 0.5.1 --locked
# 0.5.x is the kitsune2 line holochain 0.7.0 itself builds against.
#
# Verified end to end under 0.7, not assumed: A writes a claim, B (same
# seed) reads it back within a few seconds, and C (different seed) sees
# nothing.
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
#   - THE BOOTSTRAP AND RELAY PORTS MUST BE PINNED, not left ephemeral.
#     A conductor's bootstrap and relay URLs are written into its
#     persistent config at GENERATE time. Stop the network, start it
#     again, and the service comes back on a different ephemeral port
#     while the resumed conductors go on dialling the old one — a network
#     that reports itself fully up, on which nothing ever gossips.
#     Observed exactly that way: three nodes resumed green and were only
#     reachable because the previous run's services happened to still be
#     alive. A fixed port below makes `stop`/`start` mean what it
#     looks like it means. The cost is that these two ports must be free,
#     which is the same contract the conductor ports already have.
#
# EVERY LONG-RUNNING CHILD IS LAUNCHED WITH `setsid --fork`, NOT `&`.
# `( cmd & )` looks like it detaches and does not: the launched process
# stays a child of this script, and the script then blocks in wait() until
# it exits — which, for a conductor or the services, is never. Running
# `network.sh` from a terminal hides this completely, because the output
# all appears and the shell prompt returns; the script itself is still
# sitting there. It only becomes visible to a CALLER that waits for the
# process to finish and its stdout to reach EOF — which is exactly what
# Node's `execFileSync` does, and therefore exactly what
# scripts/live-verify/partition-rejoin.mjs does when it calls `stop-node`
# and `start-node`. That harness hung indefinitely on its first run, with
# three leaked `network.sh` processes sitting in `do_wait` behind it, one
# per launch site. `setsid --fork` puts each child in its own session so
# nothing is left holding it, and the script exits when its work is done.
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

# NOT STARTED BY `start`, AND THAT IS THE WHOLE POINT OF IT BEING SEPARATE.
# nodeD is a THIRD member of the shared DHT, which is what makes transitive
# gossip askable: until it existed the shared DHT had exactly two members,
# so "B has A's entry" could never distinguish gossip from point-to-point
# delivery — an entry had never reached a node from a peer that was not its
# author.
#
# It is opt-in because adding it to the default network would silently
# change what two existing harnesses measure, and one of them would break
# outright. `partition-rejoin.mjs` stops nodeB, has nodeA write, then stops
# nodeA BEFORE restarting nodeB, so that nodeB provably could not have
# obtained the entry from its author. A third node sitting up throughout,
# holding that same entry, defeats exactly that: nodeB would acquire it
# from nodeD and the divergence check — the one carrying the whole meaning
# of that run — would go red for a reason that has nothing to do with the
# property being tested. `network-partition.mjs` would be muddied the same
# way on the healing side.
#
# So the default network stays the three nodes every existing harness was
# written against, and anything wanting a three-member DHT brings nodeD up
# itself with `start-node nodeD` and stops it afterwards.
OPTIONAL_NODES=(
  "nodeD:8891:8890:epistemic-net-d:$SHARED_SEED"
)

# Pinned, not ephemeral — see the header. These live just below the
# conductor ports for the same reason those avoid 8888/8889: so the whole
# range this script occupies is contiguous and obvious.
BOOTSTRAP_PORT="${EPI_NET_BOOTSTRAP_PORT:-8893}"
RELAY_PORT="${EPI_NET_RELAY_PORT:-8892}"

# TWO SERVICES ON TWO PORTS, deliberately, even though one would do.
#
# Holochain 0.7 removed the tx5/WebRTC transport and with it the separate
# signal server this script used to run on :8892. Its replacement,
# `kitsune2-bootstrap-srv`, embeds an iroh relay alongside the bootstrap
# service and serves BOTH on one address — so a single instance is enough
# to bring a network up, and that is what this script did at first.
#
# It is not enough for `scripts/live-verify/network-partition.mjs`. That
# harness partitions the network by dropping packets to the port carrying
# peer traffic, while asserting that the bootstrap port stays reachable —
# the control that makes the result "one severed path" rather than "the
# services went away". Collapsing both roles onto one port destroys that
# control: there is no longer any cut that separates them.
#
# There is no flag to run the binary as bootstrap-only (its config has a
# `no_relay_server` field, but the CLI does not expose it). So this runs
# two instances and points each conductor at one for each role: `-b` at
# :8893 and `quic`'s relay argument at :8892. Both instances serve both
# roles; the conductors only ever use the one they were pointed at, which
# is what separates the two data paths again.
#
# Measured, not assumed — see start_services' note below for the socket
# topology this produces under 0.7.
#
# The addresses are computed rather than read from a file. `hc
# run-local-services` used to publish its real addresses to
# --bootstrap-address-path/--signal-address-path because its ports could
# be ephemeral; kitsune2-bootstrap-srv takes a --listen address directly,
# so pinning the ports (see the header for why they must be pinned) means
# the URLs are already known and nothing needs to be discovered.
BOOTSTRAP_URL="http://127.0.0.1:$BOOTSTRAP_PORT"
RELAY_URL="http://127.0.0.1:$RELAY_PORT"
RELAY_LOG="$NET_ROOT/relay.log"
RELAY_PIDFILE="$NET_ROOT/relay.pid"
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
# Holochain 0.7 dropped `hc run-local-services`, so the local bootstrap
# and relay come from kitsune2's own server binary instead. Installed
# with `cargo install kitsune2_bootstrap_srv --version 0.5.1 --locked`
# (0.5.x is the kitsune2 line holochain 0.7.0 itself builds against).
K2_BOOT_BIN="$(find_bin kitsune2-bootstrap-srv)"

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

# Look up a node's spec by name, for the per-node subcommands below.
# Searches the optional nodes as well, so `start-node nodeD` and friends
# work on a node that `start` deliberately does not bring up.
spec_for() {
  local want="$1" spec
  for spec in "${NODES[@]}" "${OPTIONAL_NODES[@]}"; do
    IFS=: read -r name _ _ _ _ <<< "$spec"
    [ "$name" = "$want" ] && { echo "$spec"; return 0; }
  done
  return 1
}

node_running() {
  local pf; pf="$(node_pidfile "$1")"
  [ -f "$pf" ] && kill -0 "$(cat "$pf")" 2>/dev/null
}

services_running() {
  [ -f "$SERVICES_PIDFILE" ] && kill -0 "$(cat "$SERVICES_PIDFILE")" 2>/dev/null \
    && [ -f "$RELAY_PIDFILE" ] && kill -0 "$(cat "$RELAY_PIDFILE")" 2>/dev/null
}

# Start one kitsune2-bootstrap-srv instance and record the PID that
# actually holds the port. Shared by the bootstrap and relay services,
# which differ only in which port they bind and which log they write.
start_one_service() {
  local role="$1" port="$2" logf="$3" pidf="$4"

  log "Starting local $role service on :$port ..."
  ( cd "$NET_ROOT" && setsid --fork "$K2_BOOT_BIN" --listen "127.0.0.1:$port" \
      < /dev/null > "$logf" 2>&1 )

  # Wait on the port rather than on an address file: there is no address
  # file any more (see BOOTSTRAP_URL above), and the port answering is
  # the thing conductors actually need.
  local tries=30
  while [ "$tries" -gt 0 ]; do
    port_up "$port" && break
    # A bind failure is fatal and instant; waiting out the full 30s for
    # it is pure delay. Nearly always a leaked previous run still holding
    # the port.
    if grep -qiE "address in use|AddrInUse" "$logf" 2>/dev/null; then
      log "$role service failed to start. Log:"
      cat "$logf" >&2
      fail "Something is still bound to :$port — check with: pgrep -af kitsune2-bootstrap-srv"
    fi
    sleep 1; tries=$((tries - 1))
  done
  port_up "$port" \
    || fail "$role service did not bind :$port within 30s. Log tail:$(echo; tail -n 20 "$logf" 2>/dev/null)"

  # THE PID MUST BE FOUND, NOT CAPTURED. `( cd X && setsid --fork Y ... )`
  # leaves `$!` pointing at a transient subshell that is gone in
  # milliseconds while the service keeps running and keeps the port.
  # Recording `$!` made `stop` kill something already dead and leave the
  # real service alive — the exact leak sandbox.sh's header describes for
  # conductors. Matched on the --listen address, which is what makes this
  # safe now that two instances of the same binary are running: the port
  # is the only thing that tells them apart.
  local pid
  pid="$(pgrep -f "kitsune2-bootstrap-srv .*--listen 127.0.0.1:$port" | head -n1)"
  [ -n "$pid" ] || fail "$role service bound :$port but its process could not be found (looked for --listen 127.0.0.1:$port)."
  echo "$pid" > "$pidf"
  log "  $role: http://127.0.0.1:$port  (pid $pid)"
}

start_services() {
  if services_running; then
    log "Local bootstrap and relay services already running (pids $(cat "$SERVICES_PIDFILE"), $(cat "$RELAY_PIDFILE"))."
    return 0
  fi
  # Two instances, two roles — see the BOOTSTRAP_URL/RELAY_URL note above
  # for why one is not enough. Measured topology inside the namespace with
  # both up under Holochain 0.7: each conductor holds exactly one TCP
  # connection to the relay port and one to the bootstrap port, there are
  # no direct conductor-to-conductor connections, and no peer traffic on
  # UDP. That is the same shape tx5 produced, which is what lets
  # network-partition.mjs keep cutting the relay while using bootstrap as
  # its control.
  start_one_service "bootstrap" "$BOOTSTRAP_PORT" "$SERVICES_LOG" "$SERVICES_PIDFILE"
  start_one_service "relay"     "$RELAY_PORT"     "$RELAY_LOG"     "$RELAY_PIDFILE"
}

start_node() {
  local spec="$1"
  IFS=: read -r name admin app app_id seed <<< "$spec"

  if node_running "$name"; then
    log "$name already running (pid $(cat "$(node_pidfile "$name")"))."
    return 0
  fi

  # One URL for both roles now — see BOOTSTRAP_URL. There is no separate
  # signal address to read, and no address file to read it from.

  if [ -d "$NET_ROOT/$name" ]; then
    # RESUME IS BY INDEX NOW, NOT BY PATH. 0.7 removed `run -e <path>`;
    # `hc sandbox run` takes zero-based indices into the `.hc` file (or
    # `-a` for all of them). The index cannot be assumed from the order
    # this script generates nodes in — `.hc` is appended to as each
    # sandbox finishes generating, so a run where nodeC won the race
    # leaves nodeC at index 0. Look the name up in `.hc` instead, which
    # is exact regardless of ordering.
    local idx
    idx="$(grep -nxF "$NET_ROOT/$name" "$NET_ROOT/.hc" 2>/dev/null | head -n1 | cut -d: -f1)"
    [ -n "$idx" ] || fail "$name has a directory but no entry in $NET_ROOT/.hc, so it cannot be resumed by index. Recreate the network: scripts/network.sh clean && scripts/network.sh start"
    idx=$((idx - 1))   # grep -n is 1-based; hc sandbox indices are 0-based.
    log "Resuming $name (admin :$admin, app :$app, .hc index $idx) ..."
    ( cd "$NET_ROOT" && echo "$PASSPHRASE" | setsid --fork "$HC_BIN" sandbox -H "$HOLOCHAIN_BIN" --piped -f="$admin" \
        run "$idx" > "$NET_ROOT/$name.log" 2>&1 )
  else
    log "Generating $name (admin :$admin, app :$app, seed \"$seed\") ..."
    ( cd "$NET_ROOT" && echo "$PASSPHRASE" | setsid --fork "$HC_BIN" sandbox -H "$HOLOCHAIN_BIN" --piped -f="$admin" \
        generate -a "$app_id" -r="$app" --in-process-lair --root "$NET_ROOT" -d "$name" \
        -s "$seed" "$HAPP_PATH" \
        network -b "$BOOTSTRAP_URL" quic "$RELAY_URL" > "$NET_ROOT/$name.log" 2>&1 )
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
  # No passphrase and no --piped here, unlike the zome-call commands:
  # `hc client call` makes ADMIN API requests, which are not signed with
  # the agent's key and so never touch the keystore. It rejects --piped
  # outright ("unexpected argument '--piped' found"), which is a silent
  # no-op failure if it goes to a log nobody reads.
  if ! "$HC_BIN" client call --port "$admin" \
       enable-app "$app_id" > "$NET_ROOT/$name.enable.log" 2>&1; then
    log "  WARNING: could not enable app \"$app_id\" on $name. Zome calls will fail with CellDisabled. Log:"
    cat "$NET_ROOT/$name.enable.log" >&2 || true
  fi

  # AND THEN WAIT FOR IT. Under 0.4 this was strictly necessary: EnableApp
  # returned `Activated app` immediately while the cell was still coming
  # up, and a client connecting in that window got the same
  # `CellDisabled(CellId(...))` error as if the app had never been enabled
  # — so adding the enable call without this wait changed nothing
  # observable, and only a later `list-apps` showed the enable had worked
  # and been raced. 0.6 tightened `EnableApp` to fail if creating the
  # app's cells fails, which should close that window, but the poll is
  # kept: it is cheap, and "start returning means the network is usable"
  # is the property worth holding regardless of which release enforces it.
  #
  # THE STATUS STRING CHANGED. 0.6 removed the Running/Paused app states
  # entirely, leaving only enabled and disabled, and `hc client call`
  # emits JSON rather than the old debug formatting. What used to be
  # `status: Running` in that output is now `"status":{"type":"enabled"}`.
  # Grepping for the old string would never match and would silently burn
  # the full 30s on every node, every start.
  local tries=30
  while [ "$tries" -gt 0 ]; do
    if "$HC_BIN" client call --port "$admin" list-apps 2>/dev/null \
         | grep -q '"type":"enabled"'; then
      break
    fi
    sleep 1; tries=$((tries - 1))
  done
  [ "$tries" -gt 0 ] || log "  WARNING: $name's app never reported an enabled status within 30s; zome calls may fail."

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
    log "nodeD (admin :8891, app :8890) is a THIRD member of the shared DHT"
    log "and is deliberately NOT started here — it would change what the"
    log "partition harnesses measure. Bring it up only when a test wants a"
    log "three-member DHT:  scripts/network.sh start-node nodeD"
    log ""
    log "Next: node scripts/live-verify/real-gossip.mjs"
    ;;

  stop)
    # Optional nodes included: one left running would be invisible to the
    # next harness and would change what it measures.
    for spec in "${NODES[@]}" "${OPTIONAL_NODES[@]}"; do
      IFS=: read -r name _ _ _ _ <<< "$spec"
      stop_pidfile "$(node_pidfile "$name")" "$name"
    done
    stop_pidfile "$RELAY_PIDFILE" "local relay service"
    stop_pidfile "$SERVICES_PIDFILE" "local bootstrap service"
    log "Stopped. DHT state kept — next 'start' resumes it."
    ;;

  status)
    if services_running; then
      log "Services running (bootstrap pid $(cat "$SERVICES_PIDFILE"), relay pid $(cat "$RELAY_PIDFILE"))."
      log "  bootstrap: $BOOTSTRAP_URL"
      log "  relay:     $RELAY_URL"
    else
      log "Services not running."
    fi
    for spec in "${NODES[@]}" "${OPTIONAL_NODES[@]}"; do
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

  stop-node)
    # Stop ONE node, leaving the rest of the network and the services up.
    # This is how scripts/live-verify/partition-rejoin.mjs partitions the
    # network: taking a conductor offline is an unambiguous partition,
    # unlike blocking traffic between two processes that are both still
    # running and may hold an already-negotiated QUIC connection.
    node="${2:-}"
    [ -n "$node" ] || fail "Usage: scripts/network.sh stop-node <nodeA|nodeB|nodeC|nodeD>"
    spec_for "$node" >/dev/null || fail "Unknown node \"$node\". Known: nodeA, nodeB, nodeC, nodeD (nodeD is opt-in; see OPTIONAL_NODES)."
    stop_pidfile "$(node_pidfile "$node")" "$node"
    # Confirm rather than assume: a partition that did not actually happen
    # would make everything downstream of it meaningless.
    IFS=: read -r _ admin app _ _ <<< "$(spec_for "$node")"
    for _ in $(seq 1 15); do
      port_up "$admin" || break
      sleep 1
    done
    port_up "$admin" && fail "$node was told to stop but its admin port $admin still answers."
    log "$node is down (admin :$admin and app :$app no longer answer)."
    ;;

  start-node)
    # Bring ONE node back, healing the partition. Services must already be
    # up; this deliberately does not start them, so that a caller cannot
    # accidentally restart the whole network mid-test.
    node="${2:-}"
    [ -n "$node" ] || fail "Usage: scripts/network.sh start-node <nodeA|nodeB|nodeC|nodeD>"
    spec="$(spec_for "$node")" || fail "Unknown node \"$node\". Known: nodeA, nodeB, nodeC, nodeD (nodeD is opt-in; see OPTIONAL_NODES)."
    services_running || fail "The bootstrap/relay services are not running. Start the whole network first: scripts/network.sh start"
    start_node "$spec"
    ;;

  addrs)
    services_running || fail "The bootstrap/relay services are not running. Is the network up? scripts/network.sh start"
    echo "bootstrap=$BOOTSTRAP_URL"
    echo "relay=$RELAY_URL"
    ;;

  *)
    echo "Usage: scripts/network.sh {start|stop|status|clean|addrs|stop-node <n>|start-node <n>}" >&2
    echo "  nodes: nodeA nodeB nodeC (started by 'start'), nodeD (opt-in, third member of the shared DHT)" >&2
    exit 1
    ;;
esac
