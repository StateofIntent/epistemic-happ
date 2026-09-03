#!/usr/bin/env node
// ============================================================================
// scripts/live-verify/domain-index.mjs — the by-domain index works, and
// cannot be poisoned.
//
// This is the fix for what read-scope.mjs proved: get_claims_by_domain
// was a source-chain query, so browsing a domain returned only your own
// claims. It is now a DHT read over DomainToClaim links hung from a
// domain anchor.
//
// TWO HALVES, and the second matters as much as the first. An index is
// only worth reading if a false entry cannot be written into it — a
// working index that anyone can stuff with arbitrary links is not an
// improvement over no index, it is a worse one, because it looks
// authoritative.
//
//   1. IT WORKS ACROSS AGENTS. Agent 2 sees agent 1's claim through
//      get_claims_by_domain — the exact read that returned 0 before.
//      Checked against read-scope.mjs's own controls so the comparison
//      is like for like.
//   2. IT CANNOT BE POISONED. Three refusals, each attempted for real
//      through attempt_false_domain_index (the negative-path prober,
//      same pattern as attempt_unaccountable_membrane) and each observed
//      being refused by DHT VALIDATION, not by a coordinator guard:
//        a. a claim filed under a domain it does not declare
//        b. someone else's claim filed under its correct domain
//        c. a non-Claim target filed into the index
//
// Prereqs: scripts/sandbox.sh clean && scripts/sandbox.sh start, with a
// freshly packed .happ (hc dna pack dna/ && hc app pack .). The DNA hash
// CHANGES with this fix — the integrity zome gained a link type — so a
// resumed sandbox holding pre-fix data is a different network and will
// not do.
// ============================================================================
// ---------------------------------------------------------------------------
// NEGATIVE EVIDENCE — this harness has been watched failing.
//
// This directory's own rule is that a harness which has only ever been
// green has not been shown to test anything. Recorded here, rather than
// only in a merged PR, so it is readable at the point someone runs this
// file.
//
//   Regression injected: the same EntryHash::try_from revert.
//   Result: three named FAILs — agent 2 sees 0 claims where it must see 2 (PR #53).
//
// Re-check it the same way if you change what this file asserts: inject,
// watch it go red, restore, watch it go green.
// ---------------------------------------------------------------------------

import { AdminWebsocket, AppWebsocket, CellType } from '@holochain/client';

const ADMIN_URL = 'ws://localhost:8889';
const APP_URL = 'ws://localhost:8888';
const AGENT1_APP_ID = 'epistemic-resonance-happ';
const AGENT2_APP_ID = 'epistemic-resonance-happ-domainidx2';
const HAPP_PATH = new URL('../../epistemic-resonance-happ.happ', import.meta.url).pathname;
const DOMAIN = `DomainIdx${Date.now()}`;
const OTHER_DOMAIN = `${DOMAIN}Other`;

const b64 = (u8) => Buffer.from(u8).toString('base64');
const log = (...a) => console.log(...a);
let failures = 0;
const check = (label, cond) => {
  if (cond) log(`  PASS: ${label}`);
  else { log(`  FAIL: ${label}`); failures++; }
};

// A SETUP read coming back empty is the regression itself, not a bug in
// this harness — but dereferencing [0] on it dies with "Cannot read
// properties of undefined (reading 'signed_action')", which names this
// file's line number and says nothing about the zome that returned
// nothing. Observed for real while proving this suite catches
// regressions: a deliberately broken get_claims_by_domain made both this
// file and domain-index.mjs crash exactly that way. The detection was
// sound; the diagnosis was useless, which is the opaque-failure mode
// this directory's README argues against.
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
      if (CellType.Provisioned in cell) cellIds.push(cell[CellType.Provisioned].cell_id);
      else if (CellType.Cloned in cell) cellIds.push(cell[CellType.Cloned].cell_id);
    }
  }
  if (cellIds.length === 0) throw new Error(`App "${appId}" has no provisioned or cloned cells.`);
  for (const cellId of cellIds) await admin.authorizeSigningCredentials(cellId);
  const call = (fn, payload) =>
    app.callZome({ role_name: 'epistemic', zome_name: 'epistemic_coordinator', fn_name: fn, payload });
  return { me: cellIds[0][1], call };
}

const nowMicros = () => Date.now() * 1000;

/** Runs `fn`, expecting it to be REFUSED. Returns the error text.
 * A refusal that came from validation rather than a coordinator guard
 * says so in its message ("InvalidCommit"/"Validation failed"), which is
 * the distinction this whole harness turns on — a coordinator check is a
 * courtesy any custom client skips. */
