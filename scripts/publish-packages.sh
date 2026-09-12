#!/usr/bin/env bash
# ============================================================================
# scripts/publish-packages.sh — publish agent-sdk and mcp-server, with the
# checks that make a version number worth spending bound to the act of
# spending it.
#
# WHY THIS EXISTS. `@stateofintent/agent-sdk@0.1.1` and
# `@stateofintent/mcp-server@0.1.1` are on the registry and fail every zome call
# for anyone who installs them. They were published by hand, and every check
# that existed at the time was green — correctly, because those checks proved
# the tarball was a package, and a broken build is a perfectly good package.
# README §9 records the republish as blocked on credentials, which is true and
# was never the whole story: it was also blocked on any way to know the next
# publish would be better than the last.
#
# So this script does not just publish. It refuses to, unless the one check that
# would have caught 0.1.1 has just passed against a real conductor:
# `scripts/live-verify/published-packages.mjs` packs both packages, installs
# them into an empty project with a FRESH dependency resolution, and writes a
# claim from that install. Its header explains why the two checks either side of
# it are both green on the broken release.
#
# THE ORDER IS NOT A DETAIL. mcp-server depends on agent-sdk, so agent-sdk goes
# first and mcp-server only after the registry can actually serve it — otherwise
# the first person to install mcp-server resolves whatever agent-sdk version
# already existed, which is the broken one this is replacing.
#
# DRY RUN BY DEFAULT. Publishing is irreversible: npm does not allow a version
# number to be reused, so a mistaken publish spends it permanently. Run with no
# arguments to see exactly what would happen; pass --publish to do it.
#
# USAGE
#   scripts/publish-packages.sh              # preflight + dry run, changes nothing
#   scripts/publish-packages.sh --publish    # the same preflight, then publish
#   SKIP_LIVE=1 scripts/publish-packages.sh  # preflight without a conductor
#                                            # (dry run only; refused for --publish)
#
# Requires `npm whoami` to succeed — i.e. a person with publish rights on the
# @stateofintent scope, which is the part no workflow here can do.
#
# RUN --publish FROM A REAL TERMINAL. If the account has 2FA on writes — the
# common case, and increasingly the only one npm supports for direct publishing
# — npm demands a one-time password per publish and can only ask for one
# interactively. There is no terminal in a pipe, a hook, CI, or an agent's
# shell, and there npm fails with EOTP rather than prompting. Preflight now
# refuses that combination up front instead of discovering it after every check
# has passed; see the comment on TFA_MODE for why the timing was the real bug.
# Failing that, supply two codes from an authenticator app:
#
#   NPM_OTP=<code> NPM_OTP_2=<code> scripts/publish-packages.sh --publish
#
# Two codes, not one: the second publish waits for the registry to serve
# agent-sdk first, and a TOTP will not still be valid by then.
# ============================================================================
set -euo pipefail

cd "$(dirname "$0")/.."
REPO="$PWD"
PACKAGES=(agent-sdk mcp-server)
TO_PUBLISH=()
PUBLISHED_ALREADY=()
PUBLISH=0
[ "${1:-}" = "--publish" ] && PUBLISH=1

say()  { echo "==> $*"; }
fail() { echo "!!! $*" >&2; exit 1; }

# --- Preflight ---------------------------------------------------------------
# Every one of these is a thing that has actually gone wrong somewhere, and each
# is cheaper to hit here than after a version number is spent.

say "Preflight"

git diff --quiet && git diff --cached --quiet \
  || fail "The working tree is dirty. Publish from a clean tree, so the tarball matches a commit somebody can check out."

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
[ "$BRANCH" = "main" ] \
  || echo "    warning: publishing from '$BRANCH', not main"

WHO="$(npm whoami 2>/dev/null || true)"
[ -n "$WHO" ] \
  || fail "Not logged in to npm. Run 'npm login' as somebody with publish rights on @stateofintent."
echo "    npm user: $WHO"

