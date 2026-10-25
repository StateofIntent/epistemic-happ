#!/usr/bin/env node
// ============================================================================
// scripts/validation-corpus/replay.mjs — DRIVE EVERY REACHABLE REJECTION AND
// ASSERT THE ZOME ACTUALLY REFUSES.
//
// Reads corpus/inventory.json (see enumerate.mjs), builds a VALID baseline
// payload per entry type, applies one mutation per site, and asserts the call
// is refused with that site's own message.
//
// WHY ONE MUTATION AT A TIME. A payload that violates two rules proves nothing
// about either: validation returns at the first failing check, so the message
// that comes back names whichever rule happens to sit earlier in the function.
// Every case here starts from a baseline that is known to COMMIT, and changes
// exactly one field — so a refusal naming a different rule is itself a failure,
// and is reported as one rather than being counted as a pass.
//
// WHY THE BASELINE IS ASSERTED FIRST. If the baseline does not commit, every
// case below it "passes" by being refused for the wrong reason, and a run of
// green ticks means nothing. The baseline commit is check #1 for each entry
// type, and its cases are counted as SKIPS rather than dropped when it fails —
// a run reporting one failure must not look like a run that exercised the
// whole table and found one bug.
//
// FIVE ENTRY TYPES, AND THE COVERAGE IS ASSERTED RATHER THAN CLAIMED. `Claim`,
// `Mew`, `Evidence`, `Constitution` and `CritiqueSpecies` — every rule the
// inventory lists for those five has a case here, checked BOTH ways at the
// bottom of this file: a rule with no case fails, and a case naming a rule the
// inventory no longer lists fails too. The second direction is the one that
// would otherwise rot quietly, since a case asserting a message the zome can
// no longer produce still looks like coverage.
//
// The entry types NOT here are not pretended about: see README.md's class
// table.
//
// THIRTEEN ENTRY TYPES as of 2026-10-21, 260 checks. The foresight family —
// `pre_registration`, `revelation`, `worldline_trace` — was the last to come
// in, and the note that used to sit here blamed "dependency chains rather than
// payloads, which is a larger job than this file". That was wrong twice over:
// the chains were already built by `otherAgentFixtures()` for the link rules,
// and what actually blocks the rest is that most of those types' fields are
// DERIVED BY THE EXTERN. See README.md's finding 14.
//
// WATCHED FAILING — BG, BH, BI, one per new type, each a separate build
// against a clean conductor. BH is the one worth reading: it red for the WRONG
// REASON first, because the owner case was being refused by the hash check one
// line later rather than by the rule it names. The case now offers agent 2's
// real content, and the re-injected forged reveal COMMITS.
// ============================================================================

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AdminWebsocket, AppWebsocket } from '@holochain/client';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const INVENTORY = resolve(HERE, 'corpus/inventory.json');

const ADMIN_URL = process.env.EPI_ADMIN_URL ?? 'ws://localhost:8889';
const APP_URL = process.env.EPI_APP_URL ?? 'ws://localhost:8888';
const APP_ID = process.env.EPI_APP_ID ?? 'epistemic-resonance-happ';
const ROLE = 'epistemic';
const ZOME = 'epistemic_coordinator';

let pass = 0, fail = 0, skip = 0;
const failures = [];
const log = (s = '') => console.log(s);
function check(ok, label, detail) {
  if (ok) { pass++; log(`  PASS: ${label}`); }
  else { fail++; failures.push({ label, detail }); log(`  FAIL: ${label}`); if (detail) log(`        ${detail}`); }
}

// --- A well-formed hash that resolves to nothing.
//
// Holochain hashes are 39 bytes: a 3-byte type prefix, 32 bytes of digest, and
// 4 bytes of DHT location. The PREFIX IS PART OF THE TYPE, and getting it wrong
// does not produce the refusal under test — it produces a msgpack Deserialize
// error from the coordinator's extern before validation is ever reached, which
// a harness checking only "did it throw" would score as a pass. Building the
// first version of this file from an ActionHash for an EntryHash field is
// exactly that mistake, and it is why these are explicit constants.
const HASH_PREFIX = {
  entry: [0x84, 0x21, 0x24],   // uhCEk…
  action: [0x84, 0x29, 0x24],  // uhCkk…
  agent: [0x84, 0x20, 0x24],   // uhCAk…
};

function danglingHash(kind, seed = 0) {
  const prefix = HASH_PREFIX[kind];
  if (!prefix) throw new Error(`unknown hash kind: ${kind}`);
  const h = new Uint8Array(39);
  h.set(prefix, 0);
  for (let i = 3; i < 35; i++) h[i] = (i * 31 + seed * 7 + 11) & 0xff;
  // The trailing 4 bytes are the DHT location. Nothing on the write path
  // recomputes them for a hash arriving in a payload, so any value deserializes
  // — confirmed by the author-mismatch case, which reaches its rule with the
  // digest rewritten and the location left alone.
  h.set([0x00, 0x00, 0x00, 0x00], 35);
  return h;
}

const admin = await AdminWebsocket.connect({ url: new URL(ADMIN_URL), wsClientOptions: { origin: 'live-verify' } });
const token = (await admin.issueAppAuthenticationToken({ installed_app_id: APP_ID })).token;
const app = await AppWebsocket.connect({ url: new URL(APP_URL), token, wsClientOptions: { origin: 'live-verify' } });
const appInfo = await app.appInfo();
const myKey = appInfo.agent_pub_key;

// Zome calls from outside the launcher are signed, and the signing keypair has
// to be authorized per cell first — agent-sdk does the same at index.ts:181.
// Without it every call fails with "no signing credentials have been
// authorized", which looks exactly like a validation refusal to a harness that
// only checks "did it throw".
for (const roleCells of Object.values(appInfo.cell_info)) {
  for (const cell of roleCells) {
    const id = cell?.value?.cell_id;
    if (id) await admin.authorizeSigningCredentials(id);
  }
}

const call = (fn_name, payload) =>
  app.callZome({ role_name: ROLE, zome_name: ZOME, fn_name, payload });

// ============================================================================
// THE SECOND AGENT — READINESS.md item 5f.
//
// WHY ONE IS NOT ENOUGH, restated here because the shape of the fix is not the
// shape the queue row predicted. Twenty-three rules in this corpus fire when a
// thing belongs to SOMEBODY ELSE, and one conductor has one agent, so
// everything it can author is its own and forging the owning field is stopped a
// rule earlier by the matching author check. The row assumed this needed
// `scripts/network.sh` and two conductors. It does not.
//
// WHAT IT ACTUALLY NEEDS, and it is much less: a second agent on the SAME
// conductor, used ONLY to author entities. Every one of these rules compares an
// owning field against the ACTION author, so the probe is "agent 1 writes about
// agent 2's thing" — the driver keeps making every call as agent 1, and all
// that changes is who published the entity it points at. No call routing, no
// second conductor, no gossip to wait on across a network. The pattern is
// `scripts/live-verify/attachment-links.mjs`, which has run two agents on one
// conductor since §5.19's link rules were bound.
//
// INSTALLED IDEMPOTENTLY, because this harness is re-run constantly and a
// second install of the same app id is an error rather than a no-op.
const OTHER_APP_ID = process.env.EPI_OTHER_APP_ID ?? 'epistemic-resonance-happ-corpus2';
const HAPP_PATH = new URL('../../epistemic-resonance-happ.happ', import.meta.url).pathname;

const installedApps = await admin.listApps({});
if (!installedApps.some((a) => a.installed_app_id === OTHER_APP_ID)) {
  const otherPub = await admin.generateAgentPubKey();
  await admin.installApp({
    source: { type: 'path', value: HAPP_PATH },
    agent_key: otherPub,
    installed_app_id: OTHER_APP_ID,
  });
  await admin.enableApp({ installed_app_id: OTHER_APP_ID });
}
const otherToken = (await admin.issueAppAuthenticationToken({ installed_app_id: OTHER_APP_ID })).token;
const otherApp = await AppWebsocket.connect({ url: new URL(APP_URL), token: otherToken, wsClientOptions: { origin: 'live-verify' } });
const otherInfo = await otherApp.appInfo();
const otherKey = otherInfo.agent_pub_key;
for (const roleCells of Object.values(otherInfo.cell_info)) {
  for (const cell of roleCells) {
    const id = cell?.value?.cell_id;
    if (id) await admin.authorizeSigningCredentials(id);
  }
}

const callOther = (fn_name, payload) =>
  otherApp.callZome({ role_name: ROLE, zome_name: ZOME, fn_name, payload });

// WAITED FOR RATHER THAN SLEPT THROUGH. Agent 1's validation has to FETCH the
// entity agent 2 published — `must_get_entry` on another agent's entry — and
// until that resolves locally the commit DEFERS with DepMissingFromDht instead
// of being refused by the rule under test, which would look like a rule that
// does not fire. Two agents on one conductor make that fast, but not
// instantaneous and not a fixed duration, so this polls agent 1's own read
// until the entity is actually visible to it and reports a timeout as a SETUP
// failure, which `drive` already separates from a rule failure.
async function awaitVisibleToMe(read, label, attempts = 40, everyMs = 500) {
  for (let i = 0; i < attempts; i++) {
    try {
      const got = await read();
      if (got != null) return got;
    } catch { /* not there yet */ }
    await new Promise((r) => setTimeout(r, everyMs));
  }
  throw new Error(`${label} never became visible to agent 1 after ${(attempts * everyMs) / 1000}s — `
    + `the second agent published it, but this agent cannot read it yet, so any rule about it would DEFER rather than refuse`);
}

// THE OTHER AGENT'S FIXTURES, published once and shared.
//
// Memoised deliberately. Six rules need agent 2 to own something, and each of
// these writes costs friction budget and a visibility wait — publishing them
// per entry type would multiply both for no gain, since none of the six
// mutates the fixture, only points at it.
//
// WAITED FOR INDIVIDUALLY, not once at the end. Agent 1's validation fetches a
// DIFFERENT one of these per rule — the Constitution for Membrane and
// AgentToConstitution, the Claim for AgentToClaim and DomainToClaim, the
// Membrane for FederationRecord and MembraneRegistry — so a single wait on one
// of them would leave the others racing, and a rule whose dependency has not
// arrived DEFERS rather than refusing, which reads as a rule that does not
// fire.
let _others = null;
// AGENT 2'S COMMITTED CONTENT, named rather than written twice.
//
// It was two string literals repeated at the commit and the reveal. It is
// named now because a THIRD caller needs it and must not re-type it: the
// `Revelation` spec's owner case has to offer content that hashes CORRECTLY to
// agent 2's commitment, so that the author rule is the only thing left that
// can refuse the reveal. Injection BH is why — with the author rule removed and
// agent 1's own content supplied, the forged reveal was stopped by the HASH
// check instead, so the case red for a reason that had nothing to do with the
// rule it names. See the case's own comment.
const OTHER_PREDICTION = 'corpus prediction, committed by the OTHER agent';
const OTHER_SALT = 'corpus-other-salt-4a1c';

// ONE SET OF CONE FIXTURES FOR THE WHOLE RUN, and finding 17 is why.
//
// Every `create_critique` also creates a SynapticLink, and §6 caps those at 20
// per author per rolling hour. The `critique` spec needs three critiques for
// its cone cases and the `assessment` spec needs the same three — six, plus
// everything else the corpus writes, and the run died with `SWO temporal
// friction: 20 SynapticLinks already created`, skipping every case below it.
//
// So they are built ONCE and shared. The cost of not doing this is not a
// slower run, it is a corpus that silently stops testing things.
let _cone = null;
async function coneFixtures() {
  if (_cone) return _cone;
  const domain = `CorpusCone${Date.now()}`;
  await call('create_claim', {
    content: 'corpus claim, the shared cone target', domain, author: myKey,
    timestamp: nowMicros(), evidence_hashes: [], confidence: 'Moderate',
    semantic_tags: [], source_mew: null,
  });
  const claims = await call('get_claims_by_domain', domain);
  const target = claims[0].signed_action.hashed.content.data.entry_hash;
  const member = await call('create_critique', {
    target, target_type: 'Claim', critique_mode: 'Methodological',
    content: 'corpus critique, a legal cone member', author: myKey,
    timestamp: nowMicros(), replication_attempted: false, evidence_hashes: [],
    species: null, past_cone: [],
  });
  const withOwnCone = await call('create_critique', {
    target, target_type: 'Claim', critique_mode: 'Methodological',
    content: 'corpus critique whose own cone is non-empty', author: myKey,
    timestamp: nowMicros(), replication_attempted: false, evidence_hashes: [],
    species: null, past_cone: [member],
  });
  const otherDomain = `CorpusConeOther${Date.now()}`;
  await call('create_claim', {
    content: 'corpus claim in another domain', domain: otherDomain, author: myKey,
    timestamp: nowMicros(), evidence_hashes: [], confidence: 'Moderate',
    semantic_tags: [], source_mew: null,
  });
  const oc = await call('get_claims_by_domain', otherDomain);
  const otherTarget = oc[0].signed_action.hashed.content.data.entry_hash;
  const foreign = await call('create_critique', {
    target: otherTarget, target_type: 'Claim', critique_mode: 'Methodological',
    content: 'corpus critique of a different target', author: myKey,
    timestamp: nowMicros(), replication_attempted: false, evidence_hashes: [],
    species: null, past_cone: [],
  });
  const notACritique = await call('create_claim', {
    content: 'corpus claim used as a non-Critique reference', domain, author: myKey,
    timestamp: nowMicros(), evidence_hashes: [], confidence: 'Moderate',
    semantic_tags: [], source_mew: null,
  });
  _cone = { target, otherTarget, member, withOwnCone, foreign, notACritique, domain };
  return _cone;
}

async function otherAgentFixtures() {
  if (_others) return _others;
  const domain = `CorpusOther${Date.now()}`;

  const constitution = await callOther('publish_constitution', {
    agent: otherKey,
    promises: [{ action: 'own what it publishes', domain, modality: null }],
    conditions: [], published_at: nowSecs(), expires_at: null,
  });
  const claimAction = await callOther('create_claim', {
    content: 'corpus claim, authored by the OTHER agent so agent 1 can fail to own it',
    domain, author: otherKey, timestamp: nowMicros(),
    evidence_hashes: [], confidence: 'Moderate', semantic_tags: [], source_mew: null,
  });
  // The REAL create_membrane, not the prober: agent 2 cites its OWN
  // Constitution so this is a valid membrane, and `get_membranes` is link-only
  // so it has to be indexed to be read back at all.
  const membraneAction = await callOther('create_membrane', {
    domain,
    description: 'corpus membrane, created by the OTHER agent',
    required_promises: ['own what it publishes'],
    validation_rules_hash: null,
    creator: otherKey,
    created_at: nowSecs(),
    constitution,
  });

  await awaitVisibleToMe(
    async () => (await call('get_agent_constitution', otherKey)) ?? null,
    "the other agent's Constitution",
  );
  const claimEntry = await awaitVisibleToMe(
    async () => {
      const found = await call('get_claims_by_domain', domain);
      return found.length ? found[0].signed_action.hashed.content.data.entry_hash : null;
    },
    "the other agent's Claim",
  );
  const membraneEntry = await awaitVisibleToMe(
    async () => {
      const key = Buffer.from(membraneAction).toString('base64');
      const row = (await call('get_membranes'))
        .find((r) => Buffer.from(r.signed_action.hashed.hash).toString('base64') === key);
      return row ? row.signed_action.hashed.content.data.entry_hash : null;
    },
    "the other agent's Membrane",
  );

  // --- 5c's agent-anchor family also needs agent 2 to own these three ---
  const mewAction = await callOther('create_mew', {
    content: 'corpus mew, authored by the OTHER agent',
    author: otherKey, timestamp: nowMicros(),
    reply_to: null, semantic_tags: ['corpus'], linked_claim: null,
  });
  // A trace is always of the CALLER's own chain (generate_worldline_trace reads
  // agent_info), so agent 2 has to generate its own — there is no way to make
  // one about somebody else, which is the rule's whole point.
  const traceAction = await callOther('generate_worldline_trace', {
    period_granularity_secs: 3600, expertise_tags: [], expires_at: null,
  });
  // The question must PREDATE the commitment (lib.rs:1159), and agent 2's claim
  // above was published several writes ago, so it already does.
  const preRegAction = await callOther('pre_register', {
    question: claimAction,
    prediction: OTHER_PREDICTION,
    salt: OTHER_SALT,
    reveal_deadline: nowMicros() + 3_600_000_000,
  });

  await awaitVisibleToMe(
    async () => {
      const mews = await call('get_mews_by_agent', otherKey);
      return mews.length ? true : null;
    },
    "the other agent's Mew",
  );
  await awaitVisibleToMe(
    async () => (await call('get_agent_worldline_trace', otherKey)) ?? null,
    "the other agent's WorldlineTrace",
  );
  await awaitVisibleToMe(
    async () => {
      const prs = await call('get_pre_registrations_for_question', claimAction);
      return prs.length ? true : null;
    },
    "the other agent's PreRegistration",
  );

  // Agent 2 reveals its own commitment, which PreRegistrationToRevelation's
  // owner rule needs: only the revealing agent may hang the link.
  const revelationAction = await callOther('reveal_pre_registration', {
    pre_registration: preRegAction,
    prediction: OTHER_PREDICTION,
    salt: OTHER_SALT,
  });
  await awaitVisibleToMe(
    async () => {
      const rec = await call('get_foresight_record', otherKey);
      return rec.revealed.length ? true : null;
    },
    "the other agent's Revelation",
  );

  // Agent 2's retraction chain, which both retraction-link owner rules need.
  // ONE retraction serves both: ClaimToRetraction's owner case needs any
  // Retraction of agent 2's, and RetractionToReplacement's needs one that
  // NAMES a replacement — so it is published with one.
  const replacementAction = await callOther('create_claim', {
    content: 'corpus claim, the OTHER agent\'s replacement for its retracted claim',
    domain, author: otherKey, timestamp: nowMicros(),
    evidence_hashes: [], confidence: 'Moderate', semantic_tags: [], source_mew: null,
  });
  const otherClaims = await awaitVisibleToMe(
    async () => {
      const found = await call('get_claims_by_domain', domain);
      return found.length >= 2 ? found : null;
    },
    "both of the other agent's Claims",
  );
  const replacementEntry = otherClaims
    .find((r) => Buffer.from(r.signed_action.hashed.hash).toString('base64')
               === Buffer.from(replacementAction).toString('base64'))
    .signed_action.hashed.content.data.entry_hash;
  const retractionAction = await callOther('create_retraction', {
    target_claim: claimEntry,
    reason: 'corpus retraction, by the OTHER agent',
    replacement_claim: replacementEntry,
    author: otherKey,
    timestamp: nowMicros(),
  });
  await awaitVisibleToMe(
    async () => {
      const rs = await call('get_retractions_for_claim', claimEntry);
      return rs.length ? true : null;
    },
    "the other agent's Retraction",
  );

  // Agent 2's promotion and import chains, for MewToClaim's and
  // ClaimToExternalCritique's owner rules. The Mew's ENTRY hash is needed as
  // well as its action, because a promoted Claim names its source by entry.
  const otherMewEntry = (await call('get_mews_by_agent', otherKey))
    .find((r) => Buffer.from(r.signed_action.hashed.hash).toString('base64')
               === Buffer.from(mewAction).toString('base64'))
    .signed_action.hashed.content.data.entry_hash;
  const promotedAction = await callOther('create_claim', {
    content: 'corpus claim, the OTHER agent\'s promotion of its own Mew',
    domain, author: otherKey, timestamp: nowMicros(),
    evidence_hashes: [], confidence: 'Moderate', semantic_tags: [],
    source_mew: otherMewEntry,
  });
  // `importer` is taken from agent_info and cannot be supplied, so agent 2
  // importing is the only way to get an ExternalCritique that is agent 2's.
  const externalCritiqueAction = await callOther('import_twitter_reply', {
    twitter_id: `corpus-other-${Date.now()}`,
    author_handle: 'corpus_other_handle',
    content: 'corpus external critique, imported by the OTHER agent',
    linked_holochain_claim: claimEntry,
    imported_at: nowSecs(),
  });
  await awaitVisibleToMe(
    async () => {
      const found = await call('get_claims_by_domain', domain);
      return found.length >= 3 ? true : null;
    },
    "the other agent's promoted Claim",
  );

  // Agent 2 federates its own Membrane, for MembraneToFederationRecord's owner
  // rule. §5.18 already requires the author to be the membrane's founder, so
  // only agent 2 can produce this one — the same unforgeable-by-construction
  // shape as ExternalCritique's importer.
  const otherFederationAction = await callOther('record_federation', {
    local_membrane: membraneEntry,
    remote_network_label: 'corpus-remote-net-other',
    remote_membrane_ref: 'corpus-remote-ref-other',
    author: otherKey,
    created_at: nowSecs(),
  });

  // Agent 2 mirrors its own Mew. `author` is filled from agent_info() inside
  // record_twitter_mirror, so — like ExternalCritique's importer and
  // FederationRecord's §5.18 author — a BridgeRecord belonging to somebody
  // else can only be obtained by having somebody else record it. Third of
  // three unforgeable-by-construction owner rules in this corpus.
  const otherBridgeAction = await callOther('record_twitter_mirror', {
    mew_hash: otherMewEntry, twitter_id: `corpus-other-bridge-${Date.now()}`,
    platform: 'twitter', mirrored_at: nowSecs(),
    carried_fields: ['content'], dropped_fields: [],
    original_length: 48, excerpt_length: 48,
  });

  // Agent 2's taxonomy, critique and antibody, for the last four owner rules.
  // ONE critique serves two of them: it declares a species (CritiqueToSpecies)
  // and names a target (TargetToCritique). Deliberately economical — Critique
  // and AntibodyPattern are capped at 20 per rolling hour each (§6), so every
  // avoidable one spends allowance a later run needs.
  const otherParentSpecies = await callOther('create_critique_species', {
    name: `CorpusOtherParent${Date.now()}`, parent_species: null,
    required_evidence: [], proposer: otherKey, created_at: nowMicros(),
  });
  const speciesRows0 = await callOther('get_all_critique_species');
  const speciesEntryFor = (rows, a) => rows
    .find((r) => Buffer.from(r.signed_action.hashed.hash).toString('base64')
               === Buffer.from(a).toString('base64'))
    .signed_action.hashed.content.data.entry_hash;
  const otherParentEntry = speciesEntryFor(speciesRows0, otherParentSpecies);
  const otherChildSpecies = await callOther('create_critique_species', {
    name: `CorpusOtherChild${Date.now()}`, parent_species: otherParentEntry,
    required_evidence: [], proposer: otherKey, created_at: nowMicros(),
  });
  const otherCritique = await callOther('create_critique', {
    target: claimEntry, target_type: 'Claim', critique_mode: 'Logical',
    content: 'corpus critique, by the OTHER agent, declaring a species',
    author: otherKey, timestamp: nowMicros(),
    replication_attempted: false, evidence_hashes: [], species: otherParentEntry,
  });
  const otherAntibody = await callOther('publish_antibody_pattern', {
    target: claimEntry, target_type: 'Claim', kind: 'SpamFlood',
    rationale: 'corpus antibody pattern, by the OTHER agent',
    author: otherKey, timestamp: nowMicros(),
  });
  await awaitVisibleToMe(
    async () => {
      const rows = await call('get_all_critique_species');
      return rows.some((r) => Buffer.from(r.signed_action.hashed.hash).toString('base64')
                            === Buffer.from(otherChildSpecies).toString('base64')) ? true : null;
    },
    "the other agent's CritiqueSpecies",
  );

  // Agent 2's own import, for DomainToForeignCritique's witness rule. Through
  // the RAW prober rather than `import_foreign_critique`, and for once that is
  // not about reaching a field: the real extern needs a Membrane argument and
  // derives the domain from it, so driving it here would couple this fixture to
  // agent 2's membrane for no gain. `witnessed_by` is agent 2's either way,
  // which is the only property the rule is about.
  const otherForeignAction = await callOther('attempt_raw_foreign_critique', {
    witnessed_by: otherKey,
    domain,
    foreign_content: 'corpus foreign critique, witnessed by the OTHER agent',
    remote_network_label: 'corpus-remote-net-other',
    remote_membrane_ref: 'corpus-remote-ref-other',
    foreign_author_ref: 'corpus-foreign-author-other',
    foreign_target_ref: 'corpus-foreign-target-other',
    foreign_mode: 'Methodological',
    read_through: 'unfiltered (no policy supplied)',
    confidence: 'Moderate',
    imported_at: nowMicros(),
  });
  await awaitVisibleToMe(
    async () => {
      const found = await call('get_foreign_critiques_by_domain', domain);
      return found.length ? true : null;
    },
    "the other agent's ForeignCritique",
  );

  _others = {
    domain, constitution, claimAction, claimEntry, membraneAction, membraneEntry,
    mewAction, traceAction, preRegAction, revelationAction,
    replacementAction, replacementEntry, retractionAction,
    mewEntry: otherMewEntry, promotedAction, externalCritiqueAction,
    federationAction: otherFederationAction, bridgeAction: otherBridgeAction,
    parentSpecies: otherParentSpecies, parentSpeciesEntry: otherParentEntry,
    childSpecies: otherChildSpecies, critiqueAction: otherCritique,
    antibodyAction: otherAntibody,
    foreignAction: otherForeignAction,
    preRegPrediction: OTHER_PREDICTION, preRegSalt: OTHER_SALT,
  };
  return _others;
}

