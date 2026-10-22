#!/usr/bin/env node
// ============================================================================
// scripts/swarm/run-swarm.mjs — A POPULATION OF OBSERVERS, ON A DHT THAT
// EXISTS ONLY FOR THIS RUN.
//
// READINESS item 11, whose remaining work was never a build: "Run a deliberate
// minority of observers with looser thresholds and unusual CritiqueSpecies
// preferences — the swarm result applied to this graph." The measurement that
// reads the result shipped earlier (`get_species_adoption`); this is the thing
// being measured.
//
// ---------------------------------------------------------------------------
// FOUR CONSTRAINTS, AND EACH IS A PROTOCOL FACT RATHER THAN A PREFERENCE.
//
// 1. SCRATCH DHT, ENFORCED. Invariant 6 means nothing a swarm writes can ever
//    be deleted, by anybody. Item 11's own finding is that exploration cannot
//    be told from degradation at the time of writing — adoption is visible
//    only later — so the output is judged after it is already permanent. This
//    driver therefore refuses to run against any conductor whose DNA hash is
//    not the one `scripts/swarm.sh` recorded when it minted the seed. Not a
//    flag; a check.
//
// 2. EVERY AGENT DECLARES BEFORE IT ACTS. Each publishes a `Constitution`
//    carrying its disposition's threshold as a promise, and publishes it
//    FIRST. Thresholds are promises (Burgess), so the standard an agent judges
//    by is on the record and is itself critiquable — and an agent whose
//    behaviour diverges from its declaration is visible by comparison rather
//    than by assertion.
//
// 3. EVERY CRITIQUE RECORDS ITS PAST CONE. `protocol_version: 10` added the
//    field; this is the first thing that populates it for real. A swarm is
//    exactly where it matters: agents act concurrently on the same targets,
//    so "had this agent seen that objection when it wrote?" is a live question
//    rather than a hypothetical, and the answer cannot be reconstructed later.
//
// 4. AGENTS WRITE ONLY TO THEIR OWN CHAINS. Nothing here asks another agent to
//    do anything. That is Promise Theory's autonomy and also simply how
//    Holochain works, but it is worth stating: there is no coordinator agent,
//    no leader, and no agent that can make another act.
//
// ---------------------------------------------------------------------------
// WHAT THIS DOES NOT CLAIM. The graph becomes ACTIVE, not autopoietic. The DNA
// still does nothing on its own clock — READINESS item 22 decided that
// deliberately, and a swarm of external agents is not the same thing as a
// system that maintains its own organisation. Calling this autopoiesis would
// be the mechanism-that-reads-as-enforcement failure in a new costume.
//
// Usage:
//   scripts/swarm.sh start 5
//   node scripts/swarm/run-swarm.mjs [rounds]
//   scripts/swarm.sh clean        # destroys everything it wrote
// ============================================================================

import { AdminWebsocket, AppWebsocket, CellType } from '@holochain/client';
import { readFileSync, existsSync } from 'node:fs';
import { DISPOSITIONS, assess, assignDispositions } from './dispositions.mjs';

const ROOT = process.env.EPI_SWARM_ROOT ?? '/tmp/epi-swarm';
const STATE_PATH = `${ROOT}/swarm.json`;
const ROUNDS = Number(process.argv[2] ?? 3);
const DOMAIN = `Swarm${Date.now()}`;

// §6 caps Critiques at 20 per agent per rolling hour, and every critique also
// creates a SynapticLink against its own ceiling of 20. An agent stops well
// short rather than discovering the limit as an error: a population that
// saturates its own friction budget is measuring the ration, not the graph.
const MAX_CRITIQUES_PER_AGENT = 12;

const log = (...a) => console.log(...a);
const b64 = (u8) => Buffer.from(u8).toString('base64');
const nowMicros = () => Date.now() * 1000;
const nowSecs = () => Math.floor(Date.now() / 1000);

if (!existsSync(STATE_PATH)) {
  log('REFUSED: no scratch DHT recorded.');
  log(`  ${STATE_PATH} does not exist, so there is no network this swarm is`);
  log('  allowed to write to. A swarm writes permanently and un-deletably');
  log('  (Invariant 6), so it runs on a DHT minted for the run and nothing else.');
  log('');
  log('  scripts/swarm.sh start 5');
  process.exit(1);
}
const state = JSON.parse(readFileSync(STATE_PATH, 'utf8'));

