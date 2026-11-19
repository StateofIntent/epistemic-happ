// WATCHING `verify.mjs` FAIL — open-work 7.30.
//
// The check this harness exercises replaced one that COULD NOT FAIL: both
// sides of the old `on released DHT` line were frozen at install time, so
// once it had printed YES it printed YES for ever. A replacement that is
// only ever seen printing YES is the same thing again, so this file exists
// to show it going red — [[an-exit-code-is-not-a-measurement]].
//
// It stubs ONLY the release read and imports verify.mjs completely
// unchanged; the conductor, the cell and the chain dump are all real.
//
//   node verify-injections.mjs                 # every mode, with verdicts
//   node verify-injections.mjs <mode>          # one mode, full output
//
// ────────────────────────────────────────────────────────────────────────
// THE MODE TABLE IS DERIVED NOW, AND IT USED TO BE PASTED. That is the
// same defect as 7.30 itself, one level up, and it was found by moving
// this file into the repository on 2026-11-19 — which is most of the
// argument for having moved it.
//
// TWO THINGS WERE WRONG, and both had been true for a day without anybody
// being able to see them:
//
//  1. `control` WAS THE LITERAL STRING 'v0.3.6', commented as *the live
//     tag*. The live tag became `v0.3.7` on 2026-11-19. The mode went on
//     PASSING — because 0.3.6 and 0.3.7 are both in the `0.3.x` band — so
//     it passed BY LUCK while its stated reason was false. A mode whose
//     justification has quietly stopped being true is worse than one that
//     reddens. **`control` now does not stub at all**, so it IS the live
//     tag by construction and cannot drift again.
//
//  2. EVERY OTHER TAG WAS RELATIVE TO A `0.3.x` SEED THAT NOTHING STATED.
//     `patch: v0.3.9` means *a patch keeps the seed* only while the node
//     is installed under `0.3.x`. Reinstall it under `0.4.x` — which is
//     precisely the event row 7.30 exists for — and `v0.3.9` becomes a
//     DIFFERENT band, so the harness would report FAIL for a check that
//     was working perfectly. A harness that goes red by luck is the same
//     defect as one that goes green by luck, and worse in the hands of a
//     second operator who cannot tell it from a real break.
//
//     So the band is READ OFF THE RUNNING NODE — out of `control`'s own
//     output, which means no second conductor connection and no second
//     copy of `breakingVersion` to drift — and the tags are built from it.
// ────────────────────────────────────────────────────────────────────────

import { bandPlan } from './band-plan.mjs';

const PATHNAME = new URL(import.meta.url).pathname;

// Modes that need no band, because they never get as far as comparing one.
// Each must FAIL LOUD (exit 1) rather than fall back — 7.30's limit (2).
const UNCONDITIONAL = {
  garbage: { tag: 'banana', exit: 1, why: 'an unreadable tag must fail loud, not guess' },
  notag:   { tag: null,     exit: 1, why: 'a 200 with no tag_name is not an answer' },
  http404: { http: 404,     exit: 1, why: 'rate-limited or repo moved — fail loud, limit (2)' },
  down:    { throws: true,  exit: 1, why: 'no network — fail loud rather than fall back' },
};

// ── child: run one mode ────────────────────────────────────────────────
const one = process.argv[2];
if (one) {
  if (one === 'control') {
    // NO STUB AT ALL. This is the live release, read for real, which is
    // the only way the word "control" stays true without maintenance.
    await import('./verify.mjs');   // exits on our behalf
  }
  const spec = JSON.parse(process.env.EPI_INJECT ?? 'null');
  if (!spec) { console.error(`mode '${one}' needs EPI_INJECT; run without arguments`); process.exit(64); }
  const real = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    if (!String(url).includes('api.github.com')) return real(url, opts);
    if (spec.throws) throw new Error('getaddrinfo ENOTFOUND api.github.com');
    if (spec.http) return new Response('stub', { status: spec.http });
    return Response.json(spec.tag ? { tag_name: spec.tag } : {});
  };
  await import('./verify.mjs');     // exits on our behalf
}

