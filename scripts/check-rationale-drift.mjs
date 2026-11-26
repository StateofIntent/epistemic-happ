#!/usr/bin/env node
/** check-rationale-drift.mjs — rows whose JUSTIFICATION was REPLACED while
 *  their STATUS did not move.
 *
 * ROW 8.37, THE ARM THAT RUNS. The imported finding: a proposal was retained
 * across four sections while its rationale was replaced three times — each
 * substitution drawn from whatever was most recently to hand, with the
 * ranking inherited rather than re-argued. The diagnostic is not that the
 * reason changed; it is that **confidence never fell when a reason was
 * abandoned**. Each abandoned rationale was a failed prediction about why the
 * claim mattered, and several of those should cost a claim something.
 *
 * WHY THE OBVIOUS VERSION IS VACUOUS, WHICH IS MOST OF THIS FILE'S DESIGN.
 * This repository's practice is to APPEND to a row: a finding arrives, the row
 * grows, the marker stays open. A detector written as "the item cell changed
 * while the status cell did not" therefore fires on almost every row in
 * `docs/open-work.md` and reports a defect that is really the house style. It
 * would be green-equivalent noise — the shape this repository has shipped
 * before and now watches for.
 *
 * SO THE DISCRIMINATOR IS DELETION, NOT CHANGE. An append adds text and
 * removes none. A REPLACED rationale removes the reason it replaced. This
 * script flags a row only when a revision DELETED a run of its justification
 * (>= MIN_DELETION chars) while the row's status signature was byte-identical
 * across that same revision. That is the source's pattern and not the house
 * style, and the two are separable by looking at what left rather than at
 * what arrived.
 *
 * WHAT A STATUS SIGNATURE IS. The decision column carries both a MARKER and a
 * QUESTION, and the question legitimately changes when a row is sharpened. So
 * the signature is the marker shape alone — which of D / M / X are present,
 * and whether anything is struck through (`~~`), which is how this file
 * records a decision as taken. A row whose marker shape is unchanged is a row
 * whose priority never moved.
 *
 * WHAT THIS DOES NOT CLAIM. A deletion is not proof of an abandoned
 * rationale: text is also removed to fix an error, to cut length, or to
 * correct a figure — and this repository does all three deliberately. The
 * output is therefore a LIST TO READ, not a verdict, and the script exits 0
 * with findings. It exits non-zero only when it cannot do its job, because a
 * detector that cannot tell "nothing found" from "nothing ran" is the defect
 * it exists to catch (SPEC §7b.1).
 *
 * AND IT REPORTS ITS DENOMINATOR, for the same reason: how many rows were
 * tracked and how many revisions were walked, so a run finding nothing is
 * distinguishable from a run that parsed nothing.
 *
 * THE FIRST VERSION OF THIS SCRIPT REPORTED ARTIFACTS, AND THE FIX IS WHY IT
 * DIFFS AGAINST A PARENT RATHER THAN AGAINST THE PREVIOUS LOG ENTRY.
 * It walked `git log --reverse -- <file>` and compared each revision to the
 * one before it IN THAT LIST. There are eleven merge commits in this file's
 * history, so consecutive list entries are not parent and child, and the walk
 * was diffing versions that never followed one another. It reported cuts in
 * two different rows from a commit that changed ONE LINE, and row 5.1's text
 * was byte-identical across the revision it was flagged on. Caught by asking
 * why two rows showed cuts of exactly 479 and exactly 240 characters twice —
 * a repeated magnitude is a property of the instrument, not of the history.
 * Each revision is now compared against its own first parent, with blobs
 * cached by object id so the extra reads cost almost nothing.
 */

import { execSync } from 'node:child_process';

const FILE = 'docs/open-work.md';
// Overridable so BOTH output branches can be exercised on demand. A detector
// whose "found nothing" path has never rendered is a detector nobody has seen
// fail, which is this repository's oldest lesson about green runs.
const MIN_DELETION = Number(process.env.RD_MIN_DELETION ?? 240);  // below this, a cut is an edit
const MIN_EVENTS = Number(process.env.RD_MIN_EVENTS ?? 2);        // the source's case had three

const sh = (cmd) => execSync(cmd, { encoding: 'utf8', maxBuffer: 1 << 28 });

/** Split one table row into id / justification / status / blocked.
 *  The justification legitimately contains ' | ', so the ends are taken from
 *  the outside in rather than by splitting into a fixed count. */
function parseRow(line) {
  if (!/^\| \d+\.\d+[a-z]? \|/.test(line)) return null;
  const inner = line.replace(/^\| /, '').replace(/ \|\s*$/, '');
  const parts = inner.split(' | ');
  if (parts.length < 4) return null;           // malformed or a different shape
  return {
    id: parts[0].trim(),
    justification: parts.slice(1, -2).join(' | '),
    status: parts[parts.length - 2],
  };
}

/** The marker shape, which is what "priority did not move" means here. */
function statusSignature(status) {
  const markers = [];
  for (const m of ['D', 'M', 'X']) {
    if (new RegExp(`(\\[|\\*\\*)${m}(\\]|\\*\\*)|^\\s*${m}\\s*$|\\b${m}\\b(?=\\s*—)`).test(status)) markers.push(m);
  }
  return `${markers.sort().join('')}|struck=${status.includes('~~')}`;
}

