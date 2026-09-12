#!/usr/bin/env node
// ============================================================================
// scripts/live-verify/transitive-gossip.mjs — DOES AN ENTRY REACH A NODE FROM
// A PEER THAT DID NOT AUTHOR IT?
//
// WHY THIS EXISTS. Every networking result before this one was a TWO-PARTY
// result. `network.sh` put nodeA and nodeB on the shared seed and nodeC on a
// different one, so the shared DHT had exactly two members and nodeC was a
// control rather than a participant. In a two-member network "nodeB has
// nodeA's entry" cannot distinguish gossip from point-to-point delivery,
// because nodeA is the only peer nodeB has. An entry had never once reached
// a node from a peer that was not its author, and nothing here had ever
// tested that it could.
//
// That is the property this file exists for, and it needs a third member of
// the shared DHT — nodeD, opt-in in `network.sh` for reasons its comment
// gives at length.
//
// WHY THE PARTITION IS BY PROCESS AND NOT BY PACKET, which is not the
// arrangement first proposed. The obvious design is spatial: partition A
// from B while leaving both able to reach D, then watch A's write arrive at
// B by the only route left. THAT CANNOT BE BUILT HERE, and the reason is the
// socket topology `network-partition.mjs` asserts on every run. All peer
// traffic is relayed through the one signal server, so a conductor's entire
// network presence is a single TCP connection to it. Cut that connection and
// the node is isolated from everyone including D; leave it and the node can
// reach everyone including B. There is no per-peer granularity at the packet
// layer to aim a rule at, and giving each conductor its own address would
// not create any — the relay is still one hop that either carries a node's
// traffic or does not.
//
// So the isolation is TEMPORAL instead, which this network can express
// exactly, using the same stop/start `partition-rejoin.mjs` uses:
//
//   Phase 0  A, B, D all up. A claim crosses A -> B. Baseline: if the
//            network is not healthy before, nothing after can be read.
//   Phase 1  nodeB STOPPED. nodeA writes claimA. nodeD is up and must
//            acquire it — nodeD is the courier, and a courier that never
//            received the parcel cannot deliver it. This is checked, not
//            assumed, because everything downstream depends on it.
//   Phase 2  nodeA STOPPED, then nodeB started, in that order so that
//            nodeA and nodeB are never running at the same time. nodeB is
//            confirmed not to hold claimA at the moment it comes back.
//   Phase 3  Does nodeB acquire claimA? Its author is DOWN throughout, and
//            that is re-verified while the wait is in progress rather than
//            only at the start — a check that nodeA was down some minutes
//            ago says nothing about the instant the entry arrived. The only
//            live holder of claimA is nodeD, which did not write it.
//
// The result is the first entry in this repository observed reaching a node
// from a peer that did not author it.
//
// Prereqs: scripts/network.sh clean && scripts/network.sh start, then this
// harness brings nodeD up itself and stops it again at the end — leaving it
// running would silently change what partition-rejoin.mjs measures the next
// time it runs, which is the whole reason nodeD is opt-in.
//
// SAFE TO RE-RUN without cleaning, for the reasons real-gossip.mjs is: every
// check is scoped to a domain minted from Date.now(), and create_claim spends
// no SWO friction budget.
// ============================================================================
// ---------------------------------------------------------------------------
// NEGATIVE EVIDENCE — this harness has been watched failing.
//
//   Injection: nodeA is NOT stopped before nodeB is restarted, so the
//   author sits up alongside the returning node and can hand the claim
//   over directly. That is the single confound this harness exists to
//   exclude, and the result is the reason the controls are written the
//   way they are: THREE checks went red, and "nodeB acquired the claim"
//   — the headline, the check a reader looks at first — STAYED GREEN.
//   It stayed green because nodeB really did acquire the claim; it simply
//   acquired it from the wrong place. Nothing about the positive result
//   distinguishes the two cases. What distinguishes them is the paired
//   control on the author's liveness, which went red, and without it this
//   harness would report a confident, meaningless success in precisely
//   the arrangement it was built to rule out. This is the same shape
//   real-gossip.mjs recorded when its receiver and control slots were
//   swapped, reproduced here on a different property.
//
//   Injection: the courier is removed at the moment of delivery — nodeD
//   is stopped after the divergence is established and before the wait,
//   so nodeA is down, nodeD is down, and NO live node holds the claim.
//   Result: "nodeB acquired the claim" went red after the full 600s
//   window elapsed with nodeB reporting zero on every one of ~120 polls.
//   This is the causal half of the result and the reason it is worth the
//   eleven minutes: with the courier present nodeB has the claim within
//   seconds, and with the courier removed and nothing else changed it
//   does not have it ten minutes later. The difference between those two
//   runs is one process.
//
//   Restored and re-run: 21 checks green.
//
//   Found by a full-suite run, not by an injection: "nodeB does NOT yet hold
//   the claim" went red. It had passed every isolated run of this file, and
//   it was wrong the whole time. The read asserts that nodeB returns without
//   the claim; nodeB can acquire it from nodeD DURING connectNode's own
//   handshake, and on a network already warmed by real-gossip and
//   partition-rejoin running before it, that is what happened — 0.0s. The
//   isolated runs had measured 5.0s and 55.3s and won the race by luck.
//
//   It is now an observation rather than a check, because divergence never
//   depended on it: the domain is minted fresh, and phase 3 asserts nodeB is
//   genuinely down before the claim is authored, so a node that was not
//   running cannot have been sent it. Verified on the failing condition
//   rather than in principle — cold network 5.0s, warm 55.3s, warm again
//   0.0s taking the fast path, all three green.
//
//   THE DELIVERY TIME VARIES AND IS REPORTED AS A RANGE, NOT A CONSTANT.
//   Three clean runs measured 5.0s, 55.3s and 55.3s. The repeat of the
//   same figure twice suggests a periodic gossip cycle that a returning
//   node has to wait its turn in rather than random scatter, with the
//   5.0s run having come back near the start of one. Quoting any single
//   one of these as "the" number would be the mistake partition-rejoin.mjs
//   records under a different heading — reporting a timeout, or a lucky
//   sample, as a property of the system.
//
//   WHAT THAT RANGE MEANS NEXT TO partition-rejoin.mjs's 326.6s, which is
//   the most useful thing this harness found. That harness measured a
//   returning node taking ~5.5 minutes to catch up, dominated by
//   gossip_peer_on_error_next_gossip_delay_ms: 300000 — the backoff a node
//   incurs against a peer it tried and failed to reach. Here the same
//   catch-up happens in seconds. The difference is not a faster protocol;
//   it is a third node. A node coming back has no failure history against
//   a peer that was up the whole time, so it has no backoff to wait out
//   and pulls immediately. The five-and-a-half-minute figure is therefore
//   an artefact of a TWO-MEMBER DHT, where the only peer available to a
//   returning node is the one it just failed to reach. That reading is an
//   inference from the two measurements and the config constant, not
//   something this harness instruments directly, and it is written down
//   as an inference deliberately.
//
//   IT IS, HOWEVER, A PAIRED MEASUREMENT RATHER THAN A COMPARISON ACROSS
//   CONFIGURATIONS. partition-rejoin.mjs was re-run on this same network,
//   on the same machine, in the same session, after the network.sh change
//   and with nodeD DOWN: 23 checks green and catch-up at 326.7s, against
//   the 326.6s it recorded originally. So the two numbers being contrasted
//   — ~326s with two members, seconds with three — differ in the presence
//   of one conductor and not in the machine, the build, or the day.
//   That re-run doubles as the regression check for making nodeD opt-in:
//   the harness the opt-in exists to protect is confirmed unaffected by
//   running it, rather than by arguing that it should be.
// ---------------------------------------------------------------------------

