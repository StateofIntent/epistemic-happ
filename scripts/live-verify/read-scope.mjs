#!/usr/bin/env node
// ============================================================================
// scripts/live-verify/read-scope.mjs — WHICH READS ACTUALLY SEE THE DHT.
//
// WHY THIS EXISTS. Several coordinator "get all X" functions are built on
// `query(ChainQueryFilter)`, which reads the CALLING AGENT'S OWN SOURCE
// CHAIN and never the DHT. Others are built on `get_links`, which does
// read the DHT. Both shapes return `Vec<Record>` and both look identical
// from a client. On a one-agent sandbox they are also INDISTINGUISHABLE
// in behaviour — which is every conductor this project has ever verified
// against, so the difference has never once been exercised.
//
// If the chain-local ones are what a practitioner browses with, then on a
// real network they see only their own work: a protocol whose entire
// purpose is cross-agent critique, in which nobody can find anybody
// else's claims.
//
// This harness settled that question with two real agents on one
// conductor rather than by reasoning about the HDK's contract, and now
// keeps the answer honest as the reads get fixed one at a time.
//
// TWO ARE FIXED: get_claims_by_domain and get_all_critique_species now
// read DHT indexes (DomainToClaim, TaxonomyToSpecies) and the checks
// below assert the CORRECTED behaviour — they are the regression guard
// for those indexes, and go red if an index write or read ever breaks.
//
// THREE REMAIN chain-local, and the checks below still assert that,
// because an accurate map of a partly-fixed system is worth more than
// one that implies the whole class is done: get_critiques_by_mode,
// get_membranes, get_all_constitutions. Each raises its own design
// question about whether a global firehose index should exist at all —
// see SPEC §10.0.
//
// THE CONTROL IS THE WHOLE DESIGN. A read returning zero for agent 2
// proves nothing on its own — the entry might simply not have gossiped
// yet. So every chain-local read tested here is paired with a link-based
// read of THE SAME underlying entry by THE SAME agent at THE SAME
// moment. If the link-based read finds it and the query-based read does
// not, the data is demonstrably present on agent 2's side and the only
// variable left is the read strategy. That pairing is what turns "we saw
// zero" into evidence.
//
// Prereqs: scripts/sandbox.sh clean && scripts/sandbox.sh start, and a
// packed .happ at the repo root (scripts/pack-webhapp.sh, or `hc app
// pack .`) — agent 2 is installed from that file.
// ============================================================================
// ---------------------------------------------------------------------------
// NEGATIVE EVIDENCE — this harness has been watched failing.
//
// This directory's own rule is that a harness which has only ever been
// green has not been shown to test anything. Recorded here, rather than
// only in a merged PR, so it is readable at the point someone runs this
// file.
//
//   Regression injected: reverting get_claims_by_domain to EntryHash::try_from (the historical hash-type bug that makes a link read return empty).
//   Result: a SETUP FAILED naming the zome and the stale-build trap (PR #53).
//
// Re-check it the same way if you change what this file asserts: inject,
// watch it go red, restore, watch it go green.
// ---------------------------------------------------------------------------

import { AdminWebsocket, AppWebsocket, CellType } from '@holochain/client';

const ADMIN_URL = 'ws://localhost:8889';
const APP_URL = 'ws://localhost:8888';
const AGENT1_APP_ID = 'epistemic-resonance-happ';
const AGENT2_APP_ID = 'epistemic-resonance-happ-readscope2';
const HAPP_PATH = new URL('../../epistemic-resonance-happ.happ', import.meta.url).pathname;
const DOMAIN = `ReadScope${Date.now()}`;

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
      // CellInfo became a discriminated union in @holochain/client
      // 0.21 ({ type, value }); it used to be keyed by cell type. The
      // old `CellType.Provisioned in cell` test matches nothing against
      // the new shape, silently yielding no cell ids at all.
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

