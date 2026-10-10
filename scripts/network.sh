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

# Overridable so a MINIMAL hApp can be driven through the same two-conductor
# choreography without editing this script. That is not a convenience: the
# Ribosome RuntimeError recorded in README.md §9 needed a reproducer with no
# dependency on this project's own zomes before it could be reported upstream,
# and `EPI_NET_ROOT` was already overridable while this was not.
HAPP_PATH="${EPI_HAPP_PATH:-$REPO_ROOT/epistemic-resonance-happ.happ}"

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

# THE GOSSIP ROUND TIMEOUT, RAISED FROM KITSUNE2'S 15s DEFAULT.
#
# `network`'s remaining CI flake is a BASELINE crossing that never happens:
# nodeA writes, nodeB never sees it, and `partition-rejoin` reports SETUP
# FAILED having watched for 900s. The instrumentation that harness carries for
# exactly this question answered it on 2026-10-05 — "more time would NOT have
# helped, so the window is not the thing to change" — and the conductor logs
# on the 2026-09-12 failures showed the mechanism: a gossip round whose Accept
# arrived after the initiator's 15s `roundTimeoutMs`, so the round was
# terminated and the reply discarded. A 2-vCPU runner is slow enough to lose
# that race; a development machine is not, which is why this read as random.
#
# `roundTimeoutMs` IS A REAL KNOB AND THAT WAS VERIFIED, NOT ASSUMED, because
# the config path it travels silently ignores anything it does not recognise.
# `kitsune2_gossip-0.5.0/src/config.rs` declares `K2GossipModConfig { k2_gossip:
# K2GossipConfig { round_timeout_ms: u32 } }` under `#[serde(rename_all =
# "camelCase")]`, with a default of exactly 15_000; `holochain_conductor_api`'s
# `NetworkConfig::to_k2_config` passes `network.advanced` through verbatim as
# the kitsune2 module config; and `K2GossipFactory::create` reads it back with
# `get_module_config::<K2GossipModConfig>()`. Proven end to end by putting a
# STRING in this field and watching the conductor log
# `K2Error(... "decode config" ... invalid type: string, expected u32)`.
#
# AND THAT PROOF IS WHY THE PATCH IS CHECKED BELOW RATHER THAN TRUSTED. A
# malformed or misspelled entry here does NOT stop the conductor: it fails the
# cell's network join and leaves every port answering — "a network that reports
# itself fully up, on which nothing ever gossips", which is the failure this
# file's header already warns about for the bootstrap ports. A silent no-op
# dressed as a fix is the one outcome worse than the flake.
#
# REVERTED TO kitsune2's DEFAULT, AND THE REASON IS THAT THIS SETTING'S OWN
# PREMISE WAS REMOVED THREE SETTINGS BELOW.
#
# It was set to 60s on the argument quoted above: "a round lost to that timeout
# cannot be retried with the same peer for `min_initiate_interval_ms` (300s)".
# That was true, and it is why four times the default looked cheap. But
# `min_initiate_interval_ms` is now 10s here (see below), so a lost round costs
# ten seconds rather than five minutes, and buying insurance against it with a
# 4x timeout no longer buys anything.
#
# It also never showed a benefit when finally measured. `peering-rate.mjs` run
# 37478744160 ran 30 interleaved trials at 60000, 30000 and 15000 and produced
# 2, 1 and 2 non-crossings of ten — no effect across a 4x range, and the band
# that had been blamed on this setting turned out to be `initiate_interval_ms`.
#
# SO THE LOCAL DIVERGENCE IS DROPPED RATHER THAN KEPT ON A DEAD ARGUMENT. The
# reasoning above is left standing because it was sound on what was known then:
# a 2-vCPU runner really is slow enough to lose a 15s round, that really was
# verified end to end rather than assumed, and the 300s floor really did make
# it expensive. Only the floor changed.
#
# THE VARIABLE STAYS EVEN THOUGH IT NOW MATCHES THE DEFAULT, and not for
# symmetry: `peering-rate.mjs` sets `EPI_GOSSIP_ROUND_TIMEOUT_MS` per arm to
# vary this very setting, so removing the override would break the harness that
# measured it. Writing the default explicitly also keeps it under the read-back
# below, which is what catches a key kitsune2 silently discards.
GOSSIP_ROUND_TIMEOUT_MS="${EPI_GOSSIP_ROUND_TIMEOUT_MS:-15000}"

