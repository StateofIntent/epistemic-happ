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
} else {
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
}

// ============================================================================
// SECOND SUBJECT, SAME FAILURE SHAPE: the scope gate.
//
// Four workflows each carry a copy of a `scope` job that decides whether a
// pull request's diff can change what they measure, and skip themselves when
// it cannot. Same reason as above — GitHub Actions has no YAML anchors — and a
// far worse failure if the copies drift: these jobs are four of the five
// REQUIRED contexts, and a job skipped by a conditional reports SUCCESS to
// branch protection. A one-sided edit here does not produce a red that means
// nothing; it produces a GREEN that means nothing.
//
// What is checked:
//   1. Each gated workflow has exactly one marked scope block, and all four
//      are byte-identical.
//   2. Every job in them other than `scope` carries `needs: scope` and the
//      exact gate expression — `!cancelled()` included, which is what stops a
//      failed `scope` from skipping its dependents into a false green.
//   3. live-verify.yml is NOT gated. It holds every checker that reads a
//      document, so if it ever acquires a gate, a documentation-only pull
//      request would be merged with nothing having read the documentation.
//   4. All five required contexts are accounted for: each is either ungated or
//      gated with the exact expression. A required context that is gated some
//      third way is the hole this whole file exists to refuse.
// ============================================================================

const GATED = ['conductor.yml', 'network.yml', 'ui.yml', 'zomes.yml'];
// Item 1.9: the two steps that install and build the publishable packages,
// written once in the workflow whose harnesses drive them and once in the
// workflow that checks whether they would publish. See the block's own header
// in conductor.yml for what drift would cost.
const PKG_FILES = ['conductor.yml', 'live-verify.yml'];
const P_OPEN = '# >>> PACKAGE BUILD';
const P_CLOSE = '# <<< PACKAGE BUILD <<<';
const UNGATED = 'live-verify.yml';
const REQUIRED = ['zomes', 'no-conductor', 'conductor', 'ui', 'network'];
const S_OPEN = '# >>> SCOPE GATE';
const S_CLOSE = '# <<< SCOPE GATE <<<';
const GATE_IF = `    if: \${{ !cancelled() && needs.scope.outputs.docs_only != 'true' }}`;
const JOB_KEY = /^  ([a-z][a-z0-9_-]*):\s*$/;

const read = (f) => readFileSync(resolve(REPO, '.github/workflows', f), 'utf8');

function scopeBlock(file, src) {
  const ls = src.split('\n');
  const found = [];
  let o = null;
  ls.forEach((line, i) => {
    if (line.includes(S_OPEN)) o = i;
    else if (line.includes(S_CLOSE)) {
      if (o === null) fatal(`${file}:${i + 1}: "${S_CLOSE}" with no opening marker above it`);
      found.push({ startLine: o + 2, body: ls.slice(o + 1, i) });
      o = null;
    }
  });
  if (o !== null) fatal(`${file}:${o + 1}: "${S_OPEN}" is never closed`);
  if (found.length !== 1) {
    fatal(`${file}: expected exactly 1 marked scope-gate block, found ${found.length}. `
      + `If this workflow should no longer be gated, remove it from GATED here and from `
      + `scripts/check-ci-scope.mjs, and delete its \`needs: scope\` lines.`);
  }
  return found[0];
}

// --- 1. One block each, and all four the same.
const scopes = GATED.map((f) => ({ file: f, ...scopeBlock(f, read(f)) }));
const canon = scopes[0];
for (const s of scopes.slice(1)) {
  if (s.body.join('\n') === canon.body.join('\n')) continue;
  const n = Math.max(canon.body.length, s.body.length);
  for (let i = 0; i < n; i++) {
    if (canon.body[i] === s.body[i]) continue;
    console.error(`FAIL: the scope gate has drifted between ${canon.file} and ${s.file}.`);
    console.error(`      first difference at offset ${i} into the block:`);
    console.error(`        ${canon.file}:${canon.startLine + i}  ${canon.body[i] === undefined ? '(block ends here)' : JSON.stringify(canon.body[i])}`);
    console.error(`        ${s.file}:${s.startLine + i}  ${s.body[i] === undefined ? '(block ends here)' : JSON.stringify(s.body[i])}`);
    console.error(`      These four jobs decide whether four REQUIRED checks run at all.`);
    console.error(`      Apply the change to every copy.`);
    process.exit(1);
  }
}

