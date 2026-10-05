#!/usr/bin/env node
// ============================================================================
// stall-bisect.mjs — WHICH VARIABLE IN THE SEQUENCE CAUSES THE 60s STALL?
//
// dht-isolation-probe.mjs established a reproducible 60s call_zome stall and
// refuted two accounts of it. Its most useful result was a NEGATIVE one: the
// failing cell is nodeB's first restart while isolated, and a phase that
// repeated "isolated restart, then first read" five times never reproduced
// it. So position in the sequence matters and was not controlled.
//
// TWO CANDIDATES ARE SEPARABLE HERE, and each is one variable.
//
//   RESTART ORDINAL. In the failing cell, nodeB is on its FIRST restart since
//   the network was created. In the repeat phase it was already on its third,
//   because the failing cell and one other condition had each restarted it.
//   If the stall is a once-per-conductor-lifetime cost, it is paid at the
//   first restart and never again — which would explain both results at once.
//   Tested by cleaning the network between rounds, so every round gets a
//   genuine first restart, and by restarting twice within each round.
//
//   PROVENANCE OF THE DATA. The stall hits a read of a domain nodeB HOLDS,
//   while a never-written domain answers in 10ms. In the failing cell nodeB
//   holds that claim because it was GOSSIPED IN from nodeA. If the stall is
//   about serving gossip-acquired data after a restart, then a claim nodeB
//   AUTHORED ITSELF should not stall. That is a sharp discriminator and it
//   costs one extra variant.
//
// Everything else is held fixed: nodeA is stopped before every restart, since
// isolation is already known to be necessary (the non-isolated cells answered
// in 0.29s), and only the first read after each restart is timed, since
// second reads were already shown to answer in 10ms.
//
// Asserts nothing. Prints a table. Not in CI.
//
// ---------------------------------------------------------------------------
// WHAT IT FOUND, 2026-10-05, five clean networks at the client default plus
// three more with the per-call ceiling raised to 180s.
//
//   gossiped  restart #1   3/3 failed   65.62s, 65.67s, 87.61s
//   gossiped  restart #2   0/3 failed    0.00s,  0.00s,  0.00s
//   local     restart #1   2/2 failed   43.70s, 43.64s
//   local     restart #2   0/2 failed    0.00s,  0.00s
//
// RESTART ORDINAL IS THE VARIABLE. Every first read after nodeB's first
// restart in a clean network fails; every second restart answers in 0.00s.
// 5 of 5 against 0 of 5, across both provenances and both ceilings. That is
// also the whole explanation of dht-isolation-probe.mjs's 0-of-5 negative:
// its repeat phase was already on nodeB's third restart, so the cost had been
// paid before it started measuring.
//
// PROVENANCE IS NOT THE DISCRIMINATOR. A claim nodeB authored itself fails
// exactly as a gossiped one does, so this is not about serving
// gossip-acquired data across a restart. That was the sharpest and most
// reportable hypothesis available and it is refuted.
//
// AND IT WAS NEVER A TIMEOUT, which is the finding that matters most. At the
// client default the gossiped case reported `Request timed out in 60000 ms:
// call_zome` three times at exactly 60.00s -- the ceiling reporting itself,
// not a duration. With the ceiling at 180s the conductor's real answer is
//
//     Wasm runtime error while working with Ribosome: RuntimeError
//
// the same error the local case was already showing at 43.7s, below the
// default and therefore never truncated. So it is ONE bug, it is a wasm-level
// crash, and every prior record of it -- three CI occurrences, this
// repository's instrument, transitive-gossip's removal from network.yml --
// named the client's timeout instead of the conductor's crash.
//
// THE DURATION IS NOT A SIGNAL. 65.62, 65.67, 87.61 for one provenance and
// 43.70, 43.64 for the other: tight pairs with one 22s outlier, and a
// consistent gap between provenances that no account here explains. The
// ERROR is the signal; nothing is built on the timings.
//
// WHY the ribosome throws is inside Holochain and this probe measures from
// outside. Nothing is fixed on it.
// ---------------------------------------------------------------------------
// ============================================================================
import { AdminWebsocket, AppWebsocket, CellType } from '@holochain/client';
import { execFileSync } from 'node:child_process';