import { AdminWebsocket, AppWebsocket, CellType } from '@holochain/client';
import { decode } from '@msgpack/msgpack';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const NODES = {
  A: { node: 'nodeA', admin: 8899, app: 8898, appId: 'epistemic-net-a' },
  B: { node: 'nodeB', admin: 8897, app: 8896, appId: 'epistemic-net-b' },
  C: { node: 'nodeC', admin: 8895, app: 8894, appId: 'epistemic-net-c' },
  D: { node: 'nodeD', admin: 8891, app: 8890, appId: 'epistemic-net-d' },
};

const NET_ROOT = process.env.EPI_NET_ROOT || '/tmp/epi-net';
const REPO_ROOT = new URL('../..', import.meta.url).pathname;

// Same backoff partition-rejoin.mjs measured and named
// (gossip_peer_on_error_next_gossip_delay_ms: 300000), so the window is
// sized from the constant rather than guessed. A window shorter than the
// mechanism it times does not measure the mechanism; it measures itself.
const CONVERGE_WINDOW_MS = 600_000;

// THE PARAGRAPH ABOVE APPLIED TO THE WAITS BEFORE THE LAST ONE, WHICH IT WAS
// NOT. Both of the earlier waits in this file were a hardcoded two minutes, and
// the nodeD one is the wait this harness died on in CI. Two minutes is not a
// shorter version of the same window; it is the ONE LENGTH THAT CANNOT WORK,
// because `initiate_interval_ms` is 120s and `initiate_jitter_ms` adds up to 10s
// more, so that budget is racing the exact mechanism it is waiting for and loses
// on the jitter alone. README §9 records that finding for `real-gossip.mjs`'s
// prompt window in those words — "a single 120s window was racing the exact
// mechanism that repairs it ... It lost every time" — and this file states the
// principle three lines above while breaking it twice.
//
// 330s, the same figure `real-gossip.mjs` uses and for the same reason: it
// clears the 300s `GOSSIP_REPAIR_WORST_CASE_MS` chosen ceiling with margin for
// interval, jitter and a round. Not re-derived here — see that file's constants
// block, which owns the derivation.
//
// OBSERVED, NOT REASONED, AND THE HONEST VERSION IS THAT IT DID NOT FIX THE
// HARNESS: at two minutes, nodeD failed to acquire nodeA's claim on a freshly
// generated four-node network on 2026-09-12, with every poll answered and no
// warning raised. At 330s it failed the same way, because on that machine nodeD
// was not peered with nodeA at all — see the note in section 2, which is what
// finally explained it. This constant is right on this file's own stated
// principle regardless of that, and was wrong before; it is not a fix for
// anything, and nothing here claims the harness is ready to go back into CI.
const ACQUIRE_WINDOW_MS = 330_000;
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
  process.exit(1);
}

