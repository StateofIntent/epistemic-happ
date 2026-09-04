#!/usr/bin/env node
// ============================================================================
// scripts/live-verify/mew-lifecycle.mjs — THE TWITTER BRIDGE'S ZOME SURFACE,
// END TO END, WITHOUT TOUCHING TWITTER.
//
// WHY THIS EXISTS. Nine coordinator functions belong to `bridge/` and, until
// this file, NOT ONE of them was exercised against a running conductor by
// anything in this directory. They had unit tests and inspection and nothing
// else — which is exactly the position this project records as insufficient:
// a deliberately broken `get_claims_by_domain` once passed the whole suite,
// because packing does not compile and a stale build verifies the previous
// version of everything. The bridge was the last subsystem resting on that.
//
// AND IT DOES NOT NEED TWITTER, which is the thing that made this look
// blocked for longer than it was. Holochain zome functions cannot make
// network calls — there is no HTTP in the WASM host — so all nine of these
// are pure DHT and source-chain operations. Checked rather than assumed: the
// coordinator's only matches for `http`/`fetch` are in comments. The live
// X API layer (auth, rate limits, response parsing) lives in `bridge/` and
// remains genuinely unverified, deferred pending API budget. THIS FILE DOES
// NOT COVER THAT, and a green run here must not be read as covering it.
//
// THE PROPERTY WORTH CHECKING IS NOT THE CRUD. It is that the bridge is
// "a transducer, not a pipe" — README's phrase — and that nothing crosses
// automatically. A Mew is not a Claim. A Claim is not mirrored. Each step is
// a separate, deliberate, witnessed action, and the temporal separation the
// README claims is a property this file can actually measure rather than
// assert: after each step it checks that the NEXT one has not silently
// happened.
//
// TWO SCOPING FACTS THAT ARE EASY TO GET BACKWARDS, and are asserted here
// because a bridge that got them wrong would mirror other people's work.
// `get_unbridged_mews` and `get_unbridged_claims` both use `query()` with a
// `ChainQueryFilter`, which reads the CALLER'S OWN SOURCE CHAIN and not the
// DHT. So they are chain-local by construction: an agent can only ever be
// offered their own unmirrored material. That is the correct behaviour for
// a bridge and it is invisible from the function names, so a second agent
// publishes an unbridged Mew and an unbridged Claim here purely so their
// absence from agent 1's lists can be checked.
//
// Prereqs: a CLEAN sandbox (scripts/sandbox.sh clean && start). Safe to
// re-run without cleaning: every string is stamped from Date.now(), and
// create_mew spends no SWO friction budget.
// ============================================================================
// ---------------------------------------------------------------------------
// NEGATIVE EVIDENCE — this harness found a real defect in shipped code on
// its FIRST RUN, before any injection was contrived for it.
//
//   Result, first run: "promotion produced exactly one Claim" went red, and
//   the run aborted rather than reporting on anything downstream of a step
//   that had not worked. `promote_mew_to_claim` created a Claim, linked it
//   from the Mew and from the agent anchor — and NEVER indexed it under its
//   domain. `create_claim` creates both AgentToClaim and DomainToClaim;
//   promotion created AgentToClaim and MewToClaim and no domain link at all.
//
//   What that meant in practice: every Claim the Twitter bridge promoted was
//   invisible to get_claims_by_domain, which is every by-domain reader there
//   is — the Browse tab included. The Claim existed, validated, and was
//   reachable through get_claims_by_agent, so the bridge could promote a Mew,
//   report success, and produce something nobody browsing that domain would
//   ever see. Fixed by adding the domain link that create_claim has had since
//   its own version of this bug was fixed; the comment there records the same
//   defect ("browsing a domain returned only your own claims") being repaired
//   on that path and never propagated to this one.
//
//   THE 67 COORDINATOR UNIT TESTS PASSED THROUGHOUT, before the fix and
//   after. They are not wrong; they simply cannot see this. A missing link
//   is not a bad return value — the function returns a perfectly good
//   ActionHash either way, and only a reader on the other side of the DHT
//   notices that nothing is there. That is the whole argument for this
//   directory existing, restated by the one subsystem that had been left out
//   of it.
//
//   Injection: `source_mew: None` in promote_mew_to_claim, dropping the
//   provenance link back to the Mew.
//   Result: exactly one red — "the Claim names the Mew it came from". The
//   content, tag and author checks stayed green, correctly: a promoted claim
//   with its provenance stripped is identical in every other respect, which
//   is precisely why that assertion is worth making separately rather than
//   folding into a general "the claim looks right".
//
//   Restored and re-run: 21 checks green.
// ---------------------------------------------------------------------------

