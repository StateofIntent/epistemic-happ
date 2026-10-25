#!/usr/bin/env node
// ============================================================================
// scripts/ci-scope.mjs — decides whether a pull request's diff can possibly
// change what the conductor-bound jobs measure, so that a documentation change
// stops paying for a real conductor, three conductors and eighteen browser
// harnesses.
//
// WHY THIS EXISTS, AND WHY IT IS NOT THE OBVIOUS FIX. `main` has branch
// protection with `strict: true` and `enforce_admins: true`, so every merge
// puts every other open pull request behind and forces a fresh cycle before it
// can land. On 2026-10-23 fourteen pull requests paid that bill one at a time,
// nine of them touching only Markdown. The cost was read as the price of
// `strict: true` and the decision on the table was whether to relax it.
//
// It is not the price of `strict: true`. It is the price of WHAT `strict: true`
// IS BOUND TO: five required contexts, none of them path-filtered, four of
// which cannot be affected by a Markdown-only diff and all of which ran
// anyway. `strict: true` earns its keep — two pull requests each inserting into
// `dna/coordinator/src/lib.rs` regenerate the validation inventory
// independently, are green alone, and red `main` when the second lands with
// stale line numbers. That is exactly the semantic conflict it catches, and it
// went red in CI on 2026-10-24 for that reason. So the rule stays and the
// binding changes.
//
// WHY NOT A `paths:` FILTER, WHICH IS WHAT THIS WOULD OBVIOUSLY BE. A workflow
// skipped by a `paths:` filter creates NO check run, and a required context
// with no check run leaves the pull request on *"Expected — waiting for
// status"* forever. The documented remedy is a second workflow with the same
// job name, and that remedy is broken here: `paths` and `paths-ignore` are not
// complements — a diff touching one document AND one Rust file satisfies both,
// so the real job and its stub would both report under one name, and a stub's
// green could stand in for the real job's red. A job skipped by a CONDITIONAL
// reports success to branch protection instead, which is what the four
// workflows do with this script's output.
//
// DEFAULT-DENY, AND THAT IS THE WHOLE SAFETY ARGUMENT. A path is documentation
// only if it matches one of two narrow shapes below. Everything else — a new
// top-level directory, a `.patch`, a lockfile, a file type nobody has thought
// of yet — is code, and runs the full suite. The failure mode of a mistake is
// therefore a slow pull request, never an unverified merge.
//
// `notes/README.md` IS CODE, which looks wrong and is the point: `notes/` is an
// npm package with `src/`, `dist/` and a lockfile, and `check-packages.mjs`
// reads a package's README as a publishability input. Only `docs/**.md` and
// root-level `*.md` are documentation here.
//
// WHAT STILL RUNS ON A DOCS-ONLY DIFF: live-verify.yml, in full and ungated.
// That is deliberate and load-bearing. Every checker that reads a document —
// `check-spec-drift.mjs` on SPEC.md and README.md, `check-harness-counts.mjs`
// on README.md and the suite index, `check-ci-scope.mjs` on this file's own
// rules — lives in that workflow, so a documentation claim is still gated by
// CI on every pull request. The gate removes the jobs that read no prose, not
// the ones that do.
//
// Prints `docs_only=true|false` to $GITHUB_OUTPUT, and says why on stdout.
// Exits 0 even when it cannot tell: an unknown answer is reported as `false`,
// because `false` is the answer that runs the tests.
// ============================================================================

import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';

// --- The two shapes that are documentation. Anchored at both ends, so
// `docs/x.md` and `SPEC.md` match while `dna/x.md`, `docs/x.patch` and
// `notes/README.md` do not.
const DOCS = [
  /^[^/]+\.md$/,
  /^docs\/(?:[^/]+\/)*[^/]+\.md$/,
];

// GitHub's own ceiling on the files a pull request will enumerate. A diff at
// the cap is a diff we have not seen all of.
export const FILE_CAP = 3000;

export function isDoc(path) {
  return DOCS.some((re) => re.test(path));
}

/** The classifier. Separated from every bit of GitHub plumbing above and below
 *  so that `check-ci-scope.mjs` tests THIS function rather than a paraphrase
 *  of it. An empty list is code: a diff we could not read is not a diff we can
 *  clear. */
export function classify(files) {
  if (!Array.isArray(files) || files.length === 0) {
    return { docsOnly: false, code: [], reason: 'no files to classify' };
  }
  if (files.length >= FILE_CAP) {
    return { docsOnly: false, code: [], reason: `${files.length} files is at or above GitHub's ${FILE_CAP}-file listing cap, so the diff may be truncated` };
  }
  const code = files.filter((f) => !isDoc(f));
  return {
    docsOnly: code.length === 0,
    code,
    reason: code.length === 0
      ? `all ${files.length} changed paths are documentation`
      : `${code.length} of ${files.length} changed paths are not documentation`,
  };
}

// --- Everything below runs only as a CLI.
if (import.meta.url === `file://${process.argv[1]}`) main();

function main() {
  const event = process.env.GITHUB_EVENT_NAME || '';
  const pr = process.env.PR_NUMBER || '';
  const repo = process.env.GITHUB_REPOSITORY || '';

  // Only a pull request has a diff worth narrowing. A push to `main` runs
  // everything, always: `main` is the tree every other branch is tested
  // against under `strict: true`, so its own verification is never partial.
  if (event !== 'pull_request') {
    return emit(false, `event is "${event || '(unset)'}", not a pull request — the full suite runs`);
  }
  if (!pr || !repo) {
    return warn(`PR_NUMBER=${JSON.stringify(pr)} GITHUB_REPOSITORY=${JSON.stringify(repo)} — cannot ask which files changed`);
  }

  let files;
  try {
    const out = execFileSync('gh', [
      'api', `repos/${repo}/pulls/${pr}/files`,
      '--paginate', '--jq', '.[].filename',
    ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    files = out.split('\n').map((s) => s.trim()).filter(Boolean);
  } catch (err) {
    return warn(`could not list the pull request's files: ${err.message.split('\n')[0]}`);
  }

  const { docsOnly, code, reason } = classify(files);
  console.log(`${files.length} changed path(s) in #${pr}; ${reason}.`);
  if (code.length) {
    console.log('Not documentation, so the full suite runs:');
    for (const f of code.slice(0, 40)) console.log(`  ${f}`);
    if (code.length > 40) console.log(`  … and ${code.length - 40} more`);
  }
  emit(docsOnly, reason);
}

function warn(msg) {
  // A warning rather than a failure, and `false` rather than nothing: if this
  // script cannot tell, the conductor-bound jobs must run. Failing here would
  // skip them instead — a failed `needs` skips its dependents, and a skipped
  // job reports SUCCESS to branch protection. The gate expressions guard that
  // with `!cancelled()`; this guards it a second time.
  console.log(`::warning::ci-scope: ${msg}; running the full suite`);
  emit(false, msg);
}

function emit(docsOnly, reason) {
  console.log(docsOnly
    ? 'DOCS-ONLY: the conductor-bound jobs are skipped. live-verify.yml still runs in full.'
    : 'CODE: every job runs.');
  const out = process.env.GITHUB_OUTPUT;
  if (out) appendFileSync(out, `docs_only=${docsOnly}\nreason=${reason}\n`);
}