async function main() {
  const admin = await AdminWebsocket.connect({ url: new URL(ADMIN_URL), wsClientOptions: { origin: 'live-verify' } });

  const agent1 = await connectApp(admin, AGENT1_APP_ID);
  log(`agent1 = ${b64(agent1.me).slice(0, 12)}…`);

  const apps = await admin.listApps({});
  if (!apps.some((a) => a.installed_app_id === AGENT2_APP_ID)) {
    log('Installing agent 2 on the same conductor ...');
    const agent2Pub = await admin.generateAgentPubKey();
    // installApp takes `source: { type: 'path', value }` as of client
    // 0.21, not a bare `path`, and no longer accepts a top-level
    // `membrane_proofs` map. The old shape is rejected by the conductor
    // with "deserialization: Failed to deserialize request".
    await admin.installApp({
      source: { type: 'path', value: HAPP_PATH },
      agent_key: agent2Pub,
      installed_app_id: AGENT2_APP_ID,
    });
    await admin.enableApp({ installed_app_id: AGENT2_APP_ID });
  }
  const agent2 = await connectApp(admin, AGENT2_APP_ID);
  log(`agent2 = ${b64(agent2.me).slice(0, 12)}…\n`);

  // ---- Agent 1 publishes everything under test -------------------------
  log(`Agent 1 publishes into domain ${DOMAIN} ...`);
  await agent1.call('create_claim', {
    content: 'Loaded carries reduce recurrence.',
    domain: DOMAIN,
    confidence: 'Moderate',
    semantic_tags: [],
    author: agent1.me,
    timestamp: nowMicros(),
    evidence_hashes: [],
    attestation_policy: null,
  });
  const ownClaims = await agent1.call('get_claims_by_domain', DOMAIN);
  const claimEntryHash = firstOrFail(ownClaims, 'get_claims_by_domain',
    "agent 1's own claim in this run's domain").signed_action.hashed.content.data.entry_hash;

  // A Constitution and the Membrane it founds, so get_all_constitutions
  // and get_membranes have something real to fail to find.
  const constitutionHash = await agent1.call('publish_constitution', {
    agent: agent1.me,
    // Promise is a struct (action/domain/modality), not a string — the
    // coordinator rejects a bare string with an opaque Deserialize error
    // rather than a typed one, which is worth knowing when writing these.
    promises: [{ action: 'distinguish_observation_from_inference', domain: DOMAIN, modality: 'Methodological' }],
    conditions: [],
    published_at: nowMicros(),
    expires_at: null,
  });
  await agent1.call('create_membrane', {
    domain: DOMAIN,
    description: 'Read-scope probe membrane.',
    required_promises: ['distinguish_observation_from_inference'],
    validation_rules_hash: null,
    creator: agent1.me,
    created_at: nowMicros(),
    constitution: constitutionHash,
  });

  await agent1.call('create_critique_species', {
    name: `Species${Date.now()}`,
    parent_species: null,
    required_evidence: [],
    proposer: agent1.me,
    created_at: nowMicros(),
  });

  await agent1.call('create_critique', {
    target: claimEntryHash,
    target_type: 'Claim',
    critique_mode: 'Logical',
    content: 'The cited trial reports adherence, not recurrence.',
    author: agent1.me,
    timestamp: nowMicros(),
    replication_attempted: false,
    evidence_hashes: [],
    species: null,
  });

  // Give gossip a moment. Both agents are on one conductor, so this is
  // fast, but "not yet gossiped" is exactly the alternative explanation
  // this harness has to rule out — so it is waited out generously rather
  // than assumed away.
  log('Waiting for gossip ...\n');
  await new Promise((r) => setTimeout(r, 8000));

  // ---- The paired reads ------------------------------------------------
  log('=== Agent 2 reading agent 1\'s work ===');

  const viaLinks = await agent2.call('get_claims_by_agent', agent1.me);
  log(`  get_claims_by_agent  (get_links, DHT)   -> ${viaLinks.length}`);
  check('CONTROL: the claim IS present and reachable for agent 2', viaLinks.length === 1);

  // FIXED — was 0, is now 1. get_claims_by_domain reads the
  // DomainToClaim index rather than the caller's own chain. Kept here,
  // asserting the CORRECTED behaviour, so this file stays the live map
  // of SPEC §10.0 rather than a museum piece: if the index write or read
  // ever regresses, this is the check that goes red.
  const viaQuery = await agent2.call('get_claims_by_domain', DOMAIN);
  log(`  get_claims_by_domain (DomainToClaim, DHT) -> ${viaQuery.length}`);
  check('FIXED: get_claims_by_domain DOES see another agent\'s claim', viaQuery.length === 1);

  const critiques = await agent2.call('get_critiques_for', claimEntryHash);
  log(`  get_critiques_for    (get_links, DHT)   -> ${critiques.length}`);
  check('CONTROL: critiques on that claim ARE visible to agent 2', critiques.length === 1);

  // FIXED alongside it, same pattern via TaxonomyToSpecies.
  const species = await agent2.call('get_all_critique_species', null);
  log(`  get_all_critique_species (TaxonomyToSpecies, DHT) -> ${species.length}`);
  check('FIXED: get_all_critique_species DOES see another agent\'s species',
    species.length === 1);

  const byMode = await agent2.call('get_critiques_by_mode', 'Logical');
  log(`  get_critiques_by_mode (query)           -> ${byMode.length}`);
  check('get_critiques_by_mode does NOT see another agent\'s critique', byMode.length === 0);

  // Membranes and constitutions complete the list SPEC §10.0 names, so
  // that every function called chain-local there is one this harness has
  // actually observed being chain-local, rather than four observed and
  // one reasoned about.
  const membranes = await agent2.call('get_membranes', null);
  log(`  get_membranes (query)                   -> ${membranes.length}`);
  check('get_membranes does NOT see another agent\'s membrane', membranes.length === 0);

  const constitutions = await agent2.call('get_all_constitutions', null);
  log(`  get_all_constitutions (query)           -> ${constitutions.length}`);
  check('get_all_constitutions does NOT see another agent\'s constitution',
    constitutions.length === 0);

  // CONTROL for both: agent 2 can reach agent 1's constitution when it
  // asks by agent rather than by "all" — get_agent_constitution follows
  // links. Without this the two zeroes above would be equally consistent
  // with agent 1 having published nothing.
  const a1Constitution = await agent2.call('get_agent_constitution', agent1.me);
  log(`  get_agent_constitution (get_links, DHT) -> ${a1Constitution ? 'found' : 'null'}`);
  check('CONTROL: agent 1\'s constitution IS reachable by agent 2', !!a1Constitution);

  log('\n=== And agent 1 still sees its own, so nothing is simply broken ===');
  const a1Claims = await agent1.call('get_claims_by_domain', DOMAIN);
  const a1Species = await agent1.call('get_all_critique_species', null);
  log(`  agent1 get_claims_by_domain -> ${a1Claims.length}`);
  log(`  agent1 get_all_critique_species -> ${a1Species.length}`);
  check('agent 1 sees its own claim', a1Claims.length === 1);
  check('agent 1 sees its own species', a1Species.length >= 1);

  log(`\n${failures === 0 ? 'ALL CHECKS PASSED — the scope split is confirmed as described'
    : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
