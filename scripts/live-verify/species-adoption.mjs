#!/usr/bin/env node
// ============================================================================
// scripts/live-verify/species-adoption.mjs — WHO ACTUALLY TOOK A SPECIES UP,
// which is READINESS item 11's missing measurement.
//
// Item 11 wants a deliberate minority of observers running looser thresholds
// and unusual `CritiqueSpecies` preferences, and has been blocked its whole
// life on one sentence: **the real blocker is telling exploration from
// degradation.** Without that, a divergent observer is indistinguishable from
// a bug, and the row says so.
//
// THE DISCRIMINATOR IS NOT IN THE DIVERGENT ACT. Exploration and degradation
// produce identical writes — same entry type, same modes, same thresholds,
// same shape of evidence list. What separates them is RECEPTION: a species
// proposed on unusual grounds is exploration if agents who did not share the
// proposer's priors take it up, and noise if nobody does. That is why the row
// could not find the measurement by looking at the write, and why it stayed
// "a measurement nobody has designed" rather than a hard build.
//
// WHAT WAS ALREADY THERE AND WHY IT COULD NOT CARRY IT.
// `get_critique_species_adoption_count` returns `links.len()` over
// CritiqueToSpecies — EVERY citation, the proposer's own included. So one
// agent who proposes a species and then cites it in fifty of their own
// critiques reports an adoption count of fifty, and nothing distinguishes
// that from fifty agents adopting it. The comment that deleted the old
// self-declared `adoption_count` field called this derived count "the real,
// query-time replacement" — and a derived number a single agent can drive
// alone is barely better than a declared one. **Section 2 below is that
// defect, asserted rather than described**: the old count and the new
// `total_citations` agree at 3 while independent adoption is 0.
//
// THE MEASUREMENT REPORTS COMPONENTS AND NO SCORE, which is the house rule
// everywhere else here — `get_discourse_health` gives a ratio and a warning,
// the MCP surface offers no ranking, the foresight tab says there is no score
// on the page. An "exploration index" would be the fabricated scalar README
// §2.5 exists to refuse, and would read as a verdict on an agent, which
// Invariant #1 is about.
//
// WHAT THIS CANNOT DO, asserted in section 1 rather than left to a comment:
// it cannot clear a divergent observer IN ADVANCE. Adoption is only visible
// after other agents have had the chance to adopt, so a minority deployed
// today is unclassifiable today. Item 11 asked for a measurement that makes
// running divergent observers SAFE; what is achievable makes them OBSERVABLE.
// Those are different promises and the second is the one on offer.
//
// ---------------------------------------------------------------------------
// NEGATIVE EVIDENCE — this harness has been watched failing.
// Results are recorded in READINESS item 11.
//
//   BD: `independent_adopters` collects every non-proposer citation instead
//   of distinct agents (`push` without the `contains` guard). This is the
//   laziest way to get the measurement wrong, and it is the one a citation
//   count already makes. 3 reds, in sections 4 and 5 — and SECTIONS 2 AND 3
//   STAY GREEN, which is exactly why section 4 exists: agent 2 cites the
//   species twice, and only a check that requires the list to STAY at one
//   entry can see the difference between an adopter and a citation.
//
//   BE: `critique.author == species.proposer` inverted, so self-citations
//   count as independent adoption and vice versa. 7 reds, across sections 2,
//   3 and 5 — the widest of the three, and section 2's is the one that
//   matters: an inverted test makes a private vocabulary read as a fully
//   adopted one, which is the precise failure this measurement exists to
//   prevent.
//
//   BF: the `warning` emitted whenever `independent_adopters` is empty, with
//   the zero-citation branch deleted so the two cases collapse into one.
//   2 reds, both in section 1. "Nothing has cited it yet" and "every citation
//   is the proposer's own" are different facts about the world and a reader
//   acting on them would do different things; a single warning for both is a
//   measurement that cannot distinguish absence from insularity.
//
// Re-check all three the same way if you change what this asserts.
// ---------------------------------------------------------------------------
// Prereqs: a sandbox conductor (scripts/sandbox.sh clean && start) and a
// built .happ — `scripts/pack-webhapp.sh`, because `hc dna pack` compiles
// nothing and this harness would otherwise verify the previous coordinator.
//
// TWO AGENTS, on one conductor, and the second one is not optional: a
// single-agent run cannot distinguish the measurement from the count it
// replaces. No browser — the surface is checked by taxonomy-ui.mjs.
// ============================================================================

import { AdminWebsocket, AppWebsocket, CellType } from '@holochain/client';

