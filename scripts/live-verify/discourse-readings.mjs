#!/usr/bin/env node
// ============================================================================
// scripts/live-verify/discourse-readings.mjs — A READING IS SOMEBODY'S PROMISE,
// and two of them may contradict each other.
//
// READINESS item 9. `get_discourse_health` computed an aggregate that dead-ended
// at the caller; `publish_discourse_reading` makes it a first-class, attributed,
// critiquable Claim. The governance decision this ships is not a feature flag
// and is worth stating before the checks:
//
//   TWO AGENTS MAY PUBLISH CONTRADICTORY READINGS OF THE SAME DISCOURSE AND
//   THIS PROTOCOL WILL NOT ADJUDICATE BETWEEN THEM.
//
// §4 is that decision made empirical rather than asserted: two agents read the
// SAME membrane, publish DIFFERENT figures, and both readings stand, signed,
// with nothing computing which is right.
//
// WHY INVARIANT 1 IS NOT BREACHED, which is what this harness is really
// testing. The objection to a canonical score is that it claims a view from
// nowhere. An attributed reading claims a view from SOMEWHERE, so it is a
// promise like any other and critiquable by anyone who disputes the method —
// strictly stronger than a protocol-computed score, because a protocol's
// arithmetic cannot be argued with. §3 therefore does not merely check that a
// reading CAN be critiqued; it critiques one, through the same typed
// CritiqueMode machinery every other claim uses.
//
// THE CONTROL IS §5 AND WITHOUT IT §2 WOULD BE VACUOUS. "The reading states its
// method" is only worth asserting if the method can CHANGE the figure. So two
// readings are taken of the same membrane at the same moment through different
// conductance lenses, and the harness requires the figures to differ before it
// will credit the method statement with meaning anything.
//
// Prereqs: a sandbox conductor (scripts/sandbox.sh clean && start) and a built
// .happ. Two agents on one conductor — the second exists so §4 has somebody to
// disagree with, which is the same reason trust-lenses.mjs installs one.
// ---------------------------------------------------------------------------
// NEGATIVE EVIDENCE — this harness has been watched failing.
//
//   AP: the METHOD omitted from the rendered content, left in the return value.
//   Result: 1 red, §2's content check, and NOTHING ELSE — including
//   `it declares that it stated its method`, which went on passing because
//   `method_stated` is a flag the implementation sets about itself. The flag
//   lied and only the artefact caught it. That is why §2 asserts against the
//   DECODED PUBLISHED ENTRY and not against the return: a reading whose method
//   reached the caller but not the record is a figure nobody can dispute.
//
//   AQ: `create_entry` instead of `create_claim`, so the reading is written but
//   not indexed by domain. Result: discoverability, the tag check and the
//   record-presence check all red. §2's content checks red too, as a CASCADE —
//   they read the reading that §1 found, and there was nothing to find. Noted
//   because a cascade is weaker evidence than an isolated red: AP is the one
//   that pins §2.
//
// Re-check both the same way if you change what this asserts.
// ---------------------------------------------------------------------------

import { AdminWebsocket, AppWebsocket, CellType } from '@holochain/client';
// A Record's entry arrives as a msgpack Buffer, not a decoded object — so a
// string search over JSON.stringify(record) finds the BYTES of a tag and never
// the tag. `mew-lifecycle.mjs` already decodes the same way.
import { decode } from '@msgpack/msgpack';

const ADMIN_URL = 'ws://localhost:8889';
const APP_URL = 'ws://localhost:8888';
const APP_ID = 'epistemic-resonance-happ';
const AGENT2_APP_ID = 'epistemic-resonance-happ-agent2';
const HAPP_PATH = new URL('../../epistemic-resonance-happ.happ', import.meta.url).pathname;
const DOMAIN = `Reading${Date.now()}`;
const READING_TAG = 'discourse-health-reading';

