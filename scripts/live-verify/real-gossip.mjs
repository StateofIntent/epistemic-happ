#!/usr/bin/env node
// ============================================================================
// scripts/live-verify/real-gossip.mjs — DOES AN ENTRY WRITTEN ON ONE NODE
// REACH A DIFFERENT NODE OVER A REAL NETWORK?
//
// WHY THIS EXISTS. README.md has said since Phase 1 that "gossip protocol
// is wave propagation — information ripples through the network
// organically," and §2.5's binding section says "DHT gossip propagates the
// binding." Until this harness, nothing in this repository had ever run
// two conductors that could reach each other, so those sentences described
// a property of Holochain that this project had taken on faith.
//
// The gap was not an oversight so much as a blind spot with a specific
// shape. `scripts/sandbox.sh` starts one conductor, and `hc sandbox`
// produces no networking by default — `transport_pool: []`,
// `bootstrap_service: null` in the conductor config. Every multi-agent
// harness here then installs its extra agents ON that conductor, so two
// "agents" share one local DHT store: an entry written by agent 1 is
// visible to agent 2 immediately, because it never went anywhere. That is
// the correct setup for the questions those harnesses ask, and it makes
// this one unaskable. `federation/` does run two real conductors, but
// deliberately ones sharing no network at all.
//
// So the arrangement this needs did not exist and had to be built:
// `scripts/network.sh`, which runs a local bootstrap server and a tx5
// iroh relay (one combined kitsune2-bootstrap-srv) and brings up three
// conductors against it.
//
// WHAT IS VERIFIED, against three live conductors in three separate OS
// processes with three distinct agent keys and three separate data
// directories:
//
//   1. PRECONDITIONS. nodeA and nodeB report the same DNA hash — same
//      DHT. nodeC reports a different one. All three agent keys differ.
//      If any of this is false the rest of the run means nothing, so it
//      is checked rather than assumed.
//   2. NOTHING IS THERE FIRST. Each run uses a fresh domain string, and
//      nodeB is read for it BEFORE nodeA publishes. This is what rules
//      out "it was already there" without depending on how fast gossip
//      happens to be.
//   3. THE FINDING. nodeA publishes a Claim; nodeB's `get_claims_by_domain`
//      returns it, having received it over the iroh QUIC transport.
//   4. IT IS THE SAME ENTRY. The claim nodeB holds is compared field by
//      field with what nodeA wrote, and its author is nodeA's key.
//   5. TWO INDEPENDENT READ PATHS. `get_claims_by_agent` on nodeB finds
//      it too, so the result is not a quirk of one index.
//   6. THE CONTROL THAT MAKES 3 EVIDENCE. nodeC — same .happ, same code,
//      same bootstrap and signal servers, same machine, differing only in
//      network seed — never sees it, and is watched for a margin beyond
//      the moment nodeB succeeded rather than glanced at once.
//   7. NOT A FIREHOSE. A domain nobody ever published to reads empty on
//      nodeB, so `get_claims_by_domain` is not simply returning
//      everything.
//   8. BOTH DIRECTIONS. nodeB publishes and nodeA receives, so gossip is
//      not one-way.
//   9. THE CHAIN-LOCAL FINDING, TESTED WHERE IT ACTUALLY MATTERS. See the
//      long note above check 9 below — this is the check that could not
//      previously be run at all.
//
// Prereqs: scripts/network.sh clean && scripts/network.sh start, and a
// packed .happ at the repo root (scripts/pack-webhapp.sh).
//
// This harness does NOT use scripts/sandbox.sh's conductor and does not
// care whether it is running; the ports are deliberately disjoint.
//
// UNLIKE THE REST OF THIS DIRECTORY, it is safe to re-run without
// cleaning first. Every check is scoped to a domain string minted from
// Date.now() at the top of the run, and the constitution check matches on
// its own domain rather than on a count, so entries left by earlier runs
// cannot satisfy or break anything here. It also spends no SWO friction
// budget — `create_claim` and `publish_constitution` are not rate-limited;
// `create_critique` and `create_synaptic_link` are, and this file calls
// neither. Confirmed by re-running green on conductors that had already
// carried two previous runs. Clean anyway if you want the logs readable.
// ============================================================================
// ---------------------------------------------------------------------------
// NEGATIVE EVIDENCE — this harness has been watched failing.
//
// This directory's rule is that a harness which has only ever been green
// has not been shown to test anything.
//
//   Regression injected: nodeB's entry in NODES pointed at nodeC's ports,
//   so the "receiver" was a conductor on a different DHT — the exact
//   false-positive this harness exists to exclude.
//   Result: three checks red at once (same-DHT, distinct agent keys,
//   distinct admin ports) and the run aborted before publishing anything,
//   printing all three DNA hashes rather than producing a result that
//   looked like an answer. Exit 1.
//
//   Regression injected: the nodeB and nodeC entries in NODES were
//   SWAPPED and the precondition abort bypassed, so the "receiver" sat on
//   the isolated DHT while the "isolated control" was a genuine peer.
//   This is the more valuable of the two, because it is the only way to
//   see check 6 fail: a control asserting that something never happens is
//   exactly the check that can pass forever while testing nothing.
//   Result: 14 checks red, exit 1 — the gossip check after the full 120s
//   window, all five of check 4's same-entry checks, the second index,
//   both directions,
//   and BOTH nodeC control checks, which is what was being tested.
//
//   And one thing that run showed which no green run could have. Check
//   9's own assertion — "nodeB does NOT see nodeA's constitution" —
//   PASSED during that injection, because the node in the nodeB slot was
//   on a different DHT and could not have seen anything at all. It was
//   the PAIRED CONTROL immediately after it that went red and exposed
//   the pass as empty. That is precisely the job the paired control was
//   added to do, confirmed rather than assumed: without it, check 9
//   would report a green that means nothing whenever the network is
//   broken in the direction that matters most.
//
//   Restored afterwards and re-run: all 25 checks green again, on the
//   same conductors, without cleaning them.
//
// Re-check the same way if you change what this file asserts: inject,
// watch it go red, restore, watch it go green.
// ---------------------------------------------------------------------------

