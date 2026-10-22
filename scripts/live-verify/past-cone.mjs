#!/usr/bin/env node
// ============================================================================
// scripts/live-verify/past-cone.mjs — WHAT AN AUTHOR HAD SEEN, RETAINED SO IT
// CAN BE ASKED ABOUT LATER.
//
// Light Cone Consistency (arXiv 2605.09114) states the bound this implements:
// "a system can tell its order inverted causality only if it retained exactly
// what would have prevented the inversion." Detection requires retention.
// `which_entries_resolve_locally` already answered *can I see X now?*; nothing
// answered *had this author seen X when they wrote?*, and no amount of later
// analysis can recover it. So `Critique.past_cone` records it at write time.
//
// THIS COST A `protocol_version` BUMP — 9 to 10 — and it is the only thing in
// this sequence that did. A field on an entry type is an integrity-zome change,
// which is a DNA hash change, which is a different network. Taken while nobody
// had installed the hApp, when a fork costs nothing.
//
// ---------------------------------------------------------------------------
// WHAT VALIDATION CAN AND CANNOT ENFORCE, which is the security argument and
// the reason §3 exists at all.
//
// It CANNOT check that the author really saw these. No rule can: the field is
// author-supplied and validation has no view of anybody's screen. This is the
// same shape as READINESS item 14's `reveal_deadline`, enforced against a
// timestamp the author writes — measured forgeable, permanently, and frozen as
// a documented limit rather than pretended away. Saying "the cone proves what
// was seen" would be the mechanism-that-reads-as-enforcement failure this
// repository keeps finding.
//
// What it CAN do is make claimed IGNORANCE sticky, which is the direction an
// attacker actually wants — over-claiming (listing things you never read) is
// harmless, under-claiming is how you pretend you never saw the rebuttal.
// Three rules, all deterministically checkable:
//
//   1. Every member resolves to a valid record, and is a Critique.
//   2. Every member critiques the SAME target. A cone ranging over the DHT
//      would be unbounded and would say nothing about this argument.
//   3. TRANSITIVE CLOSURE — every member's own cone is a subset of this one.
//      Admitting X means admitting everything X admitted. This is the rule
//      that turns selective ignorance into a refused write.
//
// §3 injects an under-claiming attack against rule 3 and requires the DHT to
// refuse it. §4 asserts the honest limit in the other direction, so nobody
// reads §3 as proof of more than it shows.
// ---------------------------------------------------------------------------
// AND THE QUERY REFUSES TO CONFLATE SILENCE WITH IGNORANCE. `cone_recorded`
// is false when nothing was recorded, and §5 requires the report to say so:
// an author whose client does not populate cones is silent, not uninformed,
// and reporting that as "had not seen" would manufacture a finding out of a
// missing feature. Every existing caller of `create_critique` is in exactly
// that position — the field is `#[serde(default)]` precisely so they keep
// working — so this is the common case, not an edge one.
// ---------------------------------------------------------------------------
// NEGATIVE EVIDENCE — recorded in READINESS once measured.
//
//   BR: the transitive-closure rule removed. 1 red, and it is the strongest
//   form — §3's under-claiming attack **COMMITS**: `refusal: NONE — it
//   committed`. An author successfully records having read the rebuttal while
//   denying the objection it answered. Nothing else in the validator catches
//   it, so that rule is solely load-bearing.
//
//   BS: the same-target rule removed. 1 red in §2 — and note WHAT the write
//   is then stopped by: the transitive-closure rule, because the unrelated
//   critique's own cone is not a subset. The two rules overlap, which is why
//   §2 asserts the message and not merely that something refused.
//
//   BT: `cone_recorded` hardcoded true. 2 reds in §5 — the silent critique
//   reports `cone_recorded=true` and the note stops distinguishing silence
//   from ignorance, which is the one reading this query exists to prevent.
//
// Prereqs: a sandbox conductor and a built .happ at PROTOCOL_VERSION 10.
// Two agents: the interesting case is one author answering another's critique
// while the argument is still moving.
// ============================================================================

import { AdminWebsocket, AppWebsocket, CellType } from '@holochain/client';

const ADMIN_URL = 'ws://localhost:8889';
const APP_URL = 'ws://localhost:8888';
const APP_ID = 'epistemic-resonance-happ';
const AGENT2_APP_ID = 'epistemic-resonance-happ-agent2';
const HAPP_PATH = new URL('../../epistemic-resonance-happ.happ', import.meta.url).pathname;
const DOMAIN = `Cone${Date.now()}`;

