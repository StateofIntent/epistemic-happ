#!/usr/bin/env node
// ============================================================================
// scripts/live-verify/peer-signal.mjs — CAN TWO AGENTS SPEAK WITHOUT WRITING?
//
// WHY THIS EXISTS. Every inter-agent communication in this protocol has cost a
// permanent entry: a `Claim`, a `Critique`, an `Assessment`. Under Invariant 6
// nothing is ever deleted, so the cell has been all bone and no cytoplasm —
// there was no medium an agent could speak into at all. Stage 1 adds one, and
// the only claim worth making about it is the one about cost: ONE entry to
// open the channel, per agent, once, and ZERO per signal thereafter.
//
// THE DECLARATION IS THE INSTRUMENT, which is the shape `metabolism.mjs`
// established. `open_signal_channel` returns `entries_written_per_signal: 0`
// AND this agent's own `chain_length` in the same struct. The harness reads
// the length, sends signals, reads it again, and compares the declaration to
// the measurement — so the two cannot drift apart without a check going red.
//
// SECTION 1 IS A CONTROL AND IT IS WHY THE REST MEANS ANYTHING. A signal sent
// to an agent that has NOT opened its channel must NOT arrive. `send_remote_
// signal` requires an unrestricted cap grant on `recv_remote_signal`, and the
// host call is documented non-blocking — it "will not return an error if the
// calls fail" — so the sender cannot tell the difference between delivered and
// dropped. If section 1 ever passes a signal through, the cap grant is not
// load-bearing and every later section is measuring something other than what
// it claims.
//
// WHY `network.sh` AND NOT A SECOND AGENT ON ONE CONDUCTOR. Two agents sharing
// a conductor share a DHT store, and a remote signal between them need not
// cross a transport at all. The claim here is about agents on separate
// conductors, so the substrate has to be separate conductors.
//
// WHAT THIS DOES NOT TEST, so nobody reads more into a green run.
//   - It does not test that signals are rate-limited, because they are not.
//     Nothing is written, so nothing counts them, and a modified coordinator
//     can emit without limit. That is `SECURITY.md`'s standing position on
//     hot-swappable coordinators, not an oversight here.
//   - It does not test that a signal's CONTENTS are true. An agent claiming
//     `Saturated` may not be. The sender is host-verified; the assertion is
//     not, and section 3 checks only the former.
//
// RUN IT ON A CLEAN DHT, and section 1 is the reason rather than tidiness:
//
//   scripts/network.sh clean && scripts/network.sh start
//   node scripts/live-verify/peer-signal.mjs
//
// The control requires a nodeB that has NEVER opened its channel, and the cap
// grant is an entry — so it survives `stop`/`start` and a second run on the
// same state reds section 1 ("heard nothing with its channel shut (got 1)")
// and section 2's `created` flag. Those reds are the harness measuring a
// channel it opened on a previous run, not a protocol fault.
// ============================================================================
import { AdminWebsocket, AppWebsocket, CellType } from '@holochain/client';

const NODES = {
  A: { node: 'nodeA', admin: 8899, app: 8898, appId: 'epistemic-net-a' },
  B: { node: 'nodeB', admin: 8897, app: 8896, appId: 'epistemic-net-b' },
};

const QUIET_WINDOW_MS = Number(process.env.EPI_SIGNAL_QUIET_MS ?? 8000);
const ARRIVE_WINDOW_MS = Number(process.env.EPI_SIGNAL_ARRIVE_MS ?? 15000);
const SIGNAL_BURST = Number(process.env.EPI_SIGNAL_BURST ?? 5);

