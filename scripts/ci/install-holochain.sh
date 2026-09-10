#!/usr/bin/env bash
# ============================================================================
# scripts/ci/install-holochain.sh — put the pinned `hc` and `holochain`
# binaries in ~/.cargo/bin, and do not let a transient network failure take a
# whole CI job with it.
#
# WHY THIS EXISTS. Three workflows — conductor.yml, ui.yml and network.yml —
# each began with the same four lines of `gh release download`, with no retry.
# That step failed three separate ways in a single afternoon, none of them
# anything this repository controls:
#
#     4 x  HTTP 500 from api.github.com                  (hc, ~20 MB)
#     1 x  connection reset by peer from
#          release-assets.githubusercontent.com          (holochain, 54 MB)
#
# Every one of them passed on re-run against an identical tree, and the same
# assets downloaded cleanly from a development machine three times in a row
# while CI was failing on them. It is the FIRST real step in those jobs, so
# when it flakes it takes the whole job with it and produces a red tick that
# means nothing — which this repository has twice decided is worse than no
# tick at all.
#
# WHY IT IS SHAPED THE WAY IT IS. A retry that hides a real outage is the same
# mistake as a timeout raised to hide a stall, so three properties matter more
# than the retry itself:
#
#   1. IT ASSERTS ON THE BINARY, NOT ON THE EXIT CODE. The success condition
#      for an attempt is that the downloaded file runs and reports the pinned
#      version — not that `gh` returned 0. A truncated 54 MB asset, an HTML
#      error page written to the output path, or a redirect that quietly
#      served a different release all exit 0 somewhere in the chain and all
#      fail here. This is also what keeps the version pin real rather than
#      decorative: 0.7.1 is a failure, because the zomes pin `hdk = "=0.7.0"`
#      and results about a version nothing here builds against are worse than
#      no results.
#
#   2. IT DOES NOT RETRY A PERMANENT FAILURE. A missing release, a renamed
#      asset or a 404 is a real break in this repository's assumptions, and
#      retrying it four times converts a clear error into a slow, confusing
#      one. Those fail on the first attempt, immediately and loudly. Only the
#      transport-shaped failures above are retried.
#
#   3. IT SAYS HOW MANY ATTEMPTS IT MADE. A retry that succeeds silently turns
#      a degrading dependency into an invisible one, and the second time the
#      whole afternoon goes red nobody knows it had been flaking for a week.
#      Any download that needed more than one attempt raises a ::warning:: on
#      the job, so a slow success still shows up as something that happened.
#
# The backoff is bounded and short on purpose. The observed failures were
# instantaneous refusals, not rate limits, so the cost of a retry is a few
# seconds against a job that runs for six to twenty-six minutes; and a bound
# of four attempts means a genuine outage still fails this job in under a
# minute rather than parking a runner.
#
# USAGE
#   scripts/ci/install-holochain.sh
#
# Environment (all optional, and all defaulted for CI):
#   HOLOCHAIN_TAG       release tag to pull from   (default holochain-0.7.0)
#   HOLOCHAIN_VERSION   version the binaries must report (default 0.7.0)
#   INSTALL_ATTEMPTS    bound on attempts per binary    (default 4)
#   DEST                install directory          (default ~/.cargo/bin)
#
# Requires `gh` on PATH and GH_TOKEN in the environment, both of which the
# GitHub-hosted runners provide.
# ============================================================================
set -euo pipefail

TAG="${HOLOCHAIN_TAG:-holochain-0.7.0}"
VERSION="${HOLOCHAIN_VERSION:-0.7.0}"
ATTEMPTS="${INSTALL_ATTEMPTS:-4}"
DEST="${DEST:-$HOME/.cargo/bin}"
REPO=holochain/holochain
TARGET=x86_64-unknown-linux-gnu

# Backoff between attempts, in seconds. One entry per gap, so this list also
# bounds the retries independently of INSTALL_ATTEMPTS being sane.
BACKOFF=(5 15 30)

# The smallest either asset has ever plausibly been. This is a sanity floor,
# not a checksum: its job is to turn "downloaded a 2 KB HTML error page" into
# a clear message rather than an exec failure with no explanation.
MIN_BYTES=1000000

# What each binary must say for itself. `hc --version` and `holochain
# --version` do not use the same name, and asserting the exact string is what
# catches a redirect to a neighbouring release.
version_string_for() {
  case "$1" in
    hc)        echo "holochain_cli $VERSION" ;;
    holochain) echo "holochain $VERSION" ;;
    *) echo "::error::install-holochain.sh does not know what '$1 --version' should print" >&2; exit 1 ;;
  esac
}

