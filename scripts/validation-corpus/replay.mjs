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
// table. `WorldlineTrace` and `Revelation` need dependency chains rather than
// payloads, which is a larger job than this file.
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
    prediction: 'corpus prediction, committed by the OTHER agent',
    salt: 'corpus-other-salt-4a1c',
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
    prediction: 'corpus prediction, committed by the OTHER agent',
    salt: 'corpus-other-salt-4a1c',
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

  _others = {
    domain, constitution, claimAction, claimEntry, membraneAction, membraneEntry,
    mewAction, traceAction, preRegAction, revelationAction,
    replacementAction, replacementEntry, retractionAction,
    mewEntry: otherMewEntry, promotedAction, externalCritiqueAction,
    federationAction: otherFederationAction,
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
const COVERED = [
  'claim', 'mew', 'evidence', 'constitution', 'critique_species', 'retraction',
  'critique', 'antibody_pattern', 'membrane', 'federation_record',
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
  {
    entry: 'critique',
    rule: 'SWO temporal friction: author has {} Critiques in the last {} seconds (limit {}). This is enforced by DHT validation, not a client-side courtesy.',
    why: "the coordinator pre-checks the same limit and refuses first with its own wording; no attempt_* extern bypasses create_critique",
  },
  {
    entry: 'antibody_pattern',
    rule: 'SWO temporal friction: author has {} AntibodyPatterns in the last {} seconds (limit {}). This is enforced by DHT validation, not a client-side courtesy.',
    why: 'the coordinator pre-checks the same limit and refuses first; no bypassing extern for publish_antibody_pattern',
  },
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
      await call('create_claim', {
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
      return { target, notCritiquable, domain };
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
    }),
    cases: [
      { rule: 'Critique author must match action author.', mutate: (c) => { c.author = danglingHash('agent', 61); } },
      // The target really is a Claim; the payload CLAIMS it is a Constitution.
      // Both halves have to be true at once or this is the rule below instead.
      { rule: 'Critique target_type does not match what the target actually is.', mutate: (c) => { c.target_type = 'Constitution'; } },
      { rule: 'Critique target is not a critiquable entry type.', mutate: (c, ctx) => { c.target = ctx.notCritiquable; } },
      { rule: 'Critique content cannot be empty.', mutate: (c) => { c.content = ''; } },
      { rule: 'Critique species reference not found.', expect: 'deferral', mutate: (c) => { c.species = danglingHash('entry', 62); } },
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
];

// --- One driver for all five, rather than the Claim block copied four times.
// The baseline-first rule and the refused-for-a-different-reason rule are the
// two things this harness is actually about, and they are now written once.
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
    const kind = c.expect ?? 'refusal';

    if (err === null) {
      check(false, `${kind}: ${c.rule}`, 'the call COMMITTED — nothing stopped this payload');
      continue;
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
      const brace = c.rule.indexOf('{');
      const expect = brace === -1 ? c.rule : c.rule.slice(0, brace).trimEnd();
      if (brace !== -1 && expect.length < 20) {
        check(false, `refused: ${c.rule}`,
          `this rule interpolates too early to identify it from a prefix (${JSON.stringify(expect)}) — assert it another way`);
        continue;
      }
      const hit = err.includes(expect);
      check(hit, `refused: ${c.rule}`,
        hit ? null : `stopped for a different reason: ${err.slice(0, 180)}`);
      continue;
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
  'MewToClaim', 'ClaimToExternalCritique', 'MembraneToFederationRecord'];

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
];

for (const spec of entries) await drive(spec);
for (const spec of linkEntries) await drive(spec);

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

const namedLinks = new Set(linkEntries.flatMap((s) => s.cases.map((c) => c.rule)));

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
