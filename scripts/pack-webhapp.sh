#!/usr/bin/env bash
# ============================================================================
# scripts/pack-webhapp.sh — build the installable bundle.
#
# Produces epistemic-resonance-happ.webhapp at the repo root: the DNA, the
# hApp, and the practitioner UI in the single file a Holochain Launcher
# installs. This is the artifact someone who is not us needs in order to
# run this protocol at all.
#
# Why a script rather than four commands in the README: each of the four
# has a non-obvious constraint that was learned the expensive way, and a
# README instruction that drifts from what actually works is worse than
# no instruction. Specifically —
#
#   - `hc` and `holochain` live in ~/.cargo/bin here and are not on every
#     shell's default PATH; scripts/sandbox.sh hit the same thing and
#     documents it at length. Handled below rather than demanded of the
#     caller.
#   - `hc dna pack dna/` names its output from dna.yaml's own `name:`
#     field, writing dna/epistemic-dna.dna — NOT a path derived from the
#     directory or from target/. happ.yaml's own comment records the
#     failure this caused before it was understood.
#   - `hc web-app pack` embeds the UI as an opaque ZIP; it will not zip a
#     directory for you, and points at ./mobile-ui/dist.zip.
#   - The UI must be rebuilt before zipping, or the bundle silently ships
#     whatever dist/ happened to contain from some earlier session. That
#     is the failure mode this script most exists to prevent, because it
#     produces a bundle that is wrong rather than one that errors.
#
# Usage: scripts/pack-webhapp.sh
# ============================================================================
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

export PATH="$HOME/.cargo/bin:$PATH"

if ! command -v hc >/dev/null 2>&1; then
  echo "error: 'hc' not found (looked on PATH and in ~/.cargo/bin)." >&2
  echo "       Install the Holochain CLI, or see README.md section 6.1." >&2
  exit 1
fi

echo "==> hc $(hc --version)"

echo "==> Packing DNA (dna/ -> dna/epistemic-dna.dna)"
hc dna pack dna/

echo "==> Packing hApp (happ.yaml -> epistemic-resonance-happ.happ)"
hc app pack .

echo "==> Building the practitioner UI (mobile-ui/ -> mobile-ui/dist/)"
(
  cd mobile-ui
  # `npm run build` is `tsc && vite build`: the type-check is part of the
  # build on purpose, so a bundle can never ship code that does not
  # type-check against the installed @holochain/client.
  npm run build
)

echo "==> Zipping the UI (mobile-ui/dist/ -> mobile-ui/dist.zip)"
rm -f mobile-ui/dist.zip
# Zipped from INSIDE dist/ so index.html sits at the archive root. A zip
# containing a top-level dist/ directory would install and then serve a
# blank page, since the host looks for index.html at the root.
( cd mobile-ui/dist && zip -qr ../dist.zip . )

echo "==> Packing the webhapp (web-happ.yaml -> epistemic-resonance-happ.webhapp)"
hc web-app pack .

echo
echo "Built: $REPO_ROOT/epistemic-resonance-happ.webhapp"
ls -lh epistemic-resonance-happ.webhapp
