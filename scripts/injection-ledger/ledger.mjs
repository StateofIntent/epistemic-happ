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
// and that label is a LITERAL (or a template) in the harness source. So
// resolving a run's red checks back to call sites is STRING EQUALITY, not
// inference — which is precisely the step `injection-coverage.mjs` refuses to
// take from prose, and the reason it is safe to take from output. The judgment
// 1.20 found unreliable was *"which check does this English phrase mean"*. No
// judgment is involved in *"which call site has this exact label"*.
//
// WHAT IT CANNOT DO, ENFORCED RATHER THAN NOTED. Three resolutions are
// possible for a red label and only the first counts as coverage:
//
//   exact      — one call site carries that label. Counted.
//   ambiguous  — two or more do (a duplicated literal, or a template whose
//                pattern matches several). NOT counted, listed by name.
//   unresolved — none does. The harness has been edited since the run, or the
//                label is built in a way this cannot match. NOT counted.
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
// A `check()` label is one of two things in the source: a quoted literal, or a
// template. A literal compares by equality. A template is turned into a
// pattern by replacing every `${...}` with `.*` — mechanical, with no reading
// of what the expression inside might produce — so
// `the chain holds exactly one claim (${n})` matches the printed
// `the chain holds exactly one claim (1)`.
//
// TEMPLATES ARE NOT A CORNER CASE: this repository's harnesses use them for
// exactly the labels that carry a measured figure, which are the labels most
// worth having coverage on.

/** Every labelled `check()` call site in a harness, with its line and the
 *  pattern its label makes. Written to find call sites and NOT to parse
 *  JavaScript: a quote inside a label is handled, a `check(` inside a string
 *  is not, and the `verify` subcommand is what catches the difference. */
function callSites(src) {
  const sites = [];
  const re = /\bcheck\(\s*(['"`])((?:\\.|(?!\1)[\s\S])*?)\1/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const [, quote, raw] = m;
    const line = src.slice(0, m.index).split('\n').length;
    // The printed label is the RESOLVED string, so source escapes have to be
    // undone before comparing: `\'` prints as `'`.
    const unescaped = raw.replace(/\\(['"`\\])/g, '$1').replace(/\\n/g, '\n');
    sites.push({
      line,
      raw: unescaped,
      // A template with no substitution is just a literal.
      isTemplate: quote === '`' && /\$\{/.test(raw),
      pattern: quote === '`' && /\$\{/.test(raw)
        ? new RegExp(`^${unescaped.split(/\$\{[\s\S]*?\}/).map(escapeRe).join('[\\s\\S]*')}$`)
        : null,
    });
  }
  return sites;
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** exact | ambiguous | unresolved, and never a guess. */
function resolve(label, sites) {
  const hits = sites.filter((s) => (s.pattern ? s.pattern.test(label) : s.raw === label));
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
  const totalSites = harnesses.reduce(
    (n, f) => n + callSites(readFileSync(join(HARNESS_DIR, f), 'utf8')).length, 0);

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
  let ambiguous = 0; let unresolved = 0;
  for (const r of records) {
    const h = perHarness.get(r.harness) ?? { runs: 0, lines: new Set() };
    h.runs += 1;
    for (const red of r.red) {
      if (red.kind === 'exact') {
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
  if (ambiguous || unresolved) {
    console.log('');
    console.log(`== NOT COUNTED: ${ambiguous} ambiguous, ${unresolved} unresolved ==`);
    console.log('   An ambiguous label is carried by two or more call sites; an unresolved one by');
    console.log('   none. Neither is promoted to coverage, so this figure understates by exactly');
    console.log('   these, which is the safe direction.');
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
  let repaired = 0;
  const cache = new Map();
  for (const [i, r] of records.entries()) {
    if (!cache.has(r.harness)) {
      const path = join(HARNESS_DIR, r.harness);
      cache.set(r.harness, existsSync(path) ? callSites(readFileSync(path, 'utf8')) : null);
    }
    const sites = cache.get(r.harness);
    if (sites === null) { stale.push({ i, r, why: 'the harness no longer exists' }); continue; }
    for (const red of r.red) {
      if (red.kind !== 'exact') {
        // NOT silently skipped, and the distinction is the whole point of
        // separating these two lists. A red that was NEVER exact was never
        // counted as coverage, so it is not a claim that has gone bad — but it
        // IS a check an injection reddened and this ledger cannot name, which
        // is worth seeing rather than hiding.
        neverExact.push({ r, red });
        continue;
      }
      const now = resolve(red.label, sites);
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
  if (repaired > 0) {
    writeFileSync(STORE, records.map((r) => JSON.stringify(r)).join('\n') + '\n');
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
else {
  console.error('usage: ledger.mjs <record|report|verify> ...');
  console.error('  record <harness> --note "<what was injected>" [--id A] [--file <run output>]');
  process.exit(2);
}