async function connect(appId) {
  const admin = await AdminWebsocket.connect({
    url: new URL(`ws://localhost:${state.adminPort}`), wsClientOptions: { origin: 'swarm' },
  });
  const apps = await admin.listApps({});
  if (!apps.some((a) => a.installed_app_id === appId)) {
    const key = await admin.generateAgentPubKey();
    // THE SEED MUST BE PASSED HERE OR THE AGENT JOINS A DIFFERENT NETWORK,
    // and the scratch-DHT check below caught exactly that. `swarm.sh` creates
    // agent 0 with `hc sandbox generate -s <seed>`; an `installApp` from the
    // same .happ WITHOUT the seed produces the DEFAULT DNA hash, so agents
    // 1..n silently formed their own network and the population would have
    // been several one-agent swarms that could not see each other.
    //
    // It failed loudly instead of running, which is the guard being worth
    // having on its first use rather than its hundredth.
    await admin.installApp({
      source: { type: 'path', value: process.env.EPI_HAPP_PATH
        ?? new URL('../../epistemic-resonance-happ.happ', import.meta.url).pathname },
      agent_key: key, installed_app_id: appId, network_seed: state.seed,
    });
    await admin.enableApp({ installed_app_id: appId });
  }
  const { token } = await admin.issueAppAuthenticationToken({ installed_app_id: appId });
  const app = await AppWebsocket.connect({
    url: new URL(`ws://localhost:${state.appPort}`), token, wsClientOptions: { origin: 'swarm' },
  });
  const info = await app.appInfo();
  const cellIds = [];
  for (const roleCells of Object.values(info.cell_info)) {
    for (const cell of roleCells) {
      if (cell?.type === CellType.Provisioned || cell?.type === CellType.Cloned) cellIds.push(cell.value.cell_id);
    }
  }
  for (const cellId of cellIds) await admin.authorizeSigningCredentials(cellId);
  return {
    appId, dna: cellIds[0][0], me: cellIds[0][1],
    call: (fn, payload) =>
      app.callZome({ role_name: 'epistemic', zome_name: 'epistemic_coordinator', fn_name: fn, payload }),
  };
}

