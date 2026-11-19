// scripts/pilot-node/band-plan.mjs — given the seed band a node is
// actually installed under, which release tags KEEP that band and which
// MOVE it. Imported by `verify-injections.mjs` to build its mode table,
// and by `band-plan-check.mjs`, which is the only reason it is a module.
//
// WHY IT IS GATED AT ALL. Two of the three branches below cannot run on
// the author's machine: the node is installed under `0.3.x` and will be
// until somebody reinstalls it. So the `<N>.x.x` and `0.0.<patch>`
// branches are code that executes for the first time during exactly the
// event this whole row exists for — a band change, probably on a second
// operator's machine, probably in a hurry. Untested code on the path that
// only runs in the emergency is the worst kind, so the check round-trips
// every derived tag through the REAL `breakingVersion` rather than
// trusting the arithmetic here.

// THE SEED BAND IS WHAT `breakingVersion` COLLAPSES A VERSION TO, and the
// three shapes are not symmetric — which is why this cannot be one regex
// and a `+1`. In a `0.<minor>.x` band a patch keeps the seed and a minor
// breaks it; in an `<N>.x.x` band a MINOR also keeps the seed and only a
// major breaks it; and in a `0.0.<patch>` band EVERY release is its own
// network, so *a patch that keeps the seed* does not exist to be tested.
//
// That last case is returned as `same: null` and reported as a SKIP with
// its reason, rather than quietly dropped. A mode that disappears without
// saying so is a check that stopped counting — which is the ledger defect
// of 2026-11-18, in a different file.
export function bandPlan(band) {
  let m;
  if ((m = /^0\.(\d+)\.x$/.exec(band))) {
    const n = +m[1];
    return { same: `v0.${n}.99`, minor: `v0.${n + 1}.0`, major: 'v1.0.0',
             pre: `v0.${n + 1}.0-alpha.2`,
             sameWhy: 'a PATCH keeps the seed, so it must stay YES',
             minorWhy: 'the case the row was opened for: a minor is a new DHT' };
  }
  // `[1-9]\d*` AND NOT `\d+`, which is a defect `band-plan-check.mjs` found on
  // its first run. `breakingVersion` can never produce `0.x.x` — major zero
  // goes to `0.<minor>.x` or `0.0.<patch>` — so `0.x.x` is not a band any node
  // can be installed under. Accepting it anyway built a plan whose
  // seed-KEEPING tag `v0.99.99` round-trips to `0.99.x`, i.e. a mode that
  // asserts YES while feeding the verifier a tag that moves the seed. A
  // vacuous green, in the harness whose entire job is to prove greens are not.
  if ((m = /^([1-9]\d*)\.x\.x$/.exec(band))) {
    const n = +m[1];
    return { same: `v${n}.99.99`, minor: `v${n + 1}.0.0`, major: `v${n + 2}.0.0`,
             pre: `v${n + 1}.0.0-alpha.2`,
             sameWhy: 'past 1.0 a MINOR keeps the seed too, so it must stay YES',
             minorWhy: 'past 1.0 only a MAJOR is a new DHT' };
  }
  if ((m = /^0\.0\.(\d+)$/.exec(band))) {
    const n = +m[1];
    return { same: null,
             sameSkip: 'in the 0.0.x band every patch is its own network, so no tag keeps this seed',
             minor: `v0.0.${n + 1}`, major: 'v1.0.0', pre: 'v0.1.0-alpha.2',
             minorWhy: 'in the 0.0.x band even a PATCH is a new DHT' };
  }
  return null;
}
