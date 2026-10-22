#!/usr/bin/env node
// ============================================================================
// scripts/live-verify/scale-dht.mjs — WHAT CHANGES WHEN THE DHT HAS TWELVE
// MEMBERS INSTEAD OF THREE.
//
// README's *Before mass adoption* row: "a run at tens of nodes. Arc sizing,
// gossip load and DHT behaviour are all scale-sensitive and none is measured."
// That blocker read like hardware and is not — a conductor is ~95-98 MB and
// ~8% of one core, so twenty is about 2 GB and 1.5 cores. What was missing was
// not machines but a decision about WHAT TO ASSERT, and this file is that
// decision.
//
// ---------------------------------------------------------------------------
// THE TRAP THIS FILE IS BUILT AROUND, because it decides everything else.
//
// At three nodes every conductor is an authority for the whole DHT — arcs are
// FULL, so everybody stores everything. A harness that asserts "the entry
// reached every node" therefore passes at three, passes at twelve, and would
// pass at a thousand without ever testing routing: it is measuring that
// everyone has a complete copy, which is the opposite of the scale behaviour
// the row asks about.
//
// So the first thing here is NOT an assertion about entries. It is a
// measurement of `storage_arc` per member, and a check that the resolvability
// result below is NON-VACUOUS. If every arc is still full, this run says so
// and says plainly that it measured small-N behaviour — which is a finding
// about where narrowing starts, not a pass.
//
// THAT IS THE GREEN-TICK-THAT-CANNOT-GO-RED PROBLEM, which this directory
// keeps rediscovering: `partition-rejoin`'s divergence check once read nodeB
// before a claim could have crossed, so it asserted "the partition held" and
// tested "nothing has arrived yet". The same shape waits here for anybody who
// writes the obvious scale test.
// ---------------------------------------------------------------------------
// WHAT IT ASSERTS, in the order the trap dictates:
//
//   1. The shared DHT really is shared, and the control really is isolated —
//      same DNA hash across the members, a different one for nodeC.
//   2. ARC SIZING, measured per member and reported. Then the vacuity check:
//      is at least one member NOT a full-arc authority? A red here means the
//      run is small-N behaviour wearing a scale label.
//   3. RESOLVABILITY, which is the DHT's actual promise: an entry written on
//      one member can be RESOLVED BY HASH from every other member. Not
//      "every member stores it" — that is what full arcs give you for free.
//   4. The isolated control resolves nothing, every time. This is a permanent
//      in-run negative rather than an injection: if nodeC could resolve the
//      entry, the positive result above would mean nothing, and the control
//      runs on every execution rather than being a thing somebody did once.
//
// WHAT IT DELIBERATELY DOES NOT ASSERT: crossing time against N. The sampler
// here cannot resolve differences below its own poll interval, and §3's
// propagation spread is minutes wide — so a timing comparison across N would
// measure the instrument and the intermittency rather than the subject. The
// figures are printed with their poll counts and are not gated.
// ---------------------------------------------------------------------------
// AN EXPERIMENT, NOT A GATE, AND NOT IN CI — the same classification as
// `dht-isolation-probe` and `stall-bisect`. Twelve conductors on two CI vCPUs
// would measure the runner. Run it by hand, on a machine with headroom:
//
//   scripts/network.sh clean && scripts/network.sh start
//   EPI_SCALE_NODES=10 scripts/network.sh start-scale
//   node scripts/live-verify/scale-dht.mjs
//   scripts/network.sh stop        # finds the scale nodes without the env var
//
// nodeA + nodeB + scale1..10 is twelve shared members; nodeC stays out of the
// count as the isolation control. Twelve before twenty on purpose: if arcs
// have not narrowed by twelve they will not by twenty, and that is learned for
// half the resource.
// ============================================================================

import { AdminWebsocket, AppWebsocket, CellType } from '@holochain/client';

