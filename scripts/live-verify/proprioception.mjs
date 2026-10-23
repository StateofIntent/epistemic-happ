#!/usr/bin/env node
// ============================================================================
// scripts/live-verify/proprioception.mjs — STAGE 2. DOES AN AGENT KNOW ITS OWN
// STATE, AND DOES IT REFUSE TO KNOW ANYBODY ELSE'S?
//
// WHY STAGE 2 IS THE ONE THAT MATTERS. Luhmann's criterion for an autopoietic
// system of communications is that a communication be produced by PRIOR
// COMMUNICATIONS rather than by the environment. Every Claim in this graph is
// currently produced by a human or by something a human triggered — the
// environment, every time. `get_local_tension` is the change that makes the
// graph's own state available as the proximate cause of the next write.
//
// SO THE THING TO VERIFY IS NOT "DOES IT RETURN NUMBERS". It is:
//
//   1. that the numbers are the CALLER'S, and that there is no way to ask for
//      anybody else's — the Invariant 1 defence, which must hold by
//      construction rather than by policy;
//   2. that they MOVE when the thing they measure moves, which is the only
//      evidence that they are measurements and not decoration;
//   3. that reading them writes NOTHING; and
//   4. that the read stops short of deciding anything, because the threshold
//      that would turn any of these into an action is `docs/open-work.md`
//      item 3.1 and nobody has promised it yet.
//
// EVERY CHECK HERE IS BUILT TO BE ABLE TO GO RED, which is this repository's
// recurring failure and the reason §3 and §4 are shaped the way they are. A
// check that reads a figure and asserts it is a number cannot go red; a check
// that writes a critique and requires the Critique headroom to fall by
// EXACTLY ONE can only pass if the figure is really derived from the chain.
// Likewise §4 does not assert that decay happens — it asserts that TWO
// DIFFERENT HALF-LIVES GIVE DIFFERENT ANSWERS, which is the only thing that
// proves the caller's policy is consulted at all rather than ignored in favour
// of the compiled-in default.
//
// WHAT THIS HARNESS DOES NOT TEST, so nobody reads more into a green run.
//   - It does not test that two agents with DIFFERENT CACHES get different
//     closure deficits. Both agents here live on one conductor and therefore
//     share a DHT store, so `resolved_locally` is necessarily the same for
//     both. Observer-relativity of closure needs two conductors and belongs
//     with `network.sh`; what is asserted instead is the arithmetic that
//     holds without a race — `resolved_locally + deficit == cited_total`.
//   - It does not test arc width, because there is nothing to test: a
//     coordinator zome cannot reach it. §6 asserts that the ABSENCE is
//     declared, which is the only honest thing a harness can check here.
//
// Prereqs: a sandbox conductor (scripts/sandbox.sh clean && start) and a built
// .happ. Two agents, because caller-scoping is the main claim and one agent
// cannot demonstrate it.
// ============================================================================

import { AdminWebsocket, AppWebsocket, CellType } from '@holochain/client';

const ADMIN_URL = 'ws://localhost:8889';
const APP_URL = 'ws://localhost:8888';
const APP_ID = 'epistemic-resonance-happ';
const AGENT2_APP_ID = 'epistemic-resonance-happ-agent2';
const HAPP_PATH = new URL('../../epistemic-resonance-happ.happ', import.meta.url).pathname;
const DOMAIN = `Proprioception${Date.now()}`;

