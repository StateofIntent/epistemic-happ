#!/usr/bin/env node
// ============================================================================
// scripts/live-verify/settlement.mjs — WHEN DOES A CLAIM STOP BEING CONTESTED
// ENOUGH TO ACT ON, AND WHO SAYS SO.
//
// `protocol_version: 11`. The answer this ships is deliberately NOT "when the
// protocol says so" — Invariant 10 is that the system does not compute truth —
// but "when a NAMED agent's DECLARED policy, applied to a NAMED set of inputs,
// says so, and anybody can recompute it."
//
// ---------------------------------------------------------------------------
// §3 IS THE CHECK THIS FILE EXISTS FOR, AND IT IS STRONGER THAN THE BRIEF ASKED.
//
// The design brief asked that settlement be "a pure, deterministic function of
// (policy, input set)" so that "anyone can recompute it and check the
// aggregator's result". That is a courtesy: it tells a careful reader how to
// catch a liar.
//
// But a pure function of data every peer can fetch is a function VALIDATION
// CAN RUN. So `validate_settlement_status` runs it, and an aggregator
// publishing `Settled` over inputs that do not produce `Settled` is REFUSED BY
// THE DHT — by every peer, independently, before the entry exists. §3 injects
// exactly that lie and requires the refusal.
//
// WHAT IS STILL POSSIBLE, AND IS NOT A DEFECT: choosing a different input set.
// §5 shows two aggregators reaching DIFFERENT states from the same graph,
// both valid, both reproducible, because they counted different things. That
// is disagreement about SCOPE, which the protocol has no business
// adjudicating, and it is visible precisely because `inputs` is published.
// Lying about arithmetic is refused; disagreeing about evidence is not.
// ---------------------------------------------------------------------------
// NO SCORE ANYWHERE, and §6 asserts it. Invariant 1 bars a canonical
// comparative measure, and a numeric "truth score" is exactly that with a
// decimal point. `Assessment` carries a TYPED STANCE — the same "typed, not
// flattened" discipline Invariant 4 applies to critique modes — and a status
// is one of three named states rather than a number crossing a line.
//
// STATUS IS AN ENTRY, NOT A FIELD. Invariant 6 forbids updates (§5.1 refuses
// app-entry updates outright), so there is no mutable status to flip. A later
// status does not erase an earlier one; §4 asserts both survive, which is the
// "channels, not deletion" shape this protocol already has everywhere.
// ---------------------------------------------------------------------------
// NEGATIVE EVIDENCE — recorded in READINESS once measured.
//
//   BU: the recompute rule removed from `validate_settlement_status`. 3 reds,
//   and the first is the strongest form available — §3's forged `Settled`
//   **COMMITS** (`refusal: NONE — it committed`). An aggregator declares a
//   disputed claim settled, permanently, with the inputs that disprove it
//   attached to the entry. §4's two reds follow from it: the forged status
//   exists, so the count of surviving statuses is no longer 2.
//
//   BV: `min_assessors == 0` allowed by the policy validator. 1 red in §2 —
//   a policy that would settle an empty input set becomes publishable.
//
//   BW: the `TargetToAssessment` BASE binding removed. 1 red — and the
//   forgery is STILL REFUSED, by the author binding one rule later. The two
//   overlap for this attack, which is why §8 asserts the MESSAGE and not
//   merely that something refused; a check that accepted any refusal would
//   have gone green with the rule it names deleted.
//
//   AND BW IS THE REASON §8 EXISTS AT ALL. Run against the first version of
//   this file — which tested the STATUS's target rules thoroughly and never
//   tried to forge a LINK — the whole harness went green with the
//   `TargetToAssessment` author binding deleted. That is §5.19's finding
//   reproduced by somebody who had read it the day before: "the link types
//   nobody probed are the link types nobody validated, and coverage looked
//   complete because every link type anybody had TRIED to forge was refused."
//
// Prereqs: a sandbox conductor and a built .happ at PROTOCOL_VERSION 11.
// Three agents, because `min_assessors` is about DISTINCT assessors and one
// agent assessing three times must not satisfy it.
// ============================================================================

import { AdminWebsocket, AppWebsocket, CellType } from '@holochain/client';

const ADMIN_URL = 'ws://localhost:8889';
const APP_URL = 'ws://localhost:8888';
const APP_ID = 'epistemic-resonance-happ';
const HAPP_PATH = new URL('../../epistemic-resonance-happ.happ', import.meta.url).pathname;
const DOMAIN = `Settle${Date.now()}`;

