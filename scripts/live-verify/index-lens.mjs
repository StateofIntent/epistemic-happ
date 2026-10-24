#!/usr/bin/env node
// ============================================================================
// scripts/live-verify/index-lens.mjs — THE READ A SYBIL FLOOD POLLUTES, WITH
// THE LENS ON IT. docs/open-work.md item 7.12.
//
// WHAT IT PROVES. `SECURITY.md`'s honest limit is that **containment holds
// for what you traverse to and nothing for what you look up**: a
// critique-graph walk degrades gracefully when a flood arrives, and
// `get_claims_by_domain` returns the flood in full because an anchor link
// read has no notion of who wrote what. `get_membrane_claims` applies the
// opt-in `AttestationPolicy` that already existed to that index read.
//
// WHY THE LENS IS THE ONLY PLACE LEFT, which is the argument this harness
// is evidence for rather than a preamble: charging for identity needs a
// scarce resource the protocol does not have, refusing sybils at write time
// needs the protocol to decide who is real (Invariant #10, and there is no
// faculty for it — validation cannot observe a person any more than it can
// read a clock), and cleaning up afterwards is impossible under Invariant
// #6. Prevention and cleanup both foreclosed, the read remains.
//
// HOW ATTESTATION IS OBTAINED HERE, because the obvious route is closed.
// `grant_attestation` requires 30 days of membrane tenure, so no fixture
// can ever produce one — `trust-lenses.mjs` says so and tests the refusal.
// But the ATTESTATION POLICY section names a second source: an agent who
// has created a `SynapticLink` to one of another's Claims directly attests
// that author, which `create_critique` does for every critique, global and
// needing no grant. So agent1 critiquing agent2's claim is what makes
// agent2 attested, and it costs no tenure.
//
// THE FIXTURE MAKES THE LENS SEPARATE TWO AUTHORS, because a filter that
// dropped everything and a filter that dropped the right thing look
// identical from a single row:
//
//   agent2   two claims, and agent1 critiques one of them   -> ATTESTED
//   agent3   one claim, nobody engages with it              -> UNATTESTED
//
// So the filtered read must return agent2's two and drop agent3's one. A
// lens that did nothing returns three; a lens that over-refused returns
// zero; both are red.
//
// AND IT CHECKS THE COUNTED DROPS, WHICH IS §7b.1 RATHER THAN POLISH. The
// discipline forbids "a read that returns fewer things than it considered
// without saying so", so `examined` must be 3 under both policies while
// `filtered_unattested` moves from 0 to 1 — a read that quietly returned
// two of three would otherwise be indistinguishable from a domain holding
// two.
//
// Prereqs: a CLEAN sandbox (scripts/sandbox.sh clean && start) and a .happ
// built from a tree containing get_membrane_claims.
// ============================================================================

import { AdminWebsocket, AppWebsocket, CellType } from '@holochain/client';

