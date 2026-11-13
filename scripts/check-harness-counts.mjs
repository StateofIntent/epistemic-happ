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
//   Injection (row 1.29): `node scripts/live-verify/own-critiques.mjs`
//   commented out in `ui.yml`.
//   Result: red — "own-critiques, 18 checks, run by no workflow, no manual
//   declaration", AND the `ui.yml` header count drifts 27 -> 26 at the same
//   time, which is the pair of answers a reader needs: one harness stopped
//   running, and the workflow's own description of itself stopped being true.
//
//   Injection (row 1.29): the words "not a gate and not in CI" struck from
//   `scale-dht`'s README row.
//   Result: red — a declared experiment becomes an unaccounted gate. This is
//   the direction that matters: the gate must not be satisfiable by a row that
//   merely EXISTS, which is the mistake the four checks above all made.
//
//   Injection (row 6.23): `reading-a-thread`'s suite-table count edited from
//   64 to 63 — off by one, the size of drift that actually happens.
//   Result: red, naming both numbers. The same figure had been wrong by 34 for
//   four sessions in that table because nothing read it.
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
// AND A SIXTH, WHICH IS THE SAME QUESTION ASKED OF A SECOND DOCUMENT — ROW
// 6.23. The checks above gate `README.md`'s phrasing, "`<path>`, N checks",
// path first. `scripts/live-verify/README.md`'s suite table writes it the
// other way round — "**N checks**" — so none of the table was gated at all,
// and `reading-a-thread`'s row said **30** while the harness ran **64**: stale
// by more than a factor of two, through four sessions that each ran that
// harness and read that row. Found only because row 6.23 grew it again.
//
// FOUR FIGURES WERE WRONG AND THREE WERE RIGHT WHILE THE MEASURE WAS WRONG,
// which is the part worth keeping. `attachment-links` says 101 against 27 call
// sites and `ordering-policy` 27 against 25 — both correct, because their
// checks sit in loops, and both MEASURED on a real run (101 and 27 PASS lines)
// rather than believed. `peer-signal` said 22, had 19 sites, and runs 21: the
// document was wrong about a number that was never either of the two available
// ones. All three are in EXEMPT with the measured run beside them.
//
// AND A FIFTH QUESTION, WHICH IS A DIFFERENT KIND FROM THE FOUR ABOVE AND IS
// ROW 1.29: IS THE HARNESS RUN AT ALL?
//
// Every check in this file until 2026-11-13 compared the README's claims
// against what EXISTS — rows, counts, importers. All of them were green while
// **ten harnesses carrying 232 assertions were invoked by no workflow**, and
// nothing here could have said so: the set of harnesses was never compared to
// the set any workflow INVOKES, so a harness could be perfectly documented,
// perfectly counted and never executed. **A gate that does not run is
// indistinguishable from one that was never written, except that it reads like
// coverage** — which is worse than an absence, because an absence is visible.
//
// THE RULE: a harness with at least one `check()` call site is either invoked
// by a workflow step, or says in its own row in `scripts/live-verify/README.md`
// that it is "an experiment, not a gate and not in CI". That phrasing is not
// invented here — six harnesses wrote it before this check existed, each with
// its real reason attached, and gating it turns a convention they happened to
// share into something a seventh cannot quietly skip.
//
// A MENTION IS NOT AN INVOCATION. `network.yml`'s header explains at length
// why two harnesses are NOT in it; `conductor.yml` names harnesses in prose
// constantly. Commented lines are excluded, so a step that gets commented out
// reads here as a harness that stopped running — the event most worth
// catching, and the one that produced this row's own first finding: the row
// said NINE harnesses and 210 assertions, and the sweep found TEN and 232.
// `transitive-gossip` was missed because its reason for being out was real and
// written down — in `network.yml`'s header, which is not where a reader of the
// index looks. **Two of the ten were already explained; what they lacked was
// the explanation where it would be found.**
//
// A harness with NO `check()` sites is out of scope and listed as such rather
// than silently skipped: it asserts nothing, so running it would gate nothing.
//
// Run: node scripts/check-harness-counts.mjs
// ============================================================================
import { readFileSync, existsSync, readdirSync } from 'node:fs';

const README = new URL('../README.md', import.meta.url).pathname;
const HARNESS = (name) => new URL(`../scripts/live-verify/${name}.mjs`, import.meta.url).pathname;
const LV_DIR = new URL('../scripts/live-verify', import.meta.url).pathname;
const LV_README = new URL('../scripts/live-verify/README.md', import.meta.url).pathname;
const UI_WORKFLOW = new URL('../.github/workflows/ui.yml', import.meta.url).pathname;
const WORKFLOW_DIR = new URL('../.github/workflows', import.meta.url).pathname;

