#!/usr/bin/env bash
# ============================================================================
# scripts/run-clock-skew-probe.sh — drives scripts/live-verify/clock-skew-reveal.mjs
# (READINESS.md queue item 13) against a conductor whose clock this script owns.
#
# WHY A WRAPPER EXISTS. The probe needs the AUTHORING conductor's clock to lie,
# and a conductor started normally stamps real time. libfaketime does it via
# LD_PRELOAD, which has to be in place when `holochain` is EXECED — so it has
# to wrap `sandbox.sh start`, not the probe alone. FAKETIME_TIMESTAMP_FILE plus
# FAKETIME_NO_CACHE=1 lets the probe rewrite the offset between phases and have
# both processes pick it up on their next clock_gettime.
#
# NOT A CI CHECK, and deliberately not wired into any workflow: it needs
# libfaketime built locally, and it manipulates a clock, which is not a thing
# to do on a shared runner. It answers a question once and records the answer.
#
# Requires FAKETIME_LIB to point at a built libfaketime .so, e.g.
#   git clone --depth 1 https://github.com/wolfcw/libfaketime
#   make -C libfaketime/src
#   FAKETIME_LIB=$PWD/libfaketime/src/libfaketime-time64.so.1 scripts/run-clock-skew-probe.sh
# ============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."

: "${FAKETIME_LIB:?set FAKETIME_LIB to a built libfaketime .so — see the header of this file}"
[ -f "$FAKETIME_LIB" ] || { echo "FAKETIME_LIB does not exist: $FAKETIME_LIB" >&2; exit 1; }

TSF="${TSF:-$(mktemp -t faketime.XXXXXX.rc)}"
printf '%s' '+0' > "$TSF"

export LD_PRELOAD="$FAKETIME_LIB"
export FAKETIME_TIMESTAMP_FILE="$TSF"
export FAKETIME_NO_CACHE=1
# Fake CLOCK_REALTIME only, as a precaution rather than a measured fix: tokio's
# timers are built on CLOCK_MONOTONIC and this probe has no reason to disturb
# them. Action timestamps come from SystemTime::now(), i.e. CLOCK_REALTIME,
# which is the only clock it needs to move. (An earlier revision of this file
# claimed the conductor HANGS without this, "measured" — that was wrong. The
# hang had a different cause, recorded on the redirect below.)
export FAKETIME_DONT_FAKE_MONOTONIC=1

echo "### clock file: $TSF (starting at +0, i.e. real time)"
echo "### real time : $(date -u)"
echo

cleanup() {
  printf '%s' '+0' > "$TSF" 2>/dev/null || true
  echo
  echo "### tearing the sandbox down"
  LD_PRELOAD= scripts/sandbox.sh clean >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "### starting a clean sandbox UNDER the faked clock"
scripts/sandbox.sh clean >/dev/null 2>&1 || true
# DO NOT PIPE `start` ANYWHERE. sandbox.sh's own header documents this and it
# cost ten minutes here anyway: `start` leaves a conductor running that
# inherits this script's stdout, so `start | tail` never terminates — tail
# cannot print until the write end closes and the conductor holds it open.
# It looks exactly like a conductor that failed to come up. Redirect to a file.
START_LOG="${TSF%.rc}.sandbox.log"
scripts/sandbox.sh start > "$START_LOG" 2>&1
tail -4 "$START_LOG"
echo

echo "### running the probe"
node scripts/live-verify/clock-skew-reveal.mjs
