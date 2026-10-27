#!/usr/bin/env node
// ============================================================================
// scripts/check-row-status.mjs — A ROW THAT IS DONE IN ITS BODY AND OPEN IN ITS
// STATUS COLUMN IS WORSE THAN AN UNDOCUMENTED ONE.
//
// WHY THIS EXISTS. `docs/open-work.md` opens by saying that every line carries
// what it is blocked on, and that this is "the only property that makes rot
// detectable: a line whose blocker has gone is a line to act on". That
// property depends on the LAST column being true. On 2026-10-27 seven rows in
// §1 — 1.9 through 1.15 — carried a struck-through body saying CLOSED while
// their final column still read `nothing`, which is the spelling for "open and
// unblocked". Scanning the column the file tells you to scan therefore
// produced a list of finished work, and it misled a reader into offering that
// work as available. Twice.
//
// WHAT IT CHECKS, and deliberately nothing else: if a row's body is struck
// through (`~~`) or declares itself CLOSED / DONE / BUILT / SENT / WRITTEN /
// TAKEN near its start, then its owner or status column must say so too. The
// file already has two accepted spellings for that — `done` in the status
// column, or a `**DONE**`-style marker in the owner column — and both pass.
//
// WHAT IT DOES NOT CHECK. Whether a row is ACTUALLY finished: that is a human
// judgement and no script can make it. This catches only the disagreement
// between a row's two halves, which is a mechanical fact and the exact shape
// that bit here.
// ============================================================================

import fs from 'node:fs';

const FILE = 'docs/open-work.md';
const ROW = /^\| (\d+\.\d+) \| (.*)\|\s*$/;
const CLOSED_IN_BODY = /\*\*(CLOSED|DONE|BUILT|SENT|WRITTEN|TAKEN)\b/;
const CLOSED_IN_STATUS = /\bdone\b|DONE|SENT|BUILT|WRITTEN|TAKEN|CLOSED/;

const lines = fs.readFileSync(FILE, 'utf-8').split('\n');
const bad = [];
let rows = 0;

for (const line of lines) {
  const m = ROW.exec(line);
  if (!m) continue;
  const [, id, rest] = m;
  const parts = rest.split(' | ');
  if (parts.length < 3) continue;
  rows += 1;

  const body = parts.slice(0, -2).join(' | ');
  const owner = parts[parts.length - 2].trim();
  const status = parts[parts.length - 1].trim();

  const closed = body.trimStart().startsWith('~~') || CLOSED_IN_BODY.test(body.slice(0, 400));
  const declared = CLOSED_IN_STATUS.test(status) || CLOSED_IN_STATUS.test(owner);

  if (closed && !declared) bad.push({ id, owner, status });
}

if (bad.length > 0) {
  console.error(
    `\n${FILE}: ${bad.length} row(s) read as CLOSED in the body while the status column still reads open.\n`
  );
  for (const b of bad) {
    console.error(`  ${b.id.padEnd(5)} owner=${JSON.stringify(b.owner)}  status=${JSON.stringify(b.status)}`);
  }
  console.error(
    `\nA row whose blocker has gone is "a line to act on" — so a finished row that still
says \`nothing\` advertises work that does not exist. Put \`done\` (optionally dated,
e.g. \`**done 2026-10-27**\`) in the last column, or a \`**DONE**\` marker in the owner
column, whichever matches the row's neighbours.\n`
  );
  process.exit(1);
}

console.log(`${FILE}: ${rows} rows, every closed row declares it in its status or owner column.`);