const SCALE_PORT_BASE = Number(process.env.EPI_SCALE_PORT_BASE ?? 9200);
const SCALE_N = Number(process.env.EPI_SCALE_NODES ?? 10);
// How long to give a hash to become resolvable from every member. Generous:
// §3 records crossings from 175s to 943s, and a run that reds on the known
// intermittency would be reporting the network's documented behaviour as a
// scale finding.
const RESOLVE_WINDOW_MS = Number(process.env.EPI_SCALE_WINDOW_S ?? 600) * 1000;
const POLL_MS = 5_000;
const DOMAIN = `Scale${Date.now()}`;

const log = (...a) => console.log(...a);
let failures = 0;
const check = (label, cond) => {
  if (cond) log(`  PASS: ${label}`);
  else { log(`  FAIL: ${label}`); failures++; }
};
const b64 = (u8) => Buffer.from(u8).toString('base64');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function connect(adminPort, appPort, appId, name) {
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
      if (cell?.type === CellType.Provisioned || cell?.type === CellType.Cloned) cellIds.push(cell.value.cell_id);
    }
  }
  for (const cellId of cellIds) await admin.authorizeSigningCredentials(cellId);
  return {
    name, admin, dna: cellIds[0][0], me: cellIds[0][1],
    call: (fn, payload) =>
      app.callZome({ role_name: 'epistemic', zome_name: 'epistemic_coordinator', fn_name: fn, payload }),
  };
}

// WHAT `agentInfo` ACTUALLY RETURNS, measured rather than assumed — the first
// version of this function guessed and reported `unknown` for all twelve
// members, which the harness correctly refused to treat as a scale result.
//
// It is an array of JSON **strings**, each of which parses to
// `{ agentInfo: "<another JSON string>", signature }`. The inner string is
// where the fields live, and they are **camelCase**: `storageArc`, not
// `storage_arc`. So it is doubly encoded and differently cased from the
// Rust-side name, and both of those have to be got right before anything here
// can tell a full arc from a narrowed one.
const ARC_MAX = 4_294_967_295; // u32::MAX — a full arc is [0, u32::MAX]

/** The arc an agent CLAIMS to be an authority for. A full arc means
 *  "everything", which is what a small network gives every member — and is
 *  exactly the condition under which resolvability proves nothing about
 *  routing. */
function arcOf(entry) {
  let outer = entry;
  try { if (typeof outer === 'string') outer = JSON.parse(outer); } catch { /* fall through */ }
  let inner = outer?.agentInfo ?? outer?.agent_info ?? outer;
  try { if (typeof inner === 'string') inner = JSON.parse(inner); } catch { /* fall through */ }
  const arc = inner?.storageArc ?? inner?.storage_arc;
  const agent = inner?.agent ?? null;
  if (arc == null) return { kind: 'unknown', full: false, text: 'unknown', agent };
  if (arc === 'Empty' || arc?.type === 'Empty') return { kind: 'empty', full: false, text: 'Empty', agent };
  const range = Array.isArray(arc) ? arc : (arc?.Arc ?? arc?.value);
  if (Array.isArray(range) && range.length === 2) {
    const [start, end] = range.map(Number);
    const span = end - start + 1;
    const full = start === 0 && end >= ARC_MAX;
    return {
      kind: 'range', full, agent,
      text: `[${start}, ${end}]${full ? '' : `  span ${span} (${(span / (ARC_MAX + 1) * 100).toFixed(1)}% of the space)`}`,
      span,
    };
  }
  return { kind: 'other', full: false, text: JSON.stringify(arc).slice(0, 60), agent };
}

