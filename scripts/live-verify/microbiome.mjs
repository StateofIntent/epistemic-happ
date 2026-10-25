#!/usr/bin/env node
// ============================================================================
// scripts/live-verify/microbiome.mjs — STAGE 5. CAN A MEMBRANE READ ANOTHER
// NETWORK'S DISCOURSE WITHOUT SWALLOWING IT?
//
// `docs/open-work.md` item 2.5: "Membranes read each other's published
// policies and import foreign critiques." The import is where every honest
// difficulty lives, and there are two of them.
//
// FIRST: A FOREIGN CRITIQUE CANNOT BECOME A NATIVE `Critique`.
// `validate_critique` binds `critique.author` to the action's author (SPEC
// §5.2), so a Critique on this chain asserts THIS agent wrote it. Writing
// somebody else's objection as one would forge provenance, permanently, since
// Invariant 6 keeps it. So an import is a WITNESS — the importer's own signed
// assertion that a critique saying this exists over there — which is the
// correlative-witness shape `BridgeRecord` and `FederationRecord` already use.
// §2 and §3 are about holding that line.
//
// SECOND, AND IT IS THE ONE THAT WOULD HAVE BITTEN SILENTLY: an import is a
// `Claim` in this domain, because that is what makes it discoverable by the
// by-domain index. `get_discourse_health` counts the Claims in a domain. So
// importing fifty critiques from a federated partner would raise this domain's
// `total_claims` by fifty WITHOUT ANYBODY HERE HAVING SAID ANYTHING, and its
// health would be partly a reading of another network's discourse.
//
// THAT IS NOT HYPOTHETICAL. `reading_claims` exists because
// `publish_discourse_reading` did exactly this to itself, measured on a live
// conductor: one real claim and no critiques, then three readings published,
// and `total_claims` reported 1, 2, 3, 4 while the discourse never changed.
// The same failure, one tag over. §4 is the check that would catch it, and it
// is written to be ABLE to catch it — the health is read before and after a
// known number of imports, so an unexcluded import moves a number the check
// pins exactly.
//
// WHAT THIS HARNESS DOES NOT TEST, so nobody reads more into a green run:
//   - It does not verify that the foreign critique exists. No DHT can see
//     another's data — that is `federation/README.md`'s whole premise — so
//     `foreign_content_verified` is always false and §3 asserts the field
//     rather than the fact.
//   - It does not need two conductors. Every claim made here is about what
//     THIS network records about an assertion concerning another, which is
//     exactly the half that lives on one side. `federation/federate.mjs`
//     carries the two-conductor half.
//
// Prereqs: a sandbox conductor (scripts/sandbox.sh clean && start), built .happ.
// ============================================================================

import { AdminWebsocket, AppWebsocket, CellType } from '@holochain/client';

