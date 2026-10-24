#!/usr/bin/env node
// ============================================================================
// scripts/live-verify/superior-egg.mjs — THE SUPERIOR-EGG WALKTHROUGH, RUN
// RATHER THAN DESCRIBED. docs/cases/luck-light-egg.md §7, item 7.10.
//
// WHY THIS FILE EXISTS. That case document mapped a real person's design onto
// this protocol and said, in as many words, that the sequence "has not been run
// end to end as a fixture, so it is a design and not a result". A reply was
// drafted offering to build it. This is the build, and until it passes, §7 of
// that document must keep its NOT YET BUILT marking.
//
// WHAT IT WALKS. One membrane, three agents, no currency:
//
//   producer   certifies a flock, pre-registers a capacity forecast, ships
//   tester     retests the certification as an ordinary Evidential critique
//   buyer      assesses the delivery, and reads standing TWICE
//
// STEP 6 IS THE WHOLE DEMONSTRATION. The buyer calls get_standing with
// `None` and then with a tight `max_causal_distance`, and sees the same flock
// with and without standing. That is the 2026-10-24 decision made visible: the
// freshness horizon lives in the READER, not in the protocol and not in the
// membrane. A franchise standard any region could impose on the others would be
// the centre this design is trying to avoid; a standard each market promises for
// itself is the same standard without the capture surface.
//
// TWO FLOCKS, NOT ONE, AND THE REASON IS NEGATIVE EVIDENCE. §7 describes one
// certification read twice. A one-flock fixture cannot tell "the tight read
// dropped the stale flock" from "the tight read drops everything" — both look
// identical from a single row. So flock 14 is buried under a chain of
// critique-of-critique and flock 7 is engaged on the frontier, and the tight
// read must drop ONE and keep the OTHER. Without that, section 6's checks
// could not go red, which docs/open-work.md item 2.3 names as this
// repository's recurring failure.
//
// WHAT THE DOCUMENT GOT WRONG, FOUND BY BUILDING IT. §7 step 2 lists
// `grant_attestation` as part of the smallest runnable thing. It cannot be:
// ATTESTATION_GRANT_MIN_TENURE_SECS_VALIDATION is 30 days
// (dna/integrity/src/lib.rs), so a membrane minutes old cannot grant an
// attestation at all. Section 3 therefore asserts the REFUSAL, which is the
// honest result and the more flattering one — attestation in this protocol
// cannot be minted on day one, which is exactly the property a franchise
// wants from it.
//
// WATCHED FAILING, NOT MERELY WRITTEN. Section 6's demonstration was verified
// to go red by injection: with `read(d14)` in place of `read(d7)` the threshold
// no longer separates the two flocks, and "THE SAME FLOCK, NOW WITHOUT
// STANDING" fails along with the echo check — 2 failed, exit 1. A green run of
// this section is therefore evidence about the protocol rather than about the
// fixture. Two further notes from building it:
//
//   - ClaimStanding.claim is an ACTION hash; the critique targets are ENTRY
//     hashes. Keying the lookup wrongly made every row read as MISSING, and
//     the MISSING sentinel is what turned that into a named failure instead of
//     a crash — then a -1 distance went into a u32 and the second read threw.
//   - RUN IT AGAINST A CLEAN SANDBOX. On a DHT carrying several previous runs
//     this harness exceeded 400s and was killed; `sandbox.sh clean && start`
//     first and it finishes in well under a minute.
//
// Prereqs: a sandbox conductor (scripts/sandbox.sh clean && start), built .happ.
// ============================================================================

import { AdminWebsocket, AppWebsocket, CellType } from '@holochain/client';

const ADMIN_URL = 'ws://localhost:8889';
const APP_URL = 'ws://localhost:8888';
const APP_ID = 'epistemic-resonance-happ';
const HAPP_PATH = new URL('../../epistemic-resonance-happ.happ', import.meta.url).pathname;
const DOMAIN = `SuperiorEgg${Date.now()}`;
const PROMISE = 'state the test method';

