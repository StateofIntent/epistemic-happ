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
// SHOULD rules about validation. **One of those rules is now checked** — §5.2's
// author binding, below — and the rest are not: §5.1, §5.3 and every per-type
// rule in §2 remain prose. A green run means the function list agrees and that
// one rule holds. It does not mean the specification is verified, and this file
// must not be cited as if it did — that would be the same shape of overclaim
// §2.3 was just corrected for.
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
// recurrence is, and that is what this repository keeps paying for. Three
// further checks fall out of having both sets:
//
//   A `callZome` literal that is not an extern is a call to a function that
//   does not exist. §9 asserts "no call site names a function that does not
//   exist" — asserted by hand, until now.
//
//   A README ratio that disagrees with the real one fails the build, so the
//   number cannot quietly go stale between recounts.
//
//   And BOTH halves of §9's surfacing claim are checked rather than one. Every
//   unsurfaced extern must have a reason in the accounting table — and every
//   function the "Shipped so far:" sentence names must have a call site and be
//   a real extern. The residue half was gated first; leaving the shipped half
//   ungated left the direction nobody looks in unguarded, because a sentence
//   denying a screen gets found when somebody wants the feature, and a
//   sentence promising one that is gone does not get found at all.
//   This file printed "§9 carries a reason for each" for a long time without
//   testing it — a label claiming more than its assertion, which is the
//   defect this repository corrects most often, here in its own gate. The
//   residue had been itemised in prose and recounted by hand three times;
//   `get_protocol_version` was missed by all three. A table can be checked
//   where a paragraph cannot.
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
//   ----- and for the residue accounting, added later -----
//
//   Injection: `get_protocol_version`'s row deleted from §9's table.
//   Result: red, naming it. Chosen deliberately as the injection, because it
//   is not hypothetical: that function really did sit unsurfaced and
//   unaccounted for through three hand recounts of this residue, and was
//   found by somebody adding up a paragraph rather than by anything here.
//
//   Injection: a row added for `get_foresight_record`, which has a surface.
//   Result: red, "now surfaced" — the direction that catches accounting kept
//   after the thing it excuses has been built, which is how a residue list
//   grows reasons nobody rechecks.
//
//   Injection: a row added for `get_claim_by_vibes`, which does not exist.
//   Result: red, "not an extern".
//
//   Injection: the table's header reworded to `| Function | Note |`.
//   Result: red via SETUP FAILED, for the same reason as the ratio sentence
//   above — a gate whose subject can vanish silently is not a gate.
//
//   ----- and for the shipped half of §9's claim, added later -----
//
//   Injection: `get_grounding_path`'s call site renamed in `mobile-ui`, with
//   §9 still naming it as shipped.
//   Result: red, naming it — a sentence promising a screen that is not there.
//
//   Injection: `get_imaginary_thing` added to the shipped sentence.
//   Result: red, "names these as shipped and they are not externs".
//
//   THE FIRST ATTEMPT AT THAT SECOND INJECTION DID NOT FIRE, and the check was
//   right to stay green. The edit was aimed with a bare string replace and
//   landed on the FIRST `get_grounding_path` in the document — line 190, a §2
//   table — nowhere near §9's sentence. So it tested nothing and reported a
//   pass. Recorded because an injection that misses looks exactly like a gate
//   that works, and the only thing telling them apart is checking where the
//   edit landed.
//
//   Injection: "Shipped so far:" reworded to "Already done:".
//   Result: red via SETUP FAILED, same as the ratio sentence and the residue
//   table before it.
//
//   ----- and for SPEC §5.2's author binding, added later -----
//
//   Injection: `validate_claim`'s `if &claim.author != action.author()`
//   replaced with `if false`, so the arm exists and checks nothing.
//   Result: red, "Claim.author (validate_claim: NOT BOUND)".
//
//   AND THE INJECTED VERSION COMPILES, which is the premise this check rests
//   on rather than an aside. `cargo build --release --target
//   wasm32-unknown-unknown` finished clean, exit 0, with one warning — and the
//   warning only appeared because `action` became unused in that function. A
//   validator that still used the action for anything else would compile with
//   no warning at all. So rustc's exhaustive match guarantees an arm EXISTS
//   and says nothing about what it checks, and an entry type whose author is
//   forgeable ships green.
//
//   Not injected, because it cannot be done honestly in one edit: a NEW entry
//   type with an author field and no bind. The check covers it by construction
//   — it enumerates the structs rather than a fixed list — but that is reach,
//   not evidence, and is marked as such here.
//
//   Restored and re-run: green, exit 0, on all seven checks. The integrity
//   zome was rebuilt and repacked afterwards and the DNA hash is back to
//   uhC0keFcP2UoOwpAWpSNZp4gHfxalbVrV_aBQ8Fmi8U8b72kSp68Y, because an
//   injection into THIS zome leaves a different network behind if it is not.
//
// Run: node scripts/check-spec-drift.mjs
// Exits non-zero on drift, and names every difference in both directions.
// ============================================================================

