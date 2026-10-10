#!/usr/bin/env bash
# ============================================================================
# scripts/log-census.sh — count known conductor-log signatures, every run.
#
# WHY COUNTS AND NOT LOGS. The question this answers is comparative: does a
# signature appear on HEALTHY runs too? `database is locked` is the standing
# example of one that does, and README.md §9 records it as routine contention
# rather than a cause. A signature that only ever appears on red runs is a
# different kind of thing. Neither can be told apart from a dump that only
# exists when something already failed.
#
# WHY THIS RUNS AFTER EACH HARNESS AND NOT ONCE AT THE END OF THE JOB. Each
# harness step in network.yml begins with `network.sh clean && network.sh
# start`, and `clean` deletes /tmp/epi-net — logs included. A census taken
# once at the end therefore describes only the LAST harness, and a
# convergence failure in an earlier one leaves no trace in it at all. The
# first version of this change made exactly that mistake: it moved collection
# from failure-only to always, and left a different collection gap in place.
#
# Takes a label so two harnesses in one job stay distinguishable — they fail
# differently, and merging their counts would hide which one was speaking.
#
#   scripts/log-census.sh <label> [log-dir]
#
# Always exits 0. It is an observation, never a gate.
# ============================================================================
set -uo pipefail

LABEL="${1:-unlabelled}"
DIR="${2:-${EPI_NET_ROOT:-/tmp/epi-net}}"

