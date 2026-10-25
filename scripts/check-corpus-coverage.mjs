#!/usr/bin/env node
// ============================================================================
// scripts/check-corpus-coverage.mjs — every type the inventory says has
// assertable rules must either be in the corpus's coverage lists or be
// declared here with a reason.
//
// WHY THIS EXISTS, AND IT IS A REAL HOLE RATHER THAN A HYPOTHETICAL ONE.
// `replay.mjs` already checks coverage in both directions, and both checks are
// blind to the same thing:
//
//   - the per-type loop iterates `COVERED` and `COVERED_LINKS`, so a type
//     ABSENT from those lists is never looked at — its rules are demanded by
//     nothing and reported by nothing;
//   - the orphan check fires for a CASE naming a rule the inventory no longer
//     lists, which by construction cannot fire for a RULE naming no case.
//
// So a type can be added to the zome, have its rules inventoried as
// assertable, and be covered by nothing, while the corpus reports "0 failed,
// 0 skipped" and every per-type line reads "N of N".
//
// THAT IS NOT A WORRY, IT IS WHAT HAPPENED. `protocol_version: 11` added
// settlement: three entry types, which went into `COVERED`, and two link
// types — `TargetToAssessment` and `TargetToSettlementStatus`, five assertable
// rules each — which did not go into `COVERED_LINKS`. Ten rules sat
// undemanded, and the corpus stayed green for four days. The same omission was
// then made again on the 4.5 branch and caught only because its cases happened
// to name rules, which tripped the orphan check from the other side.
//
// WHY STATIC AND NOT A CASE IN `replay.mjs`. The answer needs the inventory
// and two JavaScript arrays, and nothing else — no conductor, no DHT, no
// built hApp. Putting it here means it answers in milliseconds on every pull
// request, in the workflow that runs no conductor, rather than fourteen
// minutes into one. It also keeps the corpus's own check total out of it: a
// check inside `replay.mjs` would change the number the corpus README records.
//
// DECLARATIONS ARE ASSERTED IN BOTH DIRECTIONS, which is the discipline
// `replay.mjs`'s own GAPS list already uses. A declared gap must STILL have
// assertable rules (or it is a stale name silencing nothing) and must STILL be
// absent from the coverage lists (or it is a declaration left behind after the
// work landed, quietly excusing a type that no longer needs excusing). The
// escape hatch cannot rot into a silencer in either direction.
// ============================================================================

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const INVENTORY = resolve(REPO, 'scripts/validation-corpus/corpus/inventory.json');
const REPLAY = resolve(REPO, 'scripts/validation-corpus/replay.mjs');

// The classes that mean "a JavaScript caller can make this rule fire" —
// the same three `replay.mjs`'s own coverage loops use.
const ASSERTABLE = ['honest', 'crafted', 'deferred'];

// --- Types that are deliberately not in the corpus's lists. Each needs a
// reason a reader can check, not a note that it was looked at.
const DECLARED = {
  entries: {
    create_entry: 'NOT AN ENTRY TYPE. `validate_create_entry`\'s generic update arm — the '
      + '§5.1 refusal of entry updates — belongs to no single entry type, so the corpus\'s '
      + 'per-entry driver has nowhere to put it. It IS asserted, by '
      + '`scripts/live-verify/attachment-links.mjs` through `attempt_entry_update`, which is '
      + 'why `enumerate.mjs` classes it `crafted` rather than unreachable.',
  },
  // EMPTY, AND IT WAS NOT WHEN THIS FILE WAS WRITTEN. `TargetToAssessment` and
  // `TargetToSettlementStatus` were declared here on 2026-10-25 with their ten
  // rules named, and the cases were written the same day (item 1.10), so both
  // declarations were deleted — which this checker's own second direction
  // would have forced anyway: a declaration left standing beside real coverage
  // fails as an excuse that outlived its gap.
  links: {},
};

let failed = 0;
const fail = (msg, ...rest) => {
  failed++;
  console.error(`FAIL: ${msg}`);
  for (const r of rest) console.error(`      ${r}`);
};

