#!/usr/bin/env node
// ============================================================================
// scripts/live-verify/secretion.mjs — STAGE 4. CAN UPTAKE OF A STANDARD BE
// TOLD FROM A PRIVATE VOCABULARY, WITHOUT CONSULTING A CLOCK?
//
// READINESS item 11 has been blocked its whole life on one thing: telling
// exploration from degradation. A divergent observer is indistinguishable from
// a bug, so running a deliberate minority was never safe to interpret.
//
// THE DISCRIMINATOR IS NOT A PROPERTY OF THE DIVERGENT ACT — the text, the
// mode, the evidence list and the thresholds look identical either way. It is
// a property of the act's RECEPTION. `get_species_adoption` got the first half
// of that by splitting citations into the proposer's own and everybody else's.
//
// THE HALF IT MISSES, and what this harness is for: three independent citers
// look the same whether they took the species up BECAUSE they had seen it
// working, or arrived at the same vocabulary never having met it. The first is
// uptake; the second is coincidence; reading the second as the first is how a
// private vocabulary gets mistaken for a discovery.
//
// `docs/open-work.md` item 2.4 asks for "`get_species_adoption` read a second
// time at a causal distance from the first". THE OBVIOUS READING OF THAT IS
// WRONG and §5 of this file is where that is recorded: polling the same read
// twice and diffing it separates the two observations BY WALL CLOCK, and
// §5.22 says validation cannot reach a clock while READINESS item 14 MEASURED
// a `reveal_deadline` being backdated by moving a conductor's. A proposer who
// wants uptake to look like growth controls the write times a diff would be
// computed from. So the causal distance is taken from `Critique.past_cone` —
// retained evidence, which cannot be re-chosen afterwards.
//
// THE THREE CLASSES ARE CONSTRUCTED DELIBERATELY, which is what makes every
// check here able to go red. The harness supplies each critique's cone
// itself, so all three arise by construction rather than by timing:
//
//   C1  agent 1 cites S, cone EMPTY          -> proposer's own, cone-silent
//   C2  agent 2 cites S, cone [C1]           -> DOWNSTREAM: had seen it used
//   C3  agent 1 critiques T2, species NULL   -> not a citation of S at all
//   C4  agent 3 cites S, cone [C3]           -> PARALLEL: a cone, but no S in it
//   C5  agent 2 cites S on T3, cone EMPTY    -> a prior citation for C6 to see
//   C6  agent 1 cites S on T3, cone [C5]     -> THE PROPOSER, at depth 1
//   C7  agent 2 cites S on T2, cone [C3]     -> a2 parallel here, downstream there
//
// Three agents and not two, because an agent that is downstream on one target
// and parallel on another must be reported as downstream — so a two-agent
// setup cannot exhibit the parallel class at all without hiding it.
//
// C6 AND C7 EXIST BECAUSE TWO INJECTIONS PASSED WITHOUT THEM, which is the
// finding this fixture records. The first version stopped at C4, and against
// it: making the proposer's own citations count as adoption changed NOTHING
// (the only proposer citation had an empty cone, so its depth was 0 either
// way), and removing the downstream/parallel de-duplication changed NOTHING
// (no agent was in both lists). Two checks that could not go red, in a file
// whose whole subject is telling a real signal from an artefact.
//
// So C6 gives the PROPOSER a cone containing a prior citation — the only
// shape in which "is the proposer excluded from the adopter list?" is a
// question with two possible answers — and C7 makes agent 2 a parallel citer
// on one target while it is downstream on another, which is the only shape in
// which de-duplication is observable.
//
// WHAT A GREEN RUN DOES NOT MEAN. It does not mean a divergent observer can be
// cleared IN ADVANCE. Adoption is visible only after other agents have had the
// chance to adopt, so a minority deployed today is unclassifiable today. Item
// 11 wanted a measurement that made running them SAFE; this makes them
// OBSERVABLE, and those are different promises.
//
// Prereqs: a sandbox conductor (scripts/sandbox.sh clean && start) and a built
// .happ. Three agents.
// ============================================================================