# WHETHER A ONE-TIME PASSWORD CAN BE ANSWERED IS A PREFLIGHT QUESTION, AND USED
# NOT TO BE. `tfa.mode` of "auth-and-writes" means the registry demands an OTP
# for EVERY publish. npm can only ask for one on an interactive terminal — the
# default `auth-type` is `web`, whose prompt opens a browser — so a run with no
# tty gets `npm error code EOTP` the instant it reaches the first publish, with
# every check already green behind it. Observed 2026-09-12: a full preflight,
# both packaging suites and the live check passed, then EOTP, four minutes spent
# and nothing published.
#
# THE WASTED RUN IS THE SMALL VERSION. The publishes are ordered — agent-sdk
# first, mcp-server only once the registry serves it — so an OTP that cannot be
# answered AFTER the first one leaves the SDK published and this package not,
# which is the split state the ordering exists to prevent. So this is checked
# here, before anything is spent, and checked for BOTH publishes.
TFA_JSON="$(npm profile get --json 2>/dev/null || true)"
TFA_MODE="$(TFA_JSON="$TFA_JSON" node -p '(()=>{try{return JSON.parse(process.env.TFA_JSON).tfa.mode||""}catch(e){return ""}})()' 2>/dev/null || true)"
OTP_NEEDED=0
if [ "$TFA_MODE" = "auth-and-writes" ]; then
  OTP_NEEDED=1
  echo "    2FA: $TFA_MODE — one OTP per publish, so two for this run"
elif [ -n "$TFA_MODE" ]; then
  echo "    2FA: $TFA_MODE — no OTP required to publish"
else
  echo "    2FA: could not be read; assuming npm will ask if it needs to"
fi

# A tty needs nothing from us: npm asks, and its own prompt is the only path
# that also works for an account whose second factor is a passkey rather than a
# code. Without one, two codes have to be supplied up front — two, not one,
# because a TOTP lives about thirty seconds and the wait for the registry to
# serve agent-sdk can outlast that.
if [ "$PUBLISH" = "1" ] && [ "$OTP_NEEDED" = "1" ] && [ ! -t 0 ]; then
  [ -n "${NPM_OTP:-}" ] && [ -n "${NPM_OTP_2:-}" ] \
    || fail "This account requires an OTP per publish and there is no terminal to ask on.
    Run it from a real terminal window — not a pipe, a hook, CI, or an agent's
    shell — and npm will prompt twice. Or supply two codes from your
    authenticator: NPM_OTP=<code> NPM_OTP_2=<code> scripts/publish-packages.sh --publish
    Two, because the second publish happens after the wait for the registry and
    one code will not still be valid."
fi

for pkg in "${PACKAGES[@]}"; do
  name="$(node -p "require('./$pkg/package.json').name")"
  version="$(node -p "require('./$pkg/package.json').version")"
  echo "    $pkg -> $name@$version"

  # The single most common way to waste an afternoon: the version was never
  # bumped, and npm refuses at the very end after everything else passed.
  #
  # AN ALREADY-PUBLISHED VERSION IS NOT ALWAYS A MISTAKE, THOUGH, AND TREATING
  # IT AS ONE MADE THE WORST CASE UNRECOVERABLE. The publishes are ordered, so a
  # run that publishes agent-sdk and then fails — a stale OTP, a dropped
  # connection, anything — leaves exactly one of the two on the registry. That
  # is the state the ordering exists to pass through safely, and refusing the
  # whole run because of it left the only way forward a hand-typed
  # `npm publish`, which is how 0.1.1 shipped. So a version already on the
  # registry means "nothing to do for this package", loudly; it is a failure
  # only when that is true of every package and the run has no work at all.
  if npm view "$name@$version" version >/dev/null 2>&1; then
    echo "    ALREADY PUBLISHED — skipping $pkg (nothing to do, not an error)"
    PUBLISHED_ALREADY+=("$pkg")
  else
    TO_PUBLISH+=("$pkg")
  fi
done

[ "${#TO_PUBLISH[@]}" -gt 0 ] \
  || fail "Both packages are already on the registry at these versions. Bump them in package.json — npm will not let a version be reused."

if [ "${#PUBLISHED_ALREADY[@]}" -gt 0 ]; then
  echo "    resuming: ${#PUBLISHED_ALREADY[@]} already published, ${#TO_PUBLISH[@]} to go"
fi

