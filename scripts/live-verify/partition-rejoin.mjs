#!/usr/bin/env node
// ============================================================================
// scripts/live-verify/partition-rejoin.mjs — DOES A NODE THAT MISSED WRITES
// CATCH UP WHEN IT COMES BACK?
//
// WHY THIS EXISTS. real-gossip.mjs proved an entry written on one
// conductor reaches another over a real network, with both nodes up the
// whole time. That is the easy half. A network whose participants are
// never offline is not a network anyone runs: laptops close, processes
// restart, links drop. The property that actually matters for a protocol
// built on "nothing is deleted, only witnessed" is that a node which was
// AWAY while history was written does not stay ignorant of it.
//
// Nothing had tested that. This harness does, and it partitions in both
// directions rather than one, because a one-sided test cannot distinguish
// "the returning node catches up" from "the node that stayed up pushes to
// whoever appears" — two different mechanisms with the same happy path.
//
// THE SHAPE OF THE TEST. Stopping a conductor is the partition. That is
// deliberate: it is unambiguous, and it is what actually happens in
// practice. Blocking traffic between two processes that are both still
// running is a different and murkier experiment, since either may hold an
// already-negotiated QUIC connection that no longer depends on the
// signal server it was introduced by.
//
//   Phase 0  Both up. A claim crosses A -> B. This is the baseline: if
//            the network is not healthy BEFORE the partition, nothing
//            after it can be interpreted.
//   Phase 1  nodeB stopped. nodeA writes claimA. nodeB never saw it and
//            could not have — it was not running when it was written.
//   Phase 2  nodeA stopped, THEN nodeB started, in that order so the two
//            are never up together. nodeB is confirmed NOT to hold
//            claimA — this is the divergence, and it is the check that
//            makes the whole run mean something, so it waits several
//            times the crossing time Phase 0 measured before asserting
//            the absence. nodeB writes claimB, which nodeA never saw.
//   Phase 3  nodeA restarted. Both up for the first time since Phase 0.
//   Phase 4  Do they converge? nodeA must acquire claimB and nodeB must
//            acquire claimA. Both directions, measured CONCURRENTLY from
//            one shared clock — see the note at the call site for why
//            measuring them in sequence produces a true-but-misleading
//            second number.
//   Phase 5  A claim written AFTER healing propagates normally — so the
//            link is genuinely healed and not merely backfilled once.
//
// nodeC, on its own DHT, stays up throughout and must never see any of
// it. It is the same control real-gossip.mjs uses and it does the same
// job: without it, "nodeB has claimA" cannot be separated from "any
// conductor pointed at these services ends up with everything."
//
// Prereqs: scripts/network.sh clean && scripts/network.sh start, and a
// packed .happ at the repo root (scripts/pack-webhapp.sh). This harness
// stops and starts conductors via scripts/network.sh stop-node/start-node,
// so it needs that network and not scripts/sandbox.sh's conductor.
//
// SAFE TO RE-RUN without cleaning, for the same reasons real-gossip.mjs
// is: every check is scoped to a domain minted from Date.now(), and
// create_claim spends no SWO friction budget. It does leave the network
// running with all three nodes up, whatever phase it failed in.
// ============================================================================
// ---------------------------------------------------------------------------
// NEGATIVE EVIDENCE — this harness has been watched failing, and the
// first injection found a real defect IN THIS FILE rather than confirming
// it was already sound.
//
//   Regression injected: both `stop-node` calls removed, so no partition
//   ever happened and all three nodes stayed up throughout.
//   Result, FIRST TIME: the two "is genuinely down" checks went red, as
//   they should — and the DIVERGENCE check, the one that carries the
//   entire meaning of the run, STAYED GREEN. It read nodeB immediately
//   after nodeA's write, sooner than the ~5s a claim actually takes to
//   cross, so it observed zero for a reason that had nothing to do with
//   any partition. The label said "it was never up alongside nodeA"; the
//   assertion tested "nothing has arrived yet." That is this directory's
//   recorded failure mode — a check whose label claims more than its
//   assertion tests — and it was live here until the injection exposed
//   it. Fixed by waiting several times the crossing time Phase 0 measures
//   on the same network before asserting the absence.
//   Result, AFTER THE FIX: the same injection turns the DIVERGENCE check
//   red too, which is the only reason its passing means anything.
//
//   Regression injected: nodeB's entry in NODES pointed at nodeC's ports,
//   so the "peer" was a conductor on a different DHT.
//   Result: the same-DHT and distinct-agent-key checks went red and the
//   run aborted before partitioning anything, printing all three DNA
//   hashes. Exit 1.
//
//   Restored and re-run: 23 checks green, catch-up measured at 326.6s in
//   both directions.
//
// ---------------------------------------------------------------------------

