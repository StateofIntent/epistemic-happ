#!/usr/bin/env node
// ============================================================================
// scripts/injection-ledger/ledger.mjs — docs/open-work.md item 1.21, the half
// its own decision left: ANSWER THE PER-CHECK QUESTION BY RECORDING IT GOING
// FORWARD RATHER THAN GUESSING BACKWARDS FROM PROSE.
//
// WHAT 1.21 ESTABLISHED AND WHY THAT LEFT THIS. Its first half,
// `injection-coverage.mjs`, asked whether the set of never-watched-failing
// CHECKS is known and answered no: this repository documents injections
// unusually well, but it documents them PER HARNESS and IN PROSE — *"two red,
// the tilde check and the percentage control"* — so a red check's identity is
// recoverable by a human reading it and by nothing else. That script therefore
// reports a CEILING (at most 17% of call sites ever witnessed red) and refuses
// to map a prose phrase onto a call site, because that is exactly the judgment
// 1.20 measured as unreliable and a wrong mapping would mark a never-tested
// check as covered — the one error that makes a coverage tool worse than none.
//
// Its second half generated injections, and the scope it settled on was
// section 1: the harnesses with no negative evidence at all. **Section 1 is
// now EMPTY — 0 harnesses, 0 call sites.** That scope is exhausted, which is
// what makes this the next unit rather than more generation.
//
// THE MECHANISM, AND IT TURNS ON ONE OBSERVATION. Every harness here prints
//
//     FAIL: <the check's own label>
//
// and that label is an EXPRESSION in the harness source — a literal, a
// template, or literals concatenated with `+`. So resolving a run's red checks
// back to call sites is STRING EQUALITY, not inference — which is precisely
// the step `injection-coverage.mjs` refuses to take from prose, and the reason
// it is safe to take from output. The judgment 1.20 found unreliable was
// *"which check does this English phrase mean"*. No judgment is involved in
// *"which call site has this exact label"*.
//
// THE WORD "EXPRESSION" IS A CORRECTION OF 2026-11-14 AND IT COST 15 OF THIS
// FILE'S 16 UNRESOLVED REDS. The first version read one quoted literal, so a
// label assembled with `+` — this suite's style for any label longer than a
// line, which is to say the labels that say the most — was recorded truncated
// to its first fragment. See the resolver's own header for the measurement;
// the shape is now asserted directly by `selftest`, because `verify` can only
// ever exercise the shapes some injection happened to redden.
//
// WHAT IT CANNOT DO, ENFORCED RATHER THAN NOTED. Three resolutions are
// possible for a red label and only the first counts as coverage:
//
//   exact      — one call site carries that label. Counted.
//   ambiguous  — two or more do (a duplicated literal, or a template whose
//                pattern matches several). NOT counted, listed by name.
//   unresolved — none does. The check was deleted, or its label is computed at
//                run time and no source text can ever equal it. NOT counted.
//
// So the ledger's coverage figure can only ever UNDERSTATE. That direction is
// deliberate: the failure mode this is built against is a check believed
// tested and never tested, so every uncertainty resolves away from "covered".
//
// AND IT ROTS, SO THERE IS A `verify`. A ledger entry naming a label that no
// longer exists in the harness is a coverage claim about a check that is gone
// — worse than no claim, because it reads like one. `verify` re-resolves every
// record against the CURRENT source and names the records that have gone
// stale. That is the check this repository's own history says such a file
// needs: the same class as the four suite-index claims that
// `check-harness-counts.mjs` exists to catch drifting.
//
// USAGE
//
//   Record a run (the usual shape — inject, run, pipe the output in):
//     node scripts/live-verify/foo.mjs | tee /tmp/out
//     node scripts/injection-ledger/ledger.mjs record foo \
//       --id A --note "the replacement write reverted to a literal null" \
//       --file /tmp/out
//
//   Read it back:
//     node scripts/injection-ledger/ledger.mjs report
//     node scripts/injection-ledger/ledger.mjs verify     # exits 1 on rot
//     node scripts/injection-ledger/ledger.mjs selftest   # the resolver itself
//
// The store is NDJSON — one record per line, append-only — so two people
// recording different injections conflict on adjacent lines at worst, and a
// diff shows what was added rather than a reformatted blob.
// ============================================================================