# THE GOSSIP INITIATION INTERVAL, WHICH IS WHAT THE SLOW BASELINE ACTUALLY WAS.
#
# The comment above says the surviving explanation for `network`'s slow baseline
# is "the one that logs nothing wrong: at the first initiation attempt there is
# no peer to gossip with, and the crossing then waits out `initiate_interval_ms`".
# That was a hypothesis when it was written. IT IS NOW MEASURED, and the figure
# is exactly the default:
#
#   `kitsune2_gossip-0.5.0/src/config.rs` defaults —
#     initial_initiate_interval_ms: 1_000     (the opening burst)
#     initiate_interval_ms:       120_000     <- the band
#     initiate_jitter_ms:          10_000
#     min_initiate_interval_ms:   300_000     (a PER-PEER floor)
#
# `peering-rate.mjs` run 37478744160, 30 trials across roundTimeoutMs 60000/
# 30000/15000 interleaved: 12 of 25 crossings landed in a band at 123-153s,
# contributed to about equally by all three arms, and EVERY ONE of those 12
# trials contains a single stall of 107-123s with zero transport errors. A
# 120s+jitter sleep minus the trailing accept/terminate lines of the burst
# before it is that band, and nothing else in play produces it.
# `partition-rejoin`'s own baseline failures — 125.3s twice to the decimal, and
# 120.3s — sit in the same band on a harness that never varies roundTimeoutMs.
#
# SO roundTimeoutMs WAS NOT THE VARIABLE, which those 30 trials also settled:
# 2, 1 and 2 non-crossings of ten across a 4x range of it. The setting above
# stays because a lost round still cannot be retried for min_initiate_interval,
# but it was never the thing making baselines slow.
#
# LOWERING initiate_interval_ms ALONE WOULD NOT HELP, and that is the whole
# reason three keys change here rather than one. Its own doc comment: "This can
# be set as low as you'd like, but you will still be limited by
# min_initiate_interval_ms. So a low value for this will result in Kitsune doing
# its gossip initiation in a burst. Then, when it has run out of peers, it will
# idle for a while." On a four-node network a node exhausts its peers in
# seconds, so the 300s per-peer floor becomes the binding constraint — which is
# what the band trials show: nodeD initiated with both peers by ~25s and the
# crossing then arrived INBOUND, from a peer initiating to it, in 8 of 12.
#
# These values are for a LOCAL TEST NETWORK of three or four nodes on one
# machine, where the defaults' purpose — not hammering peers across a real
# DHT — does not apply. Jitter is kept non-zero deliberately: its doc comment
# explains it exists so that between a pair of nodes the same one is not always
# the initiator, which still matters here.
#
# min_initiate_interval_ms is "enforced against incoming gossip and therefore
# must be respected when initiating too", so a node whose peers disagree about
# it gets its initiations refused. Every node here is configured by this script
# from these same variables, so they agree — and `log-census.sh` already counts
# `initiate too soon`, which is the refusal, so a value set too low announces
# itself rather than quietly degrading.
GOSSIP_INITIATE_INTERVAL_MS="${EPI_GOSSIP_INITIATE_INTERVAL_MS:-5000}"
GOSSIP_INITIATE_JITTER_MS="${EPI_GOSSIP_INITIATE_JITTER_MS:-1000}"
GOSSIP_MIN_INITIATE_INTERVAL_MS="${EPI_GOSSIP_MIN_INITIATE_INTERVAL_MS:-10000}"

