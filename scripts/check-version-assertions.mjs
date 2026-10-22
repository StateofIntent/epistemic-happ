#!/usr/bin/env node
// ============================================================================
// scripts/check-version-assertions.mjs — a harness must not pin the DATE of a
// fork.
//
// WHY THIS EXISTS, and it is a measurement rather than a worry. On 2026-10-21
// `past-cone.mjs` asserted `identity.declared_version === 10`, because 10 was
// the version the `past_cone` field had just cost. Settlement bumped the
// network to 11 the next day. The `conductor` job went red at 14:20 and stayed
// red for eleven hours across three runs — on a field that was entirely fine,
// in a file nobody had touched, reporting a SETUP failure that reads exactly
// like a defect. Run 39615975688 is the first one.
//
// Nothing could have caught it. `check-spec-drift` reads the specification,
// `check-harness-counts` counts `check()` call sites, and `enumerate.mjs`
// parses the zomes — none of them look at what a harness ASSERTS about its
// environment. The only thing that runs the harnesses is the conductor job
// itself, which needs a built hApp and nine minutes.
//
// THE RULE. A protocol-version field compared for EQUALITY against a numeric
// literal is an error:
//
//     identity.declared_version === 10          <-- rots at the next bump
//     identity.implemented_version !== 11       <-- same
//
// What a harness is entitled to assert is that the bump HAPPENED — the field
// it is testing does not exist below that version — and that the two numbers
// agree with each other. Both survive every later bump:
//
//     identity.declared_version >= CONE_VERSION           // a floor
//     identity.implemented_version === identity.declared_version
//     identity.declared_version === EXPECTED              // read from dna.yaml
//
// SO THERE IS NO EXEMPTION LIST, deliberately, and that is a claim rather than
// an omission. The one file that must pin an exact number is
// `protocol-version.mjs`, which gates the version mechanism itself — and it
// already derives that number from `dna/dna.yaml` rather than carrying one.
// Any site that wants an exact version can do the same, so an exemption would
// only ever record that somebody did not.
//
// AND IT CHECKS THE FLOORS TOO, which is the inverse rot. A floor ABOVE the
// version the DNA currently declares can never pass: `>= 12` on a network at
// 11 is a check that is red by construction, which is the same defect from the
// other direction and is invisible until somebody runs it.
//
// WHAT IT DOES NOT CHECK. It reads JavaScript as text, with comments and
// string literals stripped, so it sees comparisons rather than meaning. A
// version number carried in a variable, built by arithmetic, or compared
// inside a string is outside its reach. A green run means no site pins a
// literal in the shape that has actually rotted here.
// ============================================================================
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const SCAN = ['scripts'];
const SELF = 'scripts/check-version-assertions.mjs';

// The version the network actually declares, from the same file
// `protocol-version.mjs` reads — one source of truth, not a second copy.
const dnaYaml = readFileSync(join(ROOT, 'dna/dna.yaml'), 'utf8');
const DECLARED = Number((/^\s*protocol_version:\s*(\d+)\s*$/m.exec(dnaYaml) ?? [])[1]);
if (!Number.isInteger(DECLARED)) {
  console.log('::error::dna/dna.yaml does not declare a protocol_version this check can read.');
  process.exit(1);
}

function* files(dir) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* files(p);
    else if (name.endsWith('.mjs')) yield p;
  }
}

// Comments and string literals go first: this file's own header quotes the
// forbidden shape, and a check() message may legitimately print a version.
const strip = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
  .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
  .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
  .replace(/`(?:[^`\\]|\\.)*`/g, '``');

const FIELD = '(?:declared_version|implemented_version|protocol_version)';
const EQ = new RegExp(`${FIELD}\\s*(===|==|!==|!=)\\s*(\\d+)|(\\d+)\\s*(===|==|!==|!=)\\s*[\\w.?]*${FIELD}`, 'g');
// A floor is usually written against a named constant rather than a bare
// number — `>= CONE_VERSION` — precisely because the name says WHY that
// version. So the constants are resolved per file, or this half of the check
// would see nothing and silently pass on every real site.
const FLOOR = new RegExp(`${FIELD}\\s*(>=|>)\\s*(\\d+|[A-Z][A-Z0-9_]*)`, 'g');
const CONSTS = /\bconst\s+([A-Z][A-Z0-9_]*)\s*=\s*(\d+)\s*;/g;

const pinned = [];
const floors = [];
for (const dir of SCAN) {
  for (const path of files(join(ROOT, dir))) {
    const rel = relative(ROOT, path);
    if (rel === SELF) continue;
    const src = readFileSync(path, 'utf8');
    const code = strip(src);
    const lineOf = (idx) => code.slice(0, idx).split('\n').length;
    for (const m of code.matchAll(EQ)) {
      pinned.push({ rel, line: lineOf(m.index), text: m[0].trim(), n: Number(m[2] ?? m[3]) });
    }
    const consts = new Map([...code.matchAll(CONSTS)].map((m) => [m[1], Number(m[2])]));
    for (const m of code.matchAll(FLOOR)) {
      const raw = m[2];
      const n = /^\d+$/.test(raw) ? Number(raw) : consts.get(raw);
      // A floor against a name this file does not define is out of reach:
      // reported as unresolved rather than assumed fine, since an assumption
      // is what this whole check exists to stop.
      floors.push({ rel, line: lineOf(m.index), text: m[0].trim(), n, raw });
    }
  }
}

let failures = 0;
const fail = (what, detail) => { failures++; console.log(`  FAIL: ${what}\n        ${detail}`); };

console.log(`dna/dna.yaml declares protocol_version ${DECLARED}\n`);

for (const p of pinned) {
  fail(`${p.rel}:${p.line} pins an exact protocol version — ${p.text}`,
    `this goes red at the next bump, on a field that is still fine. Assert the floor instead `
    + `(>= ${p.n}, the version the feature arrived at) plus implemented_version === declared_version, `
    + `or read the number from dna/dna.yaml the way protocol-version.mjs does.`);
}

for (const f of floors) {
  if (f.n === undefined) {
    console.log(`  note: ${f.rel}:${f.line} floors on ${f.raw}, which is not a numeric const in that file — not checked`);
    continue;
  }
  if (f.n > DECLARED) {
    fail(`${f.rel}:${f.line} requires a version the network does not declare — ${f.text}`,
      `dna/dna.yaml declares ${DECLARED}, so this check is red by construction. Either the bump `
      + `was not applied to dna.yaml, or the floor names a version that never shipped.`);
  }
}

console.log(`  swept ${SCAN.join(', ')} — ${pinned.length} pinned equality(ies), ${floors.length} floor(s)`);
for (const f of floors) console.log(`    floor  ${f.rel}:${f.line}  ${f.text}${f.n === undefined ? '' : `  (= ${f.n}, declared ${DECLARED})`}`);
console.log('');

if (failures) {
  console.log(`${failures} CHECK(S) FAILED.`);
  console.log('::error::A harness pins an exact protocol_version. A bump then reds it on a field that is fine — see scripts/check-version-assertions.mjs for the shape that survives one.');
  process.exit(1);
}
console.log('NO PINNED VERSIONS: every protocol-version assertion in scripts/ states a floor,');
console.log('compares the two numbers to each other, or reads the expected one from dna.yaml —');
console.log('so the next bump cannot red a harness whose subject it did not touch.');