async function refusal(fn_name, payload) {
  try { await call(fn_name, payload); return null; }
  catch (e) { return String(e?.message ?? e); }
}

const nowMicros = () => Date.now() * 1000;
// Constitution and Membrane carry SECONDS (`published_at`, `created_at`) while
// Claim and friends carry microseconds. Mixing them up does not fail loudly —
// `expires_at must be > created_at` is a comparison between two numbers either
// way — so the two helpers are named rather than inlined.
const nowSecs = () => Math.floor(Date.now() / 1000);


log('=== validation corpus: replay ===');
log(`conductor ${APP_URL}  app ${APP_ID}`);
const inv = JSON.parse(readFileSync(INVENTORY, 'utf8'));

log(`inventory: ${inv.total_sites} sites, protocol_version ${inv.protocol_version}`);
log('');
// ============================================================================
// THE CASE TABLES, AND WHAT KEEPS THEM HONEST.
//
// One table per entry type: a baseline the zome is asserted to ACCEPT, then one
// mutation per inventoried rule. `drive()` below commits the baseline first and
// skips the mutations if it does not commit, because a baseline that is already
// invalid makes every case below it "pass" by being refused for the wrong
// reason — eighteen green ticks that mean nothing.
//
// EVERY RULE IS SPELLED, NOT COUNTED. Each case names the exact message it
// expects, and `coverage()` at the bottom compares the set of rules named here
// against the inventory's own list for these five entry types. So a rule added
// to `validate_mew` without a case here fails this harness, rather than
// quietly shrinking what a green run covers — which is the failure mode the
// inventory drift check in `live-verify.yml` catches one step earlier, for
// the file rather than for the corpus.
// ============================================================================

// The entry types this corpus claims COMPLETE coverage of. Everything outside
// this list is accounted for in README.md's class table and is not pretended
// about here.
//
// THIS COMMENT USED TO SAY that `WorldlineTrace` and `Revelation` were excluded
// because they need dependency chains, and that this was "a different and much
// larger job than a payload". The first half was a guess and the second was
// wrong in both directions. `Retraction` DOES need a chain and it cost one extra
// call — it is in the list now. `WorldlineTrace` and `Revelation` are excluded
// for a different reason entirely: no coordinator extern accepts a raw payload
// for either, so the fields their rules are about are derived by the extern and
// cannot be reached from JavaScript at all. See README.md's finding 5.
//
// THAT WAS TRUE OF MOST OF THEIR RULES AND NOT ALL OF THEM, and both types are
// in the list below as of 2026-10-21, alongside `pre_registration`. Eight of
// the eighteen sites across the three really are `needs_extern` and stay out
// of the denominator by class. The other ten are about fields a caller hands
// in — a deadline, a question hash, an expiry, the content offered at reveal —
// and eight of those now have cases, with two declared unreachable in GAPS for
// reasons that are not "it needs a chain".
const COVERED = [
  'claim', 'mew', 'evidence', 'constitution', 'critique_species', 'retraction',
  'critique', 'antibody_pattern', 'membrane', 'federation_record',
  // The foresight family, added 2026-10-21. See the block comment above their
  // specs: the dependency chains the old note blamed were already built, and
  // the real limit is that most of their fields are derived by the extern.
  'worldline_trace', 'pre_registration', 'revelation',
  // The last two, 2026-10-21 — `needs_extern` reaches 0 with these.
  'bridge_record', 'external_critique',
  // Settlement, protocol_version 11. Added WITH the entry types rather than
  // after: a type absent from this list has its rules demanded by nothing,
  // and the coverage loop reports "0 of 0" while cases run and gate nothing
  // (finding 10's shape).
  'assessment', 'settlement_policy', 'settlement_status',
  // Item 4.5, protocol_version 12. Added WITH the entry type for the reason
  // settlement's three were: a type absent from this list has its rules
  // demanded by nothing, and the coverage loop reports "0 of 0" while cases
  // run and gate nothing.
  'foreign_critique',
];

// --- Rules that are inventoried as assertable and are NOT reachable from this
// harness, each with the reason, so that coverage stays a real number instead
// of being quietly redefined.
//
// WHY AN EXPLICIT LIST RATHER THAN A SHORTER DENOMINATOR. A gap left out of the
// coverage check is indistinguishable from a rule nobody noticed. A gap listed
// here is asserted to STILL EXIST in the inventory, so a renamed or deleted
// rule reds this file the same way an orphaned case does — the escape hatch
// cannot rot into a silencer. It is printed on every run, loudly, because the
// number that matters is "covered out of assertable", not "covered out of
// covered".
//
// THE SECOND AGENT NOW EXISTS, so these gaps are no longer the same KIND of
// gap, and the distinction is the point of this block. Item 5f landed the
// plumbing: `callOther` publishes as a second agent on the same conductor and
// `awaitVisibleToMe` waits until agent 1 can actually read what it wrote. The
// first rule it unblocked — "A Retraction can only be published by the claim's
// own author" — is asserted below rather than listed here.
//
// WHAT THE PLUMBING TURNED OUT TO BE, recorded because the queue row predicted
// something larger. These rules compare an owning field against the ACTION
// author, so the probe is "agent 1 writes about agent 2's thing": every call
// still goes through agent 1 and all that changes is who published the entity
// it points at. No call routing, no second conductor, and no cross-network
// gossip to wait on. `scripts/live-verify/attachment-links.mjs` has done it
// this way since §5.19.
//
// SO THE SIX SECOND-AGENT ROWS LEFT BELOW ARE MECHANICAL, NOT BLOCKED. Each
// needs its own fixture published by agent 2 — a Constitution, a Membrane, a
// Claim and its domain — and, for the four link types, care that the OWNERSHIP
// rule fires rather than the base-mismatch rule one line above it: the base
// anchor must be agent 2's (correct), so that only the link's author differs.
// That is a per-type payload exercise of the kind 5a/5b/5c already are, which
// is why they are still declared here rather than asserted on a promise.
const GAPS = [
  // --- TWO SHAPES OF GAP, and they are not the same cost.
  //
  // (a) THE COORDINATOR REFUSES FIRST. Both SWO friction rules are mirrored as
  // a coordinator pre-check, so `create_critique` and
  // `publish_antibody_pattern` return the COORDINATOR's wording and the
  // integrity zome's message is never produced. Measured 2026-10-17 after
  // committing 20 of each: `epistemic_coordinator:888` and `:1028` raise
  // "... already created in the last 3600 seconds", which is a different string
  // from the rule. Unlike Membrane — where `attempt_unaccountable_membrane`
  // exists precisely to skip the pre-check — there is no bypassing extern for
  // either of these, so the rules are unreachable through any published path.
  // Same cost as `needs_extern`: a new extern plus a DNA rebuild.
  //
  // THE RULES ARE NOT REDUNDANT, which is the part worth not losing. The
  // coordinator's check is a courtesy a custom client skips; the integrity
  // one is the enforcement, and `count_recent_actions_since_checkpoint` is what
  // every peer runs. What is untested is the enforcement, and what is tested is
  // the courtesy — exactly the inversion this corpus exists to find, now
  // recorded rather than implied.
  // THESE TWO USED TO BE DECLARED HERE AND ARE NOW DERIVED, which is strictly
  // better and is why they are gone rather than kept for completeness.
  // READINESS item 5e taught `enumerate.mjs` to see a coordinator pre-check
  // that shadows a rule, so the Critique and AntibodyPattern friction rules
  // are classed `shadowed` in the inventory — the same fact, computed from the
  // two zomes instead of asserted here, and out of the assertable denominator
  // by class rather than by exemption. Keeping both copies would mean one of
  // them could rot, which is the thing the note above forbids. The three LINK
  // friction gaps below STAY, because shadowing is not their only reason: each
  // also needs a budget a single run cannot spend, and that half is not
  // mechanical.
  // (b) A SECOND AGENT. ALL SEVEN BELOW ARE THE SAME PROBLEM, which is worth seeing as one: a rule that
  // fires when a thing belongs to SOMEBODY ELSE. One conductor has one agent,
  // so everything it can author is its own, and forging the owning field is
  // stopped a rule earlier by the matching author check. None of the three is a
  // zome limitation or a payload problem — they need a second agent on one DHT,
  // which `scripts/network.sh` already stands up for the gossip harnesses. That
  // makes "run the corpus against two agents" a single piece of work that
  // closes all three at once, rather than three separate puzzles.
  // EVERY LINK TYPE HAS ONE OF THESE — 20 of the 88 link rules, across all 19
  // types, are "may only be created by the owner" in some wording. Four are in
  // this slice. Counted here rather than discovered four at a time: with the
  // three entry-type gaps above, **23 rules in this corpus are waiting on one
  // piece of work**, which is a second agent on one DHT. That makes it the
  // highest-leverage item left, not the remaining link bulk.

  // --- ITEM 18's FIVE, newly declarable because they are newly CLASSIFIED.
  //
  // Until enumerate.mjs learned to parse `AttachmentLinkKind`, these rules were
  // `needs_prober` — and a rule the inventory calls unreachable is one the
  // coverage loop does not demand a case for. So they could not be gapped
  // either: there was nothing to be exempt from. Now that the classifier reads
  // the Rust, all five are `crafted` and have to be accounted for here.
  //
  // (a) ATTESTATION GRANT — ONE OF THE THREE, NOT ALL THREE ANY MORE.
  //
  // This block used to gap all three, on the reasoning that
  // `ATTESTATION_GRANT_MIN_TENURE_SECS_VALIDATION` is thirty days, so no run
  // can construct a committing baseline, so every case would be refused for
  // tenure rather than for the rule under test. The first two steps are
  // correct and still are. The conclusion was too strong, and the note that
  // used to close this comment said what was missing: *"these need a harness
  // that asserts refusals WITHOUT a valid baseline, which is a different shape
  // from this one — not another extern."* That harness is now at the bottom of
  // this file, and two of the three rules are asserted rather than gapped.
  //
  // What remains gapped is the friction rule, and the reason is no longer the
  // baseline — it is the coordinator, the same shape as the two entry-type
  // gaps above.
  {
    linkType: 'AttestationGrant',
    rule: 'SWO temporal friction: author has granted attestation {} times in the last {} seconds (limit {}). This bounds how fast the right to vouch can be spent, not just how fast links can be created.',
    why: 'unreachable twice over, and neither reason is the baseline. `check_attestation_grant_friction` pre-checks at the SAME limit (ATTESTATION_GRANT_MAX_PER_WINDOW 5 = ..._VALIDATION 5) so grant_attestation refuses in the coordinator\'s wording; and reaching the limit through the prober would need five grants that PASS the thirty-day tenure bar, which is the thing no run can produce',
  },
  // (b) TWO FRICTION RULES, the same exception the two entry-type gaps above
  // take: a limit reached only by committing the whole window's allowance,
  // which spends a budget later runs in the same hour need.
  {
    linkType: 'Reinforcement',
    rule: 'SWO temporal friction: author has {} Reinforcements in the last {} seconds (limit {}). This is enforced by DHT validation, not a client-side courtesy.',
    why: 'reaching it means committing 40 Reinforcements in one window, which spends an allowance the rest of this corpus run needs — the same exception the critique and antibody friction rules take',
  },
  {
    linkType: 'SynapticLink',
    rule: 'SWO temporal friction: author has {} SynapticLinks in the last {} seconds (limit {}). This is an absolute limit, enforced by DHT validation, not a client-side courtesy.',
    why: 'reaching it means committing 20 SynapticLinks in one window, and each one costs a Critique — the limit that stopped this corpus mid-development, measured rather than imagined',
  },
  // --- (c) A THIRD SHAPE, FOUND 2026-10-21 AND NOT PRESENT BEFORE: THE FIELD
  // IS CALLER-CONTROLLED BUT THE RULE IS ABOUT SOMETHING THE CALLER IS NOT.
  //
  // The inventory classes a site by whether the extern lets the caller supply
  // the field the guard names. That heuristic is right for every other rule
  // here and wrong for this one, because the guard does not compare the field —
  // it compares the ACTION TIMESTAMP of the record the field points at, and
  // nothing in a payload can set that. Worth keeping as its own shape: a
  // `crafted` classification is a claim about the field, not about the rule.
  {
    entry: 'assessment',
    rule: 'Assessment past_cone exceeds {} entries.',
    why: 'the ceiling is 256 and every member must be a VALID Critique of the same target, so reaching it needs 257 real critiques — against §6\'s 20 per author per rolling hour. Nine hours of a single author doing nothing else, which is not a corpus run. The same shape as the friction gaps above: a limit whose cost is the budget rather than the payload',
  },
  {
    entry: 'settlement_status',
    rule: 'SettlementStatus inputs exceed {} entries.',
    why: 'same arithmetic as the Assessment cone ceiling — 257 inputs must each be a valid Assessment or Critique of this target, and critiques are capped at 20 per hour. Assessments are not capped, so this one is reachable IN PRINCIPLE with 257 assessments from one agent; it is gapped because writing 257 entries to assert one bound would dominate the run time of the whole corpus for a rule whose failure mode is a slow validator rather than a wrong verdict',
  },
  {
    entry: 'pre_registration',
    rule: 'PreRegistration question must predate the commitment, so a prediction cannot be re-pointed at a question chosen after the outcome.',
    why: 'the `question` hash IS caller-controlled, which is why the inventory classes this `crafted` — but the guard compares `question.action().timestamp()` against the commitment\'s own, and both timestamps are host-assigned. Any question that resolves was authored earlier, so the comparison can only be made to fire by a clock moved backwards — which is READINESS item 14\'s defect and has its own probe in `scripts/live-verify/clock-skew-reveal.mjs`, not a payload this corpus can write',
  },
];