# THE CONDUCTOR'S LOG FILTER, RAISED SO THE SILENT PATH SPEAKS.
#
# The surviving explanation for `network`'s slow baseline is the one that logs
# nothing wrong: at the first initiation attempt there is no peer to gossip
# with, and the crossing then waits out `initiate_interval_ms`. Both failures
# censused eight or nine lines per node with EVERY error signature at zero —
# `Accept message from wrong peer`, `initiate too soon`, `iroh connect timed
# out`, all absent — so the question "was gossip even attempted, and when?"
# could not be asked of the logs at all.
#
# It can now. `kitsune2_gossip` logs the timeline at info and debug:
# "Starting initiate task" once per node at startup, "Selected target for
# gossip: <url>" and "Initiated gossip with <url>" per attempt, and — the one
# that matters — `select_next_target`'s reason when there is nobody to gossip
# with, which the Ok(None) arm explicitly defers to it for ("Nobody to gossip
# with, expect `select_next_target` to have logged a reason"). A slow baseline
# with its first "Initiated gossip with" two minutes after start is the
# surviving mechanism caught in the act; one at t+1s refutes it.
#
# HOW THE FILTER TRAVELS, verified rather than assumed: holochain's
# `tracing_override` config field does nothing but `set_var("CUSTOM_FILTER")`,
# so exporting `CUSTOM_FILTER` here is the same lever by a shorter route and
# needs no config patching. Proven locally — node logs went from 8-9 lines to
# 18-65, carrying timestamped "Initiated gossip with" lines.
#
# `warn` IS KEPT AS THE BASE so this only ADDS. A bare "kitsune2_gossip=debug"
# would be the whole filter and would silence everything else, including the
# errors the census has counted for months.
#
# Checked after startup rather than trusted, for the reason the round timeout
# above is checked: a filter that silently failed to apply would leave the next
# failure as mute as the last two, and nothing would say so.
# AND THE FETCH QUEUE, BECAUSE THAT IS WHERE THE NoDiff FINDING LANDED. Batch 5
# closed the integration caveat and relocated the suspect in the same run: every
# one of the 35 `NoDiff` messages nodeD received from nodeA carried a NON-EMPTY
# `new_ops` (11-14 op ids, 28 distinct sets), and the claim still never arrived.
# `kitsune2_gossip-0.5.0/src/respond.rs:187` hands those ids to
# `fetch.request_ops`, so they were enqueued — and `kitsune2_core`'s fetch module
# logged nothing at all, because `warn` silenced it. The queue was the one link
# in the chain with no instrumentation, which is why the investigation stopped
# there. See README.md §9.
#
# WHAT THE FOUR LINES BUY, read from `kitsune2_core-0.5.0/src/factories/
# core_fetch.rs` rather than guessed:
#
#   "processing outgoing request"            :327  dequeued, about to be sent
#   "sending fetch request"                  :371  handed to `send_module`
#   "incoming op response"                   :476  a response came back
#   "processed incoming ops with op ids"     :505  written to the op store
#
# THE GAPS BETWEEN THEM ARE THE DIAGNOSIS, and one of them is silent in the
# source. An op whose peer is marked unresponsive is removed from the request
# set at :346 and then simply not sent — no log line marks the drop. So
# "processing outgoing request" WITHOUT a following "sending fetch request" is
# the fingerprint of an op dropped for an unresponsive peer, which is exactly
# what §9 records an accept timeout as causing. The other two gaps are "sent and
# never answered" and "answered but not stored".
#
# NARROW TARGET ON PURPOSE. `kitsune2_core=debug` would also turn on bootstrap,
# the peer store and publish; the module path keeps this to the fetch queue.
#
# THE DIRECTIVE PARSES, CHECKED RATHER THAN ASSUMED. A `::` module path is valid
# `EnvFilter` target syntax, and the failure mode if it were not is the one that
# matters: `EnvFilter::try_new` rejects the WHOLE string on a bad directive, so a
# malformed addition here would silence the gossip lines too and make this change
# a regression rather than a gap. Verified against tracing-subscriber 0.3 —
# `EnvFilter::try_new("warn,kitsune2_gossip=debug,kitsune2_core::factories::core_fetch=debug")`
# returns Ok and renders back as
# `kitsune2_core::factories::core_fetch=debug,kitsune2_gossip=debug,warn`, with
# the module path preserved verbatim and `warn` still the base.
#
# AND THE EXISTING STARTUP CHECK IS THE BACKSTOP ANYWAY. `start-node` already
# warns when a node logs no "Starting initiate task", which is precisely what a
# filter broken by this addition would look like — so the regression has a
# detector even though the fetch half does not.
#
# THIS ONE CANNOT BE CHECKED AT STARTUP the way the gossip filter can. There is
# no fetch line at boot — the module is silent until an op is actually queued —
# so `start-node` has nothing to grep for. The disambiguator is a CROSSING: any
# trial where the entry arrived must have fetched ops, so a PASSING run with zero
# fetch lines means the filter did not apply. `log-census.sh` counts all four so
# that reading is available without re-reading logs by hand.
# AND THE AGENT-INFO PUBLICATION PATH, FOR THE URL TURNOVER. Batch 8 settled
# what releases a peer from the unresponsive set: not the entry expiring, but
# the peer reappearing under a NEW URL, since `set_unresponsive` keys on
# `agent_info.url` (`core_space.rs:268`) and `select_next_target` tests
# `get_unresponsive(url)` (`initiate.rs:269`). nodeD's own gossip lines showed
# it — failed on `…/4c86264e…` at t+25s, recovered on `…/f61381fd…` 926.4s
# later. What is NOT known is why the URL turns over when it does, and that is
# a transport event in the agent-info publication path. See README.md §9.
#
# WHAT THESE TWO ACTUALLY BUY, AND THE LIMIT STATED UP FRONT: neither module
# logs a SUCCESSFUL publish. `core_space` re-signs at :490-505 with no tracing
# on the happy path, and `core_bootstrap`'s debug line at :264 is a FAILED
# push. So what this adds is the failure and prune lines AROUND the event —
# "Failed to push agent info to bootstrap server", "Not updating agent info
# because we don't have a current url" (`core_space.rs:541`), "Failed to
# broadcast agent info" (:538) — plus, from the peer store, "Pruning expired
# agent info" and "Ignoring insert for older agent info". The turnover itself
# stays inferred from the URL in the gossip lines, which is where batch 8 read
# it from and which needs no filter change at all.
#
# Added anyway because the surrounding lines bound the question: a turnover
# with a failed bootstrap push before it reads differently from one without,
# and the peer-store prune lines say whether the old info was expiring at the
# same moment or not.
GOSSIP_LOG_FILTER="${EPI_GOSSIP_LOG_FILTER:-warn,kitsune2_gossip=debug,kitsune2_core::factories::core_fetch=debug,kitsune2_core::factories::core_space=debug,kitsune2_core::factories::core_bootstrap=debug,kitsune2_core::factories::mem_peer_store=debug}"
export CUSTOM_FILTER="$GOSSIP_LOG_FILTER"

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
one_service_running() {
  local pidf="$1"
  [ -f "$pidf" ] && kill -0 "$(cat "$pidf")" 2>/dev/null
}

