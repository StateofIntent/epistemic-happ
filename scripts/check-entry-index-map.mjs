#!/usr/bin/env node
// ============================================================================
// scripts/check-entry-index-map.mjs — the client's `entry_index` -> name map
// against the integrity zome's own `EntryTypes` order.
//
// WHY THIS EXISTS. `mobile-ui/src/main.ts`'s `ENTRY_KINDS` turns the
// `entry_index` on an action into a word a reader sees — *Claim*, *Critique*,
// *Evidence* — and that index is POSITION-INDEXED into the integrity zome's
// `EntryTypes` enum. The enum's sibling, `LinkTypes`, carries a comment saying
// new variants must be appended at the END for exactly this reason. Nothing
// enforced it for entry types, and nothing at all connected the Rust order to
// the TypeScript map.
//
// WHAT THE FAILURE LOOKS LIKE WITHOUT THIS GATE, which is why it is worth a
// file: insert one entry type in the middle of `EntryTypes` and every index
// after it shifts by one. The client then labels a `Critique` as an
// `Evidence`, silently and on screen, because nothing about a number looks
// wrong — and the thing it is labelling is somebody's position in a
// disagreement. It is the same class as the validation corpus storing line
// numbers, and the same class as `check-harness-counts.mjs`: an index in one
// file describing an order in another.
//
// WHAT IT DOES NOT CHECK. It does not require the map to be COMPLETE. The
// client only names the entry types a sampled window can plausibly contain,
// and a map that stopped at the twelfth variant is a deliberate choice rather
// than drift — `ENTRY_KINDS` falls back to `Entry type <n>` for anything it
// does not name, which is honest. What it requires is that every index the
// map DOES name is the name the zome gave that position.
// ============================================================================

import { readFileSync } from 'node:fs';

const ROOT = new URL('..', import.meta.url).pathname;
const RUST = `${ROOT}dna/integrity/src/lib.rs`;
const TS = `${ROOT}mobile-ui/src/main.ts`;

const rust = readFileSync(RUST, 'utf8');
const ts = readFileSync(TS, 'utf8');

// --- The zome's order -------------------------------------------------------
const enumMatch = rust.match(/pub enum EntryTypes \{([\s\S]*?)\n\}/);
if (!enumMatch) {
  console.error('SETUP FAILED: could not find `pub enum EntryTypes` in the integrity zome.');
  console.error('This gate compares that order against the client map, so it cannot run.');
  process.exit(2);
}
const variants = [...enumMatch[1].matchAll(/^\s*([A-Z][A-Za-z0-9]*)\s*\(/gm)].map((m) => m[1]);
if (variants.length === 0) {
  console.error('SETUP FAILED: `EntryTypes` parsed to zero variants.');
  process.exit(2);
}

// --- The client's map -------------------------------------------------------
const mapMatch = ts.match(/const ENTRY_KINDS: Record<number, string> = \{([\s\S]*?)\n\};/);
if (!mapMatch) {
  console.error('SETUP FAILED: could not find `ENTRY_KINDS` in mobile-ui/src/main.ts.');
  console.error('If it was renamed, this gate must be renamed with it — a gate that cannot');
  console.error('find its subject is worse than none, because it still reports success.');
  process.exit(2);
}
const client = new Map();
for (const m of mapMatch[1].matchAll(/(\d+)\s*:\s*'((?:[^'\\]|\\.)*)'/g)) {
  client.set(Number(m[1]), m[2]);
}
if (client.size === 0) {
  console.error('SETUP FAILED: `ENTRY_KINDS` parsed to zero entries.');
  process.exit(2);
}

// --- Compare ----------------------------------------------------------------
//
// Names are compared loosely on purpose: the client writes `Critique species`
// where the zome writes `CritiqueSpecies`, because one is read by a person and
// the other by a compiler. Case and non-letters are dropped so the two spell
// the same word, and nothing else is accepted.
const norm = (s) => s.toLowerCase().replace(/[^a-z]/g, '');

const wrong = [];
for (const [idx, name] of [...client].sort((a, b) => a[0] - b[0])) {
  const actual = variants[idx];
  if (actual === undefined) { wrong.push({ idx, name, actual: '(past the end of the enum)' }); continue; }
  if (norm(actual) !== norm(name)) wrong.push({ idx, name, actual });
}

console.log(`EntryTypes has ${variants.length} variants; the client names ${client.size} of them.`);
console.log('');
for (const [idx, name] of [...client].sort((a, b) => a[0] - b[0])) {
  const actual = variants[idx] ?? '(none)';
  const ok = variants[idx] !== undefined && norm(variants[idx]) === norm(name);
  console.log(`  ${String(idx).padStart(2)}  client "${name}"${' '.repeat(Math.max(0, 18 - name.length))} zome ${actual}  ${ok ? '' : '<-- MISMATCH'}`);
}
console.log('');

if (wrong.length === 0) {
  console.log('NO DRIFT: every index the client names is the entry type the integrity zome');
  console.log('committed at that position. New variants must be APPENDED to `EntryTypes` —');
  console.log('inserting one in the middle renumbers everything after it, and this gate is');
  console.log('what turns that from a silent mislabel on screen into a red check.');
  process.exit(0);
}

console.log(`DRIFT — ${wrong.length} index(es) name the wrong entry type:`);
for (const w of wrong) console.log(`  index ${w.idx}: client says "${w.name}", the zome says ${w.actual}`);
console.log('');
console.log('Either a variant was inserted into the MIDDLE of `EntryTypes` — which renumbers');
console.log('every index after it and is the thing `LinkTypes` own comment forbids for the');
console.log('same reason — or `ENTRY_KINDS` was edited without the enum. Fix the map, or');
console.log('move the new variant to the end.');
process.exit(1);
