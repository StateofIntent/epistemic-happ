#!/usr/bin/env node
// ============================================================================
// scripts/live-verify/attachment-links.mjs — SPEC §5.19's nine link rules,
// watched refusing real attempts.
//
// WHAT THESE RULES ARE. Entry validation in this protocol binds every
// entry's declared author to its authoring action (§5.2), and until
// protocol_version 5 nothing checked the LINK carrying an entry onto a
// node. So an agent could author a perfectly valid entry about their own
// claim and then file it against anybody's: the displayed attribution came
// from the entry, and the choice of what it was displayed ON came from the
// link. The sharpest case was a retraction — author one of your own claim,
// link it from somebody else's, and every reader of theirs is shown
// "Retracted by its author" for a withdrawal its author never made.
//
// TWO HALVES, and the first is not a formality. A rule that refused
// EVERYTHING would pass every refusal check in part 2 while breaking the
// protocol completely — and that is not a hypothetical here: four of the
// nine rules compare a link's base against an agent anchor derived
// independently in both crates (`agent_anchor_hash`, duplicated across
// dna/integrity and dna/coordinator because they share no library). If
// those two derivations ever disagree, every honest by-author link on the
// network is refused and part 2 still goes green. Part 1 is what makes
// part 2 mean anything.
//
//   1. THE HONEST PATHS STILL WORK. Eight reads, one per bound link type
//      (AgentToClaim, ClaimToRetraction, TargetToCritique,
//      TargetToAntibody, CritiqueToSpecies, AgentToConstitution,
//      AgentToMew, AgentToWorldlineTrace), each going through the link the
//      rule now constrains. RetractionToReplacement has no reader in the
//      tree — see the note at its probe.
//   2. THEY CANNOT BE FORGED. Twelve attempts through
//      attempt_false_attachment_link — the negative-path prober, same
//      pattern as attempt_false_domain_index — each observed being refused
//      by DHT VALIDATION rather than by a coordinator guard. A coordinator
//      check is a courtesy any custom client skips, and SPEC §11.1 records
//      that a modified coordinator stays on this network, so a refusal
//      that cannot be shown to come from validation has shown nothing.
//
// WHY A PROBER IS NEEDED AT ALL, which is this file's real subject. The
// three link types that were bound BEFORE §5.19 are exactly the three that
// had probers (attempt_false_domain_index, attempt_false_membrane_registry,
// attempt_unaccountable_membrane). The link types nobody probed were the
// link types nobody validated, and the coverage looked complete because
// every link type anybody had TRIED to forge was refused. A prober proves
// the rule it probes and silently flatters the rules it does not.
//
// Prereqs: scripts/sandbox.sh clean && scripts/sandbox.sh start, with a
// freshly packed .happ (scripts/pack-webhapp.sh). THE DNA HASH CHANGED at
// protocol_version 5 — the integrity zome gained rules and a link type —
// so a resumed sandbox holding version-4 data is a different network and
// will not do.
// ============================================================================
// ---------------------------------------------------------------------------
// NEGATIVE EVIDENCE — COLLECTED. This harness has been watched failing, on
// the rule it was written for, with the prediction recorded before the run.
//
// FIRST RUN, GREEN: run 38110651478, 2026-10-11, its first execution
// anywhere. ALL 35 CHECKS PASSED in 22 seconds — 8 honest reads, 12
// refusals with their 12 paired "refused by DHT validation, not a
// coordinator guard" assertions, and 3 unpoisoned reads. Part 1 is the
// result worth naming on its own: the four per-agent rules compare a base
// against an agent anchor derived independently in both crates, which share
// no library, and the two derivations agreed byte for byte at the first
// attempt.
//
// INJECTION, RED: run 38111598258, commit 3f90244 on a throwaway ref, the
// `retraction.target_claim != declared_claim` comparison deleted from the
// ClaimToRetraction branch and nothing else touched. **2 CHECK(S) FAILED,
// 34 checks total**, and WHICH two is the whole result:
//
//     FAIL: a retraction cannot be filed against a claim it does not name
//           — it SUCCEEDED, which means the link is forgeable
//     FAIL: claim B still carries no retraction
//
// Three things that result establishes, none of which the green run did.
//
//   THE PROBE TESTS ITS OWN RULE. One rule reverted, one probe red.
//
//   THE COUNT DROPS 35 -> 34, which is not cosmetic: expectRefusal's
//   success path emits a single FAIL and never reaches the paired
//   validation-source assertion, so a forgeable link produces ONE red line
//   and not two. Anyone reading this file for how many reds to expect
//   should take 34 and two, not 35 and two.
//
//   PART 3 EARNED ITS PLACE. "claim B still carries no retraction" went red
//   on its own, without being pointed at the injection — the forged link
//   succeeded, so get_retractions_for_claim answered with it. A harness
//   with only parts 1 and 2 would have caught this defect once; this one
//   caught it twice, from the write side and the read side.
//
// AND THE CONTROL HELD: "a third party cannot file somebody else's
// retraction at all" stayed GREEN through the injection, because the author
// binding below the reverted comparison still catches agent 2 filing agent
// 1's retraction. That probe tests a different rule, and the injection
// proves it rather than leaving it asserted.
//
// Re-check the same way if you change what this file asserts: revert one
// rule, watch exactly its own probe go red, restore, watch it return.
// ---------------------------------------------------------------------------