async function main() {
  log('=== A SWARM, ON A DHT MINTED FOR THIS RUN ===\n');
  log(`seed: ${state.seed}`);
  log(`agents: ${state.agents}   rounds: ${ROUNDS}\n`);

  const dispositions = assignDispositions(state.agents);
  const agents = [];
  for (let i = 0; i < state.agents; i++) {
    const a = await connect(`${state.appIdPrefix}${i}`);
    a.disposition = dispositions[i];
    a.critiquesWritten = 0;
    agents.push(a);
  }

  // THE SCRATCH-DHT CHECK, and it is the reason this file can be run at all.
  // Every agent must be on ONE DNA hash, and that hash must belong to the seed
  // swarm.sh minted. Pointing this at the ordinary sandbox fails here.
  const dna0 = b64(agents[0].dna);
  if (!agents.every((a) => b64(a.dna) === dna0)) {
    log('REFUSED: the agents are not all on one DHT.');
    process.exit(1);
  }
  if (state.dnaHash && state.dnaHash !== dna0) {
    log('REFUSED: this conductor is not the scratch DHT this swarm was minted for.');
    log(`  recorded: ${state.dnaHash}`);
    log(`  found:    ${dna0}`);
    process.exit(1);
  }
  log(`DHT: ${dna0.slice(0, 20)}…  (${agents.length} agents, one network)`);

  // --- 1. Declare before acting ------------------------------------------
  log('\n--- Every agent publishes its threshold as a promise, before acting ---');
  for (const a of agents) {
    await a.call('publish_constitution', {
      agent: a.me,
      promises: [{ action: a.disposition.promise, domain: DOMAIN, modality: null }],
      conditions: [], published_at: nowSecs(), expires_at: null,
    });
    log(`  ${a.appId}  ${a.disposition.name}${a.disposition.minority ? '  (deliberate minority)' : ''}`);
  }

  // --- 2. Seed something to disagree about -------------------------------
  // Written by agent 0 so the population has a shared subject. Deliberately
  // varied: some claims are unevidenced at high confidence, some cite
  // evidence without a method, some are unobjectionable under every
  // disposition — so silence is as informative as action.
  log('\n--- Seeding claims for the population to read ---');
  const seeder = agents[0];
  const evidence = await seeder.call('create_evidence', {
    content: 'a measurement the swarm can see cited', evidence_type: 'Text',
    source_url: null, author: seeder.me, timestamp: nowMicros(),
  });
  const seeds = [
    { content: 'Carbon capture scales linearly with investment.', confidence: 'High', evidence_hashes: [] },
    { content: 'Soil carbon is undercounted in current models.', confidence: 'Tentative', evidence_hashes: [] },
    { content: 'Measured across 40 sites, uptake exceeded the projection.', confidence: 'High', evidence_hashes: [evidence] },
    { content: 'The 2026 figures show a reversal.', confidence: 'Moderate', evidence_hashes: [evidence] },
    { content: 'Nothing conclusive can be said yet.', confidence: 'Hypothetical', evidence_hashes: [] },
  ];
  for (const s of seeds) {
    await seeder.call('create_claim', {
      ...s, domain: DOMAIN, author: seeder.me, timestamp: nowMicros(),
      semantic_tags: ['swarm-seed'], source_mew: null,
    });
  }
  log(`  ${seeds.length} claims seeded in ${DOMAIN}`);

  // --- 3. The loop: observe, assess, publish -----------------------------
  log('\n--- Rounds: observe, assess against a declared threshold, publish ---');
  const acted = [];
  for (let round = 1; round <= ROUNDS; round++) {
    log(`\n  round ${round}`);
    for (const a of agents) {
      if (a.critiquesWritten >= MAX_CRITIQUES_PER_AGENT) {
        log(`    ${a.appId} is at its self-imposed ceiling (${MAX_CRITIQUES_PER_AGENT}) — standing down`);
        continue;
      }
      const claims = await a.call('get_claims_by_domain', DOMAIN);
      for (const record of claims) {
        if (a.critiquesWritten >= MAX_CRITIQUES_PER_AGENT) break;
        const claim = record?.entry?.Present?.entry;
        const entryHash = record?.signed_action?.hashed?.content?.data?.entry_hash;
        if (!entryHash) continue;
        // Decoding the entry is this client's job: a Record's entry crosses as
        // msgpack, so the fields are read through the coordinator's own getter
        // rather than guessed at from bytes.
        const decoded = await a.call('get_claim', entryHash);
        if (!decoded) continue;

        // WHAT THIS AGENT HAS SEEN of this target, which is both the cone it
        // will record and the "already critiqued by me" check.
        const existing = await a.call('get_critiques_for', entryHash);
        const existingHashes = existing
          .map((r) => r?.signed_action?.hashed?.hash)
          .filter(Boolean);
        // `content.header.author`, NOT `content.author`, and reading the
        // wrong one is why the first swarm run repeated every critique on
        // every round: the filter matched nothing, so each agent believed it
        // had never spoken and said the same thing three times.
        //
        // An Action serialises as `{ header: { author, timestamp, action_seq,
        // prev_action }, data: { ... } }`, which
        // `scripts/live-verify/discourse-readings.mjs` already documents at
        // length — after making the identical mistake. Reading the repository
        // would have been cheaper than rediscovering it.
        const mine = existing.filter((r) => {
          const auth = r?.signed_action?.hashed?.content?.header?.author;
          return auth && b64(Uint8Array.from(auth.data ?? auth)) === b64(a.me);
        });

        const verdict = assess(a.disposition, decoded, {
          alreadyCritiquedBy: mine.length ? [a.disposition.name] : [],
        });
        if (!verdict.act) continue;

        // THE PAST CONE: every critique of this target this agent can see
        // right now. Recorded because it cannot be reconstructed later, and
        // transitively closed by construction — the set is everything, so no
        // member's own cone can fall outside it.
        try {
          await a.call('create_critique', {
            target: entryHash, target_type: 'Claim', critique_mode: verdict.mode,
            content: verdict.content, author: a.me, timestamp: nowMicros(),
            replication_attempted: false, evidence_hashes: [], species: null,
            past_cone: existingHashes,
          });
          a.critiquesWritten++;
          acted.push({ agent: a.appId, disposition: a.disposition.name, mode: verdict.mode, reason: verdict.reason });
          log(`    ${a.appId} [${a.disposition.name}] ${verdict.mode}: ${verdict.reason}`);
        } catch (e) {
          const msg = String(e?.message ?? e);
          if (/friction/i.test(msg)) {
            log(`    ${a.appId} hit a protocol friction ceiling — standing down for this run`);
            a.critiquesWritten = MAX_CRITIQUES_PER_AGENT;
          } else {
            log(`    ${a.appId} write refused: ${msg.slice(0, 120)}`);
          }
        }
      }
    }
  }

  // --- 4. What the population did, reported without ranking --------------
  log('\n--- What happened, as counts rather than a leaderboard ---');
  const byDisposition = {};
  for (const r of acted) byDisposition[r.disposition] = (byDisposition[r.disposition] ?? 0) + 1;
  // PER AGENT AS WELL AS PER DISPOSITION, because the totals alone are
  // MISLEADING and the first run proved it: three dispositions each showed 6
  // critiques, which reads as "no difference" — when in fact one loose agent
  // wrote 6 while two strict agents wrote 3 each. The aggregate divided the
  // signal by the headcount and hid exactly the thing item 11 is about.
  const perAgent = {};
  for (const r of acted) perAgent[r.agent] = (perAgent[r.agent] ?? 0) + 1;
  for (const [name, n] of Object.entries(byDisposition)) {
    const d = DISPOSITIONS[name];
    const members = agents.filter((a) => a.disposition.name === name);
    const each = members.map((a) => perAgent[a.appId] ?? 0).join(', ');
    log(`  ${name.padEnd(20)} ${String(n).padStart(2)} total across ${members.length} agent(s) `
      + `[${each}]${d?.minority ? '   (the deliberate minority)' : ''}`);
  }
  for (const name of Object.keys(DISPOSITIONS)) {
    if (!byDisposition[name]) log(`  ${name.padEnd(20)} 0 critique(s) — its threshold was never met`);
  }

  // --- 5. The cones, which only a concurrent population can produce -------
  // The reason `protocol_version: 10` was worth a fork, shown rather than
  // asserted: agents acting on the same targets in the same round record
  // DIFFERENT views of what had been said, because they genuinely had
  // different views. Nothing reconstructs this later.
  log('\n--- What each critique recorded having seen ---');
  const claimsNow = await agents[0].call('get_claims_by_domain', DOMAIN);
  let withCone = 0, silent = 0, examined = 0;
  for (const record of claimsNow) {
    const entryHash = record?.signed_action?.hashed?.content?.data?.entry_hash;
    if (!entryHash) continue;
    const crits = await agents[0].call('get_critiques_for', entryHash);
    for (const c of crits) {
      const h = c?.signed_action?.hashed?.hash;
      if (!h) continue;
      const report = await agents[0].call('critiques_unseen_by', h);
      examined++;
      if (report.cone_recorded) withCone++; else silent++;
      if (examined <= 4) {
        log(`    critique ${b64(h).slice(0, 10)}…  saw ${report.seen_count} of `
          + `${report.total_known} sibling(s)${report.cone_recorded ? '' : '   (recorded nothing)'}`);
      }
    }
  }
  log(`    ${withCone} critique(s) recorded a cone, ${silent} recorded nothing, of ${examined} examined`);
  if (silent > 0) {
    log('    A critique that recorded nothing is SILENT, not ignorant — the field');
    log('    defaults to empty and most clients omit it. The report says so itself.');
  }

  log('');
  log('  THESE ARE COUNTS OF ACTION, NOT OF CORRECTNESS. Invariant 1 bars a');
  log('  comparative reputation score, and "which disposition critiqued most"');
  log('  is not a measure of which was right — only of which had the lower bar.');
  log('  Whether the minority was exploring or adding noise is visible in');
  log('  whether anybody ADOPTS what it proposes, which get_species_adoption');
  log('  answers and which cannot be known this early.');
  log('');
  log(`  Everything above is permanent on this scratch DHT and nowhere else.`);
  log(`  scripts/swarm.sh clean  destroys it — which is only possible BECAUSE`);
  log(`  it is scratch. On a real network Invariant 6 means no such command exists.`);
  process.exit(0);
}

main().catch((e) => { console.error('\nSWARM ERROR:', e); process.exit(1); });