const net = (...args) =>
  execFileSync('bash', [`${REPO_ROOT}/scripts/network.sh`, ...args], { encoding: 'utf8' });

// Down means the process is gone, not that a pidfile was deleted. Read from
// the pidfile the script itself maintains, and confirmed with kill -0.
function nodeIsDown(name) {
  const pf = `${NET_ROOT}/${name}.pid`;
  if (!existsSync(pf)) return true;
  const pid = Number(readFileSync(pf, 'utf8').trim());
  if (!Number.isFinite(pid)) return true;
  try { process.kill(pid, 0); return false; } catch { return true; }
}

async function connectNode(name) {
  const { admin: adminPort, app: appPort, appId } = NODES[name];
  const admin = await AdminWebsocket.connect({
    url: new URL(`ws://localhost:${adminPort}`), wsClientOptions: { origin: 'live-verify' },
  });
  const { token } = await admin.issueAppAuthenticationToken({ installed_app_id: appId });
  const app = await AppWebsocket.connect({
    url: new URL(`ws://localhost:${appPort}`), token, wsClientOptions: { origin: 'live-verify' },
  });
  const info = await app.appInfo();
  const cellIds = [];
  for (const roleCells of Object.values(info.cell_info)) {
    for (const cell of roleCells) {
      // CellInfo became a discriminated union in @holochain/client
      // 0.21 ({ type, value }); it used to be keyed by cell type. The
      // old `CellType.Provisioned in cell` test matches nothing against
      // the new shape, silently yielding no cell ids at all.
      if (cell?.type === CellType.Provisioned) cellIds.push(cell.value.cell_id);
    }
  }
  if (cellIds.length === 0) setupFail([`App "${appId}" on ${NODES[name].node} has no provisioned cells.`]);
  for (const cellId of cellIds) {
    let lastErr;
    for (let i = 0; i < 30; i++) {
      try { await admin.authorizeSigningCredentials(cellId); lastErr = null; break; }
      catch (e) {
        lastErr = e;
        if (!String(e.message ?? e).includes('CellDisabled')) throw e;
        await sleep(1000);
      }
    }
    if (lastErr) setupFail([`${NODES[name].node}'s cell was still disabled after 30s.`, String(lastErr.message ?? lastErr)]);
  }
  return {
    name, dna: cellIds[0][0], me: cellIds[0][1],
    call: (fn, payload) => app.callZome({
      role_name: 'epistemic', zome_name: 'epistemic_coordinator', fn_name: fn, payload,
    }),
  };
}