import { AdminWebsocket, AppWebsocket, CellType } from '@holochain/client';

const ADMIN_URL = 'ws://localhost:8889';
const APP_URL = 'ws://localhost:8888';
const AGENT1_APP_ID = 'epistemic-resonance-happ';
const AGENT2_APP_ID = 'epistemic-resonance-happ-attachlinks2';
const HAPP_PATH = new URL('../../epistemic-resonance-happ.happ', import.meta.url).pathname;
const DOMAIN = `AttachLinks${Date.now()}`;
const OTHER_DOMAIN = `${DOMAIN}Other`;

const b64 = (u8) => Buffer.from(u8).toString('base64');
const log = (...a) => console.log(...a);
let failures = 0;
const check = (label, cond) => {
  if (cond) log(`  PASS: ${label}`);
  else { log(`  FAIL: ${label}`); failures++; }
};

/** Same shape, and the same reason, as domain-index.mjs's own: a SETUP read
 * coming back empty is a real failure of the zome, and dereferencing [0] on
 * it dies naming this file's line number instead of the cause. */
const firstOrFail = (records, fn, expected) => {
  if (Array.isArray(records) && records.length > 0) return records[0];
  log(`\n  SETUP FAILED: ${fn} returned ${Array.isArray(records) ? '0 records' : String(records)}`);
  log(`  Expected ${expected}, published by this harness moments ago.`);
  log('  This is a real failure of the zome, not of the harness.');
  log('  If the code looks correct, the conductor is probably running a');
  log('  STALE BUILD: hc dna pack packages the wasm on disk rather than');
  log('  compiling it. Rebuild with scripts/pack-webhapp.sh, then');
  log('  scripts/sandbox.sh clean && scripts/sandbox.sh start.');
  process.exit(1);
};

async function connectApp(admin, appId) {
  const { token } = await admin.issueAppAuthenticationToken({ installed_app_id: appId });
  const app = await AppWebsocket.connect({ url: new URL(APP_URL), token, wsClientOptions: { origin: 'live-verify' } });
  const info = await app.appInfo();
  const cellIds = [];
  for (const roleCells of Object.values(info.cell_info)) {
    for (const cell of roleCells) {
      if (cell?.type === CellType.Provisioned || cell?.type === CellType.Cloned) {
        cellIds.push(cell.value.cell_id);
      }
    }
  }
  if (cellIds.length === 0) throw new Error(`App "${appId}" has no provisioned or cloned cells.`);
  for (const cellId of cellIds) await admin.authorizeSigningCredentials(cellId);
  const call = (fn, payload) =>
    app.callZome({ role_name: 'epistemic', zome_name: 'epistemic_coordinator', fn_name: fn, payload });
  return { me: cellIds[0][1], call };
}

const nowMicros = () => Date.now() * 1000;
const nowSecs = () => Math.floor(Date.now() / 1000);
const entryHashOf = (record) => record.signed_action.hashed.content.data.entry_hash;

/** Runs `fn`, expecting it to be REFUSED, and asserts the refusal came from
 * validation rather than a coordinator guard — the distinction the whole
 * file turns on. Two checks per call, which is why this harness is cited
 * without a count: the gate counts call sites, and these fire per attempt.
 */
async function expectRefusal(label, fn) {
  try {
    await fn();
    check(`${label} — it SUCCEEDED, which means the link is forgeable`, false);
    return null;
  } catch (e) {
    const msg = String(e?.message ?? e);
    check(label, true);
    check(`  ...refused by DHT validation, not a coordinator guard [${label}]`,
      /InvalidCommit|Validation failed/i.test(msg));
    return msg;
  }
}

