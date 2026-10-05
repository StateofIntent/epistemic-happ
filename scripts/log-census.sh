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
done

exit 0