async function expectRefusal(label, fn) {
  try {
    await fn();
    log(`  FAIL: ${label} — it SUCCEEDED, which means the index is poisonable`);
    failures++;
    return null;
  } catch (e) {
    const msg = String(e?.message ?? e);
    log(`  PASS: ${label}`);
    const byValidation = /InvalidCommit|Validation failed/i.test(msg);
    check(`  ...refused by DHT validation, not a coordinator guard [${label}]`, byValidation);
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
      path: HAPP_PATH, agent_key: agent2Pub,
      installed_app_id: AGENT2_APP_ID, membrane_proofs: {},
    });
    await admin.enableApp({ installed_app_id: AGENT2_APP_ID });
  }
  const agent2 = await connectApp(admin, AGENT2_APP_ID);
  log(`agent2 = ${b64(agent2.me).slice(0, 12)}…\n`);

  const claimOf = (author, domain, content) => ({
    content, domain, confidence: 'Moderate', semantic_tags: [],
    author, timestamp: nowMicros(), evidence_hashes: [], attestation_policy: null,
  });

  log(`Agent 1 publishes one claim in ${DOMAIN} ...`);
  const a1ClaimAction = await agent1.call('create_claim',
    claimOf(agent1.me, DOMAIN, 'Loaded carries reduce recurrence.'));

  log(`Agent 2 publishes one claim in the same domain ...`);
  await agent2.call('create_claim',
    claimOf(agent2.me, DOMAIN, 'Rest alone is sufficient.'));

  log('Waiting for gossip ...\n');
  await new Promise((r) => setTimeout(r, 8000));

  // ---- 1. It works across agents --------------------------------------
  log('=== 1. Browsing a domain now sees every agent\'s claims ===');

  const seenByA2 = await agent2.call('get_claims_by_domain', DOMAIN);
  log(`  agent2 get_claims_by_domain -> ${seenByA2.length}`);
  check('agent 2 sees BOTH claims, its own and agent 1\'s', seenByA2.length === 2);

  const seenByA1 = await agent1.call('get_claims_by_domain', DOMAIN);
  log(`  agent1 get_claims_by_domain -> ${seenByA1.length}`);
  check('agent 1 sees both too — the fix is symmetric', seenByA1.length === 2);

  // The specific regression read-scope.mjs recorded: agent 2 could not
  // see agent 1's claim at all. Named explicitly so the comparison is
  // unmistakable rather than implied by a count.
  const authorsSeenByA2 = seenByA2.map((r) => b64(r.signed_action.hashed.content.author));
  check('agent 1\'s claim is specifically among what agent 2 can see',
    authorsSeenByA2.includes(b64(agent1.me)));

  // A domain nobody has published into is empty, not an error — the
  // anchor simply has no links. Worth checking because a link read over a
  // never-created anchor is exactly where a naive implementation throws.
  const empty = await agent2.call('get_claims_by_domain', `${DOMAIN}Nonexistent`);
  check('an unused domain reads as empty rather than erroring', empty.length === 0);

  // ---- 2. It cannot be poisoned ---------------------------------------
  log('\n=== 2. The index refuses false entries ===');

  await expectRefusal(
    'a claim cannot be indexed under a domain it does not declare',
    () => agent1.call('attempt_false_domain_index', {
      claim_action: a1ClaimAction, domain: OTHER_DOMAIN,
    }),
  );

  await expectRefusal(
    'one agent cannot index another agent\'s claim',
    () => agent2.call('attempt_false_domain_index', {
      claim_action: a1ClaimAction, domain: DOMAIN,
    }),
  );

  // A non-Claim target. Agent 1's own Constitution is a real action of a
  // real, wrong type — a sharper probe than a random hash, which might be
  // refused merely for being unresolvable rather than for being the wrong
  // kind of thing.
  const constitutionAction = await agent1.call('publish_constitution', {
    agent: agent1.me,
    promises: [{ action: 'distinguish_observation_from_inference', domain: DOMAIN, modality: 'Methodological' }],
    conditions: [], published_at: nowMicros(), expires_at: null,
  });
  await expectRefusal(
    'a non-Claim entry cannot be indexed as a claim',
    () => agent1.call('attempt_false_domain_index', {
      claim_action: constitutionAction, domain: DOMAIN,
    }),
  );

  // ---- 2b. The taxonomy index, same pattern one scale smaller ---------
  log('\n=== 2b. The critique taxonomy is one taxonomy, not one per agent ===');

  const speciesName = `Species${Date.now()}`;
  await agent1.call('create_critique_species', {
    name: speciesName, parent_species: null, required_evidence: [],
    proposer: agent1.me, created_at: nowMicros(),
  });
  await new Promise((r) => setTimeout(r, 5000));

  const speciesSeenByA2 = await agent2.call('get_all_critique_species', null);
  log(`  agent2 get_all_critique_species -> ${speciesSeenByA2.length}`);
  check('agent 2 sees a species proposed by agent 1', speciesSeenByA2.length === 1);

  // The adoption count is what makes the taxonomy more than a list, and
  // it was already DHT-wide (get_links). Checked here because a species
  // nobody can see is one nobody can adopt, so the two only became
  // meaningful together.
  const speciesEntryHash = speciesSeenByA2[0]?.signed_action?.hashed?.content?.entry_hash;
  if (speciesEntryHash) {
    const claimRecords = await agent2.call('get_claims_by_domain', DOMAIN);
    const targetHash = firstOrFail(claimRecords, 'get_claims_by_domain',
      "the two claims both agents published into this run's domain").signed_action.hashed.content.entry_hash;
    await agent2.call('create_critique', {
      target: targetHash, target_type: 'Claim', critique_mode: 'Methodological',
      content: 'Sample size is not reported.', author: agent2.me,
      timestamp: nowMicros(), replication_attempted: false,
      evidence_hashes: [], species: speciesEntryHash,
    });
    await new Promise((r) => setTimeout(r, 4000));
    const adoption = await agent1.call('get_critique_species_adoption_count', speciesEntryHash);
    log(`  adoption count after agent 2 adopts agent 1's species -> ${adoption}`);
    check('one agent can adopt another agent\'s species, and it counts', adoption === 1);
  } else {
    check('a species was visible to adopt', false);
  }

  // ---- 3. Nothing got poisoned in the attempt -------------------------
  log('\n=== 3. The index is unchanged after all three attempts ===');
  const after = await agent2.call('get_claims_by_domain', DOMAIN);
  check('still exactly the two real claims', after.length === 2);
  const other = await agent2.call('get_claims_by_domain', OTHER_DOMAIN);
  check('the domain the poisoning targeted is still empty', other.length === 0);

  log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
