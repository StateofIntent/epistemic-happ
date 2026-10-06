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
// AND THREE CLAIMS ABOUT THE SUITE AS A WHOLE, which fail for a duller reason
// than the per-harness counts: somebody adds a harness. Every harness has a row
// in `scripts/live-verify/README.md`'s table and every row has a harness; the
// stated number of harnesses importing `CHROMIUM` is the number that do; and
// `ui.yml`'s header count is the number of harnesses that workflow runs. Two of
// those three were wrong on the day this was written and were fixed by hand —
// and one of those hand fixes was itself wrong, which the gate then caught. See
// the negative evidence at the bottom.
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
//   ----- and for the suite indexes, added later -----
//
//   Injection: a harness file added with no row in the suite table.
//   Result: red, "says 42, is 43", NAMING the harness with no row. This is the
//   direction that actually happens — a harness arrives and the index does not.
//
//   Injection: the CHROMIUM importer count moved off by one.
//   Result: red, "says 21, is 22".
//
//   Injection: `ui.yml`'s header count left at seventeen.
//   Result: red, "says 17, is 18" — which is the exact stale figure this gate
//   was written after correcting by hand.
//
//   Injection: the CHROMIUM sentence reworded to "All of the browser
//   harnesses here import", so the gated phrasing is gone.
//   Result: red, CLAIM NOT FOUND, for the reason every other SETUP FAILED in
//   this repository exists: a gate whose subject can vanish silently is not a
//   gate.
//
//   Restored: green, exit 0, on all six checks.
//
//   AND THE FIRST RUN OF THIS GATE CAUGHT AN ERROR I HAD MADE BY HAND HOURS
//   EARLIER, which is the best argument for it that could have turned up. The
//   CHROMIUM sentence said "twenty-one" when twenty-two harnesses imported it;
//   I corrected it to "twenty-three" from a quick `grep -l | wc -l`, which
//   counted `chromium.mjs` ITSELF — its header carries the line
//   `//   import { CHROMIUM } from './chromium.mjs';` as usage documentation.
//   So a stale index was replaced with a wrong one, by the same kind of
//   ad-hoc recount this file exists to retire, and nothing would have noticed.
//   The gate excludes the resolver by name, which is why it reads 22.
//
// Run: node scripts/check-harness-counts.mjs
// ============================================================================
import { readFileSync, existsSync, readdirSync } from 'node:fs';

const README = new URL('../README.md', import.meta.url).pathname;
const HARNESS = (name) => new URL(`../scripts/live-verify/${name}.mjs`, import.meta.url).pathname;
const LV_DIR = new URL('../scripts/live-verify', import.meta.url).pathname;
const LV_README = new URL('../scripts/live-verify/README.md', import.meta.url).pathname;
const UI_WORKFLOW = new URL('../.github/workflows/ui.yml', import.meta.url).pathname;

/** The harnesses, by name. `chromium.mjs` is the shared browser resolver rather
 *  than a harness, and is the only file in there that is neither. */
function harnessNames() {
  return readdirSync(LV_DIR)
    .filter((f) => f.endsWith('.mjs') && f !== 'chromium.mjs')
    .map((f) => f.slice(0, -4))
    .sort();
}

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

/** Spelled-out numbers, reused for the index claims below. */
const WORD_RE = '(' + Object.keys(WORDS).join('|') + '|\\d+)';

/** THE THREE INDEX CLAIMS, each of which was WRONG earlier on the day this was
 *  written and each fixed by hand — which is the whole argument for gating them.
 *
 *  They describe the harness suite as a whole rather than one harness, and they
 *  go stale for the dullest possible reason: somebody adds a harness. The
 *  `chromium.mjs` count said twenty-one when twenty-two already imported it,
 *  and `ui.yml`'s header said seventeen when it ran eighteen. Neither is a
 *  judgement call and neither needs a human to recount it. */
