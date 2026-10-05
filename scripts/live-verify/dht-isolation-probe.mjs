#!/usr/bin/env node
// ============================================================================
// dht-isolation-probe.mjs — WHY DOES A READ ON nodeB HANG IN partition-rejoin
// PHASE 2?
//
// Three CI failures (2026-10-05) died on one bare read with
// `Request timed out in 60000 ms: call_zome`, and #165's instrument narrowed
// it: nodeB's ADMIN PORT STILL ANSWERS, so the conductor is up and simply did
// not serve one get_claims_by_domain inside 60s.
//
// PHASE 2 CHANGES TWO THINGS AT ONCE, which is why a hypothesis naming only
// one of them is not yet tested:
//
//   ISOLATION — nodeA is stopped and nodeC is on a different DHT, so nodeB is
//   the only node on its own DHT.
//   FRESH START — nodeB is restarted immediately before the read.
//
// So this probes four cells of a 2x2 rather than the one state the hypothesis
// happens to describe. A result that only appears with both variables set
// means neither alone is the cause.
//
// AN ARGUMENT AGAINST THE ISOLATION HYPOTHESIS, STATED UP FRONT so the probe
// is not read as confirming what it was built to doubt: these conductors are
// full-arc, so each is an authority for the whole DHT space and a get_links
// should be answerable from local storage with no peer involved. If isolation
// were sufficient, every read in this condition would hang, and partition
// rejoin passes locally every time. The probe exists to find out, not to
// confirm.
//
// ---------------------------------------------------------------------------
// WHAT IT FOUND, over two runs on 2026-10-05 on a developer machine (NOT a
// 2-vCPU runner, which matters: every prior theory about this signature
// assumed load).
//
//   C neither       0.02s / 0.02s    no errors
//   A isolated      0.01s / 0.01s    no errors
//   B both         60.00s / 60.00s   TIMED OUT, both runs
//   D fresh only    0.29s / 0.27s    no errors
//   E first-read repeated, isolated  0 of 5 hung
//
// THE ISOLATION HYPOTHESIS IS REFUTED, and twice over. Cell A shows being
// alone on the DHT is not sufficient: a link query for a domain nothing was
// ever written to answers in 10ms with zero peers, exactly as full-arc
// authority predicts. And inside cell B the NEVER-WRITTEN domain answers in
// 10ms while the domain nodeB HOLDS is the one that hangs — the opposite of
// what the hypothesis predicted, which was blocking while reaching for peers
// that do not exist.
//
// THE CONJUNCTION REPRODUCES. 2 of 2 runs, 60.0s exactly, on the first read
// of a domain nodeB holds, after nodeB is restarted while nodeA is down.
// Subsequent reads of that same domain answer in 10ms, and the run continues
// normally. It waits out the client's 60s rather than erroring, so the
// conductor is blocked on something rather than refusing.
//
// BUT THE OBVIOUS ACCOUNT OF THE CONJUNCTION IS ALSO WRONG, which is why
// phase E exists and why its negative result is the most useful line here.
// "The first read after a restart while isolated" describes cell B — and
// phase E does precisely that five times and never hangs, trial 1 included,
// at 0.24s. So isolation plus a fresh start plus first-read is NOT
// sufficient either. Something about WHERE cell B sits in the sequence is
// load-bearing and is not yet controlled: by phase E, nodeB has already been
// restarted once in this run and nodeA has been up and down again, whereas
// cell B is nodeB's first restart in a clean network after nodeA went down.
//
// So what is established is narrow and worth stating narrowly: a
// reproducible 60s stall exists, it is not load-dependent, it is not
// isolation alone, it is not a fresh start alone, and it is not simply the
// first read after an isolated restart. WHY the conductor waits is inside
// Holochain and this probe measures from outside. Nothing here is fixed on
// it, and no timeout is widened.
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
    call: (fn, payload) => app.callZome({ role_name: 'epistemic', zome_name: 'epistemic_coordinator', fn_name: fn, payload }),
  };
}

// Times one read. Returns elapsed ms and the outcome, never throws, so one
// hang does not end the experiment with the other cells unmeasured.
async function timedRead(node, domain, label) {
  const t0 = Date.now();
  try {
    const n = (await node.call('get_claims_by_domain', domain)).length;
    return { label, ms: Date.now() - t0, got: n, err: null };
  } catch (e) {
    return { label, ms: Date.now() - t0, got: null, err: String(e?.message ?? e).split('\n')[0].slice(0, 80) };
  }
}

