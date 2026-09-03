#!/usr/bin/env node
// ============================================================================
// scripts/live-verify/agent-sdk.mjs — live verification of
// @epistemic/agent-sdk against a real conductor.
//
// No browser here: an agent is headless by definition, and the thing
// under test is the library's own contract rather than any rendering.
//
// What is actually being checked, beyond "the calls work":
//
//   - The typed payloads round-trip. This is the library's first reason
//     to exist, because a wrong field name fails QUIETLY on the Rust
//     side rather than erroring here.
//   - FrictionLimitError is thrown, and typed, when the budget runs out.
//     An agent loop's whole pacing strategy depends on being able to
//     distinguish "wait" from "something is broken", so this is driven
//     to exhaustion on purpose — 20 critiques until the 21st is refused.
//   - claimsAwaitingMyCritique actually excludes what this agent has
//     already responded to, which is the helper an agent loop is built
//     around.
//   - Trust lenses are passed through exactly as supplied and never
//     defaulted.
//
// Prereqs: scripts/sandbox.sh start (CLEAN — this exhausts the hourly
// friction budget deliberately), and `npm run build` in agent-sdk/.
// ============================================================================
// ---------------------------------------------------------------------------
// NEGATIVE EVIDENCE — this harness has been watched failing.
//
// This directory's own rule is that a harness which has only ever been
// green has not been shown to test anything. Recorded here, rather than
// only in a merged PR, so it is readable at the point someone runs this
// file.
//
//   Regression injected: rethrowing a friction refusal as a plain Error instead of FrictionLimitError.
//   Result: three FAILs — the error is no longer typed, carries no budget, and no longer says that nothing buys past the limit.
//
// Re-check it the same way if you change what this file asserts: inject,
// watch it go red, restore, watch it go green.
// ---------------------------------------------------------------------------

import { createRequire } from 'node:module';

const requireFromSdk = createRequire(new URL('../../agent-sdk/package.json', import.meta.url));
let EpistemicAgent, FrictionLimitError;
try {
  ({ EpistemicAgent, FrictionLimitError } = await import(
    new URL('../../agent-sdk/dist/index.js', import.meta.url).href
  ));
} catch (cause) {
  console.error(`Could not load agent-sdk/dist. Build it first:\n  cd agent-sdk && npm install && npm run build\nCause: ${cause}`);
  process.exit(1);
}
requireFromSdk; // resolution check above is what matters

const DOMAIN = `AgentSdk${Date.now()}`;
const log = (...a) => console.log(...a);

let failures = 0;
const check = (label, cond) => {
  if (cond) log(`  PASS: ${label}`);
  else { log(`  FAIL: ${label}`); failures++; }
};

const agent = await EpistemicAgent.connect();
try {
  log(`connected as ${Buffer.from(agent.agentPubKey).toString('base64').slice(0, 12)}…\n`);

  log('=== Typed writes round-trip ===');
  await agent.publishClaim({
    content: 'Claim published through the agent SDK.',
    domain: DOMAIN,
    confidence: 'Tentative',
    semanticTags: ['sdk'],
  });
  const claims = await agent.claimsInDomain(DOMAIN);
  check('publishClaim wrote a readable claim', claims.length === 1);
  check('the claim decoded with its fields intact',
    claims[0].entry.content === 'Claim published through the agent SDK.'
    && claims[0].entry.confidence === 'Tentative'
    && claims[0].entry.domain === DOMAIN);

  const target = claims[0].entryHash;

  log('\n=== The agent-loop helper ===');
  const before = await agent.claimsAwaitingMyCritique(DOMAIN);
  check('a claim this agent has not critiqued is pending', before.length === 1);

  await agent.critique({
    target, mode: 'Methodological',
    content: 'What observation would distinguish this from correlation?',
  });
  const after = await agent.claimsAwaitingMyCritique(DOMAIN);
  check('once critiqued, the claim is no longer pending', after.length === 0);

  const critiques = await agent.critiquesFor(target);
  check('the critique round-tripped with its mode intact',
    critiques.length === 1 && critiques[0].entry.critique_mode === 'Methodological');

  log('\n=== Reads ===');
  const conductance = await agent.conductanceOf(target, critiques[0].actionHash);
  log(`  conductance of that critique's link: ${conductance}`);
  // Asserted within a tolerance, not as exactly 1.0. A link created a
  // fraction of a second ago has already decayed by ~2.7e-7 against a
  // 30-day half-life, and at a base of 1.0 that IS representable in f32
  // — so an equality check here fails on correct behaviour. (The same
  // over-strict bound bit this repository's credit-balance verification
  // earlier, from the opposite direction: there the delta fell BELOW f32
  // resolution and the value was exact.)
  check('conductanceOf reads the link, fresh and ~1.0',
    conductance !== null && Math.abs(conductance - 1) < 1e-5);

  const antibodies = await agent.antibodyPatternsFor(target);
  check('antibodyPatternsFor returns an empty list, not an error', Array.isArray(antibodies));

  log('\n=== Budget ===');
  const budget = await agent.budget();
  log(`  ${budget.recent_count}/${budget.limit} used in a ${budget.window_secs}s window`);
  check('budget reports the real limit', budget.limit === 20);
  check('budget reflects the critique just written', budget.recent_count === 1);
  check('remainingBudget agrees', await agent.remainingBudget() === 19);

  log('\n=== FrictionLimitError, driven to exhaustion ===');
  // An agent loop's pacing depends on telling "wait" apart from "broken",
  // so this spends the rest of the window's budget deliberately.
  let refused = null;
  let written = 1;
  for (let i = 0; i < 40; i++) {
    try {
      await agent.critique({
        target, mode: 'Logical',
        content: `Budget-exhaustion critique #${i + 1}.`,
      });
      written++;
    } catch (error) {
      refused = error;
      break;
    }
  }
  log(`  wrote ${written} critiques before refusal`);
  check('the write was refused at the limit, not silently dropped', refused !== null);
  check('refusal came after exactly the 20 the limit allows', written === 20);
  check('it is a typed FrictionLimitError, distinguishable from a real fault',
    refused instanceof FrictionLimitError);
  check('the error carries the budget so a loop can decide how long to wait',
    refused?.status?.recent_count === 20 && refused?.status?.blocked === true);
  check('and says plainly that nothing buys past it',
    /nothing buys past this/i.test(refused?.message ?? ''));

  log('\n=== Trust lenses are passed, never defaulted ===');
  const membranes = await agent.membranes();
  check('membranes() returns a list', Array.isArray(membranes));
  // Passing no lens must not invent one; the aggregate counts everything.
  // Verified against a membrane only if one exists on this conductor.
  if (membranes.length > 0) {
    const health = await agent.discourseHealth(membranes[0].entryHash);
    check('discourseHealth with no lens returns a full aggregate',
      typeof health.total_claims === 'number' && typeof health.total_critiques === 'number');
  } else {
    log('  (no membrane on this conductor — lens pass-through covered by membranes-ui.mjs)');
  }

  log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
} finally {
  await agent.close();
}
process.exit(failures === 0 ? 0 : 1);
