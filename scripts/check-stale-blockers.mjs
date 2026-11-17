#!/usr/bin/env node
// ============================================================================
// scripts/check-stale-blockers.mjs — docs/open-work.md row 1.35.
//
// A CITATION OF SOMEBODY ELSE'S OPEN DECISION, BESIDE A ROW THAT HAS ALREADY
// TAKEN IT.
//
// WHY THIS EXISTS. `docs/open-work.md` opens by promising that every line
// carries what it is blocked on, "the only property that makes rot detectable:
// a line whose blocker has gone is a line to act on". On 2026-11-16/17 FOUR
// records claimed to be blocked on something already answered — a participant's
// six-day-old YES, a comment citing a decision taken the day before, an
// accepted ask a week stale, and a measurement nobody had re-run. Every one was
// found by a human reading the thing NEXT TO the work instead of the summary of
// it, which is not a method that scales.
//
// ONLY ONE OF THE FOUR IS MECHANICALLY CATCHABLE, AND SAYING SO IS THE POINT.
// Two turned on a message arriving in somebody's inbox — evidence this
// repository does not contain. One was a measurement going stale, which is not
// a textual fact at all. The fourth was a CROSS-REFERENCE between two things
// both in the tree: `applet-host.ts` justified a stubbed `search` by calling
// 6.12's `[D]` "an open decision", and 6.12's own owner column had said the
// `[D]` was TAKEN since the day before. That one is string work, and it is all
// this script claims.
//
// WHAT IT CHECKS. Two halves, both read off the tree:
//
//   THE SETTLED SIDE — a row's `[D]` is taken. Read from the owner column by
//   this file's own convention: an obsolete half is STRUCK THROUGH. Strip every
//   `~~…~~` span; if a `D` mention survives without a TAKEN/DECIDED/ANSWERED
//   marker beside it, the decision is still open. That rule reads 6.24's
//   "sub-`[D]` … is STILL OPEN" as open and 6.23's "`[D]` TAKEN — HOLD" as
//   taken, which is what both rows mean.
//
//   THE CITING SIDE — prose elsewhere in the tree saying `<row>'s [D]` with an
//   assertion of OPENNESS in the same breath. A citation alone is not a defect:
//   unfiltered, the same scan returns dozens of hits across rows with settled
//   `[D]`s, nearly all legitimate references to what a decision SAID.
//
// WHY IT IS A REPORT AND EXITS ZERO. `check-prose-claims.mjs` is the precedent
// and the reason: comparing claims against totals naively produced 63 false
// reds on correct prose there, and a gate with 63 false reds is not a weak gate
// but a broken one. Here the measured false-positive class is NAMED rather than
// filtered away — text that QUOTES OR STRIKES a stale claim in order to correct
// it reads identically to the defect, because it contains the defect on
// purpose. Such hits are annotated below, not removed, and they are the reason
// this does not fail a build. Promote it only after its false-positive rate is
// measured on a real corpus rather than on the one example that motivated it.
//
// ONE IMPLEMENTATION FACT A PROTOTYPE RUN PAID FOR. Normalise newlines and
// comment prefixes BEFORE any phrase match. This codebase wraps prose at about
// 76 columns, so "is an open decision" arrives as `is an\n *  open decision`
// and every multi-word phrase silently fails depending on where the wrap falls.
// A prototype reported a clean 0/0 that was really a broken matcher, which is
// an exit code mistaken for a measurement, in a regex.
//
// WHAT IT DOES NOT DO, listed so nobody reads this as rot-proofing: it cannot
// know a person replied, cannot know a measurement is stale, cannot read a
// memory file, and cannot judge whether a citation is historical — only whether
// it sits beside words asserting openness. The other three cases need a human
// re-read of the thing beside the work, which is what found all four.
// ============================================================================

import fs from 'node:fs';
import path from 'node:path';

const ROWS_FILE = 'docs/open-work.md';
const ROW = /^\| (\d+\.\d+) \| (.*)\|\s*$/;
const EXTS = new Set(['.ts', '.mjs', '.js', '.rs', '.md']);
const SKIP_DIRS = new Set(['node_modules', '.git', 'target', 'dist', 'build', '.cargo']);
// This file quotes the defects it hunts for, in its own header, as the evidence
// for every rule below. So it matches itself four times, and that is a
// structural artifact of a detector carrying its corpus rather than anything
// about the tree. The exclusion is named in the output rather than hidden, and
// it is the only one: no other file is skipped for being inconvenient.
const SKIP_FILES = new Set([path.join('scripts', 'check-stale-blockers.mjs')]);

