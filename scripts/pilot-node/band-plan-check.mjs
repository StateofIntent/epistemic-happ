#!/usr/bin/env node
// ============================================================================
// scripts/pilot-node/band-plan-check.mjs — does the injection harness's mode
// table actually mean what it says, in every band and not just this one?
//
// WHY THIS EXISTS. `verify-injections.mjs` judges `verify.mjs` by feeding it
// tags that should KEEP the node's seed band and tags that should MOVE it. Get
// that backwards and the harness reports FAIL for a working check, or — far
// worse — reports `ok` for a mode that was never testing anything.
//
// The node this project runs is installed under `0.3.x`, so running the
// harness exercises ONE of `bandPlan`'s three branches. The other two execute
// for the first time during a band change: the event row 7.30 was opened for,
// on a machine that is probably not this one. This file is how they get run
// today instead.
//
// HOW IT CHECKS, AND IT IS NOT BY RESTATING THE TABLE. Asserting that the plan
// for `0.3.x` contains the string `v0.4.0` would just be the same arithmetic
// written twice — it would agree with a wrong `bandPlan` as happily as a right
// one. Instead every derived tag is pushed through the REAL `breakingVersion`,
// the same copy `verify.mjs` imports, and the resulting band is compared to
// the band we started from. That is a round-trip, so it fails when the
// arithmetic is wrong rather than when the author changed their mind about a
// number.
//
// THE THREE BANDS ARE NOT SYMMETRIC, which is the whole reason this is not one
// regex: in `0.<minor>.x` a patch keeps the seed; in `<N>.x.x` a MINOR keeps it
// too and only a major breaks it; and in `0.0.<patch>` nothing keeps it, so the
// `patch` mode has no instance and must be SKIPPED WITH A REASON rather than
// silently dropped.
// ============================================================================

import { breakingVersion } from './breaking-version.mjs';
import { bandPlan } from './band-plan.mjs';

let failures = 0;
const check = (label, cond) => {
  if (cond) console.log(`  PASS: ${label}`);
  else { console.log(`  FAIL: ${label}`); failures++; }
};

// Every band shape, including the ones this machine will never be in.
const BANDS = ['0.3.x', '0.1.x', '0.99.x', '1.x.x', '2.x.x', '7.x.x', '0.0.1', '0.0.42'];

for (const band of BANDS) {
  console.log(`\n=== band '${band}' ===`);
  const plan = bandPlan(band);
  check(`${band} is a band bandPlan recognises`, plan !== null);
  if (!plan) continue;

  // THE KEEPING TAG. Must exist, must differ from a bare restatement of the
  // band, and must round-trip to the band itself — or must be absent WITH a
  // stated reason, which is only legitimate in the 0.0.x shape.
  if (plan.same === null) {
    check(`${band} says why it has no seed-keeping tag`, typeof plan.sameSkip === 'string' && plan.sameSkip.length > 0);
    check(`${band} is the only shape allowed to have none`, /^0\.0\.\d+$/.test(band));
  } else {
    check(`${band} keeping tag '${plan.same}' round-trips to '${band}'`, breakingVersion(plan.same) === band);
    check(`${band} has a reason for its keeping tag`, typeof plan.sameWhy === 'string' && plan.sameWhy.length > 0);
  }

  // THE MOVING TAGS. Each must parse, and each must land somewhere ELSE.
  for (const key of ['minor', 'major', 'pre']) {
    const tag = plan[key];
    check(`${band} ${key} tag '${tag}' is readable by breakingVersion`, (() => {
      try { breakingVersion(tag); return true; } catch { return false; }
    })());
    check(`${band} ${key} tag '${tag}' lands OUTSIDE '${band}'`, breakingVersion(tag) !== band);
  }

  // AND THE THREE MOVING TAGS MUST LAND IN THREE DIFFERENT PLACES. If two of
  // them collapsed to the same band the harness would still print three `ok`
  // lines while testing one thing — three green modes, one measurement. That
  // is the vacuous-greens shape, and it is a live hazard here rather than a
  // hypothetical: in an `<N>.x.x` band a minor bump does NOT change the seed,
  // so the naive `+1 to the minor` that is correct for `0.<minor>.x` would
  // make `bumped` and the control indistinguishable.
  const landed = ['minor', 'major', 'pre'].map((k) => breakingVersion(plan[k]));
  check(`${band} moving tags land in ${landed.length} distinct bands (${landed.join(', ')})`,
        new Set(landed).size === landed.length);
}

// NEGATIVE EVIDENCE: a band shape nobody has thought of must be REFUSED, not
// guessed at. `bandPlan` returning something plausible for a string it does
// not understand would hand the harness a table built on nothing, and the
// harness would then report `ok` lines about it.
console.log('\n=== refusals ===');
for (const junk of ['', 'x.x.x', '0.3.7', 'banana', '0.x.x', 'Epistemic Resonance-0.3.x', '0.3.X', '-1.x.x']) {
  check(`refuses band '${junk}'`, bandPlan(junk) === null);
}

console.log(failures === 0
  ? `\nband-plan: all checks passed across ${BANDS.length} bands`
  : `\nband-plan: ${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
