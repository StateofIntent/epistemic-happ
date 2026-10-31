#!/usr/bin/env node
// ============================================================================
// scripts/generate-injections.mjs — docs/open-work.md item 1.21, second half.
//
// PROPOSE A DEFECT THAT SHOULD MAKE A GIVEN CHECK GO RED.
//
// The discipline here is that a check is worth nothing until it has been seen
// going red against a deliberately introduced defect. `injection-coverage.mjs`
// measured who is missing that: TEN harnesses, 200 `check()` call sites, in
// which nothing has ever been watched failing. This proposes the defects for
// those, and ONLY those — it imports the target set from that measurement
// rather than carrying a list, so the scope cannot drift from the evidence
// that justified it.
//
// WHY THE ASSERTION IS THE INPUT. `check(label, cond)` carries the claim in
// English in its own first argument — *"and NOTHING was filtered, which is a
// real neutral position rather than a default"*. That label is a stated
// assertion, and adversarial case generation against a stated assertion is the
// thing models are genuinely good at. The label plus the condition expression
// is what gets sent; the harness's secrets, keys and conductor are not
// involved, because nothing is executed here.
//
// ──────────────────────────────────────────────────────────────────────────
// THIS SCRIPT WRITES A DELIBERATE DEFECT. THREE THINGS FOLLOW, AND THEY ARE
// STRUCTURAL RATHER THAN ADVISORY.
//
//   1. IT CANNOT WRITE INTO A HARNESS. The output directory is refused if it
//      resolves anywhere under `scripts/live-verify`, and the default is
//      outside the repository entirely. 1.21's third objection is that a
//      deliberate defect surviving into `main` is the one outcome worse than
//      an ungated check, and a rule that depends on the operator remembering
//      it is not a rule.
//   2. IT APPLIES NOTHING, EVER. The output is a proposal for a human to read
//      and apply by hand, on a scratch branch, and then throw away. There is
//      no --apply flag and adding one would defeat the file.
//   3. A RED IS NOT A PASS. An injection that reds proves the check fires for
//      THAT defect; it does not prove the check is strong. Worse, a model that
//      writes both the defect and the expectation can agree with itself. So
//      every proposal is emitted with the reviewer's question attached, and
//      the only evidence that counts is a person reading what the injection
//      actually changed. The discipline survives generation. It does not scale
//      with it, which is why the scope is ten harnesses and not 1,353 checks.
// ──────────────────────────────────────────────────────────────────────────
//
// WHAT IT CANNOT TELL YOU. Whether the injection works. Running these needs a
// built hApp and a live conductor — the `conductor` job takes twelve minutes —
// so every proposal is UNVALIDATED by construction and says so in its own
// header. The generator's claim is "this is a defect worth trying against that
// assertion", never "this check is now covered".
//
// USAGE
//   node scripts/generate-injections.mjs                 # list the targets
//   node scripts/generate-injections.mjs --harness index-lens --limit 3
//   node scripts/generate-injections.mjs --harness standing --out /tmp/inj
//
// It needs Your Own AI running with an OFFLINE-ONLY AI: the harness source is
// this repository's unpublished work, and the two headers keep the exchange
// out of the person's records and memories. Routing follows the chosen AI's
// own mode, which a caller cannot override — so pick an offline AI.
// ============================================================================

import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { targets } from './injection-coverage.mjs';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const LIVE = join(ROOT, 'scripts/live-verify');
const YOAI = process.env.YOAI_BASE || 'http://localhost:11435/v1';

const argv = process.argv.slice(2);
const arg = (name, dflt = null) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? dflt : argv[i + 1];
};

// ------------------------------------------------------------------ the guard
// Refuses to aim the output at anything that could become a harness. This is
// the whole of objection (3), enforced rather than written down.
function safeOutDir(given) {
  const out = resolve(given || join(tmpdir(), 'epistemic-injections'));
  if (out === LIVE || out.startsWith(LIVE + '/')) {
    console.error(`REFUSED: --out resolves inside scripts/live-verify (${out}).`);
    console.error('This script writes deliberate defects. It does not write them where a harness lives.');
    process.exit(2);
  }
  if (out === ROOT || (out.startsWith(ROOT + '/') && !out.includes('/tmp'))) {
    console.error(`REFUSED: --out resolves inside the repository (${out}).`);
    console.error('A generated defect inside the working tree is one `git add -A` from main.');
    process.exit(2);
  }
  return out;
}

