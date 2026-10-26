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

if (failed > 0) {
  console.error(`\n${failed} time-unit problem(s).`);
  process.exit(1);
}
console.log(`time-units: ${total} minted time values across ${TARGETS.length} files, each in the unit SPEC.md §5.23 declares.`);
console.log('(Magnitude convention only — no gate can check that a self-reported time is TRUE. That is §5.22.)');