import { AdminWebsocket, AppWebsocket, CellType } from '@holochain/client';

const ADMIN_URL = 'ws://localhost:8889';
const APP_URL = 'ws://localhost:8888';
const APP_IDS = [
  'epistemic-resonance-happ',
  'epistemic-resonance-happ-agent2',
  'epistemic-resonance-happ-agent3',
];
const HAPP_PATH = new URL('../../epistemic-resonance-happ.happ', import.meta.url).pathname;
const DOMAIN = `Secretion${Date.now()}`;

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
  log('=== STAGE 4: SECRETION — UPTAKE AT A CAUSAL DISTANCE ===\n');
  const admin = await AdminWebsocket.connect({ url: new URL(ADMIN_URL), wsClientOptions: { origin: 'live-verify' } });
  const installed = (await admin.listApps({})).map((a) => a.installed_app_id);
  for (const appId of APP_IDS.slice(1)) {
    if (!installed.includes(appId)) {
      const key = await admin.generateAgentPubKey();
      await admin.installApp({ source: { type: 'path', value: HAPP_PATH }, agent_key: key, installed_app_id: appId });
      await admin.enableApp({ installed_app_id: appId });
    }
  }
  const [a1, a2, a3] = await Promise.all(APP_IDS.map((id) => connectApp(admin, id)));
  log(`proposer  = ${b64(a1.me).slice(0, 12)}…`);
  log(`downstream= ${b64(a2.me).slice(0, 12)}…`);
  log(`parallel  = ${b64(a3.me).slice(0, 12)}…\n`);

  // --- Seed: a species, and two targets to critique ----------------------
  const SPECIES_NAME = `unevidenced-claim-${Date.now()}`;
  await a1.call('create_critique_species', {
    name: SPECIES_NAME, parent_species: null,
    required_evidence: ['at least one evidence_hash resolving to Evidence'],
    proposer: a1.me, created_at: nowSecs(),
  });
  const speciesHash = await (async () => {
    for (const record of await a1.call('get_all_critique_species', null)) {
      const eh = record?.signed_action?.hashed?.content?.data?.entry_hash;
      if (!eh) continue;
      const decoded = await a1.call('get_critique_species', eh);
      if (decoded?.name === SPECIES_NAME) return eh;
    }
    return null;
  })();
  if (!speciesHash) setupFail(['The species just created is not readable back from get_all_critique_species.']);

  const claimEntry = async (agent, actionHash) => {
    const rows = await agent.call('get_claims_by_domain', DOMAIN);
    const key = b64(actionHash);
    const row = rows.find((r) => b64(r.signed_action.hashed.hash) === key);
    return row?.signed_action?.hashed?.content?.data?.entry_hash ?? null;
  };
  const mkClaim = async (content) => {
    const action = await a1.call('create_claim', {
      content, domain: DOMAIN, author: a1.me, timestamp: nowMicros(),
      evidence_hashes: [], confidence: 'High', semantic_tags: [], source_mew: null,
    });
    const entry = await claimEntry(a1, action);
    if (!entry) setupFail([`Could not resolve claim "${content}" to an EntryHash.`]);
    return entry;
  };
  const T1 = await mkClaim('a target for the downstream case');
  const T2 = await mkClaim('a target for the parallel case');
  const T3 = await mkClaim('a target where the PROPOSER cites at a depth');

  const critique = (agent, target, species, cone, content) => agent.call('create_critique', {
    target, target_type: 'Claim', critique_mode: 'Evidential', content,
    author: agent.me, timestamp: nowMicros(), replication_attempted: false,
    evidence_hashes: [], species, past_cone: cone,
  });

  // C1: the proposer's own citation, with no recorded cone.
  const C1 = await critique(a1, T1, speciesHash, [], 'proposer cites its own standard');
  // C2: an independent agent citing S, having RECORDED SEEING C1.
  const C2 = await critique(a2, T1, speciesHash, [C1], 'cited having seen the standard in use');
  // C3: the proposer critiquing T2 WITHOUT a species — not a citation of S.
  const C3 = await critique(a1, T2, null, [], 'a critique that cites no species at all');
  // C4: an independent agent citing S with a cone that holds C3 but no S citation.
  const C4 = await critique(a3, T2, speciesHash, [C3], 'cited with a cone that does not contain the standard');
  // C5/C6: a citation for the PROPOSER to have seen, then the proposer citing
  // its own species at depth 1. Without this pair, "the proposer is excluded"
  // is not a question — see the header on injection CB.
  const C5 = await critique(a2, T3, speciesHash, [], 'an adopter cites first on this target');
  await critique(a1, T3, speciesHash, [C5], 'the PROPOSER cites, having seen a prior citation');
  // C7: agent 2 as a parallel citer here, while it is downstream on T1. Without
  // this, de-duplication is unobservable — see the header on injection CD.
  await critique(a2, T2, speciesHash, [C3], 'a downstream agent also cites with a cone lacking the standard');

  let sec;
  try { sec = await a1.call('get_species_secretion', speciesHash); } catch (e) {
    setupFail([
      'get_species_secretion threw on its first call.',
      'If the code looks right the conductor is probably on a STALE BUILD —',
      'rebuild both zomes, hc dna pack dna/ && hc app pack ., then clean the sandbox.',
      String(e?.message ?? e).slice(0, 300),
    ]);
  }

  // === 1. THE DENOMINATOR, AND THAT IT CANNOT DISAGREE WITH THE OLD READ =
  log('--- 1. The citations, and agreement with get_species_adoption ---');
  log(`    total ${sec.total_citations}, proposer's own ${sec.proposer_citations}, unattributable ${sec.unattributable_citations}`);
  check('six critiques cite this species — C3 cites none and is correctly not counted',
    sec.total_citations === 6);
  check('two of them are the proposer\'s own (C1 and C6)', sec.proposer_citations === 2);
  check('nothing was unattributable', sec.unattributable_citations === 0);
  // THE SHADOWING CHECK (READINESS item 5e). Two reads of one species that
  // disagree about its citation count would make both useless.
  const adoption = await a1.call('get_species_adoption', speciesHash);
  check('the older read agrees about the total, so the two cannot drift apart',
    adoption.total_citations === sec.total_citations);
  check('and about how many are the proposer\'s own',
    adoption.proposer_citations === sec.proposer_citations);
  check('every citation is published individually, so the classification is checkable not merely asserted',
    Array.isArray(sec.citations) && sec.citations.length === 6);

  // === 2. DOWNSTREAM — THE ONLY POSITIVE EVIDENCE OF UPTAKE ==============
  log('\n--- 2. Who cited it HAVING ALREADY SEEN IT USED ---');
  const downstream = sec.downstream_adopters.map(b64);
  check('agent 2 is downstream: its cone contained the proposer\'s citation',
    downstream.includes(b64(a2.me)));
  // C6 IS THE POINT OF THIS CHECK: the proposer cited its own species having
  // seen C5, so it has a real depth of 1 and would be listed by any
  // implementation that forgot to exclude it. Injection CB does exactly that.
  check('and the PROPOSER is not listed as an adopter of its own species, even citing at depth 1',
    !downstream.includes(b64(a1.me)));
  check('agent 3 is NOT downstream — its cone held a critique that cites no species',
    !downstream.includes(b64(a3.me)));
  check('so exactly one downstream adopter', sec.downstream_adopters.length === 1);
  // The figure two readings can be compared on. It is 1 here because C2 saw
  // exactly one prior citation; it would be 0 if cones were ignored.
  check('the deepest INDEPENDENT cone is 1 prior citation — zero would mean cones were not read',
    sec.max_independent_causal_depth === 1);
  const c2row = sec.citations.find((c) => b64(c.critique) === b64(C2));
  check('C2\'s own row says it saw one prior citation and recorded a cone',
    c2row && c2row.prior_citations_seen === 1 && c2row.cone_recorded === true && c2row.by_proposer === false);

  // === 3. PARALLEL — CONSISTENT WITH INDEPENDENCE, NOT PROOF OF IT ======
  log('\n--- 3. Who cited it with a cone that did not contain it ---');
  const parallel = sec.parallel_adopters.map(b64);
  check('agent 3 is a parallel adopter: a recorded cone, no prior citation of this species',
    parallel.includes(b64(a3.me)));
  // C7 IS THE POINT OF THIS CHECK: agent 2 cited with a cone lacking the
  // species on T2, so it qualifies as parallel there while being downstream on
  // T1. Without de-duplication it appears in both lists and reads as two
  // different kinds of evidence at once. Injection CD does exactly that.
  check('agent 2 is NOT also listed as parallel, though C7 qualifies it — downstream is the stronger finding and wins',
    !parallel.includes(b64(a2.me)));
  check('and the proposer is not a parallel adopter of its own species either',
    !parallel.includes(b64(a1.me)));
  const c4row = sec.citations.find((c) => b64(c.critique) === b64(C4));
  check('C4 recorded a cone but saw no prior citation of the species',
    c4row && c4row.cone_recorded === true && c4row.prior_citations_seen === 0);

  // === 4. CONE SILENT — EVIDENCE OF NOTHING ==============================
  log('\n--- 4. An empty cone says nothing, and is not counted as independence ---');
  // The `UnseenReport` lesson: an author whose client omits cones is SILENT,
  // not ignorant. Counting C1 as evidence of independent arrival would
  // manufacture a finding out of a missing feature.
  check('both empty cones are counted as cone-silent (C1 and C5)', sec.cone_silent_citations === 2);
  const c1row = sec.citations.find((c) => b64(c.critique) === b64(C1));
  check('and C1 is marked as the proposer\'s, with no cone recorded',
    c1row && c1row.by_proposer === true && c1row.cone_recorded === false);
  check('a cone-silent citation appears in NEITHER adopter list',
    !downstream.includes(b64(a1.me)) && !parallel.includes(b64(a1.me)));

  // === 5. IT REPORTS, AND NAMES WHAT IT CANNOT TELL APART ================
  log('\n--- 5. No score, and the limits are stated ---');
  const forbidden = ['score', 'index', 'rank', 'verdict', 'exploration_index', 'quality'];
  const body = JSON.stringify(sec).toLowerCase();
  const found = forbidden.filter((k) => body.includes(`"${k}"`));
  check(`no score, index or verdict field anywhere in the response${found.length ? ` (found ${found.join(', ')})` : ''}`,
    found.length === 0);
  check('the note names the causal-distance finding rather than scoring it',
    typeof sec.note === 'string' && /causal distance/i.test(sec.note) && /retention/i.test(sec.note));
  check('and it reports the parallel citers WITHOUT calling them independent',
    /do not prove it|NOT proof of it/i.test(sec.note));
  check('the species it answered about is echoed back, so a reader can tell what was asked',
    b64(sec.species) === b64(speciesHash) && sec.name === SPECIES_NAME);
  check('the proposer is named, since every figure here is relative to them',
    b64(sec.proposer) === b64(a1.me));

  log('');
  if (failures === 0) {
    log('ALL CHECKS PASSED — uptake is distinguished from a private vocabulary');
    log('by what the adopter RETAINED, and no clock was consulted to do it.');
  } else {
    log(`${failures} CHECK(S) FAILED`);
  }
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error('\nHARNESS ERROR:', e); process.exit(1); });
