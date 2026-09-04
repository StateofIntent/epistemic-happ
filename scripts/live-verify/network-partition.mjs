#!/usr/bin/env node
// ============================================================================
// scripts/live-verify/network-partition.mjs — BOTH SIDES UP, NEITHER ABLE TO
// REACH THE OTHER, AND BOTH STILL WRITING.
//
// WHY THIS EXISTS. partition-rejoin.mjs partitions by stopping a conductor.
// That is a real failure and it is the easy one — the process exits, its
// ports close, and the peer gets an immediate unambiguous refusal. It also
// cannot reach the shape that actually matters: a stopped process cannot
// keep accepting writes, so a stop-based test can never have BOTH sides
// diverging at once under live load. The README named that as the next gap
// in those words: "the harder and more realistic shape ... where both sides
// keep running but cannot see each other."
//
// This harness produces exactly that, by cutting packets rather than
// processes. Neither conductor is signalled, restarted, or reconfigured;
// both keep serving zome calls throughout; both write while partitioned;
// and their process ids are checked to be unchanged across the whole run,
// so "this is not secretly a restart" is asserted rather than asserted-by-
// comment.
//
// WHAT IS CUT, AND HOW THAT WAS ESTABLISHED. The obvious guess is that
// peers talk over WebRTC/UDP, so dropping UDP should partition them. That
// was tried first and it did not work: claims crossed with all UDP dropped
// in both directions. The sockets say why — each conductor holds exactly
// two TCP connections, to the bootstrap server and to the signal server,
// with NO direct conductor-to-conductor connection and no UDP socket at
// all. Peer traffic is relayed through the signal server, so the data path
// is TCP to the signal port, and cutting that is a genuine data-plane
// partition.
//
// That is a fact about this setup and not a law, so check 2 below ASSERTS
// the socket topology at runtime. If tx5 ever establishes direct peer
// connections, this harness stops silently measuring the wrong thing and
// says so instead.
//
// THE CONTROL THAT MAKES THE CUT MEAN SOMETHING. Severing every TCP path
// would partition the peers and prove very little — it would also be
// indistinguishable from the machine's networking failing. So the cut is
// aimed at ONE port, and the bootstrap server on another port is probed
// throughout and must stay reachable. Alive-and-reachable-but-for-this-one-
// path is the claim; a general outage is the thing being ruled out.
//
// MUST BE RUN INSIDE scripts/netns.sh, which supplies a throwaway network
// AND PID namespace and starts the three-node network inside it. This file
// installs iptables DROP rules, and it refuses to run anywhere they could
// outlive it or affect anything the user cares about — see the namespace
// check in main(), which is the first thing that happens, before any
// connection is opened. The PID half of that namespace is netns.sh's job
// rather than this file's, and it is not decoration either: without it the
// conductors outlive the namespace that made them.
//
//     scripts/netns.sh run 'node scripts/live-verify/network-partition.mjs'
//
// Takes about eight minutes, most of it waiting out a real gossip backoff.
// ============================================================================
// ---------------------------------------------------------------------------
// NEGATIVE EVIDENCE — this harness has been watched failing, and its FIRST
// RUN found a real defect in itself rather than confirming it was sound.
//
//   Found by check 2 on its very first run, before any injection: it
//   reported SIX direct conductor-to-conductor connections, which would
//   have meant the premise of this whole file — that peer traffic is
//   relayed, so cutting the relay cuts the data path — was wrong. It was
//   not wrong; the count was. Those six were this harness's OWN admin and
//   app websockets: every client connection it opens is a connection TO a
//   conductor, so `ss` attributes the conductor's end to holochain and it
//   reads exactly like a peer link unless the ports are inspected. Had
//   the check been written loosely enough to pass, that miscount would
//   have been quietly banked as a fact about Holochain's transport. Fixed
//   by parsing both ports and excluding this harness's own; the excluded
//   count is now PRINTED rather than merely subtracted, so the correction
//   stays visible on every run instead of becoming invisible once green.
//
//   Injection: cut the bootstrap port as well as the signal port, making
//   the partition a broad outage rather than one severed path.
//   Result: SIX checks red. The intended one first — the CONTROL asserting
//   bootstrap stays reachable, which is the entire basis for calling this
//   one severed path rather than "the machine's networking broke." Then
//   five more that were not predicted and are the more interesting half:
//   with discovery cut too, the peers never re-found each other, so both
//   convergence checks, both content-and-authorship checks, and the
//   post-heal crossing all went red as well. The harness does not merely
//   notice a broad outage; it reports that nothing healed, which is what
//   was actually true. 20 passed, 6 failed, exit 1.
//
//   Injection: remove the cut entirely — the iptables rules are never
//   installed, so nothing is partitioned at any point.
//   Result: exactly two red, and they are the two that matter. "The signal
//   relay is now unreachable" went red, as it must. And "neither side saw
//   the other while the link was cut" ALSO went red — which is the whole
//   reason the dwell in check 6 is derived from this run's own baseline
//   (max of 60s and ten times the measured crossing time) instead of
//   guessed. partition-rejoin.mjs records the failure mode being guarded
//   against here: a check whose label claims more than its assertion
//   tests, asserting an absence sooner than the thing would have arrived.
//   A too-short dwell would have stayed green through a total absence of
//   any partition. This one does not. 24 passed, 2 failed, exit 1.
//
//   Injection: run the harness directly, on the real machine, outside any
//   namespace. Result: refused at the first thing main() does, exit 1
//   before opening a single connection, printing uid_map "0 0 4294967295"
//   and interfaces ["lo","eno1","wlp7s0"]. No iptables rule was installed.
//
//   Injection: run it inside `unshare --map-root-user` WITHOUT --net — a
//   user namespace that is not a network namespace. This is the case that
//   makes the two-signal check worth having: the uid_map signal says
//   "throwaway, go ahead" (uid=0, in a user namespace: true) and is
//   WRONG, because eno1 and wlp7s0 are still right there. Result: still
//   refused, on the loopback-only signal alone. Neither signal is
//   decorative; each one catches a case the other passes.
//
//   Restored and re-run: 26 checks green. Both directions converged at
//   301.6s and 301.5s — the same gossip round, and the same figure a
//   previous clean run produced, so the number reproduces rather than
//   being one sample.
//
//   ONE RESULT WAS THROWN AWAY, and the reason is recorded in
//   scripts/netns.sh. The first attempt at the bootstrap-cut injection
//   above reported that all four DROP rules had no effect at all — both
//   ports reachable, nothing partitioned. That was not true of the rules;
//   it was true of the environment. Several namespace runs had been
//   started concurrently, and because a network namespace is not a mount
//   namespace they shared /tmp/epi-ns, which each one deletes on startup.
//   netns.sh now takes a lock and refuses to overlap. The lesson is not
//   about iptables: an impossible-looking result from a harness is a
//   claim about the harness's environment before it is a claim about the
//   system under test, and it is worth reproducing in isolation before it
//   is worth explaining.
// ---------------------------------------------------------------------------

