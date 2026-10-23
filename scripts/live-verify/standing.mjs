#!/usr/bin/env node
// ============================================================================
// scripts/live-verify/standing.mjs — STAGE 3. CAN A CLAIM ATROPHY WITHOUT
// BEING DELETED, AND WITHOUT ANYBODY CONSULTING A CLOCK?
//
// READINESS item 22 closed by DECIDING Invariant 9 stays unsatisfied, because 6
// and 9 pull against each other: 9 wants atrophy to drive something, 6 makes
// anything it drives permanent. That assumed the consequence had to be a WRITE.
// `get_standing` computes it at READ time instead — excluded from a default
// read, reported as atrophied, still fetchable by hash, never deleted.
// Apoptosis, not necrosis.
//
// THE FIXTURE IS A DELIBERATE CAUSAL CHAIN, because that is the only way any
// check here can go red. `docs/open-work.md` item 2.3 says in as many words
// that "a standing rule that cannot go red is this repository's recurring
// failure", so the graph is built to make standing FLIP:
//
//   claim BURIED   critiqued by c1, then c1 by c2, c2 by c3, c3 by c4
//                  -> its only engagement sits several causal steps back
//   claim FRESH    critiqued once, and nothing critiques that critique
//                  -> its engagement is ON the frontier
//   claim LONELY   never critiqued at all
//                  -> own_depth_used, which is the state of an abandoned claim
//                     AND of a brand-new one, and this read cannot tell them
//                     apart
//
// A flat graph — every claim critiqued once, nothing deeper — would give every
// record height 0, every distance 0, and no threshold could bite. Section 2
// therefore asserts the graph has depth BEFORE asserting anything about
// standing, so a vacuous fixture is a red rather than a green.
//
// WHAT IS ASSERTED AS A RELATION RATHER THAN A NUMBER, and why. Chain edges
// (same author, increasing action_seq) are real causality and they inflate
// heights in ways that depend on the order the fixture happened to write
// things. So the exact distances are REPORTED and the assertions are on what
// must hold regardless: BURIED strictly deeper than FRESH, a threshold that
// separates them, and no atrophy at all when the caller promises nothing.
//
// Prereqs: a sandbox conductor (scripts/sandbox.sh clean && start), built .happ.
// ============================================================================

import { AdminWebsocket, AppWebsocket, CellType } from '@holochain/client';

const ADMIN_URL = 'ws://localhost:8889';
const APP_URL = 'ws://localhost:8888';
const APP_ID = 'epistemic-resonance-happ';
const AGENT2_APP_ID = 'epistemic-resonance-happ-agent2';
const HAPP_PATH = new URL('../../epistemic-resonance-happ.happ', import.meta.url).pathname;
const DOMAIN = `Standing${Date.now()}`;

const log = (...a) => console.log(...a);
const b64 = (u8) => Buffer.from(u8).toString('base64');
const nowSecs = () => Math.floor(Date.now() / 1000);
const nowMicros = () => Date.now() * 1000;

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