const claimEntry = (r) => decode(r.entry.Present.entry);
const publish = (n, domain, content) => n.call('create_claim', {
  content, domain, confidence: 'Moderate', semantic_tags: [],
  author: n.me, timestamp: nowMicros(), evidence_hashes: [], attestation_policy: null,
});
const countIn = async (n, d) => (await n.call('get_claims_by_domain', d)).length;

// A POLL THAT FAILS IS "NOT YET", AND IT USED TO BE THE END OF THE RUN. Every
// wait below is a loop with its own budget, and that budget is meant to be the
// authority on when to give up. It was not: `countIn` was called bare, so one
// throw propagated out of `main` and killed the harness with whatever the client
// said, inside a loop that had time left and would have polled again.
//
// THAT IS NOT HYPOTHETICAL — it is how this harness came out of `network.yml`.
// Its first CI run died on `Request timed out in 60000 ms: call_zome` while
// waiting for nodeD, having crossed nodeA to nodeB in 5.0s earlier in the same
// run; the second run, identical tree, reported `nodeD had it in 0.0s`. The
// bimodality is recorded in README §9 and is still unexplained. What is not in
// doubt is that a 60s client timeout inside a 120s budget both burned half the
// budget and then aborted anyway, which no poll should be able to do.
//
// So a failed poll counts as zero and the loop continues. It is NOT swallowed:
// each one prints a ::warning:: naming the node and the error, and the run ends
// with a count, because the next occurrence is evidence about the bimodality and
// throwing it away is how one failure in two runs stays a mystery. This does not
// widen the client timeout and does not claim to have fixed the underlying race
// — README §9 declined to act on an unconfirmed hypothesis, and so does this.
//
// ONLY THE POLLS. The one-shot `countIn` calls below — "nodeA sees its own
// claim", "nodeC never saw the claim", "nodeD still holds the claim it relayed"
// — are assertions, not waits. There is no budget behind them and nothing to
// retry into: a node that cannot answer at all is a real failure and must stay
// one. Do not route those through this helper.
const pollFailures = [];
const pollCount = async (n, d) => {
  try { return await countIn(n, d); }
  catch (e) {
    const msg = String(e?.message ?? e).split('\n')[0].slice(0, 200);
    pollFailures.push({ node: n.name, msg });
    log(`    ::warning::${n.name} did not answer a poll: ${msg}`);
    return 0;
  }
};

// Waits for `node` to acquire `domain`, and re-checks on EVERY poll that the
// author is still down. "nodeA was down when we started waiting" is a much
// weaker statement than "nodeA was down at the moment the entry arrived",
// and only the second one supports the claim this harness makes.
async function awaitVia(node, domain, label, authorNode, isolated) {
  const t0 = Date.now();
  let authorEverUp = false, isolatedEverSaw = false;
  while (Date.now() - t0 < CONVERGE_WINDOW_MS) {
    if (!nodeIsDown(authorNode)) authorEverUp = true;
    const got = await pollCount(node, domain);
    const iso = await pollCount(isolated, domain);
    if (iso > 0) isolatedEverSaw = true;
    log(`    [${label}] t+${((Date.now() - t0) / 1000).toFixed(0)}s  ${label}=${got}  nodeC=${iso}  ${authorNode}=${nodeIsDown(authorNode) ? 'down' : 'UP'}`);
    if (got > 0) return { ms: Date.now() - t0, authorEverUp, isolatedEverSaw };
    await sleep(POLL_MS);
  }
  return { ms: null, authorEverUp, isolatedEverSaw };
}