const entries = [
  {
    entry: 'claim',
    label: 'Claim',
    fn: 'create_claim',
    baseline: () => ({
      content: 'corpus baseline claim',
      domain: 'CorpusDomain',
      author: myKey,
      timestamp: nowMicros(),
      evidence_hashes: [],
      confidence: 'Moderate',
      semantic_tags: [],
      source_mew: null,
    }),
    cases: [
      { rule: 'Claim content cannot be empty.', mutate: (c) => { c.content = ''; } },
      { rule: 'Claim domain cannot be empty.', mutate: (c) => { c.domain = ''; } },
      { rule: 'Claim author must match action author.', mutate: (c) => { c.author = danglingHash('agent', 1); } },
      // These two are classed `deferred`, not `honest`: the guard is a
      // must_get_entry, so a missing dependency abandons validation with
      // unresolved dependencies instead of returning Invalid. What is asserted
      // is therefore the real behaviour — the write STALLS, retryably — and the
      // site's own message is asserted NOT to appear, because a build where it
      // did would mean the semantics had changed.
      { rule: 'Claim evidence hash not found.', expect: 'deferral', mutate: (c) => { c.evidence_hashes = [danglingHash('entry', 2)]; } },
      { rule: 'Claim source_mew not found.', expect: 'deferral', mutate: (c) => { c.source_mew = danglingHash('entry', 3); } },
    ],
  },
  {
    entry: 'mew',
    label: 'Mew',
    fn: 'create_mew',
    baseline: () => ({
      content: 'corpus baseline mew',
      author: myKey,
      timestamp: nowMicros(),
      reply_to: null,
      semantic_tags: [],
      linked_claim: null,
    }),
    cases: [
      { rule: 'Mew author must match action author.', mutate: (m) => { m.author = danglingHash('agent', 11); } },
      { rule: 'Mew content cannot be empty.', mutate: (m) => { m.content = ''; } },
      // 561 and not 600: the guard is `content.len() > 560` on BYTES, and a
      // length chosen comfortably past the limit would pass against an
      // off-by-one that a boundary value catches. ASCII on purpose, so
      // `.len()` and the character count agree and the case is not secretly
      // about UTF-8 — the 2x margin in the message is the zome's own answer to
      // multi-byte content.
      { rule: 'Mew content exceeds 560 characters (2x tweet size for unicode safety).', mutate: (m) => { m.content = 'x'.repeat(561); } },
      // Deferred for the same reason as Claim's two: a must_get_entry guard.
      { rule: 'Mew linked_claim not found.', expect: 'deferral', mutate: (m) => { m.linked_claim = danglingHash('entry', 12); } },
    ],
  },
  {
    entry: 'evidence',
    label: 'Evidence',
    fn: 'create_evidence',
    // `evidence_type` is a unit enum variant and crosses as a bare string,
    // the same shape `Claim.confidence` uses above.
    baseline: () => ({
      content: 'corpus baseline evidence',
      evidence_type: 'Text',
      source_url: null,
      author: myKey,
      timestamp: nowMicros(),
    }),
    cases: [
      { rule: 'Evidence author must match action author.', mutate: (e) => { e.author = danglingHash('agent', 21); } },
      { rule: 'Evidence content cannot be empty.', mutate: (e) => { e.content = ''; } },
    ],
  },
  {
    entry: 'constitution',
    label: 'Constitution',
    fn: 'publish_constitution',
    baseline: () => ({
      agent: myKey,
      promises: [{ action: 'validate_claims', domain: 'CorpusDomain', modality: null }],
      conditions: [],
      published_at: nowMicros(),
      expires_at: null,
    }),
    cases: [
      { rule: 'Constitution agent must match action author.', mutate: (c) => { c.agent = danglingHash('agent', 31); } },
      { rule: 'Constitution must contain at least one promise.', mutate: (c) => { c.promises = []; } },
      // The promise list stays NON-EMPTY, or this would be refused by the rule
      // above and scored against the wrong one. Only `action` is blanked:
      // the guard is an `||` over both fields, and emptying both would not
      // distinguish which half fires.
      { rule: 'Promise action and domain cannot be empty.', mutate: (c) => { c.promises = [{ action: '', domain: 'CorpusDomain', modality: null }]; } },
      // EQUAL, not earlier. The guard is `expires <= published_at`, so equality
      // is the boundary the message's `>` actually claims; a date in the past
      // would also fire and would leave the `<` case unproven.
      { rule: 'expires_at must be > published_at.', mutate: (c) => { c.expires_at = c.published_at; } },
    ],
  },
  {
    entry: 'critique_species',
    label: 'CritiqueSpecies',
    fn: 'create_critique_species',
    baseline: () => ({
      name: 'CorpusSpecies',
      parent_species: null,
      required_evidence: [],
      proposer: myKey,
      created_at: nowMicros(),
    }),
    cases: [
      { rule: 'CritiqueSpecies proposer must match action author.', mutate: (s) => { s.proposer = danglingHash('agent', 41); } },
      { rule: 'CritiqueSpecies name cannot be empty.', mutate: (s) => { s.name = ''; } },
      // Deferred: a must_get_entry guard, as with Claim and Mew.
      { rule: 'Parent CritiqueSpecies not found.', expect: 'deferral', mutate: (s) => { s.parent_species = danglingHash('entry', 42); } },
    ],
  },
  // --- THE FIRST ENTRY TYPE WITH A DEPENDENCY CHAIN. Everything above is a
  // payload: a valid one can be written down field by field. A valid
  // `Retraction` cannot, because `target_claim` must be the EntryHash of a
  // Claim that exists and belongs to the retracting agent, so `setup` publishes
  // one first. That is the whole of what made this entry type "a different and
  // much larger job than a payload" — one extra call, not a new mechanism.
  //
  // TWO HASHES COME OUT OF SETUP AND THEY ARRIVE DIFFERENTLY, which is worth
  // stating because getting it wrong looks like a validation bug. `create_claim`
  // returns an ActionHash and `Retraction.target_claim` is an EntryHash, so the
  // claim's entry hash is read back off the record
  // (`signed_action.hashed.content.data.entry_hash`, the same path
  // `membranes-ui.mjs` uses). `create_evidence` is this zome's exception: it
  // ends `hash_entry(&evidence)` and hands back the EntryHash directly.
  {
    entry: 'retraction',
    label: 'Retraction',
    fn: 'create_retraction',
    chainNote: 'published a Claim to retract, and an Evidence entry to stand in as a non-Claim target',
    setup: async () => {
      // A per-run domain, so a re-run cannot read a previous run's claim out of
      // the index and retract something this run did not publish.
      const domain = `CorpusRetraction${Date.now()}`;
      await call('create_claim', {
        content: 'corpus claim, published in order to be retracted',
        domain, author: myKey, timestamp: nowMicros(),
        evidence_hashes: [], confidence: 'Moderate', semantic_tags: [], source_mew: null,
      });
      const claims = await call('get_claims_by_domain', domain);
      if (!claims.length) throw new Error(`the claim did not come back from get_claims_by_domain(${domain})`);
      const targetClaim = claims[0].signed_action.hashed.content.data.entry_hash;

      // A real entry that is NOT a Claim, for the target-type rule. It has to
      // RESOLVE — a dangling hash defers instead, which is the case above it.
      const notAClaim = await call('create_evidence', {
        content: 'corpus evidence, used only as a non-Claim retraction target',
        evidence_type: 'Text', source_url: null, author: myKey, timestamp: nowMicros(),
      });

      // THE SECOND AGENT'S CLAIM — item 5f. Authored by agent 2 so that
      // `claim.author != retraction.author` can be true while
      // `retraction.author == action.author()` still holds, which is the only
      // way to reach the ownership rule: forging `author` is refused one rule
      // earlier. Its own domain, so the index read cannot pick up agent 1's.
      const otherDomain = `CorpusRetractionOther${Date.now()}`;
      await callOther('create_claim', {
        content: "corpus claim, published by the OTHER agent so agent 1 can fail to retract it",
        domain: otherDomain, author: otherKey, timestamp: nowMicros(),
        evidence_hashes: [], confidence: 'Moderate', semantic_tags: [], source_mew: null,
      });
      const othersClaim = await awaitVisibleToMe(
        async () => {
          const found = await call('get_claims_by_domain', otherDomain);
          return found.length ? found[0].signed_action.hashed.content.data.entry_hash : null;
        },
        "the second agent's Claim",
      );

      return { targetClaim, notAClaim, othersClaim };
    },
    baseline: (ctx) => ({
      target_claim: ctx.targetClaim,
      reason: 'corpus baseline retraction',
      replacement_claim: null,
      author: myKey,
      timestamp: nowMicros(),
    }),
    cases: [
      { rule: 'Retraction author must match action author.', mutate: (r) => { r.author = danglingHash('agent', 51); } },
      // RECLASSIFIED 2026-10-17, measured rather than reasoned: the guard is
      // `let Ok(target) = must_get_entry(..) else`, so a nonexistent target
      // defers the commit (`DepMissingFromDht`) and this message never fires.
      // The inventory called it `honest` until enumerate.mjs learned the
      // let-else shape. Asserting the message here would have failed forever.
      { rule: 'Retraction target claim not found.', expect: 'deferral', mutate: (r) => { r.target_claim = danglingHash('entry', 52); } },
      // The distinction the line above exists to protect: this target RESOLVES
      // and is the wrong type, which is a refusal with a message, six lines
      // below a must_get in the same validator.
      { rule: 'Retraction target must be a Claim.', mutate: (r, ctx) => { r.target_claim = ctx.notAClaim; } },
      { rule: 'Retraction reason cannot be empty.', mutate: (r) => { r.reason = ''; } },
      { rule: 'Retraction replacement_claim not found.', expect: 'deferral', mutate: (r) => { r.replacement_claim = danglingHash('entry', 53); } },
      // CLOSED BY THE SECOND AGENT — item 5f. `author` stays agent 1's, so the
      // author-match rule above passes; only the TARGET changes, to a Claim
      // agent 2 published. Nothing is forged.
      {
        rule: "A Retraction can only be published by the claim's own author — it records that the author no longer stands by it, not that someone else disagrees. Use a Critique for that.",
        mutate: (r, ctx) => { r.target_claim = ctx.othersClaim; },
      },
    ],
  },
  // --- CRITIQUE. A target that EXISTS and is a critiquable type, so the chain
  // is one Claim — plus a Mew, which exists and is deliberately NOT critiquable
  // (the list is Claim, Critique, Constitution, Membrane, CritiqueSpecies).
  //
  // `target` is an AnyLinkableHash and the validator resolves it with
  // must_get_entry, so it is the Claim's ENTRY hash, read off the record the
  // same way Retraction's is.
  {
    entry: 'critique',
    label: 'Critique',
    fn: 'create_critique',
    chainNote: 'published a Claim to critique, and a Mew as a non-critiquable target',
    setup: async () => {
      const domain = `CorpusCritique${Date.now()}`;
      const claimAction = await call('create_claim', {
        content: 'corpus claim, published in order to be critiqued',
        domain, author: myKey, timestamp: nowMicros(),
        evidence_hashes: [], confidence: 'Moderate', semantic_tags: [], source_mew: null,
      });
      const claims = await call('get_claims_by_domain', domain);
      if (!claims.length) throw new Error(`the claim did not come back from get_claims_by_domain(${domain})`);
      const target = claims[0].signed_action.hashed.content.data.entry_hash;
      // A Mew is a real entry and not on the critiquable list, which is what
      // separates "wrong type" from "no such entry" (the latter defers).
      const notCritiquable = await call('create_evidence', {
        content: 'corpus evidence, used only as a non-critiquable critique target',
        evidence_type: 'Text', source_url: null, author: myKey, timestamp: nowMicros(),
      });
      // --- past-cone fixtures, protocol_version 10 ------------------------
      // `coneMember` is a real critique of THIS target, so it is a legal cone
      // entry. `coneWithOwnCone` cites it, so its own cone is non-empty —
      // which is what the transitive-closure case needs: admitting it while
      // omitting what it admitted is the under-claiming attack.
      const coneMember = await call('create_critique', {
        target, target_type: 'Claim', critique_mode: 'Methodological',
        content: 'corpus critique, used as a legal past_cone member',
        author: myKey, timestamp: nowMicros(), replication_attempted: false,
        evidence_hashes: [], species: null, past_cone: [],
      });
      const coneWithOwnCone = await call('create_critique', {
        target, target_type: 'Claim', critique_mode: 'Methodological',
        content: 'corpus critique whose own cone is non-empty',
        author: myKey, timestamp: nowMicros(), replication_attempted: false,
        evidence_hashes: [], species: null, past_cone: [coneMember],
      });
      // A critique of a DIFFERENT target, for the same-target rule.
      const otherDomain = `CorpusConeOther${Date.now()}`;
      await call('create_claim', {
        content: 'corpus claim in another domain, critiqued for the cone rule',
        domain: otherDomain, author: myKey, timestamp: nowMicros(),
        evidence_hashes: [], confidence: 'Moderate', semantic_tags: [], source_mew: null,
      });
      const otherClaims = await call('get_claims_by_domain', otherDomain);
      const otherTarget = otherClaims[0].signed_action.hashed.content.data.entry_hash;
      const foreignCone = await call('create_critique', {
        target: otherTarget, target_type: 'Claim', critique_mode: 'Methodological',
        content: 'corpus critique of a different target entirely',
        author: myKey, timestamp: nowMicros(), replication_attempted: false,
        evidence_hashes: [], species: null, past_cone: [],
      });
      return { target, claimAction, notCritiquable, domain, coneMember, coneWithOwnCone, foreignCone };
    },
    baseline: (ctx) => ({
      target: ctx.target,
      target_type: 'Claim',
      critique_mode: 'Logical',
      content: 'corpus baseline critique',
      author: myKey,
      timestamp: nowMicros(),
      replication_attempted: false,
      evidence_hashes: [],
      species: null,
      past_cone: [],
    }),
    cases: [
      { rule: 'Critique author must match action author.', mutate: (c) => { c.author = danglingHash('agent', 61); } },
      // The target really is a Claim; the payload CLAIMS it is a Constitution.
      // Both halves have to be true at once or this is the rule below instead.
      { rule: 'Critique target_type does not match what the target actually is.', mutate: (c) => { c.target_type = 'Constitution'; } },
      { rule: 'Critique target is not a critiquable entry type.', mutate: (c, ctx) => { c.target = ctx.notCritiquable; } },
      { rule: 'Critique content cannot be empty.', mutate: (c) => { c.content = ''; } },
      { rule: 'Critique species reference not found.', expect: 'deferral', mutate: (c) => { c.species = danglingHash('entry', 62); } },
      // --- the past cone, protocol_version 10 ---------------------------
      // The size rule is SHADOWED — `create_critique` refuses over the
      // ceiling first, in the coordinator's own wording — so it is classed
      // `shadowed` by enumerate.mjs and is out of this denominator by class,
      // not by exemption. The other five are reachable.
      {
        rule: 'Critique past_cone contains a duplicate entry.',
        mutate: (c, ctx) => { c.past_cone = [ctx.coneMember, ctx.coneMember]; },
      },
      {
        rule: 'Critique past_cone entry does not resolve to a valid record; an author cannot record having seen something that does not exist.',
        expect: 'deferral',
        mutate: (c) => { c.past_cone = [danglingHash('action', 63)]; },
      },
      {
        rule: 'Critique past_cone entry is not a Critique.',
        // THE CLAIM'S OWN ACTION HASH: it resolves through
        // `must_get_valid_record` and is not a Critique, so this is a type
        // failure rather than a missing dependency.
        //
        // Two wrong answers were tried first, and both are instructive.
        // `ctx.claimAction` did not exist, so it fell through to a dangling
        // hash — which DEFERS rather than refusing, and the case red for the
        // wrong reason. Then `notCritiquable` looked right and is not:
        // `create_evidence` returns an **EntryHash**, and `past_cone` is
        // `Vec<ActionHash>`, so the payload failed to deserialize at the
        // extern boundary before validation saw it at all.
        mutate: (c, ctx) => { c.past_cone = [ctx.claimAction]; },
      },
      {
        rule: 'Critique past_cone entry critiques a different target; a cone records what was seen OF THIS NODE, not of the DHT at large.',
        mutate: (c, ctx) => { c.past_cone = [ctx.foreignCone]; },
      },
      // THE UNDER-CLAIMING ATTACK, as a corpus case: admit a critique while
      // omitting what that critique itself admitted seeing.
      {
        rule: 'Critique past_cone is not transitively closed: it records having seen a critique without recording what that critique itself recorded seeing. Admitting X means admitting everything X admitted.',
        mutate: (c, ctx) => { c.past_cone = [ctx.coneWithOwnCone]; },
      },
      // LAST, AND THE DRIVER ENFORCES THAT. This one is not a broken payload —
      // it is a valid one sent once past the limit, so it needs 20 commits
      // first and it leaves this agent unable to publish a Critique for the
      // rest of the rolling hour. See the baseline check's saturation note.
    ],
  },
  // --- ANTIBODYPATTERN. The same shape as Critique, including its own friction
  // rule with its own counter: the rule counts AntibodyPattern creates, so
  // Critique's 20 do not move it and the two cases do not interfere.
  {
    entry: 'antibody_pattern',
    label: 'AntibodyPattern',
    fn: 'publish_antibody_pattern',
    chainNote: 'reused a Claim as the flagged target, and an Evidence as a non-critiquable one',
    setup: async () => {
      const domain = `CorpusAntibody${Date.now()}`;
      await call('create_claim', {
        content: 'corpus claim, published in order to be flagged',
        domain, author: myKey, timestamp: nowMicros(),
        evidence_hashes: [], confidence: 'Moderate', semantic_tags: [], source_mew: null,
      });
      const claims = await call('get_claims_by_domain', domain);
      if (!claims.length) throw new Error(`the claim did not come back from get_claims_by_domain(${domain})`);
      const target = claims[0].signed_action.hashed.content.data.entry_hash;
      const notCritiquable = await call('create_evidence', {
        content: 'corpus evidence, used only as a non-critiquable antibody target',
        evidence_type: 'Text', source_url: null, author: myKey, timestamp: nowMicros(),
      });
      return { target, notCritiquable };
    },
    baseline: (ctx) => ({
      target: ctx.target,
      target_type: 'Claim',
      kind: 'SpamFlood',
      rationale: 'corpus baseline antibody pattern',
      author: myKey,
      timestamp: nowMicros(),
    }),
    cases: [
      { rule: 'AntibodyPattern author must match action author.', mutate: (a) => { a.author = danglingHash('agent', 71); } },
      { rule: 'AntibodyPattern target_type does not match what the target actually is.', mutate: (a) => { a.target_type = 'Constitution'; } },
      { rule: 'AntibodyPattern target is not a critiquable entry type.', mutate: (a, ctx) => { a.target = ctx.notCritiquable; } },
      { rule: 'AntibodyPattern rationale cannot be empty.', mutate: (a) => { a.rationale = ''; } },
    ],
  },
  // --- MEMBRANE. Depth 1: the creator's OWN published Constitution, by
  // ActionHash (not EntryHash — the validator uses must_get_valid_record, which
  // wants an action). `publish_constitution` returns exactly that.
  //
  // Note the ORDER the validator checks in, because it decides two payloads:
  // `required_promises` is checked BEFORE the constitution is fetched, so the
  // empty-promises case needs a valid constitution anyway; and the
  // does-not-resolve case needs an ActionHash that RESOLVES to something that
  // is not a Constitution, since a dangling one defers via `?` instead.
  {
    entry: 'membrane',
    label: 'Membrane',
    // `attempt_unaccountable_membrane`, NOT `create_membrane`, and this is the
    // whole lesson of this entry type. `create_membrane` mirrors all four of
    // these rules as coordinator pre-checks and refuses FIRST with its own
    // wording — so every case below "passed" by being refused for the wrong
    // reason, and the integrity messages never appeared. The prober is
    // `create_entry` with nothing in front of it, which its own doc comment
    // says is why it exists: so DHT validation can be observed refusing rather
    // than assumed to. Measured, 2026-10-17: via `create_membrane` the
    // empty-promises case came back `Membrane must declare at least one
    // required_promise.` (the coordinator's string, not the zome's) and the
    // bad-constitution case came back `Deserialize("missing field \`agent\`")`.
    fn: 'attempt_unaccountable_membrane',
    chainNote: "published the creator's own Constitution, plus a Claim whose ActionHash is not a Constitution",
    setup: async () => {
      const domain = `CorpusMembrane${Date.now()}`;
      const constitution = await call('publish_constitution', {
        agent: myKey,
        promises: [{ action: 'state what this domain demands', domain, modality: null }],
        conditions: [],
        published_at: nowSecs(),
        expires_at: null,
      });
      // AN ACTION WITH NO APP ENTRY, and getting here took two wrong answers
      // that are worth keeping, because the obvious payload does not reach this
      // rule at all.
      //
      // The guard is:
      //     let record = must_get_valid_record(membrane.constitution)?;
      //     let c: Option<Constitution> = record.entry().to_app_option()
      //         .map_err(..)?;
      //     let Some(c) = c else { return Invalid("... does not resolve ...") };
      //
      // So the message needs `to_app_option` to return Ok(NONE). A dangling
      // hash does not do it — `must_get_valid_record(..)?` defers the commit
      // instead. A Claim's ActionHash does not do it either: a Claim IS an app
      // entry, so the deserialize FAILS and `.map_err(..)?` raises
      // `Deserialize("missing field \`agent\`")`, a wasm error rather than this
      // rule. Measured both ways before this worked.
      //
      // Ok(None) needs a record whose entry is not applicable, i.e. an action
      // that carries no app entry — a CreateLink. `attempt_false_attachment_link`
      // returns exactly that ActionHash, and given VALID arguments the link
      // commits, so the record is fetchable by `must_get_valid_record`.
      const claimAction = await call('create_claim', {
        content: 'corpus claim, the target of the link below',
        domain, author: myKey, timestamp: nowMicros(),
        evidence_hashes: [], confidence: 'Moderate', semantic_tags: [], source_mew: null,
      });
      const linkAction = await call('attempt_false_attachment_link', {
        kind: 'AgentToClaim',
        base: claimAction,          // replaced by the agent anchor via anchor_of
        target: claimAction,        // AgentToClaim target must be an ActionHash
        // The tag is not optional in practice: `AgentToClaim tag must be the
        // claim's own domain, which is the only domain a by-agent reader has to
        // go on.` A null tag is refused, so the link would never commit and the
        // record would not exist to be fetched.
        tag: Array.from(Buffer.from(domain, 'utf8')),
        anchor_of: myKey,
        question_anchor_of: null,
      });
      return { constitution, notAConstitution: linkAction, domain, others: await otherAgentFixtures() };
    },
    baseline: (ctx) => ({
      domain: ctx.domain,
      description: 'corpus baseline membrane',
      required_promises: ['state what this domain demands'],
      validation_rules_hash: null,
      creator: myKey,
      created_at: nowSecs(),
      constitution: ctx.constitution,
    }),
    cases: [
      { rule: 'Membrane creator must match action author.', mutate: (m) => { m.creator = danglingHash('agent', 81); } },
      { rule: 'Membrane domain cannot be empty.', mutate: (m) => { m.domain = ''; } },
      { rule: 'Membrane must declare at least one required_promise — a domain states what it demands of its participants rather than charging them to enter.', mutate: (m) => { m.required_promises = []; } },
      // `notAConstitution` is a CreateLink action hash, not a Claim's — see
      // setup for why a Claim's raises a deserialize error instead of this rule.
      { rule: "Membrane's constitution hash does not resolve to a Constitution entry.", mutate: (m, ctx) => { m.constitution = ctx.notAConstitution; } },
      // CLOSED BY THE SECOND AGENT — item 5f. `creator` stays agent 1's, so the
      // creator-matches-author rule still passes; the constitution cited is
      // agent 2's, so `constitution.agent != membrane.creator` fires. Driven
      // through the prober because create_membrane pre-checks this one.
      {
        rule: "Membrane's constitution must be the creator's own published Constitution — a founder is accountable under promises they made themselves.",
        mutate: (m, ctx) => { m.constitution = ctx.others.constitution; },
      },
    ],
  },
  // --- FEDERATIONRECORD. Depth 2, and the deepest chain in the zome: a
  // Constitution, then a Membrane that cites it, then that Membrane's ENTRY
  // hash. `create_membrane` returns an ActionHash and
  // `FederationRecord.local_membrane` is an EntryHash, so the entry hash is
  // read back off `get_membranes()` — the same asymmetry Retraction documents.
  {
    entry: 'federation_record',
    label: 'FederationRecord',
    fn: 'record_federation',
    chainNote: 'Constitution -> Membrane -> its EntryHash, the deepest chain here',
    setup: async () => {
      const domain = `CorpusFederation${Date.now()}`;
      const constitution = await call('publish_constitution', {
        agent: myKey,
        promises: [{ action: 'recognise peer networks honestly', domain, modality: null }],
        conditions: [],
        published_at: nowSecs(),
        expires_at: null,
      });
      // The REAL create_membrane here, not the prober: this membrane has to be
      // valid AND indexed, because the entry hash is read back off
      // `get_membranes()`, which is link-only by design and so cannot see an
      // entry the prober wrote without a registry link.
      const membraneAction = await call('create_membrane', {
        domain,
        description: 'corpus membrane, published in order to be federated',
        required_promises: ['recognise peer networks honestly'],
        validation_rules_hash: null,
        creator: myKey,
        created_at: nowSecs(),
        constitution,
      });
      const membranes = await call('get_membranes');
      // MATCHED BY ACTION HASH, and the first attempt matched on the domain
      // string instead — which cannot work and is worth recording: a Record's
      // entry crosses as msgpack BYTES, so the domain is not present as text
      // anywhere in the JSON and `JSON.stringify(r).includes(domain)` is false
      // for the very record it is looking for. The action hash is a field, so
      // it compares.
      const key = Buffer.from(membraneAction).toString('base64');
      const row = membranes.find((r) => Buffer.from(r.signed_action.hashed.hash).toString('base64') === key);
      if (!row) throw new Error(`the membrane just created did not come back from get_membranes (${membranes.length} returned)`);
      const localMembrane = row.signed_action.hashed.content.data.entry_hash;
      const notAMembrane = await call('create_evidence', {
        content: 'corpus evidence, used only as a non-Membrane entry hash',
        evidence_type: 'Text', source_url: null, author: myKey, timestamp: nowMicros(),
      });
      return { localMembrane, notAMembrane, domain, others: await otherAgentFixtures() };
    },
    baseline: (ctx) => ({
      local_membrane: ctx.localMembrane,
      remote_network_label: 'corpus-remote-net',
      remote_membrane_ref: 'corpus-remote-ref',
      author: myKey,
      created_at: nowSecs(),
    }),
    cases: [
      { rule: 'FederationRecord author must match action author.', mutate: (f) => { f.author = danglingHash('agent', 91); } },
      { rule: 'FederationRecord local_membrane not found.', expect: 'deferral', mutate: (f) => { f.local_membrane = danglingHash('entry', 92); } },
      { rule: 'FederationRecord local_membrane is not a Membrane entry.', mutate: (f, ctx) => { f.local_membrane = ctx.notAMembrane; } },
      { rule: 'FederationRecord remote_network_label cannot be empty.', mutate: (f) => { f.remote_network_label = ''; } },
      { rule: 'FederationRecord remote_membrane_ref cannot be empty.', mutate: (f) => { f.remote_membrane_ref = ''; } },
      // CLOSED BY THE SECOND AGENT — item 5f. `author` stays agent 1's so the
      // author-match rule passes; the membrane federated is agent 2's, so
      // `membrane.creator != record.author` fires.
      {
        rule: "FederationRecord can only be authored by local_membrane's own creator.",
        mutate: (f, ctx) => { f.local_membrane = ctx.others.membraneEntry; },
      },
    ],
  },
  // ==========================================================================
  // THE FORESIGHT FAMILY — and these three were excluded on a reason that
  // turned out to be wrong, in the same way the `Retraction` exclusion was.
  //
  // The note above `COVERED` used to say `WorldlineTrace` and `Revelation`
  // needed "dependency chains rather than payloads, which is a larger job than
  // this file". The chains were the cheap part and were ALREADY BUILT —
  // `otherAgentFixtures()` has published a trace, a commitment and a reveal
  // since item 5f, for the link rules. What actually blocks these types is
  // narrower and does not look like a chain at all: most of their fields are
  // DERIVED BY THE EXTERN, so the rules about them are `needs_extern` and
  // unreachable from JavaScript at any effort. Eight of the eighteen sites
  // across the three are that, and they stay out of the denominator by class.
  //
  // What IS reachable is what a caller actually hands in: a deadline, a
  // question hash, an expiry, and the content offered at reveal time. Those
  // are the eight cases below, and they take the foresight primitive from
  // "link rules only" to "the entry rules a client can actually trip".
  // ==========================================================================
  {
    entry: 'worldline_trace',
    label: 'WorldlineTrace',
    // THE PROBER, NOT `generate_worldline_trace` — the same call the `membrane`
    // spec makes, and for the same reason. The real extern derives the agent,
    // the boundaries and the checksum, so driving it proves only that the
    // coordinator builds a valid entry and leaves six rules unreachable. See
    // the probers' header in the coordinator (READINESS 5g).
    fn: 'attempt_raw_worldline_trace',
    chainNote: "an action of this agent's own for a period boundary to sample",
    setup: async () => {
      const sampleAction = await call('create_claim', {
        content: 'corpus claim, sampled by a period boundary', domain: `CorpusTrace${Date.now()}`,
        author: myKey, timestamp: nowMicros(), evidence_hashes: [],
        confidence: 'Moderate', semantic_tags: [], source_mew: null,
      });
      return { sampleAction, others: await otherAgentFixtures() };
    },
    baseline: (ctx) => ({
      agent: myKey,
      period_boundaries: [{
        start_time: nowSecs() - 3600, end_time: nowSecs(),
        sample_action: ctx.sampleAction, domain_tag: 'corpus', entry_count: 1,
      }],
      expertise_tags: ['corpus'],
      trace_payload: null,
      binding_key: null,
      checksum: new Uint8Array(32),
      created_at: nowSecs(),
      expires_at: null,
    }),
    cases: [
      { rule: 'WorldlineTrace agent must match action author.', mutate: (t) => { t.agent = danglingHash('agent', 111); } },
      { rule: 'WorldlineTrace must have at least one period boundary.', mutate: (t) => { t.period_boundaries = []; } },
      // CLOSED BY THE SECOND AGENT: the boundary samples an action agent 2
      // authored while the trace still claims to be agent 1's, so the
      // agent-match rule above passes and this one fires.
      {
        rule: 'PeriodBoundary sample_action must be authored by trace agent.',
        mutate: (t, ctx) => { t.period_boundaries[0].sample_action = ctx.others.claimAction; },
      },
      // `must_get_valid_record`, so a missing sample DEFERS. This was a
      // declared GAP until the prober existed, because the extern built every
      // boundary from the caller's own chain and no payload could carry a
      // dangling one.
      {
        rule: 'PeriodBoundary sample_action not found.',
        expect: 'deferral',
        mutate: (t) => { t.period_boundaries[0].sample_action = danglingHash('action', 112); },
      },
      { rule: 'Checksum must be 32 bytes.', mutate: (t) => { t.checksum = new Uint8Array(31); } },
      {
        rule: 'PeriodBoundary start_time must be <= end_time.',
        mutate: (t) => { const b = t.period_boundaries[0]; b.start_time = b.end_time + 1; },
      },
      { rule: 'expires_at must be > created_at.', mutate: (t) => { t.expires_at = t.created_at - 1; } },
      { rule: 'trace_payload exceeds 64KB limit.', mutate: (t) => { t.trace_payload = new Uint8Array(65_537); } },
    ],
  },
  {
    entry: 'pre_registration',
    label: 'PreRegistration',
    fn: 'attempt_raw_pre_registration',
    chainNote: 'a question published BEFORE the commitment, which is what the rule requires',
    setup: async () => {
      const question = await call('create_claim', {
        content: 'corpus question, posed before anything is committed about it',
        domain: `CorpusForesight${Date.now()}`, author: myKey, timestamp: nowMicros(),
        evidence_hashes: [], confidence: 'Moderate', semantic_tags: [], source_mew: null,
      });
      return { question };
    },
    // `sealed` IS NOT VALIDATED AT COMMIT TIME, and a dangling hash here is
    // correct rather than lazy: the commitment is checked at REVEAL by
    // recomputing `hash_entry` over the disclosed content, which is the only
    // moment that content exists publicly. A validator trusting this field
    // would be trusting the committer about their own commitment.
    baseline: (ctx) => ({
      question: ctx.question,
      sealed: danglingHash('entry', 115),
      reveal_deadline: nowMicros() + 3_600_000_000,
      author: myKey,
      timestamp: nowMicros(),
    }),
    cases: [
      { rule: 'PreRegistration author must match action author.', mutate: (p) => { p.author = danglingHash('agent', 113); } },
      {
        rule: 'PreRegistration reveal_deadline must be after the commitment itself; a commitment that is already expired can never be revealed and would pad the denominator.',
        mutate: (p) => { p.reveal_deadline = nowMicros() - 3_600_000_000; },
      },
      {
        rule: 'PreRegistration question does not resolve.',
        expect: 'deferral',
        mutate: (p) => { p.question = danglingHash('action', 114); },
      },
    ],
  },
  {
    entry: 'revelation',
    label: 'Revelation',
    fn: 'attempt_raw_revelation',
    chainNote: 'question -> commitment, plus a SECOND commitment deliberately left to expire',
    setup: async () => {
      const question = await call('create_claim', {
        content: 'corpus question for the reveal path, posed first',
        domain: `CorpusReveal${Date.now()}`, author: myKey, timestamp: nowMicros(),
        evidence_hashes: [], confidence: 'Moderate', semantic_tags: [], source_mew: null,
      });
      const PRED = 'corpus prediction, revealed by its own committer';
      const SALT = 'corpus-reveal-salt-3b9d';
      // The REAL `pre_register`, not the prober: this commitment has to carry a
      // sealed hash the revealed content actually hashes to, which is exactly
      // what the prober deliberately does not compute.
      const mine = await call('pre_register', {
        question, prediction: PRED, salt: SALT, reveal_deadline: nowMicros() + 3_600_000_000,
      });
      // A SECOND COMMITMENT WHOSE WINDOW CLOSES DURING THIS RUN. The late-reveal
      // rule cannot be reached with the baseline commitment, because a deadline
      // already in the past is refused by `validate_pre_registration` at commit
      // time — so the only way in is to commit a real future deadline and let it
      // lapse. Three seconds, which is the whole cost of this spec.
      const EXP_PRED = 'corpus prediction whose window closes before it is revealed';
      const EXP_SALT = 'corpus-expired-salt-5c1e';
      const expiring = await call('pre_register', {
        question, prediction: EXP_PRED, salt: EXP_SALT, reveal_deadline: nowMicros() + 2_000_000,
      });
      await new Promise((r) => setTimeout(r, 3500));
      return { question, mine, expiring, PRED, SALT, EXP_PRED, EXP_SALT, others: await otherAgentFixtures() };
    },
    baseline: (ctx) => ({
      pre_registration: ctx.mine, prediction: ctx.PRED, salt: ctx.SALT,
      author: myKey, timestamp: nowMicros(),
    }),
    cases: [
      { rule: 'Revelation author must match action author.', mutate: (r) => { r.author = danglingHash('agent', 116); } },
      {
        rule: 'Revelation pre_registration does not resolve.',
        expect: 'deferral',
        mutate: (r) => { r.pre_registration = danglingHash('action', 117); },
      },
      {
        rule: 'Revelation pre_registration is not a PreRegistration.',
        mutate: (r, ctx) => { r.pre_registration = ctx.question; },
      },
      // CLOSED BY THE SECOND AGENT — item 5f again. Agent 2's commitment is
      // already published and awaited visible by otherAgentFixtures().
      //
      // IT OFFERS AGENT 2'S REAL CONTENT, AND THAT IS THE POINT OF THE CASE.
      // The first version passed agent 1's own prediction and salt, and
      // injection BH showed what that cost: with the author rule removed, the
      // forged reveal was refused by the HASH check one line later, so the case
      // reddened for a reason unrelated to the rule it names and would have
      // gone on passing if the author rule were deleted. Content that hashes
      // correctly leaves the author rule as the only check that can refuse it.
      //
      // It also sharpens what the rule is for: against somebody who does not
      // know the committed content the hash check already suffices, so the
      // author rule's unique work is against somebody who DOES — after a reveal
      // elsewhere, or a leak.
      {
        rule: 'Only the author of a PreRegistration may reveal it.',
        mutate: (r, ctx) => {
          r.pre_registration = ctx.others.preRegAction;
          r.prediction = ctx.others.preRegPrediction;
          r.salt = ctx.others.preRegSalt;
        },
      },
      {
        rule: 'Revelation content does not hash to the sealed commitment; this is not what was committed to.',
        mutate: (r) => { r.prediction = 'not what was committed to'; },
      },
      // THE SALT AND PREDICTION MOVE WITH THE COMMITMENT, deliberately: the
      // hash check runs BEFORE the deadline check, so revealing the expired
      // commitment with the baseline's content would fire the hash rule and
      // this case would pass for the wrong reason.
      {
        rule: 'Revelation is past its reveal_deadline. A late reveal would let the author choose, after seeing the outcome, whether the commitment counts as revealed or expired.',
        mutate: (r, ctx) => { r.pre_registration = ctx.expiring; r.prediction = ctx.EXP_PRED; r.salt = ctx.EXP_SALT; },
      },
    ],
  },
  {
    entry: 'settlement_policy',
    label: 'SettlementPolicy',
    fn: 'publish_settlement_policy',
    baseline: () => ({
      author: myKey, name: 'corpus-policy', min_assessors: 2, max_dissent: 0,
      statement: 'corpus policy, published so a status can cite it', published_at: nowSecs(),
    }),
    cases: [
      { rule: 'SettlementPolicy author must match action author.', mutate: (p) => { p.author = danglingHash('agent', 131); } },
      { rule: 'SettlementPolicy name cannot be empty.', mutate: (p) => { p.name = ''; } },
      {
        rule: 'SettlementPolicy statement cannot be empty; a threshold nobody explained is a number pretending to be a reason.',
        mutate: (p) => { p.statement = ''; },
      },
      {
        rule: 'SettlementPolicy min_assessors must be at least 1; a policy settling on zero assessments would settle anything.',
        mutate: (p) => { p.min_assessors = 0; },
      },
    ],
  },
  {
    entry: 'assessment',
    label: 'Assessment',
    fn: 'publish_assessment',
    chainNote: 'the shared cone fixtures — see coneFixtures() on why they are shared',
    setup: async () => coneFixtures(),
    baseline: (ctx) => ({
      assessor: myKey, target: ctx.target, stance: 'Supports', confidence: 'Moderate',
      rationale: 'corpus baseline assessment', past_cone: [], timestamp: nowMicros(),
    }),
    cases: [
      { rule: 'Assessment assessor must match action author.', mutate: (a) => { a.assessor = danglingHash('agent', 132); } },
      // AN ACTION HASH, not an agent one. `AnyLinkableHash` does carry agent
      // keys in principle, but a dangling agent hash does not survive the
      // extern boundary — the payload failed to DESERIALIZE before validation
      // saw it, so the case red for the wrong reason. A real ActionHash is a
      // valid `AnyLinkableHash` and is not EntryHash-shaped, which is exactly
      // the condition this rule names.
      { rule: 'Assessment target must be an EntryHash-shaped reference.', mutate: (a, ctx) => { a.target = ctx.member; } },
      { rule: 'Assessment target not found.', expect: 'deferral', mutate: (a) => { a.target = danglingHash('entry', 134); } },
      { rule: 'Assessment past_cone contains a duplicate entry.', mutate: (a, ctx) => { a.past_cone = [ctx.member, ctx.member]; } },
      {
        rule: 'Assessment past_cone entry does not resolve to a valid record.',
        expect: 'deferral',
        mutate: (a) => { a.past_cone = [danglingHash('action', 135)]; },
      },
      { rule: 'Assessment past_cone entry is not a Critique.', mutate: (a, ctx) => { a.past_cone = [ctx.notACritique]; } },
      { rule: 'Assessment past_cone entry critiques a different target.', mutate: (a, ctx) => { a.past_cone = [ctx.foreign]; } },
      { rule: 'Assessment past_cone is not transitively closed.', mutate: (a, ctx) => { a.past_cone = [ctx.withOwnCone]; } },
    ],
  },
  {
    entry: 'settlement_status',
    label: 'SettlementStatus',
    fn: 'publish_settlement_status',
    chainNote: 'a policy, a target, two assessments and a critique of something else',
    setup: async () => {
      const domain = `CorpusStatus${Date.now()}`;
      await call('create_claim', {
        content: 'corpus claim whose status is computed', domain, author: myKey,
        timestamp: nowMicros(), evidence_hashes: [], confidence: 'Moderate',
        semantic_tags: [], source_mew: null,
      });
      const claims = await call('get_claims_by_domain', domain);
      const target = claims[0].signed_action.hashed.content.data.entry_hash;
      const policy = await call('publish_settlement_policy', {
        author: myKey, name: 'corpus-status-policy', min_assessors: 1, max_dissent: 0,
        statement: 'corpus policy for the status cases', published_at: nowSecs(),
      });
      const mine = await call('publish_assessment', {
        assessor: myKey, target, stance: 'Supports', confidence: 'Moderate',
        rationale: null, past_cone: [], timestamp: nowMicros(),
      });
      const others = await otherAgentFixtures();
      // An assessment of a DIFFERENT target, for the scope rule.
      const otherDomain = `CorpusStatusOther${Date.now()}`;
      await call('create_claim', {
        content: 'corpus claim in another domain', domain: otherDomain, author: myKey,
        timestamp: nowMicros(), evidence_hashes: [], confidence: 'Moderate',
        semantic_tags: [], source_mew: null,
      });
      const oc = await call('get_claims_by_domain', otherDomain);
      const otherTarget = oc[0].signed_action.hashed.content.data.entry_hash;
      const foreignAssessment = await call('publish_assessment', {
        assessor: myKey, target: otherTarget, stance: 'Supports', confidence: 'Moderate',
        rationale: null, past_cone: [], timestamp: nowMicros(),
      });
      // The SHARED foreign critique rather than a fresh one — see
      // coneFixtures(). Each extra critique is a SynapticLink against a
      // 20-per-hour ceiling, and finding 17 records what happens at it.
      const cone = await coneFixtures();
      return { target, policy, mine, foreignAssessment, foreignCritique: cone.foreign, domain };
    },
    // Baseline: one assessor, no dissent, min_assessors 1 -> Settled.
    baseline: (ctx) => ({
      aggregator: myKey, target: ctx.target, policy: ctx.policy,
      inputs: [ctx.mine], state: 'Settled', timestamp: nowMicros(),
    }),
    cases: [
      { rule: 'SettlementStatus aggregator must match action author.', mutate: (st) => { st.aggregator = danglingHash('agent', 136); } },
      { rule: 'SettlementStatus inputs contain a duplicate; a repeated assessment would count its assessor twice.', mutate: (st, ctx) => { st.inputs = [ctx.mine, ctx.mine]; } },
      { rule: 'SettlementStatus policy does not resolve.', expect: 'deferral', mutate: (st) => { st.policy = danglingHash('action', 137); } },
      // A Claim's ActionHash resolves and is not a SettlementPolicy.
      { rule: 'SettlementStatus policy is not a SettlementPolicy.', mutate: (st, ctx) => { st.policy = ctx.mine; } },
      { rule: 'SettlementStatus input does not resolve to a valid record.', expect: 'deferral', mutate: (st) => { st.inputs = [danglingHash('action', 138)]; } },
      { rule: 'SettlementStatus input assesses a different target.', mutate: (st, ctx) => { st.inputs = [ctx.foreignAssessment]; } },
      { rule: 'SettlementStatus input critiques a different target.', mutate: (st, ctx) => { st.inputs = [ctx.mine, ctx.foreignCritique]; } },
      { rule: 'SettlementStatus input is neither an Assessment nor a Critique.', mutate: (st, ctx) => { st.inputs = [ctx.mine, ctx.policy]; } },
      // THE RECOMPUTE RULE, as a corpus case: claim Open over inputs that
      // produce Settled.
      // THE RECOMPUTE RULE as a corpus case: claim Open over inputs that
      // produce Settled. The rule name must be the inventory's FULL text —
      // a truncated one names no rule and the coverage gate says so.
      {
        rule: 'SettlementStatus state does not follow from its own policy and inputs: {} distinct assessor(s) and {} dissent(s) under \"{}\" (min_assessors {}, max_dissent {}) yields {:?}, not {:?}. Settlement is a pure function and every peer computes it.',
        mutate: (st) => { st.state = 'Open'; },
      },
    ],
  },
  {
    entry: 'bridge_record',
    label: 'BridgeRecord',
    fn: 'attempt_raw_bridge_record',
    chainNote: 'a Mew to mirror, so the target resolves',
    setup: async () => {
      const mewAction = await call('create_mew', {
        content: 'corpus mew, mirrored by a bridge record', author: myKey,
        timestamp: nowMicros(), reply_to: null, semantic_tags: [], linked_claim: null,
      });
      const mews = await call('get_mews_by_agent', myKey);
      const row = mews.find((r) => Buffer.from(r.signed_action.hashed.hash).toString('base64')
                                === Buffer.from(mewAction).toString('base64'));
      if (!row) throw new Error(`the mew just created did not come back from get_mews_by_agent (${mews.length} returned)`);
      return { mewEntry: row.signed_action.hashed.content.data.entry_hash };
    },
    baseline: (ctx) => ({
      author: myKey,
      mew_hash: ctx.mewEntry,
      twitter_id: '1790000000000000002',
      platform: 'twitter',
      mirrored_at: nowMicros(),
      carried_fields: ['content'],
      dropped_fields: ['author', 'timestamp'],
      original_length: 40,
      excerpt_length: 20,
    }),
    cases: [
      { rule: 'BridgeRecord author must match action author.', mutate: (b) => { b.author = danglingHash('agent', 121); } },
      {
        rule: 'BridgeRecord target not found.',
        expect: 'deferral',
        mutate: (b) => { b.mew_hash = danglingHash('entry', 122); },
      },
      // `format!("BridgeRecord {}.", msg)` — the literal prefix is twelve
      // characters and identifies nothing, so this case names the exact
      // interpolated string instead. See `expectText` in assertStopped.
      {
        rule: 'BridgeRecord {}.',
        expectText: 'BridgeRecord excerpt_length cannot exceed original_length.',
        mutate: (b) => { b.excerpt_length = b.original_length + 1; },
      },
    ],
  },
  {
    entry: 'external_critique',
    label: 'ExternalCritique',
    fn: 'attempt_raw_external_critique',
    chainNote: 'a Claim for the imported reply to link back to',
    setup: async () => {
      const domain = `CorpusImport${Date.now()}`;
      await call('create_claim', {
        content: 'corpus claim, replied to from another platform', domain,
        author: myKey, timestamp: nowMicros(), evidence_hashes: [],
        confidence: 'Moderate', semantic_tags: [], source_mew: null,
      });
      const claims = await call('get_claims_by_domain', domain);
      if (!claims.length) throw new Error('the claim just created is not in its own domain index');
      return { claimEntry: claims[0].signed_action.hashed.content.data.entry_hash };
    },
    // NOTE WHICH OF THE TWO PEOPLE IN THIS ENTRY THE RULE IS ABOUT. `importer`
    // is the Holochain agent who chose to import; `author_handle` is an
    // unverifiable string from another platform. Only the first is bindable,
    // which is the entry type's own point.
    baseline: (ctx) => ({
      importer: myKey,
      twitter_id: '1790000000000000003',
      author_handle: 'a_sceptic',
      content: 'Interesting, but the sample size is small.',
      linked_holochain_claim: ctx.claimEntry,
      imported_at: nowMicros(),
    }),
    cases: [
      {
        rule: 'ExternalCritique importer must match action author. Note this is the importing agent, not the Twitter handle in author_handle — see the entry type.',
        mutate: (e) => { e.importer = danglingHash('agent', 123); },
      },
      { rule: 'ExternalCritique content cannot be empty.', mutate: (e) => { e.content = ''; } },
      {
        rule: 'ExternalCritique linked claim not found.',
        expect: 'deferral',
        mutate: (e) => { e.linked_holochain_claim = danglingHash('entry', 124); },
      },
    ],
  },
  {
    entry: 'foreign_critique',
    label: 'ForeignCritique',
    // THE RAW PROBER, AND IT IS NOT OPTIONAL HERE. `import_foreign_critique`
    // derives four of the five fields these rules are about — `witnessed_by`
    // from agent_info, `domain` from the membrane it is handed, `read_through`
    // from describe_method, `imported_at` from sys_time — so through the real
    // extern an empty domain or a mismatched witness is unconstructible and
    // four of these five refusals could never be watched happening.
    fn: 'attempt_raw_foreign_critique',
    chainNote: 'nothing — every reference in this entry points at another network',
    // NO SETUP, and that is the entry type's whole point rather than an
    // economy. Every reference here is an opaque string about a network this
    // DHT cannot see, so there is nothing local to publish first and nothing
    // for validation to resolve. Compare ExternalCritique directly above,
    // which needs a real Claim to link back to.
    baseline: () => ({
      witnessed_by: myKey,
      domain: `CorpusForeign${Date.now()}`,
      foreign_content: 'The control group was self-selected.',
      remote_network_label: 'corpus-remote-net',
      remote_membrane_ref: 'corpus-remote-membrane-ref',
      foreign_author_ref: 'corpus-foreign-author',
      foreign_target_ref: 'corpus-foreign-target',
      foreign_mode: 'Methodological',
      read_through: 'unfiltered (no policy supplied)',
      confidence: 'Moderate',
      imported_at: nowMicros(),
    }),
    cases: [
      // WHICH OF THE TWO PEOPLE THIS RULE IS ABOUT: `witnessed_by` is the local
      // agent who imported, `foreign_author_ref` an unverifiable string from
      // elsewhere. Only the first is bindable, which is why only it is bound.
      {
        rule: 'ForeignCritique witnessed_by must match action author. This is the IMPORTING agent, not the foreign author in foreign_author_ref — see the entry type.',
        mutate: (e) => { e.witnessed_by = danglingHash('agent', 141); },
      },
      { rule: 'ForeignCritique domain cannot be empty.', mutate: (e) => { e.domain = ''; } },
      { rule: 'ForeignCritique foreign_content cannot be empty.', mutate: (e) => { e.foreign_content = ''; } },
      {
        rule: 'ForeignCritique remote_network_label cannot be empty: an import that does not say where it came from is indistinguishable from an assertion.',
        mutate: (e) => { e.remote_network_label = ''; },
      },
      {
        rule: 'ForeignCritique read_through cannot be empty: a filtered import presented without its lens is a lensed reading wearing a neutral face.',
        mutate: (e) => { e.read_through = ''; },
      },
    ],
  },
];