/** Characters present in `before` and absent from `after`, as a total. Uses a
 *  coarse segment diff rather than a character LCS: the question is whether a
 *  RUN of reasoning left, not how many characters moved. */
function deletedChars(before, after) {
  const sentences = before.split(/(?<=\.)\s+|(?=\*\*[A-Z])/).filter((x) => x.trim().length > 40);
  let gone = 0;
  for (const s of sentences) {
    const probe = s.trim().slice(0, 120);
    if (probe.length > 40 && !after.includes(probe)) gone += s.length;
  }
  return gone;
}

// --no-merges, AND THAT IS THE SECOND INSTRUMENT BUG THIS SCRIPT HAD.
// A merge commit's diff against its first parent re-reports every change that
// arrived from the other side, so a removal already counted at the commit that
// made it was counted AGAIN at the merge that carried it. Row 6.15 showed two
// cuts of exactly 361 characters: one real, at `06340c9d`, and one at
// `767c1525`, a commit whose own subject begins "Merge main". Found by the same
// question that found the first bug — why is a magnitude repeating? — which is
// worth keeping as a habit: a repeated magnitude is a property of the
// instrument far more often than of the history.
const shas = sh(`git log --format=%H --reverse --no-merges -- ${FILE}`).trim().split('\n').filter(Boolean);
if (shas.length < 2) {
  console.error(`CANNOT RUN: ${shas.length} revision(s) of ${FILE} in history — nothing to compare.`);
  process.exit(2);
}

let revisionsWalked = 0;
let parseFailures = 0;
let rootSkipped = 0;
let tip = new Map();
const events = new Map();   // id -> [{sha, gone, sig}]

/** Rows of <file> at <rev>, cached by the blob's object id so that comparing
 *  every commit against its parent re-reads almost nothing. */
const blobCache = new Map();
function rowsAt(rev) {
  let oid;
  try {
    oid = sh(`git rev-parse ${rev}:${FILE} 2>/dev/null`).trim();
  } catch {
    return null;                                // the file did not exist there
  }
  if (blobCache.has(oid)) return blobCache.get(oid);
  const map = new Map();
  for (const line of sh(`git cat-file -p ${oid}`).split('\n')) {
    const r = parseRow(line);
    if (r) map.set(r.id, r);
  }
  blobCache.set(oid, map);
  return map;
}

for (const sha of shas) {
  const cur = rowsAt(sha);
  if (cur === null) continue;
  revisionsWalked += 1;
  tip = cur;
  if (cur.size === 0) parseFailures += 1;

  // AGAINST THIS COMMIT'S OWN FIRST PARENT, never against the previous entry
  // in the log — see the note at the head of this file.
  const prev = rowsAt(`${sha}^`);
  if (prev === null) { rootSkipped += 1; continue; }

  for (const [id, row] of cur) {
    const was = prev.get(id);
    if (!was) continue;
    const sigNow = statusSignature(row.status);
    const sigWas = statusSignature(was.status);
    if (sigNow !== sigWas) continue;            // priority moved; not this pattern
    if (row.justification === was.justification) continue;
    const gone = deletedChars(was.justification, row.justification);
    if (gone < MIN_DELETION) continue;          // an append or a small edit
    if (!events.has(id)) events.set(id, []);
    events.get(id).push({ sha: sha.slice(0, 8), gone, sig: sigNow });
  }
}

// --- the denominator, before any finding -----------------------------------
console.log(`check-rationale-drift — ${FILE}`);
console.log('');
console.log(`  revisions walked:            ${revisionsWalked} of ${shas.length} commits touching the file`);
console.log(`  rows tracked in the tip:     ${tip.size}`);
console.log(`  revisions with no parent copy: ${rootSkipped} (the file's first appearance)`);
console.log(`  revisions parsing to 0 rows: ${parseFailures}`);
console.log(`  bars: a cut counts at >= ${MIN_DELETION} chars; a row is reported at >= ${MIN_EVENTS} cuts`);
console.log('');

if (tip.size === 0) {
  console.error('CANNOT RUN: the tip parsed to zero rows. The table shape changed and this');
  console.error('parser did not follow it — which is a stale parser, not a clean result.');
  process.exit(2);
}

const flagged = [...events.entries()]
  .filter(([, e]) => e.length >= MIN_EVENTS)
  .sort((a, b) => b[1].length - a[1].length);

const single = [...events.entries()].filter(([, e]) => e.length === 1);

if (flagged.length === 0) {
  console.log(`No row has had its justification cut ${MIN_EVENTS}+ times under an unchanged status.`);
  console.log(`(${single.length} row(s) had exactly one such cut, which is an ordinary correction.)`);
} else {
  console.log(`${flagged.length} row(s) had a justification CUT ${MIN_EVENTS}+ times while the status signature held:`);
  console.log('');
  for (const [id, e] of flagged) {
    console.log(`  ${id}  — ${e.length} cuts, status ${e[0].sig}`);
    for (const x of e) console.log(`      ${x.sha}  ${x.gone} chars of reasoning removed`);
  }
  console.log('');
  console.log('  READ THESE RATHER THAN TRUSTING THEM. A deletion is not proof of an');
  console.log('  abandoned rationale — text is also cut to fix an error, to correct a');
  console.log('  figure, or for length, and this repository does all three on purpose.');
  console.log('  What to ask of each: was a REASON replaced, and if so, did the row\'s');
  console.log('  priority survive the reason that justified it?');
}
console.log('');
