#!/usr/bin/env node
// ============================================================================
// scripts/check-ci-scope.mjs — gates `ci-scope.mjs`, the thing that decides a
// pull request may skip the conductor-bound jobs.
//
// WHY THIS IS THE CHECKER THAT MATTERS MOST. Every other checker in this
// repository catches a stale claim. This one catches a silently-green required
// check: if `ci-scope.mjs` calls a diff documentation when it is not, four
// required contexts report success having run nothing, and a merge lands on
// `main` unverified. The gate's whole justification is that its mistakes are
// slow rather than unsafe, and that property is not self-evident from reading
// the regexes — so it is asserted here, on every pull request, in the one
// workflow the gate never touches.
//
// WHAT IT CHECKS.
//
//  1. A case table. The classifications that must hold, including the three
//     that look wrong until you know why: `notes/README.md` is code because
//     `notes/` is an npm package, `docs/holochain-runtime-0.7.patch` is code
//     because it is not prose, and an EMPTY diff is code because a diff we
//     could not read is not a diff we can clear.
//
//  2. Default-deny, probed rather than assumed. A path shape nobody has
//     thought of must classify as code. If someone later rewrites the two
//     regexes as a blocklist, the table above could still pass while this
//     fails.
//
//  3. No gated harness reads a document. This is the hazard the regexes cannot
//     see: if a harness that only `conductor.yml` runs were to read
//     `README.md` or a file under `docs/`, then a documentation change COULD
//     change what that job measures, and skipping it would be wrong. Every
//     script the four gated workflows invoke is scanned for a read of a path
//     this classifier would call documentation.
//
//  4. And no Rust source embeds one. `#![doc = include_str!("../README.md")]`
//     is an ordinary idiom that would make a document part of what `zomes.yml`
//     compiles. Nothing does it today; this is what notices if something
//     starts.
//
//     ITS LIMIT, STATED RATHER THAN IMPLIED: the scan is one level deep and
//     line-shaped. It reads the scripts the workflows name, not what those
//     scripts import, and it clears comment lines rather than parsing them. A
//     harness that reached a document through a helper module would pass this
//     check. What it reliably catches is the direct case, which is the one
//     anybody would actually write.
// ============================================================================

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { classify, isDoc, FILE_CAP } from './ci-scope.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const GATED = ['conductor.yml', 'network.yml', 'ui.yml', 'zomes.yml'];

let failed = 0;
const fail = (msg, ...rest) => {
  failed++;
  console.error(`FAIL: ${msg}`);
  for (const r of rest) console.error(`      ${r}`);
};

// --- 1 and 2. The table, with the reason each case exists in it.
const CASES = [
  [['README.md'], true, 'a root-level document'],
  [['INSTALL.md', 'SECURITY.md', 'READINESS.md'], true, 'several root documents'],
  [['docs/open-work.md'], true, 'the ordered list itself'],
  [['docs/cases/luck-light-egg.md'], true, 'a document one directory down'],
  [['docs/upstream/anything.md'], true, 'and two directories down'],
  [['dna/integrity/src/lib.rs'], false, 'the integrity zome'],
  [['dna/coordinator/src/lib.rs'], false, 'the file whose line numbers the inventory records'],
  [['scripts/check-spec-drift.mjs'], false, 'a checker'],
  [['scripts/live-verify/taxonomy-ui.mjs'], false, 'a harness'],
  [['.github/workflows/ui.yml'], false, 'a workflow — including this gate itself'],
  [['scripts/ci-scope.mjs'], false, 'the classifier must never clear a change to itself'],
  [['mobile-ui/src/main.js'], false, 'the UI the browser harnesses drive'],
  [['notes/README.md'], false, 'notes/ is an npm package, not a documentation tree'],
  [['docs/holochain-runtime-0.7.patch'], false, 'under docs/, but not prose'],
  [['happ.yaml'], false, 'a manifest at the root is not a root-level .md'],
  [['README.md', 'dna/integrity/src/lib.rs'], false, 'MIXED — one code path forces the suite'],
  [[], false, 'an empty list is code, not vacuous documentation'],
  // 2. Default-deny, probed.
  [['Cargo.toml'], false, 'default-deny: an unlisted root file'],
  [['something/nobody/has/added/yet.yaml'], false, 'default-deny: an unknown tree'],
  [['docs/open-work.md.bak'], false, 'default-deny: it only looks like a document'],
  [['README.md/evil.rs'], false, 'default-deny: the pattern is anchored at both ends'],
  [['../README.md'], false, 'default-deny: no traversal'],
];

for (const [files, want, why] of CASES) {
  const got = classify(files).docsOnly;
  if (got !== want) {
    fail(`classify(${JSON.stringify(files)}) returned docsOnly=${got}, expected ${want}`, `(${why})`);
  }
}