async function main() {
  const admin = await AdminWebsocket.connect({ url: new URL(ADMIN_URL), wsClientOptions: { origin: 'live-verify' } });
  const agent1 = await connectApp(admin, AGENT1_APP_ID);
  log(`agent1 = ${b64(agent1.me).slice(0, 12)}…`);

  const apps = await admin.listApps({});
  if (!apps.some((a) => a.installed_app_id === AGENT2_APP_ID)) {
    log('Installing agent 2 on the same conductor ...');
    const agent2Pub = await admin.generateAgentPubKey();
    await admin.installApp({
      source: { type: 'path', value: HAPP_PATH },
      agent_key: agent2Pub,
      installed_app_id: AGENT2_APP_ID,
    });
    await admin.enableApp({ installed_app_id: AGENT2_APP_ID });
  }
  const agent2 = await connectApp(admin, AGENT2_APP_ID);
  log(`agent2 = ${b64(agent2.me).slice(0, 12)}…\n`);

  const claimOf = (author, domain, content) => ({
    content, domain, confidence: 'Moderate', semantic_tags: [],
    author, timestamp: nowMicros(), evidence_hashes: [], attestation_policy: null,
    source_mew: null,
  });

  // ---- Setup: every entity the nine rules bind -------------------------
  log('Seeding the entries whose links these rules constrain ...');

  await agent1.call('create_claim', claimOf(agent1.me, DOMAIN, 'Loaded carries reduce recurrence.'));
  await agent2.call('create_claim', claimOf(agent2.me, DOMAIN, 'Rest alone is sufficient.'));
  await new Promise((r) => setTimeout(r, 8000));

  const inDomain = await agent1.call('get_claims_by_domain', DOMAIN);
  firstOrFail(inDomain, 'get_claims_by_domain', "the two claims this harness just published");
  const claimA = inDomain.find((r) => b64(r.signed_action.hashed.content.header.author) === b64(agent1.me));
  const claimB = inDomain.find((r) => b64(r.signed_action.hashed.content.header.author) === b64(agent2.me));
  if (!claimA || !claimB) {
    log('\n  SETUP FAILED: both agents\' claims must be visible before the probes run.');
    log(`  Found ${inDomain.length} claim(s) in ${DOMAIN}; needed one from each agent.`);
    process.exit(1);
  }
  const claimAHash = entryHashOf(claimA);
  const claimBHash = entryHashOf(claimB);

  // Agent 1 retracts its OWN claim. This is the valid act the forgery
  // re-points: validate_retraction requires exactly this and nothing more.
  const retractionA = await agent1.call('create_retraction', {
    target_claim: claimAHash,
    reason: 'Superseded by a larger cohort.',
    replacement_claim: null,
    author: agent1.me,
    timestamp: nowSecs(),
  });

  // Agent 1 critiques agent 2's claim — the ordinary case, one agent
  // cross-checking another.
  const critiqueOfB = await agent1.call('create_critique', {
    target: claimBHash, target_type: 'Claim', critique_mode: 'Methodological',
    content: 'No control arm is reported.', author: agent1.me,
    timestamp: nowMicros(), replication_attempted: false,
    evidence_hashes: [], species: null,
  });

  const patternOnA = await agent1.call('publish_antibody_pattern', {
    target: claimAHash, target_type: 'Claim', kind: 'SpamFlood',
    rationale: 'Seeded flag, re-pointed by the probe below.',
    author: agent1.me, timestamp: nowSecs(),
  });

  const constitutionA = await agent1.call('publish_constitution', {
    agent: agent1.me,
    promises: [{ action: 'distinguish_observation_from_inference', domain: DOMAIN, modality: 'Methodological' }],
    conditions: [], published_at: nowMicros(), expires_at: null,
  });

  const mewA = await agent1.call('create_mew', {
    content: 'Raw stimulus, pre-transduction.',
    author: agent1.me, timestamp: nowSecs(),
    reply_to: null, semantic_tags: [], linked_claim: null,
  });

  const traceA = await agent1.call('generate_worldline_trace', {
    period_granularity_secs: 3600, expertise_tags: [], expires_at: null,
  });

  // Two species, so the CritiqueToSpecies probe has a real wrong base
  // rather than an unresolvable hash — the same sharpening domain-index
  // applies when it probes with a Constitution instead of a random hash.
  await agent1.call('create_critique_species', {
    name: `Species${Date.now()}A`, parent_species: null, required_evidence: [],
    proposer: agent1.me, created_at: nowMicros(),
  });
  await agent1.call('create_critique_species', {
    name: `Species${Date.now()}B`, parent_species: null, required_evidence: [],
    proposer: agent1.me, created_at: nowMicros(),
  });
  await new Promise((r) => setTimeout(r, 5000));

  const allSpecies = await agent1.call('get_all_critique_species', null);
  if (!Array.isArray(allSpecies) || allSpecies.length < 2) {
    log(`\n  SETUP FAILED: get_all_critique_species returned ${Array.isArray(allSpecies) ? allSpecies.length : String(allSpecies)}; needed 2.`);
    process.exit(1);
  }
  const speciesOne = entryHashOf(allSpecies[0]);
  const speciesTwo = entryHashOf(allSpecies[1]);

  // A critique that declares speciesOne. Its CritiqueToSpecies link is
  // what the adoption count counts.
  const adoptingCritique = await agent2.call('create_critique', {
    target: claimAHash, target_type: 'Claim', critique_mode: 'Methodological',
    content: 'Sample size is not reported.', author: agent2.me,
    timestamp: nowMicros(), replication_attempted: false,
    evidence_hashes: [], species: speciesOne,
  });

  log('Waiting for gossip ...\n');
  await new Promise((r) => setTimeout(r, 8000));

  // ---- 1. The honest paths still work ---------------------------------
  // Each read below traverses exactly one of the links §5.19 now
  // constrains. A rule that over-refused would break these while leaving
  // every probe in part 2 green.
  log('=== 1. Every bound link still carries its own honest read ===');

  const byAuthor = await agent2.call('get_claims_by_agent', agent1.me);
  check('AgentToClaim: agent 1\'s claim is readable through its by-author index',
    Array.isArray(byAuthor) && byAuthor.length === 1);

  const retractions = await agent2.call('get_retractions_for_claim', claimAHash);
  check('ClaimToRetraction: the author\'s own retraction reaches their claim',
    Array.isArray(retractions) && retractions.length === 1);

  const critiquesOfB = await agent2.call('get_critiques_for', claimBHash);
  check('TargetToCritique: a critique of claim B is found under claim B',
    Array.isArray(critiquesOfB) && critiquesOfB.length === 1);

  const flagsOnA = await agent2.call('get_antibody_patterns_for', claimAHash);
  check('TargetToAntibody: the flag on claim A is found under claim A',
    Array.isArray(flagsOnA) && flagsOnA.length === 1);

  const adoption = await agent1.call('get_critique_species_adoption_count', speciesOne);
  check('CritiqueToSpecies: the adopting critique counts toward its declared species',
    adoption === 1);

  const constitutionSeen = await agent2.call('get_agent_constitution', agent1.me);
  check('AgentToConstitution: agent 1\'s constitution is readable by agent 2',
    constitutionSeen !== null && constitutionSeen !== undefined);

  const mewsSeen = await agent2.call('get_mews_by_agent', agent1.me);
  check('AgentToMew: agent 1\'s mew is readable through its by-author index',
    Array.isArray(mewsSeen) && mewsSeen.length === 1);

  const traceSeen = await agent2.call('get_agent_worldline_trace', agent1.me);
  check('AgentToWorldlineTrace: agent 1\'s trace is readable by agent 2',
    traceSeen !== null && traceSeen !== undefined);

  // ---- 2. They cannot be forged ---------------------------------------
  log('\n=== 2. Each link refuses a base the entry does not name ===');

  // THE HEADLINE. Agent 1's retraction of its own claim, filed against
  // agent 2's claim. If this succeeds, every reader of claim B is shown
  // "Retracted by its author" — a false statement about agent 2's
  // position, which is what Invariant #2 exists to prevent.
  await expectRefusal(
    'a retraction cannot be filed against a claim it does not name',
    () => agent1.call('attempt_false_attachment_link', {
      kind: 'ClaimToRetraction', base: claimBHash, target: retractionA,
      tag: null, anchor_of: null,
    }),
  );

  await expectRefusal(
    'a third party cannot file somebody else\'s retraction at all',
    () => agent2.call('attempt_false_attachment_link', {
      kind: 'ClaimToRetraction', base: claimAHash, target: retractionA,
      tag: null, anchor_of: null,
    }),
  );

  // RetractionToReplacement has no reader in the tree, which is the reason
  // to bind it before it acquires one: an unvalidated link type gets its
  // first reader long after the commit that could have constrained it, and
  // that reader cannot tell the difference. The retraction seeded above
  // names NO replacement, so any link of this type over it is invalid.
  await expectRefusal(
    'a retraction naming no replacement cannot be linked to one',
    () => agent1.call('attempt_false_attachment_link', {
      kind: 'RetractionToReplacement', base: retractionA, target: claimBHash,
      tag: null, anchor_of: null,
    }),
  );

  await expectRefusal(
    'a critique cannot be filed against a node it does not name',
    () => agent1.call('attempt_false_attachment_link', {
      kind: 'TargetToCritique', base: claimAHash, target: critiqueOfB,
      tag: null, anchor_of: null,
    }),
  );

  // The discourse-health consequence specifically: this is the write that
  // moved get_discourse_health without authoring a critique, so a third
  // party doing it is the metric-manipulation case rather than a
  // misattribution one.
  await expectRefusal(
    'a third party cannot hang an existing critique off another claim',
    () => agent2.call('attempt_false_attachment_link', {
      kind: 'TargetToCritique', base: claimBHash, target: critiqueOfB,
      tag: null, anchor_of: null,
    }),
  );

  await expectRefusal(
    'an antibody flag cannot be re-pointed at a claim it never flagged',
    () => agent1.call('attempt_false_attachment_link', {
      kind: 'TargetToAntibody', base: claimBHash, target: patternOnA,
      tag: null, anchor_of: null,
    }),
  );

  await expectRefusal(
    'a claim cannot be indexed under another agent\'s by-author anchor',
    () => agent1.call('attempt_false_attachment_link', {
      kind: 'AgentToClaim', base: claimAHash, target: claimA.signed_action.hashed.hash,
      tag: Buffer.from(DOMAIN, 'utf8'), anchor_of: agent2.me,
    }),
  );

  // The tag rule, which has no analogue in the other eight: a by-agent
  // reader has nothing but this tag to tell it which domain a claim
  // belongs to, so an unchecked tag is free text about somebody else's
  // claim read as that claim's domain.
  await expectRefusal(
    'the by-author tag cannot claim a domain the claim does not declare',
    () => agent1.call('attempt_false_attachment_link', {
      kind: 'AgentToClaim', base: claimAHash, target: claimA.signed_action.hashed.hash,
      tag: Buffer.from(OTHER_DOMAIN, 'utf8'), anchor_of: agent1.me,
    }),
  );

  // The one with a number behind it. get_critique_species_adoption_count
  // counts these links, so a forgeable one makes the count the
  // self-declared adoption_count field it replaced, with extra steps.
  await expectRefusal(
    'an adoption cannot be counted toward a species the critique does not declare',
    () => agent2.call('attempt_false_attachment_link', {
      kind: 'CritiqueToSpecies', base: speciesTwo, target: adoptingCritique,
      tag: null, anchor_of: null,
    }),
  );

  await expectRefusal(
    'a constitution cannot be filed under another agent\'s anchor',
    () => agent1.call('attempt_false_attachment_link', {
      kind: 'AgentToConstitution', base: claimAHash, target: constitutionA,
      tag: null, anchor_of: agent2.me,
    }),
  );

  await expectRefusal(
    'a worldline trace cannot be filed under another agent\'s anchor',
    () => agent1.call('attempt_false_attachment_link', {
      kind: 'AgentToWorldlineTrace', base: claimAHash, target: traceA,
      tag: null, anchor_of: agent2.me,
    }),
  );

  await expectRefusal(
    'a mew cannot be filed under another agent\'s anchor',
    () => agent1.call('attempt_false_attachment_link', {
      kind: 'AgentToMew', base: claimAHash, target: mewA,
      tag: null, anchor_of: agent2.me,
    }),
  );

  // ---- 3. Nothing was poisoned on the way through ---------------------
  // Twelve refused writes should leave every read exactly as part 1 found
  // it. A rule that refused the write and let the link through anyway
  // would pass part 2 and fail here.
  log('\n=== 3. The reads are unchanged after twelve refused writes ===');

  const retractionsAfter = await agent2.call('get_retractions_for_claim', claimBHash);
  check('claim B still carries no retraction',
    Array.isArray(retractionsAfter) && retractionsAfter.length === 0);

  const byAuthor2After = await agent1.call('get_claims_by_agent', agent2.me);
  check('agent 2\'s by-author index still holds only its own claim',
    Array.isArray(byAuthor2After) && byAuthor2After.length === 1);

  const adoptionAfter = await agent1.call('get_critique_species_adoption_count', speciesTwo);
  check('the second species still has an adoption count of zero', adoptionAfter === 0);

  log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  log(`\nHARNESS ERROR: ${e?.message ?? e}`);
  process.exit(1);
});