const NODES = {
  A: { node: 'nodeA', admin: 8899, app: 8898, appId: 'epistemic-net-a' },
  B: { node: 'nodeB', admin: 8897, app: 8896, appId: 'epistemic-net-b' },
};
const log = (...a) => console.log(...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const net = (...args) => execFileSync('scripts/network.sh', args, { stdio: 'pipe' });
const nowMicros = () => Date.now() * 1000;

async function connect(name) {
  const { admin: adminPort, app: appPort, appId } = NODES[name];
  const admin = await AdminWebsocket.connect({ url: new URL(`ws://localhost:${adminPort}`), wsClientOptions: { origin: 'live-verify' } });
  const { token } = await admin.issueAppAuthenticationToken({ installed_app_id: appId });
  const app = await AppWebsocket.connect({ url: new URL(`ws://localhost:${appPort}`), token, wsClientOptions: { origin: 'live-verify' } });
  const info = await app.appInfo();
  const ids = [];
  for (const roleCells of Object.values(info.cell_info))
    for (const cell of roleCells) if (cell?.type === CellType.Provisioned) ids.push(cell.value.cell_id);
  for (const id of ids) {
    for (let i = 0; i < 30; i++) {
      try { await admin.authorizeSigningCredentials(id); break; }
      catch (e) { if (!String(e.message ?? e).includes('CellDisabled')) throw e; await sleep(1000); }
    }
  }
  return {
    name, me: ids[0][1],
    // THE PER-CALL TIMEOUT IS AN INSTRUMENT SETTING HERE, NOT A FIX.
    //
    // The first bisect run reported the gossiped case as exactly 60.00s three
    // times, which is the @holochain/client default and therefore tells us
    // only where the CLIENT stopped looking — not how long the conductor
    // would have taken. The local case failed at ~43.7s with a ribosome error
    // instead, so the two may be one stall surfacing differently or two bugs
    // with a shared trigger. Raising the ceiling for the measurement
    // distinguishes those. Nothing in the harnesses is changed by this; the
    // repository's rule against widening a timeout is about hiding a failure,
    // and this does the opposite.
    call: (fn, payload) => app.callZome({ role_name: 'epistemic', zome_name: 'epistemic_coordinator', fn_name: fn, payload }, READ_TIMEOUT_MS),
  };
}

const write = (node, domain, content) => node.call('create_claim', {
  content, domain, confidence: 'Moderate', semantic_tags: [],
  author: node.me, timestamp: nowMicros(), evidence_hashes: [], attestation_policy: null,
});

async function timedRead(node, domain) {
  const t0 = Date.now();
  try { return { ms: Date.now() - t0, got: (await node.call('get_claims_by_domain', domain)).length, err: null }; }
  catch (e) { return { ms: Date.now() - t0, got: null, err: String(e?.message ?? e).split('\n')[0].slice(0, 60) }; }
}

// 180s, so a conductor heading for ~43.7s is seen landing there and one that
// genuinely never returns is seen outlasting three times the client default.
const READ_TIMEOUT_MS = Number(process.env.READ_TIMEOUT_MS ?? 180_000);
const RESTARTS_PER_ROUND = 2;
// Round counts are settable so one variant can be re-measured on its own
// without re-running the other, which is how the 60s artefact was chased.
const GOSSIPED_ROUNDS = Number(process.env.GOSSIPED_ROUNDS ?? 3);
const LOCAL_ROUNDS = Number(process.env.LOCAL_ROUNDS ?? 2);
const ABSENT_ROUNDS = Number(process.env.ABSENT_ROUNDS ?? 3);

// One round = one freshly created network, so restart #1 is a genuine first.
async function round(provenance, label) {
  net('clean'); net('start');
  const DOMAIN = `Bisect${Date.now()}`;
  let A = await connect('A');
  let B = await connect('B');

  if (provenance === 'absent') {
    // EXACTLY partition-rejoin PHASE 2, which the other two variants are not.
    // nodeB is offline while nodeA writes, so the domain ANCHOR exists on the
    // DHT and nodeB holds no entry under it. That distinction was conflated
    // in dht-isolation-probe.mjs, whose "never written" domain had no anchor
    // at all -- and it is the gap that makes the CI failures unexplained by
    // the other variants here.
    net('stop-node', 'nodeB');
    await write(A, DOMAIN, 'written on nodeA while nodeB was offline');
    net('stop-node', 'nodeA');
    net('start-node', 'nodeB');
    B = await connect('B');
    const res = await timedRead(B, DOMAIN);
    const hung = !!res.err || res.ms > 10_000;
    log(`    [${label}] restart #1 first read: ${res.err ? `FAILED ${(res.ms / 1000).toFixed(1)}s — ${res.err}` : `${(res.ms / 1000).toFixed(2)}s, got ${res.got}`}`);
    const rows = [{ label, restart: 1, ...res, hung }];
    net('stop-node', 'nodeB'); net('start-node', 'nodeB');
    B = await connect('B');
    const res2 = await timedRead(B, DOMAIN);
    log(`    [${label}] restart #2 first read: ${res2.err ? `FAILED ${(res2.ms / 1000).toFixed(1)}s — ${res2.err}` : `${(res2.ms / 1000).toFixed(2)}s, got ${res2.got}`}`);
    rows.push({ label, restart: 2, ...res2, hung: !!res2.err || res2.ms > 10_000 });
    return rows;
  }

  if (provenance === 'gossiped') {
    await write(A, DOMAIN, 'written on nodeA, gossiped to nodeB');
    let crossed = false;
    for (let i = 0; i < 60; i++) {
      if ((await B.call('get_claims_by_domain', DOMAIN)).length > 0) { crossed = true; break; }
      await sleep(2000);
    }
    if (!crossed) { log(`    [${label}] SKIPPED: the claim never reached nodeB`); return []; }
  } else {
    await write(B, DOMAIN, 'written on nodeB itself');
  }

  net('stop-node', 'nodeA');          // isolation, known to be necessary
  const rows = [];
  for (let r = 1; r <= RESTARTS_PER_ROUND; r++) {
    net('stop-node', 'nodeB');
    net('start-node', 'nodeB');
    B = await connect('B');
    const res = await timedRead(B, DOMAIN);
    const hung = !!res.err || res.ms > 10_000;
    rows.push({ label, restart: r, ...res, hung });
    log(`    [${label}] restart #${r} first read: ${res.err ? `HUNG ${(res.ms / 1000).toFixed(1)}s — ${res.err}` : `${(res.ms / 1000).toFixed(2)}s, got ${res.got}`}`);
  }
  return rows;
}

async function main() {
  const all = [];
  log(`(per-call read timeout: ${READ_TIMEOUT_MS / 1000}s — the client default is 60s)`);
  log('--- GOSSIPED IN from nodeA (the failing cell\'s provenance), 3 clean networks ---');
  for (let i = 1; i <= GOSSIPED_ROUNDS; i++) all.push(...await round('gossiped', `gossiped r${i}`));
  log('\n--- AUTHORED LOCALLY on nodeB, 2 clean networks ---');
  for (let i = 1; i <= LOCAL_ROUNDS; i++) all.push(...await round('local', `local r${i}`));
  log(`\n--- ABSENT: anchor on the DHT, nothing held by nodeB (partition-rejoin Phase 2 exactly) ---`);
  for (let i = 1; i <= ABSENT_ROUNDS; i++) all.push(...await round('absent', `absent r${i}`));

  log('\n=== BY RESTART ORDINAL AND PROVENANCE ===');
  for (const prov of ['gossiped', 'local', 'absent']) {
    for (let r = 1; r <= RESTARTS_PER_ROUND; r++) {
      const rows = all.filter((x) => x.label.startsWith(prov) && x.restart === r);
      if (rows.length === 0) continue;
      const hung = rows.filter((x) => x.hung).length;
      const times = rows.map((x) => (x.ms / 1000).toFixed(2)).join(', ');
      log(`  ${prov.padEnd(9)} restart #${r}: ${hung}/${rows.length} hung   [${times}]`);
    }
  }
  log('');
  log('  Read it this way: if only restart #1 hangs, it is a once-per-network cost');
  log('  and that explains the earlier negative result. If gossiped hangs and local');
  log('  does not, it is about serving gossip-acquired data after a restart.');
  net('start-node', 'nodeA');  // leave the network as other harnesses expect
}

main().catch((e) => { console.error('\nPROBE ERROR:', e); try { net('start-node', 'nodeA'); } catch {} process.exit(1); });
