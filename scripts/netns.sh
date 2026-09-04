#!/usr/bin/env bash
# ============================================================================
# scripts/netns.sh — run a command inside a throwaway network namespace that
# holds its own private copy of the three-node network.
#
# WHY THIS EXISTS. `scripts/live-verify/partition-rejoin.mjs` partitions the
# network by stopping a conductor. That is a real failure mode and it is the
# easy one: the process exits, its ports close, and the peer gets an
# immediate, unambiguous refusal. The harder and more realistic shape is the
# one that failure mode cannot reach — BOTH SIDES KEEP RUNNING, both keep
# accepting writes, and they simply cannot reach each other. Nothing about
# stopping a process can produce that, because a stopped process cannot
# write.
#
# Producing it needs packet-level control, and packet-level control on a
# developer's own machine is dangerous: a stray DROP rule can cut them off
# from things they care about, and a rule that outlives the test is worse
# than no test. So everything here happens inside an unprivileged namespace
# created by `unshare --map-root-user --net --pid --fork --kill-child --mount-proc`:
#
#   - Inside it we are uid 0 and may run `iptables`; outside it we are an
#     ordinary user and nothing we did applies.
#   - The namespace starts with ONLY a loopback device, so the whole network
#     — bootstrap server, signal server, three conductors, and the harness
#     itself — lives in there together and reaches nothing else.
#   - When the process exits the namespace is destroyed, and every rule in
#     it goes with it. There is no cleanup step that can be forgotten,
#     because there is no state to clean up.
#   - `--pid --fork` puts the run in its own PID namespace as well, so the
#     conductors cannot outlive it either. That flag was missing at first
#     and the omission was expensive. `unshare --net` isolates the network
#     and NOTHING ELSE: when a namespace went away its conductors did not,
#     because nothing had ever told them to. Eighteen of them from six
#     runs — about 7.5 GB — were found still alive hours later, competing
#     for the CPU of every run that came after. The "nothing to clean up"
#     promise above was true of firewall rules and false of processes
#     until this flag made it true of both.
#   - `--kill-child` is what makes that hold when a run is ABORTED, which
#     is when it was actually failing. A PID namespace dies with its own
#     init, not with whoever started it, so killing this script left the
#     inner shell — and the three conductors under it — running happily
#     with no one watching. Measured, not assumed: SIGKILL to the outer
#     process left three conductors alive; SIGKILL to the namespace's own
#     init took all three down within four seconds. This flag ties the
#     first case to the second.
#
# No root, no sudo, and no possibility of leaving a firewall rule behind on
# the host. Verified before anything was built on it: inside the namespace,
# a DROP on one port made that port unreachable while a control port stayed
# reachable, and removing the rule restored it.
#
# WHAT THE PARTITION ACTUALLY CUTS, which is not what was first assumed.
# The obvious guess is that Holochain peers talk over QUIC/UDP and that
# dropping UDP partitions them. That was tried first and it DID NOT WORK —
# claims crossed with all UDP dropped in both directions. Inspecting the
# sockets explained why: on this setup each conductor holds exactly two TCP
# connections, one to the bootstrap server and one to the signal server,
# and there is NO direct conductor-to-conductor connection and no UDP
# socket at all. All peer traffic is relayed through the signal server.
# So the data path to cut is TCP to the signal port, and cutting it is a
# genuine data-plane partition here. `network-partition.mjs` asserts that
# socket topology at runtime rather than trusting this comment, because
# the moment tx5 establishes direct connections instead, this cut stops
# meaning what it says.
#
# Usage:
#   scripts/netns.sh run '<shell command>'   # network up, run cmd, tear down
#   scripts/netns.sh shell                   # interactive, for poking around
#
# The network inside uses EPI_NET_ROOT=/tmp/epi-ns so it cannot collide with
# the host-side network at /tmp/epi-net, and the two can be up at once.
#
# ONE RUN AT A TIME, enforced by a lock. A network namespace is not a mount
# namespace: two runs share /tmp, therefore share EPI_NET_ROOT, and each one
# begins by deleting it — so a second run tears down the first one's state
# from under it while it is still using it. They also share the CPU, and
# this harness REPORTS TIMINGS, so an overlapped run does not merely risk
# corruption; it quietly reports numbers that are not about what they say
# they are about. Both of those happened before the lock existed, and one
# fault-injection result had to be thrown away because of it.
# ============================================================================
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$HERE/.." && pwd)"

NS_NET_ROOT="${EPI_NS_ROOT:-/tmp/epi-ns}"

log() { echo "[netns] $*"; }
fail() { echo "[netns] ERROR: $*" >&2; exit 1; }

command -v unshare >/dev/null 2>&1 || fail "unshare not found (util-linux)."
command -v flock >/dev/null 2>&1 || fail "flock not found (util-linux)."

# Held for the life of the run. The fd survives the `exec unshare` below, so
# the lock belongs to the whole namespace and is released by the kernel when
# it dies -- there is no unlock step to forget, for the same reason there is
# no rule-removal step to forget.
exec 9>"${NS_NET_ROOT}.lock"
if ! flock -n 9; then
  fail "Another netns run already holds ${NS_NET_ROOT}.
  Runs share /tmp, so a second one would delete this one's network and skew
  both runs' timings. Wait for it to finish, or point EPI_NS_ROOT elsewhere."
fi

# Fail early and clearly rather than half-way through a ten-minute harness.
if ! unshare --map-root-user --net --pid --fork --kill-child --mount-proc true 2>/dev/null; then
  fail "Unprivileged network/PID namespaces are not available here.
  This needs kernel.unprivileged_userns_clone (or equivalent) enabled.
  Check with: unshare --map-root-user --net --pid --fork --kill-child --mount-proc true"
fi

cmd="${1:-}"
case "$cmd" in
  run|shell)
    inner="${2:-}"
    if [ "$cmd" = "run" ] && [ -z "$inner" ]; then
      fail "Usage: scripts/netns.sh run '<shell command>'"
    fi
    [ "$cmd" = "shell" ] && inner="exec bash -i"

    log "Entering a private network namespace (nothing here touches the host)."
    exec unshare --map-root-user --net --pid --fork --kill-child --mount-proc bash -c '
      set -euo pipefail
      # A fresh namespace has lo DOWN, and every service below binds to
      # 127.0.0.1 — without this nothing can talk to anything.
      ip link set lo up

      export EPI_NET_ROOT="'"$NS_NET_ROOT"'"
      cd "'"$REPO_ROOT"'"

      # Always from scratch: this namespace is thrown away at exit, so a
      # resumed sandbox from a previous run would be the only state that
      # outlives it, and it is the one piece of state that could make a
      # run mean something other than what it says.
      rm -rf "$EPI_NET_ROOT"

      echo "[netns] starting the three-node network inside the namespace ..."
      bash scripts/network.sh start < /dev/null

      status=0
      bash -c "'"$inner"'" || status=$?

      echo "[netns] tearing down ..."
      bash scripts/network.sh stop < /dev/null || true
      exit $status
    '
    ;;
  *)
    echo "Usage: scripts/netns.sh {run '<command>'|shell}" >&2
    exit 1
    ;;
esac