const ADMIN_URL = 'ws://localhost:8889';
const APP_URL = 'ws://localhost:8888';
const APP_ID = 'epistemic-resonance-happ';
const AGENT2_APP_ID = 'epistemic-resonance-happ-agent2';
const AGENT3_APP_ID = 'epistemic-resonance-happ-agent3';
const HAPP_PATH = new URL('../../epistemic-resonance-happ.happ', import.meta.url).pathname;
const DOMAIN = `Adoption${Date.now()}`;
const SPECIES = `UnusualDistinction${Date.now()}`;

const log = (...a) => console.log(...a);
let failures = 0;
const check = (label, cond) => {
  if (cond) log(`  PASS: ${label}`);
  else { log(`  FAIL: ${label}`); failures++; }
};
const b64 = (u8) => Buffer.from(u8).toString('base64');
const nowMicros = () => Date.now() * 1000;
const nowSecs = () => Math.floor(Date.now() / 1000);

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

async function ensureAgent(admin, appId) {
  const apps = await admin.listApps({});
  if (!apps.some((a) => a.installed_app_id === appId)) {
    const pub = await admin.generateAgentPubKey();
    await admin.installApp({ source: { type: 'path', value: HAPP_PATH }, agent_key: pub, installed_app_id: appId });
    await admin.enableApp({ installed_app_id: appId });
  }
  return connectApp(admin, appId);
}