// --- One driver for all five, rather than the Claim block copied four times.
// The baseline-first rule and the refused-for-a-different-reason rule are the
// two things this harness is actually about, and they are now written once.
// THE ASSERTION ITSELF, SHARED BY BOTH DRIVERS. Extracted when
// `driveUnbaselined` arrived at the bottom of this file, and extracted rather
// than copied for one reason: the prefix discipline below is what injections P
// and Q exist to protect, and a second copy of it is a second place for it to
// be quietly loosened into "did it throw". One copy, two callers.
//
// `commitDetail` is the only thing the two drivers say differently, because a
// commit means something different when there was no baseline to compare it
// against — see driveUnbaselined.
function assertStopped(c, err, commitDetail = 'the call COMMITTED — nothing stopped this payload') {
  const kind = c.expect ?? 'refusal';

  if (err === null) {
    check(false, `${kind}: ${c.rule}`, commitDetail);
    return;
  }
  if (kind === 'refusal') {
    // A `format!` RULE CANNOT BE MATCHED LITERALLY, and the first one to be
    // asserted rather than gapped found this: the inventory records the zome's
    // source string, so `DomainToClaim ... own domain ({:?})` is what the rule
    // says while the conductor returns the domain substituted in. Matching on
    // the literal would fail forever, and loosening it to "did it throw"
    // would pass for any reason at all. So the comparison is the stable
    // PREFIX up to the first interpolation — everything the zome wrote
    // verbatim — and a prefix too short to identify a rule is refused outright
    // rather than silently weakened.
    // `expectText` IS THE "ANOTHER WAY" THE REFUSAL BELOW ASKS FOR, added
    // 2026-10-21 for `BridgeRecord {}.` — whose literal prefix is twelve
    // characters and identifies nothing, because the whole message after
    // "BridgeRecord " is interpolated from `bridge_record_loss_fields_-
    // consistent`'s two `Err` strings.
    //
    // A case supplying it asserts the FULL interpolated message instead of a
    // prefix, which is stricter rather than looser: the prefix mechanism
    // matches any rule sharing the literal head, while this names one exact
    // string. It must be the string the zome actually produces — the point of
    // the refusal below is that a weakened match is worse than none, and an
    // `expectText` copied from imagination rather than from the zome would be
    // exactly that.
    const expect = c.expectText
      ?? (c.rule.indexOf('{') === -1 ? c.rule : c.rule.slice(0, c.rule.indexOf('{')).trimEnd());
    if (!c.expectText && c.rule.indexOf('{') !== -1 && expect.length < 20) {
      check(false, `refused: ${c.rule}`,
        `this rule interpolates too early to identify it from a prefix (${JSON.stringify(expect)}) — assert it another way, e.g. an explicit expectText`);
      return;
    }
    const hit = err.includes(expect);
    check(hit, `refused: ${c.rule}`,
      hit ? null : `stopped for a different reason: ${err.slice(0, 180)}`);
    return;
  }
  // kind === 'deferral'
  const deferred = /DepMissingFromDht|may be retried|unresolved dependenc/i.test(err);
  const messageAppeared = err.includes(c.rule);
  check(deferred && !messageAppeared,
    `deferred (not refused): ${c.rule}`,
    deferred && !messageAppeared ? null
      : messageAppeared
        ? `the Invalid branch FIRED — must_get_* semantics have changed, update SPEC §5.3 and this corpus`
        : `expected a retryable dependency stall, got: ${err.slice(0, 180)}`);
}

