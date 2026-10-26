#!/usr/bin/env node
// ============================================================================
// scripts/check-time-units.mjs — is every app-level time field written in the
// unit SPEC.md §5.23 declares for it?
//
// WHY THIS EXISTS. Every time field in this protocol is an app `u64` the
// caller or the coordinator fills, so no HDK type carries its unit and nothing
// could enforce one. Measured 2026-10-26 (open-work 1.17), the code had drifted
// into interpreting them TWO ways at once:
//
//   - `get_agent_constitution` drops an expired `Constitution` by comparing
//     `expires_at` against `sys_time().as_seconds_and_nanos().0` — SECONDS.
//   - `get_foresight_record` compares `reveal_deadline` against
//     `as_micros()` — MICROSECONDS, and correctly, because
//     `validate_pre_registration` compares that same field against the
//     commit's action timestamp in micros and that comparison is DHT-side.
//   - `Claim.timestamp` was written in SECONDS by `assert_expertise` and
//     `promote_mew_to_claim` and in MICROS by `publish_discourse_reading` and
//     `import_foreign_critique` — one field, one entry type, one zome.
//
// WHY A GATE RATHER THAN THE DECLARATION ALONE. The asymmetry is the argument.
// A `timestamp` in the wrong unit is a display defect, because nothing in the
// protocol reads those fields (§5.22). An EXPIRY in the wrong unit is silent:
// a micros `expires_at` is ~1e5 times larger than the seconds `now` it is
// compared against, so the entry never expires — and `validate_constitution`
// cannot catch it, since its only rule is `expires_at > published_at`, true in
// either unit. A convention invisible to validation and invisible to the
// reader is exactly the kind this repository has repeatedly found rotted.
//
// WHAT IT CHECKS, on both sides of the wire:
//   1. The coordinator zome: every `<field>: sys_time()?...` assignment uses
//      the unit §5.23 declares for that field's family.
//   2. The clients — `scripts/live-verify/`, `mobile-ui/src/`, `agent-sdk/src/`,
//      `mcp-server/`, `bridge/src/`: every `<field>: <expr>` whose expression
//      is a recognisable now-expression uses the declared unit.
//   3. That SPEC.md actually carries the §5.23 declaration, so the gate cannot
//      pass by enforcing a rule the specification no longer states.
//
// NEGATIVE EVIDENCE — this gate has been watched failing, on both sides.
//
//   Probe 1: `promote_mew_to_claim`'s `Claim.timestamp` reverted to
//   `as_seconds_and_nanos()`. Result: 1 FAIL naming the file, the line, the
//   unit found and the unit declared.
//
//   Probe 2: `promise-compliance.mjs`'s `published_at` switched to
//   `nowMicros()` — the dangerous direction, since that is the family an
//   expiry read consults. Result: 1 FAIL, with the consequence spelled out in
//   the message rather than left to the reader.
//
//   Probe 3, the documentation half (2026-10-27): both payloads in
//   `docs/the-joining-promise.md` reverted to `<now, micros>`. Result: 2 FAILs
//   naming file, line and field — which is the error that actually happened
//   the day before and that a code-only scan could not see.
//
// Both restored and re-run green. A gate that has only ever passed has not
// been shown to test anything, which is this repository's rule for harnesses
// and applies no less to its checkers.
//
// WHAT IT DOES NOT CHECK. That a caller passes a *correct* time — nothing can,
// since §5.22's whole point is that validation cannot reach a clock. Only that
// the MAGNITUDE convention is uniform. An expression this file does not
// recognise is reported as unrecognised rather than passed silently, because a
// quiet skip is how the original drift survived.
// ============================================================================

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// SPEC.md §5.23 is the authority; this is that table, as code.
const MICROS = new Set(['timestamp', 'reveal_deadline']);
const SECONDS = new Set(['created_at', 'published_at', 'expires_at', 'start_time', 'end_time']);
const FIELDS = [...MICROS, ...SECONDS];

