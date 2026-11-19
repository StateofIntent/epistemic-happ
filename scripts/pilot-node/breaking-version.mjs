// scripts/pilot-node/breaking-version.mjs — the desktop's network-seed
// band function, ported, and the ONE copy of it in this repository.
//
// IT LIVES IN ITS OWN FILE SO A CHECK CAN IMPORT IT. `verify.mjs` cannot
// be imported for a function — it is a script with top-level await that
// connects to a conductor and calls `process.exit`. Transcribing this
// into a check instead would put a second copy of the most
// correctness-critical function here in a file nothing compares to the
// first, which is 6.23's wordlist lesson: one copy, and the check imports
// it.
//
// Faithful port of `breakingVersion` in the desktop's
// src/main/filesystem.ts:190. `cli.ts:103` builds the seed as
// `${productName}-${breakingAppVersion()}`, so a 0.4.0 release joins
// 'Epistemic Resonance-0.4.x' — a DIFFERENT network, deliberately: a
// minor is a relaunch, not an upgrade.
//
// `cli.ts` also appends '-dev' when the app is not packaged. A published
// release is packaged, so that branch is not reproduced here; a node
// pointed at a dev build is out of scope and would be told NO.
//
// DIFFERENTIALLY TESTED against the real thing on 2026-11-18 — the real
// `breakingVersion` was transcribed beside this one and both were run
// over 27 version strings (0.0.x, 0.minor.x, major.x.x, prereleases,
// build metadata, v-prefixed tags, and seven malformed inputs). Two
// divergences were found and BOTH were semver being more tolerant:
//   - a leading 'v'  — closed by the `v?` below, since the GitHub tag
//     is the only input this ever sees and it is always v-prefixed;
//   - leading whitespace — LEFT DIVERGENT on purpose, see below.
// Everything else agrees, malformed inputs included: both throw.
//
// WHERE THEY STILL DIFFER THIS PORT IS THE STRICTER ONE, AND THAT IS THE
// SAFE DIRECTION. A tag this regex cannot read throws, which becomes
// CANNOT VERIFY and a non-zero exit — the same fail-loud behaviour as
// limit (2). A looser parse would GUESS a seed, and a guessed seed
// printed as a derived one is the original defect wearing new clothes.
export function breakingVersion(version) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(version);
  if (!m) throw new Error(`release tag is not a semver this can read: ${version}`);
  const [, maj, min, pat, pre] = m;
  if (pre) return `${+maj}.${+min}.${+pat}-${pre.split('.')[0]}`;
  if (+maj !== 0) return `${+maj}.x.x`;
  if (+min === 0) return `0.0.${+pat}`;
  return `0.${+min}.x`;
}