import { readFileSync, readdirSync, statSync } from 'node:fs';

const ZOME = new URL('../dna/coordinator/src/lib.rs', import.meta.url).pathname;
const INTEGRITY = new URL('../dna/integrity/src/lib.rs', import.meta.url).pathname;
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

/** SPEC §5.2's author binding, which is the first VALIDATION RULE this file
 *  checks rather than a name list.
 *
 * §5.2: "For every entry type carrying an `author`/`agent`/`creator`/`proposer`
 * field, that field MUST equal the actual authoring action's real author."
 * A missing bind is forgery — an agent authoring an entry attributed to
 * somebody else — so it is worth more than a prose rule.
 *
 * WHY THE COMPILER DOES NOT ALREADY COVER THIS, which is the whole reason the
 * check earns its place. `validate_create_entry`'s match over `EntryTypes` has
 * no wildcard, so rustc refuses to build if a new entry type has no arm — that
 * part is genuinely gated already and nothing here duplicates it. What rustc
 * cannot see is what the arm DOES. A new entry type with an `author` field,
 * wired to a validator that checks everything except the binding, compiles
 * clean and ships a forgeable entry.
 *
 * ALL THIRTEEN BIND TODAY, measured when this was written, so this finds no
 * current defect and is not pretending to. It exists for the fourteenth.
 *
 * The comparison has to name the FIELD, not merely mention the action: an
 * earlier version of this check looked for any `.author()` call in the
 * validator and would have passed a validator that called it for some other
 * purpose entirely. */