import { AdminWebsocket, AppWebsocket, CellType } from '@holochain/client';
import { decode } from '@msgpack/msgpack';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import net from 'node:net';

const NODES = {
  A: { node: 'nodeA', admin: 8899, app: 8898, appId: 'epistemic-net-a' },
  B: { node: 'nodeB', admin: 8897, app: 8896, appId: 'epistemic-net-b' },
  C: { node: 'nodeC', admin: 8895, app: 8894, appId: 'epistemic-net-c' },
};

const SIGNAL_PORT = 8892;      // the peer data path, and what gets cut
const BOOTSTRAP_PORT = 8893;   // the control: must stay reachable throughout
const NET_ROOT = process.env.EPI_NET_ROOT || '/tmp/epi-ns';

// Healing is dominated by the same gossip backoff partition-rejoin.mjs
// measured (gossip_peer_on_error_next_gossip_delay_ms: 300000), so the
// window is sized from that constant rather than guessed.
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
  process.exit(1);
}

const tcpReachable = (port, timeout = 2000) => new Promise((res) => {
  const s = net.connect({ host: '127.0.0.1', port }, () => { s.destroy(); res(true); });
  s.on('error', () => res(false));
  s.setTimeout(timeout, () => { s.destroy(); res(false); });
});

const ipt = (...args) => execFileSync('iptables', args, { stdio: ['ignore', 'pipe', 'pipe'] });

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
      if (CellType.Provisioned in cell) cellIds.push(cell[CellType.Provisioned].cell_id);
    }
  }
  if (cellIds.length === 0) setupFail([`App "${appId}" on node${name} has no provisioned cells.`]);
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
    if (lastErr) setupFail([`node${name}'s cell was still disabled after 30s.`, String(lastErr.message ?? lastErr)]);
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
const pidOf = (node) => readFileSync(`${NET_ROOT}/${node}.pid`, 'utf8').trim();