const REPEATS = 3;
const FIRST_READ_TRIALS = 5;
async function measure(condition, node, held, never) {
  const rows = [];
  for (let i = 0; i < REPEATS; i++) {
    rows.push(await timedRead(node, held, 'domain it HOLDS'));
    rows.push(await timedRead(node, never, 'domain NEVER written'));
  }
  for (const r of rows) {
    const verdict = r.err ? `ERROR after ${(r.ms / 1000).toFixed(1)}s — ${r.err}` : `${(r.ms / 1000).toFixed(2)}s, got ${r.got}`;
    log(`    [${condition}] ${r.label.padEnd(22)} ${verdict}`);
  }
  const worst = Math.max(...rows.map((r) => r.ms));
  const anyErr = rows.some((r) => r.err);
  log(`    [${condition}] worst ${(worst / 1000).toFixed(2)}s, errors: ${anyErr ? 'YES' : 'none'}`);
  return { condition, worst, anyErr };
}

async function main() {
  const HELD = `Probe${Date.now()}`;
  const NEVER = `ProbeNever${Date.now()}`;
  const results = [];

  log('--- setup: both up, write on nodeA, let it reach nodeB ---');
  let A = await connect('A');
  let B = await connect('B');
  await A.call('create_claim', {
    content: 'isolation probe', domain: HELD, confidence: 'Moderate', semantic_tags: [],
    author: A.me, timestamp: nowMicros(), evidence_hashes: [], attestation_policy: null,
  });
  for (let i = 0; i < 60; i++) {
    if ((await B.call('get_claims_by_domain', HELD)).length > 0) break;
    await sleep(2000);
  }
  log(`    nodeB holds ${(await B.call('get_claims_by_domain', HELD)).length} in ${HELD}`);

  log('\n--- C: CONTROL — nodeA up, nodeB not restarted (neither variable) ---');
  results.push(await measure('C neither', B, HELD, NEVER));

  log('\n--- A: ISOLATION ONLY — nodeA stopped, nodeB not restarted ---');
  net('stop-node', 'nodeA');
  results.push(await measure('A isolated', B, HELD, NEVER));

  log('\n--- B: ISOLATION + FRESH START — exactly partition-rejoin Phase 2 ---');
  net('stop-node', 'nodeB');
  net('start-node', 'nodeB');
  B = await connect('B');
  results.push(await measure('B both', B, HELD, NEVER));

  log('\n--- D: FRESH START ONLY — nodeA back up, nodeB restarted ---');
  net('start-node', 'nodeA');
  A = await connect('A');
  net('stop-node', 'nodeB');
  net('start-node', 'nodeB');
  B = await connect('B');
  results.push(await measure('D fresh only', B, HELD, NEVER));

  // ---- E: the rate of the thing itself -------------------------------
  //
  // The 2x2 above establishes WHICH COMBINATION hangs. It does not give a
  // rate, and a single occurrence is what this repository keeps mistaking
  // for a mechanism. The 2x2 also showed the hang is the FIRST read after a
  // restart and that the next read of the same domain answers in 10ms, so
  // the measurement that matters is one first-read per restart, repeated.
  //
  // nodeA stays stopped throughout, because that is the other half of the
  // conjunction. Only the first read of a domain nodeB HOLDS is timed —
  // the 2x2 found the never-written domain answers instantly even here,
  // which is the opposite of what the isolation hypothesis predicted.
  log(`\n--- E: FIRST READ AFTER RESTART, ISOLATED, repeated ${FIRST_READ_TRIALS}x ---`);
  net('stop-node', 'nodeA');
  const firstReads = [];
  for (let i = 0; i < FIRST_READ_TRIALS; i++) {
    net('stop-node', 'nodeB');
    net('start-node', 'nodeB');
    const fresh = await connect('B');
    const r = await timedRead(fresh, HELD, 'first read');
    firstReads.push(r);
    const verdict = r.err ? `HUNG ${(r.ms / 1000).toFixed(1)}s` : `${(r.ms / 1000).toFixed(2)}s, got ${r.got}`;
    log(`    [E trial ${i + 1}] ${verdict}`);
  }
  const hangs = firstReads.filter((r) => r.err || r.ms > 10_000).length;
  log(`    [E] ${hangs} of ${FIRST_READ_TRIALS} first reads hung`);

  log('\n=== SUMMARY ===');
  for (const r of results) log(`  ${r.condition.padEnd(14)} worst ${(r.worst / 1000).toFixed(2)}s  errors ${r.anyErr ? 'YES' : 'none'}`);
  log(`  E first-read rate  ${hangs} of ${FIRST_READ_TRIALS} hung`);
  const hung = results.filter((r) => r.anyErr || r.worst > 10_000).map((r) => r.condition);
  log('');
  if (hung.length === 0) {
    log('  NO CELL REPRODUCED THE HANG. The hypothesis is NOT confirmed, and it is');
    log('  also not refuted: this machine is not a 2-vCPU runner, and the same');
    log('  local-reproduction failure is recorded for the gossip flake in README §9.');
  } else {
    log(`  REPRODUCED IN: ${hung.join(', ')}`);
    log('  Read that against the 2x2: isolation alone, fresh start alone, or only both.');
  }
}

main().catch((e) => { console.error('\nPROBE ERROR:', e); process.exit(1); });
