#!/usr/bin/env node
// ============================================================================
// scripts/check-spec-drift.mjs — does SPEC.md §10 still list the functions
// that actually exist?
//
// WHY THIS EXISTS. `SPEC.md` is a hand-maintained snapshot of the commit named
// at its own top, and §11 says so. That is honest, and it is also the exact
// arrangement in which a document drifts: nothing fails when a function is
// added, renamed or deleted and the specification is not touched. This
// repository has now corrected the same class of defect by hand three times in
// one day — a §2.3 claim of a security property the code does not provide, and
// two changelog entries asserting a past that had stopped being true — each
// found by somebody reading carefully, and nothing preventing a recurrence.
// This converts the narrowest slice of that into something CI notices.
//
// WHAT IT CHECKS, AND NOTHING MORE. That the set of `#[hdk_extern]` functions
// in the coordinator zome equals the set of functions listed in §10's tables.
// Both directions matter and they fail differently:
//
//   An extern missing from §10 is an undocumented protocol surface — a call a
//   client can make that the specification does not admit exists.
//
//   A §10 row with no extern behind it is worse, because it is a specification
//   describing something that cannot be called. An implementer building
//   against it writes code against a function that is not there.
//
// WHAT IT DOES NOT CHECK, stated here because the gap is larger than the
// check. §10 is a name-and-signature reference; most of `SPEC.md` is MUST and
// SHOULD rules about validation, and NOTHING here verifies that those match
// `validate_*`. A green run means the function LIST agrees. It does not mean
// the specification is verified, and this file must not be cited as if it did
// — that would be the same shape of overclaim §2.3 was just corrected for.
//
// WHY IT READS TABLES AND NOT EVERY BACKTICK. §10's normative content is its
// `| Function | Payload | Returns |` tables. Its prose legitimately names
// things that are not externs: HDK builtins (`get_links`), admin calls
// (`update_coordinators`), and — the case that matters — functions that were
// specified once and REMOVED, which §10 records rather than deleting. Scraping
// every backtick would flag that honesty as drift and push the document toward
// forgetting its own history, so the parser reads rows and leaves prose alone.
//
// ----------------------------------------------------------------------------
// AND SINCE THIS FILE ALREADY HAS THE EXTERN SET, IT ALSO COUNTS THE SURFACE.
//
// README.md §9 tracks how many coordinator functions the UI actually calls.
// That ratio has been wrong at least three times: reported as "12 of 56" for
// several increments because the metric regex only matched calls whose name
// sat on the same line as `callZome` and several wrap; then left at "37 of 58"
// in one paragraph while the headline above it had become correct again at
// "38 of 60"; and most recently a stale sentence naming a capability as
// unsurfaced a month after it shipped, which cost a session's work before
// anybody noticed. §9's own diagnosis is the right one: `check-spec-drift.mjs`
// computes the denominator on every push and "the numerator is the half
// nothing measures."
//
// So it measures the numerator too, and GATES on it. A hand recount that CI
// then enforces is not the mistake; a hand recount with nothing preventing
// recurrence is, and that is what this repository keeps paying for. Two
// further checks fall out of having both sets:
//
//   A `callZome` literal that is not an extern is a call to a function that
//   does not exist. §9 asserts "no call site names a function that does not
//   exist" — asserted by hand, until now.
//
//   A README ratio that disagrees with the real one fails the build, so the
//   number cannot quietly go stale between recounts.
//
// WHAT COUNTS AS SURFACED is deliberately crude: at least one `callZome` call
// site naming the function as a string literal, anywhere under `mobile-ui/src`.
// It does NOT mean the function is well surfaced — §9 records a case where a
// function had a call site and was still half-surfaced, read-only where the
// write mattered. This is a reach metric, and the README says so; a check
// cannot tell a screen from a token call and must not imply it can.
//
// ----------------------------------------------------------------------------
// NEGATIVE EVIDENCE — all three new failures have been watched happening,
// because a gate nobody has seen go red is an assumption, not a check.
//
//   Injection: README's ratio edited to "41 of 60".
//   Result: red, naming both figures — says "41 of 60 coordinator functions",
//   measured 38 of 60.
//
//   Injection: a call site misspelled, `get_claims_by_dmoain`.
//   Result: red, and it names the file. Worth noting what this one proves:
//   the misspelling ALSO drops `get_claims_by_domain` into the unsurfaced
//   list, so the count check alone would have reported a plausible 37 of 60
//   and a one-function regression. The ghost check is what turns that into a
//   named typo instead of a number to be explained.
//
//   Injection: the gated sentence reworded so it states no ratio.
//   Result: red via SETUP FAILED rather than silently passing — the mode that
//   matters most, since a check that goes quiet when its subject disappears is
//   how the metric went unmeasured in the first place.
//
//   Restored and re-run: green on all four checks.
//
// Run: node scripts/check-spec-drift.mjs
// Exits non-zero on drift, and names every difference in both directions.
// ============================================================================