const log = (...a) => console.log(...a);
let failures = 0;
const check = (label, cond) => {
  if (cond) log(`  PASS: ${label}`);
  else { log(`  FAIL: ${label}`); failures++; }
};
const nowSecs = () => Math.floor(Date.now() / 1000);
const b64 = (u8) => Buffer.from(u8).toString('base64');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
    log('Installing agent 2 on the same conductor ...');
    const pub2 = await admin.generateAgentPubKey();
    await admin.installApp({ source: { type: 'path', value: HAPP_PATH }, agent_key: pub2, installed_app_id: AGENT2_APP_ID });
    await admin.enableApp({ installed_app_id: AGENT2_APP_ID });
  }
  const a2 = await connectApp(admin, AGENT2_APP_ID);
  log(`agent2 = ${b64(a2.me).slice(0, 12)}… (the one who will disagree)\n`);

  // --- Seed a membrane with real discourse in it ------------------------
  log(`Seeding membrane ${DOMAIN} ...`);
  const constitution = await a1.call('publish_constitution', {
    agent: a1.me,
    promises: [{ action: 'state the method', domain: DOMAIN, modality: null }],
    conditions: [], published_at: nowSecs(), expires_at: null,
  });
  const membraneAction = await a1.call('create_membrane', {
    domain: DOMAIN,
    description: 'Seeded for discourse-reading verification.',
    required_promises: ['state the method'],
    validation_rules_hash: null,
    creator: a1.me,
    created_at: nowSecs(),
    constitution,
  });
  const membranes = await a1.call('get_membranes', null);
  const seeded = membranes.find((r) => r.signed_action?.hashed?.hash
    && b64(r.signed_action.hashed.hash) === b64(membraneAction));
  if (!seeded) {
    log('\n  SETUP FAILED: the membrane just created is not in get_membranes.');
    log('  Probably a STALE BUILD — rebuild with scripts/pack-webhapp.sh and');
    log('  clean the sandbox.');
    process.exit(1);
  }
  const membrane = seeded.signed_action.hashed.content.data.entry_hash;

  await a1.call('create_claim', {
    content: 'An abstract claim, to give the ratio something to measure.',
    domain: DOMAIN, confidence: 'Moderate', evidence_hashes: [],
    semantic_tags: [], author: a1.me, timestamp: Date.now() * 1000,
    source_mew: null,
  });
  // A Critique's target must be ENTRY-shaped: validate_critique refuses an
  // ActionHash with "Critique target must be an EntryHash-shaped reference."
  const seededClaims = await a1.call('get_claims_by_domain', DOMAIN);
  const claimEntryHash = seededClaims[0].signed_action.hashed.content.data.entry_hash;
  await a1.call('create_critique', {
    target: claimEntryHash, target_type: 'Claim', critique_mode: 'Methodological',
    content: 'A critique, so there is something a conductance lens can set aside.',
    author: a1.me, timestamp: Date.now() * 1000,
    replication_attempted: false, evidence_hashes: [], species: null,
  });
  log('    seeded 1 claim + 1 critique\n');

  // === 1. A reading becomes a real entry =================================
  log('--- 1. The computation stops dead-ending at the caller ---');
  const unfiltered = await a1.call('publish_discourse_reading', {
    membrane, attestation_policy: null, conductance_policy: null, confidence: 'Moderate',
  });
  check('a reading publishes and returns its own action hash',
    unfiltered?.action_hash !== undefined && unfiltered.action_hash !== null);
  check('it declares that it stated its method', unfiltered?.method_stated === true);

  const inDomain = await a1.call('get_claims_by_domain', DOMAIN);
  const entryOf = (r) => {
    const buf = r?.entry?.Present?.entry;
    if (!buf) return null;
    try { return decode(Uint8Array.from(buf.data ?? buf)); } catch { return null; }
  };
  const taggedReadings = (rs) => rs.filter((r) => (entryOf(r)?.semantic_tags ?? []).includes(READING_TAG));
  const readings = taggedReadings(inDomain);
  check('the reading is discoverable through the ordinary by-domain index, with no index of its own',
    readings.length >= 1);

  // === 2. It carries its method ==========================================
  log('\n--- 2. The method is part of the reading ---');
  // Asserted against the DECODED PUBLISHED ENTRY rather than the return value:
  // the return carries `method` as a field, and a reading whose method reached
  // the caller but not the record would satisfy a check on the return while
  // publishing a figure nobody can dispute. The content is the artefact.
  const publishedEntry = entryOf(readings[0]);
  const content = publishedEntry?.content ?? '';
  check('the PUBLISHED content states the method, not just the return value',
    content.includes('METHOD:'));
  check('and names the absence of a lens rather than staying silent about it',
    content.includes('no attestation lens') && content.includes('no conductance lens'));
  check('and refuses to read as a protocol verdict',
    content.includes('THIS IS NOT A PROTOCOL VERDICT') && content.includes('does not adjudicate'));
  check('it is tagged so it is findable among ordinary claims',
    (publishedEntry?.semantic_tags ?? []).includes(READING_TAG));

  // === 3. It is critiquable IN FACT, not in principle ====================
  log('\n--- 3. Critiquable through the same machinery as any other claim ---');
  let critiqued = true;
  try {
    await a2.call('create_critique', {
      target: unfiltered.entry_hash, target_type: 'Claim',
      critique_mode: 'Methodological',
      content: 'I dispute the method: an unfiltered reading counts decayed critiques.',
      author: a2.me, timestamp: Date.now() * 1000,
      replication_attempted: false, evidence_hashes: [], species: null,
    });
  } catch (e) { critiqued = false; log(`    (${String(e.message || e).slice(0, 160)})`); }
  check('ANOTHER AGENT CAN CRITIQUE THE READING, by its action hash, as a Methodological critique',
    critiqued);

  // === 4. THE DECISION, made empirical ===================================
  log('\n--- 4. Two agents, one membrane, contradictory readings, both standing ---');
  // BOTH READINGS ARE TAKEN BACK TO BACK, and the first version of this check
  // did not do that — which made it pass and fail for the wrong reasons.
  //
  // Agent 1's reading was taken in §1 and agent 2's here, with §3's critique
  // added in between. So the figures differed by WHEN they were taken as well
  // as by the lens, and on one run they came out equal for different reasons:
  // agent 1 counted the one seeded critique, and agent 2's one-second half-life
  // discounted that same critique while still counting its own, authored
  // moments earlier and therefore barely decayed. Two different stories, one
  // number, and a check that read as "they agree".
  //
  // So the comparison below uses two readings taken at the same moment, after a
  // pause long enough that every existing critique is old against a one-second
  // half-life. The only remaining difference between them is the lens, which is
  // what the claim is about.
  log('    pausing 3s so every critique is old against a 1s half-life ...');
  await sleep(3000);

  const sameMomentUnfiltered = await a1.call('publish_discourse_reading', {
    membrane, attestation_policy: null, conductance_policy: null, confidence: 'Moderate',
  });
  const lensed = await a2.call('publish_discourse_reading', {
    membrane,
    attestation_policy: null,
    conductance_policy: { min_effective_conductance: 0.9, half_life_secs: 1 },
    confidence: 'Tentative',
  });
  check('agent 2 publishes its own reading of the SAME membrane',
    lensed?.action_hash !== undefined);

  const figA = sameMomentUnfiltered.health.total_critiques;
  const figB = lensed.health.total_critiques;
  log(`    agent1 counted ${figA} critique(s); agent2 counted ${figB}`);
  check('THE TWO READINGS DISAGREE — and that is the decision, not a defect',
    figA !== figB);
  check('and the disagreement is the lens discounting, not agent2 seeing less',
    figB < figA);
  check('both readings are still in the record: nothing retracted, nothing adjudicated',
    taggedReadings(await a1.call('get_claims_by_domain', DOMAIN)).length >= 3);

  // === 5. THE CONTROL: the method is why they differ =====================
  log('\n--- 5. CONTROL: the lens is what moved the figure ---');
  check('the two readings state DIFFERENT methods',
    sameMomentUnfiltered.method !== lensed.method);
  check("and agent2's names the half-life it promised, so the disagreement is attributable",
    lensed.method.includes('1s as promised by this reader'));
  check('agent1\'s names no conductance lens at all',
    sameMomentUnfiltered.method.includes('no conductance lens'));

  // === 6. Attribution ====================================================
  log('\n--- 6. Each reading is attributed to the agent who took it ---');
  const all = taggedReadings(await a1.call('get_claims_by_domain', DOMAIN));
  log(`    ${all.length} reading(s) in the record`);
  // The ACTION's author, not the entry's: `validate_claim` binds them to each
  // other, and the action is the signed half — so this is the attribution that
  // cannot be forged. It sits at `content.header.author`, not `content.author`:
  // an Action serialises as `{ header: { author, timestamp, action_seq,
  // prev_action }, data: { type, entry_type, entry_hash } }`, which is why the
  // first version of this check read `undefined` and threw rather than failing.
  const authorBytes = (r) => {
    const a = r?.signed_action?.hashed?.content?.header?.author;
    return a ? b64(Uint8Array.from(a.data ?? a)) : null;
  };
  check('every reading is attributed to an agent rather than to the membrane',
    all.every((r) => authorBytes(r) !== null));
  const authorsOf = new Set(all.map(authorBytes));
  check('readings carry TWO DISTINCT authors, so neither speaks for the membrane',
    authorsOf.size === 2);

  log('');
  if (failures === 0) {
    log('ALL CHECKS PASSED — a reading is an attributed, critiquable promise;');
    log('two of them contradict each other on the same membrane; both stand;');
    log('and each says through which lens it was taken.');
  } else {
    log(`${failures} CHECK(S) FAILED.`);
  }
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error('\nHARNESS ERROR:', e); process.exit(1); });