// A `D` mention in an owner column: `**D**`, `` `[D]` ``, `[D]`, or a bare `D`
// token. `\bD\b` deliberately does not match DECIDED or DONE.
const D_MENTION = /`?\*{0,2}\[?\bD\b\]?\*{0,2}`?/g;
// Beside a surviving mention, these say the decision has been taken anyway.
const TAKEN_BESIDE = /\b(TAKEN|DECIDED|ANSWERED|ADOPTED|DELEGATED|WITHDRAWN|SENT)\b/;

// Words that assert the cited decision is STILL OPEN. Nothing here is about a
// decision's content — only about its status.
// THE VOCABULARY WAS MEASURED, NOT GUESSED. The first pass carried only the
// "has it been decided" family and MISSED TWO OF THE THREE live defects on this
// tree, both of which assert the decision's status by saying its work has not
// happened — "6.15's `[D]`, and it is not built", "is 6.15's `[D]` and is
// deliberately not here" — the second of those sitting four lines above the
// built thing. So the "has it been BUILT" family is here too. Going the other
// way, 'blocked on' and 'waiting on' were dropped: generic enough to match
// unrelated prose elsewhere in a 220-character window, and across this corpus
// they produced only false hits.
const OPENNESS = [
  'open decision', 'an open question', 'still open', 'is open',
  'not yet decided', 'not been decided', 'undecided', 'yet to be decided',
  'unsettled', 'not settled', 'unanswered', 'not yet answered',
  'is untouched', 'remains untouched', 'awaiting a decision', 'awaits a decision',
  'is not built', 'and it is not built', 'not built', 'is not here',
  'deliberately not here', 'deliberately not built', 'does not exist yet',
  'not something to settle',
];
// The one measured false-positive class: text that quotes or strikes a stale
// claim in order to CORRECT it contains the defect on purpose.
//
// THE SCOPE OF THIS TEST IS THE CITATION'S OWN SENTENCE AND ITS TWO
// NEIGHBOURS, and that is a measurement too. Tested over the whole 220-char
// window it annotated a REAL defect as a false positive: `own-critiques.mjs`
// says "Push is 6.15's `[D]` and stays undecided", and three sentences later —
// about something else entirely — says "THE REASON GIVEN HERE WAS FALSE". A
// correction announces itself BESIDE the text it quotes; `applet-host.ts`'s
// genuine one does exactly that, with "6.12 was DECIDED on 2026-11-15" in the
// sentence immediately after the stale words it is repeating.
const CORRECTING = /~~|\bFALSE\b|\bno longer\b|\bused to\b|\bexpired\b|\bWHAT IT SAID\b|\bstale\b|\bwas DECIDED\b|\bis NO LONGER\b|\bUSED TO GIVE\b/;

const WINDOW = 220; // characters each side of the citation, after normalising

/** Collapse wraps and comment prefixes so a phrase match sees one line. */
function normalise(text) {
  return text
    .replace(/\r/g, '')
    .replace(/\n[ \t]*(?:\*|\/\/|--|#|-|>)?[ \t]*/g, ' ')
    .replace(/[ \t]+/g, ' ');
}

/** Which rows have a `[D]` still open, by the file's strike-through convention. */
function readRows() {
  const rows = new Map();
  for (const line of fs.readFileSync(ROWS_FILE, 'utf-8').split('\n')) {
    const m = ROW.exec(line);
    if (!m) continue;
    const parts = m[2].split(' | ');
    if (parts.length < 3) continue;
    const owner = parts[parts.length - 2].trim();

    const live = owner.replace(/~~[\s\S]*?~~/g, ' ');
    let open = false;
    let mentions = 0;
    for (const hit of live.matchAll(D_MENTION)) {
      if (!/\bD\b/.test(hit[0])) continue;
      mentions += 1;
      const after = live.slice(hit.index, hit.index + 120);
      if (!TAKEN_BESIDE.test(after)) open = true;
    }
    const hadD = /\bD\b/.test(owner);
    rows.set(m[1], { owner, hadD, settled: hadD && mentions >= 0 && !open });
  }
  return rows;
}

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.') && e.name !== '.') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      walk(p, out);
    } else if (EXTS.has(path.extname(e.name)) && !SKIP_FILES.has(path.normalize(p))) {
      out.push(p);
    }
  }
  return out;
}

function scan(files, rows) {
  const CITE = /(\d+\.\d+)'s (?:sub-)?`?\[D\]`?/g;
  const hits = [];
  let citations = 0;
  for (const file of files) {
    const raw = fs.readFileSync(file, 'utf-8');
    const flat = normalise(raw);
    for (const m of flat.matchAll(CITE)) {
      citations += 1;
      const row = rows.get(m[1]);
      if (!row || !row.settled) continue;
      const window = flat.slice(Math.max(0, m.index - WINDOW), m.index + m[0].length + WINDOW);
      const asserts = OPENNESS.filter((p) => window.toLowerCase().includes(p));
      if (asserts.length === 0) continue;
      hits.push({
        file,
        cited: m[1],
        asserts,
        correcting: CORRECTING.test(neighbourhood(flat, m.index, m[0].length)),
        line: (raw.slice(0, approximateOffset(raw, m[1])).match(/\n/g) ?? []).length + 1,
        window: window.trim(),
      });
    }
  }
  return { hits, citations };
}