async function main() {
  log('=== WHO TOOK THE SPECIES UP (READINESS item 11) ===\n');

  const admin = await AdminWebsocket.connect({ url: new URL(ADMIN_URL), wsClientOptions: { origin: 'live-verify' } });
  const a1 = await connectApp(admin, APP_ID);
  log(`proposer   = ${b64(a1.me).slice(0, 12)}…`);
  const a2 = await ensureAgent(admin, AGENT2_APP_ID);
  log(`adopter    = ${b64(a2.me).slice(0, 12)}…`);
  const a3 = await ensureAgent(admin, AGENT3_APP_ID);
  log(`adopter 2  = ${b64(a3.me).slice(0, 12)}…\n`);

  // --- Seed: a species the proposer invented, and a claim to critique ----
  await a1.call('create_critique_species', {
    name: SPECIES, parent_species: null,
    required_evidence: ['The distinction this draws, and what it separates'],
    proposer: a1.me, created_at: nowSecs(),
  });
  // create_critique_species returns an ActionHash and CritiqueToSpecies is
  // keyed by the ENTRY hash, so the species is read back rather than taken
  // from the create — the getter/creator distinction this codebase documents
  // throughout, and the same step taxonomy-ui.mjs and domains/bootstrap.mjs
  // both take.
  const all = await a1.call('get_all_critique_species', null);
  const mine = all.filter((r) => r.entry?.Present?.entry != null);
  if (mine.length === 0) {
    log('  SETUP FAILED: get_all_critique_species returned no readable species.');
    log('  Probably a STALE BUILD — scripts/pack-webhapp.sh, then clean the sandbox.');
    process.exit(1);
  }
  // The one just created, by name, decoded from the record's entry.
  let speciesHash = null;
  for (const r of mine) {
    const entryHash = r.signed_action.hashed.content.data.entry_hash;
    const got = await a1.call('get_critique_species', entryHash);
    if (got?.name === SPECIES) { speciesHash = entryHash; break; }
  }
  if (!speciesHash) {
    log(`  SETUP FAILED: the species ${SPECIES} just created is not readable back.`);
    log('  Probably a STALE BUILD — scripts/pack-webhapp.sh, then clean the sandbox.');
    process.exit(1);
  }

  const claimAction = await a1.call('create_claim', {
    content: 'A claim the unusual distinction can be applied to.', domain: DOMAIN,
    author: a1.me, timestamp: nowMicros(), evidence_hashes: [],
    confidence: 'Moderate', semantic_tags: [], source_mew: null,
  });
  const claim = await a1.call('get_claim', claimAction);
  if (!claim) {
    log('  SETUP FAILED: the seeded claim does not read back.');
    process.exit(1);
  }
  // Critiques link from the claim's ENTRY hash (see create_critique), so the
  // target is read the same way the species hash was.
  const claims = await a1.call('get_claims_by_domain', DOMAIN);
  const claimEntryHash = claims[0].signed_action.hashed.content.data.entry_hash;

  const critiqueBy = (agent, content) => agent.call('create_critique', {
    target: claimEntryHash,
    target_type: 'Claim',
    critique_mode: 'Methodological',
    content,
    author: agent.me,
    timestamp: nowMicros(),
    replication_attempted: false,
    evidence_hashes: [],
    species: speciesHash,
  });
  const adoption = () => a1.call('get_species_adoption', speciesHash);
  const oldCount = () => a1.call('get_critique_species_adoption_count', speciesHash);

  // === 1. The control: nothing has cited it yet =========================
  // Without this, every assertion below could be satisfied by a function
  // that reports plausible numbers for a species nobody ever touched. It is
  // also where the two DIFFERENT zero cases are separated: "no citations at
  // all" and "all citations are the proposer's own" are not the same fact.
  log('--- 1. The control: a species nothing has used ---');
  let a = await adoption();
  check('a freshly proposed species reports 0 citations',
    a.total_citations === 0);
  check('it names its proposer, so self-citation can be told from adoption at all',
    b64(a.proposer) === b64(a1.me));
  check('it carries the species name, so a reader need not resolve it again',
    a.name === SPECIES);
  check('independent adopters is empty, not absent',
    Array.isArray(a.independent_adopters) && a.independent_adopters.length === 0);
  check('THE ZERO-CITATION CASE HAS ITS OWN WARNING — not the all-self one',
    typeof a.warning === 'string' && /nothing to tell exploration and degradation apart/i.test(a.warning));
  check('and that warning does NOT claim the proposer cited it',
    !/proposer's own/i.test(a.warning ?? ''));

  // === 2. The defect the measurement exists for =========================
  log('\n--- 2. The proposer cites it three times, and nobody else does ---');
  await critiqueBy(a1, 'Applying my own distinction, once.');
  await critiqueBy(a1, 'Applying my own distinction, twice.');
  await critiqueBy(a1, 'Applying my own distinction, three times.');
  a = await adoption();
  const old = await oldCount();
  log(`    old count = ${old}   total_citations = ${a.total_citations}   independent = ${a.independent_adopters.length}`);
  check('the old count and total_citations agree, so the two reads cannot drift',
    old === a.total_citations && old === 3);
  check('all three are attributed to the proposer',
    a.proposer_citations === 3);
  check('INDEPENDENT ADOPTION IS 0 WHILE THE OLD COUNT READS 3 — the whole point',
    a.independent_adopters.length === 0);
  check('the warning names the all-self case and quotes the misleading number',
    typeof a.warning === 'string' && /proposer's own/i.test(a.warning) && a.warning.includes('3'));
  check('nothing was unattributable on the honest path',
    a.unattributable_citations === 0);

  // === 3. A second agent takes it up ====================================
  log('\n--- 3. An agent who did not propose it cites it ---');
  await critiqueBy(a2, 'Borrowing this distinction; it separates something real.');
  a = await adoption();
  log(`    total_citations = ${a.total_citations}   independent = ${a.independent_adopters.length}`);
  check('total citations rose to 4',
    a.total_citations === 4);
  check('the proposer count did NOT rise with it',
    a.proposer_citations === 3);
  check('EXACTLY ONE INDEPENDENT ADOPTER, and it is agent 2',
    a.independent_adopters.length === 1 && b64(a.independent_adopters[0]) === b64(a2.me));
  check('the warning clears once somebody else has used it',
    a.warning === null || a.warning === undefined);

  // === 4. Distinct agents, not citations ================================
  // The check that catches the laziest wrong implementation: a list that
  // grows per citation rather than per agent. Section 3 cannot see it.
  log('--- 4. The same agent cites it again ---');
  await critiqueBy(a2, 'Using it a second time, which is not a second adopter.');
  a = await adoption();
  log(`    total_citations = ${a.total_citations}   independent = ${a.independent_adopters.length}`);
  check('total citations rose to 5',
    a.total_citations === 5);
  check('INDEPENDENT ADOPTERS STAYED AT 1 — distinct agents, not citations',
    a.independent_adopters.length === 1);

  log('\n--- 5. A third agent, so the adopter list is plural ---');
  await critiqueBy(a3, 'A third reader finds the distinction useful too.');
  a = await adoption();
  const adopters = a.independent_adopters.map(b64).sort();
  check('two distinct independent adopters',
    a.independent_adopters.length === 2);
  check('and they are agents 2 and 3, with the proposer excluded',
    adopters.join() === [b64(a2.me), b64(a3.me)].sort().join()
    && !adopters.includes(b64(a1.me)));
  check('the proposer count is still 3, untouched by anyone else adopting',
    a.proposer_citations === 3);
  check('total citations is 6, which is proposer 3 + independents 3',
    a.total_citations === 6);

  // === 6. What the measurement refuses to say ===========================
  // Asserted rather than left to the header: the row wanted something that
  // would make divergence safe in advance, and this is not that.
  log('\n--- 6. What it does not claim ---');
  check('there is NO score, index or ranking field anywhere in the return',
    !Object.keys(a).some((k) => /score|index|rank|rating|health/i.test(k)));
  check('the fields are counts and identities only, so a reader does the judging',
    typeof a.total_citations === 'number' && typeof a.proposer_citations === 'number'
    && Array.isArray(a.independent_adopters));

  log('');
  if (failures === 0) log('ALL CHECKS PASSED');
  else log(`${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
