#!/usr/bin/env node
// ============================================================================
// scripts/injection-coverage.mjs — docs/open-work.md item 1.21, first half.
//
// WHICH CHECKS HAVE NEVER BEEN WATCHED FAILING?
//
// WHY THIS EXISTS, AND WHY IT IS NOT THE GENERATOR. 1.21 proposes generating
// injections with a model. Its own second objection is that 1,353 checks times
// generated injections is more output than anyone will read, and unread output
// is how that row becomes a worse version of the problem it fixes. So the scope
// has to be **the checks that have never been watched failing** — and the row
// states, as its first question, that nothing in `scripts/` records which those
// are. This answers that question before a single injection is generated.
//
// THE ANSWER IS NO, AND THE SHAPE OF THE NO IS THE USEFUL PART. This repository
// documents injections well: 49 of its 66 harnesses carry a NEGATIVE EVIDENCE
// section, most with lettered injections and a `Result:` line. (That 49 is
// printed by this script on every run rather than trusted from this comment —
// the first draft of this header said 50, from a looser grep, and was wrong
// before the file was ever committed. 1.20's bug class does not spare the tool
// written to fight it.) That is a strong
// convention and it is better than almost any suite has. But it records results
// PER HARNESS and in PROSE — "two red, the tilde check and the percentage
// control" — so the identity of a red check is recoverable by a human reading
// it and not by anything else.
//
// Therefore this script reports a BOUND rather than a set, and says so
// everywhere it prints. Three things are real and mechanical:
//
//   1. Harnesses with NO negative evidence at all. Nothing in them has been
//      watched failing, and this is the set 1.21 should aim at first. It needs
//      no inference.
//   2. An UPPER BOUND on distinct checks ever seen red per harness, from the
//      `Result:` counts. Upper, not exact: two injections may red the same
//      check, and the prose does not say.
//   3. The injections that PASSED. 1.21 names these as the high-value case —
//      an injection that passes found the ASSERTION weak rather than the code
//      broken — so they are listed by name rather than counted.
//
// WHAT IT DELIBERATELY DOES NOT DO. It does not guess which check a prose
// phrase refers to. Mapping "the tilde check" onto a `check()` call site is
// exactly the judgment a model would volunteer and exactly the judgment 1.20
// measured as unreliable — the model there resolved the hard reference
// correctly and then mislabelled what it had found. A wrong mapping here would
// mark a never-tested check as covered, which is the one error that makes this
// worse than nothing.
// ============================================================================

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const DIR = join(ROOT, 'scripts/live-verify');

const WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18 };
const num = (t) => (/^\d+$/.test(t) ? Number(t) : WORDS[t.toLowerCase()] ?? null);

function analyse(file) {
  const src = readFileSync(join(DIR, file), 'utf8');
  const checks = (src.match(/\bcheck\(/g) || []).length;

  const hasNegative = /NEGATIVE EVIDENCE/i.test(src);
  // The section runs from the marker to the end of the comment block.
  const section = hasNegative ? src.slice(src.search(/NEGATIVE EVIDENCE/i)) : '';

  const results = [...section.matchAll(/Result:\s*([^\n]*)/gi)].map((m) => m[1].trim());
  const passed = results.filter((r) => /\b(it )?passed\b|ALL CHECKS PASSED/i.test(r));
  let redBound = 0;
  for (const r of results) {
    if (/passed/i.test(r)) continue;
    const m = r.match(/\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen)\b\s+(reds?|FAILs?)/i);
    const n = m ? num(m[1]) : null;
    redBound += n ?? (/\bred\b|\bFAIL\b/i.test(r) ? 1 : 0);
  }
  return { file, checks, hasNegative, injections: results.length, redBound: Math.min(redBound, checks), passed };
}

const files = readdirSync(DIR).filter((f) => f.endsWith('.mjs')).sort();
const rows = files.map(analyse);

// A file with no `check()` at all is a helper, a probe or a library — not a
// harness that could have been watched failing. Counting those in the target
// set would overstate it, which is the one direction this script must not err.
const helpers = rows.filter((r) => r.checks === 0);
const noEvidence = rows.filter((r) => !r.hasNegative && r.checks > 0);
const withEvidence = rows.filter((r) => r.hasNegative);
const totalChecks = rows.reduce((a, r) => a + r.checks, 0);
const checksInUntested = noEvidence.reduce((a, r) => a + r.checks, 0);
const boundSeenRed = withEvidence.reduce((a, r) => a + r.redBound, 0);

console.log(`live-verify: ${files.length} harnesses, ${totalChecks} check() call sites\n`);

console.log(`== 1. HARNESSES WITH NO NEGATIVE EVIDENCE — nothing in them has been watched failing ==`);
console.log(`   ${noEvidence.length} harness(es), ${checksInUntested} check() call sites — ${Math.round((checksInUntested / totalChecks) * 100)}% of the suite.`);
console.log(`   This is the set 1.21 should aim at first. It is exact and needs no inference.`);
console.log(`   (${helpers.length} further files carry no check() at all — helpers, probes and`);
console.log(`   libraries — and are excluded rather than counted as untested: ${helpers.map((h) => h.file.replace('.mjs', '')).join(', ')}.)\n`);
for (const r of noEvidence) console.log(`   ${r.file.padEnd(34)} ${String(r.checks).padStart(3)} checks`);

console.log(`\n== 2. INJECTIONS THAT PASSED — the high-value case 1.21 names ==`);
const passers = withEvidence.filter((r) => r.passed.length);
console.log(`   ${passers.length} harness(es) document an injection that PASSED, which is an assertion`);
console.log(`   found weak rather than code found broken.\n`);
for (const r of passers) {
  console.log(`   ${r.file}`);
  for (const p of r.passed) console.log(`      Result: ${p.slice(0, 90)}`);
}

console.log(`\n== 3. UPPER BOUND on distinct checks ever witnessed red ==`);
console.log(`   At most ${boundSeenRed} of ${totalChecks} call sites (${Math.round((boundSeenRed / totalChecks) * 100)}%), across ${withEvidence.length} harnesses`);
console.log(`   carrying ${withEvidence.reduce((a, r) => a + r.injections, 0)} documented injections.`);
console.log(`   UPPER, never exact: two injections may red the same check and the prose does`);
console.log(`   not say which. Treat it as a ceiling on coverage, never as coverage.`);

console.log(`\n== THE ANSWER TO 1.21's FIRST QUESTION ==`);
console.log(`   The set of never-watched-failing CHECKS is NOT known and cannot be recovered`);
console.log(`   from what is written: results are recorded per harness and in prose. What IS`);
console.log(`   known is the ${noEvidence.length} harnesses above, exactly, and a ${Math.round((boundSeenRed / totalChecks) * 100)}% ceiling for the rest.`);
console.log(`   Generating injections should start from section 1 and stop there until the`);
console.log(`   per-check question is answered by recording it going forward, not by guessing`);
console.log(`   backwards from prose.`);