import { AdminWebsocket, AppWebsocket, CellType } from '@holochain/client';
import { decode } from '@msgpack/msgpack';

const ADMIN_URL = 'ws://localhost:8889';
const APP_URL = 'ws://localhost:8888';
const APP_ID = 'epistemic-resonance-happ';
const AGENT2_APP_ID = 'epistemic-resonance-happ-mew2';
const HAPP_PATH = new URL('../../epistemic-resonance-happ.happ', import.meta.url).pathname;

const STAMP = Date.now();
const MEW_TEXT = `A mew about loaded carries, stamped ${STAMP}.`;
const OTHER_MEW_TEXT = `Agent 2's mew, stamped ${STAMP}.`;
const DOMAIN = `MewDomain${STAMP}`;
const TWEET_ID = `tweet-${STAMP}`;
const REPLY_TEXT = `An external reply, stamped ${STAMP}.`;
const REPLY_HANDLE = '@somebody';

const log = (...a) => console.log(...a);
let failures = 0;
const check = (label, cond) => {
  if (cond) log(`  PASS: ${label}`);
  else { log(`  FAIL: ${label}`); failures++; }
};
function setupFail(lines) {
  log('');
  for (const l of lines) log(`  SETUP FAILED: ${l}`);
  process.exit(1);
}

const b64 = (u8) => Buffer.from(u8).toString('base64');
const nowMicros = () => Date.now() * 1000;
const nowSecs = () => Math.floor(Date.now() / 1000);
const entryOf = (record) => decode(record.entry.Present.entry);

async function connectApp(admin, appId) {
  const { token } = await admin.issueAppAuthenticationToken({ installed_app_id: appId });
  const app = await AppWebsocket.connect({ url: new URL(APP_URL), token, wsClientOptions: { origin: 'live-verify' } });
  const info = await app.appInfo();
  const cellIds = [];
  for (const rc of Object.values(info.cell_info)) {
    for (const c of rc) {
      if (CellType.Provisioned in c) cellIds.push(c[CellType.Provisioned].cell_id);
      else if (CellType.Cloned in c) cellIds.push(c[CellType.Cloned].cell_id);
    }
  }
  if (cellIds.length === 0) setupFail([`App "${appId}" has no provisioned cells.`]);
  for (const id of cellIds) await admin.authorizeSigningCredentials(id);
  const call = (fn, payload) =>
    app.callZome({ role_name: 'epistemic', zome_name: 'epistemic_coordinator', fn_name: fn, payload });
  return { me: cellIds[0][1], call };
}