const log = (...a) => console.log(...a);
const b64 = (u8) => Buffer.from(u8).toString('base64');
const nowSecs = () => Math.floor(Date.now() / 1000);
const nowMicros = () => Date.now() * 1000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failures = 0;
const check = (label, cond) => {
  log(`  ${cond ? 'PASS' : 'FAIL'}: ${label}`);
  if (!cond) failures++;
};
const setupFail = (lines) => {
  log('');
  log('SETUP FAILED — this is not a result about the protocol:');
  for (const l of lines) log(`  ${l}`);
  process.exit(2);
};
// Returns the refusal MESSAGE, or null if the call unexpectedly succeeded.
// Null is what makes a negative check go red rather than silently pass.
const refusal = async (agent, fn, payload) => {
  try { await agent.call(fn, payload); return null; }
  catch (e) { return String(e?.message ?? e); }
};

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
    call: (fn, payload) => app.callZome({
      role_name: 'epistemic', zome_name: 'epistemic_coordinator', fn_name: fn, payload,
    }, 60_000),
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

async function main() {
  log('=== THE SUPERIOR-EGG WALKTHROUGH: one membrane, three agents, no currency ===\n');
  const admin = await AdminWebsocket.connect({ url: new URL(ADMIN_URL), wsClientOptions: { origin: 'live-verify' } });
  const producer = await connectApp(admin, APP_ID);
  const tester = await ensure(admin, 'epistemic-resonance-happ-agent2');
  const buyer = await ensure(admin, 'epistemic-resonance-happ-agent3');
  log(`producer = ${b64(producer.me).slice(0, 12)}…  tester = ${b64(tester.me).slice(0, 12)}…  buyer = ${b64(buyer.me).slice(0, 12)}…\n`);

  // === 1. THE MEMBRANE IS FOUNDED ON STATED PROMISES ====================
  // Not on a fee and not on a stake: a founder says what they promise and
  // what the domain will demand of others. Those are different things and
  // the form keeps them apart, so this does too.
  log('--- 1. A domain whose members have each said what they promise ---');
  const constitutionOf = (agent) => agent.call('publish_constitution', {
    agent: agent.me,
    promises: [{ action: PROMISE, domain: DOMAIN, modality: null }],
    conditions: [], published_at: nowSecs(), expires_at: null,
  });
  const producerConstitution = await constitutionOf(producer);
  await constitutionOf(tester);
  await constitutionOf(buyer);
  check('each of the three publishes a constitution before doing anything else',
    producerConstitution != null);

  const membraneAction = await producer.call('create_membrane', {
    domain: DOMAIN,
    description: 'Superior-egg certification: producers certify flocks, testers retest, buyers read.',
    required_promises: [PROMISE], validation_rules_hash: null,
    creator: producer.me, created_at: nowSecs(), constitution: producerConstitution,
  });
  const seeded = (await producer.call('get_membranes', null))
    .find((r) => b64(r.signed_action.hashed.hash) === b64(membraneAction));
  if (!seeded) setupFail(['The membrane just created is not in get_membranes — probably a STALE BUILD.']);
  const membrane = seeded.signed_action.hashed.content.data.entry_hash;

  // NEGATIVE: a domain that demands nothing of its participants is not a
  // membrane, it is a label. Validation says so rather than the UI.
  const demandsNothing = await refusal(producer, 'create_membrane', {
    domain: `${DOMAIN}Empty`, description: 'a domain asking nothing',
    required_promises: [], validation_rules_hash: null,
    creator: producer.me, created_at: nowSecs(), constitution: producerConstitution,
  });
  check('a domain declaring NOTHING of its participants is refused by validation',
    demandsNothing !== null && /required_promise/i.test(demandsNothing));

  await producer.call('join_membrane', membrane);
  await tester.call('join_membrane', membrane);
  await buyer.call('join_membrane', membrane);
  const members = await producer.call('get_membrane_members', membrane);
  check('all three are members, and membership is readable by any of them',
    members.length >= 3);

  // === 2. A CERTIFICATION IS A CLAIM CARRYING EVIDENCE ==================
  // And a randomised retest is not a separate subsystem — it is the ordinary
  // critique path, in Evidential mode, pointed at the certification.
  log('\n--- 2. Certification, and the retest that is an ordinary critique ---');
  const panel = async (flock, choline) => producer.call('create_evidence', {
    content: `Flock ${flock} panel: ${choline}mg choline, 1.8mg lutein+zeaxanthin, omega-3 230mg/egg`,
    evidence_type: 'Measurement', source_url: `https://lab.example/report/flock-${flock}`,
    author: producer.me, timestamp: nowMicros(),
  });
  const certify = async (flock, choline) => {
    const evidence = await panel(flock, choline);
    const action = await producer.call('create_claim', {
      content: `Flock ${flock} meets the superior profile for period 2026-Q4`,
      domain: DOMAIN, author: producer.me, timestamp: nowMicros(),
      evidence_hashes: [evidence], confidence: 'High',
      semantic_tags: ['certification', 'region:cascadia'], source_mew: null,
    });
    const rows = await producer.call('get_claims_by_domain', DOMAIN);
    const row = rows.find((r) => b64(r.signed_action.hashed.hash) === b64(action));
    if (!row) setupFail([`Certification for flock ${flock} did not resolve to an EntryHash.`]);
    return { action, entry: row.signed_action.hashed.content.data.entry_hash, evidence };
  };
  const flock14 = await certify(14, 410);
  const flock7 = await certify(7, 395);
  check('a certification commits as a Claim carrying a Measurement panel',
    flock14.entry != null && flock7.entry != null);

  const critique = async (agent, targetEntry, content, targetType = 'Claim') => {
    const action = await agent.call('create_critique', {
      target: targetEntry, target_type: targetType, critique_mode: 'Evidential',
      content, author: agent.me, timestamp: nowMicros(),
      replication_attempted: true, evidence_hashes: [], species: null,
    });
    const rows = await agent.call('get_critiques_for', targetEntry);
    const row = rows.find((r) => b64(r.signed_action.hashed.hash) === b64(action));
    return { action, entry: row?.signed_action?.hashed?.content?.data?.entry_hash ?? null };
  };
  const retest = await critique(tester, flock14.entry,
    'Randomised retest of flock 14: choline measured at 361mg, below the certified figure.');
  check('a randomised retest is an ordinary Evidential critique, needing no new subsystem',
    retest.entry != null);

  // NEGATIVE: the type is checked against what the target actually IS, so a
  // retest mislabelling its target cannot commit.
  const wrongType = await refusal(tester, 'create_critique', {
    target: retest.entry, target_type: 'Claim', critique_mode: 'Evidential',
    content: 'critiquing a critique while calling it a Claim',
    author: tester.me, timestamp: nowMicros(),
    replication_attempted: false, evidence_hashes: [], species: null,
  });
  check('and a critique whose declared target_type is not what the target IS is refused',
    wrongType !== null);

  // === 3. ATTESTATION HAS A REAL COST, AND THE FIXTURE PROVES IT ========
  // §7 of the case document lists grant_attestation among the steps. It
  // cannot pass here, and that is the finding rather than a gap: a 30-day
  // tenure bar means a membrane cannot mint its own vouchers on day one.
  log('\n--- 3. Attestation cannot be minted on day one (and should not be) ---');
  const membership = await producer.call('get_my_membership_action', membrane);
  check('the producer can name its own membership action, which a vouch must cite',
    membership != null);
  const vouch = await refusal(producer, 'grant_attestation', {
    candidate: tester.me, membrane, my_membership_action: membership,
  });
  log(`    refusal: ${vouch ? vouch.replace(/\s+/g, ' ').slice(0, 150) : 'NONE — it committed'}`);
  check('vouching for a member of a membrane minutes old is REFUSED for want of tenure',
    vouch !== null && /tenure|tenured/i.test(vouch));

  // === 4. ISSUANCE WITHOUT A RESERVE: A SEALED CAPACITY FORECAST ========
  // The answer to "more units outstanding than certified hens can fill" is a
  // forecasting commitment, not a reserve. SealedPrediction is the only
  // private entry type in the zome: the content is sealed, the hash is public.
  log('\n--- 4. A capacity forecast, sealed then revealed ---');
  // THE QUESTION IS AN ActionHash, NOT A STRING, and that is the design: a
  // forecast is pinned to a question somebody posed FIRST, so a prediction
  // cannot be re-pointed at whichever question the outcome happens to fit.
  const question = await producer.call('create_claim', {
    content: 'How many eggs will Cascadia request in 2027-Q1?',
    domain: DOMAIN, author: producer.me, timestamp: nowMicros(),
    evidence_hashes: [], confidence: 'Moderate',
    semantic_tags: ['forecast-question'], source_mew: null,
  });
  check('a question is posed, as its own claim, before anybody forecasts against it',
    question != null);
  // Separate actions, so their timestamps must differ: a commitment made in
  // the same microsecond would be indistinguishable from one made after the
  // outcome was known.
  await sleep(1100);

  const prediction = 'Cascadia will request 40,000 eggs in 2027-Q1.';
  const salt = `salt-${Date.now().toString(36)}`;
  const deadline = nowMicros() + 7 * 24 * 3600 * 1_000_000;
  const sealed = await producer.call('pre_register', { question, prediction, salt, reveal_deadline: deadline });
  check('a capacity forecast can be committed without disclosing it', sealed != null);
  check('and it is readable FROM the question it is about, so the commitment is public',
    (await producer.call('get_pre_registrations_for_question', question)).length >= 1);

  const has = (list, h) => list.some((e) => JSON.stringify(e.pre_registration) === JSON.stringify(h));
  const find = (list, h) => list.find((e) => JSON.stringify(e.pre_registration) === JSON.stringify(h));

  // THIS IS THE IP PROPERTY, AND IT IS THE SAME MECHANISM. SealedPrediction is
  // the only private entry type in the zome: the commitment is public, the
  // content is not. That is precisely the shape "seal the blueprint, publish
  // the hash, disclose only in a dispute" calls for — see the case document
  // §5, where the IP question turns out to be this question.
  let record = await producer.call('get_foresight_record', producer.me);
  check('before revealing, the forecast sits in PENDING', has(record.pending, sealed));
  check('AND ITS CONTENT IS NOT READABLE FROM THE PUBLIC RECORD — the seal is real',
    find(record.pending, sealed)?.revealed_prediction === null);

  // NEGATIVE, AND THE WHOLE POINT OF A SEAL: revealing something else fails.
  const wrongContent = await refusal(producer, 'reveal_pre_registration',
    { pre_registration: sealed, prediction: 'Cascadia will request 400,000 eggs.', salt });
  check('revealing content that is not what was sealed is refused',
    wrongContent !== null && /does not hash to the sealed commitment/i.test(wrongContent));
  const wrongSalt = await refusal(producer, 'reveal_pre_registration',
    { pre_registration: sealed, prediction, salt: 'not-the-salt' });
  check('and the right content with the wrong salt is refused too',
    wrongSalt !== null && /does not hash to the sealed commitment/i.test(wrongSalt));

  await producer.call('reveal_pre_registration', { pre_registration: sealed, prediction, salt });
  record = await producer.call('get_foresight_record', producer.me);
  check('after revealing, the forecast is in the REVEALED half of the track record',
    has(record.revealed, sealed));
  check('and no longer pending', !has(record.pending, sealed));
  check('and what was revealed is what was committed to',
    find(record.revealed, sealed)?.revealed_prediction === prediction);

  // === 5. UNFULFILLED → FULFILLED, 2-OF-2, NO ORACLE ====================
  // A delivery claim, two assessments, and a policy somebody published
  // BEFORE applying it. The protocol does not decide when this is settled;
  // a named agent's declared policy over a named input set does, and
  // anybody can recompute it.
  log('\n--- 5. One redemption, settled 2-of-2 with max_dissent 0 ---');
  const deliveryAction = await producer.call('create_claim', {
    content: 'Redemption 0001: 1,200 eggs from flock 14 delivered to the buyer',
    domain: DOMAIN, author: producer.me, timestamp: nowMicros(),
    evidence_hashes: [], confidence: 'High',
    semantic_tags: ['redemption'], source_mew: null,
  });
  const deliveryRows = await producer.call('get_claims_by_domain', DOMAIN);
  const delivery = deliveryRows
    .find((r) => b64(r.signed_action.hashed.hash) === b64(deliveryAction))
    ?.signed_action?.hashed?.content?.data?.entry_hash;
  if (!delivery) setupFail(['The delivery claim did not resolve to an EntryHash.']);

  const policy = await buyer.call('publish_settlement_policy', {
    author: buyer.me, name: 'delivery-two-sided-no-dissent', min_assessors: 2, max_dissent: 0,
    statement: 'I will treat a redemption as fulfilled when both sides have assessed it and '
      + 'neither disputes it. I state this before applying it so the standard is arguable '
      + 'separately from any particular delivery.',
    published_at: nowSecs(),
  });
  check('the buyer publishes the standard BEFORE applying it to a delivery', policy != null);

  const assess = (agent, stance) => agent.call('publish_assessment', {
    assessor: agent.me, target: delivery, stance, confidence: 'High',
    rationale: `${stance} on redemption 0001`, past_cone: [], timestamp: nowMicros(),
  });
  const buyerSays = await assess(buyer, 'Supports');
  const producerSays = await assess(producer, 'Supports');

  // NEGATIVE: one assessor is not two, so this policy must say Open and
  // refuse a Settled that its own inputs do not produce.
  const prematurely = await refusal(buyer, 'publish_settlement_status', {
    aggregator: buyer.me, target: delivery, policy, inputs: [buyerSays],
    state: 'Settled', timestamp: nowMicros(),
  });
  check('ONE assessor cannot be written up as Settled under a 2-assessor policy',
    prematurely !== null && /does not follow from its own policy and inputs/i.test(prematurely));

  const settled = await buyer.call('publish_settlement_status', {
    aggregator: buyer.me, target: delivery, policy, inputs: [buyerSays, producerSays],
    state: 'Settled', timestamp: nowMicros(),
  });
  check('two-sided delivery, nobody disputing: the redemption is FULFILLED, with no oracle',
    settled != null);

  // AND A CONTESTED DELIVERY CANNOT SILENTLY FLIP. A dispute from either
  // side holds it open under max_dissent 0 — which is the property a grant
  // programme actually needs from this machinery.
  const testerDisputes = await assess(tester, 'Disputes');
  const forged = await refusal(buyer, 'publish_settlement_status', {
    aggregator: buyer.me, target: delivery, policy, inputs: [buyerSays, producerSays, testerDisputes],
    state: 'Settled', timestamp: nowMicros(),
  });
  check('and once somebody DISPUTES it, a Settled over those inputs is refused by validation',
    forged !== null && /does not follow from its own policy and inputs/i.test(forged));
  const contested = await buyer.call('publish_settlement_status', {
    aggregator: buyer.me, target: delivery, policy, inputs: [buyerSays, producerSays, testerDisputes],
    state: 'Contested', timestamp: nowMicros(),
  });
  check('the HONEST status over the same inputs commits, so the dispute is recorded not averaged away',
    contested != null);

  // === 6. THE DEMONSTRATION: THE SAME FLOCK, TWICE ======================
  // Flock 14's engagement gets buried under critique-of-critique; flock 7 is
  // engaged on the frontier. Authors alternate so the depth comes from
  // REFERENCES rather than from one agent's chain running through everything.
  log('\n--- 6. THE DEMONSTRATION: the buyer reads standing twice ---');
  const c2 = await critique(producer, retest.entry, 'the retest sampled outside the laying window', 'Critique');
  if (!c2.entry) setupFail(['Could not resolve c2 to an EntryHash.']);
  const c3 = await critique(tester, c2.entry, 'the laying window is not what the standard specifies', 'Critique');
  if (!c3.entry) setupFail(['Could not resolve c3 to an EntryHash.']);
  const c4 = await critique(producer, c3.entry, 'and the standard was revised in Q3', 'Critique');
  if (!c4.entry) setupFail(['Could not resolve c4 to an EntryHash.']);
  // Flock 7's retest is written LAST, so nothing follows it: it is the frontier.
  await critique(tester, flock7.entry, 'Randomised retest of flock 7: within tolerance.');

  const read = (max) => buyer.call('get_standing', {
    membrane,
    standing_policy: max === undefined ? null : { max_causal_distance: max },
    horizon_levels: null,
  });

  let open;
  try { open = await read(undefined); } catch (e) {
    setupFail([
      'get_standing threw on its first call.',
      'If the code looks right the conductor is probably on a STALE BUILD.',
      String(e?.message ?? e).slice(0, 300),
    ]);
  }
  log(`    graph: records ${open.records_examined}, claims ${open.claims_examined}, causal_edges ${open.causal_edges}, max_height ${open.max_height}`);

  // THE FIXTURE IS ASSERTED BEFORE ANYTHING IS CONCLUDED FROM IT. A flat
  // graph gives every record distance 0, and then no threshold could bite —
  // a vacuous pass dressed as a demonstration.
  check('the critique graph actually has depth, so a threshold CAN bite',
    open.causal_edges > 0 && open.max_height >= 2);

  // KEYED BY ACTION HASH, NOT ENTRY HASH. ClaimStanding.claim is an
  // ActionHash; the critique targets above are EntryHashes. Getting this
  // wrong makes every row read as MISSING, which the first run of this
  // harness did — and then fed a -1 distance into a u32 and crashed the
  // second read. The sentinel is what turned that into a named failure.
  const MISSING = { has_standing: null, engagement_distance: -1, missing: true };
  const row = (rep, h) => rep.claims.find((c) => b64(c.claim) === b64(h)) ?? MISSING;

  check('reading with NO policy promises no threshold, and the report says so',
    open.threshold_promised_by_caller === false && open.max_causal_distance === null);
  check('and with nothing promised, NOTHING atrophies — a real neutral off position',
    open.atrophied === 0 && open.with_standing === open.claims_examined);
  check('so the neighbour buying a dozen sees flock 14 WITH standing',
    row(open, flock14.action).has_standing === true);

  const d14 = row(open, flock14.action).engagement_distance;
  const d7 = row(open, flock7.action).engagement_distance;
  log(`    engagement distance: flock 14 = ${d14}, flock 7 = ${d7}`);
  check('flock 14\'s engagement is strictly FURTHER back than flock 7\'s — the graph grew around it',
    d14 > d7);

  // The tight read. The threshold sits between the two distances, so it must
  // separate them; a threshold that dropped both would be the failure this
  // second flock exists to catch.
  if (d14 < 0 || d7 < 0) {
    log('  (both certifications must appear in the report before a threshold can be');
    log('   chosen from their distances — stopping here rather than sending a');
    log('   negative into a u32, which is what the first run of this file did)');
    log(`\n${failures} CHECK(S) FAILED`);
    process.exit(1);
  }
  const tight = await read(d7);
  check('the tight read ECHOES the caller as the promiser of that threshold',
    tight.threshold_promised_by_caller === true && tight.max_causal_distance === d7);
  check('THE SAME FLOCK, NOW WITHOUT STANDING: the wholesale buyer\'s horizon drops flock 14',
    row(tight, flock14.action).has_standing === false);
  check('and flock 7, retested on the frontier, KEEPS standing — the horizon is selective, not a blanket',
    row(tight, flock7.action).has_standing === true);
  check('flock 14 is still in the report, reported as atrophied rather than removed from it',
    row(tight, flock14.action).missing !== true);
  check('nothing was deleted to achieve that: both reads examine the same claims',
    tight.claims_examined === open.claims_examined);

  // ONLY NARRATED WHEN IT IS TRUE. The injection run below printed this line
  // under two red checks, which is the harness telling its reader the thing
  // the checks had just denied — §7b.1's failure mode performed by a test.
  if (failures === 0) {
    log('\n    The franchise standard lived in the reader both times. The protocol');
    log('    never held an opinion about freshness, and never had to.');
  }

  log('');
  if (failures > 0) {
    log(`${failures} CHECK(S) FAILED`);
    process.exit(1);
  }
  log('ALL CHECKS PASSED');
}

main().catch((e) => { console.error(e); process.exit(1); });