async function drive(spec) {
  log(`--- ${spec.label}: baseline, then one mutation per rule ---`);

  // THE DEPENDENCY CHAIN, AND WHY IT IS A SEPARATE STEP FROM THE BASELINE.
  // The five entry types this corpus started with are payloads: every field of
  // a valid one can be written down. `Retraction` cannot — its `target_claim`
  // has to be the EntryHash of a Claim that EXISTS and is the retracting
  // agent's own, so something has to be published before the baseline can be
  // described at all. `setup` returns that context and `baseline(ctx)` consumes
  // it.
  //
  // It runs ONCE per entry type rather than per case, which is deliberate: the
  // chain is shared scaffolding, not part of what any single case is testing,
  // and re-publishing it per mutation would spend friction budget on setup. The
  // cost of that choice is that a case must not mutate `ctx` itself — only the
  // payload it is handed — and `baseline(ctx)` therefore builds a fresh payload
  // every call while reading the same ctx.
  //
  // A SETUP FAILURE IS NOT A RULE FAILURE, and is reported as its own check so
  // a red says which. If the chain cannot be built, every case below it would
  // be refused for the wrong reason and "pass" by being refused at all — the
  // same trap the baseline check exists to stop, one level further out.
  let ctx = null;
  if (spec.setup) {
    try {
      ctx = await spec.setup();
      check(true, `${spec.label} dependency chain builds — ${spec.chainNote ?? 'setup published its prerequisites'}`);
    } catch (e) {
      check(false, `${spec.label} dependency chain builds`, String(e?.message ?? e).slice(0, 300));
      for (const c of spec.cases) { skip++; log(`  SKIP: ${c.rule} — dependency chain did not build`); }
      log('');
      return;
    }
  }

  let committed = false;
  try {
    await call(spec.fn, spec.baseline(ctx));
    committed = true;
    check(true, `baseline ${spec.label} commits — the mutations below start from something valid`);
  } catch (e) {
    const msg = String(e?.message ?? e);
    // A SATURATED CHAIN LOOKS LIKE A BROKEN BASELINE, so it is named. Nothing
    // in THIS harness saturates it — the friction rules are declared gaps, see
    // GAPS — but `agent-sdk.mjs` spends real critique budget and is documented
    // as crashing on a second run inside an hour, so a corpus run after one of
    // those meets a 20-per-hour limit on a payload that is perfectly valid.
    // Worth naming because the message arrives on the BASELINE check, where it
    // reads as the zome refusing something it should accept.
    const saturated = /SWO temporal friction/.test(msg);
    check(false, `baseline ${spec.label} commits`,
      saturated
        ? `the author's chain is SATURATED for this entry type — 20 in the rolling `
          + `hour, probably from agent-sdk.mjs or a hand-run harness, not a zome `
          + `defect. Run scripts/sandbox.sh clean && scripts/sandbox.sh start for a `
          + `fresh agent, or wait out the window. Original: ${msg.slice(0, 150)}`
        : msg.slice(0, 300));
  }

  if (!committed) {
    // Counted as skips rather than silently dropped: a run reporting "2 failed"
    // where 2 is one baseline and its whole table went unexercised must not
    // read like a run that tested everything and found two bugs.
    for (const c of spec.cases) { skip++; log(`  SKIP: ${c.rule} — baseline did not commit`); }
    log('');
    return;
  }

  for (const c of spec.cases) {
    const p = spec.baseline(ctx);
    c.mutate(p, ctx);
    const err = await refusal(spec.fn, p);
    assertStopped(c, err);
  }
  log('');
}

// ============================================================================
// --- LINK RULES. The same driver, a different call target.
//
// `drive()` needs no changes for these: a link case is still a valid thing with
// one field broken, so setup/baseline/cases carry over unaltered. What differs
// is the inventory key — every link site has `entry: "create_link"` and is told
// apart by `link_type` — so these live in their own list with their own
// coverage loop rather than being wedged into COVERED.
//
// THREE PROBERS, AND THE SLICE COVERS ALL THREE DELIBERATELY. The generic
// `attempt_false_attachment_link` carries 18 of the 19 link types and lets the
// caller choose base, target and raw tag bytes. `attempt_false_domain_index`
// and `attempt_false_membrane_registry` are single-purpose and NARROWER: they
// build the anchor themselves from a domain or an override, so the rules they
// can reach are bounded by their parameters rather than by the validator. A
// slice that only used the generic one would prove nothing about the other two.
//
// WHY `anchor_of` IS SET FOR A BASELINE AND CLEARED FOR A MUTATION.
// `attempt_false_attachment_link` computes the base from `anchor_of` when it is
// present and IGNORES `payload.base`. The anchor is a Path hash, which this
// harness cannot derive in JavaScript — so a valid baseline passes `anchor_of`
// and lets the coordinator compute it, and any case that needs a wrong base
// clears `anchor_of` to take control of the field.
const COVERED_LINKS = ['AgentToClaim', 'AgentToConstitution', 'DomainToClaim', 'MembraneRegistry',
  'AgentToMew', 'AgentToWorldlineTrace', 'AgentToPreRegistration',
  'QuestionToPreRegistration', 'PreRegistrationToRevelation',
  'ClaimToRetraction', 'RetractionToReplacement',
  'MewToClaim', 'ClaimToExternalCritique', 'MembraneToFederationRecord',
  'MewToBridgeRecord',
  'CritiqueToSpecies', 'SpeciesToParent', 'TargetToCritique', 'TargetToAntibody',
  'TaxonomyToSpecies', 'AgentToMembrane', 'Reinforcement', 'SynapticLink',
  'AttestationGrant'];