import { AdminWebsocket, AppWebsocket, CellType } from '@holochain/client';
import { decode } from '@msgpack/msgpack';

// Ports and app ids are scripts/network.sh's, and must stay in step with it.
const NODES = {
  A: { admin: 8899, app: 8898, appId: 'epistemic-net-a' },
  B: { admin: 8897, app: 8896, appId: 'epistemic-net-b' },
  C: { admin: 8895, app: 8894, appId: 'epistemic-net-c' },
};

// Gossip between two nodes on a local signal server has been observed
// landing in ~2s. The window is generous because a timeout here should
// mean "it never arrived", not "the machine was busy" — a flaky red on a
// harness whose whole job is to distinguish arrival from non-arrival
// would be worse than useless.
const GOSSIP_WINDOW_MS = 120_000;
const POLL_MS = 2_000;
// How much longer the isolated node is watched AFTER nodeB succeeds. The
// control's claim is "it never arrives", and a single glance at the
// instant nodeB happens to succeed is not that claim.
const CONTROL_MARGIN_MS = 20_000;

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
  log('  and make sure the .happ is current: scripts/pack-webhapp.sh');
  process.exit(1);
}

async function connectNode(name, { admin: adminPort, app: appPort, appId }) {
  let admin;
  try {
    admin = await AdminWebsocket.connect({
      url: new URL(`ws://localhost:${adminPort}`),
      wsClientOptions: { origin: 'live-verify' },
    });
  } catch (e) {
    setupFail([
      `node${name}'s admin port ${adminPort} did not answer (${e.message}).`,
      'All three conductors must be up — this harness needs the isolated',
      'control node as much as the two that talk to each other.',
    ]);
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
      // CellInfo became a discriminated union in @holochain/client
      // 0.21 ({ type, value }); it used to be keyed by cell type. The
      // old `CellType.Provisioned in cell` test matches nothing against
      // the new shape, silently yielding no cell ids at all.
      if (cell?.type === CellType.Provisioned || cell?.type === CellType.Cloned) {
        cellIds.push(cell.value.cell_id);
      }
    }
  }
  if (cellIds.length === 0) setupFail([`App "${appId}" on node${name} has no provisioned cells.`]);

  // AUTHORIZING IS RETRIED, because a freshly resumed conductor reports
  // itself ready before it can actually grant a capability. `hc sandbox
  // run` on an existing sandbox brings the app back DISABLED;
  // scripts/network.sh re-enables it, but EnableApp is asynchronous and
  // the app's own status flips to "running" while the cell is still
  // coming up. A client connecting in that window fails here with
  // `CellDisabled(CellId(...))` — an error naming a cell id and nothing
  // else, raised from inside the client's signing-credential setup
  // rather than from anything this file wrote.
  //
  // Waiting on the app's reported status is NOT sufficient and was tried:
  // network.sh polls for `status: Running` before declaring a node ready,
  // that poll passes immediately, and the failure was unchanged. The only
  // reliable readiness signal is the operation itself succeeding, so it
  // is retried rather than predicted.
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
      'The conductor is up but its app never finished enabling. Try:',
      `  hc client call --port ${adminPort} list-apps`,
      'and if it is not Running, scripts/network.sh clean && scripts/network.sh start.',
    ]);
  }
  const call = (fn, payload) =>
    app.callZome({ role_name: 'epistemic', zome_name: 'epistemic_coordinator', fn_name: fn, payload });
  return { name, dna: cellIds[0][0], me: cellIds[0][1], call, adminPort, appPort };
}