/** Files in `scripts/live-verify/` that are SHARED MODULES rather than
 *  harnesses: they export helpers, run no checks, and exit no status, so they
 *  have nothing to count and nothing to say in the suite table. The
 *  distinction is behavioural rather than nominal — a harness runs `check()`
 *  calls and exits non-zero on failure; these do neither.
 *
 *  This was a single `!== 'chromium.mjs'` with a comment calling it "the only
 *  file in there that is neither", which stopped being true the moment
 *  `declared-wait.mjs` was added (SPEC §7b.2, open-work 1.7). A list says what
 *  a hardcoded exception could not. */
const SHARED_MODULES = new Set([
  'chromium.mjs',      // resolves the browser binary for the UI harnesses
  'declared-wait.mjs', // §7b.2's wait: declares its mode on timeout
]);

/** The harnesses, by name — everything in the directory that is not a module
 *  above. Adding a module here without adding it to SHARED_MODULES reports as
 *  "a harness with no row", which is the correct nudge: say which it is. */
function harnessNames() {
  return readdirSync(LV_DIR)
    .filter((f) => f.endsWith('.mjs') && !SHARED_MODULES.has(f))
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
  // The three below were found by the suite-table assertion added for row 6.23,
  // and each was MEASURED on a real run rather than taken from the document it
  // was supposed to be gating. All three are loop-driven, which is the same
  // shape as `domain-index` above.
  'attachment-links': 'the eighteen link rules are asserted in a loop, so 27 call '
    + 'sites run 101 checks — measured, ALL CHECKS PASSED with 101 PASS lines. '
    + 'The figure in the suite table is the run and is correct.',
  'ordering-policy': 'checks inside a loop over the ordering cases: 25 call sites '
    + 'run 27 checks, measured. The suite table cites the run.',
  'peer-signal': 'the four typed PeerSignal variants are round-tripped in a loop, '
    + 'so 19 call sites run 21 checks — measured. The suite table said 22, which '
    + 'was neither number, and is corrected to the measured 21.',
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

/** ROW 6.23. The count each suite-table row states, which is a SECOND and
 *  entirely ungated place the same claim is made.
 *
 *  THE CHECKS AT THE TOP OF THIS FILE GATE `README.md`'s form — "`<path>`,
 *  N checks", path first — and `scripts/live-verify/README.md`'s table writes
 *  it the other way round, "**N checks**", so none of it was gated at all.
 *  Found because row 6.23 grew `reading-a-thread` from 59 to 64 and its table
 *  row still said **30**: stale by more than a factor of two, through four
 *  sessions that each ran the harness and read the row.
 *
 *  THE FIRST "N checks" IN THE ROW, and that rule is doing real work rather
 *  than being the easy thing to write. These rows also cite SECTION counts
 *  ("§5bb ADDED 2026-11-02, 16 checks") and HISTORICAL ones ("green on its
 *  first run at 35 checks"), both of which are correct as written and must not
 *  be gated. The headline total is the one that comes first, every time, in
 *  all 29 rows that state one. Measured before being believed: 23 of the 29
 *  agreed, and of the 6 that did not, **three were right and the document was
 *  wrong, and three were right and the CALL SITES were the wrong measure** —
 *  loop-driven harnesses whose run count legitimately exceeds their sites, now
 *  in EXEMPT above with the measured run beside each.
 */
function tableCounts() {
  const lv = readFileSync(LV_README, 'utf8');
  const out = [];
  for (const line of lv.split('\n')) {
    const name = line.match(/^\| `([a-z0-9-]+)`/);
    if (!name) continue;
    const stated = line.match(/(\d+) checks/);
    if (!stated) continue;
    const path = HARNESS(name[1]);
    if (!existsSync(path)) continue;
    out.push({
      harness: name[1],
      claimed: Number(stated[1]),
      actual: checkSites(readFileSync(path, 'utf8')),
    });
  }
  return out;
}

/** ROW 1.29. Every harness that an actual WORKFLOW STEP invokes.
 *
 *  A MENTION IS NOT AN INVOCATION, and the distinction is the whole reason
 *  this reads lines rather than grepping the file: `network.yml`'s header
 *  explains at length why `transitive-gossip` and `network-partition` are NOT
 *  in it, and `conductor.yml` names harnesses in prose constantly. Naming a
 *  harness in a comment is the opposite of running it, so a commented line is
 *  excluded — which also means a step that gets commented out shows up here as
 *  a harness that stopped running, which is exactly the event worth catching.
 */
function invokedHarnesses() {
  const names = new Set();
  for (const f of readdirSync(WORKFLOW_DIR).filter((n) => n.endsWith('.yml'))) {
    const src = readFileSync(`${WORKFLOW_DIR}/${f}`, 'utf8');
    for (const line of src.split('\n')) {
      if (/^\s*#/.test(line)) continue;
      const m = line.match(/node\s+scripts\/live-verify\/([a-z0-9-]+)\.mjs/);
      if (m) names.add(m[1]);
    }
  }
  return names;
}

/** The sentence a harness's README row uses to declare that it is deliberately
 *  not in CI.
 *
 *  THIS WORDING WAS NOT INVENTED FOR THE GATE. Six harnesses wrote it before
 *  this check existed — `scale-dht`, `dht-isolation-probe`, `stall-bisect`,
 *  `stall-threshold`, `strategy-compare`, `clock-skew-reveal` — each followed
 *  by its real reason (twelve conductors would measure the runner; libfaketime
 *  moves a clock and does not belong on a shared machine). Gating their
 *  phrasing is what turns a convention six files happened to share into
 *  something a seventh cannot quietly skip. */
const MANUAL_DECLARATION = /not a gate and not in CI/i;

/** Each harness's row in `scripts/live-verify/README.md`, by name. */
function readmeRows() {
  const lv = readFileSync(LV_README, 'utf8');
  const rows = new Map();
  for (const line of lv.split('\n')) {
    const m = line.match(/^\| `([a-z0-9-]+)`/);
    if (m) rows.set(m[1], line);
  }
  return rows;
}

/** ROW 1.29's assertion: a harness that asserts something is either RUN by a
 *  workflow or SAYS it is not, in its own row, in the words the six existing
 *  experiments use.
 *
 *  WHY THIS DID NOT FALL OUT OF THE CHECKS ABOVE. They compare the README's
 *  claims against what EXISTS — rows, counts, importers — and every one of
 *  them was green while nine harnesses carrying 210 assertions ran nowhere.
 *  Nothing compared the set of harnesses to the set any workflow INVOKES, so a
 *  harness could be perfectly documented, perfectly counted, and never
 *  executed. **A gate that does not run is indistinguishable from one that was
 *  never written, except that it reads like coverage.**
 *
 *  A harness with NO `check()` call sites is out of scope and not silently so:
 *  it asserts nothing, so running it would gate nothing. Those are the probes
 *  (`dht-isolation-probe`, `stall-bisect`, `stall-threshold`,
 *  `strategy-compare`) and they print findings for a person to read. */
function runStatus() {
  const invoked = invokedHarnesses();
  const rows = readmeRows();
  return harnessNames().map((name) => {
    const path = HARNESS(name);
    const checks = existsSync(path) ? checkSites(readFileSync(path, 'utf8')) : 0;
    const row = rows.get(name) ?? '';
    return {
      name,
      checks,
      runs: invoked.has(name),
      declared: MANUAL_DECLARATION.test(row),
      hasRow: rows.has(name),
    };
  });
}

/** Spelled-out numbers, reused for the index claims below. */
const WORD_RE = '(' + Object.keys(WORDS).join('|') + '|\\d+)';

/** THE FOUR INDEX CLAIMS, each of which was WRONG earlier on the day this was
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

  // 3. README.md's own count of the suite, which is the FOURTH index claim and
  //    was added after the other three because it had rotted worse than any of
  //    them: §6.6 said "nineteen of them" while 64 harnesses existed, stale by
  //    a factor of three. It was not gated, and the three claims below it were
  //    — which is the whole argument for pulling it in rather than fixing the
  //    number and moving on. Found 2026-10-28 while updating two harness counts
  //    this file DID gate: the gated figures were caught by this script in
  //    seconds and the ungated sentence two files away had been wrong for
  //    months.
  const rm = readFileSync(README, 'utf8').match(
    new RegExp(`drive it — ${WORD_RE} of them, each proving one property`, 'i'));
  out.push({
    what: 'README.md §6.6 suite count',
    found: rm ? parseCount(rm[1]) : null,
    actual: names.length,
    detail: () => [],
  });

  // 3. `ui.yml`'s header count against the harnesses that workflow actually
  //    runs. Counted from the invocations, which is what a reader is being told.
  // COMMENTED LINES EXCLUDED, which this did not do until row 1.29's injection
  // showed why it matters: commenting a harness out of the job left this count
  // reading 27 of 27 while the workflow ran 26. The header is a claim about
  // what RUNS, so a line that cannot run must not count towards it — and a
  // commented-out step now drifts this number as well as reporting the harness
  // as unrun, which is the pair of answers a reader needs.
  const invocations = uiYml.split('\n')
    .filter((line) => !/^\s*#/.test(line))
    .filter((line) => /node scripts\/live-verify\/[a-z0-9-]+\.mjs/.test(line)).length;
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

// ---------------------------------------------------------------------------
// ROW 6.23 — the suite table's own headline counts, which nothing gated.
// ---------------------------------------------------------------------------
const table = tableCounts();
const tableWrong = table.filter((c) => !EXEMPT[c.harness] && c.claimed !== c.actual);
log('  --- suite table headline counts (row 6.23) ---');
log(`  ${String(table.length).padStart(3)} rows state a count; `
  + `${table.filter((c) => EXEMPT[c.harness]).length} are loop-driven and exempt, with the run cited`);
for (const c of tableWrong) {
  log(`  ${c.harness.padEnd(24)} says ${String(c.claimed).padStart(3)}   has ${String(c.actual).padStart(3)}   <-- DRIFT`);
}
log('');
if (tableWrong.length > 0) {
  log('DRIFT — scripts/live-verify/README.md states a count the harness does not have:');
  for (const c of tableWrong) log(`  ${c.harness}: says ${c.claimed}, has ${c.actual} call sites`);
  log('  This is the SECOND place each count is written, and until row 6.23 it was');
  log('  the unwatched one. If the harness loops, the run legitimately exceeds the');
  log('  sites — then MEASURE the run, cite it, and add the harness to EXEMPT with');
  log('  the number beside it, rather than editing this figure to match a guess.');
  log('');
}

// ---------------------------------------------------------------------------
// ROW 1.29 — is each harness RUN, or does it say it is not?
// ---------------------------------------------------------------------------
const status = runStatus();
const asserting = status.filter((h) => h.checks > 0);
const unaccounted = asserting.filter((h) => !h.runs && !h.declared);
const bothWays = asserting.filter((h) => h.runs && h.declared);

const runCount = asserting.filter((h) => h.runs).length;
const declCount = asserting.filter((h) => h.declared).length;
const silent = status.filter((h) => h.checks === 0);
log('  --- run or declared (row 1.29) ---');
log(`  ${String(asserting.length).padStart(3)} harnesses assert something`);
log(`  ${String(runCount).padStart(3)}   ...are invoked by a workflow`);
log(`  ${String(declCount).padStart(3)}   ...declare themselves manual in their README row`);
log(`  ${String(silent.length).padStart(3)} assert nothing and are out of scope: ${silent.map((h) => h.name).join(', ')}`);
log('');

if (unaccounted.length > 0) {
  log('DRIFT — a harness asserts things and nothing runs it:');
  for (const h of unaccounted) {
    log(`  ${h.name.padEnd(24)} ${String(h.checks).padStart(3)} checks, run by no workflow, no manual declaration`);
  }
  log('  Each is a decision, and it is per harness rather than global: either');
  log('  REGISTER it in the workflow whose setup it already needs, or SAY in');
  log('  its row in scripts/live-verify/README.md that it is "an experiment,');
  log('  not a gate and not in CI" — with the real reason, the way the six');
  log('  that already do it say theirs. A gate that does not run is');
  log('  indistinguishable from one that was never written, except that it');
  log('  reads like coverage.');
  log('');
}
if (bothWays.length > 0) {
  log('DRIFT — a harness says it is not in CI and a workflow runs it:');
  for (const h of bothWays) log(`  ${h.name}`);
  log('  One of the two is wrong, and a reader of the index cannot tell which.');
  log('');
}

if (wrong.length === 0 && unparsed.length === 0 && missing.length === 0 && idxBad.length === 0
    && unaccounted.length === 0 && bothWays.length === 0 && tableWrong.length === 0) {
  log('NO DRIFT: every harness check count README.md states is the number of');
  log('checks that harness has, every harness has a row in the suite table, and');
  log('every suite-wide count matches what is actually there.');
  log('(Call sites, not executions — verified equal by real runs for every');
  log('harness it gates. The ones it cannot count are listed above, untested');
  log('here, with the reason they cannot be.)');
  log('And every harness that asserts something is either run by a workflow or');
  log('says in its own row that it is not — and the suite table\'s own headline');
  log('counts agree with the harnesses too, which nothing watched until 6.23.');
  process.exit(0);
}
process.exit(1);