import { readFileSync, writeFileSync, existsSync, appendFileSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = new URL('../..', import.meta.url).pathname;
const HARNESS_DIR = join(ROOT, 'scripts/live-verify');
const STORE = join(ROOT, 'scripts/injection-ledger/records.ndjson');

// --- Resolving a printed label back to a call site --------------------------
//
// A `check()` label is an EXPRESSION, and reading only its first quoted
// literal is what this file did until 2026-11-14. Three shapes occur in this
// suite, measured rather than guessed:
//
//   1,706  a single literal or a single template
//      66  a CONCATENATION — literals joined by `+`, usually across lines
//       1  a computed label, `check(label, true)`, with no literal at all
//
// (Measured on this tree, 1,773 sites in total, of which 9 carry a `\uXXXX`
// or `\xXX` escape — see `unescape` for why that number is worth knowing.
// The figures move whenever a harness gains a check, which is why nothing
// downstream is keyed to them: the gate is `selftest`, which asserts the
// SHAPES, and `verify`, which re-resolves against the source as it is.)
//
// THE 60 WERE THE BUG, AND IT WAS A 65% UNDERSTATEMENT ON THE FIRST HARNESS
// RECORDED AFTER THIS FILE SHIPPED. `reading-a-thread.mjs` was entered from
// eight real runs: 23 reds, of which 8 resolved and 15 did not, and every one
// of the 15 is a label assembled with `+` because it is longer than a line —
// which is this repository's prevailing style for exactly the labels that say
// the most. The old scanner matched `check(` followed by one quoted string, so
// a concatenated label entered the site table TRUNCATED to its first fragment
// and could never equal what the run printed. Worse than invisible: the site
// was in the DENOMINATOR with a label it does not have.
//
// SO THE LABEL EXPRESSION IS NOW TAKEN WHOLE, to the comma that separates
// label from condition — and that comma is found by DEPTH, not by the first
// comma seen, because a label may call a function (`check(fmt(a, b), cond)`)
// and a template may hold an expression holding a comma. Within the
// expression, every string literal contributes its own text and everything
// else — a `${...}`, a bare variable between two `+` — contributes `.*`.
// Mechanical throughout: nothing here reads what a substitution might produce,
// which is the line `injection-coverage.mjs` refuses to cross from prose and
// the reason it is safe to cross from output.
//
// TWO FURTHER CORRECTIONS FELL OUT OF LOOKING, both small and both in the
// denominator, where this file had been counting things that are not checks:
//
//   `\bcheck\(` MATCHES PLAYWRIGHT'S `.check()`. A word boundary matches after
//   a dot, so `locator('[data-testid="notes-create-listed"]').check()` — which
//   ticks a checkbox — reads as an assertion to that grep. Two of them, in
//   `notes-ui.mjs` and `trust-lenses.mjs`. THIS FILE WAS NEVER WRONG BY THEM
//   AND ONLY BY ACCIDENT: the old regex demanded a quote immediately after the
//   paren, so a no-argument `.check()` fell out for the wrong reason. The
//   lookbehind makes the exclusion the one that was meant. It is recorded
//   because the suite's own prose quotes that grep as its assertion count, and
//   the arithmetic closes exactly: on the tree where this was found, 1,763 raw
//   = 1,760 with a leading quote + 1 computed label + 2 of Playwright's. A
//   number is either what it says it is or it is not.
//
//   A COMPUTED LABEL CAN NEVER BE CREDITED, AND IS STILL A CALL SITE.
//   `attachment-links.mjs` builds its label in a variable and passes it in, so
//   no source text can ever equal what it printed. It stays in the denominator
//   — it is a real assertion — and is excluded from MATCHING, because a site
//   whose pattern is pure wildcard would match every label ever printed and
//   turn all of this file's existing coverage ambiguous in one line. Named in
//   `report` rather than dropped, so the one site this cannot see says so.

/** Skip a `'…'` or `"…"` literal; returns the index just past the closer. */
function skipQuoted(src, i) {
  const q = src[i];
  i += 1;
  while (i < src.length) {
    if (src[i] === '\\') { i += 2; continue; }
    if (src[i] === q) return i + 1;
    i += 1;
  }
  return i;
}

/** Skip a `${…}` substitution body; `i` is just past the `{`. Nests, because
 *  a substitution may hold an object, a call, or another template. */
function skipBraced(src, i) {
  let depth = 1;
  while (i < src.length && depth > 0) {
    const c = src[i];
    if (c === "'" || c === '"') { i = skipQuoted(src, i); continue; }
    if (c === '`') { i = skipTemplate(src, i); continue; }
    if (c === '{') depth += 1;
    else if (c === '}') depth -= 1;
    i += 1;
  }
  return i;
}

/** Skip a `` `…` `` template, substitutions and all. */
function skipTemplate(src, i) {
  i += 1;
  while (i < src.length) {
    if (src[i] === '\\') { i += 2; continue; }
    if (src[i] === '`') return i + 1;
    if (src[i] === '$' && src[i + 1] === '{') { i = skipBraced(src, i + 2); continue; }
    i += 1;
  }
  return i;
}

/** The label expression of a `check(` call: the text up to the top-level
 *  comma. `null` when there is no such comma — a `check(` with one argument is
 *  not a labelled assertion this file can speak about. */
function labelExpr(src, from) {
  let i = from;
  let depth = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === "'" || c === '"') { i = skipQuoted(src, i); continue; }
    if (c === '`') { i = skipTemplate(src, i); continue; }
    if (c === '(' || c === '[' || c === '{') { depth += 1; i += 1; continue; }
    if (c === ')' || c === ']' || c === '}') {
      if (depth === 0) return null;
      depth -= 1; i += 1; continue;
    }
    if (c === ',' && depth === 0) return src.slice(from, i);
    i += 1;
  }
  return null;
}

