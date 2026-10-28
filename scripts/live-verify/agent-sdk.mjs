#!/usr/bin/env node
// ============================================================================
// scripts/live-verify/agent-sdk.mjs — live verification of
// @stateofintent/agent-sdk against a real conductor.
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
//   - FOUNDING, which was unreachable from this library entirely:
//     `publishConstitution`, `ownConstitution` and `createMembrane`. An
//     agent could JOIN a membrane and could not FOUND one, so it could
//     only ever participate in domains a human had opened — and
//     `create_membrane` needs a constitution's ActionHash, which
//     `get_agent_constitution` does not return. The refusals are
//     asserted BEFORE the first publish, because the central one — an
//     agent with no published constitution founds nothing (README §2.6)
//     — is reachable only while this agent still has none, and a
//     published constitution is permanent.
//   - THE EIGHT FUNCTIONS ADDED FOR open-work 1.19, which existed in the
//     coordinator and were unreachable from this library: assessment
//     (publish + read), settlement (policy, recompute, status), an
//     attributed discourse reading, and pre-registration — commit,
//     reveal, and reading one's own sealed content back. Until these
//     landed, an SDK agent could publish claims, critique, retract and
//     join a membrane, and could NOT make or reveal a pre-registered
//     prediction: the protocol's central mechanism and the one thing
//     every outward-facing document leads with.
//   - A past cone that is true by construction, which is what makes an
//     agent populating `past_cone` legitimate where a client doing it
//     for its user is not — the agent is the reader.
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
//   THE 1.19 SECTION WAS INJECTED THREE TIMES on 2026-10-28, the day it
//   was written, because checks written against defects that have just
//   been fixed are the ones most likely to assert nothing.
//
//   Injection C: `critique` sends `past_cone: []` regardless of what the
//   caller passed.
//   Result: ONE red — "and the cone is ON the stored entry, not merely
//   accepted". **And the check above it STAYED GREEN**: "a critique
//   carrying a non-empty past_cone is ACCEPTED by validation" passed,
//   because `Critique.past_cone` is `#[serde(default)]`, so a payload
//   that drops the field commits happily and records an empty cone. The
//   write succeeding proves nothing about whether the cone arrived —
//   which is exactly why the stored entry is re-read, and the one result
//   here worth remembering.
//
//   Injection D: `witnessedCritiquesOf` returns an empty cone while
//   still returning the critiques — a client claiming to have read
//   nothing it in fact fetched.
//   Result: TWO red — the cone no longer matches what was fetched, and
//   "it is NOT empty, so the next check is not vacuous" fires.
//   AND ONE CHECK PASSES VACUOUSLY UNDER IT, which is worth stating
//   rather than glossing: "the cone is ON the stored entry" compares
//   lengths, and under D both are zero. That is precisely what the
//   non-emptiness check is there to catch, and it is the reason that
//   check exists at all rather than being decoration.
//
//   Injection E: `mySealedPrediction` returns the prediction intact and
//   the salt with its last character replaced — a subtly lossy read,
//   right length and wrong content, which is the shape that matching
//   string comparisons would miss.
//   Result, FIRST TIME: ONE red and then a CRASH. Validation refused the
//   commit — correctly, "Revelation content does not hash to the sealed
//   commitment" — and the unguarded `await` turned the refusal into an
//   uncaught throw that killed the run before the foresight record, the
//   no-score assertion, the settlement section and the reading. A
//   harness fragile at exactly the point of the defect it exists to
//   detect reports less than it knows; `foresight-ui.mjs`'s header
//   records the same lesson from the same mistake, which is why the
//   reveal is now guarded.
//   Result, AFTER GUARDING: THREE red and the run completes — the salt,
//   the decisive reveal (naming the refusal in the log), and the
//   foresight record that cascades from it. The prediction check stays
//   green, correctly, since only the salt was corrupted. **That the
//   decisive check goes red on its own is what establishes it is not
//   vacuous**, and it is the only check in the section that validation
//   itself enforces.
//
//   Restored and re-run: all sixty-seven green.
//
//   THE FOUNDING SECTION WAS INJECTED THREE TIMES on 2026-10-28, for the
//   same reason as the 1.19 section above: it was written against code
//   written the same day, and sixty-seven checks had just passed without
//   touching any of it.
//
//   Injection F — THE DECISIVE ONE: `ownConstitution`'s sort reversed, so
//   the client picks the OLDEST live constitution while the coordinator
//   picks the newest.
//   Result: ELEVEN red and THE RUN COMPLETES. `ownConstitution` threw its
//   disagreement error — "client published_at=1793182449, coordinator
//   published_at=1793182450" — which is the whole reason that cross-check
//   exists, and the rest of the section plus the discourse reading went
//   red behind it. THAT CASCADE IS THE PROPERTY THIS SECTION WAS ADDED
//   FOR. The reading used to be seeded through the raw `call` escape
//   hatch with hand-written snake_case payloads; it is now seeded by
//   `publishConstitution` and `createMembrane`, so founding breaking takes
//   four later checks with it instead of none. The hatch's disappearance
//   IS the verification.
//   And the one-second sleep before the second publish is load-bearing:
//   the two published_at values above DIFFER BY ONE SECOND, and without
//   the gap they would have been equal, the tie would have fallen through
//   to the host action timestamp, and this injection would not have fired
//   at all — an ordering test that passes whichever way the field is read.
//
//   Injection G: the century ceiling removed from `publishConstitution`.
//   Result: EXACTLY TWO red — both micros-expiry checks — and the other
//   eighty-eight green. The constitution with an expiry in MICROSECONDS
//   was then PUBLISHED SUCCESSFULLY: the coordinator accepted it,
//   validation accepted it, and it read back intact with an expiry a
//   hundred thousand times past the clock that would have retired it.
//   Nothing below this library can object, because read as seconds that
//   number is a legitimate far-future date — which is what "the one check
//   no layer below can make" means, now observed rather than argued.
//
//   Injection H: `createMembrane`'s client-side *no constitution yet*
//   refusal disabled, so the call proceeds with an undefined constitution.
//   Result: ONE red, and NOT the one that looks central. "an agent with
//   no constitution is REFUSED when it tries to found" STAYED GREEN — the
//   coordinator refuses it too — and "nothing was founded" stayed green
//   with it. Only "the refusal gives the reason" went red. README §2.6 is
//   defended at two layers, so the message is the only thing that
//   distinguishes them, and a refusal that does not name the reason reads
//   as a missing parameter and gets worked around. That check is the
//   load-bearing one here, which is the opposite of how it looks.
//
//   Restored and re-run: all ninety green.
//
// Re-check it the same way if you change what this file asserts: inject,
// watch it go red, restore, watch it go green.
// ---------------------------------------------------------------------------