import { AdminWebsocket, AppWebsocket, CellType } from '@holochain/client';
import { decode } from '@msgpack/msgpack';
import { execFileSync } from 'node:child_process';

const NETWORK_SH = new URL('../network.sh', import.meta.url).pathname;

const NODES = {
  A: { node: 'nodeA', admin: 8899, app: 8898, appId: 'epistemic-net-a' },
  B: { node: 'nodeB', admin: 8897, app: 8896, appId: 'epistemic-net-b' },
  C: { node: 'nodeC', admin: 8895, app: 8894, appId: 'epistemic-net-c' },
};

// THE WINDOW IS SIZED FROM THE CONDUCTOR'S OWN BACKOFF CONSTANTS, not
// guessed. Catch-up after a rejoin is a different mechanism from
// steady-state gossip, and much slower for a specific, findable reason:
// the generated conductor config carries
//
//     gossip_peer_on_success_next_gossip_delay_ms: 60000    (1 min)
//     gossip_peer_on_error_next_gossip_delay_ms:  300000    (5 min)
//
// A node that tried to gossip with a peer while that peer was down took
// the ERROR path, so it will not retry that peer for five minutes.
// Steady-state propagation is ~2s (see real-gossip.mjs); post-partition
// catch-up is dominated by this constant instead, and a window shorter
// than 300s measures the constant rather than the protocol. An earlier
// version of this harness used 180s and was on course to report a
// convergence failure that would really have been impatience — recorded
// because a too-short timeout produces a confident, wrong, negative
// result, which is worse than no result.
const CONVERGE_WINDOW_MS = 600_000;
const POLL_MS = 5_000;