const linkEntries = [
  {
    linkType: 'AgentToClaim',
    label: 'AgentToClaim',
    fn: 'attempt_false_attachment_link',
    chainNote: 'a Claim of this agent\'s own, indexed under its author anchor',
    setup: async () => {
      const domain = `CorpusLinkA2C${Date.now()}`;
      const claimAction = await call('create_claim', {
        content: 'corpus claim, the target of an AgentToClaim link',
        domain, author: myKey, timestamp: nowMicros(),
        evidence_hashes: [], confidence: 'Moderate', semantic_tags: [], source_mew: null,
      });
      const claims = await call('get_claims_by_domain', domain);
      const claimEntry = claims[0].signed_action.hashed.content.data.entry_hash;
      const constitution = await call('publish_constitution', {
        agent: myKey,
        promises: [{ action: 'index honestly', domain, modality: null }],
        conditions: [], published_at: nowSecs(), expires_at: null,
      });
      return { claimAction, claimEntry, domain, constitution, others: await otherAgentFixtures() };
    },
    baseline: (ctx) => ({
      kind: 'AgentToClaim',
      base: ctx.claimAction,              // ignored: anchor_of wins
      target: ctx.claimAction,
      tag: Array.from(Buffer.from(ctx.domain, 'utf8')),
      anchor_of: myKey,
      question_anchor_of: null,
    }),
    cases: [
      // An EntryHash where an ActionHash is required — `ActionHash::try_from`
      // is what fails, so the hash has to be well-formed and of the wrong kind.
      { rule: 'AgentToClaim target must be an ActionHash.', mutate: (l, ctx) => { l.target = ctx.claimEntry; } },
      // A real action whose entry is not a Claim. Reachable the obvious way
      // here, and that is worth contrasting with Membrane: this validator
      // matches `_ =>`, which catches the deserialize Err as well as Ok(None),
      // while validate_membrane uses `.map_err(..)?` and raises instead.
      { rule: 'AgentToClaim target is not a Claim.', mutate: (l, ctx) => { l.target = ctx.constitution; } },
      { rule: 'AgentToClaim base must be an EntryHash anchor.', mutate: (l, ctx) => { l.anchor_of = null; l.base = ctx.claimAction; } },
      { rule: "AgentToClaim base anchor does not match the claim's own author. A claim may only be indexed under the agent who wrote it.", mutate: (l, ctx) => { l.anchor_of = null; l.base = ctx.claimEntry; } },
      { rule: "AgentToClaim tag must be the claim's own domain, which is the only domain a by-agent reader has to go on.", mutate: (l) => { l.tag = Array.from(Buffer.from('NotTheDomain', 'utf8')); } },
      // CLOSED BY THE SECOND AGENT — item 5f. Everything here is CORRECT for
      // agent 2's claim: the anchor is agent 2's, the tag is its domain, the
      // target is its claim. Only the link's author differs, which is the one
      // thing that cannot be set in a payload — so this is the ownership rule
      // and not the base-mismatch rule two lines above it.
      {
        rule: "An AgentToClaim link may only be created by the claim's own author.",
        mutate: (l, ctx) => {
          l.target = ctx.others.claimAction;
          l.anchor_of = otherKey;
          l.tag = Array.from(Buffer.from(ctx.others.domain, 'utf8'));
        },
      },
    ],
  },
  {
    linkType: 'AgentToConstitution',
    label: 'AgentToConstitution',
    fn: 'attempt_false_attachment_link',
    chainNote: "this agent's own Constitution, indexed under its agent anchor",
    setup: async () => {
      const domain = `CorpusLinkA2K${Date.now()}`;
      const constitution = await call('publish_constitution', {
        agent: myKey,
        promises: [{ action: 'index honestly', domain, modality: null }],
        conditions: [], published_at: nowSecs(), expires_at: null,
      });
      const claimAction = await call('create_claim', {
        content: 'corpus claim, used as a non-Constitution target',
        domain, author: myKey, timestamp: nowMicros(),
        evidence_hashes: [], confidence: 'Moderate', semantic_tags: [], source_mew: null,
      });
      const claims = await call('get_claims_by_domain', domain);
      const claimEntry = claims[0].signed_action.hashed.content.data.entry_hash;
      return { constitution, claimAction, claimEntry, others: await otherAgentFixtures() };
    },
    baseline: (ctx) => ({
      kind: 'AgentToConstitution',
      base: ctx.constitution,
      target: ctx.constitution,
      tag: null,
      anchor_of: myKey,
      question_anchor_of: null,
    }),
    cases: [
      { rule: 'AgentToConstitution target must be an ActionHash.', mutate: (l, ctx) => { l.target = ctx.claimEntry; } },
      { rule: 'AgentToConstitution target is not a Constitution.', mutate: (l, ctx) => { l.target = ctx.claimAction; } },
      // CLOSED BY THE SECOND AGENT — item 5f. `anchor_of` is agent 2's, so the
      // base check above passes and what is left is `constitution.agent !=
      // action.author()`.
      {
        rule: 'An AgentToConstitution link may only be created by the agent whose constitution it indexes.',
        mutate: (l, ctx) => { l.target = ctx.others.constitution; l.anchor_of = otherKey; },
      },
    ],
  },
  {
    linkType: 'DomainToClaim',
    label: 'DomainToClaim',
    // A NARROWER PROBER, and the narrowness is the point: it takes a claim
    // action and a domain and builds the anchor itself, so the only fields a
    // caller can get wrong are the two the rules are about.
    fn: 'attempt_false_domain_index',
    chainNote: "a Claim of this agent's own, filed under its own domain",
    setup: async () => {
      const domain = `CorpusLinkD2C${Date.now()}`;
      const claimAction = await call('create_claim', {
        content: 'corpus claim, filed in the by-domain index',
        domain, author: myKey, timestamp: nowMicros(),
        evidence_hashes: [], confidence: 'Moderate', semantic_tags: [], source_mew: null,
      });
      const constitution = await call('publish_constitution', {
        agent: myKey,
        promises: [{ action: 'index honestly', domain, modality: null }],
        conditions: [], published_at: nowSecs(), expires_at: null,
      });
      return { claimAction, domain, constitution, others: await otherAgentFixtures() };
    },
    baseline: (ctx) => ({ claim_action: ctx.claimAction, domain: ctx.domain }),
    cases: [
      { rule: 'DomainToClaim target is not a Claim.', mutate: (l, ctx) => { l.claim_action = ctx.constitution; } },
      { rule: "DomainToClaim base anchor does not match the claim's own domain ({:?}). A claim may only be indexed under the domain it declares.", mutate: (l) => { l.domain = 'NotTheClaimsDomain'; } },
      // CLOSED BY THE SECOND AGENT — item 5f. The domain is agent 2's own, so
      // the anchor matches and the base rule above does not fire; only the
      // author does.
      {
        rule: "A DomainToClaim link may only be created by the claim's own author.",
        mutate: (l, ctx) => { l.claim_action = ctx.others.claimAction; l.domain = ctx.others.domain; },
      },
    ],
  },
  {
    linkType: 'MembraneRegistry',
    label: 'MembraneRegistry',
    fn: 'attempt_false_membrane_registry',
    chainNote: "this agent's own Membrane, re-indexed in the registry",
    setup: async () => {
      const domain = `CorpusLinkMR${Date.now()}`;
      const constitution = await call('publish_constitution', {
        agent: myKey,
        promises: [{ action: 'state what this domain demands', domain, modality: null }],
        conditions: [], published_at: nowSecs(), expires_at: null,
      });
      const membraneAction = await call('create_membrane', {
        domain,
        description: 'corpus membrane, re-indexed by the registry prober',
        required_promises: ['state what this domain demands'],
        validation_rules_hash: null,
        creator: myKey, created_at: nowSecs(), constitution,
      });
      const claimAction = await call('create_claim', {
        content: 'corpus claim, used as a non-Membrane registry target',
        domain, author: myKey, timestamp: nowMicros(),
        evidence_hashes: [], confidence: 'Moderate', semantic_tags: [], source_mew: null,
      });
      return { membraneAction, claimAction, others: await otherAgentFixtures() };
    },
    // `create_membrane` already wrote this exact link; links are not unique, so
    // a second identical one validates and the baseline is a real baseline
    // rather than a duplicate-detection test.
    baseline: (ctx) => ({ membrane_action: ctx.membraneAction, anchor_override: null }),
    cases: [
      { rule: 'MembraneRegistry target is not a Membrane.', mutate: (l, ctx) => { l.membrane_action = ctx.claimAction; } },
      { rule: 'MembraneRegistry base is not the membrane registry anchor.', mutate: (l) => { l.anchor_override = 'not_the_registry_anchor'; } },
      // CLOSED BY THE SECOND AGENT — item 5f. `anchor_override` stays null so
      // the registry anchor is the real one and the rule above passes.
      {
        rule: "A MembraneRegistry link may only be created by the membrane's own creator.",
        mutate: (l, ctx) => { l.membrane_action = ctx.others.membraneAction; },
      },
    ],
  },
  // --- THE REST OF THE AGENT-ANCHOR FAMILY, and it is not uniform.
  //
  // Four link types index an entity under its owner's agent anchor and carry
  // the same three rules: the target must be an ActionHash, the target must be
  // the right entry type, and only the owner may create it. Three of them are
  // `crafted` and are below. THE FOURTH, `AgentToMembrane`, IS NOT — the
  // inventory classes it `needs_prober`, and checking why confirms it:
  // `attempt_false_attachment_link`'s `AttachmentLinkKind` has no
  // AgentToMembrane variant, so no published path can write one with a broken
  // field. It stays out of COVERED_LINKS rather than being listed as a gap,
  // because a type nobody can drive has no cases to declare unreachable.
  //
  // The owner rule in all three is free now that item 5f exists: agent 2 owns
  // the entity, `anchor_of` is agent 2's so the base is correct, and only the
  // link's author differs.
  {
    linkType: 'AgentToMew',
    label: 'AgentToMew',
    fn: 'attempt_false_attachment_link',
    chainNote: "this agent's own Mew, plus a Claim action to stand in as the wrong entry type",
    setup: async () => {
      const domain = `CorpusLinkA2Mew${Date.now()}`;
      const mewAction = await call('create_mew', {
        content: 'corpus mew, the target of an AgentToMew link',
        author: myKey, timestamp: nowMicros(),
        reply_to: null, semantic_tags: ['corpus'], linked_claim: null,
      });
      const claimAction = await call('create_claim', {
        content: 'corpus claim, used only as a non-Mew target',
        domain, author: myKey, timestamp: nowMicros(),
        evidence_hashes: [], confidence: 'Moderate', semantic_tags: [], source_mew: null,
      });
      const claims = await call('get_claims_by_domain', domain);
      const anyEntryHash = claims[0].signed_action.hashed.content.data.entry_hash;
      // NOT A CLAIM, and this is the finding rather than a detail: a Claim's
      // record DESERIALISES as a Mew, so `to_app_option::<Mew>()` returns
      // Ok(Some(..)) and this rule never fires. Measured — the obvious payload
      // COMMITTED. A Constitution shares no field names with Mew, so it is the
      // payload that actually reaches the type check. See README's finding 8.
      const constitution = await call('publish_constitution', {
        agent: myKey,
        promises: [{ action: 'post honestly', domain, modality: null }],
        conditions: [], published_at: nowSecs(), expires_at: null,
      });
      return { mewAction, claimAction, constitution, anyEntryHash, others: await otherAgentFixtures() };
    },
    baseline: (ctx) => ({
      kind: 'AgentToMew',
      base: ctx.mewAction,
      target: ctx.mewAction,
      tag: null,
      anchor_of: myKey,
      question_anchor_of: null,
    }),
    cases: [
      { rule: 'AgentToMew target must be an ActionHash.', mutate: (l, ctx) => { l.target = ctx.anyEntryHash; } },
      { rule: 'AgentToMew target is not a Mew.', mutate: (l, ctx) => { l.target = ctx.constitution; } },
      {
        rule: "An AgentToMew link may only be created by the Mew's own author.",
        mutate: (l, ctx) => { l.target = ctx.others.mewAction; l.anchor_of = otherKey; },
      },
    ],
  },
  {
    linkType: 'AgentToWorldlineTrace',
    label: 'AgentToWorldlineTrace',
    fn: 'attempt_false_attachment_link',
    chainNote: "a trace of this agent's own chain — the only kind it can generate",
    setup: async () => {
      const domain = `CorpusLinkA2WT${Date.now()}`;
      const claimAction = await call('create_claim', {
        content: 'corpus claim, used only as a non-WorldlineTrace target',
        domain, author: myKey, timestamp: nowMicros(),
        evidence_hashes: [], confidence: 'Moderate', semantic_tags: [], source_mew: null,
      });
      const claims = await call('get_claims_by_domain', domain);
      const anyEntryHash = claims[0].signed_action.hashed.content.data.entry_hash;
      const traceAction = await call('generate_worldline_trace', {
        period_granularity_secs: 3600, expertise_tags: [], expires_at: null,
      });
      return { traceAction, claimAction, anyEntryHash, others: await otherAgentFixtures() };
    },
    baseline: (ctx) => ({
      kind: 'AgentToWorldlineTrace',
      base: ctx.traceAction,
      target: ctx.traceAction,
      tag: null,
      anchor_of: myKey,
      question_anchor_of: null,
    }),
    cases: [
      { rule: 'AgentToWorldlineTrace target must be an ActionHash.', mutate: (l, ctx) => { l.target = ctx.anyEntryHash; } },
      { rule: 'AgentToWorldlineTrace target is not a WorldlineTrace.', mutate: (l, ctx) => { l.target = ctx.claimAction; } },
      {
        rule: 'An AgentToWorldlineTrace link may only be created by the agent whose chain the trace compresses.',
        mutate: (l, ctx) => { l.target = ctx.others.traceAction; l.anchor_of = otherKey; },
      },
    ],
  },
  {
    linkType: 'AgentToPreRegistration',
    label: 'AgentToPreRegistration',
    fn: 'attempt_false_attachment_link',
    chainNote: 'a question Claim that predates its own commitment, then the commitment',
    setup: async () => {
      const domain = `CorpusLinkA2PR${Date.now()}`;
      const question = await call('create_claim', {
        content: 'corpus question, posed in advance of its own commitment',
        domain, author: myKey, timestamp: nowMicros(),
        evidence_hashes: [], confidence: 'Moderate', semantic_tags: [], source_mew: null,
      });
      const claims = await call('get_claims_by_domain', domain);
      const anyEntryHash = claims[0].signed_action.hashed.content.data.entry_hash;
      // The question MUST predate the commitment (lib.rs:1159), and both are
      // stamped by the same conductor, so a real gap is needed between them.
      await new Promise((r) => setTimeout(r, 1500));
      const preRegAction = await call('pre_register', {
        question,
        prediction: 'corpus prediction, committed in order to be indexed',
        salt: 'corpus-a2pr-salt-91fe',
        reveal_deadline: nowMicros() + 3_600_000_000,
      });
      return { preRegAction, question, anyEntryHash, others: await otherAgentFixtures() };
    },
    baseline: (ctx) => ({
      kind: 'AgentToPreRegistration',
      base: ctx.preRegAction,
      target: ctx.preRegAction,
      tag: null,
      anchor_of: myKey,
      question_anchor_of: null,
    }),
    cases: [
      { rule: 'AgentToPreRegistration target must be an ActionHash.', mutate: (l, ctx) => { l.target = ctx.anyEntryHash; } },
      { rule: 'AgentToPreRegistration target is not a PreRegistration.', mutate: (l, ctx) => { l.target = ctx.question; } },
      {
        rule: 'An AgentToPreRegistration link may only be created by the committing agent.',
        mutate: (l, ctx) => { l.target = ctx.others.preRegAction; l.anchor_of = otherKey; },
      },
    ],
  },
  // --- THE PRE-REGISTRATION INDEX PAIR.
  //
  // These two carry the commit-reveal mechanism's INDEX rules, and §5.19's
  // denominator note is why they matter: an unrevealed commitment is countable
  // only because its question anchor and its reveal link are both bound. The
  // second rule of PreRegistrationToRevelation says what breaks otherwise, in
  // the zome's own words — "that is how an expired commitment is made to look
  // revealed."
  //
  // Both reuse the chain AgentToPreRegistration already needed, plus one extra
  // of each thing for the mismatch cases: a SECOND question and a SECOND
  // commitment, so "does not match the question it names" and "must hang from
  // the PreRegistration the Revelation names" can be driven with a real hash
  // of the right kind rather than a dangling one, which would defer instead.
  {
    linkType: 'QuestionToPreRegistration',
    label: 'QuestionToPreRegistration',
    fn: 'attempt_false_attachment_link',
    chainNote: 'two question Claims and a commitment about the first of them',
    setup: async () => {
      const domain = `CorpusLinkQ2PR${Date.now()}`;
      const mk = (content) => call('create_claim', {
        content, domain, author: myKey, timestamp: nowMicros(),
        evidence_hashes: [], confidence: 'Moderate', semantic_tags: [], source_mew: null,
      });
      const question = await mk('corpus question, the one the commitment names');
      const otherQuestion = await mk('corpus question, deliberately NOT the one named');
      const claims = await call('get_claims_by_domain', domain);
      const anyEntryHash = claims[0].signed_action.hashed.content.data.entry_hash;
      await new Promise((r) => setTimeout(r, 1500));
      const preRegAction = await call('pre_register', {
        question,
        prediction: 'corpus prediction, for the question index',
        salt: 'corpus-q2pr-salt-3b7d',
        reveal_deadline: nowMicros() + 3_600_000_000,
      });
      return { question, otherQuestion, preRegAction, anyEntryHash, others: await otherAgentFixtures() };
    },
    baseline: (ctx) => ({
      kind: 'QuestionToPreRegistration',
      base: ctx.preRegAction,
      target: ctx.preRegAction,
      tag: null,
      anchor_of: null,
      question_anchor_of: ctx.question,
    }),
    cases: [
      { rule: 'QuestionToPreRegistration target must be an ActionHash.', mutate: (l, ctx) => { l.target = ctx.anyEntryHash; } },
      { rule: 'QuestionToPreRegistration target is not a PreRegistration.', mutate: (l, ctx) => { l.target = ctx.question; } },
      // anchor_of and question_anchor_of both null means the extern passes
      // `base` through verbatim, so an ActionHash lands where the anchor
      // EntryHash is required.
      { rule: 'QuestionToPreRegistration base must be an EntryHash anchor.', mutate: (l, ctx) => { l.question_anchor_of = null; l.base = ctx.preRegAction; } },
      { rule: 'QuestionToPreRegistration base anchor does not match the question the PreRegistration itself names. A commitment may only be indexed under the question it was made about.', mutate: (l, ctx) => { l.question_anchor_of = ctx.otherQuestion; } },
      {
        rule: 'A QuestionToPreRegistration link may only be created by the committing agent.',
        mutate: (l, ctx) => { l.target = ctx.others.preRegAction; l.question_anchor_of = ctx.others.claimAction; },
      },
    ],
  },
  {
    linkType: 'PreRegistrationToRevelation',
    label: 'PreRegistrationToRevelation',
    fn: 'attempt_false_attachment_link',
    chainNote: 'a commitment, its reveal, and a second commitment to hang it from wrongly',
    setup: async () => {
      const domain = `CorpusLinkPR2R${Date.now()}`;
      const mk = (content) => call('create_claim', {
        content, domain, author: myKey, timestamp: nowMicros(),
        evidence_hashes: [], confidence: 'Moderate', semantic_tags: [], source_mew: null,
      });
      const question = await mk('corpus question, for the reveal index');
      const claims = await call('get_claims_by_domain', domain);
      const anyEntryHash = claims[0].signed_action.hashed.content.data.entry_hash;
      await new Promise((r) => setTimeout(r, 1500));
      const PREDICTION = 'corpus prediction, committed in order to be revealed';
      const SALT = 'corpus-pr2r-salt-8e2a';
      const preRegAction = await call('pre_register', {
        question, prediction: PREDICTION, salt: SALT,
        reveal_deadline: nowMicros() + 3_600_000_000,
      });
      // A SECOND commitment, so the "must hang from the PreRegistration the
      // Revelation names" rule has a real PreRegistration of the wrong
      // identity to be pointed at. A dangling hash would defer instead.
      const otherPreReg = await call('pre_register', {
        question, prediction: 'corpus prediction, never revealed', salt: 'corpus-pr2r-salt-other',
        reveal_deadline: nowMicros() + 3_600_000_000,
      });
      const revelationAction = await call('reveal_pre_registration', {
        pre_registration: preRegAction, prediction: PREDICTION, salt: SALT,
      });
      return { preRegAction, otherPreReg, revelationAction, question, anyEntryHash, others: await otherAgentFixtures() };
    },
    baseline: (ctx) => ({
      kind: 'PreRegistrationToRevelation',
      base: ctx.preRegAction,
      target: ctx.revelationAction,
      tag: null,
      anchor_of: null,
      question_anchor_of: null,
    }),
    cases: [
      { rule: 'PreRegistrationToRevelation target must be an ActionHash.', mutate: (l, ctx) => { l.target = ctx.anyEntryHash; } },
      { rule: 'PreRegistrationToRevelation target is not a Revelation.', mutate: (l, ctx) => { l.target = ctx.question; } },
      { rule: "PreRegistrationToRevelation base must be the PreRegistration's ActionHash.", mutate: (l, ctx) => { l.base = ctx.anyEntryHash; } },
      { rule: 'A PreRegistrationToRevelation link must hang from the PreRegistration the Revelation itself names. A reveal of one commitment may not be recorded against another — that is how an expired commitment is made to look revealed.', mutate: (l, ctx) => { l.base = ctx.otherPreReg; } },
      {
        rule: 'A PreRegistrationToRevelation link may only be created by the revealing agent.',
        mutate: (l, ctx) => { l.base = ctx.others.preRegAction; l.target = ctx.others.revelationAction; },
      },
    ],
  },
  // --- THE RETRACTION INDEX PAIR, and the same shape as the pre-registration
  // one: both rules that matter are "this link must name what the ENTRY names".
  // `ClaimToRetraction` says a retraction of one claim may not be filed against
  // another; `RetractionToReplacement` says the replacement recorded must be
  // the one the Retraction itself declares. An unbound index here would let a
  // reader of `get_retractions_for_claim` see a claim as withdrawn that its
  // author still stands by — §2.3's remedy inverted.
  //
  // RetractionToReplacement carries one rule the others do not: a Retraction
  // with no `replacement_claim` has nothing for the link to record, so the
  // setup publishes a SECOND retraction without one purely to drive it.
  {
    linkType: 'ClaimToRetraction',
    label: 'ClaimToRetraction',
    fn: 'attempt_false_attachment_link',
    chainNote: 'two Claims and a Retraction of the first, so the mis-filing case has a real other claim',
    setup: async () => {
      const domain = `CorpusLinkC2R${Date.now()}`;
      const mk = (content) => call('create_claim', {
        content, domain, author: myKey, timestamp: nowMicros(),
        evidence_hashes: [], confidence: 'Moderate', semantic_tags: [], source_mew: null,
      });
      const claimAction = await mk('corpus claim, the one being retracted');
      const otherClaimAction = await mk('corpus claim, NOT the one the retraction names');
      const rows = await call('get_claims_by_domain', domain);
      const entryFor = (a) => rows
        .find((r) => Buffer.from(r.signed_action.hashed.hash).toString('base64')
                   === Buffer.from(a).toString('base64'))
        .signed_action.hashed.content.data.entry_hash;
      const claimEntry = entryFor(claimAction);
      const otherClaimEntry = entryFor(otherClaimAction);
      const retractionAction = await call('create_retraction', {
        target_claim: claimEntry, reason: 'corpus retraction, for the claim index',
        replacement_claim: null, author: myKey, timestamp: nowMicros(),
      });
      return { claimAction, claimEntry, otherClaimEntry, retractionAction, others: await otherAgentFixtures() };
    },
    baseline: (ctx) => ({
      kind: 'ClaimToRetraction',
      base: ctx.claimEntry,
      target: ctx.retractionAction,
      tag: null,
      anchor_of: null,
      question_anchor_of: null,
    }),
    cases: [
      { rule: 'ClaimToRetraction target must be an ActionHash.', mutate: (l, ctx) => { l.target = ctx.claimEntry; } },
      { rule: 'ClaimToRetraction target is not a Retraction.', mutate: (l, ctx) => { l.target = ctx.claimAction; } },
      { rule: "ClaimToRetraction base must be a Claim's EntryHash.", mutate: (l, ctx) => { l.base = ctx.claimAction; } },
      { rule: 'A ClaimToRetraction link must hang from the Claim the Retraction itself names in target_claim. A retraction of one claim may not be filed against another.', mutate: (l, ctx) => { l.base = ctx.otherClaimEntry; } },
      {
        rule: "A ClaimToRetraction link may only be created by the Retraction's own author.",
        mutate: (l, ctx) => { l.base = ctx.others.claimEntry; l.target = ctx.others.retractionAction; },
      },
    ],
  },
  {
    linkType: 'RetractionToReplacement',
    label: 'RetractionToReplacement',
    fn: 'attempt_false_attachment_link',
    chainNote: 'a Retraction naming a replacement, a second naming none, and a third Claim to point at wrongly',
    setup: async () => {
      const domain = `CorpusLinkR2Rep${Date.now()}`;
      const mk = (content) => call('create_claim', {
        content, domain, author: myKey, timestamp: nowMicros(),
        evidence_hashes: [], confidence: 'Moderate', semantic_tags: [], source_mew: null,
      });
      const claimAction = await mk('corpus claim, retracted with a replacement');
      const replacementAction = await mk('corpus claim, the declared replacement');
      const strayAction = await mk('corpus claim, NOT the declared replacement');
      const bareAction = await mk('corpus claim, retracted with NO replacement');
      const rows = await call('get_claims_by_domain', domain);
      const entryFor = (a) => rows
        .find((r) => Buffer.from(r.signed_action.hashed.hash).toString('base64')
                   === Buffer.from(a).toString('base64'))
        .signed_action.hashed.content.data.entry_hash;
      const claimEntry = entryFor(claimAction);
      const replacementEntry = entryFor(replacementAction);
      const strayEntry = entryFor(strayAction);
      const retractionAction = await call('create_retraction', {
        target_claim: claimEntry, reason: 'corpus retraction, naming a replacement',
        replacement_claim: replacementEntry, author: myKey, timestamp: nowMicros(),
      });
      // The one rule that needs a DIFFERENT retraction rather than a different
      // hash: "names no replacement_claim, so there is no replacement for this
      // link to record" can only be driven by a Retraction that declares none.
      const bareRetraction = await call('create_retraction', {
        target_claim: entryFor(bareAction), reason: 'corpus retraction, naming no replacement',
        replacement_claim: null, author: myKey, timestamp: nowMicros(),
      });
      return {
        retractionAction, bareRetraction, replacementEntry, strayEntry, claimAction,
        others: await otherAgentFixtures(),
      };
    },
    baseline: (ctx) => ({
      kind: 'RetractionToReplacement',
      base: ctx.retractionAction,
      target: ctx.replacementEntry,
      tag: null,
      anchor_of: null,
      question_anchor_of: null,
    }),
    cases: [
      { rule: "RetractionToReplacement base must be the Retraction's ActionHash.", mutate: (l, ctx) => { l.base = ctx.replacementEntry; } },
      { rule: 'RetractionToReplacement base is not a Retraction.', mutate: (l, ctx) => { l.base = ctx.claimAction; } },
      { rule: 'RetractionToReplacement base Retraction names no replacement_claim, so there is no replacement for this link to record.', mutate: (l, ctx) => { l.base = ctx.bareRetraction; } },
      { rule: "RetractionToReplacement target must be a Claim's EntryHash.", mutate: (l, ctx) => { l.target = ctx.retractionAction; } },
      { rule: 'A RetractionToReplacement link must point at the Claim the Retraction itself names in replacement_claim.', mutate: (l, ctx) => { l.target = ctx.strayEntry; } },
      {
        rule: "A RetractionToReplacement link may only be created by the Retraction's own author.",
        mutate: (l, ctx) => { l.base = ctx.others.retractionAction; l.target = ctx.others.replacementEntry; },
      },
    ],
  },
  // --- THE PROMOTION AND IMPORT INDEXES. Both answer "where did this come
  // from", and both carry a rule the others do not: MewToClaim has to refuse a
  // link recording a promotion the Claim DOES NOT CLAIM — `source_mew: None` —
  // which needs a second, unpromoted Claim to drive rather than a wrong hash.
  {
    linkType: 'MewToClaim',
    label: 'MewToClaim',
    fn: 'attempt_false_attachment_link',
    chainNote: 'two Mews, a Claim promoted from the first, and a Claim promoted from neither',
    setup: async () => {
      const domain = `CorpusLinkM2C${Date.now()}`;
      const mkMew = (content) => call('create_mew', {
        content, author: myKey, timestamp: nowMicros(),
        reply_to: null, semantic_tags: ['corpus'], linked_claim: null,
      });
      const mewAction = await mkMew('corpus mew, the one promoted');
      const otherMewAction = await mkMew('corpus mew, promoted by nothing');
      const mews = await call('get_mews_by_agent', myKey);
      const mewEntryFor = (a) => mews
        .find((r) => Buffer.from(r.signed_action.hashed.hash).toString('base64')
                   === Buffer.from(a).toString('base64'))
        .signed_action.hashed.content.data.entry_hash;
      const mewEntry = mewEntryFor(mewAction);
      const otherMewEntry = mewEntryFor(otherMewAction);
      const promotedAction = await call('create_claim', {
        content: 'corpus claim, promoted from a Mew', domain,
        author: myKey, timestamp: nowMicros(),
        evidence_hashes: [], confidence: 'Moderate', semantic_tags: [], source_mew: mewEntry,
      });
      // The Claim that claims no promotion, for the source_mew: None rule.
      const unpromotedAction = await call('create_claim', {
        content: 'corpus claim, promoted from nothing', domain,
        author: myKey, timestamp: nowMicros(),
        evidence_hashes: [], confidence: 'Moderate', semantic_tags: [], source_mew: null,
      });
      return { mewEntry, otherMewEntry, mewAction, promotedAction, unpromotedAction, others: await otherAgentFixtures() };
    },
    baseline: (ctx) => ({
      kind: 'MewToClaim',
      base: ctx.mewEntry,
      target: ctx.promotedAction,
      tag: null,
      anchor_of: null,
      question_anchor_of: null,
    }),
    cases: [
      { rule: 'MewToClaim target must be an ActionHash.', mutate: (l, ctx) => { l.target = ctx.mewEntry; } },
      { rule: 'MewToClaim target is not a Claim.', mutate: (l, ctx) => { l.target = ctx.mewAction; } },
      { rule: "MewToClaim base must be a Mew's EntryHash.", mutate: (l, ctx) => { l.base = ctx.mewAction; } },
      { rule: 'A MewToClaim link must hang from the Mew the Claim itself names in source_mew.', mutate: (l, ctx) => { l.base = ctx.otherMewEntry; } },
      { rule: 'A MewToClaim link cannot record a promotion the Claim does not claim: its source_mew is None.', mutate: (l, ctx) => { l.target = ctx.unpromotedAction; } },
      {
        rule: "A MewToClaim link may only be created by the promoted Claim's own author.",
        mutate: (l, ctx) => { l.base = ctx.others.mewEntry; l.target = ctx.others.promotedAction; },
      },
    ],
  },
  {
    linkType: 'ClaimToExternalCritique',
    label: 'ClaimToExternalCritique',
    fn: 'attempt_false_attachment_link',
    chainNote: 'a Claim, an imported reply naming it, and a second Claim it does not name',
    setup: async () => {
      const domain = `CorpusLinkC2EC${Date.now()}`;
      const mk = (content) => call('create_claim', {
        content, domain, author: myKey, timestamp: nowMicros(),
        evidence_hashes: [], confidence: 'Moderate', semantic_tags: [], source_mew: null,
      });
      const claimAction = await mk('corpus claim, the one critiqued externally');
      const strayAction = await mk('corpus claim, named by no external critique');
      const rows = await call('get_claims_by_domain', domain);
      const entryFor = (a) => rows
        .find((r) => Buffer.from(r.signed_action.hashed.hash).toString('base64')
                   === Buffer.from(a).toString('base64'))
        .signed_action.hashed.content.data.entry_hash;
      const claimEntry = entryFor(claimAction);
      const strayEntry = entryFor(strayAction);
      const externalCritiqueAction = await call('import_twitter_reply', {
        twitter_id: `corpus-${Date.now()}`,
        author_handle: 'corpus_handle',
        content: 'corpus external critique, imported for the index',
        linked_holochain_claim: claimEntry,
        imported_at: nowSecs(),
      });
      return { claimEntry, strayEntry, claimAction, externalCritiqueAction, others: await otherAgentFixtures() };
    },
    baseline: (ctx) => ({
      kind: 'ClaimToExternalCritique',
      base: ctx.claimEntry,
      target: ctx.externalCritiqueAction,
      tag: null,
      anchor_of: null,
      question_anchor_of: null,
    }),
    cases: [
      { rule: 'ClaimToExternalCritique target must be an ActionHash.', mutate: (l, ctx) => { l.target = ctx.claimEntry; } },
      { rule: 'ClaimToExternalCritique target is not an ExternalCritique.', mutate: (l, ctx) => { l.target = ctx.claimAction; } },
      { rule: "ClaimToExternalCritique base must be a Claim's EntryHash.", mutate: (l, ctx) => { l.base = ctx.claimAction; } },
      { rule: 'A ClaimToExternalCritique link must hang from the Claim the ExternalCritique itself names in linked_holochain_claim.', mutate: (l, ctx) => { l.base = ctx.strayEntry; } },
      {
        rule: 'A ClaimToExternalCritique link may only be created by the importing agent.',
        mutate: (l, ctx) => { l.base = ctx.others.claimEntry; l.target = ctx.others.externalCritiqueAction; },
      },
    ],
  },
  // --- THE FEDERATION INDEX, and the deepest chain in the directory:
  // Constitution -> Membrane -> FederationRecord -> the link about it. Its
  // owner rule is the second one in this corpus that is unforgeable by
  // construction rather than by a guard — §5.18 already requires a
  // FederationRecord's author to be the membrane's founder, so only the
  // founder can produce one to be mis-indexed, and the second agent is the
  // only way to have one that is not ours.
  {
    linkType: 'MembraneToFederationRecord',
    label: 'MembraneToFederationRecord',
    fn: 'attempt_false_attachment_link',
    chainNote: 'a Constitution, two Membranes under it, and a FederationRecord naming the first',
    setup: async () => {
      const domain = `CorpusLinkM2F${Date.now()}`;
      const constitution = await call('publish_constitution', {
        agent: myKey,
        promises: [{ action: 'recognise peer networks honestly', domain, modality: null }],
        conditions: [], published_at: nowSecs(), expires_at: null,
      });
      const mkMembrane = (d, desc) => call('create_membrane', {
        domain: d, description: desc,
        required_promises: ['recognise peer networks honestly'],
        validation_rules_hash: null, creator: myKey, created_at: nowSecs(), constitution,
      });
      const membraneAction = await mkMembrane(domain, 'corpus membrane, the one federated');
      const strayAction = await mkMembrane(`${domain}Stray`, 'corpus membrane, federated by nothing');
      const membranes = await call('get_membranes');
      const entryFor = (a) => membranes
        .find((r) => Buffer.from(r.signed_action.hashed.hash).toString('base64')
                   === Buffer.from(a).toString('base64'))
        .signed_action.hashed.content.data.entry_hash;
      const membraneEntry = entryFor(membraneAction);
      const strayEntry = entryFor(strayAction);
      const federationAction = await call('record_federation', {
        local_membrane: membraneEntry,
        remote_network_label: 'corpus-remote-net',
        remote_membrane_ref: 'corpus-remote-ref',
        author: myKey, created_at: nowSecs(),
      });
      return { membraneEntry, strayEntry, membraneAction, federationAction, others: await otherAgentFixtures() };
    },
    baseline: (ctx) => ({
      kind: 'MembraneToFederationRecord',
      base: ctx.membraneEntry,
      target: ctx.federationAction,
      tag: null,
      anchor_of: null,
      question_anchor_of: null,
    }),
    cases: [
      { rule: 'MembraneToFederationRecord target must be an ActionHash.', mutate: (l, ctx) => { l.target = ctx.membraneEntry; } },
      { rule: 'MembraneToFederationRecord target is not a FederationRecord.', mutate: (l, ctx) => { l.target = ctx.membraneAction; } },
      { rule: "MembraneToFederationRecord base must be a Membrane's EntryHash.", mutate: (l, ctx) => { l.base = ctx.membraneAction; } },
      { rule: 'A MembraneToFederationRecord link must hang from the Membrane the FederationRecord itself names in local_membrane.', mutate: (l, ctx) => { l.base = ctx.strayEntry; } },
      {
        rule: "A MembraneToFederationRecord link may only be created by the FederationRecord's own author — who §5.18 already requires to be the membrane's founder.",
        mutate: (l, ctx) => { l.base = ctx.others.membraneEntry; l.target = ctx.others.federationAction; },
      },
    ],
  },
  // --- THE BRIDGE INDEX, and the only spec here whose rules span TWO link
  // types. The inventory files all seven under `MewToBridgeRecord`, but two of
  // them are about which type the base may be: a mirror of a Mew filed as a
  // claim's, or the reverse. So one case switches `kind` to
  // `ClaimToBridgeRecord` — the rule under test IS the type distinction, and a
  // spec pinned to a single kind could not reach it.
  //
  // That needs TWO BridgeRecords: one mirroring a Mew and one mirroring a
  // Claim, because each cross-type case has to satisfy "hang from the entry
  // the BridgeRecord names in mew_hash" while violating only the type rule.
  {
    linkType: 'MewToBridgeRecord',
    label: 'MewToBridgeRecord',
    fn: 'attempt_false_attachment_link',
    chainNote: 'a Mew and a Claim, each with its own mirror, plus a second Mew to hang one from wrongly',
    setup: async () => {
      const domain = `CorpusLinkM2B${Date.now()}`;
      const mkMew = (content) => call('create_mew', {
        content, author: myKey, timestamp: nowMicros(),
        reply_to: null, semantic_tags: ['corpus'], linked_claim: null,
      });
      const mewAction = await mkMew('corpus mew, the one mirrored');
      const strayMewAction = await mkMew('corpus mew, mirrored by nothing');
      const mews = await call('get_mews_by_agent', myKey);
      const mewEntryFor = (a) => mews
        .find((r) => Buffer.from(r.signed_action.hashed.hash).toString('base64')
                   === Buffer.from(a).toString('base64'))
        .signed_action.hashed.content.data.entry_hash;
      const mewEntry = mewEntryFor(mewAction);
      const strayMewEntry = mewEntryFor(strayMewAction);

      const claimAction = await call('create_claim', {
        content: 'corpus claim, the one mirrored', domain,
        author: myKey, timestamp: nowMicros(),
        evidence_hashes: [], confidence: 'Moderate', semantic_tags: [], source_mew: null,
      });
      const rows = await call('get_claims_by_domain', domain);
      const claimEntry = rows[0].signed_action.hashed.content.data.entry_hash;

      const mirror = (hash, label) => call('record_twitter_mirror', {
        mew_hash: hash, twitter_id: `corpus-${label}-${Date.now()}`,
        platform: 'twitter', mirrored_at: nowSecs(),
        carried_fields: ['content'], dropped_fields: [],
        original_length: 64, excerpt_length: 32,
      });
      const mewBridge = await mirror(mewEntry, 'mew');
      const claimBridge = await mirror(claimEntry, 'claim');

      // AN ENTRY THAT IS NEITHER, and finding 9 is why it has to be. The
      // obvious payload for "base is not a Mew" is a CLAIM's entry, and it
      // does not reach the rule: the guard is
      // `to_app_option::<Mew>().ok().flatten().is_some()`, and a Claim
      // deserialises into Mew (finding 8), so `is_mew` is TRUE for a Claim and
      // the rule cannot fire. Measured — the call COMMITTED. `create_evidence`
      // returns an EntryHash directly, and an Evidence is neither a Claim nor
      // a Mew, so it is the payload that actually reaches the message.
      const evidenceEntry = await call('create_evidence', {
        content: 'corpus evidence, mirrored only to be neither a Claim nor a Mew',
        evidence_type: 'Text', source_url: null, author: myKey, timestamp: nowMicros(),
      });
      const evidenceBridge = await mirror(evidenceEntry, 'evidence');

      return {
        mewEntry, strayMewEntry, mewAction, claimEntry, mewBridge, claimBridge,
        evidenceEntry, evidenceBridge, others: await otherAgentFixtures(),
      };
    },
    baseline: (ctx) => ({
      kind: 'MewToBridgeRecord',
      base: ctx.mewEntry,
      target: ctx.mewBridge,
      tag: Array.from(Buffer.from('bridged', 'utf8')),
      anchor_of: null,
      question_anchor_of: null,
    }),
    cases: [
      { rule: "A BridgeRecord link's target must be an ActionHash.", mutate: (l, ctx) => { l.target = ctx.mewEntry; } },
      { rule: "A BridgeRecord link's target is not a BridgeRecord.", mutate: (l, ctx) => { l.target = ctx.mewAction; } },
      { rule: "A BridgeRecord link's base must be an EntryHash.", mutate: (l, ctx) => { l.base = ctx.mewAction; } },
      { rule: 'A BridgeRecord link must hang from the entry the BridgeRecord itself names in mew_hash.', mutate: (l, ctx) => { l.base = ctx.strayMewEntry; } },
      // THE KIND SWITCHES HERE, and that is the point: the rule under test is
      // the type distinction itself. mew_hash still matches the base, so the
      // rule above cannot fire first; only the link type is wrong.
      { rule: "A ClaimToBridgeRecord link's base is not a Claim. A mirror of a Mew filed as a claim's would make get_unbridged_claims answer about the wrong entry.", mutate: (l) => { l.kind = 'ClaimToBridgeRecord'; } },
      // NOT the mirror image, and that asymmetry is finding 9. A Claim base
      // cannot drive this: a Claim reads as a Mew, so `is_mew` is true and the
      // rule is inert in exactly the direction the sibling rule above is not.
      // An Evidence base is neither type, so it reaches the message.
      { rule: "A MewToBridgeRecord link's base is not a Mew.", mutate: (l, ctx) => { l.base = ctx.evidenceEntry; l.target = ctx.evidenceBridge; } },
      {
        rule: 'A BridgeRecord link may only be created by the agent who recorded the mirror.',
        mutate: (l, ctx) => { l.base = ctx.others.mewEntry; l.target = ctx.others.bridgeAction; },
      },
    ],
  },
  // --- THE RATE-LIMITED FOUR, and they are grouped for that reason rather
  // than for a shared rule shape. `Critique` and `AntibodyPattern` creation is
  // capped at 20 per rolling hour each (§6), enforced by DHT validation, so
  // every one of these setups spends allowance that a later run in the same
  // hour will not have. They are written to be economical rather than tidy:
  // one critique declares BOTH a species and a target so it can serve two
  // owner rules, and nothing is published that an existing fixture covers.
  //
  // Two of the six-rule pairs carry the "does not declare it" rule that the
  // promotion index had: a Critique whose `species` is None, and a child
  // species whose `parent_species` is None. Neither is reachable by mutating
  // a hash; both need a second, differently-shaped valid entry.
  {
    linkType: 'CritiqueToSpecies',
    label: 'CritiqueToSpecies',
    fn: 'attempt_false_attachment_link',
    chainNote: 'two species, a Critique declaring the first, and a Critique declaring none',
    setup: async () => {
      const domain = `CorpusLinkC2S${Date.now()}`;
      const claimAction = await call('create_claim', {
        content: 'corpus claim, the critiqued node', domain,
        author: myKey, timestamp: nowMicros(),
        evidence_hashes: [], confidence: 'Moderate', semantic_tags: [], source_mew: null,
      });
      const claimEntry = (await call('get_claims_by_domain', domain))[0]
        .signed_action.hashed.content.data.entry_hash;
      const mkSpecies = (name) => call('create_critique_species', {
        name, parent_species: null, required_evidence: [], proposer: myKey, created_at: nowMicros(),
      });
      const speciesA = await mkSpecies(`CorpusSpeciesA${Date.now()}`);
      const speciesB = await mkSpecies(`CorpusSpeciesB${Date.now()}`);
      const rows = await call('get_all_critique_species');
      const entryFor = (a) => rows
        .find((r) => Buffer.from(r.signed_action.hashed.hash).toString('base64')
                   === Buffer.from(a).toString('base64'))
        .signed_action.hashed.content.data.entry_hash;
      const speciesAEntry = entryFor(speciesA);
      const speciesBEntry = entryFor(speciesB);
      const mkCritique = (species, content) => call('create_critique', {
        target: claimEntry, target_type: 'Claim', critique_mode: 'Logical',
        content, author: myKey, timestamp: nowMicros(),
        replication_attempted: false, evidence_hashes: [], species,
      });
      const critiqueAction = await mkCritique(speciesAEntry, 'corpus critique, declaring a species');
      const speciesless = await mkCritique(null, 'corpus critique, declaring no species');
      return { speciesAEntry, speciesBEntry, critiqueAction, speciesless, claimEntry, claimAction, others: await otherAgentFixtures() };
    },
    baseline: (ctx) => ({
      kind: 'CritiqueToSpecies',
      base: ctx.speciesAEntry,
      target: ctx.critiqueAction,
      tag: null,
      anchor_of: null,
      question_anchor_of: null,
    }),
    cases: [
      { rule: 'CritiqueToSpecies target must be an ActionHash.', mutate: (l, ctx) => { l.target = ctx.speciesAEntry; } },
      { rule: 'CritiqueToSpecies target is not a Critique.', mutate: (l, ctx) => { l.target = ctx.claimAction; } },
      { rule: "CritiqueToSpecies base must be a CritiqueSpecies' EntryHash.", mutate: (l, ctx) => { l.base = ctx.claimAction; } },
      { rule: 'A CritiqueToSpecies link must hang from the CritiqueSpecies the Critique itself declares in `species`, not a different one.', mutate: (l, ctx) => { l.base = ctx.speciesBEntry; } },
      { rule: 'A CritiqueToSpecies link cannot record an adoption the Critique does not declare: its `species` field is None.', mutate: (l, ctx) => { l.target = ctx.speciesless; } },
      {
        rule: "A CritiqueToSpecies link may only be created by the Critique's own author.",
        mutate: (l, ctx) => { l.base = ctx.others.parentSpeciesEntry; l.target = ctx.others.critiqueAction; },
      },
    ],
  },
  {
    linkType: 'SpeciesToParent',
    label: 'SpeciesToParent',
    fn: 'attempt_false_attachment_link',
    chainNote: 'two parent species, a child declaring the first, and a root declaring none',
    setup: async () => {
      const mkSpecies = (name, parent_species) => call('create_critique_species', {
        name, parent_species, required_evidence: [], proposer: myKey, created_at: nowMicros(),
      });
      const parentA = await mkSpecies(`CorpusParentA${Date.now()}`, null);
      const parentB = await mkSpecies(`CorpusParentB${Date.now()}`, null);
      let rows = await call('get_all_critique_species');
      const entryFor = (list, a) => list
        .find((r) => Buffer.from(r.signed_action.hashed.hash).toString('base64')
                   === Buffer.from(a).toString('base64'))
        .signed_action.hashed.content.data.entry_hash;
      const parentAEntry = entryFor(rows, parentA);
      const parentBEntry = entryFor(rows, parentB);
      const childAction = await mkSpecies(`CorpusChild${Date.now()}`, parentAEntry);
      const rootAction = await mkSpecies(`CorpusRoot${Date.now()}`, null);
      rows = await call('get_all_critique_species');
      return { parentAEntry, parentBEntry, childAction, rootAction, others: await otherAgentFixtures() };
    },
    baseline: (ctx) => ({
      kind: 'SpeciesToParent',
      base: ctx.parentAEntry,
      target: ctx.childAction,
      tag: null,
      anchor_of: null,
      question_anchor_of: null,
    }),
    cases: [
      { rule: 'SpeciesToParent target must be an ActionHash.', mutate: (l, ctx) => { l.target = ctx.parentAEntry; } },
      { rule: 'SpeciesToParent target is not a CritiqueSpecies.', mutate: (l, ctx) => { l.target = ctx.others.claimAction; } },
      { rule: "SpeciesToParent base must be the parent CritiqueSpecies' EntryHash.", mutate: (l, ctx) => { l.base = ctx.childAction; } },
      { rule: 'A SpeciesToParent link must hang from the CritiqueSpecies the child itself declares in parent_species, not a different one.', mutate: (l, ctx) => { l.base = ctx.parentBEntry; } },
      { rule: 'A SpeciesToParent link cannot record a parent the child does not declare: its parent_species field is None.', mutate: (l, ctx) => { l.target = ctx.rootAction; } },
      {
        rule: "A SpeciesToParent link may only be created by the child species' own proposer.",
        mutate: (l, ctx) => { l.base = ctx.others.parentSpeciesEntry; l.target = ctx.others.childSpecies; },
      },
    ],
  },
  {
    linkType: 'TargetToCritique',
    label: 'TargetToCritique',
    fn: 'attempt_false_attachment_link',
    chainNote: 'a critiqued Claim, a second Claim it does not name, and one Critique',
    setup: async () => {
      const domain = `CorpusLinkT2C${Date.now()}`;
      const mk = (content) => call('create_claim', {
        content, domain, author: myKey, timestamp: nowMicros(),
        evidence_hashes: [], confidence: 'Moderate', semantic_tags: [], source_mew: null,
      });
      const claimAction = await mk('corpus claim, the critiqued node');
      const strayAction = await mk('corpus claim, named by no critique');
      const rows = await call('get_claims_by_domain', domain);
      const entryFor = (a) => rows
        .find((r) => Buffer.from(r.signed_action.hashed.hash).toString('base64')
                   === Buffer.from(a).toString('base64'))
        .signed_action.hashed.content.data.entry_hash;
      const claimEntry = entryFor(claimAction);
      const strayEntry = entryFor(strayAction);
      const critiqueAction = await call('create_critique', {
        target: claimEntry, target_type: 'Claim', critique_mode: 'Logical',
        content: 'corpus critique, for the target index', author: myKey,
        timestamp: nowMicros(), replication_attempted: false, evidence_hashes: [], species: null,
      });
      return { claimEntry, strayEntry, claimAction, critiqueAction, others: await otherAgentFixtures() };
    },
    baseline: (ctx) => ({
      kind: 'TargetToCritique',
      base: ctx.claimEntry,
      target: ctx.critiqueAction,
      tag: null,
      anchor_of: null,
      question_anchor_of: null,
    }),
    cases: [
      { rule: 'TargetToCritique target must be an ActionHash.', mutate: (l, ctx) => { l.target = ctx.claimEntry; } },
      { rule: 'TargetToCritique target is not a Critique.', mutate: (l, ctx) => { l.target = ctx.claimAction; } },
      { rule: 'A TargetToCritique link must hang from the node the Critique itself names in target. A critique of one node may not be filed against another.', mutate: (l, ctx) => { l.base = ctx.strayEntry; } },
      {
        rule: "A TargetToCritique link may only be created by the Critique's own author.",
        mutate: (l, ctx) => { l.base = ctx.others.claimEntry; l.target = ctx.others.critiqueAction; },
      },
    ],
  },
  {
    linkType: 'TargetToAntibody',
    label: 'TargetToAntibody',
    fn: 'attempt_false_attachment_link',
    chainNote: 'a flagged Claim, a second Claim it does not name, and one AntibodyPattern',
    setup: async () => {
      const domain = `CorpusLinkT2A${Date.now()}`;
      const mk = (content) => call('create_claim', {
        content, domain, author: myKey, timestamp: nowMicros(),
        evidence_hashes: [], confidence: 'Moderate', semantic_tags: [], source_mew: null,
      });
      const claimAction = await mk('corpus claim, the flagged node');
      const strayAction = await mk('corpus claim, flagged by nothing');
      const rows = await call('get_claims_by_domain', domain);
      const entryFor = (a) => rows
        .find((r) => Buffer.from(r.signed_action.hashed.hash).toString('base64')
                   === Buffer.from(a).toString('base64'))
        .signed_action.hashed.content.data.entry_hash;
      const claimEntry = entryFor(claimAction);
      const strayEntry = entryFor(strayAction);
      const antibodyAction = await call('publish_antibody_pattern', {
        target: claimEntry, target_type: 'Claim', kind: 'SpamFlood',
        rationale: 'corpus antibody pattern, for the target index',
        author: myKey, timestamp: nowMicros(),
      });
      return { claimEntry, strayEntry, claimAction, antibodyAction, others: await otherAgentFixtures() };
    },
    baseline: (ctx) => ({
      kind: 'TargetToAntibody',
      base: ctx.claimEntry,
      target: ctx.antibodyAction,
      tag: null,
      anchor_of: null,
      question_anchor_of: null,
    }),
    cases: [
      { rule: 'TargetToAntibody target must be an ActionHash.', mutate: (l, ctx) => { l.target = ctx.claimEntry; } },
      { rule: 'TargetToAntibody target is not an AntibodyPattern.', mutate: (l, ctx) => { l.target = ctx.claimAction; } },
      { rule: 'A TargetToAntibody link must hang from the node the AntibodyPattern itself names in target.', mutate: (l, ctx) => { l.base = ctx.strayEntry; } },
      {
        rule: "A TargetToAntibody link may only be created by the AntibodyPattern's own author.",
        mutate: (l, ctx) => { l.base = ctx.others.claimEntry; l.target = ctx.others.antibodyAction; },
      },
    ],
  },
  // --- THE TAXONOMY INDEX — READINESS item 18, and the first type driven by a
  // prober this corpus asked for rather than inherited.
  //
  // It needed its own extern. `attempt_false_attachment_link` derives only an
  // AGENT anchor and a QUESTION anchor, and this link's base is the TAXONOMY
  // anchor, so no payload through that prober could put the base in the right
  // place — which is why all three of these rules were classed `needs_prober`
  // rather than gapped. `attempt_false_taxonomy_index` mirrors
  // `attempt_false_domain_index`: it derives the real anchor, and
  // `anchor_override` moves the base off it so the base rule can be driven.
  {
    linkType: 'TaxonomyToSpecies',
    label: 'TaxonomyToSpecies',
    fn: 'attempt_false_taxonomy_index',
    chainNote: "this agent's own CritiqueSpecies, plus a Claim action of the wrong entry type",
    setup: async () => {
      const domain = `CorpusLinkT2S${Date.now()}`;
      const speciesAction = await call('create_critique_species', {
        name: `CorpusTaxonomy${Date.now()}`, parent_species: null,
        required_evidence: [], proposer: myKey, created_at: nowMicros(),
      });
      const claimAction = await call('create_claim', {
        content: 'corpus claim, used only as a non-CritiqueSpecies target', domain,
        author: myKey, timestamp: nowMicros(),
        evidence_hashes: [], confidence: 'Moderate', semantic_tags: [], source_mew: null,
      });
      return { speciesAction, claimAction, others: await otherAgentFixtures() };
    },
    baseline: (ctx) => ({ species_action: ctx.speciesAction, anchor_override: null }),
    cases: [
      { rule: 'TaxonomyToSpecies target is not a CritiqueSpecies.', mutate: (l, ctx) => { l.species_action = ctx.claimAction; } },
      { rule: 'TaxonomyToSpecies base is not the taxonomy anchor.', mutate: (l) => { l.anchor_override = 'not_the_taxonomy_anchor'; } },
      {
        rule: "A TaxonomyToSpecies link may only be created by the species' own proposer.",
        mutate: (l, ctx) => { l.species_action = ctx.others.childSpecies; },
      },
    ],
  },
  // --- MEMBERSHIP AND REINFORCEMENT — item 18's other two drivable types,
  // reachable now that `AttachmentLinkKind` carries their variants.
  //
  // Both are written by dedicated externs that pre-check what validation
  // re-checks (`join_membrane`, `reinforce_synaptic_link`), which is why the
  // rules were unreachable: the same shape as `create_membrane` hiding four
  // Membrane rules until `attempt_unaccountable_membrane` existed.
  //
  // `AgentToMembrane`'s TARGET is the joining agent's derived anchor, which a
  // caller cannot compute — but nothing validates the target, so the baseline
  // puts the membrane's own EntryHash there. Checked against the validator
  // rather than assumed: it tests the tag's length, the tag against the action
  // author, and that the base downcasts to a resolving EntryHash. Nothing else.
  {
    linkType: 'AgentToMembrane',
    label: 'AgentToMembrane',
    fn: 'attempt_false_attachment_link',
    chainNote: "a Constitution and a Membrane under it, for this agent to join",
    setup: async () => {
      const domain = `CorpusLinkA2Mem${Date.now()}`;
      const constitution = await call('publish_constitution', {
        agent: myKey,
        promises: [{ action: 'belong honestly', domain, modality: null }],
        conditions: [], published_at: nowSecs(), expires_at: null,
      });
      const membraneAction = await call('create_membrane', {
        domain, description: 'corpus membrane, to be joined',
        required_promises: ['belong honestly'], validation_rules_hash: null,
        creator: myKey, created_at: nowSecs(), constitution,
      });
      const membraneEntry = (await call('get_membranes'))
        .find((r) => Buffer.from(r.signed_action.hashed.hash).toString('base64')
                   === Buffer.from(membraneAction).toString('base64'))
        .signed_action.hashed.content.data.entry_hash;
      return { membraneEntry, membraneAction, others: await otherAgentFixtures() };
    },
    // `get_raw_36()` strips a holochain hash's 3-byte prefix, so the tag the
    // zome compares is the agent key's last 36 bytes, not all 39.
    baseline: (ctx) => ({
      kind: 'AgentToMembrane',
      base: ctx.membraneEntry,
      target: ctx.membraneEntry,
      tag: Array.from(myKey.slice(3)),
      anchor_of: null,
      question_anchor_of: null,
    }),
    cases: [
      { rule: 'AgentToMembrane tag must be exactly 36 bytes (a raw AgentPubKey).', mutate: (l) => { l.tag = [1, 2, 3]; } },
      // The tag claims agent 2 while agent 1 authors the call — "on someone
      // else's behalf" stated exactly.
      { rule: "AgentToMembrane links can only be created by the agent joining, not on someone else's behalf.", mutate: (l) => { l.tag = Array.from(otherKey.slice(3)); } },
      { rule: 'AgentToMembrane base must be an EntryHash.', mutate: (l, ctx) => { l.base = ctx.membraneAction; } },
      // A DEFERRAL, AND THE RULE THAT WAS IN NO DENOMINATOR UNTIL 2026-10-19.
      // `classify()` returned `deferred` before the branch that records
      // `link_type`, so this site carried none — and the coverage loop above
      // keys on exactly that field, so it was in no type's count and no total.
      // A well-formed EntryHash that resolves to nothing reaches
      // `must_get_entry`, which abandons the callback: the message never
      // appears, and a REFUSAL here would mean the two rules above it had
      // stopped firing.
      {
        rule: 'AgentToMembrane base is not a valid Membrane.',
        expect: 'deferral',
        mutate: (l) => { l.base = danglingHash('entry', 31); },
      },
    ],
  },

  {
    linkType: 'Reinforcement',
    label: 'Reinforcement',
    fn: 'attempt_false_attachment_link',
    chainNote: 'a Critique, whose creation makes the SynapticLink this reinforces',
    setup: async () => {
      const domain = `CorpusLinkReinf${Date.now()}`;
      const claimAction = await call('create_claim', {
        content: 'corpus claim, the critiqued node', domain,
        author: myKey, timestamp: nowMicros(),
        evidence_hashes: [], confidence: 'Moderate', semantic_tags: [], source_mew: null,
      });
      const claimEntry = (await call('get_claims_by_domain', domain))[0]
        .signed_action.hashed.content.data.entry_hash;
      // create_critique makes a SynapticLink from the critique's target to the
      // critique itself (coordinator:931). find_synaptic_link returns that
      // CreateLink action's hash, which is what a Reinforcement hangs from.
      const critiqueAction = await call('create_critique', {
        target: claimEntry, target_type: 'Claim', critique_mode: 'Logical',
        content: 'corpus critique, published to create a SynapticLink',
        author: myKey, timestamp: nowMicros(),
        replication_attempted: false, evidence_hashes: [], species: null,
      });
      const synapticAction = await call('find_synaptic_link', {
        base: claimEntry, target_action: critiqueAction,
      });
      if (!synapticAction) throw new Error('find_synaptic_link returned nothing for the critique just published');
      return { synapticAction, claimAction, others: await otherAgentFixtures() };
    },
    baseline: (ctx) => ({
      kind: 'Reinforcement',
      base: ctx.synapticAction,
      // THE AGENT KEY, CARRYING AN ENTRY PREFIX RATHER THAN AN AGENT ONE. The
      // validator does `AgentPubKey::try_from(target_address)`, and in Rust
      // `create_link(base, agent, ..)` reaches AnyLinkableHash via
      // `EntryHash::from(AgentPubKey)`, which REWRITES the 3-byte prefix — so
      // the hash the DHT stores is entry-prefixed. Sending the raw
      // agent-prefixed bytes is refused by AnyLinkableHash's own deserialiser
      // before any rule runs, measured as a payload Deserialize at the extern.
      // Same 36-byte core, different first three bytes.
      target: new Uint8Array([0x84, 0x21, 0x24, ...myKey.slice(3)]),
      tag: null,
      anchor_of: null,
      question_anchor_of: null,
    }),
    cases: [
      { rule: "Reinforcement links can only be created by the agent doing the reinforcing, not on someone else's behalf.", mutate: (l) => { l.target = new Uint8Array([0x84, 0x21, 0x24, ...otherKey.slice(3)]); } },
      { rule: 'Reinforcement base is not a SynapticLink creation.', mutate: (l, ctx) => { l.base = ctx.claimAction; } },
    ],
  },
  // --- THE SYNAPTIC LINK ITSELF, one rule of two. The other is an SWO
  // friction limit (20 per rolling hour) of the same class as this corpus's
  // standing gaps, and is declared below rather than asserted.
  //
  // Its real creator is a PRIVATE fn, not an extern: `create_synaptic_link` is
  // called from inside `create_critique` (coordinator:931), which is why the
  // tag rule had no caller to drive it until `AttachmentLinkKind` gained a
  // variant. The tag is the f32 conductance in little-endian bytes.
  {
    linkType: 'SynapticLink',
    label: 'SynapticLink',
    fn: 'attempt_false_attachment_link',
    chainNote: 'a Claim and a Critique of it, the pair a real SynapticLink connects',
    setup: async () => {
      const domain = `CorpusLinkSyn${Date.now()}`;
      await call('create_claim', {
        content: 'corpus claim, one end of the connection', domain,
        author: myKey, timestamp: nowMicros(),
        evidence_hashes: [], confidence: 'Moderate', semantic_tags: [], source_mew: null,
      });
      const claimEntry = (await call('get_claims_by_domain', domain))[0]
        .signed_action.hashed.content.data.entry_hash;
      const critiqueAction = await call('create_critique', {
        target: claimEntry, target_type: 'Claim', critique_mode: 'Logical',
        content: 'corpus critique, the other end of the connection',
        author: myKey, timestamp: nowMicros(),
        replication_attempted: false, evidence_hashes: [], species: null,
      });
      return { claimEntry, critiqueAction, others: await otherAgentFixtures() };
    },
    baseline: (ctx) => ({
      kind: 'SynapticLink',
      base: ctx.claimEntry,
      target: ctx.critiqueAction,
      // 1.0f32, little-endian — the four bytes the read layer parses back out
      // as the link's immutable initial conductance.
      tag: [0x00, 0x00, 0x80, 0x3f],
      anchor_of: null,
      question_anchor_of: null,
    }),
    cases: [
      { rule: 'SynapticLink tag must contain at least 4 bytes (f32 conductance).', mutate: (l) => { l.tag = [0x00, 0x00, 0x80]; } },
    ],
  },
  {
    linkType: 'DomainToForeignCritique',
    label: 'DomainToForeignCritique',
    // ITS PAYLOAD TYPES `target` AS AnyLinkableHash AND NOT ActionHash, which
    // is the one way this prober differs from `attempt_false_domain_index`'s
    // shape. One of the four rules is "must target an ActionHash", and a
    // payload typed as ActionHash would make that rule unreachable by
    // construction — inventoried as assertable with nothing able to assert it,
    // which is the silent gap this whole corpus exists to refuse.
    fn: 'attempt_false_foreign_critique_index',
    chainNote: "this agent's own ForeignCritique, plus a Constitution of the wrong entry type",
    setup: async () => {
      const domain = `CorpusLinkD2F${Date.now()}`;
      const foreignAction = await call('attempt_raw_foreign_critique', {
        witnessed_by: myKey,
        domain,
        foreign_content: 'corpus foreign critique, for the index rules',
        remote_network_label: 'corpus-remote-net',
        remote_membrane_ref: 'corpus-remote-membrane-ref',
        foreign_author_ref: 'corpus-foreign-author',
        foreign_target_ref: 'corpus-foreign-target',
        foreign_mode: 'Methodological',
        read_through: 'unfiltered (no policy supplied)',
        confidence: 'Moderate',
        imported_at: nowMicros(),
      });
      const constitution = await call('publish_constitution', {
        agent: myKey,
        promises: [{ action: 'index imports honestly', domain, modality: null }],
        conditions: [], published_at: nowSecs(), expires_at: null,
      });
      return { domain, foreignAction, constitution, others: await otherAgentFixtures() };
    },
    baseline: (ctx) => ({ target: ctx.foreignAction, domain: ctx.domain }),
    cases: [
      // An ENTRY hash where an action hash is required. This is the case the
      // prober's AnyLinkableHash parameter exists for.
      {
        rule: 'A DomainToForeignCritique link must target an ActionHash.',
        mutate: (l) => { l.target = danglingHash('entry', 142); },
      },
      {
        rule: "A DomainToForeignCritique link's target record was not found.",
        expect: 'deferral',
        mutate: (l) => { l.target = danglingHash('action', 143); },
      },
      {
        rule: 'A DomainToForeignCritique link must point at a ForeignCritique.',
        mutate: (l, ctx) => { l.target = ctx.constitution; },
      },
      // THE WITNESS RULE, and note what it does NOT need. There is no base rule
      // on this link type — a ForeignCritique's domain is its own field and the
      // anchor is derived here — so unlike DomainToClaim's owner case this one
      // needs no coordination of agent 2's domain. Only the author differs.
      {
        rule: "A DomainToForeignCritique link may only be created by the import's own witness. Indexing somebody else's import under a domain is how one agent would put another's name on a reading they never made.",
        mutate: (l, ctx) => { l.target = ctx.others.foreignAction; },
      },
    ],
  },
];