// --- Parse the two lists out of replay.mjs as text. A real import would need
// its conductor connection; the lists are plain string arrays and reading them
// as source is how every other checker here reads the thing it gates.
const replay = readFileSync(REPLAY, 'utf8');
function listFrom(name) {
  const m = new RegExp(`const ${name} = \\[([\\s\\S]*?)\\];`).exec(replay);
  if (!m) {
    fail(`could not find \`const ${name} = [...]\` in replay.mjs`,
      'This checker reads it as source. If it was renamed or reshaped, update this parser —',
      'do not delete the check, which is what the thing it guards would most like.');
    return new Set();
  }
  const items = [...m[1].matchAll(/'([A-Za-z_]+)'/g)].map((x) => x[1]);
  if (items.length === 0) fail(`${name} parsed as empty, which would make this check vacuous`);
  return new Set(items);
}
const COVERED = listFrom('COVERED');
const COVERED_LINKS = listFrom('COVERED_LINKS');

// --- What the inventory says has rules worth asserting.
const inv = JSON.parse(readFileSync(INVENTORY, 'utf8'));
const entryRules = new Map();
const linkRules = new Map();
for (const site of inv.sites) {
  if (!site.message || !ASSERTABLE.includes(site.class)) continue;
  const bump = (map, key) => map.set(key, (map.get(key) ?? 0) + 1);
  if (site.link_type) bump(linkRules, site.link_type);
  else if (site.entry) bump(entryRules, site.entry);
}
if (entryRules.size === 0 || linkRules.size === 0) {
  fail('the inventory yielded no assertable entry or link rules, so this check would pass vacuously',
    `entries: ${entryRules.size}, links: ${linkRules.size}. Was inventory.json regenerated?`);
}

// --- 1. Nothing with rules may be silently uncovered.
function audit(kind, rules, covered, declared) {
  const undeclared = [];
  for (const [type, n] of rules) {
    if (covered.has(type) || declared[type]) continue;
    undeclared.push([type, n]);
  }
  for (const [type, n] of undeclared) {
    fail(`${kind} "${type}" has ${n} assertable rule(s) and is in neither the coverage list nor the declared list.`,
      `The corpus will report nothing about it: its per-type loop iterates the coverage list,`,
      `so an absent type is never looked at and "0 failed, 0 skipped" says nothing about these`,
      `${n} rule(s). Either write the cases and add it, or declare it here with a reason.`);
  }
  return undeclared.length === 0;
}
audit('entry type', entryRules, COVERED, DECLARED.entries);
audit('link type', linkRules, COVERED_LINKS, DECLARED.links);

// --- 2. And every declaration must still be earning its place, both ways.
function auditDeclared(kind, declared, rules, covered) {
  for (const type of Object.keys(declared)) {
    if (!rules.has(type)) {
      fail(`${kind} "${type}" is declared uncovered but the inventory lists no assertable rules for it.`,
        `A declaration for a type with no rules silences nothing and hides the fact that the`,
        `type, or its rules, is gone. Delete the entry.`);
    }
    if (covered.has(type)) {
      fail(`${kind} "${type}" is declared uncovered AND present in the coverage list.`,
        `The cases were written, so the excuse outlived the gap. Delete the declaration —`,
        `left in place it would quietly excuse this type again the next time its rules grow.`);
    }
  }
}
auditDeclared('entry type', DECLARED.entries, entryRules, COVERED);
auditDeclared('link type', DECLARED.links, linkRules, COVERED_LINKS);

if (failed) {
  console.error(`\n${failed} problem(s).`);
  process.exit(1);
}

const sum = (m) => [...m.values()].reduce((a, b) => a + b, 0);
const declaredRules = (declared, rules) =>
  Object.keys(declared).reduce((a, t) => a + (rules.get(t) ?? 0), 0);

console.log(`CORPUS COVERAGE DEMANDED: every type with assertable rules is listed or declared.`);
console.log(`  entry types  ${entryRules.size} with rules — ${COVERED.size} covered, ${Object.keys(DECLARED.entries).length} declared`);
console.log(`  link types   ${linkRules.size} with rules — ${COVERED_LINKS.size} covered, ${Object.keys(DECLARED.links).length} declared`);
const underDeclaration =
  declaredRules(DECLARED.entries, entryRules) + declaredRules(DECLARED.links, linkRules);
console.log(`  rules        ${sum(entryRules) + sum(linkRules)} assertable, of which `
  + `${underDeclaration} ${underDeclaration === 1 ? 'sits' : 'sit'} under a declaration`);
console.log(`  (This counts what the corpus is ASKED for, not what it ran. The run's own`);
console.log(`   total needs a conductor — scripts/validation-corpus/README.md records it.)`);