import { readFileSync, readdirSync, statSync } from 'node:fs';

const ZOME = new URL('../dna/coordinator/src/lib.rs', import.meta.url).pathname;
const SPEC = new URL('../SPEC.md', import.meta.url).pathname;
const UI = new URL('../mobile-ui/src', import.meta.url).pathname;
const README = new URL('../README.md', import.meta.url).pathname;

const log = (...a) => console.log(...a);

/** Every `#[hdk_extern] pub fn name` in the coordinator zome.
 *
 * The attribute and the signature are matched together rather than collecting
 * every `pub fn`: the zome has plenty of public helpers that are not protocol
 * surface, and a check that flagged those would train people to ignore it. */
function externs(source) {
  const found = new Set();
  const re = /#\[hdk_extern\][^\n]*\n(?:\s*(?:\/\/[^\n]*|#\[[^\]]*\])\n)*\s*pub fn\s+([a-z_0-9]+)/g;
  for (const m of source.matchAll(re)) found.add(m[1]);
  return found;
}

/** Every function named in the first column of a §10 function table.
 *
 * A table qualifies by its header — `| Function | ... |` — so a table of
 * entry fields or of anything else in the same section is not mistaken for a
 * function list. */
function documented(spec) {
  const lines = spec.split('\n');
  const start = lines.findIndex((l) => /^## 10\./.test(l));
  if (start === -1) throw new Error('SPEC.md has no "## 10." section — this check cannot run');
  let end = lines.findIndex((l, i) => i > start && /^## 11\./.test(l));
  if (end === -1) end = lines.length;

  const found = new Set();
  let inFunctionTable = false;
  for (const line of lines.slice(start, end)) {
    if (/^\|\s*Function\s*\|/i.test(line)) { inFunctionTable = true; continue; }
    if (!line.startsWith('|')) { inFunctionTable = false; continue; }
    if (/^\|\s*-+/.test(line)) continue;
    if (!inFunctionTable) continue;
    const cell = line.split('|')[1] ?? '';
    const name = cell.match(/`([a-z_0-9]+)`/);
    if (name) found.add(name[1]);
  }
  return found;
}

/** Every `.ts`/`.js` file under `mobile-ui/src`, recursively. */
function uiSources(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = `${dir}/${entry}`;
    if (statSync(full).isDirectory()) uiSources(full, out);
    else if (/\.(ts|tsx|js|mjs)$/.test(entry)) out.push(full);
  }
  return out;
}

/** Map of function name -> the UI files whose `callZome` calls name it.
 *
 * MATCHED ACROSS NEWLINES ON PURPOSE. The previous version of this metric
 * lived in a shell pipeline that required the name on the same line as
 * `callZome`, and under-reported for several increments because calls like
 *
 *     await connection.callZome<NeighborRecall[]>(
 *       'query_neighborhood_resonance', { ... },
 *
 * wrap. `[^(]*` skips the generic parameter without crossing into the argument
 * list, and `\s*` then crosses whatever newlines follow the paren.
 *
 * Only string literals count. `holochain.ts`'s own wrapper passes a variable
 * (`callZome(fnName, payload)`), which is the right thing to miss: it is the
 * transport, not a surface. */
function callSites(files) {
  const found = new Map();
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(/callZome[^(]*\(\s*['"`]([a-z_0-9]+)['"`]/gs)) {
      if (!found.has(m[1])) found.set(m[1], new Set());
      found.get(m[1]).add(file.replace(/^.*\/mobile-ui\//, 'mobile-ui/'));
    }
  }
  return found;
}

/** Every live "N of M coordinator functions" claim in README.md.
 *
 * READS ONE EXACT PHRASING, so the document can still carry its own history.
 * §9 deliberately keeps superseded figures ("38 of 58, residue 20") as a
 * record of what was recounted when, and a check that flagged those would
 * push the document toward forgetting how its own count went wrong. Only the
 * phrase used for a CURRENT claim is gated, which means a new copy of the
 * number is gated the moment it is written in that form. */
function statedRatios(readme) {
  return [...readme.matchAll(/(\d+) of (\d+) coordinator functions/g)].map((m) => ({
    text: m[0],
    surfaced: Number(m[1]),
    total: Number(m[2]),
  }));
}

const inCode = externs(readFileSync(ZOME, 'utf8'));
const inSpec = documented(readFileSync(SPEC, 'utf8'));

if (inCode.size === 0) {
  log('SETUP FAILED: no #[hdk_extern] functions found — the parser or the zome moved.');
  process.exit(1);
}
if (inSpec.size === 0) {
  log('SETUP FAILED: no function tables found in SPEC.md §10 — the parser or the section moved.');
  process.exit(1);
}

const undocumented = [...inCode].filter((f) => !inSpec.has(f)).sort();
const phantom = [...inSpec].filter((f) => !inCode.has(f)).sort();

log(`${inCode.size} externs in dna/coordinator/src/lib.rs`);
log(`${inSpec.size} functions listed in SPEC.md §10`);
log('');

if (undocumented.length > 0) {
  log('DRIFT — callable, but not in SPEC.md §10:');
  for (const f of undocumented) log(`  ${f}`);
  log('  A client can call these and the specification does not admit they exist.');
  log('');
}
if (phantom.length > 0) {
  log('DRIFT — in SPEC.md §10, but not callable:');
  for (const f of phantom) log(`  ${f}`);
  log('  Somebody implementing against §10 would write code against a function');
  log('  that is not there. If one was removed on purpose, say so in prose —');
  log('  this check reads tables, so a recorded removal does not trip it.');
  log('');
}

// ---------------------------------------------------------------------------
// The surface count. Computed here rather than by hand, for the reason the
// header gives: every previous figure was hand-derived and every one of them
// went stale between recounts.
// ---------------------------------------------------------------------------
const sites = callSites(uiSources(UI));
const surfaced = [...inCode].filter((f) => sites.has(f)).sort();
const residue = [...inCode].filter((f) => !sites.has(f)).sort();
const ghosts = [...sites.keys()].filter((f) => !inCode.has(f)).sort();
const stated = statedRatios(readFileSync(README, 'utf8'));

log(`${surfaced.length} of ${inCode.size} externs have a callZome call site in mobile-ui/src`);
log('');

// A call to a function that does not exist. Gated, because it is a real
// defect rather than a metric: the UI would throw at runtime on that path.
if (ghosts.length > 0) {
  log('DRIFT — called by the UI, but not an extern:');
  for (const f of ghosts) log(`  ${f}  (${[...sites.get(f)].sort().join(', ')})`);
  log('  These calls name a function the coordinator does not export. Either the');
  log('  extern was renamed or removed, or the call site has a typo — and the UI');
  log('  path that makes the call fails at runtime either way.');
  log('');
}

// The README's own claim about the ratio, verified rather than trusted.
const wrongRatios = stated.filter((r) => r.surfaced !== surfaced.length || r.total !== inCode.size);
if (stated.length === 0) {
  log('SETUP FAILED: README.md states no "N of M coordinator functions" ratio.');
  log('  This check gates that sentence, so its absence means the sentence moved');
  log('  or was reworded, and the count has gone unmeasured again.');
  log('');
} else if (wrongRatios.length > 0) {
  log('DRIFT — README.md states a surface count that is not the real one:');
  for (const r of wrongRatios) log(`  says "${r.text}", measured ${surfaced.length} of ${inCode.size}`);
  log('  Update the sentence to the measured figure. Do not hand-count — this');
  log('  check prints the number, and hand-counting is how it went wrong before.');
  log('');
}

// Printed on every run, green or red: the residue is what somebody has to
// have a reason for, and §9 itemises it. A list that appears only on failure
// is a list nobody reads while it is still correct.
log(`Unsurfaced (${residue.length}) — §9 carries a reason for each:`);
for (const f of residue) log(`  ${f}`);
log('');

const countDrift = ghosts.length > 0 || stated.length === 0 || wrongRatios.length > 0;

if (undocumented.length === 0 && phantom.length === 0 && !countDrift) {
  log('NO DRIFT: every extern is listed, every listed function exists, every UI');
  log('call names a real extern, and README.md states the measured ratio.');
  log('(Names only. Nothing here checks that §5 and §7 match validation, and a');
  log('call site is reach, not proof a function is well surfaced.)');
  process.exit(0);
}
process.exit(1);
