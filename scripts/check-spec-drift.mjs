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
// Run: node scripts/check-spec-drift.mjs
// Exits non-zero on drift, and names every difference in both directions.
// ============================================================================

import { readFileSync } from 'node:fs';

const ZOME = new URL('../dna/coordinator/src/lib.rs', import.meta.url).pathname;
const SPEC = new URL('../SPEC.md', import.meta.url).pathname;

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

if (undocumented.length === 0 && phantom.length === 0) {
  log('NO DRIFT: every extern is listed, and every listed function exists.');
  log('(Names only. Nothing here checks that §5 and §7 match validation.)');
  process.exit(0);
}
process.exit(1);