start_one_service() {
  local role="$1" port="$2" logf="$3" pidf="$4"

  # Checked PER SERVICE, not for the pair. Splitting one service into two
  # introduced a partial-failure state the single-service version could
  # not have: if one of them dies and the other lives, a `start` that
  # tried to bring up both would fail on "address in use" for the
  # survivor and leave the network down for a reason that has nothing to
  # do with what actually broke.
  if one_service_running "$pidf"; then
    log "Local $role service already running (pid $(cat "$pidf"))."
    return 0
  fi

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
  # No early return for the pair: each service decides for itself whether
  # it is already up, so a half-dead pair heals instead of failing.
  # Two instances, two roles — see the BOOTSTRAP_URL/RELAY_URL note above
  # for why one is not enough.
  #
  # Measured topology inside the namespace with both up under Holochain
  # 0.7, three conductors: three established TCP connections to the relay
  # port and ZERO to the bootstrap port, no direct conductor-to-conductor
  # TCP, and six UDP sockets (two per conductor, one per address family).
  #
  # Both halves of that are worth stating because both differ from tx5.
  # Bootstrap holds no persistent connection — it is HTTP, used for
  # discovery and then done — so it is reachable-on-demand rather than
  # continuously connected, which is exactly what makes it usable as
  # network-partition.mjs's control. And the UDP sockets are the real peer
  # data path on iroh, with the relay as fallback; under tx5 it was the
  # other way round. See that harness's header.
  start_one_service "bootstrap" "$BOOTSTRAP_PORT" "$SERVICES_LOG" "$SERVICES_PIDFILE"
  start_one_service "relay"     "$RELAY_PORT"     "$RELAY_LOG"     "$RELAY_PIDFILE"
}