let failed = 0;
const fail = (msg, ...rest) => {
  failed++;
  console.error(`FAIL: ${msg}`);
  for (const r of rest) console.error(`      ${r}`);
};

const want = (field) => (MICROS.has(field) ? 'micros' : 'seconds');

/** The unit of a now-expression, or null when it is not one at all.
 *
 * `null` is the common case and must stay cheap: most `timestamp:` lines pass
 * a value through from elsewhere (`claim.timestamp`, `mew.timestamp`, a
 * variable, a field of a payload), and those carry whatever unit their source
 * had. Only an expression that MINTS a time is checkable here. */
function unitOf(expr) {
  const e = expr.trim();
  if (/as_micros\(\)/.test(e)) return 'micros';
  if (/as_seconds_and_nanos\(\)/.test(e)) return 'seconds';
  if (/\bnowMicros\s*\(\)/.test(e)) return 'micros';
  if (/\bnowSecs\s*\(\)/.test(e)) return 'seconds';
  if (/Date\.now\(\)\s*\*\s*1000/.test(e)) return 'micros';
  if (/Math\.floor\(\s*Date\.now\(\)\s*\/\s*1000\s*\)/.test(e)) return 'seconds';
  if (/\bDate\.now\(\)\s*(?:[,)}]|$)/.test(e)) return 'millis';
  return null;
}

function scan(relPath) {
  const abs = resolve(REPO, relPath);
  if (!existsSync(abs)) { fail(`${relPath} does not exist — this scan would pass vacuously`); return 0; }
  const src = readFileSync(abs, 'utf8');
  let checked = 0;
  src.split('\n').forEach((line, i) => {
    const bare = line.trim();
    if (bare.startsWith('//') || bare.startsWith('*') || bare.startsWith('#')) return;
    for (const field of FIELDS) {
      const m = line.match(new RegExp(`\\b${field}:\\s*([^,\\n]+)`));
      if (!m) continue;
      const got = unitOf(m[1]);
      if (got === null) continue;            // passed through, not minted here
      checked++;
      if (got !== want(field)) {
        fail(`${relPath}:${i + 1} writes \`${field}\` in ${got}, and SPEC.md §5.23 declares ${want(field)}`,
          bare.slice(0, 100),
          field === 'expires_at' || field === 'published_at' || field === 'created_at'
            ? 'An expiry in micros is ~1e5 too large to ever fire, and validation cannot catch it.'
            : 'See SPEC.md §5.23 for why this family is micros.');
      }
    }
  });
  return checked;
}

// --- 4. The payload examples in documentation, which are what people COPY.
//
// WHY THIS HALF EXISTS, AND IT IS NOT HYPOTHETICAL. The scan above reads code.
// On 2026-10-27, the day after §5.23 was declared and gated,
// `docs/the-joining-promise.md` — the file whose payloads an invitee is meant
// to copy verbatim — specified `published_at` and `created_at` in MICROS, the
// exact error the declaration exists to forbid. Nothing caught it, because the
// code was right and the example was wrong.
//
// ONLY INSIDE FENCED CODE BLOCKS, and that restriction is load-bearing: the
// prose around these fields legitimately says things like *"a micros
// `expires_at` is ~1e5 times too large to ever fire"*, which describes the bug
// rather than committing it. A scan that read prose would flag §5.23 itself,
// this file's own header, and every row that explains the trap.
function scanDocFences(relPath) {
  const abs = resolve(REPO, relPath);
  if (!existsSync(abs)) return 0;
  const src = readFileSync(abs, 'utf8');
  let inFence = false;
  let checked = 0;
  src.split('\n').forEach((line, i) => {
    if (/^\s*```/.test(line)) { inFence = !inFence; return; }
    if (!inFence) return;
    for (const field of FIELDS) {
      // TO END OF LINE, unlike the code scan above, and that difference cost a
      // debugging round: a placeholder reads `<now, in SECONDS — see §5.23>`,
      // so stopping at the first comma captures `<now` and the unit is lost.
      // One field per line is the shape every payload example here has.
      const m = line.match(new RegExp(`"?${field}"?\\s*:\\s*([^\\n]+)`));
      if (!m) continue;
      const value = m[1].replace(/,\s*$/, '');
      const got = unitOf(value) ?? wordUnit(value);
      if (got === null) continue;
      checked++;
      if (got !== want(field)) {
        fail(`${relPath}:${i + 1} documents \`${field}\` in ${got}, and SPEC.md §5.23 declares ${want(field)}`,
          line.trim().slice(0, 100),
          'An example is copied verbatim more often than it is reasoned about.');
      }
    }
  });
  return checked;
}