const log = (...a) => console.log(...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b64 = (u8) => Buffer.from(u8).toString('base64');

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

async function connectNode(name) {
  const { admin: adminPort, app: appPort, appId } = NODES[name];
  let admin;
  try {
    admin = await AdminWebsocket.connect({
      url: new URL(`ws://localhost:${adminPort}`), wsClientOptions: { origin: 'live-verify' },
    });
  } catch (e) {
    setupFail([`${NODES[name].node} is not listening on ${adminPort}.`, 'Run scripts/network.sh start first.', String(e.message ?? e)]);
  }
  const { token } = await admin.issueAppAuthenticationToken({ installed_app_id: appId });
  const app = await AppWebsocket.connect({
    url: new URL(`ws://localhost:${appPort}`), token, wsClientOptions: { origin: 'live-verify' },
  });
  const info = await app.appInfo();
  const cellIds = [];
  for (const roleCells of Object.values(info.cell_info)) {
    for (const cell of roleCells) {
      if (cell?.type === CellType.Provisioned) cellIds.push(cell.value.cell_id);
    }
  }
  if (cellIds.length === 0) setupFail([`App "${appId}" has no provisioned cells.`]);
  for (const cellId of cellIds) {
    let lastErr = null;
    for (let i = 0; i < 30; i++) {
      try { await admin.authorizeSigningCredentials(cellId); lastErr = null; break; }
      catch (e) {
        lastErr = e;
        if (!String(e.message ?? e).includes('CellDisabled')) throw e;
        await sleep(1000);
      }
    }
    if (lastErr) setupFail([`${NODES[name].node}'s cell was still disabled after 30s.`]);
  }
  // Every signal this client is handed, kept RAW with an arrival time taken
  // HERE. A signal carries no timestamp of its own, deliberately — see
  // `PeerSignal`'s doc comment and §5.22: a sender-supplied time is a number
  // the sender chose.
  //
  // THE RAW SIGNAL IS KEPT, and the previous version's habit of unwrapping it
  // at the door is the defect that cost this harness a day. It stored
  // `sig?.payload ?? sig?.App?.payload ?? sig` — all three wrong for this
  // client — so the envelope was flattened to something `peerSignals` could
  // not read, and the un-decodable and the un-delivered became the same
  // observation. Keep the envelope; decode in one place; check the decode.
  const received = [];
  app.on('signal', (sig) => {
    received.push({ at: Date.now(), raw: sig });
  });
  return {
    name,
    dna: cellIds[0][0],
    me: cellIds[0][1],
    received,
    call: (fn, payload) => app.callZome({
      role_name: 'epistemic', zome_name: 'epistemic_coordinator', fn_name: fn, payload,
    }, 60_000),
  };
}

// A received PeerSignal, unwrapped from the client's envelope.
//
// THE ENVELOPE, MEASURED RATHER THAN GUESSED (@holochain/client 0.21.0, two
// conductors on `network.sh`, 2026-10-23):
//
//   sig.type                                  = "app"
//   sig.value.cell_id[0|1]                    = 39 bytes each
//   sig.value.zome_name                       = "epistemic_coordinator"
//   sig.value.payload.PeerSignal.from         = 39 bytes, host-verified
//   sig.value.payload.PeerSignal.signal.<Variant>
//
// WHAT THE PREVIOUS VERSION LOOKED AT, and why this is written as a list of
// candidate paths with a counter rather than a one-line `??` chain. It read
// `payload.PeerSignal` and `payload.value.PeerSignal` after already
// flattening the envelope — missing `value.payload` by exactly one level. The
// signals were arriving, correctly typed, the whole time: sections 3 and 4
// were red for 24 hours against a protocol that worked, and the commit message
// recorded the fault as "isolated to send_remote_signal itself" because every
// OTHER link had been confirmed independently and this one had not been
// instrumented at all. Four conductor restarts, `RUST_LOG`, `NETAUDIT` and a
// throwaway `call_remote` probe went into re-deriving that.
//
// SO THE DECODE IS NOW A MEASUREMENT WITH ITS OWN FAILURE MODE. `undecodable`
// counts envelopes that arrived and did not yield a `PeerSignal`, and the
// caller treats that as a SETUP failure rather than a protocol result —
// because "nothing arrived" and "something arrived that I cannot read" are
// different findings and this file proved what it costs to conflate them.
const PEER_SIGNAL_PATHS = [
  (sig) => sig?.value?.payload?.PeerSignal, // the measured shape, client 0.21
  (sig) => sig?.payload?.PeerSignal,        // tolerated: a flatter envelope
  (sig) => sig?.PeerSignal,                 // tolerated: already unwrapped
];

const decodeSignals = (node) => {
  const found = [];
  let undecodable = 0;
  for (const r of node.received) {
    let hit = null;
    for (const at of PEER_SIGNAL_PATHS) {
      try { hit = at(r.raw) ?? null; } catch { hit = null; }
      if (hit) break;
    }
    if (hit) found.push(hit); else undecodable++;
  }
  return { found, undecodable };
};

const peerSignals = (node) => decodeSignals(node).found;

async function main() {
  log('=== peer-signal: can two agents speak without writing? ===');
  log('');

  const A = await connectNode('A');
  const B = await connectNode('B');
  log(`nodeA agent: ${b64(A.me)}`);
  log(`nodeB agent: ${b64(B.me)}`);
  log(`same DNA: ${b64(A.dna) === b64(B.dna)}`);
  if (b64(A.dna) !== b64(B.dna)) {
    setupFail(['nodeA and nodeB are on different DNA hashes, so no signal could cross.']);
  }
  log('');

  // ------------------------------------------------------------------ 1
  log('=== 1. CONTROL: a signal into a channel nobody opened does not arrive ===');
  log('    (if this passes a signal through, the cap grant is not load-bearing');
  log('     and every section below is measuring something else)');
  const sentClosed = await A.call('send_peer_signal', {
    signal: { Saturated: { domain: 'peer-signal-control', headroom: 0 } },
    recipients: [B.me],
  });
  check('the sender is told how many it ATTEMPTED, not how many arrived', sentClosed?.attempted === 1);
  check('and it never claims delivery, because the host call cannot report it',
    sentClosed?.delivery_confirmed === false);
  await sleep(QUIET_WINDOW_MS);
  const leaked = peerSignals(B);
  check(`nodeB heard nothing in ${(QUIET_WINDOW_MS / 1000).toFixed(0)}s with its channel shut (got ${leaked.length})`,
    leaked.length === 0);
  log('');

  // ------------------------------------------------------------------ 2
  log('=== 2. Opening the channel is one entry, once, and says so ===');
  const openB1 = await B.call('open_signal_channel', null);
  check('the first call reports it created the grant', openB1?.created === true);
  check('and declares the cost of opening as exactly one entry', openB1?.entries_written_to_open === 1);
  check('and declares zero entries per signal', openB1?.entries_written_per_signal === 0);
  const openB2 = await B.call('open_signal_channel', null);
  check('a second call creates nothing — idempotent by chain query, not by luck',
    openB2?.created === false);
  check('and the chain did not grow between the two calls',
    openB2?.chain_length === openB1?.chain_length);
  log(`    nodeB chain length after opening: ${openB2?.chain_length}`);
  const openA = await A.call('open_signal_channel', null);
  check('nodeA opens its own side independently', typeof openA?.chain_length === 'number');
  log('');

  // ------------------------------------------------------------------ 3
  log('=== 3. The signal crosses, and the SENDER is the host\'s answer ===');
  const before = B.received.length;
  await A.call('send_peer_signal', {
    signal: { Saturated: { domain: 'peer-signal-live', headroom: 3 } },
    recipients: [B.me],
  });
  const deadline = Date.now() + ARRIVE_WINDOW_MS;
  while (Date.now() < deadline && B.received.length === before) await sleep(250);
  const { found: got, undecodable } = decodeSignals(B);
  // BEFORE the result check, because an unreadable envelope is not a verdict
  // about delivery and must never be reported as one. This is the exact
  // confusion that made sections 3 and 4 red against a working protocol.
  if (undecodable > 0 && got.length === 0) {
    setupFail([
      `nodeB received ${undecodable} signal envelope(s) and none yielded a PeerSignal.`,
      'The signals ARE arriving — this harness cannot read the envelope.',
      'Add the real path to PEER_SIGNAL_PATHS; see its comment for how to measure it.',
      `First envelope: ${JSON.stringify(B.received[0]?.raw)?.slice(0, 300)}`,
    ]);
  }
  check(`nodeB received a peer signal within ${(ARRIVE_WINDOW_MS / 1000).toFixed(0)}s`, got.length >= 1);
  if (got.length >= 1) {
    const first = got[0];
    // THE POINT OF THIS CHECK. `from` is `call_info()?.provenance` — the host's
    // identification of the caller — and `PeerSignal` has no sender field at
    // all, so there is nothing for a sender to put a lie in.
    const from = first.from ? b64(Uint8Array.from(Object.values(first.from))) : null;
    check('and the sender it reports is nodeA, taken from host-verified provenance',
      from === b64(A.me));
    check('and it is NOT nodeB itself, so this did not come from the local client',
      from !== b64(B.me));
    check('the typed variant survived the round trip', !!first.signal?.Saturated);
    check('with its fields intact', first.signal?.Saturated?.headroom === 3);
  }
  log('');

  // ------------------------------------------------------------------ 4
  log('=== 4. All four variants round-trip, so the vocabulary is real ===');
  // A REAL ActionHash, because a hand-made byte array is not one. 39 bytes of
  // 0x01 round-trips through msgpack and then fails `holo_hash`'s prefix check
  // inside the ribosome, which reports `Deserialize` — the same error shape as
  // a wrong extern signature, from a completely different cause. Publishing one
  // claim is cheaper than mistaking the two again.
  const targetHash = await A.call('create_claim', {
    content: 'peer-signal target', domain: 'peer-signal', confidence: 'Moderate',
    semantic_tags: [], author: A.me, timestamp: Date.now() * 1000,
    evidence_hashes: [], attestation_policy: null,
  });
  const target = targetHash;
  const variants = [
    ['Saturated', { Saturated: { domain: 'd', headroom: 0 } }],
    ['ClosureDeficit', { ClosureDeficit: { target, resolved: 1, cited: 4 } }],
    ['Settled', { Settled: { target } }],
    ['ProposingSpecies', { ProposingSpecies: { name: 'UnfalsifiableAsStated', parent: null } }],
  ];
  for (const [name, signal] of variants) {
    const n = B.received.length;
    try {
      await A.call('send_peer_signal', { signal, recipients: [B.me] });
      const d2 = Date.now() + ARRIVE_WINDOW_MS;
      while (Date.now() < d2 && B.received.length === n) await sleep(250);
      const all = peerSignals(B);
      const last = all[all.length - 1];
      check(`${name} arrived and kept its type`, !!last?.signal?.[name]);
    } catch (e) {
      check(`${name} arrived and kept its type`, false);
      log(`      (${String(e.message ?? e).slice(0, 120)})`);
    }
  }
  log('');

  // ------------------------------------------------------------------ 5
  log('=== 5. THE CLAIM: a burst of signals writes nothing, on either side ===');
  // Read AFTER section 4's claim, so that write is outside the window being
  // measured — the claim is a deliberate write and would otherwise be charged
  // to the signals.
  const aBefore = (await A.call('open_signal_channel', null))?.chain_length;
  const bBefore = (await B.call('open_signal_channel', null))?.chain_length;
  for (let i = 0; i < SIGNAL_BURST; i++) {
    await A.call('send_peer_signal', {
      signal: { Settled: { target } },
      recipients: [B.me],
    });
  }
  await sleep(3000);
  const aAfter = (await A.call('open_signal_channel', null))?.chain_length;
  const bAfter = (await B.call('open_signal_channel', null))?.chain_length;
  check(`the SENDER's chain did not grow across ${SIGNAL_BURST} signals (${aBefore} -> ${aAfter})`,
    aBefore === aAfter);
  check(`the RECEIVER's chain did not grow either (${bBefore} -> ${bAfter})`,
    bBefore === bAfter);
  check('so the declaration entries_written_per_signal: 0 matches the measurement',
    aBefore === aAfter && bBefore === bAfter);
  log('');

  log(failures === 0 ? 'OK' : `${failures} CHECK(S) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error('\nHARNESS ERROR:', e); process.exit(1); });