async function main() {
  log('=== TWELVE MEMBERS INSTEAD OF THREE (scale beyond four nodes) ===\n');

  const shared = [];
  shared.push(await connect(8899, 8898, 'epistemic-net-a', 'nodeA'));
  shared.push(await connect(8897, 8896, 'epistemic-net-b', 'nodeB'));
  for (let i = 0; i < SCALE_N; i++) {
    const n = i + 1;
    try {
      shared.push(await connect(SCALE_PORT_BASE + i * 2, SCALE_PORT_BASE + i * 2 + 1,
        `epistemic-net-scale${n}`, `scale${n}`));
    } catch (e) {
      log(`SETUP FAILED: scale${n} did not answer on :${SCALE_PORT_BASE + i * 2}.`);
      log('  Bring the scale nodes up first:');
      log(`    EPI_SCALE_NODES=${SCALE_N} scripts/network.sh start-scale`);
      process.exit(1);
    }
  }
  // The isolated control, on its own seed. Not a member and not counted.
  const isolated = await connect(8895, 8894, 'epistemic-net-c', 'nodeC');

  log(`shared members: ${shared.length}  (${shared.map((n) => n.name).join(', ')})`);
  log(`isolated control: ${isolated.name}\n`);

  // === 1. The DHT is shared, and the control is not ======================
  log('--- 1. One DHT, and a control that is genuinely outside it ---');
  const dna0 = b64(shared[0].dna);
  check(`all ${shared.length} members report the SAME DNA hash, so this is one DHT`,
    shared.every((n) => b64(n.dna) === dna0));
  check('the control reports a DIFFERENT DNA hash, so a positive below came from the network',
    b64(isolated.dna) !== dna0);
  check('every member has a distinct agent key, so these are peers rather than one conductor',
    new Set(shared.map((n) => b64(n.me))).size === shared.length);

  // === 2. ARC SIZING, which decides what section 3 can mean =============
  // Read ONCE from one member: `agentInfo({ dna_hashes })` returns the infos
  // of every peer it knows on that DNA, so twelve calls would be twelve copies
  // of the same answer.
  log('\n--- 2. Arc sizing: what each member claims to be an authority for ---');
  let infos = [];
  try {
    infos = await shared[0].admin.agentInfo({ dna_hashes: [shared[0].dna] });
  } catch (e) {
    log(`    agentInfo failed — ${String(e).slice(0, 120)}`);
  }
  const arcs = infos.map(arcOf).filter((a) => a.kind !== 'unknown');
  const fullCount = arcs.filter((a) => a.full).length;
  const narrowed = arcs.filter((a) => !a.full);

  log(`    ${infos.length} peer info(s) known to ${shared[0].name}, ${arcs.length} with a readable arc`);
  for (const a of arcs.slice(0, 4)) {
    log(`      ${String(a.agent ?? '?').slice(0, 12)}…  ${a.text}${a.full ? '   (FULL)' : ''}`);
  }
  if (arcs.length > 4) log(`      … and ${arcs.length - 4} more`);
  log(`    FULL arcs: ${fullCount} of ${arcs.length}   narrowed: ${narrowed.length}`);

  check('arc sizing is OBSERVABLE, so this harness can tell routing from storage',
    arcs.length > 0);
  check(`every member the network knows about has a readable arc (${arcs.length} of ${infos.length})`,
    infos.length > 0 && arcs.length === infos.length);

  // WHETHER ARCS NARROW AT TWELVE IS NOT THIS REPOSITORY'S PROPERTY TO ASSERT,
  // so it is REPORTED rather than checked — the same stance
  // `dht-isolation-probe` takes, which "asserts nothing; prints a 2×2 of
  // timings". A red here would be this harness claiming Holochain ought to
  // shrink an arc by now, which is not a claim anybody here is entitled to.
  //
  // What it must NOT do is let section 3 be read as a scale result when it is
  // not one, so the finding is stated loudly and repeated in the summary.
  const vacuous = narrowed.length === 0 && arcs.length > 0;
  if (vacuous) {
    log('');
    log(`    FINDING: ALL ${arcs.length} MEMBERS STILL CLAIM A FULL ARC AT ${shared.length} MEMBERS.`);
    log('    Every one of them is an authority for the whole DHT, so resolving an');
    log('    entry from any of them is guaranteed by STORAGE and not by ROUTING.');
    log('    Section 3 will pass and will NOT have tested scale.');
    log('');
    log('    This is a finding about where narrowing begins, not a failure. Twelve');
    log('    members is not enough to make this substrate shrink an arc, so the');
    log('    next experiment is MORE MEMBERS rather than a different assertion —');
    log('    and the figure worth recording is the N at which an arc first');
    log('    narrows. Nothing above twelve has been run.');
  }

  // === 3. RESOLVABILITY: the DHT's actual promise ========================
  log('\n--- 3. An entry written on one member, resolved by hash from every other ---');
  const content = `written on ${shared[0].name} for ${shared.length - 1} peers to resolve`;
  const action = await shared[0].call('create_claim', {
    content, domain: DOMAIN, author: shared[0].me, timestamp: Date.now() * 1000,
    evidence_hashes: [], confidence: 'Moderate', semantic_tags: [], source_mew: null,
  });
  const own = await shared[0].call('get_claims_by_domain', DOMAIN);
  const entryHash = own[0]?.signed_action?.hashed?.content?.data?.entry_hash;
  check('the writer can read its own claim back, so there is something to resolve',
    own.length === 1 && entryHash != null);
  if (!entryHash) {
    log(`\n${failures} CHECK(S) FAILED`);
    process.exit(1);
  }
  log(`    published on ${shared[0].name}; polling ${shared.length - 1} peers every ${POLL_MS / 1000}s ...`);

  const peers = shared.slice(1);
  const resolved = new Map();
  const t0 = Date.now();
  let polls = 0;
  while (resolved.size < peers.length && Date.now() - t0 < RESOLVE_WINDOW_MS) {
    polls++;
    for (const p of peers) {
      if (resolved.has(p.name)) continue;
      try {
        const got = await p.call('get_claim', entryHash);
        if (got?.content === content) resolved.set(p.name, { ms: Date.now() - t0, polls });
      } catch { /* a read that cannot answer yet is "not yet" */ }
    }
    if (resolved.size >= peers.length) break;
    await sleep(POLL_MS);
  }

  for (const p of peers) {
    const r = resolved.get(p.name);
    log(`    ${p.name.padEnd(8)} ${r ? `resolved in ${(r.ms / 1000).toFixed(1)}s (poll ${r.polls} of a ${(POLL_MS / 1000).toFixed(1)}s sampler)` : `UNRESOLVED in ${RESOLVE_WINDOW_MS / 1000}s`}`);
  }
  check(`EVERY ONE OF THE ${peers.length} PEERS RESOLVED THE ENTRY BY HASH`,
    resolved.size === peers.length);
  // Reported, never gated — see the header on why timing against N is not a
  // measurement this instrument can make.
  if (resolved.size > 0) {
    const times = [...resolved.values()].map((r) => r.ms / 1000).sort((a, b) => a - b);
    log(`    (resolution spread ${times[0].toFixed(1)}s to ${times[times.length - 1].toFixed(1)}s — reported, not asserted)`);
  }

  // === 4. The control, which runs every time =============================
  log('\n--- 4. CONTROL: the isolated node resolves none of it ---');
  let isolatedSaw = null;
  try {
    isolatedSaw = await isolated.call('get_claim', entryHash);
  } catch { /* refusing to resolve is the expected outcome */ }
  check('the isolated control cannot resolve the entry, so section 3 came from this DHT',
    isolatedSaw == null);
  check('and it sees nothing in the domain either',
    (await isolated.call('get_claims_by_domain', DOMAIN)).length === 0);

  log('');
  if (failures === 0) {
    log(`ALL CHECKS PASSED — ${shared.length} members, one DHT, every peer resolved the entry`);
    log('by hash, and a conductor outside the DHT resolved nothing.');
    if (vacuous) {
      log('');
      log(`BUT READ SECTION 2: all ${arcs.length} arcs were FULL, so what passed above is`);
      log('STORAGE and not ROUTING. This run did not test scale. The scale row in');
      log("README is NOT closed by it — what it establishes is that twelve members");
      log('do not make this substrate narrow an arc, and that the next experiment');
      log('needs more members.');
    }
  } else {
    log(`${failures} CHECK(S) FAILED`);
  }
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error('\nHARNESS ERROR:', e); process.exit(1); });