function authorBinding() {
  const src = readFileSync(INTEGRITY, 'utf8');
  const structs = [...src.matchAll(/#\[hdk_entry_helper\][\s\S]*?pub struct (\w+) \{([\s\S]*?)\n\}/g)];
  if (structs.length === 0) return null;

  const AUTHORISH = ['author', 'agent', 'creator', 'proposer'];
  const snake = (n) => n.replace(/(?<!^)(?=[A-Z])/g, '_').toLowerCase();
  const out = [];

  for (const [, name, body] of structs) {
    const fields = [...body.matchAll(/^\s*pub (\w+):/gm)].map((m) => m[1]);
    const field = fields.find((f) => AUTHORISH.includes(f));
    if (!field) continue;

    const fn = `validate_${snake(name)}`;
    const m = src.match(new RegExp(`\\nfn ${fn}\\b[\\s\\S]*?\\n\\}`));
    if (!m) { out.push({ name, field, fn, status: 'no validator found' }); continue; }

    const bound = new RegExp(
      `\\.${field}\\s*!=\\s*[^\\n]*action\\.author\\(\\)`
      + `|action\\.author\\(\\)\\s*!=\\s*[^\\n]*\\.${field}`,
    ).test(m[0]);
    out.push({ name, field, fn, status: bound ? 'bound' : 'NOT BOUND' });
  }
  return out;
}

/** Every function §9 names in its "Shipped so far:" sentence.
 *
 * THE MIRROR OF `accountedFor`, AND THE HALF THAT WAS NOT CHECKED. That
 * function gates the functions §9 says have NO screen; this one gates the ones
 * it says DO. Both halves of the same claim, and only one of them was tested.
 *
 * This repository has already paid for the error in the other direction — §9
 * records "a stale sentence naming a capability as unsurfaced a month after it
 * shipped, which cost a session's work before anybody noticed". A sentence
 * naming something as SHIPPED that has quietly lost its call site fails the
 * same way and costs the same thing: it tells the next person a screen exists
 * when it does not, which is a worse lie than the reverse because nobody goes
 * looking.
 *
 * Reads one sentence by its exact opening, so the document can still discuss
 * shipping elsewhere without being gated on it. */
function shippedNames(readme) {
  const i = readme.indexOf('Shipped so far:');
  if (i === -1) return null;
  const sentence = readme.slice(i, readme.indexOf('\n', i));
  return [...sentence.matchAll(/`([a-z_0-9]+)`/g)].map((m) => m[1]);
}

/** Every function named in §9's unsurfaced-accounting table.
 *
 * SCOPED BY ITS HEADER, not by indentation. README.md has other two-column
 * tables whose first cell is a backticked identifier, and a parser that read
 * every one of them would gate rows that are not accounting for anything.
 *
 * WHY THIS TABLE IS GATED AT ALL. The residue was itemised in prose three
 * times and went stale three times — once badly enough that a function was
 * never accounted for at all, which a paragraph cannot notice about itself.
 * Below, the printed line "§9 carries a reason for each" was an assertion this
 * file did not test, which is the same overclaim its own harnesses keep being
 * corrected for. A table is gated where a paragraph cannot be. */
function accountedFor(readme) {
  const lines = readme.split('\n');
  const start = lines.findIndex((l) => /^\s*\|\s*Unsurfaced extern\s*\|/i.test(l));
  if (start === -1) return null;
  const found = new Set();
  for (const line of lines.slice(start + 1)) {
    if (!/^\s*\|/.test(line)) break;
    if (/^\s*\|\s*-+/.test(line)) continue;
    const cell = line.split('|')[1] ?? '';
    const name = cell.match(/`([a-z_0-9]+)`/);
    if (name) found.add(name[1]);
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

// ---------------------------------------------------------------------------
// And that the sentence above is TRUE, which until now it merely claimed.
// Both directions fail differently, and the first is the one that actually
// happened: `get_protocol_version` sat unsurfaced and unaccounted for through
// three hand recounts of this residue.
// ---------------------------------------------------------------------------
const accounted = accountedFor(readFileSync(README, 'utf8'));
const unaccounted = accounted === null ? [] : residue.filter((f) => !accounted.has(f));
const staleRows = accounted === null
  ? []
  : [...accounted].filter((f) => !residue.includes(f)).sort();

if (accounted === null) {
  log('SETUP FAILED: README.md §9 has no "| Unsurfaced extern |" table.');
  log('  This check gates that table, so its absence means it moved or was');
  log('  reworded — and the residue has gone unaccounted for again, which is');
  log('  exactly how a function stayed off the books through three recounts.');
  log('');
} else {
  if (unaccounted.length > 0) {
    log('DRIFT — unsurfaced, and §9 gives no reason:');
    for (const f of unaccounted) log(`  ${f}`);
    log('  Each of these is a protocol surface with no screen and nothing saying');
    log('  why. Add a row to §9\'s table with the reason, or give it a surface.');
    log('');
  }
  if (staleRows.length > 0) {
    log('DRIFT — §9 accounts for functions that are not in the residue:');
    for (const f of staleRows) {
      log(`  ${f}  (${inCode.has(f) ? 'now surfaced' : 'not an extern'})`);
    }
    log('  A row explaining why something has no screen, for something that has');
    log('  one — or that no longer exists. Remove the row.');
    log('');
  }
}

// ---------------------------------------------------------------------------
// And the OTHER half of §9's surfacing claim. `accountedFor` above gates the
// functions it says have no screen; this gates the ones it says do. Two
// directions, failing differently:
//
//   Named as shipped with no call site: the sentence is stale, and it tells
//   the next person a screen exists when it does not — the error §9 records
//   costing a session's work, in the direction nobody goes looking in.
//
//   Named as shipped but not an extern at all: renamed or removed, and the
//   sentence outlived it.
// ---------------------------------------------------------------------------
const shipped = shippedNames(readFileSync(README, 'utf8'));
const shippedUnsurfaced = shipped === null ? [] : shipped.filter((f) => !sites.has(f));
const shippedPhantom = shipped === null ? [] : shipped.filter((f) => !inCode.has(f));

if (shipped === null) {
  log('SETUP FAILED: README.md §9 has no "Shipped so far:" sentence.');
  log('  This check gates that sentence, so its absence means it moved or was');
  log('  reworded — and the shipped half of the surfacing claim has gone');
  log('  unchecked again, which is the half nobody goes looking at.');
  log('');
} else {
  log(`§9 names ${shipped.length} functions as shipped; ${shipped.length - shippedUnsurfaced.length} have a call site.`);
  log('');
  if (shippedUnsurfaced.length > 0) {
    log('DRIFT — §9 says these are shipped, and nothing in mobile-ui calls them:');
    for (const f of shippedUnsurfaced) log(`  ${f}`);
    log('  Either the surface was removed and the sentence was not, or the call');
    log('  site was renamed. A sentence promising a screen that is not there is');
    log('  worse than one denying a screen that is, because nobody checks it.');
    log('');
  }
  if (shippedPhantom.length > 0) {
    log('DRIFT — §9 names these as shipped and they are not externs:');
    for (const f of shippedPhantom) log(`  ${f}`);
    log('  Renamed or removed in the zome, with the sentence left standing.');
    log('');
  }
}

// ---------------------------------------------------------------------------
// SPEC §5.2, and the first validation RULE this file checks rather than a name
// list. rustc already refuses a new entry type with no match arm; it cannot see
// whether the arm binds the author. That gap is where forgery would live.
// ---------------------------------------------------------------------------
const binding = authorBinding();
const unbound = binding === null ? [] : binding.filter((b) => b.status !== 'bound');

if (binding === null) {
  log('SETUP FAILED: no #[hdk_entry_helper] structs found in the integrity zome.');
  log('  The parser or the zome moved, so §5.2 has gone unchecked again.');
  log('');
} else {
  log(`§5.2 author binding: ${binding.length - unbound.length} of ${binding.length} entry types bind their author field to the action author.`);
  log('');
  if (unbound.length > 0) {
    log('DRIFT — an author-ish field that is not bound to the real action author:');
    for (const b of unbound) log(`  ${b.name}.${b.field}  (${b.fn}: ${b.status})`);
    log('  SPEC §5.2 requires that field to equal the authoring action\'s author.');
    log('  Unbound, an agent can author an entry attributed to somebody else, and');
    log('  rustc cannot catch it: the match arm exists, it just does not check.');
    log('');
  }
}

const countDrift = ghosts.length > 0 || stated.length === 0 || wrongRatios.length > 0
  || accounted === null || unaccounted.length > 0 || staleRows.length > 0
  || shipped === null || shippedUnsurfaced.length > 0 || shippedPhantom.length > 0
  || binding === null || unbound.length > 0;

if (undocumented.length === 0 && phantom.length === 0 && !countDrift) {
  log('NO DRIFT: every extern is listed, every listed function exists, every UI');
  log('call names a real extern, README.md states the measured ratio, and every');
  log('unsurfaced extern has a reason in §9 — checked, not just claimed.');
  log('(§5.2 is now checked; the REST of §5 and §7 still are not, and a call');
  log('site is reach, not proof a function is well surfaced.)');
  process.exit(0);
}
process.exit(1);