const ADMIN_URL = 'ws://localhost:8889';
const APP_URL = 'ws://localhost:8888';
const APP_ID = 'epistemic-resonance-happ';
const DOMAIN = `Microbiome${Date.now()}`;

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
  log('=== STAGE 5: MICROBIOME — READING ANOTHER NETWORK WITHOUT SWALLOWING IT ===\n');
  const admin = await AdminWebsocket.connect({ url: new URL(ADMIN_URL), wsClientOptions: { origin: 'live-verify' } });
  const a1 = await connectApp(admin, APP_ID);
  log(`importer = ${b64(a1.me).slice(0, 12)}…\n`);

  const constitution = await a1.call('publish_constitution', {
    agent: a1.me,
    promises: [{ action: 'distinguish observation from inference', domain: DOMAIN, modality: null }],
    conditions: [], published_at: nowSecs(), expires_at: null,
  });
  const membraneAction = await a1.call('create_membrane', {
    domain: DOMAIN, description: 'Seeded membrane for Stage 5 verification.',
    required_promises: ['distinguish observation from inference'],
    validation_rules_hash: null, creator: a1.me, created_at: nowSecs(), constitution,
  });
  const membranes = await a1.call('get_membranes', null);
  const seeded = membranes.find((r) => b64(r.signed_action.hashed.hash) === b64(membraneAction));
  if (!seeded) setupFail(['The membrane just created is not in get_membranes — probably a STALE BUILD.']);
  const membrane = seeded.signed_action.hashed.content.data.entry_hash;

  // Real local discourse, so the aggregate has something of its own to report.
  for (let i = 0; i < 3; i++) {
    await a1.call('create_claim', {
      content: `genuine local discourse ${i}`, domain: DOMAIN, author: a1.me,
      timestamp: nowMicros(), evidence_hashes: [], confidence: 'Moderate',
      semantic_tags: [], source_mew: null,
    });
  }

  const health = (policy = {}) => a1.call('get_discourse_health', {
    membrane, attestation_policy: null, conductance_policy: null, ...policy,
  });
  const before = await health();

  const importOne = (i, policies = {}) => a1.call('import_foreign_critique', {
    membrane,
    remote_network_label: 'partner-network',
    remote_membrane_ref: 'remote-membrane-ref-abc123',
    foreign_author_ref: 'uhCAk-a-key-from-a-network-we-have-never-validated',
    foreign_mode: 'Evidential',
    foreign_content: `a critique that exists over there (${i})`,
    foreign_target_ref: 'uhCEk-a-target-we-cannot-resolve',
    attestation_policy: null, conductance_policy: null,
    confidence: 'Tentative',
    ...policies,
  });

  let first;
  try { first = await importOne(0); } catch (e) {
    setupFail([
      'import_foreign_critique threw on its first call.',
      'If the code looks right the conductor is probably on a STALE BUILD.',
      String(e?.message ?? e).slice(0, 300),
    ]);
  }
  await importOne(1);
  await importOne(2);
  const after = await health();

  // === 1. THE IMPORT EXISTS AND IS DISCOVERABLE =========================
  log('--- 1. An import is a Claim, so the ordinary machinery can see it ---');
  const imports = await a1.call('get_foreign_imports', membrane);
  // A Record's entry crosses as MSGPACK, so its text is a byte array to
  // JSON.stringify — decoding is the client's job, through the coordinator's
  // own getter rather than guessed at from bytes. The first version of this
  // file asserted against `JSON.stringify(imports)` and got three reds for a
  // harness defect, which is the same lesson `discourse-readings.mjs` and
  // `run-swarm.mjs` both already carry.
  const importedContents = [];
  for (const record of imports) {
    const eh = record?.signed_action?.hashed?.content?.data?.entry_hash;
    if (!eh) continue;
    const decoded = await a1.call('get_claim', eh);
    if (decoded?.content) importedContents.push(decoded.content);
  }
  const allText = importedContents.join('\n');
  check('all three imports are readable back', imports.length === 3);
  check('and their entries decode to real content rather than opaque bytes',
    importedContents.length === 3);
  check('the import reports the domain it landed in', first.domain === DOMAIN);
  check('and it rides the by-domain index like any other claim',
    (await a1.call('get_claims_by_domain', DOMAIN)).length === 6);

  // === 2. IT IS A WITNESS, NOT A COPY ====================================
  log('\n--- 2. Who actually signed it ---');
  // THE PROVENANCE LINE. A native Critique would assert that this agent wrote
  // the foreign objection; §5.2 binds author to the action's author, so there
  // is no honest way to do that for somebody else's words.
  check('the entry is signed by the IMPORTER, not by the foreign author',
    b64(first.witnessed_by) === b64(a1.me));
  check('the foreign author is carried as an opaque STRING, never as an AgentPubKey',
    /uhCAk-a-key-from-a-network/.test(allText));
  check('the content says in words that this is a witness and not the foreign signature',
    /witness, not a copy/i.test(allText) && /NOT the foreign author's signature/i.test(allText));

  // === 3. IT DOES NOT CLAIM TO HAVE VERIFIED ANYTHING ====================
  log('\n--- 3. What it refuses to claim ---');
  check('foreign_content_verified is FALSE, stated as a field rather than left to a comment',
    first.foreign_content_verified === false);
  check('and the limits name the reason: no DHT can see another\'s data',
    typeof first.limits === 'string' && /no DHT can see another/i.test(first.limits));
  check('the limits also say it is excluded from the aggregate, so a reader need not discover that',
    /get_discourse_health/.test(first.limits));

  // === 4. THE EXCLUSION — THE ONE THAT WOULD HAVE BITTEN SILENTLY ========
  log('\n--- 4. An import is not discourse in this domain ---');
  log(`    total_claims ${before.total_claims} -> ${after.total_claims}   `
    + `imported_claims ${before.imported_claims} -> ${after.imported_claims}`);
  // PINNED EXACTLY, both directions. "Did not grow" alone would also pass if
  // the index were broken and nothing were being written at all, so the
  // import counter must move by exactly the number imported.
  check('THREE IMPORTS DID NOT MOVE total_claims — this domain is not measuring another network',
    after.total_claims === before.total_claims);
  check('and imported_claims moved by exactly three, so the exclusion is real rather than a dead index',
    after.imported_claims === before.imported_claims + 3);
  check('the local discourse is still counted — the filter excluded imports, not everything',
    after.total_claims === 3);
  check('readings and imports are counted SEPARATELY, so one cannot hide in the other',
    after.reading_claims === 0 && after.imported_claims === 3);

  // === 5. WHICH LENS IT WAS READ THROUGH IS PART OF THE IMPORT ===========
  log('\n--- 5. A filtered import is not a neutral one ---');
  // AttestationPolicy and ConductancePolicy are reader-supplied — the reader
  // is the promiser — so importing under a lens and importing unfiltered give
  // different sets, and an import that did not say which would be a lensed
  // result wearing a neutral face.
  const lensed = await importOne(3, {
    attestation_policy: { require_attestation_from: null, min_attestations: 2, max_attestation_depth: 3 },
    conductance_policy: { min_effective_conductance: 0.5, half_life_secs: 86400 },
  });
  log(`    unfiltered: ${first.read_through}`);
  log(`    lensed:     ${lensed.read_through}`);
  check('an unfiltered import SAYS it was unfiltered rather than staying silent',
    /no attestation lens/i.test(first.read_through) && /no conductance lens/i.test(first.read_through));
  // THESE TWO ASSERTIONS PINNED A FALSE STRING UNTIL 2026-10-25 (open-work
  // 1.12). The policy above passes `require_attestation_from: null`, under
  // which `is_agent_attested` returns true for everyone and
  // `min_attestations` is never read — so the attestation half of this lens
  // filtered NOTHING, while `describe_method` rendered "2 distinct
  // attester(s) required" and this harness asserted that it did. The second
  // assertion is the one that mattered: it proved the claim reaches a
  // PERMANENT ENTRY, so a method string overstating the read was being
  // written somewhere Invariant 6 forbids correcting.
  //
  // Inert is the right behaviour, not a bug (the count is over a free
  // quantity — see AttestationPolicy's field doc), so the DESCRIPTION was
  // fixed and these now assert the honest one. The import is still
  // genuinely lensed: the CONDUCTANCE half is real and does filter, which
  // is what keeps §5's point intact.
  //
  // Driving a real attestation lens here — actual roots, actually filtering —
  // is worth doing and is NOT this change: it alters which claims import and
  // needs its own conductor run to establish the new expectations.
  check('an inert attestation lens SAYS it was inert rather than claiming a requirement',
    /attestation lens: INERT/.test(lensed.read_through)
    && !/distinct attester\(s\) required/.test(lensed.read_through));
  check('and names the conductance half-life as PROMISED BY THIS READER',
    /86400s as promised by this reader/.test(lensed.read_through));
  check('the two differ, so the lens is actually consulted rather than described',
    first.read_through !== lensed.read_through);
  const lensedClaim = await a1.call('get_claim', lensed.entry_hash);
  check('and the lens is carried into the PERMANENT ENTRY, not only the return value',
    /Read through: attestation lens: INERT/.test(lensedClaim?.content ?? ''));

  log('');
  if (failures === 0) {
    log('ALL CHECKS PASSED — a foreign critique is witnessed under the importer\'s');
    log('own key, never forged, and never counted as this domain\'s discourse.');
  } else {
    log(`${failures} CHECK(S) FAILED`);
  }
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error('\nHARNESS ERROR:', e); process.exit(1); });