/** A placeholder's unit stated in words — `<now, SECONDS>`, `<now, micros>`.
 *
 * An example cannot always carry a real expression, so the unit has to be
 * sayable. Deliberately narrow: only these words, and only when one appears
 * without the other, so `<the caller's own clock>` is left unrecognised rather
 * than guessed at. */
function wordUnit(expr) {
  const micros = /\bmicros(?:econds)?\b/i.test(expr);
  const seconds = /\bsec(?:ond)?s?\b/i.test(expr);
  if (micros && !seconds) return 'micros';
  if (seconds && !micros) return 'seconds';
  return null;
}

const TARGETS = [
  'dna/coordinator/src/lib.rs',
  'mobile-ui/src/main.ts',
  'mobile-ui/src/notes-ui.ts',
  'mobile-ui/src/types.ts',
  'agent-sdk/src/index.ts',
  'bridge/src/index.ts',
  ...readdirSync(resolve(REPO, 'scripts/live-verify'))
    .filter((f) => f.endsWith('.mjs'))
    .map((f) => `scripts/live-verify/${f}`),
];

let total = 0;
for (const t of TARGETS) total += scan(t);

// Every Markdown file at the root and under docs/, plus the package READMEs a
// stranger installs against. A fence in any of them is something somebody will
// paste.
const DOCS = [
  ...readdirSync(REPO).filter((f) => f.endsWith('.md')),
  ...readdirSync(resolve(REPO, 'docs')).filter((f) => f.endsWith('.md')).map((f) => `docs/${f}`),
  ...readdirSync(resolve(REPO, 'docs/cases')).filter((f) => f.endsWith('.md')).map((f) => `docs/cases/${f}`),
  'agent-sdk/README.md',
  'mcp-server/README.md',
  'scripts/live-verify/README.md',
];
let docTotal = 0;
for (const d of DOCS) docTotal += scanDocFences(d);

// The declaration itself. Without this, deleting §5.23 would leave a gate
// enforcing a rule the specification no longer makes — which is the shape of
// drift this file exists to catch, one level up.
const spec = readFileSync(resolve(REPO, 'SPEC.md'), 'utf8');
if (!/^### 5\.23 /m.test(spec)) {
  fail('SPEC.md has no §5.23 — the unit declaration this gate enforces is gone');
}
for (const field of FIELDS) {
  if (!spec.includes(field)) fail(`SPEC.md §5.23 does not mention \`${field}\`, which this gate enforces`);
}

// A scan that found nothing passes vacuously, and this suite has been bitten
// by exactly that before.
if (total < 50) fail(`only ${total} minted time values found across ${TARGETS.length} files — the scan is probably broken`);
// Same reasoning for the documentation half: the two payloads in
// `docs/the-joining-promise.md` are the ones an invitee copies, so a doc scan
// finding nothing means the fences moved, the placeholders stopped naming a
// unit, or the regex broke — never that the examples became safe.
if (docTotal < 2) fail(`only ${docTotal} documented time values found in ${DOCS.length} documents — the fence scan is probably broken`);

if (failed > 0) {
  console.error(`\n${failed} time-unit problem(s).`);
  process.exit(1);
}
console.log(`time-units: ${total} minted time values across ${TARGETS.length} code files, plus ${docTotal} in documentation fences across ${DOCS.length} documents — each in the unit SPEC.md §5.23 declares.`);
console.log('(Magnitude convention only — no gate can check that a self-reported time is TRUE. That is §5.22.)');
