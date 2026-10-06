#!/usr/bin/env node
// ============================================================================
// scripts/check-harness-counts.mjs — when README.md says a harness runs N
// checks, does it?
//
// WHY THIS EXISTS. §9 and the changelog cite harnesses by their check count —
// "`taxonomy-ui.mjs`, seventeen checks" — and that number is doing real work:
// it is how a reader judges how much a green tick covers without opening the
// file. Every one of those numbers was stated by hand and none of them was
// gated, and when all seven were finally measured against real runs, ALL SEVEN
// WERE WRONG:
//
//   domain-index           said 14   ran 22
//   write-symmetry         said 12   ran 11
//   taxonomy-ui            said 17   ran 16
//   trust-lenses           said 28   ran 27
//   expertise-ui           said 14   ran 13
//   mode-and-constitution  said 16   ran 15
//   worldline-ui           said 17   ran 18
//
// Five were one too many, one was one too few, and `domain-index` was eight
// short because the harness grew and the sentence did not. No single mechanical
// cause — which is the point: seven hand-stated numbers drifted seven ways, and
// nothing noticed, exactly as the surfacing ratio did until it was gated.
//
// WHAT IT CHECKS. For every "`scripts/live-verify/<name>.mjs`, N checks" claim
// in README.md, that the harness contains exactly N `check(...)` call sites
// with a literal label.
//
// WHY A STATIC COUNT IS LEGITIMATE HERE, AND WHERE IT IS NOT. One call site
// means one check only when no check sits inside a loop, and that is an
// assumption rather than a fact — so it was measured. Seven of the eight cited
// harnesses were run against a real conductor and each printed exactly as many
// PASS/FAIL lines as it has labelled call sites.
//
// THE EIGHTH REFUTED IT, which is why `EXEMPT` exists and is not an empty
// gesture. `domain-index` has twelve call sites and runs twenty-two checks: one
// site is reused per poisoning attempt through a helper, and an if/else pair
// means only one of two fires. Its figure has to come from a run, so this file
// does not gate it and says so on every run rather than skipping it silently.
// `layout-fits` is the same shape from the other side — seven call sites,
// thirty-nine checks, looping over tabs and widths — and is deliberately never
// cited with a count at all.
//
// So a harness that later puts a check in a loop makes this gate go RED rather
// than quiet, and the fix is to exempt it with a reason, not to adjust the
// number until the gate agrees. A gate that fails loudly when its premise
// breaks is the point; one that keeps passing on a stale premise is what this
// file replaces.
//
// WHAT IT DOES NOT CHECK. That the checks are good, that they can fail, or that
// they ran. `ui.yml` and `conductor.yml` run them; this only keeps the prose
// honest about how many there are.
//
// ----------------------------------------------------------------------------
// NEGATIVE EVIDENCE — watched failing four ways, all exit 1.
//
//   Injection: README's `taxonomy-ui` count bumped sixteen -> seventeen, which
//   is the exact error this file was written after finding.
//   Result: red, "says 17 has 16", naming the harness.
//
//   Injection: a check DELETED from `taxonomy-ui.mjs` with README untouched —
//   the other direction, and the one that actually produces stale prose,
//   since nobody rereads a count when removing an assertion.
//   Result: red, "says sixteen checks, has 15 call sites".
//
//   Injection: the count written as "umpteen checks".
//   Result: red via SETUP FAILED, naming the word it cannot read, rather than
//   treating an unparseable number as zero or skipping the claim.
//
//   Injection: every "<harness>.mjs, N checks" phrasing stripped from README.
//   Result: red via SETUP FAILED — the mode that matters most here for the
//   same reason `check-spec-drift.mjs` has one of its own: a gate whose
//   subject can disappear silently is how these counts went unmeasured for as
//   long as they did.
//
//   Restored and re-run: green, exit 0.
//
// Run: node scripts/check-harness-counts.mjs
// ============================================================================
import { readFileSync, existsSync } from 'node:fs';

const README = new URL('../README.md', import.meta.url).pathname;
const HARNESS = (name) => new URL(`../scripts/live-verify/${name}.mjs`, import.meta.url).pathname;

const log = (...a) => console.log(...a);

// Written out rather than pulled from a library: the set that actually appears
// in this document, and a number it cannot parse should fail loudly.
const WORDS = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14,
  fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
  twenty: 20, 'twenty-one': 21, 'twenty-two': 22, 'twenty-three': 23,
  'twenty-four': 24, 'twenty-five': 25, 'twenty-six': 26, 'twenty-seven': 27,
  'twenty-eight': 28, 'twenty-nine': 29, thirty: 30, 'thirty-one': 31,
  'thirty-two': 32, 'thirty-three': 33, 'thirty-four': 34, 'thirty-five': 35,
  'thirty-six': 36, 'thirty-seven': 37, 'thirty-eight': 38, 'thirty-nine': 39,
  forty: 40,
};