import { createRequire } from 'node:module';

const requireFromSdk = createRequire(new URL('../../agent-sdk/package.json', import.meta.url));
let EpistemicAgent, FrictionLimitError, PendingDependencyError, MAX_PAST_CONE;
try {
  ({ EpistemicAgent, FrictionLimitError, PendingDependencyError, MAX_PAST_CONE } = await import(
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
// A zero wait must still produce an error, and must still be the typed one so
// callers can distinguish "not propagated" from "invalid".
const progressFreeOf = (err) => /propagation timeout|DepMissingFromDht|may be retried/i.test(err?.message ?? '');

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

  // -------------------------------------------------------------------------
  // THE EIGHT FUNCTIONS THE SDK DID NOT HAVE (open-work 1.19).
  //
  // Found 2026-10-27 by listing the SDK's surface against the coordinator's
  // rather than by reading either one. Every function below already existed
  // in the zome and was unreachable from this library, so an agent could
  // publish claims, critique, retract and join a membrane — and could not
  // make or reveal a pre-registered prediction, which is the mechanism every
  // outward-facing document about this project leads with. "AI as a
  // first-class participant" excluded the one thing that costs something.
  //
  // PLACED BEFORE THE EXHAUSTION SECTION DELIBERATELY: the cone-bearing
  // critique below needs friction budget, and the section after this one
  // spends all of it. Assessment, settlement and pre-registration are NOT
  // friction-gated — only Critique, AntibodyPattern, SynapticLink,
  // Reinforcement and attestation are — so only the critique cares.
  log('\n=== Assessment, published under the agent\'s own key ===');
  // AN AI ASSESSOR IS NOT A SPECIAL CASE, and this is what that means
  // concretely: the same entry type, the same validation, the same
  // attribution as a human's. What makes it legitimate is that it is signed
  // and critiquable, not that a model produced it.
  const assessHash = await agent.publishAssessment({
    target,
    stance: 'Disputes',
    confidence: 'Tentative',
    rationale: 'Published by scripts/live-verify/agent-sdk.mjs as an attributed position.',
  });
  check('publishAssessment returns an action hash', assessHash instanceof Uint8Array);
  const assessments = await agent.assessmentsFor(target);
  check('assessmentsFor finds it from the TARGET, not from prior knowledge',
    assessments.length === 1);
  check('and it decoded with stance and confidence intact',
    assessments[0]?.entry?.stance === 'Disputes'
    && assessments[0]?.entry?.confidence === 'Tentative');
  check('the assessor is this agent, so the position is attributable',
    JSON.stringify(Array.from(assessments[0]?.entry?.assessor ?? []))
    === JSON.stringify(Array.from(agent.agentPubKey)));

  log('\n=== A past cone that is true by construction ===');
  // THE DECISION BEHIND THIS (open-work 6.5, narrowed to the agent case).
  // 6.5's objection to a client populating past_cone is that it is a CLIENT
  // ASSERTING WHAT ITS USER READ, and one that over-claims makes its user
  // look better informed than they were. For an agent under its own key
  // there is no third party to misrepresent: the agent IS the reader and
  // knows exactly which hashes it fetched. witnessedCritiquesOf closes the
  // gap between reading and recording by doing both in one call.
  const witnessed = await agent.witnessedCritiquesOf(target);
  check('witnessedCritiquesOf returns the critiques AND a cone',
    Array.isArray(witnessed.critiques) && Array.isArray(witnessed.pastCone));
  check('the cone is exactly the hashes that were fetched, not an assertion',
    witnessed.pastCone.length === witnessed.critiques.length
    && witnessed.pastCone.every((h, i) => h === witnessed.critiques[i].actionHash));
  check('and it is NOT empty, so the next check is not vacuous',
    witnessed.pastCone.length >= 1);

  const conedCritique = await agent.critique({
    target, mode: 'Methodological',
    content: 'Filed while recording what had already been seen of this target.',
    pastCone: witnessed.pastCone,
  });
  check('a critique carrying a non-empty past_cone is ACCEPTED by validation',
    conedCritique instanceof Uint8Array);
  // ASSERTED BY READING IT BACK, not from the write succeeding. Critique
  // carries past_cone with #[serde(default)], so a payload that dropped the
  // field would commit happily and record an empty cone — the write
  // succeeding proves nothing about whether the cone arrived.
  const reread = (await agent.critiquesFor(target))
    .find((c) => JSON.stringify(Array.from(c.actionHash))
      === JSON.stringify(Array.from(conedCritique)));
  check('and the cone is ON the stored entry, not merely accepted',
    (reread?.entry?.past_cone ?? []).length === witnessed.pastCone.length);
  // MAX_PAST_CONE is refused CLIENT-SIDE rather than trimmed, because the
  // zome refuses rather than trimming and for its reason: a trimmed cone is
  // a false statement about what was seen.
  let coneRefusal = null;
  try {
    await agent.publishAssessment({
      target, stance: 'Abstains', confidence: 'Tentative',
      pastCone: new Array(MAX_PAST_CONE + 1).fill(target),
    });
  } catch (error) { coneRefusal = error; }
  check('a cone over MAX_PAST_CONE is refused, not silently trimmed',
    coneRefusal !== null && /refused rather than trimmed|ceiling/i.test(coneRefusal.message));

  log('\n=== Pre-registration: the mechanism an SDK agent could not use ===');
  const question = claims[0].actionHash;
  const PREDICTION = 'Committed through the SDK, revealed from the recovered values.';
  const committed = await agent.preRegister({
    question,
    prediction: PREDICTION,
    revealDeadline: (Date.now() + 3600_000) * 1000,
  });
  check('preRegister returns the commitment', committed.actionHash instanceof Uint8Array);
  // THE SALT IS HANDED BACK EVEN WHEN GENERATED, which is the whole point
  // of generating it here: the zome cannot invent one without storing it in
  // the entry it protects, and a caller that never receives it holds a
  // commitment it can never reveal.
  check('and the generated salt, which nothing else can supply',
    typeof committed.salt === 'string' && committed.salt.length >= 32);
  check('the salt is not from a predictable source',
    /^[A-Za-z0-9_-]+$/.test(committed.salt)
    && committed.salt !== (await agent.preRegister({
      question, prediction: PREDICTION + ' (second)',
      revealDeadline: (Date.now() + 3600_000) * 1000,
    })).salt);

  const recovered = await agent.mySealedPrediction(committed.actionHash);
  check('mySealedPrediction reads the prediction back off this agent\'s chain',
    recovered?.prediction === PREDICTION);
  check('and the SALT, which is the half that cannot be reconstructed',
    recovered?.salt === committed.salt);

  // THE DECISIVE CHECK, for the reason pre-registration.mjs §8 and
  // foresight-ui.mjs §8 both state: matching strings only prove the read
  // returns something that LOOKS right. Revealing from the recovered values
  // alone proves the recovery is SUFFICIENT, because validation recomputes
  // the commitment hash from exactly these two and a lossy read goes red
  // here and nowhere else.
  //
  // GUARDED, AND THE GUARD WAS ADDED BECAUSE AN INJECTION NEEDED IT. A
  // lossy read makes validation refuse the commit — correctly — and an
  // unguarded `await` turned that into an uncaught throw that killed the
  // run, so the harness reported ONE red and never reached the foresight
  // record, the no-score assertion, settlement or the reading. A harness
  // fragile at exactly the point of the defect it exists to detect reports
  // less than it knows; `foresight-ui.mjs`'s header records the same lesson
  // from the same mistake.
  let revealHash = null;
  let revealRefusal = null;
  try {
    revealHash = await agent.revealPreRegistration({
      preRegistration: committed.actionHash,
      prediction: recovered.prediction,
      salt: recovered.salt,
    });
  } catch (error) { revealRefusal = error; }
  check('a reveal driven ONLY by the recovered values is accepted',
    revealHash instanceof Uint8Array);
  if (revealRefusal) {
    log(`    refused: ${String(revealRefusal?.message ?? revealRefusal).slice(0, 160)}`);
  }

  const foresight = await agent.foresightRecord();
  check('foresightRecord shows the revealed commitment',
    foresight.revealed.some((e) => e.revealed_prediction === PREDICTION));
  // THE DENOMINATOR IS PRESENT AND THE SCORE IS ABSENT. The second
  // commitment above was never revealed, so it is still pending — and the
  // record must offer three raw lists with nothing dividing them.
  check('and the still-sealed one is pending, not omitted',
    foresight.pending.length >= 1);
  check('the record carries all three lists', Array.isArray(foresight.revealed)
    && Array.isArray(foresight.expired) && Array.isArray(foresight.pending));
  check('and NO score, ratio or ordering field anywhere on it',
    !Object.keys(foresight).some((k) => /score|ratio|rate|rank|accuracy|percent/i.test(k)));

  // THE THREE ANSWERS MUST STAY DISTINGUISHABLE, and this check was
  // originally written asserting the opposite — that a non-commitment hash
  // returns null — which is how the defect below was found.
  //
  // `null` means ONE thing: your own commitment whose sealed half is not on
  // this chain, i.e. made on another device. "Go and find your note" is the
  // action. A hash that is not a PreRegistration is a DIFFERENT fact with a
  // different action — you passed the wrong hash — so it is an error, and
  // collapsing it into null would make the one answer a client must act on
  // ambiguous.
  //
  // FOUND HERE 2026-10-28: the friendly message for this case was
  // UNREACHABLE. A Claim's action hash resolves fine and simply is not a
  // PreRegistration, so `to_app_option` failed before the arm carrying
  // "Target is not a PreRegistration." and the caller got
  // `Deserialize("missing field `question`")` — an opaque wasm error for the
  // most likely wrong input. The message is now on the deserialize arm too.
  let wrongType = null;
  try { await agent.mySealedPrediction(question); } catch (error) { wrongType = error; }
  check('a hash that is not a PreRegistration is REFUSED, not reported as null',
    wrongType !== null);
  check('and the refusal says which, rather than leaking a serde error',
    /not a PreRegistration/i.test(wrongType?.message ?? String(wrongType)));

  log('\n=== Settlement: an attributed rule, recomputed before it is published ===');
  const policyHash = await agent.publishSettlementPolicy({
    name: 'sdk-harness-policy',
    minAssessors: 1,
    maxDissent: 0,
    statement: 'Settles on one assessor with no dissent. Published by the SDK harness.',
  });
  check('publishSettlementPolicy returns the policy', policyHash instanceof Uint8Array);
  const recomputed = await agent.recomputeSettlement({
    target, policy: policyHash, inputs: [assessHash],
  });
  check('recomputeSettlement reports the state WITHOUT publishing it',
    typeof recomputed.state === 'string');
  check('and the counts it reached that state by, so it can be checked',
    typeof recomputed.distinct_assessors === 'number'
    && typeof recomputed.dissent === 'number'
    && typeof recomputed.unusable_inputs === 'number');
  check('it names the policy it applied, not an anonymous rule',
    recomputed.policy_name === 'sdk-harness-policy');
  // PUBLISHED AS WHAT RECOMPUTE SAID, not as what the harness hoped.
  // Validation recomputes the same thing and refuses a status that does not
  // follow from its cited policy and inputs, so passing recomputed.state
  // through is the only thing that can succeed — which is the check.
  const statusHash = await agent.publishSettlementStatus({
    target, policy: policyHash, inputs: [assessHash], state: recomputed.state,
  });
  check('publishSettlementStatus accepts the state recompute derived',
    statusHash instanceof Uint8Array);
  let badStatus = null;
  try {
    const wrong = recomputed.state === 'Settled' ? 'Open' : 'Settled';
    await agent.publishSettlementStatus({
      target, policy: policyHash, inputs: [assessHash], state: wrong,
    });
  } catch (error) { badStatus = error; }
  // WITHOUT THIS THE CHECK ABOVE IS VACUOUS: if any state were accepted,
  // "publishes what recompute derived" would pass for a status that means
  // nothing. Validation must refuse a state the cited inputs do not yield.
  check('and REFUSES a state the cited policy and inputs do not yield',
    badStatus !== null);

  // -------------------------------------------------------------------------
  // FOUNDING — `publishConstitution`, `ownConstitution` and `createMembrane`,
  // written 2026-10-28 and verified by nothing until this section existed.
  //
  // THE SEEDING THAT USED TO BE HERE IS THE POINT. The discourse-reading
  // section below needs a membrane, and until now it got one through the
  // public `call` escape hatch with hand-written snake_case payloads, because
  // founding was not reachable from this library at all. It is now, so the
  // hatch is gone from this file — and THE HATCH'S DISAPPEARANCE IS ITSELF
  // THE VERIFICATION: the reading below is seeded by the typed calls, so
  // founding breaking takes four later checks red with it rather than one.
  //
  // THE ORDER OF THIS SECTION IS A TEST AND NOT A STYLE, which is why
  // founding is verified here rather than at the top of the file.
  // `createMembrane`'s central refusal — AN AGENT WITH NO PUBLISHED
  // CONSTITUTION FOUNDS NOTHING (README §2.6) — is reachable only while this
  // agent still has none, and a published constitution is permanent. So the
  // refusals are asserted first, once, in the only window where the state
  // they need exists, and nothing later in the run can restore it.
  log('\n=== Founding: refused first, because the refusal is reachable only now ===');
  check('this agent has published no constitution yet, so the refusals below are real',
    (await agent.ownConstitution()) === null);

  let unfounded = null;
  try {
    await agent.createMembrane({
      domain: DOMAIN,
      description: 'Must not exist: founded with no constitution behind it.',
      requiredPromises: ['state the method'],
    });
  } catch (error) { unfounded = error; }
  check('an agent with no constitution is REFUSED when it tries to found',
    unfounded !== null);
  // NAMING §2.6 MATTERS MORE THAN REFUSING. The requirement is not a
  // formality — founding here is accountable rather than costly, no fee and
  // instead a demand that the founder state their own promises in public
  // first — so a refusal that does not say so reads as a missing parameter
  // and gets worked around.
  check('and the refusal gives the reason, not just the rule it tripped',
    /README §2\.6|accountable rather than costly/i.test(unfounded?.message ?? ''));
  check('nothing was founded, so that was a refusal and not a warning',
    (await agent.membranes()).length === 0);

  let demandsNothing = null;
  try {
    await agent.createMembrane({
      domain: DOMAIN,
      description: 'Must not exist: a domain that demands nothing of anyone.',
      requiredPromises: [],
    });
  } catch (error) { demandsNothing = error; }
  check('a membrane requiring nothing is refused — founding\'s only actual cost',
    demandsNothing !== null && /required_promise/i.test(demandsNothing?.message ?? ''));

  let emptyConstitution = null;
  try { await agent.publishConstitution({ promises: [] }); } catch (error) { emptyConstitution = error; }
  check('an empty constitution is refused, not accepted as "promises nothing"',
    emptyConstitution !== null);

  // THE MICROSECOND EXPIRY, AND IT IS THE ONE CHECK NO OTHER LAYER CAN MAKE.
  // `expires_at > published_at` is TRUE IN EITHER UNIT: a micros expiry is
  // ~1e5x the seconds clock `get_agent_constitution` compares it against, so
  // it passes the coordinator, passes validation, round-trips intact — and
  // the constitution then never expires while its author believes it does.
  // Nothing DHT-side can object, because in seconds that number is a
  // legitimate far-future date. A stated heuristic rather than a protocol
  // rule, which is the honest way to hold it.
  let microsExpiry = null;
  try {
    await agent.publishConstitution({
      promises: [{ action: 'state the method', domain: DOMAIN, modality: null }],
      expiresAt: (Date.now() + 3_600_000) * 1000,
    });
  } catch (error) { microsExpiry = error; }
  check('an expiry handed over in MICROSECONDS is refused by this library',
    microsExpiry !== null);
  check('and the refusal names the UNIT, since no layer below it can catch this',
    /SECONDS/.test(microsExpiry?.message ?? '')
    && /century/i.test(microsExpiry?.message ?? ''));

  log('\n=== Founding: two constitutions, more than a second apart on purpose ===');
  const firstConstitution = await agent.publishConstitution({
    promises: [{ action: 'state the method', domain: DOMAIN, modality: null }],
  });
  check('publishConstitution returns the ActionHash the zome read cannot give',
    firstConstitution instanceof Uint8Array);

  // THE GAP IS DELIBERATE AND THE SECTION IS UNTESTABLE WITHOUT IT.
  // `published_at` is SECONDS (SPEC §5.23), so two constitutions published
  // inside one second carry EQUAL published_at and the selection rule falls
  // through to the host-stamped action timestamp — a well-defined answer that
  // the field under test did not determine. Sleeping past the second is what
  // makes the ordering below an assertion about published_at.
  await new Promise((resolve) => setTimeout(resolve, 1_200));
  const secondConstitution = await agent.publishConstitution({
    promises: [
      { action: 'state the method', domain: DOMAIN, modality: null },
      { action: 'say what would change my mind', domain: DOMAIN, modality: 'Methodological' },
    ],
  });
  check('a second constitution is a separate entry — superseding erases nothing',
    secondConstitution instanceof Uint8Array
    && JSON.stringify(Array.from(secondConstitution))
      !== JSON.stringify(Array.from(firstConstitution)));

  // GUARDED, FOR THE REASON INJECTION E ESTABLISHED IN THIS FILE.
  // `ownConstitution` THROWS when its pick disagrees with the coordinator's,
  // which is correct behaviour and which a reversed-sort injection fires on
  // purpose — and an unguarded `await` would turn that into an uncaught throw
  // that killed the run before founding, the reading, exhaustion and the
  // lenses. A harness fragile at exactly the point of the defect it exists to
  // detect reports less than it knows.
  let own = null;
  let resolveRefusal = null;
  try { own = await agent.ownConstitution(); } catch (error) { resolveRefusal = error; }
  check('ownConstitution resolves rather than refusing, so client and zome agree',
    resolveRefusal === null && own?.actionHash instanceof Uint8Array);
  if (resolveRefusal) {
    log(`    refused: ${String(resolveRefusal?.message ?? resolveRefusal).slice(0, 220)}`);
  }
  check('and it picks the NEWER of the two, by published_at in seconds',
    own?.constitution?.promises?.length === 2);
  check('the hash it resolved is the second publish, not the first',
    JSON.stringify(Array.from(own?.actionHash ?? []))
      === JSON.stringify(Array.from(secondConstitution)));
  // ASSERTED DIRECTLY AS WELL AS RELIED ON. Reaching this line already means
  // the internal cross-check agreed, since disagreement throws — but an
  // absent exception is not a check, and `ownConstitution` duplicating the
  // coordinator's selection rule is the defect generator that made the
  // cross-check necessary in the first place. This is the comparison the
  // reversed-sort injection is aimed at.
  const authoritative = await agent.agentConstitution(agent.agentPubKey);
  check('and get_agent_constitution returns that same constitution, not the other',
    authoritative !== null
    && authoritative?.published_at === own?.constitution?.published_at
    && authoritative?.promises?.length === own?.constitution?.promises?.length);

  // THE UNIT, ASSERTED ON WHAT CAME BACK OFF THE DHT. §5.23 declares
  // `published_at` in SECONDS, and `SettlementPolicy` minted the same field
  // in MICROS on the day this was written — caught by `check-time-units.mjs`
  // and invisible at every other layer, because a micros timestamp
  // type-checks, validates and round-trips. Only an expiry misbehaves, and
  // it misbehaves by never firing.
  const nowSeconds = Math.floor(Date.now() / 1000);
  check('published_at reads back in SECONDS, within a minute of this clock',
    typeof own?.constitution?.published_at === 'number'
    && Math.abs(own.constitution.published_at - nowSeconds) < 60);

  log('\n=== Founding: the domain, against a constitution already in public ===');
  let membraneHash = null;
  let foundRefusal = null;
  try {
    membraneHash = await agent.createMembrane({
      domain: DOMAIN,
      description: 'Founded through createMembrane by agent-sdk.mjs, which is what seeds the reading below.',
      requiredPromises: ['state the method'],
    });
  } catch (error) { foundRefusal = error; }
  check('createMembrane founds the domain once a constitution exists',
    membraneHash instanceof Uint8Array);
  if (foundRefusal) {
    log(`    refused: ${String(foundRefusal?.message ?? foundRefusal).slice(0, 220)}`);
  }

  const founded = (await agent.membranes()).filter((m) => m.entry.domain === DOMAIN);
  check('and the membrane is readable from the REGISTRY, not only from this chain',
    founded.length === 1);
  check('it carries the promises it declared, which is what a reader compares members against',
    JSON.stringify(founded[0]?.entry?.required_promises) === JSON.stringify(['state the method']));
  check('created_at is in SECONDS too, not micros',
    typeof founded[0]?.entry?.created_at === 'number'
    && Math.abs(founded[0].entry.created_at - nowSeconds) < 120);
  check('and it cites the constitution ownConstitution resolved, not the superseded one',
    JSON.stringify(Array.from(founded[0]?.entry?.constitution ?? []))
      === JSON.stringify(Array.from(own?.actionHash ?? [0])));

  // FOUNDING AGAINST SOMETHING THAT IS NOT A CONSTITUTION — reachable with
  // one agent, and the same defect shape `get_my_sealed_prediction` turned
  // out to have hours earlier. A Claim's ActionHash RESOLVES and simply is
  // not this type, so a friendly "not a Constitution" message sitting on the
  // entry-absent arm never fires for the most likely wrong input, and the
  // caller gets a raw serde error instead.
  let notAConstitution = null;
  try {
    await agent.createMembrane({
      domain: `${DOMAIN}Wrong`,
      description: 'Must not exist: founded against a Claim.',
      requiredPromises: ['state the method'],
      constitution: claims[0].actionHash,
    });
  } catch (error) { notAConstitution = error; }
  check('founding against a Claim rather than a Constitution is refused',
    notAConstitution !== null);
  check('and the refusal says it is not a Constitution, rather than leaking a serde error',
    /not a Constitution/i.test(notAConstitution?.message ?? String(notAConstitution)));
  check('and nothing was founded in that domain',
    (await agent.membranes()).every((m) => m.entry.domain !== `${DOMAIN}Wrong`));

  // THE WRONG KIND OF HASH, which fails at a DIFFERENT LAYER than the wrong
  // entry above and is the reason both are here. A Claim's ACTION hash is the
  // right kind and the wrong entry, so it reaches the coordinator and gets
  // the message checked above. A Claim's ENTRY hash never reaches the
  // function body at all: `Membrane.constitution` is typed `ActionHash`, so
  // the conductor rejects it while deserializing the whole payload and the
  // caller gets `Deserialize([135, 166, 100, 111, ...])` — the msgpack bytes
  // of their own arguments as a decimal array, naming nothing. Measured on a
  // live conductor before this guard was written.
  //
  // AND IT IS THE MISTAKE MOST AVAILABLE TO A CALLER COPYING HASHES AROUND,
  // which is why it earns a refusal rather than a comment: this library hands
  // back `actionHash` and `entryHash` side by side, critique targets ARE
  // entry hashes, and a constitution reference is an action hash.
  let wrongKind = null;
  try {
    await agent.createMembrane({
      domain: `${DOMAIN}WrongKind`,
      description: 'Must not exist: founded against an entry hash.',
      requiredPromises: ['state the method'],
      constitution: claims[0].entryHash,
    });
  } catch (error) { wrongKind = error; }
  check('an ENTRY hash where an action hash belongs is refused by this library',
    wrongKind !== null);
  check('and the refusal names BOTH kinds, since the caller is holding both',
    /must be an ActionHash/i.test(wrongKind?.message ?? '')
    && /is an EntryHash/i.test(wrongKind?.message ?? ''));
  check('and says what it is, since "expected an ActionHash" alone picks neither',
    /publishConstitution RETURNED/i.test(wrongKind?.message ?? ''));

  log('\n=== An attributed discourse reading ===');
  // WHY THIS DOES NOT BREACH INVARIANT #1 — settled at README.md:982. The
  // objection to a canonical score is that it claims a view from nowhere;
  // an attributed reading is a promise like any other, critiquable by
  // anyone who disputes the method.
  // SEEDED BY THE FOUNDING ABOVE, THROUGH THE TYPED CALLS. The first version
  // of this section followed the file's existing `if (membranes.length > 0)`
  // idiom and the branch never ran on a fresh sandbox, which left
  // `publishDiscourseReading` — one of the eight functions this section
  // exists to verify — asserted by nothing. A conditional that is always
  // false is not a check.
  const membranesForReading = await agent.membranes();
  check('the membrane founded through the SDK is what seeds the reading',
    membranesForReading.length >= 1);
  if (membranesForReading.length > 0) {
    const reading = await agent.publishDiscourseReading({
      membrane: membranesForReading[0].entryHash,
      confidence: 'Tentative',
    });
    check('publishDiscourseReading returns a published reading',
      reading.action_hash instanceof Uint8Array);
    // THE ENTRY HASH IS THE POINT, not a convenience: critique targets must
    // be EntryHash-shaped, so without it the reading would be critiquable
    // in principle and not in practice — which is the entire justification
    // for publishing it.
    check('and the ENTRY hash, without which it cannot be disputed',
      reading.entry_hash instanceof Uint8Array);
    check('the method is stated in words, not merely flagged',
      typeof reading.method === 'string' && reading.method.length > 0);
    const disputed = await agent.critique({
      target: reading.entry_hash, targetType: 'Claim', mode: 'Methodological',
      content: 'Disputing the lens this reading was taken through.',
    });
    check('and the reading can actually be critiqued through that hash',
      disputed instanceof Uint8Array);
  } else {
    // REACHED ONLY IF THE SEED ABOVE FAILED, which the check above reports.
    log('  SEED FAILED — publishDiscourseReading was NOT exercised.');
    failures++;
  }

  log('\n=== FrictionLimitError, driven to exhaustion ===');
  // An agent loop's pacing depends on telling "wait" apart from "broken",
  // so this spends the rest of the window's budget deliberately.
  let refused = null;
  // SEEDED FROM THE REAL BUDGET RATHER THAN A HARDCODED COUNT. This used to
  // start at a literal 1, matching the single round-trip critique above it.
  // The 1.19 section now writes one or two more — the cone-bearing critique
  // always, and the one disputing a published reading only when a membrane
  // exists on this conductor — so the correct base is CONDITIONAL, and a
  // literal would have made "refusal came after exactly the 20 the limit
  // allows" fail on a conductor with a membrane and pass without one. Asking
  // the conductor what has been spent cannot drift as sections are added.
  const spentBefore = (await agent.budget()).recent_count;
  log(`  ${spentBefore} already spent in this window before exhausting it`);
  let written = spentBefore;
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

  // -------------------------------------------------------------------------
  // A cited entry that has not propagated is waited for, not surfaced raw.
  //
  // §5.3's referential integrity is enforced by the conductor's dependency
  // fetch: a Claim citing a hash that is not local is refused with
  // DepMissingFromDht, "may be retried". On one node that means the hash is
  // bogus; on a real network it usually means the cited entry exists and has
  // not arrived. README §9 records the decision to absorb it in the SDK.
  //
  // The hash here is well-formed and deliberately resolves to NOTHING, so it
  // can never arrive and the wait must therefore time out. dependencyWaitMs is
  // set to a few seconds so the case takes seconds rather than the 20-minute
  // default. What is asserted is the whole contract: it retries, it reports
  // progress while waiting, it gives up as a TYPED error naming the
  // unresolved hash, and it writes nothing.
  log('\n=== A cited entry that has not propagated is waited for ===');
  {
    const danglingEntryHash = new Uint8Array(39);
    danglingEntryHash.set([0x84, 0x21, 0x24], 0);            // uhCEk… — an EntryHash
    for (let i = 3; i < 35; i++) danglingEntryHash[i] = (i * 23 + 9) & 0xff;

    const progress = [];
    const waiter = await EpistemicAgent.connect({
      dependencyWaitMs: 6_000,
      onPendingDependency: (info) => progress.push(info),
    });
    const PENDING_DOMAIN = `${DOMAIN}Pending`;
    let caught = null;
    const startedAt = Date.now();
    try {
      await waiter.publishClaim({
        content: 'cites evidence that will never arrive',
        domain: PENDING_DOMAIN,
        confidence: 'Moderate',
        evidenceHashes: [danglingEntryHash],
      });
    } catch (cause) { caught = cause; }
    const elapsedMs = Date.now() - startedAt;

    check('the write was not abandoned on the first refusal',
      elapsedMs >= 5_000);
    check('it reported progress so a UI can explain the wait',
      progress.length >= 1);
    check('progress names the coordinator function and the unresolved hash',
      progress[0]?.fnName === 'create_claim' && (progress[0]?.missingHashes?.length ?? 0) >= 1);
    check('giving up is a typed PendingDependencyError, not a raw conductor fault',
      caught instanceof PendingDependencyError);
    check('the error says the payload is still valid rather than rejected',
      /propagation timeout, not a rejection/i.test(caught?.message ?? ''));
    check('the error carries the unresolved hash for the caller to report',
      (caught?.missingHashes?.length ?? 0) >= 1);
    check('nothing was written while it waited',
      (await waiter.claimsInDomain(PENDING_DOMAIN)).length === 0);

    // --- CLOSURE, item 12. The timer says how long it has waited; closure says
    // what this observer can actually see of what the write cites. The case
    // worth asserting is the one §5.3 says a timer cannot distinguish: SOME of
    // the citations resolving.
    //
    // NOT DERIVED FROM `missingHashes`, which is the thing that was measured
    // and found false: the refusal names exactly ONE hash however many are
    // missing, so the two cases below — one unresolved of one, and one
    // unresolved of three — produce the SAME `missingHashes` and must be told
    // apart by closure or not at all.
    check('progress carries closure, not just a timer',
      progress[0]?.closure != null);
    check('closure counts every citation, not the one the refusal named',
      progress[0]?.closure?.cited === 1 && progress[0]?.closure?.resolvedLocally === 0);
    check('the error carries closure at the moment the budget ran out',
      caught?.closure?.cited === 1 && caught?.closure?.resolvedLocally === 0);
    check('the error message states closure in words',
      /0 of 1 citation resolve locally/.test(caught?.message ?? ''));

    // THE DISTINCTION A TIMER CANNOT MAKE. Three citations, two of them real,
    // one that will never arrive — and the refusal still names one hash, so
    // `missingHashes` is identical to the single-citation case above.
    const realOne = (await waiter.claimsInDomain(DOMAIN))[0]?.entryHash;
    check('a real entry hash is in hand for the mixed-closure case',
      realOne instanceof Uint8Array);
    const mixed = await waiter.closureOf([realOne, realOne, danglingEntryHash]);
    check('closure distinguishes "2 of 3 resolve" from "none do"',
      mixed?.cited === 3 && mixed?.resolvedLocally === 2 && mixed?.unresolved.length === 1);
    check('closure reports WHICH citation is outstanding, in order',
      mixed?.unresolved[0]?.length === danglingEntryHash.length
      && mixed.unresolved[0].every((b, i) => b === danglingEntryHash[i]));
    check('closure of nothing is null rather than a false zero',
      (await waiter.closureOf([])) === null);

    // THE CASE THAT PINS THE MECHANISM RATHER THAN THE NUMBER. With three
    // citations and ONE missing, deriving closure from the refusal — cited
    // minus the one hash it names — gives 2 of 3 and is right by coincidence.
    // With TWO missing it gives 2 of 3 and the truth is 1 of 3. So this is the
    // case that fails if closure is ever reimplemented by subtraction, which
    // is how both SPEC §5.3 and READINESS item 12 assumed it would work.
    const twoMissing = new Uint8Array(danglingEntryHash);
    twoMissing[34] = (twoMissing[34] + 1) & 0xff;
    const worse = await waiter.closureOf([realOne, danglingEntryHash, twoMissing]);
    check('closure is probed rather than subtracted from the one named hash',
      worse?.cited === 3 && worse?.resolvedLocally === 1 && worse?.unresolved.length === 2);

    // The escape hatch the corpus and any dependency prober depends on.
    const immediate = await EpistemicAgent.connect({ dependencyWaitMs: 0 });
    let raw = null;
    try {
      await immediate.publishClaim({
        content: 'surfaces the refusal immediately',
        domain: `${PENDING_DOMAIN}Raw`,
        confidence: 'Moderate',
        evidenceHashes: [danglingEntryHash],
      });
    } catch (cause) { raw = cause; }
    check('dependencyWaitMs: 0 surfaces the refusal without waiting',
      raw !== null && progressFreeOf(raw));
    await immediate.close();
    await waiter.close();
  }

  log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
} finally {
  await agent.close();
}
process.exit(failures === 0 ? 0 : 1);