function indexClaims() {
  const names = harnessNames();
  const lv = readFileSync(LV_README, 'utf8');
  const uiYml = readFileSync(UI_WORKFLOW, 'utf8');
  const out = [];

  // 1. Every harness has a row in the suite's own table, and every row has a
  //    harness. A harness added without a row is undocumented; a row without a
  //    harness describes something that is not there.
  const rows = [...lv.matchAll(/^\| `([a-z0-9-]+)`/gm)].map((m) => m[1]);
  out.push({
    what: 'live-verify/README.md table rows',
    found: rows.length === 0 ? null : rows.length,
    actual: names.length,
    detail: () => {
      const rowSet = new Set(rows);
      const missing = names.filter((n) => !rowSet.has(n));
      const extra = rows.filter((r) => !names.includes(r));
      return [
        missing.length ? `harnesses with no row: ${missing.join(', ')}` : '',
        extra.length ? `rows with no harness: ${extra.join(', ')}` : '',
      ].filter(Boolean);
    },
  });

  // 2. "All <N> browser harnesses here import `CHROMIUM`".
  const chromium = names.filter((n) => {
    try { return readFileSync(HARNESS(n), 'utf8').includes("from './chromium.mjs'"); }
    catch { return false; }
  }).length;
  const cm = lv.match(new RegExp(`All ${WORD_RE} browser harnesses here import`, 'i'));
  out.push({
    what: 'live-verify/README.md CHROMIUM importers',
    found: cm ? parseCount(cm[1]) : null,
    actual: chromium,
    detail: () => [],
  });

  // 3. `ui.yml`'s header count against the harnesses that workflow actually
  //    runs. Counted from the invocations, which is what a reader is being told.
  const invocations = [...uiYml.matchAll(/node scripts\/live-verify\/[a-z0-9-]+\.mjs/g)].length;
  const um = uiYml.match(new RegExp(`^# ${WORD_RE} browser harnesses`, 'im'));
  out.push({
    what: 'ui.yml header harness count',
    found: um ? parseCount(um[1]) : null,
    actual: invocations,
    detail: () => [],
  });

  return out;
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

// ---------------------------------------------------------------------------
// The suite's own indexes, which are a different kind of claim from the
// per-harness counts above: they go stale when somebody ADDS a harness, which
// is why neither of them should have needed a person to recount it.
// ---------------------------------------------------------------------------
const idx = indexClaims();
const idxBad = [];
log('  --- suite indexes ---');
for (const c of idx) {
  if (c.found === null) {
    log(`  ${c.what.padEnd(40)} CLAIM NOT FOUND   (actual ${c.actual})`);
    idxBad.push(c);
    continue;
  }
  const ok = c.found === c.actual;
  log(`  ${c.what.padEnd(40)} says ${String(c.found).padStart(3)}   is ${String(c.actual).padStart(3)}${ok ? '' : '   <-- DRIFT'}`);
  if (!ok) idxBad.push(c);
}
log('');

if (idxBad.length > 0) {
  log('DRIFT — the suite index does not describe the suite:');
  for (const c of idxBad) {
    if (c.found === null) {
      log(`  ${c.what}: the sentence this gates is missing or reworded (actual ${c.actual}).`);
      log('    A gate whose subject can vanish silently is not a gate — if the');
      log('    wording moved on purpose, move this check with it.');
    } else {
      log(`  ${c.what}: says ${c.found}, is ${c.actual}`);
      for (const d of c.detail()) log(`    ${d}`);
    }
  }
  log('  These drift when a harness is ADDED, which is the dullest possible');
  log('  reason and the hardest to notice: nobody rereads an index.');
  log('');
}

if (wrong.length === 0 && unparsed.length === 0 && missing.length === 0 && idxBad.length === 0) {
  log('NO DRIFT: every harness check count README.md states is the number of');
  log('checks that harness has, every harness has a row in the suite table, and');
  log('both suite-wide counts match what is actually there.');
  log('(Call sites, not executions — verified equal by real runs for every');
  log('harness it gates. The ones it cannot count are listed above, untested');
  log('here, with the reason they cannot be.)');
  process.exit(0);
}
process.exit(1);
