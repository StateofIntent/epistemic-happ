#!/usr/bin/env node
// ============================================================================
// scripts/check-load-bearing.mjs — docs/open-work.md §8.1 row 8.3, the
// read-layer half of §5.3's load-bearing concentration.
//
// WHICH ROWS IS THIS FILE RESTING THE MOST WEIGHT ON, AND IS THE SUPPORT
// UNDER THEM THIN?
//
// WHY THIS EXISTS. The idea is borrowed, and so is the failure it looks for.
// An external inquiry recorded four successive conclusions each resting on the
// one before, all of which traced to a SINGLE secondhand, unreplicated
// observation with a known confound — and no individual step was wrong. Its
// own prescription: "build the dependency graph, weight each node by how much
// rests on it, and flag any node whose support is thin relative to its load."
//
// THE CLASS IS NOT IMPORTED ON SOMEBODY ELSE'S AUTHORITY. It has a confirmed
// instance in this file: line ~1811 reads "~~It is the only open decision on
// this list~~ — FALSE, corrected 2026-11-14: TWENTY-SEVEN rows carry a live
// [D]". A boundary claim about one row, wrong, inherited as a premise and
// quoted back as fact repeatedly inside one session. The most-cited row in the
// file was carrying an assertion nobody had re-checked.
//
// WHAT IT MEASURES. Nodes are rows; an edge is one row's id appearing in
// prose anywhere else in the file.
//
//   LOAD      — how many times a row is invoked outside its own declaration.
//   OPEN [D]  — the row still carries an undecided decision, read off the
//               owner and status columns by this file's own convention:
//               an obsolete half is STRUCK THROUGH, so `~~…~~` spans are
//               stripped before the D is looked for, and a TAKEN / DECIDED /
//               ANSWERED / CLOSED / WITHDRAWN / DONE / BUILT marker beside it
//               means settled. Same rule `check-stale-blockers.mjs` uses, for
//               the same reason.
//
// A row is reported when BOTH hold: much rests on it, and what it rests on is
// a decision nobody has taken. That is the shape worth a human's attention —
// downstream work resting on an open question is how an omission propagates.
//
// IT IS ORTHOGONAL TO `check-stale-blockers.mjs` AND THE PAIR IS DELIBERATE.
// That script checks the OPENNESS direction: a row's [D] is settled and prose
// elsewhere still calls it open. This one checks the LOAD direction: a row's
// [D] is open and a great deal is built on top of it. Neither sees the other's
// defect.
//
// ---------------------------------------------------------------------------
// WHY IT IS A REPORT AND ALWAYS EXITS ZERO, AND THE FALSE POSITIVES ARE NAMED
// RATHER THAN FILTERED — `check-prose-claims.mjs` is the precedent, where
// comparing claims against totals naively produced 63 false reds on correct
// prose, and a gate with 63 false reds is not a weak gate but a broken one.
//
//   1. THIS FILE RETAINS SUPERSEDED BLOCKS ON PURPOSE, and that was the first
//      measured false positive. §0's own convention is that "every block below
//      this one is older", so a dated checkpoint saying a decision is
//      untouched was TRUE WHEN WRITTEN. Row 6.12 is declared TWICE — line
//      ~1801 inside a 2026-11-13 block reading "`[D]` untouched", and
//      canonically in §6 where the decision is recorded as taken. Reading the
//      first produced a confident flag on the most-cited row in the file and
//      it was wrong. **Only the canonical tables are parsed for declarations**
//      — everything from §1 onward — while LOAD is still counted across the
//      whole file, because a historical invocation is still an invocation.
//
//   2. AN EXTERNAL DOCUMENT'S SECTION NUMBERS ARE INDISTINGUISHABLE FROM THIS
//      FILE'S ROW IDS, and §8 introduced exactly that collision by citing
//      another document's §2.5, §5.3, §5.9 and §3.1 in the same notation.
//      Measured: `5.9` occurs zero times before §8 and three times inside it.
//      Small, and it inflates load for any row whose id collides. Not
//      filtered, because a heuristic that guessed which `3.1` was meant would
//      be a worse error than the one it fixed.
//
//   3. LOAD IS NOT IMPORTANCE. A row cited often may simply be old. The split
//      between narrative and canonical citations is printed for every row so a
//      reader can see whether the weight is current or historical, rather than
//      being handed one number that hides it.
//
//   4. A BOUNDARY-PHRASE COUNT IS PRINTED AS CONTEXT AND IS NOT A TRIGGER, and
//      that is a measured decision rather than caution. Flagging on §8.0's
//      trigger vocabulary as well turned 13 of the top 16 rows red, because
//      rows here are long and "the only" and "must be" occur in nearly all of
//      them. 8.3 named the cry-wolf risk in advance; this is what it looked
//      like, so the signal was demoted to a column.
// ---------------------------------------------------------------------------