// The cap, which is the one case a table of short lists cannot express.
const atCap = Array.from({ length: FILE_CAP }, (_, i) => `docs/d${i}.md`);
if (classify(atCap).docsOnly !== false) {
  fail(`a diff of ${FILE_CAP} documents cleared the gate`,
    `At GitHub's listing cap the file list may be truncated, so it is not known to be documentation.`);
}
if (classify(atCap.slice(0, FILE_CAP - 1)).docsOnly !== true) {
  fail(`a diff of ${FILE_CAP - 1} documents did NOT clear the gate`,
    `The cap is meant to catch truncation, not to penalise a large documentation change.`);
}

// --- 3. No script a gated workflow runs may read a document.
const READS = /\b(?:readFileSync|readFile|createReadStream|openSync|new URL)\b/;
const STRINGS = /['"`]([^'"`\n]+)['"`]/g;

for (const wf of GATED) {
  const path = resolve(REPO, '.github/workflows', wf);
  if (!existsSync(path)) { fail(`${wf} does not exist; GATED in this script is stale`); continue; }
  const yml = readFileSync(path, 'utf8');

  // COMMENT LINES ARE NOT INVOCATIONS, and this cost a red build to learn.
  // `conductor.yml`'s header documents the command that counts its own harness
  // steps, which quotes the `node scripts/live-verify` shape; the scan read
  // that as a script it runs, resolved it to the DIRECTORY, and died with
  // EISDIR rather than failing with a reason. A commented-out invocation does
  // not run either, so dropping these lines costs no coverage — the same rule
  // the per-script scan below already applies to its own input.
  const runLines = yml.split('\n').filter((line) => !line.trim().startsWith('#'));
  const invoked = new Set(
    [...runLines.join('\n').matchAll(/\b(?:node|bash|sh)\s+(scripts\/[\w./-]+)/g)].map((m) => m[1]),
  );
  // `zomes.yml` runs cargo and nothing else, so an empty set is correct there
  // and only there. Anywhere else it means the scan found nothing to scan and
  // would pass vacuously.
  if (invoked.size === 0 && wf !== 'zomes.yml') {
    fail(`${wf} invokes no script under scripts/ — this scan would pass vacuously`);
  }

  for (const rel of invoked) {
    const file = resolve(REPO, rel);
    if (!existsSync(file)) { fail(`${wf} invokes ${rel}, which does not exist`); continue; }
    const src = readFileSync(file, 'utf8');
    src.split('\n').forEach((line, i) => {
      const bare = line.trim();
      if (bare.startsWith('//') || bare.startsWith('#') || bare.startsWith('*')) return;
      if (!READS.test(line)) return;
      for (const [, lit] of line.matchAll(STRINGS)) {
        const cleaned = lit.replace(/^(?:\.\.\/)+/, '');
        if (isDoc(cleaned)) {
          fail(`${rel}:${i + 1} reads ${JSON.stringify(lit)}, which ci-scope.mjs calls documentation`,
            `${wf} is gated on a docs-only diff, so a change to that document would be`,
            `skipped by the very job that reads it. Either stop reading it, or remove`,
            `${wf} from GATED here and from the scope gate in the workflow.`);
        }
      }
    });
  }
}

// --- 4. And the same hazard on the Rust side, which runs no script at all.
// `#![doc = include_str!("../../README.md")]` is an ordinary Rust idiom and it
// would make a documentation change alter what `zomes.yml` compiles.
for (const rel of rustSources(resolve(REPO, 'dna'))) {
  const src = readFileSync(rel, 'utf8');
  src.split('\n').forEach((line, i) => {
    if (!/include_str!|include_bytes!/.test(line)) return;
    for (const [, lit] of line.matchAll(STRINGS)) {
      const cleaned = lit.replace(/^(?:\.\.\/)+/, '');
      if (isDoc(cleaned)) {
        fail(`${rel.slice(REPO.length + 1)}:${i + 1} embeds ${JSON.stringify(lit)} into the build`,
          `zomes.yml is gated, so a change to that document would be skipped by the`,
          `job that compiles it in.`);
      }
    }
  });
}

function rustSources(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'target' || e.name === 'node_modules') continue;
    const p = resolve(dir, e.name);
    if (e.isDirectory()) out.push(...rustSources(p));
    else if (e.name.endsWith('.rs')) out.push(p);
  }
  return out;
}

if (failed) {
  console.error(`\n${failed} problem(s). The gate is not safe to merge in this state.`);
  process.exit(1);
}
console.log(`CI SCOPE GATE SOUND: ${CASES.length} classifications hold, default-deny probed, the ${FILE_CAP}-file cap`);
console.log(`holds in both directions, and no script invoked by ${GATED.join(', ')} reads a document.`);