/** The citation's own sentence plus the one either side — the scope a
 *  correction occupies when it quotes the claim it is correcting. */
function neighbourhood(flat, index, length) {
  // A row id is `6.15`, so a naive split on `.` cuts every citation in half and
  // the "neighbours" become fragments of the citation itself. Mask the dot
  // between two digits first — the offsets are preserved because the mask is
  // one character wide.
  const masked = flat.replace(/(\d)\.(\d)/g, '$1\u0001$2');
  const sentences = [...masked.matchAll(/[^.!?]*[.!?]+|[^.!?]+$/g)];
  const at = sentences.findIndex((s) => s.index <= index && s.index + s[0].length >= index + length);
  if (at === -1) return flat.slice(Math.max(0, index - 120), index + length + 120);
  return sentences.slice(Math.max(0, at - 1), at + 2).map((s) => s[0]).join('').replace(/\u0001/g, '.');
}

/** Line numbers are approximate by design: the match is made on normalised
 *  text, where offsets no longer correspond to the file. First occurrence of
 *  the cited row id is close enough to find the paragraph by eye. */
function approximateOffset(raw, rowId) {
  const i = raw.indexOf(`${rowId}'s`);
  return i === -1 ? 0 : i;
}

function report(h) {
  console.log(`  ${h.file}:~${h.line}  cites ${h.cited}'s [D], which its owner column says is taken`);
  console.log(`    says: ${h.asserts.map((a) => JSON.stringify(a)).join(', ')}`);
  if (h.correcting) console.log('    NOTE: carries a correction marker — likely the known false-positive class');
  console.log(`    …${h.window.slice(0, 300)}…\n`);
}

function main() {
  const rows = readRows();
  const settled = [...rows.entries()].filter(([, r]) => r.settled).map(([id]) => id);
  const files = walk('.');
  const { hits, citations } = scan(files, rows);

  console.log(`${ROWS_FILE}: ${rows.size} rows, ${settled.length} with a \`[D]\` read as TAKEN.`);
  console.log(`${files.length} files scanned, ${citations} citations of the form \`<row>'s [D]\`.`);
  console.log(`Skipped: ${[...SKIP_FILES].join(', ')} — it quotes its own corpus.`);

  // THE LEDGER IS REPORTED SEPARATELY, AND THE REASON IS A MEASUREMENT RATHER
  // THAN TIDINESS. A citation inside `open-work.md` itself sits three columns
  // from the owner column that settles it, so it cannot be the defect this
  // report is named for — which is a citation OUT OF SIGHT of the row, the
  // shape all four real ones had. And the ledger is where the noise lives: it
  // narrates every decision's history, quotes the stale wording it corrected,
  // and row 1.35's own entry quotes the three defects found below. Measured on
  // 2026-11-17 the split was 4 elsewhere against 11 here. Folding them into one
  // list is how a report stops being read.
  const elsewhere = hits.filter((h) => h.file !== ROWS_FILE);
  const ledger = hits.filter((h) => h.file === ROWS_FILE);

  if (elsewhere.length === 0) {
    console.log('\nNo citation OUTSIDE the ledger asserts that a settled `[D]` is still open.');
  } else {
    const real = elsewhere.filter((h) => !h.correcting);
    console.log(
      `\n${elsewhere.length} citation(s) OUTSIDE ${ROWS_FILE} cite a SETTLED \`[D]\` beside words` +
      `\nasserting it is OPEN — ${real.length} of them NOT carrying a correction marker.\n`
    );
    for (const h of elsewhere) report(h);
  }

  console.log(`\nAnd ${ledger.length} inside ${ROWS_FILE} itself, where the owner column is three`);
  console.log('columns away — narration and quoted history, listed but not actionable:');
  for (const h of ledger) {
    console.log(`  ~${h.line} cites ${h.cited}'s [D] — ${h.asserts.map((a) => JSON.stringify(a)).join(', ')}` +
      `${h.correcting ? ' [correction marker]' : ''}`);
  }

  console.log('THIS IS A REPORT AND ALWAYS EXITS ZERO. It catches one of the four stale');
  console.log('blockers that motivated it — the cross-reference kind. It cannot know that a');
  console.log('person replied, that a measurement went stale, or that a citation is');
  console.log('historical. Those need a human re-reading the thing beside the work.');
}

if (import.meta.url === `file://${process.argv[1]}`) main();