const log = (...a) => console.log(...a);
let failures = 0;
const check = (label, cond) => {
  if (cond) log(`  PASS: ${label}`);
  else { log(`  FAIL: ${label}`); failures++; }
};
const b64 = (u8) => Buffer.from(u8).toString('base64');
const nowMicros = () => Date.now() * 1000;
const nowSecs = () => Math.floor(Date.now() / 1000);

async function connectApp(admin, appId) {
  const { token } = await admin.issueAppAuthenticationToken({ installed_app_id: appId });
  const app = await AppWebsocket.connect({ url: new URL(APP_URL), token, wsClientOptions: { origin: 'live-verify' } });
  const info = await app.appInfo();
  const cellIds = [];
  for (const roleCells of Object.values(info.cell_info)) {
    for (const cell of roleCells) {
      if (cell?.type === CellType.Provisioned || cell?.type === CellType.Cloned) cellIds.push(cell.value.cell_id);
    }
  }
  for (const cellId of cellIds) await admin.authorizeSigningCredentials(cellId);
  return {
    me: cellIds[0][1],
    call: (fn, payload) => app.callZome({ role_name: 'epistemic', zome_name: 'epistemic_coordinator', fn_name: fn, payload }),
  };
}

async function ensure(admin, appId) {
  const apps = await admin.listApps({});
  if (!apps.some((a) => a.installed_app_id === appId)) {
    const key = await admin.generateAgentPubKey();
    await admin.installApp({ source: { type: 'path', value: HAPP_PATH }, agent_key: key, installed_app_id: appId });
    await admin.enableApp({ installed_app_id: appId });
  }
  return connectApp(admin, appId);
}

const refusal = async (agent, fn, payload) => {
  try { await agent.call(fn, payload); return null; }
  catch (e) { return String(e?.message ?? e); }
};