function parseCount(raw) {
  const t = raw.toLowerCase();
  if (/^\d+$/.test(t)) return Number(t);
  return WORDS[t] ?? null;
}

/** Harnesses whose checks CANNOT be counted statically, with the reason.
 *
 * Carved out explicitly rather than quietly skipped, on the same discipline §9
 * applies to unsurfaced functions: a thing left out of a check needs a stated
 * reason, or it is just a gap. Their README figures are measured run counts and
 * this file does not gate them — which is stated here rather than implied, so
 * nobody reads a green tick as covering them. */
const EXEMPT = {
  'domain-index': 'one call site is reused per poisoning attempt through a helper, '
    + 'and an if/else pair means only one of two fires — so call sites neither equal '
    + 'nor bound the checks that run (12 sites, 22 checks measured). Cite the run.',
};

/** Every "`scripts/live-verify/<name>.mjs`, N checks" claim in README.md.
 *
 * The comma-and-count form is the one the document uses for a live claim. A
 * sentence that merely mentions a harness is not gated, and must not be: the
 * changelog names harnesses constantly without asserting a size. */
function claims(readme) {
  const re = /scripts\/live-verify\/([a-z0-9-]+)\.mjs`,\s*([a-z-]+|\d+)\s+checks/gi;
  return [...readme.matchAll(re)].map((m) => ({
    harness: m[1], raw: m[2], claimed: parseCount(m[2]), text: m[0],
  }));
}

/** Labelled `check(...)` call sites in a harness.
 *
 * Only a literal first argument counts — a quoted or backticked label. That is
 * what every harness here writes, and requiring it keeps the helper's own
 * definition (`const check = (label, cond) =>`) out of the count without a
 * special case for it. */
function checkSites(source) {
  const single = [...source.matchAll(/\bcheck\(\s*'(?:[^'\\]|\\.)*'/g)].length;
  const double = [...source.matchAll(/\bcheck\(\s*"(?:[^"\\]|\\.)*"/g)].length;
  const template = [...source.matchAll(/\bcheck\(\s*`(?:[^`\\]|\\.)*`/g)].length;
  return single + double + template;
}

const stated = claims(readFileSync(README, 'utf8'));

if (stated.length === 0) {
  log('SETUP FAILED: README.md states no "<harness>.mjs, N checks" claim.');
  log('  This check gates those sentences, so their absence means the phrasing');
  log('  moved — and the counts have gone unmeasured again, which is how all');
  log('  seven of them came to be wrong at once.');
  process.exit(1);
}

const wrong = [];
const unparsed = [];
const missing = [];

for (const c of stated) {
  if (c.claimed === null) { unparsed.push(c); continue; }
  if (EXEMPT[c.harness]) continue;
  const path = HARNESS(c.harness);
  if (!existsSync(path)) { missing.push(c); continue; }
  const actual = checkSites(readFileSync(path, 'utf8'));
  if (actual !== c.claimed) wrong.push({ ...c, actual });
}

log(`${stated.length} harness check-count claims in README.md`);
log('');
for (const c of stated) {
  if (c.claimed === null || !existsSync(HARNESS(c.harness))) continue;
  if (EXEMPT[c.harness]) {
    log(`  ${c.harness.padEnd(24)} says ${String(c.claimed).padStart(3)}   NOT GATED — ${EXEMPT[c.harness]}`);
    continue;
  }
  const actual = checkSites(readFileSync(HARNESS(c.harness), 'utf8'));
  log(`  ${c.harness.padEnd(24)} says ${String(c.claimed).padStart(3)}   has ${String(actual).padStart(3)}${actual === c.claimed ? '' : '   <-- DRIFT'}`);
}
log('');

if (unparsed.length > 0) {
  log('SETUP FAILED — a stated count this check cannot read:');
  for (const c of unparsed) log(`  "${c.text}" — "${c.raw}" is not a number it knows`);
  log('  Add the numeral to WORDS, or write the figure in digits.');
  log('');
}
if (missing.length > 0) {
  log('DRIFT — README cites a harness that is not there:');
  for (const c of missing) log(`  ${c.harness}.mjs`);
  log('');
}
if (wrong.length > 0) {
  log('DRIFT — README states a check count the harness does not have:');
  for (const c of wrong) {
    log(`  ${c.harness}.mjs: says "${c.raw} checks", has ${c.actual} call sites`);
  }
  log('  Run the harness and use the number it prints. If a check now sits');
  log('  inside a loop, call sites stop equalling checks — then stop citing a');
  log('  static number for this harness and say so, rather than adjusting it.');
  log('');
}

if (wrong.length === 0 && unparsed.length === 0 && missing.length === 0) {
  log('NO DRIFT: every harness check count README.md states is the number of');
  log('checks that harness has.');
  log('(Call sites, not executions — verified equal by real runs for every');
  log('harness it gates. The ones it cannot count are listed above, untested');
  log('here, with the reason they cannot be.)');
  process.exit(0);
}
process.exit(1);
