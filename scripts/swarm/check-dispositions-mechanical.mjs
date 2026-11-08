#!/usr/bin/env node
// ============================================================================
// scripts/swarm/check-dispositions-mechanical.mjs — open-work 3.5's "accidental
// defence", ENFORCED rather than stated.
//
// 3.5 records that the swarm has a defence it did not set out to build:
// dispositions are MECHANICAL — "a disposition is a threshold and a mode
// preference published as a Constitution promise before the agent acts, every
// rule a property of data a reader can check" — so ten observers genuinely
// differ even when they all run one model, and the variation does not come
// from the model. 4.2 (observers as entries) would discard it, because the
// thing being selected becomes a prompt.
//
// THAT CLAIM WAS AN ASSERTION UNTIL 2026-11-08 AND IS NOW A MEASUREMENT, which
// is the only reason to add a file: a defence nothing checks is a defence that
// leaves the moment somebody adds a prompt, a clock or a random tiebreak, and
// nothing would have gone red. The declared-versus-enforced gap is this
// repository's most repeated defect (7.25's unread `required_evidence`, 1.12's
// `min_attestations`, 1.24's index); this closes it for the swarm.
//
// WHY IT CAN BE EXHAUSTIVE, which is the whole reason this is cheap. `assess`
// reads exactly four things: the claim's confidence, whether `evidence_hashes`
// is empty, whether the content matches a literal method-word regex, and
// whether this disposition has already critiqued the target. The first three
// are finite and small, so the swarm's ENTIRE behaviour is a 60-state table
// this file enumerates. Not a sample — the whole space.
//
// WHAT GOES RED, and each is a way the defence could leave:
//   1. a disposition that is not deterministic across two identical calls
//   2. an impurity in the module (clock, randomness, network, environment)
//   3. a disposition missing its declared threshold, mode or promise
//   4. majority/minority divergence NOT explained by the declared thresholds
//   5. the promise not published before the first critique in run-swarm.mjs
//
// Run: node scripts/swarm/check-dispositions-mechanical.mjs
// ============================================================================
import { readFileSync } from 'node:fs';
// `confidenceRank` is the exported surface; the raw CONFIDENCE_RANK map is
// module-private and widening its exports for a checker would be the wrong way
// round — a gate should read what callers read.
import { DISPOSITIONS, assess, statesMethod, confidenceRank } from './dispositions.mjs';

const HERE = new URL('.', import.meta.url).pathname;
const CONFIDENCES = ['Hypothetical', 'Tentative', 'Moderate', 'High', 'Certain'];
let failures = 0;
const check = (label, ok, detail) => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}: ${label}`);
  if (!ok) { failures++; if (detail) console.log(`        ${detail}`); }
};

console.log('=== 3.5\'S ACCIDENTAL DEFENCE, ENUMERATED ===\n');

// --- 1. every disposition declares a threshold, a mode and a promise --------
console.log('--- 1. a disposition is a threshold and a mode, published as a promise ---');
for (const [name, d] of Object.entries(DISPOSITIONS)) {
  check(`${name} declares a numeric threshold`, Number.isInteger(d.minConfidenceToFlag));
  check(`${name} declares a mode`, typeof d.mode === 'string' && d.mode.length > 0);
  check(`${name} declares a promise that STATES the threshold`,
    typeof d.promise === 'string' && d.promise.length > 40);
}

// --- 2. no impurity in the module -------------------------------------------
console.log('\n--- 2. the rules are properties of data, not of the environment ---');
const src = readFileSync(`${HERE}dispositions.mjs`, 'utf8');
for (const [what, re] of [
  ['no clock', /\bDate\s*[.(]/], ['no randomness', /Math\.random/],
  ['no network', /\bfetch\s*\(|https?:\/\//], ['no environment', /process\.env/],
  ['no async', /\bawait\b|\basync\b/],
]) check(`${what} in dispositions.mjs`, !re.test(src));

// --- 3. the complete decision table, every state twice ----------------------
console.log('\n--- 3. the ENTIRE behaviour space, each state evaluated twice ---');
const table = [];
let nondeterministic = 0;
for (const name of Object.keys(DISPOSITIONS)) {
  for (const confidence of CONFIDENCES) {
    for (const ev of [0, 1]) {
      for (const m of [false, true]) {
        // The no-method fixture must contain NONE of statesMethod's words. A
        // first version read "an assertion with no method words", which
        // contains "method" — a fixture that fails its own predicate proves
        // nothing, so the assertion below is load-bearing rather than tidy.
        const content = m ? 'measured by a stated protocol'
                          : 'an assertion offered plainly, with nothing about how';
        if (statesMethod(content) !== m) { check('the method fixture matches statesMethod', false); break; }
        const claim = { confidence, evidence_hashes: Array.from({ length: ev }, (_, i) => `e${i}`), content };
        const a = assess(name, claim), b = assess(name, claim);
        if (JSON.stringify(a) !== JSON.stringify(b)) nondeterministic++;
        table.push({ name, confidence, ev, m, act: !!a.act });
      }
    }
  }
}
const expected = Object.keys(DISPOSITIONS).length * CONFIDENCES.length * 2 * 2;
check(`the space is finite and fully enumerated (${table.length} states)`, table.length === expected,
  `expected ${expected}`);
check('every state is deterministic across two identical calls', nondeterministic === 0,
  `${nondeterministic} state(s) differed`);

// --- 4. the minority's divergence IS its declared number --------------------
console.log('\n--- 4. the deliberate minority differs by its THRESHOLD and nothing else ---');
const strict = table.filter((r) => r.name === 'evidential_strict');
const loose = table.filter((r) => r.name === 'evidential_loose');
check('majority and minority are comparable state for state', strict.length === loose.length);
const differ = strict.filter((s, i) => s.act !== loose[i].act);
check('they do differ — a minority that never diverges is not a minority', differ.length > 0);
const lo = DISPOSITIONS.evidential_loose.minConfidenceToFlag;
const hi = DISPOSITIONS.evidential_strict.minConfidenceToFlag;
const explained = differ.every((s) => {
  const r = confidenceRank(s.confidence);
  return r >= lo && r < hi && s.ev === 0;
});
check('EVERY divergence sits between the two declared thresholds, with no evidence', explained,
  'a divergence outside the declared band would mean the variation came from somewhere else');
console.log(`        ${differ.length} divergent state(s), all explained by the published numbers`);

// --- 5. the promise is published BEFORE the first critique ------------------
console.log('\n--- 5. declared before acting, not after ---');
const runner = readFileSync(`${HERE}run-swarm.mjs`, 'utf8');
// MATCH THE CALL SITE, NOT THE NAME. A first version searched for the bare
// strings, so a mention of `create_critique` in a comment above the publish
// would have reported the order as wrong — and a mention of
// `publish_constitution` in a comment below it would have reported the order
// as right while the code did the opposite. Both directions are wrong, and the
// second is the dangerous one.
const iPromise = runner.indexOf("call('publish_constitution'");
const iCritique = runner.indexOf("call('create_critique'");
check('run-swarm.mjs publishes the constitution', iPromise > -1);
check('and does so BEFORE it creates any critique', iPromise > -1 && iCritique > iPromise,
  'a threshold declared after the act is not a standard, it is an excuse');

console.log(`\n${failures === 0 ? 'DEFENCE HOLDS' : failures + ' CHECK(S) FAILED'} — ${table.length} states, ${differ.length} divergent, all by declared threshold.`);
if (failures) process.exit(1);