async function main() {
  log('=== STAGE 3: STANDING — ATROPHY WITHOUT DELETION ===\n');
  const admin = await AdminWebsocket.connect({ url: new URL(ADMIN_URL), wsClientOptions: { origin: 'live-verify' } });
  const a1 = await connectApp(admin, APP_ID);
  if (!(await admin.listApps({})).some((a) => a.installed_app_id === AGENT2_APP_ID)) {
    const pub2 = await admin.generateAgentPubKey();
    await admin.installApp({ source: { type: 'path', value: HAPP_PATH }, agent_key: pub2, installed_app_id: AGENT2_APP_ID });
    await admin.enableApp({ installed_app_id: AGENT2_APP_ID });
  }
  const a2 = await connectApp(admin, AGENT2_APP_ID);
  log(`agent1 = ${b64(a1.me).slice(0, 12)}…   agent2 = ${b64(a2.me).slice(0, 12)}…\n`);

  const constitution = await a1.call('publish_constitution', {
    agent: a1.me, promises: [{ action: 'state a method', domain: DOMAIN, modality: null }],
    conditions: [], published_at: nowSecs(), expires_at: null,
  });
  const membraneAction = await a1.call('create_membrane', {
    domain: DOMAIN, description: 'Seeded membrane for Stage 3 standing verification.',
    required_promises: ['state a method'], validation_rules_hash: null,
    creator: a1.me, created_at: nowSecs(), constitution,
  });
  const seeded = (await a1.call('get_membranes', null))
    .find((r) => b64(r.signed_action.hashed.hash) === b64(membraneAction));
  if (!seeded) setupFail(['The membrane just created is not in get_membranes — probably a STALE BUILD.']);
  const membrane = seeded.signed_action.hashed.content.data.entry_hash;

  const entryOf = async (actionHash) => {
    const rows = await a1.call('get_claims_by_domain', DOMAIN);
    const row = rows.find((r) => b64(r.signed_action.hashed.hash) === b64(actionHash));
    return row?.signed_action?.hashed?.content?.data?.entry_hash ?? null;
  };
  const mkClaim = async (agent, content) => {
    const action = await agent.call('create_claim', {
      content, domain: DOMAIN, author: agent.me, timestamp: nowMicros(),
      evidence_hashes: [], confidence: 'Moderate', semantic_tags: [], source_mew: null,
    });
    const entry = await entryOf(action);
    if (!entry) setupFail([`Could not resolve claim "${content}" to an EntryHash.`]);
    return { action, entry };
  };
  // Returns the critique's ACTION and its own EntryHash, so a critique can be
  // critiqued in turn — which is how causal depth is built.
  // `target_type` is a PARAMETER because validation checks it against what the
  // target actually is (§5.4/§5.5 derive the type and compare), so critiquing
  // a critique with target_type 'Claim' is correctly refused — which is how the
  // first version of this fixture failed, and the right failure to get.
  const critique = async (agent, targetEntry, content, targetType = 'Claim') => {
    const action = await agent.call('create_critique', {
      target: targetEntry, target_type: targetType, critique_mode: 'Methodological',
      content, author: agent.me, timestamp: nowMicros(),
      replication_attempted: false, evidence_hashes: [], species: null,
    });
    const rows = await agent.call('get_critiques_for', targetEntry);
    const row = rows.find((r) => b64(r.signed_action.hashed.hash) === b64(action));
    return { action, entry: row?.signed_action?.hashed?.content?.data?.entry_hash ?? null };
  };

  // --- The fixture: one buried claim, one fresh, one lonely ---------------
  const buried = await mkClaim(a1, 'a claim whose only engagement is several causal steps back');
  const fresh = await mkClaim(a1, 'a claim engaged with on the frontier');
  const lonely = await mkClaim(a1, 'a claim nobody has critiqued at all');

  // Bury it: c1 critiques the claim, then each critique is critiqued in turn.
  // Alternating authors so the depth comes from REFERENCES and not from one
  // agent's chain running through everything.
  const c1 = await critique(a2, buried.entry, 'critique of the buried claim');
  if (!c1.entry) setupFail(['Could not resolve c1 to an EntryHash.']);
  const c2 = await critique(a1, c1.entry, 'critique of that critique', 'Critique');
  if (!c2.entry) setupFail(['Could not resolve c2 to an EntryHash.']);
  const c3 = await critique(a2, c2.entry, 'and of that one', 'Critique');
  if (!c3.entry) setupFail(['Could not resolve c3 to an EntryHash.']);
  await critique(a1, c3.entry, 'and of that one too', 'Critique');

  // The fresh claim's engagement is written LAST, so nothing follows it.
  await critique(a2, fresh.entry, 'critique of the fresh claim');

  const standing = (max, horizon) => a1.call('get_standing', {
    membrane,
    standing_policy: max === undefined ? null : { max_causal_distance: max },
    horizon_levels: horizon ?? null,
  });

  let open;
  try { open = await standing(undefined); } catch (e) {
    setupFail([
      'get_standing threw on its first call.',
      'If the code looks right the conductor is probably on a STALE BUILD.',
      String(e?.message ?? e).slice(0, 300),
    ]);
  }
  // RETURNS A STAND-IN RATHER THAN UNDEFINED, because a claim MISSING from the
  // report must read as a failed check and not as a crashed harness. Injection
  // EC drops atrophied claims from the list — necrosis wearing apoptosis' name,
  // and the single most important thing §4 exists to catch — and the first
  // version of this file threw a TypeError on it, which meant the check that
  // would have named the defect never ran at all.
  const MISSING = { claim: null, has_standing: null, engagement_distance: -1, engagements: -1, own_depth_used: null, missing: true };
  const byHash = (rep, h) => rep.claims.find((c) => b64(c.claim) === b64(h)) ?? MISSING;

  // === 1. THE THRESHOLD IS THE CALLER'S, AND NONE MEANS NONE =============
  log('--- 1. No promise, no atrophy ---');
  log(`    records ${open.records_examined}, claims ${open.claims_examined}, causal_edges ${open.causal_edges}, max_height ${open.max_height}`);
  check('with no policy supplied, NOTHING atrophies — a real neutral position',
    open.atrophied === 0 && open.with_standing === open.claims_examined);
  check('and the report says the threshold was NOT promised by the caller',
    open.threshold_promised_by_caller === false && open.max_causal_distance === null);
  check('the three seeded claims are all examined',
    open.claims_examined === 3 && [buried, fresh, lonely].every((c) => byHash(open, c.action)));
  check('the domain is read off the resolved Membrane rather than supplied as text',
    open.domain === DOMAIN);

  // === 2. THE FIXTURE HAS DEPTH — ASSERTED BEFORE ANYTHING RESTS ON IT ===
  log('\n--- 2. The graph is not flat, so a threshold can bite ---');
  // A flat graph gives every record height 0 and no threshold could ever
  // separate anything. If this section reds, every later PASS would be vacuous.
  check('the examined graph has causal edges at all', open.causal_edges > 0);
  check('and real DEPTH — a chain of critiques, not one flat layer', open.max_height >= 3);
  // WITHOUT A LONG ENOUGH HORIZON THE DISTANCES ARE LOWER BOUNDS. The first
  // version of get_standing hardcoded a 2-level walk, which collected 6 of
  // this fixture's 8 records and reported the buried claim's distance as 1
  // instead of 3 — not wrong about the set it examined, but a different
  // question from the one being asked. A truncated graph must never read as a
  // settled one.
  check('every record the fixture wrote is in the examined set at the default horizon',
    open.records_examined === 8);
  // `horizon_exhausted` IS CONSERVATIVE BY DESIGN, and both directions are
  // checked because that is the only way to show the flag tracks reality. The
  // chain is exactly 4 deep, so a 4-level walk collects everything and still
  // ends on the CAP — it never got the empty level that would prove there was
  // nothing more. It must therefore report false. One more level gets that
  // proof and must report true. A flag that claimed completeness it had not
  // verified would be the more dangerous error.
  check('at a horizon exactly as deep as the chain it does NOT claim completeness',
    open.horizon_exhausted === false);
  const confirmed = await standing(undefined, 5);
  check('and with one level more it DOES — the walk found an empty level and said so',
    confirmed.horizon_exhausted === true && confirmed.records_examined === open.records_examined);
  const B = byHash(open, buried.action), F = byHash(open, fresh.action), L = byHash(open, lonely.action);
  log(`    buried: distance ${B.engagement_distance}, engagements ${B.engagements}`);
  log(`    fresh : distance ${F.engagement_distance}, engagements ${F.engagements}`);
  log(`    lonely: distance ${L.engagement_distance}, engagements ${L.engagements}, own_depth_used ${L.own_depth_used}`);
  check('the buried claim and the fresh one both have an engagement',
    B.engagements >= 1 && F.engagements >= 1);
  check('THE BURIED CLAIM IS STRICTLY DEEPER THAN THE FRESH ONE — the measure tracks causal distance',
    B.engagement_distance > F.engagement_distance);
  check('the lonely claim has no engagement and SAYS it fell back to its own depth',
    L.engagements === 0 && L.own_depth_used === true);
  check('and the two engaged claims did NOT fall back',
    B.own_depth_used === false && F.own_depth_used === false);

  // === 3. STANDING FLIPS ON THE CALLER'S THRESHOLD =======================
  log('\n--- 3. A promised threshold separates them ---');
  // The discriminating threshold is derived from the measured distances rather
  // than hardcoded, so the check survives chain-edge details that shift the
  // absolute numbers without changing the ordering.
  const cut = F.engagement_distance; // fresh survives at its own distance
  const tight = await standing(cut);
  const loose = await standing(B.engagement_distance);
  const tb = byHash(tight, buried.action), tf = byHash(tight, fresh.action);
  log(`    at max_causal_distance=${cut}: buried has_standing=${tb.has_standing}, fresh=${tf.has_standing}`);
  log(`    at max_causal_distance=${B.engagement_distance}: atrophied=${loose.atrophied}`);
  check('the buried claim is still PRESENT in the report at a biting threshold — not dropped from it',
    tb.missing !== true);
  check(`AT A THRESHOLD OF ${cut} THE BURIED CLAIM ATROPHIES`, tb.has_standing === false);
  check('while the fresh claim KEEPS its standing at the same threshold', tf.has_standing === true);
  check('so at least one claim atrophied, and the counts agree with the list',
    tight.atrophied >= 1 && tight.atrophied === tight.claims.filter((c) => !c.has_standing).length);
  check('with_standing and atrophied partition the examined claims',
    tight.with_standing + tight.atrophied === tight.claims_examined);
  check('AND A LOOSER THRESHOLD GIVES IT BACK — the verdict is the policy\'s, not the claim\'s',
    loose.atrophied === 0);
  check('the promised threshold is echoed, so a reader can tell which patience produced this',
    tight.threshold_promised_by_caller === true && tight.max_causal_distance === cut);

  // === 3b. A SHORT HORIZON IS REPORTED, NOT HIDDEN =======================
  log('\n--- 3b. A truncated walk says so ---');
  const shallow = await standing(cut, 1);
  const sb = byHash(shallow, buried.action);
  log(`    horizon_levels=1: records ${shallow.records_examined}, exhausted ${shallow.horizon_exhausted}, buried distance ${sb.engagement_distance}`);
  check('a 1-level horizon examines FEWER records than the full walk',
    shallow.records_examined < open.records_examined);
  check('AND SAYS SO — horizon_exhausted is false, so a reader knows the distances are lower bounds',
    shallow.horizon_exhausted === false);
  check('the horizon it used is echoed back', shallow.horizon_levels === 1 && open.horizon_levels === 4);
  check('and the truncated distance is no GREATER than the full one — a short walk underestimates, never over',
    sb.engagement_distance <= B.engagement_distance);

  // === 4. APOPTOSIS, NOT NECROSIS ========================================
  log('\n--- 4. An atrophied claim is reported, not removed ---');
  // The Invariant 6 check. Atrophy that deleted anything would be exactly what
  // READINESS item 22 refused; the whole design rests on the consequence being
  // a read-layer observation.
  check('the atrophied claim is still LISTED in the report rather than omitted',
    tb.missing !== true && tight.claims.length === open.claims.length);
  const stillThere = await a1.call('get_claim', buried.entry);
  check('AND IT IS STILL FETCHABLE BY HASH after atrophying — nothing was deleted',
    stillThere !== null && typeof stillThere?.content === 'string');
  check('it is still in the domain index too, so no read was silently narrowed',
    (await a1.call('get_claims_by_domain', DOMAIN)).length === 3);
  check('the report declares that nothing was deleted and the record stays fetchable',
    tight.nothing_deleted === true && tight.atrophied_still_fetchable_by_hash === true);

  // === 5. READING IT WRITES NOTHING ======================================
  log('\n--- 5. Computing standing writes nothing ---');
  const before = open.chain_length;
  for (let i = 0; i < 4; i++) await standing(1);
  const after = (await standing(1)).chain_length;
  check('the DECLARATION says it writes nothing', open.writes_nothing === true);
  check(`and the measured chain length is unchanged across 5 more reads (${before} -> ${after})`,
    before === after);

  // === 6. NO CLOCK, NO SCORE, NO RANKING =================================
  log('\n--- 6. What it refuses to be ---');
  const forbidden = ['score', 'rank', 'timestamp', 'at_secs', 'elapsed', 'age_secs', 'reputation'];
  const body = JSON.stringify(tight).toLowerCase();
  const found = forbidden.filter((k) => body.includes(`"${k}"`));
  check(`no score, ranking, or CLOCK field anywhere in the response${found.length ? ` (found ${found.join(', ')})` : ''}`,
    found.length === 0);
  check('the limits name apoptosis-not-necrosis and whose promise the threshold is',
    typeof tight.limits === 'string' && /APOPTOSIS, NOT NECROSIS/.test(tight.limits)
      && /CALLER'S PROMISE/.test(tight.limits));
  check('and they warn that an abandoned claim cannot be told from a brand-new one',
    /nobody has YET engaged/.test(tight.limits));
  check('the observer is named, since the examined set is what THIS observer can read',
    b64(tight.observer) === b64(a1.me));

  log('');
  if (failures === 0) {
    log('ALL CHECKS PASSED — standing is a function of causal distance under the');
    log('reader\'s own promise, nothing was deleted, and no clock was consulted.');
  } else {
    log(`${failures} CHECK(S) FAILED`);
  }
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error('\nHARNESS ERROR:', e); process.exit(1); });