# Signatures worth counting, each one already named somewhere in §9 or in a
# harness's own signature table. Add to this list rather than grepping ad hoc
# in a workflow, so every run counts the same things and the series stays
# comparable over time.
SIGNATURES=(
  'initiate too soon'
  'Unsolicited Accept message'
  'iroh connect timed out'
  'Peer behavior error'
  'database is locked'
  'Accept message from wrong peer'
  'already accepted'
  # THE LAST THREE ARE NOT ERRORS, AND THAT IS WHY THEY ARE HERE. The
  # explanation for a slow baseline was the one path that logs nothing wrong:
  # no peer to gossip with at the first attempt, then a silent wait until the
  # next scheduled one. Both slow-baseline failures censused eight or nine
  # lines per node with every error signature at zero, so counting errors
  # harder was never going to reach it. These count whether gossip was
  # ATTEMPTED and whether a target was found — present only because
  # `network.sh` now raises the conductor's log filter to let them through.
  #
  # THAT WAS A HYPOTHESIS AND IT IS NOW MEASURED. `peering-rate.mjs` run
  # 37478744160: every one of the 12 crossings in the 123-153s band contains a
  # single 107-123s stall with zero transport errors, which is
  # `initiate_interval_ms` (120_000 + up to 10s jitter) less the trailing lines
  # of the burst before it. `network.sh` now lowers that interval and the
  # per-peer floor beneath it, so a slow baseline here should become rare — and
  # if it does not, these three counters are how that gets seen. See README §9.
  # THE FETCH QUEUE, ADDED AFTER BATCH 5 PUT THE SUSPECT THERE. The `NoDiff`
  # messages nodeD received all carried non-empty `new_ops`, so ops were
  # announced and enqueued, and nothing downstream of `fetch.request_ops` was
  # instrumented. These four are the chain, and the GAPS between them are what
  # they are for:
  #
  #   processing outgoing request  but no  sending fetch request
  #     -> dropped before sending. The unresponsive-peer path at
  #        `core_fetch.rs:346` removes the request and logs NOTHING, so this
  #        pair is the only way that drop is visible.
  #   sending fetch request        but no  incoming op response
  #     -> sent and never answered.
  #   incoming op response         but no  processed incoming ops
  #     -> answered and not written to the op store.
  #
  # ZERO ACROSS ALL FOUR IS AMBIGUOUS and must not be read as "the queue was
  # idle": it is equally "the filter did not apply". The disambiguator is a
  # trial that CROSSED — a crossing cannot happen without fetching ops, so zero
  # on a passing run means the filter, not the queue.
  'processing outgoing request'
  'sending fetch request'
  'incoming op response'
  'processed incoming ops with op ids'
  'Starting initiate task'
  'Initiated gossip with'
  'No agents with overlapping arcs available'
  # THE INITIATE-LOOP DEAD END, ADDED AFTER BATCH 7 FOUND IT BY HAND. Two
  # trials at a 600s cap failed with nodeD never gossiping at all: one
  # `Attempting to initiate gossip with`, one `Failed to initiate gossip:
  # iroh connect timed out`, and then 584 consecutive `No agents to gossip
  # with` over the remaining 597 seconds. `Initiated gossip with` — already
  # counted above — was ZERO, and so were every NoDiff and every fetch
  # counter, because no round was ever started.
  #
  # Finding that needed downloading the per-trial artifact and reading four
  # conductor logs. These three make the same mode legible from the census
  # line alone, and the diagnostic is a RATIO rather than any single count:
  #
  #   Attempting >> Initiated           -> initiations are being refused or
  #                                        failing, not merely unscheduled
  #   'No agents to gossip with' in the           -> the peer is excluded by a
  #     hundreds, with Initiated at 0                 filter, not absent
  #   'All agents ... are on timeout' tracking    -> the fallback pass is
  #     'No agents to gossip with'                    firing and still empty
  #
  # AND THESE FIRE ROUTINELY IN `partition-rejoin`, WHICH IS NOT THE DEFECT.
  # That harness takes conductors offline on purpose, so a `Failed to initiate
  # gossip` and a run of `No agents to gossip with` are it working. The first
  # run carrying these counters censused nodeB at 7 attempts / 6 initiated / 1
  # failed / 7 on-timeout / 7 no-agents and PASSED every check. The batch 7
  # failures are the same sequence at 1 failed and **584** no-agents, i.e. the
  # whole run — so the diagnostic is the DOSE, and single digits next to a
  # healthy `Initiated` count mean nothing. In `real-gossip` and `peering-rate`,
  # where nothing is taken down deliberately, any non-zero `Failed to initiate
  # gossip` is worth reading.
  #
  # WHY THE FILTER ITSELF CANNOT BE COUNTED: `select_next_target`'s exclusion
  # branches (`initiate.rs:255-277` — expired agent info, missing URL,
  # unresponsive) every one of them bare `continue` with no tracing at all, so
  # there is no line to grep. The filter is identified by ELIMINATION plus the
  # fallback firing, which is what README.md §9 records; these counters are how
  # the elimination gets set up without a manual download next time.
  'Attempting to initiate gossip with'
  'Failed to initiate gossip'
  'All agents with overlapping arcs are on timeout'
  'No agents to gossip with'
  # THE AGENT-INFO PUBLICATION PATH, ADDED WITH THE MODULES THAT CARRY IT.
  # Batch 8 showed the unresponsive block ending when the peer's URL turned
  # over rather than when the entry expired, and these bound the turnover: a
  # failed bootstrap push or a missing current url before it reads very
  # differently from a clean one, and the prune line says whether the old agent
  # info was expiring at the same moment.
  #
  # AND THE TURNOVER ITSELF IS LOGGED, which an earlier version of this comment
  # denied. `core_space.rs:703` is `tracing::info!("Broadcast new agent info to
  # {} peers", ok)` — the successful publish, at INFO, which the base `warn`
  # silences and the module directive in `network.sh` lets through. So the event
  # batch 8 had to infer from peer URLs in the gossip lines is directly
  # countable, and lining nodeA's broadcast timestamps up against nodeD's URL
  # change is now a log read rather than an inference.
  #
  # IT IS ALSO THE CANARY FOR THE THREE MODULES. The other four fire only on
  # failures and prunes, so all-zero is the healthy case and proves nothing
  # about whether the directive took. This one fires on every successful
  # broadcast: **zero here on a healthy run means the filter, not the network.**
  'Broadcast new agent info to'
  'Failed to push agent info to bootstrap server'
  "Not updating agent info because we don't have a current url"
  'Failed to broadcast agent info'
  'Pruning expired agent info'
  # HOLOCHAIN'S INTEGRATION PASS — the clock the gossip cursor actually reads.
  # `new_since` pages the serving peer's store by `stored_at`, which Holochain
  # implements as the INTEGRATION timestamp (`holochain_p2p` `op_store.rs:305`,
  # `op_ids_since_time_batch`). So when a node integrated an op decides whether
  # it offers that op, and on the authoring node that is a separate workflow
  # from authoring.
  #
  # A COUNT, NOT IDENTITIES. The workflow logs `?changed` and `ops_ps` only, so
  # this says when a pass ran and how many ops it took — never which. Per-op
  # integration times would need Holochain patched; its op store has only
  # `warn!` lines. In a `peering-rate` trial, one claim on a fresh network, a
  # pass at t0 against one at t0+423s is still the discrimination that matters.
  'ops integrated'
)