async function main() {
  log('Bringing up nodeD — the third member of the shared DHT ...');
  net('start-node', 'nodeD');

  log('\nConnecting ...');
  let A = await connectNode('A');
  const C = await connectNode('C');
  const D = await connectNode('D');
  let B = await connectNode('B');

  // ---- 1. Preconditions -------------------------------------------------
  log('\n--- 1. Preconditions: a THREE-member DHT, plus the isolated control ---');
  const sameAB = b64(A.dna) === b64(B.dna);
  const sameAD = b64(A.dna) === b64(D.dna);
  const isolatedOk = b64(A.dna) !== b64(C.dna);
  check('nodeA and nodeB are on the SAME DHT', sameAB);
  check('nodeD is on that SAME DHT — this is what makes it a courier and not a bystander', sameAD);
  check('nodeC is on a DIFFERENT DHT', isolatedOk);
  check('all four agent keys are distinct',
    new Set([b64(A.me), b64(B.me), b64(C.me), b64(D.me)]).size === 4);
  if (!sameAB || !sameAD || !isolatedOk) setupFail(['DNA hashes are not in the required arrangement.']);

  // ---- 2. Baseline ------------------------------------------------------
  log('\n--- 2. BASELINE — the network carries claims before anything is stopped ---');
  const D_BASE = `TgBase${Date.now()}`;
  await publish(A, D_BASE, 'baseline, all three up');
  const t0 = Date.now();
  let baseMs = null;
  while (Date.now() - t0 < ACQUIRE_WINDOW_MS) {
    if ((await pollCount(B, D_BASE)) > 0) { baseMs = Date.now() - t0; break; }
    await sleep(POLL_MS);
  }
  check('a claim crosses nodeA -> nodeB before anything is stopped', baseMs !== null);
  if (baseMs === null) setupFail(['The network is not carrying claims even with everything up.']);
  log(`    baseline crossed in ${(baseMs / 1000).toFixed(1)}s`);

  // THE SAME BASELINE FOR nodeD, BECAUSE SECTION 1 CANNOT SEE WHETHER IT HAS
  // ONE. "nodeD is on that SAME DHT" is a comparison of DNA hashes, which says
  // nodeD loaded the same DNA and NOTHING about whether it can reach a peer. A
  // nodeD that is in the DHT by that test and exchanges nothing with anybody
  // passes section 1, passes "nodeB is genuinely down", and then fails section 3
  // as "nodeD acquired nodeA's claim" — a result that reads as the protocol
  // failing to relay when the truth is that the courier was never on the road.
  //
  // WATCHED, 2026-09-12. On a freshly generated four-node network, nodeA and
  // nodeD exchanged nothing IN EITHER DIRECTION over 90s while each saw its own
  // writes and nodeA -> nodeB crossed in 0.3s. nodeD's conductor log gave the
  // reason, and it is not this repository's code:
  //
  //   kitsune2_gossip: could not respond to gossip message: K2Error(Other {
  //     ctx: "Accept message from wrong peer:
  //           http://127.0.0.1:8892/3963db9f... != http://127.0.0.1:8892/fafa946c..." })
  //
  // A peer record whose relay identity no longer matches that peer's current
  // one — a stale entry served by the bootstrap service — so the connection can
  // never be established and no wait length whatsoever helps. That is also the
  // best available account of the bimodality README §9 records for this harness:
  // "instant or never" is the shape of a coin-flip on whether the record served
  // was fresh, not of gossip under load, which would give values in between.
  //
  // This check does not fix that. It costs one extra wait on a claim already
  // published and turns a twenty-minute investigation into a named setup
  // failure, which is the whole difference between a harness that is red and a
  // harness that is informative.
  const tDBase = Date.now();
  let dBaseMs = null;
  while (Date.now() - tDBase < ACQUIRE_WINDOW_MS) {
    if ((await pollCount(D, D_BASE)) > 0) { dBaseMs = Date.now() - tDBase; break; }
    await sleep(POLL_MS);
  }
  check('the same claim reaches nodeD — it is a peer, not just a holder of the same DNA', dBaseMs !== null);
  if (dBaseMs === null) {
    setupFail([
      'nodeD loaded the same DNA as nodeA but exchanges nothing with it, so it cannot',
      'relay anything and section 3 below would blame the protocol for that.',
      `Look at ${process.env.EPI_NET_ROOT ?? '/tmp/epi-net'}/nodeD.log for`,
      '"Accept message from wrong peer" — a stale peer record from the bootstrap',
      'service, whose relay identity no longer matches the peer it names. A full',
      'scripts/network.sh clean && scripts/network.sh start is the only known reset.',
    ]);
  }
  log(`    nodeD is genuinely peered — the same claim reached it in ${(dBaseMs / 1000).toFixed(1)}s`);

  // ---- 3. nodeB away; nodeA writes; nodeD must receive it ---------------
  log('\n--- 3. nodeB STOPPED, then nodeA writes ---');
  net('stop-node', 'nodeB');
  check('nodeB is genuinely down', nodeIsDown('nodeB'));

  const D_A = `TgA${Date.now()}`;
  const CONTENT_A = 'Written by nodeA while nodeB was not running.';
  await publish(A, D_A, CONTENT_A);
  check('nodeA sees its own claim', (await countIn(A, D_A)) === 1);

  log('    waiting for nodeD to pick it up — the courier must hold the parcel');
  const tD = Date.now();
  let dMs = null;
  while (Date.now() - tD < ACQUIRE_WINDOW_MS) {
    if ((await pollCount(D, D_A)) > 0) { dMs = Date.now() - tD; break; }
    await sleep(POLL_MS);
  }
  check('nodeD acquired nodeA\'s claim while nodeB was down', dMs !== null);
  if (dMs === null) setupFail(['nodeD never received the claim, so it cannot relay it. Nothing below would mean anything.']);
  log(`    nodeD had it in ${(dMs / 1000).toFixed(1)}s`);

  // ---- 4. nodeA away BEFORE nodeB returns ------------------------------
  //
  // Order matters absolutely. If nodeB came back first, nodeA would be up
  // alongside it and could hand over the claim directly — which is the very
  // thing this harness exists to rule out.
  log('\n--- 4. nodeA STOPPED, and only then nodeB restarted ---');
  net('stop-node', 'nodeA');
  check('nodeA is down BEFORE nodeB comes back', nodeIsDown('nodeA'));
  net('start-node', 'nodeB');
  B = await connectNode('B');
  check('nodeB is up again', !nodeIsDown('nodeB'));
  check('nodeA is STILL down now that nodeB is up — they are never up together', nodeIsDown('nodeA'));
  // NOT A CHECK, AND IT USED TO BE ONE. This read used to assert that nodeB
  // returns without the claim, as a way of establishing divergence. It
  // asserts a race, not a property: nodeB can sync from nodeD during
  // connectNode's own handshake — authorizeSigningCredentials alone retries
  // for up to 30s — and when it does, this read finds the claim already
  // there. That is the mechanism under test SUCCEEDING FASTER, not the
  // premise failing.
  //
  // It went red for exactly that reason on a full-suite run, where
  // real-gossip and partition-rejoin had already warmed the same network so
  // peers were discovered and gossip was hot; nodeB acquired in 0.0s. Every
  // isolated run had measured 5.0s or 55.3s and won the race by luck.
  //
  // Divergence does not need this read anyway, and never did. It is
  // guaranteed by construction and by a check that is already strict: the
  // domain is minted fresh at the top of this run, and phase 3 asserts nodeB
  // is genuinely down BEFORE the claim is authored. A node that was not
  // running when an entry was written cannot have been sent it. What proves
  // the result is nodeA being down for the whole of the wait below, which is
  // checked on every poll.
  //
  // This is the inverse of the defect partition-rejoin.mjs records in its own
  // negative evidence — that one read too early and passed for the wrong
  // reason. This one read too late and failed for the wrong reason. Both are
  // the same underlying mistake: a check whose label claims a property when
  // its assertion tests a timing.
  const alreadySynced = (await countIn(B, D_A)) > 0;
  log(alreadySynced
    ? '    nodeB had already synced from nodeD during the handshake — the fast path'
    : '    nodeB does not hold the claim yet — the wait below will measure it arriving');

  // ---- 5. The question --------------------------------------------------
  log('\n--- 5. Does nodeB acquire it, with its author down and only nodeD holding it? ---');
  const conv = await awaitVia(B, D_A, 'nodeB', 'nodeA', C);
  check('nodeB acquired the claim', conv.ms !== null);
  if (conv.ms !== null) {
    log(`    nodeB acquired it in ${(conv.ms / 1000).toFixed(1)}s`
      + (alreadySynced ? ' (already held at reconnect — see the note in phase 4)' : ''));
  }
  check('CONTROL: nodeA never came back up at any point during that wait — so nodeD is the only possible source',
    !conv.authorEverUp);

  const bHasA = await B.call('get_claims_by_domain', D_A);
  check('what nodeB acquired is nodeA\'s entry, with nodeA\'s content and nodeA as author',
    bHasA.length === 1 && claimEntry(bHasA[0]).content === CONTENT_A && b64(claimEntry(bHasA[0]).author) === b64(A.me));

  // ---- 6. Controls ------------------------------------------------------
  log('\n--- 6. CONTROL: the isolated node saw none of it ---');
  check('nodeC never saw the claim', (await countIn(C, D_A)) === 0);
  check('nodeC saw nothing at any point during the wait', !conv.isolatedEverSaw);
  check('nodeC is alive and answering, not merely silent',
    Array.isArray(await C.call('get_claims_by_domain', 'AnyDomainAtAll')));
  check('nodeD still holds the claim it relayed', (await countIn(D, D_A)) === 1);

  // ---- 7. Put the network back the way it was --------------------------
  log('\n--- 7. Restoring the network ---');
  net('start-node', 'nodeA');
  net('stop-node', 'nodeD');
  check('nodeD is stopped again — the default network is three nodes, as every other harness expects',
    nodeIsDown('nodeD'));
  check('nodeA is back up', !nodeIsDown('nodeA'));

  log('');
  // Said once, at the end, where it survives the scrollback of a long wait. A
  // run that passed with polls missing is the interesting case for the
  // bimodality in README §9, and is exactly the run whose warnings are easiest
  // to lose among six minutes of poll lines.
  if (pollFailures.length > 0) {
    const byNode = {};
    for (const f of pollFailures) byNode[f.node] = (byNode[f.node] ?? 0) + 1;
    log(`::warning::${pollFailures.length} poll(s) went unanswered during this run `
      + `(${Object.entries(byNode).map(([n, c]) => `${n}: ${c}`).join(', ')}). `
      + `Each counted as zero and the wait continued. First: ${pollFailures[0].msg}`);
    log('');
  }
  if (failures === 0) {
    log('ALL CHECKS PASSED — an entry reached a node from a peer that did not');
    log('author it. nodeB acquired nodeA\'s claim while nodeA was down for the');
    log(`whole of that wait, leaving nodeD as the only live holder. ${(conv.ms / 1000).toFixed(1)}s.`);
  } else {
    log(`${failures} CHECK(S) FAILED.`);
  }
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('\nHARNESS ERROR:', e);
  // Best effort: leave the network as the other harnesses expect to find it.
  try { execFileSync('bash', [`${REPO_ROOT}/scripts/network.sh`, 'start-node', 'nodeA'], { stdio: 'ignore' }); } catch { /* already up */ }
  try { execFileSync('bash', [`${REPO_ROOT}/scripts/network.sh`, 'stop-node', 'nodeD'], { stdio: 'ignore' }); } catch { /* already down */ }
  process.exit(1);
});