// --------------------------------------------------------- reading the checks
// `check(label, cond)` — the label is the stated assertion and the condition is
// what must be made false. Only call sites with a literal label are taken: a
// computed label cannot be quoted back to a reviewer.
export function checksIn(file) {
  const src = readFileSync(join(LIVE, file), 'utf8');
  const lines = src.split('\n');
  const out = [];
  lines.forEach((line, i) => {
    const m = line.match(/\bcheck\(\s*([`'"])([^`'"]{4,})\1\s*,?\s*(.*)$/);
    if (!m) return;
    out.push({
      line: i + 1,
      label: m[2].trim(),
      cond: (m[3] || '').replace(/\);\s*$/, '').trim(),
      context: lines.slice(Math.max(0, i - 12), i + 2).join('\n'),
    });
  });
  return out;
}

const SYSTEM = `You design deliberate defects for a test suite, to prove an assertion can fail.

You are given ONE assertion from a live-verify harness: its English label, the condition it evaluates, and the code just above it.

Propose the SMALLEST change to the SYSTEM UNDER TEST (not to the assertion) that should make this assertion go red.

Rules:
- Never weaken or edit the assertion itself. Changing the check proves nothing.
- Prefer a one-line change with an obvious mechanism.
- Say exactly which check(s) you expect to go red, and which you expect to stay green.
- If you believe this assertion CANNOT be made to fail by any change to the system, say so plainly and explain why. That answer is more valuable than a weak injection.

Return JSON only:
{"injection":"what to change, precisely","mechanism":"why that makes it red","expect_red":"which checks","expect_green":"which should stay green","cannot_fail":false}`;

async function propose(model, chk, harness) {
  const user = `harness: ${harness}
assertion label: ${chk.label}
condition: ${chk.cond || '(on the following lines)'}

code immediately above the assertion:
${chk.context}`;
  const res = await fetch(`${YOAI}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Your-Own-AI-Record': 'off',
      'X-Your-Own-AI-Memory': 'off',
    },
    body: JSON.stringify({ model, messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: user }], max_tokens: 700 }),
  });
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 300);
    if (res.status === 503 || /routing_failed/.test(detail)) {
      throw new Error(`${YOAI} could not route to "${model}": ${detail}\nPick an AI set to offline-only and download a model for it.`);
    }
    throw new Error(`${YOAI} returned ${res.status}: ${detail}`);
  }
  const raw = (await res.json()).choices?.[0]?.message?.content ?? '';
  for (const m of raw.matchAll(/\{[\s\S]*\}/g)) {
    try {
      const p = JSON.parse(m[0]);
      if (p.injection || p.cannot_fail) return { ...p, raw };
    } catch { /* keep scanning */ }
  }
  return { injection: null, raw };
}

async function pickModel() {
  if (process.env.YOAI_MODEL) return process.env.YOAI_MODEL;
  const list = await fetch(`${YOAI}/models`).then((r) => r.json());
  const id = (list.data || [])[0]?.id;
  if (!id) throw new Error(`${YOAI} offers no models — open Your Own AI and pick an offline-only AI.`);
  return id;
}

// MEASURED 2026-11-01, first real run: of three proposals against index-lens,
// one was unparseable and BOTH parsed ones changed the harness's own call —
// `a1.call('is_agent_attested', ...)` — rather than the system under test. That
// is the exact failure the reviewer's question exists to catch, and it caught
// it, but only after a person had spent attention on the proposal. It is also
// cheaply detectable, so it is detected here and said at the top of the file.
// This flags; it never discards. A proposal that genuinely must touch the
// harness to express itself is rare but real, and a reviewer should see it and
// decide rather than have it silently dropped.
// NOTE THE WORD BOUNDARY THAT WAS NOT THERE. The first version wrapped this
// alternation in \b(...)\b, and the trailing \b can never match after a '(' —
// so "modify the a1.call() call" sailed through unflagged on the very first
// run that contained it. A safeguard that silently never fires is worse than
// no safeguard, which is the whole subject of this row.
const HARNESS_SHAPED = /check\(|setupFail|\ba[0-9]\.call\b|the harness\b|this test\b|the test's\b|the assertion's precondition/i;

function looksLikeHarnessEdit(p) {
  const text = `${p.injection || ''} ${p.mechanism || ''}`;
  return HARNESS_SHAPED.test(text);
}

function banner(p) {
  if (!looksLikeHarnessEdit(p)) return '';
  return [
    '> ## THIS PROPOSAL APPEARS TO EDIT THE HARNESS, NOT THE SYSTEM',
    '>',
    '> It names test-local things (a check call site, aN.call, setupFail, "the test").',
    '> An injection that changes what the assertion LOOKS AT proves nothing however',
    '> red it goes - see the reviewer question below. Flagged, not discarded: decide.',
    '', '',
  ].join('\n');
}

function render(harness, chk, p) {
  return `# UNVALIDATED INJECTION PROPOSAL — ${harness}:${chk.line}

> Generated by a model. **Nothing here has been run.** Running it needs a built
> hApp and a live conductor. A red proves this check fires for THIS defect; it
> does not prove the check is strong, and the model wrote both the defect and
> the expectation, so it can agree with itself.

## The assertion under test
\`\`\`
check('${chk.label.replace(/`/g, "'")}'${chk.cond ? `, ${chk.cond}` : ''})
\`\`\`

${banner(p)}## Proposed injection
${p.cannot_fail ? '**The model claims this assertion cannot be made to fail.**\n\n' : ''}${p.injection || '(no parseable proposal — raw reply below)'}

## Mechanism
${p.mechanism || '—'}

## Expected
- red: ${p.expect_red || '—'}
- green: ${p.expect_green || '—'}

## Reviewer's question — the only thing that makes a red count
Read the injection and answer in one line: **did it change the system, or did it
change what the assertion looks at?** If the second, the injection is worthless
however red it goes. Then: does \`expect_green\` actually hold, or would a real
defect of this kind have reded more than the model thinks?

- [ ] applied on a scratch branch
- [ ] result recorded
- [ ] scratch branch deleted

<details><summary>raw model reply</summary>

\`\`\`
${(p.raw || '').slice(0, 2000)}
\`\`\`
</details>
`;
}

async function main() {
  const list = targets();
  const want = arg('harness');
  if (!want) {
    console.log('1.21 target set — harnesses with checks and no negative evidence:\n');
    for (const t of list) console.log(`  ${t.file.replace('.mjs', '').padEnd(22)} ${String(t.checks).padStart(3)} checks`);
    console.log('\nnode scripts/generate-injections.mjs --harness <name> [--limit N] [--out DIR]');
    console.log('\nThe set is imported from injection-coverage.mjs, never hardcoded:');
    console.log('a harness leaves it by acquiring negative evidence.');
    return;
  }
  const file = want.endsWith('.mjs') ? want : `${want}.mjs`;
  if (!list.some((t) => t.file === file)) {
    console.error(`REFUSED: ${file} is not in the 1.21 target set.`);
    console.error('Either it already carries negative evidence, or it has no checks.');
    console.error('Run `node scripts/injection-coverage.mjs` to see why.');
    process.exit(2);
  }

  const outDir = safeOutDir(arg('out'));
  const limit = Number(arg('limit', '3'));
  const checks = checksIn(file).slice(0, limit);
  if (!checks.length) {
    console.error(`No literal-label check() call sites found in ${file}.`);
    process.exit(1);
  }
  const model = await pickModel();
  mkdirSync(join(outDir, file.replace('.mjs', '')), { recursive: true });

  console.log(`${file}: proposing against ${checks.length} of ${checksIn(file).length} assertions, model "${model}"`);
  console.log(`out: ${join(outDir, file.replace('.mjs', ''))}\n`);

  for (const chk of checks) {
    process.stdout.write(`  line ${String(chk.line).padStart(4)}  ${chk.label.slice(0, 58)}… `);
    try {
      const p = await propose(model, chk, file);
      const path = join(outDir, file.replace('.mjs', ''), `L${chk.line}.md`);
      writeFileSync(path, render(file, chk, p));
      console.log(p.cannot_fail ? 'CANNOT-FAIL claimed' : !p.injection ? 'unparseable' : looksLikeHarnessEdit(p) ? 'proposed — FLAGGED: looks like a harness edit' : 'proposed');
    } catch (e) {
      console.log(`FAILED — ${e.message.split('\n')[0]}`);
    }
  }

  console.log(`\nNothing was applied and nothing in this repository was modified.`);
  console.log(`Every proposal is UNVALIDATED. Apply by hand on a scratch branch, record the`);
  console.log(`result in the harness's NEGATIVE EVIDENCE section, and delete the branch.`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