# mcp-server must require the agent-sdk version being published, not merely
# some earlier one. `^0.1.1` happily resolves the broken 0.1.1 if 0.1.2 is the
# thing being fixed and the range was never tightened.
SDK_VERSION="$(node -p "require('./agent-sdk/package.json').version")"
SDK_RANGE="$(node -p "require('./mcp-server/package.json').dependencies['@stateofintent/agent-sdk']")"
case "$SDK_RANGE" in
  *"$SDK_VERSION"*) : ;;
  *) fail "mcp-server depends on agent-sdk '$SDK_RANGE', which does not name $SDK_VERSION. Tighten it, or an installer can resolve the version being replaced." ;;
esac
echo "    mcp-server requires agent-sdk $SDK_RANGE (publishing $SDK_VERSION)"

# --- The checks --------------------------------------------------------------

say "Packaging checks (scripts/check-packages.mjs)"
node scripts/check-packages.mjs

if [ "${SKIP_LIVE:-0}" = "1" ]; then
  [ "$PUBLISH" = "0" ] \
    || fail "SKIP_LIVE=1 cannot be combined with --publish. The live check is the only one that would have caught 0.1.1."
  echo "    SKIPPED by SKIP_LIVE=1 — dry run only"
else
  say "Live check: the installed tarball against a real conductor"
  echo "    (scripts/live-verify/published-packages.mjs — needs a running sandbox)"
  if ! scripts/sandbox.sh status >/dev/null 2>&1; then
    fail "No conductor is running. Start one: scripts/sandbox.sh clean && scripts/sandbox.sh start"
  fi
  node scripts/live-verify/published-packages.mjs
fi

# --- Publish -----------------------------------------------------------------

if [ "$PUBLISH" = "0" ]; then
  say "Dry run — nothing was published"
  for pkg in "${PACKAGES[@]}"; do
    ( cd "$REPO/$pkg" && npm publish --dry-run 2>&1 | sed 's/^/    /' )
  done
  echo
  echo "Everything above passed. To publish for real:"
  echo "    scripts/publish-packages.sh --publish"
  exit 0
fi

# One publish, answering an OTP the way this particular run is able to. On a tty
# that is "let npm ask"; with no tty it is the code preflight already insisted on.
# A package preflight found already published is skipped here rather than
# re-attempted, which is what makes a half-finished run resumable.
publish_one() {
  local pkg="$1" otp="$2"
  for done_pkg in ${PUBLISHED_ALREADY[@]+"${PUBLISHED_ALREADY[@]}"}; do
    if [ "$done_pkg" = "$pkg" ]; then
      echo "    already on the registry — skipped"
      return 0
    fi
  done
  if [ "$OTP_NEEDED" = "1" ] && [ -n "$otp" ]; then
    ( cd "$REPO/$pkg" && npm publish --otp="$otp" )
  else
    ( cd "$REPO/$pkg" && npm publish )
  fi
}

# agent-sdk FIRST, and mcp-server only once the registry can serve it.
say "Publishing agent-sdk"
publish_one agent-sdk "${NPM_OTP:-}"

SDK_NAME="$(node -p "require('./agent-sdk/package.json').name")"
say "Waiting for $SDK_NAME@$SDK_VERSION to be resolvable"
for attempt in 1 2 3 4 5 6 7 8 9 10; do
  if npm view "$SDK_NAME@$SDK_VERSION" version >/dev/null 2>&1; then
    echo "    resolvable after $attempt attempt(s)"
    break
  fi
  [ "$attempt" = "10" ] \
    && fail "$SDK_NAME@$SDK_VERSION is published but not yet resolvable. Do NOT publish mcp-server until it is, or the first install of mcp-server resolves the version this replaces."
  sleep 6
done

# If this one is refused for a stale OTP, agent-sdk is already published and
# only this call needs repeating — re-running the whole script is safe, since it
# refuses an already-published version rather than doing anything twice.
say "Publishing mcp-server"
publish_one mcp-server "${NPM_OTP_2:-}"

say "Published. Tag the commit so the tarballs map to something checkoutable:"
echo "    git tag agent-sdk-v$SDK_VERSION && git tag mcp-server-v$(node -p "require('./mcp-server/package.json').version")"
echo "    git push --tags"
echo
echo "Then update README §9: the republish is the only open item with outside impact,"
echo "and it stops being open the moment this succeeds."
