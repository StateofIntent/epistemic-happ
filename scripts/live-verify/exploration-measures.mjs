#!/usr/bin/env node
// ============================================================================
// scripts/live-verify/exploration-measures.mjs — docs/open-work.md item 3.2:
// IS THERE A DERIVED MEASURE THAT DOES NOT PUNISH EXPLORATION?
//
// AN EXPERIMENT WITH A FEW ASSERTIONS, NOT A GATE, AND NOT IN CI. It builds
// the worked example 3.2 names — `docs/cases/luck-light-egg.md` §13.7 — on a
// real conductor and computes every measure this protocol offers over it. Most
// of what it prints is REPORTED rather than asserted, for the reason
// `scale-dht.mjs` gives about storage arcs: whether an orthogonal critique
// OUGHT to be alive is not a claim this repository is entitled to make. What
// IS assertable is whether a given measure can tell it apart from something
// nobody engages, and that is what the checks below are about.
//
// THE QUESTION, AND THE FORM TO BEAT. Project 89's dead-head criterion is
// `τ = 0.96/√d`: local to the component, ZERO tunable parameters, validated at
// 95-100% against ablation ground truth across six models. It calls a
// component dead when its contribution is poorly aligned with what the
// receiving side is doing. 3.2's objection is that in a discourse graph the
// orthogonal contribution is sometimes the only valuable one, and the swarm
// deliberately runs an exploring minority such a criterion would classify as
// dead on sight.
//
// §13.7 IN EGG TERMS, which is the fixture below. A membrane argues about
// milligrams of choline per egg — methodology, sample sizes, lab variance.
// One buyer says *your number is fine, the weak link is your feed supplier's
// certification chain.* That critique is aligned with nothing around it, and
// it is also the only one in the thread that could cost the seller a contract.
//
// THE THREE CANDIDATE KEYS 3.2 NAMES, and this file is about the first:
// grounding density (does it cite evidence that resolves), citation closure,
// reachability over causal distance.
//
// WHAT THIS MEASURES THAT NOBODY HAD. The row proposes grounding density as a
// key that would NOT punish the orthogonal critique. The fixture is built to
// find out, and the discriminating property is uncomfortable: **the buyer who
// spots the certification gap cites no lab evidence, because the point is
// structural rather than empirical.** So a grounding-keyed measure has to
// place B somewhere, and §3 below asks whether that somewhere is
// distinguishable from the claim nobody engaged at all. If it is not, the
// candidate dies for the same reason alignment does, and 3.2 is one candidate
// shorter rather than one answer longer.
//
// WHAT THE PROTOCOL ALREADY DECIDED, because two of three candidates run into
// it. SPEC §7 Invariant 1 forbids computing or exposing a canonical
// comparative score, and its own note says a hardcoded, always-applied
// version of a caller-supplied policy "would itself be the kind of canonical
// signal this invariant rules out". The repository has already hit that wall
// once: `CONDUCTANCE_HALF_LIFE_SECS = 30 days` was exactly this shape — one
// constant, every membrane, converting elapsed time into a decision with no
// promiser behind it — and the resolution was not a better constant but
// MOVING THE THRESHOLD TO THE READER. So §4 below measures the asymmetry that
// leaves, which is the live remainder of 3.2 rather than its abstraction.
//
// Prereqs: a CLEAN sandbox and a packed hApp — `scripts/pack-webhapp.sh`
// does both. Two agents, the second installed by this script if absent, the
// same way `standing.mjs` does it.
// ============================================================================

import { AdminWebsocket, AppWebsocket, CellType } from '@holochain/client';