// ── parent: derive the band from a live run, then judge every mode ─────
const { spawnSync } = await import('node:child_process');

const run = (name, spec) => spawnSync(process.execPath, [PATHNAME, name],
  { encoding: 'utf8', env: { ...process.env, EPI_INJECT: JSON.stringify(spec ?? null) } });

const verdictOf = (r) => (r.stdout + r.stderr).split('\n')
  .find((l) => /on released DHT|CANNOT VERIFY|CANNOT INSTALL/.test(l))?.trim() ?? '(no verdict line)';

// CONTROL RUNS FIRST AND IS ALSO THE INSTRUMENT. It proves the harness is
// not what makes the other modes red, AND its output is where the band
// comes from. If it cannot answer, nothing below can be judged, so this
// stops rather than guessing a band — the same refusal `verify.mjs` makes.
const ctl = run('control');
const ctlOk = ctl.status === 0;
console.log(`${ctlOk ? '  ok  ' : 'FAIL  '}${'control'.padEnd(8)} exit ${ctl.status} (want 0)  ${verdictOf(ctl)}`);
console.log('        the live release, not stubbed at all — proves the harness is not what makes it red');
if (!ctlOk) {
  console.log('\nCANNOT JUDGE THE REST — control did not pass, so the band it would');
  console.log('supply is not trustworthy. Fix the node or the network first; a mode');
  console.log('table built on a guessed band would be the defect 7.30 was opened for.');
  process.exit(1);
}

const seed = /installed seed\s*:\s*(\S.*?)\s*\(/.exec(ctl.stdout)?.[1];
const band = seed?.slice(seed.indexOf('-') + 1);   // product name carries no hyphen
const plan = band && bandPlan(band);
if (!plan) {
  console.log(`\nCANNOT JUDGE THE REST — could not read a seed band from control's output (seed: ${seed ?? 'none'}).`);
  process.exit(1);
}
console.log(`        band read off the node: '${band}' — every tag below is derived from it`);

const MODES = {
  ...(plan.same
    ? { patch: { tag: plan.same, exit: 0, why: plan.sameWhy } }
    : { patch: { skip: plan.sameSkip } }),
  bumped: { tag: plan.minor, exit: 2, why: plan.minorWhy },
  major:  { tag: plan.major, exit: 2, why: 'a further band is a third seed shape' },
  pre:    { tag: plan.pre,   exit: 2, why: 'prereleases get their own seed, and it is not ours' },
  ...UNCONDITIONAL,
};

let bad = 0, ran = 1, skipped = 0, red = 0;
for (const [name, m] of Object.entries(MODES)) {
  if (m.skip) {
    skipped++;
    console.log(`  skip  ${name.padEnd(8)} not applicable in band '${band}'`);
    console.log(`        ${m.skip}`);
    continue;
  }
  const r = run(name, m);
  const ok = r.status === m.exit;
  if (!ok) bad++;
  ran++;
  if (m.exit !== 0) red++;
  console.log(`${ok ? '  ok  ' : 'FAIL  '}${name.padEnd(8)} exit ${r.status} (want ${m.exit})  ${verdictOf(r)}`);
  console.log(`        ${m.why}${m.tag ? `   [${m.tag}]` : ''}`);
}

// THE CLOSING COUNT IS COMPUTED. It used to read "the check can fail, in
// six ways" and seven of the nine modes were failures — a hand-stated
// number that nothing gated, which is what `check-harness-counts.mjs`
// exists for one directory over. Counting it here is cheaper than gating it.
console.log(bad === 0
  ? `\nall ${ran} modes as expected${skipped ? ` (${skipped} not applicable in band '${band}')` : ''} — the check can fail, in ${red} ways`
  : `\n${bad} MODE(S) WRONG`);
process.exit(bad === 0 ? 0 : 1);