/** The printed label is the RESOLVED string, so source escapes have to be
 *  undone before comparing: `\'` prints as `'`.
 *
 *  AND `\u2014` PRINTS AS AN EM DASH, which this did not handle until the
 *  first injection recorded after the resolver fix resolved ZERO of its five
 *  reds. The labels were `graph-ui`'s new ones and they spell their dashes and
 *  apostrophes as `\u2014` and `\u2019`, so the pattern demanded six literal
 *  characters where the run had printed one. Measured: 7 such escapes in the
 *  suite, all in that one harness — the rest write the character itself, which
 *  is why a hole this old had never shown. It understated, which is the safe
 *  direction, and it was still wrong.
 *
 *  THE HARNESS WAS NOT RESTYLED TO SUIT THE TOOL. Leaving those escapes in
 *  place is what keeps this path exercised by real records rather than only by
 *  a selftest snippet. */
const unescape = (raw) => raw.replace(
  /\\(?:u\{([0-9a-fA-F]{1,6})\}|u([0-9a-fA-F]{4})|x([0-9a-fA-F]{2})|\r\n|([\s\S]))/g,
  (_, brace, four, hex, ch) => {
    if (brace !== undefined) return String.fromCodePoint(parseInt(brace, 16));
    if (four !== undefined) return String.fromCharCode(parseInt(four, 16));
    if (hex !== undefined) return String.fromCharCode(parseInt(hex, 16));
    // A backslash before a line break is a continuation and prints nothing.
    if (ch === undefined || ch === '\n') return '';
    return { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', v: '\v', 0: '\0' }[ch] ?? ch;
  },
);

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A template body as alternating literal text and wildcards. */
function templateParts(body) {
  const parts = [];
  let lit = '';
  let i = 0;
  while (i < body.length) {
    if (body[i] === '\\') { lit += body[i] + (body[i + 1] ?? ''); i += 2; continue; }
    if (body[i] === '$' && body[i + 1] === '{') {
      if (lit) { parts.push({ lit: unescape(lit) }); lit = ''; }
      i = skipBraced(body, i + 2);
      parts.push({ wild: true });
      continue;
    }
    lit += body[i];
    i += 1;
  }
  if (lit) parts.push({ lit: unescape(lit) });
  return parts;
}

/** A label expression as alternating literal text and wildcards. Whitespace
 *  and `+` BETWEEN two literals is concatenation and contributes nothing;
 *  anything else between them is a runtime value and contributes a wildcard. */
function exprParts(expr) {
  const parts = [];
  let gap = '';
  let i = 0;
  const flushGap = () => {
    if (/[^\s+]/.test(gap)) parts.push({ wild: true });
    gap = '';
  };
  while (i < expr.length) {
    const c = expr[i];
    if (c === "'" || c === '"') {
      flushGap();
      const end = skipQuoted(expr, i);
      parts.push({ lit: unescape(expr.slice(i + 1, end - 1)) });
      i = end;
      continue;
    }
    if (c === '`') {
      flushGap();
      const end = skipTemplate(expr, i);
      parts.push(...templateParts(expr.slice(i + 1, end - 1)));
      i = end;
      continue;
    }
    gap += c;
    i += 1;
  }
  flushGap();
  return parts;
}

/** Every labelled `check()` call site in a harness, with its line and the
 *  pattern its label makes. Written to find call sites and NOT to parse
 *  JavaScript: it tracks strings, templates and bracket depth because the
 *  label expression cannot be delimited without them, and it knows nothing
 *  about comments, so a `check('…',` inside a block comment is a site to this
 *  file. The `verify` subcommand is what catches the difference. */
function callSites(src) {
  const sites = [];
  // NOT `\bcheck\(`: a word boundary matches after a dot, so that form counts
  // Playwright's `.check()` — which ticks a checkbox — as an assertion.
  const re = /(?<![.\w$])check\(/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const expr = labelExpr(src, m.index + m[0].length);
    if (expr === null) continue;
    const parts = exprParts(expr);
    const line = src.slice(0, m.index).split('\n').length;
    const lits = parts.filter((p) => p.lit !== undefined).map((p) => p.lit);
    const anchored = lits.some((l) => /\S/.test(l));
    const wild = parts.some((p) => p.wild);
    sites.push({
      line,
      raw: lits.join(''),
      // A site with no literal text of its own: the label is computed, so no
      // source text can ever equal what it printed. In the denominator,
      // excluded from matching — a `^[\s\S]*$` pattern would match every label
      // and make all coverage ambiguous.
      computed: !anchored,
      isTemplate: wild,
      pattern: anchored && wild
        ? new RegExp(`^${parts.map((p) => (p.wild ? '[\\s\\S]*' : escapeRe(p.lit))).join('')}$`)
        : null,
    });
  }
  return sites;
}

/** exact | ambiguous | unresolved, and never a guess. */
function resolve(label, sites) {
  const hits = sites.filter((s) => {
    if (s.computed) return false;
    return s.pattern ? s.pattern.test(label) : s.raw === label;
  });
  if (hits.length === 1) return { kind: 'exact', line: hits[0].line };
  if (hits.length > 1) return { kind: 'ambiguous', lines: hits.map((h) => h.line) };
  return { kind: 'unresolved' };
}

/** Red and green labels as a run printed them. Harnesses are uniform here —
 *  63 of them define `const check = (label, cond) =>` and all print
 *  `  PASS: ${label}` / `  FAIL: ${label}` — and a run that printed neither is
 *  refused rather than recorded as an injection that reddened nothing, which
 *  would silently add a zero to the denominator. */
function parseRun(text) {
  const red = [];
  const green = [];
  for (const line of text.split('\n')) {
    const f = line.match(/^\s{2,}FAIL:\s(.*)$/);
    if (f) { red.push(f[1].trimEnd()); continue; }
    const p = line.match(/^\s{2,}PASS:\s(.*)$/);
    if (p) green.push(p[1].trimEnd());
  }
  // THE HARNESS'S OWN FAILURE COUNT, AND IT IS A TRUNCATION GUARD RATHER THAN
  // A CONVENIENCE. Every harness here ends by printing its total — `8 CHECK(S)
  // FAILED.`, `28 FAILED` — and if that number disagrees with the number of
  // `FAIL:` lines present, the output reaching this script is NOT the whole
  // run. That happens the moment anybody pipes a run through `grep`, which is
  // the obvious way to read one and was how the first nine records here were
  // nearly entered. A silently truncated run would understate which checks the
  // injection reddened, and understating is the one direction a coverage
  // ledger must not be wrong in on its own INPUT, however safe it is on the
  // output.
  const stated = text.match(/^\s*(\d+)\s+(?:CHECK\(S\)\s+)?FAILED/m);
  return { red, green, stated: stated ? Number(stated[1]) : null };
}

function harnessSource(name) {
  const file = name.endsWith('.mjs') ? name : `${name}.mjs`;
  const path = join(HARNESS_DIR, file);
  if (!existsSync(path)) {
    console.error(`No such harness: scripts/live-verify/${file}`);
    process.exit(2);
  }
  return { file, src: readFileSync(path, 'utf8') };
}

const load = () => (existsSync(STORE)
  ? readFileSync(STORE, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
  : []);

function commitNow() {
  try { return execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim(); }
  catch { return null; }
}

// --- record -----------------------------------------------------------------

function cmdRecord(args) {
  const name = args._[0];
  if (!name) { console.error('usage: ledger.mjs record <harness> --note "<what was injected>" [--id A] [--file <run output>]'); process.exit(2); }
  if (!args.note) { console.error('--note is required: a record with no statement of what was injected is not evidence of anything.'); process.exit(2); }

  const text = args.file ? readFileSync(args.file, 'utf8') : readFileSync(0, 'utf8');
  const { file, src } = harnessSource(name);
  const { red, green, stated } = parseRun(text);

  if (stated !== null && stated !== red.length) {
    console.error(`That output states ${stated} failing check(s) and carries ${red.length} \`FAIL:\` line(s).`);
    console.error('It has been truncated or filtered, so the set of reds in it is incomplete.');
    console.error('Nothing recorded. Pipe the WHOLE run in — `tee` it rather than `grep` it.');
    process.exit(2);
  }
  if (red.length === 0 && green.length === 0) {
    console.error('That output contains no PASS or FAIL lines, so it is not a harness run.');
    console.error('Nothing recorded — a run that printed nothing would otherwise enter the');
    console.error('ledger as an injection that reddened no checks, which is a zero nobody measured.');
    process.exit(2);
  }
  if (red.length === 0) {
    console.error(`That run has ${green.length} green and NO reds.`);
    console.error('An injection that PASSES is a finding — 1.21 names it as the high-value case —');
    console.error('but it is a finding about the ASSERTION, not coverage, so it does not belong in');
    console.error('a ledger of checks witnessed red. Record it in the harness\'s own');
    console.error('NEGATIVE EVIDENCE block, where the three existing ones live, and say which it was.');
    process.exit(2);
  }

  const sites = callSites(src);
  const resolved = red.map((label) => ({ label, ...resolve(label, sites) }));
  const record = {
    harness: file,
    id: args.id ?? null,
    note: args.note,
    recorded: new Date().toISOString().slice(0, 10),
    commit: commitNow(),
    // NULL WHEN THE OUTPUT CARRIED NO GREENS, rather than `red.length`. A
    // reds-only capture would otherwise record "8 red of 8" for a run that was
    // 8 of 42, which is a denominator nobody measured. The coverage figure this
    // ledger reports does not use it — that is about WHICH SITES went red, not
    // how many did — so a null here costs nothing and a wrong number would be
    // quoted later as if it meant something.
    total_checks: green.length > 0 ? red.length + green.length : null,
    red: resolved,
  };
  appendFileSync(STORE, `${JSON.stringify(record)}\n`);

  const exact = resolved.filter((r) => r.kind === 'exact').length;
  console.log(`Recorded ${file}${args.id ? ` injection ${args.id}` : ''}: ${red.length} red of `
    + `${record.total_checks ?? 'an unrecorded total (the capture carried no greens)'}.`);
  console.log(`  ${exact} resolved to a single call site and count as coverage.`);
  for (const r of resolved) {
    if (r.kind === 'exact') console.log(`  line ${r.line}  ${r.label}`);
    else if (r.kind === 'ambiguous') console.log(`  AMBIGUOUS (lines ${r.lines.join(', ')}) — not counted: ${r.label}`);
    else console.log(`  UNRESOLVED — not counted: ${r.label}`);
  }
  if (exact < red.length) {
    console.log('\nAmbiguous and unresolved reds are deliberately NOT counted. The figure this');
    console.log('ledger reports can only understate, because the defect it exists to catch is a');
    console.log('check believed tested and never tested.');
  }
}

// --- report -----------------------------------------------------------------

function cmdReport() {
  const records = load();
  const harnesses = readdirSync(HARNESS_DIR).filter((f) => f.endsWith('.mjs'));
  let totalSites = 0;
  const computed = [];
  for (const f of harnesses) {
    for (const site of callSites(readFileSync(join(HARNESS_DIR, f), 'utf8'))) {
      totalSites += 1;
      if (site.computed) computed.push(`${f}:${site.line}`);
    }
  }

  console.log(`injection ledger: ${records.length} recorded run(s)`);
  if (records.length === 0) {
    console.log('\nEmpty. Nothing has been recorded through this mechanism yet, and that is');
    console.log('an honest zero rather than a missing feature: the 17% ceiling');
    console.log('`injection-coverage.mjs` reports comes from PROSE, and nothing in it can be');
    console.log('promoted here without the judgment 1.20 measured as unreliable.');
    return;
  }

  const byLine = new Map();   // "harness:line" -> labels
  const perHarness = new Map();
  let ambiguous = 0; let unresolved = 0; let exactReds = 0;
  for (const r of records) {
    const h = perHarness.get(r.harness) ?? { runs: 0, lines: new Set() };
    h.runs += 1;
    for (const red of r.red) {
      if (red.kind === 'exact') {
        exactReds += 1;
        const key = `${r.harness}:${red.line}`;
        byLine.set(key, red.label);
        h.lines.add(red.line);
      } else if (red.kind === 'ambiguous') ambiguous += 1;
      else unresolved += 1;
    }
    perHarness.set(r.harness, h);
  }

  console.log('');
  console.log('== EXACT: call sites witnessed red, resolved by label equality ==');
  console.log(`   ${byLine.size} of ${totalSites} call sites (${((100 * byLine.size) / totalSites).toFixed(1)}%),`);
  console.log(`   across ${perHarness.size} harness(es) and ${records.length} recorded run(s).`);
  console.log('   EXACT, not a ceiling — each is a label a run printed as FAIL, matched to the');
  console.log('   one call site carrying it. This is the figure 1.21 asked for and the reason');
  console.log('   this file exists beside `injection-coverage.mjs` rather than inside it.');
  console.log('');
  for (const [h, v] of [...perHarness].sort()) {
    console.log(`   ${h.padEnd(34)} ${String(v.lines.size).padStart(3)} site(s) red over ${v.runs} run(s)`);
  }
  // WHY THE OTHER TOOL'S FIGURE IS A CEILING, MEASURED RATHER THAN ASSERTED.
  // `injection-coverage.mjs` says of its own number: "two injections may red
  // the same check, and the prose does not say which". That is exactly the
  // double-count this ledger can see and prose cannot, so the gap between
  // reds recorded and distinct sites reached is the first measurement of how
  // much the prose method inflates.
  if (exactReds > byLine.size) {
    const inflation = ((100 * exactReds) / byLine.size - 100).toFixed(0);
    console.log('');
    console.log('== HOW MUCH A SUM OF REDS WOULD OVERSTATE ==');
    console.log(`   ${exactReds} resolved red(s) across these runs reached ${byLine.size} DISTINCT call site(s).`);
    console.log(`   Summing them — which is all the prose method can do — would claim ${exactReds} and`);
    console.log(`   overstate by ${inflation}%. This is the double-count \`injection-coverage.mjs\``);
    console.log('   names as the reason its own figure is a ceiling, measured here for the first');
    console.log('   time. It is also the honest argument for this file: the same check reddened');
    console.log('   by three injections is one check tested, not three.');
  }

  if (ambiguous || unresolved) {
    console.log('');
    console.log(`== NOT COUNTED: ${ambiguous} ambiguous, ${unresolved} unresolved ==`);
    console.log('   An ambiguous label is carried by two or more call sites; an unresolved one by');
    console.log('   none. Neither is promoted to coverage, so this figure understates by exactly');
    console.log('   these, which is the safe direction.');
  }
  if (computed.length > 0) {
    console.log('');
    console.log(`== CANNOT EVER BE CREDITED: ${computed.length} call site(s) with a computed label ==`);
    for (const c of computed) console.log(`   ${c}`);
    console.log('   The label is built at run time, so no source text can equal what it printed');
    console.log('   and no injection can ever move it into the figure above. Counted in the');
    console.log('   denominator because it is a real assertion, excluded from matching because a');
    console.log('   site with no literal text of its own would match every label ever printed.');
    console.log('   Named here rather than dropped: the one thing this cannot see should say so.');
  }

  console.log('');
  console.log('== WHAT THIS DOES NOT REPLACE ==');
  console.log('   `injection-coverage.mjs` still reports the prose-derived ceiling for every');
  console.log('   injection recorded before this mechanism existed, and the harnesses with no');
  console.log('   negative evidence at all. The two figures answer different questions and the');
  console.log('   ledger cannot absorb the older one without guessing.');
}

// --- verify -----------------------------------------------------------------

function cmdVerify() {
  const records = load();
  if (records.length === 0) { console.log('Ledger is empty — nothing to verify.'); return; }
  const stale = [];
  const neverExact = [];
  const promoted = [];
  let repaired = 0;
  let reclassified = 0;
  const cache = new Map();
  for (const [i, r] of records.entries()) {
    if (!cache.has(r.harness)) {
      const path = join(HARNESS_DIR, r.harness);
      cache.set(r.harness, existsSync(path) ? callSites(readFileSync(path, 'utf8')) : null);
    }
    const sites = cache.get(r.harness);
    if (sites === null) { stale.push({ i, r, why: 'the harness no longer exists' }); continue; }
    for (const red of r.red) {
      // EVERY RED IS RE-RESOLVED, including the ones that never resolved, and
      // that is a change of 2026-11-14 rather than the original design. The
      // first version re-resolved only the reds already counted as coverage,
      // so a record could never move TOWARDS being coverage however much the
      // resolver improved — and the resolver did improve: it had been reading
      // only the first quoted fragment of a concatenated label, which is 60
      // call sites in this suite and was 15 of this ledger's 16 unresolved
      // reds. A stored resolution is a derived fact about the current source,
      // which is exactly why line numbers are already repaired here; the
      // LABEL is the evidence and it is never rewritten.
      const now = resolve(red.label, sites);
      if (red.kind !== 'exact') {
        if (now.kind === 'exact') {
          promoted.push({ r, red, line: now.line, was: red.kind });
          red.kind = 'exact';
          red.line = now.line;
          delete red.lines;
          continue;
        }
        if (now.kind !== red.kind) {
          // Still not coverage either way, but say which it is now, so the
          // report's two tallies are about the current source.
          red.kind = now.kind;
          if (now.kind === 'ambiguous') red.lines = now.lines; else delete red.lines;
          reclassified += 1;
        }
        // NOT silently skipped, and the distinction is the whole point of
        // separating these two lists. A red that was NEVER exact was never
        // counted as coverage, so it is not a claim that has gone bad — but it
        // IS a check an injection reddened and this ledger cannot name, which
        // is worth seeing rather than hiding.
        neverExact.push({ r, red });
        continue;
      }
      if (now.kind !== 'exact') {
        stale.push({ i, r, why: `the label is now ${now.kind}`, label: red.label });
      } else if (now.line !== red.line) {
        // A moved line is NOT rot: the label is what identifies the check, and
        // a comment above it shifts every line below. Repaired in place rather
        // than reported, which is the lesson the validation corpus taught this
        // repository the hard way — its inventory stores line numbers and a
        // twelve-line comment shifted 97 of them, reddening a required check
        // for no behavioural reason at all.
        red.line = now.line;
        repaired += 1;
      }
    }
  }
  // Written back ONLY when something moved. A tool that rewrites its own store
  // on every read makes `git status` dirty for no reason, and a dirty tree is
  // how an unrelated change gets committed by accident.
  if (repaired > 0 || promoted.length > 0 || reclassified > 0) {
    writeFileSync(STORE, records.map((r) => JSON.stringify(r)).join('\n') + '\n');
  }

  if (promoted.length > 0) {
    console.log(`PROMOTED — ${promoted.length} red(s) that had never resolved now resolve to a`);
    console.log('single call site. This is the resolver reading the source better than it did,');
    console.log('not a new injection and not a new measurement: each of these labels was printed');
    console.log('by a run that was recorded at the time, and the ledger simply could not say');
    console.log('which check had printed it.');
    for (const p of promoted) {
      console.log(`  ${p.r.harness}${p.r.id ? ` [${p.r.id}]` : ''}  line ${p.line}  (was ${p.was})`);
      console.log(`    ${p.red.label}`);
    }
    console.log('');
  }

  if (neverExact.length > 0) {
    console.log(`${neverExact.length} recorded red(s) never resolved and are not coverage:`);
    for (const { r, red } of neverExact) {
      console.log(`  ${r.harness}${r.id ? ` [${r.id}]` : ''}  ${red.kind}: ${red.label}`);
    }
    console.log('');
  }

  if (stale.length === 0) {
    console.log(`Verified ${records.length} record(s): every red that resolved still resolves to`);
    console.log('exactly one call site in the harness it names.');
    if (repaired > 0) {
      console.log(`${repaired} line number(s) had moved and were repaired from the label, which is`);
      console.log('what identifies a check — a comment above one shifts every line below it.');
    } else {
      console.log('No line numbers had moved.');
    }
    if (reclassified > 0) {
      console.log(`${reclassified} red(s) that are still not coverage changed which kind they are.`);
    }
    return;
  }
  console.log(`STALE — ${stale.length} recorded red(s) no longer resolve:`);
  for (const s of stale) {
    console.log(`  ${s.r.harness}${s.r.id ? ` [${s.r.id}]` : ''}: ${s.why}`);
    if (s.label) console.log(`    ${s.label}`);
  }
  console.log('');
  console.log('A coverage claim about a check that no longer exists is worse than no claim,');
  console.log('because it reads like one. Either the check was renamed — re-run the injection');
  console.log('and record it again — or it was deleted, in which case delete the record.');
  process.exit(1);
}

// --- selftest ---------------------------------------------------------------
//
// A DETERMINISTIC TEST OF THE RESOLVER, AGAINST LABELLED SOURCE SNIPPETS, AND
// THE PRECEDENT IS THIS ROW'S OWN. 1.21's injection-proposal safeguard is
// "verified against five labelled strings rather than against a live run,
// because the model's output varies between runs and a non-deterministic test
// of a detector proves nothing". The same argument applies here and more
// strongly: `verify` can only exercise the label shapes that some injection
// happened to redden, so it covers concatenation today because fifteen
// `reading-a-thread` reds happen to be concatenated — a coincidence of history
// rather than a property of the gate.
//
// THE CASE THAT CARRIES THE BUG IS #5, AND IT IS THE NEGATIVE ONE. A printed
// label equal to the FIRST FRAGMENT of a concatenation must resolve to
// NOTHING. Under the old scanner that string was the site's whole recorded
// label, so it matched — which is the shape of the defect: not merely a missed
// match, but a site sitting in the denominator under a label it does not have.
// Asserting only that the full label resolves would pass against a scanner
// that recorded both.

const SELFTEST = [
  { what: 'a plain literal',
    src: "check('a plain label', x);",
    label: 'a plain label', want: 'exact' },

  { what: 'a template, substitution wildcarded',
    src: 'check(`the chain holds exactly one claim (${n})`, x);',
    label: 'the chain holds exactly one claim (1)', want: 'exact' },

  { what: 'literals concatenated across lines',
    src: "check('first half '\n      + 'second half', x);",
    label: 'first half second half', want: 'exact' },

  { what: 'a template concatenated with a literal — the shape 15 reds had',
    src: "check(`CONTROL: the bylines are not one repeated string — ${d} distinct `\n      + 'over three rows', x);",
    label: 'CONTROL: the bylines are not one repeated string — 2 distinct over three rows',
    want: 'exact' },

  { what: 'THE NEGATIVE: the first fragment alone resolves to nothing',
    src: "check('first half '\n      + 'second half', x);",
    label: 'first half ', want: 'unresolved' },

  { what: 'a bare variable between two literals',
    src: "check('n is ' + n + ' now', x);",
    label: 'n is 7 now', want: 'exact' },

  { what: 'a comma inside the label expression does not end it',
    src: "check('total ' + arr.join(', ') + ' end', x);",
    label: 'total a, b end', want: 'exact' },

  { what: 'a source escape prints as the character it escapes',
    src: "check('it\\'s there', x);",
    label: "it's there", want: 'exact' },

  // THE CASES THE FIRST graph-ui RECORDING NEEDED, and it needed them having
  // resolved 0 of 5 reds. A label is compared against what the run PRINTED, so
  // every escape a JS string can carry has to be decoded first.
  { what: 'a \\u escape prints as its character (em dash)',
    src: "check('a control \\u2014 and its reason', x);",
    label: 'a control \u2014 and its reason', want: 'exact' },

  { what: 'a \\u escape inside a concatenated template, which is the real shape',
    src: "check(`CONTROL: not one repeated string \\u2014 ${n} distinct `\n      + 'over four nodes', x);",
    label: 'CONTROL: not one repeated string \u2014 2 distinct over four nodes',
    want: 'exact' },

  { what: 'a \\u2019 apostrophe prints as one character, not six',
    src: "check('the claim\\u2019s author answered', x);",
    label: 'the claim\u2019s author answered', want: 'exact' },

  { what: 'a \\x escape decodes too',
    src: "check('caf\\xe9 and nothing else', x);",
    label: 'caf\xe9 and nothing else', want: 'exact' },

  { what: 'two call sites carrying one literal are ambiguous, not exact',
    src: "check('the same words', x);\ncheck('the same words', y);",
    label: 'the same words', want: 'ambiguous' },

  { what: 'a computed label resolves to nothing',
    src: 'check(label, true);',
    label: 'whatever it printed', want: 'unresolved' },

  // THE LOAD-BEARING ONE. A computed site has no literal text, so its pattern
  // would be `^[\s\S]*$` — which matches every label ever printed and would
  // turn all of this ledger's coverage ambiguous in a single line. It is
  // excluded from matching and counted in the denominator, so a real label
  // beside it must still resolve exactly.
  { what: 'a computed label does not make its neighbour ambiguous',
    src: "check(label, true);\ncheck('a real label', x);",
    label: 'a real label', want: 'exact' },

  { what: "Playwright's .check() is not an assertion and not a call site",
    src: "await page.locator('[data-testid=\"notes-create-listed\"]').check();",
    label: 'irrelevant', want: 'unresolved', sites: 0 },

  // THIS CASE EXISTS BECAUSE THE OBVIOUS ONE ABOVE IS INSENSITIVE, which was
  // found by injecting `\bcheck\(` back and watching NOTHING go red. The
  // lookbehind is not what excludes the suite's two real `.check()` calls:
  // they take no arguments, so `labelExpr` finds no top-level comma and
  // returns null first. A dotted call WITH a label-shaped first argument is
  // what the lookbehind actually does, so that is what is asserted — the
  // alternative being a guard whose removal costs nothing, which is the same
  // as no guard.
  { what: 'a DOTTED call with label-shaped arguments is still not a call site',
    src: "await page.locator('x').check('a label', true);",
    label: 'a label', want: 'unresolved', sites: 0 },

  { what: 'a one-argument check() is not a labelled site',
    src: 'check(somethingWithNoLabel);',
    label: 'irrelevant', want: 'unresolved', sites: 0 },
];

function cmdSelftest() {
  let failures = 0;
  const check = (label, cond) => {
    console.log(`  ${cond ? 'PASS' : 'FAIL'}: ${label}`);
    if (!cond) failures += 1;
  };
  console.log('ledger.mjs selftest — the resolver against labelled source snippets\n');
  for (const c of SELFTEST) {
    const sites = callSites(c.src);
    const got = resolve(c.label, sites).kind;
    check(`${c.what} → ${c.want} (got ${got})`, got === c.want);
    if (c.sites !== undefined) {
      check(`  ...and that snippet carries ${c.sites} call site(s) (got ${sites.length})`,
        sites.length === c.sites);
    }
  }
  console.log('');
  if (failures === 0) {
    console.log(`ALL ${SELFTEST.length} CASE(S) PASSED.`);
    process.exit(0);
  }
  console.log(`${failures} CHECK(S) FAILED.`);
  process.exit(1);
}

// --- argv -------------------------------------------------------------------

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) out[a.slice(2)] = argv[++i];
    else out._.push(a);
  }
  return out;
}

const [cmd, ...rest] = process.argv.slice(2);
const args = parseArgs(rest);
if (cmd === 'record') cmdRecord(args);
else if (cmd === 'report') cmdReport();
else if (cmd === 'verify') cmdVerify();
else if (cmd === 'selftest') cmdSelftest();
else {
  console.error('usage: ledger.mjs <record|report|verify|selftest> ...');
  console.error('  record <harness> --note "<what was injected>" [--id A] [--file <run output>]');
  process.exit(2);
}