const b64 = (u8) => Buffer.from(u8).toString('base64');
const log = (...a) => console.log(...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const nowMicros = () => Date.now() * 1000;

let failures = 0;
const check = (label, cond) => {
  if (cond) log(`  PASS: ${label}`);
  else { log(`  FAIL: ${label}`); failures++; }
};

function setupFail(lines) {
  log('');
  for (const l of lines) log(`  SETUP FAILED: ${l}`);
  log('');
  log('  Bring the network up first:');
  log('    scripts/network.sh clean && scripts/network.sh start');
  process.exit(1);
}

const net = (...args) => {
  try {
    return execFileSync('bash', [NETWORK_SH, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    setupFail([
      `scripts/network.sh ${args.join(' ')} failed.`,
      String(e.stderr || e.stdout || e.message).trim().split('\n').slice(-5).join('\n  '),
    ]);
  }
};

// Connecting is retried on CellDisabled for the same reason it is in
// real-gossip.mjs, and it matters more here: this harness restarts
// conductors on purpose, and a restarted one reports both its ports up
// while its cell is still coming back. Duplicated rather than shared
// because every harness in this directory is deliberately standalone —
// see the directory README — but the two copies must stay in step.
async function connectNode(name) {
  const { admin: adminPort, app: appPort, appId } = NODES[name];
  let admin;
  try {
    admin = await AdminWebsocket.connect({
      url: new URL(`ws://localhost:${adminPort}`),
      wsClientOptions: { origin: 'live-verify' },
    });
  } catch (e) {
    setupFail([`node${name}'s admin port ${adminPort} did not answer (${e.message}).`]);
  }
  const { token } = await admin.issueAppAuthenticationToken({ installed_app_id: appId });
  const app = await AppWebsocket.connect({
    url: new URL(`ws://localhost:${appPort}`),
    token,
    wsClientOptions: { origin: 'live-verify' },
  });
  const info = await app.appInfo();
  const cellIds = [];
  for (const roleCells of Object.values(info.cell_info)) {
    for (const cell of roleCells) {
      if (CellType.Provisioned in cell) cellIds.push(cell[CellType.Provisioned].cell_id);
    }
  }
  if (cellIds.length === 0) setupFail([`App "${appId}" on node${name} has no provisioned cells.`]);
  for (const cellId of cellIds) {
    let lastErr;
    for (let attempt = 0; attempt < 30; attempt++) {
      try { await admin.authorizeSigningCredentials(cellId); lastErr = null; break; }
      catch (e) {
        lastErr = e;
        if (!String(e.message ?? e).includes('CellDisabled')) throw e;
        await sleep(1000);
      }
    }
    if (lastErr) setupFail([
      `node${name}'s cell was still disabled after 30s of retrying.`,
      String(lastErr.message ?? lastErr),
    ]);
  }
  const call = (fn, payload) =>
    app.callZome({ role_name: 'epistemic', zome_name: 'epistemic_coordinator', fn_name: fn, payload });
  return { name, dna: cellIds[0][0], me: cellIds[0][1], call, adminPort, appPort };
}

const claimEntry = (record) => decode(record.entry.Present.entry);

async function publishClaim(node, domain, content) {
  await node.call('create_claim', {
    content, domain, confidence: 'Moderate', semantic_tags: [],
    author: node.me, timestamp: nowMicros(), evidence_hashes: [], attestation_policy: null,
  });
}

const countIn = async (node, domain) => (await node.call('get_claims_by_domain', domain)).length;

// Is a conductor's admin port actually refusing connections? "Stopped"
// has to be confirmed, not assumed — a partition that did not happen
// would make every check after it meaningless while looking identical.
async function portRefuses(port) {
  try {
    const ws = await AdminWebsocket.connect({
      url: new URL(`ws://localhost:${port}`), wsClientOptions: { origin: 'live-verify' },
    });
    try { await ws.client?.close?.(); } catch { /* best effort */ }
    return false;
  } catch { return true; }
}

async function awaitConvergence(node, domain, label, isolated) {
  const t0 = Date.now();
  let isolatedEverSaw = false;
  while (Date.now() - t0 < CONVERGE_WINDOW_MS) {
    const got = await countIn(node, domain);
    const iso = await countIn(isolated, domain);
    if (iso > 0) isolatedEverSaw = true;
    log(`    [${label}] t+${((Date.now() - t0) / 1000).toFixed(0)}s  ${label}=${got}  node${isolated.name}=${iso}`);
    if (got > 0) return { ms: Date.now() - t0, isolatedEverSaw };
    await sleep(POLL_MS);
  }
  return { ms: null, isolatedEverSaw };
}

async function main() {
  const DOMAIN_A = `PartA${Date.now()}`;
  const DOMAIN_B = `PartB${Date.now()}`;
  const DOMAIN_POST = `PartPost${Date.now()}`;
  const CONTENT_A = 'Written on nodeA while nodeB was offline.';
  const CONTENT_B = 'Written on nodeB while nodeA was offline.';

  log('Connecting to three conductors ...');
  let A = await connectNode('A');
  let B = await connectNode('B');
  const C = await connectNode('C');
  log(`  nodeA  dna ${b64(A.dna).slice(0, 14)}…  agent ${b64(A.me).slice(0, 12)}…`);
  log(`  nodeB  dna ${b64(B.dna).slice(0, 14)}…  agent ${b64(B.me).slice(0, 12)}…`);
  log(`  nodeC  dna ${b64(C.dna).slice(0, 14)}…  agent ${b64(C.me).slice(0, 12)}…`);

  // ---- Preconditions ----------------------------------------------------
  log('\n--- Preconditions ---');
  const sameDht = b64(A.dna) === b64(B.dna);
  const isolatedOk = b64(A.dna) !== b64(C.dna);
  check('nodeA and nodeB are on the SAME DHT', sameDht);
  check('nodeC is on a DIFFERENT DHT', isolatedOk);
  check('all three agent keys are distinct', new Set([b64(A.me), b64(B.me), b64(C.me)]).size === 3);
  if (!sameDht || !isolatedOk) {
    setupFail(['The DNA hashes are not in the arrangement this harness requires.',
      `nodeA ${b64(A.dna)}`, `nodeB ${b64(B.dna)}`, `nodeC ${b64(C.dna)}`]);
  }

  // ---- Phase 0: the network is healthy before we break it ---------------
  //
  // Without this, a total convergence failure later is indistinguishable
  // from a network that was never working in the first place.
  log('\n--- Phase 0: BASELINE — the network works before the partition ---');
  const DOMAIN_BASE = `PartBase${Date.now()}`;
  await publishClaim(A, DOMAIN_BASE, 'Baseline, both nodes up.');
  const base = await awaitConvergence(B, DOMAIN_BASE, 'nodeB', C);
  check('a claim crosses nodeA -> nodeB with both up (baseline)', base.ms !== null);
  if (base.ms === null) {
    setupFail(['The network is not carrying claims even with both nodes up.',
      'Nothing this harness does after breaking it could be interpreted.',
      'Check scripts/network.sh status, and run real-gossip.mjs first.']);
  }
  log(`    baseline crossed in ${(base.ms / 1000).toFixed(1)}s`);

  // ---- Phase 1: partition, and write where B cannot see -----------------
  log('\n--- Phase 1: nodeB goes offline; nodeA writes anyway ---');
  net('stop-node', 'nodeB');
  check('nodeB is genuinely down (its admin port refuses connections)', await portRefuses(NODES.B.admin));
  await publishClaim(A, DOMAIN_A, CONTENT_A);
  check('nodeA wrote claimA while nodeB was offline', (await countIn(A, DOMAIN_A)) === 1);

  // ---- Phase 2: swap which node is offline ------------------------------
  //
  // ORDER MATTERS AND IS THE POINT. nodeA is stopped BEFORE nodeB is
  // started, so the two are never running at the same time. That is what
  // guarantees nodeB cannot have learned claimA, making the divergence
  // real rather than probable.
  log('\n--- Phase 2: nodeA goes offline BEFORE nodeB returns, so they never overlap ---');
  net('stop-node', 'nodeA');
  check('nodeA is genuinely down (its admin port refuses connections)', await portRefuses(NODES.A.admin));
  net('start-node', 'nodeB');
  B = await connectNode('B');

  // THE DIVERGENCE CHECK HAS TO OUTLAST GOSSIP, or it proves nothing.
  //
  // Reading nodeB the instant it returns and finding zero is exactly what
  // you would see if the partition had never happened and the claim were
  // merely still in flight — steady-state propagation is a couple of
  // seconds, and this read happens sooner than that. Found by injection:
  // with both `stop-node` calls removed, so that no partition occurred at
  // all, the two "is genuinely down" checks went red as they should and
  // THIS CHECK STILL PASSED. A check whose label claims more than its
  // assertion tests is this directory's recorded failure mode, and this
  // was one.
  //
  // So the dwell is derived from what this run actually measured rather
  // than from a guess: Phase 0 timed a real crossing on this very
  // network, and we wait several times that before asserting absence. If
  // the nodes were in fact connected, the claim would have arrived well
  // inside the window.
  const dwellMs = Math.max(15_000, base.ms * 5);
  log(`    waiting ${(dwellMs / 1000).toFixed(0)}s before asserting absence — ${(base.ms / 1000).toFixed(1)}s was enough to cross in Phase 0 ...`);
  await sleep(dwellMs);
  const bSawA = await countIn(B, DOMAIN_A);
  log(`    nodeB's view of claimA's domain on return: ${bSawA}`);
  check('DIVERGENCE: nodeB does NOT have claimA, after long enough that it would have arrived', bSawA === 0);

  await publishClaim(B, DOMAIN_B, CONTENT_B);
  check('nodeB wrote claimB while nodeA was offline', (await countIn(B, DOMAIN_B)) === 1);
  check('nodeC has neither claim', (await countIn(C, DOMAIN_A)) === 0 && (await countIn(C, DOMAIN_B)) === 0);

  // ---- Phase 3 & 4: heal, and converge in both directions ---------------
  log('\n--- Phase 3: nodeA returns. Both up for the first time since Phase 0 ---');
  net('start-node', 'nodeA');
  A = await connectNode('A');
  check('nodeA still has its own claimA after restarting', (await countIn(A, DOMAIN_A)) === 1);
  check('nodeB still has its own claimB after nodeA restarted', (await countIn(B, DOMAIN_B)) === 1);

  //
  // BOTH DIRECTIONS ARE MEASURED CONCURRENTLY, FROM ONE SHARED CLOCK, and
  // that is a correctness property of the measurement rather than a
  // convenience. Measured in sequence, the second direction is timed only
  // after the first has already waited out the whole healing delay, so it
  // reports ~0s and reads as "instant" when nothing of the sort happened:
  // both directions in fact heal together, in the same gossip round. The
  // first version of this harness did exactly that and printed
  // "nodeA 351.7s, nodeB 0.0s" — two true numbers that together tell a
  // false story. Run in parallel, both report the real elapsed time from
  // the same t0.
  log('\n--- Phase 4: do BOTH nodes acquire what the other wrote while they were away? ---');
  log('    (measured concurrently — see the note in the source on why)');
  const [convA, convB] = await Promise.all([
    awaitConvergence(A, DOMAIN_B, 'nodeA', C),
    awaitConvergence(B, DOMAIN_A, 'nodeB', C),
  ]);
  check('nodeA converges on claimB, written while nodeA was offline', convA.ms !== null);
  if (convA.ms !== null) log(`    nodeA converged in ${(convA.ms / 1000).toFixed(1)}s`);
  check('nodeB converges on claimA, written while nodeB was offline', convB.ms !== null);
  if (convB.ms !== null) log(`    nodeB converged in ${(convB.ms / 1000).toFixed(1)}s`);

  // Content, not just count — "a record arrived" and "the record the other
  // node wrote arrived" are different claims.
  const aHasB = await A.call('get_claims_by_domain', DOMAIN_B);
  const bHasA = await B.call('get_claims_by_domain', DOMAIN_A);
  check('what nodeA acquired is nodeB\'s entry, authored by nodeB',
    aHasB.length === 1 && claimEntry(aHasB[0]).content === CONTENT_B && b64(claimEntry(aHasB[0]).author) === b64(B.me));
  check('what nodeB acquired is nodeA\'s entry, authored by nodeA',
    bHasA.length === 1 && claimEntry(bHasA[0]).content === CONTENT_A && b64(claimEntry(bHasA[0]).author) === b64(A.me));

  // ---- Phase 5: the link is healed, not merely backfilled ---------------
  log('\n--- Phase 5: a claim written AFTER healing propagates normally ---');
  check('nodeB sees 0 in the post-heal domain before nodeA publishes', (await countIn(B, DOMAIN_POST)) === 0);
  await publishClaim(A, DOMAIN_POST, 'Written after the partition healed.');
  const post = await awaitConvergence(B, DOMAIN_POST, 'nodeB', C);
  check('a NEW claim crosses nodeA -> nodeB after healing', post.ms !== null);
  if (post.ms !== null) log(`    crossed in ${(post.ms / 1000).toFixed(1)}s`);

  // ---- The isolated control, over the whole run -------------------------
  log('\n--- CONTROL: the isolated node saw none of it, throughout ---');
  check('nodeC never saw claimA', (await countIn(C, DOMAIN_A)) === 0);
  check('nodeC never saw claimB', (await countIn(C, DOMAIN_B)) === 0);
  check('nodeC never saw the post-heal claim', (await countIn(C, DOMAIN_POST)) === 0);
  check('nodeC never saw anything during any convergence wait',
    !base.isolatedEverSaw && !convA.isolatedEverSaw && !convB.isolatedEverSaw && !post.isolatedEverSaw);
  check('nodeC is alive and answering, not merely silent',
    Array.isArray(await C.call('get_claims_by_domain', 'AnyDomainAtAll')));

  log('');
  if (failures === 0) {
    log('ALL CHECKS PASSED — two conductors each wrote history the other');
    log('could not see, and on rejoining converged on both, in both');
    log('directions, while an isolated conductor saw none of it.');
    if (convA.ms !== null && convB.ms !== null) {
      log(`Catch-up: nodeA ${(convA.ms / 1000).toFixed(1)}s, nodeB ${(convB.ms / 1000).toFixed(1)}s.`);
    }
  } else {
    log(`${failures} CHECK(S) FAILED.`);
  }
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('\nHARNESS ERROR:', e);
  process.exit(1);
});