// --- 2. Every other job in them is gated, and gated exactly.
const gatedJobs = new Set();
for (const f of GATED) {
  const ls = read(f).split('\n');
  let inJobs = false;
  ls.forEach((line, i) => {
    if (line === 'jobs:') { inJobs = true; return; }
    if (!inJobs) return;
    const m = JOB_KEY.exec(line);
    if (!m || m[1] === 'scope') return;
    const job = m[1];
    const body = [];
    for (let j = i + 1; j < ls.length && !JOB_KEY.test(ls[j]); j++) body.push(ls[j]);
    const head = body.join('\n');
    if (!/^\s*needs: scope$/m.test(head)) {
      fatal(`${f}:${i + 1}: job "${job}" has no \`needs: scope\`, so the scope job cannot gate it. `
        + `Either gate it or move it to an ungated workflow.`);
    }
    if (!body.includes(GATE_IF)) {
      fatal(`${f}:${i + 1}: job "${job}" does not carry the exact gate expression.\n`
        + `      expected: ${JSON.stringify(GATE_IF)}\n`
        + `      Without \`!cancelled()\` a failed scope job SKIPS this one, and a skipped `
        + `job reports success to branch protection — a required check passing having run nothing.`);
    }
    gatedJobs.add(job);
  });
}

// --- 3. The ungated workflow stays ungated.
const lv = read(UNGATED);
if (lv.includes(S_OPEN) || /needs: scope/.test(lv)) {
  fatal(`${UNGATED} has acquired a scope gate. It must not have one: every checker that `
    + `reads README.md, SPEC.md, READINESS.md or anything under docs/ runs there, so gating `
    + `it would let a documentation-only pull request merge with nothing having read the `
    + `documentation it changed.`);
}

// --- 4. Every required context is either ungated or gated exactly.
// Only after `jobs:` — the keys under `on:` sit at the same indent, and
// counting `push` as a job name is how this check would pass vacuously.
const ungatedJobs = new Set();
{
  const ls = lv.split('\n');
  let inJobs = false;
  for (const line of ls) {
    if (line === 'jobs:') { inJobs = true; continue; }
    if (!inJobs) continue;
    const m = JOB_KEY.exec(line);
    if (m) ungatedJobs.add(m[1]);
  }
}
for (const ctx of REQUIRED) {
  if (gatedJobs.has(ctx) || ungatedJobs.has(ctx)) continue;
  fatal(`required context "${ctx}" is neither a gated job in ${GATED.join('/')} nor a job in `
    + `${UNGATED}. Branch protection requires it by name, so it has to be one or the other — `
    + `if it moved, update REQUIRED here.`);
}

// ============================================================================
// THIRD SUBJECT: the package build, shared by conductor.yml and live-verify.yml.
//
// Same shape as the two above and a different consequence. A drifted copy here
// does not skip a check and does not red the wrong job: it makes
// `check-packages.mjs` answer "would this publish?" about a package built
// against a different dependency tree than the harnesses ran against. The
// green stays green and stops being evidence.
// ============================================================================
const pkgBlocks = PKG_FILES.map((f) => {
  const src = read(f);
  const ls = src.split('\n');
  const found = [];
  let o = null;
  ls.forEach((line, i) => {
    if (line.includes(P_OPEN)) o = i;
    else if (line.includes(P_CLOSE)) {
      if (o === null) fatal(`${f}:${i + 1}: "${P_CLOSE}" with no opening marker above it`);
      found.push({ file: f, startLine: o + 2, body: ls.slice(o + 1, i) });
      o = null;
    }
  });
  if (o !== null) fatal(`${f}:${o + 1}: "${P_OPEN}" is never closed`);
  if (found.length !== 1) {
    fatal(`${f}: expected exactly 1 marked package-build block, found ${found.length}. `
      + `If one of these workflows no longer builds the packages, remove it from `
      + `PKG_FILES here and delete its markers.`);
  }
  return found[0];
});
const [pa, pb] = pkgBlocks;
if (pa.body.join('\n') !== pb.body.join('\n')) {
  const n = Math.max(pa.body.length, pb.body.length);
  for (let i = 0; i < n; i++) {
    if (pa.body[i] === pb.body[i]) continue;
    console.error(`FAIL: the package build has drifted between ${pa.file} and ${pb.file}.`);
    console.error(`      first difference at offset ${i} into the block:`);
    console.error(`        ${pa.file}:${pa.startLine + i}  ${pa.body[i] === undefined ? '(block ends here)' : JSON.stringify(pa.body[i])}`);
    console.error(`        ${pb.file}:${pb.startLine + i}  ${pb.body[i] === undefined ? '(block ends here)' : JSON.stringify(pb.body[i])}`);
    console.error(`      check-packages.mjs runs its own build, so what these steps supply is`);
    console.error(`      the dependency tree. One copy resolving the SDK from the registry and`);
    console.error(`      the other from this checkout makes the publishability check green about`);
    console.error(`      a package nobody ran.`);
    process.exit(1);
  }
}
console.log(`package build: identical in ${PKG_FILES.join(' and ')} (${pa.body.length} lines)`);

console.log(`scope gate: identical in all four of ${GATED.join(', ')} (${canon.body.length} lines)`);
console.log(`            ${[...gatedJobs].sort().join(', ')} gated; ${[...ungatedJobs].join(', ')} deliberately not`);
console.log(`            all ${REQUIRED.length} required contexts accounted for`);