const log = (...a) => console.log(...a);
let failures = 0;
const check = (label, cond) => {
  if (cond) log(`  PASS: ${label}`);
  else { log(`  FAIL: ${label}`); failures++; }
};
const b64 = (u8) => Buffer.from(u8).toString('base64');
const nowMicros = () => Date.now() * 1000;

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

const refusal = async (agent, fn, payload) => {
  try { await agent.call(fn, payload); return null; }
  catch (e) { return String(e?.message ?? e); }
};

async function main() {
  log('=== THE PAST CONE: retention, so detection is possible ===\n');
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

  // The protocol version is the fork, so it is asserted rather than assumed.
  // Two fields, not one, and the pair is the point: `declared_version` comes
  // from the DNA properties (inside the DNA hash, so the network cannot
  // disagree about it) and `implemented_version` from the integrity zome's own
  // constant. Asserting both catches a bump applied to one and not the other.
  //
  // AT OR AFTER 10, NOT EQUAL TO 10, and the reason is this harness going red
  // on the very next bump that was not about it: `past_cone` arrived at 10 and
  // settlement took the network to 11 the following day, so an equality check
  // asserted the date of a fork rather than the presence of a field. The claim
  // this file is entitled to make is that the bump HAPPENED — a network at 9
  // has no such field — and that the two numbers agree with each other.
  const CONE_VERSION = 10;
  const identity = await a1.call('get_protocol_version', null);
  check(`this network DECLARES protocol version ${CONE_VERSION} or later — the bump this field cost`,
    Number.isInteger(identity?.declared_version) && identity.declared_version >= CONE_VERSION);
  check('and the integrity zome IMPLEMENTS what the DNA declares, so the declaration is not stale',
    identity?.implemented_version === identity?.declared_version);

  // --- The argument: a claim, a critique of it, a rebuttal of that -------
  const claimAction = await a1.call('create_claim', {
    content: 'the claim under argument', domain: DOMAIN, author: a1.me,
    timestamp: nowMicros(), evidence_hashes: [], confidence: 'Moderate',
    semantic_tags: [], source_mew: null,
  });
  const claims = await a1.call('get_claims_by_domain', DOMAIN);
  const target = claims[0].signed_action.hashed.content.data.entry_hash;

  const critique = (agent, content, past_cone) => agent.call('create_critique', {
    target, target_type: 'Claim', critique_mode: 'Methodological', content,
    author: agent.me, timestamp: nowMicros(), replication_attempted: false,
    evidence_hashes: [], species: null, past_cone,
  });

  // === 1. A cone is recorded, and an empty one is legal =================
  log('--- 1. Recording a cone, and recording nothing ---');
  const first = await critique(a2, 'the original objection', []);
  check('a critique with an EMPTY cone commits — every existing caller is in this position',
    first != null);
  const second = await critique(a1, 'a rebuttal, having read the objection', [first]);
  check('a critique recording what it had seen commits',
    second != null);

  // === 2. The cone must be about THIS argument ==========================
  log('\n--- 2. A cone records what was seen OF THIS NODE ---');
  const otherClaim = await a1.call('create_claim', {
    content: 'an unrelated claim', domain: DOMAIN, author: a1.me, timestamp: nowMicros(),
    evidence_hashes: [], confidence: 'Moderate', semantic_tags: [], source_mew: null,
  });
  const otherTargetRows = await a1.call('get_claims_by_domain', DOMAIN);
  const otherTarget = otherTargetRows.find((r) =>
    b64(r.signed_action.hashed.hash) === b64(otherClaim))?.signed_action?.hashed?.content?.data?.entry_hash;
  const elsewhere = await a2.call('create_critique', {
    target: otherTarget, target_type: 'Claim', critique_mode: 'Logical',
    content: 'a critique of something else entirely', author: a2.me,
    timestamp: nowMicros(), replication_attempted: false, evidence_hashes: [],
    species: null, past_cone: [],
  });
  const crossErr = await refusal(a1, 'create_critique', {
    target, target_type: 'Claim', critique_mode: 'Methodological',
    content: 'claims to have seen a critique of a different node',
    author: a1.me, timestamp: nowMicros(), replication_attempted: false,
    evidence_hashes: [], species: null, past_cone: [elsewhere],
  });
  check('a cone naming a critique of a DIFFERENT target is REFUSED',
    crossErr !== null && /different target/i.test(crossErr));

  const danglingErr = await refusal(a1, 'create_critique', {
    target, target_type: 'Claim', critique_mode: 'Methodological',
    content: 'claims to have seen something that does not exist',
    author: a1.me, timestamp: nowMicros(), replication_attempted: false,
    evidence_hashes: [], species: null,
    past_cone: [new Uint8Array([0x84, 0x29, 0x24, ...Array(36).fill(5)])],
  });
  check('a cone naming a record that does not resolve is REFUSED or deferred',
    danglingErr !== null);

  // === 3. THE ATTACK: selective ignorance ==============================
  // The rule that carries this whole feature. agent2 has read the rebuttal
  // (`second`), which itself recorded having read the original objection
  // (`first`). agent2 now writes a critique admitting the rebuttal while
  // DENYING the objection — "I never saw the thing you were answering".
  // Transitive closure refuses it: admitting X means admitting what X
  // admitted.
  log('\n--- 3. THE ATTACK: admitting one record while denying what it admitted ---');
  const underclaimErr = await refusal(a2, 'create_critique', {
    target, target_type: 'Claim', critique_mode: 'Logical',
    content: 'I read your rebuttal but never saw the objection it answered',
    author: a2.me, timestamp: nowMicros(), replication_attempted: false,
    evidence_hashes: [], species: null,
    past_cone: [second], // `second`'s own cone contains `first`, omitted here
  });
  log(`    refusal: ${underclaimErr ? underclaimErr.replace(/\s+/g, ' ').slice(0, 150) : 'NONE — it committed'}`);
  check('SELECTIVE IGNORANCE IS REFUSED BY VALIDATION — the transitive closure rule',
    underclaimErr !== null && /transitively closed/i.test(underclaimErr));

  const honest = await critique(a2, 'answering the rebuttal, admitting the whole thread', [second, first]);
  check('and the HONEST version of the same critique — admitting both — commits',
    honest != null);

  // === 4. THE HONEST LIMIT, asserted so §3 is not over-read =============
  // Over-claiming is possible and is not a defect. An author may list things
  // they never read; no rule can tell. What the rules bound is the direction
  // that lets somebody pretend they never saw the answer.
  log('\n--- 4. What the rules do NOT claim ---');
  const overclaim = await critique(a1, 'listing everything, read or not', [first, second, honest]);
  check('OVER-CLAIMING COMMITS — validation cannot check that an author really read these',
    overclaim != null);
  log('    (that is the stated limit, not a gap: the field is author-supplied and');
  log('     validation has no view of anybody\'s screen. Same shape as item 14.)');

  // === 5. THE QUERY, AND WHAT IT REFUSES TO SAY ========================
  log('\n--- 5. "Made without seeing", and silence that is not ignorance ---');
  const reportHonest = await a1.call('critiques_unseen_by', honest);
  log(`    honest critique: seen=${reportHonest.seen_count} of ${reportHonest.total_known} known, cone_recorded=${reportHonest.cone_recorded}`);
  check('a critique that recorded a cone reports cone_recorded TRUE',
    reportHonest.cone_recorded === true);
  check('and its seen_count matches what it actually recorded',
    reportHonest.seen_count === 2);

  const reportSilent = await a1.call('critiques_unseen_by', first);
  log(`    silent critique: unseen=${reportSilent.unseen.length}, cone_recorded=${reportSilent.cone_recorded}`);
  check('A CRITIQUE THAT RECORDED NOTHING REPORTS cone_recorded FALSE — silence, not ignorance',
    reportSilent.cone_recorded === false);
  // Matched on substance rather than a phrase: the note must say both that
  // nothing here evidences ignorance AND that silence is the reason, because
  // either half alone could be read as the opposite.
  check('and the note says so in words, so a reader cannot miss it',
    typeof reportSilent.note === 'string'
    && /evidence of ignorance/i.test(reportSilent.note)
    && /silent, not uninformed/i.test(reportSilent.note));
  check('the denominator is published, so the figures can be checked rather than trusted',
    typeof reportSilent.total_known === 'number' && reportSilent.total_known >= 1);
  // The actual detection: the first critique could not have seen the later
  // ones, and the report names them.
  check('THE LATER CRITIQUES ARE NAMED AS UNSEEN BY THE FIRST — the detection this exists for',
    reportSilent.unseen.some((h) => b64(h) === b64(honest)));

  log('');
  if (failures === 0) {
    log('ALL CHECKS PASSED — a cone is retained, selective ignorance is refused,');
    log('over-claiming is admitted as unpreventable, and silence is not reported');
    log('as ignorance.');
  } else {
    log(`${failures} CHECK(S) FAILED`);
  }
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error('\nHARNESS ERROR:', e); process.exit(1); });
