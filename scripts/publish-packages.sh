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
# ============================================================================
set -euo pipefail

cd "$(dirname "$0")/.."
REPO="$PWD"
PACKAGES=(agent-sdk mcp-server)
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

for pkg in "${PACKAGES[@]}"; do
  name="$(node -p "require('./$pkg/package.json').name")"
  version="$(node -p "require('./$pkg/package.json').version")"
  echo "    $pkg -> $name@$version"

  # The single most common way to waste an afternoon: the version was never
  # bumped, and npm refuses at the very end after everything else passed.
  if npm view "$name@$version" version >/dev/null 2>&1; then
    fail "$name@$version is ALREADY on the registry. Bump the version in $pkg/package.json — npm will not let it be reused."
  fi
done

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

# agent-sdk FIRST, and mcp-server only once the registry can serve it.
say "Publishing agent-sdk"
( cd "$REPO/agent-sdk" && npm publish )

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

say "Publishing mcp-server"
( cd "$REPO/mcp-server" && npm publish )

say "Published. Tag the commit so the tarballs map to something checkoutable:"
echo "    git tag agent-sdk-v$SDK_VERSION && git tag mcp-server-v$(node -p "require('./mcp-server/package.json').version")"
echo "    git push --tags"
echo
echo "Then update README §9: the republish is the only open item with outside impact,"
echo "and it stops being open the moment this succeeds."