// ============================================================================
// --- RULES WHOSE BASELINE CANNOT EXIST.
//
// Every case above starts from a payload asserted to COMMIT and changes one
// field, and *Why one mutation at a time* in README.md is the argument for
// that. `AttestationGrant` cannot be driven that way, and it is not a
// shortcoming of the harness — it is arithmetic in the zome.
//
// A valid grant needs the granter's own `AgentToMembrane` join to be at least
// `ATTESTATION_GRANT_MIN_TENURE_SECS_VALIDATION` old, which is **30 days**
// (`dna/integrity/src/lib.rs:1773`). Both actions are this agent's own and a
// run makes them seconds apart. No payload, no prober and no second agent
// produces one: the only things that would are waiting a month or moving
// `CLOCK_REALTIME`, and the clock probe is deliberately not a CI check
// (READINESS item 13). **So a valid AttestationGrant has never been committed
// by anything in this repository, and cannot be.** The GAPS block above gapped
// all three of its rules for that reason and asked for this driver by name.
//
// WHAT REPLACES THE BASELINE WAS ALREADY IN THE EVIDENCE. Each link branch of
// `validate_create_link` is a straight-line sequence of checks that RETURNS at
// the first failure. So a refusal naming rule N is itself proof that every
// check above N passed on that payload — which is exactly what the baseline
// was supplying from outside. The message carries it instead.
//
// WHAT IS LOST, stated rather than glossed, because a driver that quietly
// asserts less than its neighbour is the failure mode this corpus exists to
// find:
//
//   - A DELETED RULE IS STILL CAUGHT, both ways. With the rule gone the call
//     either commits — reported as `the call COMMITTED` — or is refused by a
//     LATER check, and since the assertion requires THIS rule's own prefix a
//     different message reds as `stopped for a different reason`.
//   - WHAT IS GENUINELY LOST is the proof that nothing BELOW the rule would
//     also have refused the payload. These cases assert that the rule fires
//     FIRST among the ones they violate, not that it is the only one they
//     violate. Here that is visible rather than hidden: the three cases are
//     the first three checks of the branch IN ORDER, each one passing the ones
//     above it, and the only check below all three is the friction rule the
//     GAPS block still carries.
//
// THIS MUST NOT SPREAD. Where a baseline CAN commit, `drive` is strictly
// stronger, because two signals beat one. The test for belonging here is not
// "a baseline is inconvenient" but "a baseline is impossible" — and for every
// other link type in this corpus, including the four `AttachmentLinkKind`
// variants item 18 added, a baseline commits.
async function driveUnbaselined(spec) {
  log(`--- ${spec.label}: refusals with NO baseline — ${spec.whyNoBaseline} ---`);

  let ctx = null;
  try {
    ctx = await spec.setup();
    check(true, `${spec.label} dependency chain builds — ${spec.chainNote}`);
  } catch (e) {
    check(false, `${spec.label} dependency chain builds`, String(e?.message ?? e).slice(0, 300));
    for (const c of spec.cases) { skip++; log(`  SKIP: ${c.rule} — dependency chain did not build`); }
    log('');
    return;
  }

  for (const c of spec.cases) {
    const err = await refusal(spec.fn, c.payload(ctx));
    // The commit detail differs from `drive`'s, and the difference is the whole
    // point of this driver: with no baseline there is no second signal to weigh
    // a commit against.
    assertStopped(c, err,
      'the call COMMITTED — and with no baseline there is no second signal to weigh that '
      + 'against: every check in this branch above the rule passed, and the rule itself did '
      + 'not stop the payload, so it is gone');
  }
  log('');
}

