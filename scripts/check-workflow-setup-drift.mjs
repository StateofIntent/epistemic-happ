#!/usr/bin/env node
// ============================================================================
// scripts/check-workflow-setup-drift.mjs — the two jobs in network.yml share
// ten setup steps by COPY, and this is the thing that notices when they stop
// matching.
//
// WHY THIS EXISTS. `partition-rejoin` was split out of `network` on 2026-10-13
// so that a slow gossip baseline would stop blocking merges — branch
// protection requires five checks by name, so a job named anything else is
// advisory by construction. That split is cheap and the harness is untouched,
// but it bought the unblocking with a DUPLICATION: toolchain install, both
// caches, the Holochain 0.7.0 download, `npm ci`, the symlink, and the
// build-and-pack are now written twice in one file. GitHub Actions has no YAML
// anchors, so the alternatives were a composite action or this.
//
// Duplication that nothing checks is how `domain-index`'s count got eight
// short (see check-harness-counts.mjs) and how the surfacing ratio drifted
// before it was gated. The specific failure here is worse than a stale number:
// a Holochain version bump, a cache-key change or a new build flag applied to
// `network` alone would leave `partition-rejoin` building a DIFFERENT hApp from
// the one the required check verified — and its red would then be evidence
// about a stale tree rather than about gossip, which is exactly the
// red-that-means-nothing this repository keeps refusing.
//
// WHAT IT CHECKS. That the text between the `>>> SHARED SETUP` and
// `<<< SHARED SETUP <<<` markers is byte-identical in both jobs. Not a YAML
// comparison: byte equality is stricter, needs no parser, and a comment that
// was updated in one copy and not the other is itself the drift worth
// catching.
//
// Exits non-zero with the first differing line when they diverge.
// ============================================================================

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FILE = 'network.yml';
const PATH = resolve(REPO, '.github/workflows', FILE);

const OPEN = '# >>> SHARED SETUP';
const CLOSE = '# <<< SHARED SETUP <<<';

const src = readFileSync(PATH, 'utf8');
const lines = src.split('\n');

// --- Collect the blocks, keeping the line number each starts at so a failure
// can name a place in the file rather than a block index.
const blocks = [];
let open = null;
lines.forEach((line, i) => {
  if (line.includes(OPEN)) {
    if (open !== null) fatal(`${FILE}:${i + 1}: a second "${OPEN}" opened before line ${open + 1}'s was closed`);
    open = i;
  } else if (line.includes(CLOSE)) {
    if (open === null) fatal(`${FILE}:${i + 1}: "${CLOSE}" with no opening marker above it`);
    blocks.push({ startLine: open + 2, body: lines.slice(open + 1, i) });
    open = null;
  }
});
if (open !== null) fatal(`${FILE}:${open + 1}: "${OPEN}" is never closed`);

function fatal(msg) {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

// --- Two markers, two jobs. One block means the split was undone without the
// markers being removed, which would leave this check passing vacuously.
if (blocks.length !== 2) {
  fatal(`expected 2 shared-setup blocks in ${FILE} (one per job), found ${blocks.length}. `
    + `If the jobs were merged back into one, delete the markers and this script; `
    + `if a third job was added, it needs a marked copy too.`);
}

const [a, b] = blocks;
if (a.body.join('\n') === b.body.join('\n')) {
  console.log(`${FILE}: the two jobs' shared setup is identical (${a.body.length} lines, at :${a.startLine} and :${b.startLine})`);
  process.exit(0);
}

// --- Name the first divergence. A diff of the whole block would bury it.
const n = Math.max(a.body.length, b.body.length);
for (let i = 0; i < n; i++) {
  const la = a.body[i], lb = b.body[i];
  if (la === lb) continue;
  console.error(`FAIL: ${FILE}'s two jobs have drifted apart in their shared setup.`);
  console.error(`      first difference at offset ${i} into the block:`);
  console.error(`        ${FILE}:${a.startLine + i}  ${la === undefined ? '(block ends here)' : JSON.stringify(la)}`);
  console.error(`        ${FILE}:${b.startLine + i}  ${lb === undefined ? '(block ends here)' : JSON.stringify(lb)}`);
  console.error(`      Apply the change to BOTH jobs. They build the hApp that each`);
  console.error(`      job's harness then runs against, so a one-sided edit makes the`);
  console.error(`      advisory job's result evidence about a different tree.`);
  process.exit(1);
}