async function main() {
  log('=== SETTLEMENT: somebody\'s arithmetic, over a named set ===\n');
  const admin = await AdminWebsocket.connect({ url: new URL(ADMIN_URL), wsClientOptions: { origin: 'live-verify' } });
  const a1 = await connectApp(admin, APP_ID);
  const a2 = await ensure(admin, 'epistemic-resonance-happ-agent2');
  const a3 = await ensure(admin, 'epistemic-resonance-happ-agent3');
  log(`three agents: ${[a1, a2, a3].map((a) => b64(a.me).slice(0, 10)).join('  ')}\n`);

  const identity = await a1.call('get_protocol_version', null);
  check('this network is PROTOCOL_VERSION 11 — the bump settlement cost',
    identity?.declared_version === 11 && identity?.implemented_version === 11);

  // --- A claim for the three of them to assess ---------------------------
  await a1.call('create_claim', {
    content: 'the claim whose status is in question', domain: DOMAIN, author: a1.me,
    timestamp: nowMicros(), evidence_hashes: [], confidence: 'Moderate',
    semantic_tags: [], source_mew: null,
  });
  const claims = await a1.call('get_claims_by_domain', DOMAIN);
  const target = claims[0].signed_action.hashed.content.data.entry_hash;

  const assess = (agent, stance) => agent.call('publish_assessment', {
    assessor: agent.me, target, stance, confidence: 'Moderate',
    rationale: `a ${stance} assessment`, past_cone: [], timestamp: nowMicros(),
  });

  // === 1. A POLICY IS PUBLISHED BEFORE IT IS APPLIED ====================
  log('--- 1. The threshold is published first, as somebody\'s promise ---');
  const policy = await a1.call('publish_settlement_policy', {
    author: a1.me, name: 'two-assessors-no-dissent', min_assessors: 2, max_dissent: 0,
    statement: 'I will call a claim settled when at least two distinct agents have assessed it '
      + 'and nobody has disputed or critiqued it. I state this before applying it so that the '
      + 'standard is arguable separately from any particular result.',
    published_at: nowSecs(),
  });
  check('a policy commits, and is addressable by hash',
    policy != null);
  const emptyStatement = await refusal(a1, 'publish_settlement_policy', {
    author: a1.me, name: 'unexplained', min_assessors: 1, max_dissent: 0,
    statement: '', published_at: nowSecs(),
  });
  check('a policy with NO STATEMENT is refused — a threshold nobody explained is a number pretending to be a reason',
    emptyStatement !== null && /statement cannot be empty/i.test(emptyStatement));

  // === 2. A POLICY THAT WOULD SETTLE ANYTHING IS REFUSED ================
  log('\n--- 2. min_assessors must be at least 1 ---');
  const zeroPolicy = await refusal(a1, 'publish_settlement_policy', {
    author: a1.me, name: 'settles-anything', min_assessors: 0, max_dissent: 0,
    statement: 'this would settle a claim nobody has looked at', published_at: nowSecs(),
  });
  check('a policy with min_assessors 0 is REFUSED — it would settle an empty input set',
    zeroPolicy !== null && /min_assessors must be at least 1/i.test(zeroPolicy));

  // === 3. THE LIE: a state its own inputs do not produce ================
  log('\n--- 3. THE CHECK THIS FILE EXISTS FOR: a forged Settled ---');
  const s1 = await assess(a1, 'Supports');
  const disputed = await assess(a2, 'Disputes');
  // Under the policy: 2 distinct assessors (enough), 1 dissent > max_dissent 0.
  // So the honest answer is Contested. Claim Settled anyway.
  const forged = await refusal(a1, 'publish_settlement_status', {
    aggregator: a1.me, target, policy, inputs: [s1, disputed],
    state: 'Settled', timestamp: nowMicros(),
  });
  log(`    refusal: ${forged ? forged.replace(/\s+/g, ' ').slice(0, 170) : 'NONE — it committed'}`);
  check('A STATE ITS OWN INPUTS DO NOT PRODUCE IS REFUSED BY VALIDATION, not merely detectable',
    forged !== null && /does not follow from its own policy and inputs/i.test(forged));

  const honest = await a1.call('publish_settlement_status', {
    aggregator: a1.me, target, policy, inputs: [s1, disputed],
    state: 'Contested', timestamp: nowMicros(),
  });
  check('and the HONEST status over the same inputs commits',
    honest != null);

  // === 4. STATUS IS AN ENTRY, SO A LATER ONE DOES NOT ERASE AN EARLIER ==
  log('\n--- 4. A second status does not overwrite the first ---');
  const s3 = await assess(a3, 'Supports');
  // Agent 3 counts only the two Supports — a different SCOPE, not a different
  // arithmetic. Under the same policy that is 2 assessors, 0 dissent: Settled.
  const second = await a3.call('publish_settlement_status', {
    aggregator: a3.me, target, policy, inputs: [s1, s3],
    state: 'Settled', timestamp: nowMicros(),
  });
  check('a second aggregator publishes a DIFFERENT state from the same graph, and it commits',
    second != null);
  const all = await a1.call('get_settlement_statuses_for', target);
  check('BOTH STATUSES SURVIVE — Invariant 6 means a later one cannot erase an earlier one',
    all.length === 2);
  check('and the reader is handed both rather than a "current" one',
    all.length === 2);

  // === 5. THE DISAGREEMENT IS VISIBLE AND REPRODUCIBLE ==================
  log('\n--- 5. Two aggregators disagree, and anybody can see why ---');
  const rA = await a2.call('recompute_settlement', { target, policy, inputs: [s1, disputed] });
  const rB = await a2.call('recompute_settlement', { target, policy, inputs: [s1, s3] });
  log(`    over [support, dispute]: ${rA.state}  (${rA.distinct_assessors} assessors, ${rA.dissent} dissent)`);
  log(`    over [support, support]: ${rB.state}  (${rB.distinct_assessors} assessors, ${rB.dissent} dissent)`);
  check('A THIRD PARTY RECOMPUTES BOTH RESULTS INDEPENDENTLY and gets what each aggregator published',
    rA.state === 'Contested' && rB.state === 'Settled');
  check('the difference is in the INPUT SET, not the arithmetic — both counted 2 assessors',
    rA.distinct_assessors === 2 && rB.distinct_assessors === 2 && rA.dissent !== rB.dissent);
  check('and the note says the result is arithmetic over one set rather than a verdict',
    /NOT A VERDICT ABOUT THE CLAIM/i.test(rA.note));

  // === 6. NO SCORE, AND DISTINCTNESS IS BY AGENT ========================
  log('\n--- 6. What settlement refuses to be ---');
  check('no score, index, rating or rank field anywhere in a recomputation',
    !Object.keys(rA).some((k) => /score|index|rank|rating/i.test(k)));
  check('the state is one of three NAMED states, not a number crossing a line',
    ['Open', 'Contested', 'Settled'].includes(rA.state));
  // One agent assessing repeatedly is still one assessor. That is the only
  // sybil-adjacent property a rule here can actually check, and it is checked.
  const again = await assess(a1, 'Supports');
  const rSame = await a2.call('recompute_settlement', { target, policy, inputs: [s1, again] });
  log(`    one agent, two assessments: ${rSame.distinct_assessors} distinct assessor(s) -> ${rSame.state}`);
  check('ONE AGENT ASSESSING TWICE IS ONE ASSESSOR — so it stays Open under a two-assessor policy',
    rSame.distinct_assessors === 1 && rSame.state === 'Open');

  // === 7. THE LINK IS BOUND, like every other link since §5.19 ==========
  log('\n--- 7. An assessment cannot be filed against somebody else\'s target ---');
  await a1.call('create_claim', {
    content: 'an unrelated claim', domain: DOMAIN, author: a1.me, timestamp: nowMicros(),
    evidence_hashes: [], confidence: 'Moderate', semantic_tags: [], source_mew: null,
  });
  const rows = await a1.call('get_claims_by_domain', DOMAIN);
  const otherTarget = rows.find((r) =>
    b64(r.signed_action.hashed.content.data.entry_hash) !== b64(target))
    ?.signed_action?.hashed?.content?.data?.entry_hash;
  const wrongTargetInput = await refusal(a1, 'publish_settlement_status', {
    aggregator: a1.me, target: otherTarget, policy, inputs: [s1, s3],
    state: 'Settled', timestamp: nowMicros(),
  });
  check('a status counting assessments of a DIFFERENT target is refused',
    wrongTargetInput !== null && /different target/i.test(wrongTargetInput));
  const junkInput = await refusal(a1, 'publish_settlement_status', {
    aggregator: a1.me, target, policy, inputs: [s1, s3, policy],
    state: 'Settled', timestamp: nowMicros(),
  });
  check('an input that is neither an Assessment nor a Critique is refused, not silently ignored',
    junkInput !== null && /neither an Assessment nor a Critique/i.test(junkInput));

  // === 8. THE LINK ITSELF, PROBED =======================================
  // ADDED AFTER INJECTION BW PASSED, which is the finding and is worth more
  // than the section. §7 above tests the STATUS's own target rules and the
  // whole file went green with the TargetToAssessment author binding deleted
  // — because nothing here had ever tried to forge the LINK.
  //
  // That is §5.19's lesson reproduced by its own author: "the link types
  // nobody probed are the link types nobody validated, and coverage looked
  // complete because every link type anybody had TRIED to forge was refused."
  // The security review cost a network fork to learn it, and this harness
  // repeated it within a day of reading the account.
  //
  // So the two new link types go through `attempt_false_attachment_link`, the
  // existing bypass prober, exactly as the other eighteen do. The attack is
  // the one the review found four times over: author a perfectly valid entry
  // about your OWN target, then file it against somebody else's.
  log('\n--- 8. The link, forged through the bypass prober ---');
  const strayAssessment = await a2.call('publish_assessment', {
    assessor: a2.me, target: otherTarget, stance: 'Supports', confidence: 'Moderate',
    rationale: 'a legitimate assessment of a different claim', past_cone: [],
    timestamp: nowMicros(),
  });
  // agent 1 files agent 2's assessment against agent 1's target. The entry is
  // genuine and genuinely signed; the lie is which node it hangs from.
  const forgedLink = await refusal(a1, 'attempt_false_attachment_link', {
    kind: 'TargetToAssessment', base: target, target: strayAssessment,
    tag: null, anchor_of: null, question_anchor_of: null,
  });
  log(`    refusal: ${forgedLink ? forgedLink.replace(/\s+/g, ' ').slice(0, 150) : 'NONE — it committed'}`);
  check('FILING SOMEBODY ELSE\'S ASSESSMENT AGAINST YOUR OWN TARGET IS REFUSED',
    forgedLink !== null);
  check('and the refusal names the base rule rather than something incidental',
    forgedLink !== null && /must hang from the node the Assessment itself names/i.test(forgedLink));

  log('');
  if (failures === 0) {
    log('ALL CHECKS PASSED — a forged settlement is refused by validation, two');
    log('aggregators may still disagree about scope, both results survive, and');
    log('anybody can recompute either.');
  } else {
    log(`${failures} CHECK(S) FAILED`);
  }
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error('\nHARNESS ERROR:', e); process.exit(1); });