const unbaselinedLinks = [
  {
    linkType: 'AttestationGrant',
    label: 'AttestationGrant',
    // THE PROBER, not `grant_attestation`, and the tag is why. The extern
    // builds its tag from `my_membership_action.get_raw_36()`, so it is always
    // 36 bytes and the length rule is unreachable through it. Item 18's
    // `AttachmentLinkKind::AttestationGrant` passes RAW tag bytes, which makes
    // the first check in the branch drivable — and the first check needs no
    // baseline by construction, since nothing above it can preempt it.
    fn: 'attempt_false_attachment_link',
    whyNoBaseline: 'a valid grant needs thirty days of prior membership',
    chainNote: 'a Membrane of this agent\'s own and its own join action, waited for through get_my_membership_action',
    setup: async () => {
      const domain = `CorpusGrant${Date.now()}`;
      const constitution = await call('publish_constitution', {
        agent: myKey,
        promises: [{ action: 'own what it publishes', domain, modality: null }],
        conditions: [], published_at: nowSecs(), expires_at: null,
      });
      const membraneAction = await call('create_membrane', {
        domain,
        description: 'corpus membrane for the AttestationGrant rules',
        required_promises: ['own what it publishes'],
        validation_rules_hash: null,
        creator: myKey,
        created_at: nowSecs(),
        constitution,
      });
      // The link's base must be the membrane's ENTRY hash, because the tenure
      // check compares the join link's own `base_address` against this one and
      // `join_membrane` links from `membrane_entry_hash(..)`.
      const membraneEntry = (await call('get_membranes'))
        .find((r) => Buffer.from(r.signed_action.hashed.hash).toString('base64')
                  === Buffer.from(membraneAction).toString('base64'))
        .signed_action.hashed.content.data.entry_hash;
      const joinAction = await call('join_membrane', membraneAction);

      // WAITED FOR, not assumed, for the same reason `awaitVisibleToMe` exists
      // one agent over: validation `must_get_valid_record`s this join action,
      // and until it resolves the commit DEFERS instead of being refused by the
      // tenure rule — which would read as a rule that does not fire. It is this
      // agent's own write, so this is fast, but "own" is not "instant".
      await awaitVisibleToMe(
        async () => (await call('get_my_membership_action', membraneAction)) ?? null,
        'this agent\'s own AgentToMembrane join action',
      );
      return { membraneEntry, joinAction };
    },
    // One payload shape, three tags. `base` and `target` are constant across
    // all three, so the tag is the only thing any case varies — which is the
    // one-mutation discipline holding even without a baseline to mutate FROM.
    cases: [
      // 1. THE FIRST CHECK IN THE BRANCH, `tag.0.len() != 36`. Nothing above it
      //    can preempt it, so this case needs no baseline in the strongest
      //    sense available: the rule is the only thing the payload can hit.
      {
        rule: 'AttestationGrant tag must be exactly 36 bytes (a raw ActionHash).',
        payload: (ctx) => grantPayload(ctx, new Uint8Array(35).fill(7)),
      },
      // 2. The second, and a DEFERRAL rather than a refusal: 36 well-formed
      //    bytes that resolve to nothing reach `must_get_valid_record`, which
      //    abandons the callback, so the message never appears. A refusal here
      //    would mean the tag check above it had stopped firing.
      {
        rule: 'AttestationGrant\'s referenced membership action not found.',
        expect: 'deferral',
        payload: (ctx) => grantPayload(ctx, danglingHash('action', 21).slice(3)),
      },
      // 3. The third. Everything about the referenced action is RIGHT — it is
      //    this agent's own AgentToMembrane join for this same membrane — and
      //    it fails on age alone, which is the strongest shape available: it
      //    exercises `tenure_satisfied`'s arithmetic rather than the type and
      //    ownership tests in front of it. The refusal is also what proves
      //    cases 1 and 2 passed on this payload.
      {
        rule: 'AttestationGrant requires proof of sufficiently tenured membership in this '
            + 'membrane — the referenced action must be the granter\'s own AgentToMembrane '
            + 'join for this same membrane, created at least the required tenure period ago.',
        payload: (ctx) => grantPayload(ctx, ctx.joinAction.slice(3)),
      },
    ],
  },
];

// The tag is `ActionHash::from_raw_36(tag.0)`, so it carries the 36 bytes AFTER
// an ActionHash's 3-byte prefix — hence `.slice(3)` at every call site above.
// The target is entry-prefixed for the reason the Reinforcement baseline
// records at length: `create_link(base, agent, ..)` reaches AnyLinkableHash via
// `EntryHash::from(AgentPubKey)`, which rewrites those three bytes, and the
// agent-prefixed form is refused by the deserialiser before any rule runs.
// Nothing in this branch reads the target, so any agent does.
const grantPayload = (ctx, tag) => ({
  kind: 'AttestationGrant',
  base: ctx.membraneEntry,
  target: new Uint8Array([0x84, 0x21, 0x24, ...otherKey.slice(3)]),
  tag: Array.from(tag),
  anchor_of: null,
  question_anchor_of: null,
});

for (const spec of entries) await drive(spec);
for (const spec of linkEntries) await drive(spec);
for (const spec of unbaselinedLinks) await driveUnbaselined(spec);

// ---------------------------------------------------------------- coverage
// WHY THIS IS A CHECK AND NOT A PRINTOUT. The inventory drift gate in
// live-verify.yml notices when `lib.rs` changes without `inventory.json` being
// regenerated. It cannot notice the next step: an inventory regenerated and
// committed correctly, with no case added here. That leaves a green run whose
// coverage silently shrank, which is this repository's most frequently
// rediscovered defect — a tick that no longer means what it meant.
log('--- coverage: every inventoried rule for these entry types has a case ---');

const named = new Set(entries.flatMap((s) => s.cases.map((c) => c.rule)));
const gapped = new Set(GAPS.map((g) => g.rule));

for (const entry of COVERED) {
  // `passthrough` sites forward another validator's result and have no message
  // of their own; `needs_prober` and `remote` are not reachable from here at
  // all. See README.md's class table for why the denominator is not 194.
  const sites = inv.sites.filter(
    (s) => s.entry === entry && ['honest', 'crafted', 'deferred'].includes(s.class) && s.message,
  );
  const messages = [...new Set(sites.map((s) => s.message))];
  const missing = messages.filter((m) => !named.has(m) && !gapped.has(m));
  const gapsHere = messages.filter((m) => gapped.has(m));

  check(missing.length === 0,
    `${entry}: ${messages.length - gapsHere.length} of ${messages.length} assertable rules have a case`
      + (gapsHere.length ? `, ${gapsHere.length} declared unreachable` : ''),
    missing.length === 0 ? null
      : `no case for: ${missing.map((m) => JSON.stringify(m)).join(', ')}`);
}

// The gaps have to still be real. A declared-unreachable rule that the zome no
// longer has is an exemption outliving its subject, and it would go on
// subtracting from the denominator forever — so it reds here exactly as an
// orphaned case does.
const inventoriedAll = new Set(inv.sites.filter((s) => s.message).map((s) => s.message));
const staleGaps = GAPS.filter((g) => !inventoriedAll.has(g.rule));
check(staleGaps.length === 0,
  `every declared-unreachable rule is still in the inventory`,
  staleGaps.length === 0 ? null
    : `no longer a rule: ${staleGaps.map((g) => JSON.stringify(g.rule)).join(', ')}`);

if (GAPS.length) {
  log('');
  log(`  declared unreachable from this harness (${GAPS.length}), each still inventoried:`);
  for (const g of GAPS) log(`    - [${g.entry ?? g.linkType}] ${g.why}`);
}

// --- The same two checks for link types, keyed on `link_type` rather than
// `entry`. Link sites all share entry "create_link", so grouping them by entry
// would collapse nineteen different rule sets into one meaningless denominator.
log('');
log('--- coverage: every inventoried rule for these link types has a case ---');

const namedLinks = new Set(
  [...linkEntries, ...unbaselinedLinks].flatMap((s) => s.cases.map((c) => c.rule)),
);

for (const lt of COVERED_LINKS) {
  const sites = inv.sites.filter(
    (s) => s.link_type === lt && ['honest', 'crafted', 'deferred'].includes(s.class) && s.message,
  );
  const messages = [...new Set(sites.map((s) => s.message))];
  const missing = messages.filter((m) => !namedLinks.has(m) && !gapped.has(m));
  const gapsHere = messages.filter((m) => gapped.has(m));

  check(missing.length === 0,
    `${lt}: ${messages.length - gapsHere.length} of ${messages.length} assertable rules have a case`
      + (gapsHere.length ? `, ${gapsHere.length} declared unreachable` : ''),
    missing.length === 0 ? null
      : `no case for: ${missing.map((m) => JSON.stringify(m)).join(', ')}`);
}

const inventoriedLinks = new Set(
  inv.sites.filter((s) => COVERED_LINKS.includes(s.link_type) && s.message).map((s) => s.message),
);
const linkOrphans = [...namedLinks].filter((m) => !inventoriedLinks.has(m));
check(linkOrphans.length === 0,
  `every link case here names a rule the inventory still lists`,
  linkOrphans.length === 0 ? null
    : `not in the inventory: ${linkOrphans.map((m) => JSON.stringify(m)).join(', ')}`);

// And the other direction, which catches a case left behind by a rule that was
// REMOVED or whose wording changed — a case asserting a message the zome can no
// longer produce would otherwise sit here looking like coverage.
const inventoried = new Set(
  inv.sites.filter((s) => COVERED.includes(s.entry) && s.message).map((s) => s.message),
);
const orphans = [...named].filter((m) => !inventoried.has(m));
check(orphans.length === 0,
  `every case here names a rule the inventory still lists`,
  orphans.length === 0 ? null
    : `not in the inventory: ${orphans.map((m) => JSON.stringify(m)).join(', ')}`);

log('');
log(`${pass} passed, ${fail} failed, ${skip} skipped`);
if (failures.length) {
  log('');
  log('failures:');
  for (const f of failures) log(`  - ${f.label}${f.detail ? `\n      ${f.detail}` : ''}`);
}
process.exit(fail === 0 ? 0 : 1);