const claimEntry = (record) => decode(record.entry.Present.entry);

async function publishClaim(node, domain, content) {
  await node.call('create_claim', {
    content,
    domain,
    confidence: 'Moderate',
    semantic_tags: [],
    author: node.me,
    timestamp: nowMicros(),
    evidence_hashes: [],
    attestation_policy: null,
  });
}

// Polls `receiver` until the claim shows up, while checking on every
// iteration that `isolated` still has not seen it. Returns how long
// arrival took, or null if the window closed first.
async function awaitGossip(receiver, isolated, domain) {
  const t0 = Date.now();
  let isolatedEverSaw = false;
  while (Date.now() - t0 < GOSSIP_WINDOW_MS) {
    const got = (await receiver.call('get_claims_by_domain', domain)).length;
    const iso = (await isolated.call('get_claims_by_domain', domain)).length;
    if (iso > 0) isolatedEverSaw = true;
    const t = ((Date.now() - t0) / 1000).toFixed(0);
    log(`    t+${t}s  node${receiver.name}=${got}  node${isolated.name}=${iso}`);
    if (got > 0) return { ms: Date.now() - t0, isolatedEverSaw };
    await sleep(POLL_MS);
  }
  return { ms: null, isolatedEverSaw };
}

async function main() {
  log('Connecting to three conductors ...');
  const A = await connectNode('A', NODES.A);
  const B = await connectNode('B', NODES.B);
  const C = await connectNode('C', NODES.C);
  log(`  nodeA  dna ${b64(A.dna).slice(0, 14)}…  agent ${b64(A.me).slice(0, 12)}…  admin :${A.adminPort}`);
  log(`  nodeB  dna ${b64(B.dna).slice(0, 14)}…  agent ${b64(B.me).slice(0, 12)}…  admin :${B.adminPort}`);
  log(`  nodeC  dna ${b64(C.dna).slice(0, 14)}…  agent ${b64(C.me).slice(0, 12)}…  admin :${C.adminPort}`);

  // ---- 1. Preconditions -------------------------------------------------
  //
  // These are checks, not assumptions, because every one of them is a way
  // this harness could report a comforting result that means nothing. If
  // A and B were not on the same DHT the gossip check could never pass; if
  // C WERE on it, the control could never fail; and if any two "nodes"
  // shared an agent key we would be watching one identity talk to itself.
  log('\n--- 1. Preconditions: three real, distinct nodes ---');
  const sameDht = b64(A.dna) === b64(B.dna);
  const isolated = b64(A.dna) !== b64(C.dna);
  check('nodeA and nodeB are on the SAME DHT (identical DNA hash)', sameDht);
  check('nodeC is on a DIFFERENT DHT (different DNA hash)', isolated);
  check('all three agent keys are distinct', new Set([b64(A.me), b64(B.me), b64(C.me)]).size === 3);
  check('all three admin ports are distinct', new Set([A.adminPort, B.adminPort, C.adminPort]).size === 3);

  if (!sameDht || !isolated) {
    setupFail([
      'The DNA hashes are not in the arrangement this harness requires.',
      `nodeA ${b64(A.dna)}`,
      `nodeB ${b64(B.dna)}`,
      `nodeC ${b64(C.dna)}`,
      'nodeA and nodeB must match (same network seed); nodeC must not.',
      'Nothing below this point could be interpreted, so the run stops here',
      'rather than producing a result that looks like an answer.',
    ]);
  }

  // ---- 2. Nothing is there first ---------------------------------------
  const DOMAIN = `Gossip${Date.now()}`;
  const CONTENT = `Written on nodeA at ${new Date().toISOString()}, and nowhere else.`;
  log(`\n--- 2. Before anything is published, domain ${DOMAIN} is empty everywhere ---`);
  check('nodeB sees 0 claims in this run\'s domain before nodeA publishes',
    (await B.call('get_claims_by_domain', DOMAIN)).length === 0);
  check('nodeC sees 0 claims in this run\'s domain before nodeA publishes',
    (await C.call('get_claims_by_domain', DOMAIN)).length === 0);

  // ---- 3. The finding ---------------------------------------------------
  log('\n--- 3. nodeA publishes; does nodeB receive it over the network? ---');
  await publishClaim(A, DOMAIN, CONTENT);
  const ownRead = await A.call('get_claims_by_domain', DOMAIN);
  check('nodeA sees its own claim (control: the write itself worked)', ownRead.length === 1);
  if (ownRead.length !== 1) {
    setupFail([
      'nodeA cannot see the claim it just wrote, so there is nothing to gossip.',
      'This is a failure of the zome or of a stale build, not of networking:',
      'hc dna pack packages the wasm on disk rather than compiling it, so a',
      'pack without a build verifies the previous version. Rebuild with',
      'scripts/pack-webhapp.sh, then scripts/network.sh clean && start.',
    ]);
  }

  const { ms: arrivedMs, isolatedEverSaw } = await awaitGossip(B, C, DOMAIN);
  check(`nodeB receives nodeA's claim over the network (within ${GOSSIP_WINDOW_MS / 1000}s)`,
    arrivedMs !== null);
  if (arrivedMs !== null) log(`    arrived after ${(arrivedMs / 1000).toFixed(1)}s`);

  // ---- 4. It is the same entry -----------------------------------------
  //
  // "A record came back" and "the record nodeA wrote came back" are not
  // the same claim, and only the second one is interesting.
  log('\n--- 4. What arrived is the entry nodeA wrote ---');
  const received = await B.call('get_claims_by_domain', DOMAIN);
  if (received.length === 1) {
    const mine = claimEntry(ownRead[0]);
    const theirs = claimEntry(received[0]);
    check('the content nodeB holds is byte-identical to what nodeA wrote', theirs.content === CONTENT);
    check('the content matches nodeA\'s own read of it', theirs.content === mine.content);
    check('the domain matches', theirs.domain === DOMAIN);
    check('nodeB records the author as nodeA\'s agent key, not its own',
      b64(theirs.author) === b64(A.me) && b64(theirs.author) !== b64(B.me));
    check('the action hash nodeB holds is the one nodeA authored',
      b64(received[0].signed_action.hashed.hash) === b64(ownRead[0].signed_action.hashed.hash));
  } else {
    check('the content nodeB holds is byte-identical to what nodeA wrote', false);
    check('the content matches nodeA\'s own read of it', false);
    check('the domain matches', false);
    check('nodeB records the author as nodeA\'s agent key, not its own', false);
    check('the action hash nodeB holds is the one nodeA authored', false);
  }

  // ---- 5. A second, independent read path ------------------------------
  log('\n--- 5. A second index finds it too ---');
  const byAgent = await B.call('get_claims_by_agent', A.me);
  check('nodeB\'s get_claims_by_agent(nodeA) finds the claim',
    byAgent.some((r) => claimEntry(r).content === CONTENT));

  // ---- 6. The control that makes 3 evidence ----------------------------
  //
  // nodeC is the whole reason check 3 is evidence rather than an anecdote.
  // It is not a differently-configured machine: same .happ, same wasm,
  // same bootstrap server, same signal server, same host, same moment.
  // The one difference is its network seed, hence its DNA hash, hence its
  // DHT. It is watched for a margin past nodeB's success because "never
  // arrives" is a statement about a stretch of time, not an instant.
  log(`\n--- 6. CONTROL: the isolated node never sees it (watching ${CONTROL_MARGIN_MS / 1000}s past nodeB's success) ---`);
  const marginEnd = Date.now() + CONTROL_MARGIN_MS;
  let isolatedSawLate = false;
  while (Date.now() < marginEnd) {
    if ((await C.call('get_claims_by_domain', DOMAIN)).length > 0) { isolatedSawLate = true; break; }
    await sleep(POLL_MS);
  }
  check('nodeC never saw the claim while nodeB was receiving it', !isolatedEverSaw);
  check(`nodeC still has not seen it ${CONTROL_MARGIN_MS / 1000}s later`, !isolatedSawLate);
  check('nodeC can still answer at all (control: it is alive, not just silent)',
    Array.isArray(await C.call('get_claims_by_domain', 'AnyDomainAtAll')));

  // ---- 7. Not a firehose ------------------------------------------------
  log('\n--- 7. CONTROL: an unpublished domain is empty on nodeB ---');
  check('nodeB returns 0 for a domain nobody ever published to',
    (await B.call('get_claims_by_domain', `NeverPublished${Date.now()}`)).length === 0);

  // ---- 8. Both directions ----------------------------------------------
  //
  // One-way propagation would satisfy every check above while being a
  // broken network, so the reverse direction is exercised on its own
  // fresh domain rather than inferred from symmetry.
  log('\n--- 8. The reverse direction: nodeB publishes, nodeA receives ---');
  const REVERSE_DOMAIN = `GossipReverse${Date.now()}`;
  const REVERSE_CONTENT = `Written on nodeB at ${new Date().toISOString()}.`;
  check('nodeA sees 0 in the reverse domain before nodeB publishes',
    (await A.call('get_claims_by_domain', REVERSE_DOMAIN)).length === 0);
  await publishClaim(B, REVERSE_DOMAIN, REVERSE_CONTENT);
  const { ms: reverseMs } = await awaitGossip(A, C, REVERSE_DOMAIN);
  check('nodeA receives nodeB\'s claim over the network', reverseMs !== null);
  if (reverseMs !== null) log(`    arrived after ${(reverseMs / 1000).toFixed(1)}s`);
  const reverseOnA = await A.call('get_claims_by_domain', REVERSE_DOMAIN);
  check('nodeA records the reverse claim\'s author as nodeB',
    reverseOnA.length === 1 && b64(claimEntry(reverseOnA[0]).author) === b64(B.me));

  // ---- 9. The chain-local finding, on a real network -------------------
  //
  // read-scope.mjs established that get_all_constitutions reads the
  // CALLING AGENT'S OWN SOURCE CHAIN rather than the DHT, and it proved
  // that with two agents on one conductor. That setup left one objection
  // permanently open: with both agents on the same node there is no
  // network, so "agent 2 cannot see it" was never fully separable from
  // "there is nothing here to see it with." read-scope answered that by
  // pairing each chain-local read with a link-based read of the same
  // entry at the same moment — a good answer, and an indirect one.
  //
  // Here the objection can be retired directly. Gossip has already been
  // demonstrated between these exact two nodes, moments ago, in both
  // directions. So when nodeA publishes a Constitution and nodeB's
  // get_all_constitutions returns nothing, "it has not gossiped yet" is
  // not available as an explanation — and the paired positive is not a
  // different read of the same entry, it is the network itself.
  //
  // This is the sharpest version of the caveat README.md §9 records: on a
  // real network, a practitioner browsing with a chain-local read sees
  // only their own work. That sentence has been true and untested. It is
  // now tested.
  log('\n--- 9. Chain-local reads stay chain-local ACROSS a working network ---');
  const CONST_DOMAIN = `GossipConstA${Date.now()}`;
  const CONST_DOMAIN_B = `GossipConstB${Date.now()}`;
  const publishConstitution = (node, domain) => node.call('publish_constitution', {
    agent: node.me,
    promises: [{ action: 'distinguish_observation_from_inference', domain, modality: 'Methodological' }],
    conditions: [],
    published_at: nowMicros(),
    expires_at: null,
  });
  await publishConstitution(A, CONST_DOMAIN);
  // nodeB publishes one of its own, so that its get_all_constitutions has
  // something it SHOULD find. Without this, "nodeB does not see nodeA's
  // constitution" is satisfied just as well by a read that is broken and
  // returns nothing to anyone — which is the vacuous pass this project's
  // own convention exists to rule out.
  await publishConstitution(B, CONST_DOMAIN_B);
  check('nodeA sees its own constitution (control: the write worked)',
    (await A.call('get_all_constitutions')).length >= 1);

  // Give it at least as long as gossip demonstrably needed for the claim,
  // so a zero here is a property of the read and not of impatience.
  const constWait = Math.max(arrivedMs ?? 0, reverseMs ?? 0, 10_000);
  log(`    waiting ${(constWait / 1000).toFixed(0)}s — at least as long as gossip took above ...`);
  await sleep(constWait);
  const constOnA = await A.call('get_all_constitutions');
  const constSeenByB = await B.call('get_all_constitutions');
  const constDomains = (records) => records.flatMap((r) =>
    (decode(r.entry.Present.entry).promises ?? []).map((p) => p.domain));
  const bDomains = constDomains(constSeenByB);
  log(`    nodeA get_all_constitutions -> ${constOnA.length}   nodeB -> ${constSeenByB.length}`);
  check('CONTROL: nodeB DOES see its own constitution, so the read is not simply broken',
    bDomains.includes(CONST_DOMAIN_B));
  check('nodeB does NOT see nodeA\'s constitution, on a network proven to carry claims',
    !bDomains.includes(CONST_DOMAIN));

  // The pairing. Without this the check above is satisfied by a network
  // that simply stopped working between check 8 and check 9.
  const PAIR_DOMAIN = `GossipPair${Date.now()}`;
  await publishClaim(A, PAIR_DOMAIN, 'Published alongside the constitution.');
  const { ms: pairMs } = await awaitGossip(B, C, PAIR_DOMAIN);
  check('PAIRED CONTROL: a claim published at the same moment DOES reach nodeB',
    pairMs !== null);

  // ---- Result -----------------------------------------------------------
  log('');
  if (failures === 0) {
    log('ALL CHECKS PASSED — an entry written on one conductor reached a');
    log('genuinely different conductor over a real iroh QUIC network, an');
    log('isolated conductor never saw it, and chain-local reads stayed');
    log('chain-local across that same working network.');
  } else {
    log(`${failures} CHECK(S) FAILED.`);
  }
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('\nHARNESS ERROR:', e);
  process.exit(1);
});