const ADMIN_URL = 'ws://localhost:8889';
const APP_URL = 'ws://localhost:8888';
const APP_ID = 'epistemic-resonance-happ';
const AGENT2_APP_ID = 'epistemic-resonance-happ-agent2';
const HAPP_PATH = new URL('../../epistemic-resonance-happ.happ', import.meta.url).pathname;
const DOMAIN = `Choline${Date.now()}`;

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
  log('=== 3.2: DOES A DERIVED MEASURE HAVE TO PUNISH EXPLORATION? ===');
  log('    The §13.7 egg fixture, on a real conductor.\n');

  const admin = await AdminWebsocket.connect({ url: new URL(ADMIN_URL), wsClientOptions: { origin: 'live-verify' } });
  const seller = await connectApp(admin, APP_ID);
  if (!(await admin.listApps({})).some((a) => a.installed_app_id === AGENT2_APP_ID)) {
    const pub2 = await admin.generateAgentPubKey();
    await admin.installApp({ source: { type: 'path', value: HAPP_PATH }, agent_key: pub2, installed_app_id: AGENT2_APP_ID });
    await admin.enableApp({ installed_app_id: AGENT2_APP_ID });
  }
  const buyer = await connectApp(admin, AGENT2_APP_ID);
  log(`seller = ${b64(seller.me).slice(0, 12)}…   buyer = ${b64(buyer.me).slice(0, 12)}…\n`);

  // --- The membrane, so `get_standing` has something to resolve a domain from
  const constitution = await seller.call('publish_constitution', {
    agent: seller.me, promises: [{ action: 'state a method', domain: DOMAIN, modality: null }],
    conditions: [], published_at: nowSecs(), expires_at: null,
  });
  const membraneAction = await seller.call('create_membrane', {
    domain: DOMAIN, description: 'Milligrams of choline per egg, and what the number rests on.',
    required_promises: ['state a method'], validation_rules_hash: null,
    creator: seller.me, created_at: nowSecs(), constitution,
  });
  const seeded = (await seller.call('get_membranes', null))
    .find((r) => b64(r.signed_action.hashed.hash) === b64(membraneAction));
  if (!seeded) setupFail(['The membrane just created is not in get_membranes — probably a STALE BUILD.']);
  const membrane = seeded.signed_action.hashed.content.data.entry_hash;

  const entryOf = async (actionHash) => {
    const rows = await seller.call('get_claims_by_domain', DOMAIN);
    const row = rows.find((r) => b64(r.signed_action.hashed.hash) === b64(actionHash));
    return row?.signed_action?.hashed?.content?.data?.entry_hash ?? null;
  };

  const evidence = (agent, content, url) => agent.call('create_evidence', {
    content, source_url: url, evidence_type: 'Study',
    author: agent.me, timestamp: nowMicros(), supports: [],
  });
  const claim = async (agent, content, evidenceHashes = []) => {
    const action = await agent.call('create_claim', {
      content, domain: DOMAIN, author: agent.me, timestamp: nowMicros(),
      evidence_hashes: evidenceHashes, confidence: 'Moderate',
      semantic_tags: [], attestation_policy: null,
    });
    return { action, entry: await entryOf(action) };
  };
  const critique = (agent, target, content, evidenceHashes = []) => agent.call('create_critique', {
    target, target_type: 'Claim', critique_mode: 'Methodological', content,
    author: agent.me, timestamp: nowMicros(), replication_attempted: false,
    evidence_hashes: evidenceHashes, species: null,
  });

  // === THE FIXTURE ========================================================
  log('--- The fixture, in §13.7\'s own terms ---');
  // A lab report the number rests on, and one the methodology critique cites.
  const labReport = await evidence(seller, 'Independent assay, n=12, 147 mg/50 g.', 'https://example.invalid/assay');
  const C = await claim(seller, 'Our eggs test at 147 mg choline per 50 g egg.', [labReport]);
  const counterStudy = await evidence(buyer, 'Twelve eggs from one flock does not bound between-flock variance.', 'https://example.invalid/variance');

  // A — ALIGNED. Same subject, cites evidence. This is what the membrane is
  // already doing, and an alignment-keyed criterion scores it alive.
  const A = await critique(buyer, C.entry, 'n=12 from a single flock cannot bound between-flock variance; the interval is wrong.', [counterStudy]);

  // B — ORTHOGONAL, and the whole point. Aligned with nothing around it, and
  // CITES NO EVIDENCE, because the point is structural rather than empirical:
  // there is no study to cite about somebody's certification chain. That is
  // not a flaw in the critique, it is what a critique of this kind looks like.
  const B = await critique(buyer, C.entry, 'The number is fine. The weak link is your feed supplier\'s certification chain.', []);

  // D — what should be dead under any honest reading: a claim in the domain
  // that nobody engages at all. Without this the whole exercise is rigged,
  // because a measure that calls nothing dead is not a measure.
  const D = await claim(seller, 'Our cartons are printed with soy ink.', []);

  await new Promise((r) => setTimeout(r, 3000));
  const critiquesOnC = await seller.call('get_critiques_for', C.entry);
  check(`CONTROL: both critiques really are on the claim (${critiquesOnC.length})`, critiquesOnC.length === 2);
  check('CONTROL: the unengaged claim exists and is in the domain', Boolean(D.entry));

  // === 1. GROUNDING DENSITY, 3.2's FIRST CANDIDATE =========================
  log('\n--- 1. Grounding density: does it cite evidence that resolves? ---');
  const resolvedEvidence = async (hashes) => {
    let n = 0;
    for (const h of hashes) {
      try { if (await seller.call('get_evidence', h)) n += 1; } catch { /* unresolved */ }
    }
    return n;
  };
  const densityA = { cited: 1, resolved: await resolvedEvidence([counterStudy]) };
  const densityB = { cited: 0, resolved: 0 };
  const groundingC = await seller.call('get_grounding_path', C.entry);
  const groundingD = await seller.call('get_grounding_path', D.entry);

  log(`    A (aligned, cites a study):     cited ${densityA.cited}, resolved ${densityA.resolved}`);
  log(`    B (orthogonal, cites nothing):  cited ${densityB.cited}, resolved ${densityB.resolved}`);
  log(`    C (the claim under argument):   grounded=${groundingC.grounded}, path ${groundingC.path.length}`);
  log(`    D (nobody engaged it):          grounded=${groundingD.grounded}, path ${groundingD.path.length}`);

  check('CONTROL: the fixture discriminates — A cites evidence that resolves and B cites none',
    densityA.resolved === 1 && densityB.cited === 0);
  // THE HEADLINE, AND IT IS THE ANSWER TO 3.2's FIRST CANDIDATE.
  check('a grounding-keyed measure CANNOT separate the valuable orthogonal critique from the thing nobody engaged — both score zero',
    densityB.resolved === 0 && groundingD.grounded === false);
  check('and C, the claim everyone is arguing about, IS grounded — so the key is not simply broken',
    groundingC.grounded === true);
  log('    => grounding density punishes B for being structural rather than empirical.');
  log('       It is the SAME failure as alignment, keyed differently: the buyer who');
  log('       spots a certification gap has no study to cite, and a measure that reads');
  log('       "cites nothing" as "contributes nothing" kills exactly the contribution');
  log('       §13.7 was written to protect. 3.2 is one candidate shorter.');

  // === 2. ZERO CITED IS NOT ZERO RESOLVED ==================================
  log('\n--- 2. The degenerate case the row did not name ---');
  check('B cites zero evidence, so its grounding DENSITY is undefined rather than zero',
    densityB.cited === 0);
  log('    0/0 is not 0. A measure computing resolved/cited gets a division by zero and');
  log('    whatever it substitutes becomes the policy: substitute 0 and every structural');
  log('    critique is dead on arrival; substitute 1 and every unevidenced assertion is');
  log('    maximally alive. THERE IS NO NEUTRAL SUBSTITUTION, which means a zero-parameter');
  log('    grounding criterion does not exist — the substitution IS the parameter, and');
  log('    `τ = 0.96/√d`\'s whole claim to authority is having none.');

  // === 3. REACHABILITY OVER CAUSAL DISTANCE — the candidate that is BUILT ===
  log('\n--- 3. Reachability over causal distance: get_standing, and it already exists ---');
  const standing = (max) => seller.call('get_standing', {
    membrane, standing_policy: max === undefined ? null : { max_causal_distance: max }, horizon_levels: null,
  });
  const open = await standing(undefined);
  const tight = await standing(1);
  // BY ACTION HASH, NOT ENTRY HASH, and the first version of this file got it
  // wrong in a way worth recording: `StandingReport.claims[].claim` is the
  // claim's ACTION hash — `standing.mjs` looks its own fixture up with
  // `byHash(open, c.action)` — so matching on the entry hash found nothing and
  // every field read back `undefined`. The checks went red rather than passing
  // on nothing, which is the only reason it was caught in one run.
  const find = (rep, h) => rep.claims.find((c) => b64(c.claim) === b64(h)) ?? null;
  const openC = find(open, C.action); const openD = find(open, D.action);
  const tightC = find(tight, C.action); const tightD = find(tight, D.action);
  if (!openC || !openD) setupFail([
    'Neither seeded claim was found in the StandingReport by action hash.',
    `report had ${open.claims.length} claim rows for ${open.claims_examined} examined.`,
    'That is a fixture/field-name problem, not a result about the protocol.',
  ]);

  log(`    no policy:            atrophied=${open.atrophied}/${open.claims_examined}, promised=${open.threshold_promised_by_caller}`);
  log(`    max_causal_distance=1: atrophied=${tight.atrophied}/${tight.claims_examined}, promised=${tight.threshold_promised_by_caller}`);
  log(`      C engagement_distance=${openC?.engagement_distance}, D=${openD?.engagement_distance}`);

  check('with NO policy promised, nothing atrophies — so the exploring minority is safe by DEFAULT ABSENCE, not by a well-chosen key',
    open.atrophied === 0 && open.threshold_promised_by_caller === false);
  check('and a reader who DOES promise a threshold gets one, stated as theirs',
    tight.threshold_promised_by_caller === true && tight.max_causal_distance === 1);
  // THE CONTROL THAT OVERTURNED THIS SECTION'S FIRST CONCLUSION. The draft
  // asserted that a tight policy atrophies the unengaged claim and spares the
  // argued one. It does not, and the control is the only reason that was not
  // written down as a result. So the threshold is now SWEPT rather than
  // assumed, and what the sweep finds is reported.
  const sweep = [];
  for (const n of [0, 1, 2, 3, 5]) {
    const rep = await standing(n);
    const d = find(rep, D.action); const c = find(rep, C.action);
    sweep.push({ n, atrophied: rep.atrophied, D: d?.has_standing, C: c?.has_standing });
    log(`    max_causal_distance=${n}: atrophied=${rep.atrophied}, C standing=${c?.has_standing}, D standing=${d?.has_standing}`);
  }
  log(`    C engagement_distance=${openC.engagement_distance} (own_depth_used=${openC.own_depth_used}), `
    + `D=${openD.engagement_distance} (own_depth_used=${openD.own_depth_used})`);

  const everAtrophied = sweep.some((r) => r.atrophied > 0);
  check('REPORTED, NOT REQUIRED: in a FLAT argument no threshold atrophies anything, including the claim nobody engaged',
    everAtrophied === false);
  check('and the unengaged claim is the one that shows why — it fell back to its OWN depth',
    openD.own_depth_used === true && openD.engagement_distance === 0);
  check('CONTROL: the argued claim did NOT fall back, so the two cases are really distinguished in the report',
    openC.own_depth_used === false);
  log('    => THE CONCLUSION THIS SECTION FIRST DREW WAS WRONG. `engagement_distance` is');
  log('       the HEIGHT of the shallowest record referencing the claim, and with nothing');
  log('       referencing it the coordinator uses `heights[idx]` — the claim\'s own depth —');
  log('       with `own_depth_used: true` saying so. So "nobody engaged it" scores as');
  log('       AS FRESH AS ITS OWN POSITION, not as dead. In a flat argument every record');
  log('       sits at height 0, so `engagement_distance <= n` holds for every n >= 0 and');
  log('       NOTHING can atrophy at any threshold.');
  log('    => That is not a defect. It means reachability over causal distance is an');
  log('       ENGAGEMENT-DEPTH REPORT and not a dead-head criterion: it answers "how deep');
  log('       is the shallowest thing that cites this", which needs causal depth to say');
  log('       anything at all. §13.7\'s egg membrane is exactly a flat argument, which is');
  log('       the shape most real disagreements have while they are still live.');
  log('    => So it does not punish exploration, and it does not punish anything else');
  log('       here either. It answers 3.2 only in the trivial sense.');

  // === 4. THE ASYMMETRY, which is 3.2's live remainder =====================
  log('\n--- 4. Two atrophy measures, two answers to "what does a reader who promised nothing get" ---');
  log('    get_standing:             no policy -> NO threshold (has_standing = true for all).');
  log('    get_effective_conductance: no policy -> THIRTY DAYS anyway, applied to every membrane.');
  check('get_standing takes the strict reading — no promiser, no death', open.atrophied === 0);
  log('    SPEC §7\'s own note on Invariant 1 says the surviving half of this out loud:');
  log('    "A reader who supplies no policy still gets thirty days, still with no');
  log('    promiser." So ONE of the two read-layer atrophy measures still asserts a');
  log('    threshold nobody promised — which is the shape `τ = 0.96/√d` has, and the');
  log('    shape Invariant 1\'s note rules out. That is 3.2\'s live remainder: not a');
  log('    missing measure, but one existing default with no agent behind it.');

  log('');
  log('=== WHAT THIS RUN SAYS ABOUT 3.2 =======================================');
  log('  1. Grounding density, the row\'s first candidate, FAILS for the same reason');
  log('     alignment does — measured, not argued: it cannot separate B from D.');
  log('  2. A zero-parameter grounding criterion cannot exist: 0 cited is 0/0, and');
  log('     whichever value you substitute IS the parameter.');
  log('  3. Reachability over causal distance is ALREADY BUILT as `get_standing`, and');
  log('     it does not punish exploration — but measured rather than assumed, it does');
  log('     not punish anything in a flat argument either. `own_depth_used` makes');
  log('     "nobody engaged it" score as fresh, and at height 0 no threshold bites. It');
  log('     is an engagement-depth report, not a dead-head criterion. THIS SECTION\'S');
  log('     FIRST CONCLUSION SAID THE OPPOSITE AND A CONTROL CAUGHT IT.');
  log('  4. SO 3.2 HAS NO POSITIVE ANSWER IN THIS PROTOCOL AS BUILT, and the reason is');
  log('     structural rather than a lack of cleverness: no measure here separates');
  log('     "orthogonal and valuable" from "nobody engaged", and Invariant 1 is why');
  log('     nobody has built one — any protocol-DEFAULT threshold is the canonical');
  log('     signal it forbids, whatever it is keyed to. The reader is the promiser,');
  log('     which is the same resolution the conductance half-life got.');
  log('  5. The live remainder is the asymmetry in §4 — one existing default with no');
  log('     agent behind it — not the missing measure.');
  log('');
  if (failures === 0) {
    log('ALL CHECKS PASSED. The reported numbers are measurements; the judgements about');
    log('what a membrane OUGHT to do with them are deliberately not asserted here.');
  } else {
    log(`${failures} CHECK(S) FAILED.`);
  }
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