import { readFileSync } from 'node:fs';

const FILE = 'docs/open-work.md';
const CANON_START = '\n## 1. Immediate engineering';
// Load at or above this is "a great deal rests on it". Chosen from the
// measured distribution rather than taste: 141 canonical rows, and the count
// falls away sharply after the first dozen.
const LOAD_FLOOR = 15;

const src = readFileSync(FILE, 'utf8');
const cut = src.indexOf(CANON_START);
if (cut < 0) {
  console.log(`${FILE}: could not find the canonical section boundary ("## 1. Immediate engineering").`);
  console.log('Nothing measured. This is a REPORT and exits zero regardless.');
  process.exit(0);
}
const narrative = src.slice(0, cut);
const canonical = src.slice(cut);

/** Row declarations, canonical tables only — see false positive 1. A later
 *  declaration wins, so the canonical row beats an identically-numbered one
 *  that a retained historical block happens to carry. */
const rows = new Map();
for (const line of canonical.split('\n')) {
  const m = line.match(/^\|\s*\**~*\**\s*(\d+\.\d+)\s*\**~*\**\s*\|/);
  if (m) rows.set(m[1], line);
}

const stripStruck = (t) => t.replace(/~~[\s\S]*?~~/g, '');
const SETTLED = /\b(TAKEN|DECIDED|ANSWERED|CLOSED|WITHDRAWN|DONE|BUILT)\b/;
const BOUNDARY = /\b(the only|exactly (?:two|three|four|five|\d+)|ruled out|must be|nowhere|can never)\b/gi;

const count = (hay, id) => hay.split(new RegExp(`\\b${id.replace('.', '\\.')}\\b`)).length - 1;

const report = [];
for (const [id, own] of rows) {
  const total = count(src, id) - count(own, id);
  const inNarrative = count(narrative, id);
  const bare = stripStruck(own);
  // An open [D] is a live `[D]` mention, or a bare D in the owner column,
  // with no settled marker anywhere in the unstruck row.
  const hasD = bare.includes('[D]') || /\|\s*\**\s*D\b/.test(bare);
  const openD = hasD && !SETTLED.test(bare);
  report.push({
    id, load: total, narrative: inNarrative, canonical: total - inNarrative,
    openD, boundary: (bare.match(BOUNDARY) || []).length,
  });
}
report.sort((a, b) => b.load - a.load);

const flagged = report.filter((r) => r.load >= LOAD_FLOOR && r.openD);

console.log(`${FILE}: ${rows.size} canonical rows, ${report.reduce((n, r) => n + r.load, 0)} citations.`);
console.log('');
console.log('  row      load   (hist/canon)  open[D]  boundary');
for (const r of report.slice(0, 16)) {
  console.log(
    `  ${r.id.padEnd(7)}${String(r.load).padStart(4)}   `
    + `(${String(r.narrative).padStart(3)}/${String(r.canonical).padStart(3)})`
    + `${r.openD ? '     YES ' : '      -  '}`
    + `   ${r.boundary}`,
  );
}
console.log('');

if (flagged.length === 0) {
  console.log(`No row carries both a load of ${LOAD_FLOOR}+ and an undecided [D].`);
} else {
  console.log(`${flagged.length} ROW(S) CARRY A LOAD OF ${LOAD_FLOOR}+ WITH AN UNDECIDED [D]:`);
  console.log('');
  for (const r of flagged) {
    console.log(`  ${r.id} — invoked ${r.load} times (${r.narrative} in the in-flight`
      + ` narrative, ${r.canonical} in canonical rows), decision still open.`);
  }
  console.log('');
  console.log('That is work resting on a question nobody has answered. It is not a');
  console.log('defect by itself — a well-known open decision is SUPPOSED to be cited.');
  console.log('What it asks is whether anything downstream has quietly started');
  console.log('treating the open question as settled, which is the one thing this');
  console.log('script cannot see and a reader can.');
}

console.log('');
console.log('A REPORT, NOT A GATE — always exits zero. It cannot tell a historical');
console.log('citation from a live one by meaning, only by position; an external');
console.log("document's section numbers look exactly like row ids; and load is not");
console.log('importance. The four measured false-positive classes are named in this');
console.log("file's header rather than filtered out.");