const log = (...a) => console.log(...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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

const frictionFor = (tension, path) => tension.friction.find((f) => f.path === path) ?? null;

async function main() {
  log('=== STAGE 2: PROPRIOCEPTION ===\n');
  const admin = await AdminWebsocket.connect({ url: new URL(ADMIN_URL), wsClientOptions: { origin: 'live-verify' } });
  const a1 = await connectApp(admin, APP_ID);
  const apps = await admin.listApps({});
  if (!apps.some((a) => a.installed_app_id === AGENT2_APP_ID)) {
    const pub2 = await admin.generateAgentPubKey();
    await admin.installApp({ source: { type: 'path', value: HAPP_PATH }, agent_key: pub2, installed_app_id: AGENT2_APP_ID });
    await admin.enableApp({ installed_app_id: AGENT2_APP_ID });
  }
  const a2 = await connectApp(admin, AGENT2_APP_ID);
  log(`agent1 = ${b64(a1.me).slice(0, 12)}…   agent2 = ${b64(a2.me).slice(0, 12)}…\n`);

  // --- Seed a membrane and some discourse --------------------------------
  const constitution = await a1.call('publish_constitution', {
    agent: a1.me,
    promises: [{ action: 'distinguish observation from inference', domain: DOMAIN, modality: null }],
    conditions: [], published_at: nowSecs(), expires_at: null,
  });
  const membrane = await a1.call('create_membrane', {
    domain: DOMAIN,
    description: 'Seeded membrane for Stage 2 proprioception verification.',
    required_promises: ['distinguish observation from inference'],
    validation_rules_hash: null,
    creator: a1.me,
    created_at: nowSecs(),
    constitution,
  });

  // Evidence, so citations exist and `cited_total` has something to count.
  const evidence = [];
  for (let i = 0; i < 3; i++) {
    evidence.push(await a1.call('create_evidence', {
      content: `grounding evidence ${i} for the proprioception harness`,
      evidence_type: 'Measurement',
      source_url: null, author: a1.me, timestamp: nowMicros(),
    }));
  }
  const claim = (agent, content, ev) => agent.call('create_claim', {
    content, domain: DOMAIN, author: agent.me, timestamp: nowMicros(),
    evidence_hashes: ev, confidence: 'Moderate', semantic_tags: [], source_mew: null,
  });
  const a1Claims = [];
  for (let i = 0; i < 3; i++) a1Claims.push(await claim(a1, `agent 1 claim ${i}`, evidence));
  const a2Claim = await claim(a2, 'agent 2 claim, citing one thing', [evidence[0]]);

  const tensionOf = (agent, policy = null) => agent.call('get_local_tension', {
    membrane, conductance_policy: policy,
  });

  let t1;
  try { t1 = await tensionOf(a1); } catch (e) {
    setupFail([
      'get_local_tension threw on its first call.',
      'If the code looks right the conductor is probably on a STALE BUILD —',
      'rebuild both zomes, hc dna pack dna/ && hc app pack ., then clean the sandbox.',
      String(e?.message ?? e).slice(0, 300),
    ]);
  }
  const t2 = await tensionOf(a2);

  // === 1. CALLER-SCOPED, AND THERE IS NO WAY TO ASK OTHERWISE ===========
  log('--- 1. Whose state is this? ---');
  // THE INVARIANT 1 CHECK. The mutual-credit ledger was built, verified and
  // DELETED because `get_credit_balance` was a canonical per-agent scalar
  // over an enumerable agent set. This read cannot become that, because the
  // agent is not a parameter — it comes from `agent_info()`. If anybody ever
  // adds an `agent` field to the payload, these two checks are what notice.
  check('agent 1 is told its OWN identity as the observer',
    b64(t1.observer) === b64(a1.me));
  check('and agent 2 is told its own, from the same call with the same payload',
    b64(t2.observer) === b64(a2.me));
  check('so the two observers get DIFFERENT answers — the figure is not global',
    b64(t1.observer) !== b64(t2.observer));
  check('and each counts only its OWN claims as its own (3 vs 1)',
    t1.closure.own_claims_examined === 3 && t2.closure.own_claims_examined === 1);
  check('while both see the SAME shared domain, so this is a position in it rather than a private world',
    t1.closure.claims_examined === t2.closure.claims_examined && t1.closure.claims_examined >= 4);
  check('the domain is read off the resolved Membrane, not supplied as free text',
    t1.domain === DOMAIN);

  // === 2. READING WRITES NOTHING =========================================
  log('\n--- 2. Reading your own state writes nothing ---');
  const before = t1.chain_length;
  for (let i = 0; i < 5; i++) await tensionOf(a1);
  const after = (await tensionOf(a1)).chain_length;
  check('the DECLARATION says it writes nothing', t1.writes_nothing === true);
  check(`and the measured chain length is unchanged across 6 more reads (${before} -> ${after})`,
    before === after);
  check('so the declaration and the measurement agree', t1.writes_nothing === (before === after));

  // === 3. FRICTION HEADROOM IS DERIVED, NOT DECORATION ===================
  log('\n--- 3. Friction headroom moves when a rationed write happens ---');
  // THE MOST SENSITIVE CHECK IN THIS FILE. A figure that is merely reported
  // cannot be told apart from a constant; a figure that must fall by EXACTLY
  // ONE after exactly one write can only be right if it is really counted
  // off the chain. §6's Critique path is used because Critiques are rationed
  // (20 per rolling hour) and one write is cheap.
  const critBefore = frictionFor(await tensionOf(a1), 'Critique');
  if (!critBefore) setupFail(['No Critique row in the friction list — §6 paths are not being reported.']);
  const claimEntry = await (async () => {
    const rows = await a1.call('get_claims_by_domain', DOMAIN);
    const key = b64(a1Claims[0]);
    const row = rows.find((r) => b64(r.signed_action.hashed.hash) === key);
    return row?.signed_action?.hashed?.content?.data?.entry_hash ?? null;
  })();
  if (!claimEntry) setupFail(['Could not resolve the seeded claim to an EntryHash.']);
  await a1.call('create_critique', {
    target: claimEntry, target_type: 'Claim', critique_mode: 'Methodological',
    content: 'a critique written to move the friction figure', author: a1.me,
    timestamp: nowMicros(), replication_attempted: false, evidence_hashes: [], species: null,
  });
  const critAfter = frictionFor(await tensionOf(a1), 'Critique');
  log(`    Critique headroom ${critBefore.headroom} -> ${critAfter.headroom}  (recent ${critBefore.recent_count} -> ${critAfter.recent_count}, limit ${critAfter.limit})`);
  check('ONE critique written moved recent_count by exactly one',
    critAfter.recent_count === critBefore.recent_count + 1);
  check('and headroom fell by exactly one — the figure is counted, not constant',
    critAfter.headroom === critBefore.headroom - 1);
  check('headroom and limit still agree with each other',
    critAfter.headroom === critAfter.limit - critAfter.recent_count);
  // A caller testing `headroom > 0` and one testing `!blocked` must never
  // disagree, or two dispositions reading the same tension take different
  // actions for no reason.
  const t3 = await tensionOf(a1);
  check('every §6 path reports blocked if and only if headroom is zero',
    t3.friction.every((f) => f.blocked === (f.headroom === 0)));
  check('and all five rationed paths are present, so a disposition needs no second call',
    ['SynapticLink', 'Reinforcement', 'Critique', 'AntibodyPattern', 'AttestationGrant']
      .every((p) => frictionFor(t3, p) !== null));

  // === 4. THE CALLER'S HALF-LIFE IS ACTUALLY CONSULTED ===================
  log('\n--- 4. Conductance decay, and who promised the schedule ---');
  // NOT "does decay happen" — that would pass against a hardcoded default.
  // The question is whether the CALLER's promise changes the answer, which is
  // the whole of READINESS item 10: the reader supplying the half-life is the
  // promiser. create_critique above made a SynapticLink, so there is one.
  await sleep(2500); // so the link has a measurable age against a 1s half-life
  const slow = await tensionOf(a1, null);
  const fast = await tensionOf(a1, { min_effective_conductance: 0.0, half_life_secs: 1 });
  log(`    links ${slow.conductance.links_examined}, initial ${slow.conductance.total_initial.toFixed(4)}`);
  log(`    effective at the 30-day default: ${slow.conductance.total_effective.toFixed(4)}`);
  log(`    effective at a 1-second half-life: ${fast.conductance.total_effective.toFixed(4)}`);
  check('there is at least one SynapticLink to decay, so this section is not vacuous',
    slow.conductance.links_examined >= 1);
  check('the undecayed total is a property of the DHT and is the SAME under both policies',
    Math.abs(slow.conductance.total_initial - fast.conductance.total_initial) < 1e-6);
  check('A ONE-SECOND HALF-LIFE GIVES A STRICTLY SMALLER EFFECTIVE TOTAL — the caller\'s promise is consulted',
    fast.conductance.total_effective < slow.conductance.total_effective);
  check('the default is reported as NOT promised by the caller, because it is not',
    slow.conductance.half_life_promised_by_caller === false);
  check('and a supplied half-life is reported AS promised, with the value used',
    fast.conductance.half_life_promised_by_caller === true && fast.conductance.half_life_secs === 1);
  check('the default half-life is the compiled-in thirty days',
    Math.abs(slow.conductance.half_life_secs - 30 * 24 * 3600) < 1e-6);
  check('no link was silently dropped from the denominator',
    slow.conductance.links_unreadable === 0);

  // === 5. ORDERING AND CLOSURE AGREE WITH THEIR OWN PRIMITIVES ===========
  log('\n--- 5. The bundled figures are the primitives, not a second copy ---');
  // THE SHADOWING CHECK (READINESS item 5e). A tension read that disagreed
  // with the gate it predicts would actively mislead the disposition reading
  // it, so the bundled ordering figures are compared against a direct
  // `order_records` call over the same records.
  const ownInDomain = [...a1Claims];
  const direct = await a1.call('order_records', ownInDomain);
  check('the policy string is passed through from order_records unchanged',
    t3.ordering.policy === direct.policy && /causal-then-hash/.test(t3.ordering.policy));
  check('the bundled read ordered at least the claims it was given',
    t3.ordering.records_examined >= ownInDomain.length && t3.ordering.ordered === t3.ordering.records_examined);
  check('no cycle, as in any well-formed graph', t3.ordering.cycle_detected === false);
  check('tie_broken is reported, so a disposition knows how arbitrary the order it would settle on is',
    typeof t3.ordering.tie_broken === 'number');
  // The arithmetic that holds without a race — see the header on why this is
  // asserted instead of a cross-cache comparison.
  check('closure arithmetic closes: resolved + deficit == cited',
    t3.closure.resolved_locally + t3.closure.deficit === t3.closure.cited_total);
  check('and the citations were actually counted, so the identity is not 0 == 0',
    t3.closure.cited_total >= 10);
  check('critique targets that could not be resolved are COUNTED, not dropped silently',
    typeof t3.ordering.critique_targets_unresolved === 'number');

  // === 6. WHAT IT REFUSES TO BE ==========================================
  log('\n--- 6. It reports, and stops ---');
  // The Stage 3 boundary, asserted rather than left to good intentions. Item
  // 3.1 is a DECISION: a threshold turning a signal into a decision is itself
  // a promise and needs an agent behind it. If a later change adds a verdict
  // field, this is what notices.
  const forbidden = ['score', 'healthy', 'stale', 'threshold', 'verdict', 'rank', 'standing', 'atrophied'];
  const allKeys = JSON.stringify(t3).toLowerCase();
  const found = forbidden.filter((k) => allKeys.includes(`"${k}"`));
  check(`no verdict, score or threshold field anywhere in the response${found.length ? ` (found ${found.join(', ')})` : ''}`,
    found.length === 0);
  check('arc width is ABSENT rather than invented', t3.arc_width === null);
  check('and its absence carries the reason, naming what holds the figure instead',
    typeof t3.arc_width_absent_because === 'string'
      && /AgentInfo/.test(t3.arc_width_absent_because)
      && /admin/i.test(t3.arc_width_absent_because));
  check('the gap between what was planned and what was built is a NUMBER, not a paragraph (4 of 5)',
    t3.signals_bundled === 4 && t3.signals_intended === 5);
  check('the limits are stated for a caller with no access to the source comments',
    typeof t3.limits === 'string' && /never decides/i.test(t3.limits) && /Caller-scoped/i.test(t3.limits));
  check('the reader\'s own clock is reported, since no other clock is honest about "now" (§5.22)',
    typeof t3.at_secs === 'number' && Math.abs(t3.at_secs - nowSecs()) < 120);

  log('');
  if (failures === 0) {
    log('ALL CHECKS PASSED — an agent can read its own position, cannot read');
    log('anybody else\'s, writes nothing doing it, and decides nothing with it.');
  } else {
    log(`${failures} CHECK(S) FAILED`);
  }
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error('\nHARNESS ERROR:', e); process.exit(1); });
