#!/usr/bin/env node
// ============================================================================
// scripts/prose-claims-corpus.mjs — the ship condition for item 1.20.
//
// 1.20 says, in its own text: *a detector that is trusted and misses is worse
// than no detector*, and therefore **the first build is measured against the
// KNOWN failures as a labelled corpus — and if it does not catch those four it
// does not ship.**
//
// This is that corpus. Each case is the ACTUAL prose that was in this
// repository on the day it was wrong, recovered from git rather than
// paraphrased, with the commit that fixed it named so the quotation can be
// checked. A corpus of invented examples would measure nothing: the detector
// would be tuned to the examples, which is the failure this file exists to
// prevent.
//
// RUN IT: node scripts/prose-claims-corpus.mjs
// It prints CAUGHT / MISSED per case and exits non-zero if any case is missed.
// A red here is not a bug in the corpus. It is the detector failing its
// condition to ship, and the correct response is to say so.
// ============================================================================

import { scan, measure, extractWithModel, artifactKeyFor } from './check-prose-claims.mjs';

// TWO CRITERIA, KEPT APART ON PURPOSE. 1.20's promised output is the UNPAIRED
// report — a claim nothing gates, put in front of a human. A counter that
// contradicts the claim outright is strictly more than that. Collapsing the two
// would let a weak detector score well by surfacing everything, so they are
// counted separately and both are printed:
//
//   SURFACED      the claim was extracted and reported as gated by nothing.
//                 This is what 1.20 promises, and it is what fixed 1.15 in
//                 reality: a person read the line and counted the list.
//   PROVEN STALE  a counter measured the truth and it differs. Needs both a
//                 correct extraction AND a real counter.

// Each case: the real historical text, the artifact it is a claim about, what
// the prose said, what was true, and where the fix landed.
const CORPUS = [
  {
    id: '1.19',
    fix: '87508f3 — "README said the suite held nineteen harnesses; it held 64"',
    file: 'README.md',
    text: 'The live-verify suite is the thing that would notice. Sixty-six scripts\n' +
          'drive it — nineteen of them, each proving one property against real zome\n' +
          'calls rather than against a mock.',
    artifact: 'harness',
    said: 19,
    wasTrue: 64,
  },
  {
    id: '1.19b',
    fix: '87508f3 — same commit, the CHROMIUM line',
    file: 'scripts/live-verify/README.md',
    text: '**Which Chromium.** All twenty-three browser harnesses here import `CHROMIUM`\n' +
          'from `chromium.mjs`, which resolves `EPI_CHROMIUM` if set.',
    artifact: 'chromium',
    said: 23,
    wasTrue: 25,
  },
  {
    id: '1.11',
    fix: '458d6cd — "Four link-type counts, measured — and gated as a set equality"',
    file: 'SECURITY.md',
    text: 'Eighteen link types are bound, which is every link type anything writes;\n' +
          'app-entry updates are refused.',
    artifact: 'linktype',
    said: 18,
    wasTrue: 31,
  },
  {
    id: '1.15',
    fix: 'SPEC §2.4 — said past_cone had four validation rules and then listed five',
    file: 'SPEC.md',
    text: 'The past cone carries four validation rules, each refusing a different\n' +
          'forgery, and they are listed in order below.',
    artifact: 'validationrule',
    said: 4,
    wasTrue: 5,
  },
];

const sourceFor = (c) => (f) => (f === c.file ? c.text : '');
const useModel = process.argv.includes('--model');

async function run(c) {
  if (!useModel) {
    const hits = scan([c.file], { source: sourceFor(c) });
    const hit = hits.find((h) => h.stated === c.said && h.artifact === c.artifact);
    const truth = hit ? measure(hit.artifact) : measure(c.artifact);
    return { surfaced: !!hit, truth, proven: !!hit && truth !== null && hit.stated !== truth, how: 'vocabulary' };
  }
  const claims = await extractWithModel(c.text);
  const hit = claims.find((x) => Number(x.count) === c.said);
  if (!hit) return { surfaced: false, truth: null, proven: false, how: 'model' };
  const key = artifactKeyFor(hit.artifact);
  const truth = key ? measure(key) : null;
  // Extracted and nothing gates it -> SURFACED. Only a counter can prove it stale.
  return { surfaced: true, truth, proven: truth !== null && Number(hit.count) !== truth, how: 'model', artifact: hit.artifact, key };
}

const results = [];
for (const c of CORPUS) results.push({ c, ...(await run(c)) });

const surfaced = results.filter((r) => r.surfaced).length;
const proven = results.filter((r) => r.proven).length;

console.log(`1.20 ship condition — the four known stale claims   [extractor: ${useModel ? 'MODEL' : 'vocabulary'}]\n`);
for (const r of results) {
  const tag = r.proven ? 'PROVEN STALE' : r.surfaced ? 'SURFACED (ungated)' : 'MISSED';
  console.log(`  [${tag.padEnd(18)}] ${r.c.id}  said ${r.c.said}, was ${r.c.wasTrue}`);
  console.log(`       ${r.c.fix}`);
  if (!r.surfaced) console.log(`       not extracted from this text`);
  else if (!r.proven) console.log(`       extracted${r.artifact ? ` as "${r.artifact}"` : ''}, but no counter adjudicates it${r.truth !== null ? ` (measured ${r.truth})` : ''}`);
  console.log();
}

console.log(`SURFACED:     ${surfaced} of ${CORPUS.length}  — reported as a claim nothing gates (what 1.20 promises)`);
console.log(`PROVEN STALE: ${proven} of ${CORPUS.length}  — a counter measured the truth and it differs`);

if (surfaced < CORPUS.length) {
  console.log('\n1.20 SAYS THIS DOES NOT SHIP. The row set this bar deliberately:');
  console.log('a detector that is trusted and misses is worse than no detector.');
  process.exit(1);
}
console.log('\nShip condition met on the SURFACED criterion — every known defect reaches a human.');
console.log('The PROVEN figure is the stretch, and it is bounded by counters, not by extraction.');