# Writes `advanced.k2Gossip.roundTimeoutMs` into a freshly generated node's
# config, and then READS IT BACK. The read-back is not ceremony: an entry under
# `advanced` that kitsune2 does not recognise is discarded in silence, and a
# malformed one fails only the cell's network join while every port keeps
# answering. Neither shows up as a startup failure, so a patch that quietly
# missed would leave the flake in place and the fix recorded as shipped.
set_gossip_config() {
  local name="$1"
  local cfg="$NET_ROOT/$name/conductor-config.yaml"
  [ -f "$cfg" ] || fail "$name has no conductor-config.yaml at $cfg to configure."

  grep -qE '^  advanced:' "$cfg" \
    || fail "$name's config has no 'advanced:' key, so the gossip config cannot be placed under it. \
The generated shape changed; check what 'hc sandbox generate ... network' now writes before adjusting this."

  # Four keys, same treatment each. They are listed as key/value pairs rather
  # than written out four times so that adding a fifth cannot accidentally skip
  # the read-back below, which is the part that makes any of this trustworthy.
  local -a keys=(
    "roundTimeoutMs:$GOSSIP_ROUND_TIMEOUT_MS"
    "initiateIntervalMs:$GOSSIP_INITIATE_INTERVAL_MS"
    "initiateJitterMs:$GOSSIP_INITIATE_JITTER_MS"
    "minInitiateIntervalMs:$GOSSIP_MIN_INITIATE_INTERVAL_MS"
  )

  # The block first, if it is not there at all. Inserted immediately after
  # `advanced:`, which `hc sandbox generate` writes with `irohTransport`
  # already under it — so this adds a sibling module and touches nothing
  # kitsune2 was already being told.
  if ! grep -qE '^    k2Gossip:' "$cfg"; then
    sed -i "s|^  advanced:|  advanced:\n    k2Gossip:|" "$cfg"
  fi

  # IDEMPOTENT, BECAUSE THIS ALSO RUNS ON RESUME. A `start` after a `stop`
  # re-reads the same persistent file, and a blind insert would stack a second
  # copy of every key under `k2Gossip:` each time — duplicate mapping keys,
  # which either error obscurely or silently keep one of the two. So: rewrite
  # the line if it is already there, insert it only if it is not.
  #
  # Resume is covered deliberately rather than incidentally. A network
  # generated before these settings existed would otherwise come back up on
  # kitsune2's defaults while the script reported the new values, and the next
  # person to measure the flake would be measuring the old behaviour.
  local pair key val
  for pair in "${keys[@]}"; do
    key="${pair%%:*}"; val="${pair#*:}"
    if grep -qE "^      $key:" "$cfg"; then
      sed -i "s|^      $key:.*|      $key: $val|" "$cfg"
    else
      sed -i "s|^    k2Gossip:|    k2Gossip:\n      $key: $val|" "$cfg"
    fi
  done

  [ "$(grep -cE '^    k2Gossip:' "$cfg")" = "1" ] \
    || fail "$name's config has $(grep -cE '^    k2Gossip:' "$cfg") 'k2Gossip:' keys under advanced, expected exactly 1. \
A duplicated mapping key would leave it ambiguous which value kitsune2 reads."

  # READ BACK EVERY ONE. Not ceremony: an entry under `advanced` that kitsune2
  # does not recognise is discarded in silence, and a malformed one fails only
  # the cell's network join while every port keeps answering. Neither shows up
  # as a startup failure, so a patch that quietly missed would leave the flake
  # in place and the fix recorded as shipped. A misspelled camelCase key is
  # exactly the mistake this catches.
  for pair in "${keys[@]}"; do
    key="${pair%%:*}"; val="${pair#*:}"
    grep -qE "^      $key: $val\$" "$cfg" \
      || fail "$name's config does not contain '$key: $val' after patching it. \
Nothing would have failed at startup, so this is checked here instead."
    [ "$(grep -cE "^      $key:" "$cfg")" = "1" ] \
      || fail "$name's config has $(grep -cE "^      $key:" "$cfg") '$key' keys under k2Gossip, expected exactly 1."
  done
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
    # Applied before the conductor starts, for the reason
    # `set_gossip_config` gives: a config written before these settings
    # existed would otherwise resume on the 15s default.
    set_gossip_config "$name"

    # APPENDED, NOT TRUNCATED, AND THAT ONE CHARACTER IS THE WHOLE FIX.
    #
    # Every launch path here used `>`, so a node's log was wiped on each start.
    # `partition-rejoin` stops and restarts nodes across its phases and the
    # per-harness census runs after it finishes — so by collection time the
    # BASELINE phase's log was gone and the census was reading whatever the last
    # restart had written. The first slow-baseline failure to carry a gossip
    # timeline duly reported nodeB's first initiation 303.4s after its initiate
    # task, which is a real and interesting number about a RESTARTED node and
    # says nothing about the baseline it was collected to explain.
    #
    # That is the same defect as the `tail -100` one a commit earlier, moved:
    # that discarded the part of the log that mattered, this discarded the part
    # of the RUN that mattered. Fixing where data is kept is useless while the
    # state is overwritten before anyone reads it.
    #
    # Appending keeps a node's whole history across restarts, so
    # `log-census.sh`'s `grep -m1 'Starting initiate task'` finds the ORIGINAL
    # start and the first initiation it pairs with is the baseline one. The cost
    # is a longer log, which is bounded by the harness and already filtered.
    log "Resuming $name (admin :$admin, app :$app, .hc index $idx) with roundTimeoutMs=$GOSSIP_ROUND_TIMEOUT_MS ..."
    ( cd "$NET_ROOT" && echo "$PASSPHRASE" | setsid --fork "$HC_BIN" sandbox -H "$HOLOCHAIN_BIN" --piped -f="$admin" \
        run "$idx" >> "$NET_ROOT/$name.log" 2>&1 )
  else
    # GENERATED WITHOUT `-r`, THEN PATCHED, THEN RUN — three steps where there
    # used to be one, and the split is the whole point. `-r` makes `generate`
    # also start the conductor, and the conductor reads its config once at
    # startup, so with `-r` there is no moment at which the file exists and
    # has not yet been read. Patching afterwards would need a restart, and a
    # restart is not free here: `stall-bisect.mjs` established that the first
    # zome call after a node's first restart in a clean network crashes the
    # ribosome. Setup must not spend that window on the nodes a harness is
    # about to measure.
    log "Generating $name (admin :$admin, app :$app, seed \"$seed\") ..."
    ( cd "$NET_ROOT" && echo "$PASSPHRASE" | "$HC_BIN" sandbox -H "$HOLOCHAIN_BIN" --piped \
        generate -a "$app_id" --in-process-lair --root "$NET_ROOT" -d "$name" \
        -s "$seed" "$HAPP_PATH" \
        network -b "$BOOTSTRAP_URL" quic "$RELAY_URL" >> "$NET_ROOT/$name.log" 2>&1 )
    [ -d "$NET_ROOT/$name" ] || fail "$name was not generated. Log tail:$(echo; tail -n 30 "$NET_ROOT/$name.log")"

    set_gossip_config "$name"

    local gidx
    gidx="$(grep -nxF "$NET_ROOT/$name" "$NET_ROOT/.hc" 2>/dev/null | head -n1 | cut -d: -f1)"
    [ -n "$gidx" ] || fail "$name generated but has no entry in $NET_ROOT/.hc, so it cannot be run by index."
    gidx=$((gidx - 1))
    log "Starting $name (.hc index $gidx) with roundTimeoutMs=$GOSSIP_ROUND_TIMEOUT_MS ..."
    ( cd "$NET_ROOT" && echo "$PASSPHRASE" | setsid --fork "$HC_BIN" sandbox -H "$HOLOCHAIN_BIN" --piped -f="$admin" \
        run "$gidx" -p="$app" >> "$NET_ROOT/$name.log" 2>&1 )
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

  # THE LOG FILTER TOOK, OR SAY SO. "Starting initiate task" is logged once per
  # node by kitsune2_gossip's initiate loop as it starts, so it is present on
  # every healthy node within moments of the ports answering — unlike the
  # per-attempt lines, which depend on gossip having happened yet and would
  # make this a race. Warned rather than fatal: a missing filter degrades the
  # next failure's diagnosis, it does not break the network, and failing the
  # whole run over a log level would be worse than the gap it closes.
  if ! grep -q "Starting initiate task" "$NET_ROOT/$name.log" 2>/dev/null; then
    log "  WARNING: $name logged no 'Starting initiate task' — CUSTOM_FILTER=\"$CUSTOM_FILTER\""
    log "  may not have applied, so a slow-baseline failure will be as mute as the last two."
  fi

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