# A failure is permanent when retrying it cannot help: the release or the
# asset is not what this repository thinks it is. Those must fail on the
# first attempt, so the error a person reads is the real one.
is_permanent_failure() {
  grep -qiE 'release not found|no assets? match|could not find|not found \(HTTP 404\)|HTTP 404' <<<"$1"
}

log()  { echo "$*"; }
warn() { echo "::warning::$*"; }
fail() { echo "::error::$*" >&2; exit 1; }

install_one() {
  local bin="$1"
  local asset="$bin-$TARGET"
  local want; want="$(version_string_for "$bin")"
  local tmp="$DEST/.$bin.download"
  local attempt=1
  local why=""
  # The reason the PREVIOUS attempt failed, kept across the reset below so a
  # download that eventually succeeds can still say what it was recovering
  # from — a warning that names no cause is the shape this repository keeps
  # complaining about elsewhere.
  local last_why=""

  while [ "$attempt" -le "$ATTEMPTS" ]; do
    log "--- $bin: attempt $attempt of $ATTEMPTS ($asset from $TAG)"
    rm -f "$tmp"
    why=""

    # `gh`'s own diagnosis is captured rather than streamed, because it is
    # what decides between a retry and an immediate failure below.
    local out=""
    if ! out="$(gh release download "$TAG" -R "$REPO" -p "$asset" -O "$tmp" --clobber 2>&1)"; then
      why="gh release download failed: ${out:-no output}"
      log "    $why"
      if is_permanent_failure "$out"; then
        fail "$bin: $why — this is not transient (the release or asset is missing or renamed), so it is not retried"
      fi
    else
      [ -n "$out" ] && log "    $out"

      # From here the exit code has already said yes, and every remaining
      # check is on the file itself.
      local size=0
      [ -f "$tmp" ] && size="$(stat -c %s "$tmp" 2>/dev/null || echo 0)"

      if [ ! -f "$tmp" ]; then
        why="gh exited 0 but wrote no file to $tmp"
      elif [ "$size" -lt "$MIN_BYTES" ]; then
        why="downloaded $size bytes, under the $MIN_BYTES-byte floor — a truncated asset or an error page, not a binary"
      else
        chmod +x "$tmp"
        local got=""
        if ! got="$("$tmp" --version 2>&1)"; then
          why="the downloaded file will not run: ${got:-no output}"
        elif [ "$got" != "$want" ]; then
          # A wrong-but-working binary is a permanent failure too: no number
          # of retries turns 0.7.1 into 0.7.0, and a silent version drift is
          # the failure this pin exists to prevent.
          fail "$bin reports '$got', expected '$want' — the pin is $TAG and nothing here builds against another version"
        else
          mv -f "$tmp" "$DEST/$bin"
          if [ "$attempt" -gt 1 ]; then
            warn "$bin downloaded on attempt $attempt of $ATTEMPTS — the asset host is flaking; the previous attempt failed because: $last_why"
          fi
          log "    ok: $DEST/$bin ($size bytes) reports '$got'"
          return 0
        fi
      fi
      log "    $why"
    fi

    last_why="$why"
    if [ "$attempt" -lt "$ATTEMPTS" ]; then
      local gap="${BACKOFF[$((attempt - 1))]:-${BACKOFF[-1]}}"
      log "    retrying in ${gap}s"
      sleep "$gap"
    fi
    attempt=$((attempt + 1))
  done

  rm -f "$tmp"
  fail "$bin: $ATTEMPTS attempts all failed, last because: $why — this is a real outage or a real break, not a flake this script should paper over"
}

mkdir -p "$DEST"
for b in hc holochain; do
  install_one "$b"
done

# Proof from PATH rather than from the paths this script just wrote, because
# what everything downstream — pack-webhapp.sh, sandbox.sh, network.sh —
# actually resolves is PATH or ~/.cargo/bin, and a binary installed somewhere
# they cannot see is not installed.
export PATH="$DEST:$PATH"
hc --version
holochain --version
[ "$(hc --version)" = "$(version_string_for hc)" ] \
  || fail "hc on PATH is not $VERSION — something else is shadowing $DEST/hc"
[ "$(holochain --version)" = "$(version_string_for holochain)" ] \
  || fail "holochain on PATH is not $VERSION — something else is shadowing $DEST/holochain"