echo "=== log census after ${LABEL} ==="
if [ ! -d "$DIR" ]; then
  echo "  (no $DIR — nothing to count)"
  exit 0
fi

shopt -s nullglob
files=("$DIR"/*.log)
if [ "${#files[@]}" -eq 0 ]; then
  echo "  (no logs in $DIR — nothing to count)"
  exit 0
fi

for f in "${files[@]}"; do
  # `lines` first and deliberately: it says how much of the run this file
  # actually covers. A small number means the census is reading a freshly
  # started network rather than the one the harness exercised, and every
  # count after it is then an artefact of collection rather than evidence.
  printf '  %-22s lines=%-7s ' "$(basename "$f")" "$(wc -l < "$f" 2>/dev/null || echo 0)"
  for sig in "${SIGNATURES[@]}"; do
    # Read the count from grep's OUTPUT, not its exit status: `grep -c` exits
    # 1 on no match, so a bare `|| true` prints nothing and shifts every
    # following field. That bug was live in an ad-hoc monitor used to watch
    # these runs, which printed a stray "0" on its own line.
    n="$(grep -c "$sig" "$f" 2>/dev/null || true)"
    printf '[%s=%s] ' "$sig" "${n:-0}"
  done
  printf 'ERROR=%s\n' "$(grep -c 'ERROR' "$f" 2>/dev/null || true)"

  # WHEN THE FIRST GOSSIP ROUND WAS INITIATED, which is the one thing the
  # counts above cannot say and the only thing that separates the remaining
  # explanations for a slow baseline.
  #
  # THE COUNTS WERE NOT ENOUGH, AND THAT WAS FOUND THE HARD WAY. The log filter
  # that makes these lines exist landed first, and the next failure duly
  # censused "Initiated gossip with=11" — refuting "nothing was ever initiated"
  # and saying nothing at all about WHEN. The timeline was in the log and did
  # not survive to the job output: the end-of-job dump is `tail -100`, the log
  # had grown to 1017 lines, and every surviving initiation timestamp fell
  # AFTER the baseline window it was supposed to explain. Instrumentation that
  # produces the answer and then discards it is worse than none, because the
  # census looks like it reported.
  #
  # ONE LINE PER NODE, ON EVERY RUN, PASS OR FAIL. Per-node and bounded so it
  # cannot grow into the thing that gets tailed away; on every run because this
  # file's own header records what failure-only collection cost last time —
  # three passing runs showed zero occurrences AND zero log, so zero was the
  # absence of the file rather than of the event. A first-initiation time is
  # only meaningful against what healthy runs do.
  first_init="$(grep -m1 'Initiated gossip with' "$f" 2>/dev/null \
    | grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.]+Z' | head -n1)"
  first_task="$(grep -m1 'Starting initiate task' "$f" 2>/dev/null \
    | grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.]+Z' | head -n1)"
  if [ -n "$first_task" ] || [ -n "$first_init" ]; then
    printf '    %-22s initiate-task-at=%s first-initiated-at=%s\n' \
      "$(basename "$f")" "${first_task:-none}" "${first_init:-NEVER}"
  fi
done

exit 0