async function main() {
  const admin = await AdminWebsocket.connect({ url: new URL(ADMIN_URL), wsClientOptions: { origin: 'live-verify' } });
  const a1 = await connectApp(admin, APP_ID);
  log(`agent1 = ${b64(a1.me).slice(0, 12)}…`);

  const apps = await admin.listApps({});
  if (!apps.some((a) => a.installed_app_id === AGENT2_APP_ID)) {
    const key = await admin.generateAgentPubKey();
    // installApp takes `source: { type: 'path', value }` as of client
    // 0.21, not a bare `path`, and no longer accepts a top-level
    // `membrane_proofs` map. The old shape is rejected by the conductor
    // with "deserialization: Failed to deserialize request".
    await admin.installApp({ source: { type: 'path', value: HAPP_PATH }, agent_key: key, installed_app_id: AGENT2_APP_ID });
    await admin.enableApp({ installed_app_id: AGENT2_APP_ID });
  }
  const a2 = await connectApp(admin, AGENT2_APP_ID);
  log(`agent2 = ${b64(a2.me).slice(0, 12)}…  (the scoping control)\n`);
  if (b64(a1.me) === b64(a2.me)) setupFail(['Both slots resolved to the same agent; the scoping checks could not fail.']);

  // ---- 1. A Mew is created, and is only a Mew --------------------------
  log('--- 1. A Mew exists, and creating it created nothing else ---');
  await a1.call('create_mew', {
    content: MEW_TEXT, author: a1.me, timestamp: nowMicros(),
    reply_to: null, semantic_tags: ['rehab'], linked_claim: null,
  });
  const mine = await a1.call('get_mews_by_agent', a1.me);
  const mewRec = mine.find((r) => entryOf(r).content === MEW_TEXT);
  check('the Mew is findable by its author', mewRec !== undefined);
  if (!mewRec) setupFail(['The Mew just created was not returned by get_mews_by_agent.']);
  const mewHash = mewRec.signed_action.hashed.content.data.entry_hash;

  const fetched = await a1.call('get_mew', mewHash);
  check('get_mew returns it by hash, with its content intact',
    fetched !== null && fetched.content === MEW_TEXT);
  check('the Mew carries NO linked_claim — a Mew is not a Claim',
    fetched.linked_claim === null || fetched.linked_claim === undefined);
  check('CONTROL: no Claim exists in the domain yet — nothing was promoted automatically',
    (await a1.call('get_claims_by_domain', DOMAIN)).length === 0);

  // ---- 2. Unbridged means MINE and unmirrored -------------------------
  log('\n--- 2. The unbridged queue is chain-local, not the whole DHT ---');
  await a2.call('create_mew', {
    content: OTHER_MEW_TEXT, author: a2.me, timestamp: nowMicros(),
    reply_to: null, semantic_tags: [], linked_claim: null,
  });
  const unbridgedMews = await a1.call('get_unbridged_mews', null);
  const texts = unbridgedMews.map((u) => entryOf(u.record).content);
  check('agent1\'s own unmirrored Mew is offered for bridging', texts.includes(MEW_TEXT));
  check('CONTROL: agent2\'s unmirrored Mew is NOT — `query()` reads one source chain, never the DHT',
    !texts.includes(OTHER_MEW_TEXT));
  const a2Sees = (await a2.call('get_unbridged_mews', null)).map((u) => entryOf(u.record).content);
  check('CONTROL, the other direction: agent2 sees its own and not agent1\'s',
    a2Sees.includes(OTHER_MEW_TEXT) && !a2Sees.includes(MEW_TEXT));

  // ---- 3. Promotion is a deliberate, provenance-preserving act --------
  log('\n--- 3. Promotion carries provenance, and mirrors nothing ---');
  await a1.call('promote_mew_to_claim', {
    mew_hash: mewHash, domain: DOMAIN, evidence_hashes: [], confidence: 'Tentative',
  });
  const claims = await a1.call('get_claims_by_domain', DOMAIN);
  check('promotion produced exactly one Claim', claims.length === 1);
  if (claims.length !== 1) setupFail(['Promotion did not produce a single Claim; nothing below is interpretable.']);
  const claim = entryOf(claims[0]);
  const claimHash = claims[0].signed_action.hashed.content.data.entry_hash;
  check('the Claim carries the Mew\'s content', claim.content === MEW_TEXT);
  check('the Claim carries the Mew\'s semantic tags', JSON.stringify(claim.semantic_tags) === JSON.stringify(['rehab']));
  check('the Claim names the Mew it came from — provenance, not a copy',
    claim.source_mew !== null && b64(claim.source_mew) === b64(mewHash));
  check('the Claim keeps the Mew\'s author, not the promoter of record',
    b64(claim.author) === b64(a1.me));
  check('CONTROL: the promoted Claim is NOT yet mirrored — promotion is not publication',
    (await a1.call('get_unbridged_claims', null))
      .map((u) => entryOf(u.record).content).includes(MEW_TEXT));

  // ---- 4. Mirroring is the step that clears the queue -----------------
  log('\n--- 4. Mirroring, and what it changes ---');
  const beforeMirror = (await a1.call('get_unbridged_claims', null))
    .map((u) => entryOf(u.record).content).filter((c) => c === MEW_TEXT).length;
  await a1.call('record_twitter_mirror', {
    mew_hash: claimHash, twitter_id: TWEET_ID, platform: 'twitter',
    mirrored_at: nowSecs(), carried_fields: ['content'],
    dropped_fields: ['confidence', 'evidence_hashes'],
    original_length: MEW_TEXT.length, excerpt_length: MEW_TEXT.length,
  });
  const afterMirror = (await a1.call('get_unbridged_claims', null))
    .map((u) => entryOf(u.record).content).filter((c) => c === MEW_TEXT).length;
  check(`the Claim left the unbridged queue once mirrored (${beforeMirror} -> ${afterMirror})`,
    beforeMirror === 1 && afterMirror === 0);
  check('CONTROL: the Mew itself is still unbridged — mirroring the Claim did not mirror the Mew',
    (await a1.call('get_unbridged_mews', null)).map((u) => entryOf(u.record).content).includes(MEW_TEXT));

  // ---- 5. A reply comes back and lands on the right Claim -------------
  log('\n--- 5. An external reply is imported against its Claim ---');
  const otherClaimHash = (await a1.call('get_claims_by_domain', DOMAIN))[0]
    .signed_action.hashed.content.data.entry_hash;
  await a1.call('create_claim', {
    content: `An unrelated claim, stamped ${STAMP}.`, domain: DOMAIN,
    confidence: 'Moderate', semantic_tags: [], author: a1.me,
    timestamp: nowMicros(), evidence_hashes: [], attestation_policy: null,
  });
  const all = await a1.call('get_claims_by_domain', DOMAIN);
  const unrelated = all.find((r) => entryOf(r).content.startsWith('An unrelated claim'));
  const unrelatedHash = unrelated.signed_action.hashed.content.data.entry_hash;

  await a1.call('import_twitter_reply', {
    twitter_id: `${TWEET_ID}-reply`, author_handle: REPLY_HANDLE, content: REPLY_TEXT,
    linked_holochain_claim: otherClaimHash, imported_at: nowSecs(),
  });
  const replies = await a1.call('get_twitter_replies_for_claim', otherClaimHash);
  check('the imported reply is returned for the Claim it was linked to', replies.length === 1);
  if (replies.length === 1) {
    const r = entryOf(replies[0]);
    check('the reply keeps its content and its external handle',
      r.content === REPLY_TEXT && r.author_handle === REPLY_HANDLE);
    check('the reply names the Claim it answers',
      b64(r.linked_holochain_claim) === b64(otherClaimHash));
  }
  check('CONTROL: a different Claim has no replies — the link is not global',
    (await a1.call('get_twitter_replies_for_claim', unrelatedHash)).length === 0);

  // ---- 6. Nothing crossed on its own ----------------------------------
  //
  // The README calls the bridge "a transducer, not a pipe". Each of the
  // three steps above was a separate call, and this is where that is
  // stated as a result rather than a design intention.
  log('\n--- 6. Every crossing was a deliberate act ---');
  check('a Mew still exists as a Mew after promotion — promotion adds, never replaces',
    (await a1.call('get_mew', mewHash)) !== null);
  check('agent2\'s Mew was never promoted, mirrored, or replied to by any of this',
    (await a2.call('get_unbridged_mews', null)).map((u) => entryOf(u.record).content).includes(OTHER_MEW_TEXT));

  log('');
  if (failures === 0) {
    log('ALL CHECKS PASSED — the bridge\'s zome surface carries a Mew to a Claim');
    log('to a mirror to an imported reply, one deliberate step at a time, and');
    log('offers each agent only their own unmirrored work.');
    log('');
    log('NOT COVERED: the live X API layer in bridge/ — auth, rate limits and');
    log('response parsing remain unverified, deferred pending API budget.');
  } else {
    log(`${failures} CHECK(S) FAILED.`);
  }
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error('\nHARNESS ERROR:', e); process.exit(1); });