const ADMIN_URL = 'ws://localhost:8889';
const APP_URL = 'ws://localhost:8888';
const APP_ID = 'epistemic-resonance-happ';
const HAPP_PATH = new URL('../../epistemic-resonance-happ.happ', import.meta.url).pathname;
const DOMAIN = `IndexLens${Date.now()}`;
const PROMISE = 'state a method';

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
const refusal = async (agent, fn, payload) => {
  try { await agent.call(fn, payload); return null; }
  catch (e) { return String(e?.message ?? e); }
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

async function ensure(admin, appId) {
  const apps = await admin.listApps({});
  if (!apps.some((a) => a.installed_app_id === appId)) {
    const key = await admin.generateAgentPubKey();
    await admin.installApp({ source: { type: 'path', value: HAPP_PATH }, agent_key: key, installed_app_id: appId });
    await admin.enableApp({ installed_app_id: appId });
  }
  return connectApp(admin, appId);
}

async function main() {
  log('=== THE INDEX READ, WITH THE LENS ON IT ===\n');
  const admin = await AdminWebsocket.connect({ url: new URL(ADMIN_URL), wsClientOptions: { origin: 'live-verify' } });
  const a1 = await connectApp(admin, APP_ID);
  const a2 = await ensure(admin, 'epistemic-resonance-happ-agent2');
  const a3 = await ensure(admin, 'epistemic-resonance-happ-agent3');
  log(`a1 = ${b64(a1.me).slice(0, 10)}…  a2 = ${b64(a2.me).slice(0, 10)}…  a3 = ${b64(a3.me).slice(0, 10)}…\n`);

  // --- the membrane, because the read is anchored to one ------------------
  const constitution = await a1.call('publish_constitution', {
    agent: a1.me, promises: [{ action: PROMISE, domain: DOMAIN, modality: null }],
    conditions: [], published_at: nowSecs(), expires_at: null,
  });
  const membraneAction = await a1.call('create_membrane', {
    domain: DOMAIN, description: 'Seeded for the index-lens verification.',
    required_promises: [PROMISE], validation_rules_hash: null,
    creator: a1.me, created_at: nowSecs(), constitution,
  });
  const seeded = (await a1.call('get_membranes', null))
    .find((r) => b64(r.signed_action.hashed.hash) === b64(membraneAction));
  if (!seeded) setupFail(['The membrane just created is not in get_membranes — probably a STALE BUILD.']);
  const membrane = seeded.signed_action.hashed.content.data.entry_hash;

  const claim = async (agent, content) => {
    const action = await agent.call('create_claim', {
      content, domain: DOMAIN, author: agent.me, timestamp: nowMicros(),
      evidence_hashes: [], confidence: 'Moderate', semantic_tags: [], source_mew: null,
    });
    const rows = await agent.call('get_claims_by_domain', DOMAIN);
    const row = rows.find((r) => b64(r.signed_action.hashed.hash) === b64(action));
    if (!row) setupFail([`Claim "${content}" did not reach the domain index.`]);
    return { action, entry: row.signed_action.hashed.content.data.entry_hash };
  };

  const engaged = await claim(a2, 'a claim by an author somebody engages with');
  const alsoEngaged = await claim(a2, 'a second claim by that same author');
  await claim(a3, 'a claim by an author nobody engages with');

  // THE ATTESTATION, and it costs no tenure: create_critique writes a
  // SynapticLink, and an agent who has SynapticLinked to one of another's
  // claims directly attests that author.
  await a1.call('create_critique', {
    target: engaged.entry, target_type: 'Claim', critique_mode: 'Methodological',
    content: 'the method is not stated', author: a1.me, timestamp: nowMicros(),
    replication_attempted: false, evidence_hashes: [], species: null,
  });

  const policy = { require_attestation_from: [a1.me], min_attestations: 1, max_attestation_depth: 1 };

  // === 1. THE FIXTURE IS ASSERTED BEFORE ANYTHING RESTS ON IT ============
  log('--- 1. the fixture: one attested author, one not ---');
  const a2Attested = await a1.call('is_agent_attested', { candidate: a2.me, membrane, policy });
  const a3Attested = await a1.call('is_agent_attested', { candidate: a3.me, membrane, policy });
  check('the engaged author IS attested under a1\'s policy — the critique\'s SynapticLink did it',
    a2Attested === true);
  check('and the unengaged author is NOT — so the policy can actually separate them',
    a3Attested === false);
  if (a2Attested !== true || a3Attested !== false) {
    log('  (without that separation every check below would be vacuous — stopping)');
    log(`\n${failures} CHECK(S) FAILED`);
    process.exit(1);
  }

  // === 2. NO POLICY IS THE OLD BEHAVIOUR, EXACTLY ========================
  log('\n--- 2. None means unfiltered, and says so ---');
  let open;
  try {
    open = await a1.call('get_membrane_claims', { membrane, attestation_policy: null });
  } catch (e) {
    setupFail([
      'get_membrane_claims threw on its first call.',
      'If the code looks right the conductor is on a STALE BUILD — repack the .happ.',
      String(e?.message ?? e).slice(0, 300),
    ]);
  }
  log(`    examined ${open.examined}, returned ${open.claims.length}, unresolvable ${open.unresolvable}, filtered ${open.filtered_unattested}`);
  check('the domain is read off the resolved Membrane, not supplied by the caller',
    open.domain === DOMAIN);
  check('with no policy, every claim in the domain comes back — all three',
    open.claims.length === 3 && open.examined === 3);
  check('and NOTHING was filtered, which is a real neutral position rather than a default',
    open.filtered_unattested === 0 && open.attestation_filtered === false);

  const plain = await a1.call('get_claims_by_domain', DOMAIN);
  check('and it agrees with the unlensed read it wraps, so None changes nothing',
    plain.length === open.claims.length);

  // === 3. THE LENS SEPARATES TWO AUTHORS =================================
  log('\n--- 3. a policy excludes the unattested author, and ONLY that one ---');
  const lensed = await a1.call('get_membrane_claims', { membrane, attestation_policy: policy });
  log(`    examined ${lensed.examined}, returned ${lensed.claims.length}, unresolvable ${lensed.unresolvable}, filtered ${lensed.filtered_unattested}`);
  // THE AUTHOR IS IN content.header, NOT content.data. Two wrong guesses
  // cost two conductor runs here: `content` splits into { header, data },
  // and `data` carries { type, entry_type, entry_hash } while the header
  // carries { author, timestamp, action_seq, prev_action }. Every other
  // harness reads entry hashes off `.content.data`, which is what made
  // `.content.data.author` look right. Probed rather than guessed a third
  // time, and written down so nobody pays for it again.
  const authors = lensed.claims.map((r) => b64(r.signed_action.hashed.content.header.author));
  check('THE READ A FLOOD POLLUTES NOW EXCLUDES AN UNATTESTED AUTHOR',
    lensed.claims.length === 2);
  check('and it kept BOTH claims of the attested author — not a blanket refusal',
    authors.filter((x) => x === b64(a2.me)).length === 2);
  check('and the unattested author appears nowhere in the result',
    !authors.includes(b64(a3.me)));
  check('the caller is echoed as the promiser of the filter — §7b.2, the mode declared',
    lensed.attestation_filtered === true);

  // === 4. THE DROP IS COUNTED, WHICH IS §7b.1 ============================
  log('\n--- 4. the drop is counted, not silent ---');
  check('it still reports examining all three, so the filtered read cannot pass as a smaller domain',
    lensed.examined === 3);
  check('and it names how many the policy excluded',
    lensed.filtered_unattested === 1);
  check('returned + filtered + unresolvable accounts for everything examined',
    lensed.claims.length + lensed.filtered_unattested + lensed.unresolvable === lensed.examined);

  // === 5. A POLICY NOBODY SATISFIES, AND A BAD ANCHOR =====================
  log('\n--- 5. the edges ---');
  const impossible = await a1.call('get_membrane_claims', {
    membrane,
    attestation_policy: { require_attestation_from: [a3.me], min_attestations: 1, max_attestation_depth: 1 },
  });
  check('a policy rooted in an agent who has attested nobody returns nothing — and SAYS it dropped three',
    impossible.claims.length === 0 && impossible.filtered_unattested === 3 && impossible.examined === 3);

  const notAMembrane = await refusal(a1, 'get_membrane_claims', {
    membrane: engaged.entry, attestation_policy: null,
  });
  check('a hash that is not a Membrane is refused rather than read as an empty domain',
    notAMembrane !== null && /not a Membrane/i.test(notAMembrane));

  log('');
  if (failures > 0) {
    log(`${failures} CHECK(S) FAILED`);
    process.exit(1);
  }
  log('ALL CHECKS PASSED');
}

main().catch((e) => { console.error(e); process.exit(1); });