// Reads the conductors' own sockets, so the claim about what carries peer
// traffic is measured on this run rather than remembered from another.
// PORTS ARE PARSED, NOT SUBSTRING-MATCHED, and the difference is the whole
// check. A first version counted any conductor-owned ESTAB line that did
// not mention a service port as a "direct peer link" and reported six of
// them. They were this harness's OWN client connections: every
// admin/app websocket it opens is a connection TO a conductor, so `ss`
// attributes the conductor's end to holochain and it looks exactly like a
// peer link unless the ports are actually inspected. The check failed
// loudly on the first run, which is the only reason the miscount was not
// quietly baked in as a fact about Holochain's transport.
const SERVICE_PORTS = new Set([SIGNAL_PORT, BOOTSTRAP_PORT]);
const CLIENT_PORTS = new Set(Object.values(NODES).flatMap((n) => [n.admin, n.app]));

function socketFacts() {
  let out = '';
  try { out = execFileSync('ss', ['-tnp'], { encoding: 'utf8' }); } catch { return null; }
  const rows = out.split('\n')
    .filter((l) => l.includes('holochain') && l.includes('ESTAB'))
    .map((l) => {
      const f = l.trim().split(/\s+/);
      const port = (addr) => Number((addr ?? '').split(':').pop());
      return { local: port(f[3]), peer: port(f[4]) };
    })
    .filter((r) => Number.isFinite(r.local) && Number.isFinite(r.peer));

  const toSignal = rows.filter((r) => r.peer === SIGNAL_PORT).length;
  const toBootstrap = rows.filter((r) => r.peer === BOOTSTRAP_PORT).length;
  // A genuine peer link joins two conductors on ephemeral ports: neither
  // end is a service port, and neither end is an admin/app port this
  // harness itself connects to.
  const direct = rows.filter((r) =>
    !SERVICE_PORTS.has(r.peer) && !SERVICE_PORTS.has(r.local) &&
    !CLIENT_PORTS.has(r.local) && !CLIENT_PORTS.has(r.peer)).length;
  const clientConns = rows.filter((r) => CLIENT_PORTS.has(r.local)).length;

  let udp = 0;
  try {
    udp = execFileSync('ss', ['-unp'], { encoding: 'utf8' })
      .split('\n').filter((l) => l.includes('holochain')).length;
  } catch { /* ss without -u support; leave at 0 */ }
  return { toSignal, toBootstrap, direct, clientConns, udp };
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
  // ---- 0. Refuse to firewall anything that is not disposable -----------
  //
  // This is the first thing that runs, before any connection, because the
  // failure it prevents is the one that would matter outside this repo: a
  // DROP rule installed on someone's real machine, outliving the process
  // that added it. Comparing our own network namespace with pid 1's is a
  // direct test of "are we somewhere throwaway" rather than a guess based
  // on an environment variable someone could set by accident.
  // Two independent signals, both required, neither of which can be set by
  // accident:
  //
  //   1. /proc/self/uid_map is not the identity map. On a host it reads
  //      "0 0 4294967295"; inside `unshare --map-root-user` it reads
  //      "0 <your uid> 1". This is what distinguishes namespaced root from
  //      REAL root — and real root on a real machine is exactly the case
  //      that must be refused, since there the rules would bite.
  //   2. The namespace has only a loopback interface, read over netlink
  //      via `ip link`, not from /sys — /sys is not remounted here and
  //      still shows the host's interfaces, so a sysfs check would pass
  //      on the host and be worse than no check at all. (Found by trying
  //      it: /sys/class/net listed eno1 and wlp7s0 inside the namespace.)
  //
  // An earlier version compared /proc/self/ns/net with /proc/1/ns/net.
  // That looked right and was not: pid 1's namespace link is unreadable to
  // an ordinary user, so the comparison threw and the harness refused via
  // its error path rather than its logic — it would have refused on a host
  // for the wrong reason, and said something untrue about why.
  let uidMap = '';
  try { uidMap = readFileSync('/proc/self/uid_map', 'utf8').trim(); } catch { /* handled below */ }
  const inUserNs = uidMap !== '' && !/^0\s+0\s+4294967295$/.test(uidMap);

  let links = [];
  try {
    links = execFileSync('ip', ['-o', 'link', 'show'], { encoding: 'utf8' })
      .split('\n').filter(Boolean).map((l) => l.split(': ')[1]).filter(Boolean);
  } catch { /* handled below */ }
  const loopbackOnly = links.length > 0 && links.every((n) => n === 'lo');

  if (!inUserNs || !loopbackOnly) {
    setupFail([
      'This is not a private, throwaway network namespace.',
      `  uid=${process.getuid()}  uid_map=${JSON.stringify(uidMap)}  interfaces=${JSON.stringify(links)}`,
      `  in a user namespace: ${inUserNs}      loopback-only: ${loopbackOnly}`,
      'This harness installs iptables DROP rules. It will not do that anywhere',
      'they could affect something real or outlive the run. Use the wrapper:',
      "  scripts/netns.sh run 'node scripts/live-verify/network-partition.mjs'",
    ]);
  }
  log(`Private network namespace confirmed — uid_map "${uidMap}", interfaces ${JSON.stringify(links)}.`);
  try { ipt('-L', '-n'); } catch {
    setupFail(['iptables is not usable even inside the namespace; cannot partition.']);
  }

  log('\nConnecting to three conductors ...');
  const A = await connectNode('A');
  const B = await connectNode('B');
  const C = await connectNode('C');
  const pidsBefore = { nodeA: pidOf('nodeA'), nodeB: pidOf('nodeB'), nodeC: pidOf('nodeC') };
  log(`  nodeA agent ${b64(A.me).slice(0, 12)}…  pid ${pidsBefore.nodeA}`);
  log(`  nodeB agent ${b64(B.me).slice(0, 12)}…  pid ${pidsBefore.nodeB}`);
  log(`  nodeC agent ${b64(C.me).slice(0, 12)}…  pid ${pidsBefore.nodeC}`);

  // ---- 1. Preconditions -------------------------------------------------
  log('\n--- 1. Preconditions ---');
  const sameDht = b64(A.dna) === b64(B.dna);
  const isolatedOk = b64(A.dna) !== b64(C.dna);
  check('nodeA and nodeB are on the SAME DHT', sameDht);
  check('nodeC is on a DIFFERENT DHT', isolatedOk);
  check('all three agent keys are distinct', new Set([b64(A.me), b64(B.me), b64(C.me)]).size === 3);
  if (!sameDht || !isolatedOk) setupFail(['DNA hashes are not in the required arrangement.']);

  // ---- 2. What actually carries peer traffic ---------------------------
  //
  // Asserted, not assumed. The cut below aims at the signal port because
  // that is where peer traffic goes on this setup; if that ever stops
  // being true, every result after it would be measuring something else,
  // and this check is what turns that into a visible failure instead of a
  // quiet one.
  log('\n--- 2. The peer data path is the relay, not a direct link ---');
  const facts = socketFacts();
  if (!facts) setupFail(['`ss` is unavailable; cannot establish the socket topology.']);
  log(`    conductor TCP -> signal :${SIGNAL_PORT}: ${facts.toSignal}   -> bootstrap :${BOOTSTRAP_PORT}: ${facts.toBootstrap}   direct peer links: ${facts.direct}   (this harness's own client connections, excluded: ${facts.clientConns})   UDP sockets: ${facts.udp}`);
  check('every conductor holds a TCP connection to the signal server', facts.toSignal >= 3);
  check('there are NO direct conductor-to-conductor connections', facts.direct === 0);
  check('peer traffic is not on UDP (so cutting the relay really cuts the data path)', facts.udp === 0);

  // ---- 3. Baseline ------------------------------------------------------
  log('\n--- 3. BASELINE — the network works before it is cut ---');
  const D_BASE = `NpBase${Date.now()}`;
  await publish(A, D_BASE, 'baseline, both connected');
  const base = await awaitConvergence(B, D_BASE, 'nodeB', C);
  check('a claim crosses nodeA -> nodeB before the cut', base.ms !== null);
  if (base.ms === null) setupFail(['The network is not carrying claims even before the cut.']);
  log(`    baseline crossed in ${(base.ms / 1000).toFixed(1)}s`);

  // ---- 4. Cut the data path, leave everything else alone ---------------
  log(`\n--- 4. Cutting TCP to the signal relay :${SIGNAL_PORT} (no process is touched) ---`);
  ipt('-I', 'INPUT', '1', '-p', 'tcp', '--dport', String(SIGNAL_PORT), '-j', 'DROP');
  ipt('-I', 'OUTPUT', '1', '-p', 'tcp', '--dport', String(SIGNAL_PORT), '-j', 'DROP');
  await sleep(3000);

  check(`the signal relay :${SIGNAL_PORT} is now unreachable`, !(await tcpReachable(SIGNAL_PORT)));
  check(`CONTROL: bootstrap :${BOOTSTRAP_PORT} is STILL reachable — this is one severed path, not an outage`,
    await tcpReachable(BOOTSTRAP_PORT));
  check('CONTROL: nodeA still answers zome calls (it is running, not stopped)',
    typeof (await countIn(A, 'AnyDomain')) === 'number');
  check('CONTROL: nodeB still answers zome calls (it is running, not stopped)',
    typeof (await countIn(B, 'AnyDomain')) === 'number');

  // ---- 5. Both sides write while partitioned ---------------------------
  //
  // This is the thing a stop-based partition cannot do, and the reason
  // this harness exists alongside partition-rejoin.mjs rather than
  // replacing it.
  log('\n--- 5. BOTH sides write while partitioned ---');
  const D_A = `NpA${Date.now()}`;
  const D_B = `NpB${Date.now()}`;
  const CONTENT_A = 'Written on nodeA while the link was cut.';
  const CONTENT_B = 'Written on nodeB while the link was cut.';
  await publish(A, D_A, CONTENT_A);
  await publish(B, D_B, CONTENT_B);
  check('nodeA wrote during the partition and sees its own claim', (await countIn(A, D_A)) === 1);
  check('nodeB wrote during the partition and sees its own claim', (await countIn(B, D_B)) === 1);

  // ---- 6. The partition actually holds ---------------------------------
  //
  // Sized from this run's own baseline, for the reason partition-rejoin.mjs
  // records: asserting an absence sooner than the thing would have arrived
  // proves nothing at all.
  const dwellMs = Math.max(60_000, base.ms * 10);
  log(`\n--- 6. The partition holds (watching ${(dwellMs / 1000).toFixed(0)}s — ${(base.ms / 1000).toFixed(1)}s sufficed before the cut) ---`);
  const dwellEnd = Date.now() + dwellMs;
  let leaked = false;
  while (Date.now() < dwellEnd) {
    const bSawA = await countIn(B, D_A);
    const aSawB = await countIn(A, D_B);
    if (bSawA > 0 || aSawB > 0) { leaked = true; break; }
    await sleep(POLL_MS);
  }
  check('neither side saw the other while the link was cut', !leaked);
  check('CONTROL: both conductors kept the same pids — nothing restarted',
    pidOf('nodeA') === pidsBefore.nodeA && pidOf('nodeB') === pidsBefore.nodeB);

  // ---- 7. Heal ----------------------------------------------------------
  log('\n--- 7. Healing the link ---');
  ipt('-D', 'INPUT', '-p', 'tcp', '--dport', String(SIGNAL_PORT), '-j', 'DROP');
  ipt('-D', 'OUTPUT', '-p', 'tcp', '--dport', String(SIGNAL_PORT), '-j', 'DROP');
  check(`the signal relay :${SIGNAL_PORT} is reachable again`, await tcpReachable(SIGNAL_PORT));

  // ---- 8. Converge, both directions, one clock -------------------------
  log('\n--- 8. Do both sides converge on what the other wrote? ---');
  log('    (measured concurrently, so neither number is an artefact of waiting for the other)');
  const [convA, convB] = await Promise.all([
    awaitConvergence(A, D_B, 'nodeA', C),
    awaitConvergence(B, D_A, 'nodeB', C),
  ]);
  check('nodeA converges on what nodeB wrote during the partition', convA.ms !== null);
  if (convA.ms !== null) log(`    nodeA converged in ${(convA.ms / 1000).toFixed(1)}s`);
  check('nodeB converges on what nodeA wrote during the partition', convB.ms !== null);
  if (convB.ms !== null) log(`    nodeB converged in ${(convB.ms / 1000).toFixed(1)}s`);

  const aHasB = await A.call('get_claims_by_domain', D_B);
  const bHasA = await B.call('get_claims_by_domain', D_A);
  check('what nodeA acquired is nodeB\'s entry, authored by nodeB',
    aHasB.length === 1 && claimEntry(aHasB[0]).content === CONTENT_B && b64(claimEntry(aHasB[0]).author) === b64(B.me));
  check('what nodeB acquired is nodeA\'s entry, authored by nodeA',
    bHasA.length === 1 && claimEntry(bHasA[0]).content === CONTENT_A && b64(claimEntry(bHasA[0]).author) === b64(A.me));

  // ---- 9. The link is healed, not merely drained -----------------------
  log('\n--- 9. A claim written AFTER healing crosses normally ---');
  const D_POST = `NpPost${Date.now()}`;
  check('nodeB sees 0 in the post-heal domain before nodeA publishes', (await countIn(B, D_POST)) === 0);
  await publish(A, D_POST, 'after the link healed');
  const post = await awaitConvergence(B, D_POST, 'nodeB', C);
  check('a new claim crosses after healing', post.ms !== null);
  if (post.ms !== null) log(`    crossed in ${(post.ms / 1000).toFixed(1)}s`);

  // ---- 10. The isolated node ------------------------------------------
  log('\n--- 10. CONTROL: the isolated node saw none of it ---');
  check('nodeC never saw nodeA\'s partition-time claim', (await countIn(C, D_A)) === 0);
  check('nodeC never saw nodeB\'s partition-time claim', (await countIn(C, D_B)) === 0);
  check('nodeC saw nothing during any convergence wait',
    !base.isolatedEverSaw && !convA.isolatedEverSaw && !convB.isolatedEverSaw && !post.isolatedEverSaw);
  check('nodeC is alive and answering, not merely silent',
    Array.isArray(await C.call('get_claims_by_domain', 'AnyDomainAtAll')));

  log('');
  if (failures === 0) {
    log('ALL CHECKS PASSED — the link between two running conductors was cut at');
    log('the packet level, both kept serving and both kept writing, neither saw');
    log('the other, and on healing both converged on what the other had written.');
    if (convA.ms !== null && convB.ms !== null) {
      log(`Recovery: nodeA ${(convA.ms / 1000).toFixed(1)}s, nodeB ${(convB.ms / 1000).toFixed(1)}s.`);
    }
  } else {
    log(`${failures} CHECK(S) FAILED.`);
  }
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('\nHARNESS ERROR:', e);
  // Best effort: the namespace dies with us anyway, so this is tidiness
  // rather than safety.
  try { ipt('-D', 'INPUT', '-p', 'tcp', '--dport', String(SIGNAL_PORT), '-j', 'DROP'); } catch { /* already gone */ }
  try { ipt('-D', 'OUTPUT', '-p', 'tcp', '--dport', String(SIGNAL_PORT), '-j', 'DROP'); } catch { /* already gone */ }
  process.exit(1);
});
